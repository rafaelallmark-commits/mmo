// Servidor de jogo: WebSocket + JSON. Autentica, carrega personagens, hospeda as zonas
// (mapas abertos e instâncias), grupos, chat e missões, e responde cada requisição
// { rid } com { t:'res', rid, ok, ... }.
import { WebSocketServer } from 'ws';
import { randomUUID } from 'node:crypto';
import { loadGameData, ATTRS } from './data.js';
import { Store } from './store.js';
import { Zone, lootView } from './zone.js';
import { makeRng } from './rng.js';
import { QuestEngine } from './quests.js';
import { checkEquip, applyEquip, checkUnequip, revalidateEquipment, bagCount, BAG_CAPACITY, EQUIP_SLOTS } from './equipment.js';
import { totalAttributePoints, derivedStats } from './rules.js';

export const PROTOCOL_VERSION = 2;
const NAME_RE = /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 _-]{2,15}$/;
const RID_CACHE = 128;
const PARTY_MAX = 5;
const DEFAULT_MAP = 'estrada_velha';

export class GameServer {
  constructor(opts = {}) {
    this.opts = {
      port: 7777, host: '0.0.0.0', dbPath: 'cinzas.db', tickHz: 10, timeScale: 1, xpRate: 1, seed: Date.now() & 0xffffffff, dev: false, log: true,
      ...Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined)),
    };
    this.data = opts.data ?? loadGameData(opts.dataDir);
    this.store = new Store(this.opts.dbPath);
    this.rng = makeRng(this.opts.seed);
    this.quests = new QuestEngine({ data: this.data, store: this.store });
    this.sessions = new Set();
    this.byChar = new Map(); // charId -> session
    this.byAccount = new Map(); // accountId -> session
    this.byName = new Map(); // nome minúsculo -> charId (online)
    this.ridCache = new Map(); // charId -> Map(rid -> response)
    this.zones = new Map(); // chave (mapId ou id de instância) -> Zone
    this.charZone = new Map(); // charId -> chave da zona
    this.parties = new Map(); // partyId -> { id, leader, members:Set }
    this.charParty = new Map(); // charId -> partyId
    this.invites = new Map(); // charId convidado -> { from, at }
    this.trials = new Map(); // chave da instância -> estado da prova
    for (const [mapId, m] of Object.entries(this.data.maps)) {
      if (m.implementedIn && !m.instanced && (m.spawns || m.city)) this.createZone(mapId);
    }
    this.tickCount = 0;
  }

  // compatibilidade com o M1: a "zona" principal é a Estrada Velha
  get zone() { return this.zones.get(DEFAULT_MAP); }

  setXpRate(rate) { for (const z of this.zones.values()) z.xpRate = rate; this.opts.xpRate = rate; }

  createZone(mapId, instanceId = null) {
    const key = instanceId ?? mapId;
    const zone = new Zone({
      mapId, instanceId, data: this.data, store: this.store, rng: makeRng((this.opts.seed + this.zones.size * 7919) >>> 0), xpRate: this.opts.xpRate,
      send: (charId, msg) => this.sendTo(this.byChar.get(charId), msg),
      broadcast: (msg) => this.broadcastZone(key, msg),
      hooks: {
        partyIdOf: (charId) => this.charParty.get(charId) ?? null,
        onKillCredit: (p, monsterId) => this.onKillCredit(zone, p, monsterId),
      },
    });
    this.zones.set(key, zone);
    return zone;
  }

  zoneOfChar(charId) { return this.zones.get(this.charZone.get(charId)); }
  playerOf(charId) { return this.zoneOfChar(charId)?.players.get(charId) ?? null; }

  log(...a) { if (this.opts.log) console.log(new Date().toISOString().slice(11, 19), ...a); }

  start() {
    return new Promise((resolve) => {
      this.wss = new WebSocketServer({ port: this.opts.port, host: this.opts.host, maxPayload: 64 * 1024 });
      this.wss.on('connection', (ws, req) => this.onConnection(ws, req));
      this.wss.on('listening', () => {
        this.port = this.wss.address().port;
        this.log(`CINZAS DO MERIDIANO — servidor ouvindo em ws://${this.opts.host}:${this.port} (${this.zones.size} zonas, tick ${this.opts.tickHz} Hz, escala ${this.opts.timeScale}x, XP ${this.opts.xpRate}x${this.opts.dev ? ', modo dev' : ''})`);
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
    for (const [key, z] of this.zones) {
      z.tick(dt);
      if (z.players.size) this.broadcastZone(key, z.snapshot());
    }
    this.tickTrials();
    this.tickCount++;
    if (this.tickCount % this.opts.tickHz === 0) for (const pid of this.parties.keys()) this.sendPartyUpdate(pid);
  }

  saveAll() {
    for (const z of this.zones.values()) for (const p of z.players.values()) this.store.saveCharacter(p.char);
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
    const s = { id: randomUUID(), ws, accountId: null, charId: null };
    this.sessions.add(s);
    ws.on('message', (buf) => this.onMessage(s, buf));
    ws.on('close', () => this.dropSession(s));
    ws.on('error', () => {});
    this.sendTo(s, { t: 'hello', protocol: PROTOCOL_VERSION, server: 'cinzas-zone', dev: !!this.opts.dev });
  }

  dropSession(s) {
    if (!this.sessions.has(s)) return;
    this.sessions.delete(s);
    if (s.charId != null) this.leaveWorld(s);
    if (s.accountId != null && this.byAccount.get(s.accountId) === s) this.byAccount.delete(s.accountId);
    try { s.ws.close(); } catch { /* já fechado */ }
  }

  leaveWorld(s) {
    const charId = s.charId;
    const key = this.charZone.get(charId);
    if (this.trials.has(key)) this.endTrial(key, false, 'Conexão perdida durante a prova.', true);
    const p = this.zones.get(this.charZone.get(charId))?.removePlayer(charId);
    this.charZone.delete(charId);
    if (this.byChar.get(charId) === s) this.byChar.delete(charId);
    if (p) {
      this.byName.delete(p.char.name.toLowerCase());
      this.broadcastZone(key, { t: 'left', eid: p.eid });
      this.log(`saiu: ${p.char.name}`);
    }
    const pid = this.charParty.get(charId);
    if (pid) {
      const party = this.parties.get(pid);
      if (party && ![...party.members].some((m) => this.byChar.has(m))) this.disbandParty(pid);
      else this.sendPartyUpdate(pid);
    }
    s.charId = null;
  }

  sendTo(s, msg) {
    if (s && s.ws.readyState === 1) s.ws.send(JSON.stringify(msg));
  }

  broadcastZone(key, msg) {
    const z = this.zones.get(key);
    if (!z) return;
    const raw = JSON.stringify(msg);
    for (const charId of z.players.keys()) {
      const s = this.byChar.get(charId);
      if (s && s.ws.readyState === 1) s.ws.send(raw);
    }
  }

  onMessage(s, buf) {
    let msg;
    try { msg = JSON.parse(buf.toString()); } catch { return this.sendTo(s, { t: 'res', rid: null, ok: false, code: 'bad_json', reason: 'Mensagem inválida.' }); }
    const rid = typeof msg.rid === 'string' || typeof msg.rid === 'number' ? msg.rid : null;
    // Pedido repetido (mesmo rid e mesmo tipo, mesmo personagem): mesma resposta, sem reexecutar.
    if (rid != null && s.charId != null) {
      const cached = this.ridCache.get(s.charId)?.get(rid);
      if (cached && cached.req === msg.t) return this.sendTo(s, { ...cached, duplicate: true });
    }
    let res;
    try {
      res = this.handle(s, msg);
    } catch (e) {
      this.log('erro ao tratar', msg.t, e);
      res = { ok: false, code: 'server_error', reason: 'Erro interno do servidor.' };
    }
    if (res === undefined) return;
    const after = res.after;
    delete res.after;
    const out = { t: 'res', rid, req: msg.t, ...res };
    if (rid != null && s.charId != null && res.cache !== false) {
      let m = this.ridCache.get(s.charId);
      if (!m) this.ridCache.set(s.charId, (m = new Map()));
      m.set(rid, out);
      if (m.size > RID_CACHE) m.delete(m.keys().next().value);
    }
    delete out.cache;
    this.sendTo(s, out);
    if (after) after();
  }

  handle(s, msg) {
    switch (msg.t) {
      case 'ping': return { ok: true, now: Date.now(), cache: false };
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
    const zone = this.zoneOfChar(s.charId);
    const p = zone?.players.get(s.charId);
    if (!p) return { ok: false, code: 'not_in_world', reason: 'Personagem fora do mundo.' };
    switch (msg.t) {
      case 'move': return this.nc(zone.cmdMove(p, msg.x, msg.z));
      case 'attack': return this.nc(zone.cmdAttack(p, msg.target));
      case 'stop': return this.nc(zone.cmdStop(p));
      case 'cast': return this.withChar(p, zone.cmdCast(p, msg.skill, msg.target, msg.x, msg.z, msg.ally));
      case 'use_item': return this.withChar(p, zone.cmdUseItem(p, msg.instance));
      case 'respawn': return this.withChar(p, zone.cmdRespawn(p));
      case 'learn_skill': return this.withChar(p, zone.cmdLearnSkill(p, msg.skill));
      case 'pickup': return this.hPickup(p, msg);
      case 'equip': return this.hEquip(p, msg);
      case 'unequip': return this.hUnequip(p, msg);
      case 'allocate': return this.hAllocate(p, msg);
      case 'reset_attrs': return this.hResetAttrs(p);
      case 'claim_recovery': return this.hClaimRecovery(p, msg);
      case 'char': return { ok: true, char: zone.charView(p), cache: false };
      case 'chat': return this.hChat(p, msg);
      case 'portal': return this.hPortal(s, p, msg);
      case 'talk': return this.hTalk(p, msg);
      case 'interact': return this.hInteract(p, msg);
      case 'buy': return this.hBuy(p, msg);
      case 'quests': return { ok: true, journal: this.quests.journal(p.char), cache: false };
      case 'quest_accept': return this.hQuestAccept(p, msg);
      case 'quest_turnin': return this.hQuestTurnIn(p, msg);
      case 'trial_start': return this.hTrialStart(s, p, msg);
      case 'party_invite': return this.hPartyInvite(p, msg);
      case 'party_accept': return this.hPartyAccept(p, msg);
      case 'party_decline': return this.hPartyDecline(p, msg);
      case 'party_leave': return this.hPartyLeave(p);
      case 'party_kick': return this.hPartyKick(p, msg);
      case 'gm': return this.hGm(p, msg);
      default: return { ok: false, code: 'unknown', reason: `Comando desconhecido: ${msg.t}` };
    }
  }

  nc(res) { return { ...res, cache: false }; }

  withChar(p, res) {
    if (res.ok) res.char = p.zone.charView(p);
    return res;
  }

  creatableClasses() {
    return Object.entries(this.data.classes).filter(([, c]) => ['M1', 'M2'].includes(c.implementedIn)).map(([id, c]) => ({ id, name: c.name, origin: c.origin, role: c.role }));
  }

  defsPayload() {
    const d = this.data;
    const monsters = Object.fromEntries(Object.entries(d.monsters).map(([id, m]) => [id, { name: m.name, level: m.level, family: m.family, rank: m.rank, aggro: m.aggro }]));
    const maps = Object.fromEntries(Object.entries(d.maps).filter(([, m]) => m.size).map(([id, m]) => [id, { id, ...m }]));
    const quests = Object.fromEntries(Object.entries(d.quests).map(([id, q]) => [id, { title: q.title, chapter: q.chapter, level: q.level }]));
    return {
      t: 'defs', items: d.items, classes: d.classes, skills: d.skills, attributes: d.attributes, rarities: d.rarities, slots: d.slots,
      families: d.families, monsters, xp: d.xp.cumulative, levelCap: d.levelCap, skillRules: d.skillRules, origins: d.origins,
      maps, map: maps[DEFAULT_MAP], quests,
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
    if (!['M1', 'M2'].includes(cls.implementedIn)) return { ok: false, code: 'class_locked', reason: `${cls.name} ainda não está disponível.` };
    if (this.store.characterNameTaken(name)) return { ok: false, code: 'name_taken', reason: 'Esse nome já está em uso.' };
    if (this.store.listCharacters(s.accountId).length >= 4) return { ok: false, code: 'too_many', reason: 'Limite de 4 personagens por conta.' };
    const map = this.data.maps[DEFAULT_MAP];
    const st = derivedStats({ classId, level: 1, alloc: {} }, cls.startingKit.equip.map((id) => ({ def: this.data.items[id] })), this.data);
    const id = this.store.createCharacter({
      accountId: s.accountId, name, classId, hp: st.maxHp, mp: st.maxMp, mapId: DEFAULT_MAP, x: map.spawnPoint.x, z: map.spawnPoint.z,
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
    this.quests.load(char);
    const wasDead = char.dead;
    const zone = this.zones.get(char.mapId) ?? this.zones.get(DEFAULT_MAP);
    const p = zone.addPlayer(char);
    this.store.saveCharacter(char);
    s.charId = charId;
    this.byChar.set(charId, s);
    this.byName.set(char.name.toLowerCase(), charId);
    this.charZone.set(charId, zone.key);
    this.log(`entrou: ${char.name} nv${char.level} em ${zone.mapId}${wasDead ? ' (estava caído: restaurado no posto)' : ''}`);
    this.broadcastZone(zone.key, { t: 'joined', eid: p.eid, name: char.name });
    const pid = this.charParty.get(charId);
    if (pid) this.sendPartyUpdate(pid);
    return { ok: true, char: zone.charView(p), snapshot: zone.snapshot(), loot: this.lootFor(charId, zone.mapId), journal: this.quests.journal(char), restoredFromDeath: wasDead, cache: false };
  }

  lootFor(charId, mapId) {
    return this.store.unclaimedLoot(charId, Date.now()).map(lootView).filter((l) => !l.mapId || l.mapId === mapId);
  }

  // Muda o personagem de zona (portal, instância, retorno). Envia 'zone' com o novo estado.
  moveToZone(p, destKey, x, z) {
    const charId = p.char.id;
    const fromKey = this.charZone.get(charId);
    const from = this.zones.get(fromKey);
    const dest = this.zones.get(destKey);
    from.removePlayer(charId, false);
    this.broadcastZone(fromKey, { t: 'left', eid: p.eid });
    p.char.x = x; p.char.z = z;
    const np = dest.addPlayer(p.char);
    np.cooldowns = p.cooldowns;
    this.charZone.set(charId, destKey);
    if (!dest.instanceId) { delete p.char.saveMapId; delete p.char.saveX; delete p.char.saveZ; }
    this.store.saveCharacter(p.char);
    this.broadcastZone(destKey, { t: 'joined', eid: np.eid, name: p.char.name });
    this.sendTo(this.byChar.get(charId), { t: 'zone', mapId: dest.mapId, instance: dest.instanceId, char: dest.charView(np), snapshot: dest.snapshot(), loot: this.lootFor(charId, dest.mapId) });
    return np;
  }

  hPortal(s, p, { portal }) {
    const r = p.zone.cmdPortal(p, portal);
    if (!r.ok) return r;
    if (!this.zones.has(r.to)) return { ok: false, code: 'closed', reason: 'Esta área ainda não está aberta.' };
    return { ok: true, to: r.to, cache: false, after: () => this.moveToZone(p, r.to, r.x, r.z) };
  }

  // ---------- NPCs, objetos, loja e missões ----------
  hTalk(p, { npc }) {
    const n = p.zone.npcNear(p, npc);
    if (!n) return { ok: false, code: 'too_far', reason: 'Chegue mais perto para conversar.' };
    const changed = this.quests.onTalk(p.char, n.id);
    this.notifyQuests(p, changed);
    const shop = n.role === 'shop' ? n.shop.map((defId) => ({ defId, price: this.priceOf(defId) })) : undefined;
    const trialAvailable = n.role === 'master' && n.classId === p.char.classId && p.char.quests.get('c3_trial')?.state === 'active' && !p.char.trialDone && p.char.level >= 10;
    return { ok: true, npc: { id: n.id, name: n.name, role: n.role, classId: n.classId ?? null }, quests: this.quests.npcQuests(p.char, n.id), shop, trialAvailable, cache: false };
  }

  hInteract(p, { object }) {
    const o = p.zone.objectNear(p, object);
    if (!o) return { ok: false, code: 'too_far', reason: 'Chegue mais perto.' };
    const changed = this.quests.onInteract(p.char, o.id);
    if (!changed.length) return { ok: false, code: 'nothing', reason: 'Nada a fazer aqui agora.' };
    this.notifyQuests(p, changed);
    return { ok: true, object: o.id, quests: changed, cache: false };
  }

  priceOf(defId) { return Math.max(1, (this.data.items[defId].value || 1) * 2); }

  hBuy(p, { npc, item, qty = 1 }) {
    const n = p.zone.npcNear(p, npc);
    if (!n || n.role !== 'shop') return { ok: false, code: 'too_far', reason: 'Chegue mais perto do comerciante.' };
    if (!n.shop.includes(item)) return { ok: false, code: 'not_sold', reason: 'Este comerciante não vende isso.' };
    if (!Number.isInteger(qty) || qty < 1 || qty > 50) return { ok: false, code: 'bad_request', reason: 'Quantidade inválida.' };
    const c = p.char;
    const def = this.data.items[item];
    const cost = this.priceOf(item) * qty;
    if (c.gold < cost) return { ok: false, code: 'no_gold', reason: `Ouro insuficiente: ${cost} necessário, você tem ${c.gold}.` };
    const stack = [...c.items.values()].find((it) => it.loc === 'bag' && it.defId === item && it.qty + qty <= (def.stack || 1));
    if (!stack && bagCount(c) >= BAG_CAPACITY) return { ok: false, code: 'bag_full', reason: 'Inventário cheio.' };
    this.store.tx(() => {
      c.gold -= cost;
      if (stack) { stack.qty += qty; this.store.saveItems(c.id, [stack]); }
      else {
        const it = { id: randomUUID(), defId: item, qty, enh: 0, loc: 'bag', slot: null };
        this.store.insertItem({ ...it, charId: c.id, source: `shop:${n.id}` });
        c.items.set(it.id, it);
      }
      this.store.saveCharacter(c);
    });
    return { ok: true, cost, char: p.zone.charView(p) };
  }

  hQuestAccept(p, { quest, npc }) {
    const n = p.zone.npcNear(p, npc);
    if (!n) return { ok: false, code: 'too_far', reason: 'Chegue mais perto para conversar.' };
    const r = this.quests.accept(p.char, quest, n.id);
    if (r.ok) r.journal = this.quests.journal(p.char);
    return r;
  }

  hQuestTurnIn(p, { quest, npc }) {
    const n = p.zone.npcNear(p, npc);
    if (!n) return { ok: false, code: 'too_far', reason: 'Chegue mais perto para conversar.' };
    const lvl = p.char.level;
    const r = this.quests.turnIn(p.char, quest, n.id, (xp) => p.zone.grantXp(p, xp));
    if (r.ok && !r.alreadyDone) {
      if (p.char.level > lvl) p.zone.broadcast({ t: 'level_up', eid: p.eid, level: p.char.level });
      r.char = p.zone.charView(p);
      r.journal = this.quests.journal(p.char);
    }
    return r;
  }

  notifyQuests(p, changed) {
    if (!changed.length) return;
    this.sendTo(this.byChar.get(p.char.id), { t: 'quest_update', quests: changed.map((id) => this.quests.view(p.char, id)) });
  }

  onKillCredit(zone, p, monsterId) {
    this.notifyQuests(p, this.quests.onKill(p.char, monsterId, zone.rng));
    const key = zone.key;
    if (this.trials.has(key)) this.checkTrial(key);
  }

  // ---------- prova de classe (instância solo) ----------
  hTrialStart(s, p, { npc }) {
    const n = p.zone.npcNear(p, npc);
    const c = p.char;
    if (!n || n.role !== 'master' || n.classId !== c.classId) return { ok: false, code: 'too_far', reason: 'Fale com o mestre da sua classe.' };
    if (c.trialDone) return { ok: false, code: 'done', reason: 'Você já venceu a prova da sua classe.' };
    if (c.level < 10) return { ok: false, code: 'level', reason: `Nível 10 exigido. Seu nível atual é ${c.level}.` };
    if (c.quests.get('c3_trial')?.state !== 'active') return { ok: false, code: 'quest', reason: 'Aceite a missão "Prova de Classe" primeiro.' };
    const arena = this.data.maps.arena_prova;
    const key = `trial:${c.id}:${randomUUID().slice(0, 8)}`;
    const zone = this.createZone('arena_prova', key);
    c.saveMapId = p.zone.mapId; c.saveX = n.x; c.saveZ = n.z + 2;
    const trial = { key, charId: c.id, wave: 0, returnTo: { mapId: p.zone.mapId, x: n.x, z: n.z + 2 }, startedAt: zone.now, deadline: arena.trial.durationMs, done: false };
    this.trials.set(key, trial);
    return {
      ok: true, cache: false, durationMs: arena.trial.durationMs,
      after: () => {
        const np = this.moveToZone(p, key, arena.spawnPoint.x, arena.spawnPoint.z);
        np.char.hp = np.stats.maxHp; np.char.mp = np.stats.maxMp;
        this.spawnWave(trial);
        this.sendTo(this.byChar.get(c.id), { t: 'trial', state: 'started', wave: 1, waves: arena.trial.waves.length, ms: arena.trial.durationMs });
      },
    };
  }

  spawnWave(trial) {
    const zone = this.zones.get(trial.key);
    const arena = this.data.maps.arena_prova.trial;
    for (const [monster, count] of arena.waves[trial.wave]) {
      for (let i = 0; i < count; i++) zone.spawnMonster({ monster, ...arena.spawnAt, count: 1 }, { noRespawn: true });
    }
  }

  checkTrial(key) {
    const trial = this.trials.get(key);
    const zone = this.zones.get(key);
    if (!trial || trial.done || !zone) return;
    if ([...zone.monsters.values()].some((m) => m.state !== 'dead')) return;
    const arena = this.data.maps.arena_prova.trial;
    trial.wave++;
    if (trial.wave < arena.waves.length) {
      this.spawnWave(trial);
      this.sendTo(this.byChar.get(trial.charId), { t: 'trial', state: 'wave', wave: trial.wave + 1, waves: arena.waves.length });
      return;
    }
    this.endTrial(key, true, 'Prova vencida!');
  }

  tickTrials() {
    for (const [key, trial] of this.trials) {
      const zone = this.zones.get(key);
      if (!zone || trial.done) continue;
      const p = zone.players.get(trial.charId);
      if (!p) continue;
      if (p.char.dead) this.endTrial(key, false, 'Você caiu durante a prova. Fale com o mestre para tentar de novo.');
      else if (zone.now - trial.startedAt > trial.deadline) this.endTrial(key, false, 'O tempo da prova acabou. Fale com o mestre para tentar de novo.');
    }
  }

  // Encerra a prova. Sucesso concede a habilidade do nível 10 uma única vez (flag persistida).
  endTrial(key, success, message, disconnected = false) {
    const trial = this.trials.get(key);
    if (!trial || trial.done) return;
    trial.done = true;
    this.trials.delete(key);
    const zone = this.zones.get(key);
    const p = zone?.players.get(trial.charId);
    if (p) {
      const c = p.char;
      if (success && !c.trialDone) {
        c.trialDone = true;
        zone.grantUnlockedSkills(c);
        this.quests.onTrial(c);
      }
      if (c.dead) { c.dead = false; c.hp = Math.round(p.stats.maxHp * 0.5); }
      if (disconnected) {
        c.mapId = trial.returnTo.mapId; c.x = trial.returnTo.x; c.z = trial.returnTo.z;
        delete c.saveMapId; delete c.saveX; delete c.saveZ;
        this.store.saveCharacter(c);
      } else {
        const np = this.moveToZone(p, trial.returnTo.mapId, trial.returnTo.x, trial.returnTo.z);
        this.sendTo(this.byChar.get(c.id), { t: 'trial', state: success ? 'success' : 'failed', message, char: np.zone.charView(np) });
        if (success) this.notifyQuests(np, ['c3_trial']);
      }
    }
    if (!disconnected) this.zones.delete(key);
    else setImmediate(() => this.zones.delete(key));
  }

  // ---------- grupos ----------
  partyView(pid) {
    const party = this.parties.get(pid);
    if (!party) return null;
    return {
      id: pid, leader: party.leader,
      members: [...party.members].map((charId) => {
        const p = this.playerOf(charId);
        if (!p) return { charId, name: party.names.get(charId), online: false };
        const c = p.char;
        return { charId, eid: p.eid, name: c.name, classId: c.classId, level: c.level, hp: Math.ceil(c.hp), mhp: p.stats.maxHp, mp: Math.floor(c.mp), mmp: p.stats.maxMp, mapId: p.zone.mapId, x: Math.round(c.x), z: Math.round(c.z), dead: c.dead, online: true };
      }),
    };
  }

  sendPartyUpdate(pid) {
    const v = this.partyView(pid);
    if (!v) return;
    for (const charId of this.parties.get(pid).members) this.sendTo(this.byChar.get(charId), { t: 'party', party: v });
  }

  hPartyInvite(p, { name }) {
    const c = p.char;
    const targetId = typeof name === 'string' ? this.byName.get(name.trim().toLowerCase()) : null;
    if (!targetId) return { ok: false, code: 'offline', reason: `${name} não está conectado.` };
    if (targetId === c.id) return { ok: false, code: 'self', reason: 'Você não pode se convidar.' };
    if (this.charParty.has(targetId)) return { ok: false, code: 'in_party', reason: `${name} já está em um grupo.` };
    const pid = this.charParty.get(c.id);
    if (pid && this.parties.get(pid).members.size >= PARTY_MAX) return { ok: false, code: 'full', reason: `Grupo cheio (máximo ${PARTY_MAX}).` };
    if (pid && this.parties.get(pid).leader !== c.id) return { ok: false, code: 'not_leader', reason: 'Só o líder pode convidar.' };
    this.invites.set(targetId, { from: c.id, at: Date.now() });
    this.sendTo(this.byChar.get(targetId), { t: 'party_invite', from: c.name, fromId: c.id });
    return { ok: true, cache: false };
  }

  hPartyAccept(p, { from }) {
    const c = p.char;
    const inv = this.invites.get(c.id);
    if (!inv || (from != null && inv.from !== from) || Date.now() - inv.at > 120000) return { ok: false, code: 'no_invite', reason: 'Convite inexistente ou expirado.' };
    this.invites.delete(c.id);
    if (this.charParty.has(c.id)) return { ok: false, code: 'in_party', reason: 'Você já está em um grupo.' };
    const inviter = this.playerOf(inv.from);
    if (!inviter) return { ok: false, code: 'offline', reason: 'Quem convidou saiu.' };
    let pid = this.charParty.get(inv.from);
    if (!pid) {
      pid = randomUUID().slice(0, 8);
      this.parties.set(pid, { id: pid, leader: inv.from, members: new Set([inv.from]), names: new Map([[inv.from, inviter.char.name]]) });
      this.charParty.set(inv.from, pid);
    }
    const party = this.parties.get(pid);
    if (party.members.size >= PARTY_MAX) return { ok: false, code: 'full', reason: `Grupo cheio (máximo ${PARTY_MAX}).` };
    party.members.add(c.id); party.names.set(c.id, c.name);
    this.charParty.set(c.id, pid);
    this.sendPartyUpdate(pid);
    return { ok: true, party: this.partyView(pid), cache: false };
  }

  hPartyDecline(p) {
    const inv = this.invites.get(p.char.id);
    this.invites.delete(p.char.id);
    if (inv) this.sendTo(this.byChar.get(inv.from), { t: 'system', text: `${p.char.name} recusou o convite.` });
    return { ok: true, cache: false };
  }

  removeFromParty(charId) {
    const pid = this.charParty.get(charId);
    if (!pid) return;
    const party = this.parties.get(pid);
    this.charParty.delete(charId);
    party.members.delete(charId);
    this.sendTo(this.byChar.get(charId), { t: 'party', party: null });
    if (party.members.size <= 1) return this.disbandParty(pid);
    if (party.leader === charId) party.leader = [...party.members][0];
    this.sendPartyUpdate(pid);
  }

  disbandParty(pid) {
    const party = this.parties.get(pid);
    if (!party) return;
    for (const m of party.members) { this.charParty.delete(m); this.sendTo(this.byChar.get(m), { t: 'party', party: null }); }
    this.parties.delete(pid);
  }

  hPartyLeave(p) {
    if (!this.charParty.has(p.char.id)) return { ok: false, code: 'no_party', reason: 'Você não está em um grupo.' };
    this.removeFromParty(p.char.id);
    return { ok: true, cache: false };
  }

  hPartyKick(p, { charId }) {
    const pid = this.charParty.get(p.char.id);
    const party = pid && this.parties.get(pid);
    if (!party) return { ok: false, code: 'no_party', reason: 'Você não está em um grupo.' };
    if (party.leader !== p.char.id) return { ok: false, code: 'not_leader', reason: 'Só o líder pode remover membros.' };
    if (!party.members.has(charId) || charId === p.char.id) return { ok: false, code: 'bad_target', reason: 'Membro inválido.' };
    this.removeFromParty(charId);
    return { ok: true, cache: false };
  }

  // ---------- inventário ----------
  hPickup(p, { loot: lootId }) {
    const c = p.char;
    if (typeof lootId !== 'string') return { ok: false, code: 'bad_request', reason: 'Saque inválido.' };
    let result;
    this.store.tx(() => {
      const row = this.store.getLoot(lootId);
      if (!row) { result = { ok: false, code: 'not_found', reason: 'Saque não encontrado.' }; return; }
      if (row.char_id !== c.id) { result = { ok: false, code: 'not_owner', reason: 'Este saque não pertence a você.' }; return; }
      if (row.claimed_at != null) {
        result = { ok: true, alreadyClaimed: true, loot: lootId, instanceId: row.claimed_instance_id, gold: row.gold, defId: row.def_id };
        return;
      }
      if (row.expires_at <= Date.now()) { result = { ok: false, code: 'expired', reason: 'Este saque expirou.' }; return; }
      if (row.map_id !== p.zone.mapId) { result = { ok: false, code: 'too_far', reason: 'Este saque está em outro mapa.' }; return; }
      const d = Math.hypot(row.x - c.x, row.z - c.z);
      if (d > this.data.formulas.movement.pickupRange) { result = { ok: false, code: 'too_far', reason: `Muito longe do saque (${d.toFixed(1)} m).` }; return; }
      let instanceId = null;
      if (row.def_id) {
        const def = this.data.items[row.def_id];
        let stack = null;
        if (def.stack) for (const it of c.items.values()) if (it.loc === 'bag' && it.defId === def.id && it.qty + row.qty <= def.stack) { stack = it; break; }
        if (stack) {
          stack.qty += row.qty; instanceId = stack.id;
          this.store.saveItems(c.id, [stack]);
        } else {
          if (bagCount(c) >= BAG_CAPACITY) { result = { ok: false, code: 'bag_full', reason: 'Inventário cheio.' }; return; }
          const it = { id: randomUUID(), defId: def.id, qty: row.qty, enh: 0, loc: 'bag', slot: null };
          this.store.insertItem({ ...it, charId: c.id, source: `loot:${row.id}` });
          c.items.set(it.id, it); instanceId = it.id;
        }
      }
      if (row.gold) { c.gold += row.gold; this.store.saveCharacter(c); }
      this.store.markLootClaimed(row.id, instanceId);
      result = { ok: true, alreadyClaimed: false, loot: lootId, instanceId, gold: row.gold, defId: row.def_id };
    });
    if (result.ok) result.char = p.zone.charView(p); // objetivos "collect" são contados ao vivo na bolsa
    return result;
  }

  hEquip(p, { instance }) {
    const c = p.char;
    const check = checkEquip(c, instance, this.data);
    if (!check.ok) return check;
    const changed = applyEquip(c, instance, check);
    this.store.tx(() => this.store.saveItems(c.id, changed));
    p.zone.recalc(p);
    return { ok: true, slot: check.slot, displaced: check.displaced, char: p.zone.charView(p) };
  }

  hUnequip(p, { slot }) {
    const c = p.char;
    const check = checkUnequip(c, slot);
    if (!check.ok) return check;
    const it = c.items.get(check.instanceId);
    it.loc = 'bag'; it.slot = null;
    this.store.tx(() => this.store.saveItems(c.id, [it]));
    p.zone.recalc(p);
    return { ok: true, instanceId: it.id, char: p.zone.charView(p) };
  }

  hClaimRecovery(p, { instance }) {
    const c = p.char;
    const it = c.items.get(instance);
    if (!it || it.loc !== 'recovery') return { ok: false, code: 'not_found', reason: 'Item não está na caixa de recuperação.' };
    if (bagCount(c) >= BAG_CAPACITY) return { ok: false, code: 'bag_full', reason: 'Inventário cheio.' };
    it.loc = 'bag';
    this.store.tx(() => this.store.saveItems(c.id, [it]));
    return { ok: true, char: p.zone.charView(p) };
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
    p.zone.recalc(p);
    return { ok: true, char: p.zone.charView(p) };
  }

  // Redistribuição gratuita (no jogo final custará um item). Itens que deixam de atender
  // aos requisitos vão para a bolsa ou para a caixa de recuperação.
  hResetAttrs(p) {
    const c = p.char;
    c.alloc = {};
    c.unspent = totalAttributePoints(c.level, this.data);
    const moved = revalidateEquipment(c, this.data);
    this.store.tx(() => { this.store.saveItems(c.id, moved); this.store.saveCharacter(c); });
    p.zone.recalc(p);
    return { ok: true, moved: moved.map((m) => ({ id: m.id, defId: m.defId, loc: m.loc })), char: p.zone.charView(p) };
  }

  // ---------- chat: zona, grupo, sussurro ----------
  hChat(p, { text, channel = 'zone', to }) {
    if (typeof text !== 'string') return { ok: false, code: 'bad_request', reason: 'Mensagem inválida.' };
    const clean = text.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 200);
    if (!clean) return { ok: false, code: 'empty', reason: 'Mensagem vazia.' };
    const msg = { t: 'chat', channel, from: p.char.name, eid: p.eid, text: clean };
    if (channel === 'zone') this.broadcastZone(p.zone.key, msg);
    else if (channel === 'party') {
      const pid = this.charParty.get(p.char.id);
      if (!pid) return { ok: false, code: 'no_party', reason: 'Você não está em um grupo.' };
      for (const m of this.parties.get(pid).members) this.sendTo(this.byChar.get(m), msg);
    } else if (channel === 'whisper') {
      const targetId = typeof to === 'string' ? this.byName.get(to.trim().toLowerCase()) : null;
      if (!targetId) return { ok: false, code: 'offline', reason: `${to} não está conectado.` };
      this.sendTo(this.byChar.get(targetId), { ...msg, to: this.playerOf(targetId).char.name });
      this.sendTo(this.byChar.get(p.char.id), { ...msg, to: this.playerOf(targetId).char.name });
    } else return { ok: false, code: 'bad_channel', reason: 'Canal inválido.' };
    return { ok: true, cache: false };
  }

  // Comandos de mestre: só com --dev. Usados para reproduzir cenários (README) e nos testes.
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
      return { ok: true, instanceId: it.id, char: p.zone.charView(p) };
    }
    if (msg.cmd === 'teleport') {
      if (msg.mapId && msg.mapId !== p.zone.mapId) {
        if (!this.zones.has(msg.mapId)) return { ok: false, code: 'bad_map', reason: 'Mapa inexistente.' };
        return { ok: true, cache: false, after: () => this.moveToZone(p, msg.mapId, msg.x, msg.z) };
      }
      c.x = msg.x; c.z = msg.z; p.dest = null;
      return { ok: true, char: p.zone.charView(p) };
    }
    if (msg.cmd === 'xp') {
      const cum = this.data.xp.cumulative;
      const target = Math.min(this.data.levelCap, msg.level);
      const need = cum[target - 1] - c.xp;
      if (need <= 0) return { ok: false, code: 'bad_request', reason: 'Já está nesse nível.' };
      p.zone.grantXp(p, need);
      this.store.saveCharacter(c);
      return { ok: true, char: p.zone.charView(p) };
    }
    if (msg.cmd === 'quest_done') {
      // marca missões como concluídas (atalho de cenário)
      for (const id of msg.quests || []) { c.quests.set(id, { state: 'done', progress: {} }); this.quests.save(c, id); }
      return { ok: true, journal: this.quests.journal(c) };
    }
    return { ok: false, code: 'unknown', reason: 'Comando de mestre desconhecido.' };
  }
}

function charRow(r) {
  return { id: r.id, name: r.name, classId: r.class_id, level: r.level, mapId: r.map_id };
}

export { EQUIP_SLOTS };
