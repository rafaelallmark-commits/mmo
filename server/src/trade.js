// Comércio entre jogadores (pós-versão 1): pedido → aceite → cada um monta a oferta (itens da bolsa e
// ouro) → os dois travam → os dois confirmam → a troca acontece numa transação única. Qualquer mudança
// na oferta destrava os dois; afastar-se, cair, trocar de zona ou desconectar cancela.
import { bagCount, BAG_CAPACITY } from './equipment.js';

const RANGE_START = 8;
const RANGE_KEEP = 12;
const INVITE_MS = 30000;
const MAX_ITEMS = 12;

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export class TradeManager {
  constructor(server) {
    this.s = server;
    this.trades = new Map();   // id -> troca
    this.byChar = new Map();   // charId -> id da troca
    this.invites = new Map();  // charId convidado -> { from, at }
    this.seq = 0;
  }

  player(charId) { return this.s.playerOf(charId); }

  request(p, name) {
    const targetId = typeof name === 'string' ? this.s.byName.get(name.trim().toLowerCase()) : null;
    const t = targetId != null ? this.player(targetId) : null;
    if (!t || t === p) return { ok: false, code: 'no_target', reason: 'Jogador não encontrado por perto.' };
    if (t.zone !== p.zone || dist(t.char, p.char) > RANGE_START) return { ok: false, code: 'too_far', reason: `Chegue mais perto de ${t.char.name} (até ${RANGE_START} m).` };
    if (p.char.dead || t.char.dead) return { ok: false, code: 'dead', reason: 'Ninguém negocia caído.' };
    if (this.byChar.has(p.char.id) || this.byChar.has(t.char.id)) return { ok: false, code: 'busy', reason: 'Um de vocês já está negociando.' };
    this.invites.set(t.char.id, { from: p.char.id, at: Date.now() });
    this.s.sendTo(this.s.byChar.get(t.char.id), { t: 'trade_invite', from: p.char.name, fromId: p.char.id });
    return { ok: true, message: `Pedido de troca enviado a ${t.char.name}.` };
  }

  accept(p, fromId) {
    const inv = this.invites.get(p.char.id);
    if (!inv || inv.from !== fromId || Date.now() - inv.at > INVITE_MS) return { ok: false, code: 'no_invite', reason: 'Pedido de troca vencido.' };
    this.invites.delete(p.char.id);
    const a = this.player(fromId);
    if (!a || a.zone !== p.zone || dist(a.char, p.char) > RANGE_KEEP) return { ok: false, code: 'too_far', reason: 'Vocês se afastaram.' };
    if (this.byChar.has(a.char.id) || this.byChar.has(p.char.id)) return { ok: false, code: 'busy', reason: 'Um de vocês já está negociando.' };
    const tr = { id: ++this.seq, a: a.char.id, b: p.char.id, offer: {}, locked: {}, confirmed: {} };
    for (const c of [tr.a, tr.b]) { tr.offer[c] = { items: [], gold: 0 }; tr.locked[c] = false; tr.confirmed[c] = false; this.byChar.set(c, tr.id); }
    this.trades.set(tr.id, tr);
    this.push(tr);
    return { ok: true, trade: this.view(tr, p.char.id) };
  }

  decline(p) { this.invites.delete(p.char.id); return { ok: true }; }

  tradeOf(p) { const id = this.byChar.get(p.char.id); return id ? this.trades.get(id) : null; }

  offer(p, { items = [], gold = 0 }) {
    const tr = this.tradeOf(p);
    if (!tr) return { ok: false, code: 'no_trade', reason: 'Nenhuma troca aberta.' };
    if (!Array.isArray(items) || items.length > MAX_ITEMS || new Set(items).size !== items.length) return { ok: false, code: 'bad_offer', reason: `Até ${MAX_ITEMS} itens diferentes.` };
    for (const id of items) {
      const it = p.char.items.get(id);
      if (!it || it.loc !== 'bag') return { ok: false, code: 'bad_item', reason: 'Só itens da bolsa (não equipados).' };
      if (this.s.data.items[it.defId]?.questItem) return { ok: false, code: 'bound', reason: 'Itens de missão não podem ser trocados.' };
    }
    gold = Math.floor(Number(gold) || 0);
    if (gold < 0 || gold > p.char.gold) return { ok: false, code: 'no_gold', reason: `Ouro insuficiente: você tem ${p.char.gold}.` };
    tr.offer[p.char.id] = { items: [...items], gold };
    for (const c of [tr.a, tr.b]) { tr.locked[c] = false; tr.confirmed[c] = false; }
    this.push(tr);
    return { ok: true };
  }

  lock(p) {
    const tr = this.tradeOf(p);
    if (!tr) return { ok: false, code: 'no_trade', reason: 'Nenhuma troca aberta.' };
    tr.locked[p.char.id] = true;
    this.push(tr);
    return { ok: true };
  }

  confirm(p) {
    const tr = this.tradeOf(p);
    if (!tr) return { ok: false, code: 'no_trade', reason: 'Nenhuma troca aberta.' };
    if (!tr.locked[tr.a] || !tr.locked[tr.b]) return { ok: false, code: 'not_locked', reason: 'Os dois precisam travar a oferta antes de confirmar.' };
    tr.confirmed[p.char.id] = true;
    if (tr.confirmed[tr.a] && tr.confirmed[tr.b]) return this.execute(tr, p);
    this.push(tr);
    return { ok: true, waiting: true };
  }

  cancel(charId, reason = 'Troca cancelada.') {
    const id = this.byChar.get(charId);
    const tr = id ? this.trades.get(id) : null;
    this.invites.delete(charId);
    if (!tr) return { ok: true };
    this.close(tr, reason);
    return { ok: true };
  }

  close(tr, reason) {
    this.trades.delete(tr.id);
    for (const c of [tr.a, tr.b]) {
      this.byChar.delete(c);
      this.s.sendTo(this.s.byChar.get(c), { t: 'trade_closed', reason });
    }
  }

  // verificação periódica (1 s): distância, queda e presença na mesma zona
  check() {
    for (const tr of [...this.trades.values()]) {
      const a = this.player(tr.a), b = this.player(tr.b);
      if (!a || !b || a.zone !== b.zone) this.close(tr, 'O outro jogador saiu.');
      else if (a.char.dead || b.char.dead) this.close(tr, 'Troca cancelada: alguém caiu.');
      else if (dist(a.char, b.char) > RANGE_KEEP) this.close(tr, 'Troca cancelada: vocês se afastaram.');
    }
  }

  execute(tr, who) {
    const a = this.player(tr.a), b = this.player(tr.b);
    const fail = (reason) => { this.close(tr, reason); return { ok: false, code: 'trade_failed', reason }; };
    if (!a || !b || a.zone !== b.zone || dist(a.char, b.char) > RANGE_KEEP) return fail('Troca cancelada: vocês se afastaram.');
    const oa = tr.offer[tr.a], ob = tr.offer[tr.b];
    for (const [pl, o] of [[a, oa], [b, ob]]) {
      if (o.gold > pl.char.gold) return fail(`${pl.char.name} não tem mais esse ouro.`);
      for (const id of o.items) { const it = pl.char.items.get(id); if (!it || it.loc !== 'bag') return fail('Um dos itens oferecidos não está mais na bolsa.'); }
    }
    if (bagCount(a.char) - oa.items.length + ob.items.length > BAG_CAPACITY) return fail(`Bolsa de ${a.char.name} cheia.`);
    if (bagCount(b.char) - ob.items.length + oa.items.length > BAG_CAPACITY) return fail(`Bolsa de ${b.char.name} cheia.`);
    const st = this.s.store;
    const ga = a.char.gold, gb = b.char.gold;
    try {
      st.tx(() => {
        for (const id of oa.items) if (!st.transferItem(id, a.char.id, b.char.id)) throw new Error('item sumiu');
        for (const id of ob.items) if (!st.transferItem(id, b.char.id, a.char.id)) throw new Error('item sumiu');
        a.char.gold += ob.gold - oa.gold;
        b.char.gold += oa.gold - ob.gold;
        st.saveCharacter(a.char);
        st.saveCharacter(b.char);
      });
    } catch {
      // o banco desfez a transação: volta o ouro em memória também
      a.char.gold = ga; b.char.gold = gb;
      return fail('A troca não pôde ser concluída. Nada mudou.');
    }
    const move = (from, to, ids) => { for (const id of ids) { const it = from.char.items.get(id); from.char.items.delete(id); it.loc = 'bag'; it.slot = null; to.char.items.set(id, it); } };
    move(a, b, oa.items);
    move(b, a, ob.items);
    const d = (o, pl) => ({ gold: o.gold, items: o.items.map((id) => { const it = (pl === 'a' ? b : a).char.items.get(id); return { id, defId: it.defId, qty: it.qty, enh: it.enh || 0 }; }) });
    this.s.audit('trade', { charId: a.char.id, other: b.char.id, aGives: d(oa, 'a'), bGives: d(ob, 'b') });
    this.trades.delete(tr.id);
    for (const pl of [a, b]) {
      this.byChar.delete(pl.char.id);
      this.s.sendTo(this.s.byChar.get(pl.char.id), { t: 'trade_done', char: pl.zone.charView(pl) });
    }
    return { ok: true, done: true, char: who.zone.charView(who) };
  }

  itemView(owner, id) {
    const it = owner?.char.items.get(id);
    return it ? { id, defId: it.defId, qty: it.qty, enh: it.enh || 0 } : { id, gone: true };
  }

  view(tr, forChar) {
    const other = forChar === tr.a ? tr.b : tr.a;
    const me = this.player(forChar), ot = this.player(other);
    const side = (c, pl) => ({ items: tr.offer[c].items.map((id) => this.itemView(pl, id)), gold: tr.offer[c].gold, locked: tr.locked[c], confirmed: tr.confirmed[c] });
    return { id: tr.id, other: ot?.char.name ?? '?', me: side(forChar, me), them: side(other, ot) };
  }

  push(tr) { for (const c of [tr.a, tr.b]) this.s.sendTo(this.s.byChar.get(c), { t: 'trade', trade: this.view(tr, c) }); }
}
