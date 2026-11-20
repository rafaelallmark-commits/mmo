// Várias zonas: serviço de mundo + dois servidores de zona no mesmo processo (portas livres, banco
// temporário compartilhado, sinal de vida rápido). A hospeda a Estrada Velha e as duas cidades; B, o
// resto. Confere: registro e autenticação das zonas, transferência na entrada e por portal, tokens
// (uso único, vencido, para outra zona, falsificado), posse única (o login derruba e salva na outra
// zona primeiro), sussurro, grupo e clã entre zonas, zona que cai e volta, e troca cancelada.
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

async function withCluster(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'cinzas-mz-'));
  const dbPath = join(dir, 'mz.db');
  const world = new WorldService({ port: 0, host: '127.0.0.1', secret: SECRET, heartbeatMs: 100, downAfterMs: 1000, log: false });
  await world.start();
  const worldUrl = `ws://127.0.0.1:${world.port}`;
  const zones = [];
  const zone = async (zoneId, maps, extra = {}) => {
    const z = new GameServer({ port: 0, host: '127.0.0.1', dbPath, seed: 31, dev: true, log: false, rateLimit: 1000, rateBurst: 1000, world: worldUrl, worldSecret: SECRET, zoneId, maps, ...extra });
    await z.start();
    z.url = `ws://127.0.0.1:${z.port}`;
    zones.push(z);
    return z;
  };
  const crash = async (z) => { await z.stop({ crash: true }); zones.splice(zones.indexOf(z), 1); };
  const halt = async (z) => { await z.stop(); zones.splice(zones.indexOf(z), 1); };
  const A = await zone('A', MAPS_A);
  const B = await zone('B', MAPS_B);
  try {
    await fn({ world, worldUrl, A, B, zone, crash, halt });
  } finally {
    for (const z of zones) await z.stop().catch(() => {});
    await world.stop();
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
    assert.ok(B.playerOf(pid));
    assert.ok(B.zone === undefined, 'B não hospeda a Estrada Velha');
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
