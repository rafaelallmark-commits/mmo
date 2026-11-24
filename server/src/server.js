// Servidor de jogo: WebSocket + JSON. Autentica, carrega personagens, hospeda as zonas
// (mapas abertos e instâncias), grupos, chat e missões, e responde cada requisição
// { rid } com { t:'res', rid, ok, ... }.
import { WebSocketServer } from 'ws';
import https from 'node:https';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash, randomInt } from 'node:crypto';
import { join as pathJoin, dirname as pathDirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyToken, ReplayGuard } from './token.js';
import { TradeManager } from './trade.js';
import { ClanManager } from './clans.js';
import { Moderation, banMessage, STAFF_ROLES, KICK_CLOSE_MS } from './moderation.js';
import { checkCharName, accentCaseVariants, DELETED_PREFIX_RE } from './names.js';
import { enhanceable, enhanceQuote, enhancePreview, rollEnhance, enhanceOutcome } from './smith.js';
import { randomUUID } from 'node:crypto';
import { loadGameData, ATTRS } from './data.js';
import { createStore } from './db.js';
import { Zone, lootView } from './zone.js';
import { makeRng } from './rng.js';
import { QuestEngine } from './quests.js';
import { TutorialManager } from './tutorial.js';
import { Dungeon } from './dungeon.js';
import { Trial } from './trial.js';
import { checkEquip, applyEquip, checkUnequip, revalidateEquipment, bagCount, BAG_CAPACITY, EQUIP_SLOTS } from './equipment.js';
import { totalAttributePoints, derivedStats } from './rules.js';
import { WorldLink } from './worldlink.js';

import { Metrics, startMetricsServer } from './metrics.js';

export const PROTOCOL_VERSION = 3; // 3: snapshots por diferença, login por token, escolta, canalização
const SERVER_VERSION = JSON.parse(readFileSync(pathJoin(pathDirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf8')).version;
// (nomes de personagem: formato, prefixos da exclusão e palavras da equipe ficam em names.js)
// comandos de mestre que criam ouro, itens, níveis, refino ou progresso: só admin ou --dev (D138)
const GM_SCENARIO_CMDS = new Set(['give', 'xp', 'set_enh', 'gold', 'quest_progress', 'quest_done', 'hp']);
const GM_GOLD_MAX = 1_000_000;
// senha conferida dentro do jogo (excluir conta ou personagem): no máximo 5 erradas por conta a cada 10 min (D144)
const PW_FAIL_MAX = 5;
const PW_FAIL_WINDOW_MS = 10 * 60_000;
const IGNORE_MAX = 100; // nomes na lista de ignorados de cada personagem (D145)
const RID_CACHE = 128;
const PARTY_MAX = 5;
const DEFAULT_MAP = 'estrada_velha';
// pedidos que podem mudar itens da bolsa: depois deles a troca aberta confere se a oferta mudou
const ITEM_MUTATING = new Set(['use_item', 'enhance', 'quest_turnin', 'storage_put', 'storage_take', 'equip', 'unequip', 'buy', 'pickup', 'claim_recovery', 'gm', 'sell', 'discard', 'cast']);
const INTEREST_R = 70; // raio de interesse dos snapshots por diferença (m)
// várias zonas: recusados enquanto o personagem espera o token para ir a outra zona
const TRANSFER_BLOCKED = new Set(['portal', 'gm', 'trial_start', 'dungeon_enter', 'interact', 'trade_request', 'trade_accept', 'duel_request', 'duel_accept']);
const PRED_EPS2 = 0.1 * 0.1; // erro de posição tolerado na previsão por velocidade (m²)

export class GameServer {
  constructor(opts = {}) {
    this.opts = {
      port: 7777, host: '0.0.0.0', dbPath: 'cinzas.db', tickHz: 10, timeScale: 1, xpRate: 1, seed: Date.now() & 0xffffffff, dev: false, log: true,
      metricsPort: null, metricsHost: '127.0.0.1', lagMs: 0, jitterMs: 0,
      // teste público: limites, autenticação, TLS, logs, desligamento e retenção
      rateLimit: 20, rateBurst: 40, chatPer5s: 6, maxConnPerIp: 0, trustProxy: false,
      auth: 'both', tokenSecret: null, tlsCert: null, tlsKey: null, logFormat: 'text', shutdownGraceS: 30, auditDays: 90,
      // várias zonas: endereço do serviço de mundo, segredo compartilhado, id desta zona, mapas que ela
      // hospeda (lista separada por vírgula; padrão: todos) e o endereço que os clientes usam para chegar aqui
      world: null, worldSecret: null, zoneId: null, maps: null, publicUrl: null, worldWaitMs: 10000,
      // convite de grupo: no máximo 1 a cada 10 s por quem convida (D145; os testes que montam grupos usam 0)
      partyInviteGapMs: 10_000,
      // operação: teto de personagens no mundo (0 = sem limite; gm e admin entram sempre) e quanto tempo sem
      // tick até /health responder 503 (o laço do jogo parou: o Docker marca o contêiner como unhealthy)
      maxPlayers: 0, tickStallMs: 5000,
      ...Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined)),
    };
    // versão desta implantação (hello, log de início e /bug): a tag da release (CINZAS_VERSION na imagem,
    // opção version) ou, sem ela, a do package.json (D150); conferida antes de abrir o banco
    this.serverVersion = deploymentVersion(this.opts.version);
    this.data = opts.data ?? loadGameData(opts.dataDir);
    // arquivo SQLite (desenvolvimento) ou postgres://... (produção); veja db.js
    this.store = createStore(this.opts.dbPath);
    this.rng = makeRng(this.opts.seed);
    this.quests = new QuestEngine({ data: this.data, store: this.store });
    this.tutorial = new TutorialManager(this);
    this.sessions = new Set();
    this.metrics = new Metrics();
    this.ipConns = new Map(); // ip -> conexões abertas
    this.replay = new ReplayGuard();
    this.trades = new TradeManager(this);
    this.clans = new ClanManager(this);
    this.mod = new Moderation(this);
    // Sorteio do refino com RNG criptográfico: o RNG semeado da zona (mulberry32, 32 bits) dá para
    // reconstruir a partir das rolagens que o jogador vê e prever um +4..+6. Os testes trocam esta função.
    this.refineRng = () => randomInt(0, 1_000_000) / 1_000_000;
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
    this.partyInviteAt = new Map(); // charId de quem convidou -> instante do último convite de grupo
    this.pwFails = new Map();       // accountId -> instantes das senhas erradas (excluir conta ou personagem)
    this.trials = new Map();
    this.dungeons = new Map();      // chave da instância -> Dungeon
    this.partyDungeon = new Map();  // grupo -> chave da instância // chave da instância -> estado da prova
    this.world = null;
    if (this.opts.world) {
      // várias zonas: só os mapas desta zona; instâncias continuam nascendo onde fica a porta/arena
      if (!this.opts.worldSecret) throw new Error('--world exige --world-secret (ou CINZAS_WORLD_SECRET)');
      const list = Array.isArray(this.opts.maps) ? this.opts.maps : typeof this.opts.maps === 'string' ? this.opts.maps.split(',').map((x) => x.trim()).filter(Boolean) : null;
      const open = Object.keys(this.data.maps).filter((id) => this.openMap(id));
      for (const id of list ?? []) if (!this.openMap(id)) throw new Error(`mapa "${id}" não existe ou não é um mapa aberto (abertos: ${open.join(', ')})`);
      this.hosted = new Set(list?.length ? list : open);
      this.world = new WorldLink(this, { url: this.opts.world, secret: this.opts.worldSecret });
      this.transferReplay = new ReplayGuard();
      this.arriving = new Map();       // charId -> recados que chegaram antes de o login_transfer terminar
      this.revoked = new Map();        // época -> instante: posse que o mundo pediu de volta antes de o personagem carregar
      this.remoteMaps = new Map();     // mapId -> { zoneId, up } (mapas das outras zonas)
      this.remote = new Map();         // charId -> { name, zoneId } (on-line em outra zona)
      this.remoteByName = new Map();   // nome minúsculo -> charId (on-line em outra zona)
      this.partyCache = new Map();     // partyId -> visão do grupo vinda do mundo
      this.charPartyCache = new Map(); // charId -> partyId
    }
    for (const [mapId, m] of Object.entries(this.data.maps)) {
      if (m.implementedIn && !m.instanced && (m.spawns || m.city) && (!this.hosted || this.hosted.has(mapId))) this.createZone(mapId);
    }
    this.tickCount = 0;
  }

  // mapa aberto (não instância) que algum servidor de zona pode hospedar
  openMap(mapId) {
    const m = this.data.maps[mapId];
    return !!(m && m.implementedIn && !m.instanced && (m.spawns || m.city));
  }

  // compatibilidade com o M1: a "zona" principal é a Estrada Velha
  get zone() { return this.zones.get(DEFAULT_MAP); }

  setXpRate(rate) { for (const z of this.zones.values()) z.xpRate = rate; this.opts.xpRate = rate; }

  // mapOverride: instância com geografia própria (os fossos da prova do Lanceiro)
  createZone(mapId, instanceId = null, mapOverride = null) {
    const key = instanceId ?? mapId;
    const zone = new Zone({
      mapId, instanceId, mapOverride, data: this.data, store: this.store, rng: makeRng((this.opts.seed + this.zones.size * 7919) >>> 0), xpRate: this.opts.xpRate,
      send: (charId, msg) => this.sendTo(this.byChar.get(charId), msg),
      broadcast: (msg) => this.broadcastZone(key, msg),
      hooks: {
        partyIdOf: (charId) => this.partyIdOf(charId),
        onKillCredit: (p, monsterId) => this.onKillCredit(zone, p, monsterId),
        onLevelUp: (p, level) => this.store.logLevel(p.char.id, level, p.char.classId, p.char.playedS ?? 0),
        onEscortArrived: (escort, credited) => { for (const p of credited) this.notifyQuests(p, this.quests.onEscort(p.char, escort.defId)); },
        onChannelDone: (p, objectId) => this.notifyQuests(p, this.quests.onInteract(p.char, objectId)),
        // telemetria do teste (relatório: npm run telemetria): onde, de quê e cercado por quantos se morre
        onPlayerDeath: (p, info) => this.audit('death', { charId: p.char.id, map: p.zone.mapId, level: p.char.level, classId: p.char.classId, x: Math.round(p.char.x), z: Math.round(p.char.z), by: info.by, attackers: info.attackers }),
        // materiais que só caem com a missão ativa, perigos do mapa ligados por missão e os títulos ganhos
        questDrops: (char, monsterId) => this.quests.questDrops(char, monsterId),
        hazardWanted: (p, hazardId) => this.quests.wantsHazard(p.char, hazardId),
        onHazardHit: (p, hazardId) => {
          const changed = this.quests.onHazard(p.char, hazardId);
          if (changed.length) this.sendTo(this.byChar.get(p.char.id), { t: 'system', text: 'A esteira te pegou: a contagem de abates recomeça do zero.' });
          this.notifyQuests(p, changed);
        },
        titlesOf: (char) => this.quests.titles(char),
        // tutorial «Três do Outro Lado» (server/src/tutorial.js): habilidade da tecla 1, tônico perto de
        // Ligia, bichos de Caio, saque garantido e o passo da zona (pessoas resgatadas, segundo toque, chegada)
        onCast: (p, skillId) => this.notifyQuests(p, this.quests.onSkill(p.char, skillId)),
        onUseItem: (p, def) => this.tutorial.onUseItem(p, def),
        onMonsterDeath: (m) => this.tutorial.onMonsterDeath(zone, m),
        extraDrops: (p, m, drops) => this.tutorial.extraDrops(p, m, drops),
        onTick: (this.data.maps[mapId]?.rescue && !instanceId) ? () => this.tutorial.tick(zone) : undefined,
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

  purge() {
    try {
      const r = this.store.purgeOld(this.opts.auditDays);
      if (r.unverified) this.log(`retenção: ${r.unverified} conta(s) nunca confirmada(s) apagada(s) depois de 7 dias`);
      return r;
    } catch { return null; /* banco ocupado: tenta depois */ }
  }

  start() {
    return new Promise((resolve) => {
      const onListening = (addr) => {
        this.port = addr.port;
        this.log(`CINZAS DO MERIDIANO ${this.serverVersion} — servidor ouvindo em ${this.tls ? 'wss' : 'ws'}://${this.opts.host}:${this.port} (${this.zones.size} zonas, tick ${this.opts.tickHz} Hz, escala ${this.opts.timeScale}x, XP ${this.opts.xpRate}x, protocolo ${PROTOCOL_VERSION}, dados ${this.dataVersion}${this.opts.dev ? ', modo dev' : ''}${this.opts.maxPlayers > 0 ? `, teto de ${this.opts.maxPlayers} jogadores` : ''}, login: ${this.opts.auth}, banco: ${this.store.describe()})`);
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
      this.metrics.lastTickAt = last; // a saúde conta o laço parado a partir daqui, não da carga do banco e dos dados
      this.timer = setInterval(() => {
        const t = performance.now();
        const dt = Math.min(250, t - last) * this.opts.timeScale;
        last = t;
        this.step(dt);
      }, tickMs);
      this.saveTimer = setInterval(() => this.saveAll(), 10_000);
      // retenção (privacidade): auditoria mais velha que auditDays, códigos vencidos, eventos dos limites do
      // serviço de contas e contas nunca confirmadas há 7 dias — um minuto depois de subir (reinícios frequentes
      // não adiam a limpeza para sempre) e depois de hora em hora
      this.purgeKick = setTimeout(() => this.purge(), 60_000);
      this.purgeTimer = setInterval(() => this.purge(), 3600_000);
    }).then(async (port) => {
      if (this.opts.metricsPort != null && this.opts.metricsPort !== false) {
        this.metricsSrv = await startMetricsServer({
          port: Number(this.opts.metricsPort), host: this.opts.metricsHost,
          collect: () => this.collectMetrics(), onReset: () => { this.metrics.reset(); this.store.resetDbStats?.(); },
          health: () => this.health(),
        });
        this.metricsPort = this.metricsSrv.address().port;
        this.log(`métricas em http://${this.opts.metricsHost}:${this.metricsPort}/metrics`);
      }
      if (this.world) await this.startWorldLink();
      return port;
    });
  }

  // várias zonas: apresenta esta zona ao serviço de mundo (e segue tentando em segundo plano)
  async startWorldLink() {
    const host = ['0.0.0.0', '::', ''].includes(this.opts.host) ? '127.0.0.1' : this.opts.host;
    this.zoneId = this.opts.zoneId ?? `zona-${this.port}`;
    this.publicUrl = this.opts.publicUrl ?? `${this.tls ? 'wss' : 'ws'}://${host}:${this.port}`;
    Object.assign(this.world, { zoneId: this.zoneId, publicUrl: this.publicUrl, maps: [...this.hosted] });
    this.world.start();
    const ok = await this.world.ready(this.opts.worldWaitMs);
    this.log(ok ? `zona ${this.zoneId} registrada no mundo (${this.opts.world}): ${[...this.hosted].join(', ')}; clientes chegam por ${this.publicUrl}`
      : `serviço de mundo (${this.opts.world}) ainda não respondeu; tentando em segundo plano`);
  }

  collectMetrics() {
    let players = 0;
    for (const z of this.zones.values()) players += z.players.size;
    const db = this.store.dbStats?.(); // só no PostgreSQL: tempo parado na ponte síncrona
    return this.metrics.snapshot({ players, sessions: this.sessions.size, zones: this.zones.size, tickHz: this.opts.tickHz,
      maxPlayers: this.opts.maxPlayers, fullRefusals: this.fullRefusals ?? 0, ...(db ? { db } : {}) });
  }

  // Saúde (GET /health): 503 se o laço do jogo parou (último tick há mais de tickStallMs). Com o laço inteiro
  // travado nem o /health responde, e o healthcheck do Docker falha por tempo esgotado do mesmo jeito.
  health() {
    const ageMs = this.metrics.tickAgeMs();
    const ok = ageMs <= this.opts.tickStallMs;
    return { ok, lastTickAgoMs: Math.round(ageMs), ...(ok ? {} : { erro: `laço do jogo parado: último tick há ${(ageMs / 1000).toFixed(1)} s` }) };
  }

  step(dt) {
    const t0 = performance.now();
    this.world?.check(); // várias zonas: depois de um travamento, a cerca vem antes de qualquer lógica do jogo
    for (const [key, z] of this.zones) {
      // tempo jogado (tempo de jogo, para a telemetria de progressão)
      for (const p of z.players.values()) p.char.playedS = (p.char.playedS ?? 0) + dt / 1000;
      z.tick(dt);
      if (z.players.size) this.sendSnapshots(key, z);
    }
    this.tickTrials();
    this.tickDungeons();
    this.tickCount++;
    if (this.tickCount % this.opts.tickHz === 0) {
      for (const pid of this.parties.keys()) this.sendPartyUpdate(pid);
      if (this.world) this.worldPartyTick();
      this.trades.check();
      this.mod.sweep();
      this.pruneLimits();
    }
    this.metrics.recordTick(performance.now() - t0);
  }

  // limites por tempo (convite de grupo, senhas erradas): esquece o que já venceu
  pruneLimits(now = Date.now()) {
    for (const [id, at] of this.partyInviteAt) if (now - at >= this.opts.partyInviteGapMs) this.partyInviteAt.delete(id);
    for (const [id, list] of this.pwFails) if (!list.some((t) => now - t < PW_FAIL_WINDOW_MS)) this.pwFails.delete(id);
  }

  // Snapshot de cada jogador. Clientes que pediram "delta" no login recebem só as entidades a até
  // INTEREST_R (mais o próprio alvo) e, de cada uma, só os grupos de campos que mudaram desde o
  // último envio; quem saiu do raio vai em "gone". Posição e velocidade vão juntas e só quando a
  // previsão do cliente (última posição + velocidade × tempo) erraria mais que 10 cm. Os demais
  // clientes recebem o snapshot completo da zona.
  sendSnapshots(key, z) {
    let full = null;
    let recs = null;
    let priv = null; // entidades só do dono (resgatados do tutorial): o snapshot completo muda por jogador
    const R2 = INTEREST_R * INTEREST_R;
    for (const [charId, p] of z.players) {
      const s = this.byChar.get(charId);
      if (!s || s.ws.readyState !== 1) continue;
      if (!s.delta) {
        if (priv == null) priv = z.hasPrivate();
        if (priv) { this.rawSend(s, JSON.stringify(z.snapshot(charId)), true); continue; }
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
        if (r.owner != null && r.owner !== charId) continue;
        const dx = r.x - vx, dz = r.z - vz;
        if (dx * dx + dz * dz > R2 && r.id !== p.targetId && r.id !== p.eid && !this.ownGroupRecord(r, charId)) continue;
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

  // A escolta (ou a defesa) do próprio grupo — do dono ou de quem está no grupo que a começou, os mesmos que
  // escort.escorts() conta — vai sempre no snapshot por diferença, também além de INTEREST_R: enquanto ela
  // existe, o cliente esconde a carroça parada do objeto de missão, e ela não volta a aparecer só porque a
  // carroça da rota ficou longe (D183).
  ownGroupRecord(r, charId) {
    return !!r.grp && (r.grp.own === charId || (r.grp.pty != null && r.grp.pty === this.partyIdOf(charId)));
  }

  // A cada 10 s e no desligamento. Um lote só (uma transação no SQLite; um UPDATE numa ida e volta no
  // PostgreSQL): com a ponte síncrona, salvar um a um pararia o laço de eventos por N idas e voltas.
  saveAll() {
    if (this.world && !this.world.canSave()) return; // sem o mundo há tempo demais: as posses podem já ter sido liberadas
    const chars = [];
    for (const z of this.zones.values()) for (const p of z.players.values()) chars.push(p.char);
    if (chars.length) this.store.saveCharacters(chars);
  }

  // Desligamento gracioso: avisa todos, recusa novos logins, espera o prazo, salva e fecha.
  async shutdown(graceS = this.opts.shutdownGraceS) {
    if (this.closing) return;
    this.closing = true;
    this.world?.notify('draining'); // várias zonas: o mundo não manda mais transferências para cá
    const note = (text) => { for (const s of this.sessions) this.sendTo(s, { t: 'notice', kind: 'shutdown', text, inS: graceS }); };
    if (graceS > 0) {
      note(`O servidor vai reiniciar em ${graceS} s. Seu progresso está salvo.`);
      this.log(`desligando em ${graceS} s`);
      const step = Math.max(0, graceS - 5);
      await new Promise((r) => setTimeout(r, step * 1000));
      if (graceS > 5) note('O servidor reinicia em 5 s.');
      await new Promise((r) => setTimeout(r, Math.min(5, graceS) * 1000));
    }
    this.log('salvando e encerrando...');
    this.saveAll();
    await this.stop();
  }

  // crash: true (testes de queda) para como se o processo morresse: sem salvar e sem avisar o mundo
  async stop({ crash = false } = {}) {
    clearInterval(this.timer); clearInterval(this.saveTimer); clearInterval(this.purgeTimer); clearTimeout(this.purgeKick);
    if (crash) { this.crashed = true; this.world?.kill(); }
    for (const s of [...this.sessions]) this.dropSession(s); // salva e libera a posse de cada personagem
    if (this.world && !crash) await this.world.stop();
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
    const s = { id: randomUUID(), ws, ip, accountId: null, charId: null, role: 'player', bucket: { tokens: this.opts.rateBurst, at: performance.now(), over: 0, overAt: 0 }, chat: [], pending: false, backlog: [] };
    this.sessions.add(s);
    ws.on('message', (buf) => {
      const lag = this.lagDelay();
      if (lag > 0) this.lagQueue(s, 'in', lag, () => this.safeMessage(s, buf));
      else this.safeMessage(s, buf);
    });
    ws.on('close', () => this.dropSession(s));
    ws.on('error', () => {});
    this.sendTo(s, { t: 'hello', protocol: PROTOCOL_VERSION, server: 'cinzas-zone', version: this.serverVersion, dataVersion: this.dataVersion, auth: this.opts.auth, dev: !!this.opts.dev });
  }

  // closeAfterMs > 0: a sessão sai na hora (mapas, mundo, posse), mas o WebSocket só fecha depois, para a última
  // mensagem mandada a ela (kicked, resposta do delete_account) chegar ao cliente Godot (KICK_CLOSE_MS, D178).
  // O que ela mandar nesse meio-tempo é ignorado (onMessage confere this.sessions).
  dropSession(s, closeAfterMs = 0, code = undefined, reason = undefined) {
    if (!this.sessions.has(s)) return;
    this.sessions.delete(s);
    const n = (this.ipConns.get(s.ip) ?? 1) - 1;
    if (n <= 0) this.ipConns.delete(s.ip); else this.ipConns.set(s.ip, n);
    if (s.charId != null) this.leaveWorld(s);
    if (s.accountId != null && this.byAccount.get(s.accountId) === s) this.byAccount.delete(s.accountId);
    const close = () => { try { s.ws.close(code, reason); } catch { /* já fechado */ } };
    if (closeAfterMs > 0) setTimeout(close, closeAfterMs).unref();
    else close();
  }

  leaveWorld(s) {
    const charId = s.charId;
    this.trades.cancel(charId, 'O outro jogador saiu.');
    const key = this.charZone.get(charId);
    if (this.trials.has(key)) this.endTrial(key, false, 'Conexão perdida durante a prova.', true);
    const dg = this.dungeons.get(key);
    if (dg) {
      const c = this.zones.get(key)?.players.get(charId)?.char;
      if (c) dg.away.set(charId, { x: c.x, z: c.z, hp: c.hp, mp: c.mp, dead: c.dead, until: Date.now() + dg.f.reconnectWaitMs });
    }
    // grava ao sair, a menos que o processo "caiu" (teste), o mundo mandou soltar sem gravar ou o mundo
    // sumiu há tanto tempo que a posse pode já ser de outra zona
    const save = !this.crashed && !s.noSave && (!this.world || this.world.canSave());
    const leaving = this.zones.get(this.charZone.get(charId))?.players.get(charId);
    if (leaving) {
      // telemetria: onde e em que nível cada sessão termina (desistência = a última sessão de quem não volta)
      const c = leaving.char;
      this.audit('session_end', { charId, level: c.level, classId: c.classId, map: leaving.zone.mapId, sessionS: Math.round((c.playedS ?? 0) - (s.sessionPlayed0 ?? c.playedS ?? 0)), totalS: Math.round(c.playedS ?? 0), dead: !!c.dead });
    }
    const p = this.zones.get(this.charZone.get(charId))?.removePlayer(charId, save);
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
      else {
        // líder saiu do ar: a liderança passa a um membro on-line (senão ninguém convida nem expulsa)
        if (party && party.leader === charId) party.leader = [...party.members].find((m) => this.byChar.has(m)) ?? party.leader;
        this.sendPartyUpdate(pid);
      }
    }
    if (this.world) {
      // várias zonas: devolve a posse ao mundo (que avisa grupo e diretório)
      if (s.leaseEpoch != null) this.world.notify('release', { charId, epoch: s.leaseEpoch });
      s.leaseEpoch = null;
      this.forgetParty(charId);
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

  // Defesa em profundidade: um erro inesperado ao ler a mensagem de uma conexão derruba só aquela
  // conexão, nunca o processo (que levaria todos os jogadores e os calabouços em andamento junto).
  safeMessage(s, buf) {
    try {
      this.onMessage(s, buf);
    } catch (e) {
      this.log('erro ao ler mensagem', e);
      this.audit('message_error', { accountId: s.accountId ?? null, charId: s.charId ?? null, ip: s.ip ?? null, error: String(e?.message ?? e).slice(0, 200) });
      if (this.sessions.has(s)) { s.noSave = true; this.dropSession(s); }
    }
  }

  onMessage(s, buf) {
    this.metrics.in(buf.length);
    this.world?.check(); // (idem: nenhum comando de jogador roda sem a conferência da cerca)
    if (!this.sessions.has(s)) return;
    let msg;
    try { msg = JSON.parse(buf.toString()); } catch { msg = undefined; }
    // só objetos são pedidos: «null», números, textos e listas são recusados antes de ler qualquer campo
    if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return this.sendTo(s, { t: 'res', rid: null, ok: false, code: 'bad_json', reason: 'Mensagem inválida.' });
    const rid = typeof msg.rid === 'string' || typeof msg.rid === 'number' ? msg.rid : null;
    // acima do limite: responde ao próprio pedido (o cliente não fica esperando) sem executar
    if (!this.allowMessage(s)) return this.sendTo(s, { t: 'res', rid, req: msg.t, ok: false, code: 'rate_limited', reason: 'Muitos comandos; espere um pouco.' });
    // um pedido que espera o serviço de mundo (várias zonas) ainda em curso: os seguintes esperam, em ordem
    if (s.pending) {
      if (s.backlog.length >= 64) return this.sendTo(s, { t: 'res', rid, req: msg.t, ok: false, code: 'busy', reason: 'Aguarde: o pedido anterior ainda está em andamento.' });
      s.backlog.push(msg);
      return;
    }
    this.dispatch(s, msg);
  }

  dispatch(s, msg) {
    const rid = typeof msg.rid === 'string' || typeof msg.rid === 'number' ? msg.rid : null;
    // Pedido repetido (mesmo rid e mesmo tipo, mesmo personagem): mesma resposta, sem reexecutar.
    if (rid != null && s.charId != null) {
      const cached = this.ridCache.get(s.charId)?.get(rid);
      if (cached && cached.req === msg.t) return this.sendTo(s, { ...cached, duplicate: true });
    }
    let res, failed = false;
    try {
      res = this.handle(s, msg);
    } catch (e) {
      res = this.requestFailed(s, msg, e);
      failed = true;
    }
    if (res && typeof res.then === 'function') {
      // só no modo de várias zonas (posse, transferência e grupos passam pelo mundo)
      s.pending = true;
      res.catch((e) => { failed = true; return this.requestFailed(s, msg, e); })
        .then((r) => {
          s.pending = false;
          if (r !== undefined && this.sessions.has(s)) this.reply(s, msg, rid, r);
          if (failed) return this.dropFailed(s);
          const q = s.backlog;
          s.backlog = [];
          while (q.length && !s.pending && this.sessions.has(s)) this.dispatch(s, q.shift());
          if (q.length) s.backlog.unshift(...q);
        });
      return;
    }
    if (res === undefined) return;
    this.reply(s, msg, rid, res);
    if (failed) this.dropFailed(s);
  }

  // Pedido que lançou erro no meio (banco fora do ar, prazo da ponte, defeito): a transação foi desfeita no
  // banco, mas a memória pode ter mudado antes da falha (ouro somado, item tirado). Gravar depois levaria
  // esse estado ao banco — num saque, o ouro sem a baixa do saque, que daria para pegar de novo. Quem está
  // no mundo sai sem gravar e, ao voltar, carrega o que está no banco (o progresso até o último salvamento).
  requestFailed(s, msg, e) {
    this.log('erro ao tratar', msg.t, e);
    this.audit('request_error', { accountId: s.accountId ?? null, charId: s.charId ?? null, ip: s.ip ?? null, req: String(msg.t).slice(0, 32), error: String(e?.message ?? e).slice(0, 200) });
    return { ok: false, code: 'server_error', reason: 'Erro interno do servidor.', cache: false };
  }

  dropFailed(s) {
    if (s.charId == null || !this.sessions.has(s)) return;
    s.noSave = true;
    this.mod.kickSession(s, 'Erro no servidor ao tratar seu pedido. Para nada ficar pela metade, você saiu sem gravar o que estava em andamento: entre de novo para continuar do último salvamento.');
  }

  reply(s, msg, rid, res) {
    const after = res.after;
    delete res.after;
    if (s.charId != null && ITEM_MUTATING.has(msg.t) && this.trades.byChar.has(s.charId)) this.trades.refresh(s.charId);
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
      case 'login_transfer': return this.hLoginTransfer(s, msg);
    }
    if (s.accountId == null) return { ok: false, code: 'not_logged', reason: 'Faça login primeiro.' };
    switch (msg.t) {
      case 'list_chars': return { ok: true, chars: this.store.listCharacters(s.accountId).map(charRow), classes: this.creatableClasses() };
      case 'create_char': return this.hCreateChar(s, msg);
      case 'enter': return this.hEnter(s, msg);
      case 'delete_account': return this.hDeleteAccount(s, msg);
      case 'delete_char': return this.hDeleteChar(s, msg);
    }
    if (s.charId == null) return { ok: false, code: 'not_in_world', reason: 'Entre no mundo com um personagem primeiro.' };
    const zone = this.zoneOfChar(s.charId);
    const p = zone?.players.get(s.charId);
    if (!p) return { ok: false, code: 'not_in_world', reason: 'Personagem fora do mundo.' };
    // indo para outra zona (várias zonas): nada que mude de mapa nem abra troca ou duelo até a transferência terminar
    if (p.transferring && TRANSFER_BLOCKED.has(msg.t)) return { ok: false, code: 'busy', reason: 'Mudando de área...', cache: false };
    switch (msg.t) {
      case 'move': return this.nc(zone.cmdMove(p, msg.x, msg.z));
      case 'attack': return this.nc(zone.cmdAttack(p, msg.target));
      case 'stop': return this.nc(zone.cmdStop(p));
      case 'cast': { const r = zone.cmdCast(p, msg.skill, msg.target, msg.x, msg.z, msg.ally); r.skill = msg.skill; return this.withChar(p, r); }
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
      case 'sell': return this.hSell(p, msg);
      case 'discard': return this.hDiscard(p, msg);
      case 'quests': return { ok: true, journal: this.quests.journal(p.char), cache: false };
      case 'quest_accept': return this.hQuestAccept(p, msg);
      case 'quest_turnin': return this.hQuestTurnIn(p, msg);
      case 'quest_choice': return this.hQuestChoice(p, msg);
      case 'set_title': return this.hSetTitle(p, msg);
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
      case 'revive_ally': return this.hReviveAlly(p, msg);
      case 'report': return this.mod.report(p, msg);
      case 'bug_report': return this.mod.bugReport(p, msg);
      // lista de ignorados (por personagem)
      case 'ignore_add': return this.hIgnoreAdd(p, msg);
      case 'ignore_remove': return this.hIgnoreRemove(p, msg);
      case 'ignore_list': return this.hIgnoreList(p);
      // comércio
      case 'trade_request': return this.trades.request(p, msg.name);
      case 'trade_accept': return this.trades.accept(p, msg.from);
      case 'trade_decline': return this.trades.decline(p);
      case 'trade_offer': return this.nc(this.trades.offer(p, msg));
      case 'trade_lock': return this.nc(this.trades.lock(p));
      case 'trade_confirm': return this.nc(this.trades.confirm(p));
      case 'trade_cancel': return this.nc(this.trades.cancel(p.char.id, `${p.char.name} cancelou a troca.`));
      // clãs
      case 'clan_create': return this.clans.create(p, msg);
      case 'clan_invite': return this.clans.invite(p, msg);
      case 'clan_accept': return this.clans.accept(p, msg);
      case 'clan_decline': return this.clans.decline(p);
      case 'clan_leave': return this.clans.leave(p);
      case 'clan_kick': return this.clans.kick(p, msg);
      case 'clan_rank': return this.clans.setRank(p, msg);
      case 'clan_transfer': return this.clans.transfer(p, msg);
      case 'clan_disband': return this.clans.disband(p);
      case 'clan_motd': return this.clans.motd(p, msg);
      case 'clan_info': return { ok: true, clan: this.clans.info(p), cache: false };
      // duelo
      case 'duel_request': {
        const tid = typeof msg.name === 'string' ? this.byName.get(msg.name.trim().toLowerCase()) : null;
        const t = tid != null ? zone.players.get(tid) : null;
        return zone.duels.request(p, t);
      }
      case 'duel_accept': return zone.duels.accept(p, msg.from);
      case 'duel_decline': return zone.duels.decline(p);
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
    // descrição (o quadro do alvo mostra numa linha) e a mecânica (nome e tipo) de cada espécie; model: aparência
    // própria das peças da prova de classe (pilar, boneco, alvo, sino, atirador, perseguidor)
    const monsters = Object.fromEntries(Object.entries(d.monsters).map(([id, m]) => [id, { name: m.name, level: m.level, family: m.family, rank: m.rank, aggro: m.aggro, description: m.description, mechanic: m.mechanic ? { id: m.mechanic.id, name: m.mechanic.name, kind: m.mechanic.kind } : null, ...(m.model ? { model: m.model } : {}) }]));
    const maps = Object.fromEntries(Object.entries(d.maps).filter(([, m]) => m.size).map(([id, m]) => [id, { id, ...m }]));
    const quests = Object.fromEntries(Object.entries(d.quests).map(([id, q]) => [id, { title: q.title, chapter: q.chapter, level: q.level }]));
    return {
      t: 'defs', items: d.items, classes: d.classes, skills: d.skills, attributes: d.attributes, rarities: d.rarities, slots: d.slots,
      families: d.families, monsters, xp: d.xp.cumulative, levelCap: d.levelCap, skillRules: d.skillRules, origins: d.origins,
      enhance: { weaponDamagePct: d.formulas.enhance.weaponDamagePct ?? 0, defensePct: d.formulas.defense.enhancePct ?? 0 },
      maps, map: maps[DEFAULT_MAP], quests,
    };
  }

  // ---------- autenticação e personagens ----------
  // Senha da própria conta conferida fora da thread do jogo (scrypt assíncrono; o dispatch espera a promessa
  // com a sessão em s.pending): no máximo PW_FAIL_MAX erradas por conta a cada 10 min — depois, recusa sem
  // nem calcular (D144). Devolve { acc } ou { err } (resposta de recusa).
  async checkAccountPassword(s, password, req) {
    const acc = this.store.findAccountById(s.accountId);
    if (!acc) return { err: { ok: false, code: 'bad_password', reason: 'Senha incorreta.' } };
    const recent = (now) => (this.pwFails.get(acc.id) ?? []).filter((t) => now - t < PW_FAIL_WINDOW_MS);
    const now = Date.now();
    const fails = recent(now);
    if (fails.length >= PW_FAIL_MAX) {
      const min = Math.max(1, Math.ceil((fails[0] + PW_FAIL_WINDOW_MS - now) / 60_000));
      return { err: { ok: false, code: 'too_many', reason: `Senha errada vezes demais. Tente de novo em ${min} min.` } };
    }
    if (typeof password !== 'string' || !password) return { err: { ok: false, code: 'bad_password', reason: 'Digite a senha da conta.' } };
    if (await this.store.checkPasswordAsync(acc, password)) {
      this.pwFails.delete(acc.id);
      return { acc };
    }
    const list = recent(Date.now());
    list.push(Date.now());
    this.pwFails.set(acc.id, list);
    this.audit('password_fail', { accountId: acc.id, ip: s.ip, req });
    return { err: { ok: false, code: 'bad_password', reason: list.length >= PW_FAIL_MAX ? 'Senha incorreta. Espere 10 minutos para tentar de novo.' : 'Senha incorreta.' } };
  }

  // Exclusão da própria conta (privacidade), confirmada com a senha; fora do mundo.
  async hDeleteAccount(s, { password }) {
    const busy = () => {
      if (s.charId != null) return { ok: false, code: 'in_world', reason: 'Saia do mundo antes de excluir a conta.' };
      if (this.world && this.store.listCharacters(s.accountId).some((c) => this.isOnline(c.id))) return { ok: false, code: 'in_world', reason: 'Um personagem desta conta ainda está no mundo. Saia dele antes de excluir a conta.' };
      return null;
    };
    const before = busy();
    if (before) return before;
    const chk = await this.checkAccountPassword(s, password, 'delete_account');
    if (chk.err) return chk.err;
    if (!this.sessions.has(s) || s.accountId !== chk.acc.id) return undefined; // a conexão caiu enquanto conferia
    const after = busy();
    if (after) return after;
    const acc = chk.acc;
    const gone = this.store.listCharacters(acc.id).map((c) => ({ charId: c.id, name: c.name, clan: this.store.clanOfChar(c.id) }));
    const n = this.store.deleteAccount(acc.id);
    for (const g of gone) this.afterCharGone(g.charId, g.name, g.clan);
    this.audit('account_deleted', { accountId: acc.id, ip: s.ip, characters: n });
    this.log(`conta excluída: ${acc.id} (${n} personagens)`);
    return { ok: true, after: () => this.dropSession(s, KICK_CLOSE_MS) }; // a resposta chega antes do fechamento
  }

  // Exclusão de um personagem (a conta continua), confirmada com a senha; só na tela de personagens (D144).
  // Mesma limpeza da exclusão de conta para ele: troca e convites cancelados, saída do grupo e do clã (o clã
  // que ele liderava passa para quem tem o maior cargo; vazio, acaba), itens, missões e ignorados apagados e
  // o nome liberado. As peças que ele guardou no depósito da conta continuam lá.
  async hDeleteChar(s, { charId, password }) {
    if (s.charId != null) return { ok: false, code: 'in_world', reason: 'Saia do mundo antes de excluir um personagem.' };
    const row = Number.isInteger(charId) ? this.store.listCharacters(s.accountId).find((c) => c.id === charId) : null;
    if (!row) return { ok: false, code: 'bad_char', reason: 'Personagem não encontrado nesta conta.' };
    const inWorld = { ok: false, code: 'in_world', reason: `${row.name} ainda está no mundo. Saia dele antes de excluir.` };
    if (this.isOnline(charId)) return inWorld;
    const chk = await this.checkAccountPassword(s, password, 'delete_char');
    if (chk.err) return chk.err;
    if (!this.sessions.has(s) || s.accountId !== chk.acc.id) return undefined; // a conexão caiu enquanto conferia
    if (s.charId != null || this.isOnline(charId)) return inWorld;
    const clan = this.store.clanOfChar(charId);
    const name = this.store.deleteCharacter(s.accountId, charId);
    if (!name) return { ok: false, code: 'bad_char', reason: 'Personagem não encontrado nesta conta.' };
    this.afterCharGone(charId, name, clan);
    this.audit('char_deleted', { accountId: s.accountId, charId, ip: s.ip, name, clan: clan?.id ?? null });
    this.log(`personagem excluído: ${name} (conta ${s.accountId})`);
    return { ok: true, deleted: charId, name, chars: this.store.listCharacters(s.accountId).map(charRow), classes: this.creatableClasses(), cache: false };
  }

  // Personagem excluído (sozinho ou com a conta): o que a memória do servidor ainda guardava dele sai (troca,
  // convites, grupo, falas guardadas para denúncias, ignorados dos outros), e o clã fica sabendo da saída e,
  // se ele liderava, de quem é o novo líder.
  afterCharGone(charId, name, clan) {
    this.trades.cancel(charId, 'O outro jogador saiu.');
    const dropInvites = (map) => { map.delete(charId); for (const [k, inv] of map) if (inv.from === charId) map.delete(k); };
    dropInvites(this.trades.invites);
    dropInvites(this.invites);
    dropInvites(this.clans.invites);
    for (const z of this.zones.values()) {
      dropInvites(z.duels.invites);
      for (const q of z.players.values()) q.char.ignored?.delete(charId);
    }
    for (const dg of this.dungeons.values()) dg.away.delete(charId);
    if (this.world) this.world.request('party_leave', { charId }).catch(() => {});
    else if (this.charParty.has(charId)) this.removeFromParty(charId);
    this.partyInviteAt.delete(charId);
    this.ridCache.delete(charId);
    this.mod.forget(charId);
    if (!clan) return;
    const now = this.store.clanById(clan.id);
    if (!now) return; // era o último membro: o clã acabou
    this.clans.refreshOnline(clan.id);
    this.clans.notifyClan(clan.id, { t: 'clan_event', text: `${name} saiu do clã.` });
    if (clan.rank === 'leader' && now.leader_char_id !== charId) {
      const lead = this.store.clanMembers(clan.id).find((m) => m.char_id === now.leader_char_id);
      if (lead) this.clans.notifyClan(clan.id, { t: 'clan_event', text: `${lead.name} é o novo líder do clã.` });
    }
  }

  hRegister(s, { account, password }) {
    if (typeof account !== 'string' || !/^[a-zA-Z0-9_]{3,20}$/.test(account)) return { ok: false, code: 'bad_account', reason: 'Conta: 3 a 20 letras, números ou _.' };
    // prefixos da exclusão reservados, como no serviço de contas (D178)
    if (DELETED_PREFIX_RE.test(account)) return { ok: false, code: 'bad_account', reason: 'Esse nome de conta é reservado. Escolha outro.' };
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
    const ban = banMessage(acc);
    if (ban) { this.audit('login_banned', { accountId: acc.id, ip: s.ip, via }); return { ok: false, code: 'banned', reason: ban }; }
    const old = this.byAccount.get(acc.id);
    if (old) {
      // Reconexão: a sessão antiga (talvez "pendurada") é encerrada e salva antes de continuar; o WebSocket dela
      // fecha um pouco depois, para o aviso chegar também a quem está na tela de personagens
      this.sendTo(old, { t: 'kicked', reason: 'Sua conta entrou em outra conexão.' });
      this.dropSession(old, KICK_CLOSE_MS);
    }
    s.accountId = acc.id;
    s.role = acc.role ?? 'player';
    this.mod.onLogin(s, acc);
    s.delta = msg.delta === true; // cliente entende snapshots por diferença
    this.audit('login', { accountId: acc.id, ip: s.ip, via });
    this.byAccount.set(acc.id, s);
    this.sendTo(s, this.defsPayload());
    return { ok: true, account: acc.name, chars: this.store.listCharacters(acc.id).map(charRow), classes: this.creatableClasses() };
  }

  // Conta excluída fora deste servidor (serviço de contas, ferramenta) com a sessão ainda aberta aqui: a varredura
  // de cada minuto a derruba; até lá, nada de criar personagem nem entrar (D178).
  accountGone(s) {
    if (this.store.findAccountById(s.accountId)) return null;
    return { ok: false, code: 'account_deleted', reason: 'Esta conta foi excluída.' };
  }

  hCreateChar(s, { name: rawName, classId }) {
    const gone = this.accountGone(s);
    if (gone) return gone;
    // formato, prefixos da exclusão, palavras da equipe (D145) e duplicata por maiúscula acentuada
    const v = checkCharName(this.store, rawName);
    if (v.err) return v.err;
    const name = v.name;
    const cls = Object.hasOwn(this.data.classes, classId) ? this.data.classes[classId] : null;
    if (!cls) return { ok: false, code: 'bad_class', reason: 'Classe inexistente.' };
    if (!['M1', 'M2'].includes(cls.implementedIn)) return { ok: false, code: 'class_locked', reason: `${cls.name} ainda não está disponível.` };
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

  // Teto de jogadores (--max-players ou CINZAS_MAX_PLAYERS; 0 = sem limite). Conta os personagens de jogadores
  // no mundo: os desta zona e, com várias zonas, os das outras que o mundo anuncia (lá o papel não vem junto:
  // contam todos). Mestres (gm, admin) entram com o servidor cheio e não ocupam vaga — um moderador entrando não
  // impede a reconexão de ninguém. Quem já está no mundo não conta duas vezes (reconexão: a sessão antiga cai e
  // o personagem volta). Transferência entre zonas não passa por aqui: o personagem já estava no mundo.
  serverFull(s, charId) {
    const max = this.opts.maxPlayers;
    if (!(max > 0) || s.role === 'gm' || s.role === 'admin' || this.isOnline(charId)) return null;
    let online = this.remote?.size ?? 0;
    for (const other of this.byChar.values()) if (other.role !== 'gm' && other.role !== 'admin') online++;
    if (online < max) return null;
    this.fullRefusals = (this.fullRefusals ?? 0) + 1;
    const now = Date.now();
    if (!(now - (this.fullLoggedAt ?? 0) < 60_000)) { // no máximo uma linha por minuto no registro
      this.fullLoggedAt = now;
      this.log(`teto de jogadores atingido (${online}/${max}): entradas recusadas com server_full (${this.fullRefusals} desde a subida)`);
    }
    return { ok: false, code: 'server_full', reason: `Servidor cheio (${max} jogadores). Tente de novo em alguns minutos.` };
  }

  hEnter(s, { charId }) {
    if (s.charId != null) return { ok: false, code: 'already', reason: 'Você já está no mundo.' };
    const gone = this.accountGone(s);
    if (gone) return gone;
    const row = this.store.listCharacters(s.accountId).find((c) => c.id === charId);
    if (!row) return { ok: false, code: 'bad_char', reason: 'Personagem não encontrado nesta conta.' };
    const full = this.serverFull(s, charId);
    if (full) return full;
    if (this.world) return this.enterViaWorld(s, row);
    const prev = this.byChar.get(charId);
    if (prev) this.dropSession(prev);
    return this.enterChar(s, this.store.loadCharacter(charId));
  }

  // Coloca no mundo um personagem já carregado do banco (entrada normal ou chegada por transferência).
  // leaseEpoch: posse concedida pelo serviço de mundo (várias zonas).
  enterChar(s, char, leaseEpoch = null) {
    const charId = char.id;
    this.quests.load(char);
    // o Mapa da Estrada Velha para quem entregou o tutorial antes de ele dar o mapa (D166)
    for (const defId of this.quests.grantMissingQuestItems(char)) this.log(`item de missão entregue na entrada: ${defId} para ${char.name}`);
    this.clans.attach(char);
    // marca [Equipe] pelo papel da conta (relido a cada minuto) e a lista de ignorados do personagem (D145)
    char.staff = STAFF_ROLES.has(s.role);
    char.ignored = new Set(this.store.listIgnored(charId).map((r) => r.ignored_id));
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
    s.sessionPlayed0 = char.playedS ?? 0; // telemetria: duração da sessão (session_end)
    s.known = new Map(); s.knownFull = true;
    this.byChar.set(charId, s);
    this.byName.set(char.name.toLowerCase(), charId);
    this.charZone.set(charId, zone.key);
    this.log(`entrou: ${char.name} nv${char.level} em ${zone.mapId}${wasDead ? ' (estava caído: restaurado no posto)' : ''}`);
    this.broadcastZone(zone.key, { t: 'joined', eid: p.eid, name: char.name });
    const pid = this.partyIdOf(charId); // (várias zonas: o grupo vem do mundo e já está na cópia daqui)
    if (pid) this.sendPartyUpdate(pid);
    if (this.world) {
      s.leaseEpoch = leaseEpoch;
      this.world.notify('online', { charId, name: char.name, mapId: zone.mapId, state: this.memberSummary(p) });
    }
    return { ok: true, char: zone.charView(p), snapshot: zone.snapshot(charId), loot: this.lootFor(charId, zone.mapId), journal: this.quests.journal(char), restoredFromDeath: wasDead && !back, rejoinedDungeon: !!back, cache: false };
  }

  // ---------- várias zonas: entrada, chegada e saída por transferência ----------
  // Entrada (várias zonas): pede a posse ao mundo (que derruba o personagem de outra zona, salvo, se
  // preciso), lê o personagem do banco e entra aqui se o mapa é desta zona; se não, devolve um token
  // de transferência para o cliente ir à zona certa (sem carregar nada aqui).
  async enterViaWorld(s, row) {
    const charId = row.id;
    if (this.closing) return { ok: false, code: 'closing', reason: 'O servidor está reiniciando. Tente em instantes.' };
    const prev = this.byChar.get(charId);
    if (prev) this.dropSession(prev); // a sessão antiga nesta zona sai antes (salva e devolve a posse)
    const r = await this.world.request('acquire', { charId, accountId: s.accountId, name: row.name, mapId: row.map_id }, this.world.downMs * 2 + 10000);
    if (!r.ok) return { ok: false, code: r.code ?? 'busy', reason: r.reason, cache: false };
    // outra entrada (outra zona) pediu o personagem antes de ele carregar aqui: a posse já foi devolvida
    if (this.leaseRevoked(r.epoch)) return { ok: false, code: 'kicked', reason: 'Sua conta entrou em outra conexão.', cache: false };
    const release = () => this.world.notify('release', { charId, epoch: r.epoch });
    if (!this.sessions.has(s) || s.charId != null) { release(); return undefined; } // a conexão caiu enquanto esperava
    const other = this.byChar.get(charId);
    if (other) this.dropSession(other);
    const char = this.store.loadCharacter(charId); // do banco: quem tinha o personagem já salvou
    if (!char) { release(); return { ok: false, code: 'bad_char', reason: 'Personagem não encontrado nesta conta.', cache: false }; }
    const mapId = this.openMap(char.mapId) ? char.mapId : DEFAULT_MAP;
    if (this.zones.has(mapId)) return this.enterChar(s, char, r.epoch);
    if (mapId !== char.mapId) {
      // mapa salvo que não existe mais: vai para o início da Estrada Velha, na zona que a hospeda
      const sp = this.data.maps[mapId].spawnPoint;
      char.mapId = mapId; char.x = sp.x; char.z = sp.z;
      this.store.saveCharacter(char);
    }
    const t = await this.world.request('transfer', { charId, epoch: r.epoch, mapId, x: char.x, z: char.z, saved: true, chat: this.mod.chatLog.get(charId) ?? null });
    if (!t.ok) {
      release();
      const reason = t.code === 'zone_down' ? `${this.data.maps[mapId]?.name ?? mapId} está fora do ar no momento. Tente em instantes.` : t.reason;
      return { ok: false, code: t.code ?? 'zone_down', reason, cache: false };
    }
    this.audit('transfer', { accountId: s.accountId, charId, from: this.zoneId, to: t.to, mapId, via: 'enter' });
    return { ok: true, transfer: { url: t.url, token: t.token, mapId }, cache: false };
  }

  // Chegada por transferência (conexão nova, antes de qualquer login): confere o token assinado pelo
  // mundo (validade de 30 s, para esta zona, uso único), confirma a posse e carrega o personagem do
  // banco, que a zona de origem acabou de gravar. Responde como o "enter" e deixa a sessão logada.
  async hLoginTransfer(s, msg) {
    if (s.accountId != null) return { ok: false, code: 'already', reason: 'Sessão já autenticada.' };
    if (!this.world) return { ok: false, code: 'no_transfer', reason: 'Este servidor não recebe transferências.' };
    if (this.closing) return { ok: false, code: 'closing', reason: 'O servidor está reiniciando. Tente em instantes.' };
    const p = verifyToken(msg.token, this.opts.worldSecret);
    if (!p || p.typ !== 'transfer' || !Number.isInteger(p.charId) || typeof p.mapId !== 'string') {
      this.audit('login_fail', { ip: s.ip, via: 'transfer' });
      return { ok: false, code: 'bad_token', reason: 'Transferência inválida ou vencida. Entre de novo.' };
    }
    if (p.to !== this.zoneId || !this.zones.has(p.mapId)) return { ok: false, code: 'wrong_zone', reason: 'Esta transferência é para outra zona.' };
    if (!this.transferReplay.use(p)) {
      this.audit('login_fail', { ip: s.ip, via: 'transfer', charId: p.charId });
      return { ok: false, code: 'bad_token', reason: 'Transferência já usada. Entre de novo.' };
    }
    // recusa depois de conferir o token: o mundo libera o personagem (a origem já o gravou)
    const abort = (res) => { this.world.notify('transfer_abort', { charId: p.charId, jti: p.jti }); return res; };
    let acc = this.store.findAccountById(p.accountId);
    const row = acc ? this.store.listCharacters(acc.id).find((c) => c.id === p.charId) : null;
    if (!row) return abort({ ok: false, code: 'bad_char', reason: 'Personagem indisponível.' });
    // moderação: conta suspensa não entra nem por transferência (a suspensão pode ter vindo no caminho)
    const banned = (a) => {
      const ban = banMessage(a);
      if (ban) this.audit('login_banned', { accountId: a.id, ip: s.ip, via: 'transfer' });
      return ban ? { ok: false, code: 'banned', reason: ban } : null;
    };
    const b1 = banned(acc);
    if (b1) return abort(b1);
    // (nenhuma sessão daqui cai antes de o mundo confirmar a transferência: um token assinado mas já
    // ultrapassado não derruba quem entrou depois dele)
    // recados para ele que chegarem enquanto a posse é confirmada ficam guardados (saem depois da resposta)
    const early = [];
    this.arriving.set(p.charId, early);
    let r;
    try {
      r = await this.world.request('acquire', { charId: p.charId, accountId: acc.id, name: row.name, mapId: p.mapId, transfer: { jti: p.jti, from: p.from } }, this.world.downMs * 2 + 10000);
    } finally {
      if (this.arriving.get(p.charId) === early) this.arriving.delete(p.charId);
    }
    if (!r.ok) return { ok: false, code: r.code ?? 'busy', reason: r.reason };
    // outra entrada pediu o personagem antes de ele carregar aqui: a posse já foi devolvida (onWorldKick)
    if (this.leaseRevoked(r.epoch)) return { ok: false, code: 'kicked', reason: 'Sua conta entrou em outra conexão.' };
    if (!this.sessions.has(s) || s.accountId != null) { this.world.notify('release', { charId: p.charId, epoch: r.epoch }); return undefined; }
    acc = this.store.findAccountById(acc.id) ?? acc; // dados frescos: suspensão e silêncio podem ter mudado na espera
    const b2 = banned(acc);
    if (b2) { this.world.notify('release', { charId: p.charId, epoch: r.epoch }); return b2; }
    const other = this.byChar.get(p.charId);
    if (other) {
      // não deveria existir (a posse era da origem): a cópia daqui sai sem gravar por cima do que a origem gravou
      this.log(`chegada de ${row.name}: cópia antiga nesta zona descartada sem gravar`);
      other.noSave = true;
      this.sendTo(other, { t: 'kicked', reason: 'Sua conta entrou em outra conexão.' });
      this.dropSession(other);
    }
    const old = this.byAccount.get(acc.id);
    if (old && old !== s) { this.sendTo(old, { t: 'kicked', reason: 'Sua conta entrou em outra conexão.' }); this.dropSession(old); }
    s.accountId = acc.id;
    s.role = acc.role ?? 'player';
    this.mod.onLogin(s, acc); // o silêncio acompanha a conta
    s.delta = msg.delta === true;
    this.byAccount.set(acc.id, s);
    this.audit('login', { accountId: acc.id, ip: s.ip, via: 'transfer', from: p.from, charId: p.charId });
    if (r.chat) this.mod.adopt(p.charId, r.chat); // falas recentes vêm junto (contexto de denúncias)
    const char = this.store.loadCharacter(p.charId);
    if (!this.zones.has(char.mapId)) { char.mapId = p.mapId; char.x = p.x; char.z = p.z; }
    const res = this.enterChar(s, char, r.epoch);
    const np = this.playerOf(p.charId);
    if (r.timers && np) {
      // recargas e tônico que vieram da zona de origem (tempo restante)
      for (const [k, ms] of Object.entries(r.timers.cd ?? {})) np.cooldowns[k] = np.zone.now + ms;
      np.potionReadyAt = np.zone.now + (r.timers.potion || 0);
      res.char = np.zone.charView(np);
    }
    // depois da resposta: o que o mundo guardou durante a viagem e o que chegou enquanto a posse era confirmada
    const mail = [...(r.inbox ?? []), ...early];
    return { ...res, account: acc.name, transferred: true, dataVersion: this.dataVersion,
      after: mail.length ? () => { for (const it of mail) this.onWorldDeliver({ charId: p.charId, msg: it.msg, note: it.note }); } : undefined };
  }

  // Leva o personagem para um mapa de outra zona: cancela troca e duelo, pede o token ao mundo (a
  // posse fica "em transferência" para a zona de destino por 30 s), grava o personagem já na posição
  // de destino, tira daqui e manda o cliente se conectar lá com { t:'transfer', url, token, mapId }.
  async transferOut(p, mapId, x, z) {
    const charId = p.char.id;
    const s = this.byChar.get(charId);
    if (!s || p.transferring || !this.world) return false;
    p.transferring = true;
    this.trades.cancel(charId, 'Troca cancelada: troca de mapa.');
    p.zone.duels.forfeit(charId);
    const r = await this.world.request('transfer', { charId, epoch: s.leaseEpoch, mapId, x, z });
    p.transferring = false;
    // sem resposta a tempo, o mundo pode ter marcado a transferência mesmo assim: desfeita na hora
    // (senão a posse ficaria "em transferência" por 30 s, com recados guardados e grupo recusando)
    const maybe = r.ok || r.code === 'world_timeout';
    if (this.byChar.get(charId) !== s || this.playerOf(charId) !== p) {
      // saiu ou mudou de mapa enquanto esperava: se ainda está aqui, a posse volta a ser desta zona
      if (maybe && this.byChar.has(charId)) this.world.notify('transfer_cancel', { charId, mapId: this.playerOf(charId)?.zone.mapId });
      return false;
    }
    if (!r.ok) {
      if (maybe) this.world.notify('transfer_cancel', { charId, mapId: p.zone.mapId });
      const name = this.data.maps[mapId]?.name ?? mapId;
      this.sendTo(s, { t: 'system', text: r.code === 'zone_down' ? `${name} está fora do ar no momento. Tente em instantes.` : r.reason });
      return false;
    }
    this.trades.cancel(charId, 'Troca cancelada: troca de mapa.'); // (uma aberta durante a espera)
    const zone = p.zone, c = p.char;
    zone.removePlayer(charId, false);
    this.broadcastZone(zone.key, { t: 'left', eid: p.eid });
    this.charZone.delete(charId);
    this.byChar.delete(charId);
    this.byName.delete(c.name.toLowerCase());
    c.mapId = mapId; c.x = x; c.z = z;
    delete c.saveMapId; delete c.saveX; delete c.saveZ;
    this.store.saveCharacter(c);
    // gravado e fora daqui: só agora a posse pode seguir para o destino (ou para um login direto). As
    // recargas e o tônico vão junto como tempo restante (como na troca de mapa dentro do processo).
    const timers = {
      cd: Object.fromEntries(Object.entries(p.cooldowns).map(([k, t]) => [k, Math.round(t - zone.now)]).filter(([, ms]) => ms > 0)),
      potion: Math.max(0, Math.round((p.potionReadyAt || 0) - zone.now)),
    };
    this.world.notify('transfer_saved', { charId, jti: r.jti, chat: this.mod.chatLog.get(charId) ?? null, timers });
    s.charId = null;
    s.leaseEpoch = null;
    this.forgetParty(charId);
    this.audit('transfer', { accountId: s.accountId, charId, from: this.zoneId, to: r.to, mapId });
    this.log(`transferido: ${c.name} para ${mapId} (zona ${r.to})`);
    this.sendTo(s, { t: 'transfer', url: r.url, token: r.token, mapId });
    // o cliente fecha esta conexão e abre a da outra zona; se não fechar, fecha depois de um tempo
    setTimeout(() => { if (this.sessions.has(s) && s.charId == null) this.dropSession(s); }, 15000).unref();
    return true;
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
    this.trades.cancel(charId, 'Troca cancelada: troca de mapa.');
    from.removePlayer(charId, false);
    this.broadcastZone(fromKey, { t: 'left', eid: p.eid });
    p.char.x = x; p.char.z = z;
    const np = dest.addPlayer(p.char);
    // recargas e tônico seguem como TEMPO RESTANTE: cada zona tem o próprio relógio (uma instância nova
    // começa em 0), então copiar os instantes absolutos travava habilidades por minutos ou dias
    np.cooldowns = Object.fromEntries(Object.entries(p.cooldowns).map(([k, t]) => [k, dest.now + Math.max(0, t - from.now)]).filter(([, t]) => t > dest.now));
    np.potionReadyAt = dest.now + Math.max(0, (p.potionReadyAt || 0) - from.now);
    this.charZone.set(charId, destKey);
    const sess = this.byChar.get(charId);
    if (sess) { sess.known = new Map(); sess.knownFull = true; }
    if (!dest.instanceId) { delete p.char.saveMapId; delete p.char.saveX; delete p.char.saveZ; }
    this.store.saveCharacter(p.char);
    this.broadcastZone(destKey, { t: 'joined', eid: np.eid, name: p.char.name });
    this.sendTo(this.byChar.get(charId), { t: 'zone', mapId: dest.mapId, instance: dest.instanceId, char: dest.charView(np), snapshot: dest.snapshot(charId), loot: this.lootFor(charId, dest.mapId) });
    this.notifyQuests(np, this.quests.onEnterMap(p.char, dest.mapId));
    this.world?.notify('moved', { charId, mapId: dest.mapId });
    return np;
  }

  hPortal(s, p, { portal }) {
    const r = p.zone.cmdPortal(p, portal);
    if (!r.ok) return r;
    if (!this.zones.has(r.to)) {
      if (this.world && this.openMap(r.to)) return this.remoteMove(p, r.to, r.x, r.z);
      return { ok: false, code: 'closed', reason: 'Esta área ainda não está aberta.' };
    }
    return { ok: true, to: r.to, cache: false, after: () => this.moveToZone(p, r.to, r.x, r.z) };
  }

  // várias zonas: o mapa é de outra zona (portal ou teleporte de mestre)
  remoteMove(p, mapId, x, z) {
    if (!this.remoteMaps.get(mapId)?.up) return { ok: false, code: 'zone_down', reason: `${this.data.maps[mapId]?.name ?? mapId} está fora do ar no momento. Tente em instantes.` };
    return { ok: true, to: mapId, transfer: true, cache: false, after: () => { this.transferOut(p, mapId, x, z).catch((e) => this.log('transferência falhou', e)); } };
  }

  // ---------- NPCs, objetos, loja e missões ----------
  hTalk(p, { npc }) {
    const n = p.zone.npcNear(p, npc);
    if (!n) return { ok: false, code: 'too_far', reason: 'Chegue mais perto para conversar.' };
    const changed = this.quests.onTalk(p.char, n.id);
    this.notifyQuests(p, changed);
    const shop = n.role === 'armorer' ? this.armorCatalog(p.char).map((defId) => ({ defId, price: this.gearPriceOf(defId), gear: true }))
      : (n.role === 'shop' || n.role === 'smith') && n.shop ? n.shop.map((defId) => ({ defId, price: this.priceOf(defId) })) : undefined;
    const trialAvailable = n.role === 'master' && n.classId === p.char.classId && p.char.quests.get('c3_trial')?.state === 'active' && !p.char.trialDone && p.char.level >= 10;
    const choice = this.quests.pendingChoice(p.char, n.id) ?? undefined;
    return { ok: true, npc: { id: n.id, name: n.name, role: n.role, classId: n.classId ?? null }, quests: this.quests.npcQuests(p.char, n.id), shop, trialAvailable, trial: trialAvailable ? this.trialBrief(p.char.classId) : undefined, choice, cache: false };
  }

  // O que o mestre conta da prova antes de começar (título, objetivo, dica, tempo e a habilidade emprestada).
  trialBrief(classId) {
    const cfg = this.data.maps.arena_prova?.trial?.classes?.[classId];
    if (!cfg) return undefined;
    const skill = this.data.classes[classId].skills.find((s) => this.data.skills[s].unlockLevel === 10);
    return { kind: cfg.kind, title: cfg.title, objective: cfg.objective, hint: cfg.hint, ms: Math.min(cfg.timeMs, this.data.maps.arena_prova.trial.durationMs), skill, skillName: this.data.skills[skill]?.name };
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

  // Título mostrado acima do nome: um dos já ganhos (respostas e missões) ou nenhum.
  hSetTitle(p, { title }) {
    const c = p.char;
    if (title === null || title === '') c.title = null;
    else if (typeof title !== 'string' || !this.quests.titles(c).includes(title)) return { ok: false, code: 'bad_title', reason: 'Você ainda não ganhou esse título.' };
    else c.title = title;
    this.store.saveCharacter(c);
    return { ok: true, title: c.title ?? null, char: p.zone.charView(p), cache: false };
  }

  hInteract(p, { object }) {
    const o = p.zone.objectNear(p, object);
    if (!o) return { ok: false, code: 'too_far', reason: 'Chegue mais perto.' };
    if (o.kind === 'dungeon') return this.hDungeonEnter(null, p, { object: o.id });
    // quadro de missões das cidades: o que dá para aceitar agora no mundo inteiro, com nível, NPC e mapa
    if (o.kind === 'board') return { ok: true, object: o.id, board: this.quests.board(p.char), cache: false };
    if (o.kind === 'defense') {
      if (!this.quests.hasPending(p.char, 'defend', (x) => x.defense === o.defense)) return { ok: false, code: 'nothing', reason: 'A válvula está fechada. Fale com Joca antes de mexer nela.' };
      const r = p.zone.startDefense(o.defense, p);
      if (!r.ok) return r;
      return { ok: true, object: o.id, escort: r.escort.eid, defense: true, already: !!r.already, cache: false };
    }
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
  hEnhance(p, { npc, instance, protect = false }, apply) {
    const n = p.zone.npcNear(p, npc);
    if (!n || n.role !== 'smith') return { ok: false, code: 'too_far', reason: 'Chegue mais perto do ferreiro.' };
    const c = p.char;
    const it = c.items.get(instance);
    if (!it || (it.loc !== 'bag' && it.loc !== 'equip')) return { ok: false, code: 'not_found', reason: 'Item não encontrado com você.' };
    const def = this.data.items[it.defId];
    if (!enhanceable(def)) return { ok: false, code: 'not_enhanceable', reason: `${def.name} não pode ser refinado.` };
    const q = enhanceQuote(def, it.enh || 0, this.data);
    if (!q) return { ok: false, code: 'max', reason: `${def.name} já está em +${it.enh}, o máximo.` };
    const preview = enhancePreview(def, it.enh || 0, this.data);
    const countOf = (defId) => [...c.items.values()].filter((x) => x.loc === 'bag' && x.defId === defId).reduce((s, x) => s + x.qty, 0);
    const have = countOf(q.material);
    const protectHave = q.protectItem ? countOf(q.protectItem) : 0;
    const quote = { ...q, preview, materialHave: have, goldHave: c.gold, protectHave, materialName: this.data.items[q.material].name, cache: false };
    if (!apply) return { ok: true, ...quote };
    if (c.gold < q.gold) return { ok: false, code: 'no_gold', reason: `Ouro insuficiente: ${q.gold} necessário, você tem ${c.gold}.`, ...quote };
    const matName = this.data.items[q.material].name;
    if (have < q.materialQty) return { ok: false, code: 'no_material', reason: `${matName} insuficiente: ${q.materialQty} necessário, você tem ${have}.`, ...quote };
    const useProtect = !!protect && q.downgradeOnFail;
    if (useProtect && protectHave < 1) return { ok: false, code: 'no_protect', reason: `Você não tem ${this.data.items[q.protectItem].name}.`, ...quote };
    const r = rollEnhance(this.refineRng, q.chancePct);
    const before = it.enh || 0;
    const out = enhanceOutcome(before, r.success, q, useProtect);
    const consume = (defId, qty) => {
      let left = qty;
      for (const x of [...c.items.values()]) {
        if (left <= 0 || x.loc !== 'bag' || x.defId !== defId) continue;
        const take = Math.min(left, x.qty);
        x.qty -= take; left -= take;
        if (x.qty <= 0) { c.items.delete(x.id); this.store.deleteItem(c.id, x.id); } else this.store.saveItems(c.id, [x]);
      }
    };
    this.store.tx(() => {
      c.gold -= q.gold;
      consume(q.material, q.materialQty);
      if (out.protectUsed) consume(q.protectItem, 1);
      if (out.enh !== before) { it.enh = out.enh; this.store.saveItems(c.id, [it]); }
      this.store.saveCharacter(c);
    });
    if (it.loc === 'equip') p.zone.recalc(p);
    this.audit('enhance', { charId: c.id, instance: it.id, item: it.defId, success: r.success, from: before, enh: it.enh || 0, protectUsed: out.protectUsed, gold: q.gold, goldAfter: c.gold });
    let message;
    if (r.success) message = `${def.name} agora é +${it.enh}.`;
    else if (out.downgraded) message = `O refino falhou (rolagem ${r.roll} ≥ ${q.chancePct}%). ${def.name} caiu para +${it.enh || 0}; ouro e materiais foram gastos.`;
    else if (out.protectUsed) message = `O refino falhou (rolagem ${r.roll} ≥ ${q.chancePct}%). O Selo de Proteção segurou ${def.name} em +${it.enh || 0}.`;
    else message = `O refino falhou (rolagem ${r.roll} ≥ ${q.chancePct}%). ${def.name} continua em +${it.enh || 0}; ouro e materiais foram gastos.`;
    return { ok: true, success: r.success, roll: r.roll, chancePct: q.chancePct, enh: it.enh || 0, instanceId: it.id, downgraded: out.downgraded, protectUsed: out.protectUsed,
      message, char: p.zone.charView(p), cache: false };
  }

  // ---------- depósito da conta ----------
  storageNpc(p, npc) {
    const n = p.zone.npcNear(p, npc);
    return n && n.role === 'storage' ? n : null;
  }

  storageView(p) {
    // peça guardada por um personagem que foi excluído continua no depósito da conta (D144)
    const items = this.store.listAccountStorage(p.char.accountId).map((r) => ({ id: r.id, defId: r.def_id, qty: r.qty, enh: r.enh, owner: DELETED_PREFIX_RE.test(r.owner) ? 'personagem excluído' : r.owner }));
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
    // item de missão (o Mapa da Estrada Velha) é do personagem: no depósito, outro personagem da conta o pegaria
    if (this.data.items[it.defId]?.questItem) return { ok: false, code: 'bound', reason: 'Itens de missão não vão para o depósito.' };
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
  // o comerciante paga uma fração do valor (economy.sellFraction, padrão metade) por unidade
  sellPriceOf(defId) { return Math.max(1, Math.floor((this.data.items[defId].value || 1) * (this.data.formulas.economy?.sellFraction ?? 0.5))); }
  gearPriceOf(defId) { return Math.max(1, Math.round((this.data.items[defId].value || 1) * (this.data.formulas.economy?.gearPriceMult ?? 3))); }

  // Armeiro: peças comuns (armas, armaduras, mão secundária e joias) que a classe pode usar, da faixa
  // atual do personagem e da próxima. Raras e únicas continuam só no saque.
  armorCatalog(char) {
    const gear = Object.values(this.data.items).filter((d) => d.rarity === 'common' && ['weapon', 'armor', 'offhand', 'jewel'].includes(d.kind)
      && (!d.classes || d.classes.includes(char.classId)));
    const tiers = [...new Set(gear.map((d) => d.level || 1))].sort((a, b) => a - b);
    const cur = tiers.filter((t) => t <= char.level).pop() ?? tiers[0];
    const next = tiers.find((t) => t > char.level);
    const want = new Set([cur, next].filter((t) => t != null));
    const order = { weapon: 0, offhand: 1, armor: 2, jewel: 3 };
    return gear.filter((d) => want.has(d.level || 1))
      .sort((a, b) => (a.level - b.level) || (order[a.kind] - order[b.kind]) || a.name.localeCompare(b.name))
      .map((d) => d.id);
  }


  // Vender ao comerciante (qualquer loja ou ferreiro por perto): só da bolsa; item de missão não.
  hSell(p, { npc, instance, qty }) {
    const n = p.zone.npcNear(p, npc);
    if (!n || !['shop', 'smith', 'armorer'].includes(n.role)) return { ok: false, code: 'too_far', reason: 'Chegue mais perto de um comerciante.' };
    const c = p.char;
    const it = c.items.get(instance);
    if (!it || it.loc !== 'bag') return { ok: false, code: 'not_in_bag', reason: 'Só dá para vender itens da bolsa (desequipe antes).' };
    const def = this.data.items[it.defId];
    if (def.questItem) return { ok: false, code: 'bound', reason: 'Itens de missão não podem ser vendidos.' };
    const n2 = qty == null ? it.qty : qty;
    if (!Number.isInteger(n2) || n2 < 1 || n2 > it.qty) return { ok: false, code: 'bad_request', reason: 'Quantidade inválida.' };
    const gain = this.sellPriceOf(it.defId) * n2;
    this.trades.dropItem?.(c.id, it.id);
    this.store.tx(() => {
      it.qty -= n2;
      if (it.qty <= 0) { c.items.delete(it.id); this.store.deleteItem(c.id, it.id); } else this.store.saveItems(c.id, [it]);
      c.gold += gain;
      this.store.saveCharacter(c);
    });
    this.audit('sell', { charId: c.id, item: it.defId, qty: n2, enh: it.enh || 0, gold: gain, goldAfter: c.gold, npc: n.id });
    return { ok: true, gold: gain, message: `Vendido: ${def.name}${n2 > 1 ? ` x${n2}` : ''} por ${gain} de ouro.`, char: p.zone.charView(p), cache: false };
  }

  // Descartar um item da bolsa (some de vez).
  hDiscard(p, { instance }) {
    const c = p.char;
    const it = c.items.get(instance);
    if (!it || it.loc !== 'bag') return { ok: false, code: 'not_in_bag', reason: 'Só dá para descartar itens da bolsa.' };
    const def = this.data.items[it.defId];
    if (def.questItem) return { ok: false, code: 'bound', reason: 'Itens de missão não podem ser descartados.' };
    this.trades.dropItem?.(c.id, it.id);
    this.store.tx(() => { c.items.delete(it.id); this.store.deleteItem(c.id, it.id); });
    this.audit('discard', { charId: c.id, item: it.defId, qty: it.qty, enh: it.enh || 0 });
    return { ok: true, message: `Descartado: ${def.name}${it.qty > 1 ? ` x${it.qty}` : ''}.`, char: p.zone.charView(p), cache: false };
  }

  hBuy(p, { npc, item, qty = 1 }) {
    const n = p.zone.npcNear(p, npc);
    if (!n || !['shop', 'smith', 'armorer'].includes(n.role) || (n.role !== 'armorer' && !n.shop)) return { ok: false, code: 'too_far', reason: 'Chegue mais perto do comerciante.' };
    const isGear = n.role === 'armorer';
    if (isGear ? !this.armorCatalog(p.char).includes(item) : !n.shop.includes(item)) return { ok: false, code: 'not_sold', reason: 'Este comerciante não vende isso.' };
    const def = this.data.items[item];
    // uma compra cabe numa pilha (Selo de Proteção: 20; tônicos: 50)
    const maxQty = isGear ? 1 : Math.min(50, def.stack || 1);
    if (!Number.isInteger(qty) || qty < 1 || qty > maxQty) return { ok: false, code: 'bad_request', reason: `Quantidade inválida (até ${maxQty} por compra).` };
    const c = p.char;
    if (def.kind === 'consumable' && (def.level || 1) > c.level) return { ok: false, code: 'level', reason: `Nível ${def.level} exigido para ${def.name}. Seu nível atual é ${c.level}.` };
    const cost = (isGear ? this.gearPriceOf(item) : this.priceOf(item)) * qty;
    if (c.gold < cost) return { ok: false, code: 'no_gold', reason: `Ouro insuficiente: ${cost} necessário, você tem ${c.gold}.` };
    const stack = [...c.items.values()].find((it) => it.loc === 'bag' && it.defId === item && it.qty + qty <= (def.stack || 1) && !this.trades.isOffered(c.id, it.id));
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
    if (r.ok) {
      r.journal = this.quests.journal(p.char);
      this.audit('quest_accept', { charId: p.char.id, quest, level: p.char.level });
    }
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
  }

  // ---------- prova de classe (instância solo; a regra de cada classe fica em trial.js) ----------
  hTrialStart(s, p, { npc }) {
    const n = p.zone.npcNear(p, npc);
    const c = p.char;
    if (!n || n.role !== 'master' || n.classId !== c.classId) return { ok: false, code: 'too_far', reason: 'Fale com o mestre da sua classe.' };
    if (c.trialDone) return { ok: false, code: 'done', reason: 'Você já venceu a prova da sua classe.' };
    if (c.level < 10) return { ok: false, code: 'level', reason: `Nível 10 exigido. Seu nível atual é ${c.level}.` };
    if (c.quests.get('c3_trial')?.state !== 'active') return { ok: false, code: 'quest', reason: 'Aceite a missão "Prova de Classe" primeiro.' };
    const arena = this.data.maps.arena_prova;
    const cfg = arena.trial.classes?.[c.classId];
    if (!cfg) return { ok: false, code: 'no_trial', reason: 'A prova desta classe ainda não está pronta.' };
    const key = `trial:${c.id}:${randomUUID().slice(0, 8)}`;
    // áreas bloqueadas só desta prova (fossos do Lanceiro): a navegação da instância já nasce com elas
    const zone = this.createZone('arena_prova', key, cfg.blocked?.length ? { ...arena, blocked: [...(arena.blocked ?? []), ...cfg.blocked] } : null);
    c.saveMapId = p.zone.mapId; c.saveX = n.x; c.saveZ = n.z + 2;
    const trial = new Trial({ key, zone, data: this.data, classId: c.classId, charId: c.id, returnTo: { mapId: p.zone.mapId, x: n.x, z: n.z + 2 } });
    this.trials.set(key, trial);
    return {
      ok: true, cache: false, durationMs: trial.timeMs, kind: trial.kind, title: trial.cfg.title,
      after: () => {
        const np = this.moveToZone(p, key, arena.spawnPoint.x, arena.spawnPoint.z);
        np.char.hp = np.stats.maxHp; np.char.mp = np.stats.maxMp;
        trial.start(np);
      },
    };
  }

  // ---------- calabouço ----------
  hDungeonEnter(s, p, { object }) {
    const o = p.zone.objectNear(p, object);
    if (!o || o.kind !== 'dungeon') return { ok: false, code: 'too_far', reason: 'Chegue mais perto da porta da Eclusa.' };
    const c = p.char;
    const pid = this.partyIdOf(c.id);
    const members = pid ? this.partyMemberIds(pid) : [];
    // o mínimo de 2 conta só quem está on-line: com o parceiro fora do ar, ninguém entra sozinho
    if (members.filter((id) => this.isOnline(id)).length < 2) return { ok: false, code: 'party', reason: 'A Última Eclusa exige um grupo de 2 a 5 jogadores on-line.' };
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
      dg = new Dungeon({ key, zone, partyId: pid, members, data: this.data, onlineCount: () => this.partyMemberIds(pid).filter((id) => this.isOnline(id)).length,
        onEvent: (result, d) => this.audit('dungeon', { result, party: pid, members: members.length, ...d }) });
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
      if (!p) {
        // o personagem saiu da arena sem a prova acabar (teleporte de mestre para outro mapa): a instância
        // vazia não fica rodando para sempre
        if (zone.now - trial.startedAt > 5000) this.endTrial(key, false, 'A prova foi abandonada.', true);
        continue;
      }
      const fell = 'Você caiu durante a prova. Fale com o mestre para tentar de novo.';
      if (p.char.dead) { this.endTrial(key, false, fell); continue; }
      const r = trial.tick(p);
      if (r) this.endTrial(key, r.success, r.message);
      // caiu no próprio passo da prova (pedra do teto): acaba já — esperar o passo seguinte deixava um
      // "respawn" devolver o personagem ao posto da arena, de pé, com a prova correndo
      else if (p.char.dead) this.endTrial(key, false, fell);
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

  // Levantar um aliado caído: pelo nome (ações ao clicar no jogador) ou pelo eid; mesmo mapa, perto.
  hReviveAlly(p, { name, target }) {
    let t = null;
    if (typeof target === 'string') t = p.zone.entityById(target);
    else if (typeof name === 'string') t = this.playerOf(this.byName.get(name.trim().toLowerCase()));
    if (t && t.zone !== p.zone) t = null;
    return p.zone.cmdReviveAlly(p, t?.char ? t : null);
  }

  // ---------- grupos ----------
  partyView(pid) {
    if (this.world) return this.partyViewWorld(pid);
    const party = this.parties.get(pid);
    if (!party) return null;
    return {
      id: pid, leader: party.leader,
      members: [...party.members].map((charId) => {
        const p = this.playerOf(charId);
        if (!p) return { charId, name: party.names.get(charId), online: false };
        return this.livePartyMember(p);
      }),
    };
  }

  livePartyMember(p) {
    const c = p.char;
    return { charId: c.id, eid: p.eid, name: c.name, classId: c.classId, level: c.level, hp: Math.ceil(c.hp), mhp: p.stats.maxHp, mp: Math.floor(c.mp), mmp: p.stats.maxMp, mapId: p.zone.mapId, x: Math.round(c.x), z: Math.round(c.z), dead: c.dead, online: true };
  }

  sendPartyUpdate(pid) {
    const v = this.partyView(pid);
    if (!v) return;
    for (const charId of this.partyMemberIds(pid)) this.sendTo(this.byChar.get(charId), { t: 'party', party: v });
  }

  partyIdOf(charId) { return (this.world ? this.charPartyCache.get(charId) : this.charParty.get(charId)) ?? null; }

  partyMemberIds(pid) {
    if (this.world) return this.partyCache.get(pid)?.members.map((m) => m.charId) ?? [];
    return [...(this.parties.get(pid)?.members ?? [])];
  }

  // várias zonas: visão do grupo que veio do mundo, com os dados ao vivo de quem está nesta zona
  partyViewWorld(pid) {
    const v = this.partyCache.get(pid);
    if (!v) return null;
    return { id: pid, leader: v.leader, members: v.members.map((m) => { const p = this.playerOf(m.charId); return p ? this.livePartyMember(p) : m; }) };
  }

  // várias zonas: convite, aceite, recusa, saída e expulsão de grupo moram no serviço de mundo
  worldParty(t, payload) {
    return this.world.request(t, payload).then(({ pid, party, ...r }) => ({ ...r, ...(party ? { party: this.partyView(pid) ?? party } : {}), cache: false }));
  }

  // Convite de grupo: no máximo 1 a cada partyInviteGapMs (10 s) por quem convida, contando os enviados (D145).
  // Quem está na lista de ignorados do convidado recebe a mesma resposta de um convite enviado, mas nada chega.
  hPartyInvite(p, { name }) {
    const c = p.char;
    const now = Date.now();
    const last = this.partyInviteAt.get(c.id) ?? -Infinity;
    if (now - last < this.opts.partyInviteGapMs) {
      return { ok: false, code: 'too_fast', reason: `Espere ${Math.ceil((last + this.opts.partyInviteGapMs - now) / 1000)} s para convidar de novo.`, cache: false };
    }
    if (this.world) {
      // várias zonas: o convite mora no mundo; a lista de ignorados do convidado é conferida aqui (na memória, se
      // ele está nesta zona; no banco, se está em outra) e de novo na zona dele, na entrega. Ignorado: o mundo
      // faz as mesmas conferências (grupo cheio, já em grupo, líder) e só então responde "enviado" sem guardar
      // nem entregar (silentFor) — uma recusa aqui antes delas entregaria que ele é ignorado.
      // (staff: a zona do convidado não descarta o convite da equipe, nem de quem foi ignorado antes de entrar nela)
      const key = typeof name === 'string' ? name.trim().toLowerCase() : '';
      const tid = this.byName.get(key) ?? this.remoteByName.get(key);
      const silent = tid != null && tid !== c.id && !c.staff && (this.byChar.has(tid) ? this.ignoredBy(tid, c.id, false) : this.store.isIgnoring(tid, c.id));
      return this.worldParty('party_invite', { charId: c.id, name, staff: !!c.staff, ...(silent ? { silentFor: tid } : {}) })
        .then((r) => { if (r.ok) this.partyInviteAt.set(c.id, Date.now()); return r; });
    }
    const targetId = typeof name === 'string' ? this.byName.get(name.trim().toLowerCase()) : null;
    if (!targetId) return { ok: false, code: 'offline', reason: `${name} não está conectado.` };
    if (targetId === c.id) return { ok: false, code: 'self', reason: 'Você não pode se convidar.' };
    if (this.charParty.has(targetId)) return { ok: false, code: 'in_party', reason: `${name} já está em um grupo.` };
    const pid = this.charParty.get(c.id);
    if (pid && this.parties.get(pid).members.size >= PARTY_MAX) return { ok: false, code: 'full', reason: `Grupo cheio (máximo ${PARTY_MAX}).` };
    if (pid && this.parties.get(pid).leader !== c.id) return { ok: false, code: 'not_leader', reason: 'Só o líder pode convidar.' };
    this.partyInviteAt.set(c.id, now);
    if (this.ignoredBy(targetId, c.id, c.staff)) return { ok: true, cache: false }; // recusado em silêncio
    this.invites.set(targetId, { from: c.id, at: now });
    this.sendTo(this.byChar.get(targetId), { t: 'party_invite', from: c.name, fromId: c.id });
    return { ok: true, cache: false };
  }

  hPartyAccept(p, { from }) {
    if (this.world) return this.worldParty('party_accept', { charId: p.char.id, from });
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
    if (this.world) return this.worldParty('party_decline', { charId: p.char.id });
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
    if (party.leader === charId) party.leader = [...party.members].find((m) => this.byChar.has(m)) ?? [...party.members][0];
    this.sendPartyUpdate(pid);
  }

  disbandParty(pid) {
    const party = this.parties.get(pid);
    if (!party) return;
    for (const m of party.members) { this.charParty.delete(m); this.sendTo(this.byChar.get(m), { t: 'party', party: null }); }
    this.parties.delete(pid);
  }

  hPartyLeave(p) {
    if (this.world) return this.worldParty('party_leave', { charId: p.char.id });
    if (!this.charParty.has(p.char.id)) return { ok: false, code: 'no_party', reason: 'Você não está em um grupo.' };
    this.removeFromParty(p.char.id);
    return { ok: true, cache: false };
  }

  hPartyKick(p, { charId }) {
    if (this.world) return this.worldParty('party_kick', { charId: p.char.id, target: charId });
    const pid = this.charParty.get(p.char.id);
    const party = pid && this.parties.get(pid);
    if (!party) return { ok: false, code: 'no_party', reason: 'Você não está em um grupo.' };
    if (party.leader !== p.char.id) return { ok: false, code: 'not_leader', reason: 'Só o líder pode remover membros.' };
    if (!party.members.has(charId) || charId === p.char.id) return { ok: false, code: 'bad_target', reason: 'Membro inválido.' };
    this.removeFromParty(charId);
    return { ok: true, cache: false };
  }

  // ---------- várias zonas: o que vem do serviço de mundo ----------
  isOnline(charId) { return this.byChar.has(charId) || !!this.remote?.has(charId); }

  // personagem on-line em outra zona, pelo nome ({ charId, name } ou null)
  remoteChar(name) {
    if (!this.world || typeof name !== 'string') return null;
    const charId = this.remoteByName.get(name.trim().toLowerCase());
    return charId != null ? { charId, name: this.remote.get(charId).name } : null;
  }

  // mensagem para um personagem de outra zona (note: efeito na zona de lá, ex.: convite de clã)
  worldSend(charId, msg, note = undefined) { this.world?.notify('send', { to: charId, msg, note }); }

  // eventos de clã para as outras zonas: { clanId, msg, except, from, attach:[charIds], direct:[{ charId, msg }] }
  clanRemote(evt) { this.world?.notify('clan', evt); }

  // moderação para a sessão da conta nas outras zonas: { accountId, kick?, mutedUntil?, text? }
  modRemote(evt) { this.world?.notify('mod', evt); }

  worldAnnounce(text) { this.world?.notify('announce', { text }); }

  // "onde está" de quem está em outra zona (pergunta ao mundo)
  async worldWhere(name) {
    const r = await this.world.request('where', { name });
    if (!r.ok) return { ok: true, message: `${name} não está on-line.`, cache: false };
    const map = this.data.maps[r.mapId]?.name ?? r.mapId ?? '?';
    return { ok: true, message: `${r.name}: ${r.mapId ?? '?'} (${map}) na zona ${r.zoneId}${r.transferring ? ', mudando de zona' : ''}.`, cache: false };
  }

  memberSummary(p) {
    const c = p.char;
    return { charId: c.id, classId: c.classId, level: c.level, hp: Math.ceil(c.hp), mhp: p.stats.maxHp, mp: Math.floor(c.mp), mmp: p.stats.maxMp, mapId: p.zone.mapId, x: Math.round(c.x), z: Math.round(c.z), dead: !!c.dead };
  }

  // quem esta zona tem carregado (vai no hello ao mundo, que confere as posses)
  worldOnlineList() {
    const out = [];
    for (const [charId, s] of this.byChar) {
      const p = this.playerOf(charId);
      if (p) out.push({ charId, accountId: s.accountId, name: p.char.name, mapId: p.zone.mapId, epoch: s.leaseEpoch ?? null });
    }
    return out;
  }

  playerCount() { let n = 0; for (const z of this.zones.values()) n += z.players.size; return n; }

  onWorldWelcome(m) {
    this.setRemoteZones(m.zones ?? []);
    this.remote.clear();
    this.remoteByName.clear();
    for (const e of m.directory ?? []) this.setPresence({ ...e, online: true });
    // grupos: o mundo manda de novo os que existem; os que sumiram (mundo reiniciado) fecham aqui
    const keep = new Set(m.parties ?? []);
    for (const [pid, v] of [...this.partyCache]) {
      if (keep.has(pid)) continue;
      for (const mem of v.members) {
        if (this.charPartyCache.get(mem.charId) !== pid) continue;
        this.charPartyCache.delete(mem.charId);
        this.sendTo(this.byChar.get(mem.charId), { t: 'party', party: null });
      }
      this.partyCache.delete(pid);
    }
  }

  onWorldMessage(m) {
    switch (m.t) {
      case 'zones': return this.setRemoteZones(m.zones ?? []);
      case 'presence': return this.setPresence(m);
      case 'kick': return this.onWorldKick(m);
      case 'deliver': return this.onWorldDeliver(m);
      case 'party': return this.onWorldParty(m);
      case 'party_clear': return this.onWorldPartyClear(m);
      case 'clan': return this.onWorldClan(m);
      case 'mod': return this.mod.applyRemote(m);
      case 'announce': return typeof m.text === 'string' ? this.mod.announce(m.text) : undefined;
      case 'staff': return typeof m.text === 'string' ? this.mod.notifyStaff(m.text.slice(0, 300), { remote: false }) : undefined;
    }
  }

  setRemoteZones(list) {
    this.remoteMaps.clear();
    for (const z of list) if (z.id !== this.zoneId) for (const mapId of z.maps ?? []) this.remoteMaps.set(mapId, { zoneId: z.id, up: !!z.up });
  }

  setPresence({ charId, name, zoneId, online }) {
    const prev = this.remote.get(charId);
    if (prev && this.remoteByName.get(prev.name.toLowerCase()) === charId) this.remoteByName.delete(prev.name.toLowerCase());
    this.remote.delete(charId);
    if (online && zoneId !== this.zoneId && typeof name === 'string') {
      this.remote.set(charId, { name, zoneId });
      this.remoteByName.set(name.toLowerCase(), charId);
    }
  }

  // o mundo pede para soltar o personagem (ele entrou por outra zona): salva (a menos que o mundo diga
  // que a posse já é de outra) e desconecta; a liberação da posse sai em leaveWorld
  onWorldKick({ charId, epoch, reason, nosave }) {
    const s = this.byChar.get(charId);
    if (s && (epoch == null || s.leaseEpoch == null || s.leaseEpoch === epoch)) {
      if (nosave) s.noSave = true;
      this.sendTo(s, { t: 'kicked', reason: reason ?? 'Sua conta entrou em outra conexão.' });
      this.dropSession(s);
    } else {
      // Não está carregado aqui: libera para o mundo seguir. A posse pode ter acabado de ser concedida
      // a uma entrada desta zona que ainda vai carregar o personagem (a resposta e este kick lidos no
      // mesmo instante): a época fica marcada e essa entrada desiste em vez de carregar sem posse.
      if (epoch != null) {
        const now = Date.now();
        for (const [e, at] of this.revoked) if (now - at > 60000) this.revoked.delete(e);
        this.revoked.set(epoch, now);
      }
      this.world.notify('release', { charId, epoch });
    }
  }

  // a posse concedida (época) já foi pedida de volta pelo mundo e devolvida? (ver onWorldKick)
  leaseRevoked(epoch) { return epoch != null && this.revoked.delete(epoch); }

  onWorldDeliver({ charId, msg, note }) {
    const s = this.byChar.get(charId);
    const early = s ? null : this.arriving.get(charId);
    if (early) { if (early.length < 32) early.push({ msg, note }); return; } // chegando: entrega depois do login_transfer
    // de quem ele ignora (sussurro, fala de grupo, convite de grupo ou de clã vindos de outra zona): some em silêncio
    const from = Number.isInteger(note?.from) ? note.from : msg?.t === 'party_invite' && Number.isInteger(msg.fromId) ? msg.fromId : null;
    if (from != null && this.ignoredBy(charId, from, msg?.staff)) return;
    if (note?.kind === 'clan_invite' && Number.isInteger(note.clanId)) this.clans.invites.set(charId, { clanId: note.clanId, from: note.from, at: Date.now() });
    // fala de quem está em outra zona (sussurro, grupo): guardada para dar contexto a denúncias daqui, com
    // quem a recebeu (este personagem)
    if (note?.kind === 'chat' && Number.isInteger(note.from) && msg?.t === 'chat' && typeof msg.text === 'string') this.mod.remember(note.from, msg.channel, msg.text, [charId]);
    if (s && msg) this.sendTo(s, msg);
  }

  onWorldParty({ pid, view }) {
    if (!view) return;
    const old = this.partyCache.get(pid);
    if (old) for (const m of old.members) if (this.charPartyCache.get(m.charId) === pid) this.charPartyCache.delete(m.charId);
    this.partyCache.set(pid, view);
    for (const m of view.members) this.charPartyCache.set(m.charId, pid);
    this.sendPartyUpdate(pid);
  }

  onWorldPartyClear({ pid, charIds, disband }) {
    for (const charId of charIds ?? []) {
      if (this.charPartyCache.get(charId) === pid) this.charPartyCache.delete(charId);
      const s = this.byChar.get(charId);
      if (s) this.sendTo(s, { t: 'party', party: null });
    }
    const v = this.partyCache.get(pid);
    if (v && disband) {
      for (const m of v.members) if (this.charPartyCache.get(m.charId) === pid) this.charPartyCache.delete(m.charId);
      this.partyCache.delete(pid);
    } else if (v) {
      v.members = v.members.filter((m) => !(charIds ?? []).includes(m.charId));
    }
  }

  onWorldClan({ clanId, msg, except, attach, direct, from }) {
    if (msg && clanId != null) {
      const members = this.store.clanMembers(clanId);
      // fala de clã de outra zona: contexto de denúncia, com os membros do clã como quem recebeu
      if (Number.isInteger(from) && msg.t === 'chat' && typeof msg.text === 'string') this.mod.remember(from, 'clan', msg.text, members.map((m) => m.char_id));
      for (const m of members) {
        if (m.char_id === except) continue;
        if (Number.isInteger(from) && this.ignoredBy(m.char_id, from, msg.staff)) continue; // fala de quem ele ignora
        const s = this.byChar.get(m.char_id);
        if (s) this.sendTo(s, msg);
      }
    }
    for (const charId of attach ?? []) { const p = this.playerOf(charId); if (p) this.clans.attach(p.char); }
    for (const d of direct ?? []) { const s = this.byChar.get(d.charId); if (s) this.sendTo(s, d.msg); }
  }

  // Sem notícia do mundo perto do prazo em que ele daria esta zona como fora do ar: salva e
  // desconecta todos, para que ninguém fique carregado aqui depois de a posse ser liberada.
  onWorldLost() {
    const inWorld = [...this.sessions].filter((s) => s.charId != null);
    if (!inWorld.length) return;
    this.log(`sem notícia do serviço de mundo: salvando e desconectando ${inWorld.length} jogador(es)`);
    for (const s of inWorld) {
      this.sendTo(s, { t: 'kicked', reason: 'Conexão com o mundo perdida. Seu progresso foi salvo; entre de novo em instantes.' });
      this.dropSession(s);
    }
  }

  // a cada segundo: painel do grupo para os membros daqui e resumo deles para o mundo
  worldPartyTick() {
    const members = [];
    for (const pid of this.partyCache.keys()) {
      this.sendPartyUpdate(pid);
      for (const charId of this.partyMemberIds(pid)) { const p = this.playerOf(charId); if (p) members.push(this.memberSummary(p)); }
    }
    if (members.length) this.world.notify('party_state', { members });
  }

  // a zona deixou de ter este personagem: esquece os grupos que só ele trazia para cá
  forgetParty(charId) {
    const pid = this.charPartyCache.get(charId);
    const v = pid ? this.partyCache.get(pid) : null;
    if (!v || v.members.some((m) => m.charId !== charId && this.byChar.has(m.charId))) return;
    for (const m of v.members) if (this.charPartyCache.get(m.charId) === pid) this.charPartyCache.delete(m.charId);
    this.partyCache.delete(pid);
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
      // item de missão caído antes da entrega: sem missão que o use, some do chão em vez de prender a bolsa
      // (não se vende nem se descarta)
      if (row.def_id && this.data.items[row.def_id]?.questItem && !this.quests.needsItem(c, row.def_id)) {
        this.store.markLootClaimed(row.id, null);
        result = { ok: true, alreadyClaimed: false, loot: lootId, instanceId: null, gold: 0, defId: row.def_id, discarded: true, message: `${this.data.items[row.def_id].name}: nenhuma missão sua precisa mais disto.` };
        return;
      }
      if (row.def_id) {
        const def = this.data.items[row.def_id];
        let stack = null;
        if (def.stack) for (const it of c.items.values()) if (it.loc === 'bag' && it.defId === def.id && it.qty + row.qty <= def.stack && !this.trades.isOffered(c.id, it.id)) { stack = it; break; }
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
    if (result.ok) {
      result.char = p.zone.charView(p); // objetivos "collect" são contados ao vivo na bolsa
      // o diário acompanha a coleta (antes só mudava no próximo abate)
      if (!result.alreadyClaimed && !result.discarded && result.defId) this.notifyQuests(p, this.quests.collectingQuests(c, result.defId));
      if (!result.alreadyClaimed) this.notifyQuests(p, this.quests.onPickup(c)); // "colete o saque" (tutorial)
    }
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
    const blocked = this.mod.chatBlocked(p);
    if (blocked) return blocked;
    if (channel === 'clan') {
      const t = typeof text === 'string' ? text.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 200) : '';
      if (!t) return { ok: false, code: 'empty', reason: 'Mensagem vazia.' };
      const { to, ...r } = this.clans.chat(p, t);
      if (r.ok) this.mod.remember(p.char.id, 'clan', t, to); // contexto de denúncia: quem recebeu
      return this.nc(r);
    }
    if (typeof text !== 'string') return { ok: false, code: 'bad_request', reason: 'Mensagem inválida.' };
    const clean = text.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 200);
    if (!clean) return { ok: false, code: 'empty', reason: 'Mensagem vazia.' };
    const msg = { t: 'chat', channel, from: p.char.name, eid: p.eid, text: clean };
    if (p.char.staff) msg.staff = true; // marca [Equipe]: só o servidor põe, pelo papel da conta (D145)
    // depois de entregue, a fala vira contexto de denúncia com quem a recebeu (null = mapa, pública)
    const said = (to) => this.mod.remember(p.char.id, channel, clean, to);
    // quem ignora quem falou não recebe a fala (quem falou sempre vê a própria)
    const me = p.char.id;
    const hears = (id) => id === me || !this.ignoredBy(id, me, msg.staff);
    if (channel === 'zone') {
      const raw = JSON.stringify(msg);
      for (const id of p.zone.players.keys()) if (hears(id)) this.rawSend(this.byChar.get(id), raw);
      said(null);
    } else if (channel === 'party' && this.world) {
      // várias zonas: entrega aqui aos membros desta zona; o mundo leva aos das outras (a zona de cada um
      // confere a lista de ignorados dele na entrega)
      const pid = this.partyIdOf(me);
      if (!pid) return { ok: false, code: 'no_party', reason: 'Você não está em um grupo.' };
      const members = this.partyMemberIds(pid).filter(hears);
      for (const m of members) this.sendTo(this.byChar.get(m), msg);
      this.world.notify('party_chat', { charId: me, msg });
      said(members);
    } else if (channel === 'party') {
      const pid = this.charParty.get(me);
      if (!pid) return { ok: false, code: 'no_party', reason: 'Você não está em um grupo.' };
      const members = [...this.parties.get(pid).members].filter(hears);
      for (const m of members) this.sendTo(this.byChar.get(m), msg);
      said(members);
    } else if (channel === 'whisper') {
      const targetId = typeof to === 'string' ? this.byName.get(to.trim().toLowerCase()) : null;
      const remote = !targetId && this.world ? this.remoteChar(to) : null;
      if (remote) {
        // várias zonas: a pessoa está em outra zona; o mundo entrega. Ignorado por ela (lista no banco): quem
        // falou vê a própria fala como sempre, e nada é entregue
        if (msg.staff || !this.store.isIgnoring(remote.charId, me)) {
          this.world.notify('send', { to: remote.charId, msg: { ...msg, to: remote.name }, note: { kind: 'chat', from: me } });
          said([remote.charId]);
        }
        this.sendTo(this.byChar.get(me), { ...msg, to: remote.name });
        return { ok: true, cache: false };
      }
      if (!targetId) return { ok: false, code: 'offline', reason: `${to} não está conectado.` };
      const shown = { ...msg, to: this.playerOf(targetId).char.name };
      if (hears(targetId)) { this.sendTo(this.byChar.get(targetId), shown); said([targetId]); }
      this.sendTo(this.byChar.get(me), shown); // descartado em silêncio: quem falou não fica sabendo
    } else return { ok: false, code: 'bad_channel', reason: 'Canal inválido.' };
    return { ok: true, cache: false };
  }

  // O personagem recipientId (carregado nesta zona) ignora senderId? A equipe nunca é ignorada (D145).
  ignoredBy(recipientId, senderId, senderStaff = false) {
    if (senderStaff || recipientId === senderId) return false;
    return !!this.playerOf(recipientId)?.char.ignored?.has(senderId);
  }

  // ---------- lista de ignorados (por personagem, no banco, até IGNORE_MAX) ----------
  // Nome do personagem a ignorar: on-line aqui, em outra zona ou fora do ar (excluídos não contam).
  findCharByName(name) {
    const key = typeof name === 'string' ? name.trim() : '';
    if (!key) return null;
    const id = this.byName.get(key.toLowerCase());
    const live = id != null ? this.playerOf(id)?.char : null;
    if (live) return { id: live.id, name: live.name, accountId: live.accountId };
    // o banco só iguala maiúsculas em A-Z: "ângela" acha "Ângela" pelas variantes das letras acentuadas
    const row = accentCaseVariants(key).map((v) => this.store.characterByName(v)).find(Boolean);
    return row && !DELETED_PREFIX_RE.test(row.name) ? { id: row.id, name: row.name, accountId: row.account_id } : null;
  }

  hIgnoreAdd(p, { name }) {
    const c = p.char;
    const t = this.findCharByName(name);
    if (!t) return { ok: false, code: 'not_found', reason: typeof name === 'string' && name.trim() ? `Personagem ${name.trim().slice(0, 32)} não encontrado.` : 'Use: /ignorar Nome.', cache: false };
    if (t.id === c.id) return { ok: false, code: 'self', reason: 'Você não pode ignorar a si mesmo.', cache: false };
    // a equipe não pode ser ignorada: avisos e conversas da moderação precisam chegar
    if (STAFF_ROLES.has(this.store.findAccountById(t.accountId)?.role)) return { ok: false, code: 'staff', reason: 'Não dá para ignorar a equipe.', cache: false };
    if (c.ignored.has(t.id)) return { ok: true, message: `${t.name} já está na sua lista de ignorados.`, cache: false };
    if (c.ignored.size >= IGNORE_MAX) return { ok: false, code: 'full', reason: `Sua lista de ignorados está cheia (${IGNORE_MAX}). Tire alguém com /designorar Nome.`, cache: false };
    this.store.addIgnore(c.id, t.id);
    c.ignored.add(t.id);
    // convites dele que já estavam esperando resposta somem também
    for (const map of [this.invites, this.clans.invites, this.trades.invites, p.zone.duels.invites]) if (map.get(c.id)?.from === t.id) map.delete(c.id);
    return { ok: true, message: `Você não verá mais as falas nem os convites de ${t.name}. Para desfazer: /designorar ${t.name}.`, cache: false };
  }

  hIgnoreRemove(p, { name }) {
    const key = typeof name === 'string' ? name.trim().toLowerCase() : '';
    if (!key) return { ok: false, code: 'bad_request', reason: 'Use: /designorar Nome.', cache: false };
    // pelo nome de agora (quem foi renomeado aparece na lista com o nome novo)
    const hit = this.store.listIgnored(p.char.id).find((r) => r.name.toLowerCase() === key);
    if (!hit) return { ok: false, code: 'not_found', reason: `${name.trim().slice(0, 32)} não está na sua lista de ignorados.`, cache: false };
    this.store.removeIgnore(p.char.id, hit.ignored_id);
    p.char.ignored.delete(hit.ignored_id);
    return { ok: true, message: `${hit.name} saiu da sua lista de ignorados.`, cache: false };
  }

  hIgnoreList(p) {
    const names = this.store.listIgnored(p.char.id).map((r) => r.name);
    return { ok: true, ignored: names, message: names.length ? `Ignorados (${names.length}/${IGNORE_MAX}): ${names.join(', ')}.` : 'Sua lista de ignorados está vazia.', cache: false };
  }

  // ---------- administração (D146): chamados por moderation.js, só para admin ----------
  // Muda no banco um personagem que não está carregado nesta zona. Com várias zonas, pede antes a posse dele ao
  // mundo, como uma entrada: se ele está on-line em outra zona, ela o grava e desconecta (com kickReason), e
  // ninguém o carrega enquanto fn roda; depois a posse volta. Sem isso, a zona dele (ou um login no meio)
  // gravaria por cima do ouro e dos itens mudados aqui. fn decide de novo se ele está carregado aqui (playerOf).
  withCharHeld(charId, name, kickReason, fn) {
    if (!this.world || this.playerOf(charId)) return fn();
    const busy = { ok: false, code: 'busy', reason: `${name} está mudando de zona agora. Tente de novo em instantes.`, cache: false };
    return this.world.request('acquire', { charId, name, kickReason }, this.world.downMs * 2 + 10000).then((r) => {
      if (!r.ok) return { ok: false, code: r.code ?? 'busy', reason: r.reason ?? busy.reason, cache: false };
      if (this.leaseRevoked(r.epoch)) return busy; // outra entrada já pediu o personagem: a posse foi devolvida
      try { return fn(); } finally {
        // a entrada do próprio jogador nesta zona ganhou a posse logo antes desta concessão, que é a mais nova: a
        // época passa para a sessão dele (devolver deixaria o personagem carregado aqui sem dono no mundo)
        const s = this.playerOf(charId) ? this.byChar.get(charId) : null;
        if (s) s.leaseEpoch = r.epoch;
        else this.world.notify('release', { charId, epoch: r.epoch });
      }
    });
  }

  // Nome novo com o personagem on-line nesta zona: memória (nome, busca por nome, grupo, diretório do mundo)
  // e o próprio jogador fica sabendo; o banco já foi gravado.
  renameOnline(p, name) {
    const c = p.char;
    const old = c.name;
    c.name = name;
    if (this.byName.get(old.toLowerCase()) === c.id) this.byName.delete(old.toLowerCase());
    this.byName.set(name.toLowerCase(), c.id);
    const party = this.parties.get(this.charParty.get(c.id));
    if (party) party.names.set(c.id, name);
    if (this.world) this.world.notify('online', { charId: c.id, name, mapId: p.zone.mapId, state: this.memberSummary(p) });
    const s = this.byChar.get(c.id);
    this.sendTo(s, { t: 'char', char: p.zone.charView(p) });
    this.sendTo(s, { t: 'system', text: `A equipe renomeou seu personagem: agora você é ${name}.` });
  }

  // Retira até `want` unidades de defId do personagem: bolsa, caixa de recuperação, equipamento e o que ele
  // guardou no depósito da conta, nessa ordem. On-line nesta zona: memória e banco (troca aberta cancelada,
  // atributos recalculados, ficha nova para ele); fora do ar: só o banco. Devolve { qty, instances, online }.
  takeItemsOf(charId, defId, want) {
    const p = this.playerOf(charId);
    const fromRow = (r) => ({ id: r.id, defId: r.def_id, qty: r.qty, enh: r.enh, loc: r.loc, slot: r.slot });
    const rows = this.store.characterItems(charId);
    const held = p ? [...p.char.items.values()] : rows.filter((r) => r.loc !== 'storage').map(fromRow);
    const ORDER = { bag: 0, recovery: 1, equip: 2, storage: 3 };
    const pool = [...held, ...rows.filter((r) => r.loc === 'storage').map(fromRow)]
      .filter((it) => it.defId === defId).sort((a, b) => ORDER[a.loc] - ORDER[b.loc]);
    let left = want;
    const plan = [];
    for (const it of pool) {
      if (left <= 0) break;
      const take = Math.min(left, it.qty);
      left -= take;
      plan.push({ it, take });
    }
    if (!plan.length) return { qty: 0, instances: [], online: !!p };
    if (p) this.trades.cancel(charId, 'Troca cancelada: a equipe mexeu nos itens.');
    this.store.tx(() => {
      for (const { it, take } of plan) {
        if (take >= it.qty) {
          this.store.deleteItem(charId, it.id);
          if (p) p.char.items.delete(it.id);
        } else {
          it.qty -= take;
          this.store.saveItems(charId, [it]);
        }
      }
    });
    const qty = plan.reduce((n, x) => n + x.take, 0);
    if (p) {
      if (plan.some((x) => x.it.loc === 'equip')) p.zone.recalc(p);
      const s = this.byChar.get(charId);
      this.sendTo(s, { t: 'char', char: p.zone.charView(p) });
      this.sendTo(s, { t: 'system', text: `A equipe retirou do seu personagem: ${this.data.items[defId].name} ×${qty}.` });
    }
    return { qty, instances: plan.map((x) => x.it.id), online: !!p };
  }

  // Retira até n de ouro do personagem (on-line nesta zona: memória e banco; fora do ar: banco).
  takeGoldOf(charId, n) {
    const p = this.playerOf(charId);
    if (p) {
      const taken = Math.min(n, p.char.gold);
      if (!taken) return { taken: 0, gold: p.char.gold, online: true };
      this.trades.cancel(charId, 'Troca cancelada: a equipe mexeu no ouro.');
      p.char.gold -= taken;
      this.store.saveCharacter(p.char);
      const s = this.byChar.get(charId);
      this.sendTo(s, { t: 'char', char: p.zone.charView(p) });
      this.sendTo(s, { t: 'system', text: `A equipe retirou ${taken} de ouro do seu personagem.` });
      return { taken, gold: p.char.gold, online: true };
    }
    const c = this.store.loadCharacter(charId);
    const taken = Math.min(n, c?.gold ?? 0);
    if (taken) this.store.setCharacterGold(charId, c.gold - taken);
    return { taken, gold: (c?.gold ?? 0) - taken, online: false };
  }

  // Comandos de mestre (D138). Moderação (expulsar, suspender, silenciar, onde, anunciar) e teleporte do
  // próprio personagem: papéis gm e admin. Comandos de cenário, que criam ouro, itens, níveis, refino ou
  // progresso de missão: só administradores ou servidor --dev (testes e reprodução de cenários), com teto.
  hGm(p, msg) {
    const s = this.byChar.get(p.char.id);
    if (!this.opts.dev && !['gm', 'admin'].includes(s?.role)) return { ok: false, code: 'forbidden', reason: 'Comandos de mestre desativados.' };
    this.audit('gm', { accountId: s?.accountId ?? null, charId: p.char.id, ip: s?.ip ?? null, cmd: String(msg.cmd).slice(0, 32), args: Object.fromEntries(Object.entries(msg).filter(([k]) => !['t', 'rid', 'cmd'].includes(k))) });
    const modRes = this.mod.gm(p, msg, s);
    if (modRes) return modRes;
    if (GM_SCENARIO_CMDS.has(msg.cmd) && !this.opts.dev && s?.role !== 'admin') {
      return { ok: false, code: 'forbidden', reason: 'Comandos de cenário (itens, ouro, nível, refino, missões) são só para administradores.' };
    }
    const c = p.char;
    if (msg.cmd === 'give') {
      const def = this.data.items[msg.defId];
      if (!def) return { ok: false, code: 'bad_item', reason: 'Item inexistente.' };
      if (bagCount(c) >= BAG_CAPACITY) return { ok: false, code: 'bag_full', reason: 'Inventário cheio.' };
      const want = Number.isInteger(msg.qty) ? msg.qty : 1;
      const qty = Math.max(1, Math.min(def.stack ?? 1, want));
      const it = { id: randomUUID(), defId: def.id, qty, enh: 0, loc: 'bag', slot: null };
      this.store.insertItem({ ...it, charId: c.id, source: 'gm' });
      c.items.set(it.id, it);
      return { ok: true, instanceId: it.id, char: p.zone.charView(p) };
    }
    if (msg.cmd === 'teleport') {
      // coordenadas conferidas contra o mapa de destino (sem elas, num outro mapa: o ponto de chegada)
      const other = typeof msg.mapId === 'string' && msg.mapId !== '' && msg.mapId !== p.zone.mapId;
      const md = this.data.maps[other ? (this.zones.get(msg.mapId)?.mapId ?? msg.mapId) : p.zone.mapId];
      if (!md) return { ok: false, code: 'bad_map', reason: 'Mapa inexistente.' };
      let { x, z } = msg;
      if (other && x === undefined && z === undefined) ({ x, z } = md.spawnPoint);
      if (!Number.isFinite(x) || !Number.isFinite(z) || x < 0 || z < 0 || x > md.size[0] || z > md.size[1]) {
        return { ok: false, code: 'bad_request', reason: 'Coordenadas fora do mapa.' };
      }
      if (other) {
        if (!this.zones.has(msg.mapId)) {
          if (this.world && this.openMap(msg.mapId)) return this.remoteMove(p, msg.mapId, x, z);
          return { ok: false, code: 'bad_map', reason: 'Mapa inexistente.' };
        }
        return { ok: true, cache: false, after: () => this.moveToZone(p, msg.mapId, x, z) };
      }
      // para de andar: sem limpar o caminho, o personagem seguia o trajeto antigo a partir do ponto novo
      c.x = x; c.z = z; p.dest = null; p.path = null; c.chase = null; c.speed = 0; c.vx = 0; c.vz = 0;
      return { ok: true, char: p.zone.charView(p) };
    }
    if (msg.cmd === 'xp') {
      if (!Number.isInteger(msg.level) || msg.level < 1) return { ok: false, code: 'bad_request', reason: 'Nível inválido.' };
      const cum = this.data.xp.cumulative;
      const target = Math.min(this.data.levelCap, msg.level);
      const need = cum[target - 1] - c.xp;
      if (need <= 0) return { ok: false, code: 'bad_request', reason: 'Já está nesse nível.' };
      p.zone.grantXp(p, need);
      this.store.saveCharacter(c);
      return { ok: true, char: p.zone.charView(p) };
    }
    if (msg.cmd === 'set_enh') {
      // cenários: define o grau de refino de uma peça
      const it = c.items.get(msg.instance);
      if (!it) return { ok: false, code: 'not_found', reason: 'Item não encontrado.' };
      it.enh = Math.max(0, Math.min(this.data.formulas.enhance.maxLevel, Math.floor(msg.enh || 0)));
      this.store.saveItems(c.id, [it]);
      if (it.loc === 'equip') p.zone.recalc(p);
      return { ok: true, char: p.zone.charView(p) };
    }
    if (msg.cmd === 'gold') {
      const amount = Math.floor(Number(msg.amount) || 0);
      if (amount < 1 || amount > GM_GOLD_MAX) return { ok: false, code: 'bad_request', reason: `Quantia de 1 a ${GM_GOLD_MAX} por comando.` };
      c.gold += amount;
      this.store.saveCharacter(c);
      return { ok: true, char: p.zone.charView(p) };
    }
    if (msg.cmd === 'quest_progress') {
      // testes: define o progresso de um objetivo de missão ativa
      const st = c.quests.get(msg.quest);
      if (!st || st.state !== 'active') return { ok: false, code: 'not_active', reason: 'Missão não está ativa.' };
      const objectives = this.data.quests[msg.quest]?.objectives ?? [];
      if (!Number.isInteger(msg.index) || msg.index < 0 || msg.index >= objectives.length || !Number.isInteger(msg.value) || msg.value < 0) {
        return { ok: false, code: 'bad_request', reason: 'Objetivo ou valor inválido.' };
      }
      st.progress[msg.index] = msg.value;
      this.quests.save(c, msg.quest);
      this.notifyQuests(p, [msg.quest]);
      return { ok: true, cache: false };
    }
    if (msg.cmd === 'hp') {
      // testes e reprodução de cenários: a vida do próprio personagem; 0 = cai como se apanhasse até o fim (D186)
      const v = Number(msg.value);
      if (!Number.isInteger(v) || v < 0) return { ok: false, code: 'bad_request', reason: 'Vida inválida.' };
      if (c.dead) return { ok: false, code: 'dead', reason: 'Você está caído.' };
      if (v === 0) p.zone.killPlayer(p);
      else { c.hp = Math.min(p.stats.maxHp, v); this.store.saveCharacter(c); }
      return { ok: true, char: p.zone.charView(p) };
    }
    if (msg.cmd === 'quest_done') {
      // marca missões como concluídas (atalho de cenário)
      const ids = Array.isArray(msg.quests) ? msg.quests : [];
      if (!ids.length || !ids.every((id) => typeof id === 'string' && Object.hasOwn(this.data.quests, id))) return { ok: false, code: 'bad_request', reason: 'Missão inexistente.' };
      for (const id of ids) { c.quests.set(id, { state: 'done', progress: {} }); this.quests.save(c, id); }
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

// Versão da implantação: a release grava a tag sem o "v" (ex.: 0.4.0-teste.2) e ela vale inteira, com o
// sufixo; vazia, fica a do package.json. Só letras, números e . + _ - (até 64), como uma tag do git.
export const DEPLOY_VERSION_RE = /^[0-9A-Za-z][0-9A-Za-z.+_-]{0,63}$/;
export function deploymentVersion(v) {
  if (v == null || String(v).trim() === '') return SERVER_VERSION;
  const s = String(v).trim();
  if (!DEPLOY_VERSION_RE.test(s)) throw new Error(`versão inválida em CINZAS_VERSION: "${s.slice(0, 80)}" (use a tag da release sem o "v", ex.: 0.4.0-teste.2)`);
  return s;
}

function charRow(r) {
  return { id: r.id, name: r.name, classId: r.class_id, level: r.level, mapId: r.map_id };
}

export { EQUIP_SLOTS };
