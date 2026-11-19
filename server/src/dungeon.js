// A Última Eclusa: o encontro com o Custódio numa instância por grupo (docs/02-campanha.md §5.3).
// O controlador roda a cada passo do servidor e só usa a API da zona: monstros, dano em jogador,
// avisos ('warn') e o estado do chefe ('boss'), que o cliente desenha.
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export class Dungeon {
  constructor({ key, zone, partyId, members, data }) {
    this.key = key;
    this.zone = zone;
    this.partyId = partyId;
    this.members = new Set(members);  // charIds autorizados
    this.data = data;
    this.f = data.formulas.dungeon;
    this.map = zone.map;
    this.away = new Map();            // charId -> { x, z, hp, dead, until }
    this.done = false;
    this.attempt = 0;
    this.lastStatusAt = -1e9;
    this.start();
  }

  // Vida do chefe pelo tamanho do grupo (60% para 2, 100% para 5).
  scale() {
    const n = Math.max(2, Math.min(5, this.members.size));
    return Math.min(1, this.f.hpScaleMin + (n - 2) * this.f.hpScaleStep);
  }

  start() {
    const z = this.zone;
    this.attempt++;
    for (const m of [...z.monsters.values()]) z.monsters.delete(m.eid);
    const b = this.map.boss;
    const boss = z.spawnMonster({ monster: b.monster, x: b.x, z: b.z, radius: 0 }, { noRespawn: true });
    const hp = Math.round(boss.def.hp * this.scale());
    // grupos menores: comportas descem mais devagar e o Custódio bate um pouco menos
    const dmgMul = Math.sqrt(this.scale());
    boss.def = { ...boss.def, hp, damage: boss.def.damage.map((d) => Math.round(d * dmgMul)) };
    boss.hp = hp;
    boss.damageFilter = (dmg, charId) => this.filterBossDamage(dmg, charId);
    this.boss = boss;
    this.phase = 1;
    this.brokenUntil = 0;
    this.valve = { i: -1, state: 'idle', at: z.now + 4000 };
    this.lines = { state: 'idle', at: 0, list: [] };
    this.gates = this.map.gates.map((g) => ({ ...g, progress: 0, lock: null, lockRespawnAt: 0 }));
    this.armDelayAt = -1e9;
    this.status(true);
  }

  isProtected() { return this.phase === 1 && this.zone.now >= this.brokenUntil; }

  // Proteção de Pressão: −90% de dano, a menos que a junta voltada para a válvula ventilando
  // seja atingida (quebra por 12 s). Na fase 3, bater no Custódio atrasa as comportas.
  filterBossDamage(dmg, charId) {
    const z = this.zone;
    if (this.phase === 1) {
      if (this.valve.state === 'venting') {
        const p = z.players.get(charId);
        const v = this.map.valves[this.valve.i];
        if (p && v) {
          const a = { x: p.char.x - this.boss.x, z: p.char.z - this.boss.z };
          const b = { x: v.x - this.boss.x, z: v.z - this.boss.z };
          const cos = (a.x * b.x + a.z * b.z) / ((Math.hypot(a.x, a.z) || 1) * (Math.hypot(b.x, b.z) || 1));
          if (cos >= Math.cos((this.f.exposedAngleDeg * Math.PI) / 180)) {
            this.brokenUntil = z.now + this.f.breakMs;
            this.valve.state = 'idle';
            this.valve.at = z.now + this.f.breakMs;
            z.broadcast({ t: 'system', text: `${p.char.name} acertou a junta exposta: a Proteção de Pressão caiu por ${this.f.breakMs / 1000} s!` });
            this.status(true);
            return dmg;
          }
        }
      }
      if (this.isProtected()) return Math.max(1, Math.round(dmg * (1 - this.f.protectionPct / 100)));
    }
    if (this.phase === 3 && z.now >= this.armDelayAt + (this.f.armCooldownMs ?? this.f.armDelayMs)) {
      this.armDelayAt = z.now;
      for (const g of this.gates) g.progress = Math.max(0, g.progress - (this.f.armDelayMs * this.scale()) / this.f.gateCloseMs);
    }
    return dmg;
  }

  alive() { return [...this.zone.players.values()].filter((p) => !p.char.dead); }

  tick() {
    const z = this.zone;
    if (this.done) return;
    if (this.boss.state === 'dead') return this.victory();
    const players = [...z.players.values()];
    if (players.length && !this.alive().length) return this.wipe('Todos caíram. O Custódio reinicia a contenção.');
    const pct = this.boss.hp / this.boss.def.hp;
    if (this.phase === 1 && pct <= 0.7) this.enterPhase(2);
    if (this.phase === 2 && pct <= 0.35) this.enterPhase(3);
    if (this.phase === 1) this.tickValves();
    if (this.phase === 2) this.tickLines();
    if (this.phase === 3) { if (this.tickGates()) return; }
    if (z.now - this.lastStatusAt >= 500) this.status();
  }

  enterPhase(n) {
    const z = this.zone;
    this.phase = n;
    if (n === 2) {
      this.lines = { state: 'idle', at: z.now + 2500, list: [], pattern: 0 };
      z.broadcast({ t: 'system', text: 'O Custódio: "Pressão crítica. Descarga nas linhas do piso." — fuja das linhas que acenderem!' });
    }
    if (n === 3) {
      for (const g of this.gates) this.spawnLock(g);
      z.broadcast({ t: 'system', text: 'O Custódio começa a baixar as três comportas! Destruam as travas e batam no Braço de Comando para atrasá-lo.' });
    }
    this.status(true);
  }

  tickValves() {
    const z = this.zone, v = this.valve, f = this.f;
    if (z.now < v.at) return;
    if (v.state === 'idle') {
      v.i = (v.i + 1) % this.map.valves.length;
      v.state = 'warning';
      v.at = z.now + f.valveWarnMs;
      const vp = this.map.valves[v.i];
      z.broadcast({ t: 'warn', shape: 'circle', x: vp.x, z: vp.z, radius: 2.5, ms: f.valveWarnMs, kind: 'valve', color: 'amber' });
    } else if (v.state === 'warning') {
      v.state = 'venting';
      v.at = z.now + f.valveVentMs;
      z.broadcast({ t: 'system', text: `A válvula ${'OSNL'[v.i] ?? v.i + 1} ventila: a junta do Custódio voltada para ela está exposta!` });
    } else if (v.state === 'venting') {
      v.state = 'idle';
      v.at = z.now + Math.max(500, f.valveCycleMs - f.valveWarnMs - f.valveVentMs);
    }
    this.status(true);
  }

  // Padrões de linhas: fileiras, colunas e xadrez (repetem e podem ser aprendidos).
  linePattern(k) {
    const [w, h] = this.map.size;
    const rows = (zs) => zs.map((zz) => ({ x: 0, z: zz, yaw: Math.PI / 2, length: w, axis: 'z', at: zz }));
    const cols = (xs) => xs.map((xx) => ({ x: xx, z: 0, yaw: 0, length: h, axis: 'x', at: xx }));
    const P = [rows([8, 24, 40]), cols([8, 24, 40]), rows([16, 32]), cols([16, 32]), [...rows([16, 32]), ...cols([16, 32])]];
    return P[k % P.length];
  }

  tickLines() {
    const z = this.zone, L = this.lines, f = this.f;
    if (z.now < L.at) return;
    if (L.state === 'idle') {
      L.list = this.linePattern(L.pattern++);
      L.state = 'warning';
      L.at = z.now + f.lineWarnMs;
      for (const l of L.list) z.broadcast({ t: 'warn', shape: 'line', x: l.x, z: l.z, yaw: l.yaw, length: l.length, width: f.lineWidth, ms: f.lineWarnMs, kind: 'line' });
    } else {
      // descarga
      for (const p of this.alive()) {
        const c = p.char;
        const hit = L.list.some((l) => Math.abs((l.axis === 'z' ? c.z : c.x) - l.at) <= f.lineWidth / 2 + 0.3);
        if (!hit) continue;
        const dmg = Math.round(p.stats.maxHp * f.lineDamagePctMaxHp / 100);
        z.broadcast({ t: 'hit', src: this.boss.eid, dst: p.eid, dmg, crit: false, miss: false, skill: 'discharge', magic: true });
        z.damagePlayer(p, dmg, this.boss);
        if (!(p.ccImmuneUntil > z.now)) p.stunUntil = z.now + f.lineStunMs;
      }
      L.state = 'idle';
      L.at = z.now + Math.max(500, f.lineCycleMs - f.lineWarnMs);
      L.list = [];
    }
  }

  spawnLock(g) {
    const lock = this.zone.spawnMonster({ monster: 'gate_lock', x: g.x, z: g.z, radius: 0 }, { noRespawn: true });
    const hp = Math.round(lock.def.hp * this.scale());
    lock.def = { ...lock.def, hp };
    lock.hp = hp;
    lock.gateId = g.id;
    g.lock = lock;
  }

  // true se o grupo falhou (as três fecharam)
  tickGates() {
    const z = this.zone, f = this.f;
    const dtFrac = ((z.lastDt || 100) * this.scale()) / f.gateCloseMs;
    for (const g of this.gates) {
      if (g.lock && g.lock.state === 'dead') {
        g.lock = null;
        g.progress = 0;
        g.lockRespawnAt = z.now + f.gateLockRespawnMs;
        z.broadcast({ t: 'system', text: 'Uma trava cedeu: a comporta voltou ao alto!' });
      }
      if (!g.lock && z.now >= g.lockRespawnAt) this.spawnLock(g);
      if (g.lock) g.progress = Math.min(1, g.progress + dtFrac);
    }
    if (this.gates.every((g) => g.progress >= 1)) { this.wipe('As três comportas fecharam: a câmara pressurizou.'); return true; }
    return false;
  }

  wipe(reason) {
    const z = this.zone;
    z.broadcast({ t: 'system', text: `${reason} O grupo volta à entrada do calabouço.` });
    z.broadcast({ t: 'boss', state: 'reset', reason });
    for (const p of z.players.values()) {
      const c = p.char;
      c.dead = false; c.hp = p.stats.maxHp; c.mp = p.stats.maxMp;
      p.stunUntil = 0; p.targetId = null; p.path = null;
      c.x = this.map.spawnPoint.x + (Math.random() - 0.5) * 3; c.z = this.map.spawnPoint.z;
      z.broadcast({ t: 'respawn', eid: p.eid, x: c.x, z: c.z, revived: true });
    }
    this.start();
  }

  victory() {
    const z = this.zone;
    this.done = true;
    for (const m of [...z.monsters.values()]) if (m !== this.boss) z.monsters.delete(m.eid);
    z.portals = [...z.portals, { id: 'exit', name: 'Saída da Eclusa', x: this.map.spawnPoint.x, z: 2, radius: 3, to: 'canais_eclusa', toX: 100, toZ: 184, minLevel: 1 }];
    for (const p of z.players.values()) {
      if (p.char.dead) { p.char.dead = false; p.char.hp = Math.round(p.stats.maxHp * 0.5); z.broadcast({ t: 'respawn', eid: p.eid, x: p.char.x, z: p.char.z, revived: true }); }
    }
    z.broadcast({ t: 'system', text: 'O Custódio parou. As saídas se abriram. "Estamos ouvindo. A passagem continua fechada."' });
    z.broadcast({ t: 'boss', state: 'victory', portal: { x: this.map.spawnPoint.x, z: 2 } });
  }

  status(force = false) {
    const z = this.zone;
    this.lastStatusAt = z.now;
    if (!this.boss) return;
    z.broadcast({
      t: 'boss', state: 'fight', phase: this.phase, eid: this.boss.eid,
      hp: Math.ceil(this.boss.hp), mhp: this.boss.def.hp, protected: this.isProtected(),
      valve: this.phase === 1 ? { i: this.valve.i, state: this.valve.state, ...(this.map.valves[this.valve.i] ?? {}) } : null,
      gates: this.phase === 3 ? this.gates.map((g) => ({ id: g.id, x: g.x, z: g.z, progress: Math.round(g.progress * 100) / 100, lock: g.lock?.eid ?? null })) : null,
      force,
    });
  }
}

export { dist };
