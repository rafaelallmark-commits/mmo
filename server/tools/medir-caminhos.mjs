// Mede a busca de caminho (o que cada pedido "move" roda) nos mapas do jogo, com a mesma grade da zona.
//
//   node tools/medir-caminhos.mjs [--nav arquivo.js] [--pares 300] [--repeticoes 15] [--semente 1] [--comparar outro.js]
//
//   Casos fixos: galerias_eco (2,153)→(167,2) e as diagonais de canto a canto (ponto livre mais perto de
//   cada canto) de galerias_eco, cava_primeira e canais_eclusa; mediana e máximo de --repeticoes.
//   Sorteio: --pares pares aleatórios por mapa (semente fixa), em todos os mapas; os 10 mais lentos são
//   repetidos para separar o custo real de pausas do coletor de lixo e de outra carga na máquina.
//   --nav: outra implementação de NavGrid para comparar, por exemplo a de antes da busca por pontos de salto:
//     git show 674fdd6:server/src/nav.js > /tmp/nav-antigo.js
//     node tools/medir-caminhos.mjs --nav /tmp/nav-antigo.js
//   --comparar: roda também outra implementação nos mesmos pares sorteados e compara o resultado (destinos
//     aceitos e recusados, comprimento do caminho suavizado), ex.: --comparar /tmp/nav-antigo.js
//   Resultado de referência: docs/relatorio-carga.md ("Busca de caminho").
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadGameData } from '../src/data.js';
import { navSpec, NAV_OPTS } from '../src/zone.js';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; };
const navFile = arg('nav', null);
const otherFile = arg('comparar', null);
const PAIRS = Number(arg('pares', 300));
const REPS = Math.max(1, Number(arg('repeticoes', 15)));
let seed = Number(arg('semente', 1)) >>> 0 || 1;
const { NavGrid } = await import(navFile ? pathToFileURL(resolve(navFile)).href : '../src/nav.js');
const maps = loadGameData().maps;

const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const pathLen = (sx, sz, p) => { let L = 0, a = { x: sx, z: sz }; for (const q of p ?? []) { L += Math.hypot(q.x - a.x, q.z - a.z); a = q; } return L; };
const fmt = (v, d = 2) => v.toFixed(d).padStart(7);

const navs = new Map();
const prep = [];
function grid(id) {
  if (!navs.has(id)) {
    const t0 = performance.now();
    navs.set(id, new NavGrid(navSpec(maps[id]), NAV_OPTS));
    prep.push([id, performance.now() - t0]);
  }
  return navs.get(id);
}
for (const id of Object.keys(maps)) if (maps[id].size) grid(id);

function time(nav, q, reps) {
  const ts = [];
  let path = null;
  for (let i = 0; i < reps; i++) { const t0 = performance.now(); path = nav.findPath(...q); ts.push(performance.now() - t0); }
  return { med: median(ts), max: Math.max(...ts), path, exp: nav.stats?.expanded };
}

// aquecimento (compilação do JIT): alguns pedidos em cada mapa grande antes de medir
for (const id of ['galerias_eco', 'cava_primeira', 'canais_eclusa']) {
  const nav = grid(id), [w, h] = maps[id].size;
  for (let i = 0; i < 30; i++) nav.findPath(2 + rnd() * (w - 4), 2 + rnd() * (h - 4), 2 + rnd() * (w - 4), 2 + rnd() * (h - 4));
}

console.log(`implementação: ${navFile ?? 'src/nav.js'} · Node ${process.version} · ${REPS} repetições por caso`);
console.log('\npreparo da grade (construção da zona):');
console.log(prep.map(([id, ms]) => `  ${id.padEnd(18)} ${ms.toFixed(1)} ms`).join('\n'));

const cases = [['galerias_eco', 2, 153, 167, 2]];
for (const id of ['galerias_eco', 'cava_primeira', 'canais_eclusa']) {
  const nav = grid(id), [w, h] = maps[id].size;
  const c = (x, z) => nav.nearestFree(x, z, 10);
  const [a, b, d, e] = [c(2, 2), c(w - 2, 2), c(2, h - 2), c(w - 2, h - 2)];
  for (const [p, q] of [[a, e], [e, a], [b, d], [d, b]]) cases.push([id, p.x, p.z, q.x, q.z]);
}
console.log('\ncasos fixos (canto a canto):');
console.log(`  ${'mapa'.padEnd(15)} ${'de → para'.padEnd(26)} mediana   máximo  pontos  compr.(m)  expansões`);
let worstFixed = 0;
for (const [id, ...q] of cases) {
  const r = time(grid(id), q, REPS);
  worstFixed = Math.max(worstFixed, r.med);
  console.log(`  ${id.padEnd(15)} ${`(${q[0]},${q[1]})→(${q[2]},${q[3]})`.padEnd(26)} ${fmt(r.med)} ${fmt(r.max)}  ${String(r.path?.length ?? '-').padStart(6)}  ${fmt(pathLen(q[0], q[1], r.path), 1)}    ${r.exp ?? '-'}`);
}

const all = [];
for (const [id, m] of Object.entries(maps)) {
  if (!m.size) continue;
  const nav = grid(id), [w, h] = m.size;
  for (let i = 0; i < PAIRS; i++) {
    const q = [1 + rnd() * (w - 2), 1 + rnd() * (h - 2), 1 + rnd() * (w - 2), 1 + rnd() * (h - 2)];
    const t0 = performance.now();
    nav.findPath(...q);
    all.push({ id, q, ms: performance.now() - t0 });
  }
}
const ms = all.map((r) => r.ms).sort((a, b) => a - b);
const slow = [...all].sort((a, b) => b.ms - a.ms).slice(0, 10).map((r) => ({ ...r, ...time(grid(r.id), r.q, REPS) }));
slow.sort((a, b) => b.med - a.med);
console.log(`\nsorteio: ${all.length} pedidos em ${navs.size} mapas · p50 ${ms[Math.floor(ms.length / 2)].toFixed(3)} ms · p99 ${ms[Math.floor(ms.length * 0.99)].toFixed(3)} ms · máximo de uma execução ${ms[ms.length - 1].toFixed(2)} ms`);
console.log('os mais lentos, repetidos (mediana / máximo):');
for (const r of slow.slice(0, 5)) console.log(`  ${r.id.padEnd(17)} ${`(${r.q.map((v) => v.toFixed(1)).join(', ')})`.padEnd(30)} ${fmt(r.med)} ${fmt(r.max)}  expansões ${r.exp ?? '-'}`);
const worst = Math.max(worstFixed, slow[0]?.med ?? 0);
console.log(`\npior caso por pedido (mediana): ${worst.toFixed(2)} ms · 20 pedidos/s desse caso custam ${(20 * worst).toFixed(0)} ms por segundo (tick de 100 ms a 10 Hz)`);

// comparação com outra implementação nos mesmos pares sorteados
if (otherFile) {
  const Other = (await import(pathToFileURL(resolve(otherFile)).href)).NavGrid;
  const others = new Map();
  let same = 0, shorter = 0, longer = 0, both = 0, mismatch = 0, sumA = 0, sumB = 0;
  const rel = [];
  for (const r of all) {
    if (!others.has(r.id)) others.set(r.id, new Other(navSpec(maps[r.id]), NAV_OPTS));
    const a = grid(r.id).findPath(...r.q), b = others.get(r.id).findPath(...r.q);
    if (!a !== !b) { mismatch++; console.log(`  destino aceito por uma e recusado pela outra: ${r.id} (${r.q.map((v) => v.toFixed(2)).join(', ')})`); continue; }
    if (!a) continue;
    both++;
    const la = pathLen(r.q[0], r.q[1], a), lb = pathLen(r.q[0], r.q[1], b);
    sumA += la; sumB += lb;
    rel.push((la - lb) / Math.max(lb, 1e-9));
    if (Math.abs(la - lb) < 1e-6) same++; else if (la < lb) shorter++; else longer++;
  }
  rel.sort((x, y) => x - y);
  const pct = (v) => `${(v * 100).toFixed(1)}%`;
  console.log(`\ncomparação com ${otherFile} nos ${all.length} pares sorteados: ${mismatch} com resultado diferente (aceito × recusado); ` +
    `dos ${both} caminhos, ${same} iguais (${pct(same / both)}), ${shorter} mais curtos (${pct(shorter / both)}) e ${longer} mais longos (${pct(longer / both)}) ` +
    `nesta implementação; comprimento total ${((sumA / sumB - 1) * 100).toFixed(2)}%; diferença p1 ${pct(rel[Math.floor(rel.length * 0.01)])}, ` +
    `p99 ${pct(rel[Math.floor(rel.length * 0.99)])}, máxima ${pct(rel[rel.length - 1])}`);
}
