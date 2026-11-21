// Navegação: a busca contorna obstáculos, suaviza o caminho e segue com aceleração e frenagem.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NavGrid, followPath } from '../src/nav.js';
import { loadGameData } from '../src/data.js';
import { navSpec, NAV_OPTS } from '../src/zone.js';

// Referência: Dijkstra/A* simples na mesma grade e com as mesmas regras de passo (8 direções, diagonal só
// com os dois vizinhos retos livres, custo 1 e √2). Devolve o custo ótimo entre duas células, ou Infinity.
function referenceCost(nav, s, t) {
  const w = nav.w, n = w * nav.h, grid = nav.grid;
  const g = new Float64Array(n).fill(Infinity), closed = new Uint8Array(n);
  const ti = t % w, tj = (t / w) | 0;
  const h = (c) => { const a = Math.abs((c % w) - ti), b = Math.abs(((c / w) | 0) - tj); return a + b + (Math.SQRT2 - 2) * Math.min(a, b); };
  const heap = [[h(s), s]];
  const push = (e) => { heap.push(e); let i = heap.length - 1; while (i > 0) { const u = (i - 1) >> 1; if (heap[u][0] <= heap[i][0]) break; [heap[u], heap[i]] = [heap[i], heap[u]]; i = u; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top[1]; };
  g[s] = 0;
  while (heap.length) {
    const c = pop();
    if (c === t) return g[t];
    if (closed[c]) continue;
    closed[c] = 1;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const q = c + di + dj * w;
      if (grid[q] || closed[q]) continue;
      if (di && dj && (grid[c + di] || grid[c + dj * w])) continue;
      const ng = g[c] + (di && dj ? Math.SQRT2 : 1);
      if (ng < g[q]) { g[q] = ng; push([ng + h(q), q]); }
    }
  }
  return Infinity;
}

// custo de um caminho de células, conferindo que cada passo é permitido
function walkCost(nav, s, cells) {
  const w = nav.w;
  let cost = 0, prev = s;
  for (const c of cells) {
    const di = (c % w) - (prev % w), dj = ((c / w) | 0) - ((prev / w) | 0);
    assert.ok(Math.abs(di) <= 1 && Math.abs(dj) <= 1 && (di || dj), `passo de ${prev} a ${c} não é vizinho`);
    assert.equal(nav.grid[c], 0, 'célula bloqueada no caminho');
    if (di && dj) assert.ok(!nav.grid[prev + di] && !nav.grid[prev + dj * w], 'cortou quina');
    cost += di && dj ? Math.SQRT2 : 1;
    prev = c;
  }
  return cost;
}

// linha de visão de referência: confere todas as amostras, como a versão original
function referenceLos(nav, ax, az, bx, bz) {
  const d = Math.hypot(bx - ax, bz - az);
  const steps = Math.max(1, Math.ceil(d / (nav.cell * 0.5)));
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    if (!nav.isFree(ax + (bx - ax) * t, az + (bz - az) * t)) return false;
  }
  return true;
}

function lcg(seed) { let x = seed >>> 0; return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; }; }
function randomFreeCell(nav, rnd) { for (;;) { const c = Math.floor(rnd() * nav.grid.length); if (!nav.grid[c]) return c; } }

const map = { size: [40, 20], blocked: [{ x0: 18, z0: 0, x1: 22, z1: 15 }], props: [{ x: 10, z: 10, r: 0.5 }] };

test('a busca contorna a parede e o caminho suavizado não atravessa obstáculos', () => {
  const nav = new NavGrid(map, { cell: 0.5, radius: 0.4 });
  const path = nav.findPath(5, 5, 35, 5);
  assert.ok(path && path.length >= 2, 'precisa desviar');
  assert.ok(path.length <= 4, `suavizado (${path.length} pontos)`);
  let prev = { x: 5, z: 5 };
  for (const q of path) { assert.ok(nav.lineOfSight(prev.x, prev.z, q.x, q.z), 'trecho livre'); prev = q; }
  assert.ok(path.some((q) => q.z > 15), 'passa por cima da parede');
  const last = path[path.length - 1];
  assert.ok(Math.hypot(last.x - 35, last.z - 5) < 1e-6);
});

test('destino dentro de uma peça com colisão vira o ponto livre mais próximo; sem saída retorna null', () => {
  const nav = new NavGrid(map, { cell: 0.5, radius: 0.4 });
  const p = nav.findPath(5, 5, 10, 10);
  const end = p[p.length - 1];
  assert.ok(nav.isFree(end.x, end.z));
  assert.ok(Math.hypot(end.x - 10, end.z - 10) < 1.5);
  const boxed = new NavGrid({ size: [20, 20], blocked: [{ x0: 8, z0: 0, x1: 9, z1: 20 }], props: [] }, { cell: 0.5, radius: 0.4 });
  assert.equal(boxed.findPath(3, 10, 15, 10), null);
});

test('seguidor de caminho acelera, mantém a velocidade máxima e freia até parar no destino', () => {
  const e = { x: 0, z: 0, speed: 0, vx: 0, vz: 0 };
  const path = [{ x: 20, z: 0 }];
  const speeds = [];
  let done = false;
  for (let i = 0; i < 200 && !done; i++) { done = followPath(e, path, 0.05, 5, { accel: 18, decel: 24 }); speeds.push(e.speed); }
  assert.ok(done);
  assert.ok(Math.abs(e.x - 20) < 1e-6);
  assert.ok(speeds[0] > 0 && speeds[0] < 1.0, 'começa devagar');
  assert.ok(Math.max(...speeds) <= 5 + 1e-9 && Math.max(...speeds) > 4.9, 'chega à velocidade máxima');
  assert.equal(e.speed, 0);
});

test('mapas reais: todas as peças com colisão ficam fora de estradas, portais e postos', () => {
  const data = loadGameData();
  for (const [id, m] of Object.entries(data.maps)) {
    if (!m.props) continue;
    const nav = new NavGrid({ size: m.size, blocked: m.blocked ?? [], props: m.props }, { cell: 0.5, radius: 0.4 });
    for (const pt of m.portals ?? []) assert.ok(nav.isFree(pt.x, pt.z) || nav.nearestFree(pt.x, pt.z, 2), `${id}: portal ${pt.id} acessível`);
    for (const n of m.npcs ?? []) assert.ok(nav.nearestFree(n.x, n.z, 3), `${id}: NPC ${n.id} acessível`);
    if (m.guardPost) assert.ok(nav.isFree(m.guardPost.x, m.guardPost.z), `${id}: posto livre`);
  }
});

test('busca por pontos de salto: mesmo custo ótimo do A* (referência) em grades sorteadas e cheias de obstáculos', () => {
  const rnd = lcg(20261120);
  for (let g = 0; g < 12; g++) {
    const W = 30 + Math.floor(rnd() * 40), H = 20 + Math.floor(rnd() * 30);
    const blocked = Array.from({ length: 4 + Math.floor(rnd() * 10) }, () => {
      const x0 = rnd() * W, z0 = rnd() * H;
      return { x0, z0, x1: x0 + rnd() * W * 0.4, z1: z0 + rnd() * 2.5 };
    });
    const props = Array.from({ length: 20 + Math.floor(rnd() * 120) }, () => ({ x: rnd() * W, z: rnd() * H, r: 0.1 + rnd() * 1.2 }));
    const nav = new NavGrid({ size: [W, H], blocked, props }, { cell: 0.5, radius: 0.4 });
    for (let k = 0; k < 60; k++) {
      const s = randomFreeCell(nav, rnd), t = randomFreeCell(nav, rnd);
      if (s === t) continue;
      const ref = referenceCost(nav, s, t);
      const cells = nav.cellPath(s, t);
      if (ref === Infinity) {
        assert.equal(cells, null, 'sem caminho na referência, sem caminho na busca');
        assert.notEqual(nav.comp[s], nav.comp[t], 'regiões diferentes');
        continue;
      }
      assert.equal(nav.comp[s], nav.comp[t]);
      assert.ok(cells && cells[cells.length - 1] === t, 'termina no destino');
      const cost = walkCost(nav, s, cells);
      assert.ok(Math.abs(cost - ref) < 1e-9, `grade ${g}, par ${k}: custo ${cost} ≠ ótimo ${ref}`);
    }
  }
});

test('mapas reais: custo ótimo igual à referência, caminho suavizado livre e linha de visão igual à amostragem completa', () => {
  const data = loadGameData();
  const rnd = lcg(7);
  for (const [id, m] of Object.entries(data.maps)) {
    if (!m.size) continue;
    const nav = new NavGrid(navSpec(m), NAV_OPTS);
    const [W, H] = m.size;
    for (let k = 0; k < 12; k++) {
      const s = randomFreeCell(nav, rnd), t = randomFreeCell(nav, rnd);
      if (s === t) continue;
      const ref = referenceCost(nav, s, t);
      const cells = nav.cellPath(s, t);
      if (ref === Infinity) { assert.equal(cells, null, `${id}: par sem caminho`); continue; }
      assert.ok(Math.abs(walkCost(nav, s, cells) - ref) < 1e-9, `${id}: custo diferente do ótimo`);
      // pelo findPath (com suavização): cada trecho tem linha de visão
      const sx = nav.center(s % nav.w), sz = nav.center((s / nav.w) | 0), tx = nav.center(t % nav.w), tz = nav.center((t / nav.w) | 0);
      const path = nav.findPath(sx, sz, tx, tz);
      assert.ok(path?.length, `${id}: caminho suavizado`);
      let a = { x: sx, z: sz };
      for (const q of path) { assert.ok(referenceLos(nav, a.x, a.z, q.x, q.z), `${id}: trecho suavizado atravessa obstáculo`); a = q; }
    }
    // linha de visão: pular as amostras garantidamente livres não muda nenhum resultado
    for (let k = 0; k < 400; k++) {
      const ax = rnd() * (W + 4) - 2, az = rnd() * (H + 4) - 2;
      const len = k % 4 === 0 ? rnd() * 3 : rnd() * Math.max(W, H);
      const ang = rnd() * Math.PI * 2;
      const bx = ax + Math.cos(ang) * len, bz = az + Math.sin(ang) * len;
      assert.equal(nav.lineOfSight(ax, az, bx, bz), referenceLos(nav, ax, az, bx, bz), `${id}: linha de visão (${ax.toFixed(2)},${az.toFixed(2)})→(${bx.toFixed(2)},${bz.toFixed(2)})`);
    }
  }
});

test('destino numa região cercada é recusado sem busca; limite de expansões continua valendo', () => {
  // ilha: um quadrado fechado no meio de um campo aberto
  const walls = [{ x0: 15, z0: 15, x1: 25, z1: 16 }, { x0: 15, z0: 24, x1: 25, z1: 25 }, { x0: 15, z0: 15, x1: 16, z1: 25 }, { x0: 24, z0: 15, x1: 25, z1: 25 }];
  const nav = new NavGrid({ size: [40, 40], blocked: walls, props: [] }, { cell: 0.5, radius: 0.4 });
  assert.equal(nav.findPath(5, 5, 20, 20), null);
  assert.equal(nav.stats.expanded, 0, 'nenhuma célula expandida');
  // com caminho, mas acima do limite pedido
  const wall = new NavGrid(map, { cell: 0.5, radius: 0.4 });
  assert.ok(wall.findPath(5, 5, 35, 5));
  assert.equal(wall.findPath(5, 5, 35, 5, 1), null);
});

test('pior caso dos mapas grandes: canto a canto nas Galerias, na Cava e nos Canais expande pouco e fica abaixo de 5 ms', () => {
  const data = loadGameData();
  const cases = [['galerias_eco', 2, 153, 167, 2]];
  for (const id of ['galerias_eco', 'cava_primeira', 'canais_eclusa']) {
    const [w, h] = data.maps[id].size;
    cases.push([id, 2, 2, w - 2, h - 2], [id, w - 2, h - 2, 2, 2], [id, w - 2, 2, 2, h - 2], [id, 2, h - 2, w - 2, 2]);
  }
  const navs = {};
  for (const [id, sx, sz, tx, tz] of cases) {
    const nav = (navs[id] ??= new NavGrid(navSpec(data.maps[id]), NAV_OPTS));
    let best = Infinity, path = null;
    for (let i = 0; i < 7; i++) { const t0 = performance.now(); path = nav.findPath(sx, sz, tx, tz); best = Math.min(best, performance.now() - t0); }
    assert.ok(path?.length, `${id}: há caminho de (${sx},${sz}) a (${tx},${tz})`);
    // trabalho (determinístico): o A* de antes expandia de 22 mil a 55 mil células nestes casos
    assert.ok(nav.stats.expanded < 6000, `${id} (${sx},${sz})→(${tx},${tz}): ${nav.stats.expanded} pontos de salto expandidos`);
    // tempo: melhor de 7 execuções (folga para máquina carregada; o custo típico é de 0,3 a 1 ms)
    assert.ok(best < 5, `${id} (${sx},${sz})→(${tx},${tz}): ${best.toFixed(2)} ms`);
  }
});
