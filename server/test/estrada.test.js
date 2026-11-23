// Estrada segura (D164): todo personagem nasce no Posto da Ponte, na ponta oeste da Estrada Velha, e quem é
// do Vau de Nácar atravessa a estrada inteira (137 m) no nível 2 para a missão 1.3. Nenhum bando agressivo
// alcança o caminho: conferido no pior caso (raio do bando + passeio + agressão) e andando com a zona rodando.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGameData } from '../src/data.js';
import { Store } from '../src/store.js';
import { Zone } from '../src/zone.js';
import { makeRng } from '../src/rng.js';
import { validate, loadBuilds } from '../tools/validate-data.js';

const data = loadGameData();
const log = (...a) => console.log('   ·', ...a);
const MAP = 'estrada_velha';
const d2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

const newZone = (seed, d = data) => new Zone({ mapId: MAP, data: d, store: new Store(':memory:'), rng: makeRng(seed), send: () => {}, broadcast: () => {}, mapOverride: d.maps[MAP] });

// Caminhos do posto ao portal do Vau: um clique direto no portal (ida e volta) e seguindo a estrada de 10 em 10 m.
function routes(zone, map) {
  const gp = map.guardPost, vau = map.portals.find((p) => p.id === 'to_vau');
  const direct = [gp, ...zone.nav.findPath(gp.x, gp.z, vau.x, vau.z)];
  const back = [vau, ...zone.nav.findPath(vau.x, vau.z, gp.x, gp.z)];
  const road = [{ x: gp.x, z: gp.z }];
  for (let x = gp.x + 10; x < vau.x + 10; x += 10) {
    const to = { x: Math.min(x, vau.x), z: 50 };
    const free = zone.nav.isFree(to.x, to.z) ? to : zone.nav.nearestFree(to.x, to.z, 8);
    const last = road[road.length - 1];
    road.push(...zone.nav.findPath(last.x, last.z, free.x, free.z));
  }
  return { direct, back, road, vau };
}

// pontos a cada 0,5 m ao longo de uma linha quebrada
function sample(path) {
  const out = [];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], n = Math.max(1, Math.ceil(d2(a, b) / 0.5));
    for (let k = 0; k <= n; k++) out.push({ x: a.x + (b.x - a.x) * (k / n), z: a.z + (b.z - a.z) * (k / n) });
  }
  return out;
}

// folga (m) de cada bando agressivo até o caminho, no pior caso: raio + passeio (1 + até 4 m) + agressão
function margins(d) {
  const map = d.maps[MAP];
  const zone = newZone(1, d);
  const { direct, back, road } = routes(zone, map);
  const pts = [...sample(direct), ...sample(back), ...sample(road)];
  const out = [];
  for (const sp of map.spawns) {
    const md = d.monsters[sp.monster];
    if (md.aggro !== 'aggressive') continue;
    const reach = sp.radius + 1 + Math.min(4, sp.radius) + md.aggroRadius;
    const near = Math.min(...pts.map((p) => d2(p, sp)));
    out.push({ name: md.name, at: `(${sp.x}, ${sp.z})`, reach, near, gap: near - reach });
  }
  return out;
}

test('Estrada Velha: o pior alcance de cada bando agressivo fica longe do caminho do posto ao Vau', () => {
  const m = margins(data);
  for (const r of m) log(`${r.name} ${r.at}: alcance ${r.reach} m, caminho a ${r.near.toFixed(1)} m (folga ${r.gap.toFixed(1)} m)`);
  assert.ok(m.length >= 3, 'cães, javalis e o Capataz');
  for (const r of m) assert.ok(r.gap >= 2, `${r.name} ${r.at} alcança o caminho (folga ${r.gap.toFixed(1)} m)`);
  // a conferência não é de enfeite: com os bandos onde estavam (colados à estrada) ela reprova, e o validate-data também
  const old = structuredClone(data);
  for (const sp of old.maps[MAP].spawns) {
    if (sp.monster === 'rust_hound') Object.assign(sp, { x: 88, z: 68, radius: 9 });
    if (sp.monster === 'ash_boar') Object.assign(sp, { x: 134, z: 58, radius: 10 });
  }
  const bad = margins(old).filter((r) => r.gap < 0).map((r) => r.name);
  assert.deepEqual(bad.sort(), ['Cão de Ferrugem', 'Javali de Cinza']);
  const v = validate(old, loadBuilds());
  assert.ok(v.errors.some((e) => /Cão de Ferrugem .*alcança a estrada segura/.test(e)), v.errors.join('\n'));
  assert.ok(v.errors.some((e) => /Javali de Cinza .*alcança a estrada segura/.test(e)), v.errors.join('\n'));
  assert.deepEqual(validate(data, loadBuilds()).errors, []);
});

test('Estrada Velha: quem chega por um portal (Pedrâmbar, Vau, Brejo) não aparece no meio de um bando agressivo', () => {
  // as chegadas na Estrada são as dos portais dos outros mapas que levam a ela
  const arrivals = [];
  for (const [mid, m] of Object.entries(data.maps)) for (const pt of m.portals ?? []) if (pt.to === MAP) arrivals.push({ from: mid, x: pt.toX, z: pt.toZ });
  assert.deepEqual(arrivals.map((a) => a.from).sort(), ['brejo_bombas', 'pedrambar', 'vau_de_nacar']);
  for (const seed of [3, 17, 2024]) {
    for (const a of arrivals) {
      const zone = newZone(seed);
      for (let i = 0; i < 1200; i++) zone.tick(100); // dois minutos de passeio dos bandos
      const store = zone.store;
      const acc = store.createAccount(`chega${seed}${a.from}`, 'senha123');
      const cls = data.classes.breaker;
      const id = store.createCharacter({ accountId: acc, name: `Chega${seed}${a.from.slice(0, 3)}`, classId: 'breaker', hp: 80, mp: 40, mapId: MAP, x: a.x, z: a.z, kit: cls.startingKit, slotFor: (d) => data.items[d].slot });
      const c = store.loadCharacter(id);
      c.quests = new Map();
      c.level = 5; c.xp = data.xp.cumulative[4]; // do Brejo só se volta com nível 5 ou mais
      const p = zone.addPlayer(c);
      // a tela de carregamento: 5 s parado onde chegou
      for (let i = 0; i < 50; i++) {
        zone.tick(100);
        for (const m of zone.monsters.values()) {
          assert.ok(m.state === 'dead' || (m.targetId !== p.eid && !m.threat.has(c.id)), `semente ${seed}: quem chega de ${a.from} em (${a.x}, ${a.z}) foi mirado por ${m.def.name} em (${m.x.toFixed(1)}, ${m.z.toFixed(1)})`);
        }
      }
    }
  }
  log(`chegadas conferidas: ${arrivals.map((a) => `${a.from} (${a.x}, ${a.z})`).join(', ')} — ninguém mirou nos primeiros 5 s`);
  // a conferência pega o caso de verdade: os javalis na boca da trilha do Brejo, onde se chega dele
  const old = structuredClone(data);
  Object.assign(old.maps[MAP].spawns.find((sp) => sp.monster === 'ash_boar'), { x: 142, z: 84, radius: 8 });
  const v = validate(old, loadBuilds());
  assert.ok(v.errors.some((e) => /brejo_bombas\/to_estrada: a chegada em estrada_velha \(146, 88\) fica no alcance de Javali de Cinza/.test(e)), v.errors.join('\n'));
});

test('Estrada Velha: um personagem de nível 2 anda do posto ao portal do Vau e volta sem nenhum monstro o atacar', () => {
  const map = data.maps[MAP];
  const gp = map.guardPost;
  for (const seed of [3, 17, 2024]) {
    const zone = newZone(seed);
    // os bandos já espalhados: três minutos de passeio antes de sair
    for (let i = 0; i < 1800; i++) zone.tick(100);
    const store = zone.store;
    const acc = store.createAccount(`estrada${seed}`, 'senha123');
    const cls = data.classes.windwalker;
    const id = store.createCharacter({ accountId: acc, name: `Andarilha${seed}`, classId: 'windwalker', hp: 80, mp: 40, mapId: MAP, x: gp.x, z: gp.z, kit: cls.startingKit, slotFor: (d) => data.items[d].slot });
    const c = store.loadCharacter(id);
    c.quests = new Map();
    c.level = 2; c.xp = data.xp.cumulative[1]; c.unspent = data.pointsPerLevel;
    const p = zone.addPlayer(c);
    const hits = [];
    zone.broadcast = (m) => { if (m.t === 'hit' && m.dst === p.eid) hits.push(m); };
    const { road, back, vau } = routes(zone, map);
    let ticks = 0, closest = Infinity;
    const walk = (to) => {
      const r = zone.cmdMove(p, to.x, to.z);
      assert.equal(r.ok, true, r.reason);
      while (p.path && ticks < 20000) {
        zone.tick(100); ticks++;
        for (const m of zone.monsters.values()) {
          if (m.state === 'dead') continue;
          assert.ok(m.targetId !== p.eid && !m.threat.has(c.id), `semente ${seed}: ${m.def.name} em (${m.x.toFixed(1)}, ${m.z.toFixed(1)}) mirou quem passava em (${c.x.toFixed(1)}, ${c.z.toFixed(1)})`);
          if (m.def.aggro === 'aggressive') closest = Math.min(closest, d2(m, c) - m.def.aggroRadius);
        }
      }
    };
    // ida pela estrada (ponto a ponto, contornando as ruínas) e volta com um clique só no posto
    for (const wp of road.slice(1)) walk(wp);
    assert.ok(d2(c, vau) <= vau.radius + 1.5, `chegou ao portal (${c.x.toFixed(1)}, ${c.z.toFixed(1)})`);
    assert.equal(zone.cmdPortal(p, 'to_vau').ok, true, 'o portal do Vau aceita');
    walk(back[back.length - 1]);
    assert.ok(d2(c, gp) < 2, 'voltou ao posto');
    assert.deepEqual(hits, [], 'ninguém bateu');
    assert.equal(c.dead, false);
    log(`semente ${seed}: ida e volta em ${(ticks / 10).toFixed(0)} s de jogo; o agressivo mais perto ficou a ${closest.toFixed(1)} m além do raio de agressão`);
    assert.ok(closest > 0);
  }
});
