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
  const zone = new Zone({ mapId: 'brejo_bombas', data, store, rng: makeRng(3), send: () => {}, broadcast: (m) => sent.push(m), hooks: { partyIdOf: partyOf } });
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
      const res = zone.cmdCast(p, sid, t.eid, t.x, t.z, ally.eid);
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
