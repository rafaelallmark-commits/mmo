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
import { validateTrials } from '../tools/validate-data.js';

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
  // Quebraferro (blindagem), Lanceiro (fossos), Cantora (jato maior que a vida do aprendiz) e Tecelão (ondas
  // largas demais sem enraizar) perdem sempre; o Vigia com o arco inicial perde quase sempre (alvos rápidos
  // demais para um a um)
  for (const classId of ['breaker', 'pikeman', 'veilsinger', 'emberweaver']) {
    const r = rodarProva({ classId, faixa: 1, seed: 11, semHabilidade: true });
    assert.equal(r.success, false, `${classId} venceu sem ${data.skills[sig(classId)].name}`);
    assert.equal(r.trialDone, false);
    assert.equal(r.skills[sig(classId)], undefined, 'derrota não deixa a habilidade na ficha');
    log(`${data.classes[classId].name} sem ${data.skills[sig(classId)].name}: ${r.message}`);
  }
  const vigia = [11, 12, 13, 14, 15].map((seed) => rodarProva({ classId: 'warden', faixa: 1, seed, semHabilidade: true }));
  assert.ok(vigia.filter((r) => r.success).length <= 1, `Vigia sem Chuva de Espinhos venceu ${vigia.filter((r) => r.success).length} de 5`);
  log(`Vigia sem Chuva de Espinhos: ${vigia.filter((r) => !r.success).length} derrotas em 5 (${vigia.find((r) => !r.success)?.message})`);
});

test('provas com reação de jogador: uma decisão a cada 400 ms, kit inicial, todas as classes vencem', { timeout: 120000 }, () => {
  // o piloto perfeito decide a cada 100 ms; quem joga de verdade reage mais devagar
  for (const classId of CLASSES) {
    const r = rodarProva({ classId, faixa: 1, seed: 21, reacaoMs: 400 });
    assert.equal(r.success, true, `${classId} com 400 ms: ${r.message}`);
    log(`${data.classes[classId].name}: ${r.message} (${r.segundos} s)`);
  }
  // Quebraferro que não descobriu o cone sem alvo: Ruptura com o pilar selecionado, um pilar por vez, esperando
  // a mana parado — ainda dá tempo (a dica aparece depois da primeira)
  const ing = rodarProva({ classId: 'breaker', faixa: 1, seed: 21, reacaoMs: 400, miraNoAlvo: true });
  assert.equal(ing.success, true, ing.message);
  assert.equal(ing.usadas.rupture, 3, 'uma Ruptura por pilar');
  assert.ok(ing.eventos.some((m) => m.t === 'system' && /^Dica: a mana não dá/.test(m.text)), 'a dica do cone aparece');
  log(`Quebraferro mirando um pilar por vez: ${ing.message} (${ing.segundos} s)`);
  // e o que espera a terceira Ruptura batendo no pilar blindado (como faz quem clica nele): o golpe recusado não
  // prende em combate, então a mana volta no mesmo ritmo — antes, ele nunca juntava os 20 em 90 s
  for (const faixa of [1, 5]) {
    const bate = rodarProva({ classId: 'breaker', faixa, seed: 21, reacaoMs: 400, miraNoAlvo: true, bateNaBlindagem: true });
    assert.equal(bate.success, true, `faixa ${faixa}, batendo na blindagem: ${bate.message}`);
    assert.equal(bate.usadas.rupture, 3);
    log(`Quebraferro batendo na blindagem enquanto espera a mana (faixa ${faixa}): ${bate.message} (${bate.segundos} s)`);
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
  // o corpo de cada um vem nos dados (fem): Lia e Cora, Duarte
  assert.deepEqual(aprendizes.map((a) => [a.n, a.fem]).sort(), [['Aprendiz Cora', true], ['Aprendiz Duarte', false], ['Aprendiz Lia', true]]);
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
  // a primeira Ruptura rachou dois pilares de uma vez (o cone pega o par), a segunda o terceiro; sem a dica
  const rachou = r.eventos.filter((m) => m.t === 'system' && /^A Ruptura rachou/.test(m.text)).map((m) => m.text);
  assert.deepEqual(rachou, ['A Ruptura rachou 2 pilares de uma vez: agora os golpes entram.', 'A Ruptura rachou a blindagem de um pilar: agora os golpes entram.']);
  assert.equal(r.usadas.rupture, 2, 'duas Rupturas para três pilares');
  assert.ok(!r.eventos.some((m) => m.t === 'system' && /^Dica:/.test(m.text)), 'quem pegou dois no cone não recebe a dica');
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

test('prova: o mestre conta a prova antes, fora do posto há aviso e tiro recusado, instância abandonada some', { timeout: 60000 }, async () => {
  const { server, cli, eid, mestre } = prepararProva({ classId: 'warden', seed: 4 });
  // a conversa com o mestre já traz a prova da classe (o cliente mostra antes do botão)
  const talk = cli.pedir('talk', { npc: mestre });
  assert.equal(talk.trialAvailable, true);
  assert.equal(talk.trial.kind, 'targets');
  assert.equal(talk.trial.title, 'Alvos em Movimento');
  assert.equal(talk.trial.skillName, 'Chuva de Espinhos');
  assert.equal(talk.trial.ms, 90000);
  assert.match(talk.trial.objective, /posto de tiro/);
  const ev = [];
  const golpes = [];
  cli.aoEvento = (m) => ev.push(m);
  cli.aoCombate = (m) => golpes.push(m);
  assert.equal(cli.pedir('trial_start', { npc: mestre }).ok, true);
  for (let i = 0; i < 30; i++) server.step(100); // a primeira fila entra aos 2 s
  const status = () => ev.filter((m) => m.t === 'trial' && m.state === 'status').at(-1);
  assert.equal(status().alert ?? null, null, 'no posto, sem aviso');
  // fora do posto (z > 13,5): aviso no painel e o tiro não vale
  assert.equal(cli.pedir('move', { x: 18, z: 17 }).ok, true);
  for (let i = 0; i < 30; i++) server.step(100);
  assert.match(status().alert ?? '', /Fora do posto de tiro/);
  const alvo = [...cli.mundo().values()].find((e) => e.k === 'm' && e.def === 'trial_target' && !e.dead);
  assert.ok(alvo, 'alvo no trilho');
  assert.equal(cli.pedir('attack', { target: alvo.id }).ok, true);
  for (let i = 0; i < 25; i++) server.step(100);
  assert.ok(golpes.some((m) => m.t === 'hit' && m.src === eid && m.note === 'fora do posto' && m.dmg === 0), 'tiro de fora do posto recusado com o motivo');
  // teleporte de mestre para fora da arena sem a prova acabar: em 5 s a instância vazia some
  const zonaProva = [...server.zones.keys()].find((k) => k.startsWith('trial:'));
  assert.equal(cli.pedir('gm', { cmd: 'teleport', mapId: 'pedrambar', x: 30, z: 20 }).ok, true);
  for (let i = 0; i < 60; i++) server.step(100);
  await new Promise((r) => setImmediate(r));
  assert.equal(server.trials.size, 0, 'a prova abandonada sai da lista');
  assert.equal(server.zones.has(zonaProva), false, 'e a instância vazia some');
  assert.equal(cli.pedir('char').char.trialDone, false);
  server.store.close();
  log('Vigia: o mestre conta a prova; fora do posto, aviso e "fora do posto" no golpe; instância abandonada removida');
});

test('prova: a pedra do teto que derruba o Quebraferro encerra a prova no mesmo passo (o "respawn" não a salva)', { timeout: 60000 }, () => {
  // a pedra cai dentro do passo da prova (trial.tick); antes, a queda só era vista no passo seguinte e um
  // "respawn" nesse meio-tempo devolvia o personagem ao posto da arena, de pé, com a prova correndo
  const { server, cli, mestre } = prepararProva({ classId: 'breaker', seed: 2 });
  const ev = [];
  cli.aoEvento = (m) => ev.push(m);
  assert.equal(cli.pedir('trial_start', { npc: mestre }).ok, true);
  const key = [...server.trials.keys()][0];
  const p = server.zones.get(key).players.values().next().value;
  let caiu = false;
  for (let i = 0; i < 300 && !caiu; i++) {
    p.char.hp = Math.min(p.char.hp, 5); // a primeira pedra derruba
    server.step(100);
    caiu = p.char.dead || !server.trials.has(key);
  }
  assert.ok(caiu, 'a pedra caiu nele');
  const rs = cli.pedir('respawn');
  assert.equal(server.trials.has(key), false, 'a prova acabou no passo da queda');
  assert.equal(rs.ok, false, 'nada a levantar: de volta ao mestre, de pé');
  const fim = ev.find((m) => m.t === 'trial' && m.state === 'failed');
  assert.match(fim?.message ?? '', /Você caiu durante a prova/);
  const ch = cli.pedir('char').char;
  assert.equal(ch.mapId, 'pedrambar');
  assert.equal(ch.trialDone, false);
  server.store.close();
  log('Quebraferro derrubado por uma pedra: a prova acaba no mesmo passo e o "respawn" não a retoma');
});

test('prova: a fuligem do último instante que derruba um aprendiz da Cantora é derrota, não vitória', { timeout: 60000 }, () => {
  // a fuligem e o jato caem dentro do passo da prova; a queda era vista só no passo seguinte, e a fuligem dos
  // 70 s (o mesmo passo em que o tempo acaba) contava como "os três aprendizes resistiram"
  const { server, cli, mestre } = prepararProva({ classId: 'veilsinger', seed: 3 });
  const ev = [];
  cli.aoEvento = (m) => ev.push(m);
  assert.equal(cli.pedir('trial_start', { npc: mestre }).ok, true);
  const key = [...server.trials.keys()][0];
  const zone = server.zones.get(key);
  const trial = server.trials.get(key);
  const aprendizes = [...zone.allies.values()];
  let fim = null;
  for (let i = 0; i < 800 && !fim; i++) {
    // todos inteiros e com escudo até o último passo; nele, Lia fica com 2 de vida e sem escudo
    for (const a of aprendizes) { a.char.hp = a.stats.maxHp; a.shield = { amount: 999, until: zone.now + 5000, by: 0 }; }
    if (trial.elapsed + 100 >= trial.timeMs) { aprendizes[0].char.hp = 2; aprendizes[0].shield = null; }
    server.step(100);
    fim = ev.find((m) => m.t === 'trial' && (m.state === 'success' || m.state === 'failed'));
  }
  assert.equal(aprendizes[0].char.dead, true, 'a fuligem dos 70 s derrubou Lia');
  assert.equal(fim?.state, 'failed', fim?.message);
  assert.match(fim.message, /Aprendiz Lia caiu/);
  // o aviso do jato concorda com quem vai levar (fem nos dados): "nela" para Lia, "nele" para Duarte
  const alertas = ev.filter((m) => m.t === 'trial' && m.state === 'status' && m.alert).map((m) => m.alert);
  assert.ok(alertas.some((a) => /^Jato de vapor em Aprendiz Lia .*Selo do Véu nela!$/.test(a)), 'Lia: "nela"');
  assert.ok(alertas.some((a) => /^Jato de vapor em Aprendiz Duarte .*Selo do Véu nele!$/.test(a)), 'Duarte: "nele"');
  assert.equal(cli.pedir('char').char.trialDone, false);
  server.store.close();
  log('Cantora: a fuligem dos 70 s que derruba um aprendiz encerra a prova como derrota');
});

test('prova: o peregrino espera parado enquanto a emboscada estiver de pé', { timeout: 60000 }, () => {
  const { server, cli, mestre } = prepararProva({ classId: 'dawnshield', seed: 6 });
  const ev = [];
  cli.aoEvento = (m) => ev.push(m);
  assert.equal(cli.pedir('trial_start', { npc: mestre }).ok, true);
  const construtos = () => [...cli.mundo().values()].filter((e) => e.k === 'm' && e.def === 'trial_construct' && !e.dead);
  for (let i = 0; i < 120 && !construtos().length; i++) server.step(100); // ele anda até o marco 1 com o Escudeiro perto
  assert.equal(construtos().length, 2, 'emboscada do marco 1');
  const peregrino = () => [...cli.mundo().values()].find((e) => e.k === 'a');
  for (let i = 0; i < 10; i++) server.step(100);
  const p0 = peregrino();
  assert.equal(p0.n, 'Peregrino Odilon');
  assert.equal(p0.fem, false);
  for (let i = 0; i < 30; i++) server.step(100);
  const p1 = peregrino();
  assert.ok(Math.hypot(p1.x - p0.x, p1.z - p0.z) < 0.05, 'parado durante a emboscada');
  assert.ok(p1.hp < p1.mhp, 'os construtos vão nele');
  const st = ev.filter((m) => m.t === 'trial' && m.state === 'status').at(-1);
  assert.match(st.sub, /parado até a emboscada acabar/);
  assert.match(ev.find((m) => m.t === 'system' && /Emboscada/.test(m.text))?.text ?? '', /Emboscada no marco 1! Proteja Peregrino Odilon\./);
  server.store.close();
  log('Escudeiro: o peregrino para no marco 1 até a emboscada acabar');
});

test('validate-data: a prova de cada classe é conferida (perseguidores, jato, corpo dos aliados, cone, classe sem prova)', () => {
  assert.deepEqual(validateTrials(data), [], 'os dados de hoje passam');
  // uma cópia da prova com um defeito por vez: cada um precisa aparecer na lista de erros
  const comDefeito = (fn) => {
    const trial = structuredClone(data.maps.arena_prova.trial);
    fn(trial.classes);
    return validateTrials({ ...data, maps: { ...data.maps, arena_prova: { ...data.maps.arena_prova, trial } } }).join('\n');
  };
  // a dica da Andarilha promete que os perseguidores nunca correm mais que ela (5 m/s)
  assert.match(comDefeito((c) => { c.windwalker.chasers.speedBase = 4.6; }), /perseguidores chegam a 5\.50 m\/s/);
  // o jato da Cantora precisa passar da vida cheia do aprendiz (senão o Selo do Véu não é preciso)
  assert.match(comDefeito((c) => { c.veilsinger.jets.damage = 100; }), /o jato \(100\) precisa passar da vida cheia/);
  assert.match(comDefeito((c) => { delete c.bastion.ally.fem; }), /sem "fem"/);
  assert.match(comDefeito((c) => { c.breaker.pillars = [[4, 25], [18, 27.5], [32, 25]]; }), /nenhum par de pilares cabe no cone/);
  assert.match(comDefeito((c) => { delete c.emberweaver; }), /não tem prova/);
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

test('zona: golpe recusado pela peça (blindagem) não prende em combate; golpe que entra, sim', () => {
  const { zone, mk } = arena();
  const p = mk('breaker', 'Tcombate', 18, 20);
  const m = zone.spawnMonster({ monster: 'trial_pillar', x: 18, z: 21.5, radius: 0 }, { noRespawn: true });
  m.inert = true; m.noReward = true;
  let aberto = false;
  m.shieldHit = () => (aberto ? null : 'blindado');
  p.char.mp = 0;
  const desde = p.lastCombatAt; // recém-chegado: fora de combate
  zone.cmdAttack(p, m.eid);
  for (let i = 0; i < 80; i++) zone.tick(100); // 8 s batendo na blindagem
  assert.equal(p.lastCombatAt, desde, 'nenhum golpe recusado conta como combate');
  // fora de combate: 1,5% da mana máxima por segundo + 0,05 por ponto de Espírito (docs/04)
  const r = zone.f.regen;
  const porSeg = (p.stats.maxMp * r.mpPctPerSec) / 100 + p.stats.attrs.spi * r.mpPerSpiPerSec;
  assert.ok(p.char.mp >= porSeg * 7.9, `a mana voltou no ritmo de fora de combate (${p.char.mp.toFixed(1)} de ${(porSeg * 8).toFixed(1)})`);
  aberto = true; // rachou: agora o golpe entra e prende em combate
  for (let i = 0; i < 20; i++) zone.tick(100);
  assert.ok(zone.now - p.lastCombatAt <= 2000, 'golpe que entra conta como combate');
});

test('zona: aliado da prova leva dano pelo escudo e pelo Juramento, cai sem ir ao banco', () => {
  const { zone, sent, mk } = arena();
  const p = mk('dawnshield', 'Tjura', 18, 10);
  p.trialSkill = 'oath';
  const a = new TrialAlly(zone, 1, { name: 'Peregrino Teste', model: 'pilgrim', fem: false, x: 19, z: 10, hp: 200, defense: 10 });
  zone.allies.set(a.eid, a);
  assert.equal(zone.entityById('a1'), a);
  assert.ok(zone.alliesNear(p, 10).includes(a), 'conta como aliado de quem está na arena');
  const r = zone.castNow(p, 'oath', null, null, null, a.eid);
  assert.equal(r.ok, true, r.reason);
  assert.ok(a.guards.some((g) => g.guardianId === p.char.id), 'Juramento guarda o peregrino');
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
