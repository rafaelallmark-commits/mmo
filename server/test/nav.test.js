// Navegação: A* contorna obstáculos, suaviza o caminho e segue com aceleração e frenagem.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NavGrid, followPath } from '../src/nav.js';
import { loadGameData } from '../src/data.js';

const map = { size: [40, 20], blocked: [{ x0: 18, z0: 0, x1: 22, z1: 15 }], props: [{ x: 10, z: 10, r: 0.5 }] };

test('A* contorna a parede e o caminho suavizado não atravessa obstáculos', () => {
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
