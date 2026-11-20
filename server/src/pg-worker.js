// Lado assíncrono da ponte síncrona do PostgreSQL (pg-bridge.js). Roda num worker thread com UMA
// conexão dedicada do cliente 'pg' (as transações precisam de uma conexão só). Recebe os pedidos pela
// MessagePort, executa um de cada vez, na ordem, responde pela mesma porta e então soma 1 no contador
// compartilhado e acorda a thread principal (Atomics.notify), que está parada em Atomics.wait e lê a
// resposta com receiveMessageOnPort — a técnica do "synckit".
//
// Pedido { id, op:'run', begin?, items:[{ sql, params, mode:'get'|'all'|'run', prepare?, simple?, savepoint? }], end?:'commit'|'rollback' }
// Resposta { id, result | error, tx } — tx é o estado da transação nesta conexão depois do pedido:
// 'idle', 'open' ou 'failed' (um comando falhou dentro dela; o COMMIT vira erro em vez de desfazer calado).
//
// Conexão perdida fora de transação: o pedido seguinte reconecta (prazo curto, reconnectTimeoutMs); se
// não conseguir, os pedidos falham na hora por um recuo crescente (0,5 s → 10 s), sem esperar o prazo de
// conexão inteiro a cada um. Dentro de transação, a transação falha (nada roda fora dela).
import { workerData } from 'node:worker_threads';
import pg from 'pg';

pg.types.setTypeParser(20, (v) => Number(v)); // int8 (BIGINT, COUNT(*)) -> número, como no node:sqlite
pg.types.setTypeParser(1700, (v) => Number(v)); // numeric (SUM/AVG em consultas avulsas)

const { port, signal, config } = workerData;
let client = null; // conexão viva; null depois de cair (a próxima operação fora de transação reconecta)
let lost = null; // por que a conexão caiu (ou por que a última tentativa de reconectar falhou)
let names = new Map(); // sql -> nome do comando preparado nesta conexão
let tx = 'idle';
let txFailure = null;
let retryAt = 0; // depois de uma reconexão que falhou: até quando recusar na hora
let backoffMs = 0;
let current = null; // id do pedido em andamento (para responder se o worker morrer no meio dele)

const ident = (s) => `"${String(s).replace(/"/g, '""')}"`;

async function connect(timeoutMs) {
  const c = new pg.Client({
    connectionString: config.connectionString,
    application_name: config.appName,
    keepAlive: true,
    connectionTimeoutMillis: timeoutMs,
  });
  c.on('error', (e) => { if (client === c) { client = null; lost = e; } });
  c.on('end', () => { if (client === c) { client = null; lost ??= new Error('conexão encerrada pelo servidor'); } });
  try {
    await c.connect();
    // search_path: o esquema do jogo (ou o de teste); lock_timeout espelha o busy_timeout do SQLite
    await c.query(`SET search_path TO ${ident(config.schema)}; SET lock_timeout = ${Number(config.lockTimeoutMs)}; SET statement_timeout = ${Number(config.statementTimeoutMs)}`);
  } catch (e) {
    try { c.end().catch(() => {}); } catch { /* nem chegou a conectar */ }
    throw e;
  }
  client = c;
  lost = null;
  names = new Map();
}

async function ensureClient() {
  if (client) return client;
  if (tx !== 'idle') {
    // a transação morreu com a conexão: nada do que vier nela pode rodar fora dela
    tx = 'failed';
    txFailure ??= lost ?? new Error('conexão perdida');
    const e = new Error(`conexão com o PostgreSQL perdida no meio da transação (${txFailure.message})`);
    e.code = '08006';
    throw e;
  }
  const left = retryAt - Date.now();
  if (left > 0) {
    throw Object.assign(new Error(`PostgreSQL indisponível (${lost?.message ?? 'conexão perdida'}); nova tentativa em ${left} ms`), { code: '08001' });
  }
  try {
    await connect(config.reconnectTimeoutMs ?? config.connectTimeoutMs);
  } catch (e) {
    lost = e;
    backoffMs = Math.min(Math.max(backoffMs * 2, 500), 10000);
    retryAt = Date.now() + backoffMs;
    throw e;
  }
  backoffMs = 0;
  return client;
}

let nameSeq = 0;

async function runItem(c, it) {
  if (it.simple) { await c.query(it.sql); return null; } // vários comandos, sem parâmetros (DDL das migrações)
  const q = { text: it.sql, values: it.params ?? [], rowMode: 'array' };
  if (it.prepare) {
    let n = names.get(it.sql);
    if (!n) { n = `cz${++nameSeq}`; names.set(it.sql, n); }
    q.name = n;
  }
  let r;
  try {
    r = await c.query(q);
  } catch (e) {
    // Outro processo migrou o esquema (coluna nova) e o SELECT * preparado mudou de formato: fora de
    // transação, prepara de novo com outro nome e tenta uma vez (atualização com zonas ainda no ar).
    if (!(q.name && tx === 'idle' && e.code === '0A000' && /cached plan/i.test(e.message))) throw e;
    q.name = `cz${++nameSeq}`;
    names.set(it.sql, q.name);
    r = await c.query(q);
  }
  if (it.mode === 'get' || it.mode === 'all') return { f: r.fields.map((f) => f.name), r: it.mode === 'get' ? r.rows.slice(0, 1) : r.rows };
  return { changes: r.rowCount ?? 0 };
}

// Comando "melhor esforço" dentro de uma transação (auditoria): num SAVEPOINT, para que uma falha dele
// não aborte a transação inteira — no SQLite um comando que falha não derruba a transação.
async function runContained(c, it) {
  await c.query('SAVEPOINT cz_sp');
  try {
    const r = await runItem(c, it);
    await c.query('RELEASE SAVEPOINT cz_sp');
    return r;
  } catch (e) {
    // (se a conexão caiu, o ROLLBACK TO falha e o erro dele sobe sem "contained": a transação falha)
    await c.query('ROLLBACK TO SAVEPOINT cz_sp');
    await c.query('RELEASE SAVEPOINT cz_sp');
    e.contained = true;
    throw e;
  }
}

async function end(kind) {
  if (tx === 'idle') return;
  if (kind === 'rollback' || !client) {
    tx = 'idle';
    if (client) await client.query('ROLLBACK');
    else if (kind === 'commit') throw Object.assign(new Error(`transação perdida com a conexão (${(txFailure ?? lost)?.message ?? '?'})`), { code: '08006' });
    return;
  }
  if (tx === 'failed') {
    tx = 'idle';
    await client.query('ROLLBACK').catch(() => {});
    throw Object.assign(new Error(`transação desfeita: um comando dentro dela falhou (${txFailure?.message ?? '?'})`), { code: '25P02' });
  }
  try { await client.query('COMMIT'); } finally { tx = 'idle'; }
}

async function run(req) {
  const items = req.items ?? [];
  if (!items.length && !req.begin) { if (req.end) await end(req.end); return []; }
  const c = await ensureClient();
  if (req.begin && tx === 'idle') { await c.query('BEGIN'); tx = 'open'; txFailure = null; }
  const out = [];
  for (let i = 0; i < items.length; i++) {
    try {
      out.push(items[i].savepoint && tx === 'open' ? await runContained(c, items[i]) : await runItem(c, items[i]));
    } catch (e) {
      if (tx === 'open' && !e.contained) { tx = 'failed'; txFailure = e; }
      e.item = i;
      throw e;
    }
  }
  if (req.end) await end(req.end);
  return out;
}

async function close() {
  const c = client;
  client = null;
  if (c) {
    if (config.dropSchemaOnClose) await c.query(`DROP SCHEMA IF EXISTS ${ident(config.schema)} CASCADE`).catch(() => {});
    await c.end().catch(() => {});
  }
  setImmediate(() => port.close()); // sem a porta, o laço de eventos do worker esvazia e ele termina
  return null;
}

async function dispatch(req) {
  switch (req.op) {
    case 'open': {
      await connect(req.timeoutMs ?? config.connectTimeoutMs);
      const r = await client.query('SHOW server_version');
      return { server: r.rows[0].server_version };
    }
    case 'run': return run(req);
    case 'close': return close();
    default: throw new Error(`operação desconhecida: ${req.op}`);
  }
}

function errorInfo(e) {
  const o = { message: e?.message ?? String(e) };
  for (const k of ['code', 'detail', 'hint', 'constraint', 'table', 'column', 'schema', 'severity', 'item']) if (e?.[k] != null) o[k] = e[k];
  return o;
}

function reply(msg) {
  port.postMessage(msg);
  Atomics.add(signal, 0, 1);
  Atomics.notify(signal, 0);
}

async function handle(req) {
  current = req.id;
  try {
    let msg;
    try { msg = { id: req.id, result: await dispatch(req), tx }; } catch (e) { msg = { id: req.id, error: errorInfo(e), tx }; }
    try { reply(msg); } catch (e) { reply({ id: req.id, error: errorInfo(e), tx }); } // resultado que não passa pela porta
  } finally {
    current = null;
  }
}

// Erro que escapou de tudo (defeito): responde ao pedido em andamento, para a thread principal não
// esperar o prazo inteiro, e encerra o worker; a ponte troca de worker no pedido seguinte.
function fatal(e) {
  try {
    if (current != null) reply({ id: current, error: { ...errorInfo(e), fatal: true }, tx: 'idle' });
  } finally {
    process.exit(1);
  }
}
process.on('uncaughtException', fatal);
process.on('unhandledRejection', fatal);

let chain = Promise.resolve();
port.on('message', (req) => {
  chain = chain.then(() => handle(req)).catch(fatal);
});
