// Ponte síncrona para o PostgreSQL. O jogo usa o banco de forma síncrona (como no node:sqlite: a
// lógica de saque, abate e missões chama o Store no meio do tick, dentro de store.tx(fn)), mas o
// cliente 'pg' é assíncrono. A ponte põe o cliente num worker thread (pg-worker.js) com uma conexão
// dedicada; a thread principal manda o pedido por uma MessagePort, dorme em Atomics.wait sobre um
// contador num SharedArrayBuffer e, quando o worker responde e soma 1 no contador, lê a resposta com
// receiveMessageOnPort (a técnica do "synckit"). Cada chamada custa uma ida e volta ao servidor
// (~0,1 ms em conexão local) durante a qual o laço de eventos fica parado — por isso o salvamento
// periódico vai num lote só (saveCharacters) e vários comandos de um mesmo método vão num pedido só.
//
// Falhas (a thread principal nunca fica presa além do prazo):
// - pedido sem resposta no prazo (conexão pendurada): o worker é encerrado e a ponte fica "quebrada";
// - worker que morre no meio de um pedido responde antes com o erro (fatal) e a ponte fica quebrada;
// - o pedido seguinte troca worker e conexão (gen + 1). Se essa troca falhar, ou depois de um prazo
//   esgotado, os pedidos falham NA HORA por um recuo crescente (0,5 s → 10 s) em vez de parar o jogo
//   pelo tempo inteiro de conexão a cada chamada enquanto o banco está fora do ar;
// - a transação aberta morre com a conexão antiga; o PgStore percebe pela troca de gen e não deixa o
//   resto da transação rodar numa conexão nova.
import { Worker, MessageChannel, receiveMessageOnPort } from 'node:worker_threads';

const WORKER = new URL('./pg-worker.js', import.meta.url);
const BACKOFF_MIN_MS = 500;
const BACKOFF_MAX_MS = 10000;
const SPAWN_MARGIN_MS = 5000; // subir o worker e carregar o 'pg', além do tempo de conexão

export class PgBridge {
  // config: { connectionString, schema, appName, lockTimeoutMs, statementTimeoutMs, connectTimeoutMs,
  //           reconnectTimeoutMs, dropSchemaOnClose }
  constructor(config, { timeoutMs = 15000 } = {}) {
    this.config = config;
    this.timeoutMs = timeoutMs;
    this.closed = false;
    this.gen = 0; // trocas de worker/conexão: a transação aberta só vale na geração em que começou
    this.retryAt = 0; // depois de uma falha de conexão ou prazo esgotado: até quando recusar na hora
    this.backoffMs = 0;
    this.lastError = null;
    this.lat = new Float64Array(8192); // duração das últimas chamadas (ms): quanto o laço de eventos ficou parado
    this.totalCalls = 0; // desde a criação (contadores do Prometheus; resetStats não zera)
    this.totalWaitMs = 0;
    this.resetStats();
    this.spawn(config.connectTimeoutMs ?? 10000);
  }

  resetStats() { this.calls = 0; this.waitMs = 0; this.maxMs = 0; this.latN = 0; this.latIdx = 0; this.since = performance.now(); }

  stats() {
    const arr = Array.from(this.lat.subarray(0, this.latN)).sort((a, b) => a - b);
    const q = (p) => (arr.length ? arr[Math.min(arr.length - 1, Math.floor(p * arr.length))] : 0);
    const secs = Math.max(0.001, (performance.now() - this.since) / 1000);
    return { calls: this.calls, callsPerS: this.calls / secs, waitMsPerS: this.waitMs / secs, meanMs: this.calls ? this.waitMs / this.calls : 0, p50Ms: q(0.5), p99Ms: q(0.99), maxMs: this.maxMs,
      totalCalls: this.totalCalls, totalWaitMs: this.totalWaitMs };
  }

  record(ms) {
    this.calls++;
    this.waitMs += ms;
    this.totalCalls++;
    this.totalWaitMs += ms;
    if (ms > this.maxMs) this.maxMs = ms;
    this.lat[this.latIdx] = ms;
    this.latIdx = (this.latIdx + 1) % this.lat.length;
    if (this.latN < this.lat.length) this.latN++;
  }

  // Sobe um worker novo com conexão aberta (síncrono: volta só com a conexão pronta ou lança).
  spawn(connectTimeoutMs) {
    this.gen++;
    this.signal = new Int32Array(new SharedArrayBuffer(4));
    const { port1, port2 } = new MessageChannel();
    this.port = port1; // sem ouvinte de 'message': as respostas ficam na fila até receiveMessageOnPort
    // execArgv vazio: o worker não herda as opções do processo (com `node -e`, herdaria o -e e rodaria o
    // código do pai em vez do pg-worker.js; --test, --watch e carregadores também não servem aqui)
    const worker = new Worker(WORKER, { workerData: { port: port2, signal: this.signal, config: this.config }, transferList: [port2], execArgv: [] });
    this.worker = worker;
    worker.unref(); // não segura o processo aberto
    // (os eventos só chegam quando o laço de eventos roda, nunca no meio de uma chamada síncrona)
    worker.on('error', (e) => { if (this.worker === worker) this.dead = e; });
    worker.on('exit', () => { if (this.worker === worker) this.dead ??= new Error('ponte do PostgreSQL encerrada'); });
    this.dead = null;
    this.broken = false;
    this.tx = 'idle';
    this.seq = 0;
    try {
      this.server = this.call({ op: 'open', timeoutMs: connectTimeoutMs }, { timeoutMs: connectTimeoutMs + SPAWN_MARGIN_MS }).server;
    } catch (e) {
      this.broken = true; // a próxima chamada tenta de novo com outro worker em vez de esperar este, morto
      this.kill();
      throw e;
    }
  }

  kill() {
    try { this.worker.terminate(); } catch { /* já parado */ }
  }

  fail(e) {
    this.lastError = e;
    this.backoffMs = Math.min(Math.max(this.backoffMs * 2, BACKOFF_MIN_MS), BACKOFF_MAX_MS);
    this.retryAt = performance.now() + this.backoffMs;
  }

  // Antes de um pedido: worker e conexão vivos. Quebrada, troca worker e conexão — ou lança na hora,
  // enquanto durar o recuo depois da última falha.
  ensure() {
    if (this.closed) throw new Error('banco PostgreSQL já fechado');
    if (!this.broken && !this.dead) return;
    const left = this.retryAt - performance.now();
    if (left > 0) {
      throw Object.assign(new Error(`PostgreSQL indisponível (${this.lastError?.message ?? 'conexão perdida'}); nova tentativa em ${Math.ceil(left)} ms`), { code: '08001' });
    }
    this.kill();
    try {
      this.spawn(this.config.reconnectTimeoutMs ?? 2000);
    } catch (e) {
      this.fail(e);
      throw e;
    }
    this.backoffMs = 0;
  }

  // Chamada síncrona: volta com o resultado ou lança o erro do PostgreSQL (com code/detail/constraint).
  call(msg, { timeoutMs = this.timeoutMs } = {}) {
    if (msg.op !== 'open' && msg.op !== 'close') this.ensure();
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
        if (res.error) {
          if (res.error.fatal) { this.broken = true; this.tx = 'idle'; this.kill(); }
          throw toError(res.error);
        }
        return res.result;
      }
      const left = deadline - performance.now();
      if (left <= 0) {
        // conexão pendurada ou worker morto sem responder: o próximo pedido começa com worker e conexão
        // novos, depois do recuo (a transação em andamento, se houver, morre com a conexão antiga)
        this.broken = true;
        this.tx = 'idle';
        this.kill();
        const e = Object.assign(new Error(`PostgreSQL não respondeu em ${Math.round(timeoutMs)} ms`), { code: 'CINZAS_PG_TIMEOUT' });
        if (msg.op !== 'open') this.fail(e); // (falha ao abrir: quem chamou spawn decide)
        throw e;
      }
      Atomics.wait(this.signal, 0, seen, left);
    }
  }

  // Fecha a conexão (e apaga o esquema de teste, se for o caso) e encerra o worker. Não lança: no
  // desligamento os dados já foram gravados; uma conexão que já caiu só é abandonada.
  close() {
    if (this.closed) return;
    this.closed = true;
    try {
      if (!this.broken && !this.dead) this.call({ op: 'close' }, { timeoutMs: 5000 });
    } catch { /* conexão perdida ou lenta: o servidor fecha a dele sozinho */ }
    this.kill();
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
