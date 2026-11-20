// Serviço de mundo (modo de várias zonas): processo interno que coordena os servidores de zona que
// dividem os mapas entre si. Guarda:
// - o registro das zonas (id, endereço público, mapas, jogadores, último sinal de vida). Mapa já
//   reivindicado por outra zona é recusado; zona sem sinal por downAfterMs (10 s) é dada como fora
//   do ar e as posses dela são liberadas;
// - a posse de cada personagem (charId → zona, 'online' ou 'transferring'): uma zona só carrega e
//   simula um personagem de que tem a posse. Login com o personagem on-line em outra zona pede a ela
//   para salvar e soltar ("kick") e só concede depois da liberação (ou de a zona cair);
// - o diretório de quem está on-line (nome → personagem, zona e mapa): sussurro, grupo e clã;
// - os grupos, que neste modo moram aqui: convite, aceite, recusa, saída, expulsão e liderança;
// - o barramento de mensagens entre zonas e os tokens de transferência (HMAC, 30 s, uso único);
// - a rota da moderação (expulsão, suspensão e silêncio por conta) e dos anúncios para todas as zonas.
//
// Protocolo interno (WebSocket + JSON), só para as zonas. A primeira mensagem da zona é
//   { t:'hello', zoneId, maps, publicUrl, ts, auth, online }   auth = HMAC-SHA256(segredo, `${zoneId}:${ts}`)
// Pedidos { t, id, ... } recebem { t:'res', id, ok, ... }; o resto são avisos sem resposta.
// Pedidos: acquire, transfer, party_invite/accept/decline/leave/kick, where.
// Avisos da zona: hb, release, transfer_saved, transfer_cancel, transfer_abort, online, moved, send,
//   party_chat, party_state, clan, mod, announce, draining, bye.
// Avisos do mundo: welcome, refused, hb_ack, zones, presence, kick, deliver, party, party_clear, clan,
//   mod, announce.
//
// Transferência sem dois donos: a posse passa a "em transferência" quando o mundo emite o token, mas
// continua contando como da zona de origem até ela avisar que gravou e soltou o personagem
// (transfer_saved). Antes disso, um login direto derruba o personagem na origem (como um login
// comum) e a chegada no destino espera o aviso.
import http from 'node:http';
import { WebSocketServer } from 'ws';
import { createHmac, timingSafeEqual, randomBytes, randomUUID } from 'node:crypto';
import { signToken } from './token.js';

const PARTY_MAX = 5;
const INVITE_MS = 120000;
const INBOX_MAX = 32;   // mensagens guardadas para quem está no meio de uma transferência
const CHAT_KEEP = 20;   // falas que acompanham o personagem na transferência (contexto de denúncias)
const ZONE_ID_RE = /^[A-Za-z0-9_.-]{1,40}$/;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Autenticação da zona no hello: HMAC-SHA256 do id da zona e do instante, com o segredo do mundo. */
export function zoneAuth(secret, zoneId, ts) {
  return createHmac('sha256', secret).update(`${zoneId}:${ts}`).digest('hex');
}

// falas que acompanham o personagem (só o formato esperado, no máximo CHAT_KEEP)
function chatOf(list) {
  if (!Array.isArray(list)) return null;
  return list.filter((l) => l && typeof l.text === 'string').slice(-CHAT_KEEP)
    .map((l) => ({ at: Number(l.at) || 0, channel: String(l.channel ?? '').slice(0, 16), text: l.text.slice(0, 200) }));
}

// recargas que acompanham o personagem (tempo restante em ms; no máximo 10 min cada)
function timersOf(t) {
  if (!t || typeof t !== 'object') return null;
  const ms = (v) => Math.max(0, Math.min(600000, Math.round(Number(v) || 0)));
  const cd = Object.fromEntries(Object.entries(t.cd && typeof t.cd === 'object' ? t.cd : {}).filter(([k]) => typeof k === 'string' && k.length <= 40).slice(0, 40).map(([k, v]) => [k, ms(v)]));
  return { cd, potion: ms(t.potion) };
}

function sameText(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

export class WorldService {
  constructor(opts = {}) {
    this.opts = {
      port: 7790, host: '127.0.0.1', secret: null, heartbeatMs: 2000, downAfterMs: 10000, transferTtlS: 30, authSkewMs: 30000, log: true,
      ...Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined)),
    };
    if (!this.opts.secret) throw new Error('serviço de mundo precisa de --secret (ou CINZAS_WORLD_SECRET)');
    this.boot = randomBytes(3).toString('hex'); // posses de outra execução do mundo nunca colidem
    this.seq = 0;
    this.zones = new Map();       // zoneId -> { id, ws, maps:Set, publicUrl, players, lastSeen, connected, since }
    this.mapOwner = new Map();    // mapId -> zoneId
    this.leases = new Map();      // charId -> { zoneId, state:'online'|'transferring', to, until, epoch, accountId, name, mapId, jti, saved, inbox, chat }
    this.online = new Map();      // charId -> { name, accountId, zoneId, mapId } (diretório)
    this.names = new Map();       // nome minúsculo -> charId
    this.parties = new Map();     // partyId -> { id, leader, members:Set, names:Map }
    this.charParty = new Map();   // charId -> partyId
    this.invites = new Map();     // charId convidado -> { from, at }
    this.memberState = new Map(); // charId -> resumo mandado pela zona (nível, vida, posição)
    this.partySent = new Map();   // partyId -> última visão enviada (JSON)
    this.waiters = new Map();     // charId -> Set(fn) esperando a posse mudar
    this.helloSeen = new Map();   // `${zoneId}:${ts}` -> instante (hello repetido é recusado)
  }

  log(...a) { if (this.opts.log) console.log(new Date().toISOString().slice(11, 19), '[mundo]', ...a); }

  start() {
    this.startedAt = Date.now();
    this.http = http.createServer((req, res) => this.onHttp(req, res));
    this.wss = new WebSocketServer({ server: this.http, maxPayload: 4 * 1024 * 1024 });
    this.wss.on('connection', (ws) => this.onConnection(ws));
    this.timer = setInterval(() => this.sweep(), Math.max(50, Math.floor(this.opts.heartbeatMs / 2)));
    return new Promise((resolve) => this.http.listen(this.opts.port, this.opts.host, () => {
      this.port = this.http.address().port;
      this.log(`serviço de mundo em ws://${this.opts.host}:${this.port} (sinal das zonas a cada ${this.opts.heartbeatMs} ms; fora do ar após ${this.opts.downAfterMs} ms)`);
      resolve(this.port);
    }));
  }

  async stop() {
    clearInterval(this.timer);
    for (const ws of this.wss.clients) ws.terminate();
    await new Promise((r) => this.wss.close(() => r()));
    await new Promise((r) => this.http.close(() => r()));
  }

  // GET /saude: zonas, mapas, jogadores e posses (para monitorar)
  onHttp(req, res) {
    const url = (req.url || '/').split('?')[0];
    if (req.method === 'GET' && (url === '/saude' || url === '/health')) {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify(this.status()));
    }
    res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, erro: 'Rota inexistente.' }));
  }

  status() {
    const now = Date.now();
    return {
      ok: true, online: this.online.size, posses: this.leases.size, grupos: this.parties.size,
      zonas: [...this.zones.values()].map((z) => ({ id: z.id, mapas: [...z.maps], endereco: z.publicUrl, jogadores: z.players, conectada: z.connected, silencioMs: now - z.lastSeen })),
    };
  }

  // ---------- conexões das zonas ----------
  onConnection(ws) {
    let zone = null;
    const helloTimer = setTimeout(() => { if (!zone) ws.terminate(); }, 5000);
    ws.on('message', (buf) => {
      let m;
      try { m = JSON.parse(buf.toString()); } catch { return; }
      if (!m || typeof m !== 'object') return;
      if (!zone) {
        if (m.t !== 'hello') { ws.close(1008, 'hello'); return; }
        zone = this.onHello(ws, m);
        if (zone) clearTimeout(helloTimer);
        return;
      }
      if (zone.ws !== ws || this.zones.get(zone.id) !== zone) return; // conexão antiga ou zona já dada como fora do ar
      zone.lastSeen = Date.now();
      this.onZoneMessage(zone, m).catch((e) => this.log('erro ao tratar', m.t, e.message));
    });
    ws.on('close', () => {
      clearTimeout(helloTimer);
      if (zone && zone.ws === ws && zone.connected) {
        zone.connected = false;
        this.log(`zona ${zone.id} desconectou (posses mantidas até ${this.opts.downAfterMs} ms sem sinal)`);
        this.broadcastZones();
      }
    });
    ws.on('error', () => {});
  }

  onHello(ws, m) {
    const refuse = (reason) => {
      this.log(`zona recusada (${typeof m.zoneId === 'string' ? m.zoneId.slice(0, 40) : '?'}): ${reason}`);
      try { ws.send(JSON.stringify({ t: 'refused', reason })); } catch { /* fechada */ }
      ws.close(1008, 'recusada');
      return null;
    };
    const now = Date.now();
    if (typeof m.zoneId !== 'string' || !ZONE_ID_RE.test(m.zoneId)) return refuse('identificador de zona inválido');
    if (typeof m.ts !== 'number' || Math.abs(now - m.ts) > this.opts.authSkewMs) return refuse('horário da autenticação fora do prazo');
    if (typeof m.auth !== 'string' || !sameText(m.auth, zoneAuth(this.opts.secret, m.zoneId, m.ts))) return refuse('autenticação inválida');
    for (const [k, at] of this.helloSeen) if (now - at > this.opts.authSkewMs * 2) this.helloSeen.delete(k);
    const key = `${m.zoneId}:${m.ts}`;
    if (this.helloSeen.has(key)) return refuse('autenticação repetida');
    this.helloSeen.set(key, now);
    const maps = Array.isArray(m.maps) ? [...new Set(m.maps.filter((x) => typeof x === 'string' && x.length > 0 && x.length <= 64))] : [];
    if (!maps.length) return refuse('nenhum mapa informado');
    if (typeof m.publicUrl !== 'string' || !/^wss?:\/\/\S+$/.test(m.publicUrl)) return refuse('endereço público inválido');
    const old = this.zones.get(m.zoneId);
    if (old && old.connected && old.ws !== ws && old.ws.readyState === 1) return refuse(`a zona ${m.zoneId} já está conectada`);
    for (const map of maps) {
      const owner = this.mapOwner.get(map);
      if (owner && owner !== m.zoneId) return refuse(`o mapa ${map} já é da zona ${owner}`);
    }
    let z = old;
    if (z) {
      for (const map of z.maps) if (!maps.includes(map) && this.mapOwner.get(map) === z.id) this.mapOwner.delete(map);
      Object.assign(z, { ws, maps: new Set(maps), publicUrl: m.publicUrl, connected: true, draining: false, lastSeen: now });
    } else {
      z = { id: m.zoneId, ws, maps: new Set(maps), publicUrl: m.publicUrl, players: 0, lastSeen: now, connected: true, since: now };
      this.zones.set(z.id, z);
    }
    for (const map of maps) this.mapOwner.set(map, z.id);
    this.reconcile(z, Array.isArray(m.online) ? m.online : []);
    const parties = this.partiesInZone(z.id);
    this.send(z, { t: 'welcome', zoneId: z.id, hbMs: this.opts.heartbeatMs, downMs: this.opts.downAfterMs, zones: this.zoneList(), directory: this.directory(), parties });
    this.broadcastZones();
    for (const pid of parties) this.pushParty(pid, true);
    this.log(`zona ${z.id} ${old ? 'reconectada' : 'registrada'}: ${maps.join(', ')} em ${z.publicUrl}`);
    return z;
  }

  // Ao (re)conectar, a zona diz quem tem carregado. O que ela não tem mais é liberado; o que ela tem
  // e ninguém mais tem continua dela; o que já é de outra zona ela solta sem salvar.
  reconcile(z, list) {
    const claimed = new Map();
    for (const e of list) if (e && Number.isInteger(e.charId) && typeof e.name === 'string') claimed.set(e.charId, e);
    for (const [charId, l] of [...this.leases]) {
      if (claimed.has(charId) || l.zoneId !== z.id) continue;
      if (l.state === 'online') this.dropLease(charId);
      // saindo dela e ela não tem mais o personagem: já gravou (o aviso se perdeu com a conexão)
      else if (l.state === 'transferring' && !l.saved) { l.saved = true; this.changed(charId); }
    }
    for (const [charId, e] of claimed) {
      const l = this.leases.get(charId);
      const ours = !l || (l.state === 'online' && l.zoneId === z.id) || (l.state === 'transferring' && (l.to === z.id || l.zoneId === z.id));
      if (!ours) {
        this.send(z, { t: 'kick', charId, epoch: e.epoch ?? null, nosave: true, reason: 'Seu personagem entrou por outra zona.' });
        continue;
      }
      this.leases.set(charId, { zoneId: z.id, state: 'online', epoch: typeof e.epoch === 'string' ? e.epoch : this.nextEpoch(), accountId: e.accountId ?? null, name: e.name, mapId: e.mapId ?? null, since: Date.now() });
      this.setOnline(charId, { name: e.name, accountId: e.accountId ?? null, zoneId: z.id, mapId: e.mapId ?? null });
    }
  }

  isCurrent(z) { return this.zones.get(z.id) === z && z.connected; }
  nextEpoch() { return `${this.boot}.${++this.seq}`; }
  send(z, msg) { if (z?.ws?.readyState === 1) z.ws.send(JSON.stringify(msg)); }
  broadcast(msg, exceptZoneId = null) {
    const raw = JSON.stringify(msg);
    for (const z of this.zones.values()) if (z.id !== exceptZoneId && z.connected && z.ws.readyState === 1) z.ws.send(raw);
  }
  zoneList() { return [...this.zones.values()].map((z) => ({ id: z.id, maps: [...z.maps], url: z.publicUrl, up: z.connected && !z.draining })); }
  broadcastZones() { this.broadcast({ t: 'zones', zones: this.zoneList() }); }
  directory() { return [...this.online].map(([charId, o]) => ({ charId, name: o.name, zoneId: o.zoneId })); }
  owns(z, charId) { const l = this.leases.get(charId); return !!l && l.state === 'online' && l.zoneId === z.id; }

  async onZoneMessage(z, m) {
    const reply = (r) => { if (m.id != null) this.send(z, { t: 'res', id: m.id, ...r }); };
    switch (m.t) {
      case 'hb': z.players = Number(m.players) || 0; return this.send(z, { t: 'hb_ack' });
      case 'acquire': {
        // o que chegou para o personagem durante a transferência vai depois da resposta (ele já está na zona)
        const { inbox, ...r } = await this.acquire(z, m);
        reply(r);
        for (const it of inbox ?? []) this.deliver(m.charId, it.msg, it.note);
        return;
      }
      case 'release': return this.release(z, m);
      case 'transfer': return reply(this.transfer(z, m));
      case 'transfer_saved': return this.transferSaved(z, m);
      case 'transfer_cancel': return this.transferCancel(z, m);
      case 'transfer_abort': return this.transferAbort(z, m);
      case 'online': return this.onOnline(z, m);
      case 'moved': return this.onMoved(z, m);
      case 'send': this.deliver(m.to, m.msg, m.note); return;
      case 'party_invite': return reply(this.partyInvite(z, m));
      case 'party_accept': return reply(this.partyAccept(z, m));
      case 'party_decline': return reply(this.partyDecline(z, m));
      case 'party_leave': return reply(this.partyLeave(z, m));
      case 'party_kick': return reply(this.partyKick(z, m));
      case 'party_chat': return this.partyChat(z, m);
      case 'party_state': return this.partyState(z, m);
      case 'clan': { const { id, ...evt } = m; return this.broadcast(evt, z.id); }
      case 'mod': return this.modRoute(z, m);
      case 'announce':
        if (typeof m.text === 'string' && m.text) this.broadcast({ t: 'announce', text: m.text.slice(0, 300) }, z.id);
        return;
      case 'where': return reply(this.where(m));
      case 'draining': z.draining = true; return this.broadcastZones(); // desligando: não recebe mais transferências
      case 'bye': return this.zoneDown(z, 'desligada');
      default: return reply({ ok: false, code: 'unknown', reason: `Pedido desconhecido: ${m.t}` });
    }
  }

  // ---------- posse ----------
  // Espera a posse do personagem mudar (liberada ou concedida a outra zona) ou o prazo vencer.
  waitChange(charId, ms) {
    return new Promise((resolve) => {
      let set = this.waiters.get(charId);
      if (!set) this.waiters.set(charId, (set = new Set()));
      const done = (v) => {
        clearTimeout(timer);
        set.delete(done);
        if (!set.size && this.waiters.get(charId) === set) this.waiters.delete(charId);
        resolve(v);
      };
      const timer = setTimeout(() => done(false), ms);
      set.add(done);
    });
  }

  changed(charId) { const set = this.waiters.get(charId); if (set) for (const fn of [...set]) fn(true); }

  dropLease(charId) {
    if (!this.leases.delete(charId)) return;
    this.setOffline(charId);
    this.changed(charId);
  }

  // Posses que impedem a zona z de pegar o personagem: ele mesmo on-line em outra zona e, como no
  // servidor único, outro personagem da mesma conta on-line em outra zona (uma sessão por conta).
  // A posse "segura" o personagem na zona l.zoneId: on-line, ou em transferência que a origem ainda
  // não gravou (ela ainda pode ter o personagem carregado).
  holds(l) { return l.state === 'online' || (l.state === 'transferring' && !l.saved); }

  conflictsFor(z, m) {
    const list = [];
    let wait = false;
    const l = this.leases.get(m.charId);
    const stale = { ok: false, code: 'stale_transfer', reason: 'Esta transferência não vale mais. Entre de novo.' };
    if (m.transfer) {
      // chegada: só vale a transferência que o mundo emitiu para esta zona (mesmo jti) e que não venceu
      // nem foi cancelada por um login direto; um token copiado não serve depois disso
      if (!l || l.state !== 'transferring' || l.to !== z.id || l.jti !== m.transfer.jti) return { error: stale };
      if (!l.saved) wait = true; // a origem ainda não avisou que gravou: espera (não derruba nada)
    } else if (l && this.holds(l) && l.zoneId !== z.id) {
      list.push([m.charId, l]);
    }
    // (login comum durante uma transferência já gravada: ninguém tem o personagem carregado; ela é cancelada)
    if (m.accountId != null) {
      for (const [cid, o] of this.leases) if (cid !== m.charId && this.holds(o) && o.accountId === m.accountId && o.zoneId !== z.id) list.push([cid, o]);
    }
    return { list, wait };
  }

  async acquire(z, m) {
    if (!Number.isInteger(m.charId) || typeof m.name !== 'string') return { ok: false, code: 'bad_request', reason: 'Pedido inválido.' };
    // Logo depois de o mundo (re)começar, espera as zonas vivas se apresentarem e reclamarem quem
    // têm carregado; senão o mesmo personagem poderia ganhar dois donos.
    const grace = this.startedAt + this.opts.downAfterMs - Date.now();
    if (grace > 0 && !this.leases.has(m.charId)) await sleep(grace);
    const deadline = Date.now() + this.opts.downAfterMs + 5000;
    for (;;) {
      if (!this.isCurrent(z)) return { ok: false, code: 'world_down', reason: 'Zona desconectada do mundo.' };
      const { error, list, wait } = this.conflictsFor(z, m);
      if (error) return error;
      if (!list.length && !wait) break;
      for (const [cid, l] of list) {
        const holder = this.zones.get(l.zoneId);
        if (holder?.connected && !l.kickSent) {
          l.kickSent = true;
          this.send(holder, { t: 'kick', charId: cid, epoch: l.epoch, reason: 'Sua conta entrou em outra conexão.' });
        }
      }
      const left = deadline - Date.now();
      if (left <= 0) return { ok: false, code: 'busy', reason: 'Seu personagem ainda está saindo de outra zona. Tente de novo em instantes.' };
      // a zona que tinha o personagem salva e solta; se ela caiu, a posse é liberada quando ela for dada como fora do ar
      await this.waitChange(list.length ? list[0][0] : m.charId, left);
    }
    const epoch = this.nextEpoch();
    const prev = this.leases.get(m.charId);
    this.leases.set(m.charId, { zoneId: z.id, state: 'online', epoch, accountId: m.accountId ?? prev?.accountId ?? null, name: m.name, mapId: m.mapId ?? null, since: Date.now() });
    if (prev?.state === 'transferring' && prev.to !== z.id) {
      // a transferência foi cancelada por um login direto: a outra zona deixa de esperar o personagem
      const o = this.online.get(m.charId);
      if (o) this.setOnline(m.charId, { ...o, zoneId: z.id });
    }
    this.changed(m.charId);
    const arrived = m.transfer && prev?.state === 'transferring';
    return { ok: true, epoch, ...(arrived && prev.chat ? { chat: prev.chat } : {}), ...(arrived && prev.timers ? { timers: prev.timers } : {}),
      ...(arrived && prev.inbox?.length ? { inbox: prev.inbox } : {}) };
  }

  release(z, m) {
    const l = this.leases.get(m.charId);
    if (!l || l.zoneId !== z.id) return;
    if (m.epoch != null && l.epoch !== m.epoch) return; // liberação atrasada de uma posse antiga
    this.dropLease(m.charId);
  }

  // Token de transferência para o mapa de outra zona; a posse fica "em transferência" por 30 s.
  // saved: a origem já gravou e não tem o personagem carregado (entrada que só redireciona); senão ela
  // grava, solta e avisa com transfer_saved antes de mandar o token ao cliente.
  transfer(z, m) {
    const l = this.leases.get(m.charId);
    if (!l || l.state !== 'online' || l.zoneId !== z.id) return { ok: false, code: 'no_lease', reason: 'Seu personagem não está nesta zona.' };
    const toId = this.mapOwner.get(m.mapId);
    const to = toId ? this.zones.get(toId) : null;
    if (!to || !to.connected || to.draining) return { ok: false, code: 'zone_down', reason: 'Essa área está fora do ar no momento. Tente em instantes.' };
    if (to.id === z.id) return { ok: false, code: 'same_zone', reason: 'Esse mapa é desta zona.' };
    const ttl = this.opts.transferTtlS;
    const x = Number(m.x) || 0, zz = Number(m.z) || 0;
    const token = signToken({ typ: 'transfer', charId: m.charId, accountId: l.accountId, from: z.id, to: to.id, mapId: m.mapId, x, z: zz }, this.opts.secret, ttl);
    const jti = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString()).jti;
    Object.assign(l, { state: 'transferring', to: to.id, until: Date.now() + ttl * 1000, fromMapId: l.mapId, mapId: m.mapId, jti, saved: !!m.saved, inbox: [], chat: chatOf(m.chat), kickSent: false });
    const o = this.online.get(m.charId);
    if (o) this.setOnline(m.charId, { ...o, zoneId: to.id, mapId: m.mapId });
    if (l.saved) this.changed(m.charId);
    this.log(`transferência: ${l.name} de ${z.id} para ${to.id} (${m.mapId})`);
    return { ok: true, url: to.publicUrl, token, mapId: m.mapId, to: to.id, jti };
  }

  // A origem gravou e soltou o personagem: a chegada no destino (ou um login direto) pode seguir.
  transferSaved(z, m) {
    const l = this.leases.get(m.charId);
    if (!l || l.state !== 'transferring' || l.zoneId !== z.id || l.jti !== m.jti) return;
    l.saved = true;
    if (m.chat) l.chat = chatOf(m.chat);
    if (m.timers) l.timers = timersOf(m.timers);
    this.changed(m.charId);
  }

  // A zona de origem desistiu da transferência (o personagem continua nela).
  transferCancel(z, m) {
    const l = this.leases.get(m.charId);
    if (!l || l.state !== 'transferring' || l.zoneId !== z.id) return;
    Object.assign(l, { state: 'online', to: null, until: null, jti: null, saved: false, inbox: null, mapId: m.mapId ?? l.fromMapId ?? l.mapId });
    const o = this.online.get(m.charId);
    if (o) this.setOnline(m.charId, { ...o, zoneId: z.id, mapId: l.mapId });
  }

  // O destino recusou a chegada depois de conferir o token (ex.: conta suspensa): o personagem, já
  // gravado pela origem, fica livre.
  transferAbort(z, m) {
    const l = this.leases.get(m.charId);
    if (!l || l.state !== 'transferring' || l.to !== z.id || l.jti !== m.jti || !l.saved) return;
    this.dropLease(m.charId);
  }

  onOnline(z, m) {
    if (!this.owns(z, m.charId) || typeof m.name !== 'string') return;
    const l = this.leases.get(m.charId);
    l.mapId = m.mapId ?? l.mapId;
    if (m.state) this.memberState.set(m.charId, m.state);
    this.setOnline(m.charId, { name: m.name, accountId: l.accountId, zoneId: z.id, mapId: l.mapId });
  }

  onMoved(z, m) {
    if (!this.owns(z, m.charId)) return;
    this.leases.get(m.charId).mapId = m.mapId;
    const o = this.online.get(m.charId);
    if (o) this.setOnline(m.charId, { ...o, mapId: m.mapId });
  }

  setOnline(charId, o) {
    const prev = this.online.get(charId);
    this.online.set(charId, o);
    if (prev && prev.name.toLowerCase() !== o.name.toLowerCase() && this.names.get(prev.name.toLowerCase()) === charId) this.names.delete(prev.name.toLowerCase());
    this.names.set(o.name.toLowerCase(), charId);
    if (!prev || prev.zoneId !== o.zoneId) this.broadcast({ t: 'presence', charId, name: o.name, zoneId: o.zoneId, online: true });
    const pid = this.charParty.get(charId);
    if (pid) this.pushParty(pid, !prev || prev.zoneId !== o.zoneId);
  }

  setOffline(charId) {
    const o = this.online.get(charId);
    if (!o) return;
    this.online.delete(charId);
    if (this.names.get(o.name.toLowerCase()) === charId) this.names.delete(o.name.toLowerCase());
    this.memberState.delete(charId);
    this.invites.delete(charId);
    this.broadcast({ t: 'presence', charId, name: o.name, zoneId: o.zoneId, online: false });
    const pid = this.charParty.get(charId);
    if (pid) {
      const party = this.parties.get(pid);
      if (party && ![...party.members].some((c) => this.online.has(c))) this.disbandParty(pid);
      else this.pushParty(pid, true);
    }
  }

  // ---------- zonas fora do ar e prazos ----------
  sweep() {
    const now = Date.now();
    for (const z of [...this.zones.values()]) if (now - z.lastSeen > this.opts.downAfterMs) this.zoneDown(z, 'sem sinal');
    for (const [charId, l] of [...this.leases]) {
      if (l.state !== 'transferring' || l.until > now) continue;
      this.log(`transferência de ${l.name} venceu sem chegada`);
      // gravada: ninguém tem o personagem; sem aviso da origem: a posse volta para ela (se ela não tiver
      // mais o personagem, o próximo login pede e ela libera)
      if (l.saved) this.dropLease(charId);
      else this.transferCancel(this.zones.get(l.zoneId) ?? { id: l.zoneId }, { charId });
    }
    for (const [cid, inv] of this.invites) if (now - inv.at > INVITE_MS) this.invites.delete(cid);
  }

  zoneDown(z, why) {
    if (this.zones.get(z.id) !== z) return;
    this.zones.delete(z.id);
    z.connected = false;
    for (const [m, id] of [...this.mapOwner]) if (id === z.id) this.mapOwner.delete(m);
    let n = 0;
    for (const [charId, l] of [...this.leases]) {
      // on-line nela; saindo dela sem ter gravado (a memória dela se perdeu); ou indo para ela já gravado.
      // Indo para ela sem a origem ter gravado: fica até a origem avisar (ela ainda tem o personagem).
      const gone = (l.state === 'online' && l.zoneId === z.id)
        || (l.state === 'transferring' && l.zoneId === z.id && !l.saved)
        || (l.state === 'transferring' && l.to === z.id && l.saved);
      if (gone) { this.dropLease(charId); n++; }
    }
    try { z.ws.terminate(); } catch { /* já fechada */ }
    this.log(`zona ${z.id} fora do ar (${why}): ${n} posse(s) liberada(s)`);
    this.broadcastZones();
  }

  // ---------- mensagens entre zonas ----------
  deliver(charId, msg, note = undefined) {
    const l = this.leases.get(charId);
    if (!l) return false;
    if (l.state === 'transferring') {
      // no meio da transferência: entrega quando ele chegar ao destino
      if (l.inbox && l.inbox.length < INBOX_MAX) l.inbox.push({ msg, note });
      return true;
    }
    const z = this.zones.get(l.zoneId);
    if (!z?.connected) return false;
    this.send(z, { t: 'deliver', charId, msg, note });
    return true;
  }

  // ---------- moderação e anúncios ----------
  // Expulsão, suspensão e silêncio valem por conta: vai para todas as outras zonas, e cada uma aplica
  // na sessão da conta que tiver (com ou sem personagem no mundo).
  modRoute(z, m) {
    if (!Number.isInteger(m.accountId)) return;
    const evt = { t: 'mod', accountId: m.accountId };
    if (typeof m.kick === 'string') evt.kick = m.kick.slice(0, 300);
    if (typeof m.mutedUntil === 'number') evt.mutedUntil = m.mutedUntil;
    if (typeof m.text === 'string') evt.text = m.text.slice(0, 300);
    this.broadcast(evt, z.id);
  }

  // "onde está" de quem está on-line em outra zona
  where({ name }) {
    const charId = typeof name === 'string' ? this.names.get(name.trim().toLowerCase()) : null;
    const o = charId != null ? this.online.get(charId) : null;
    if (!o) return { ok: false, code: 'offline' };
    return { ok: true, charId, name: o.name, zoneId: o.zoneId, mapId: o.mapId ?? null, transferring: this.leases.get(charId)?.state === 'transferring' };
  }

  // ---------- grupos ----------
  partyInvite(z, { charId, name }) {
    const me = this.online.get(charId);
    if (!me || !this.owns(z, charId)) return { ok: false, code: 'not_in_world', reason: 'Personagem fora do mundo.' };
    const targetId = typeof name === 'string' ? this.names.get(name.trim().toLowerCase()) : null;
    if (!targetId) return { ok: false, code: 'offline', reason: `${name} não está conectado.` };
    if (targetId === charId) return { ok: false, code: 'self', reason: 'Você não pode se convidar.' };
    if (this.charParty.has(targetId)) return { ok: false, code: 'in_party', reason: `${name} já está em um grupo.` };
    const pid = this.charParty.get(charId);
    if (pid && this.parties.get(pid).members.size >= PARTY_MAX) return { ok: false, code: 'full', reason: `Grupo cheio (máximo ${PARTY_MAX}).` };
    if (pid && this.parties.get(pid).leader !== charId) return { ok: false, code: 'not_leader', reason: 'Só o líder pode convidar.' };
    this.invites.set(targetId, { from: charId, at: Date.now() });
    this.deliver(targetId, { t: 'party_invite', from: me.name, fromId: charId });
    return { ok: true };
  }

  partyAccept(z, { charId, from }) {
    const me = this.online.get(charId);
    if (!me || !this.owns(z, charId)) return { ok: false, code: 'not_in_world', reason: 'Personagem fora do mundo.' };
    const inv = this.invites.get(charId);
    if (!inv || (from != null && inv.from !== from) || Date.now() - inv.at > INVITE_MS) return { ok: false, code: 'no_invite', reason: 'Convite inexistente ou expirado.' };
    this.invites.delete(charId);
    if (this.charParty.has(charId)) return { ok: false, code: 'in_party', reason: 'Você já está em um grupo.' };
    const inviter = this.online.get(inv.from);
    if (!inviter) return { ok: false, code: 'offline', reason: 'Quem convidou saiu.' };
    let pid = this.charParty.get(inv.from);
    if (!pid) {
      do pid = randomUUID().slice(0, 8); while (this.parties.has(pid));
      this.parties.set(pid, { id: pid, leader: inv.from, members: new Set([inv.from]), names: new Map([[inv.from, inviter.name]]) });
      this.charParty.set(inv.from, pid);
    }
    const party = this.parties.get(pid);
    if (party.members.size >= PARTY_MAX) return { ok: false, code: 'full', reason: `Grupo cheio (máximo ${PARTY_MAX}).` };
    party.members.add(charId);
    party.names.set(charId, me.name);
    this.charParty.set(charId, pid);
    this.pushParty(pid, true);
    return { ok: true, pid, party: this.partyView(pid) };
  }

  partyDecline(z, { charId }) {
    const inv = this.invites.get(charId);
    this.invites.delete(charId);
    if (inv) this.deliver(inv.from, { t: 'system', text: `${this.online.get(charId)?.name ?? 'Alguém'} recusou o convite.` });
    return { ok: true };
  }

  partyLeave(z, { charId }) {
    if (!this.charParty.has(charId)) return { ok: false, code: 'no_party', reason: 'Você não está em um grupo.' };
    this.removeFromParty(charId);
    return { ok: true };
  }

  partyKick(z, { charId, target }) {
    const pid = this.charParty.get(charId);
    const party = pid && this.parties.get(pid);
    if (!party) return { ok: false, code: 'no_party', reason: 'Você não está em um grupo.' };
    if (party.leader !== charId) return { ok: false, code: 'not_leader', reason: 'Só o líder pode remover membros.' };
    if (!party.members.has(target) || target === charId) return { ok: false, code: 'bad_target', reason: 'Membro inválido.' };
    this.removeFromParty(target);
    return { ok: true };
  }

  // a zona de quem falou já entregou aos membros dela; aqui vai para os das outras zonas
  partyChat(z, { charId, msg }) {
    const pid = this.charParty.get(charId);
    if (!pid || !msg) return;
    for (const m of this.parties.get(pid).members) if (this.online.get(m)?.zoneId !== z.id) this.deliver(m, msg, { kind: 'chat', from: charId });
  }

  partyState(z, { members }) {
    if (!Array.isArray(members)) return;
    const pids = new Set();
    for (const s of members) {
      if (!s || !this.owns(z, s.charId)) continue;
      this.memberState.set(s.charId, s);
      const pid = this.charParty.get(s.charId);
      if (pid) pids.add(pid);
    }
    for (const pid of pids) this.pushParty(pid);
  }

  removeFromParty(charId) {
    const pid = this.charParty.get(charId);
    if (!pid) return;
    const party = this.parties.get(pid);
    this.charParty.delete(charId);
    party.members.delete(charId);
    this.clearParty(pid, [charId], false);
    if (party.members.size <= 1) return this.disbandParty(pid);
    if (party.leader === charId) party.leader = [...party.members][0];
    this.pushParty(pid, true);
  }

  disbandParty(pid) {
    const party = this.parties.get(pid);
    if (!party) return;
    for (const m of party.members) this.charParty.delete(m);
    this.clearParty(pid, [...party.members], true);
    this.parties.delete(pid);
    this.partySent.delete(pid);
  }

  // avisa as zonas desses personagens que eles não estão mais no grupo
  clearParty(pid, charIds, disband) {
    const byZone = new Map();
    for (const c of charIds) {
      const zid = this.online.get(c)?.zoneId;
      if (!zid) continue;
      if (!byZone.has(zid)) byZone.set(zid, []);
      byZone.get(zid).push(c);
    }
    for (const [zid, list] of byZone) this.send(this.zones.get(zid), { t: 'party_clear', pid, charIds: list, disband });
  }

  partyView(pid) {
    const party = this.parties.get(pid);
    if (!party) return null;
    return {
      id: pid, leader: party.leader,
      members: [...party.members].map((charId) => {
        const o = this.online.get(charId);
        if (!o) return { charId, name: party.names.get(charId), online: false };
        const st = this.memberState.get(charId) ?? {};
        return { charId, name: o.name, classId: st.classId ?? null, level: st.level ?? 1, hp: st.hp ?? 0, mhp: st.mhp ?? 1, mp: st.mp ?? 0, mmp: st.mmp ?? 0,
          mapId: o.mapId ?? st.mapId ?? null, x: st.x ?? 0, z: st.z ?? 0, dead: !!st.dead, online: true, zoneId: o.zoneId };
      }),
    };
  }

  pushParty(pid, force = false) {
    const party = this.parties.get(pid);
    if (!party) return;
    const view = this.partyView(pid);
    const json = JSON.stringify(view);
    if (!force && this.partySent.get(pid) === json) return;
    this.partySent.set(pid, json);
    const zoneIds = new Set();
    for (const c of party.members) { const zid = this.online.get(c)?.zoneId; if (zid) zoneIds.add(zid); }
    for (const zid of zoneIds) this.send(this.zones.get(zid), { t: 'party', pid, view });
  }

  partiesInZone(zoneId) {
    const out = [];
    for (const [pid, party] of this.parties) if ([...party.members].some((c) => this.online.get(c)?.zoneId === zoneId)) out.push(pid);
    return out;
  }
}
