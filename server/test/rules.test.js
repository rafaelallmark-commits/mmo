import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGameData } from '../src/data.js';
import { derivedStats, playerAttack, monsterAttack, levelForXp, splitKillXp, mitigate, rankCap, permanentAttrs } from '../src/rules.js';

const data = loadGameData();
const seq = (...vals) => { let i = 0; return () => vals[i++ % vals.length]; };
const equip = (...ids) => ids.map((id) => ({ def: data.items[id] }));

test('nível por XP acumulada', () => {
  assert.equal(levelForXp(0, data), 1);
  assert.equal(levelForXp(79, data), 1);
  assert.equal(levelForXp(80, data), 2);
  assert.equal(levelForXp(3610, data), 6);
  assert.equal(levelForXp(10_000_000, data), data.levelCap);
});

test('bônus de item não entra nos atributos permanentes', () => {
  const c = { classId: 'breaker', level: 1, alloc: {} };
  const st = derivedStats(c, equip('ring_furrow'), data);
  assert.equal(st.attrs.str, 19);
  assert.equal(permanentAttrs(c, data).str, 17);
});

test('ataque básico físico com rolagens fixas', () => {
  const c = { classId: 'breaker', level: 1, alloc: {} };
  const st = derivedStats(c, equip('axe_1h_t1', 'heavy_armor_t1'), data);
  const rat = { level: 1, defense: 2, mres: 1, evasion: 5 };
  // acerto (0.10 -> 10.0 < chance), dano 4 + floor(17*0.3+11*0.1)=6 -> 10, sem crítico (0.99)
  const r = playerAttack(st, rat, data, seq(0.10, 0.0, 0.99));
  assert.equal(r.hit, true); assert.equal(r.roll, 4); assert.equal(r.attrPart, 6); assert.equal(r.raw, 10); assert.equal(r.crit, false);
  assert.equal(r.mitigationK, 48);
  assert.equal(r.damage, Math.round(10 * 48 / 50));
});

test('magia ignora evasão e soma Espírito e poder mágico', () => {
  const c = { classId: 'emberweaver', level: 1, alloc: {} };
  const st = derivedStats(c, equip('wand_t1', 'focus_t1', 'robe_t1'), data);
  assert.equal(st.magicPower, 7);
  // Faísca de Vidro soma só a fração do poder mágico da habilidade (magicPowerPct)
  const gs = data.skills.glass_spark.effect;
  assert.ok(gs.magicPowerPct > 0 && gs.magicPowerPct < 100);
  const r = playerAttack(st, { level: 1, defense: 2, mres: 1, evasion: 999 }, data, seq(0.5, 0.99), { def: data.skills.glass_spark, rank: 1 });
  assert.equal(r.hit, true);
  assert.equal(r.magicPower, Math.floor((7 * gs.magicPowerPct) / 100));
  assert.equal(r.raw, gs.flat + Math.floor(20 * gs.spiCoef) + Math.floor((7 * gs.magicPowerPct) / 100));
  // sem magicPowerPct, a magia soma o poder mágico inteiro (Coração da Fornalha)
  const fh = data.skills.furnace_heart.effect;
  assert.equal(fh.magicPowerPct, undefined);
  const f = playerAttack(st, { level: 1, defense: 2, mres: 1, evasion: 999 }, data, seq(0.5, 0.99), { def: data.skills.furnace_heart, rank: 1 });
  assert.equal(f.raw, fh.flat + Math.floor(20 * fh.spiCoef) + 7);
});

test('mitigação mínima de 1 e teto de grau por nível', () => {
  assert.equal(mitigate(1, 1000, 1, data), 1);
  assert.equal(rankCap(1, data), 2); assert.equal(rankCap(5, data), 3); assert.equal(rankCap(10, data), 4); assert.equal(rankCap(15, data), 5);
});

test('XP dividido por participação, com bônus de cooperação e diferença de nível', () => {
  const m = data.monsters.cracked_foreman; // elite nv4
  const s = splitKillXp(m, [{ charId: 1, level: 4, score: 300 }, { charId: 2, level: 4, score: 100 }], data);
  assert.equal(s[0].xp, Math.round(m.xp * 0.75 * 1.1));
  assert.equal(s[1].xp, Math.round(m.xp * 0.25 * 1.1));
  // 6 níveis abaixo: ×0,1, com mínimo de 1 XP
  const rat = data.monsters.furrow_rat;
  const low = splitKillXp(rat, [{ charId: 1, level: 10, score: 1 }], data);
  assert.equal(low[0].xp, Math.max(1, Math.round(rat.xp * 0.1)));
  const mid = splitKillXp(data.monsters.gear_rat, [{ charId: 1, level: 16, score: 1 }], data);
  assert.equal(mid[0].xp, Math.max(1, Math.round(data.monsters.gear_rat.xp * 0.1)));
});

test('escudo bloqueia golpe de monstro com a chance da peça (bloqueado não causa dano)', () => {
  const c = { classId: 'bastion', level: 1, alloc: {} };
  const st = derivedStats(c, equip('hammer_1h_t1', 'shield_t1', 'heavy_armor_t1'), data);
  assert.equal(st.blockPct, data.items.shield_t1.blockPct);
  assert.equal(derivedStats(c, equip('hammer_1h_t1', 'heavy_armor_t1'), data).blockPct, 0, 'sem escudo, sem bloqueio');
  const rat = data.monsters.furrow_rat;
  // acerta (0.0), rolagem de bloqueio 0.05 → 5 < 8: bloqueado
  const b = monsterAttack(rat, st, data, seq(0.0, 0.05, 0.99, 0.99));
  assert.equal(b.hit, true); assert.equal(b.blocked, true); assert.equal(b.damage, 0);
  // rolagem de bloqueio 0.5 → 50 ≥ 8: o golpe passa e é mitigado pela defesa
  const n = monsterAttack(rat, st, data, seq(0.0, 0.5, 0.99, 0.99));
  assert.equal(n.blocked, undefined); assert.ok(n.damage >= 1);
  assert.equal(n.damage, Math.round(n.afterCrit * 48 / (48 + st.defense)));
});

test('ataque de monstro respeita defesa do jogador', () => {
  const st = derivedStats({ classId: 'breaker', level: 1, alloc: {} }, equip('heavy_armor_t1'), data);
  const r = monsterAttack(data.monsters.furrow_rat, st, data, seq(0.0, 0.99, 0.99));
  assert.equal(r.hit, true); assert.equal(r.roll, 4);
  assert.equal(r.damage, Math.round(4 * 48 / (48 + st.defense)));
});
