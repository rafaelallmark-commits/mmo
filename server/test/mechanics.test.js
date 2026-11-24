// Mecânicas dos monstros (data/monsters.json "mechanic", server/src/mechanics.js), cada uma numa zona real
// sem rede, como em skills.test.js: os monstros do mapa saem e o teste cria só os que precisa.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGameData } from '../src/data.js';
import { createStore } from '../src/db.js';
import { Zone } from '../src/zone.js';
import { makeRng } from '../src/rng.js';
import { mitigate, monsterAttack, playerAttack } from '../src/rules.js';
import { meleeMods, railGoal, inShape, MIN_WARN_MS } from '../src/mechanics.js';

const data = loadGameData();
const spec = (id) => data.monsters[id].mechanic;

function setup(mapId, partyOf = () => null) {
  const store = createStore(':memory:');
  const acc = store.createAccount('t', 'senha');
  const sent = [];
  const zone = new Zone({ mapId, data, store, rng: makeRng(3), send: (charId, m) => sent.push({ ...m, _to: charId }), broadcast: (m) => sent.push(m), hooks: { partyIdOf: partyOf } });
  for (const m of [...zone.monsters.values()]) zone.monsters.delete(m.eid);
  let n = 0;
  const mk = (classId, x, z, level = 15) => {
    const cls = data.classes[classId];
    const id = store.createCharacter({ accountId: acc, name: `M${++n}${classId.slice(0, 8)}`, classId, hp: 999, mp: 999, mapId, x, z, kit: cls.startingKit, slotFor: (d) => data.items[d].slot });
    const c = store.loadCharacter(id);
    c.level = level; c.trialDone = true; c.quests = new Map();
    const p = zone.addPlayer(c);
    zone.recalc(p);
    c.hp = p.stats.maxHp; c.mp = p.stats.maxMp;
    return p;
  };
  const spawn = (monster, x, z) => zone.spawnMonster({ monster, x, z, radius: 0 }, { noRespawn: true });
  const engage = (m, p) => { m.state = 'chase'; m.targetId = p.eid; m.threat.set(p.char.id, 100); };
  // passos de 100 ms; each() antes de cada um (ex.: manter alguém vivo)
  const run = (ms, each) => { for (let t = 0; t < ms; t += 100) { each?.(); zone.tick(100); } };
  // entra em combate (primeiro passo) e deixa o golpe avisado pronto para o passo seguinte
  const ready = (m) => { zone.tick(100); m.mech.readyAt = zone.now; zone.tick(100); };
  const warnOf = (m) => sent.filter((x) => x.t === 'warn' && x.src === m.eid).at(-1);
  const hitsOf = (m, skill) => sent.filter((x) => x.t === 'hit' && x.src === m.eid && x.skill === skill);
  return { store, zone, mk, spawn, engage, run, ready, warnOf, hitsOf, sent };
}

test('todo golpe de área dos monstros é avisado com tempo de reação justo e todo efeito negativo é curto', () => {
  for (const [id, m] of Object.entries(data.monsters)) {
    const mech = m.mechanic;
    if (!mech) continue;
    const areas = [mech.kind === 'telegraph' && mech, mech.kind === 'death_burst' && mech, mech.kind === 'pressure' && mech.vent].filter(Boolean);
    for (const a of areas) assert.ok(a.warnMs >= MIN_WARN_MS, `${id}: aviso de ${a.warnMs} ms`);
    for (const d of [mech.debuff].filter(Boolean)) assert.ok(d.durationMs <= 6000, `${id}: ${d.name} dura ${d.durationMs} ms`);
    if (mech.stunMs) assert.ok(mech.stunMs <= 2000, `${id}: atordoa ${mech.stunMs} ms`);
  }
});

test('Supervisor de Turno: chama dois Ratos-Engrenagem a cada 30% de vida perdida, até seis vivos; reforço dá XP sem saque e some com ele', () => {
  const { zone, mk, spawn, engage, sent } = setup('oficina_soterrada');
  const p = mk('breaker', 150, 158, 12);
  const sup = spawn('shift_supervisor', 152, 160);
  engage(sup, p);
  const hp = sup.def.hp;
  const adds = () => [...zone.monsters.values()].filter((m) => m.summonerEid === sup.eid && m.state !== 'dead');
  zone.damageMonster(sup, p.char.id, Math.round(hp * 0.25));
  assert.equal(adds().length, 0, 'com 75% da vida, ninguém chega');
  zone.damageMonster(sup, p.char.id, Math.round(hp * 0.06));
  assert.equal(adds().length, 2, 'cruzou os 70%: dois ratos');
  for (const a of adds()) {
    assert.equal(a.defId, 'gear_rat');
    assert.equal(a.state, 'chase'); assert.equal(a.targetId, p.eid, 'vão direto em quem briga com o supervisor');
    assert.ok(a.temp && a.noLoot);
  }
  assert.ok(sent.some((m) => m.t === 'system' && m._to === p.char.id && m.text === 'Supervisor de Turno: Chamado de Turno! Chegaram 2 Ratos-Engrenagem.'), `quem briga é avisado, no plural certo: ${JSON.stringify(sent.filter((m) => m.t === 'system').map((m) => m.text))}`);
  assert.ok(sent.some((m) => m.t === 'mech' && m.kind === 'summon' && m.eid === sup.eid && m.adds.length === 2));
  // um golpe só cruza os 40% e os 10%: mais quatro, no teto de seis vivos
  zone.damageMonster(sup, p.char.id, Math.round(hp * 0.62));
  assert.equal(adds().length, spec('shift_supervisor').maxAlive, 'teto de vivos');
  zone.damageMonster(sup, p.char.id, 1);
  assert.equal(adds().length, 6, 'nenhum limiar a mais: ninguém novo');
  const a0 = adds()[0];
  sent.length = 0;
  zone.damageMonster(a0, p.char.id, a0.hp);
  assert.ok(sent.some((m) => m.t === 'xp' && m.monster === 'gear_rat'), 'o reforço abatido dá XP');
  assert.ok(!sent.some((m) => m.t === 'loot'), 'mas não deixa saque');
  zone.damageMonster(sup, p.char.id, sup.hp);
  zone.tick(100);
  assert.equal(adds().length, 0, 'o supervisor caiu: os reforços somem');
  assert.ok(sent.some((m) => m.t === 'mech' && m.kind === 'vanish'));
});

test('Supervisor de Turno que volta para casa esquece os limiares: na próxima luta chama de novo', () => {
  const { zone, mk, spawn, engage, run } = setup('oficina_soterrada');
  const p = mk('breaker', 150, 158, 12);
  const sup = spawn('shift_supervisor', 152, 160);
  engage(sup, p);
  zone.damageMonster(sup, p.char.id, Math.round(sup.def.hp * 0.35));
  const adds = () => [...zone.monsters.values()].filter((m) => m.summonerEid === sup.eid && m.state !== 'dead');
  assert.equal(adds().length, 2);
  // o jogador sai do mapa: o supervisor volta para casa (cura tudo) e os reforços somem
  zone.removePlayer(p.char.id, false);
  run(15000);
  assert.equal(sup.state, 'idle'); assert.equal(sup.hp, sup.def.hp);
  assert.equal(adds().length, 0);
  const q = mk('breaker', 150, 158, 12);
  engage(sup, q);
  zone.damageMonster(sup, q.char.id, Math.round(sup.def.hp * 0.35));
  assert.equal(adds().length, 2, 'limiares zerados');
});

test('Mãe do Eco: cada grito, avisado, gera um Ecoante — no máximo três vivos', () => {
  const { zone, mk, spawn, engage, run, warnOf, sent } = setup('galerias_eco');
  const p = mk('bastion', 122, 26, 16);
  const mae = spawn('echo_mother', 124, 24);
  engage(mae, p);
  const s = spec('echo_mother');
  const ecos = () => [...zone.monsters.values()].filter((m) => m.summonerEid === mae.eid && m.state !== 'dead');
  const vivo = () => { p.char.hp = p.stats.maxHp; };
  run(s.firstMs + 200, vivo);
  const w = warnOf(mae);
  assert.ok(w, `o grito é avisado ${s.firstMs} ms depois de entrar em combate`);
  assert.equal(w.shape, 'circle'); assert.equal(w.radius, s.radius); assert.equal(w.ms, s.warnMs); assert.equal(w.name, s.name);
  assert.equal(ecos().length, 0, 'durante o aviso ainda não nasceu');
  run(s.warnMs, vivo);
  assert.equal(ecos().length, 1, 'o grito gerou um Ecoante');
  assert.ok(sent.some((m) => m.t === 'hit' && m.src === mae.eid && m.skill === s.id && m.dst === p.eid), 'e acertou quem estava no círculo');
  for (let i = 0; i < 5; i++) { mae.mech.readyAt = zone.now; run(s.warnMs + 200, vivo); }
  assert.equal(ecos().length, s.spawn.maxAlive, `teto de ${s.spawn.maxAlive} vivos`);
  assert.ok(ecos().every((e) => e.defId === 'echoer' && e.noLoot));
});

test('Ecoante: no lugar do golpe comum, devolve 60% do último golpe que levou a quem o deu', () => {
  const { zone, mk, spawn, engage, sent } = setup('galerias_eco');
  const a = mk('breaker', 116, 48, 15);
  const b = mk('warden', 120, 48, 15);
  const e = spawn('echoer', 118, 48);
  const s = spec('echoer');
  engage(e, a);
  zone.tick(100); // entra em combate
  zone.rng = () => 0.3; // os dois golpes acertam, sem crítico
  const ra = zone.hitMonster(a, e, null, null);
  const rb = zone.hitMonster(b, e, null, null);
  assert.ok(ra.hit && rb.hit && rb.damage > 0);
  assert.equal(e.mech.blow.charId, b.char.id, 'guarda só o último');
  sent.length = 0;
  e.mech.echoAt = zone.now; e.nextAttackAt = 0;
  zone.tick(100);
  const eco = sent.find((m) => m.t === 'hit' && m.src === e.eid && m.skill === s.id);
  assert.ok(eco, 'o eco saiu');
  assert.equal(eco.dst, b.eid, 'em quem deu o último golpe (não no alvo)');
  const raw = Math.min(Math.round((rb.damage * s.pct) / 100), Math.round((e.def.damage[1] * s.capPct) / 100));
  assert.equal(eco.dmg, mitigate(Math.max(1, raw), b.stats.defense, e.def.level, data));
  assert.ok(sent.some((m) => m.t === 'mech' && m.kind === 'echo' && m.eid === e.eid && m.dst === b.eid));
  assert.ok(!sent.some((m) => m.t === 'hit' && m.src === e.eid && m.skill === null), 'no lugar do golpe comum');
  // sem golpe guardado, ou com o golpe esquecido (memoryMs), volta o golpe comum
  sent.length = 0;
  zone.hitMonster(a, e, null, null);
  e.mech.blow.at = zone.now - s.memoryMs - 1;
  e.mech.echoAt = zone.now; e.nextAttackAt = 0;
  zone.tick(100);
  assert.ok(sent.some((m) => m.t === 'hit' && m.src === e.eid && m.skill === null && m.dst === a.eid), 'golpe comum');
  assert.ok(!sent.some((m) => m.t === 'hit' && m.src === e.eid && m.skill === s.id));
});

test('Sapo-Bomba: a explosão ao morrer é avisada onde ele caiu; acerta quem ficou e poupa quem saiu', () => {
  const { zone, mk, spawn, run, warnOf, hitsOf, sent } = setup('brejo_bombas');
  const s = spec('pump_toad');
  const fica = mk('breaker', 45, 36, 6);
  const sai = mk('breaker', 43, 36, 6);
  const sapo = spawn('pump_toad', 44, 36);
  zone.damageMonster(sapo, fica.char.id, sapo.hp);
  assert.equal(sapo.state, 'dead');
  const w = warnOf(sapo);
  assert.ok(w, 'avisada');
  assert.equal(w.shape, 'circle'); assert.equal(w.radius, s.radius); assert.equal(w.ms, s.warnMs);
  assert.ok(Math.hypot(w.x - sapo.x, w.z - sapo.z) < 0.01, 'no lugar da morte');
  assert.equal(hitsOf(sapo, s.id).length, 0, 'nada antes do fim do aviso');
  // quem clica para fora a tempo não leva nada
  assert.equal(zone.cmdMove(sai, 38, 36).ok, true);
  const hpFica = fica.char.hp;
  run(s.warnMs + 100);
  const hits = hitsOf(sapo, s.id);
  assert.ok(hits.some((h) => h.dst === fica.eid && h.dmg > 0 && h.magic), 'quem ficou levou o vapor');
  assert.ok(!hits.some((h) => h.dst === sai.eid), 'quem saiu foi poupado');
  assert.ok(fica.char.hp < hpFica);
  assert.ok(sent.some((m) => m.t === 'mech' && m.kind === 'burst' && m.eid === sapo.eid && m.hits === 1));
});

test('Escória Pressurizada também explode ao morrer (4 m)', () => {
  const { zone, mk, spawn, run, hitsOf } = setup('canais_eclusa');
  const s = spec('pressure_slag');
  const p = mk('bastion', 103, 112, 18);
  const longe = mk('bastion', 106, 112, 18);
  const esc = spawn('pressure_slag', 100, 112);
  zone.damageMonster(esc, p.char.id, esc.hp);
  run(s.warnMs + 100);
  assert.ok(hitsOf(esc, s.id).some((h) => h.dst === p.eid), 'a 3 m: dentro');
  assert.ok(!hitsOf(esc, s.id).some((h) => h.dst === longe.eid), 'a 6 m: fora');
});

test('Sanguessuga Fervente: a mordida gruda e drena 3% da mana por segundo (aparece na interface); a Alvorada tira', () => {
  const party = new Map();
  const { zone, mk, spawn, engage, run, sent } = setup('brejo_bombas', (id) => party.get(id) ?? null);
  const s = spec('boiling_leech').debuff;
  const p = mk('emberweaver', 172, 40, 10);
  const leech = spawn('boiling_leech', 173.5, 40);
  engage(leech, p);
  zone.rng = () => 0.1; // a mordida acerta
  leech.nextAttackAt = 0;
  zone.tick(100);
  assert.ok(p.debuffs.some((d) => d.id === s.id), 'grudou');
  const msg = sent.find((m) => m.t === 'debuff' && m.eid === p.eid && m.id === s.id);
  assert.ok(msg, 'a interface fica sabendo');
  assert.equal(msg.name, s.name); assert.equal(msg.ms, s.durationMs); assert.match(msg.text, /mana/);
  // só a drenagem: a sanguessuga fica atordoada e não morde de novo
  zone.addMonsterFx(leech, { kind: 'stun', until: zone.now + 60000, by: 0 });
  p.char.mp = p.stats.maxMp;
  const mp0 = p.char.mp;
  run(2000);
  const lost = mp0 - p.char.mp;
  const expected = ((p.stats.maxMp * s.mpPctPerSec) / 100) * 2;
  assert.ok(lost > expected * 0.7 && lost <= expected + 0.5, `drenou ${lost.toFixed(1)} em 2 s (esperado ~${expected.toFixed(1)})`);
  assert.ok(sent.some((m) => m.t === 'mech' && m.kind === 'drain' && m.eid === leech.eid && m.dst === p.eid && m.amount > 0), 'cada segundo, o quanto drenou');
  const aurora = mk('dawnshield', 171, 41, 20);
  party.set(aurora.char.id, 'g'); party.set(p.char.id, 'g');
  const r = zone.castNow(aurora, 'daybreak', null, aurora.char.x, aurora.char.z, null);
  assert.equal(r.ok, true, r.reason);
  assert.ok(!p.debuffs.some((d) => d.id === s.id), 'a Alvorada tirou a sanguessuga');
  assert.ok(sent.some((m) => m.t === 'cleanse' && m.eid === p.eid && m.id === s.id));
  const mp1 = p.char.mp;
  run(1000);
  assert.ok(p.char.mp >= mp1, 'sem drenagem depois');
});

test('Sanguessuga: a drenagem acaba sozinha em 3 s sem nova mordida', () => {
  const { zone, mk, spawn, engage, run } = setup('brejo_bombas');
  const p = mk('emberweaver', 172, 40, 10);
  const leech = spawn('boiling_leech', 173.5, 40);
  engage(leech, p);
  zone.rng = () => 0.1;
  leech.nextAttackAt = 0;
  zone.tick(100);
  zone.addMonsterFx(leech, { kind: 'stun', until: zone.now + 60000, by: 0 });
  run(spec('boiling_leech').debuff.durationMs + 200);
  assert.equal(p.debuffs.length, 0);
});

test('Draga Viva: o Arrasto é avisado e puxa quem ficou a até 5 m, que fica atolado; quem está fora ou imune não vem', () => {
  const { zone, mk, spawn, engage, ready, run, warnOf, sent } = setup('canais_eclusa');
  const s = spec('living_dredge');
  const alvo = mk('warden', 176, 112, 17);
  const longe = mk('warden', 172, 122, 17);
  const imune = mk('bastion', 172, 108, 17);
  imune.ccImmuneUntil = 1e12;
  const draga = spawn('living_dredge', 172, 112);
  engage(draga, alvo);
  ready(draga);
  const w = warnOf(draga);
  assert.ok(w, 'avisado');
  assert.equal(w.shape, 'circle'); assert.equal(w.radius, s.radius); assert.equal(w.ms, s.warnMs);
  const dLonge = Math.hypot(longe.char.x - draga.x, longe.char.z - draga.z);
  const dImune = Math.hypot(imune.char.x - draga.x, imune.char.z - draga.z);
  run(s.warnMs + 100);
  const d = Math.hypot(alvo.char.x - draga.x, alvo.char.z - draga.z);
  assert.ok(Math.abs(d - s.pullTo) < 0.5, `puxado até ${s.pullTo} m (ficou a ${d.toFixed(2)} m)`);
  assert.ok(alvo.debuffs.some((x) => x.id === s.debuff.id), 'atolado');
  assert.equal(alvo.stats.moveSpeedPct, s.debuff.mods.moveSpeedPct, 'mais lento enquanto atolado');
  assert.ok(sent.some((m) => m.t === 'mech' && m.kind === 'pull' && m.eid === draga.eid && m.dst.includes(alvo.eid)));
  assert.ok(Math.abs(Math.hypot(longe.char.x - draga.x, longe.char.z - draga.z) - dLonge) < 0.01, 'quem estava fora não veio');
  assert.ok(!sent.some((m) => m.t === 'hit' && m.src === draga.eid && m.dst === longe.eid && m.skill === s.id));
  assert.ok(Math.abs(Math.hypot(imune.char.x - draga.x, imune.char.z - draga.z) - dImune) < 0.01, 'imune a controle não é puxado');
  run(s.debuff.durationMs + 100);
  assert.equal(alvo.stats.moveSpeedPct, 0, 'o atoleiro passa');
});

test('Soldador Cego: Cone de Faíscas avisado à frente; acerta quem está no cone e poupa quem está atrás ou saiu de lado', () => {
  const { zone, mk, spawn, engage, ready, run, warnOf, hitsOf } = setup('oficina_soterrada');
  const s = spec('blind_welder');
  const solda = spawn('blind_welder', 140, 48);
  const frente = mk('breaker', 142, 48, 11);
  const atras = mk('breaker', 137.5, 48, 11);
  const lado = mk('breaker', 143, 48.5, 11);
  engage(solda, frente);
  ready(solda);
  const w = warnOf(solda);
  assert.ok(w, 'avisado');
  assert.equal(w.shape, 'cone'); assert.equal(w.range, s.range); assert.equal(w.angleDeg, s.angleDeg); assert.equal(w.ms, s.warnMs);
  assert.ok(Math.abs(w.yaw - Math.PI / 2) < 0.05, `voltado para o alvo (yaw ${w.yaw})`);
  assert.ok(inShape({ ...w, shape: 'cone' }, lado.char.x, lado.char.z), 'o terceiro começa dentro do cone');
  assert.equal(zone.cmdMove(lado, 143, 54).ok, true);
  run(s.warnMs + 100);
  const hits = hitsOf(solda, s.id);
  assert.ok(hits.some((h) => h.dst === frente.eid && h.magic), 'na frente: acertado');
  assert.ok(!hits.some((h) => h.dst === atras.eid), 'atrás: poupado');
  assert.ok(!hits.some((h) => h.dst === lado.eid), 'saiu de lado: poupado');
});

test('atordoar o monstro durante o aviso cancela o golpe', () => {
  const { zone, mk, spawn, engage, ready, run, warnOf, hitsOf, sent } = setup('oficina_soterrada');
  const s = spec('blind_welder');
  const solda = spawn('blind_welder', 140, 48);
  const p = mk('breaker', 142, 48, 11);
  engage(solda, p);
  ready(solda);
  const w = warnOf(solda);
  zone.addMonsterFx(solda, { kind: 'stun', until: zone.now + 1000, by: p.char.id });
  zone.tick(100);
  assert.ok(sent.some((m) => m.t === 'warn_cancel' && m.id === w.id && m.src === solda.eid), 'o cliente apaga o aviso');
  run(s.warnMs + 100);
  assert.equal(hitsOf(solda, s.id).length, 0, 'o cone não saiu');
  assert.equal(zone.hazards.length, 0);
});

test('Lâmina de Esteira: persegue e dispara só nos eixos do mapa; a corrida no trilho acerta quem está nele', () => {
  const { zone, mk, spawn, engage, ready, run, warnOf, hitsOf } = setup('oficina_soterrada');
  const s = spec('belt_blade');
  // perseguição: um eixo de cada vez
  const lamina = spawn('belt_blade', 124, 140);
  assert.deepEqual(railGoal(zone, lamina, { x: 132, z: 145 }), { x: 132, z: 140 }, 'primeiro o eixo maior');
  assert.deepEqual(railGoal(zone, lamina, { x: 126, z: 150 }), { x: 124, z: 150 });
  assert.deepEqual(railGoal(zone, lamina, { x: 124.3, z: 150 }), { x: 124.3, z: 150 }, 'já alinhado: segue reto');
  const outro = spawn('furrow_rat', 60, 60);
  assert.deepEqual(railGoal(zone, outro, { x: 70, z: 65 }), { x: 70, z: 65 }, 'monstro sem trilho anda reto');
  zone.monsters.delete(outro.eid);
  const longe = mk('breaker', 132, 145, 12);
  engage(lamina, longe);
  const z0 = lamina.z;
  run(600);
  assert.ok(lamina.x > 125 && Math.abs(lamina.z - z0) < 0.05, `anda no eixo x primeiro (${lamina.x.toFixed(2)}, ${lamina.z.toFixed(2)})`);
  // a corrida: de (124, 140) com o alvo na diagonal leve, o trilho é o eixo x
  zone.removePlayer(longe.char.id, false);
  lamina.x = 124; lamina.z = 140; lamina.mech = null;
  const alvo = mk('breaker', 126, 140.8, 12);
  const fora = mk('breaker', 128, 143, 12);
  engage(lamina, alvo);
  ready(lamina);
  const w = warnOf(lamina);
  assert.ok(w, 'avisada');
  assert.equal(w.shape, 'line'); assert.equal(w.length, s.length); assert.equal(w.width, s.width);
  assert.ok(Math.abs(w.yaw - Math.PI / 2) < 0.01, `no eixo x, não na diagonal do alvo (yaw ${w.yaw})`);
  assert.ok(Math.abs(zone.hazards[0].yaw - Math.PI / 2) < 1e-9, 'exatamente no eixo');
  run(s.warnMs + 100);
  assert.ok(Math.abs(lamina.z - 140) < 0.01, 'correu só no eixo');
  assert.ok(lamina.x - 124 > s.length - 1, `percorreu o trilho (foi até ${lamina.x.toFixed(2)})`);
  const hits = hitsOf(lamina, s.id);
  assert.ok(hits.some((h) => h.dst === alvo.eid), 'quem estava no trilho foi atropelado');
  assert.ok(!hits.some((h) => h.dst === fora.eid), 'quem estava fora do trilho, não');
});

test('Javali de Cinza: investe em linha contra quem está a 4–12 m, logo ao entrar em combate', () => {
  const { zone, mk, spawn, engage, run, warnOf, hitsOf } = setup('estrada_velha');
  const s = spec('ash_boar');
  const javali = spawn('ash_boar', 134, 58);
  const p = mk('breaker', 142, 58, 5);
  engage(javali, p);
  zone.tick(100);
  const w = warnOf(javali);
  assert.ok(w, 'avisada já no primeiro passo (firstMs 0)');
  assert.equal(w.shape, 'line'); assert.ok(Math.abs(w.yaw - Math.PI / 2) < 0.05);
  run(s.warnMs + 100);
  assert.ok(javali.x > 144, `investiu até o fim da linha (${javali.x.toFixed(1)})`);
  assert.ok(hitsOf(javali, s.id).some((h) => h.dst === p.eid));
  // colado (menos de 4 m): só o golpe comum
  javali.mech.readyAt = zone.now;
  p.char.x = javali.x + 1.5; p.char.z = javali.z;
  const antes = zone.hazards.length;
  zone.tick(100);
  assert.equal(zone.hazards.length, antes, 'perto demais para investir');
});

test('monstro enraizado durante o aviso não corre a investida: fica no lugar e só pega quem está colado', () => {
  const { zone, mk, spawn, engage, run, warnOf, hitsOf, sent } = setup('estrada_velha');
  const s = spec('ash_boar');
  const javali = spawn('ash_boar', 134, 58);
  const p = mk('breaker', 142, 58, 5);
  engage(javali, p);
  zone.tick(100);
  assert.ok(warnOf(javali), 'avisada');
  // Círculo de Fuligem (enraíza) no meio do aviso
  zone.addMonsterFx(javali, { kind: 'root', until: zone.now + 4000, by: p.char.id });
  const x0 = javali.x, z0 = javali.z;
  run(s.warnMs + 100, () => { p.char.hp = p.stats.maxHp; });
  assert.ok(Math.hypot(javali.x - x0, javali.z - z0) < 0.01, `enraizado não corre (andou até ${javali.x.toFixed(2)})`);
  assert.equal(hitsOf(javali, s.id).length, 0, 'quem estava a 8 m não foi atropelado');
  assert.ok(!sent.some((m) => m.t === 'mech' && m.kind === 'dash' && m.eid === javali.eid && Math.hypot(m.x1 - m.x0, m.z1 - m.z0) > 0.3), 'nenhuma corrida desenhada');
});

test('Lâmina de Esteira passeia e volta para casa pelos trilhos (um eixo de cada vez), não na diagonal', () => {
  const { zone, mk, spawn, engage } = setup('oficina_soterrada');
  const lamina = spawn('belt_blade', 124, 140);
  // quanto ela anda na diagonal: em cada passo, o deslocamento no eixo menor contra o do eixo maior (só a
  // esquina de um trilho para o outro, dentro de um passo, sai dos eixos; no passeio livre, ~40%)
  const diagonal = (ticks) => {
    let menor = 0, maior = 0, px = lamina.x, pz = lamina.z;
    for (let i = 0; i < ticks; i++) {
      zone.tick(100);
      const dx = Math.abs(lamina.x - px), dz = Math.abs(lamina.z - pz);
      menor += Math.min(dx, dz); maior += Math.max(dx, dz);
      px = lamina.x; pz = lamina.z;
    }
    return { andou: maior, fatia: menor / Math.max(maior, 1e-9) };
  };
  const passeio = diagonal(1500);
  assert.ok(passeio.andou > 5, `passeou (${passeio.andou.toFixed(1)} m)`);
  assert.ok(passeio.fatia < 0.05, `passeio nos eixos (${(passeio.fatia * 100).toFixed(1)}% na diagonal)`);
  // volta para casa (desistiu da luta) também pelos eixos
  const p = mk('breaker', 130, 146, 12);
  engage(lamina, p);
  lamina.x = 132; lamina.z = 147;
  zone.removePlayer(p.char.id, false);
  const volta = diagonal(150);
  assert.equal(lamina.state, 'idle', 'chegou em casa');
  assert.ok(volta.andou > 5 && volta.fatia < 0.05, `volta nos eixos (${volta.andou.toFixed(1)} m, ${(volta.fatia * 100).toFixed(1)}% na diagonal)`);
});

test('Morcego de Eco: o grito avisado desorienta (−25% de acerto e de velocidade, na interface) e a Alvorada tira', () => {
  const party = new Map();
  const { zone, mk, spawn, engage, ready, run, warnOf, sent } = setup('galerias_eco', (id) => party.get(id) ?? null);
  const s = spec('echo_bat');
  const bat = spawn('echo_bat', 60, 40);
  const p = mk('breaker', 62, 40, 13);
  const aurora = mk('dawnshield', 66, 44, 20);
  party.set(p.char.id, 'g'); party.set(aurora.char.id, 'g');
  engage(bat, p);
  const target = zone.monsterCombatStats(bat);
  const chance0 = playerAttack(p.stats, target, data, () => 0.99).hitChance;
  ready(bat);
  const w = warnOf(bat);
  assert.ok(w, 'avisado');
  assert.equal(w.shape, 'circle'); assert.equal(w.radius, s.radius); assert.equal(w.ms, s.warnMs);
  run(s.warnMs + 100, () => { p.char.hp = p.stats.maxHp; });
  const d = p.debuffs.find((x) => x.id === s.debuff.id);
  assert.ok(d, 'desorientado');
  assert.ok(sent.some((m) => m.t === 'debuff' && m.eid === p.eid && m.id === s.debuff.id && m.name === 'Desorientado' && /acerto/.test(m.text)));
  assert.equal(p.stats.moveSpeedPct, -25);
  assert.equal(p.stats.hitChancePct, -25);
  const chance1 = playerAttack(p.stats, target, data, () => 0.99).hitChance;
  assert.ok(Math.abs(chance0 - 25 - chance1) < 0.11, `acerto ${chance0}% → ${chance1}%`);
  assert.ok(!aurora.debuffs.length, 'quem estava fora do círculo não foi desorientado');
  const r = zone.castNow(aurora, 'daybreak', null, aurora.char.x, aurora.char.z, null);
  assert.equal(r.ok, true, r.reason);
  assert.ok(!p.debuffs.some((x) => x.id === s.debuff.id), 'a Alvorada tirou a desorientação');
  assert.equal(p.stats.moveSpeedPct, 0); assert.equal(p.stats.hitChancePct, 0);
  assert.ok(sent.some((m) => m.t === 'cleanse' && m.eid === p.eid && m.id === s.debuff.id));
});

test('Alvorada tira um efeito negativo por vez: o atordoamento primeiro, depois o que dura mais', () => {
  const { zone, mk } = setup('galerias_eco');
  const p = mk('breaker', 62, 40, 13);
  zone.addDebuff(p, spec('echo_bat').debuff);
  zone.addDebuff(p, spec('living_dredge').debuff);
  zone.stunPlayer(p, 1000);
  assert.equal(zone.cleansePlayer(p), true);
  assert.ok(!(p.stunUntil > zone.now), 'primeiro o atordoamento');
  assert.equal(p.debuffs.length, 2);
  assert.equal(zone.cleansePlayer(p), true);
  assert.deepEqual(p.debuffs.map((d) => d.id), ['mired'], 'depois o que tinha mais tempo (Desorientado, 4 s)');
});

test('Aranha de Conduto: o Fio Condutor cai onde a vítima está e atordoa pela regra da Vitalidade (na interface)', () => {
  const { zone, mk, spawn, engage, ready, run, warnOf, hitsOf, sent } = setup('galerias_eco');
  const s = spec('conduit_spider');
  const aranha = spawn('conduit_spider', 186, 124);
  const p = mk('emberweaver', 190, 124, 16);
  engage(aranha, p);
  ready(aranha);
  const w = warnOf(aranha);
  assert.ok(w, 'avisado');
  assert.equal(w.shape, 'circle'); assert.equal(w.radius, s.radius);
  assert.ok(Math.hypot(w.x - p.char.x, w.z - p.char.z) < 0.6, 'onde a vítima estava');
  run(s.warnMs + 100, () => { p.char.hp = p.stats.maxHp; });
  assert.ok(hitsOf(aranha, s.id).some((h) => h.dst === p.eid));
  const st = sent.find((m) => m.t === 'debuff' && m.eid === p.eid && m.id === 'stun');
  assert.ok(st, 'a interface mostra o atordoamento');
  assert.equal(st.ms, Math.round(s.stunMs * (1 - Math.min(50, p.stats.ccResistPct) / 100)), 'encurtado pela Vitalidade');
  assert.ok(p.stunUntil > zone.now - 100);
  // quem sai do círculo não é atordoado
  const q = mk('emberweaver', 190, 128, 16);
  engage(aranha, q);
  aranha.threat.set(q.char.id, 1e6);
  p.stunUntil = 0;
  aranha.mech.readyAt = zone.now;
  zone.tick(100);
  const w2 = warnOf(aranha);
  assert.notEqual(w2.id, w.id);
  zone.cmdMove(q, 190, 133);
  sent.length = 0;
  run(s.warnMs + 100);
  assert.ok(!sent.some((m) => m.t === 'debuff' && m.eid === q.eid && m.id === 'stun'));
});

test('Fragmento do Custódio: descarga em linha avisada que atordoa; patrulha mais longe de casa que os demais', () => {
  const { zone, mk, spawn, engage, ready, run, warnOf, hitsOf, sent } = setup('canais_eclusa');
  const s = spec('custodian_shard');
  const frag = spawn('custodian_shard', 172, 180);
  // parado sem ninguém por perto, passeia até patrolRadius de casa
  let max = 0;
  for (let i = 0; i < 1800; i++) { zone.tick(100); max = Math.max(max, Math.hypot(frag.x - frag.home.x, frag.z - frag.home.z)); }
  assert.ok(max > 4.5, `patrulha (afastou-se ${max.toFixed(1)} m de casa; os demais passeiam até 4 m)`);
  assert.ok(max <= s.patrolRadius + 1.5);
  frag.x = 172; frag.z = 180;
  const p = mk('bastion', 172, 184, 19);
  engage(frag, p);
  ready(frag);
  const w = warnOf(frag);
  assert.ok(w); assert.equal(w.shape, 'line'); assert.equal(w.length, s.length); assert.equal(w.width, s.width);
  run(s.warnMs + 100, () => { p.char.hp = p.stats.maxHp; });
  assert.ok(hitsOf(frag, s.id).some((h) => h.dst === p.eid));
  assert.ok(sent.some((m) => m.t === 'debuff' && m.eid === p.eid && m.id === 'stun'));
});

test('Selador da Porta Funda: o Selo avisado deixa quem ficou sem habilidades por 3 s (controle: Vitalidade encurta, imunidade anula)', () => {
  const { zone, mk, spawn, engage, ready, run, sent } = setup('cava_primeira');
  const s = spec('deep_sealer');
  const selador = spawn('deep_sealer', 202, 80);
  const p = mk('breaker', 204, 80, 24);
  engage(selador, p);
  ready(selador);
  sent.length = 0;
  run(s.warnMs + 100, () => { p.char.hp = p.stats.maxHp; });
  assert.ok(p.debuffs.some((d) => d.id === 'sealed' && d.silence));
  // o selo é controle: a Vitalidade encurta como no atordoamento
  const msg = sent.find((m) => m.t === 'debuff' && m.eid === p.eid && m.id === 'sealed');
  assert.equal(msg.ms, Math.round(s.debuff.durationMs * (1 - Math.min(50, p.stats.ccResistPct) / 100)));
  p.cooldowns = {}; p.gcdUntil = 0;
  const r = zone.castNow(p, 'deep_cut', selador.eid);
  assert.equal(r.ok, false); assert.equal(r.code, 'silenced');
  assert.match(r.reason, /Selado/);
  selador.mech.readyAt = 1e12; // sem novo selo
  run(s.debuff.durationMs, () => { p.char.hp = p.stats.maxHp; });
  p.cooldowns = {};
  assert.equal(zone.castNow(p, 'deep_cut', selador.eid).ok, true, 'o selo passou');
  // imune a controle (Égide Firme etc.): o selo não pega
  p.ccImmuneUntil = zone.now + 10000;
  assert.equal(zone.addDebuff(p, s.debuff, selador.eid), null);
  assert.ok(!p.debuffs.some((d) => d.id === 'sealed'));
});

test('Capataz Rachado: o Martelo de Turno, avisado 2 s antes, acerta só quem ficou no círculo', () => {
  const { zone, mk, spawn, engage, run, warnOf, hitsOf } = setup('estrada_velha');
  const s = spec('cracked_foreman');
  const cap = spawn('cracked_foreman', 44, 72);
  const dentro = mk('breaker', 46, 72, 5);
  const fora = mk('breaker', 44, 77, 5);
  engage(cap, dentro);
  run(s.firstMs + 100, () => { dentro.char.hp = dentro.stats.maxHp; });
  const w = warnOf(cap);
  assert.ok(w); assert.equal(w.ms, 2000); assert.equal(w.radius, s.radius);
  run(s.warnMs + 100, () => { dentro.char.hp = dentro.stats.maxHp; });
  assert.ok(hitsOf(cap, s.id).some((h) => h.dst === dentro.eid));
  assert.ok(!hitsOf(cap, s.id).some((h) => h.dst === fora.eid));
});

test('Rato-Engrenagem: enxame — +20% de dano por rato lutando a até 6 m (até +40%); sozinho, sem bônus', () => {
  const { zone, mk, spawn, engage } = setup('oficina_soterrada');
  const s = spec('gear_rat');
  const p = mk('breaker', 88, 62, 10);
  const q = mk('breaker', 120, 30, 10);
  const bando = [spawn('gear_rat', 89, 62), spawn('gear_rat', 89, 63.5), spawn('gear_rat', 87, 63)];
  const so = spawn('gear_rat', 121, 30);
  for (const r of bando) engage(r, p);
  engage(so, q);
  assert.deepEqual(meleeMods(zone, bando[0]), { damagePct: 2 * s.damagePctPerAlly, allies: 2 });
  assert.equal(meleeMods(zone, so), undefined);
  // golpe com a mesma rolagem: o do bando (dois outros ratos) bate 2 × damagePctPerAlly mais forte antes da defesa
  const roll = () => 0.2;
  const com = monsterAttack(bando[0].def, p.stats, data, roll, meleeMods(zone, bando[0]));
  const sem = monsterAttack(so.def, p.stats, data, roll);
  assert.equal(com.roll, Math.round(sem.roll * (1 + (2 * s.damagePctPerAlly) / 100)));
  // o bônus para em maxAllies
  for (let i = 0; i < 4; i++) engage(spawn('gear_rat', 88 + i * 0.6, 61), p);
  assert.equal(meleeMods(zone, bando[0]).damagePct, s.maxAllies * s.damagePctPerAlly);
});

test('Toupeira de Basalto: garras de pedra ignoram 25% da defesa', () => {
  const { zone, mk, spawn } = setup('cava_primeira');
  const p = mk('bastion', 184, 122, 24);
  const t = spawn('basalt_mole', 185, 122);
  const mods = meleeMods(zone, t);
  assert.deepEqual(mods, { defensePiercePct: data.monsters.basalt_mole.mechanic.defensePiercePct });
  const com = monsterAttack(t.def, p.stats, data, () => 0.2, mods);
  const sem = monsterAttack(t.def, p.stats, data, () => 0.2);
  assert.equal(com.targetDefense, Math.round(p.stats.defense * (1 - mods.defensePiercePct / 100)));
  assert.ok(com.damage > sem.damage, `${com.damage} > ${sem.damage}`);
});

test('Besouro-Brasa e Salamandra: passivos que mordem quem pisa no ninho (2,5 m); de longe, ficam quietos', () => {
  const { zone, mk, spawn } = setup('estrada_velha');
  const b = spawn('ember_beetle', 52, 32);
  b.wanderAt = 1e12;
  const p = mk('breaker', 56, 32, 2);
  for (let i = 0; i < 5; i++) zone.tick(100);
  assert.equal(b.targetId, null, 'a 4 m: nada');
  p.char.x = b.x + 2; p.char.z = b.z;
  zone.tick(100);
  assert.equal(b.targetId, p.eid, 'a 2 m: morde');
  // um passivo sem território não ataca nem colado
  const rato = spawn('furrow_rat', 44, 50);
  rato.wanderAt = 1e12;
  const q = mk('breaker', 45, 50, 2);
  for (let i = 0; i < 5; i++) zone.tick(100);
  assert.equal(rato.targetId, null);
  assert.equal(data.monsters.cistern_salamander.mechanic.kind, 'territorial');
  assert.equal(q.char.dead, false);
});

test('Bomba-Mestra Desregulada: pressão alta (+30% de dano) termina num vapor avisado; na baixa, defesa e resistência caem pela metade', () => {
  const { zone, mk, spawn, engage, run, warnOf, sent } = setup('brejo_bombas');
  const s = spec('master_pump');
  const bomba = spawn('master_pump', 121, 84);
  const p = mk('bastion', 123, 84, 9);
  engage(bomba, p);
  const vivo = () => { p.char.hp = p.stats.maxHp; };
  zone.tick(100);
  assert.ok(bomba.fx.some((f) => f.kind === 'pressure_high'), 'começa na alta (aparece no snapshot)');
  assert.ok(zone.snapshot().ents.find((e) => e.id === bomba.eid).fx.includes('pressure_high'));
  assert.deepEqual(meleeMods(zone, bomba), { damagePct: s.highDamagePct });
  const def0 = zone.monsterCombatStats(bomba).defense;
  run(s.highMs, vivo);
  const w = warnOf(bomba);
  assert.ok(w, 'o vapor é avisado');
  assert.equal(w.radius, s.vent.radius); assert.equal(w.ms, s.vent.warnMs);
  assert.ok(bomba.fx.some((f) => f.kind === 'pressure_low'));
  assert.equal(meleeMods(zone, bomba), undefined, 'na baixa, sem bônus de dano');
  assert.equal(zone.monsterCombatStats(bomba).defense, Math.round(bomba.def.defense * 0.5));
  assert.ok(def0 > zone.monsterCombatStats(bomba).defense);
  run(s.vent.warnMs + 100, vivo);
  assert.ok(sent.some((m) => m.t === 'hit' && m.src === bomba.eid && m.skill === s.vent.id && m.dst === p.eid), 'o vapor acertou quem ficou');
  run(s.lowMs, vivo);
  assert.ok(bomba.fx.some((f) => f.kind === 'pressure_high'), 'e volta para a alta');
});

test('monstro que sai da luta sem morrer pela regra (emboscada desfeita, câmara que recomeça) apaga o aviso e não solta o golpe', () => {
  const { zone, mk, spawn, engage, ready, run, warnOf, hitsOf, sent } = setup('oficina_soterrada');
  const s = spec('blind_welder');
  const p = mk('breaker', 142, 48, 11);
  // morto direto (sem killMonster), como a emboscada da escolta quando a carroça some
  const a = spawn('blind_welder', 140, 48);
  engage(a, p);
  ready(a);
  const wa = warnOf(a);
  assert.ok(wa, 'avisado');
  a.state = 'dead'; a.hp = 0; a.removeAt = zone.now;
  zone.tick(100);
  assert.ok(sent.some((m) => m.t === 'warn_cancel' && m.id === wa.id), 'o cliente apaga a marcação');
  assert.equal(a.windup, null);
  // tirado da zona no meio do aviso, como os monstros da câmara do chefe quando o encontro recomeça
  const b = spawn('blind_welder', 140, 48);
  engage(b, p);
  ready(b);
  const wb = warnOf(b);
  zone.monsters.delete(b.eid);
  run(s.warnMs + 100);
  assert.ok(sent.some((m) => m.t === 'warn_cancel' && m.id === wb.id));
  assert.equal(hitsOf(a, s.id).length + hitsOf(b, s.id).length, 0, 'nenhum cone saiu');
  assert.equal(zone.hazards.length, 0);
});

test('velocidade que muda por efeito negativo chega ao próprio cliente (a previsão do movimento acompanha)', () => {
  const party = new Map();
  const { zone, mk, run, sent } = setup('galerias_eco', (id) => party.get(id) ?? null);
  const p = mk('breaker', 62, 40, 13);
  const base = zone.moveSpeedOf(p);
  const speeds = () => sent.filter((m) => m.t === 'speed' && m._to === p.char.id).map((m) => m.moveSpeed);
  zone.addDebuff(p, spec('living_dredge').debuff);
  assert.deepEqual(speeds(), [Math.round(base * 0.6 * 100) / 100], 'atolado: −40%');
  assert.equal(zone.charView(p).stats.moveSpeed, speeds()[0], 'a ficha diz o mesmo');
  run(spec('living_dredge').debuff.durationMs + 100);
  assert.equal(speeds().at(-1), base, 'o atoleiro passou: volta ao normal');
  // a Alvorada tira o efeito: o cliente fica sabendo na hora
  zone.addDebuff(p, spec('echo_bat').debuff);
  const aurora = mk('dawnshield', 63, 41, 20);
  party.set(p.char.id, 'g'); party.set(aurora.char.id, 'g');
  assert.equal(zone.castNow(aurora, 'daybreak', null, aurora.char.x, aurora.char.z, null).ok, true);
  assert.equal(speeds().at(-1), base);
  // efeito sem mudança de velocidade (sanguessuga) não manda nada
  const n = speeds().length;
  zone.addDebuff(p, spec('boiling_leech').debuff);
  assert.equal(speeds().length, n);
});

test('mecânica não age em quem já caiu, e monstro que morre no meio do aviso não solta o golpe', () => {
  const { zone, mk, spawn, engage, ready, run, warnOf, hitsOf, sent } = setup('oficina_soterrada');
  const s = spec('blind_welder');
  const solda = spawn('blind_welder', 140, 48);
  const p = mk('breaker', 142, 48, 11);
  engage(solda, p);
  ready(solda);
  const w = warnOf(solda);
  zone.damageMonster(solda, p.char.id, solda.hp);
  assert.ok(sent.some((m) => m.t === 'warn_cancel' && m.id === w.id));
  run(s.warnMs + 100);
  assert.equal(hitsOf(solda, s.id).length, 0);
});
