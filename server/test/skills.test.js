// As habilidades dos níveis 1, 5 e 10 das oito classes, executadas numa zona real (sem rede).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGameData } from '../src/data.js';
import { createStore } from '../src/db.js';
import { Zone } from '../src/zone.js';
import { makeRng } from '../src/rng.js';
import { splitKillXp } from '../src/rules.js';

const data = loadGameData();

function setup(partyOf = () => null) {
  const store = createStore(':memory:');
  const acc = store.createAccount('t', 'senha');
  const sent = [];
  const zone = new Zone({ mapId: 'brejo_bombas', data, store, rng: makeRng(3), send: (charId, m) => sent.push({ ...m, _to: charId }), broadcast: (m) => sent.push(m), hooks: { partyIdOf: partyOf } });
  const mk = (classId, name, x, z) => {
    const cls = data.classes[classId];
    const id = store.createCharacter({ accountId: acc, name, classId, hp: 999, mp: 999, mapId: 'brejo_bombas', x, z, kit: cls.startingKit, slotFor: (d) => data.items[d].slot });
    const c = store.loadCharacter(id);
    c.level = 10; c.trialDone = true; c.quests = new Map();
    const p = zone.addPlayer(c);
    c.hp = p.stats.maxHp; c.mp = p.stats.maxMp;
    return p;
  };
  return { store, zone, mk, sent };
}

const toad = (zone) => [...zone.monsters.values()].filter((m) => m.defId === 'pump_toad');

test('as 24 habilidades dos níveis 1, 5 e 10 executam com o efeito esperado', () => {
  for (const [classId, cls] of Object.entries(data.classes)) {
    const party = new Map();
    const { zone, mk } = setup((id) => party.get(id) ?? null);
    const p = mk(classId, `T${classId.slice(0, 10)}`, 40, 36);
    const ally = mk('breaker', `A${classId.slice(0, 10)}`, 41, 37);
    party.set(p.char.id, 'g'); party.set(ally.char.id, 'g');
    for (const sid of cls.skills.slice(0, 3)) {
      const s = data.skills[sid];
      // aproxima os sapos do conjurador para formas de curto alcance
      const ms = toad(zone).filter((m) => m.state !== 'dead');
      ms.forEach((m, i) => { m.x = p.char.x + 1.5 + i * 0.3; m.z = p.char.z + (i % 2 ? 0.4 : -0.4); m.hp = m.def.hp; });
      const t = ms[0];
      p.cooldowns = {}; p.char.mp = p.stats.maxMp;
      ally.char.hp = Math.round(ally.stats.maxHp / 2);
      const res = zone.castNow(p, sid, t.eid, t.x, t.z, ally.eid);
      assert.equal(res.ok, true, `${cls.name} / ${s.name}: ${res.reason}`);
      const k = s.effect.kind;
      if (['strike', 'spell', 'cone_strike', 'line_strike', 'charge', 'pull', 'aoe_spell', 'debuff'].includes(k)) assert.ok(res.hits.length >= 1, `${s.name} atingiu alguém`);
      if (k === 'buff_self') assert.ok(p.buffs.some((b) => b.id === sid), `${s.name} aplicou reforço`);
      if (k === 'party_buff') assert.ok(ally.buffs.some((b) => b.id === sid), `${s.name} chegou ao aliado`);
      if (k === 'guard_ally') assert.ok(ally.guards.some((g) => g.guardianId === p.char.id), `${s.name} protege o aliado`);
      if (k === 'heal' || k === 'party_heal') assert.ok(ally.char.hp > ally.stats.maxHp / 2, `${s.name} curou`);
      if (k === 'shield_ally') assert.ok(ally.shield?.amount > 0, `${s.name} deu escudo`);
      if (k === 'ground_aoe') { zone.tick(100); assert.equal(zone.groundEffects.length, 1, `${s.name} criou área`); zone.groundEffects = []; }
      if (k === 'debuff') assert.ok(zone.monsterFx(t, 'mark'), 'marca aplicada');
      if (k === 'pull') assert.ok([...zone.monsters.values()].filter((m) => m.targetId === p.eid).length >= 3, 'Pulso de Atração prende 3 monstros');
    }
  }
});

test('Pulso de Atração que mata o monstro não o devolve à perseguição (sem monstro de vida 0 imortal)', () => {
  const { zone, mk, sent } = setup();
  const p = mk('bastion', 'Tpuxa', 40, 36);
  p.char.skills.pull_pulse = 1;
  // só dois sapos no raio do pulso: um com 1 de vida (o golpe o mata) e outro inteiro
  for (const m of zone.monsters.values()) if (Math.hypot(m.x - p.char.x, m.z - p.char.z) < 12) { m.x = p.char.x + 30; m.z = p.char.z + 30; }
  const ms = toad(zone).filter((m) => m.state !== 'dead').slice(0, 2);
  ms.forEach((m, i) => { m.x = p.char.x + 2 + i; m.z = p.char.z; m.hp = m.def.hp * (i ? 20 : 1); });
  ms[0].hp = 1;
  // golpe físico pode errar: repete o pulso até acertar o de 1 de vida
  for (let i = 0; i < 20 && ms[0].state !== 'dead'; i++) {
    p.cooldowns = {}; p.char.mp = p.stats.maxMp; p.char.hp = p.stats.maxHp;
    const res = zone.castNow(p, 'pull_pulse', ms[0].eid);
    assert.equal(res.ok, true, res.reason);
  }
  assert.equal(ms[0].state, 'dead', 'o abatido continua morto');
  assert.equal(ms[0].targetId, null, 'e sem alvo');
  assert.ok(sent.some((m) => m.t === 'death' && m.eid === ms[0].eid), 'a morte foi anunciada');
  assert.equal(ms[1].state, 'chase', 'o outro foi puxado e persegue');
  assert.equal(ms[1].targetId, p.eid);
  for (let i = 0; i < 30; i++) zone.tick(100);
  assert.ok(!sent.some((m) => m.t === 'hit' && m.src === ms[0].eid), 'o morto nunca ataca');
});

test('golpe de monstro bloqueado pelo escudo na zona: "errou" com block, sem dano e sem contar como golpe recebido', () => {
  const { zone, mk, sent } = setup();
  const p = mk('bastion', 'Tescudo', 40, 36);
  assert.equal(p.stats.blockPct, data.items.shield_t1.blockPct, 'o Bastião começa com escudo');
  const m = toad(zone).find((x) => x.state !== 'dead');
  m.x = p.char.x + 1; m.z = p.char.z; m.state = 'chase'; m.targetId = p.eid; m.threat.set(p.char.id, 100); m.nextAttackAt = 0;
  // toda rolagem 0: o golpe acerta (0 < chance de acerto) e é bloqueado (0 < chance de bloqueio)
  zone.rng = () => 0;
  const hp0 = p.char.hp;
  zone.tick(100);
  const h = sent.find((x) => x.t === 'hit' && x.src === m.eid && x.dst === p.eid);
  assert.ok(h, 'o sapo bateu');
  assert.equal(h.block, true); assert.equal(h.miss, true); assert.equal(h.dmg, 0);
  assert.equal(p.char.hp, hp0, 'bloqueado não tira vida');
  assert.equal(p.lastHitAt, undefined, 'nem conta como golpe recebido (não interromperia uma canalização)');
  // sem escudo, a mesma rolagem acerta e tira vida
  const w = mk('breaker', 'Tsemescudo', 44, 36);
  assert.equal(w.stats.blockPct, 0);
  const m2 = toad(zone).find((x) => x.state !== 'dead' && x !== m);
  m2.x = w.char.x + 1; m2.z = w.char.z; m2.state = 'chase'; m2.targetId = w.eid; m2.threat.set(w.char.id, 100); m2.nextAttackAt = 0;
  const hpw = w.char.hp;
  zone.tick(100);
  const h2 = sent.find((x) => x.t === 'hit' && x.src === m2.eid && x.dst === w.eid);
  assert.ok(h2 && !h2.miss && h2.block === undefined && h2.dmg > 0, 'golpe comum');
  assert.equal(w.char.hp, hpw - h2.dmg);
});

test('ficha antiga com habilidade que os dados passaram para um nível acima: sai da ficha e os graus comprados voltam (Luz Compartilhada, do 5 para o 15)', () => {
  const store = createStore(':memory:');
  const acc = store.createAccount('t', 'senha');
  const zone = new Zone({ mapId: 'brejo_bombas', data, store, rng: makeRng(3), send: () => {}, broadcast: () => {} });
  const cls = data.classes.veilsinger;
  const id = store.createCharacter({ accountId: acc, name: 'Antiga', classId: 'veilsinger', hp: 99, mp: 99, mapId: 'brejo_bombas', x: 40, z: 36, kit: cls.startingKit, slotFor: (d) => data.items[d].slot });
  const c = store.loadCharacter(id);
  assert.ok(data.skills.shared_light.unlockLevel > 8 && data.skills.clear_note.unlockLevel <= 8, 'Luz Compartilhada acima do 8 e Nota Clara até o 8');
  // gravada antes da troca, no nível 8: Canto de Amparo grau 2 e Luz Compartilhada grau 3 (3 pontos gastos)
  const total = 7 * data.skillPointsPerLevel;
  c.level = 8; c.quests = new Map(); c.skills = { sustain_chant: 2, shared_light: 3 }; c.skillPoints = total - 3;
  const p = zone.addPlayer(c);
  assert.equal(c.skills.shared_light, undefined, 'a Luz Compartilhada saiu da ficha');
  assert.equal(c.skills.clear_note, data.skillRules.unlockGivesRank, 'a Nota Clara, que agora é do nível 5, foi liberada');
  assert.equal(c.skills.sustain_chant, 2, 'o resto fica como estava');
  assert.equal(c.skillPoints, total - 1, 'os 2 graus comprados na Luz Compartilhada voltaram');
  const r = zone.castNow(p, 'shared_light');
  assert.equal(r.ok, false); assert.equal(r.code, 'not_learned');
  // outra entrada (troca de zona, novo login): nada muda de novo
  assert.equal(zone.grantUnlockedSkills(c), false);
  assert.equal(c.skillPoints, total - 1);
  // no nível 15 ela volta liberada (grau de desbloqueio), como para qualquer personagem
  c.level = 15; zone.grantUnlockedSkills(c);
  assert.equal(c.skills.shared_light, data.skillRules.unlockGivesRank);
});

test('habilidade do nível 10 só existe depois da prova de classe', () => {
  const { zone, mk } = setup();
  const p = mk('breaker', 'Semprova', 40, 36);
  p.char.trialDone = false; delete p.char.skills.rupture;
  zone.grantUnlockedSkills(p.char);
  assert.equal(p.char.skills.rupture, undefined);
  assert.equal(zone.cmdCast(p, 'rupture', null).reason, 'Ruptura é liberada pela prova de classe.');
  p.char.trialDone = true; zone.grantUnlockedSkills(p.char);
  assert.equal(p.char.skills.rupture, 1);
});

test('Reforço de Campo redireciona dano ao Bastião e conta como proteção', () => {
  const party = new Map();
  const { zone, mk } = setup((id) => party.get(id) ?? null);
  const b = mk('bastion', 'Bastiao', 40, 36);
  const w = mk('emberweaver', 'Tecelao', 41, 36);
  party.set(b.char.id, 'g'); party.set(w.char.id, 'g');
  assert.equal(zone.cmdCast(b, 'field_reinforcement').ok, true);
  const m = toad(zone)[0];
  const bHp = b.char.hp, wHp = w.char.hp;
  zone.damagePlayer(w, 100, m);
  assert.equal(Math.round(bHp - b.char.hp), 20);
  assert.equal(Math.round(wHp - w.char.hp), 80);
  assert.ok((m.score.get(b.char.id) || 0) > 0, 'Bastião recebe participação sem causar dano');
});

test('XP de grupo: membros próximos recebem mesmo sem dano; metade igual, metade por participação', () => {
  const m = data.monsters.boiling_leech; // nv9, 153 XP
  const r = splitKillXp(m, [
    { charId: 1, level: 9, score: 300, partyId: 'g' },
    { charId: 2, level: 9, score: 100, partyId: 'g' },
    { charId: 3, level: 9, score: 0, partyId: 'g' },
  ], data);
  const coop = 1.2;
  assert.equal(r.find((x) => x.charId === 3).xp, Math.round(153 * coop * (0.5 / 3)));
  assert.equal(r.find((x) => x.charId === 1).xp, Math.round(153 * coop * (0.5 / 3 + 0.5 * 0.75)));
  assert.ok(r.every((x) => x.lootEligible));
  // sem grupo, comportamento do M1
  const foreman = data.monsters.cracked_foreman;
  const solo = splitKillXp(foreman, [{ charId: 1, level: 4, score: 300 }, { charId: 2, level: 4, score: 100 }], data);
  assert.equal(solo[0].xp, Math.round(foreman.xp * 0.75 * 1.1));
});

test('as 16 habilidades dos níveis 15 e 20 executam com o efeito esperado', () => {
  for (const [classId, cls] of Object.entries(data.classes)) {
    const party = new Map();
    const { zone, mk, sent } = setup((id) => party.get(id) ?? null);
    const p = mk(classId, `Q${classId.slice(0, 10)}`, 40, 36);
    const ally = mk('breaker', `B${classId.slice(0, 10)}`, 41, 37);
    party.set(p.char.id, 'g'); party.set(ally.char.id, 'g');
    p.char.level = 20; zone.recalc(p);
    for (const sid of cls.skills.slice(3, 5)) {
      const s = data.skills[sid];
      p.char.skills[sid] = 1;
      const ms = toad(zone).filter((m) => m.state !== 'dead');
      ms.forEach((m, i) => { m.x = p.char.x + 1.5 + i * 0.3; m.z = p.char.z + (i % 2 ? 0.4 : -0.4); m.hp = m.def.hp * 20; m.fx = []; });
      const t = ms[0];
      p.cooldowns = {}; p.char.mp = p.stats.maxMp; p.shield = null;
      const k = s.effect.kind;
      if (k === 'resurrect') { ally.char.dead = true; ally.char.hp = 0; }
      if (s.effect.guaranteedCritIfMarked) zone.addMonsterFx(t, { kind: 'mark', until: zone.now + 5000, physDamageTakenPct: 0, by: p.char.id });
      const hpBefore = t.hp;
      const res = zone.castNow(p, sid, t.eid, t.x, t.z, ally.eid);
      assert.equal(res.ok, true, `${cls.name} / ${s.name}: ${res.reason}`);
      if (['strike', 'spell', 'cone_strike', 'line_strike', 'aoe_strike'].includes(k)) assert.ok(res.hits.length >= 1, `${s.name} atingiu alguém`);
      if (s.effect.hits) assert.ok(res.hits.filter((e) => e === t.eid).length >= 2, `${s.name} golpeia ${s.effect.hits} vezes`);
      if (s.effect.stunMs || s.effect.knockdownMs) assert.ok(zone.monsterFx(t, 'stun') || t.hp === hpBefore, `${s.name} atordoa`);
      if (k === 'shield_self') assert.ok(p.shield?.amount > 0, `${s.name} deu escudo`);
      if (k === 'taunt_area') { assert.ok(ms.slice(0, 3).every((m) => m.targetId === p.eid), `${s.name} provoca todos`); assert.ok(zone.buffMod(p, 'damageTakenDownPct') > 0, 'reduz dano recebido'); }
      if (k === 'buff_self') assert.ok(p.buffs.some((b) => b.id === sid), `${s.name} aplicou reforço`);
      if (k === 'dash') assert.ok(zone.buffMod(p, 'evasion') > 0, `${s.name} dá esquiva`);
      if (k === 'party_heal') assert.ok(ally.char.hp > 0);
      if (k === 'resurrect') assert.equal(ally.char.dead, false, `${s.name} levanta o aliado`);
      if (k === 'aura_damage' || k === 'delayed_aoe') {
        const before = t.hp;
        for (let i = 0; i < 40; i++) zone.tick(100);
        assert.ok(t.hp < before, `${s.name} causou dano na área`);
        zone.groundEffects = [];
      }
      if (s.effect.guaranteedCritIfMarked) {
        // com marca, o golpe sempre é crítico (pode errar, então repete)
        let landed = 0, crits = 0;
        for (let i = 0; i < 12; i++) {
          p.cooldowns = {}; p.char.mp = p.stats.maxMp; t.hp = t.def.hp * 20;
          zone.addMonsterFx(t, { kind: 'mark', until: zone.now + 5000, physDamageTakenPct: 0, by: p.char.id });
          sent.length = 0;
          zone.castNow(p, sid, t.eid);
          const h = sent.find((m) => m.t === 'hit' && m.dst === t.eid && m.skill === sid);
          if (h && !h.miss) { landed++; if (h.crit) crits++; }
        }
        assert.ok(landed > 0 && crits === landed, `${s.name}: ${crits}/${landed} críticos em alvo marcado`);
      }
    }
  }
});

test('recarga global entre habilidades e tempo de conjuração (parado; mover interrompe; alvo conferido no fim)', () => {
  const party = new Map();
  const { zone, mk, sent } = setup((id) => party.get(id) ?? null);
  const gcd = data.formulas.skills?.globalCooldownMs ?? 1000;
  // recarga global: duas habilidades diferentes em seguida
  const b = mk('breaker', 'Tgcd', 40, 36);
  b.char.skills.momentum = 1;
  const ms = toad(zone).filter((m) => m.state !== 'dead');
  ms.forEach((m, i) => { m.x = b.char.x + 1.5 + i * 0.3; m.z = b.char.z; m.hp = m.def.hp * 20; });
  let r = zone.cmdCast(b, 'deep_cut', ms[0].eid);
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.gcdMs, gcd);
  r = zone.cmdCast(b, 'momentum', ms[0].eid);
  assert.equal(r.code, 'gcd', 'segunda habilidade espera a recarga global');
  for (let i = 0; i < gcd / 100 + 1; i++) zone.tick(100);
  r = zone.cmdCast(b, 'momentum', ms[0].eid);
  assert.equal(r.ok, true, r.reason);

  // tempo de conjuração: Tiro do Espinhal (1 s) só sai no fim, e mover-se interrompe
  const w = mk('warden', 'Tcast', 40, 40);
  w.char.level = 20; w.char.skills.spinal_shot = 1; zone.recalc(w); w.char.mp = w.stats.maxMp;
  const s = data.skills.spinal_shot;
  const t = ms[1];
  t.x = w.char.x + 6; t.z = w.char.z; t.hp = t.def.hp * 20;
  const hp0 = t.hp;
  r = zone.cmdCast(w, 'spinal_shot', t.eid);
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.casting.ms, s.castMs);
  assert.equal(t.hp, hp0, 'nada sai antes do fim da conjuração');
  for (let i = 0; i < s.castMs / 100 + 1; i++) zone.tick(100);
  const end = sent.filter((m) => m.t === 'cast_end').pop();
  assert.equal(end?.ok, true, end?.reason);
  assert.ok(sent.some((m) => m.t === 'hit' && m.src === w.eid && m.skill === 'spinal_shot'), 'o tiro saiu no fim');
  // de novo, mas andando no meio: interrompe, sem gastar mana nem recarga
  w.cooldowns = {}; w.gcdUntil = 0; w.char.mp = w.stats.maxMp;
  const mp0 = w.char.mp;
  r = zone.cmdCast(w, 'spinal_shot', t.eid);
  assert.equal(r.ok, true, r.reason);
  zone.tick(100);
  zone.cmdMove(w, w.char.x - 3, w.char.z);
  const cut = sent.filter((m) => m.t === 'cast_end').pop();
  assert.equal(cut.ok, false);
  assert.match(cut.reason, /moveu/);
  assert.equal(w.char.mp, mp0, 'interrompida não gasta mana');
  assert.ok(!(w.cooldowns.spinal_shot > zone.now), 'interrompida não entra em recarga');
});

test('Rajada Cortante: 3 azagaias em leque, cada uma no primeiro monstro do caminho', () => {
  const { zone, mk, sent } = setup();
  const p = mk('windwalker', 'Tleque', 40, 36);
  p.char.level = 15; p.char.skills.cutting_gust = 1; zone.recalc(p); p.char.mp = p.stats.maxMp;
  const ms = toad(zone).filter((m) => m.state !== 'dead').slice(0, 4);
  // três sapos em leque a 6 m (−30°, 0°, +30°) e um quarto atrás do do meio
  const ang = [-Math.PI / 6, 0, Math.PI / 6];
  ms.forEach((m, i) => { const a = ang[i] ?? 0; const r = i < 3 ? 6 : 9; m.x = p.char.x + Math.cos(a) * r; m.z = p.char.z + Math.sin(a) * r; m.hp = m.def.hp * 20; m.state = 'idle'; });
  sent.length = 0;
  const res = zone.castNow(p, 'cutting_gust', ms[1].eid);
  assert.equal(res.ok, true, res.reason);
  const hits = sent.filter((m) => m.t === 'hit' && m.skill === 'cutting_gust').map((m) => m.dst);
  assert.equal(hits.length, 3, `3 azagaias (${hits.length})`);
  for (const m of ms.slice(0, 3)) assert.ok(hits.includes(m.eid), 'cada uma num sapo do leque');
  assert.ok(!hits.includes(ms[3].eid), 'o de trás fica protegido pelo da frente');
});

test('outra habilidade no meio da conjuração cancela a anterior e sai na hora', () => {
  const { zone, mk, sent } = setup();
  const w = mk('warden', 'Ttroca', 40, 40);
  w.char.level = 20; w.char.skills.spinal_shot = 1; w.char.skills.passage_arrow = 1; zone.recalc(w); w.char.mp = w.stats.maxMp;
  const t = toad(zone).find((m) => m.state !== 'dead');
  t.x = w.char.x + 6; t.z = w.char.z; t.hp = t.def.hp * 20;
  let r = zone.cmdCast(w, 'spinal_shot', t.eid);
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.gcdMs, Math.max(data.formulas.skills.globalCooldownMs, data.skills.spinal_shot.castMs));
  zone.tick(100);
  r = zone.cmdCast(w, 'passage_arrow', t.eid);
  assert.equal(r.ok, true, `a segunda sai sem esperar: ${r.reason}`);
  assert.ok(sent.some((m) => m.t === 'cast_end' && m.ok === false && m.skill === 'spinal_shot'), 'a primeira foi cancelada');
  assert.equal(w.casting, null);
});

test('controle em jogador: Vitalidade encurta o atordoamento, imunidade anula, Alvorada tira; Fenda Sísmica só derruba normais', () => {
  const party = new Map();
  const { zone, mk, sent } = setup((id) => party.get(id) ?? null);
  const fraco = mk('emberweaver', 'Fraco', 40, 36);
  const forte = mk('bastion', 'Forte', 41, 36);
  // Vitalidade: ccResistPct = min(50, vit × 0,5)
  fraco.stats.ccResistPct = 0;
  forte.stats.ccResistPct = 40;
  assert.equal(zone.stunPlayer(fraco, 1000), 1000);
  assert.equal(zone.stunPlayer(forte, 1000), 600, '40% de resistência: 600 ms');
  forte.stats.ccResistPct = 90;
  forte.stunUntil = 0;
  assert.equal(zone.stunPlayer(forte, 1000), 500, 'a resistência para em 50%');
  fraco.stunUntil = 0;
  fraco.ccImmuneUntil = zone.now + 5000;
  assert.equal(zone.stunPlayer(fraco, 1000), 0, 'imune: não atordoa');
  // Alvorada (Escudeiro da Aurora, nível 20) tira o atordoamento dos aliados
  const aurora = mk('dawnshield', 'Aurora', 40, 37);
  party.set(aurora.char.id, 'g'); party.set(forte.char.id, 'g');
  aurora.char.level = 20; aurora.char.skills.daybreak = 1;
  forte.stunUntil = zone.now + 1000;
  aurora.cooldowns = {}; aurora.char.mp = aurora.stats.maxMp;
  const r = zone.castNow(aurora, 'daybreak', null, aurora.char.x, aurora.char.z, null);
  assert.equal(r.ok, true, r.reason);
  assert.ok(!(forte.stunUntil > zone.now), 'Alvorada tirou o atordoamento do aliado');
  // Fenda Sísmica: derruba o normal, não a elite
  const q = mk('breaker', 'Quebra', 30, 36);
  q.char.level = 20; q.char.skills.seismic_rift = 1;
  const [normal] = toad(zone).filter((m) => m.state !== 'dead');
  const elite = zone.spawnMonster({ monster: 'echo_mother', x: 33, z: 36.6, radius: 0 }, { noRespawn: true });
  normal.x = 32; normal.z = 36; normal.hp = normal.def.hp * 50; elite.hp = elite.def.hp;
  normal.state = 'chase'; elite.state = 'chase';
  // repete até a fenda acertar os dois (a precisão é rolada), conferindo a derrubada a cada acerto
  let normalHit = false, eliteHit = false;
  for (let i = 0; i < 40 && !(normalHit && eliteHit); i++) {
    q.cooldowns = {}; q.char.mp = q.stats.maxMp; q.gcdUntil = 0; q.char.x = 30; q.char.z = 36;
    normal.fx = []; elite.fx = []; sent.length = 0;
    normal.x = 32; normal.z = 36; elite.x = 33; elite.z = 36.6;
    const f = zone.castNow(q, 'seismic_rift', normal.eid, 34, 36, null);
    assert.equal(f.ok, true, f.reason);
    if (sent.some((m) => m.t === 'hit' && m.dst === normal.eid && !m.miss)) { normalHit = true; assert.ok(zone.monsterFx(normal, 'stun'), 'monstro normal derrubado'); }
    if (sent.some((m) => m.t === 'hit' && m.dst === elite.eid && !m.miss)) { eliteHit = true; assert.ok(!zone.monsterFx(elite, 'stun'), 'elite não é derrubada'); }
    normal.hp = normal.def.hp * 50; elite.hp = elite.def.hp;
  }
  assert.ok(normalHit && eliteHit, 'a fenda acertou os dois ao menos uma vez');
});
