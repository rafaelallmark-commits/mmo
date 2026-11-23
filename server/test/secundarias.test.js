// Missões secundárias dos capítulos 1–5 e o que o motor de missões ganhou com elas: materiais de coleta que
// só caem com a missão ativa (e saem da bolsa na entrega), diárias que voltam no dia seguinte (UTC),
// recompensa pelo peso de armadura, título na entrega, a defesa do Joca (2.2), a entrega nas duas cidades
// (5.4), a esteira desgovernada da Oficina, o quadro de missões das cidades e as fontes dos itens.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { GameServer } from '../src/server.js';
import { loadGameData } from '../src/data.js';
import { createStore } from '../src/db.js';
import { Zone } from '../src/zone.js';
import { makeRng } from '../src/rng.js';
import { missionXpByBand, MISSION_XP_CAP, QuestEngine } from '../src/quests.js';
import { validate, loadBuilds, itemSources } from '../tools/validate-data.js';
import { SimClient, sleep } from './helpers/client.js';

const data = loadGameData();
const log = (...a) => console.log('   ·', ...a);
const DAY = 86_400_000;

async function withServer(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'cinzas-sq-'));
  const server = new GameServer({ port: 0, host: '127.0.0.1', dbPath: join(dir, 'sq.db'), timeScale: 4, seed: 515, dev: true, log: false, rateLimit: 1000, rateBurst: 1000 });
  const port = await server.start();
  try { await fn(server, `ws://127.0.0.1:${port}`); } finally { await server.stop().catch(() => {}); rmSync(dir, { recursive: true, force: true }); }
}

// personagem novo, no nível pedido e com as missões dadas como concluídas (comandos de mestre do --dev)
async function hero(server, url, label, classId, level = 1, done = []) {
  const c = new SimClient(label);
  await c.connect(url);
  await c.request('register', { account: `sq_${label}`, password: 'senha123' });
  await c.request('login', { account: `sq_${label}`, password: 'senha123' });
  const r = await c.request('create_char', { name: `S${label}`, classId });
  assert.equal(r.ok, true, r.reason);
  assert.equal((await c.request('enter', { charId: r.char.id })).ok, true);
  if (level > 1) assert.equal((await c.request('gm', { cmd: 'xp', level })).ok, true);
  if (done.length) assert.equal((await c.request('gm', { cmd: 'quest_done', quests: done })).ok, true);
  return c;
}

const P = (server, c) => server.playerOf(c.char.id);

// vai a (x, z) do mapa, trocando de mapa se preciso
async function go(server, c, mapId, x, z) {
  if (P(server, c).zone.mapId !== mapId) {
    const w = c.waitFor((m) => m.t === 'zone' && m.mapId === mapId, 5000, `entrar em ${mapId}`);
    const r = await c.request('gm', { cmd: 'teleport', mapId, x, z });
    assert.equal(r.ok, true, r.reason);
    await w;
  } else {
    const r = await c.request('gm', { cmd: 'teleport', x, z });
    assert.equal(r.ok, true, r.reason);
  }
}

// ao lado de um NPC (no mapa dele)
async function toNpc(server, c, npcId, mapId) {
  const n = data.maps[mapId].npcs.find((x) => x.id === npcId);
  await go(server, c, mapId, n.x + 1.5, n.z);
}

async function toObject(server, c, objId, mapId) {
  const o = data.maps[mapId].objects.find((x) => x.id === objId);
  await go(server, c, mapId, o.x + 1, o.z);
}

const quest = async (c, id) => {
  const j = (await c.request('quests')).journal;
  return j.active.find((q) => q.id === id) ?? j.done.find((q) => q.id === id) ?? j.available.find((q) => q.id === id) ?? null;
};
const bagQty = (server, c, defId) => [...P(server, c).char.items.values()].filter((i) => i.loc === 'bag' && i.defId === defId).reduce((s, i) => s + i.qty, 0);

// derruba na hora o monstro vivo mais próximo daquela espécie, com o crédito para o personagem (que fica do
// lado dele, dentro do alcance de coleta do saque)
async function killOne(server, c, defId) {
  const p = P(server, c);
  const z = p.zone;
  let live = [...z.monsters.values()].filter((m) => m.defId === defId && m.state !== 'dead');
  if (!live.length) {
    for (const m of z.monsters.values()) if (m.defId === defId && m.state === 'dead' && m.removeAt == null) z.placeMonster(m);
    live = [...z.monsters.values()].filter((m) => m.defId === defId && m.state !== 'dead');
  }
  assert.ok(live.length, `nenhum ${defId} vivo em ${z.mapId}`);
  const m = live.sort((a, b) => Math.hypot(a.x - p.char.x, a.z - p.char.z) - Math.hypot(b.x - p.char.x, b.z - p.char.z))[0];
  p.char.x = m.x + 1; p.char.z = m.z;
  z.damageMonster(m, p.char.id, m.hp + 5000);
  await c.request('ping'); // as mensagens de saque do abate chegam antes desta resposta
  return m;
}

async function pickAll(c, defId) {
  let n = 0;
  for (const l of [...c.loot.values()]) {
    if (l.defId !== defId || l.picked) continue;
    const r = await c.request('pickup', { loot: l.id });
    assert.equal(r.ok, true, r.reason);
    l.picked = true; n++;
  }
  return n;
}

// ---------------------------------------------------------------- dados
const TABLE = [
  ['Ninho Morno', 'potions_resina', 2], ['Ponte do Lagarto', 'ruy', 3], ['Pêlo de Cinza', ['smith_gusmao', 'smith_tiela'], 4],
  ['Pronto para a Pedreira', '@master', 5], ['Recibo do Capataz', 'teodoro', 4, 'daily'], ['Sapos de Vapor', 'potions_lume', 5],
  ['Fios de Enguia', 'joca', 6], ['Bico de Ferro', 'olga', 7], ['Bomba-Mestra', 'joca', 8, 'daily'], ['Fusíveis Velhos', 'pina', 9],
  ['Esteira Desgovernada', 'pina', 11], ['Supervisor de Turno', 'mara', 11, 'daily'], ['Ecos Repetidos', 'mara', 13],
  ['Seda Condutora', ['smith_tiela', 'smith_gusmao'], 15], ['A Mãe do Eco', 'ilda', 15, 'daily'], ['Escória Viva', 'joca', 17],
  ['Draga Perdida', 'ilda', 17], ['Badalos Soltos', 'joca', 21], ['Túneis Novos', 'mara', 23],
];

test('as secundárias da tabela do 02-campanha existem com o NPC, o nível e a repetição do documento', () => {
  const byTitle = new Map(Object.entries(data.quests).map(([id, q]) => [q.title, { id, ...q }]));
  for (const [title, npc, level, repeat] of TABLE) {
    const q = byTitle.get(title);
    assert.ok(q, `falta a secundária "${title}"`);
    assert.ok(q.id.startsWith('s_'), `${title} é secundária (s_*)`);
    assert.deepEqual([].concat(q.npc).sort(), [].concat(npc).sort(), `${title}: NPC`);
    assert.equal(q.level, level, `${title}: nível`);
    assert.equal(q.repeat ?? null, repeat ?? null, `${title}: repetição`);
  }
  // as que divergiam: seda com os ferreiros e fios de seda, Mãe do Eco diária, Escória com núcleos
  assert.equal(data.quests.s_silk.objectives[0].item, 'qi_conduit_silk');
  assert.equal(data.items.qi_conduit_silk.name, 'Seda Condutora');
  assert.equal(data.quests.s_slag.objectives[0].item, 'qi_slag_core');
  assert.equal(data.quests.s_slag.objectives[0].count, 15);
  // Brasa Cristalizada e Sucata de Condutor ganham uso em missões
  const uses = (item) => Object.values(data.quests).filter((q) => q.objectives.some((o) => o.type === 'collect' && o.item === item)).length;
  assert.ok(uses('mat_ember') >= 2 && uses('mat_scrap') >= 3, 'brasa e sucata pedidas em missões');
  log(`${TABLE.length} secundárias da tabela conferidas (o Selador é só a elite diária)`);
});

test('validador: dados válidos, todo item com fonte e XP de missões até 55% de cada faixa', () => {
  const { errors } = validate(data, loadBuilds());
  assert.deepEqual(errors, []);
  const sources = itemSources(data);
  for (const id of Object.keys(data.items)) assert.ok(sources.has(id), `${id} sem fonte`);
  for (const id of ['axe_1h_t20', 'hammer_1h_t20', 'sword_2h_t20', 'wand_t20', 'scepter_t17', 'axe_1h_t5_u', 'heavy_armor_t20', 'focus_t20', 'quiver_t20', 'light_shield_t20']) {
    assert.ok([...sources.get(id)].some((s) => s.startsWith('saque:')), `${id} cai de alguma tabela`);
  }
  // sem a peça de armadura do Custódio, o validador acusa os 16 itens de novo
  const broken = { ...data, lootTables: { ...data.lootTables, lt_lock_custodian: { entries: data.lootTables.lt_lock_custodian.entries.filter((e) => e.type !== 'classPool') } } };
  const errs = validate(broken, loadBuilds()).errors.filter((e) => e.includes('sem fonte'));
  assert.equal(errs.length, 16, errs.join('\n'));
  // conta do XP por faixa
  for (const b of missionXpByBand(data)) {
    assert.ok(Math.abs(b.mainPct - 0.3) < 0.03, `principais da faixa ${b.from}–${b.to}: ${b.mainPct}`);
    assert.ok(b.totalPct <= MISSION_XP_CAP + 1e-9, `faixa ${b.from}–${b.to}: ${b.totalPct}`);
    log(`níveis ${b.from}–${b.to}: principais ${Math.round(b.mainPct * 1000) / 10}% + secundárias ${Math.round(b.sidePct * 1000) / 10}% = ${Math.round(b.totalPct * 1000) / 10}%`);
  }
  // uma secundária a mais na faixa 1 passaria do teto
  const heavy = { ...data, quests: { ...data.quests, s_extra: { ...data.quests.s_warm_nest, rewards: { xp: 500, gold: 0, items: [] } } } };
  assert.ok(validate(heavy, loadBuilds()).errors.some((e) => /faixa 1–5: missões somam/.test(e)));
});

test('Custódio: arma única da família equipada, cada peça única de armadura da classe uma vez por personagem (uma por vitória); cetro e machado incomum com fonte', () => {
  const store = createStore(':memory:');
  const acc = store.createAccount('cus', 'senha');
  const zone = new Zone({ mapId: 'ultima_eclusa', data, store, rng: makeRng(5), send: () => {}, broadcast: () => {} });
  const mk = (name, classId) => {
    const id = store.createCharacter({ accountId: acc, name, classId, hp: 99, mp: 99, mapId: 'ultima_eclusa', x: 24, z: 24, kit: data.classes[classId].startingKit, slotFor: (d) => data.items[d].slot });
    const c = store.loadCharacter(id); c.quests = new Map(); c.level = 20;
    return c;
  };
  const wield = (c, defId) => {
    for (const it of c.items.values()) if (it.loc === 'equip' && it.slot === 'weapon') { it.loc = 'bag'; it.slot = null; }
    for (const it of c.items.values()) if (it.loc === 'bag' && it.defId === defId) { it.loc = 'equip'; it.slot = 'weapon'; return; }
    throw new Error(`${defId} não está na bolsa`);
  };
  const boss = { def: data.monsters.lock_custodian, defId: 'lock_custodian' };
  const ids = (loot) => loot.map((d) => d.defId).filter(Boolean);
  // Quebraferro de uma mão (o kit) → Machado do Meridiano Partido; de duas mãos → Grande Machado
  const one = mk('Uma', 'breaker');
  let got = ids(zone.rollLoot(boss, one));
  assert.ok(got.includes('axe_1h_t20'), got.join(','));
  assert.ok(got.some((d) => ['heavy_armor_t20', 'heavy_helm_t20', 'heavy_gloves_t20', 'heavy_boots_t20'].includes(d)), 'peça pesada única');
  assert.ok(got.some((d) => ['ring_t20', 'amulet_t20'].includes(d)), 'joia única');
  // vitórias seguintes: sem arma nem joia (uma vez por personagem); a cada uma, uma peça de armadura que ele
  // ainda não ganhou, até fechar o conjunto (4 peças pesadas); depois, nenhuma — só ouro e materiais (D160)
  const heavy = new Set(got.filter((d) => data.items[d].kind === 'armor'));
  for (let win = 2; win <= 4; win++) {
    got = ids(zone.rollLoot(boss, one));
    assert.ok(!got.some((d) => /_t20$/.test(d) && data.items[d].kind !== 'armor'), `sem arma e joia de novo: ${got}`);
    const pieces = got.filter((d) => data.items[d].kind === 'armor');
    assert.equal(pieces.length, 1, `vitória ${win}: uma peça de armadura`);
    assert.ok(!heavy.has(pieces[0]), `vitória ${win}: ${pieces[0]} repetida`);
    heavy.add(pieces[0]);
  }
  assert.deepEqual([...heavy].sort(), ['heavy_armor_t20', 'heavy_boots_t20', 'heavy_gloves_t20', 'heavy_helm_t20']);
  for (let win = 5; win <= 8; win++) {
    got = ids(zone.rollLoot(boss, one));
    assert.ok(!got.some((d) => data.items[d].rarity === 'unique'), `vitória ${win}, conjunto completo: nenhuma única (${got})`);
    assert.ok(got.includes('mat_refine_sup'), 'ouro e materiais continuam');
  }
  const two = mk('Duas', 'breaker');
  wield(two, 'axe_2h_t1');
  assert.ok(ids(zone.rollLoot(boss, two)).includes('axe_2h_t20'));
  // Cantora de cetro → Cetro da Resposta; armadura de veste ou foco
  const sing = mk('Canta', 'veilsinger');
  got = ids(zone.rollLoot(boss, sing));
  assert.ok(got.includes('scepter_t20'), got.join(','));
  assert.ok(got.some((d) => ['robe_t20', 'robe_circlet_t20', 'robe_gloves_t20', 'robe_sandals_t20', 'focus_t20'].includes(d)));
  // Tecelão de varinha → Varinha da Faísca Primeira
  const weave = mk('Tece', 'emberweaver');
  assert.ok(ids(zone.rollLoot(boss, weave)).includes('wand_t20'));
  // Bastião de martelo (kit) → Martelo da Comporta Selada; o conjunto dele tem 5 peças (com o escudo único)
  const bas = mk('Bast', 'bastion');
  const basLoot = [];
  for (let win = 1; win <= 7; win++) basLoot.push(...ids(zone.rollLoot(boss, bas)));
  assert.equal(basLoot.filter((d) => d === 'hammer_1h_t20').length, 1, 'arma única uma vez');
  const basSet = basLoot.filter((d) => ['armor', 'offhand'].includes(data.items[d].kind) && data.items[d].rarity === 'unique');
  assert.deepEqual(basSet.sort(), ['heavy_armor_t20', 'heavy_boots_t20', 'heavy_gloves_t20', 'heavy_helm_t20', 'shield_t20'], 'cada peça uma vez, em 5 vitórias');
  // Capataz: o machado incomum só para o Quebraferro; Fragmento: o Cetro do Sino Mudo só para a Cantora
  const foreman = { def: data.monsters.cracked_foreman, defId: 'cracked_foreman' };
  const shard = { def: data.monsters.custodian_shard, defId: 'custodian_shard' };
  let axe = 0, axeOther = 0, scep = 0, scepOther = 0;
  for (let i = 0; i < 400; i++) {
    if (ids(zone.rollLoot(foreman, one)).includes('axe_1h_t5_u')) axe++;
    if (ids(zone.rollLoot(foreman, sing)).includes('axe_1h_t5_u')) axeOther++;
    if (ids(zone.rollLoot(shard, sing)).includes('scepter_t17')) scep++;
    if (ids(zone.rollLoot(shard, one)).includes('scepter_t17')) scepOther++;
  }
  assert.ok(axe > 20 && axeOther === 0, `machado incomum: ${axe}/${axeOther}`);
  assert.ok(scep > 15 && scepOther === 0, `cetro: ${scep}/${scepOther}`);
  log(`Capataz → Machado de Pedreira Lascado em ${axe}/400 (só Quebraferro); Fragmento → Cetro do Sino Mudo em ${scep}/400 (só Cantora)`);
});

// ---------------------------------------------------------------- coleta e diária pelo protocolo
test('Ninho Morno: carapaça só cai com a missão ativa, sai toda da bolsa na entrega e não se vende, descarta nem guarda', async () => {
  await withServer(async (server, url) => {
    const c = await hero(server, url, 'nest', 'breaker', 2, ['tutorial', 'c1_count']);
    // sem a missão: nenhum besouro deixa carapaça
    await go(server, c, 'estrada_velha', 50, 32);
    for (let i = 0; i < 6; i++) await killOne(server, c, 'ember_beetle');
    assert.equal([...c.loot.values()].filter((l) => l.defId === 'qi_warm_shell').length, 0, 'sem missão, sem carapaça');
    // aceita com Dona Resina em Pedrâmbar
    await toNpc(server, c, 'potions_resina', 'pedrambar');
    const talk = await c.request('talk', { npc: 'potions_resina' });
    const offer = talk.quests.offer.find((q) => q.id === 's_warm_nest');
    assert.ok(offer, 'Dona Resina oferece Ninho Morno');
    assert.deepEqual(offer.rewards.items, [['potion_hp_s', 5]]);
    assert.equal((await c.request('quest_accept', { quest: 's_warm_nest', npc: 'potions_resina' })).ok, true);
    // caça na Encosta Morna
    await go(server, c, 'estrada_velha', 50, 32);
    let kills = 0;
    const updates = () => c.events.filter((m) => m.t === 'quest_update' && m.quests.some((q) => q.id === 's_warm_nest')).length;
    const u0 = updates();
    while (bagQty(server, c, 'qi_warm_shell') < 10 && kills < 60) {
      await killOne(server, c, 'ember_beetle'); kills++;
      await pickAll(c, 'qi_warm_shell');
    }
    assert.equal(bagQty(server, c, 'qi_warm_shell'), 10, `${kills} abates`);
    assert.ok(updates() > u0, 'o diário acompanha a coleta');
    const st = await quest(c, 's_warm_nest');
    assert.equal(st.ready, true);
    // depois de completar, para de cair
    for (let i = 0; i < 8; i++) await killOne(server, c, 'ember_beetle');
    const extras = [...c.loot.values()].filter((l) => l.defId === 'qi_warm_shell' && !l.picked);
    assert.equal(extras.length, 0, 'com a bolsa completa, não cai mais');
    // item de missão não sai da bolsa por venda, descarte ou depósito
    const shell = [...P(server, c).char.items.values()].find((i) => i.defId === 'qi_warm_shell');
    await toNpc(server, c, 'potions_resina', 'pedrambar');
    assert.equal((await c.request('sell', { npc: 'potions_resina', instance: shell.id })).code, 'bound');
    assert.equal((await c.request('discard', { instance: shell.id })).code, 'bound');
    await toNpc(server, c, 'storage_ambar', 'pedrambar');
    assert.equal((await c.request('storage_put', { npc: 'storage_ambar', instance: shell.id })).code, 'bound');
    // uma carapaça perdida no chão (de antes da entrega): depois da entrega ela não entra na bolsa
    const p = P(server, c);
    await toNpc(server, c, 'potions_resina', 'pedrambar');
    const lost = { id: randomUUID(), charId: p.char.id, defId: 'qi_warm_shell', qty: 1, gold: 0, mapId: 'pedrambar', x: p.char.x, z: p.char.z, monsterDef: 'ember_beetle', killId: randomUUID(), createdAt: Date.now(), expiresAt: Date.now() + 60000 };
    server.store.insertLoot(lost);
    // entrega: as 10 carapaças saem, 5 tônicos entram
    const pots0 = bagQty(server, c, 'potion_hp_s');
    const xp0 = p.char.xp;
    const t = await c.request('quest_turnin', { quest: 's_warm_nest', npc: 'potions_resina' });
    assert.equal(t.ok, true, t.reason);
    assert.equal(bagQty(server, c, 'qi_warm_shell'), 0, 'carapaças saem todas');
    assert.equal(bagQty(server, c, 'potion_hp_s') - pots0, 5);
    assert.equal(p.char.xp - xp0, data.quests.s_warm_nest.rewards.xp);
    const pk = await c.request('pickup', { loot: lost.id });
    assert.equal(pk.ok, true);
    assert.equal(pk.discarded, true, 'a carapaça perdida some do chão');
    assert.equal(bagQty(server, c, 'qi_warm_shell'), 0);
    log(`Ninho Morno: 10 carapaças em ${kills} abates, entregue (+${data.quests.s_warm_nest.rewards.xp} XP, 5 tônicos); carapaça perdida descartada na coleta`);
    await c.close();
  });
});

test('diária: o tempo até a volta (00:00 UTC) sai em horas e minutos inteiros', () => {
  const qe = new QuestEngine({ data, store: { saveQuest() {} } });
  const midnight = Math.floor(Date.now() / DAY) * DAY + DAY;
  const wait = (s) => { qe.now = () => midnight - s * 1000; return qe.waitText(); };
  assert.equal(wait(7199), 'em 2 h 0 min', 'nunca "em 1 h 60 min"');
  assert.equal(wait(3601), 'em 1 h 1 min');
  assert.equal(wait(3600), 'em 1 h 0 min');
  assert.equal(wait(59), 'em 1 min');
  assert.equal(wait(DAY / 1000 - 1), 'em 24 h 0 min');
});

test('entrega com a bolsa cheia: brasa e sucata que sobram na pilha não abrem espaço para a recompensa', () => {
  const store = { saveQuest() {}, tx(fn) { fn(); }, deleteItem() {}, insertItem() {}, saveItems() {}, saveCharacter() {} };
  const qe = new QuestEngine({ data, store });
  let seq = 0;
  const add = (c, defId, qty) => { const it = { id: `i${seq++}`, defId, qty, enh: 0, loc: 'bag', slot: null }; c.items.set(it.id, it); return it; };
  const mk = (ember, scrap, fill) => {
    const c = { id: 1, classId: 'breaker', level: 12, gold: 0, skills: {}, unspent: 0, quests: new Map([['s_forge_ember', { state: 'active', progress: {} }]]), items: new Map() };
    add(c, 'mat_ember', ember); add(c, 'mat_scrap', scrap);
    const filler = [];
    for (let i = 0; i < fill; i++) filler.push(add(c, 'axe_1h_t1', 1));
    return { c, filler };
  };
  const bag = (c) => [...c.items.values()].filter((i) => i.loc === 'bag').length;
  // 20 brasas + 20 sucatas + 28 peças = 30/30: a entrega consome 6 e 10, mas as duas pilhas ficam, e o Pó de
  // Refino abriria a 31ª pilha (antes contava um espaço livre por coleta e deixava a bolsa em 31/30)
  const { c, filler } = mk(20, 20, 28);
  const r = qe.turnIn(c, 's_forge_ember', 'smith_gusmao', () => false);
  assert.equal(r.ok, false);
  assert.equal(r.code, 'bag_full');
  assert.equal(bag(c), 30);
  assert.equal(c.quests.get('s_forge_ember').state, 'active', 'nada foi consumido');
  // um espaço livre resolve
  c.items.delete(filler[0].id);
  assert.equal(qe.turnIn(c, 's_forge_ember', 'smith_gusmao', () => false).ok, true);
  assert.equal(bag(c), 30);
  // brasa e sucata na conta certa somem da bolsa e abrem os espaços: cabe com a bolsa cheia
  const exact = mk(6, 10, 28).c;
  assert.equal(qe.turnIn(exact, 's_forge_ember', 'smith_gusmao', () => false).ok, true);
  assert.equal(bag(exact), 29);
});

test('diária: Recibo do Capataz volta no dia seguinte (UTC) e o diário e o quadro dizem quando', async () => {
  await withServer(async (server, url) => {
    const c = await hero(server, url, 'recibo', 'pikeman', 5, ['tutorial', 'c1_count', 'c1_rats', 'c1_master', 'c1_route', 'c1_foreman']);
    const daily = async () => {
      await toNpc(server, c, 'teodoro', 'estrada_velha');
      const talk = await c.request('talk', { npc: 'teodoro' });
      return talk.quests.offer.find((q) => q.id === 's_foreman_receipt');
    };
    const runOnce = async () => {
      const r = await c.request('quest_accept', { quest: 's_foreman_receipt', npc: 'teodoro' });
      assert.equal(r.ok, true, r.reason);
      await go(server, c, 'estrada_velha', 46, 72);
      await killOne(server, c, 'cracked_foreman');
      await toNpc(server, c, 'teodoro', 'estrada_velha');
      const gold0 = P(server, c).char.gold, xp0 = P(server, c).char.xp;
      const t = await c.request('quest_turnin', { quest: 's_foreman_receipt', npc: 'teodoro' });
      assert.equal(t.ok, true, t.reason);
      assert.equal(t.repeat, 'daily');
      assert.ok(t.backInS > 0 && t.backInS <= 86400);
      assert.equal(P(server, c).char.gold - gold0, 30);
      assert.equal(P(server, c).char.xp - xp0, data.quests.s_foreman_receipt.rewards.xp, 'XP da diária');
      return t;
    };
    const offer = await daily();
    assert.ok(offer, 'Teodoro oferece o Recibo do Capataz');
    assert.equal(offer.repeat, 'daily');
    await runOnce();
    // mesmo dia: não volta, e o diário diz quando
    assert.equal(await daily(), undefined, 'mesmo dia: não é oferecida');
    const again = await c.request('quest_accept', { quest: 's_foreman_receipt', npc: 'teodoro' });
    assert.equal(again.ok, false);
    assert.equal(again.code, 'daily_done');
    assert.match(again.reason, /00:00 UTC/);
    const done = (await c.request('quests')).journal.done.find((q) => q.id === 's_foreman_receipt');
    assert.equal(done.repeat, 'daily');
    assert.ok(done.backInS > 0, 'o diário diz quando volta');
    // o quadro de Pedrâmbar lista a diária que volta amanhã
    await toObject(server, c, 'board_ambar', 'pedrambar');
    const board = await c.request('interact', { object: 'board_ambar' });
    assert.equal(board.ok, true, board.reason);
    assert.ok(board.board.dailyDone.some((q) => q.id === 's_foreman_receipt' && q.backInS > 0));
    assert.ok(!board.board.available.some((q) => q.id === 's_foreman_receipt'));
    // dia seguinte (UTC): volta e paga de novo
    server.quests.now = () => Date.now() + DAY;
    try {
      const back = await daily();
      assert.ok(back, 'no dia seguinte, Teodoro oferece de novo');
      assert.equal(back.state, 'available', 'com o progresso zerado');
      assert.equal(back.objectives[0].cur, 0);
      for (const m of P(server, c).zone.monsters.values()) if (m.defId === 'cracked_foreman') m.respawnAt = 0;
      await sleep(150);
      await runOnce();
      assert.equal(await daily(), undefined, 'e fecha de novo até o outro dia');
    } finally { server.quests.now = () => Date.now(); }
    log('Recibo do Capataz: entregue, recusado no mesmo dia ("volta à 00:00 UTC"), listado no quadro e repetido no dia seguinte');
    await c.close();
  });
});

// ---------------------------------------------------------------- recompensas por armadura e títulos
test('1.4 dá as botas e 3.4 o elmo da armadura da classe; 3.3 dá o título conforme a classe; o jogador escolhe o título mostrado', async () => {
  await withServer(async (server, url) => {
    const pre14 = ['tutorial', 'c1_count', 'c1_rats', 'c1_master'];
    const boots = { breaker: 'heavy_boots_t1', warden: 'light_boots_t1', emberweaver: 'robe_sandals_t1' };
    for (const [cls, item] of Object.entries(boots)) {
      const c = await hero(server, url, `rota${cls.slice(0, 4)}`, cls, 3, pre14);
      await toNpc(server, c, 'mara', 'estrada_velha');
      const offer = (await c.request('talk', { npc: 'mara' })).quests.offer.find((q) => q.id === 'c1_route');
      assert.deepEqual(offer.rewards.items, [[item, 1]], `${cls}: a oferta mostra a peça da própria armadura`);
      assert.equal((await c.request('quest_accept', { quest: 'c1_route', npc: 'mara' })).ok, true);
      assert.equal((await c.request('gm', { cmd: 'quest_progress', quest: 'c1_route', index: 0, value: 6 })).ok, true);
      for (const mk of ['marker_1', 'marker_2', 'marker_3']) {
        await toObject(server, c, mk, 'estrada_velha');
        assert.equal((await c.request('interact', { object: mk })).ok, true);
      }
      await toNpc(server, c, 'mara', 'estrada_velha');
      const t = await c.request('quest_turnin', { quest: 'c1_route', npc: 'mara' });
      assert.equal(t.ok, true, t.reason);
      assert.equal(bagQty(server, c, item), 1, `${cls} recebeu ${item}`);
      for (const other of Object.values(boots).filter((x) => x !== item)) assert.equal(bagQty(server, c, other), 0);
      await c.close();
    }
    // 3.4: o elmo da faixa 9 do Tecelão é o Diadema de Tecido de Bomba
    const mainUpTo = (ch, but) => Object.entries(data.quests).filter(([id, q]) => q.chapter <= ch && !id.startsWith('s_') && !but.includes(id)).map(([id]) => id);
    const w = await hero(server, url, 'cofre', 'emberweaver', 10, mainUpTo(3, ['c3_order']));
    await toNpc(server, w, 'mara', 'oficina_soterrada');
    assert.equal((await w.request('quest_accept', { quest: 'c3_order', npc: 'mara' })).ok, true);
    await toObject(server, w, 'order_vault', 'oficina_soterrada');
    assert.equal((await w.request('interact', { object: 'order_vault' })).ok, true);
    await toNpc(server, w, 'mara', 'oficina_soterrada');
    const t34 = await w.request('quest_turnin', { quest: 'c3_order', npc: 'mara' });
    assert.equal(t34.ok, true, t34.reason);
    assert.equal(bagQty(server, w, 'robe_circlet_t9'), 1, 'diadema da faixa 9');
    await w.close();
    // 3.3: "Provado" para o Quebraferro, "Provada" para a Cantora
    const titled = {};
    for (const [cls, city, want] of [['breaker', 'pedrambar', 'Provado'], ['veilsinger', 'vau_de_nacar', 'Provada']]) {
      const c = await hero(server, url, `prova${cls.slice(0, 4)}`, cls, 10, mainUpTo(3, ['c3_trial', 'c3_order']));
      const master = `master_${cls}`;
      await toNpc(server, c, master, city);
      const offer = (await c.request('talk', { npc: master })).quests.offer.find((q) => q.id === 'c3_trial');
      assert.equal(offer.rewards.title, want, 'a oferta mostra o título');
      assert.equal((await c.request('quest_accept', { quest: 'c3_trial', npc: master })).ok, true);
      // a prova em si é coberta pelo m2.test.js; aqui só a vitória
      const p = P(server, c);
      p.char.trialDone = true;
      server.quests.onTrial(p.char);
      const t = await c.request('quest_turnin', { quest: 'c3_trial', npc: master });
      assert.equal(t.ok, true, t.reason);
      assert.equal(t.title, want);
      assert.equal(t.char.title, want);
      assert.deepEqual(t.char.titles, [want]);
      titled[cls] = c;
    }
    // escolher o título: só os ganhos; nenhum também vale
    const c = titled.breaker;
    assert.equal((await c.request('set_title', { title: 'Guarda do Inverno' })).code, 'bad_title');
    let r = await c.request('set_title', { title: null });
    assert.equal(r.ok, true);
    assert.equal(r.char.title, null);
    r = await c.request('set_title', { title: 'Provado' });
    assert.equal(r.char.title, 'Provado');
    await sleep(250);
    assert.equal(c.snap.ents.find((e) => e.id === c.char.eid)?.ttl, 'Provado', 'o título aparece acima do nome');
    log('botas por armadura (Grevas/Botas/Sandálias), Diadema da faixa 9, "Provado"/"Provada" e escolha do título');
    for (const x of Object.values(titled)) await x.close();
  });
});

test('5.4 Estamos Ouvindo: o registro vai às duas cidades e dá o título "Quem Ouviu o Segundo Toque"', async () => {
  await withServer(async (server, url) => {
    const pre = Object.entries(data.quests).filter(([id, q]) => q.chapter <= 5 && !id.startsWith('s_') && id !== 'c5_listen').map(([id]) => id);
    const c = await hero(server, url, 'ouvindo', 'dawnshield', 18, pre);
    await toNpc(server, c, 'ilda', 'canais_eclusa');
    assert.equal((await c.request('quest_accept', { quest: 'c5_listen', npc: 'ilda' })).ok, true);
    await toNpc(server, c, 'teodoro', 'estrada_velha');
    await c.request('talk', { npc: 'teodoro' });
    // a própria cidade primeiro: ainda falta a outra
    await toNpc(server, c, 'master_dawnshield', 'vau_de_nacar');
    const t1 = await c.request('talk', { npc: 'master_dawnshield' });
    const here = t1.quests.active.find((q) => q.id === 'c5_listen');
    assert.equal(here.ready, false);
    assert.deepEqual(here.objectives.map((o) => o.done), [true, false, true], 'Teodoro e o Vau de Nácar feitos; falta Pedrâmbar');
    const early = await c.request('quest_turnin', { quest: 'c5_listen', npc: 'master_dawnshield' });
    assert.equal(early.ok, false);
    assert.match(early.reason, /Pedrâmbar/);
    // qualquer mestre de Pedrâmbar serve, e a entrega é com ele mesmo
    await toNpc(server, c, 'master_warden', 'pedrambar');
    const t2 = await c.request('talk', { npc: 'master_warden' });
    const ready = t2.quests.active.find((q) => q.id === 'c5_listen');
    assert.equal(ready.ready, true);
    assert.equal(ready.turnIn, 'master_warden', 'o botão de entrega aparece no mestre aberto');
    const xp0 = P(server, c).char.xp;
    const t = await c.request('quest_turnin', { quest: 'c5_listen', npc: 'master_warden' });
    assert.equal(t.ok, true, t.reason);
    assert.equal(t.title, 'Quem Ouviu o Segundo Toque');
    assert.equal(P(server, c).char.xp - xp0, data.quests.c5_listen.rewards.xp);
    log('5.4: Teodoro → mestre do Vau de Nácar → mestre de Pedrâmbar; entregue com o título');
    await c.close();
  });
});

// ---------------------------------------------------------------- defesa do Joca
test('2.2 O Teste de Pressão: Joca cai e recomeça em 30 s; vencido o cronômetro, o grupo todo conclui', async () => {
  await withServer(async (server, url) => {
    const pre = ['tutorial', 'c1_count', 'c1_rats', 'c1_master', 'c1_route', 'c1_foreman', 'c2_water'];
    const a = await hero(server, url, 'jocaa', 'breaker', 7, pre);
    const b = await hero(server, url, 'jocab', 'veilsinger', 7, pre);
    await a.request('party_invite', { name: b.char.name });
    assert.equal((await b.request('party_accept', { from: a.char.id })).ok, true);
    for (const c of [a, b]) {
      await toNpc(server, c, 'joca', 'brejo_bombas');
      assert.equal((await c.request('quest_accept', { quest: 'c2_pressure', npc: 'joca' })).ok, true);
    }
    // sem a missão a válvula não abre
    const outsider = await hero(server, url, 'jocac', 'warden', 7, pre);
    await toObject(server, outsider, 'main_valve', 'brejo_bombas');
    assert.equal((await outsider.request('interact', { object: 'main_valve' })).code, 'nothing');
    await outsider.close();
    // começa a defesa
    await toObject(server, a, 'main_valve', 'brejo_bombas');
    await toObject(server, b, 'main_valve', 'brejo_bombas');
    const st = await a.request('interact', { object: 'main_valve' });
    assert.equal(st.ok, true, st.reason);
    assert.equal(st.defense, true);
    assert.equal((await b.request('interact', { object: 'main_valve' })).already, true, 'uma defesa por grupo');
    const zone = P(server, a).zone;
    const def = zone.escorts.get(st.escort);
    assert.ok(def?.isDefense, 'defesa na zona');
    await a.waitFor((m) => m.t === 'snap' && m.ents.some((e) => e.id === def.eid && e.k === 'e' && e.npc === 'joca' && e.def === 'npc'), 3000, 'Joca no snapshot');
    const wave = () => [...zone.monsters.values()].filter((m) => m.escortTarget === def.eid && m.state !== 'dead');
    assert.equal(wave().length, 2, 'primeira onda: duas Válvulas Errantes');
    assert.ok(wave().every((m) => m.defId === 'errant_valve'));
    // Joca quase sem vida: a onda o derruba
    def.hp = 5;
    const down = await a.waitFor((m) => m.t === 'escort' && m.down, 10000, 'Joca caindo');
    assert.match(down.text, /30 s/);
    assert.equal(def.state, 'broken');
    await sleep(100);
    assert.equal(wave().length, 0, 'a onda some quando ele cai');
    assert.equal((await quest(a, 'c2_pressure')).objectives[0].done, false);
    // antes dos 30 s, nada; depois, recomeça com a vida cheia e a primeira onda de novo
    await sleep(300);
    assert.equal(def.state, 'broken');
    const again = a.waitFor((m) => m.t === 'escort' && m.started, 5000, 'recomeço');
    def.brokenUntil = zone.now;
    await again;
    assert.equal(def.hp, def.mhp);
    assert.equal(wave().length, 2);
    // segura até o fim do cronômetro
    for (const m of wave()) zone.damageMonster(m, P(server, a).char.id, m.hp + 999);
    def.wave = def.def.waves.length;
    def.startedAt = zone.now - def.def.durationMs + 400;
    const qa = a.waitFor((m) => m.t === 'quest_update' && m.quests.some((q) => q.id === 'c2_pressure' && q.ready), 8000, 'A conclui');
    const qb = b.waitFor((m) => m.t === 'quest_update' && m.quests.some((q) => q.id === 'c2_pressure' && q.ready), 8000, 'B conclui');
    const won = await a.waitFor((m) => m.t === 'escort' && m.won, 8000, 'vitória');
    assert.match(won.text, /abriu a válvula/);
    await Promise.all([qa, qb]);
    await toNpc(server, a, 'joca', 'brejo_bombas');
    const t = await a.request('quest_turnin', { quest: 'c2_pressure', npc: 'joca' });
    assert.equal(t.ok, true, t.reason);
    assert.equal(bagQty(server, a, 'ring_t5'), 1, 'Anel de Bronze');
    log('Joca caiu (recomeço em 30 s com a primeira onda de novo); depois do cronômetro, os dois do grupo concluíram');
    await a.close(); await b.close();
  });
});

test('2.2 aceita antes da defesa (abates antigos gravados no objetivo): a válvula abre e a missão conclui', async () => {
  await withServer(async (server, url) => {
    const pre = ['tutorial', 'c1_count', 'c1_rats', 'c1_master', 'c1_route', 'c1_foreman', 'c2_water'];
    const c = await hero(server, url, 'jocaold', 'pikeman', 7, pre);
    await toNpc(server, c, 'joca', 'brejo_bombas');
    assert.equal((await c.request('quest_accept', { quest: 'c2_pressure', npc: 'joca' })).ok, true);
    // banco de antes da defesa: o objetivo 0 era "Detenha as Válvulas Errantes" e guardava a contagem
    assert.equal((await c.request('gm', { cmd: 'quest_progress', quest: 'c2_pressure', index: 0, value: 6 })).ok, true);
    assert.equal((await quest(c, 'c2_pressure')).objectives[0].done, false, 'a contagem antiga não conclui a defesa');
    await toObject(server, c, 'main_valve', 'brejo_bombas');
    const st = await c.request('interact', { object: 'main_valve' });
    assert.equal(st.ok, true, `a válvula precisa abrir para quem tinha abates gravados: ${st.reason}`);
    assert.equal(st.defense, true);
    const zone = P(server, c).zone;
    const def = zone.escorts.get(st.escort);
    for (const m of [...zone.monsters.values()]) if (m.escortTarget === def.eid) zone.damageMonster(m, P(server, c).char.id, m.hp + 999);
    def.wave = def.def.waves.length;
    def.startedAt = zone.now - def.def.durationMs + 300;
    await c.waitFor((m) => m.t === 'quest_update' && m.quests.some((q) => q.id === 'c2_pressure' && q.ready), 8000, 'defesa vencida');
    await toNpc(server, c, 'joca', 'brejo_bombas');
    const t = await c.request('quest_turnin', { quest: 'c2_pressure', npc: 'joca' });
    assert.equal(t.ok, true, t.reason);
    log('2.2 com 6 abates antigos no objetivo: válvula aberta, defesa vencida e missão entregue');
    await c.close();
  });
});

// ---------------------------------------------------------------- quadro de missões
test('quadro de missões: Pedrâmbar e Vau de Nácar mostram o que dá para aceitar no mundo, com nível, NPC e mapa', async () => {
  await withServer(async (server, url) => {
    const c = await hero(server, url, 'quadro', 'windwalker', 4, ['tutorial', 'c1_count']);
    await go(server, c, 'pedrambar', 30, 30);
    assert.equal((await c.request('interact', { object: 'board_ambar' })).code, 'too_far');
    await toObject(server, c, 'board_ambar', 'pedrambar');
    const r = await c.request('interact', { object: 'board_ambar' });
    assert.equal(r.ok, true, r.reason);
    const rows = new Map(r.board.available.map((q) => [q.id, q]));
    const nest = rows.get('s_warm_nest');
    assert.deepEqual([nest.level, nest.npcName, nest.maps, nest.area], [2, 'Dona Resina', ['Pedrâmbar'], 'A Estrada Velha']);
    assert.deepEqual(rows.get('s_lizard_bridge').maps, ['A Estrada Velha']);
    assert.deepEqual(rows.get('s_ash_hide').maps, ['Pedrâmbar', 'Vau de Nácar']);
    assert.equal(rows.get('s_ash_hide').npcName, 'Gusmão ou Tiela (ferreiros)');
    assert.ok(rows.has('c1_rats'), 'principais também');
    assert.ok(!rows.has('s_steam_toads'), 'nível 5: ainda não');
    assert.ok(!rows.has('tutorial'), 'concluídas não');
    const levels = r.board.available.map((q) => q.level);
    assert.deepEqual(levels, [...levels].sort((x, y) => x - y), 'em ordem de nível');
    // o do Vau de Nácar também
    await toObject(server, c, 'board_nacre', 'vau_de_nacar');
    const r2 = await c.request('interact', { object: 'board_nacre' });
    assert.equal(r2.ok, true);
    assert.equal(r2.board.available.length, r.board.available.length);
    // Joca aparece no mapa da faixa da missão
    const j = await hero(server, url, 'quadroj', 'breaker', 6, ['tutorial', 'c1_count', 'c1_rats', 'c1_master', 'c1_route', 'c1_foreman', 'c2_water']);
    await toObject(server, j, 'board_ambar', 'pedrambar');
    const rj = new Map((await j.request('interact', { object: 'board_ambar' })).board.available.map((q) => [q.id, q]));
    assert.deepEqual(rj.get('s_eel_wires').maps, ['Brejo das Bombas']);
    assert.deepEqual(rj.get('c2_pressure').maps, ['Brejo das Bombas']);
    log(`quadro: ${r.board.available.length} missões para o nível 4 (${r.board.available.map((q) => q.title).join(', ')})`);
    await c.close(); await j.close();
  });
});

// ---------------------------------------------------------------- esteira da Oficina
test('Esteira Desgovernada: a esteira só liga com a missão; atingido por ela, a contagem volta a zero', async () => {
  await withServer(async (server, url) => {
    const pre = Object.entries(data.quests).filter(([id, q]) => q.chapter <= 2 && !id.startsWith('s_')).map(([id]) => id).concat(['c3_fuses']);
    const c = await hero(server, url, 'esteira', 'warden', 11, pre);
    const other = await hero(server, url, 'esteirab', 'breaker', 11, pre);
    // sem ninguém com a missão, nada de aviso
    await go(server, other, 'oficina_soterrada', 124, 140);
    await go(server, c, 'oficina_soterrada', 124, 140);
    await sleep(900);
    assert.equal(other.events.filter((m) => m.t === 'warn' && m.hazard === 'belt_sweep').length, 0, 'esteira desligada');
    await toNpc(server, c, 'pina', 'oficina_soterrada');
    assert.equal((await c.request('quest_accept', { quest: 's_runaway_belt', npc: 'pina' })).ok, true);
    await go(server, c, 'oficina_soterrada', 124, 137);
    await c.waitFor((m) => m.t === 'warn' && m.hazard === 'belt_sweep', 5000, 'aviso da esteira');
    // três Lâminas fora das faixas
    for (let i = 0; i < 3; i++) await killOne(server, c, 'belt_blade');
    assert.equal((await quest(c, 's_runaway_belt')).objectives[0].cur, 3);
    // espera um aviso e fica em cima da faixa avisada
    const w = await c.waitFor((m) => m.t === 'warn' && m.hazard === 'belt_sweep', 8000, 'próximo aviso');
    const x = w.yaw === 0 ? w.x : w.x + w.length / 2, z = w.yaw === 0 ? w.z + w.length / 2 : w.z;
    const p = P(server, c);
    p.char.x = x; p.char.z = z;
    // quem caça ali sem a missão fica na mesma faixa: a esteira é só de quem está com a missão
    const po = P(server, other);
    po.char.x = w.yaw === 0 ? x : x + 2; po.char.z = w.yaw === 0 ? z + 2 : z;
    const hpOther = po.char.hp;
    const hp0 = p.char.hp;
    const hit = await c.waitFor((m) => m.t === 'hit' && m.skill === 'hazard' && m.dst === p.eid, 5000, 'varrida da esteira');
    assert.ok(hit.dmg > 0);
    await c.request('ping');
    assert.ok(p.char.hp < hp0 || p.char.dead, 'a varrida machuca');
    await other.request('ping');
    assert.equal(other.events.filter((m) => m.t === 'warn' && m.hazard === 'belt_sweep').length, 0, 'sem a missão, nenhum aviso (nem o sino)');
    assert.ok(!other.events.some((m) => m.t === 'hit' && m.skill === 'hazard' && m.dst === po.eid), 'sem a missão, a esteira não varre');
    assert.equal(po.char.hp, hpOther, 'sem a missão, nenhum dano');
    const st = await quest(c, 's_runaway_belt');
    assert.equal(st.objectives[0].cur, 0, 'a contagem voltou a zero');
    assert.ok(c.events.some((m) => m.t === 'system' && /esteira te pegou/.test(m.text)));
    // dez seguidas concluem
    p.char.x = 124; p.char.z = 128; p.char.hp = p.stats.maxHp;
    assert.equal((await c.request('gm', { cmd: 'quest_progress', quest: 's_runaway_belt', index: 0, value: 9 })).ok, true);
    await killOne(server, c, 'belt_blade');
    assert.equal((await quest(c, 's_runaway_belt')).ready, true);
    log(`esteira: aviso só com a missão, varrida de ${hit.dmg} de dano zerou a contagem`);
    await c.close(); await other.close();
  });
});

// ---------------------------------------------------------------- arma equipada e os dois ferreiros
test('Pronto para a Pedreira pede a arma de nível 5 equipada; Pêlo de Cinza aceita com Gusmão e entrega com Tiela', async () => {
  await withServer(async (server, url) => {
    const c = await hero(server, url, 'pedreira', 'breaker', 5, ['tutorial', 'c1_count', 'c1_rats', 'c1_master']);
    await toNpc(server, c, 'master_breaker', 'pedrambar');
    assert.ok((await c.request('talk', { npc: 'master_breaker' })).quests.offer.some((q) => q.id === 's_quarry_ready'));
    assert.equal((await c.request('quest_accept', { quest: 's_quarry_ready', npc: 'master_breaker' })).ok, true);
    assert.equal((await c.request('quest_turnin', { quest: 's_quarry_ready', npc: 'master_breaker' })).code, 'incomplete');
    const g = await c.request('gm', { cmd: 'give', defId: 'axe_1h_t5' });
    assert.equal((await c.request('allocate', { points: { str: 5, tal: 3 } })).ok, true);
    const eq = await c.request('equip', { instance: g.instanceId });
    assert.equal(eq.ok, true, eq.reason);
    const t = await c.request('quest_turnin', { quest: 's_quarry_ready', npc: 'master_breaker' });
    assert.equal(t.ok, true, t.reason);
    // Pêlo de Cinza: os dois ferreiros oferecem; aceita com um e entrega com o outro
    await toNpc(server, c, 'smith_gusmao', 'pedrambar');
    const offer = (await c.request('talk', { npc: 'smith_gusmao' })).quests.offer.find((q) => q.id === 's_ash_hide');
    assert.ok(offer);
    assert.equal(offer.npc, 'smith_gusmao');
    assert.equal((await c.request('quest_accept', { quest: 's_ash_hide', npc: 'smith_gusmao' })).ok, true);
    await c.request('gm', { cmd: 'give', defId: 'qi_scorched_hide', qty: 7 });
    await c.request('gm', { cmd: 'give', defId: 'mat_scrap', qty: 8 });
    await toNpc(server, c, 'smith_tiela', 'vau_de_nacar');
    const talk = await c.request('talk', { npc: 'smith_tiela' });
    const active = talk.quests.active.find((q) => q.id === 's_ash_hide');
    assert.equal(active.ready, true);
    assert.equal(active.turnIn, 'smith_tiela');
    const refine0 = bagQty(server, c, 'mat_refine');
    const r = await c.request('quest_turnin', { quest: 's_ash_hide', npc: 'smith_tiela' });
    assert.equal(r.ok, true, r.reason);
    assert.equal(bagQty(server, c, 'qi_scorched_hide'), 0, 'os 7 couros saem (o que sobra do item de missão também)');
    assert.equal(bagQty(server, c, 'mat_scrap'), 3, 'só 5 sucatas (material comum) são consumidas');
    assert.equal(bagQty(server, c, 'mat_refine') - refine0, 2);
    log('arma de nível 5 equipada conclui a missão do mestre; Gusmão → Tiela com couros e sucata');
    await c.close();
  });
});
