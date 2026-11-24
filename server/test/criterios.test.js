// Critérios de aceitação do Marco 2 que não tinham teste (docs/05-arquitetura.md, Marco 2):
// - "Cada classe equipa uma arma de faixa 9" — antes só o Vigia e o Quebraferro eram conferidos;
// - "A Cantora reduz o consumo de tônicos do grupo em ≥ 40%" — um grupo de robôs luta as mesmas ondas
//   com a Cantora e com outra classe no lugar dela, na mesma semente, e conta os tônicos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { GameServer } from '../src/server.js';
import { loadGameData } from '../src/data.js';
import { createStore } from '../src/db.js';
import { Zone } from '../src/zone.js';
import { makeRng } from '../src/rng.js';
import { SimClient } from './helpers/client.js';

const data = loadGameData();
const log = (...a) => console.log('   ·', ...a);

// arma de faixa 9 da família do kit inicial da classe
function tier9Weapon(classId) {
  const kit = data.classes[classId].startingKit.equip.map((id) => data.items[id]).find((d) => d?.slot === 'weapon');
  const fam = kit?.family;
  return Object.values(data.items).find((d) => d.kind === 'weapon' && d.level === 9 && d.family === fam && (d.rarity ?? 'common') === 'common' && (!d.classes || d.classes.includes(classId)));
}

test('M2 — cada uma das 8 classes equipa uma arma de faixa 9 (recusada antes dos pontos, com o valor atual e o exigido)', { timeout: 120000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cinzas-crit-'));
  const server = new GameServer({ port: 0, host: '127.0.0.1', dbPath: join(dir, 'c.db'), seed: 21, log: false, dev: true });
  const port = await server.start();
  try {
    for (const classId of Object.keys(data.classes)) {
      const w = tier9Weapon(classId);
      assert.ok(w, `${classId}: existe arma de faixa 9 da família do kit`);
      const c = new SimClient(classId);
      await c.connect(`ws://127.0.0.1:${port}`);
      await c.request('register', { account: `crit_${classId}`, password: 'senha123' });
      await c.request('login', { account: `crit_${classId}`, password: 'senha123' });
      const { char } = await c.request('create_char', { name: `Crit${classId.slice(0, 8)}`, classId });
      await c.request('enter', { charId: char.id });
      await c.request('gm', { cmd: 'xp', level: 9 });
      const g = await c.request('gm', { cmd: 'give', defId: w.id });
      let r = await c.request('equip', { instance: g.instanceId });
      let refused = false;
      if (!r.ok) {
        refused = true;
        // a recusa diz o valor exigido e o atual de cada atributo que falta
        for (const reason of r.reasons ?? [r.reason]) assert.match(reason, /exigid[oa]\. (Seu|Sua) .* atual é \d+\./, `${classId}: ${reason}`);
        const perm = c.char.permanent ?? {};
        const points = {};
        for (const [a, need] of Object.entries(w.req ?? {})) if ((perm[a] ?? 0) < need) points[a] = need - (perm[a] ?? 0);
        const al = await c.request('allocate', { points });
        assert.equal(al.ok, true, `${classId}: distribuir ${JSON.stringify(points)} — ${al.reason}`);
        r = await c.request('equip', { instance: g.instanceId });
      }
      assert.equal(r.ok, true, `${classId}: equipa ${w.name} — ${r.reason ?? JSON.stringify(r.reasons)}`);
      log(`${data.classes[classId].name}: ${w.name} — ${refused ? 'recusa antes; equipa depois de distribuir os pontos' : 'equipa com os pontos iniciais'}`);
      await c.close();
    }
  } finally { await server.stop(); rmSync(dir, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------- Cantora e tônicos
// Grupo de nível 10 (kits iniciais) contra ondas de 4 Autômatos Escavadores (nível 9, agressivos). Robôs:
// o Bastião segura (Pulso de Atração, Placa Dinâmica, Reforço de Campo); os demais batem no alvo dele e
// usam as habilidades de dano; todos bebem Tônico Médio abaixo de 40% da vida. A Cantora cura quem
// passar de 30% de vida perdida (Canto de Sustento) e põe o Selo do Véu no Bastião.
function runParty(classes, seed) {
  const store = createStore(':memory:');
  const acc = store.createAccount('grupo', 'senha');
  const party = new Set();
  const zone = new Zone({ mapId: 'brejo_bombas', data, store, rng: makeRng(seed), send: () => {}, broadcast: () => {}, hooks: { partyIdOf: (id) => (party.has(id) ? 'g' : null) } });
  for (const m of [...zone.monsters.values()]) zone.monsters.delete(m.eid);
  const players = classes.map((classId, i) => {
    const cls = data.classes[classId];
    const id = store.createCharacter({ accountId: acc, name: `G${i}${classId.slice(0, 6)}`, classId, hp: 999, mp: 999, mapId: 'brejo_bombas', x: 100 + i * 1.5, z: 50, kit: cls.startingKit, slotFor: (d) => data.items[d].slot });
    const c = store.loadCharacter(id);
    c.level = 10; c.trialDone = true; c.quests = new Map();
    party.add(c.id);
    const p = zone.addPlayer(c);
    c.hp = p.stats.maxHp; c.mp = p.stats.maxMp;
    const it = { id: randomUUID(), defId: 'potion_hp_m', qty: 500, enh: 0, loc: 'bag', slot: null };
    store.insertItem({ ...it, charId: c.id, source: 'teste' });
    c.items.set(it.id, it);
    p.potionId = it.id;
    return p;
  });
  const tank = players[0];
  let potions = 0, deaths = 0, kills = 0;
  const alive = () => [...zone.monsters.values()].filter((m) => m.state !== 'dead');
  const tryCast = (p, sid, target, ally) => {
    if (!p.char.skills[sid]) return false;
    const r = zone.castNow(p, sid, target?.eid ?? null, target?.x ?? p.char.x, target?.z ?? p.char.z, ally?.eid ?? null);
    return r.ok;
  };
  for (let wave = 0; wave < 12; wave++) {
    for (let k = 0; k < 4; k++) {
      const m = zone.spawnMonster({ monster: 'digger_automaton', x: 106 + k, z: 47 + k * 1.5, radius: 0 }, { noRespawn: true });
      m.state = 'chase'; m.targetId = tank.eid; m.threat.set(tank.char.id, 5);
    }
    for (let step = 0; step < 900 && alive().length; step++) {
      for (const p of players) {
        const c = p.char;
        if (c.dead) continue;
        if (c.hp < p.stats.maxHp * 0.4 && zone.cmdUseItem(p, p.potionId).ok) potions++;
        const ms = alive();
        const target = ms.find((m) => m.eid === tank.targetId) ?? ms[0];
        if (!target) break;
        if (c.classId === 'veilsinger') {
          const hurt = players.filter((a) => !a.char.dead).sort((a, b) => a.char.hp / a.stats.maxHp - b.char.hp / b.stats.maxHp)[0];
          if (hurt && hurt.char.hp < hurt.stats.maxHp * 0.7 && tryCast(p, 'sustain_chant', null, hurt)) continue;
          if (!tank.char.dead && !tank.shield && tank.char.hp < tank.stats.maxHp * 0.85 && tryCast(p, 'veil_seal', null, tank)) continue;
        }
        if (p === tank) {
          if (ms.filter((m) => m.targetId !== tank.eid).length && tryCast(p, 'pull_pulse', null, null)) continue;
          if (tryCast(p, 'dynamic_plate', null, null) || tryCast(p, 'field_reinforcement', null, null)) continue;
        } else if (c.classId !== 'veilsinger') {
          const dmg = data.classes[c.classId].skills.filter((sid) => ['strike', 'spell', 'cone_strike', 'line_strike', 'aoe_spell', 'ground_aoe', 'debuff'].includes(data.skills[sid].effect.kind));
          if (dmg.some((sid) => tryCast(p, sid, target, null))) continue;
        }
        if (p.targetId !== target.eid) zone.cmdAttack(p, target.eid);
      }
      zone.tick(100);
      for (const p of players) if (p.char.dead && !p.countedDead) { p.countedDead = true; deaths++; }
    }
    kills += 4 - alive().length;
    // entre ondas: quem caiu volta com metade da vida; todos recuperam a mana (o teste mede a vida)
    for (const p of players) {
      if (p.char.dead) { p.char.dead = false; p.char.hp = Math.round(p.stats.maxHp * 0.5); p.countedDead = false; }
      p.char.mp = p.stats.maxMp;
    }
    for (const m of [...zone.monsters.values()]) zone.monsters.delete(m.eid);
    zone.tick(2000);
  }
  return { potions, deaths, kills };
}

test('M2 — a Cantora reduz o consumo de tônicos do grupo em pelo menos 40%', { timeout: 120000 }, () => {
  let com = { potions: 0, deaths: 0, kills: 0 }, sem = { potions: 0, deaths: 0, kills: 0 };
  for (const seed of [3, 7, 11]) {
    const a = runParty(['bastion', 'breaker', 'emberweaver', 'veilsinger'], seed);
    const b = runParty(['bastion', 'breaker', 'emberweaver', 'warden'], seed);
    for (const k of Object.keys(com)) { com[k] += a[k]; sem[k] += b[k]; }
  }
  const cut = 1 - com.potions / Math.max(1, sem.potions);
  log(`36 ondas de 4 Autômatos Escavadores: com a Cantora ${com.potions} tônicos (${com.deaths} quedas, ${com.kills} abates); com um Vigia no lugar ${sem.potions} tônicos (${sem.deaths} quedas, ${sem.kills} abates); redução de ${Math.round(cut * 100)}%`);
  assert.ok(sem.potions >= 20, 'as ondas exigem tônicos sem a Cantora (o cenário mede algo)');
  assert.ok(com.kills >= sem.kills * 0.9, 'o grupo com a Cantora também vence as ondas');
  assert.ok(cut >= 0.4, `a Cantora reduz os tônicos em ≥ 40% (foi ${Math.round(cut * 100)}%)`);
});
