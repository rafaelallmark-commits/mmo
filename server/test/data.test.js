import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGameData } from '../src/data.js';
import { validate, loadBuilds, reachability, runBuild } from '../tools/validate-data.js';

const data = loadGameData();

test('arquivos de dados são coerentes (classes, itens, saque, mapas, XP)', () => {
  const { errors } = validate(data, loadBuilds());
  assert.deepEqual(errors, []);
});

test('fração em valor que vai para coluna inteira do banco é recusada (o PostgreSQL não grava, o SQLite gravaria)', () => {
  const d = structuredClone(data);
  d.formulas.enhance.goldBase = 12.5; // ouro do ferreiro
  d.formulas.enhance.materials[0] = 1.5; // materiais gastos
  d.items.potion_hp_s.value = 7.25; // preço de compra e venda
  const { errors } = validate(d, loadBuilds());
  for (const what of ['ferreiro: goldBase', 'ferreiro: materials', 'item potion_hp_s: value']) {
    assert.ok(errors.some((e) => e.startsWith(what)), `${what} recusado: ${JSON.stringify(errors)}`);
  }
});

test('mecânica de monstro malformada é recusada: tipo, aviso curto demais, efeito negativo longo, reforço inexistente, território em agressivo', () => {
  const d = structuredClone(data);
  d.monsters.blind_welder.mechanic.warnMs = 600; // golpe de área sem tempo de reação
  d.monsters.echo_bat.mechanic.debuff.durationMs = 9000; // efeito negativo longo
  d.monsters.echo_bat.mechanic.debuff.mods.armorPct = -10; // mod que o servidor não conhece
  d.monsters.conduit_spider.mechanic.stunMs = 4000; // atordoamento longo
  d.monsters.shift_supervisor.mechanic.monster = 'rato_inexistente';
  d.monsters.shift_supervisor.mechanic.thresholdsPct = [40, 70];
  d.monsters.echo_mother.mechanic.spawn.monster = 'shift_supervisor'; // elite não é reforço
  d.monsters.rust_hound.mechanic = { kind: 'territorial', id: 'x', name: 'X', radius: 3 };
  d.monsters.gear_rat.mechanic.kind = 'teleporte';
  d.monsters.belt_blade.mechanic.shape = 'cone'; // trilho só em linha (e o cone sem alcance)
  d.monsters.pump_toad.mechanic.radius = 0;
  const { errors } = validate(d, loadBuilds());
  for (const what of ['blind_welder: mecânica: warnMs', 'echo_bat: mecânica: efeito negativo: durationMs', 'echo_bat: mecânica: efeito negativo: mod armorPct', 'conduit_spider: mecânica: stunMs',
    'shift_supervisor: mecânica: monstro rato_inexistente', 'shift_supervisor: mecânica: thresholdsPct', 'echo_mother: mecânica: reforços: shift_supervisor', 'rust_hound: mecânica: território',
    'gear_rat: mecânica: tipo teleporte', 'belt_blade: mecânica: dash e rails', 'belt_blade: mecânica: falta range', 'pump_toad: mecânica: radius']) {
    assert.ok(errors.some((e) => e.startsWith(`monstro ${what}`)), `${what} recusado: ${JSON.stringify(errors)}`);
  }
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
