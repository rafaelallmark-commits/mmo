// Ponte síncrona para o PostgreSQL. O jogo usa o banco de forma síncrona (como no node:sqlite: a
// lógica de saque, abate e missões chama o Store no meio do tick, dentro de store.tx(fn)), mas o
// cliente 'pg' é assíncrono. A ponte põe o cliente num worker thread (pg-worker.js) com uma conexão
// dedicada; a thread principal manda o pedido por uma MessagePort, dorme em Atomics.wait sobre um
// contador num SharedArrayBuffer e, quando o worker responde e soma 1 no contador, lê a resposta com
// receiveMessageOnPort (a técnica do "synckit"). Cada chamada custa uma ida e volta ao servidor
// (~0,1 ms em conexão local) durante a qual o laço de eventos fica parado — por isso o salvamento
// periódico vai num lote só (saveCharacters) e vários comandos de um mesmo método vão num pedido só.
import { Worker, MessageChannel, receiveMessageOnPort } from 'node:worker_threads';

const WORKER = new URL('./pg-worker.js', import.meta.url);

export class PgBridge {
  // config: { connectionString, schema, appName, lockTimeoutMs, statementTimeoutMs, connectTimeoutMs, dropSchemaOnClose }
  constructor(config, { timeoutMs = 15000 } = {}) {
    this.config = config;
    this.timeoutMs = timeoutMs;
    this.closed = false;
    this.lat = new Float64Array(8192); // duração das últimas chamadas (ms): quanto o laço de eventos ficou parado
    this.resetStats();
    this.spawn();
  }

  resetStats() { this.calls = 0; this.waitMs = 0; this.maxMs = 0; this.latN = 0; this.latIdx = 0; this.since = performance.now(); }

  stats() {
    const arr = Array.from(this.lat.subarray(0, this.latN)).sort((a, b) => a - b);
    const q = (p) => (arr.length ? arr[Math.min(arr.length - 1, Math.floor(p * arr.length))] : 0);
    const secs = Math.max(0.001, (performance.now() - this.since) / 1000);
    return { calls: this.calls, callsPerS: this.calls / secs, waitMsPerS: this.waitMs / secs, meanMs: this.calls ? this.waitMs / this.calls : 0, p50Ms: q(0.5), p99Ms: q(0.99), maxMs: this.maxMs };
  }

  record(ms) {
    this.calls++;
    this.waitMs += ms;
    if (ms > this.maxMs) this.maxMs = ms;
    this.lat[this.latIdx] = ms;
    this.latIdx = (this.latIdx + 1) % this.lat.length;
    if (this.latN < this.lat.length) this.latN++;
  }

  spawn() {
    this.signal = new Int32Array(new SharedArrayBuffer(4));
    const { port1, port2 } = new MessageChannel();
    this.port = port1; // sem ouvinte de 'message': as respostas ficam na fila até receiveMessageOnPort
    // execArgv vazio: o worker não herda as opções do processo (com `node -e`, herdaria o -e e rodaria o
    // código do pai em vez do pg-worker.js; --test, --watch e carregadores também não servem aqui)
    this.worker = new Worker(WORKER, { workerData: { port: port2, signal: this.signal, config: this.config }, transferList: [port2], execArgv: [] });
    this.worker.unref(); // não segura o processo aberto
    this.worker.on('error', (e) => { this.dead = e; });
    this.worker.on('exit', () => { this.dead ??= new Error('ponte do PostgreSQL encerrada'); });
    this.dead = null;
    this.broken = false;
    this.tx = 'idle';
    this.seq = 0;
    try {
      this.server = this.call({ op: 'open' }, { timeoutMs: (this.config.connectTimeoutMs ?? 10000) + 5000 }).server;
    } catch (e) {
      this.broken = true; // a próxima chamada tenta de novo com outro worker em vez de esperar este, morto
      this.worker.terminate();
      throw e;
    }
  }

  // Chamada síncrona: volta com o resultado ou lança o erro do PostgreSQL (com code/detail/constraint).
  call(msg, { timeoutMs = this.timeoutMs } = {}) {
    if (this.closed) throw new Error('banco PostgreSQL já fechado');
    if (this.broken || this.dead) this.respawn();
    const id = ++this.seq;
    msg.id = id;
    const t0 = performance.now();
    this.port.postMessage(msg);
    const deadline = t0 + timeoutMs;
    for (;;) {
      const seen = Atomics.load(this.signal, 0);
      const got = receiveMessageOnPort(this.port);
      if (got) {
        const res = got.message;
        if (res.id !== id) continue; // resposta atrasada de uma chamada que já desistiu
        this.record(performance.now() - t0);
        this.tx = res.tx;
        if (res.error) throw toError(res.error);
        return res.result;
      }
      const left = deadline - performance.now();
      if (left <= 0) {
        // conexão pendurada ou worker morto: o próximo pedido começa com worker e conexão novos
        // (a transação em andamento, se houver, morre com a conexão antiga)
        this.broken = true;
        this.tx = 'idle';
        this.worker.terminate();
        throw Object.assign(new Error(`PostgreSQL não respondeu em ${Math.round(timeoutMs)} ms`), { code: 'CINZAS_PG_TIMEOUT' });
      }
      Atomics.wait(this.signal, 0, seen, left);
    }
  }

  respawn() {
    try { this.worker.terminate(); } catch { /* já parado */ }
    this.spawn();
  }

  close() {
    if (this.closed) return;
    try {
      if (!this.broken && !this.dead) this.call({ op: 'close' });
    } finally {
      this.closed = true;
    }
  }
}

function toError(info) {
  const e = new Error(info.message);
  for (const [k, v] of Object.entries(info)) if (k !== 'message') e[k] = v;
  return e;
}

// Linhas vêm do worker como { f: nomes, r: [[valores]] }; viram objetos sem protótipo, como os do
// node:sqlite (o mesmo formato nos dois bancos, inclusive para deepStrictEqual).
export function rowsOf(res) {
  const { f, r } = res;
  const out = new Array(r.length);
  for (let i = 0; i < r.length; i++) {
    const o = Object.create(null);
    const v = r[i];
    for (let j = 0; j < f.length; j++) o[f[j]] = v[j];
    out[i] = o;
  }
  return out;
}

export function rowOf(res) {
  return res.r.length ? rowsOf(res)[0] : undefined;
}
