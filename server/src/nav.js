// Navegação: grade de ocupação do mapa (áreas bloqueadas, peças de cenário com colisão e
// bordas), busca de caminho em 8 direções sem cortar quinas, suavização por linha de visão e um
// seguidor de caminho com aceleração e frenagem. Tudo determinístico e sem dependências.
//
// A busca é JPS (busca por pontos de salto, Harabor e Grastien): o mesmo custo ótimo do A* na mesma
// grade e com as mesmas regras de passo, mas só os pontos onde o caminho pode virar entram na fila;
// os trechos retos entre eles são pulados com distâncias calculadas uma vez na construção da grade.
// Destino em outra região conexa (ilha cercada) é recusado na hora, sem busca. A linha de visão pula
// as amostras que a distância até o bloqueio mais próximo garante livres (mesmo resultado da
// amostragem completa). Medição antes/depois: docs/relatorio-carga.md (npm run medir-caminhos).

const SQRT2 = Math.SQRT2;
const OCTILE = SQRT2 - 2; // h = dx + dy + (√2 − 2)·min(dx, dy)
const DIR_E = 0, DIR_W = 1, DIR_S = 2, DIR_N = 3; // saltos retos: +i, −i, +j, −j

// Área de trabalho da busca, compartilhada por todas as grades: o servidor faz uma busca por vez (um fio
// só), e assim nenhum pedido aloca ou zera vetores do tamanho do mapa. mark[c] === gen: g e parent valem
// nesta busca (aberto); gen + 1: fechado; qualquer outro valor: célula ainda não vista.
const work = { n: 0, g: null, parent: null, mark: null, gen: 0 };
function workFor(n) {
  if (work.n < n) Object.assign(work, { n, g: new Float64Array(n), parent: new Int32Array(n), mark: new Uint32Array(n), gen: 0 });
  work.gen += 2;
  if (work.gen > 0xfffffff0) { work.mark.fill(0); work.gen = 2; }
  return work;
}

// Fila de prioridade binária em vetores tipados: menor f primeiro e, no empate, menor h (mais perto do
// destino), que segue um dos caminhos ótimos em vez de abrir todos os empatados.
const open = {
  k: new Int32Array(1024), f: new Float64Array(1024), h: new Float64Array(1024), n: 0,
  push(key, f, h) {
    if (this.n === this.k.length) {
      const grow = (a, T) => { const b = new T(a.length * 2); b.set(a); return b; };
      this.k = grow(this.k, Int32Array); this.f = grow(this.f, Float64Array); this.h = grow(this.h, Float64Array);
    }
    const K = this.k, F = this.f, H = this.h;
    let i = this.n++;
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (F[up] < f || (F[up] === f && H[up] <= h)) break;
      K[i] = K[up]; F[i] = F[up]; H[i] = H[up];
      i = up;
    }
    K[i] = key; F[i] = f; H[i] = h;
  },
  pop() {
    const K = this.k, F = this.f, H = this.h;
    const top = K[0];
    const n = --this.n;
    if (n > 0) {
      const key = K[n], f = F[n], h = H[n];
      let i = 0;
      for (;;) {
        let m = 2 * i + 1;
        if (m >= n) break;
        const r = m + 1;
        if (r < n && (F[r] < F[m] || (F[r] === F[m] && H[r] < H[m]))) m = r;
        if (F[m] > f || (F[m] === f && H[m] >= h)) break;
        K[i] = K[m]; F[i] = F[m]; H[i] = H[m];
        i = m;
      }
      K[i] = key; F[i] = f; H[i] = h;
    }
    return top;
  },
};

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
    this.stats = { expanded: 0 }; // pontos de salto expandidos na última busca (medição e testes)
    this.prepare();
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

  // Tabelas calculadas uma vez (a grade não muda depois de construída). A borda é bloqueada, então
  // uma célula livre nunca está nela e seus 8 vizinhos estão sempre dentro da grade.
  prepare() {
    const w = this.w, h = this.h, n = w * h, grid = this.grid;
    // Regiões conexas das células livres. Sem cortar quinas, um passo diagonal exige os dois vizinhos
    // retos livres, então 8 direções alcançam exatamente o que 4 direções alcançam.
    const comp = new Int32Array(n);
    const stack = new Int32Array(n);
    let label = 0;
    for (let s0 = 0; s0 < n; s0++) {
      if (grid[s0] || comp[s0]) continue;
      comp[s0] = ++label;
      let top = 0;
      stack[top++] = s0;
      while (top) {
        const c = stack[--top];
        let q = c - 1; if (!grid[q] && !comp[q]) { comp[q] = label; stack[top++] = q; }
        q = c + 1; if (!grid[q] && !comp[q]) { comp[q] = label; stack[top++] = q; }
        q = c - w; if (!grid[q] && !comp[q]) { comp[q] = label; stack[top++] = q; }
        q = c + w; if (!grid[q] && !comp[q]) { comp[q] = label; stack[top++] = q; }
      }
    }
    this.comp = comp;
    // Folga: distância de Chebyshev (em células, até 255) de cada célula até a bloqueada mais próxima.
    // Chebyshev nunca passa da distância real, então serve de garantia na linha de visão.
    const cl = new Uint8Array(n);
    for (let c = 0; c < n; c++) cl[c] = grid[c] ? 0 : 255;
    for (let j = 1; j < h - 1; j++) {
      for (let c = j * w + 1, end = j * w + w - 1; c < end; c++) {
        const v = cl[c]; if (!v) continue;
        let m = cl[c - 1]; const b = cl[c - w - 1], d = cl[c - w], e = cl[c - w + 1];
        if (b < m) m = b; if (d < m) m = d; if (e < m) m = e;
        if (m + 1 < v) cl[c] = m + 1;
      }
    }
    for (let j = h - 2; j >= 1; j--) {
      for (let c = j * w + w - 2, end = j * w; c > end; c--) {
        const v = cl[c]; if (!v) continue;
        let m = cl[c + 1]; const b = cl[c + w - 1], d = cl[c + w], e = cl[c + w + 1];
        if (b < m) m = b; if (d < m) m = d; if (e < m) m = e;
        if (m + 1 < v) cl[c] = m + 1;
      }
    }
    this.clear = cl;
    // Saltos retos, por direção: valor > 0 = ponto de salto (célula com vizinho forçado) a essa
    // distância; valor <= 0 = nenhum, com −valor células livres até a parede. Vizinho forçado, andando
    // para leste: a célula ao norte (ou sul) está livre e a de trás dela, bloqueada; o caminho só chega
    // lá virando aqui.
    const T = Math.max(w, h) < 32000 ? Int16Array : Int32Array;
    const jE = new T(n), jW = new T(n), jS = new T(n), jN = new T(n);
    for (let j = 1; j < h - 1; j++) {
      const row = j * w;
      for (let c = row + w - 2; c > row; c--) {
        if (grid[c]) continue;
        const m = c + 1;
        if (grid[m]) jE[c] = 0;
        else if ((!grid[m - w] && grid[m - w - 1]) || (!grid[m + w] && grid[m + w - 1])) jE[c] = 1;
        else { const v = jE[m]; jE[c] = v > 0 ? v + 1 : v - 1; }
      }
      for (let c = row + 1; c < row + w - 1; c++) {
        if (grid[c]) continue;
        const m = c - 1;
        if (grid[m]) jW[c] = 0;
        else if ((!grid[m - w] && grid[m - w + 1]) || (!grid[m + w] && grid[m + w + 1])) jW[c] = 1;
        else { const v = jW[m]; jW[c] = v > 0 ? v + 1 : v - 1; }
      }
    }
    for (let j = h - 2; j >= 1; j--) {
      for (let c = j * w + 1, end = j * w + w - 1; c < end; c++) {
        if (grid[c]) continue;
        const m = c + w;
        if (grid[m]) jS[c] = 0;
        else if ((!grid[m - 1] && grid[m - 1 - w]) || (!grid[m + 1] && grid[m + 1 - w])) jS[c] = 1;
        else { const v = jS[m]; jS[c] = v > 0 ? v + 1 : v - 1; }
      }
    }
    for (let j = 1; j < h - 1; j++) {
      for (let c = j * w + 1, end = j * w + w - 1; c < end; c++) {
        if (grid[c]) continue;
        const m = c - w;
        if (grid[m]) jN[c] = 0;
        else if ((!grid[m - 1] && grid[m - 1 + w]) || (!grid[m + 1] && grid[m + 1 + w])) jN[c] = 1;
        else { const v = jN[m]; jN[c] = v > 0 ? v + 1 : v - 1; }
      }
    }
    this.jumps = [jE, jW, jS, jN];
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

  // Linha de visão: o segmento é amostrado a cada meio passo de célula e toda amostra precisa cair numa
  // célula livre. Uma amostra numa célula com folga F (Chebyshev, em células) garante livres todas as
  // amostras a menos de F·cell − √2·cell dela (o centro de qualquer célula bloqueada está a pelo menos
  // F·cell do centro desta, e cada ponto fica a no máximo meia diagonal do centro da sua célula), então
  // elas são puladas: o resultado é o mesmo de conferir uma por uma.
  lineOfSight(ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az;
    const d = Math.hypot(dx, dz);
    const cell = this.cell, w = this.w, h = this.h, grid = this.grid, cl = this.clear;
    const steps = Math.max(1, Math.ceil(d / (cell * 0.5)));
    const stepLen = d / steps;
    const margin = cell * SQRT2 + 1e-6;
    for (let s = 0; s <= steps;) {
      const t = s / steps;
      const i = Math.floor((ax + dx * t) / cell), j = Math.floor((az + dz * t) / cell);
      if (i < 0 || j < 0 || i >= w || j >= h) return false;
      const c = j * w + i;
      if (grid[c] !== 0) return false;
      const skip = stepLen > 0 ? Math.floor((cl[c] * cell - margin) / stepLen) : 0;
      s += skip >= 1 ? skip + 1 : 1;
    }
    return true;
  }

  // Busca em 8 direções (sem cortar quinas) + suavização. Retorna [{x,z}] sem o ponto inicial, ou null.
  // maxExpand limita os pontos de salto expandidos (proteção; nos mapas do jogo ninguém chega perto).
  findPath(sx, sz, tx, tz, maxExpand = 120000) {
    if (this.lineOfSight(sx, sz, tx, tz)) return [{ x: tx, z: tz }];
    const start = this.isFree(sx, sz) ? { x: sx, z: sz } : this.nearestFree(sx, sz, 3);
    const goal = this.isFree(tx, tz) ? { x: tx, z: tz } : this.nearestFree(tx, tz, 3);
    if (!start || !goal) return null;
    const w = this.w;
    const s = this.idx(this.toCell(start.x), this.toCell(start.z));
    const t = this.idx(this.toCell(goal.x), this.toCell(goal.z));
    this.stats.expanded = 0;
    if (this.comp[s] !== this.comp[t]) return null; // outra região: não há caminho
    const cells = s === t ? [] : this.cellPath(s, t, maxExpand);
    if (!cells) return null;
    // centros das células e suavização (o último ponto é o destino exato)
    const raw = cells.map((c) => ({ x: this.center(c % w), z: this.center((c / w) | 0) }));
    if (raw.length) raw[raw.length - 1] = { x: goal.x, z: goal.z };
    return this.smooth({ x: sx, z: sz }, raw);
  }

  // Caminho ótimo de células (índices, sem a inicial, terminando em t) entre duas células livres, ou
  // null. Custo 1 por passo reto e √2 por diagonal, como no A*.
  cellPath(s, t, maxExpand = 120000) {
    const w = this.w, grid = this.grid;
    const wk = workFor(w * this.h);
    const G = wk.g, P = wk.parent, M = wk.mark, gen = wk.gen, closed = gen + 1;
    const tj = (t / w) | 0, ti = t - tj * w;
    const hOf = (c) => {
      const cj = (c / w) | 0, ci = c - cj * w;
      const a = ci > ti ? ci - ti : ti - ci, b = cj > tj ? cj - tj : tj - cj;
      return a + b + OCTILE * (a < b ? a : b);
    };
    open.n = 0;
    G[s] = 0; P[s] = -1; M[s] = gen;
    const h0 = hOf(s);
    open.push(s, h0, h0);
    let expanded = 0;
    const dirs = [];
    while (open.n) {
      const cur = open.pop();
      if (cur === t) {
        this.stats.expanded = expanded;
        // de ponto de salto em ponto de salto, cada trecho é reto ou diagonal puro
        const cells = [];
        for (let c = t; c !== s;) {
          const p = P[c];
          const cj = (c / w) | 0, ci = c - cj * w, pj = (p / w) | 0, pi = p - pj * w;
          const step = Math.sign(ci - pi) + Math.sign(cj - pj) * w;
          for (let q = c; q !== p; q -= step) cells.push(q);
          c = p;
        }
        return cells.reverse();
      }
      if (M[cur] === closed) continue;
      M[cur] = closed;
      if (++expanded > maxExpand) { this.stats.expanded = expanded; return null; }
      const cj = (cur / w) | 0, ci = cur - cj * w;
      dirs.length = 0;
      const p = P[cur];
      if (p < 0) {
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) dirs.push(dx, dy);
      } else {
        // poda pela direção de chegada: só os vizinhos naturais e os forçados
        const pj = (p / w) | 0, pi = p - pj * w;
        const dx = Math.sign(ci - pi), dy = Math.sign(cj - pj);
        if (dx && dy) {
          dirs.push(dx, 0, 0, dy, dx, dy); // diagonal: sem vizinhos forçados quando não se corta quina
        } else if (dx) {
          dirs.push(dx, 0);
          if (grid[cur - w] === 0 && grid[cur - w - dx] !== 0) dirs.push(0, -1, dx, -1);
          if (grid[cur + w] === 0 && grid[cur + w - dx] !== 0) dirs.push(0, 1, dx, 1);
        } else {
          dirs.push(0, dy);
          if (grid[cur - 1] === 0 && grid[cur - 1 - dy * w] !== 0) dirs.push(-1, 0, -1, dy);
          if (grid[cur + 1] === 0 && grid[cur + 1 - dy * w] !== 0) dirs.push(1, 0, 1, dy);
        }
      }
      const gc = G[cur];
      for (let k = 0; k < dirs.length; k += 2) {
        const dx = dirs[k], dy = dirs[k + 1];
        const jp = dx && dy ? this.jumpDiagonal(cur, dx, dy, t) : this.jumpStraight(cur, dx > 0 ? DIR_E : dx < 0 ? DIR_W : dy > 0 ? DIR_S : DIR_N, t);
        if (jp < 0 || M[jp] === closed) continue;
        const jj = (jp / w) | 0, ji = jp - jj * w;
        const a = ji > ci ? ji - ci : ci - ji, b = jj > cj ? jj - cj : cj - jj;
        const ng = gc + (dx && dy ? a * SQRT2 : a + b);
        if (M[jp] !== gen || ng < G[jp]) {
          M[jp] = gen; G[jp] = ng; P[jp] = cur;
          const hj = hOf(jp);
          open.push(jp, ng + hj, hj);
        }
      }
    }
    this.stats.expanded = expanded;
    return null;
  }

  // Próximo ponto de salto numa direção reta a partir de c (o destino conta como um), ou −1.
  jumpStraight(c, dir, t) {
    const v = this.jumps[dir][c];
    const reach = v > 0 ? v : -v;
    const w = this.w;
    switch (dir) {
      case DIR_E: if (t > c && t - c <= reach && ((t / w) | 0) === ((c / w) | 0)) return t; return v > 0 ? c + v : -1;
      case DIR_W: if (t < c && c - t <= reach && ((t / w) | 0) === ((c / w) | 0)) return t; return v > 0 ? c - v : -1;
      case DIR_S: if (t > c && (t - c) % w === 0 && (t - c) / w <= reach) return t; return v > 0 ? c + v * w : -1;
      default: if (t < c && (c - t) % w === 0 && (c - t) / w <= reach) return t; return v > 0 ? c - v * w : -1;
    }
  }

  // Segue na diagonal enquanto o passo é permitido (as duas células retas ao lado livres); para no
  // destino ou numa célula de onde um salto reto acha ponto de salto. −1 se bater em obstáculo antes.
  jumpDiagonal(c, dx, dy, t) {
    const grid = this.grid, ox = dx, oy = dy * this.w;
    const dh = dx > 0 ? DIR_E : DIR_W, dv = dy > 0 ? DIR_S : DIR_N;
    for (let n = c; ;) {
      if (grid[n + ox] !== 0 || grid[n + oy] !== 0 || grid[n + ox + oy] !== 0) return -1;
      n += ox + oy;
      if (n === t || this.jumpStraight(n, dh, t) >= 0 || this.jumpStraight(n, dv, t) >= 0) return n;
    }
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
