// Provas de classe (docs/02-campanha.md §3.3, server/src/trial.js): a prova de cada classe, jogada pelo
// protocolo por um piloto (server/tools/lib/provas/piloto.mjs) num servidor em processo, no nível 10 com o
// kit inicial e com o da faixa 5. Também: as provas que só fecham com a habilidade do nível 10, a
// habilidade emprestada durante a prova, os aliados com vida (cura, escudo, Juramento) e os ganchos da zona
// (blindagem, peças paradas, sem XP nem saque).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGameData } from '../src/data.js';
import { createStore } from '../src/db.js';
import { Zone } from '../src/zone.js';
import { makeRng } from '../src/rng.js';
import { TrialAlly } from '../src/trial.js';
import { rodarProva, prepararProva } from '../tools/lib/provas/bancada.mjs';

const data = loadGameData();
const log = (...a) => console.log('   ·', ...a);
const sig = (classId) => data.classes[classId].skills.find((s) => data.skills[s].unlockLevel === 10);
const CLASSES = Object.keys(data.classes);

for (const classId of CLASSES) {
  const cfg = data.maps.arena_prova.trial.classes[classId];
  test(`prova do ${data.classes[classId].name} (${cfg.title}): vence no nível 10 com o kit inicial e com o da faixa 5`, { timeout: 120000 }, () => {
    for (const faixa of [1, 5]) {
      const r = rodarProva({ classId, faixa, seed: 11 });
      assert.equal(r.success, true, `faixa ${faixa}: ${r.message} | ${r.ultimoStatus?.text} · ${r.ultimoStatus?.sub}`);
      assert.equal(r.trialDone, true, 'vitória marca a prova');
      assert.equal(r.skills[sig(classId)], 1, 'a habilidade do nível 10 fica na ficha no grau 1');
      assert.ok((r.usadas[sig(classId)] ?? 0) >= 1, `${data.skills[sig(classId)].name} foi usada na prova`);
      log(`faixa ${faixa}: ${r.message} (${r.segundos} s; ${Object.entries(r.usadas).map(([k, n]) => `${data.skills[k].name} ×${n}`).join(', ')})`);
    }
  });
}

test('provas que só fecham com a habilidade do nível 10 (kit inicial)', { timeout: 120000 }, () => {
  // Quebraferro (blindagem), Lanceiro (fossos), Vigia (alvos rápidos demais para um a um), Cantora (jato
  // maior que a vida do aprendiz) e Tecelão (ondas largas demais sem enraizar)
  for (const classId of ['breaker', 'pikeman', 'warden', 'veilsinger', 'emberweaver']) {
    const r = rodarProva({ classId, faixa: 1, seed: 11, semHabilidade: true });
    assert.equal(r.success, false, `${classId} venceu sem ${data.skills[sig(classId)].name}`);
    assert.equal(r.trialDone, false);
    assert.equal(r.skills[sig(classId)], undefined, 'derrota não deixa a habilidade na ficha');
    log(`${data.classes[classId].name} sem ${data.skills[sig(classId)].name}: ${r.message}`);
  }
});

test('prova: habilidade emprestada, mensagens, peças e aliados vistos pelo protocolo', { timeout: 60000 }, () => {
  // Cantora: na arena a Selo do Véu aparece no grau 1 (emprestada); os aprendizes chegam no snapshot (k 'a')
  const { server, cli, eid, mestre } = prepararProva({ classId: 'veilsinger', seed: 3 });
  const ev = [];
  cli.aoEvento = (m) => ev.push(m);
  cli.aoCombate = (m) => ev.push(m); // golpes e curas chegam por aqui no cliente em processo
  const antes = cli.pedir('char').char;
  assert.equal(antes.skills.veil_seal, undefined, 'fora da prova a habilidade do nível 10 não está na ficha');
  assert.equal(cli.pedir('cast', { skill: 'veil_seal' }).reason, 'Selo do Véu é liberada pela prova de classe.');
  const r = cli.pedir('trial_start', { npc: mestre });
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.kind, 'vigil');
  const ini = ev.find((m) => m.t === 'trial' && m.state === 'started');
  assert.ok(ini, 'mensagem de início');
  assert.equal(ini.title, 'Vigília dos Aprendizes');
  assert.equal(ini.skill, 'veil_seal');
  assert.equal(ini.char.skills.veil_seal, 1, 'a ficha mostra a habilidade emprestada');
  assert.equal(ini.char.trialSkill, 'veil_seal');
  for (let i = 0; i < 10; i++) server.step(100);
  const ents = [...cli.mundo().values()];
  const aprendizes = ents.filter((e) => e.k === 'a');
  assert.equal(aprendizes.length, 3, 'três aprendizes no snapshot');
  assert.ok(aprendizes.every((a) => a.def === 'apprentice' && a.hp > 0 && a.mhp === 110 && a.n.startsWith('Aprendiz')));
  const st = ev.filter((m) => m.t === 'trial' && m.state === 'status').at(-1);
  assert.match(st.text, /Aprendizes de pé: 3\/3/);
  assert.ok(st.left > 0 && st.left <= 70000);
  // cura e escudo valem no aliado
  const alvo = aprendizes[0];
  for (let i = 0; i < 30; i++) server.step(100); // a fuligem fere
  const ferido = cli.mundo().get(alvo.id);
  assert.ok(ferido.hp < ferido.mhp, 'a fuligem feriu o aprendiz');
  const cura = cli.pedir('cast', { skill: 'sustain_chant', ally: alvo.id });
  assert.equal(cura.ok, true, cura.reason);
  for (let i = 0; i < 11; i++) server.step(100); // recarga global
  const selo = cli.pedir('cast', { skill: 'veil_seal', ally: alvo.id });
  assert.equal(selo.ok, true, `Selo do Véu emprestada: ${selo.reason}`);
  server.step(100);
  const depois = cli.mundo().get(alvo.id);
  assert.ok(depois.sh > 0, 'o escudo aparece no aprendiz');
  assert.ok(ev.some((m) => m.t === 'heal' && m.dst === alvo.id), 'a cura chegou ao aprendiz');
  // aprender grau na emprestada: recusado (não está na ficha de verdade)
  assert.equal(cli.pedir('learn_skill', { skill: 'veil_seal' }).ok, false);
  log('Cantora na arena: Selo do Véu emprestada no grau 1, três aprendizes no snapshot, cura e escudo neles');
  server.store.close();
});

test('prova: queda no meio volta ao mestre sem a habilidade; a segunda tentativa vence', { timeout: 60000 }, async () => {
  // Lanceiro: cai a conexão entre os fossos; ao voltar, está na cidade do mestre e sem o Avanço do Fosso
  const { server, cli, mestre } = prepararProva({ classId: 'pikeman', seed: 5 });
  assert.equal(cli.pedir('trial_start', { npc: mestre }).ok, true);
  for (let i = 0; i < 20; i++) server.step(100);
  const zonaProva = [...server.zones.keys()].find((k) => k.startsWith('trial:'));
  assert.ok(zonaProva, 'instância da prova criada');
  server.dropSession(cli.sessao);
  await new Promise((r) => setImmediate(r)); // a instância sai no próximo giro (endTrial com queda)
  for (let i = 0; i < 3; i++) server.step(100);
  assert.equal([...server.zones.keys()].some((k) => k.startsWith('trial:')), false, 'a instância some com a queda');
  const row = server.store.listCharacters(server.store.findAccount('prova_pikeman_5_1').id)[0];
  const ch = server.store.loadCharacter(row.id);
  assert.equal(ch.mapId, 'pedrambar', 'volta à cidade do mestre');
  assert.equal(ch.trialDone, false);
  assert.equal(ch.skills.moat_charge, undefined, 'a habilidade emprestada não ficou');
  server.store.close();
  // segunda tentativa (outra bancada, mesma regra): vence, e a entrega da missão paga 1.800 XP uma vez
  const r = rodarProva({ classId: 'pikeman', seed: 5 });
  assert.equal(r.success, true, r.message);
  log(`queda no meio: de volta a Pedrâmbar sem o Avanço do Fosso; nova tentativa: ${r.message} (${r.segundos} s)`);
});

test('prova: recompensa uma vez — depois de vencer, nova prova é recusada e a entrega paga 1.800 XP uma vez', { timeout: 60000 }, () => {
  const r = rodarProva({ classId: 'breaker', seed: 9, manter: true });
  const { server, cli, mestre } = r;
  assert.equal(r.success, true, r.message);
  // a primeira Ruptura rachou dois pilares de uma vez (o cone pega o par)
  const rachados = r.eventos.filter((m) => m.t === 'system' && /rachou a blindagem/.test(m.text));
  assert.equal(rachados.length, 3, 'três pilares rachados');
  assert.equal(r.usadas.rupture, 2, 'duas Rupturas para três pilares');
  const ch = cli.pedir('char').char;
  assert.equal(ch.trialDone, true);
  assert.equal(ch.skills.rupture, 1);
  assert.equal(ch.trialSkill, null, 'fora da prova não há habilidade emprestada');
  assert.equal(ch.mapId, 'pedrambar', 'de volta à cidade do mestre');
  assert.equal(cli.pedir('trial_start', { npc: mestre }).reason, 'Você já venceu a prova da sua classe.');
  const xp = ch.xp;
  assert.equal(cli.pedir('quest_turnin', { quest: 'c3_trial', npc: mestre }).ok, true);
  assert.equal(cli.pedir('quest_turnin', { quest: 'c3_trial', npc: mestre }).alreadyDone, true);
  assert.equal(cli.pedir('char').char.xp, xp + 1800);
  server.store.close();
  log('Quebraferro: duas Rupturas rompem os três pilares; a vitória libera a Ruptura, nova prova recusada, 1.800 XP uma vez');
});

// ---------------------------------------------------------------- ganchos da zona
function arena() {
  const store = createStore(':memory:');
  const acc = store.createAccount('t', 'senha');
  const sent = [];
  const zone = new Zone({ mapId: 'arena_prova', instanceId: 'trial:t', data, store, rng: makeRng(7), send: (charId, m) => sent.push({ ...m, _to: charId }), broadcast: (m) => sent.push(m) });
  const mk = (classId, name, x, z) => {
    const cls = data.classes[classId];
    const id = store.createCharacter({ accountId: acc, name, classId, hp: 999, mp: 999, mapId: 'arena_prova', x, z, kit: cls.startingKit, slotFor: (d) => data.items[d].slot });
    const c = store.loadCharacter(id);
    c.level = 10; c.quests = new Map();
    const p = zone.addPlayer(c);
    c.hp = p.stats.maxHp; c.mp = p.stats.maxMp;
    return p;
  };
  return { store, zone, sent, mk };
}

test('zona: peça parada não anda nem bate, recusa golpe pelo motivo, sem XP nem saque', () => {
  const { zone, sent, mk } = arena();
  const p = mk('breaker', 'Tganchos', 18, 20);
  const m = zone.spawnMonster({ monster: 'trial_pillar', x: 18, z: 21.5, radius: 0 }, { noRespawn: true });
  m.inert = true; m.noReward = true;
  let aberto = false;
  m.shieldHit = (pl, skillId) => (aberto || skillId === 'dot' && aberto ? null : 'blindado');
  const xp0 = p.char.xp;
  zone.cmdAttack(p, m.eid);
  for (let i = 0; i < 30; i++) zone.tick(100);
  assert.equal(m.hp, m.def.hp, 'blindado: nada entra');
  assert.ok(sent.some((x) => x.t === 'hit' && x.dst === m.eid && x.note === 'blindado' && x.dmg === 0), 'o motivo vai no hit');
  assert.equal(m.targetId, null, 'peça parada não persegue');
  assert.equal(Math.round(m.x * 10), 180, 'não sai do lugar');
  aberto = true;
  m.hp = 5;
  for (let i = 0; i < 30 && m.state !== 'dead'; i++) zone.tick(100);
  assert.equal(m.state, 'dead');
  assert.equal(p.char.xp, xp0, 'sem XP');
  assert.equal(sent.filter((x) => x.t === 'loot').length, 0, 'sem saque');
});

test('zona: aliado da prova leva dano pelo escudo e pelo Juramento, cai sem ir ao banco', () => {
  const { zone, sent, mk } = arena();
  const p = mk('dawnshield', 'Tjura', 18, 10);
  p.trialSkill = 'oath';
  const a = new TrialAlly(zone, 1, { name: 'Peregrina Teste', model: 'pilgrim', x: 19, z: 10, hp: 200, defense: 10 });
  zone.allies.set(a.eid, a);
  assert.equal(zone.entityById('a1'), a);
  assert.ok(zone.alliesNear(p, 10).includes(a), 'conta como aliado de quem está na arena');
  const r = zone.castNow(p, 'oath', null, null, null, a.eid);
  assert.equal(r.ok, true, r.reason);
  assert.ok(a.guards.some((g) => g.guardianId === p.char.id), 'Juramento guarda a peregrina');
  const hp0 = p.char.hp;
  zone.damagePlayer(a, 100, null);
  assert.equal(a.char.hp, 130, '30% do dano foi para o Escudeiro');
  assert.equal(p.char.hp, hp0 - 30);
  a.shield = { amount: 50, until: zone.now + 5000, by: p.char.id };
  zone.damagePlayer(a, 40, null);
  assert.ok(a.char.hp >= 129 && a.shield.amount < 50, 'o escudo absorve primeiro');
  a.guards = []; a.shield = null;
  zone.damagePlayer(a, 999, null);
  assert.equal(a.char.dead, true);
  assert.ok(sent.some((m) => m.t === 'player_dead' && m.eid === a.eid), 'a queda é anunciada');
  // monstro que mira o aliado vai nele enquanto ninguém segura a atenção
  const b = new TrialAlly(zone, 2, { name: 'Aprendiz Teste', model: 'apprentice', x: 25, z: 25, hp: 300, defense: 10 });
  zone.allies.set(b.eid, b);
  const m = zone.spawnMonster({ monster: 'trial_construct', x: 25, z: 30, radius: 0 }, { noRespawn: true });
  m.allyTarget = b.eid; m.noReward = true;
  for (let i = 0; i < 60; i++) zone.tick(100);
  assert.ok(b.char.hp < 300, 'o construto foi no aprendiz');
  assert.equal(m.targetId, b.eid);
  // o escudeiro bate: a atenção vem para ele
  zone.hitMonster(p, m, null, null);
  for (let i = 0; i < 5; i++) zone.tick(100);
  assert.notEqual(m.targetId, b.eid, 'com ameaça, o construto larga o aprendiz');
  const snap = zone.snapshot();
  assert.ok(snap.ents.some((e) => e.id === 'a2' && e.k === 'a' && e.def === 'apprentice'), 'aliado no snapshot completo');
  assert.ok(zone.snapRecords().some((rec) => rec.id === 'a2' && rec.A.includes('"k":"a"')), 'e nos registros por diferença');
});
