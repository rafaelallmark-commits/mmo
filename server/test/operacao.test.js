// Operação: métricas como contadores para o Prometheus, saúde que acusa o laço do jogo parado, métricas só
// pela rede interna, teto de jogadores (server_full) e as métricas do serviço de contas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { GameServer } from '../src/server.js';
import { AccountsService } from '../src/contas.js';
import { isInternalAddress } from '../src/metrics.js';
import { SimClient, sleep } from './helpers/client.js';

const SECRET = 'segredo-de-teste-0123456789-operacao';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function tmp(prefix) { return mkdtempSync(join(tmpdir(), prefix)); }

// texto do Prometheus -> { values: { 'nome{rótulos}': n }, types: { nome: tipo } }
function parseProm(text) {
  const values = {}, types = {};
  for (const line of text.split('\n')) {
    const t = /^# TYPE (\S+) (\S+)$/.exec(line);
    if (t) { types[t[1]] = t[2]; continue; }
    if (!line || line.startsWith('#')) continue;
    const m = /^(\S+?)(\{[^}]*\})? (\S+)$/.exec(line);
    if (m) values[m[1] + (m[2] ?? '')] = Number(m[3]);
  }
  return { values, types };
}

async function scrape(port) {
  const r = await fetch(`http://127.0.0.1:${port}/metrics`);
  assert.equal(r.status, 200);
  return parseProm(await r.text());
}

// conta com senha (servidor em auth "both") e um personagem; devolve o cliente logado e o id
async function newPlayer(url, account, charName) {
  const c = new SimClient(account);
  await c.connect(url);
  assert.equal((await c.request('register', { account, password: 'senha123' })).ok, true);
  assert.equal((await c.request('login', { account, password: 'senha123' })).ok, true);
  const ch = await c.request('create_char', { name: charName, classId: 'warden' });
  assert.equal(ch.ok, true, ch.reason);
  return { c, charId: ch.char.id };
}

test('métricas: CPU, mensagens, bytes, ticks e espera do banco são contadores que só sobem; o reset da janela não os zera', async () => {
  const dir = tmp('cinzas-met-');
  const zone = new GameServer({ port: 0, host: '127.0.0.1', dbPath: join(dir, 'm.db'), seed: 5, log: false, metricsPort: 0 });
  const port = await zone.start();
  try {
    assert.equal(zone.opts.tickStallMs, 5000, 'saúde: 5 s sem tick por padrão');
    const first = await scrape(zone.metricsPort);
    for (const name of ['cinzas_cpu_seconds_total', 'cinzas_msgs_in_total', 'cinzas_msgs_out_total', 'cinzas_bytes_in_total', 'cinzas_bytes_out_total',
      'cinzas_snapshot_bytes_out_total', 'cinzas_ticks_total', 'cinzas_slow_ticks_total', 'cinzas_server_full_total']) {
      assert.equal(first.types[name], 'counter', `${name} é contador`);
    }
    for (const name of ['cinzas_players_online', 'cinzas_tick_ms_p99', 'cinzas_rss_mb', 'cinzas_last_tick_age_seconds', 'cinzas_max_players']) assert.equal(first.types[name], 'gauge', `${name} é medidor`);
    // médias desde a subida (viravam linha reta depois de horas no ar) saíram do texto do Prometheus
    for (const old of ['cinzas_cpu_pct', 'cinzas_msgs_in_per_s', 'cinzas_msgs_out_per_s', 'cinzas_bytes_in_per_s', 'cinzas_bytes_out_per_s', 'cinzas_db_wait_ms_per_s', 'cinzas_db_calls_per_s']) {
      assert.equal(first.types[old], undefined, `${old} não é mais exportada`);
    }
    // tráfego: entra um jogador, anda e pinga
    const { c, charId } = await newPlayer(`ws://127.0.0.1:${port}`, 'contador', 'Contadora');
    assert.equal((await c.request('enter', { charId })).ok, true);
    for (let i = 0; i < 5; i++) await c.request('ping');
    await sleep(350); // alguns ticks com snapshots
    const second = await scrape(zone.metricsPort);
    for (const name of ['cinzas_msgs_in_total', 'cinzas_msgs_out_total', 'cinzas_bytes_in_total', 'cinzas_bytes_out_total', 'cinzas_snapshot_bytes_out_total', 'cinzas_ticks_total']) {
      assert.ok(second.values[name] > first.values[name], `${name} subiu (${first.values[name]} → ${second.values[name]})`);
    }
    assert.ok(second.values.cinzas_cpu_seconds_total >= first.values.cinzas_cpu_seconds_total);
    assert.equal(second.values.cinzas_players_online, 1);
    // POST /metrics/reset zera a janela do JSON (ferramenta de carga), não os contadores
    const reset = await fetch(`http://127.0.0.1:${zone.metricsPort}/metrics/reset`, { method: 'POST' });
    assert.equal(reset.status, 204);
    const third = await scrape(zone.metricsPort);
    for (const name of ['cinzas_msgs_in_total', 'cinzas_bytes_out_total', 'cinzas_ticks_total', 'cinzas_cpu_seconds_total']) {
      assert.ok(third.values[name] >= second.values[name], `${name} não voltou depois do reset`);
    }
    const json = await (await fetch(`http://127.0.0.1:${zone.metricsPort}/metrics.json`)).json();
    for (const k of ['msgsInPerS', 'bytesOutPerS', 'snapBytesOutPerS', 'cpuPct']) assert.equal(typeof json[k], 'number', `JSON mantém ${k} (janela)`);
    assert.ok(json.totals.msgsIn >= third.values.cinzas_msgs_in_total, 'JSON também traz os contadores');
    assert.ok(json.windowS < 5, 'a janela recomeçou no reset');
    await c.close();
  } finally { await zone.stop(); rmSync(dir, { recursive: true, force: true }); }
});

test('saúde: /health responde 503 quando o laço do jogo para e volta a 200 quando ele anda', async () => {
  const dir = tmp('cinzas-saude-');
  const zone = new GameServer({ port: 0, host: '127.0.0.1', dbPath: join(dir, 's.db'), seed: 6, log: false, metricsPort: 0, tickStallMs: 400 });
  await zone.start();
  const health = async () => { const r = await fetch(`http://127.0.0.1:${zone.metricsPort}/health`); return { status: r.status, body: await r.json() }; };
  try {
    let h = await health();
    assert.equal(h.status, 200);
    assert.equal(h.body.ok, true);
    // o laço para (o processo e o HTTP continuam vivos): depois do limite, 503
    clearInterval(zone.timer);
    await sleep(700);
    h = await health();
    assert.equal(h.status, 503, 'contêiner unhealthy');
    assert.equal(h.body.ok, false);
    assert.ok(h.body.lastTickAgoMs >= 400, `último tick há ${h.body.lastTickAgoMs} ms`);
    assert.match(h.body.erro, /laço do jogo parado/);
    const prom = await scrape(zone.metricsPort);
    assert.ok(prom.values.cinzas_last_tick_age_seconds >= 0.4, 'idade do último tick na métrica');
    // um tick e a saúde volta
    zone.step(100);
    h = await health();
    assert.equal(h.status, 200);
  } finally { await zone.stop(); rmSync(dir, { recursive: true, force: true }); }
});

test('métricas só pela rede interna: endereço público ou pedido repassado por proxy recebe 403', async () => {
  for (const a of ['127.0.0.1', '::1', '::ffff:127.0.0.1', '10.0.3.7', '172.18.0.4', '172.31.255.1', '192.168.15.2', '169.254.1.1', '100.64.0.9', 'fd12:3456::1', 'fe80::1', '::ffff:172.20.0.2']) {
    assert.equal(isInternalAddress(a), true, `${a} é interno`);
  }
  for (const a of ['8.8.8.8', '172.32.0.1', '172.15.0.1', '203.0.113.9', '100.128.0.1', '2001:db8::1', '::ffff:8.8.4.4', '', null, undefined]) {
    assert.equal(isInternalAddress(a), false, `${a} não é interno`);
  }
  const dir = tmp('cinzas-int-');
  const zone = new GameServer({ port: 0, host: '127.0.0.1', dbPath: join(dir, 'i.db'), seed: 7, log: false, metricsPort: 0 });
  await zone.start();
  try {
    assert.equal((await fetch(`http://127.0.0.1:${zone.metricsPort}/metrics`)).status, 200);
    for (const headers of [{ 'x-forwarded-for': '203.0.113.9' }, { forwarded: 'for=203.0.113.9' }]) {
      const r = await fetch(`http://127.0.0.1:${zone.metricsPort}/metrics`, { headers });
      assert.equal(r.status, 403, `com ${Object.keys(headers)[0]}`);
    }
  } finally { await zone.stop(); rmSync(dir, { recursive: true, force: true }); }
});

test('teto de jogadores: cheio, enter responde server_full; gm e admin passam sem ocupar vaga; reconexão e vaga liberada entram', async () => {
  const dir = tmp('cinzas-teto-');
  const zone = new GameServer({ port: 0, host: '127.0.0.1', dbPath: join(dir, 't.db'), seed: 8, log: false, maxPlayers: 2 });
  const port = await zone.start();
  const url = `ws://127.0.0.1:${port}`;
  try {
    const a = await newPlayer(url, 'tetoa', 'Primeira');
    const b = await newPlayer(url, 'tetob', 'Segunda');
    const c = await newPlayer(url, 'tetoc', 'Terceira');
    assert.equal((await a.c.request('enter', { charId: a.charId })).ok, true);
    assert.equal((await b.c.request('enter', { charId: b.charId })).ok, true);
    const full = await c.c.request('enter', { charId: c.charId });
    assert.equal(full.ok, false);
    assert.equal(full.code, 'server_full');
    assert.equal(full.reason, 'Servidor cheio (2 jogadores). Tente de novo em alguns minutos.');
    assert.equal(zone.byChar.has(c.charId), false, 'não entrou');
    assert.equal(zone.collectMetrics().fullRefusals, 1, 'recusa contada nas métricas');
    // mestre e administrador entram com o servidor cheio, e não ocupam vaga de jogador
    for (const [account, role, name] of [['tetogm', 'gm', 'Mestra'], ['tetoadm', 'admin', 'Admina']]) {
      const s = await newPlayer(url, account, name);
      await s.c.close();
      zone.store.setRole(zone.store.findAccount(account).id, role);
      const s2 = new SimClient(`${account}-2`);
      await s2.connect(url);
      const lg = await s2.request('login', { account, password: 'senha123' });
      const r = await s2.request('enter', { charId: lg.chars[0].id });
      assert.equal(r.ok, true, `${role} entra com o servidor cheio`);
    }
    assert.equal(zone.byChar.size, 4, '2 jogadores + gm + admin');
    // quem já está no mundo não conta duas vezes (várias zonas: o personagem pode estar on-line em outra)
    assert.equal(zone.serverFull({ role: 'player' }, a.charId), null);
    assert.equal(zone.serverFull({ role: 'player' }, c.charId)?.code, 'server_full');
    // reconexão: a mesma conta entra de outra conexão (a sessão antiga cai e o personagem volta)
    const a2 = new SimClient('tetoa-2');
    await a2.connect(url);
    const la = await a2.request('login', { account: 'tetoa', password: 'senha123' });
    const back = await a2.request('enter', { charId: la.chars[0].id });
    assert.equal(back.ok, true, back.reason);
    // vagou: quem esperava entra
    await b.c.close();
    for (let i = 0; i < 50 && zone.byChar.has(b.charId); i++) await sleep(20);
    const now = await c.c.request('enter', { charId: c.charId });
    assert.equal(now.ok, true, now.reason);
    await a.c.close(); await c.c.close(); await a2.close();
  } finally { await zone.stop(); rmSync(dir, { recursive: true, force: true }); }
});

test('opções: --max-players e CINZAS_MAX_PLAYERS inválidos e --metrics-port das contas sem número impedem a subida', () => {
  const env = { ...process.env, CINZAS_TOKEN_SECRET: '', CINZAS_WORLD_SECRET: '', CINZAS_MAX_PLAYERS: '', CINZAS_CONTAS_METRICS_PORT: '', CINZAS_EMAIL: '' };
  const run = (script, args, extra = {}) => spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', join(ROOT, 'src', script), ...args], { env: { ...env, ...extra }, encoding: 'utf8', timeout: 20000 });
  for (const [args, extra] of [[['--max-players', '-1']], [['--max-players', 'muitos']], [['--max-players']], [[], { CINZAS_MAX_PLAYERS: '2.5' }]]) {
    const r = run('main.js', ['--port', '0', ...args], extra);
    assert.equal(r.status, 2, `${args.join(' ')} ${JSON.stringify(extra ?? {})}: ${r.stderr}`);
    assert.match(r.stderr, /max-players|precisa de um valor/);
  }
  const r = run('contas-main.js', ['--port', '0', '--metrics-port', 'abc']);
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /--metrics-port/);
});

test('serviço de contas: pedidos, cadastros e falhas de e-mail em GET /metrics numa porta própria, só pela rede interna', async () => {
  const dir = tmp('cinzas-cmet-');
  let failMail = false;
  const acc = new AccountsService({
    port: 0, dbPath: join(dir, 'c.db'), tokenSecret: SECRET, log: false, metricsPort: 0,
    mailer: { kind: 'teste', send: async () => { if (failMail) throw new Error('SMTP fora do ar'); return 'mem'; } },
  });
  const aport = await acc.start();
  const post = (path, body) => fetch(`http://127.0.0.1:${aport}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  try {
    assert.ok(acc.metricsPort && acc.metricsPort !== aport, 'porta de métricas separada da porta do serviço');
    assert.equal(acc.mailer.kind, 'teste', 'o envio embrulhado mantém o resto do objeto');
    assert.equal((await post('/contas', { conta: 'medida', email: 'medida@exemplo.com', senha: 'senha-forte-1', aceite: true })).status, 201);
    failMail = true;
    const broken = await post('/contas', { conta: 'semcorreio', email: 'semcorreio@exemplo.com', senha: 'senha-forte-1', aceite: true });
    assert.notEqual(broken.status, 201, 'sem e-mail o cadastro não termina bem');
    assert.equal((await fetch(`http://127.0.0.1:${aport}/qualquer/coisa`)).status, 404);
    assert.equal((await fetch(`http://127.0.0.1:${aport}/saude`)).status, 200);
    // a porta do serviço (a que o proxy repassa) não serve métricas
    assert.equal((await fetch(`http://127.0.0.1:${aport}/metrics`)).status, 404);
    const r = await fetch(`http://127.0.0.1:${acc.metricsPort}/metrics`);
    assert.equal(r.status, 200);
    const { values, types } = parseProm(await r.text());
    assert.equal(types.cinzas_accounts_requests_total, 'counter');
    assert.equal(types.cinzas_accounts_email_failures_total, 'counter');
    assert.equal(values.cinzas_accounts_signups_total, 1);
    assert.equal(values.cinzas_accounts_emails_sent_total, 1);
    assert.equal(values.cinzas_accounts_email_failures_total, 1);
    assert.equal(values['cinzas_accounts_requests_total{route="/contas",status="201"}'], 1);
    assert.equal(values['cinzas_accounts_requests_total{route="/saude",status="200"}'], 1);
    assert.equal(values['cinzas_accounts_requests_total{route="outra",status="404"}'], 2, 'caminho desconhecido não vira série nova');
    assert.equal((await fetch(`http://127.0.0.1:${acc.metricsPort}/metrics`, { headers: { 'x-forwarded-for': '198.51.100.7' } })).status, 403);
  } finally { await acc.stop(); rmSync(dir, { recursive: true, force: true }); }
});
