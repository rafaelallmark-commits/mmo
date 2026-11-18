import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGameData } from '../src/data.js';
import { checkEquip, applyEquip, revalidateEquipment, requirementFailures, BAG_CAPACITY } from '../src/equipment.js';

const data = loadGameData();
let n = 0;
function makeChar(classId, level, equipIds, bagIds, alloc = {}) {
  const items = new Map();
  const add = (defId, loc, slot) => { const id = `i${++n}`; items.set(id, { id, defId, qty: 1, enh: 0, loc, slot }); return id; };
  const ids = {};
  for (const d of equipIds) ids[d] = add(d, 'equip', data.items[d].slot);
  for (const d of bagIds) ids[d] = add(d, 'bag', null);
  return { char: { classId, level, alloc, items }, ids };
}

test('recusa por nível com valor atual e exigido', () => {
  const { char, ids } = makeChar('breaker', 2, ['axe_1h_t1'], ['axe_1h_t5']);
  const r = checkEquip(char, ids.axe_1h_t5, data);
  assert.equal(r.ok, false); assert.equal(r.code, 'level');
  assert.equal(r.reason, 'Nível 5 exigido. Seu nível atual é 2.');
});

test('recusa por classe', () => {
  const { char, ids } = makeChar('emberweaver', 5, [], ['axe_1h_t5']);
  const r = checkEquip(char, ids.axe_1h_t5, data);
  assert.equal(r.reasons.includes('Classe exigida: Quebraferro. Sua classe é Tecelão da Brasa.'), true);
});

test('recusa por atributo permanente lista cada pendência com gênero correto', () => {
  const { char, ids } = makeChar('breaker', 5, [], ['axe_1h_t5', 'ring_furrow']);
  const r = checkEquip(char, ids.axe_1h_t5, data);
  assert.deepEqual(r.reasons, ['Força 22 exigida. Sua Força atual é 17.', 'Talento 14 exigido. Seu Talento atual é 11.']);
  // anel de +2 Força equipado não libera o requisito
  applyEquip(char, ids.ring_furrow, checkEquip(char, ids.ring_furrow, data));
  assert.equal(checkEquip(char, ids.axe_1h_t5, data).code, 'attr_str');
  char.alloc = { str: 5, tal: 3 };
  assert.equal(checkEquip(char, ids.axe_1h_t5, data).ok, true);
});

test('arma de duas mãos libera a mão secundária e bloqueia foco depois', () => {
  const { char, ids } = makeChar('emberweaver', 1, ['wand_t1', 'focus_t1', 'robe_t1'], ['staff_2h_t1']);
  const r = checkEquip(char, ids.staff_2h_t1, data);
  assert.equal(r.ok, true);
  assert.deepEqual(new Set(r.displaced), new Set([ids.wand_t1, ids.focus_t1]));
  applyEquip(char, ids.staff_2h_t1, r);
  assert.equal(char.items.get(ids.focus_t1).loc, 'bag');
  const f = checkEquip(char, ids.focus_t1, data);
  assert.equal(f.code, 'two_handed');
  assert.equal(f.reason, 'A arma de duas mãos ocupa a mão secundária. Desequipe-a antes de usar este item.');
});

test('duas mãos com bolsa cheia é recusado sem perder itens', () => {
  const filler = Array.from({ length: BAG_CAPACITY - 1 }, () => 'potion_hp_s');
  const { char, ids } = makeChar('emberweaver', 1, ['wand_t1', 'focus_t1'], ['staff_2h_t1', ...filler]);
  const r = checkEquip(char, ids.staff_2h_t1, data);
  assert.equal(r.code, 'bag_full');
});

test('consumível não é equipável; Quebraferro não usa escudo', () => {
  const { char, ids } = makeChar('breaker', 1, [], ['potion_hp_s', 'shield_t1']);
  assert.equal(checkEquip(char, ids.potion_hp_s, data).reason, 'Este item não pode ser equipado.');
  assert.equal(checkEquip(char, ids.shield_t1, data).code, 'class');
});

test('redistribuição que invalida equipamento devolve à bolsa ou à caixa de recuperação', () => {
  const { char, ids } = makeChar('breaker', 5, ['axe_1h_t5', 'heavy_armor_t5'], [], { str: 5, tal: 3 });
  assert.deepEqual(requirementFailures(char, data.items.axe_1h_t5, data), []);
  char.alloc = {};
  const moved = revalidateEquipment(char, data);
  assert.equal(moved.length, 2);
  assert.equal(char.items.get(ids.axe_1h_t5).loc, 'bag');
  const full = makeChar('breaker', 5, ['axe_1h_t5'], Array(BAG_CAPACITY).fill('potion_hp_s'), { str: 5, tal: 3 });
  full.char.alloc = {};
  revalidateEquipment(full.char, data);
  assert.equal(full.char.items.get(full.ids.axe_1h_t5).loc, 'recovery');
});
