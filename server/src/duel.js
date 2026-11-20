// Duelo (PvP voluntário, pós-versão 1): pedido e aceite entre dois jogadores perto um do outro,
// contagem de 3 s e luta só entre os dois (ataque básico e habilidades de alvo único). Ninguém morre:
// quem chegaria a 0 fica com 1 de vida e perde. Afastar-se mais de 30 m do ponto do duelo, sair da
// zona ou desconectar é desistência; depois de 3 minutos, empate. Sem XP, sem saque, sem penalidade.
import { playerAttack } from './rules.js';

const START_RANGE = 10;
const LEASH = 30;
const COUNTDOWN_MS = 3000;
const LIMIT_MS = 180000;
const INVITE_MS = 30000;

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export class DuelManager {
  constructor(zone) {
    this.zone = zone;
    this.duels = new Map();   // id -> duelo
    this.byChar = new Map();  // charId -> id
    this.invites = new Map(); // charId convidado -> { from, at }
    this.seq = 0;
  }

  request(p, t) {
    const z = this.zone;
    if (z.instanceId) return { ok: false, code: 'no_duels', reason: 'Não há duelos aqui.' };
    if (!t || t === p) return { ok: false, code: 'no_target', reason: 'Jogador não encontrado por perto.' };
    if (dist(p.char, t.char) > START_RANGE) return { ok: false, code: 'too_far', reason: `Chegue mais perto (até ${START_RANGE} m).` };
    if (p.char.dead || t.char.dead) return { ok: false, code: 'dead', reason: 'Ninguém duela caído.' };
    if (this.byChar.has(p.char.id) || this.byChar.has(t.char.id)) return { ok: false, code: 'busy', reason: 'Um de vocês já está num duelo.' };
    this.invites.set(t.char.id, { from: p.char.id, at: Date.now() });
    z.send(t.char.id, { t: 'duel_invite', from: p.char.name, fromId: p.char.id });
    return { ok: true, message: `Desafio enviado a ${t.char.name}.` };
  }

  accept(p, fromId) {
    const z = this.zone;
    const inv = this.invites.get(p.char.id);
    if (!inv || inv.from !== fromId || Date.now() - inv.at > INVITE_MS) return { ok: false, code: 'no_invite', reason: 'Desafio vencido.' };
    this.invites.delete(p.char.id);
    const a = z.players.get(fromId);
    if (!a || dist(a.char, p.char) > START_RANGE * 1.5) return { ok: false, code: 'too_far', reason: 'Vocês se afastaram.' };
    if (this.byChar.has(a.char.id) || this.byChar.has(p.char.id)) return { ok: false, code: 'busy', reason: 'Um de vocês já está num duelo.' };
    const d = { id: ++this.seq, a: a.char.id, b: p.char.id, state: 'countdown', startAt: z.now + COUNTDOWN_MS, endAt: z.now + COUNTDOWN_MS + LIMIT_MS, center: { x: (a.char.x + p.char.x) / 2, z: (a.char.z + p.char.z) / 2 } };
    this.duels.set(d.id, d);
    this.byChar.set(d.a, d.id);
    this.byChar.set(d.b, d.id);
    for (const [me, op] of [[a, p], [p, a]]) z.send(me.char.id, { t: 'duel', state: 'countdown', inMs: COUNTDOWN_MS, opponent: op.char.name, opponentEid: op.eid });
    return { ok: true };
  }

  decline(p) { this.invites.delete(p.char.id); return { ok: true }; }

  duelOf(charId) { const id = this.byChar.get(charId); return id ? this.duels.get(id) : null; }

  // true se os dois estão lutando entre si agora
  active(p, q) {
    const d = this.duelOf(p.char.id);
    return !!d && d.state === 'active' && (d.a === q.char.id || d.b === q.char.id) && p !== q;
  }

  opponentOf(p) {
    const d = this.duelOf(p.char.id);
    if (!d) return null;
    return this.zone.players.get(d.a === p.char.id ? d.b : d.a) ?? null;
  }

  tick() {
    const z = this.zone;
    for (const d of [...this.duels.values()]) {
      const a = z.players.get(d.a), b = z.players.get(d.b);
      if (!a || !b) { this.end(d, a ? d.a : b ? d.b : null, 'O outro duelista saiu.'); continue; }
      if (d.state === 'countdown' && z.now >= d.startAt) {
        d.state = 'active';
        for (const p of [a, b]) z.send(p.char.id, { t: 'duel', state: 'active' });
        z.broadcast({ t: 'duel_start', a: a.eid, b: b.eid, names: [a.char.name, b.char.name] });
      }
      if (dist(a.char, d.center) > LEASH) { this.end(d, d.b, `${a.char.name} fugiu do duelo.`); continue; }
      if (dist(b.char, d.center) > LEASH) { this.end(d, d.a, `${b.char.name} fugiu do duelo.`); continue; }
      if (z.now >= d.endAt) this.end(d, null, 'Tempo esgotado: empate.');
    }
  }

  // dano de duelo: nunca derruba; quem chegaria a 0 perde com 1 de vida
  damage(att, def, amount) {
    const d = this.duelOf(att.char.id);
    if (!d || d.state !== 'active') return;
    def.lastHitAt = this.zone.now;
    def.lastCombatAt = this.zone.now;
    att.lastCombatAt = this.zone.now;
    if (def.char.hp - amount <= 1) {
      def.char.hp = 1;
      this.end(d, att.char.id, `${att.char.name} venceu o duelo contra ${def.char.name}.`);
    } else def.char.hp -= amount;
  }

  // ataque (básico ou habilidade de alvo único) de um duelista no outro
  attack(att, def, skill = null, skillId = null) {
    const z = this.zone;
    const res = playerAttack(att.stats, { level: def.stats.level ?? def.char.level, evasion: def.stats.evasion, defense: def.stats.defense, mres: def.stats.mres }, z.data, z.rng, skill ?? undefined);
    z.broadcast({ t: 'hit', src: att.eid, dst: def.eid, dmg: res.damage, crit: !!res.crit, miss: !res.hit, skill: skillId, magic: !!res.magic, duel: true });
    if (res.hit) this.damage(att, def, res.damage);
    return res;
  }

  end(d, winnerCharId, text) {
    const z = this.zone;
    this.duels.delete(d.id);
    this.byChar.delete(d.a);
    this.byChar.delete(d.b);
    for (const id of [d.a, d.b]) {
      const p = z.players.get(id);
      if (!p) continue;
      const other = z.players.get(id === d.a ? d.b : d.a);
      if (other && p.targetId === other.eid) p.targetId = null;
      z.send(id, { t: 'duel', state: 'ended', won: winnerCharId === id, draw: winnerCharId == null, text });
    }
    z.broadcast({ t: 'duel_end', text });
  }

  // saída da zona / desconexão: desiste
  forfeit(charId) {
    const d = this.duelOf(charId);
    if (d) this.end(d, d.a === charId ? d.b : d.a, 'Duelo encerrado: um dos duelistas saiu.');
    this.invites.delete(charId);
  }
}
