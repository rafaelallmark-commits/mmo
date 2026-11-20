// Ligação de um servidor de zona com o serviço de mundo (modo de várias zonas). Apresenta-se com
// HMAC, manda sinal de vida com o número de jogadores, faz pedidos com resposta (posse,
// transferência, grupos) e reconecta sozinha. Se ficar sem notícia do mundo perto do prazo em que
// ele daria esta zona como fora do ar, salva e desconecta os jogadores: assim, quando o mundo
// liberar as posses, ninguém mais tem o personagem carregado (nunca dois donos).
import WebSocket from 'ws';
import { zoneAuth } from './world.js';

const WORLD_DOWN = { ok: false, code: 'world_down', reason: 'O mundo está indisponível. Tente de novo em instantes.' };

export class WorldLink {
  // server: GameServer (onWorldWelcome, onWorldMessage, onWorldLost, worldOnlineList, playerCount, log)
  constructor(server, { url, secret }) {
    this.s = server;
    this.url = url;
    this.secret = secret;
    this.zoneId = null;
    this.publicUrl = null;
    this.maps = [];
    this.up = false;
    this.stopped = false;
    this.seq = 0;
    this.pending = new Map();
    this.hbMs = 2000;
    this.downMs = 10000;
    this.lastHeard = 0;
    this.fenced = false;
    this.readyWaiters = [];
  }

  // começa a perder o personagem quando passa disso sem notícia do mundo (antes de o mundo liberar)
  get fenceMs() { return Math.max(this.hbMs * 2, this.downMs * 0.6); }

  /** Pode gravar personagens? Não depois de tanto tempo sem o mundo que ele já pode ter liberado as posses. */
  canSave() { return !this.lastHeard || Date.now() - this.lastHeard < this.downMs * 0.8; }

  start() {
    this.checkTimer = setInterval(() => this.check(), 100);
    this.connect();
  }

  /** Resolve true quando a zona está registrada no mundo (ou false se o prazo vencer). */
  ready(ms) {
    if (this.up) return Promise.resolve(true);
    return new Promise((resolve) => {
      const w = (v) => { clearTimeout(timer); this.readyWaiters = this.readyWaiters.filter((x) => x !== w); resolve(v); };
      const timer = setTimeout(() => w(false), ms);
      this.readyWaiters.push(w);
    });
  }

  connect() {
    if (this.stopped) return;
    const ws = new WebSocket(this.url, { maxPayload: 4 * 1024 * 1024 });
    this.ws = ws;
    ws.on('open', () => {
      const ts = Date.now();
      ws.send(JSON.stringify({ t: 'hello', zoneId: this.zoneId, maps: this.maps, publicUrl: this.publicUrl, ts, auth: zoneAuth(this.secret, this.zoneId, ts), online: this.s.worldOnlineList() }));
    });
    ws.on('message', (buf) => {
      if (ws !== this.ws) return;
      let m;
      try { m = JSON.parse(buf.toString()); } catch { return; }
      this.lastHeard = Date.now();
      this.onMessage(m);
    });
    ws.on('close', () => { if (ws === this.ws) this.onDown(); });
    ws.on('error', () => {});
  }

  onMessage(m) {
    switch (m.t) {
      case 'welcome': {
        this.up = true;
        this.fenced = false;
        this.refused = null;
        this.hbMs = Number(m.hbMs) || this.hbMs;
        this.downMs = Number(m.downMs) || this.downMs;
        clearInterval(this.hbTimer);
        this.hbTimer = setInterval(() => this.notify('hb', { players: this.s.playerCount() }), this.hbMs);
        this.notify('hb', { players: this.s.playerCount() });
        this.s.onWorldWelcome(m);
        for (const w of [...this.readyWaiters]) w(true);
        return;
      }
      case 'refused':
        if (this.refused !== m.reason) this.s.log(`o serviço de mundo recusou esta zona: ${m.reason}`);
        this.refused = m.reason;
        return;
      case 'hb_ack': return;
      case 'res': {
        const p = this.pending.get(m.id);
        if (!p) return;
        this.pending.delete(m.id);
        clearTimeout(p.timer);
        const { t, id, ...rest } = m;
        p.resolve(rest);
        return;
      }
      default: this.s.onWorldMessage(m);
    }
  }

  onDown() {
    const was = this.up;
    this.up = false;
    clearInterval(this.hbTimer);
    this.hbTimer = null;
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.resolve({ ...WORLD_DOWN }); }
    this.pending.clear();
    if (this.stopped) return;
    if (was) this.s.log('conexão com o serviço de mundo caiu; tentando de novo');
    clearTimeout(this.retry);
    this.retry = setTimeout(() => this.connect(), was ? 200 : Math.min(2000, Math.max(200, this.hbMs)));
  }

  check() {
    if (this.stopped || this.fenced || !this.lastHeard) return;
    if (Date.now() - this.lastHeard > this.fenceMs) {
      this.fenced = true;
      this.s.onWorldLost();
    }
  }

  request(t, payload = {}, timeoutMs = 8000) {
    if (!this.up || this.ws?.readyState !== 1) return Promise.resolve({ ...WORLD_DOWN });
    const id = ++this.seq;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve({ ok: false, code: 'world_timeout', reason: 'O mundo não respondeu. Tente de novo.' });
      }, timeoutMs);
      this.pending.set(id, { resolve, timer });
      this.ws.send(JSON.stringify({ t, id, ...payload }));
    });
  }

  notify(t, payload = {}) {
    if (this.up && this.ws?.readyState === 1) this.ws.send(JSON.stringify({ t, ...payload }));
  }

  /** Desligamento: avisa o mundo (que libera o que restar desta zona) e fecha. */
  async stop() {
    this.stopped = true;
    clearTimeout(this.retry); clearInterval(this.hbTimer); clearInterval(this.checkTimer);
    const ws = this.ws;
    if (!ws) return;
    if (this.up && ws.readyState === 1) ws.send(JSON.stringify({ t: 'bye' }));
    this.up = false;
    await new Promise((r) => {
      if (ws.readyState === 3) return r();
      const t = setTimeout(() => { ws.terminate(); r(); }, 1000);
      ws.once('close', () => { clearTimeout(t); r(); });
      ws.close();
    });
  }

  /** Queda sem aviso (testes): fecha a conexão sem liberar nada. */
  kill() {
    this.stopped = true;
    clearTimeout(this.retry); clearInterval(this.hbTimer); clearInterval(this.checkTimer);
    this.up = false;
    this.ws?.terminate();
  }
}
