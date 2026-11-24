// Cliente simulado para testes: fala o mesmo protocolo JSON do cliente Godot.
import WebSocket from 'ws';

export class SimClient {
  // opts.delta: pede snapshots por diferença no login e reconstrói o estado completo (como o Godot)
  constructor(label, opts = {}) {
    this.label = label;
    this.delta = !!opts.delta;
    this.known = new Map();
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
    if (m.t === 'snap') this.snap = m.d ? this.mergeSnap(m) : m;
    else if (m.t === 'defs') this.defs = m;
    else if (m.t === 'char') this.char = m.char;
    else if (m.t === 'loot') this.loot.set(m.loot.id, m.loot);
    else if (m.t === 'zone') { this.known = new Map(); this.snap = m.snapshot; this.char = m.char; this.loot = new Map(m.loot.map((l) => [l.id, l])); }
    else if (m.t === 'party') this.party = m.party;
    else if (m.t === 'trial' && m.char) this.char = m.char;
    this.push(m);
  }

  mergeSnap(m) {
    if (m.full) this.known = new Map();
    const updated = new Set();
    for (const d of m.ents) {
      const e = { ...(this.known.get(d.id) ?? {}), ...d };
      if ('x' in d) { e._px = d.x; e._pz = d.z; e._pt = m.now; }
      this.known.set(d.id, e);
      updated.add(d.id);
    }
    for (const id of m.gone) this.known.delete(id);
    // previsão por velocidade para quem não veio neste snapshot (igual ao cliente Godot)
    for (const e of this.known.values()) {
      if (!updated.has(e.id) && (e.vx || e.vz) && e._pt != null) {
        const dts = (m.now - e._pt) / 1000;
        e.x = e._px + e.vx * dts; e.z = e._pz + e.vz * dts;
      }
    }
    return { t: 'snap', now: m.now, map: m.map, ents: [...this.known.values()], delta: m };
  }

  push(m) {
    m._at = Date.now();
    if (m.t !== 'snap') this.events.push(m);
    for (const w of [...this.waiters]) {
      if (w.pred(m)) { this.waiters.splice(this.waiters.indexOf(w), 1); clearTimeout(w.timer); w.resolve(m); }
    }
  }

  send(msg) { this.ws.send(JSON.stringify(msg)); }

  request(t, payload = {}, rid = `${this.label}-${++this.rid}`) {
    if (t === 'login' && this.delta) payload = { ...payload, delta: true };
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
