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
  assert.equal(levelForXp(10_000_000, data), 20);
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
  const r = playerAttack(st, { level: 1, defense: 2, mres: 1, evasion: 999 }, data, seq(0.5, 0.99), { def: data.skills.glass_spark, rank: 1 });
  assert.equal(r.hit, true);
  assert.equal(r.raw, 14 + Math.floor(20 * 0.9) + 7);
});

test('mitigação mínima de 1 e teto de grau por nível', () => {
  assert.equal(mitigate(1, 1000, 1, data), 1);
  assert.equal(rankCap(1, data), 2); assert.equal(rankCap(5, data), 3); assert.equal(rankCap(10, data), 4); assert.equal(rankCap(15, data), 5);
});

test('XP dividido por participação, com bônus de cooperação e diferença de nível', () => {
  const m = data.monsters.cracked_foreman; // nv4, 212 XP
  const s = splitKillXp(m, [{ charId: 1, level: 4, score: 300 }, { charId: 2, level: 4, score: 100 }], data);
  assert.equal(s[0].xp, Math.round(212 * 0.75 * 1.1));
  assert.equal(s[1].xp, Math.round(212 * 0.25 * 1.1));
  const low = splitKillXp(data.monsters.furrow_rat, [{ charId: 1, level: 10, score: 1 }], data);
  assert.equal(low[0].xp, Math.round(14 * 0.1));
});

test('ataque de monstro respeita defesa do jogador', () => {
  const st = derivedStats({ classId: 'breaker', level: 1, alloc: {} }, equip('heavy_armor_t1'), data);
  const r = monsterAttack(data.monsters.furrow_rat, st, data, seq(0.0, 0.99, 0.99));
  assert.equal(r.hit, true); assert.equal(r.roll, 4);
  assert.equal(r.damage, Math.round(4 * 48 / (48 + st.defense)));
});
