// Convivência (auditoria antes do teste público): lista de ignorados por personagem (sussurro, mapa,
// grupo e clã somem; convites de grupo, clã, troca e duelo recusados em silêncio; até 100; a equipe não é
// ignorada), intervalo do convite de grupo, marca [Equipe] no snapshot e no chat (ninguém imita), papel
// relido a cada minuto sem novo login e denúncia ou /bug avisando a equipe on-line, com contadores em /metrics.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GameServer } from '../src/server.js';
import { SimClient, sleep } from './helpers/client.js';

const log = (...a) => console.log('   ·', ...a);

async function boot(opts = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'cinzas-conv-'));
  const server = new GameServer({ port: 0, host: '127.0.0.1', dbPath: join(dir, 'c.db'), seed: 11, log: false, ...opts });
  const port = await server.start();
  return { server, url: `ws://127.0.0.1:${port}`, done: async () => { await server.stop().catch(() => {}); rmSync(dir, { recursive: true, force: true }); } };
}

// conta + personagem no mundo; role: papel dado antes do login; opts.delta: snapshots por diferença
async function player(server, url, acc, name, { role = null, delta = false } = {}) {
  const c = new SimClient(name, { delta });
  await c.connect(url);
  await c.request('register', { account: acc, password: 'senha123' });
  if (role) server.store.setRole(server.store.findAccount(acc).id, role);
  const l = await c.request('login', { account: acc, password: 'senha123' });
  assert.equal(l.ok, true, l.reason);
  let id = l.chars.find((x) => x.name === name)?.id;
  if (!id) { const r = await c.request('create_char', { name, classId: 'breaker' }); assert.equal(r.ok, true, r.reason); id = r.char.id; }
  const e = await c.request('enter', { charId: id });
  assert.equal(e.ok, true, e.reason);
  c.snap = e.snapshot;
  return { c, id };
}

// nada com essa forma chegou nos últimos instantes (dá tempo para uma entrega que não devia acontecer)
async function nothing(c, pred, ms = 300) {
  const since = Date.now();
  await sleep(ms);
  return !c.events.some((m) => m._at >= since - ms && pred(m));
}

test('lista de ignorados: sussurro, mapa, grupo e clã somem; convites recusados em silêncio; equipe não; até 100', async () => {
  const { server, url, done } = await boot({ rateLimit: 1000, rateBurst: 1000 });
  const st = server.store;
  try {
    const { c: ana, id: anaId } = await player(server, url, 'c_ana', 'Ana');
    const { c: beto, id: betoId } = await player(server, url, 'c_beto', 'Beto');
    const { c: caio, id: caioId } = await player(server, url, 'c_caio', 'Caio');
    const { c: vig } = await player(server, url, 'c_vigia', 'Vigia', { role: 'gm' });

    assert.equal((await ana.request('ignore_add', { name: 'Ana' })).code, 'self');
    assert.equal((await ana.request('ignore_add', { name: 'Ninguem' })).code, 'not_found');
    assert.equal((await ana.request('ignore_add', { name: 'vigia' })).code, 'staff', 'a equipe não pode ser ignorada');
    let r = await ana.request('ignore_add', { name: 'beto' });
    assert.equal(r.ok, true, r.reason);
    assert.match(r.message, /não verá mais/);
    assert.deepEqual((await ana.request('ignore_list')).ignored, ['Beto']);
    assert.equal(st.isIgnoring(anaId, betoId), true, 'gravado no banco');

    // sussurro: quem fala vê a própria fala como sempre; nada chega a quem ignora
    const echo = beto.waitFor((m) => m.t === 'chat' && m.channel === 'whisper' && m.text === 'oi Ana', 3000, 'eco do sussurro');
    assert.equal((await beto.request('chat', { channel: 'whisper', to: 'Ana', text: 'oi Ana' })).ok, true);
    await echo;
    assert.ok(await nothing(ana, (m) => m.t === 'chat' && m.from === 'Beto'), 'o sussurro do ignorado não chega');
    // mapa: os outros recebem, quem ignora não
    const heard = caio.waitFor((m) => m.t === 'chat' && m.channel === 'zone' && m.text === 'alô estrada', 3000, 'fala no mapa');
    assert.equal((await beto.request('chat', { text: 'alô estrada' })).ok, true);
    await heard;
    assert.ok(await nothing(ana, (m) => m.t === 'chat' && m.text === 'alô estrada'));
    // ignorar vale num sentido só: Beto ainda ouve Ana
    const back = beto.waitFor((m) => m.t === 'chat' && m.text === 'resposta', 3000, 'fala de Ana para Beto');
    assert.equal((await ana.request('chat', { text: 'resposta' })).ok, true);
    await back;

    // convites do ignorado: mesma resposta de um convite enviado, nada chega
    r = await beto.request('party_invite', { name: 'Ana' });
    assert.equal(r.ok, true, r.reason);
    r = await beto.request('trade_request', { name: 'Ana' });
    assert.equal(r.ok, true, r.reason);
    assert.match(r.message, /Pedido de troca enviado a Ana/);
    r = await beto.request('duel_request', { name: 'Ana' });
    assert.equal(r.ok, true, r.reason);
    assert.match(r.message, /Desafio enviado a Ana/);
    let betoClan;
    st.tx(() => { betoClan = st.createClan('Bando do Beto', 'BDB', betoId); });
    server.clans.attach(server.playerOf(betoId).char);
    r = await beto.request('clan_invite', { name: 'Ana' });
    assert.equal(r.ok, true, r.reason);
    assert.match(r.message, /Convite enviado a Ana/);
    assert.ok(await nothing(ana, (m) => ['party_invite', 'trade_invite', 'duel_invite', 'clan_invite'].includes(m.t)), 'nenhum convite chegou');
    assert.equal(server.invites.has(anaId), false);
    assert.equal(server.trades.invites.has(anaId), false);
    assert.equal(server.clans.invites.has(anaId), false);
    assert.equal((await ana.request('party_accept', { from: betoId })).code, 'no_invite', 'não há convite para aceitar');
    log('sussurro, fala no mapa e os quatro convites do ignorado não chegam; quem fala não percebe');

    // grupo e clã: a fala do ignorado não chega a quem ignora
    server.partyInviteAt.clear();
    for (const [cl, nm] of [[ana, 'Ana'], [beto, 'Beto']]) {
      const inv = cl.waitFor((m) => m.t === 'party_invite', 3000, `convite de grupo para ${nm}`);
      assert.equal((await caio.request('party_invite', { name: nm })).ok, true);
      assert.equal((await cl.request('party_accept', { from: (await inv).fromId })).ok, true);
      server.partyInviteAt.clear(); // (intervalo do convite: testado à parte)
    }
    const pc = caio.waitFor((m) => m.t === 'chat' && m.channel === 'party' && m.text === 'no grupo', 3000, 'fala no grupo');
    assert.equal((await beto.request('chat', { channel: 'party', text: 'no grupo' })).ok, true);
    await pc;
    assert.ok(await nothing(ana, (m) => m.t === 'chat' && m.text === 'no grupo'));
    st.tx(() => { st.deleteClan(betoClan); });
    let clan;
    st.tx(() => { clan = st.createClan('Liga do Vau', 'LDV', caioId); });
    st.addClanMember(clan, anaId);
    st.addClanMember(clan, betoId);
    for (const id of [anaId, betoId, caioId]) server.clans.attach(server.playerOf(id).char);
    const cc = caio.waitFor((m) => m.t === 'chat' && m.channel === 'clan' && m.text === 'no clã', 3000, 'fala no clã');
    assert.equal((await beto.request('chat', { channel: 'clan', text: 'no clã' })).ok, true);
    await cc;
    assert.ok(await nothing(ana, (m) => m.t === 'chat' && m.text === 'no clã'));
    // a equipe nunca é filtrada
    const gm = ana.waitFor((m) => m.t === 'chat' && m.from === 'Vigia' && m.staff === true, 3000, 'sussurro da equipe');
    assert.equal((await vig.request('chat', { channel: 'whisper', to: 'Ana', text: 'aviso da equipe' })).ok, true);
    await gm;

    // a lista fica no banco: vale de novo depois de sair e entrar
    ana.ws.close();
    await sleep(100);
    const { c: ana2 } = await player(server, url, 'c_ana', 'Ana');
    assert.deepEqual((await ana2.request('ignore_list')).ignored, ['Beto']);
    const echo2 = beto.waitFor((m) => m.t === 'chat' && m.text === 'voltou?', 3000, 'eco');
    await beto.request('chat', { channel: 'whisper', to: 'Ana', text: 'voltou?' });
    await echo2;
    assert.ok(await nothing(ana2, (m) => m.t === 'chat' && m.text === 'voltou?'));
    // designorar: volta a receber
    assert.equal((await ana2.request('ignore_remove', { name: 'Caio' })).code, 'not_found');
    r = await ana2.request('ignore_remove', { name: 'BETO' });
    assert.equal(r.ok, true, r.reason);
    const got = ana2.waitFor((m) => m.t === 'chat' && m.text === 'agora sim', 3000, 'sussurro depois de designorar');
    await beto.request('chat', { channel: 'whisper', to: 'Ana', text: 'agora sim' });
    await got;
    assert.equal(st.isIgnoring(anaId, betoId), false);
    assert.equal((await ana2.request('ignore_list')).message, 'Sua lista de ignorados está vazia.');
    // fora do ar e com maiúscula acentuada: "élio" acha "Élio" (o banco só iguala maiúsculas em A-Z)
    const { c: elio } = await player(server, url, 'c_elio', 'Élio');
    elio.ws.close();
    await sleep(150);
    r = await ana2.request('ignore_add', { name: 'élio' });
    assert.equal(r.ok, true, r.reason);
    assert.match(r.message, /Élio/);
    assert.equal((await ana2.request('ignore_remove', { name: 'ÉLIO' })).ok, true);
    // limite de 100
    const p = server.playerOf(anaId);
    for (let i = 0; i < 100; i++) p.char.ignored.add(-1 - i);
    assert.equal((await ana2.request('ignore_add', { name: 'Caio' })).code, 'full');
    log('lista guardada no banco (vale depois de entrar de novo), designorar devolve as falas, limite de 100');
    for (const c of [ana2, beto, caio, vig]) c.ws.close();
    await sleep(50);
  } finally { await done(); }
});

test('convite de grupo: no máximo 1 a cada 10 s por quem convida', async () => {
  const { server, url, done } = await boot();
  try {
    const { c: a, id: aId } = await player(server, url, 'c_lider', 'Lidera');
    const { c: b } = await player(server, url, 'c_bia', 'Bia');
    const { c: d } = await player(server, url, 'c_davi', 'Davi');
    const inv = b.waitFor((m) => m.t === 'party_invite', 3000, 'convite');
    assert.equal((await a.request('party_invite', { name: 'Bia' })).ok, true);
    await inv;
    const r = await a.request('party_invite', { name: 'Davi' });
    assert.equal(r.code, 'too_fast');
    assert.match(r.reason, /Espere \d+ s/);
    assert.ok(await nothing(d, (m) => m.t === 'party_invite'));
    // passados os 10 s, o convite segue
    server.partyInviteAt.set(aId, Date.now() - 10_001);
    const inv2 = d.waitFor((m) => m.t === 'party_invite', 3000, 'convite depois do intervalo');
    assert.equal((await a.request('party_invite', { name: 'Davi' })).ok, true);
    await inv2;
    for (const c of [a, b, d]) c.ws.close();
    await sleep(50);
  } finally { await done(); }
});

test('marca da equipe no snapshot e no chat, que ninguém imita; papel relido na varredura sem novo login', async () => {
  const { server, url, done } = await boot();
  try {
    const { c: g, id: gId } = await player(server, url, 'c_guarda', 'Guarnicao', { role: 'gm' });
    const { c: p, id: pId } = await player(server, url, 'c_povo', 'Povoado', { delta: true });
    // snapshot completo (quem entrou) e por diferença (o cliente que pediu delta)
    const entOf = (c, id) => c.snap?.ents.find((e) => e.id === `p${id}`);
    assert.equal(entOf(p, gId)?.staff, true, 'snapshot da entrada');
    assert.equal(entOf(p, pId)?.staff, false);
    await p.waitFor((m) => m.t === 'snap' && m.ents.some((e) => e.id === `p${gId}` && e.staff === true), 3000, 'marca no snapshot por diferença');
    await g.waitFor((m) => m.t === 'snap' && m.ents.some((e) => e.id === `p${pId}` && e.staff === false), 3000, 'jogador sem marca');
    // chat: o servidor põe staff; o que o cliente manda é ignorado
    let got = p.waitFor((m) => m.t === 'chat' && m.text === 'boa noite', 3000, 'fala da equipe');
    await g.request('chat', { text: 'boa noite' });
    assert.equal((await got).staff, true);
    got = g.waitFor((m) => m.t === 'chat' && m.text === 'sou da equipe', 3000, 'fala do jogador');
    await p.request('chat', { text: 'sou da equipe', staff: true });
    assert.equal((await got).staff, undefined, 'jogador não ganha a marca pedindo');
    assert.equal((await p.request('create_char', { name: 'Equipe', classId: 'breaker' })).code, 'bad_name', 'nem pelo nome');

    // rebaixado no banco: a varredura de cada minuto tira o poder e a marca, sem novo login
    assert.equal((await g.request('gm', { cmd: 'where', name: 'Povoado' })).ok, true);
    server.store.setRole(server.store.findAccount('c_guarda').id, 'player');
    const told = g.waitFor((m) => m.t === 'system' && /papel na equipe mudou/.test(m.text), 3000, 'aviso do papel');
    server.mod.lastSweep = 0;
    server.mod.sweep();
    await told;
    assert.equal((await g.request('gm', { cmd: 'where', name: 'Povoado' })).code, 'forbidden', 'perdeu o poder sem sair do jogo');
    await p.waitFor((m) => m.t === 'snap' && m.ents.some((e) => e.id === `p${gId}` && e.staff === false), 3000, 'marca retirada do snapshot por diferença');
    got = p.waitFor((m) => m.t === 'chat' && m.text === 'agora sou jogador', 3000, 'fala depois do rebaixamento');
    await g.request('chat', { text: 'agora sou jogador' });
    assert.equal((await got).staff, undefined);
    // promovido: vale na próxima varredura
    server.store.setRole(server.store.findAccount('c_povo').id, 'admin');
    server.mod.lastSweep = 0;
    server.mod.sweep();
    assert.equal(server.byChar.get(pId).role, 'admin');
    assert.equal((await p.request('gm', { cmd: 'gold', amount: 10 })).ok, true, 'comando de admin sem novo login');
    assert.equal(server.playerOf(pId).char.staff, true);
    log('marca no snapshot (completo e por diferença) e no chat; rebaixar e promover valem na varredura');
    for (const c of [g, p]) c.ws.close();
    await sleep(50);
  } finally { await done(); }
});

test('denúncia e /bug avisam a equipe on-line e contam em /metrics', async () => {
  const { server, url, done } = await boot({ metricsPort: 0 });
  try {
    const { c: g } = await player(server, url, 'c_mestra', 'Zeladora', { role: 'gm' });
    const { c: a } = await player(server, url, 'c_admina', 'Diretora', { role: 'admin' });
    const { c: p } = await player(server, url, 'c_reclama', 'Reclamante');
    const { c: q } = await player(server, url, 'c_ruidoso', 'Ruidoso');
    await q.request('chat', { text: 'vocês são péssimos' });
    const toG = g.waitFor((m) => m.t === 'notice' && m.kind === 'staff' && /denúncia/.test(m.text), 3000, 'aviso de denúncia (mestre)');
    const toA = a.waitFor((m) => m.t === 'notice' && m.kind === 'staff' && /denúncia/.test(m.text), 3000, 'aviso de denúncia (admin)');
    assert.equal((await p.request('report', { name: 'Ruidoso', reason: 'ofensa no chat' })).ok, true);
    const n = await toG;
    await toA;
    assert.match(n.text, /Reclamante contra Ruidoso: ofensa no chat/);
    const bug = g.waitFor((m) => m.t === 'notice' && m.kind === 'staff' && /\/bug/.test(m.text), 3000, 'aviso de /bug');
    assert.equal((await p.request('bug_report', { text: 'a carroça atravessou a ponte' })).ok, true);
    assert.match((await bug).text, /Reclamante em estrada_velha: a carroça atravessou a ponte/);
    assert.ok(await nothing(q, (m) => m.t === 'notice' && m.kind === 'staff'), 'jogador comum não recebe');
    assert.ok(await nothing(p, (m) => m.t === 'notice' && m.kind === 'staff'));
    const txt = await (await fetch(`http://127.0.0.1:${server.metricsPort}/metrics`)).text();
    assert.match(txt, /# TYPE cinzas_reports_total counter\ncinzas_reports_total 1\n/);
    assert.match(txt, /# TYPE cinzas_bug_reports_total counter\ncinzas_bug_reports_total 1\n/);
    // a janela das métricas (POST /metrics/reset) não zera os contadores
    await fetch(`http://127.0.0.1:${server.metricsPort}/metrics/reset`, { method: 'POST' });
    assert.match(await (await fetch(`http://127.0.0.1:${server.metricsPort}/metrics`)).text(), /cinzas_reports_total 1\n/);
    for (const c of [g, a, p, q]) c.ws.close();
    await sleep(50);
  } finally { await done(); }
});
