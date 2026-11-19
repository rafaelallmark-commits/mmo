// Gera o cenário de cada mapa em data/maps.json: estradas, peças (árvores, pedras, arbustos,
// tocos, cristais...) com raio de colisão e construções (casas nas cidades). Determinístico:
// a mesma semente sempre gera o mesmo mapa. O servidor usa as colisões para a navegação e o
// cliente desenha exatamente as mesmas peças.
// Uso: npm run gen-scenery   (depois: npm run validate-data)
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeRng } from '../src/rng.js';

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data');
const file = join(DATA, 'maps.json');
const doc = JSON.parse(readFileSync(file, 'utf8'));

const ROADS = {
  estrada_velha: [
    { w: 6, pts: [[0, 50], [160, 50]] },
    { w: 4, pts: [[136, 50], [143, 66], [150, 90]] },
    { w: 3, pts: [[30, 52], [37, 62], [43, 69]] },
    { w: 3, pts: [[84, 52], [87, 61]] },
  ],
  pedrambar: [{ w: 8, pts: [[0, 30], [60, 30]] }, { w: 6, pts: [[30, 4], [30, 56]] }],
  vau_de_nacar: [{ w: 8, pts: [[0, 30], [60, 30]] }, { w: 6, pts: [[30, 4], [30, 56]] }],
  brejo_bombas: [{ w: 3.5, pts: [[0, 70], [40, 70], [54, 50], [96, 48], [140, 52], [168, 62], [200, 70]] }, { w: 3, pts: [[108, 50], [112, 58]] }],
  oficina_soterrada: [{ w: 4, pts: [[0, 90], [60, 90], [88, 70], [140, 58]] }, { w: 3.5, pts: [[60, 90], [110, 130], [150, 156]] }, { w: 3.5, pts: [[140, 58], [160, 80], [180, 90]] }],
  galerias_eco: [{ w: 4, pts: [[0, 80], [70, 80], [100, 74], [140, 80], [150, 80], [190, 80], [220, 80]] }, { w: 3, pts: [[40, 82], [50, 104], [84, 140], [118, 118]] }, { w: 3, pts: [[100, 74], [106, 40]] }],
  canais_eclusa: [{ w: 5, pts: [[100, 0], [100, 120], [76, 128], [76, 176], [100, 192]] }, { w: 3.5, pts: [[100, 60], [30, 60], [30, 108], [58, 108]] }, { w: 3.5, pts: [[100, 60], [160, 60], [176, 100], [142, 136], [176, 176]] }],
};

// tipo → [raio de colisão base, escala mín, escala máx]
const TYPES = {
  tree_round: [0.34, 0.85, 1.35], tree_pine: [0.3, 0.85, 1.4], tree_birch: [0.24, 0.85, 1.25], tree_dead: [0.26, 0.8, 1.2], tree_willow: [0.36, 0.9, 1.3],
  rock_l: [1.05, 0.85, 1.25], rock_m: [0.55, 0.8, 1.2], rock_s: [0, 0.6, 1.2], bush: [0, 0.7, 1.3], stump: [0.32, 0.8, 1.2],
  log: [0, 0.8, 1.2], reeds: [0, 0.8, 1.3], crystal: [0.4, 0.7, 1.4], pillar: [0.6, 0.9, 1.2], gear: [0, 0.7, 1.4], rubble: [0, 0.8, 1.3],
  crate: [0.42, 0.9, 1.1], barrel: [0.36, 0.9, 1.1], mushroom: [0, 0.7, 1.4],
};

const MIX = {
  estrada_velha: { count: 260, mix: { tree_round: 22, tree_birch: 9, tree_pine: 7, rock_l: 6, rock_m: 10, rock_s: 14, bush: 20, stump: 4, log: 3, mushroom: 5 } },
  brejo_bombas: { count: 300, mix: { tree_willow: 14, tree_dead: 9, tree_round: 6, reeds: 26, rock_m: 8, rock_s: 12, bush: 14, log: 6, mushroom: 5 } },
  oficina_soterrada: { count: 240, mix: { pillar: 10, crystal: 16, rock_l: 8, rock_m: 14, rock_s: 16, gear: 12, rubble: 16, mushroom: 8 } },
  galerias_eco: { count: 300, mix: { pillar: 12, crystal: 22, rock_l: 10, rock_m: 14, rock_s: 16, mushroom: 14, rubble: 10, tree_dead: 4 } },
  canais_eclusa: { count: 260, mix: { reeds: 18, rock_m: 12, rock_s: 14, pillar: 8, gear: 10, crate: 8, barrel: 8, rubble: 10, tree_dead: 4, tree_willow: 4 } },
  pedrambar: { count: 46, mix: { tree_round: 30, tree_birch: 10, bush: 30, crate: 12, barrel: 12, rock_s: 6 } },
  vau_de_nacar: { count: 46, mix: { tree_birch: 22, tree_round: 18, bush: 30, crate: 12, barrel: 12, rock_s: 6 } },
};

// monumento da praça de cada cidade (tem colisão, como uma peça grande)
const MONUMENTS = {
  pedrambar: { t: 'monument', x: 40, z: 21, s: 1, rot: 0, r: 1.7, style: 'balance' },
  vau_de_nacar: { t: 'monument', x: 21, z: 39, s: 1, rot: 0, r: 1.9, style: 'clock' },
};

const distToSeg = (px, pz, a, b) => {
  const vx = b[0] - a[0], vz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((px - a[0]) * vx + (pz - a[1]) * vz) / (vx * vx + vz * vz || 1)));
  return Math.hypot(px - (a[0] + vx * t), pz - (a[1] + vz * t));
};

function roadDist(roads, x, z) {
  let best = Infinity;
  for (const r of roads) for (let i = 0; i < r.pts.length - 1; i++) best = Math.min(best, distToSeg(x, z, r.pts[i], r.pts[i + 1]) - r.w / 2);
  return best;
}

function hashStr(s) {
  let h = 2166136261;
  for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function pick(rng, mix) {
  const total = Object.values(mix).reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (const [k, v] of Object.entries(mix)) { r -= v; if (r <= 0) return k; }
  return Object.keys(mix)[0];
}

function houses(map, roads, rng) {
  // casas em volta da praça, viradas para a rua mais próxima
  const out = [];
  const slots = [[12, 12], [22, 10], [40, 10], [50, 13], [10, 48], [22, 50], [40, 50], [50, 47], [8, 22], [52, 38]];
  for (const [x, z] of slots) {
    if ((map.npcs ?? []).some((n) => Math.hypot(n.x - x, n.z - z) < 7)) continue;
    if (roadDist(roads, x, z) < 4) continue;
    const w = 5 + Math.floor(rng() * 3), d = 4 + Math.floor(rng() * 2);
    out.push({ type: 'house', x, z, w, d, rot: Math.abs(z - 30) > Math.abs(x - 30) ? (z < 30 ? 0 : 180) : (x < 30 ? 90 : 270), style: Math.floor(rng() * 3) });
  }
  return out;
}

for (const [id, map] of Object.entries(doc.maps)) {
  if (!map.size || map.instanced) continue;
  const roads = ROADS[id] ?? [];
  map.roads = roads;
  const cfg = MIX[id];
  const rng = makeRng(hashStr(id));
  map.structures = map.city ? houses(map, roads, rng) : [];
  if (!cfg) { map.props = []; continue; }
  const [W, H] = map.size;
  const avoid = [];
  for (const sp of map.spawns ?? []) avoid.push([sp.x, sp.z, sp.radius + 3.5]);
  for (const pt of map.portals ?? []) avoid.push([pt.x, pt.z, 7]);
  for (const n of map.npcs ?? []) avoid.push([n.x, n.z, 3.5]);
  for (const o of map.objects ?? []) avoid.push([o.x, o.z, 3.2]);
  if (map.guardPost && map.guardPost.safeRadius < 30) avoid.push([map.guardPost.x, map.guardPost.z, Math.min(map.guardPost.safeRadius, 14) + 2]);
  const mon = MONUMENTS[id];
  if (mon) avoid.push([mon.x, mon.z, mon.r + 2]);
  const props = [];
  let tries = 0;
  while (props.length < cfg.count && tries < cfg.count * 40) {
    tries++;
    const x = 2.5 + rng() * (W - 5), z = 2.5 + rng() * (H - 5);
    const type = pick(rng, cfg.mix);
    const [baseR, smin, smax] = TYPES[type];
    const s = smin + rng() * (smax - smin);
    const r = +(baseR * s).toFixed(2);
    const clearance = Math.max(r, 0.6) + 1.2;
    if (avoid.some(([ax, az, ar]) => Math.hypot(ax - x, az - z) < ar + clearance)) continue;
    if (roadDist(roads, x, z) < (type === 'reeds' || type === 'rock_s' || type === 'mushroom' ? 0.8 : 2.0) + r) continue;
    if ((map.blocked ?? []).some((b) => x > b.x0 - 2.5 - r && x < b.x1 + 2.5 + r && z > b.z0 - 2.5 - r && z < b.z1 + 2.5 + r)) {
      // juncos ficam justamente na beira da água
      if (type !== 'reeds') continue;
      if ((map.blocked ?? []).some((b) => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1)) continue;
    } else if (type === 'reeds' && id === 'brejo_bombas' && rng() < 0.6) continue;
    if (map.structures.some((h) => Math.abs(h.x - x) < h.w / 2 + 2 + r && Math.abs(h.z - z) < h.d / 2 + 2 + r)) continue;
    if (r > 0 && props.some((p) => p.r > 0 && Math.hypot(p.x - x, p.z - z) < p.r + r + 1.4)) continue;
    props.push({ t: type, x: +x.toFixed(2), z: +z.toFixed(2), s: +s.toFixed(2), rot: Math.round(rng() * 360), r });
  }
  if (mon) props.push({ ...mon });
  map.props = props;
  console.log(`${id}: ${props.length} peças (${props.filter((p) => p.r > 0).length} com colisão), ${roads.length} estradas, ${map.structures.length} construções`);
}

writeFileSync(file, JSON.stringify(doc, null, 1) + '\n');
