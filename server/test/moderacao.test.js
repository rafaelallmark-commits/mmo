// Moderação do teste público: papéis (jogador não modera), silêncio, denúncia com contexto do chat,
// limites do mestre, suspensão com expulsão e recusa de login (zona e serviço de contas), suspensão
// feita pela ferramenta valendo em até 1 minuto, "onde está" e anúncio.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GameServer } from '../src/server.js';
import { AccountsService } from '../src/contas.js';
import { SimClient, sleep } from './helpers/client.js';

const log = (...a) => console.log('   ·', ...a);

async function enter(url, name) {
  const c = new SimClient(name);
  await c.connect(url);
  await c.request('register', { account: `m_${name.toLowerCase()}`, password: 'senha123' });
  const l = await c.request('login', { account: `m_${name.toLowerCase()}`, password: 'senha123' });
  if (!l.ok) return { c, login: l };
  let ch = l.chars.find((x) => x.name === name);
  if (!ch) ch = (await c.request('create_char', { name, classId: 'breaker' })).char;
  const e = await c.request('enter', { charId: ch.id });
  assert.equal(e.ok, true, e.reason);
  return { c, login: l };
}

test('moderação: silêncio, denúncia, suspensão, ferramenta, onde está e anúncio', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cinzas-mod-'));
  const server = new GameServer({ port: 0, host: '127.0.0.1', dbPath: join(dir, 'm.db'), seed: 5, log: false });
  const port = await server.start();
  const url = `ws://127.0.0.1:${port}`;
  const accSvc = new AccountsService({ port: 0, dbPath: join(dir, 'm.db'), tokenSecret: 'segredo-de-teste-123', log: false, mailer: { send: async () => 'mem' } });
  const aport = await accSvc.start();
  try {
    // contas e papéis (o papel vale a partir do login)
    for (const n of ['Admina', 'Mestre']) {
      const c = new SimClient(n);
      await c.connect(url);
      await c.request('register', { account: `m_${n.toLowerCase()}`, password: 'senha123' });
      c.ws.close();
    }
    server.store.setRole(server.store.findAccount('m_admina').id, 'admin');
    server.store.setRole(server.store.findAccount('m_mestre').id, 'gm');
    const { c: A } = await enter(url, 'Admina');
    const { c: G } = await enter(url, 'Mestre');
    const { c: P } = await enter(url, 'Peregrino');
    const { c: Q } = await enter(url, 'Quezilento');

    // jogador comum não modera
    assert.equal((await P.request('gm', { cmd: 'kick', name: 'Quezilento' })).code, 'forbidden');

    // silêncio
    let r = await G.request('gm', { cmd: 'mute', name: 'Quezilento', minutes: 10, reason: 'flood' });
    assert.equal(r.ok, true, r.reason);
    r = await Q.request('chat', { text: 'oi' });
    assert.equal(r.code, 'muted');
    assert.match(r.reason, /silenciado até/);
    assert.equal((await G.request('gm', { cmd: 'unmute', name: 'Quezilento' })).ok, true);
    for (const t of ['vocês são todos ruins', 'vou te achar']) assert.equal((await Q.request('chat', { text: t })).ok, true);

    // denúncia guarda o contexto do chat; limites
    r = await P.request('report', { name: 'Quezilento', reason: 'ameaça no chat' });
    assert.equal(r.ok, true, r.reason);
    const rep = server.store.auditTail(5, 'report')[0];
    const d = JSON.parse(rep.data_json);
    assert.equal(d.targetName, 'Quezilento');
    assert.ok(d.chat.some((l) => l.text === 'vou te achar'), 'falas do denunciado vão junto');
    assert.equal((await P.request('report', { name: 'Peregrino', reason: 'x' })).code, 'self');
    for (let i = 0; i < 4; i++) await P.request('report', { name: 'Quezilento', reason: `de novo ${i}` });
    assert.equal((await P.request('report', { name: 'Quezilento', reason: 'mais uma' })).code, 'too_many');

    // relato de problema (/bug) com lugar e versões
    r = await P.request('bug_report', { text: 'a carroça travou no marco 2', client: '0.4.0' });
    assert.equal(r.ok, true, r.reason);
    const bug = JSON.parse(server.store.auditTail(5, 'bug_report')[0].data_json);
    assert.equal(bug.text, 'a carroça travou no marco 2');
    assert.equal(bug.map, 'estrada_velha');
    assert.equal(bug.client, '0.4.0');
    assert.ok(bug.server && bug.data, 'versões do servidor e dos dados');
    assert.equal((await P.request('bug_report', { text: 'oi' })).code, 'bad_request');

    // onde está e anúncio
    r = await G.request('gm', { cmd: 'where', name: 'Peregrino' });
    assert.match(r.message, /estrada_velha/);
    const ann = P.waitFor((m) => m.t === 'notice' && m.kind === 'announce', 3000, 'anúncio');
    assert.equal((await A.request('gm', { cmd: 'announce', text: 'Reinício às 20h' })).ok, true);
    assert.match((await ann).text, /Reinício às 20h/);

    // mestre suspende até 72 h; permanente só admin; motivo obrigatório
    assert.equal((await G.request('gm', { cmd: 'ban', name: 'Quezilento', hours: 100, reason: 'ameaças' })).code, 'forbidden');
    assert.equal((await G.request('gm', { cmd: 'ban', name: 'Quezilento', hours: 2 })).code, 'bad_request');
    const kicked = Q.waitFor((m) => m.t === 'kicked', 3000, 'expulsão');
    r = await G.request('gm', { cmd: 'ban', name: 'Quezilento', hours: 2, reason: 'ameaças' });
    assert.equal(r.ok, true, r.reason);
    assert.match((await kicked).reason, /Conta suspensa até .*ameaças/);
    await Q.closed;
    const again = new SimClient('Q2');
    await again.connect(url);
    r = await again.request('login', { account: 'm_quezilento', password: 'senha123' });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'banned');
    // o serviço de contas também recusa (conta confirmada)
    server.store.setVerified(server.store.findAccount('m_quezilento').id);
    const res = await fetch(`http://127.0.0.1:${aport}/sessoes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ conta: 'm_quezilento', senha: 'senha123' }) });
    assert.equal(res.status, 403);
    assert.match((await res.json()).erro, /Conta suspensa/);
    // admin retira; depois suspende sem data
    assert.equal((await A.request('gm', { cmd: 'unban', name: 'Quezilento' })).ok, true);
    assert.equal((await again.request('login', { account: 'm_quezilento', password: 'senha123' })).ok, true);
    again.ws.close();
    r = await A.request('gm', { cmd: 'ban', name: 'Quezilento', hours: 'perm', reason: 'reincidência' });
    assert.match(r.message, /sem data para acabar/);
    const third = new SimClient('Q3');
    await third.connect(url);
    assert.match((await third.request('login', { account: 'm_quezilento', password: 'senha123' })).reason, /sem data para acabar.*reincidência/);
    third.ws.close();
    log('silêncio, denúncia, limites do mestre e suspensão conferidos');

    // suspensão gravada pela ferramenta (direto no banco) derruba quem está on-line na próxima varredura
    const pk = P.waitFor((m) => m.t === 'kicked', 3000, 'expulsão pela varredura');
    server.store.setBan(server.store.findAccount('m_peregrino').id, Date.now() + 3600_000, 'teste da ferramenta');
    server.mod.lastSweep = 0;
    server.mod.sweep();
    assert.match((await pk).reason, /teste da ferramenta/);
    // auditoria registrou tudo
    const kinds = new Set(server.store.auditTail(200).map((a) => a.kind));
    for (const k of ['mod_mute', 'mod_unmute', 'mod_ban', 'mod_unban', 'report', 'login_banned']) assert.ok(kinds.has(k), `auditoria: ${k}`);
    log('ferramenta e auditoria conferidas');
    for (const c of [A, G]) c.ws.close();
    await sleep(100);
  } finally {
    await accSvc.stop().catch(() => {});
    await server.stop().catch(() => {});
    rmSync(dir, { recursive: true, force: true });
  }
});
