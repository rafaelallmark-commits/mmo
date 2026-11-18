// Cliente simulado para testes: fala o mesmo protocolo JSON do cliente Godot.
import WebSocket from 'ws';

export class SimClient {
  constructor(label) {
    this.label = label;
    this.rid = 0;
    this.pending = new Map();
    this.events = [];
    this.waiters = [];
    this.snap = null;
    this.char = null;
    this.loot = new Map();
    this.defs = null;
  }

  connect(url) {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);
      this.ws.on('open', resolve);
      this.ws.on('error', reject);
      this.ws.on('message', (buf) => this.onMessage(JSON.parse(buf.toString())));
      this.closed = new Promise((r) => this.ws.on('close', r));
    });
  }

  onMessage(m) {
    if (m.t === 'res') {
      const p = this.pending.get(m.rid);
      if (p) { this.pending.delete(m.rid); p(m); }
      if (m.char) this.char = m.char;
      // respostas duplicadas também viram eventos (para inspecionar idempotência)
      this.push(m);
      return;
    }
    if (m.t === 'snap') this.snap = m;
    else if (m.t === 'defs') this.defs = m;
    else if (m.t === 'char') this.char = m.char;
    else if (m.t === 'loot') this.loot.set(m.loot.id, m.loot);
    this.push(m);
  }

  push(m) {
    if (m.t !== 'snap') this.events.push(m);
    for (const w of [...this.waiters]) {
      if (w.pred(m)) { this.waiters.splice(this.waiters.indexOf(w), 1); clearTimeout(w.timer); w.resolve(m); }
    }
  }

  send(msg) { this.ws.send(JSON.stringify(msg)); }

  request(t, payload = {}, rid = `${this.label}-${++this.rid}`) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(rid); reject(new Error(`${this.label}: sem resposta para ${t}`)); }, 10000);
      this.pending.set(rid, (m) => { clearTimeout(timer); resolve(m); });
      this.send({ t, rid, ...payload });
    });
  }

  waitFor(pred, timeoutMs = 15000, what = 'evento') {
    return new Promise((resolve, reject) => {
      const w = { pred, resolve, timer: setTimeout(() => { this.waiters.splice(this.waiters.indexOf(w), 1); reject(new Error(`${this.label}: tempo esgotado esperando ${what}`)); }, timeoutMs) };
      this.waiters.push(w);
    });
  }

  entity(eid) { return this.snap?.ents.find((e) => e.id === eid) ?? null; }
  me() { return this.entity(this.char?.eid); }

  close() { this.ws.close(); return this.closed; }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
