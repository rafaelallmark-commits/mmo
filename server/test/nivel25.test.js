// Níveis acima de 20 (pós-v1): teto 25 com a tabela de XP calibrada pela mesma regra, A Cava
// Primeira (Poço de Inspeção de nível 20, monstros 21–24 e a elite diária), a habilidade do nível
// 25 de cada classe e o capítulo 6 começando com Ilda nos Canais e terminando com Mara na Cava.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GameServer } from '../src/server.js';
import { loadGameData } from '../src/data.js';
import { Store } from '../src/store.js';
import { Zone } from '../src/zone.js';
import { QuestEngine } from '../src/quests.js';
import { makeRng } from '../src/rng.js';
import { levelForXp, xpToNext, levelDiffMod } from '../src/rules.js';
import { SimClient, sleep } from './helpers/client.js';

const data = loadGameData();
const log = (...a) => console.log('   ·', ...a);
const LEVEL25 = Object.fromEntries(Object.entries(data.classes).map(([id, c]) => [id, c.skills.find((s) => data.skills[s].unlockLevel === 25)]));

// ---------------------------------------------------------------- teto e tabela
test('teto de nível 25: tabela de XP pela regra de calibração e XP extra não passa do teto', () => {
  assert.equal(data.levelCap, 25);
  const cum = data.xp.cumulative;
  assert.equal(cum.length, 25);
  const base = (L) => Math.round(8 + 6 * L ** 1.45);
  for (let L = 20; L < 25; L++) {
    const mins = 2 + 1.5 * (L - 1);
    assert.equal(data.xp.targetMinutesToNext[L - 1], mins, `meta do nível ${L}`);
    assert.equal(cum[L] - cum[L - 1], Math.round((mins * data.xp.killsPerMinuteSolo * base(L)) / 10) * 10, `XP do nível ${L} para o ${L + 1}`);
  }
  assert.equal(levelForXp(cum[24] - 1, data), 24);
  assert.equal(levelForXp(cum[24], data), 25);
  assert.equal(levelForXp(1e9, data), 25);
  assert.equal(xpToNext(24, data), cum[24]);
  assert.equal(xpToNext(25, data), null);
  // na zona: um personagem que passa muito do teto fica no 25 com todos os pontos e as 6 habilidades
  const store = new Store(':memory:');
  const acc = store.createAccount('teto', 'senha');
  const zone = new Zone({ mapId: 'cava_primeira', data, store, rng: makeRng(7), send: () => {}, broadcast: () => {} });
  const cls = data.classes.breaker;
  const id = store.createCharacter({ accountId: acc, name: 'Teto', classId: 'breaker', hp: 99, mp: 99, mapId: 'cava_primeira', x: 22, z: 80, kit: cls.startingKit, slotFor: (d) => data.items[d].slot });
  const c = store.loadCharacter(id); c.quests = new Map(); c.trialDone = true;
  const p = zone.addPlayer(c);
  zone.grantXp(p, cum[24] + 250000);
  assert.equal(c.level, 25);
  assert.equal(c.unspent, 24 * data.pointsPerLevel);
  assert.equal(c.skillPoints, 24 * data.skillPointsPerLevel);
  assert.deepEqual(cls.skills.map((s) => c.skills[s]), [1, 1, 1, 1, 1, 1], 'as seis habilidades liberadas');
  assert.equal(zone.charView(p).xpNext, null, 'sem próximo nível no teto');
  zone.grantXp(p, 1_000_000);
  assert.equal(c.level, 25);
  const main6 = Object.entries(data.quests).filter(([id]) => id.startsWith('c6_'));
  const xp6 = main6.reduce((s, [, q]) => s + q.rewards.xp, 0);
  log(`XP do 20 ao 25: ${(cum[24] - cum[19]).toLocaleString('pt-BR')}; ${main6.length} missões principais do capítulo 6 somam ${xp6.toLocaleString('pt-BR')} (${Math.round((xp6 / (cum[24] - cum[19])) * 100)}%)`);
  assert.ok(Math.abs(xp6 / (cum[24] - cum[19]) - 0.3) < 0.01, 'missões principais ≈ 30% do XP da faixa');
});

// ---------------------------------------------------------------- monstros da Cava
test('Cava Primeira: monstros 21–24 e a elite diária aparecem e dão XP pela diferença de nível', () => {
  const store = new Store(':memory:');
  const acc = store.createAccount('cava', 'senha');
  const zone = new Zone({ mapId: 'cava_primeira', data, store, rng: makeRng(11), send: () => {}, broadcast: () => {} });
  const count = {};
  for (const m of zone.monsters.values()) count[m.defId] = (count[m.defId] || 0) + 1;
  log('na Cava:', Object.entries(count).map(([k, v]) => `${data.monsters[k].name} ×${v}`).join(', '));
  assert.deepEqual(count, { cistern_salamander: 8, bronze_bellringer: 7, buried_voice: 6, basalt_mole: 11, deep_sealer: 1 });
  const levels = Object.keys(count).map((k) => data.monsters[k].level);
  assert.deepEqual([...new Set(levels)].sort(), [21, 22, 23, 24]);
  assert.equal(data.monsters.deep_sealer.rank, 'elite');
  assert.equal(data.monsters.deep_sealer.daily, true);
  for (const m of zone.monsters.values()) assert.ok(!zone.isBlocked(m.x, m.z) && zone.nav.isFree(m.x, m.z), `${m.defId} nasce em lugar livre`);

  const cls = data.classes.warden;
  const id = store.createCharacter({ accountId: acc, name: 'Cacadora', classId: 'warden', hp: 999, mp: 999, mapId: 'cava_primeira', x: 40, z: 80, kit: cls.startingKit, slotFor: (d) => data.items[d].slot });
  const c = store.loadCharacter(id); c.quests = new Map();
  c.level = 22; c.xp = data.xp.cumulative[21];
  const p = zone.addPlayer(c);
  const kill = (m) => {
    m.state = 'chase'; m.hp = 1; m.x = c.x + 1.5; m.z = c.z;
    const xp0 = c.xp;
    zone.damageMonster(m, c.id, 5);
    assert.equal(m.state, 'dead');
    const got = c.xp - xp0;
    zone.placeMonster(m);
    return got;
  };
  for (const defId of ['cistern_salamander', 'bronze_bellringer', 'buried_voice', 'basalt_mole']) {
    const m = [...zone.monsters.values()].find((x) => x.defId === defId);
    const got = kill(m);
    const want = Math.round(m.def.xp * levelDiffMod(m.def.level, c.level, data));
    log(`${m.def.name} (nv ${m.def.level}) → ${got} XP para nível ${c.level}`);
    assert.equal(got, want);
  }
  const sealer = [...zone.monsters.values()].find((x) => x.defId === 'deep_sealer');
  const first = kill(sealer), second = kill(sealer);
  log(`Selador da Porta Funda: ${first} XP no primeiro abate do dia, ${second} no segundo`);
  assert.equal(first, 2 * second, 'elite diária: XP em dobro no primeiro abate do dia');
  assert.equal(second, Math.round(data.monsters.deep_sealer.xp * levelDiffMod(24, 22, data)));
  assert.equal(c.level, 22, 'sem subir de nível no meio da conta');
  // saque da faixa 21: a tabela rola itens que existem
  const loot = zone.rollLoot({ def: data.monsters.deep_sealer, defId: 'deep_sealer' }, c);
  assert.ok(loot.some((d) => d.gold > 0), 'ouro do Selador');
  for (const d of loot) if (d.defId) assert.ok(data.items[d.defId], d.defId);
  // refino +4..+6 no teto: o Selador sempre entrega Pó de Refino Superior
  const sup = loot.find((d) => d.defId === 'mat_refine_sup');
  assert.ok(sup && sup.qty >= 2 && sup.qty <= 4, 'Pó de Refino Superior ×2–4 do Selador');
});

// ---------------------------------------------------------------- habilidades do nível 25
test('as 8 habilidades do nível 25 só existem no 25, sobem de grau e executam com o efeito esperado', () => {
  for (const [classId, sid] of Object.entries(LEVEL25)) {
    const s = data.skills[sid];
    assert.ok(s, `${classId} tem habilidade de nível 25`);
    const party = new Map();
    const store = new Store(':memory:');
    const acc = store.createAccount('h25', 'senha');
    const sent = [];
    const zone = new Zone({ mapId: 'cava_primeira', data, store, rng: makeRng(5), send: () => {}, broadcast: (m) => sent.push(m), hooks: { partyIdOf: (x) => party.get(x) ?? null } });
    const mk = (cid, name, x, z, level) => {
      const cl = data.classes[cid];
      const id = store.createCharacter({ accountId: acc, name, classId: cid, hp: 999, mp: 999, mapId: 'cava_primeira', x, z, kit: cl.startingKit, slotFor: (d) => data.items[d].slot });
      const ch = store.loadCharacter(id);
      ch.level = level; ch.trialDone = true; ch.quests = new Map(); ch.xp = data.xp.cumulative[level - 1];
      const pl = zone.addPlayer(ch);
      ch.hp = pl.stats.maxHp; ch.mp = pl.stats.maxMp;
      return pl;
    };
    // nível 24: ainda não tem
    const early = mk(classId, `E${classId.slice(0, 10)}`, 40, 84, 24);
    assert.equal(early.char.skills[sid], undefined);
    const no = zone.cmdCast(early, sid, null, 41, 84);
    assert.equal(no.ok, false);
    assert.match(no.reason, /Nível 25 exigido/);
    assert.equal(zone.cmdLearnSkill(early, sid).code, 'level');
    // nível 25: grau 1 de graça e grau 2 com um ponto
    const p = mk(classId, `H${classId.slice(0, 10)}`, 40, 80, 25);
    const ally = mk('breaker', `A${classId.slice(0, 10)}`, 41, 81, 25);
    party.set(p.char.id, 'g'); party.set(ally.char.id, 'g');
    assert.equal(p.char.skills[sid], 1, `${s.name} liberada no 25`);
    p.char.skillPoints = 1;
    const up = zone.cmdLearnSkill(p, sid);
    assert.equal(up.ok, true, up.reason);
    assert.equal(p.char.skills[sid], 2);
    // monstros encostados no conjurador (um atrás dele, para a roda de 360°) e rolagens que sempre acertam
    zone.rng = () => 0.01;
    const ms = [...zone.monsters.values()].filter((m) => m.defId === 'cistern_salamander');
    ms.forEach((m, i) => { m.x = p.char.x + 1.5 + i * 0.3; m.z = p.char.z + (i % 2 ? 0.5 : -0.5); m.hp = m.def.hp * 20; m.fx = []; m.dots = []; m.state = 'idle'; });
    const behind = ms[ms.length - 1];
    behind.x = p.char.x - 2; behind.z = p.char.z;
    for (const m of ms) m.home = { x: m.x, z: m.z }; // sem coleira puxando de volta para o ponto de origem
    const t = ms[0];
    p.cooldowns = {}; p.char.mp = p.stats.maxMp;
    ally.char.hp = Math.round(ally.stats.maxHp / 2);
    const hp0 = new Map(ms.map((m) => [m.eid, m.hp]));
    const res = zone.cmdCast(p, sid, t.eid, t.x, t.z, ally.eid);
    assert.equal(res.ok, true, `${data.classes[classId].name} / ${s.name}: ${res.reason}`);
    const k = s.effect.kind;
    if (k !== 'party_buff' && k !== 'ground_aoe') assert.ok(res.hits.length >= 1, `${s.name} atingiu alguém`);
    if (s.effect.bounceTargets) assert.ok(new Set(res.hits).size >= 3, `${s.name} ricocheteia (${new Set(res.hits).size} alvos)`);
    if (s.effect.angleDeg === 360) assert.ok(res.hits.includes(behind.eid), `${s.name} acerta quem está atrás`);
    if (s.effect.knockbackM) assert.ok(Math.hypot(t.x - p.char.x, t.z - p.char.z) > 1.5 + 1, `${s.name} empurra`);
    if (k === 'aoe_strike') assert.ok(res.hits.length >= 3, `${s.name} pega todos em volta`);
    if (s.effect.stunMs) assert.ok(zone.monsterFx(t, 'stun'), `${s.name} atordoa`);
    if (s.effect.dot) assert.ok(t.dots.length >= 1, `${s.name} deixa dano contínuo`);
    if (s.effect.defenseDownPct) assert.ok(zone.monsterFx(t, 'defenseDown'), `${s.name} reduz a defesa`);
    if (s.effect.bonusSacred) assert.ok(sent.some((m) => m.t === 'hit' && m.skill === 'sacred' && m.dst === t.eid), `${s.name} causa dano sagrado`);
    if (k === 'party_buff') {
      assert.ok(ally.buffs.some((b) => b.id === sid) && p.buffs.some((b) => b.id === sid), `${s.name} chega ao grupo`);
      const before = ally.char.hp;
      ally.lastCombatAt = zone.now; // em combate: a regeneração normal cai para um quarto
      for (let i = 0; i < 10; i++) zone.tick(100);
      assert.ok(ally.char.hp - before >= ally.stats.maxHp * 0.02, `${s.name} regenera ao menos 2% por segundo`);
    }
    if (k === 'ground_aoe') {
      for (let i = 0; i < 40; i++) zone.tick(100);
      assert.ok(t.hp < hp0.get(t.eid), `${s.name} causou dano na área`);
    }
    if (k === 'strike' || k === 'spell' || k === 'cone_strike' || k === 'aoe_strike') assert.ok(t.hp < hp0.get(t.eid), `${s.name} causou dano`);
  }
});

// ---------------------------------------------------------------- aceitar já dentro da Cava
test('aceitar "O Silêncio do Custódio" com a Ilda do Posto de Escuta, já dentro da Cava, conta a entrada na hora', () => {
  const store = new Store(':memory:');
  const acc = store.createAccount('dentro', 'senha');
  const quests = new QuestEngine({ data, store });
  const mk = (mapId, name) => {
    const id = store.createCharacter({ accountId: acc, name, classId: 'warden', hp: 99, mp: 99, mapId, x: 22, z: 80, kit: data.classes.warden.startingKit, slotFor: (d) => data.items[d].slot });
    const c = store.loadCharacter(id);
    c.quests = new Map(); c.level = 20; c.mapId = mapId;
    for (const [qid, q] of Object.entries(data.quests)) if (q.chapter <= 5) c.quests.set(qid, { state: 'done', progress: {} });
    return c;
  };
  const fora = mk('canais_eclusa', 'Fora'), dentro = mk('cava_primeira', 'Dentro');
  assert.equal(quests.accept(fora, 'c6_silence', 'ilda').ok, true);
  assert.equal(quests.view(fora, 'c6_silence').objectives[0].done, false, 'nos Canais a descida ainda falta');
  const r = quests.accept(dentro, 'c6_silence', 'ilda');
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.quest.objectives[0].done, true, 'na Cava a entrada já conta');
  assert.equal(r.quest.objectives[1].done, false, 'falta falar com Mara');
  assert.deepEqual(JSON.parse(store.loadQuests(dentro.id).find((q) => q.quest_id === 'c6_silence').progress_json), { 0: true }, 'progresso gravado');
});

// ---------------------------------------------------------------- portal e capítulo 6 pelo protocolo
async function withServer(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'cinzas-n25-'));
  const server = new GameServer({ port: 0, host: '127.0.0.1', dbPath: join(dir, 'n25.db'), timeScale: 4, seed: 2525, dev: true, log: false });
  const port = await server.start();
  try { await fn(server, `ws://127.0.0.1:${port}`); } finally { await server.stop().catch(() => {}); rmSync(dir, { recursive: true, force: true }); }
}

async function teleport(c, mapId, x, z) {
  if (mapId) {
    const zone = c.waitFor((m) => m.t === 'zone' && m.mapId === mapId, 8000, `zona ${mapId}`);
    await c.request('gm', { cmd: 'teleport', mapId, x, z });
    await zone;
  } else await c.request('gm', { cmd: 'teleport', x, z });
  await sleep(150);
}

test('Poço de Inspeção exige nível 20; capítulo 6 começa com Ilda e conclui com Mara; habilidade do 25 pelo protocolo', async () => {
  await withServer(async (server, url) => {
    const c = new SimClient('n25');
    await c.connect(url);
    await c.request('register', { account: 'nivel25', password: 'senha123' });
    await c.request('login', { account: 'nivel25', password: 'senha123' });
    const r = await c.request('create_char', { name: 'Ouvinte', classId: 'warden' });
    assert.equal(r.ok, true, r.reason);
    const e = await c.request('enter', { charId: r.char.id });
    c.snap = e.snapshot;
    assert.equal((await c.request('gm', { cmd: 'xp', level: 19 })).ok, true);
    const done = Object.entries(server.data.quests).filter(([, q]) => q.chapter <= 5).map(([id]) => id);
    await c.request('gm', { cmd: 'quest_done', quests: done });

    // nível 19: o poço recusa com o motivo
    const canais = server.data.maps.canais_eclusa;
    const pt = canais.portals.find((x) => x.id === 'to_cava');
    assert.ok(pt, 'Poço de Inspeção nos Canais');
    await teleport(c, 'canais_eclusa', pt.x, pt.z + 2);
    let pr = await c.request('portal', { portal: 'to_cava' });
    assert.equal(pr.ok, false);
    assert.equal(pr.code, 'level');
    assert.equal(pr.reason, 'Nível 20 exigido para A Cava Primeira. Seu nível atual é 19.');
    log(`nível 19: "${pr.reason}"`);

    // nível 20: Ilda oferece o capítulo 6
    assert.equal((await c.request('gm', { cmd: 'xp', level: 20 })).ok, true);
    const ilda = canais.npcs.find((n) => n.id === 'ilda');
    await teleport(c, null, ilda.x + 1.5, ilda.z);
    const talk = await c.request('talk', { npc: 'ilda' });
    assert.equal(talk.ok, true, talk.reason);
    const offer = talk.quests.offer.find((q) => q.id === 'c6_silence');
    assert.ok(offer, 'Ilda oferece O Silêncio do Custódio');
    assert.match(offer.dialogue.offer, /Custódio/);
    const acc = await c.request('quest_accept', { quest: 'c6_silence', npc: 'ilda' });
    assert.equal(acc.ok, true, acc.reason);

    // desce pelo poço: o objetivo "entrar na Cava" conclui na troca de zona
    await teleport(c, null, pt.x, pt.z + 2);
    const zw = c.waitFor((m) => m.t === 'zone' && m.mapId === 'cava_primeira', 8000, 'Cava Primeira');
    const qw = c.waitFor((m) => m.t === 'quest_update' && m.quests.some((q) => q.id === 'c6_silence' && q.objectives[0].done), 8000, 'objetivo de entrar na Cava');
    pr = await c.request('portal', { portal: 'to_cava' });
    assert.equal(pr.ok, true, pr.reason);
    const z = await zw;
    await qw;
    const cava = server.data.maps.cava_primeira;
    assert.ok(Math.hypot(z.char.x - 10, z.char.z - 80) < 1, 'chega junto ao poço, do lado da Cava');
    c.snap = z.snapshot;
    const monsters = z.snapshot.ents.filter((x) => x.k === 'm');
    log(`na Cava: ${monsters.length} monstros no snapshot (${[...new Set(monsters.map((m) => m.def))].join(', ')})`);
    assert.ok(monsters.length >= 30);

    // Mara no Posto de Escuta: conversa e entrega
    const mara = cava.npcs.find((n) => n.id === 'mara');
    await teleport(c, null, mara.x + 1.5, mara.z);
    const t2 = await c.request('talk', { npc: 'mara' });
    assert.equal(t2.ok, true, t2.reason);
    const xp0 = (await c.request('char')).char.xp;
    const ti = await c.request('quest_turnin', { quest: 'c6_silence', npc: 'mara' });
    assert.equal(ti.ok, true, ti.reason);
    assert.match(ti.dialogue, /mais velho que a Companhia/i);
    const after = (await c.request('char')).char;
    assert.equal(after.xp - xp0, server.data.quests.c6_silence.rewards.xp);
    const j = (await c.request('quests')).journal;
    assert.ok(j.done.some((q) => q.id === 'c6_silence'), 'capítulo 6, missão 1 concluída');
    assert.ok(!j.available.some((q) => q.id === 'c6_calls'), 'a próxima pede nível 21');
    log(`c6_silence entregue a Mara: +${after.xp - xp0} XP`);

    // nível 25: a habilidade nova aparece no grau 1, sobe para o 2 e acerta um monstro da Cava
    assert.equal((await c.request('gm', { cmd: 'xp', level: 30 })).ok, true);
    let ch = (await c.request('char')).char;
    assert.equal(ch.level, 25, 'comando de XP para o nível 30 para no teto');
    assert.equal(ch.xpNext, null);
    assert.equal(ch.skills.bell_arrow, 1);
    const learn = await c.request('learn_skill', { skill: 'bell_arrow' });
    assert.equal(learn.ok, true, learn.reason);
    assert.equal(learn.char.skills.bell_arrow, 2);
    const j2 = (await c.request('quests')).journal;
    assert.ok(j2.available.some((q) => q.id === 'c6_calls'), 'Os Que Pediram Socorro liberada');
    await teleport(c, null, 62, 88);
    await sleep(300);
    const me = c.me();
    const target = c.snap.ents.filter((x) => x.k === 'm' && x.def === 'cistern_salamander').sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0];
    assert.ok(target && Math.hypot(target.x - me.x, target.z - me.z) < 19, 'salamandra ao alcance');
    const cast = await c.request('cast', { skill: 'bell_arrow', target: target.id });
    assert.equal(cast.ok, true, cast.reason);
    assert.ok(cast.hits.includes(target.id));
    log(`Flecha do Sino (grau 2) atingiu ${new Set(cast.hits).size} alvo(s)`);

    // volta pelo poço para os Canais
    await c.request('stop'); // larga o alvo (senão o personagem segue a salamandra)
    const mz = c.waitFor((m) => m.t === 'zone' && m.mapId === 'canais_eclusa', 8000, 'volta aos Canais');
    await teleport(c, null, 6, 80);
    pr = await c.request('portal', { portal: 'to_canais' });
    assert.equal(pr.ok, true, pr.reason);
    const back = await mz;
    assert.ok(Math.hypot(back.char.x - 84, back.char.z - 181) < 1);
    ch = back.char;
    assert.equal(ch.level, 25);
    await c.close();
  });
});

// ---------------------------------------------------------------- o capítulo inteiro
test('capítulo 6 inteiro e as duas secundárias podem ser concluídos; a escolha da Porta Funda muda as falas', async () => {
  await withServer(async (server, url) => {
    const c = new SimClient('cap6');
    await c.connect(url);
    await c.request('register', { account: 'capitulo6', password: 'senha123' });
    await c.request('login', { account: 'capitulo6', password: 'senha123' });
    const r = await c.request('create_char', { name: 'Escuta', classId: 'veilsinger' });
    await c.request('enter', { charId: r.char.id });
    await c.request('gm', { cmd: 'xp', level: 21 });
    await c.request('gm', { cmd: 'quest_done', quests: [...Object.entries(server.data.quests).filter(([, q]) => q.chapter <= 5).map(([id]) => id), 'c6_silence'] });
    const cava = server.data.maps.cava_primeira;
    const npc = (id) => cava.npcs.find((n) => n.id === id);
    const obj = (id) => cava.objects.find((o) => o.id === id);
    const P = () => server.playerOf(c.char.id);
    const view = (q) => server.quests.view(P().char, q);
    await teleport(c, 'cava_primeira', 22, 80);
    const at = async (id) => { const n = npc(id); await teleport(c, null, n.x + 1.5, n.z); };
    const accept = async (quest) => { const q = server.data.quests[quest]; await at(q.npc); const a = await c.request('quest_accept', { quest, npc: q.npc }); assert.equal(a.ok, true, `${quest}: ${a.reason}`); return a; };
    const turnIn = async (quest) => { const q = server.data.quests[quest]; await at(q.turnIn); const t = await c.request('quest_turnin', { quest, npc: q.turnIn }); assert.equal(t.ok, true, `${quest}: ${t.reason}`); log(`${q.title}: entregue (+${q.rewards.xp} XP)`); return t; };
    // abates pelo caminho real (damageMonster → crédito → missão); o monstro reaparece na hora
    const killUntil = (defId, done) => {
      for (let i = 0; i < 300 && !done(); i++) {
        const p = P();
        const m = [...p.zone.monsters.values()].find((x) => x.defId === defId && x.state !== 'dead');
        m.state = 'chase'; m.hp = 1; m.x = p.char.x + 1.5; m.z = p.char.z;
        p.zone.damageMonster(m, p.char.id, 5);
        p.zone.placeMonster(m);
      }
      assert.ok(done(), `abates de ${defId}`);
    };
    // canalização de verdade, sem monstro por perto para interromper
    const channel = async (objectId) => {
      const o = obj(objectId);
      for (const m of P().zone.monsters.values()) if (m.def.rank !== 'elite' && Math.hypot(m.x - o.x, m.z - o.z) < 22) { m.state = 'dead'; m.hp = 0; m.respawnAt = Infinity; }
      await teleport(c, null, o.x, o.z + 1.5);
      const end = c.waitFor((m) => m.t === 'channel_end' && m.object === objectId, 6000, `canalização em ${objectId}`);
      const it = await c.request('interact', { object: objectId });
      assert.equal(it.ok, true, `${objectId}: ${it.reason}`);
      assert.equal(it.channel.ms, o.channelMs);
      assert.equal((await end).ok, true, `${objectId} concluído`);
    };

    // 6.2 e a secundária do Joca (nível 21)
    await accept('c6_calls');
    await accept('s_bells');
    killUntil('bronze_bellringer', () => view('c6_calls').objectives[0].done && view('s_bells').objectives[0].done);
    for (const t of ['voice_tube_1', 'voice_tube_2', 'voice_tube_3']) await channel(t);
    assert.equal(view('c6_calls').ready, true);
    const t2 = await turnIn('c6_calls');
    assert.match(t2.dialogue, /fechada por cima/);
    await turnIn('s_bells');

    // 6.3 (nível 22)
    await c.request('gm', { cmd: 'xp', level: 22 });
    await accept('c6_answer');
    await channel('old_post');
    killUntil('buried_voice', () => view('c6_answer').objectives[1].done);
    const t3 = await turnIn('c6_answer');
    assert.match(t3.dialogue, /esquadro de pedreiro/);
    assert.ok(t3.char.items.some((i) => i.defId === 'amulet_t21' && i.loc === 'bag'), 'Amuleto do Chamado na bolsa');

    // 6.4 e a secundária da Mara (nível 23): selos, escolha e falas que mudam
    await c.request('gm', { cmd: 'xp', level: 23 });
    await accept('c6_choice');
    await accept('s_moles');
    for (const s of ['deep_seal_1', 'deep_seal_2', 'deep_seal_3']) await channel(s);
    await at('ilda');
    const talk = await c.request('talk', { npc: 'ilda' });
    assert.ok(talk.choice && talk.choice.quest === 'c6_choice', 'Ilda pergunta sobre a Porta Funda');
    assert.deepEqual(talk.choice.options.map((o) => o.id), ['abrir', 'esperar']);
    const ch = await c.request('quest_choice', { quest: 'c6_choice', option: 'esperar', npc: 'ilda' });
    assert.equal(ch.ok, true, ch.reason);
    assert.equal(ch.title, 'Guarda da Porta Funda');
    const t4 = await turnIn('c6_choice');
    assert.match(t4.dialogue, /Fechada, então/);
    killUntil('basalt_mole', () => view('s_moles').objectives[0].done);
    await turnIn('s_moles');

    // 6.5 (nível 24): oferta conforme a escolha, Selador, tubo de resposta e o sino do outro lado
    await c.request('gm', { cmd: 'xp', level: 24 });
    await at('ilda');
    const offer = (await c.request('talk', { npc: 'ilda' })).quests.offer.find((q) => q.id === 'c6_reply');
    assert.ok(offer, 'Ilda oferece A Resposta');
    assert.match(offer.dialogue.offer, /Você disse para esperar/);
    await accept('c6_reply');
    const sealer = [...P().zone.monsters.values()].find((m) => m.defId === 'deep_sealer');
    await teleport(c, null, sealer.x - 2, sealer.z);
    killUntil('deep_sealer', () => view('c6_reply').objectives[0].done);
    await channel('reply_tube');
    const t5 = await turnIn('c6_reply');
    assert.match(t5.dialogue, /não vamos embora/);
    assert.ok(t5.char.items.some((i) => i.defId === 'ring_t25'), 'Anel dos Fundadores na bolsa');
    const j = (await c.request('quests')).journal;
    for (const id of ['c6_silence', 'c6_calls', 'c6_answer', 'c6_choice', 'c6_reply', 's_bells', 's_moles']) assert.ok(j.done.some((q) => q.id === id), `${id} concluída`);
    log(`fim do capítulo 6 no nível ${t5.char.level}, título "${t5.char.title}"`);
    await c.close();
  });
});
