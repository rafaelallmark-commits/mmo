// As habilidades dos níveis 1, 5 e 10 das oito classes, executadas numa zona real (sem rede).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGameData } from '../src/data.js';
import { Store } from '../src/store.js';
import { Zone } from '../src/zone.js';
import { makeRng } from '../src/rng.js';
import { splitKillXp } from '../src/rules.js';

const data = loadGameData();

function setup(partyOf = () => null) {
  const store = new Store(':memory:');
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
  const solo = splitKillXp(data.monsters.cracked_foreman, [{ charId: 1, level: 4, score: 300 }, { charId: 2, level: 4, score: 100 }], data);
  assert.equal(solo[0].xp, Math.round(212 * 0.75 * 1.1));
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
