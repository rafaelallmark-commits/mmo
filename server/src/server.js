// Servidor de jogo: WebSocket + JSON. Autentica, carrega personagens, hospeda as zonas
// (mapas abertos e instâncias), grupos, chat e missões, e responde cada requisição
// { rid } com { t:'res', rid, ok, ... }.
import { WebSocketServer } from 'ws';
import https from 'node:https';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join as pathJoin, dirname as pathDirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyToken, ReplayGuard } from './token.js';
import { enhanceable, enhanceQuote, enhancePreview, rollEnhance } from './smith.js';
import { randomUUID } from 'node:crypto';
import { loadGameData, ATTRS } from './data.js';
import { createStore } from './db.js';
import { Zone, lootView } from './zone.js';
import { makeRng } from './rng.js';
import { QuestEngine } from './quests.js';
import { Dungeon } from './dungeon.js';
import { checkEquip, applyEquip, checkUnequip, revalidateEquipment, bagCount, BAG_CAPACITY, EQUIP_SLOTS } from './equipment.js';
import { totalAttributePoints, derivedStats } from './rules.js';

import { Metrics, startMetricsServer } from './metrics.js';

export const PROTOCOL_VERSION = 3; // 3: snapshots por diferença, login por token, escolta, canalização
const SERVER_VERSION = JSON.parse(readFileSync(pathJoin(pathDirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf8')).version;
const NAME_RE = /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 _-]{2,15}$/;
const RID_CACHE = 128;
const PARTY_MAX = 5;
const DEFAULT_MAP = 'estrada_velha';
const INTEREST_R = 70; // raio de interesse dos snapshots por diferença (m)
const PRED_EPS2 = 0.1 * 0.1; // erro de posição tolerado na previsão por velocidade (m²)

export class GameServer {
  constructor(opts = {}) {
    this.opts = {
      port: 7777, host: '0.0.0.0', dbPath: 'cinzas.db', tickHz: 10, timeScale: 1, xpRate: 1, seed: Date.now() & 0xffffffff, dev: false, log: true,
      metricsPort: null, metricsHost: '127.0.0.1', lagMs: 0, jitterMs: 0,
      // teste público: limites, autenticação, TLS, logs, desligamento e retenção
      rateLimit: 20, rateBurst: 40, chatPer5s: 6, maxConnPerIp: 0, trustProxy: false,
      auth: 'both', tokenSecret: null, tlsCert: null, tlsKey: null, logFormat: 'text', shutdownGraceS: 30, auditDays: 90,
      ...Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined)),
    };
    this.data = opts.data ?? loadGameData(opts.dataDir);
    // arquivo SQLite (desenvolvimento) ou postgres://... (produção); veja db.js
    this.store = createStore(this.opts.dbPath);
    this.rng = makeRng(this.opts.seed);
    this.quests = new QuestEngine({ data: this.data, store: this.store });
    this.sessions = new Set();
    this.metrics = new Metrics();
    this.ipConns = new Map(); // ip -> conexões abertas
    this.replay = new ReplayGuard();
    this.closing = false;
    this.dataVersion = dataVersionOf(this.data);
    this.byChar = new Map(); // charId -> session
    this.byAccount = new Map(); // accountId -> session
    this.byName = new Map(); // nome minúsculo -> charId (online)
    this.ridCache = new Map(); // charId -> Map(rid -> response)
    this.zones = new Map(); // chave (mapId ou id de instância) -> Zone
    this.charZone = new Map(); // charId -> chave da zona
    this.parties = new Map(); // partyId -> { id, leader, members:Set }
    this.charParty = new Map(); // charId -> partyId
    this.invites = new Map(); // charId convidado -> { from, at }
    this.trials = new Map();
    this.dungeons = new Map();      // chave da instância -> Dungeon
    this.partyDungeon = new Map();  // grupo -> chave da instância // chave da instância -> estado da prova
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
        onLevelUp: (p, level) => this.store.logLevel(p.char.id, level, p.char.classId, p.char.playedS ?? 0),
        onEscortArrived: (escort, credited) => { for (const p of credited) this.notifyQuests(p, this.quests.onEscort(p.char, escort.defId)); },
        onChannelDone: (p, objectId) => this.notifyQuests(p, this.quests.onInteract(p.char, objectId)),
      },
    });
    this.zones.set(key, zone);
    return zone;
  }

  zoneOfChar(charId) { return this.zones.get(this.charZone.get(charId)); }
  playerOf(charId) { return this.zoneOfChar(charId)?.players.get(charId) ?? null; }

  log(...a) {
    if (!this.opts.log) return;
    if (this.opts.logFormat === 'json') console.log(JSON.stringify({ ts: new Date().toISOString(), msg: a.map((x) => (typeof x === 'string' ? x : String(x))).join(' ') }));
    else console.log(new Date().toISOString().slice(11, 19), ...a);
  }

  audit(kind, fields) { try { this.store.audit(kind, fields); } catch (e) { this.log('auditoria falhou', kind, e.message); } }

  start() {
    return new Promise((resolve) => {
      const onListening = (addr) => {
        this.port = addr.port;
        this.log(`CINZAS DO MERIDIANO ${SERVER_VERSION} — servidor ouvindo em ${this.tls ? 'wss' : 'ws'}://${this.opts.host}:${this.port} (${this.zones.size} zonas, tick ${this.opts.tickHz} Hz, escala ${this.opts.timeScale}x, XP ${this.opts.xpRate}x, protocolo ${PROTOCOL_VERSION}, dados ${this.dataVersion}${this.opts.dev ? ', modo dev' : ''}, login: ${this.opts.auth}, banco: ${this.store.describe()})`);
        resolve(this.port);
      };
      if (this.opts.tlsCert && this.opts.tlsKey) {
        // TLS direto (wss://). Em produção também dá para terminar o TLS num proxy (deploy/Caddyfile).
        this.tls = https.createServer({ cert: readFileSync(this.opts.tlsCert), key: readFileSync(this.opts.tlsKey) });
        this.wss = new WebSocketServer({ server: this.tls, maxPayload: 64 * 1024 });
        this.tls.listen(this.opts.port, this.opts.host, () => onListening(this.tls.address()));
      } else {
        this.wss = new WebSocketServer({ port: this.opts.port, host: this.opts.host, maxPayload: 64 * 1024 });
        this.wss.on('listening', () => onListening(this.wss.address()));
      }
      this.wss.on('connection', (ws, req) => this.onConnection(ws, req));
      const tickMs = 1000 / this.opts.tickHz;
      let last = performance.now();
      this.timer = setInterval(() => {
        const t = performance.now();
        const dt = Math.min(250, t - last) * this.opts.timeScale;
        last = t;
        this.step(dt);
      }, tickMs);
      this.saveTimer = setInterval(() => this.saveAll(), 10_000);
      // retenção (privacidade): auditoria mais velha que auditDays e códigos vencidos, de hora em hora
      this.purgeTimer = setInterval(() => { try { this.store.purgeOld(this.opts.auditDays); } catch { /* banco ocupado: tenta depois */ } }, 3600_000);
    }).then(async (port) => {
      if (this.opts.metricsPort != null && this.opts.metricsPort !== false) {
        this.metricsSrv = await startMetricsServer({
          port: Number(this.opts.metricsPort), host: this.opts.metricsHost,
          collect: () => this.collectMetrics(), onReset: () => { this.metrics.reset(); this.store.resetDbStats?.(); },
        });
        this.metricsPort = this.metricsSrv.address().port;
        this.log(`métricas em http://${this.opts.metricsHost}:${this.metricsPort}/metrics`);
      }
      return port;
    });
  }

  collectMetrics() {
    let players = 0;
    for (const z of this.zones.values()) players += z.players.size;
    const db = this.store.dbStats?.(); // só no PostgreSQL: tempo parado na ponte síncrona
    return this.metrics.snapshot({ players, sessions: this.sessions.size, zones: this.zones.size, tickHz: this.opts.tickHz, ...(db ? { db } : {}) });
  }

  step(dt) {
    const t0 = performance.now();
    for (const [key, z] of this.zones) {
      // tempo jogado (tempo de jogo, para a telemetria de progressão)
      for (const p of z.players.values()) p.char.playedS = (p.char.playedS ?? 0) + dt / 1000;
      z.tick(dt);
      if (z.players.size) this.sendSnapshots(key, z);
    }
    this.tickTrials();
    this.tickDungeons();
    this.tickCount++;
    if (this.tickCount % this.opts.tickHz === 0) for (const pid of this.parties.keys()) this.sendPartyUpdate(pid);
    this.metrics.recordTick(performance.now() - t0);
  }

  // Snapshot de cada jogador. Clientes que pediram "delta" no login recebem só as entidades a até
  // INTEREST_R (mais o próprio alvo) e, de cada uma, só os grupos de campos que mudaram desde o
  // último envio; quem saiu do raio vai em "gone". Posição e velocidade vão juntas e só quando a
  // previsão do cliente (última posição + velocidade × tempo) erraria mais que 10 cm. Os demais
  // clientes recebem o snapshot completo da zona.
  sendSnapshots(key, z) {
    let full = null;
    let recs = null;
    const R2 = INTEREST_R * INTEREST_R;
    for (const [charId, p] of z.players) {
      const s = this.byChar.get(charId);
      if (!s || s.ws.readyState !== 1) continue;
      if (!s.delta) {
        if (full == null) full = JSON.stringify(z.snapshot());
        this.rawSend(s, full, true);
        continue;
      }
      if (!recs) recs = z.snapRecords();
      if (!s.known) { s.known = new Map(); s.knownFull = true; }
      const known = s.known;
      const vx = p.char.x, vz = p.char.z;
      const now = Math.round(z.now);
      const parts = [];
      let visible = 0;
      const seen = new Set();
      for (const r of recs) {
        const dx = r.x - vx, dz = r.z - vz;
        if (dx * dx + dz * dz > R2 && r.id !== p.targetId && r.id !== p.eid) continue;
        seen.add(r.id);
        visible++;
        const k = known.get(r.id);
        if (!k) {
          parts.push(`{"id":"${r.id}",${r.A},${r.P},${r.V},${r.C}}`);
          known.set(r.id, { A: r.A, C: r.C, px: r.px, pz: r.pz, vx: r.vx, vz: r.vz, t: now });
          continue;
        }
        let ch = '';
        if (k.A !== r.A) { ch += ',' + r.A; k.A = r.A; }
        // previsão por velocidade (a mesma que o cliente faz): posição só quando o erro passa de
        // PRED_EPS, quando a velocidade muda ou a cada 2 s
        const dts = (now - k.t) / 1000;
        const ex = r.px - (k.px + k.vx * dts), ez = r.pz - (k.pz + k.vz * dts);
        if (r.vx !== k.vx || r.vz !== k.vz || ex * ex + ez * ez > PRED_EPS2 || now - k.t > 2000) {
          ch += ',' + r.P + ',' + r.V;
          k.px = r.px; k.pz = r.pz; k.vx = r.vx; k.vz = r.vz; k.t = now;
        }
        if (k.C !== r.C) { ch += ',' + r.C; k.C = r.C; }
        if (ch) parts.push(`{"id":"${r.id}"${ch}}`);
      }
      let gone = '';
      if (known.size > visible) {
        const g = [];
        for (const id of known.keys()) if (!seen.has(id)) { g.push(`"${id}"`); known.delete(id); }
        gone = g.join(',');
      }
      const raw = `{"t":"snap","now":${now},"map":"${z.mapId}","d":1${s.knownFull ? ',"full":1' : ''},"ents":[${parts.join(',')}],"gone":[${gone}]}`;
      s.knownFull = false;
      this.rawSend(s, raw, true);
    }
  }

  // A cada 10 s e no desligamento. Um lote só (uma transação no SQLite; um UPDATE numa ida e volta no
  // PostgreSQL): com a ponte síncrona, salvar um a um pararia o laço de eventos por N idas e voltas.
  saveAll() {
    const chars = [];
    for (const z of this.zones.values()) for (const p of z.players.values()) chars.push(p.char);
    if (chars.length) this.store.saveCharacters(chars);
  }

  // Desligamento gracioso: avisa todos, recusa novos logins, espera o prazo, salva e fecha.
  async shutdown(graceS = this.opts.shutdownGraceS) {
    if (this.closing) return;
    this.closing = true;
    const note = (text) => { for (const s of this.sessions) this.sendTo(s, { t: 'notice', kind: 'shutdown', text, inS: graceS }); };
    if (graceS > 0) {
      note(`O servidor vai reiniciar em ${graceS} s. Seu progresso está salvo.`);
      this.log(`desligando em ${graceS} s`);
      const step = Math.max(0, graceS - 5);
      await new Promise((r) => setTimeout(r, step * 1000));
      if (graceS > 5) note('O servidor reinicia em 5 s.');
      await new Promise((r) => setTimeout(r, Math.min(5, graceS) * 1000));
    }
    this.saveAll();
    await this.stop();
  }

  async stop() {
    clearInterval(this.timer); clearInterval(this.saveTimer); clearInterval(this.purgeTimer);
    for (const s of [...this.sessions]) this.dropSession(s);
    for (const ws of this.wss.clients) ws.terminate();
    await new Promise((r) => this.wss.close(() => r()));
    if (this.tls) await new Promise((r) => this.tls.close(() => r()));
    if (this.metricsSrv) await new Promise((r) => this.metricsSrv.close(() => r()));
    this.store.close();
  }

  // ---------- conexões ----------
  onConnection(ws, req) {
    let ip = req?.socket?.remoteAddress ?? '?';
    if (this.opts.trustProxy) {
      const fwd = req?.headers?.['x-forwarded-for'];
      if (typeof fwd === 'string' && fwd.trim()) ip = fwd.split(',')[0].trim();
    }
    const n = this.ipConns.get(ip) ?? 0;
    if (this.opts.maxConnPerIp > 0 && n >= this.opts.maxConnPerIp) {
      ws.send(JSON.stringify({ t: 'kicked', reason: 'Conexões demais deste endereço.' }));
      ws.close(1008, 'conexoes demais');
      this.audit('conn_limit', { ip });
      return;
    }
    this.ipConns.set(ip, n + 1);
    const s = { id: randomUUID(), ws, ip, accountId: null, charId: null, role: 'player', bucket: { tokens: this.opts.rateBurst, at: performance.now(), over: 0, overAt: 0 }, chat: [] };
    this.sessions.add(s);
    ws.on('message', (buf) => {
      const lag = this.lagDelay();
      if (lag > 0) this.lagQueue(s, 'in', lag, () => this.onMessage(s, buf));
      else this.onMessage(s, buf);
    });
    ws.on('close', () => this.dropSession(s));
    ws.on('error', () => {});
    this.sendTo(s, { t: 'hello', protocol: PROTOCOL_VERSION, server: 'cinzas-zone', version: SERVER_VERSION, dataVersion: this.dataVersion, auth: this.opts.auth, dev: !!this.opts.dev });
  }

  dropSession(s) {
    if (!this.sessions.has(s)) return;
    this.sessions.delete(s);
    const n = (this.ipConns.get(s.ip) ?? 1) - 1;
    if (n <= 0) this.ipConns.delete(s.ip); else this.ipConns.set(s.ip, n);
    if (s.charId != null) this.leaveWorld(s);
    if (s.accountId != null && this.byAccount.get(s.accountId) === s) this.byAccount.delete(s.accountId);
    try { s.ws.close(); } catch { /* já fechado */ }
  }

  leaveWorld(s) {
    const charId = s.charId;
    const key = this.charZone.get(charId);
    if (this.trials.has(key)) this.endTrial(key, false, 'Conexão perdida durante a prova.', true);
    const dg = this.dungeons.get(key);
    if (dg) {
      const c = this.zones.get(key)?.players.get(charId)?.char;
      if (c) dg.away.set(charId, { x: c.x, z: c.z, hp: c.hp, mp: c.mp, dead: c.dead, until: Date.now() + dg.f.reconnectWaitMs });
    }
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

  // Atraso artificial (metade do RTT pedido em cada sentido, com variação) para testar tolerância.
  lagDelay() {
    const { lagMs, jitterMs } = this.opts;
    if (!(lagMs > 0) && !(jitterMs > 0)) return 0;
    return Math.max(0, (lagMs || 0) / 2 + (Math.random() * 2 - 1) * (jitterMs || 0) / 2);
  }

  // Fila com atraso por conexão e sentido: entrega na ordem de chegada (como o TCP), cada item
  // no mínimo `lag` ms depois de entrar e nunca antes do anterior.
  lagQueue(s, dir, lag, fn) {
    const key = dir === 'in' ? 'lagIn' : 'lagOut';
    const q = s[key] ?? (s[key] = { items: [], timer: null, last: 0 });
    const at = Math.max(performance.now() + lag, q.last);
    q.last = at;
    q.items.push({ at, fn });
    const pump = () => {
      q.timer = null;
      const now = performance.now();
      while (q.items.length && q.items[0].at <= now + 0.5) q.items.shift().fn();
      if (q.items.length) q.timer = setTimeout(pump, Math.max(0, q.items[0].at - performance.now()));
    };
    if (!q.timer) q.timer = setTimeout(pump, Math.max(0, q.items[0].at - performance.now()));
  }

  rawSend(s, raw, snap = false) {
    if (!s || s.ws.readyState !== 1) return;
    this.metrics.out(raw.length, snap);
    const lag = this.lagDelay();
    if (lag > 0) this.lagQueue(s, 'out', lag, () => { if (s.ws.readyState === 1) s.ws.send(raw); });
    else s.ws.send(raw);
  }

  sendTo(s, msg) {
    if (s && s.ws.readyState === 1) this.rawSend(s, JSON.stringify(msg));
  }

  broadcastZone(key, msg) {
    const z = this.zones.get(key);
    if (!z) return;
    const raw = JSON.stringify(msg);
    const snap = msg.t === 'snap';
    for (const charId of z.players.keys()) this.rawSend(this.byChar.get(charId), raw, snap);
  }

  // Limite de comandos por conexão (balde de fichas): rateLimit por segundo, rajada de rateBurst.
  // Quem passa muito do limite por 10 s seguidos é desconectado (auditado).
  allowMessage(s) {
    const b = s.bucket;
    const now = performance.now();
    b.tokens = Math.min(this.opts.rateBurst, b.tokens + ((now - b.at) / 1000) * this.opts.rateLimit);
    b.at = now;
    if (b.tokens >= 1) { b.tokens -= 1; return true; }
    if (now - b.overAt > 10_000) { b.over = 0; b.overAt = now; }
    b.over++;
    if (b.over > this.opts.rateLimit * 10) {
      this.audit('kick_flood', { accountId: s.accountId, charId: s.charId, ip: s.ip });
      this.sendTo(s, { t: 'kicked', reason: 'Comandos demais em pouco tempo.' });
      this.dropSession(s);
    }
    return false;
  }

  onMessage(s, buf) {
    this.metrics.in(buf.length);
    if (!this.sessions.has(s)) return;
    let msg;
    try { msg = JSON.parse(buf.toString()); } catch { return this.sendTo(s, { t: 'res', rid: null, ok: false, code: 'bad_json', reason: 'Mensagem inválida.' }); }
    const rid = typeof msg.rid === 'string' || typeof msg.rid === 'number' ? msg.rid : null;
    // acima do limite: responde ao próprio pedido (o cliente não fica esperando) sem executar
    if (!this.allowMessage(s)) return this.sendTo(s, { t: 'res', rid, req: msg.t, ok: false, code: 'rate_limited', reason: 'Muitos comandos; espere um pouco.' });
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
      case 'register': return this.opts.auth === 'token' ? { ok: false, code: 'use_accounts', reason: 'Crie sua conta pelo site/serviço de contas.' } : this.hRegister(s, msg);
      case 'login': return this.opts.auth === 'token' ? { ok: false, code: 'use_accounts', reason: 'Entre pelo serviço de contas (token).' } : this.hLogin(s, msg);
      case 'login_token': return this.hLoginToken(s, msg);
    }
    if (s.accountId == null) return { ok: false, code: 'not_logged', reason: 'Faça login primeiro.' };
    switch (msg.t) {
      case 'list_chars': return { ok: true, chars: this.store.listCharacters(s.accountId).map(charRow), classes: this.creatableClasses() };
      case 'create_char': return this.hCreateChar(s, msg);
      case 'enter': return this.hEnter(s, msg);
      case 'delete_account': return this.hDeleteAccount(s, msg);
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
      case 'quest_choice': return this.hQuestChoice(p, msg);
      case 'trial_start': return this.hTrialStart(s, p, msg);
      case 'party_invite': return this.hPartyInvite(p, msg);
      case 'party_accept': return this.hPartyAccept(p, msg);
      case 'party_decline': return this.hPartyDecline(p, msg);
      case 'party_leave': return this.hPartyLeave(p);
      case 'party_kick': return this.hPartyKick(p, msg);
      case 'enhance_quote': return this.hEnhance(p, msg, false);
      case 'enhance': return this.hEnhance(p, msg, true);
      case 'storage_list': return this.hStorageList(p, msg);
      case 'storage_put': return this.hStoragePut(p, msg);
      case 'storage_take': return this.hStorageTake(p, msg);
      case 'dungeon_enter': return this.hDungeonEnter(s, p, msg);
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
  // Exclusão da própria conta (privacidade), confirmada com a senha; fora do mundo.
  hDeleteAccount(s, { password }) {
    if (s.charId != null) return { ok: false, code: 'in_world', reason: 'Saia do mundo antes de excluir a conta.' };
    const acc = this.store.findAccountById(s.accountId);
    if (!acc || typeof password !== 'string' || !this.store.checkPassword(acc, password)) return { ok: false, code: 'bad_password', reason: 'Senha incorreta.' };
    const n = this.store.deleteAccount(acc.id);
    this.audit('account_deleted', { accountId: acc.id, ip: s.ip, characters: n });
    this.log(`conta excluída: ${acc.id} (${n} personagens)`);
    return { ok: true, after: () => this.dropSession(s) };
  }

  hRegister(s, { account, password }) {
    if (typeof account !== 'string' || !/^[a-zA-Z0-9_]{3,20}$/.test(account)) return { ok: false, code: 'bad_account', reason: 'Conta: 3 a 20 letras, números ou _.' };
    if (typeof password !== 'string' || password.length < 4) return { ok: false, code: 'bad_password', reason: 'Senha precisa de pelo menos 4 caracteres.' };
    if (this.store.findAccount(account)) return { ok: false, code: 'account_exists', reason: 'Essa conta já existe.' };
    this.store.createAccount(account, password);
    return { ok: true };
  }

  hLogin(s, msg) {
    const { account, password } = msg;
    if (s.accountId != null) return { ok: false, code: 'already', reason: 'Sessão já autenticada.' };
    if (this.closing) return { ok: false, code: 'closing', reason: 'O servidor está reiniciando. Tente em instantes.' };
    const acc = typeof account === 'string' && typeof password === 'string' ? this.store.verifyAccount(account, password) : null;
    if (!acc) { this.audit('login_fail', { ip: s.ip, account: typeof account === 'string' ? account.slice(0, 24) : null }); return { ok: false, code: 'bad_login', reason: 'Conta ou senha incorretas.' }; }
    if (!acc.verified) return { ok: false, code: 'unverified', reason: 'Confirme seu e-mail antes de entrar.' };
    return this.completeLogin(s, msg, acc, 'senha');
  }

  // Login com token do serviço de contas (teste público): assinatura, validade e uso único.
  hLoginToken(s, msg) {
    if (s.accountId != null) return { ok: false, code: 'already', reason: 'Sessão já autenticada.' };
    if (this.closing) return { ok: false, code: 'closing', reason: 'O servidor está reiniciando. Tente em instantes.' };
    if (this.opts.auth === 'password') return { ok: false, code: 'no_tokens', reason: 'Este servidor não aceita login por token.' };
    const p = verifyToken(msg.token, this.opts.tokenSecret);
    if (!p || !this.replay.use(p)) { this.audit('login_fail', { ip: s.ip, via: 'token' }); return { ok: false, code: 'bad_token', reason: 'Sessão inválida ou vencida. Entre de novo.' }; }
    const acc = this.store.findAccountById(p.sub);
    if (!acc || !acc.verified) return { ok: false, code: 'bad_token', reason: 'Conta indisponível.' };
    return this.completeLogin(s, msg, acc, 'token');
  }

  completeLogin(s, msg, acc, via) {
    const old = this.byAccount.get(acc.id);
    if (old) {
      // Reconexão: a sessão antiga (talvez "pendurada") é encerrada e salva antes de continuar.
      this.sendTo(old, { t: 'kicked', reason: 'Sua conta entrou em outra conexão.' });
      this.dropSession(old);
    }
    s.accountId = acc.id;
    s.role = acc.role ?? 'player';
    s.delta = msg.delta === true; // cliente entende snapshots por diferença
    this.audit('login', { accountId: acc.id, ip: s.ip, via });
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
    let zone = this.zones.get(char.mapId) ?? this.zones.get(DEFAULT_MAP);
    // voltou dentro do prazo: reentra no calabouço do grupo como estava (morto continua morto)
    let back = null;
    for (const [key, dg] of this.dungeons) {
      const a = dg.away.get(charId);
      if (a && a.until > Date.now() && this.zones.has(key)) { back = { key, a, dg }; break; }
    }
    if (back) { zone = this.zones.get(back.key); char.x = back.a.x; char.z = back.a.z; char.dead = false; }
    const p = zone.addPlayer(char);
    if (back) {
      back.dg.away.delete(charId);
      char.hp = Math.min(back.a.hp, p.stats.maxHp); char.mp = back.a.mp;
      if (back.a.dead) { char.dead = true; char.hp = 0; }
      char.saveMapId = 'canais_eclusa'; char.saveX = 100; char.saveZ = 184;
    }
    this.store.saveCharacter(char);
    s.charId = charId;
    s.known = new Map(); s.knownFull = true;
    this.byChar.set(charId, s);
    this.byName.set(char.name.toLowerCase(), charId);
    this.charZone.set(charId, zone.key);
    this.log(`entrou: ${char.name} nv${char.level} em ${zone.mapId}${wasDead ? ' (estava caído: restaurado no posto)' : ''}`);
    this.broadcastZone(zone.key, { t: 'joined', eid: p.eid, name: char.name });
    const pid = this.charParty.get(charId);
    if (pid) this.sendPartyUpdate(pid);
    return { ok: true, char: zone.charView(p), snapshot: zone.snapshot(), loot: this.lootFor(charId, zone.mapId), journal: this.quests.journal(char), restoredFromDeath: wasDead && !back, rejoinedDungeon: !!back, cache: false };
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
    const sess = this.byChar.get(charId);
    if (sess) { sess.known = new Map(); sess.knownFull = true; }
    if (!dest.instanceId) { delete p.char.saveMapId; delete p.char.saveX; delete p.char.saveZ; }
    this.store.saveCharacter(p.char);
    this.broadcastZone(destKey, { t: 'joined', eid: np.eid, name: p.char.name });
    this.sendTo(this.byChar.get(charId), { t: 'zone', mapId: dest.mapId, instance: dest.instanceId, char: dest.charView(np), snapshot: dest.snapshot(), loot: this.lootFor(charId, dest.mapId) });
    this.notifyQuests(np, this.quests.onEnterMap(p.char, dest.mapId));
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
    const choice = this.quests.pendingChoice(p.char, n.id) ?? undefined;
    return { ok: true, npc: { id: n.id, name: n.name, role: n.role, classId: n.classId ?? null }, quests: this.quests.npcQuests(p.char, n.id), shop, trialAvailable, choice, cache: false };
  }

  // Resposta escolhida num diálogo de missão (ex.: "Duas Razões"): muda falas futuras e dá um título.
  hQuestChoice(p, { quest, option, npc }) {
    const n = p.zone.npcNear(p, npc);
    if (!n) return { ok: false, code: 'too_far', reason: 'Chegue mais perto para conversar.' };
    const r = this.quests.choose(p.char, quest, option, n.id);
    if (!r.ok) return r;
    this.notifyQuests(p, [quest]);
    return { ok: true, reply: r.option.reply, title: p.char.title ?? null, journal: this.quests.journal(p.char), char: p.zone.charView(p), cache: false };
  }

  hInteract(p, { object }) {
    const o = p.zone.objectNear(p, object);
    if (!o) return { ok: false, code: 'too_far', reason: 'Chegue mais perto.' };
    if (o.kind === 'dungeon') return this.hDungeonEnter(null, p, { object: o.id });
    if (o.kind === 'escort') {
      if (!this.quests.hasPending(p.char, 'escort', (x) => x.escort === o.escort)) return { ok: false, code: 'nothing', reason: 'A carroça está parada. Fale com quem cuida dela.' };
      const r = p.zone.startEscort(o.escort, p);
      if (!r.ok) return r;
      return { ok: true, object: o.id, escort: r.escort.eid, already: !!r.already, cache: false };
    }
    if (o.channelMs) {
      // interação com tempo: só começa se alguma missão avançar com ela
      if (!this.quests.wouldProgressInteract(p.char, o.id)) return { ok: false, code: 'nothing', reason: 'Nada a fazer aqui agora.' };
      return { ...p.zone.startChannel(p, o.id, o.channelMs, o.channelText ?? 'Trabalhando...'), cache: false };
    }
    const changed = this.quests.onInteract(p.char, o.id);
    if (!changed.length) return { ok: false, code: 'nothing', reason: 'Nada a fazer aqui agora.' };
    this.notifyQuests(p, changed);
    return { ok: true, object: o.id, quests: changed, cache: false };
  }

  // ---------- ferreiro ----------
  hEnhance(p, { npc, instance }, apply) {
    const n = p.zone.npcNear(p, npc);
    if (!n || n.role !== 'smith') return { ok: false, code: 'too_far', reason: 'Chegue mais perto do ferreiro.' };
    const c = p.char;
    const it = c.items.get(instance);
    if (!it || (it.loc !== 'bag' && it.loc !== 'equip')) return { ok: false, code: 'not_found', reason: 'Item não encontrado com você.' };
    const def = this.data.items[it.defId];
    if (!enhanceable(def)) return { ok: false, code: 'not_enhanceable', reason: `${def.name} não pode ser refinado.` };
    const q = enhanceQuote(def, it.enh || 0, this.data);
    if (!q) return { ok: false, code: 'max', reason: `${def.name} já está em +${it.enh}, o máximo deste ferreiro.` };
    const preview = enhancePreview(def, it.enh || 0, this.data);
    const have = [...c.items.values()].filter((x) => x.loc === 'bag' && x.defId === q.material).reduce((s, x) => s + x.qty, 0);
    const quote = { ...q, preview, materialHave: have, goldHave: c.gold, cache: false };
    if (!apply) return { ok: true, ...quote };
    if (c.gold < q.gold) return { ok: false, code: 'no_gold', reason: `Ouro insuficiente: ${q.gold} necessário, você tem ${c.gold}.`, ...quote };
    const matName = this.data.items[q.material].name;
    if (have < q.materialQty) return { ok: false, code: 'no_material', reason: `${matName} insuficiente: ${q.materialQty} necessário, você tem ${have}.`, ...quote };
    const r = rollEnhance(p.zone.rng, q.chancePct);
    this.store.tx(() => {
      c.gold -= q.gold;
      let left = q.materialQty;
      for (const x of [...c.items.values()]) {
        if (left <= 0 || x.loc !== 'bag' || x.defId !== q.material) continue;
        const take = Math.min(left, x.qty);
        x.qty -= take; left -= take;
        if (x.qty <= 0) { c.items.delete(x.id); this.store.deleteItem(c.id, x.id); } else this.store.saveItems(c.id, [x]);
      }
      if (r.success) { it.enh = (it.enh || 0) + 1; this.store.saveItems(c.id, [it]); }
      this.store.saveCharacter(c);
    });
    if (it.loc === 'equip') p.zone.recalc(p);
    this.audit('enhance', { charId: c.id, instance: it.id, item: it.defId, success: r.success, enh: it.enh || 0, gold: q.gold, goldAfter: c.gold });
    return { ok: true, success: r.success, roll: r.roll, chancePct: q.chancePct, enh: it.enh || 0, instanceId: it.id,
      message: r.success ? `${def.name} agora é +${it.enh}.` : `O refino falhou (rolagem ${r.roll} ≥ ${q.chancePct}%). ${def.name} continua em +${it.enh || 0}; ouro e materiais foram gastos.`,
      char: p.zone.charView(p), cache: false };
  }

  // ---------- depósito da conta ----------
  storageNpc(p, npc) {
    const n = p.zone.npcNear(p, npc);
    return n && n.role === 'storage' ? n : null;
  }

  storageView(p) {
    const items = this.store.listAccountStorage(p.char.accountId).map((r) => ({ id: r.id, defId: r.def_id, qty: r.qty, enh: r.enh, owner: r.owner }));
    return { items, capacity: this.data.formulas.storage.capacity };
  }

  hStorageList(p, { npc }) {
    if (!this.storageNpc(p, npc)) return { ok: false, code: 'too_far', reason: 'Chegue mais perto do guarda-volumes.' };
    return { ok: true, storage: this.storageView(p), cache: false };
  }

  hStoragePut(p, { npc, instance }) {
    if (!this.storageNpc(p, npc)) return { ok: false, code: 'too_far', reason: 'Chegue mais perto do guarda-volumes.' };
    const c = p.char;
    const it = c.items.get(instance);
    if (!it || it.loc !== 'bag') return { ok: false, code: 'not_in_bag', reason: 'Só itens da bolsa podem ir para o depósito.' };
    const view = this.storageView(p);
    if (view.items.length >= view.capacity) return { ok: false, code: 'storage_full', reason: `Depósito cheio (${view.capacity} espaços).` };
    it.loc = 'storage'; it.slot = null;
    this.store.tx(() => this.store.saveItems(c.id, [it]));
    c.items.delete(it.id);
    return { ok: true, storage: this.storageView(p), char: p.zone.charView(p), cache: false };
  }

  hStorageTake(p, { npc, instance }) {
    if (!this.storageNpc(p, npc)) return { ok: false, code: 'too_far', reason: 'Chegue mais perto do guarda-volumes.' };
    const c = p.char;
    if (bagCount(c) >= BAG_CAPACITY) return { ok: false, code: 'bag_full', reason: 'Inventário cheio.' };
    // transação: só um personagem pega a mesma peça (troca de dono condicionada a loc='storage')
    const row = this.store.takeFromStorage(c.accountId, instance, c.id);
    if (!row) return { ok: false, code: 'not_found', reason: 'Este item não está mais no depósito.' };
    c.items.set(row.id, { id: row.id, defId: row.def_id, qty: row.qty, enh: row.enh, loc: 'bag', slot: null });
    return { ok: true, storage: this.storageView(p), char: p.zone.charView(p), cache: false };
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
    this.audit('buy', { charId: p.char.id, item, qty, cost, goldAfter: p.char.gold });
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
      this.audit('quest_reward', { charId: p.char.id, quest, gold: r.rewards?.gold ?? 0, xp: r.rewards?.xp ?? 0, items: r.rewards?.items ?? [] });
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

  // ---------- calabouço ----------
  hDungeonEnter(s, p, { object }) {
    const o = p.zone.objectNear(p, object);
    if (!o || o.kind !== 'dungeon') return { ok: false, code: 'too_far', reason: 'Chegue mais perto da porta da Eclusa.' };
    const c = p.char;
    const pid = this.charParty.get(c.id);
    const party = pid ? this.parties.get(pid) : null;
    if (!party || party.members.size < 2) return { ok: false, code: 'party', reason: 'A Última Eclusa exige um grupo de 2 a 5 jogadores.' };
    const members = [...party.members];
    const keyOk = members.some((id) => {
      const m = this.playerOf(id)?.char;
      return m && (this.quests.isDone(m, 'c5_fragment') || m.quests.get('c5_eclusa')?.state === 'active');
    });
    if (!keyOk) return { ok: false, code: 'key', reason: 'Alguém do grupo precisa da Chave de Comporta (missão "O Fragmento").' };
    if (c.level < 16) return { ok: false, code: 'level', reason: `Nível 16 exigido. Seu nível atual é ${c.level}.` };
    let key = this.partyDungeon.get(pid);
    let dg = key ? this.dungeons.get(key) : null;
    if (!dg || dg.done) {
      key = `dungeon:${pid}:${randomUUID().slice(0, 8)}`;
      const zone = this.createZone('ultima_eclusa', key);
      dg = new Dungeon({ key, zone, partyId: pid, members, data: this.data });
      this.dungeons.set(key, dg);
      this.partyDungeon.set(pid, key);
      this.log(`calabouço aberto: ${key} (${members.length} jogadores)`);
    }
    // entra quem pediu e quem do grupo estiver perto da porta
    const sp = this.data.maps.ultima_eclusa.spawnPoint;
    const entering = [p, ...members.map((id) => this.playerOf(id)).filter((q) => q && q !== p && q.zone === p.zone && Math.hypot(q.char.x - o.x, q.char.z - o.z) < 20 && !q.char.dead)];
    const k = key;
    return { ok: true, dungeon: key, entering: entering.length, cache: false, after: () => {
      entering.forEach((q, i) => {
        q.char.saveMapId = 'canais_eclusa'; q.char.saveX = 100; q.char.saveZ = 184;
        const np = this.moveToZone(q, k, sp.x - 2 + i, sp.z);
        np.char.saveMapId = 'canais_eclusa'; np.char.saveX = 100; np.char.saveZ = 184;
      });
      this.zones.get(k)?.broadcast({ t: 'system', text: 'O Custódio: "Pressão acima do limite. Equipe não autorizada. Iniciando contenção."' });
    } };
  }

  tickDungeons() {
    const now = Date.now();
    for (const [key, dg] of this.dungeons) {
      const zone = this.zones.get(key);
      if (!zone) { this.dungeons.delete(key); continue; }
      if (zone.players.size) { dg.emptySince = null; dg.tick(); continue; }
      for (const [cid, a] of dg.away) if (a.until <= now) dg.away.delete(cid);
      dg.emptySince ??= now;
      if (!dg.away.size && now - dg.emptySince > 5000) {
        this.zones.delete(key); this.dungeons.delete(key);
        if (this.partyDungeon.get(dg.partyId) === key) this.partyDungeon.delete(dg.partyId);
      }
    }
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
      this.audit('loot', { charId: c.id, loot: lootId, gold: row.gold || 0, item: row.def_id ?? null, qty: row.qty, instance: instanceId ?? null });
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
    const sess = this.byChar.get(p.char.id);
    if (sess) {
      const now = Date.now();
      sess.chat = sess.chat.filter((t) => now - t < 5000);
      if (sess.chat.length >= this.opts.chatPer5s) return { ok: false, code: 'chat_flood', reason: 'Calma: mensagens demais em pouco tempo.' };
      sess.chat.push(now);
    }
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
    const s = this.byChar.get(p.char.id);
    if (!this.opts.dev && !['gm', 'admin'].includes(s?.role)) return { ok: false, code: 'forbidden', reason: 'Comandos de mestre desativados.' };
    this.audit('gm', { accountId: s?.accountId ?? null, charId: p.char.id, ip: s?.ip ?? null, cmd: msg.cmd, args: Object.fromEntries(Object.entries(msg).filter(([k]) => !['t', 'rid', 'cmd'].includes(k))) });
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
    if (msg.cmd === 'gold') {
      c.gold += Math.max(0, Math.floor(msg.amount || 0));
      this.store.saveCharacter(c);
      return { ok: true, char: p.zone.charView(p) };
    }
    if (msg.cmd === 'quest_progress') {
      // testes: define o progresso de um objetivo de missão ativa
      const st = c.quests.get(msg.quest);
      if (!st || st.state !== 'active') return { ok: false, code: 'not_active', reason: 'Missão não está ativa.' };
      st.progress[msg.index] = msg.value;
      this.quests.save(c, msg.quest);
      this.notifyQuests(p, [msg.quest]);
      return { ok: true, cache: false };
    }
    if (msg.cmd === 'quest_done') {
      // marca missões como concluídas (atalho de cenário)
      for (const id of msg.quests || []) { c.quests.set(id, { state: 'done', progress: {} }); this.quests.save(c, id); }
      return { ok: true, journal: this.quests.journal(c) };
    }
    return { ok: false, code: 'unknown', reason: 'Comando de mestre desconhecido.' };
  }
}

// Versão dos dados do jogo: hash dos JSON de data/ (vai no hello e no log de início).
function dataVersionOf(data) {
  const h = createHash('sha256');
  for (const k of Object.keys(data).sort()) {
    const v = data[k];
    if (v && typeof v === 'object') h.update(k).update(JSON.stringify(v));
  }
  return h.digest('hex').slice(0, 12);
}

function charRow(r) {
  return { id: r.id, name: r.name, classId: r.class_id, level: r.level, mapId: r.map_id };
}

export { EQUIP_SLOTS };
