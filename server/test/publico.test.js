// Preparação para o teste público: serviço de contas (e-mail, código, token), login por token no
// servidor de zona (uso único, validade), troca de senha, exclusão de conta, limite de comandos e de
// conexões por IP, papéis de mestre com auditoria, desligamento gracioso, TLS e o cliente SMTP.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import WebSocket from 'ws';
import { GameServer } from '../src/server.js';
import { AccountsService } from '../src/contas.js';
import { signToken } from '../src/token.js';
import { SimClient, sleep } from './helpers/client.js';

const SECRET = 'segredo-de-teste-0123456789';

function tmp(prefix) { return mkdtempSync(join(tmpdir(), prefix)); }

async function post(port, path, body) {
  const r = await fetch(`http://127.0.0.1:${port}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, ...(await r.json()) };
}

test('contas: e-mail com código, token de uso único no servidor de zona, troca de senha e exclusão', async () => {
  const dir = tmp('cinzas-contas-');
  const mails = [];
  const zone = new GameServer({ port: 0, host: '127.0.0.1', dbPath: join(dir, 'p.db'), seed: 1, log: false, auth: 'token', tokenSecret: SECRET });
  const zport = await zone.start();
  const acc = new AccountsService({ port: 0, dbPath: join(dir, 'p.db'), tokenSecret: SECRET, log: false, mailer: { send: async (m) => { mails.push(m); return 'mem'; } } });
  const aport = await acc.start();
  const codeOf = (m) => /(\d{6})/.exec(m.text)[1];
  try {
    let r = await post(aport, '/contas', { conta: 'aurora', email: 'aurora@exemplo.com', senha: 'senha-forte-1' });
    assert.match(r.erro, /Termos de Uso/, 'sem aceite dos termos não cria');
    const termos = await fetch(`http://127.0.0.1:${aport}/termos`);
    assert.equal(termos.status, 200);
    assert.match(await termos.text(), /Termos de uso/);
    r = await post(aport, '/contas', { conta: 'aurora', email: 'Aurora@Exemplo.com', senha: 'curta', aceite: true });
    assert.equal(r.ok, false);
    r = await post(aport, '/contas', { conta: 'aurora', email: 'aurora@exemplo.com', senha: 'senha-forte-1', aceite: true });
    assert.equal(r.status, 201, r.erro);
    assert.equal(mails.length, 1);
    assert.equal((await post(aport, '/contas', { conta: 'outra', email: 'AURORA@exemplo.com', senha: 'senha-forte-1', aceite: true })).status, 409, 'e-mail repetido');
    // sem confirmar, não entra
    r = await post(aport, '/sessoes', { conta: 'aurora', senha: 'senha-forte-1' });
    assert.equal(r.status, 403);
    assert.equal((await post(aport, '/contas/verificar', { conta: 'aurora', codigo: '000000' === codeOf(mails[0]) ? '111111' : '000000' })).ok, false);
    r = await post(aport, '/contas/verificar', { conta: 'aurora', codigo: codeOf(mails[0]) });
    assert.equal(r.ok, true, r.erro);
    r = await post(aport, '/sessoes', { conta: 'aurora', senha: 'senha-forte-1' });
    assert.equal(r.ok, true);
    const token = r.token;
    // servidor de zona em modo token: senha recusada, token aceito uma vez
    const c = new SimClient('tok');
    await c.connect(`ws://127.0.0.1:${zport}`);
    assert.equal((await c.request('login', { account: 'aurora', password: 'senha-forte-1' })).code, 'use_accounts');
    const lg = await c.request('login_token', { token });
    assert.equal(lg.ok, true, lg.reason);
    const c2 = new SimClient('tok2');
    await c2.connect(`ws://127.0.0.1:${zport}`);
    assert.equal((await c2.request('login_token', { token })).code, 'bad_token', 'replay recusado');
    assert.equal((await c2.request('login_token', { token: token.slice(0, -2) + 'xx' })).code, 'bad_token', 'assinatura adulterada');
    const vencido = signToken({ sub: 1 }, SECRET, -10);
    assert.equal((await c2.request('login_token', { token: vencido })).code, 'bad_token', 'vencido');
    // troca de senha por código
    await post(aport, '/senha/esqueci', { email: 'aurora@exemplo.com' });
    assert.equal((await post(aport, '/senha/esqueci', { email: 'ninguem@exemplo.com' })).ok, true, 'não revela e-mail');
    const reset = mails.at(-1);
    assert.match(reset.subject, /senha/i);
    r = await post(aport, '/senha/redefinir', { email: 'aurora@exemplo.com', codigo: codeOf(reset), senha: 'nova-senha-22' });
    assert.equal(r.ok, true, r.erro);
    assert.equal((await post(aport, '/sessoes', { conta: 'aurora', senha: 'senha-forte-1' })).status, 401);
    assert.equal((await post(aport, '/sessoes', { conta: 'aurora', senha: 'nova-senha-22' })).ok, true);
    // portabilidade: exporta a conta com personagens e auditoria
    const exp = await post(aport, '/contas/dados', { conta: 'aurora', senha: 'nova-senha-22' });
    assert.equal(exp.ok, true);
    assert.equal(exp.dados.conta.email, 'aurora@exemplo.com');
    assert.ok(exp.dados.auditoria.length >= 3);
    // exclusão: some do banco (dados pessoais) e não entra mais
    await c.request('create_char', { name: 'Auroreal', classId: 'warden' });
    r = await post(aport, '/contas/excluir', { conta: 'aurora', senha: 'nova-senha-22' });
    assert.equal(r.ok, true, r.erro);
    assert.equal((await post(aport, '/sessoes', { conta: 'aurora', senha: 'nova-senha-22' })).status, 401);
    const row = zone.store.db.prepare('SELECT name, email, deleted_at FROM accounts WHERE id = ?').get(lg.account ? 1 : 1);
    assert.equal(row.email, null);
    assert.ok(row.deleted_at);
    assert.equal(zone.store.characterNameTaken('Auroreal'), false, 'nome do personagem liberado');
    const kinds = zone.store.auditTail(50).map((a) => a.kind);
    for (const k of ['account_created', 'account_verified', 'login', 'password_reset', 'account_deleted']) assert.ok(kinds.includes(k), `auditoria: ${k}`);
    await c.close(); await c2.close();
  } finally { await acc.stop(); await zone.stop(); rmSync(dir, { recursive: true, force: true }); }
});

test('mensagem que não é objeto («null», número, lista) é recusada sem derrubar o servidor', async () => {
  const dir = tmp('cinzas-null-');
  const zone = new GameServer({ port: 0, host: '127.0.0.1', dbPath: join(dir, 'n.db'), seed: 4, log: false });
  const port = await zone.start();
  const acc = new AccountsService({ port: 0, dbPath: join(dir, 'n.db'), tokenSecret: SECRET, log: false, mailer: { send: async () => 'mem' } });
  const aport = await acc.start();
  try {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const got = [];
    ws.on('message', (b) => got.push(JSON.parse(b.toString())));
    await new Promise((r) => ws.on('open', r));
    const bad = ['null', '5', '"oi"', '[]', '[{"t":"ping"}]', 'true', '{"t":'];
    for (const raw of bad) ws.send(raw);
    ws.send(JSON.stringify({ t: 'ping', rid: 'vivo' }));
    for (let i = 0; i < 50 && !got.some((m) => m.rid === 'vivo'); i++) await sleep(20);
    assert.equal(got.filter((m) => m.code === 'bad_json').length, bad.length, 'cada mensagem inválida recebe bad_json');
    assert.ok(got.some((m) => m.rid === 'vivo' && m.ok), 'a mesma conexão segue funcionando');
    // outra conexão também entra: o processo não caiu
    const c = new SimClient('depois');
    await c.connect(`ws://127.0.0.1:${port}`);
    assert.equal((await c.request('ping')).ok, true);
    await c.close();
    ws.close();
    // serviço de contas: corpo «null» ou lista é pedido inválido (400), não erro interno
    for (const body of ['null', '[]', '7']) {
      const r = await fetch(`http://127.0.0.1:${aport}/contas`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
      assert.equal(r.status, 400, `corpo ${body}`);
    }
  } finally { await acc.stop(); await zone.stop(); rmSync(dir, { recursive: true, force: true }); }
});

test('limite de comandos, limite por IP, papéis de mestre e auditoria', async () => {
  const dir = tmp('cinzas-lim-');
  const zone = new GameServer({ port: 0, host: '127.0.0.1', dbPath: join(dir, 'l.db'), seed: 2, log: false, maxConnPerIp: 3 });
  const port = await zone.start();
  const url = `ws://127.0.0.1:${port}`;
  try {
    const a = new SimClient('lima');
    await a.connect(url);
    await a.request('register', { account: 'lima', password: 'senha123' });
    await a.request('login', { account: 'lima', password: 'senha123' });
    const ch = await a.request('create_char', { name: 'Limadora', classId: 'breaker' });
    await a.request('enter', { charId: ch.char.id });
    // jogador comum não usa comando de mestre (servidor sem --dev)
    assert.equal((await a.request('gm', { cmd: 'gold', amount: 100 })).code, 'forbidden');
    // rajada: além do balde, vem rate_limited
    const limited = a.waitFor((m) => m.t === 'res' && m.code === 'rate_limited', 3000, 'rate_limited');
    for (let i = 0; i < 80; i++) a.send({ t: 'ping', rid: `flood-${i}` });
    await limited;
    // conexões por IP: a quarta é recusada
    const extra = [];
    for (let i = 0; i < 2; i++) { const w = new WebSocket(url); await new Promise((r) => w.on('open', r)); extra.push(w); }
    const w4 = new WebSocket(url);
    const kicked = await new Promise((resolve) => { w4.on('message', (b) => { const m = JSON.parse(b.toString()); if (m.t === 'kicked') resolve(m); }); w4.on('close', () => resolve(null)); });
    assert.ok(kicked, 'quarta conexão recusada');
    for (const w of extra) w.close();
    // papel de mestre dado no banco: comando liberado e auditado
    zone.store.setRole(zone.store.findAccount('lima').id, 'gm');
    await sleep(1200); // espera o balde encher
    await a.close();
    let b = new SimClient('lima2');
    await b.connect(url);
    const l2 = await b.request('login', { account: 'lima', password: 'senha123' });
    await b.request('enter', { charId: l2.chars[0].id });
    // mestre (gm) modera e se teleporta, mas não cria ouro, itens nem níveis (D138)
    const denied = await b.request('gm', { cmd: 'gold', amount: 50 });
    assert.equal(denied.code, 'forbidden', 'ouro de cenário é só para administradores');
    assert.equal((await b.request('gm', { cmd: 'give', defId: 'potion_hp_s', qty: 5 })).code, 'forbidden');
    assert.equal((await b.request('gm', { cmd: 'xp', level: 10 })).code, 'forbidden');
    assert.equal((await b.request('gm', { cmd: 'teleport', x: 30, z: 50 })).ok, true, 'teleporte do próprio personagem continua liberado');
    assert.equal((await b.request('gm', { cmd: 'teleport', x: 'longe', z: 50 })).code, 'bad_request', 'coordenada que não é número');
    assert.equal((await b.request('gm', { cmd: 'teleport', x: 9999, z: 50 })).code, 'bad_request', 'fora do mapa');
    const gm = zone.store.auditTail(20, 'gm').find((r) => JSON.parse(r.data_json).cmd === 'gold');
    assert.ok(gm, 'a tentativa recusada também fica na auditoria');
    await sleep(1200);
    await b.close();
    // administrador: ouro e itens com teto
    zone.store.setRole(zone.store.findAccount('lima').id, 'admin');
    b = new SimClient('lima3');
    await b.connect(url);
    const l3 = await b.request('login', { account: 'lima', password: 'senha123' });
    await b.request('enter', { charId: l3.chars[0].id });
    const g = await b.request('gm', { cmd: 'gold', amount: 50 });
    assert.equal(g.ok, true, g.reason);
    assert.equal((await b.request('gm', { cmd: 'gold', amount: 5_000_000 })).code, 'bad_request', 'teto de ouro por comando');
    const gv = await b.request('gm', { cmd: 'give', defId: 'potion_hp_s', qty: 10_000 });
    assert.equal(gv.ok, true, gv.reason);
    assert.equal(gv.char.items.find((i) => i.id === gv.instanceId).qty, zone.data.items.potion_hp_s.stack, 'quantidade limitada à pilha do item');
    assert.equal((await b.request('gm', { cmd: 'give', defId: 'potion_hp_s', qty: -5 })).ok, true);
    assert.equal((await b.request('gm', { cmd: 'xp', level: 'dez' })).code, 'bad_request');
    assert.equal((await b.request('gm', { cmd: 'quest_done', quests: 'c1_count' })).code, 'bad_request', 'lista de missões, não texto');
    // inundação contínua derruba a conexão
    const closed = new Promise((r) => b.ws.on('close', r));
    const flood = setInterval(() => { for (let i = 0; i < 60; i++) { try { b.send({ t: 'ping', rid: `f${Math.random()}` }); } catch { /* fechou */ } } }, 50);
    await Promise.race([closed, sleep(15000)]);
    clearInterval(flood);
    assert.equal(b.ws.readyState, WebSocket.CLOSED, 'expulso por inundação');
    assert.ok(zone.store.auditTail(20, 'kick_flood').length >= 1);
  } finally { await zone.stop(); rmSync(dir, { recursive: true, force: true }); }
});

test('desligamento gracioso avisa os jogadores e salva; TLS (wss) funciona', async () => {
  const dir = tmp('cinzas-tls-');
  try {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(dir, 'k.pem'), '-out', join(dir, 'c.pem'), '-days', '1', '-subj', '/CN=localhost'], { stdio: 'ignore' });
    const zone = new GameServer({ port: 0, host: '127.0.0.1', dbPath: join(dir, 't.db'), seed: 3, log: false, tlsCert: join(dir, 'c.pem'), tlsKey: join(dir, 'k.pem') });
    const port = await zone.start();
    const ws = new WebSocket(`wss://127.0.0.1:${port}`, { rejectUnauthorized: false });
    const hello = await new Promise((resolve, reject) => { ws.on('message', (b) => resolve(JSON.parse(b.toString()))); ws.on('error', reject); });
    assert.equal(hello.t, 'hello');
    assert.equal(hello.protocol, 3);
    assert.match(hello.dataVersion, /^[0-9a-f]{12}$/);
    const notices = [];
    ws.on('message', (b) => { const m = JSON.parse(b.toString()); if (m.t === 'notice') notices.push(m); });
    const closed = new Promise((r) => ws.on('close', r));
    await zone.shutdown(1);
    await closed;
    assert.ok(notices.some((n) => n.kind === 'shutdown' && /reiniciar/.test(n.text)), 'aviso de reinício');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

