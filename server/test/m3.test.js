// Teste de aceitação do Marco 3: refino (taxas em 10.000 tentativas, falha mantém o grau),
// depósito da conta, elite diária, capítulos 4–5 e o Custódio vencido por grupos de bots com
// três composições (com tanque e curadora; sem tanque; 2 jogadores), com reconexão no meio.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GameServer } from '../src/server.js';
import { loadGameData } from '../src/data.js';
import { createStore } from '../src/db.js';
import { Zone } from '../src/zone.js';
import { makeRng } from '../src/rng.js';
import { rollEnhance, enhanceQuote } from '../src/smith.js';
import { SimClient, sleep } from './helpers/client.js';

const data = loadGameData();
const log = (...a) => console.log('   ·', ...a);
const d2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

async function withServer(fn, opts = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'cinzas-m3-'));
  const server = new GameServer({ port: 0, host: '127.0.0.1', dbPath: join(dir, 'm3.db'), timeScale: 4, seed: 777, dev: true, log: false, ...opts });
  const port = await server.start();
  try { await fn(server, `ws://127.0.0.1:${port}`); } finally { await server.stop().catch(() => {}); rmSync(dir, { recursive: true, force: true }); }
}

async function login(url, label, account = `acc_${label}`) {
  const c = new SimClient(label);
  await c.connect(url);
  await c.request('register', { account, password: 'senha123' });
  const l = await c.request('login', { account, password: 'senha123' });
  c.chars = l.chars;
  return c;
}

async function newChar(url, label, classId, name, account) {
  const c = await login(url, label, account);
  const r = await c.request('create_char', { name, classId });
  assert.equal(r.ok, true, r.reason);
  const e = await c.request('enter', { charId: r.char.id });
  c.snap = e.snapshot;
  return c;
}

async function goTo(c, x, z, timeout = 20000) {
  const r = await c.request('move', { x, z });
  assert.equal(r.ok, true, `${c.label} → (${x}, ${z}): ${r.reason}`);
  const dest = r.dest ?? { x, z };
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const me = c.me();
    if (me && d2(me, dest) < 0.8) return me;
    await sleep(30);
  }
  throw new Error(`${c.label}: não chegou em ${x},${z}`);
}

async function teleport(c, mapId, x, z) {
  if (mapId) {
    const zone = c.waitFor((m) => m.t === 'zone' && m.mapId === mapId, 8000, `zona ${mapId}`);
    await c.request('gm', { cmd: 'teleport', mapId, x, z });
    await zone;
  } else await c.request('gm', { cmd: 'teleport', x, z });
  await sleep(150);
}

// ---------------------------------------------------------------- refino
test('refino: taxas conferem em 10.000 tentativas com RNG semeado', () => {
  const f = data.formulas.enhance;
  for (let g = 0; g < f.maxLevel; g++) {
    const rng = makeRng(1000 + g);
    let ok = 0;
    for (let i = 0; i < 10000; i++) if (rollEnhance(rng, f.chancePct[g]).success) ok++;
    const rate = ok / 100;
    log(`+${g} → +${g + 1}: ${rate.toFixed(2)}% (esperado ${f.chancePct[g]}%)`);
    assert.ok(Math.abs(rate - f.chancePct[g]) < 1.5, `taxa ${rate} longe de ${f.chancePct[g]}`);
  }
  assert.equal(enhanceQuote(data.items.axe_1h_t9, f.maxLevel, data), null, `+${f.maxLevel} é o máximo`);
});

test('ferreiro: sucesso sobe o grau; falha mantém o grau e consome ouro e materiais; depósito é da conta', async () => {
  // robô de teste faz ~150 pedidos em poucos segundos: limite de comandos folgado só aqui
  await withServer(async (server, url) => {
    server.opts.rateLimit = 1000; server.opts.rateBurst = 1000;
    const a = await newChar(url, 'smithA', 'breaker', 'Ferreira', 'conta_ferro');
    await teleport(a, 'pedrambar', 14, 44);
    await a.request('gm', { cmd: 'gold', amount: 100000 });
    for (let i = 0; i < 6; i++) await a.request('gm', { cmd: 'give', defId: 'mat_refine', qty: 40 });
    const axe = (await a.request('char')).char.items.find((i) => i.defId === 'axe_1h_t1');
    let fails = 0, wins = 0;
    for (let i = 0; i < 40; i++) {
      const before = (await a.request('char')).char;
      const it = before.items.find((x) => x.id === axe.id);
      if (it.enh >= 3) { // volta para tentar de novo com outra peça igual
        const g = await a.request('gm', { cmd: 'give', defId: 'axe_1h_t1' });
        axe.id = g.instanceId;
        continue;
      }
      const q = await a.request('enhance_quote', { npc: 'smith_gusmao', instance: axe.id });
      assert.equal(q.ok, true, q.reason);
      const r = await a.request('enhance', { npc: 'smith_gusmao', instance: axe.id });
      assert.equal(r.ok, true, r.reason);
      const matBefore = before.items.filter((x) => x.defId === 'mat_refine').reduce((s, x) => s + x.qty, 0);
      const matAfter = r.char.items.filter((x) => x.defId === 'mat_refine').reduce((s, x) => s + x.qty, 0);
      assert.equal(matBefore - matAfter, q.materialQty, 'materiais consumidos');
      assert.equal(before.gold - r.char.gold, q.gold, 'ouro consumido');
      const after = r.char.items.find((x) => x.id === axe.id);
      if (r.success) { wins++; assert.equal(after.enh, it.enh + 1); } else { fails++; assert.equal(after.enh, it.enh, 'falha mantém o grau'); }
    }
    log(`refinos no servidor: ${wins} sucessos, ${fails} falhas`);
    assert.ok(wins > 0 && fails > 0);
    // depósito: guarda com um personagem, pega com outro da mesma conta
    await teleport(a, null, 40, 44);
    const gift = await a.request('gm', { cmd: 'give', defId: 'potion_hp_m', qty: 3 });
    const put = await a.request('storage_put', { npc: 'storage_ambar', instance: gift.instanceId });
    assert.equal(put.ok, true, put.reason);
    assert.ok(put.storage.items.some((i) => i.id === gift.instanceId));
    await a.close();
    const b = await login(url, 'smithB', 'conta_ferro');
    const rb = await b.request('create_char', { name: 'Herdeira', classId: 'veilsinger' });
    await b.request('enter', { charId: rb.char.id });
    await teleport(b, 'vau_de_nacar', 20, 44);
    const list = await b.request('storage_list', { npc: 'storage_nacre' });
    assert.ok(list.storage.items.some((i) => i.id === gift.instanceId && i.owner === 'Ferreira'), 'outro personagem da conta vê o item');
    const take = await b.request('storage_take', { npc: 'storage_nacre', instance: gift.instanceId });
    assert.equal(take.ok, true, take.reason);
    assert.ok(take.char.items.some((i) => i.id === gift.instanceId));
    const again = await b.request('storage_take', { npc: 'storage_nacre', instance: gift.instanceId });
    assert.equal(again.ok, false, 'a mesma peça não sai duas vezes');
    await b.close();
  });
});

// ---------------------------------------------------------------- elite diária e única do chefe
test('elite diária dá XP em dobro só no primeiro abate do dia; a única do chefe sai uma vez', () => {
  const store = createStore(':memory:');
  const acc = store.createAccount('d', 'senha');
  const zone = new Zone({ mapId: 'galerias_eco', data, store, rng: makeRng(5), send: () => {}, broadcast: () => {} });
  const cls = data.classes.warden;
  const id = store.createCharacter({ accountId: acc, name: 'Diaria', classId: 'warden', hp: 999, mp: 999, mapId: 'galerias_eco', x: 120, z: 30, kit: cls.startingKit, slotFor: (d) => data.items[d].slot });
  const c = store.loadCharacter(id); c.level = 15; c.quests = new Map();
  const p = zone.addPlayer(c);
  const mother = [...zone.monsters.values()].find((m) => m.defId === 'echo_mother');
  const gains = [];
  for (let i = 0; i < 2; i++) {
    mother.state = 'chase'; mother.hp = 1; mother.x = c.x + 1; mother.z = c.z;
    const xp0 = c.xp; const lvl0 = c.level;
    zone.damageMonster(mother, c.id, 5);
    gains.push(c.level === lvl0 ? c.xp - xp0 : null);
    zone.placeMonster(mother);
  }
  log(`XP da Mãe do Eco: ${gains.join(' / ')}`);
  assert.ok(gains[0] > gains[1] * 1.8, 'primeiro abate do dia vale o dobro');
  const boss = { def: data.monsters.lock_custodian, defId: 'lock_custodian' };
  const first = zone.rollLoot(boss, c).map((d) => d.defId);
  const second = zone.rollLoot(boss, c).map((d) => d.defId);
  assert.ok(first.includes('bow_t20'), 'arma única da classe na primeira vitória');
  assert.ok(!second.includes('bow_t20') && !second.some((x) => x === 'ring_t20' || x === 'amulet_t20'), 'não repete a única');
});

// ---------------------------------------------------------------- capítulos 4 e 5
test('capítulo 4: Mara e Ilda nas Galerias, objetivo "entrar nos Canais" conclui pela passagem', async () => {
  await withServer(async (server, url) => {
    const c = await newChar(url, 'cap4', 'warden', 'Andarilha');
    await c.request('gm', { cmd: 'xp', level: 15 });
    const done = ['tutorial', 'c1_count', 'c1_rats', 'c1_master', 'c1_route', 'c1_foreman', 'c2_water', 'c2_pressure', 'c2_pages', 'c2_group', 'c2_signature', 'c3_fuses', 'c3_rats', 'c3_trial', 'c3_order', 'c4_bells', 'c4_ilda', 'c4_route', 'c4_reasons'];
    await c.request('gm', { cmd: 'quest_done', quests: done });
    await teleport(c, 'galerias_eco', 24, 86);
    const talk = await c.request('talk', { npc: 'ilda' });
    assert.ok(talk.quests.offer.some((q) => q.id === 'c4_order'), 'Ilda oferece A Ordem de Abertura');
    const acc = await c.request('quest_accept', { quest: 'c4_order', npc: 'ilda' });
    assert.equal(acc.ok, true, acc.reason);
    await teleport(c, null, 214, 80);
    const z = c.waitFor((m) => m.t === 'zone' && m.mapId === 'canais_eclusa', 8000, 'Canais');
    const ready = c.waitFor((m) => m.t === 'quest_update' && m.quests.some((q) => q.id === 'c4_order' && q.ready), 8000, 'missão pronta');
    const pr = await c.request('portal', { portal: 'to_canais' });
    assert.equal(pr.ok, true, pr.reason);
    await z;
    assert.ok(await ready);
    log('c4_order pronta ao entrar nos Canais da Eclusa');
    await c.close();
  });
});

// ---------------------------------------------------------------- calabouço
const KIT = {
  breaker: ['axe_2h_t17', 'heavy_armor_t17'], bastion: ['hammer_1h_t17', 'heavy_armor_t17'], pikeman: ['spear_2h_t17', 'heavy_armor_t17'],
  warden: ['bow_t17', 'light_armor_t17'], dawnshield: ['sword_1h_t17', 'heavy_armor_t17'], windwalker: ['javelin_t17', 'light_armor_t17'],
  veilsinger: ['scepter_t17', 'robe_t17'], emberweaver: ['staff_2h_t17', 'robe_t17'],
};
const RANGED = new Set(['warden', 'windwalker', 'veilsinger', 'emberweaver']);

async function gearUp(c, classId) {
  await c.request('gm', { cmd: 'xp', level: 20 });
  let ch = (await c.request('char')).char;
  // pontos: cumpre os requisitos do kit e põe o resto em Vitalidade
  const need = {};
  for (const id of KIT[classId]) for (const [k, v] of Object.entries(data.items[id].req || {})) need[k] = Math.max(need[k] || 0, v);
  const pts = {};
  let left = ch.unspent;
  for (const [k, v] of Object.entries(need)) { const add = Math.max(0, v - (ch.attrs[k] || 0)); pts[k] = Math.min(add, left); left -= pts[k]; }
  pts.vit = (pts.vit || 0) + left;
  const al = await c.request('allocate', { points: pts });
  assert.equal(al.ok, true, al.reason);
  for (const id of KIT[classId]) {
    const g = await c.request('gm', { cmd: 'give', defId: id });
    const e = await c.request('equip', { instance: g.instanceId });
    assert.equal(e.ok, true, `${classId} ${id}: ${e.reason}`);
  }
  await c.request('gm', { cmd: 'give', defId: 'potion_hp_m', qty: 30 });
  ch = (await c.request('char')).char;
  for (const sid of data.classes[classId].skills) for (let i = 0; i < 2; i++) await c.request('learn_skill', { skill: sid });
  return (await c.request('char')).char;
}

function lastBoss(c) {
  for (let i = c.events.length - 1; i >= 0; i--) if (c.events[i].t === 'boss') return c.events[i];
  return null;
}

// linhas do piso avisadas e ainda não descarregadas
function activeLines(c) {
  const now = Date.now();
  return c.events.filter((m) => m.t === 'warn' && m.shape === 'line' && now - m._at < m.ms / 4 + 250);
}

function safeFrom(lines, p, width) {
  const bad = (x, z) => lines.some((l) => Math.abs((Math.abs(l.yaw) > 0.1 ? z - l.z : x - l.x)) <= width / 2 + 1.2);
  if (!bad(p.x, p.z)) return null;
  let best = null, bd = 1e9;
  for (let x = 4; x <= 44; x += 2) for (let z = 6; z <= 44; z += 2) {
    if (bad(x, z)) continue;
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < bd) { bd = d; best = { x, z }; }
  }
  return best;
}

async function bot(c, classId, role, stop) {
  const width = data.formulas.dungeon.lineWidth;
  const skills = data.classes[classId].skills;
  let lastTarget = null, lastMove = 0, potionAt = 0;
  while (!stop.v) {
    await sleep(120);
    if (c.ws.readyState !== 1) return;
    const me = c.me();
    const b = lastBoss(c);
    if (!me || me.dead || !b || b.state !== 'fight') continue;
    const boss = c.entity(b.eid);
    if (!boss) continue;
    try {
      if (me.hp < me.mhp * 0.45 && Date.now() > potionAt) {
        const pot = c.char?.items.find((i) => i.defId === 'potion_hp_m' && i.loc === 'bag');
        if (pot) { potionAt = Date.now() + 1000; c.request('use_item', { instance: pot.id }).catch(() => {}); }
      }
      // curadora: cura quem estiver mais ferido
      if (role === 'healer') {
        const allies = c.snap.ents.filter((e) => e.k === 'p' && !e.dead);
        const hurt = allies.sort((x, y) => x.hp / x.mhp - y.hp / y.mhp)[0];
        if (hurt && hurt.hp < hurt.mhp * 0.75) { c.request('cast', { skill: skills[0], ally: hurt.id }).catch(() => {}); }
        const fallen = c.snap.ents.find((e) => e.k === 'p' && e.dead);
        if (fallen) c.request('cast', { skill: skills[4], ally: fallen.id }).catch(() => {});
      }
      // fase 2: sai das linhas avisadas
      if (b.phase === 2) {
        const safe = safeFrom(activeLines(c), me, width);
        if (safe) { lastTarget = null; await c.request('move', safe); lastMove = Date.now(); continue; }
        if (Date.now() - lastMove < 900) continue;
      }
      let target = boss.id;
      // fase 1: na ventilação, vai para o lado da válvula
      if (b.phase === 1 && b.valve && (b.valve.state === 'venting' || b.valve.state === 'warning') && b.protected) {
        const dx = b.valve.x - boss.x, dz = b.valve.z - boss.z, dl = Math.hypot(dx, dz) || 1;
        const r = RANGED.has(classId) ? 6 : 2.2;
        const spot = { x: boss.x + (dx / dl) * r, z: boss.z + (dz / dl) * r };
        if (d2(me, spot) > 1.4 && role !== 'tank') { lastTarget = null; await c.request('move', spot); continue; }
      }
      // fase 3: o tanque segura o chefe; os outros quebram a trava da comporta mais baixa
      if (b.phase === 3 && b.gates && role !== 'tank') {
        const g = [...b.gates].filter((x) => x.lock).sort((x, y) => y.progress - x.progress)[0];
        if (g && (g.progress > 0.55 || role === 'breaker')) target = g.lock;
      }
      if (target !== lastTarget) {
        lastTarget = target;
        const ar = await c.request('attack', { target });
        if (process.env.DEBUG_M3 && target !== boss.id) log(c.label, 'ataca trava', target, ar.ok ? 'ok' : ar.reason, 'eu', Math.round(me.x), Math.round(me.z));
      }
      // habilidades de dano/controle no alvo
      for (const sid of skills.slice(0, 4)) {
        const s = data.skills[sid];
        if (role === 'healer' && sid === skills[0]) continue;
        const payload = { skill: sid, target };
        if (s.target === 'ground') { const t = c.entity(target); if (t) { payload.x = t.x; payload.z = t.z; } }
        if (s.target === 'ally') payload.ally = c.char.eid;
        c.request('cast', payload).catch(() => {});
      }
    } catch { /* recusas fazem parte (recarga, alcance) */ }
  }
}

async function runDungeon(url, label, comp, { reconnect = false } = {}) {
  const clients = [];
  for (const [i, [classId, role]] of comp.entries()) {
    const c = await newChar(url, `${label}${i}`, classId, `${label}${i}`);
    c.classId = classId; c.role = role;
    await gearUp(c, classId);
    clients.push(c);
  }
  // grupo
  const leader = clients[0];
  for (const c of clients.slice(1)) {
    const inv = c.waitFor((m) => m.t === 'party_invite', 5000, 'convite');
    await leader.request('party_invite', { name: c.char.name });
    const m = await inv;
    await c.request('party_accept', { from: m.fromId });
  }
  await leader.request('gm', { cmd: 'quest_done', quests: ['c5_fragment'] });
  for (const [i, c] of clients.entries()) await teleport(c, 'canais_eclusa', 98 + i, 188);
  const entered = clients.map((c) => c.waitFor((m) => m.t === 'zone' && m.mapId === 'ultima_eclusa', 8000, 'calabouço'));
  const r = await leader.request('interact', { object: 'eclusa_gate' });
  assert.equal(r.ok, true, r.reason);
  await Promise.all(entered);
  log(`${label}: ${clients.length} jogadores na Última Eclusa`);
  const stop = { v: false };
  const bots = clients.map((c) => bot(c, c.classId, c.role, stop));
  const t0 = Date.now();
  let phases = new Set(), resets = 0, reconnected = false;
  try {
    while (Date.now() - t0 < 240000) {
      await sleep(250);
      const b = lastBoss(leader);
      if (b?.phase) phases.add(b.phase);
      resets = leader.events.filter((m) => m.t === 'boss' && m.state === 'reset').length;
      if (leader.events.some((m) => m.t === 'boss' && m.state === 'victory')) break;
      if (reconnect && !reconnected && b?.phase === 2) {
        // queda de conexão de um membro no meio do encontro
        reconnected = true;
        const victim = clients[clients.length - 1];
        const before = victim.me();
        await victim.close();
        await sleep(1500);
        const back = await login(url, victim.label);
        const e = await back.request('enter', { charId: back.chars[0].id });
        assert.equal(e.rejoinedDungeon, true, 'voltou para dentro da instância');
        assert.equal(e.char.mapId, 'ultima_eclusa');
        assert.ok(Math.abs(e.char.hp - before.hp) <= before.mhp * 0.35, 'vida restaurada como estava');
        back.snap = e.snapshot; back.char = e.char; back.classId = victim.classId; back.role = victim.role;
        clients[clients.length - 1] = back;
        bots.push(bot(back, back.classId, back.role, stop));
        log(`${label}: ${victim.label} caiu e voltou para dentro da Eclusa`);
      }
    }
  } finally { stop.v = true; await Promise.all(bots); }
  const won = leader.events.some((m) => m.t === 'boss' && m.state === 'victory');
  const reasons = leader.events.filter((m) => m.t === 'boss' && m.state === 'reset').map((m) => m.reason);
  if (process.env.DEBUG_M3) {
    let prev = null;
    for (const m of leader.events) {
      if (m.t !== 'boss') continue;
      if (m.state === 'reset' && prev) log('reset com', prev.phase, `${Math.round(prev.hp / prev.mhp * 100)}%`, JSON.stringify(prev.gates), m.reason);
      if (m.state === 'fight') prev = m;
    }
    const deaths = leader.events.filter((m) => m.t === 'player_dead').length;
    const hits = leader.events.filter((m) => m.t === 'hit' && m.skill === 'discharge').length;
    log('mortes', deaths, 'descargas acertadas', hits);
  }
  if (reasons.length) log(`${label}: recomeços — ${[...new Set(reasons)].join(' | ')}`);
  log(`${label}: ${won ? 'Custódio derrotado' : 'NÃO venceu'} em ${((Date.now() - t0) / 1000).toFixed(0)} s (fases ${[...phases].join(',')}, recomeços ${resets})`);
  assert.ok(won, `${label}: o grupo venceu o Custódio`);
  assert.deepEqual([...phases].sort(), [1, 2, 3], 'passou pelas três fases');
  // reagiram aos avisos: quebraram a proteção pela junta exposta e quase não levaram descargas
  const broke = leader.events.filter((m) => m.t === 'system' && /junta exposta/.test(m.text)).length;
  const discharges = leader.events.filter((m) => m.t === 'hit' && m.skill === 'discharge').length;
  const lines = leader.events.filter((m) => m.t === 'warn' && m.shape === 'line').length;
  log(`${label}: proteção rompida ${broke}x; descargas recebidas ${discharges} de ${lines} linhas avisadas`);
  assert.ok(broke >= 1, 'romperam a Proteção de Pressão pela junta exposta');
  assert.ok(discharges <= Math.max(2, lines * clients.length * 0.15), 'desviaram das linhas avisadas');
  // recompensa: arma única da classe para cada participante
  await sleep(400);
  for (const c of clients) {
    const weapon = data.lootTables.lt_lock_custodian.entries.find((e) => e.type === 'classDrop').byClass[c.classId];
    const got = [...c.loot.values()].some((l) => l.defId === weapon) || c.events.some((m) => m.t === 'loot' && m.loot.defId === weapon);
    assert.ok(got, `${c.label} recebeu ${weapon}`);
  }
  for (const c of clients) await c.close().catch(() => {});
}

test('A Última Eclusa: três composições de grupo vencem o Custódio reagindo aos avisos', async () => {
  await withServer(async (server, url) => {
    if (process.env.ONLY_DUO) { await runDungeon(url, 'dupla', [['dawnshield', 'breaker'], ['warden', 'dps']]); return; }
    await runDungeon(url, 'tanque', [['bastion', 'tank'], ['veilsinger', 'healer'], ['breaker', 'breaker'], ['warden', 'dps'], ['emberweaver', 'dps']], { reconnect: true });
    await runDungeon(url, 'semtanque', [['pikeman', 'breaker'], ['windwalker', 'dps'], ['emberweaver', 'dps']]);
    await runDungeon(url, 'dupla', [['dawnshield', 'breaker'], ['warden', 'dps']]);
  });
});
