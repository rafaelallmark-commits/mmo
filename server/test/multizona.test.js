// Várias zonas: serviço de mundo + dois servidores de zona no mesmo processo (portas livres, banco
// temporário compartilhado, sinal de vida rápido). A hospeda a Estrada Velha e as duas cidades; B, o
// resto. Confere: registro e autenticação das zonas, transferência na entrada e por portal, tokens
// (uso único, vencido, para outra zona, falsificado), posse única (o login derruba e salva na outra
// zona primeiro, inclusive no meio de uma transferência), sussurro, grupo e clã entre zonas, zona que
// cai e volta, mundo que reinicia, desligamento, troca cancelada e moderação (suspensão e silêncio
// valem na chegada por transferência; expulsão, silêncio, "onde está" e anúncio entre zonas). E as
// janelas de corrida: posse pedida de volta antes de o personagem carregar, zona que o mundo não ouve
// (só o sinal de vida respondido conta), token ultrapassado na chegada e resposta de transferência perdida.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { GameServer } from '../src/server.js';
import { WorldService, zoneAuth } from '../src/world.js';
import { signToken } from '../src/token.js';
import { SimClient, sleep } from './helpers/client.js';

const SECRET = 'segredo-do-mundo-de-teste-0123456789';
const MAPS_A = ['estrada_velha', 'pedrambar', 'vau_de_nacar'];
const MAPS_B = ['brejo_bombas', 'oficina_soterrada', 'galerias_eco', 'canais_eclusa'];
const log = (...a) => console.log('   ·', ...a);

const WORLD_OPTS = { host: '127.0.0.1', secret: SECRET, heartbeatMs: 100, downAfterMs: 1000, log: false };

async function withCluster(fn, worldOpts = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'cinzas-mz-'));
  const dbPath = join(dir, 'mz.db');
  const ctx = { world: new WorldService({ ...WORLD_OPTS, port: 0, ...worldOpts }) };
  await ctx.world.start();
  const worldUrl = `ws://127.0.0.1:${ctx.world.port}`;
  const zones = [];
  const zone = async (zoneId, maps, extra = {}) => {
    const z = new GameServer({ port: 0, host: '127.0.0.1', dbPath, seed: 31, dev: true, log: false, rateLimit: 1000, rateBurst: 1000, partyInviteGapMs: 0, world: worldUrl, worldSecret: SECRET, zoneId, maps, ...extra });
    await z.start();
    z.url = `ws://127.0.0.1:${z.port}`;
    zones.push(z);
    return z;
  };
  const crash = async (z) => { await z.stop({ crash: true }); zones.splice(zones.indexOf(z), 1); };
  const halt = async (z) => { await z.stop(); zones.splice(zones.indexOf(z), 1); };
  // reinício do serviço de mundo: para e sobe outro na mesma porta (estado zerado)
  const restartWorld = async () => {
    const port = ctx.world.port;
    await ctx.world.stop();
    ctx.world = new WorldService({ ...WORLD_OPTS, port, ...worldOpts });
    await ctx.world.start();
    return ctx.world;
  };
  const A = await zone('A', MAPS_A);
  const B = await zone('B', MAPS_B);
  try {
    await fn({ world: ctx.world, worldUrl, A, B, zone, crash, halt, restartWorld, dbPath });
  } finally {
    for (const z of zones) await z.stop().catch(() => {});
    await ctx.world.stop().catch(() => {});
    rmSync(dir, { recursive: true, force: true });
  }
}

async function waitUntil(pred, what, ms = 5000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (pred()) return; await sleep(20); }
  throw new Error(`tempo esgotado: ${what}`);
}

async function login(url, account, label = account) {
  const c = new SimClient(label);
  await c.connect(url);
  await c.request('register', { account, password: 'senha123' });
  const r = await c.request('login', { account, password: 'senha123' });
  assert.equal(r.ok, true, r.reason);
  return c;
}

// conta e personagem criados pela zona A, que hospeda a Estrada Velha (o mapa inicial)
async function hero(A, name, classId = 'breaker') {
  const c = await login(A.url, `mz_${name.toLowerCase()}`, name);
  const r = await c.request('create_char', { name, classId });
  assert.equal(r.ok, true, r.reason);
  const e = await c.request('enter', { charId: r.char.id });
  assert.equal(e.ok, true, e.reason);
  assert.equal(e.transfer, undefined, 'a Estrada Velha é de A: entra direto');
  c.snap = e.snapshot;
  return c;
}

// faz o que o cliente Godot faz com { transfer }: conexão nova no endereço recebido + login_transfer
async function follow(tr, label) {
  const c = new SimClient(label);
  await c.connect(tr.url);
  const r = await c.request('login_transfer', { token: tr.token });
  if (r.ok) c.snap = r.snapshot;
  return { c, r };
}

// entra de novo com um personagem que já existe (login em A; se o mapa dele é de B, segue a transferência)
async function reenter(A, account, charId, label) {
  const c = await login(A.url, account, label);
  const e = await c.request('enter', { charId });
  assert.equal(e.ok, true, e.reason);
  if (!e.transfer) { c.snap = e.snapshot; return c; }
  const f = await follow(e.transfer, label);
  assert.equal(f.r.ok, true, f.r.reason);
  return f.c;
}

// leva o personagem a um mapa de outra zona (teleporte de mestre) e segue a transferência
async function goRemote(c, mapId, x, z, label) {
  const pushed = c.waitFor((m) => m.t === 'transfer', 5000, `transferência para ${mapId}`);
  const r = await c.request('gm', { cmd: 'teleport', mapId, x, z });
  assert.equal(r.ok, true, r.reason);
  const tr = await pushed;
  const f = await follow(tr, label);
  assert.equal(f.r.ok, true, f.r.reason);
  return f.c;
}

function rawHello(worldUrl, hello) {
  return new Promise((resolve) => {
    const ws = new WebSocket(worldUrl);
    ws.on('open', () => ws.send(JSON.stringify(hello)));
    ws.on('message', (b) => { const m = JSON.parse(b.toString()); if (m.t === 'refused' || m.t === 'welcome') { resolve(m); ws.close(); } });
    ws.on('close', () => resolve(null));
    ws.on('error', () => resolve(null));
  });
}

test('várias zonas: registro, entrada transferida, portal entre zonas e posse única', { timeout: 60000 }, async () => {
  await withCluster(async ({ world, worldUrl, A, B, zone, halt }) => {
    // registro: cada zona com os seus mapas
    assert.deepEqual([...world.zones.keys()].sort(), ['A', 'B']);
    assert.equal(world.mapOwner.get('brejo_bombas'), 'B');
    assert.equal(world.mapOwner.get('pedrambar'), 'A');
    assert.ok(A.zones.has('estrada_velha') && !A.zones.has('brejo_bombas'));
    assert.ok(B.zones.has('canais_eclusa') && !B.zones.has('pedrambar'));
    // autenticação: MAC errado, horário vencido e mapa já reivindicado são recusados
    const ts = Date.now();
    let h = await rawHello(worldUrl, { t: 'hello', zoneId: 'Z', maps: ['arena'], publicUrl: 'ws://x:1', ts, auth: zoneAuth('segredo-errado', 'Z', ts) });
    assert.equal(h?.t, 'refused');
    assert.match(h.reason, /autenticação inválida/);
    const old = Date.now() - 120000;
    h = await rawHello(worldUrl, { t: 'hello', zoneId: 'Z', maps: ['arena'], publicUrl: 'ws://x:1', ts: old, auth: zoneAuth(SECRET, 'Z', old) });
    assert.match(h?.reason ?? '', /fora do prazo/);
    const C = await zone('C', ['pedrambar'], { worldWaitMs: 400 });
    assert.equal(C.world.up, false);
    assert.match(C.world.refused ?? '', /já é da zona A/);
    await halt(C);
    assert.equal(world.mapOwner.get('pedrambar'), 'A');
    log('zonas A e B registradas; MAC errado, horário vencido e mapa repetido recusados');

    // 1) personagem salvo num mapa de B, login em A → transferência → chega em B na posição salva
    const v = await hero(A, 'Viajante');
    const id = v.char.id;
    await v.close();
    await waitUntil(() => !world.leases.has(id), 'posse liberada ao sair');
    A.store.db.prepare('UPDATE characters SET map_id = ?, x = ?, z = ? WHERE id = ?').run('brejo_bombas', 24, 66, id);
    const v2 = await login(A.url, 'mz_viajante', 'viajante2');
    const e = await v2.request('enter', { charId: id });
    assert.equal(e.ok, true, e.reason);
    assert.deepEqual([e.transfer.mapId, e.transfer.url], ['brejo_bombas', B.url]);
    assert.equal(A.playerOf(id), null, 'A não carrega o personagem');
    assert.equal(world.leases.get(id).state, 'transferring');
    assert.equal(world.leases.get(id).to, 'B');
    const { c: v3, r } = await follow(e.transfer, 'viajante3');
    assert.equal(r.ok, true, r.reason);
    assert.equal(r.transferred, true);
    assert.equal(r.account, 'mz_viajante');
    assert.deepEqual([r.char.mapId, r.char.x, r.char.z], ['brejo_bombas', 24, 66]);
    assert.ok(Array.isArray(r.snapshot.ents) && r.journal, 'responde como o enter');
    assert.ok(B.playerOf(id));
    assert.deepEqual([world.leases.get(id).zoneId, world.leases.get(id).state], ['B', 'online']);
    assert.equal((await v3.request('move', { x: 26, z: 66 })).ok, true, 'a sessão em B joga normalmente');
    log('entrada por A de quem estava no Brejo: transferido para B, na posição salva (24, 66)');

    // 2) portal da Estrada Velha (A) para o Brejo (B): sai de A, aparece em B, posição gravada antes
    const p = await hero(A, 'Passante');
    const pid = p.char.id;
    await p.request('gm', { cmd: 'xp', level: 5 });
    await p.request('gm', { cmd: 'teleport', x: 148.5, z: 92 });
    // recarga de habilidade e de tônico em andamento: seguem como tempo restante para a outra zona
    const pa = A.playerOf(pid);
    pa.cooldowns.rupture = pa.zone.now + 20000;
    pa.potionReadyAt = pa.zone.now + 2500;
    const pushed = p.waitFor((m) => m.t === 'transfer', 5000, 'transferência');
    const pr = await p.request('portal', { portal: 'to_brejo' });
    assert.equal(pr.ok, true, pr.reason);
    const tr = await pushed;
    assert.equal(tr.mapId, 'brejo_bombas');
    assert.equal(A.playerOf(pid), null, 'saiu de A');
    const saved = A.store.loadCharacter(pid);
    assert.deepEqual([saved.mapId, saved.x, saved.z], ['brejo_bombas', 10, 70], 'A gravou no destino antes do token');
    const { c: pb, r: rb } = await follow(tr, 'passante-b');
    assert.equal(rb.ok, true, rb.reason);
    assert.deepEqual([rb.char.mapId, rb.char.x, rb.char.z, rb.char.level], ['brejo_bombas', 10, 70, 5]);
    const pb0 = B.playerOf(pid);
    assert.ok(pb0);
    assert.ok(B.zone === undefined, 'B não hospeda a Estrada Velha');
    const cdLeft = pb0.cooldowns.rupture - pb0.zone.now;
    assert.ok(cdLeft > 15000 && cdLeft <= 20000, `recarga seguiu para B (${cdLeft} ms)`);
    assert.ok(pb0.potionReadyAt - pb0.zone.now > 0, 'recarga do tônico seguiu para B');
    assert.ok(rb.char.cooldowns.rupture > 15000, 'a ficha da chegada mostra a recarga');
    // o mesmo token de novo: recusado (uso único) e quem já entrou continua
    const replay = await follow(tr, 'replay');
    assert.equal(replay.r.ok, false);
    assert.equal(replay.r.code, 'bad_token');
    assert.equal(B.byChar.get(pid)?.ws.readyState, 1);
    replay.c.ws.close();
    log('portal Estrada → Brejo: removido de A, em B em (10, 70); token repetido recusado');

    // 3) login em A com o personagem on-line em B: B salva e solta antes; nunca dois donos
    assert.equal((await pb.request('move', { x: 20, z: 70 })).ok, true);
    await waitUntil(() => { const q = B.playerOf(pid); return q && Math.hypot(q.char.x - 20, q.char.z - 70) < 0.3 && !q.char.speed; }, 'andou em B');
    const epoch = world.leases.get(pid).epoch;
    const kicked = pb.waitFor((m) => m.t === 'kicked', 5000, 'derrubado em B');
    const p2 = await login(A.url, 'mz_passante', 'passante-a2');
    let both = false;
    const watch = setInterval(() => { if (A.playerOf(pid) && B.playerOf(pid)) both = true; }, 2);
    const e2 = await p2.request('enter', { charId: pid });
    clearInterval(watch);
    assert.equal(e2.ok, true, e2.reason);
    await kicked;
    assert.equal(both, false, 'nunca duas zonas com o personagem');
    assert.equal(B.playerOf(pid), null);
    assert.equal(A.playerOf(pid), null);
    const saved2 = A.store.loadCharacter(pid);
    assert.ok(Math.hypot(saved2.x - 20, saved2.z - 70) < 0.3, `B salvou a posição antes de soltar (${saved2.x}, ${saved2.z})`);
    assert.equal(e2.transfer?.mapId, 'brejo_bombas', 'o mapa salvo é de B: volta para lá');
    const { c: pb2, r: rb2 } = await follow(e2.transfer, 'passante-b2');
    assert.equal(rb2.ok, true, rb2.reason);
    assert.ok(Math.hypot(rb2.char.x - 20, rb2.char.z - 70) < 0.3);
    assert.notEqual(world.leases.get(pid).epoch, epoch, 'posse nova');

    // e o contrário: on-line em A, login por B → A salva e solta, B transfere de volta para A
    const ana = await hero(A, 'Andarilha');
    const kicked2 = ana.waitFor((m) => m.t === 'kicked', 5000, 'derrubada em A');
    const viaB = await login(B.url, 'mz_andarilha', 'andarilha-b');
    const e3 = await viaB.request('enter', { charId: ana.char.id });
    assert.equal(e3.ok, true, e3.reason);
    await kicked2;
    assert.equal(e3.transfer?.url, A.url);
    const { r: ra } = await follow(e3.transfer, 'andarilha-a2');
    assert.equal(ra.ok, true, ra.reason);
    assert.equal(ra.char.mapId, 'estrada_velha');
    assert.ok(A.playerOf(ana.char.id) && !B.playerOf(ana.char.id));
    log('login com o personagem on-line na outra zona: ela salva e solta primeiro; nunca dois donos');
    for (const c of [v2, v3, p, pb2, p2, viaB]) c.ws.close();
  });
});

test('várias zonas: token de transferência vencido, falsificado, para outra zona ou sem posse', { timeout: 60000 }, async () => {
  await withCluster(async ({ world, A, B }) => {
    const c = await hero(A, 'Portador');
    const id = c.char.id;
    const accountId = A.store.findAccount('mz_portador').id;
    const make = (over = {}, secret = SECRET, ttl = 30) => signToken({ typ: 'transfer', charId: id, accountId, from: 'A', to: 'B', mapId: 'brejo_bombas', x: 10, z: 70, ...over }, secret, ttl);
    const at = async (url, token, label) => { const f = await follow({ url, token }, label); f.c.ws.close(); return f.r; };
    assert.equal((await at(B.url, make({}, SECRET, -10), 'vencido')).code, 'bad_token', 'vencido');
    assert.equal((await at(B.url, make({}, 'outro-segredo-qualquer-0123'), 'falso')).code, 'bad_token', 'assinado com outro segredo');
    const good = make();
    const [body, sig] = good.split('.');
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), charId: id + 1 })).toString('base64url');
    assert.equal((await at(B.url, `${forged}.${sig}`, 'adulterado')).code, 'bad_token', 'conteúdo adulterado');
    assert.equal((await at(B.url, make({ to: 'A' }), 'para-A')).code, 'wrong_zone', 'token de A apresentado em B');
    assert.equal((await at(A.url, make(), 'em-A')).code, 'wrong_zone', 'token de B apresentado em A');
    assert.equal((await at(B.url, make({ typ: 'sessao' }), 'tipo')).code, 'bad_token', 'token de outro tipo');
    // assinatura válida, mas sem transferência pedida: o personagem está on-line em A (posse de A)
    const r = await at(B.url, make(), 'sem-posse');
    assert.equal(r.ok, false);
    assert.equal(r.code, 'stale_transfer');
    assert.ok(A.playerOf(id) && !B.playerOf(id), 'A continua com o personagem');
    assert.deepEqual([world.leases.get(id).zoneId, world.leases.get(id).state], ['A', 'online']);
    // nenhuma tentativa abriu sessão em B
    assert.equal(B.byAccount.has(accountId), false);
    const fails = B.store.auditTail(50, 'login_fail').filter((a) => JSON.parse(a.data_json).via === 'transfer').length;
    assert.ok(fails >= 3, `auditoria das tentativas (${fails})`);
    log('tokens vencido, falsificado, adulterado, de outra zona, de outro tipo e sem posse: recusados');
    c.ws.close();
  });
});

test('várias zonas: sussurro, grupo e clã entre zonas', { timeout: 60000 }, async () => {
  await withCluster(async ({ world, A, B }) => {
    const ana = await hero(A, 'Anabela', 'breaker');
    const bru0 = await hero(A, 'Bruno', 'warden');
    await bru0.request('gm', { cmd: 'xp', level: 10 });
    const bru = await goRemote(bru0, 'brejo_bombas', 20, 70, 'bruno-b');
    const bid = bru.char.id, aid = ana.char.id;
    await waitUntil(() => A.remote.has(bid) && B.remote.has(aid), 'diretório nas duas zonas');
    // sussurro nos dois sentidos; para quem não está on-line, recusa
    let got = bru.waitFor((m) => m.t === 'chat' && m.channel === 'whisper', 3000, 'sussurro em B');
    assert.equal((await ana.request('chat', { channel: 'whisper', to: 'bruno', text: 'oi, Bruno' })).ok, true);
    let w = await got;
    assert.deepEqual([w.from, w.to, w.text], ['Anabela', 'Bruno', 'oi, Bruno']);
    got = ana.waitFor((m) => m.t === 'chat' && m.channel === 'whisper' && m.from === 'Bruno', 3000, 'sussurro em A');
    assert.equal((await bru.request('chat', { channel: 'whisper', to: 'Anabela', text: 'estou no brejo' })).ok, true);
    w = await got;
    assert.equal(w.text, 'estou no brejo');
    assert.equal((await ana.request('chat', { channel: 'whisper', to: 'Ninguem', text: 'oi' })).code, 'offline');
    log('sussurro de A para B e de B para A');

    // grupo entre zonas: convite, aceite, painel com o mapa de quem está na outra zona
    const inv = bru.waitFor((m) => m.t === 'party_invite', 3000, 'convite em B');
    assert.equal((await ana.request('party_invite', { name: 'Bruno' })).ok, true);
    const iv = await inv;
    assert.equal(iv.from, 'Anabela');
    assert.equal((await ana.request('party_invite', { name: 'Ninguem' })).code, 'offline');
    const acc = await bru.request('party_accept', { from: iv.fromId });
    assert.equal(acc.ok, true, acc.reason);
    assert.equal(acc.party.members.length, 2);
    await waitUntil(() => ana.party?.members.length === 2 && bru.party?.members.length === 2, 'painel do grupo nas duas zonas');
    const pid = acc.party.id;
    assert.equal(A.partyIdOf(aid), pid);
    assert.equal(B.partyIdOf(bid), pid);
    await waitUntil(() => ana.party.members.find((m) => m.charId === bid)?.level === 10, 'dados de Bruno vindos de B');
    const remoteB = ana.party.members.find((m) => m.charId === bid);
    assert.deepEqual([remoteB.online, remoteB.mapId, remoteB.name], [true, 'brejo_bombas', 'Bruno']);
    assert.ok(remoteB.mhp > 0);
    const remoteA = bru.party.members.find((m) => m.charId === aid);
    assert.deepEqual([remoteA.online, remoteA.mapId], [true, 'estrada_velha']);
    assert.equal(bru.party.leader, aid);
    // chat do grupo nos dois sentidos
    got = ana.waitFor((m) => m.t === 'chat' && m.channel === 'party' && m.text === 'vem pro brejo', 3000, 'grupo em A');
    assert.equal((await bru.request('chat', { channel: 'party', text: 'vem pro brejo' })).ok, true);
    assert.equal((await got).from, 'Bruno');
    got = bru.waitFor((m) => m.t === 'chat' && m.channel === 'party' && m.text === 'a caminho', 3000, 'grupo em B');
    assert.equal((await ana.request('chat', { channel: 'party', text: 'a caminho' })).ok, true);
    await got;
    log(`grupo ${pid} entre zonas: painel em A mostra Bruno no Brejo (nível 10); chat do grupo nos dois sentidos`);

    // clã entre zonas: convite para quem está em B, entrada, chat e cargo
    await ana.request('gm', { cmd: 'xp', level: 10 });
    await ana.request('gm', { cmd: 'gold', amount: 600 });
    const cr = await ana.request('clan_create', { name: 'Ordem do Vau', tag: 'VAU' });
    assert.equal(cr.ok, true, cr.reason);
    const cinv = bru.waitFor((m) => m.t === 'clan_invite', 3000, 'convite de clã em B');
    assert.equal((await ana.request('clan_invite', { name: 'Bruno' })).ok, true);
    const ci = await cinv;
    assert.equal(ci.clan.tag, 'VAU');
    const joined = ana.waitFor((m) => m.t === 'clan_event' && /Bruno entrou/.test(m.text), 3000, 'aviso de entrada em A');
    assert.equal((await bru.request('clan_accept', { clanId: ci.clan.id })).ok, true);
    await joined;
    assert.equal(B.playerOf(bid).char.clanTag, 'VAU');
    got = ana.waitFor((m) => m.t === 'chat' && m.channel === 'clan' && m.text === 'reunião no brejo', 3000, 'clã em A');
    assert.equal((await bru.request('chat', { channel: 'clan', text: 'reunião no brejo' })).ok, true);
    const cm = await got;
    assert.deepEqual([cm.from, cm.tag], ['Bruno', 'VAU']);
    got = bru.waitFor((m) => m.t === 'chat' && m.channel === 'clan' && m.text === 'levo as poções', 3000, 'clã em B');
    assert.equal((await ana.request('chat', { channel: 'clan', text: 'levo as poções' })).ok, true);
    await got;
    const info = (await ana.request('clan_info')).clan;
    assert.equal(info.members.find((m) => m.charId === bid).online, true, 'membro da outra zona aparece on-line');
    assert.equal((await ana.request('clan_rank', { charId: bid, rank: 'officer' })).ok, true);
    await waitUntil(() => B.playerOf(bid).char.clanRank === 'officer', 'cargo atualizado em B');
    log('clã: convite e entrada de quem está em B, chat do clã nos dois sentidos, cargo atualizado na outra zona');

    // saída do grupo: os dois painéis fecham (grupo de 1 se desfaz)
    assert.equal((await bru.request('party_leave')).ok, true);
    await waitUntil(() => ana.party === null && bru.party === null, 'grupo desfeito nas duas zonas');
    assert.equal(world.parties.size, 0);
    assert.equal(A.partyIdOf(aid), null);
    ana.ws.close(); bru.ws.close(); bru0.ws.close();
  });
});

test('várias zonas: zona que cai sem avisar tem as posses liberadas e o personagem volta numa B nova', { timeout: 60000 }, async () => {
  await withCluster(async ({ world, A, B, zone, crash }) => {
    const c0 = await hero(A, 'Sobrevivente');
    const id = c0.char.id;
    await goRemote(c0, 'galerias_eco', 30, 80, 'sobrevivente-b');
    assert.ok(B.playerOf(id));
    await crash(B); // processo morre: não salva, não libera, não se despede
    assert.equal(world.leases.get(id)?.zoneId, 'B', 'o mundo ainda não sabe');
    const c1 = await login(A.url, 'mz_sobrevivente', 'sobrevivente-a1');
    const t0 = Date.now();
    const e = await c1.request('enter', { charId: id });
    const waited = Date.now() - t0;
    // espera B ser dada como fora do ar (1 s sem sinal), recebe a posse e... as Galerias estão fora do ar
    assert.equal(e.ok, false);
    assert.equal(e.code, 'zone_down');
    assert.match(e.reason, /fora do ar/);
    assert.ok(waited >= 300, `esperou o prazo da zona caída (${waited} ms)`);
    assert.equal(world.zones.has('B'), false);
    assert.equal(world.leases.has(id), false, 'posses de B liberadas');
    assert.equal(world.mapOwner.has('galerias_eco'), false);
    log(`B caiu: depois de ${waited} ms sem sinal o mundo liberou as posses; entrada recusada com "${e.reason}"`);
    // B volta (processo novo, mesmo id e mapas, mesmo banco): o personagem entra de novo
    const B2 = await zone('B', MAPS_B);
    assert.equal(world.mapOwner.get('galerias_eco'), 'B');
    const e2 = await c1.request('enter', { charId: id });
    assert.equal(e2.ok, true, e2.reason);
    assert.equal(e2.transfer.url, B2.url);
    const { c: c2, r } = await follow(e2.transfer, 'sobrevivente-b2');
    assert.equal(r.ok, true, r.reason);
    assert.equal(r.char.mapId, 'galerias_eco');
    assert.ok(B2.playerOf(id));
    log('B nova registrada com os mesmos mapas; o personagem voltou às Galerias do Eco');
    c1.ws.close(); c2.ws.close();
  });
});

test('várias zonas: desligar a zona salva e libera as posses; transferência cancela a troca', { timeout: 60000 }, async () => {
  await withCluster(async ({ world, A, B, halt }) => {
    const x = await hero(A, 'Mascate');
    const y = await hero(A, 'Freguesa');
    await x.request('gm', { cmd: 'xp', level: 5 });
    await x.request('gm', { cmd: 'teleport', x: 148.5, z: 92 });
    await y.request('gm', { cmd: 'teleport', x: 146.5, z: 92 });
    const inv = y.waitFor((m) => m.t === 'trade_invite', 3000, 'pedido de troca');
    assert.equal((await x.request('trade_request', { name: 'Freguesa' })).ok, true);
    const iv = await inv;
    assert.equal((await y.request('trade_accept', { from: iv.fromId })).ok, true);
    assert.equal(A.trades.trades.size, 1);
    const closed = [x, y].map((c) => c.waitFor((m) => m.t === 'trade_closed', 3000, `troca fechada (${c.label})`));
    const pushed = x.waitFor((m) => m.t === 'transfer', 5000, 'transferência');
    assert.equal((await x.request('portal', { portal: 'to_brejo' })).ok, true);
    const [cx, cy] = await Promise.all(closed);
    assert.match(cx.reason, /troca de mapa/);
    assert.match(cy.reason, /troca de mapa/);
    assert.equal(A.trades.trades.size, 0);
    const { c: xb, r } = await follow(await pushed, 'mascate-b');
    assert.equal(r.ok, true, r.reason);
    log('portal com troca aberta: troca cancelada para os dois antes da transferência');

    // desligamento normal de B: salva e libera a posse na hora (sem esperar o prazo)
    assert.equal((await xb.request('move', { x: 14, z: 72 })).ok, true);
    await waitUntil(() => { const q = B.playerOf(x.char.id); return q && Math.hypot(q.char.x - 14, q.char.z - 72) < 0.3; }, 'andou em B');
    await halt(B);
    await waitUntil(() => !world.zones.has('B') && !world.leases.has(x.char.id), 'B saiu do registro e soltou a posse', 2000);
    const s = A.store.loadCharacter(x.char.id);
    assert.ok(Math.hypot(s.x - 14, s.z - 72) < 0.3, 'salvo ao desligar');
    log('desligamento de B: personagem salvo e posse liberada na hora');
    x.ws.close(); y.ws.close();
  });
});

test('várias zonas: login direto no meio de uma transferência e token antigo depois do login', { timeout: 60000 }, async () => {
  await withCluster(async ({ world, A, B }) => {
    // 1) a origem ainda não gravou (resposta do mundo atrasada em A): o login direto em B derruba o
    //    personagem em A, que grava e solta; o token atrasado nunca chega ao cliente antigo
    const c = await hero(A, 'Corredor');
    const id = c.char.id;
    await c.request('gm', { cmd: 'xp', level: 5 });
    await c.request('gm', { cmd: 'teleport', x: 148.5, z: 92 });
    const orig = A.world.request.bind(A.world);
    let delayed = 0;
    A.world.request = async (t, payload, ms) => {
      const r = await orig(t, payload, ms);
      if (t === 'transfer' && payload.charId === id) { delayed++; await sleep(500); }
      return r;
    };
    let gotToken = false;
    c.waitFor((m) => m.t === 'transfer', 3000).then(() => { gotToken = true; }, () => {});
    const kicked = c.waitFor((m) => m.t === 'kicked', 5000, 'derrubado em A');
    assert.equal((await c.request('portal', { portal: 'to_brejo' })).ok, true);
    await waitUntil(() => world.leases.get(id)?.state === 'transferring', 'posse em transferência');
    assert.equal(world.leases.get(id).saved, false, 'a origem ainda não gravou');
    let both = false;
    const watch = setInterval(() => { if (A.playerOf(id) && B.playerOf(id)) both = true; }, 2);
    const d = await login(B.url, 'mz_corredor', 'corredor-b');
    const e = await d.request('enter', { charId: id });
    clearInterval(watch);
    assert.equal(e.ok, true, e.reason);
    await kicked;
    assert.equal(both, false, 'nunca duas zonas com o personagem');
    assert.equal(delayed, 1);
    assert.equal(e.transfer?.url, A.url, 'A gravou na Estrada (não chegou a sair): B manda de volta para A');
    await sleep(600); // a resposta atrasada chega em A: o personagem já saiu, nada é enviado
    assert.equal(gotToken, false, 'o cliente antigo não recebe token');
    A.world.request = orig;
    const { c: back, r } = await follow(e.transfer, 'corredor-a2');
    assert.equal(r.ok, true, r.reason);
    assert.equal(r.char.mapId, 'estrada_velha');
    assert.ok(Math.hypot(r.char.x - 148.5, r.char.z - 92) < 1, 'posição gravada por A ao soltar');
    log('login direto durante a transferência (antes de a origem gravar): A soltou primeiro, sem token para o cliente antigo');

    // 2) a origem já gravou e mandou o token, mas o jogador entra de novo direto antes de usá-lo:
    //    o login vale e o token antigo deixa de servir
    const pushed = back.waitFor((m) => m.t === 'transfer', 5000, 'transferência');
    assert.equal((await back.request('portal', { portal: 'to_brejo' })).ok, true);
    const old = await pushed;
    await waitUntil(() => world.leases.get(id)?.saved === true, 'origem gravou');
    const again = await login(A.url, 'mz_corredor', 'corredor-a3');
    const e2 = await again.request('enter', { charId: id });
    assert.equal(e2.ok, true, e2.reason);
    assert.equal(e2.transfer?.mapId, 'brejo_bombas', 'gravado no destino: vai para B com um token novo');
    assert.notEqual(e2.transfer.token, old.token);
    const stale = await follow(old, 'token-velho');
    assert.equal(stale.r.ok, false);
    assert.equal(stale.r.code, 'stale_transfer');
    stale.c.ws.close();
    const { c: fresh, r: r2 } = await follow(e2.transfer, 'corredor-b2');
    assert.equal(r2.ok, true, r2.reason);
    assert.ok(B.playerOf(id) && !A.playerOf(id));
    log('token antigo depois de um login direto: recusado; o token novo entra');
    for (const x of [c, d, back, again, fresh]) x.ws.close();
  });
});

test('várias zonas: recado para quem está mudando de zona é entregue na chegada', { timeout: 60000 }, async () => {
  await withCluster(async ({ world, A, B }) => {
    const a = await hero(A, 'Remetente');
    const b0 = await hero(A, 'Andarilho');
    const bid = b0.char.id;
    await b0.request('gm', { cmd: 'xp', level: 5 });
    await b0.request('gm', { cmd: 'teleport', x: 148.5, z: 92 });
    const pushed = b0.waitFor((m) => m.t === 'transfer', 5000, 'transferência');
    assert.equal((await b0.request('portal', { portal: 'to_brejo' })).ok, true);
    const tr = await pushed;
    await waitUntil(() => A.remote.get(bid)?.zoneId === 'B', 'diretório de A aponta para B');
    // ainda sem chegar em B: o mundo guarda o sussurro
    assert.equal((await a.request('chat', { channel: 'whisper', to: 'Andarilho', text: 'te espero no brejo' })).ok, true);
    await waitUntil(() => world.leases.get(bid)?.inbox?.length === 1, 'recado guardado na posse em trânsito');
    const c = new SimClient('andarilho-b');
    await c.connect(tr.url);
    const got = c.waitFor((m) => m.t === 'chat' && m.channel === 'whisper' && m.text === 'te espero no brejo', 3000, 'recado na chegada');
    const r = await c.request('login_transfer', { token: tr.token });
    assert.equal(r.ok, true, r.reason);
    const w = await got;
    assert.deepEqual([w.from, w.to], ['Remetente', 'Andarilho']);
    log('sussurro mandado durante a transferência chegou depois do login_transfer em B');
    for (const x of [a, b0, c]) x.ws.close();
  });
});

test('várias zonas: moderação na chegada por transferência e entre zonas', { timeout: 60000 }, async () => {
  await withCluster(async ({ world, A, B }) => {
    const gm = await hero(A, 'Vigia');
    const gmId = gm.char.id;
    A.store.setRole(A.store.findAccount('mz_vigia').id, 'gm');
    const bad0 = await hero(A, 'Arruaceiro');
    const bid = bad0.char.id;
    const accountId = A.store.findAccount('mz_arruaceiro').id;
    await bad0.request('gm', { cmd: 'xp', level: 5 });
    const bad = await goRemote(bad0, 'brejo_bombas', 20, 70, 'arruaceiro-b');
    await waitUntil(() => A.remote.has(bid), 'diretório em A');

    // silêncio dado em A para quem está em B: vale na hora em B e acompanha a conta na volta para A
    const told = bad.waitFor((m) => m.t === 'system' && /silenciado/.test(m.text), 3000, 'aviso de silêncio em B');
    let r = await gm.request('gm', { cmd: 'mute', name: 'Arruaceiro', minutes: 10, reason: 'flood' });
    assert.equal(r.ok, true, r.reason);
    await told;
    assert.equal((await bad.request('chat', { text: 'oi brejo' })).code, 'muted');
    assert.equal((await bad.request('chat', { channel: 'whisper', to: 'Vigia', text: 'ei' })).code, 'muted');
    const home = await goRemote(bad, 'estrada_velha', 30, 50, 'arruaceiro-a');
    assert.equal(A.byChar.get(bid).mutedUntil > Date.now(), true, 'silêncio carregado no login por transferência');
    assert.equal((await home.request('chat', { text: 'voltei' })).code, 'muted');
    assert.equal((await gm.request('gm', { cmd: 'unmute', name: 'Arruaceiro' })).ok, true);
    // fala e sussurra de B para a denúncia feita em A ter contexto
    const there = await goRemote(home, 'brejo_bombas', 22, 70, 'arruaceiro-b2');
    await waitUntil(() => B.byChar.get(bid)?.mutedUntil === 0 || !B.byChar.get(bid)?.mutedUntil, 'sem silêncio em B');
    const heard = gm.waitFor((m) => m.t === 'chat' && m.channel === 'whisper' && m.from === 'Arruaceiro', 3000, 'sussurro em A');
    assert.equal((await there.request('chat', { channel: 'whisper', to: 'Vigia', text: 'vou te pegar' })).ok, true);
    await heard;
    r = await gm.request('report', { name: 'Arruaceiro', reason: 'ameaça por sussurro' });
    assert.equal(r.ok, true, r.reason);
    const rep = JSON.parse(A.store.auditTail(5, 'report')[0].data_json);
    assert.equal(rep.target, bid);
    assert.ok(rep.chat.some((l) => l.text === 'vou te pegar'), 'a fala vinda de B entra no contexto da denúncia');
    log('silêncio vale em B na hora e volta com a conta para A; denúncia em A tem a fala que veio de B');

    // "onde está", anúncio e expulsão de quem está na outra zona
    r = await gm.request('gm', { cmd: 'where', name: 'Arruaceiro' });
    assert.equal(r.ok, true, r.reason);
    assert.match(r.message, /brejo_bombas .*zona B/);
    const ann = there.waitFor((m) => m.t === 'notice' && m.kind === 'announce', 3000, 'anúncio em B');
    assert.equal((await gm.request('gm', { cmd: 'announce', text: 'Manutenção às 22h' })).ok, true);
    assert.match((await ann).text, /Manutenção às 22h/);
    const out = there.waitFor((m) => m.t === 'kicked', 3000, 'expulso em B');
    r = await gm.request('gm', { cmd: 'kick', name: 'Arruaceiro', reason: 'teste' });
    assert.equal(r.ok, true, r.reason);
    assert.match((await out).reason, /desconectado pela equipe/);
    await waitUntil(() => !B.playerOf(bid) && !world.leases.has(bid), 'B soltou e liberou a posse');
    log('"onde está", anúncio e expulsão de quem está em B, pedidos em A');

    // suspensão com o token na mão: a chegada em B é recusada e a posse fica livre
    const c1 = await login(A.url, 'mz_arruaceiro', 'arruaceiro-a3');
    const e = await c1.request('enter', { charId: bid });
    assert.equal(e.ok, true, e.reason);
    assert.equal(e.transfer?.mapId, 'brejo_bombas');
    const kickedA = c1.waitFor((m) => m.t === 'kicked', 3000, 'sessão sem personagem derrubada em A');
    r = await gm.request('gm', { cmd: 'ban', name: 'Arruaceiro', hours: 2, reason: 'ameaças' });
    assert.equal(r.ok, true, r.reason);
    assert.match((await kickedA).reason, /Conta suspensa/);
    const f = await follow(e.transfer, 'arruaceiro-banido');
    assert.equal(f.r.ok, false);
    assert.equal(f.r.code, 'banned');
    assert.match(f.r.reason, /Conta suspensa até .*ameaças/);
    f.c.ws.close();
    assert.equal(B.byAccount.has(accountId), false);
    await waitUntil(() => !world.leases.has(bid), 'posse liberada depois da recusa');
    const audit = B.store.auditTail(20, 'login_banned');
    assert.ok(audit.some((a) => a.account_id === accountId && JSON.parse(a.data_json).via === 'transfer'), 'auditoria da recusa por transferência');
    log('conta suspensa com token de transferência na mão: recusada em B e posse liberada');

    // o papel de mestre acompanha a sessão transferida (comandos de moderação continuam valendo)
    const gmB = await goRemote(gm, 'brejo_bombas', 18, 70, 'vigia-b');
    assert.equal(B.byChar.get(gmId).role, 'gm');
    assert.equal((await gmB.request('gm', { cmd: 'unban', name: 'Arruaceiro' })).ok, true);
    for (const x of [bad0, home, c1, gm, gmB]) x.ws.close();
  });
});

test('várias zonas: mundo que reinicia recebe as posses de volta das zonas; desligamento recusa chegadas', { timeout: 60000 }, async () => {
  await withCluster(async ({ A, B, restartWorld, halt }) => {
    const x = await hero(A, 'Constante');
    const y0 = await hero(A, 'Andante');
    await y0.request('gm', { cmd: 'xp', level: 5 });
    const y = await goRemote(y0, 'brejo_bombas', 20, 70, 'andante-b');
    const xid = x.char.id, yid = y.char.id;
    await waitUntil(() => A.remote.has(yid), 'diretório em A');
    const inv = y.waitFor((m) => m.t === 'party_invite', 3000, 'convite em B');
    assert.equal((await x.request('party_invite', { name: 'Andante' })).ok, true);
    assert.equal((await y.request('party_accept', { from: (await inv).fromId })).ok, true);
    await waitUntil(() => x.party?.members.length === 2 && y.party?.members.length === 2, 'grupo entre zonas');
    // o mundo reinicia (estado zerado): as zonas se reapresentam com quem têm carregado
    const w2 = await restartWorld();
    await waitUntil(() => w2.zones.get('A')?.connected && w2.zones.get('B')?.connected, 'zonas de volta ao mundo novo', 5000);
    assert.deepEqual([w2.leases.get(xid)?.zoneId, w2.leases.get(yid)?.zoneId], ['A', 'B'], 'posses reconstruídas pelo hello');
    assert.ok(A.playerOf(xid) && B.playerOf(yid), 'ninguém foi derrubado');
    await waitUntil(() => A.remote.has(yid) && B.remote.has(xid), 'diretório refeito');
    // grupos moram na memória do mundo: com ele reiniciado, os painéis fecham nas duas zonas
    await waitUntil(() => x.party === null && y.party === null && A.partyIdOf(xid) === null && B.partyIdOf(yid) === null, 'grupo antigo fechado');
    // e continua valendo posse única: login de X por B derruba X em A primeiro
    const kicked = x.waitFor((m) => m.t === 'kicked', 5000, 'X derrubado em A');
    const viaB = await login(B.url, 'mz_constante', 'constante-b');
    const e = await viaB.request('enter', { charId: xid });
    assert.equal(e.ok, true, e.reason);
    await kicked;
    assert.equal(e.transfer?.url, A.url);
    assert.ok(!A.playerOf(xid) && !B.playerOf(xid));
    log('mundo reiniciado: A e B devolveram as posses no hello; login por B ainda derruba em A primeiro');

    // desligamento gracioso de B: durante o aviso o mundo não manda ninguém para lá
    const z = await hero(A, 'Atrasado');
    await z.request('gm', { cmd: 'xp', level: 5 });
    await z.request('gm', { cmd: 'teleport', x: 148.5, z: 92 });
    const down = B.shutdown(1);
    await waitUntil(() => w2.zones.get('B')?.draining && A.remoteMaps.get('brejo_bombas')?.up === false, 'B em desligamento');
    const r = await z.request('portal', { portal: 'to_brejo' });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'zone_down');
    assert.match(r.reason, /fora do ar/);
    await down;
    assert.equal(w2.leases.has(yid), false, 'B salvou e soltou ao desligar');
    log('B em desligamento: portal para o Brejo recusado enquanto B se despede');
    for (const c of [x, y0, y, viaB, z]) c.ws.close();
    void halt;
  }, { downAfterMs: 2000 });
});

test('várias zonas: posse pedida de volta antes de o personagem carregar (resposta e kick juntos) não deixa cópia sem posse', { timeout: 60000 }, async () => {
  await withCluster(async ({ world, A, B }) => {
    // mesma conta logada em A e em B; o personagem (na Estrada Velha, de A) ainda fora do mundo
    const a = await login(A.url, 'mz_gemeo', 'gemeo-a');
    const id = (await a.request('create_char', { name: 'Gemeo', classId: 'breaker' })).char.id;
    const b = await login(B.url, 'mz_gemeo', 'gemeo-b');
    // o ws entrega quadros que chegam juntos no mesmo instante: A lê a concessão da posse e, logo em
    // seguida, o kick que a entrada por B provocou, antes de o carregamento continuar
    const orig = A.world.onMessage.bind(A.world);
    let held = null;
    A.world.onMessage = (m) => {
      if (m.t === 'res' && m.ok && m.epoch && !held) { held = m; return; }
      if (m.t === 'kick' && held && held !== 'done') { const r = held; held = 'done'; orig(r); orig(m); return; }
      orig(m);
    };
    const ea = a.request('enter', { charId: id });
    await waitUntil(() => world.leases.get(id)?.zoneId === 'A' && held, 'posse concedida a A (resposta retida)');
    const eb = b.request('enter', { charId: id });
    const [ra, rb] = await Promise.all([ea, eb]);
    A.world.onMessage = orig;
    assert.equal(ra.ok, false, 'A desiste: a posse já foi pedida de volta');
    assert.equal(ra.code, 'kicked');
    assert.equal(A.playerOf(id), null, 'A não carregou o personagem sem posse');
    assert.equal(rb.ok, true, rb.reason);
    assert.equal(rb.transfer?.url, A.url, 'a Estrada é de A: B manda para lá com token');
    const { c, r } = await follow(rb.transfer, 'gemeo-a2');
    assert.equal(r.ok, true, r.reason);
    assert.ok(A.playerOf(id) && !B.playerOf(id));
    assert.deepEqual([world.leases.get(id).zoneId, world.leases.get(id).state, world.leases.get(id).epoch], ['A', 'online', A.byChar.get(id).leaseEpoch], 'uma cópia só, com a posse atual');
    log('resposta da posse e kick lidos juntos: A desistiu de carregar; o personagem entrou com a posse nova');
    for (const x of [a, b, c]) x.ws.close();
  });
});

test('várias zonas: zona que o mundo não ouve se cerca antes do prazo, mesmo recebendo mensagens dele', { timeout: 60000 }, async () => {
  await withCluster(async ({ world, A, B }) => {
    const c0 = await hero(A, 'Isolado');
    const id = c0.char.id;
    await c0.request('gm', { cmd: 'xp', level: 5 });
    const c = await goRemote(c0, 'brejo_bombas', 20, 70, 'isolado-b');
    assert.equal((await c.request('move', { x: 24, z: 70 })).ok, true);
    await waitUntil(() => { const q = B.playerOf(id); return q && Math.hypot(q.char.x - 24, q.char.z - 70) < 0.3; }, 'andou em B');
    // o mundo deixa de ouvir B (nada do que B manda chega), mas continua mandando coisas para B: só o
    // sinal de vida respondido conta como notícia, então B se cerca antes de o mundo liberar a posse
    B.world.ws.send = () => {};
    const chatter = setInterval(() => world.broadcast({ t: 'zones', zones: world.zoneList() }), 50);
    const kicked = c.waitFor((m) => m.t === 'kicked', 5000, 'B se cercou');
    const t0 = Date.now();
    let fencedAt = 0, downAt = 0;
    try {
      await waitUntil(() => {
        if (!fencedAt && !B.playerOf(id)) fencedAt = Date.now();
        if (!downAt && !world.zones.has('B')) downAt = Date.now();
        return fencedAt && downAt;
      }, 'cerca em B e queda no mundo', 6000);
    } finally { clearInterval(chatter); }
    assert.match((await kicked).reason, /Conexão com o mundo perdida/);
    assert.ok(fencedAt < downAt, `B soltou o personagem (${fencedAt - t0} ms) antes de o mundo liberar a posse (${downAt - t0} ms)`);
    const s = B.store.loadCharacter(id);
    assert.ok(Math.hypot(s.x - 24, s.z - 70) < 0.3, 'B gravou ao se cercar (ainda dentro do prazo)');
    log(`mundo surdo para B: B se cercou em ${fencedAt - t0} ms, o mundo deu B como fora do ar em ${downAt - t0} ms`);
    c0.ws.close(); c.ws.close();
  }, { downAfterMs: 2000 });
});

test('várias zonas: token ultrapassado não derruba quem já chegou ao destino', { timeout: 60000 }, async () => {
  await withCluster(async ({ world, A, B }) => {
    const c = await hero(A, 'Precavido');
    const id = c.char.id;
    await c.request('gm', { cmd: 'xp', level: 5 });
    await c.request('gm', { cmd: 'teleport', x: 148.5, z: 92 });
    const pushed = c.waitFor((m) => m.t === 'transfer', 5000, 'transferência');
    assert.equal((await c.request('portal', { portal: 'to_brejo' })).ok, true);
    const old = await pushed;
    await waitUntil(() => world.leases.get(id)?.saved === true, 'origem gravou');
    // em vez de usar o token, entra de novo direto por A: vai para B com um token novo e chega lá
    const again = await login(A.url, 'mz_precavido', 'precavido-a2');
    const e = await again.request('enter', { charId: id });
    assert.equal(e.transfer?.mapId, 'brejo_bombas', e.reason);
    const { c: fresh, r } = await follow(e.transfer, 'precavido-b');
    assert.equal(r.ok, true, r.reason);
    // o token antigo (assinatura válida, dentro do prazo, nunca usado em B) não serve e não derruba ninguém
    const stale = await follow(old, 'token-antigo');
    assert.equal(stale.r.ok, false);
    assert.equal(stale.r.code, 'stale_transfer');
    stale.c.ws.close();
    await sleep(100);
    assert.ok(B.playerOf(id), 'quem chegou continua em B');
    assert.equal(B.byChar.get(id)?.ws.readyState, 1);
    assert.deepEqual([world.leases.get(id).zoneId, world.leases.get(id).state], ['B', 'online']);
    assert.equal((await fresh.request('move', { x: 12, z: 70 })).ok, true);
    log('token ultrapassado apresentado em B depois da chegada: recusado, sessão de quem chegou intacta');
    for (const x of [c, again, fresh]) x.ws.close();
  });
});

test('várias zonas: resposta da transferência que não chega a tempo devolve a posse na hora; troca e duelo esperam', { timeout: 60000 }, async () => {
  await withCluster(async ({ world, A }) => {
    const x = await hero(A, 'Paciente');
    const y = await hero(A, 'Vizinha');
    const id = x.char.id;
    await x.request('gm', { cmd: 'xp', level: 5 });
    await x.request('gm', { cmd: 'teleport', x: 148.5, z: 92 });
    await y.request('gm', { cmd: 'teleport', x: 146.5, z: 92 });
    // o mundo marca a transferência, mas a resposta "se perde": A recebe o tempo esgotado depois de 400 ms
    const orig = A.world.request.bind(A.world);
    A.world.request = async (t, payload, ms) => {
      const r = await orig(t, payload, ms);
      if (t !== 'transfer' || payload.charId !== id) return r;
      await sleep(400);
      return { ok: false, code: 'world_timeout', reason: 'O mundo não respondeu. Tente de novo.' };
    };
    const told = x.waitFor((m) => m.t === 'system' && /não respondeu/.test(m.text), 3000, 'aviso ao jogador');
    assert.equal((await x.request('portal', { portal: 'to_brejo' })).ok, true);
    await waitUntil(() => world.leases.get(id)?.state === 'transferring', 'mundo marcou a transferência');
    // enquanto espera o token, não abre troca nem duelo
    assert.equal((await x.request('trade_request', { name: 'Vizinha' })).code, 'busy');
    assert.equal((await x.request('duel_request', { name: 'Vizinha' })).code, 'busy');
    await told;
    A.world.request = orig;
    await waitUntil(() => world.leases.get(id)?.state === 'online' && world.leases.get(id)?.zoneId === 'A', 'posse de volta a A sem esperar os 30 s', 1500);
    assert.ok(A.playerOf(id), 'continua em A');
    assert.equal(world.online.get(id)?.zoneId, 'A', 'diretório aponta para A de novo');
    // e recado pelo mundo chega direto (sem ficar guardado como "em trânsito")
    const got = x.waitFor((m) => m.t === 'system' && m.text === 'ainda aí?', 3000, 'recado pelo mundo em A');
    assert.equal(world.deliver(id, { t: 'system', text: 'ainda aí?' }), true);
    await got;
    log('resposta da transferência perdida: posse de volta a A na hora; troca e duelo recusados durante a espera');
    x.ws.close(); y.ws.close();
  });
});

test('várias zonas: lista de ignorados, marca da equipe, administração e aviso para a equipe entre zonas', { timeout: 60000 }, async () => {
  await withCluster(async ({ world, A, B }) => {
    // Zelo: mestre em A (papel antes do login); Anabela em A; Bruno em B
    A.store.createAccount('mz_zelo', 'senha123');
    A.store.setRole(A.store.findAccount('mz_zelo').id, 'gm');
    const zelo = await hero(A, 'Zelo');
    const ana = await hero(A, 'Anabela');
    const bru0 = await hero(A, 'Bruno', 'warden');
    await bru0.request('gm', { cmd: 'xp', level: 10 });
    const bru = await goRemote(bru0, 'brejo_bombas', 20, 70, 'bruno-b');
    const aid = ana.char.id, bid = bru.char.id, zid = zelo.char.id;
    await waitUntil(() => A.remote.has(bid) && B.remote.has(aid) && B.remote.has(zid), 'diretório nas duas zonas');
    // ignorado antes de entrar na equipe (a lista não aceita a equipe): o convite dele, de outra zona, chega
    B.store.addIgnore(bid, zid);
    B.playerOf(bid).char.ignored.add(zid);
    const zinv = bru.waitFor((m) => m.t === 'party_invite' && m.fromId === zid, 3000, 'convite da equipe em B');
    assert.equal((await zelo.request('party_invite', { name: 'Bruno' })).ok, true);
    assert.equal((await zinv).staff, true);
    assert.equal((await bru.request('party_decline', {})).ok, true);
    B.store.removeIgnore(bid, zid);
    B.playerOf(bid).char.ignored.delete(zid);
    // grupo com os três (antes de ignorar)
    for (const [c, n] of [[bru, 'Bruno'], [zelo, 'Zelo']]) {
      const inv = c.waitFor((m) => m.t === 'party_invite', 3000, `convite para ${n}`);
      assert.equal((await ana.request('party_invite', { name: n })).ok, true);
      assert.equal((await c.request('party_accept', { from: (await inv).fromId })).ok, true);
    }
    await waitUntil(() => ana.party?.members.length === 3 && bru.party?.members.length === 3, 'grupo de três');

    // Anabela (A) ignora Bruno (B): a lista fica no banco que as duas zonas usam
    assert.equal((await ana.request('ignore_add', { name: 'Bruno' })).ok, true);
    assert.equal(B.store.isIgnoring(aid, bid), true);
    const echo = bru.waitFor((m) => m.t === 'chat' && m.channel === 'whisper' && m.text === 'de B', 3000, 'eco em B');
    assert.equal((await bru.request('chat', { channel: 'whisper', to: 'Anabela', text: 'de B' })).ok, true);
    await echo;
    // fala de grupo de B: o mundo entrega em A; A descarta para quem ignora e entrega ao Zelo
    const zp = zelo.waitFor((m) => m.t === 'chat' && m.channel === 'party' && m.text === 'grupo de B', 3000, 'grupo em A');
    assert.equal((await bru.request('chat', { channel: 'party', text: 'grupo de B' })).ok, true);
    await zp;
    // clã: a fala de B chega ao Zelo em A, não à Anabela
    let clan;
    A.store.tx(() => { clan = A.store.createClan('Vigília do Vau', 'VDV', aid); });
    A.store.addClanMember(clan, bid);
    A.store.addClanMember(clan, zid);
    for (const id of [aid, zid]) A.clans.attach(A.playerOf(id).char);
    B.clans.attach(B.playerOf(bid).char);
    const zc = zelo.waitFor((m) => m.t === 'chat' && m.channel === 'clan' && m.text === 'clã de B', 3000, 'clã em A');
    assert.equal((await bru.request('chat', { channel: 'clan', text: 'clã de B' })).ok, true);
    await zc;
    // convite de grupo de quem ela ignora, vindo de B: a resposta é a de quem não é ignorado (ela está num grupo:
    // "já está em um grupo" — um "enviado" aqui entregaria que ele é ignorado) e, sem grupo, nada chega
    let pr = await bru.request('party_invite', { name: 'Anabela' });
    assert.equal(pr.code, 'in_party', 'a resposta não entrega que ele é ignorado');
    assert.equal((await ana.request('party_leave', {})).ok, true);
    assert.equal((await bru.request('party_leave', {})).ok, true);
    await waitUntil(() => !world.charParty.has(aid) && !world.charParty.has(bid), 'os dois fora do grupo');
    pr = await bru.request('party_invite', { name: 'Anabela' });
    assert.equal(pr.ok, true, pr.reason);
    await sleep(300);
    assert.ok(!ana.events.some((m) => (m.t === 'chat' && m.from === 'Bruno') || m.t === 'party_invite'), 'nada do Bruno chegou à Anabela');
    assert.equal(world.invites.has(aid), false, 'o mundo não guardou o convite');
    log('ignorado em outra zona: sussurro, fala de grupo e de clã e convite de grupo não chegam; os outros recebem');

    // marca da equipe atravessa zonas; denúncia e /bug feitos em B avisam a equipe em A
    const wz = bru.waitFor((m) => m.t === 'chat' && m.channel === 'whisper' && m.from === 'Zelo', 3000, 'sussurro da equipe em B');
    await zelo.request('chat', { channel: 'whisper', to: 'Bruno', text: 'tudo certo?' });
    assert.equal((await wz).staff, true);
    const note = zelo.waitFor((m) => m.t === 'notice' && m.kind === 'staff' && /\/bug de Bruno em brejo_bombas/.test(m.text), 3000, 'aviso de /bug em A');
    assert.equal((await bru.request('bug_report', { text: 'a bomba do brejo não liga' })).ok, true);
    await note;
    const rep = zelo.waitFor((m) => m.t === 'notice' && m.kind === 'staff' && /denúncia de Bruno contra Anabela/.test(m.text), 3000, 'aviso de denúncia em A');
    assert.equal((await bru.request('report', { name: 'Anabela', reason: 'teste entre zonas' })).ok, true);
    await rep;
    assert.ok(!ana.events.some((m) => m.t === 'notice' && m.kind === 'staff'), 'jogador não recebe aviso da equipe');

    // administração de quem está em outra zona (D146): a posse vem do mundo antes — a zona dele o grava e o
    // desconecta com o aviso —, o banco muda sem ninguém com o personagem carregado e a posse volta
    A.store.setRole(A.store.findAccount('mz_zelo').id, 'admin');
    A.mod.lastSweep = 0;
    A.mod.sweep();
    const released = (what) => waitUntil(() => !B.playerOf(bid) && !world.leases.has(bid), what);
    B.playerOf(bid).char.gold = 300; // só na memória de B: o banco ainda tem o ouro de antes
    let out = bru.waitFor((m) => m.t === 'kicked' && /revisar seu personagem/.test(m.reason), 3000, 'saída em B (ouro)');
    let r = await zelo.request('gm', { cmd: 'take_gold', name: 'Bruno', amount: 100 });
    assert.equal(r.ok, true, r.reason);
    assert.match(r.message, /100 de ouro \(ficou com 200\)/, 'B gravou antes: valeu o ouro que estava lá');
    await out;
    await released('posse devolvida (ouro)');
    assert.equal(A.store.loadCharacter(bid).gold, 200, 'nada gravou por cima');
    let bru2 = await reenter(A, 'mz_bruno', bid, 'bruno-b2');
    assert.equal(B.playerOf(bid).char.gold, 200, 'de volta a B, a ficha vem do banco já com a mudança');
    const potions = () => A.store.characterItems(bid).filter((i) => i.def_id === 'potion_hp_s').reduce((n, i) => n + i.qty, 0);
    const had = potions();
    assert.ok(had >= 2, 'tônicos do kit inicial');
    out = bru2.waitFor((m) => m.t === 'kicked' && /revisar seu personagem/.test(m.reason), 3000, 'saída em B (item)');
    r = await zelo.request('gm', { cmd: 'take_item', name: 'Bruno', defId: 'potion_hp_s', qty: 1 });
    assert.equal(r.ok, true, r.reason);
    await out;
    await released('posse devolvida (item)');
    assert.equal(potions(), had - 1);
    // fora do ar (em nenhuma zona): a posse só impede que ele entre no meio; ninguém é desconectado
    r = await zelo.request('gm', { cmd: 'take_item', name: 'Bruno', defId: 'potion_hp_s', qty: 1 });
    assert.equal(r.ok, true, r.reason);
    assert.equal(potions(), had - 2);
    await waitUntil(() => !world.leases.has(bid), 'posse devolvida (fora do ar)');
    // renomear quem está em outra zona: sai de lá com o aviso (o salvamento não grava o nome) e volta com o novo
    bru2 = await reenter(A, 'mz_bruno', bid, 'bruno-b3');
    out = bru2.waitFor((m) => m.t === 'kicked' && /renomeou seu personagem para Brunildo/.test(m.reason), 3000, 'saída em B (nome)');
    r = await zelo.request('gm', { cmd: 'rename', name: 'Bruno', newName: 'Brunildo' });
    assert.equal(r.ok, true, r.reason);
    await out;
    await released('B soltou o personagem');
    assert.equal(A.store.characterByName('Brunildo').id, bid);
    // renomear quem está on-line nesta zona: a memória muda aqui e o diretório das outras zonas acha o nome novo
    const told = ana.waitFor((m) => m.t === 'system' && /agora você é Anabelle/.test(m.text), 3000, 'aviso à renomeada');
    r = await zelo.request('gm', { cmd: 'rename', name: 'Anabela', newName: 'Anabelle' });
    assert.equal(r.ok, true, r.reason);
    await told;
    assert.equal(A.byName.get('anabelle'), aid);
    await waitUntil(() => B.remoteByName.get('anabelle') === aid && !B.remoteByName.has('anabela'), 'nome novo no diretório de B');
    // corrida: a entrada da própria jogadora nesta zona ganha a posse logo antes da administração (que a pediu
    // com ela fora do ar). A concessão da administração é a mais nova: a posse fica com a sessão dela, com
    // essa época — devolvê-la deixaria o mundo sem dono para um personagem carregado aqui
    ana.ws.close();
    await waitUntil(() => !A.playerOf(aid) && !world.leases.has(aid), 'Anabelle fora do ar');
    const ana3 = await login(A.url, 'mz_anabela', 'anabelle-3');
    const realRequest = A.world.request.bind(A.world);
    A.world.request = async (t, payload, ms) => {
      if (t === 'acquire' && payload.kickReason) {
        A.world.request = realRequest;
        const e = await ana3.request('enter', { charId: aid });
        assert.equal(e.ok, true, e.reason);
      }
      return realRequest(t, payload, ms);
    };
    r = await zelo.request('gm', { cmd: 'take_item', name: 'Anabelle', defId: 'potion_hp_s', qty: 1 });
    assert.equal(r.ok, true, r.reason);
    assert.ok(A.playerOf(aid), 'carregada aqui');
    await sleep(200);
    assert.ok(world.leases.has(aid), 'o mundo continua sabendo que ela está em A');
    assert.equal(world.leases.get(aid).epoch, A.byChar.get(aid).leaseEpoch, 'a sessão tem a época da posse atual');
    log('marca da equipe e avisos de denúncia e /bug entre zonas; ouro, item e nome de quem está em outra zona mudam com a posse do mundo (sai de lá gravado, nada grava por cima)');
    for (const c of [zelo, ana, bru0, bru, bru2, ana3]) c.ws.close();
  });
});
