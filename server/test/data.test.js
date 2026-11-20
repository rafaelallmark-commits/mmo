import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGameData } from '../src/data.js';
import { validate, loadBuilds, reachability, runBuild } from '../tools/validate-data.js';

const data = loadGameData();

test('arquivos de dados são coerentes (classes, itens, saque, mapas, XP)', () => {
  const { errors } = validate(data, loadBuilds());
  assert.deepEqual(errors, []);
});

test('todo conjunto de classe/faixa cabe nos pontos disponíveis', () => {
  const rows = reachability(data);
  assert.ok(rows.length >= 8 * 6);
  for (const r of rows) assert.ok(r.ok, `${r.classId} ${r.family} nv${r.tier}`);
});

test('exemplos de evolução gastam exatamente 5 pontos por nível e atingem os requisitos', () => {
  for (const b of Object.values(loadBuilds())) {
    const { steps, errors } = runBuild(b, data);
    assert.deepEqual(errors, []);
    assert.equal(steps.at(-1).spent, (data.levelCap - 1) * data.pointsPerLevel);
  }
});

test('catálogo de exemplo da especificação está presente com os requisitos pedidos', () => {
  const expect = {
    axe_1h_t5: ['Machado de Pedreira', 5, { str: 22, tal: 14 }, ['breaker'], 1],
    claw_t5: ['Garra de Manivela', 5, { str: 18, tal: 18 }, ['bastion'], 1],
    spear_2h_t9: ['Pique de Ferro Frio', 9, { str: 30, tal: 20 }, ['pikeman'], 2],
    bow_t9: ['Arco de Freixo Negro', 9, { agi: 30, tal: 18 }, ['warden'], 1],
    sword_1h_t13: ['Espada da Vigília', 13, { str: 35, spi: 20 }, ['dawnshield'], 1],
    javelin_t13: ['Azagaia da Correnteza', 13, { agi: 35, tal: 24 }, ['windwalker'], 1],
    scepter_t17: ['Cetro do Sino Mudo', 17, { spi: 45, tal: 24 }, ['veilsinger'], 1],
    staff_2h_t20: ['Cajado da Câmara Rubra', 20, { spi: 55, tal: 28 }, ['emberweaver'], 2],
  };
  for (const [id, [name, level, req, classes, hands]] of Object.entries(expect)) {
    const d = data.items[id];
    assert.equal(d.name, name); assert.equal(d.level, level); assert.deepEqual(d.req, req); assert.deepEqual(d.classes, classes); assert.equal(d.hands, hands);
  }
});
