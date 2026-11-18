// Servidor de jogo: WebSocket + JSON. Autentica, carrega personagens, encaminha comandos
// para a zona e responde cada requisição { rid } com { t:'res', rid, ok, ... }.
import { WebSocketServer } from 'ws';
import { randomUUID } from 'node:crypto';
import { loadGameData } from './data.js';
import { Store } from './store.js';
import { Zone, lootView } from './zone.js';
import { makeRng } from './rng.js';
import { checkEquip, applyEquip, checkUnequip, revalidateEquipment, bagCount, BAG_CAPACITY, EQUIP_SLOTS } from './equipment.js';
import { totalAttributePoints, derivedStats } from './rules.js';
import { ATTRS } from './data.js';

export const PROTOCOL_VERSION = 1;
const NAME_RE = /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 _-]{2,15}$/;
const RID_CACHE = 128;

export class GameServer {
  constructor(opts = {}) {
    this.opts = {
      port: 7777, host: '0.0.0.0', dbPath: 'cinzas.db', tickHz: 10, timeScale: 1, xpRate: 1, seed: Date.now() & 0xffffffff, dev: false, log: true,
      ...Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined)),
    };
    this.data = opts.data ?? loadGameData(opts.dataDir);
    this.store = new Store(this.opts.dbPath);
    this.sessions = new Set();
    this.byChar = new Map(); // charId -> session
    this.byAccount = new Map(); // accountId -> session
    this.ridCache = new Map(); // charId -> Map(rid -> response)
    this.zone = new Zone({
      mapId: 'estrada_velha', data: this.data, store: this.store, rng: makeRng(this.opts.seed), xpRate: this.opts.xpRate,
      send: (charId, msg) => this.sendTo(this.byChar.get(charId), msg),
      broadcast: (msg) => this.broadcastWorld(msg),
    });
    this.tickCount = 0;
  }

  log(...a) { if (this.opts.log) console.log(new Date().toISOString().slice(11, 19), ...a); }

  start() {
    return new Promise((resolve) => {
      this.wss = new WebSocketServer({ port: this.opts.port, host: this.opts.host, maxPayload: 64 * 1024 });
      this.wss.on('connection', (ws, req) => this.onConnection(ws, req));
      this.wss.on('listening', () => {
        this.port = this.wss.address().port;
        this.log(`CINZAS DO MERIDIANO — servidor de zona ouvindo em ws://${this.opts.host}:${this.port} (tick ${this.opts.tickHz} Hz, escala ${this.opts.timeScale}x, XP ${this.opts.xpRate}x${this.opts.dev ? ', modo dev' : ''})`);
        resolve(this.port);
      });
      const tickMs = 1000 / this.opts.tickHz;
      let last = performance.now();
      this.timer = setInterval(() => {
        const t = performance.now();
        const dt = Math.min(250, t - last) * this.opts.timeScale;
        last = t;
        this.step(dt);
      }, tickMs);
      this.saveTimer = setInterval(() => this.saveAll(), 10_000);
    });
  }

  step(dt) {
    this.zone.tick(dt);
    this.tickCount++;
    if (this.byChar.size) this.broadcastWorld(this.zone.snapshot());
  }

  saveAll() {
    for (const p of this.zone.players.values()) this.store.saveCharacter(p.char);
  }

  async stop() {
    clearInterval(this.timer); clearInterval(this.saveTimer);
    for (const s of [...this.sessions]) this.dropSession(s);
    for (const ws of this.wss.clients) ws.terminate();
    await new Promise((r) => this.wss.close(() => r()));
    this.store.close();
  }

  // ---------- conexões ----------
  onConnection(ws) {
    const s = { id: randomUUID(), ws, accountId: null, charId: null, alive: true };
    this.sessions.add(s);
    ws.on('message', (buf) => this.onMessage(s, buf));
    ws.on('close', () => this.dropSession(s));
    ws.on('error', () => {});
    this.sendTo(s, { t: 'hello', protocol: PROTOCOL_VERSION, server: 'cinzas-zone', dev: !!this.opts.dev });
  }

  dropSession(s) {
    if (!this.sessions.has(s)) return;
    this.sessions.delete(s);
    if (s.charId != null) {
      const p = this.zone.removePlayer(s.charId);
      if (this.byChar.get(s.charId) === s) this.byChar.delete(s.charId);
      if (p) { this.broadcastWorld({ t: 'left', eid: p.eid }); this.log(`saiu: ${p.char.name}`); }
    }
    if (s.accountId != null && this.byAccount.get(s.accountId) === s) this.byAccount.delete(s.accountId);
    try { s.ws.close(); } catch { /* já fechado */ }
  }

  sendTo(s, msg) {
    if (s && s.ws.readyState === 1) s.ws.send(JSON.stringify(msg));
  }

  broadcastWorld(msg) {
    const raw = JSON.stringify(msg);
    for (const s of this.byChar.values()) if (s.ws.readyState === 1) s.ws.send(raw);
  }

  onMessage(s, buf) {
    let msg;
    try { msg = JSON.parse(buf.toString()); } catch { return this.sendTo(s, { t: 'res', rid: null, ok: false, code: 'bad_json', reason: 'Mensagem inválida.' }); }
    const rid = typeof msg.rid === 'string' || typeof msg.rid === 'number' ? msg.rid : null;
    // Requisições repetidas (mesmo rid, mesmo personagem) devolvem a mesma resposta sem reexecutar.
    if (rid != null && s.charId != null) {
      const cached = this.ridCache.get(s.charId)?.get(rid);
      if (cached) return this.sendTo(s, { ...cached, duplicate: true });
    }
    let res;
    try {
      res = this.handle(s, msg);
    } catch (e) {
      this.log('erro ao tratar', msg.t, e);
      res = { ok: false, code: 'server_error', reason: 'Erro interno do servidor.' };
    }
    if (res === undefined) return;
    const out = { t: 'res', rid, req: msg.t, ...res };
    if (rid != null && s.charId != null && res.cache !== false) {
      let m = this.ridCache.get(s.charId);
      if (!m) this.ridCache.set(s.charId, (m = new Map()));
      m.set(rid, out);
      if (m.size > RID_CACHE) m.delete(m.keys().next().value);
    }
    delete out.cache;
    this.sendTo(s, out);
  }

  handle(s, msg) {
    switch (msg.t) {
      case 'ping': return { ok: true, now: Math.round(this.zone.now), cache: false };
      case 'register': return this.hRegister(s, msg);
      case 'login': return this.hLogin(s, msg);
    }
    if (s.accountId == null) return { ok: false, code: 'not_logged', reason: 'Faça login primeiro.' };
    switch (msg.t) {
      case 'list_chars': return { ok: true, chars: this.store.listCharacters(s.accountId).map(charRow), classes: this.creatableClasses() };
      case 'create_char': return this.hCreateChar(s, msg);
      case 'enter': return this.hEnter(s, msg);
    }
    if (s.charId == null) return { ok: false, code: 'not_in_world', reason: 'Entre no mundo com um personagem primeiro.' };
    const p = this.zone.players.get(s.charId);
    if (!p) return { ok: false, code: 'not_in_world', reason: 'Personagem fora do mundo.' };
    switch (msg.t) {
      case 'move': return this.nc(this.zone.cmdMove(p, msg.x, msg.z));
      case 'attack': return this.nc(this.zone.cmdAttack(p, msg.target));
      case 'stop': return this.nc(this.zone.cmdStop(p));
      case 'cast': return this.withChar(p, this.zone.cmdCast(p, msg.skill, msg.target, msg.x, msg.z));
      case 'use_item': return this.withChar(p, this.zone.cmdUseItem(p, msg.instance));
      case 'respawn': return this.withChar(p, this.zone.cmdRespawn(p));
      case 'learn_skill': return this.withChar(p, this.zone.cmdLearnSkill(p, msg.skill));
      case 'pickup': return this.hPickup(p, msg);
      case 'equip': return this.hEquip(p, msg);
      case 'unequip': return this.hUnequip(p, msg);
      case 'allocate': return this.hAllocate(p, msg);
      case 'reset_attrs': return this.hResetAttrs(p);
      case 'claim_recovery': return this.hClaimRecovery(p, msg);
      case 'char': return { ok: true, char: this.zone.charView(p), cache: false };
      case 'chat': return this.hChat(p, msg);
      case 'gm': return this.hGm(p, msg);
      default: return { ok: false, code: 'unknown', reason: `Comando desconhecido: ${msg.t}` };
    }
  }

  nc(res) { return { ...res, cache: false }; }

  withChar(p, res) {
    if (res.ok) res.char = this.zone.charView(p);
    return res;
  }

  creatableClasses() {
    return Object.entries(this.data.classes).filter(([, c]) => c.implementedIn === 'M1').map(([id, c]) => ({ id, name: c.name, origin: c.origin, role: c.role }));
  }

  defsPayload() {
    const d = this.data;
    const monsters = Object.fromEntries(Object.entries(d.monsters).map(([id, m]) => [id, { name: m.name, level: m.level, family: m.family, rank: m.rank, aggro: m.aggro }]));
    return {
      t: 'defs', items: d.items, classes: d.classes, skills: d.skills, attributes: d.attributes, rarities: d.rarities, slots: d.slots,
      families: d.families, monsters, xp: d.xp.cumulative, levelCap: d.levelCap, skillRules: d.skillRules,
      map: { id: this.zone.mapId, ...this.zone.map }, origins: d.origins,
    };
  }

  // ---------- autenticação e personagens ----------
  hRegister(s, { account, password }) {
    if (typeof account !== 'string' || !/^[a-zA-Z0-9_]{3,20}$/.test(account)) return { ok: false, code: 'bad_account', reason: 'Conta: 3 a 20 letras, números ou _.' };
    if (typeof password !== 'string' || password.length < 4) return { ok: false, code: 'bad_password', reason: 'Senha precisa de pelo menos 4 caracteres.' };
    if (this.store.findAccount(account)) return { ok: false, code: 'account_exists', reason: 'Essa conta já existe.' };
    this.store.createAccount(account, password);
    return { ok: true };
  }

  hLogin(s, { account, password }) {
    if (s.accountId != null) return { ok: false, code: 'already', reason: 'Sessão já autenticada.' };
    const acc = typeof account === 'string' && typeof password === 'string' ? this.store.verifyAccount(account, password) : null;
    if (!acc) return { ok: false, code: 'bad_login', reason: 'Conta ou senha incorretas.' };
    const old = this.byAccount.get(acc.id);
    if (old) {
      // Reconexão: a sessão antiga (talvez "pendurada") é encerrada e salva antes de continuar.
      this.sendTo(old, { t: 'kicked', reason: 'Sua conta entrou em outra conexão.' });
      this.dropSession(old);
    }
    s.accountId = acc.id;
    this.byAccount.set(acc.id, s);
    this.sendTo(s, this.defsPayload());
    return { ok: true, account: acc.name, chars: this.store.listCharacters(acc.id).map(charRow), classes: this.creatableClasses() };
  }

  hCreateChar(s, { name, classId }) {
    if (typeof name !== 'string' || !NAME_RE.test(name.trim())) return { ok: false, code: 'bad_name', reason: 'Nome: 3 a 16 caracteres, começando por letra.' };
    name = name.trim();
    const cls = this.data.classes[classId];
    if (!cls) return { ok: false, code: 'bad_class', reason: 'Classe inexistente.' };
    if (cls.implementedIn !== 'M1') return { ok: false, code: 'class_locked', reason: `${cls.name} chega no Marco 2.` };
    if (this.store.characterNameTaken(name)) return { ok: false, code: 'name_taken', reason: 'Esse nome já está em uso.' };
    if (this.store.listCharacters(s.accountId).length >= 4) return { ok: false, code: 'too_many', reason: 'Limite de 4 personagens por conta.' };
    const map = this.zone.map;
    const tmp = { classId, level: 1, alloc: {}, items: new Map() };
    const st = derivedStats(tmp, cls.startingKit.equip.map((id) => ({ def: this.data.items[id] })), this.data);
    const id = this.store.createCharacter({
      accountId: s.accountId, name, classId, hp: st.maxHp, mp: st.maxMp, mapId: this.zone.mapId, x: map.spawnPoint.x, z: map.spawnPoint.z,
      kit: cls.startingKit, slotFor: (defId) => this.data.items[defId].slot,
    });
    this.log(`personagem criado: ${name} (${cls.name})`);
    return { ok: true, char: { id, name, classId, level: 1 } };
  }

  hEnter(s, { charId }) {
    if (s.charId != null) return { ok: false, code: 'already', reason: 'Você já está no mundo.' };
    const row = this.store.listCharacters(s.accountId).find((c) => c.id === charId);
    if (!row) return { ok: false, code: 'bad_char', reason: 'Personagem não encontrado nesta conta.' };
    const prev = this.byChar.get(charId);
    if (prev) this.dropSession(prev);
    const char = this.store.loadCharacter(charId);
    const wasDead = char.dead;
    const p = this.zone.addPlayer(char);
    this.store.saveCharacter(char);
    s.charId = charId;
    this.byChar.set(charId, s);
    this.log(`entrou: ${char.name} nv${char.level}${wasDead ? ' (estava caído: restaurado no posto)' : ''}`);
    this.broadcastWorld({ t: 'joined', eid: p.eid, name: char.name });
    const loot = this.store.unclaimedLoot(charId, Date.now()).map(lootView);
    return { ok: true, char: this.zone.charView(p), snapshot: this.zone.snapshot(), loot, restoredFromDeath: wasDead, cache: false };
  }

  // ---------- inventário ----------
  hPickup(p, { loot: lootId }) {
    const c = p.char;
    if (typeof lootId !== 'string') return { ok: false, code: 'bad_request', reason: 'Saque inválido.' };
    let result;
    let changed = [];
    this.store.tx(() => {
      const row = this.store.getLoot(lootId);
      if (!row) { result = { ok: false, code: 'not_found', reason: 'Saque não encontrado.' }; return; }
      if (row.char_id !== c.id) { result = { ok: false, code: 'not_owner', reason: 'Este saque não pertence a você.' }; return; }
      if (row.claimed_at != null) {
        result = { ok: true, alreadyClaimed: true, loot: lootId, instanceId: row.claimed_instance_id, gold: row.gold, defId: row.def_id };
        return;
      }
      if (row.expires_at <= Date.now()) { result = { ok: false, code: 'expired', reason: 'Este saque expirou.' }; return; }
      const d = Math.hypot(row.x - c.x, row.z - c.z);
      if (d > this.data.formulas.movement.pickupRange) { result = { ok: false, code: 'too_far', reason: `Muito longe do saque (${d.toFixed(1)} m).` }; return; }
      let instanceId = null;
      if (row.def_id) {
        const def = this.data.items[row.def_id];
        let stack = null;
        if (def.stack) for (const it of c.items.values()) if (it.loc === 'bag' && it.defId === def.id && it.qty + row.qty <= def.stack) { stack = it; break; }
        if (stack) {
          stack.qty += row.qty; instanceId = stack.id; changed = [stack];
          this.store.saveItems(c.id, [stack]);
        } else {
          if (bagCount(c) >= BAG_CAPACITY) { result = { ok: false, code: 'bag_full', reason: 'Inventário cheio.' }; return; }
          const it = { id: randomUUID(), defId: def.id, qty: row.qty, enh: 0, loc: 'bag', slot: null };
          this.store.insertItem({ ...it, charId: c.id, source: `loot:${row.id}` });
          c.items.set(it.id, it); instanceId = it.id; changed = [it];
        }
      }
      if (row.gold) { c.gold += row.gold; this.store.saveCharacter(c); }
      this.store.markLootClaimed(row.id, instanceId);
      result = { ok: true, alreadyClaimed: false, loot: lootId, instanceId, gold: row.gold, defId: row.def_id };
    });
    if (result.ok) result.char = this.zone.charView(p);
    return result;
  }

  hEquip(p, { instance }) {
    const c = p.char;
    const check = checkEquip(c, instance, this.data);
    if (!check.ok) return check;
    const changed = applyEquip(c, instance, check);
    this.store.tx(() => this.store.saveItems(c.id, changed));
    this.zone.recalc(p);
    return { ok: true, slot: check.slot, displaced: check.displaced, char: this.zone.charView(p) };
  }

  hUnequip(p, { slot }) {
    const c = p.char;
    const check = checkUnequip(c, slot);
    if (!check.ok) return check;
    const it = c.items.get(check.instanceId);
    it.loc = 'bag'; it.slot = null;
    this.store.tx(() => this.store.saveItems(c.id, [it]));
    this.zone.recalc(p);
    return { ok: true, instanceId: it.id, char: this.zone.charView(p) };
  }

  hClaimRecovery(p, { instance }) {
    const c = p.char;
    const it = c.items.get(instance);
    if (!it || it.loc !== 'recovery') return { ok: false, code: 'not_found', reason: 'Item não está na caixa de recuperação.' };
    if (bagCount(c) >= BAG_CAPACITY) return { ok: false, code: 'bag_full', reason: 'Inventário cheio.' };
    it.loc = 'bag';
    this.store.tx(() => this.store.saveItems(c.id, [it]));
    return { ok: true, char: this.zone.charView(p) };
  }

  hAllocate(p, { points }) {
    const c = p.char;
    if (!points || typeof points !== 'object') return { ok: false, code: 'bad_request', reason: 'Distribuição inválida.' };
    let sum = 0;
    for (const [k, v] of Object.entries(points)) {
      if (!ATTRS.includes(k) || !Number.isInteger(v) || v < 0) return { ok: false, code: 'bad_request', reason: 'Distribuição inválida.' };
      sum += v;
    }
    if (sum === 0) return { ok: false, code: 'bad_request', reason: 'Nenhum ponto informado.' };
    if (sum > c.unspent) return { ok: false, code: 'no_points', reason: `Pontos insuficientes: ${sum} pedidos, ${c.unspent} disponíveis.` };
    for (const [k, v] of Object.entries(points)) c.alloc[k] = (c.alloc[k] || 0) + v;
    c.unspent -= sum;
    this.store.saveCharacter(c);
    this.zone.recalc(p);
    return { ok: true, char: this.zone.charView(p) };
  }

  // M1: redistribuição gratuita (no jogo final custará um item). Itens que deixam de
  // atender aos requisitos vão para a bolsa ou para a caixa de recuperação.
  hResetAttrs(p) {
    const c = p.char;
    c.alloc = {};
    c.unspent = totalAttributePoints(c.level, this.data);
    const moved = revalidateEquipment(c, this.data);
    this.store.tx(() => { this.store.saveItems(c.id, moved); this.store.saveCharacter(c); });
    this.zone.recalc(p);
    return { ok: true, moved: moved.map((m) => ({ id: m.id, defId: m.defId, loc: m.loc })), char: this.zone.charView(p) };
  }

  hChat(p, { text }) {
    if (typeof text !== 'string') return { ok: false, code: 'bad_request', reason: 'Mensagem inválida.' };
    const clean = text.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 200);
    if (!clean) return { ok: false, code: 'empty', reason: 'Mensagem vazia.' };
    this.broadcastWorld({ t: 'chat', from: p.char.name, eid: p.eid, text: clean });
    return { ok: true, cache: false };
  }

  // Comandos de mestre: só com --dev. Usados para reproduzir cenários (README) e no teste de classe.
  hGm(p, msg) {
    if (!this.opts.dev) return { ok: false, code: 'forbidden', reason: 'Comandos de mestre desativados.' };
    const c = p.char;
    if (msg.cmd === 'give') {
      const def = this.data.items[msg.defId];
      if (!def) return { ok: false, code: 'bad_item', reason: 'Item inexistente.' };
      if (bagCount(c) >= BAG_CAPACITY) return { ok: false, code: 'bag_full', reason: 'Inventário cheio.' };
      const it = { id: randomUUID(), defId: def.id, qty: msg.qty || 1, enh: 0, loc: 'bag', slot: null };
      this.store.insertItem({ ...it, charId: c.id, source: 'gm' });
      c.items.set(it.id, it);
      return { ok: true, instanceId: it.id, char: this.zone.charView(p) };
    }
    if (msg.cmd === 'teleport') return this.withChar(p, (c.x = msg.x, c.z = msg.z, p.dest = null, { ok: true }));
    if (msg.cmd === 'xp') {
      const cum = this.data.xp.cumulative;
      const target = Math.min(this.data.levelCap, msg.level);
      const need = cum[target - 1] - c.xp;
      if (need <= 0) return { ok: false, code: 'bad_request', reason: 'Já está nesse nível.' };
      // passa pelo mesmo caminho de ganho de XP de um abate
      c.xp += need;
      const gained = target - c.level;
      c.level = target; c.unspent += gained * this.data.pointsPerLevel; c.skillPoints += gained * this.data.skillPointsPerLevel;
      this.zone.grantUnlockedSkills(c); this.zone.recalc(p); this.store.saveCharacter(c);
      return { ok: true, char: this.zone.charView(p) };
    }
    return { ok: false, code: 'unknown', reason: 'Comando de mestre desconhecido.' };
  }
}

function charRow(r) {
  return { id: r.id, name: r.name, classId: r.class_id, level: r.level, mapId: r.map_id };
}

export { EQUIP_SLOTS };
