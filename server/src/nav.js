// Navegação: grade de ocupação do mapa (áreas bloqueadas, peças de cenário com colisão e
// bordas), busca de caminho A* em 8 direções, suavização por linha de visão e um seguidor de
// caminho com aceleração e frenagem. Tudo determinístico e sem dependências.

const SQRT2 = Math.SQRT2;

export class NavGrid {
  // map: { size:[w,h], blocked:[{x0,z0,x1,z1}], props:[{x,z,r}] }
  constructor(map, { cell = 0.5, radius = 0.4 } = {}) {
    this.cell = cell;
    this.radius = radius;
    this.wm = map.size[0];
    this.hm = map.size[1];
    this.w = Math.ceil(this.wm / cell);
    this.h = Math.ceil(this.hm / cell);
    this.grid = new Uint8Array(this.w * this.h);
    // bordas do mapa
    for (let i = 0; i < this.w; i++) { this.grid[i] = 1; this.grid[(this.h - 1) * this.w + i] = 1; }
    for (let j = 0; j < this.h; j++) { this.grid[j * this.w] = 1; this.grid[j * this.w + this.w - 1] = 1; }
    for (const b of map.blocked ?? []) this.markRect(b.x0 - radius, b.z0 - radius, b.x1 + radius, b.z1 + radius);
    for (const p of map.props ?? []) if (p.r > 0) this.markCircle(p.x, p.z, p.r + radius);
  }

  idx(i, j) { return j * this.w + i; }
  toCell(x) { return Math.floor(x / this.cell); }
  center(i) { return (i + 0.5) * this.cell; }

  markRect(x0, z0, x1, z1) {
    const i0 = Math.max(0, this.toCell(x0)), i1 = Math.min(this.w - 1, this.toCell(x1));
    const j0 = Math.max(0, this.toCell(z0)), j1 = Math.min(this.h - 1, this.toCell(z1));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this.grid[this.idx(i, j)] = 1;
  }

  markCircle(x, z, r) {
    const i0 = Math.max(0, this.toCell(x - r)), i1 = Math.min(this.w - 1, this.toCell(x + r));
    const j0 = Math.max(0, this.toCell(z - r)), j1 = Math.min(this.h - 1, this.toCell(z + r));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        if (Math.hypot(this.center(i) - x, this.center(j) - z) <= r) this.grid[this.idx(i, j)] = 1;
      }
    }
  }

  freeCell(i, j) { return i >= 0 && j >= 0 && i < this.w && j < this.h && this.grid[this.idx(i, j)] === 0; }
  isFree(x, z) { return this.freeCell(this.toCell(x), this.toCell(z)); }

  // Célula livre mais próxima (busca em anéis), ou null.
  nearestFree(x, z, maxR = 6) {
    if (this.isFree(x, z)) return { x, z };
    const ci = this.toCell(x), cj = this.toCell(z);
    const maxC = Math.ceil(maxR / this.cell);
    let best = null, bestD = Infinity;
    for (let r = 1; r <= maxC; r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const i = ci + di, j = cj + dj;
          if (!this.freeCell(i, j)) continue;
          const px = this.center(i), pz = this.center(j);
          const d = Math.hypot(px - x, pz - z);
          if (d < bestD) { bestD = d; best = { x: px, z: pz }; }
        }
      }
      if (best) return best;
    }
    return null;
  }

  // Linha de visão: amostra o segmento a cada meio passo de célula.
  lineOfSight(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.ceil(d / (this.cell * 0.5)));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      if (!this.isFree(ax + (bx - ax) * t, az + (bz - az) * t)) return false;
    }
    return true;
  }

  // A* em 8 direções (sem cortar quinas) + suavização. Retorna [{x,z}] sem o ponto inicial, ou null.
  findPath(sx, sz, tx, tz, maxExpand = 120000) {
    if (this.lineOfSight(sx, sz, tx, tz)) return [{ x: tx, z: tz }];
    const start = this.isFree(sx, sz) ? { x: sx, z: sz } : this.nearestFree(sx, sz, 3);
    const goal = this.isFree(tx, tz) ? { x: tx, z: tz } : this.nearestFree(tx, tz, 3);
    if (!start || !goal) return null;
    const si = this.toCell(start.x), sj = this.toCell(start.z);
    const gi = this.toCell(goal.x), gj = this.toCell(goal.z);
    const n = this.w * this.h;
    const g = new Float32Array(n).fill(Infinity);
    const parent = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const heap = new MinHeap();
    const h = (i, j) => { const dx = Math.abs(i - gi), dy = Math.abs(j - gj); return (dx + dy) + (SQRT2 - 2) * Math.min(dx, dy); };
    const s = this.idx(si, sj), goalIdx = this.idx(gi, gj);
    g[s] = 0;
    heap.push(s, h(si, sj));
    let expanded = 0;
    while (heap.size) {
      const cur = heap.pop();
      if (cur === goalIdx) break;
      if (closed[cur]) continue;
      closed[cur] = 1;
      if (++expanded > maxExpand) return null;
      const ci = cur % this.w, cj = (cur / this.w) | 0;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ni = ci + di, nj = cj + dj;
          if (!this.freeCell(ni, nj)) continue;
          if (di && dj && (!this.freeCell(ci + di, cj) || !this.freeCell(ci, cj + dj))) continue;
          const ni2 = this.idx(ni, nj);
          if (closed[ni2]) continue;
          const ng = g[cur] + (di && dj ? SQRT2 : 1);
          if (ng < g[ni2]) { g[ni2] = ng; parent[ni2] = cur; heap.push(ni2, ng + h(ni, nj)); }
        }
      }
    }
    if (parent[goalIdx] === -1 && goalIdx !== s) return null;
    // reconstrói (centros das células) e suaviza
    const cells = [];
    for (let c = goalIdx; c !== -1 && c !== s; c = parent[c]) cells.push(c);
    cells.reverse();
    const raw = cells.map((c) => ({ x: this.center(c % this.w), z: this.center((c / this.w) | 0) }));
    raw[raw.length - 1] = { x: goal.x, z: goal.z };
    return this.smooth({ x: sx, z: sz }, raw);
  }

  // Corta caminho: de cada ponto, pula para o ponto mais distante ainda visível.
  smooth(start, pts) {
    const out = [];
    let from = start;
    let k = 0;
    while (k < pts.length) {
      let far = k;
      for (let m = pts.length - 1; m > k; m--) {
        if (this.lineOfSight(from.x, from.z, pts[m].x, pts[m].z)) { far = m; break; }
      }
      out.push(pts[far]);
      from = pts[far];
      k = far + 1;
    }
    return out;
  }
}

class MinHeap {
  constructor() { this.k = []; this.p = []; }
  get size() { return this.k.length; }
  push(key, pri) {
    const k = this.k, p = this.p;
    k.push(key); p.push(pri);
    let i = k.length - 1;
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (p[up] <= p[i]) break;
      [k[up], k[i]] = [k[i], k[up]]; [p[up], p[i]] = [p[i], p[up]];
      i = up;
    }
  }
  pop() {
    const k = this.k, p = this.p;
    const top = k[0];
    const lk = k.pop(), lp = p.pop();
    if (k.length) {
      k[0] = lk; p[0] = lp;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < k.length && p[l] < p[m]) m = l;
        if (r < k.length && p[r] < p[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]]; [p[m], p[i]] = [p[i], p[m]];
        i = m;
      }
    }
    return top;
  }
}

// Segue um caminho com aceleração e frenagem ("chegada suave"). e: {x, z, speed, vx, vz}.
// Retorna true quando chegou ao fim. stopAt: para a essa distância do último ponto.
export function followPath(e, path, dt, maxSpeed, { accel = 18, decel = 24, stopAt = 0, isFree = null } = {}) {
  if (!path.length) { brake(e, dt, decel); return true; }
  let remaining = Math.hypot(path[0].x - e.x, path[0].z - e.z);
  for (let i = 1; i < path.length; i++) remaining += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
  remaining = Math.max(0, remaining - stopAt);
  if (remaining < 0.02) { e.speed = 0; e.vx = 0; e.vz = 0; path.length = 0; return true; }
  const want = Math.min(maxSpeed, Math.sqrt(2 * decel * remaining));
  e.speed = e.speed < want ? Math.min(want, e.speed + accel * dt) : Math.max(want, e.speed - decel * dt);
  let step = Math.min(e.speed * dt, remaining);
  let dirx = 0, dirz = 0;
  while (step > 1e-6 && path.length) {
    const tx = path[0].x, tz = path[0].z;
    const dx = tx - e.x, dz = tz - e.z;
    const d = Math.hypot(dx, dz);
    const last = path.length === 1;
    const avail = last ? Math.max(0, d - stopAt) : d;
    if (d < 1e-6 || avail <= 1e-6) { if (!last) { path.shift(); continue; } break; }
    const s = Math.min(step, avail);
    const nx = e.x + (dx / d) * s, nz = e.z + (dz / d) * s;
    // bloqueia só a entrada num obstáculo (quem já está dentro de um pode sair)
    if (isFree && !isFree(nx, nz) && isFree(e.x, e.z)) { e.speed = 0; break; }
    e.x = nx; e.z = nz; dirx = dx / d; dirz = dz / d;
    step -= s;
    if (s >= avail - 1e-6) { if (last) { path.length = 0; break; } path.shift(); }
  }
  e.vx = dirx * e.speed; e.vz = dirz * e.speed;
  if (!path.length) { e.speed = 0; e.vx = 0; e.vz = 0; return true; }
  return false;
}

export function brake(e, dt, decel = 24) {
  e.speed = Math.max(0, (e.speed || 0) - decel * dt);
  if (e.speed === 0) { e.vx = 0; e.vz = 0; }
}
