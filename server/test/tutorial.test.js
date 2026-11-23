// Tutorial «Três do Outro Lado» (D165) e o Mapa da Estrada Velha (D166): Bento, Ligia e Caio escoltados
// até o círculo do Posto da Ponte, os sete passos guiados com dicas por classe, o segundo toque, a recompensa
// com o mapa e as pessoas resgatadas visíveis só para quem as resgata.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GameServer } from '../src/server.js';
import { loadGameData } from '../src/data.js';
import { QuestEngine } from '../src/quests.js';
import { SimClient, sleep } from './helpers/client.js';
import { playTutorial, followers, follower, goTo, waitUntil, tutorialQuest, waitObjective, d2 } from './helpers/tutorial.js';

const log = (...a) => console.log('   ·', ...a);
const data = loadGameData();

async function withServer(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'cinzas-tut-'));
  const server = new GameServer({ port: 0, host: '127.0.0.1', dbPath: join(dir, 'tut.db'), timeScale: 4, seed: 7171, dev: true, log: false });
  const port = await server.start();
  try { await fn(server, `ws://127.0.0.1:${port}`); } finally { await server.stop().catch(() => {}); rmSync(dir, { recursive: true, force: true }); }
}

async function newChar(url, label, classId, name, opts = {}) {
  const c = new SimClient(label, opts);
  await c.connect(url);
  await c.request('register', { account: `acc_${label}`, password: 'senha123' });
  await c.request('login', { account: `acc_${label}`, password: 'senha123' });
  const r = await c.request('create_char', { name, classId });
  assert.equal(r.ok, true, r.reason);
  const e = await c.request('enter', { charId: r.char.id });
  c.snap = e.snapshot; c.journal = e.journal; c.char = e.char;
  return c;
}

async function relog(url, label, opts = {}) {
  const c = new SimClient(`${label}2`, opts);
  await c.connect(url);
  const l = await c.request('login', { account: `acc_${label}`, password: 'senha123' });
  const e = await c.request('enter', { charId: l.chars[0].id });
  c.snap = e.snapshot; c.journal = e.journal; c.char = e.char;
  return c;
}

const bagQty = (char, defId) => char.items.filter((i) => i.loc === 'bag' && i.defId === defId).reduce((s, i) => s + i.qty, 0);

test('Tutorial: dicas por classe e {skill} da tecla 1 vêm do servidor', () => {
  const q = new QuestEngine({ data, store: null });
  const char = (classId) => ({ classId, quests: new Map([['tutorial', { state: 'active', progress: {} }]]), items: new Map(), level: 1, unspent: 0 });
  const vw = q.view(char('warden'), 'tutorial');
  const vb = q.view(char('breaker'), 'tutorial');
  assert.equal(vw.objectives.length, 8);
  assert.deepEqual(vw.objectives.map((o) => o.step ?? null), [1, 2, 3, 4, 5, 6, 7, null]);
  assert.match(vw.objectives[2].hint, /Marca da Trilha/);
  assert.match(vb.objectives[2].hint, /Talho Profundo/);
  assert.match(vw.objectives[5].tip, /À distância/);
  assert.match(vb.objectives[5].tip, /Corpo a corpo: fique entre os bichos e o Caio/);
  assert.match(vw.startHint, /Mara Quintela/);
  for (const o of vw.objectives) assert.ok(o.hint && !o.hint.includes('{'), `dica do passo "${o.text}"`);
  // a Cantora (cetro) e o Tecelão (varinha) são à distância; Bastião e Lanceiro, corpo a corpo
  assert.match(q.view(char('veilsinger'), 'tutorial').objectives[1].tip, /À distância/);
  assert.match(q.view(char('pikeman'), 'tutorial').objectives[1].tip, /Corpo a corpo/);
  assert.deepEqual(data.quests.tutorial.rewards, { xp: 60, gold: 0, items: [['potion_hp_s', 3], ['map_estrada_velha', 1]] });
});

test('Tutorial: progresso gravado pelo tutorial antigo (objetos clicados) não trava os passos novos', () => {
  const saved = [];
  const q = new QuestEngine({ data, store: { saveQuest: (...a) => saved.push(a) } });
  // no meio do tutorial antigo o objetivo 0 era "interact" e guardava a lista dos objetos já clicados
  const char = { classId: 'breaker', level: 1, unspent: 0, items: new Map(), quests: new Map([['tutorial', { state: 'active', progress: { 0: ['rescue_bento', 'rescue_ligia'] } }]]) };
  assert.equal(q.view(char, 'tutorial').objectives[0].done, false, 'Bento continua preso: o tutorial novo recomeça');
  assert.deepEqual(q.onRescue(char, 'bento'), ['tutorial'], 'chegar a Bento marca o passo 1');
  assert.equal(q.view(char, 'tutorial').objectives[0].done, true);
  assert.deepEqual(q.onRescue(char, 'bento'), [], 'e só uma vez');
  // os outros tipos novos também só contam com o valor certo (não com qualquer coisa "verdadeira")
  const odd = { classId: 'breaker', level: 1, unspent: 0, items: new Map(), quests: new Map([['tutorial', { state: 'active', progress: { 2: 'x', 4: ['?'], 6: 1, 7: {} } }]]) };
  assert.deepEqual(q.onSkill(odd, data.classes.breaker.skills[0]), ['tutorial']);
  assert.deepEqual(q.onPickup(odd), ['tutorial']);
  assert.deepEqual(q.onBell(odd), ['tutorial']);
  assert.deepEqual(q.onArrive(odd), ['tutorial']);
  assert.deepEqual([2, 4, 6, 7].map((i) => q.view(odd, 'tutorial').objectives[i].done), [true, true, true, true]);
  assert.ok(saved.length >= 5);
});

test('Itens de missão que faltam na entrada: só os de recompensa que nenhuma entrega consome', () => {
  // dados de mentira: "carta" é recompensa de A e consumida por B (pode faltar de verdade); "mapa" só é recompensa
  const d = structuredClone(data);
  d.items.qi_carta = { ...d.items.map_estrada_velha, id: 'qi_carta', name: 'Carta' };
  d.quests = {
    a: { ...d.quests.tutorial, rewards: { xp: 0, gold: 0, items: [['qi_carta', 1], ['map_estrada_velha', 1], ['potion_hp_s', 3]] } },
    b: { ...d.quests.tutorial, objectives: [{ type: 'collect', item: 'qi_carta', count: 1, text: 'Entregue a carta' }] },
  };
  const inserted = [];
  const q = new QuestEngine({ data: d, store: { insertItem: (it) => inserted.push(it.defId) } });
  const char = { id: 1, items: new Map(), quests: new Map([['a', { state: 'done', progress: {} }], ['b', { state: 'done', progress: {} }]]) };
  assert.deepEqual(q.grantMissingQuestItems(char), ['map_estrada_velha'], 'nem a carta (consumida em B) nem o tônico (não é de missão)');
  assert.deepEqual(inserted, ['map_estrada_velha']);
  assert.deepEqual(q.grantMissingQuestItems(char), [], 'com o mapa na bolsa, nada mais');
});

test('Tutorial: personagem gravado no meio do tutorial antigo entra e solta Bento; quem já tinha entregue recebe o mapa ao entrar, uma vez só', { timeout: 120000 }, async () => {
  await withServer(async (server, url) => {
    // 1) no meio do tutorial antigo: Bento e Ligia "clicados" (progresso por interação)
    let A = await newChar(url, 'antigo', 'breaker', 'Antigo');
    const idA = A.char.id;
    await A.close();
    await sleep(200);
    server.store.saveQuest(idA, 'tutorial', 'active', { 0: ['rescue_bento', 'rescue_ligia'] });
    A = await relog(url, 'antigo');
    await waitUntil(() => followers(A).length === 3, 5000, 'os três do tutorial novo');
    const bento = follower(A, 'Bento');
    assert.equal(bento.st, 'trapped');
    await goTo(A, bento.x - 2.5, bento.z + 1);
    await waitObjective(A, 0, 10000);
    await waitUntil(() => follower(A, 'Bento')?.st === 'follow', 5000, 'Bento seguindo');
    log('progresso do tutorial antigo: Bento volta a esperar e o passo 1 conta ao chegar nele');
    await A.close();

    // 2) entregou o tutorial antes de ele dar o mapa (aqui pelo comando de mestre, que não dá recompensa)
    let B = await newChar(url, 'veterano', 'emberweaver', 'Veterano');
    assert.equal((await B.request('gm', { cmd: 'quest_done', quests: ['tutorial'] })).ok, true);
    assert.equal(B.char.items.filter((i) => i.defId === 'map_estrada_velha').length, 0);
    await B.close();
    await sleep(200);
    B = await relog(url, 'veterano');
    const maps = (c) => c.char.items.filter((i) => i.defId === 'map_estrada_velha');
    assert.equal(maps(B).length, 1, 'o mapa chega ao entrar');
    assert.equal(maps(B)[0].loc, 'bag');
    await B.close();
    await sleep(200);
    B = await relog(url, 'veterano');
    assert.equal(maps(B).length, 1, 'entrar de novo não dá outro');
    // quem ainda não entregou o tutorial não ganha o mapa
    const C = await newChar(url, 'novato', 'warden', 'Novato');
    await C.close();
    await sleep(200);
    const C2 = await relog(url, 'novato');
    assert.equal(maps(C2).length, 0);
    log('quem já tinha entregue o tutorial recebe o Mapa da Estrada Velha ao entrar (uma vez); quem não entregou, não');
    await Promise.all([B.close(), C2.close()]);
  });
});

test('Tutorial: os sete passos com Bento, Ligia e Caio escoltados até o posto; só o dono vê os três', { timeout: 240000 }, async () => {
  await withServer(async (server, url) => {
    const A = await newChar(url, 'tutor', 'emberweaver', 'Brasinha', { delta: true });
    const B = await newChar(url, 'vizinho', 'breaker', 'Vizinho');            // snapshot completo
    const C = await newChar(url, 'vizinha', 'warden', 'Vizinha', { delta: true }); // snapshot por diferença
    const leaks = [];
    for (const x of [B, C]) {
      x.ws.on('message', (buf) => {
        const m = JSON.parse(buf.toString());
        if ((m.t === 'snap' && m.ents.some((e) => e.k === 'e')) || m.t === 'say' || (m.t === 'warn' && m.kind === 'bell2')) leaks.push(`${x.label}: ${m.t}`);
      });
    }
    const avail = A.journal.available.find((q) => q.id === 'tutorial');
    assert.match(avail.startHint, /Mara Quintela/);
    const potions0 = bagQty(A.char, 'potion_hp_s');
    const res = await playTutorial(A, { skill: 'glass_spark', failBell: true, log });
    assert.equal(res.bellHits, 1, 'ficou uma vez na faixa e apanhou');
    assert.deepEqual(leaks, [], 'quem não fez o resgate não vê os três, as falas nem a faixa');
    assert.equal(followers(B).length + followers(C).length, 0);
    // a posição conferida é a das pessoas: as três estão no círculo do posto
    const gp = data.maps.estrada_velha.guardPost;
    for (const f of followers(A)) assert.ok(d2(f, gp) <= gp.safeRadius, `${f.n} dentro do círculo`);
    // entrega a Mara: 60 XP, 3 tônicos e o mapa
    A.char = (await A.request('char')).char;
    const xpBefore = A.char.xp, potBefore = bagQty(A.char, 'potion_hp_s');
    const done = await A.request('quest_turnin', { quest: 'tutorial', npc: 'mara' });
    assert.equal(done.ok, true, done.reason);
    assert.equal(done.char.xp - xpBefore, 60);
    assert.equal(bagQty(done.char, 'potion_hp_s') - potBefore, 3);
    const mapItem = done.char.items.find((i) => i.defId === 'map_estrada_velha');
    assert.ok(mapItem && mapItem.loc === 'bag', 'Mapa da Estrada Velha na bolsa');
    assert.match(done.dialogue, /mapa/);
    log(`entregue a Mara: +60 XP (nível ${done.char.level}), +3 tônicos (gastou ${potions0 - potBefore} no caminho) e o Mapa da Estrada Velha`);
    // o mapa é do personagem: não descarta, não vende, não vai para o depósito
    assert.equal((await A.request('discard', { instance: mapItem.id })).code, 'bound');
    await sleep(300);
    assert.equal(followers(A).length, 3, 'depois da entrega os três ficam no posto enquanto ele estiver no mapa');
    const toVau = A.waitFor((m) => m.t === 'zone' && m.mapId === 'vau_de_nacar', 5000, 'Vau de Nácar');
    const tp = await A.request('gm', { cmd: 'teleport', mapId: 'vau_de_nacar', x: 22, z: 47 });
    assert.equal(tp.ok, true, tp.reason);
    await toVau;
    assert.equal((await A.request('storage_put', { npc: 'storage_nacre', instance: mapItem.id })).code, 'bound');
    await A.request('gm', { cmd: 'teleport', x: 37, z: 47 });
    await sleep(200);
    assert.equal((await A.request('sell', { npc: 'potions_lume', instance: mapItem.id })).code, 'bound');
    log('o mapa não sai do personagem: descartar, vender e depositar são recusados');
    // de volta à Estrada: com a missão entregue, ninguém mais espera resgate
    const back = A.waitFor((m) => m.t === 'zone' && m.mapId === 'estrada_velha', 5000, 'Estrada Velha');
    await A.request('gm', { cmd: 'teleport', mapId: 'estrada_velha', x: 22, z: 50 });
    await back;
    await sleep(400);
    assert.equal(followers(A).length, 0);
    await Promise.all([A.close(), B.close(), C.close()]);
  });
});

test('Tutorial: Caio cai se ninguém chama a atenção dos bichos, Ligia passa um tônico e quem foi solto volta junto ao reconectar', { timeout: 240000 }, async () => {
  await withServer(async (server, url) => {
    let A = await newChar(url, 'forte', 'breaker', 'Machadinha');
    await goTo(A, 25, 48);
    assert.equal((await A.request('quest_accept', { quest: 'tutorial', npc: 'mara' })).ok, true);
    const q0 = await tutorialQuest(A);
    assert.match(q0.objectives[5].tip, /Corpo a corpo: fique entre os bichos e o Caio/);
    await waitUntil(() => followers(A).length === 3, 5000, 'os três');
    // vai direto a Caio e não bate em ninguém: os bichos batem no menino até ele cair
    const caio = follower(A, 'Caio');
    const down = A.waitFor((m) => m.t === 'say' && m.name === 'Caio' && /derrubaram/.test(m.text), 90000, 'Caio caindo');
    await goTo(A, caio.x - 5, caio.z + 2);
    const hits = [];
    A.ws.on('message', (buf) => { const m = JSON.parse(buf.toString()); if (m.t === 'hit' && m.dst === caio.id) hits.push(m.dmg); });
    await down;
    assert.ok(hits.length > 0, 'os bichos bateram em Caio');
    await goTo(A, 36, 50); // sai de perto: os bichos não voltam enquanto ninguém chega a 7 m dele
    await waitUntil(() => follower(A, 'Caio')?.st === 'trapped', 8000, 'Caio de pé, esperando de novo');
    assert.equal(follower(A, 'Caio').hp, follower(A, 'Caio').mhp);
    await waitUntil(() => !(A.snap?.ents ?? []).some((e) => e.k === 'm' && d2(e, caio) < 4 && e.st === 'chase'), 5000, 'os bichos sumirem');
    assert.equal((await tutorialQuest(A)).objectives[5].done, false);
    log(`Caio apanhou ${hits.length} vezes, caiu, os bichos sumiram e ele voltou a esperar com a vida cheia`);
    // sem tônico na bolsa, Ligia passa um; bebido perto dela, ela levanta
    A.char = (await A.request('char')).char;
    const pots = A.char.items.filter((i) => i.loc === 'bag' && i.defId === 'potion_hp_s');
    // parado a menos de 7 m dela: o tônico pode chegar logo depois do último descarte, no mesmo pacote da
    // resposta; a espera vem antes e só aceita um tônico que não é um dos descartados
    const discarded = new Set(pots.map((i) => i.id));
    const gift = A.waitFor((m) => m.t === 'char' && m.char.items.some((i) => i.defId === 'potion_hp_s' && !discarded.has(i.id)), 20000, 'tônico de Ligia');
    for (const p of pots) assert.equal((await A.request('discard', { instance: p.id })).ok, true);
    const ligia = follower(A, 'Ligia');
    await goTo(A, ligia.x + 2, ligia.z - 1);
    const given = await gift;
    assert.ok(A.events.some((m) => m.t === 'say' && m.name === 'Ligia' && /bolso/.test(m.text)));
    const pot = given.char.items.find((i) => i.defId === 'potion_hp_s' && !discarded.has(i.id));
    assert.equal(pot.qty, 1);
    assert.equal((await A.request('use_item', { instance: pot.id })).ok, true);
    await waitObjective(A, 3);
    log('sem tônico na bolsa, Ligia passou um; bebido perto dela, ela levantou');
    // Bento
    const bento = follower(A, 'Bento');
    await goTo(A, bento.x - 2.5, bento.z + 1);
    await waitObjective(A, 0);
    // reconecta: Bento e Ligia aparecem atrás dele; Caio continua cercado no lugar dele
    const at = A.me();
    await A.close();
    await sleep(300);
    A = await relog(url, 'forte');
    await waitUntil(() => followers(A).length === 3, 5000, 'os três depois de reconectar');
    for (const name of ['Bento', 'Ligia']) {
      const f = follower(A, name);
      assert.ok(['follow', 'wait'].includes(f.st), `${name} seguindo (${f.st})`);
      assert.ok(d2(f, at) < 8, `${name} perto do dono`);
    }
    const c2 = follower(A, 'Caio');
    assert.equal(c2.st, 'trapped');
    assert.ok(d2(c2, caio) < 1.5, 'Caio no lugar dele');
    const q1 = await tutorialQuest(A);
    assert.deepEqual(q1.objectives.map((o) => o.done), [true, false, false, true, false, false, false, false]);
    // sem os três soltos, o segundo toque não vem, e a chegada não conta sem Caio
    await goTo(A, 22, 50);
    await sleep(1500);
    assert.ok(!A.events.some((m) => m.t === 'warn' && m.kind === 'bell2'));
    assert.equal((await tutorialQuest(A)).objectives[7].done, false);
    log('ao reconectar, Bento e Ligia voltam atrás dele e Caio segue cercado; sem os três, nem segundo toque nem chegada');
    await A.close();
  });
});
