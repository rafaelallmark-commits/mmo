// Cliente em processo: fala o mesmo protocolo JSON do cliente Godot, mas chama
// server.onMessage() direto (sem rede). Como o servidor responde de forma síncrona, pedir()
// devolve a resposta na hora. Snapshots completos são decodificados só quando o bot olha o mundo;
// snapshots por diferença (login com { delta: true }, quando o servidor suporta) são mesclados
// um a um, como em server/test/helpers/client.js (mergeSnap).

// Mensagens que o bot não usa: contadas, nunca decodificadas.
const IGNORADAS = new Set(['cast', 'buff', 'ground', 'shield', 'spawn', 'joined', 'left', 'chat', 'party', 'defs', 'quest_update', 'death']);

export class ClienteEmProcesso {
  constructor(server, rotulo) {
    this.server = server;
    this.rotulo = rotulo;
    this.rid = 0;
    this.ridEsperado = null;
    this.resposta = null;
    this.ents = new Map(); // visão do mundo: id -> entidade (como no snapshot)
    this.snapBruto = null; // último snapshot completo ainda não decodificado
    this.snapAgora = 0;
    this.delta = false; // o servidor está mandando diferenças
    this.aoEvento = null; // (msg) => void para eventos que não são resposta nem snapshot
    this.aoCombate = null; // (msg) => void para 'hit' e 'heal' (contabilidade de dano)
    this.contagem = { snap: 0, snapDelta: 0, ignoradas: 0, eventos: 0, respostas: 0, bytes: 0, pedidos: 0 };
    // Sessão falsa: { id, ws: { readyState: 1, send }, accountId, charId }. Quando o servidor tem
    // onConnection, a sessão nasce por ele (com um ws falso), para ganhar os campos que versões
    // mais novas esperam (ex.: balde do limite de comandos); senão é montada aqui.
    const ws = { readyState: 1, send: (raw) => this.receber(raw), close() {}, terminate() {}, on() {} };
    if (typeof server.onConnection === 'function') server.onConnection(ws, { socket: { remoteAddress: 'simulacao' }, headers: {} });
    this.sessao = [...server.sessions].find((s) => s.ws === ws);
    if (!this.sessao) {
      this.sessao = { id: `sim-${rotulo}`, ws, accountId: null, charId: null };
      server.sessions.add(this.sessao);
    }
  }

  pedir(t, payload = {}) {
    const rid = `${this.rotulo}-${++this.rid}`;
    this.ridEsperado = rid;
    this.resposta = null;
    this.contagem.pedidos++;
    this.server.onMessage(this.sessao, Buffer.from(JSON.stringify({ t, rid, ...payload })));
    const r = this.resposta;
    this.ridEsperado = null;
    this.resposta = null;
    return r ?? { ok: false, code: 'sem_resposta', reason: `Sem resposta para ${t}.` };
  }

  receber(raw) {
    this.contagem.bytes += raw.length;
    // toda mensagem do servidor começa com {"t":"<tipo>"
    const t = raw.slice(6, raw.indexOf('"', 6));
    if (t === 'snap') return this.snapshot(raw);
    if (IGNORADAS.has(t)) { this.contagem.ignoradas++; return; }
    const m = JSON.parse(raw);
    if (t === 'hit' || t === 'heal') { this.aoCombate?.(m); return; }
    if (t === 'res') {
      this.contagem.respostas++;
      if (m.rid === this.ridEsperado) this.resposta = m;
      if (m.snapshot) this.visaoCompleta(m.snapshot); // resposta do 'enter'
      return;
    }
    this.contagem.eventos++;
    if (t === 'zone') this.visaoCompleta(m.snapshot);
    this.aoEvento?.(m);
  }

  snapshot(raw) {
    // diferença: {"t":"snap","now":N,"map":"...","d":1,...}
    const d = raw.indexOf('"d":1');
    if (d > 0 && d < 90) {
      this.delta = true;
      this.contagem.snapDelta++;
      this.snapBruto = null;
      this.mesclar(JSON.parse(raw));
      return;
    }
    this.contagem.snap++;
    this.snapBruto = raw;
  }

  visaoCompleta(snap) {
    this.snapBruto = null;
    this.ents = new Map(snap.ents.map((e) => [e.id, e]));
    this.snapAgora = snap.now;
  }

  // mesma reconstrução do cliente Godot / SimClient.mergeSnap
  mesclar(m) {
    if (m.full) this.ents = new Map();
    const atualizados = new Set();
    for (const d of m.ents) {
      const e = { ...(this.ents.get(d.id) ?? {}), ...d };
      if ('x' in d) { e._px = d.x; e._pz = d.z; e._pt = m.now; }
      this.ents.set(d.id, e);
      atualizados.add(d.id);
    }
    for (const id of m.gone ?? []) this.ents.delete(id);
    for (const e of this.ents.values()) {
      if (!atualizados.has(e.id) && (e.vx || e.vz) && e._pt != null) {
        const dts = (m.now - e._pt) / 1000;
        e.x = e._px + e.vx * dts; e.z = e._pz + e.vz * dts;
      }
    }
    this.snapAgora = m.now;
  }

  // Visão atual do mundo (decodifica o último snapshot completo, se houver um novo).
  mundo() {
    if (this.snapBruto) {
      const m = JSON.parse(this.snapBruto);
      this.snapBruto = null;
      this.ents = new Map(m.ents.map((e) => [e.id, e]));
      this.snapAgora = m.now;
    }
    return this.ents;
  }
}
