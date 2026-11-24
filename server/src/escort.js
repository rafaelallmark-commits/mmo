// Escolta (capítulo 4, "Rota Alternativa"): uma carroça segue a rota definida no mapa enquanto alguém
// do grupo estiver por perto; em cada marco, monstros emboscam e miram a carroça. Se ela quebrar, volta
// ao último marco alcançado com a vida cheia; se todos caírem, espera; se ninguém do grupo ficar na zona
// por 60 s, a escolta acaba (dá para recomeçar na carroça parada no acampamento).
import { monsterAttack } from './rules.js';
import { followPath } from './nav.js';

const ABANDON_MS = 60000;
const BROKEN_MS = 4000;
const ARRIVE_CREDIT_R = 40;

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const r2 = (v) => Math.round(v * 100) / 100;

export class Escort {
  // def: entrada de map.escorts; owner: jogador que começou; partyId: grupo dele (ou null)
  constructor(zone, defId, def, owner, partyId, seq) {
    this.zone = zone;
    this.defId = defId;
    this.def = def;
    this.eid = `e${seq}`;
    this.ownerCharId = owner.char.id;
    this.partyId = partyId;
    this.mhp = def.hp;
    this.hp = def.hp;
    this.state = 'moving'; // moving | waiting | broken | arrived
    this.stats = { defense: def.defense ?? 15, evasion: def.evasion ?? 0, level: def.level ?? 1 };
    // caminho andável pela rota: A* entre pontos consecutivos; marca onde ficam os marcos
    this.points = [def.start, ...def.route];
    this.lastMark = 0;          // índice do último ponto-marco alcançado (0 = início)
    this.reset(0);
    this.ambushDone = new Set();
    this.lastSeenAt = zone.now;
    this.vx = 0; this.vz = 0; this.speed = 0;
  }

  reset(pointIdx) {
    const p = this.points[pointIdx];
    this.x = p.x; this.z = p.z;
    this.next = pointIdx + 1;   // próximo ponto da rota
    this.path = null;
    this.hp = this.mhp;
    this.speed = 0; this.vx = 0; this.vz = 0;
  }

  // quem pode escoltar: o dono e o grupo dele (presentes na zona e vivos)
  escorts(aliveOnly = true) {
    const out = [];
    for (const p of this.zone.players.values()) {
      if (aliveOnly && p.char.dead) continue;
      const pid = this.zone.hooks.partyIdOf?.(p.char.id) ?? null;
      if (p.char.id === this.ownerCharId || (this.partyId && pid === this.partyId)) out.push(p);
    }
    return out;
  }

  notify(text, extra = {}) {
    for (const p of this.escorts(false)) this.zone.send(p.char.id, { t: 'escort', eid: this.eid, text, hp: Math.ceil(this.hp), mhp: this.mhp, ...extra });
  }

  tick(dt) {
    const z = this.zone;
    const all = this.escorts(false);
    if (all.length) this.lastSeenAt = z.now;
    else if (z.now - this.lastSeenAt > ABANDON_MS) return 'abandoned';
    if (this.state === 'arrived') return this.arrivedAt && z.now - this.arrivedAt > 5000 ? 'done' : null;
    if (this.state === 'broken') {
      if (z.now >= this.brokenUntil) {
        this.reset(this.lastMark);
        this.state = 'waiting';
        // o trecho recomeça com a mesma emboscada assim que alguém voltar para perto
        const mk = this.points[this.lastMark].mark;
        if (mk) { this.ambushDone.delete(mk); this.pendingAmbush = mk; }
        this.notify('A carroça foi consertada e espera no último marco.');
      }
      return null;
    }
    const alive = all.filter((p) => !p.char.dead);
    if (!alive.length && all.length) {
      // todos caídos: a carroça volta ao último marco e espera
      if (this.state !== 'waiting_down') {
        this.reset(this.lastMark);
        this.state = 'waiting_down';
        for (const m of this.zone.monsters.values()) if (m.escortTarget === this.eid && m.state !== 'dead') { m.state = 'dead'; m.hp = 0; m.removeAt = this.zone.now; }
        const mk = this.points[this.lastMark].mark;
        if (mk) { this.ambushDone.delete(mk); this.pendingAmbush = mk; }
        this.notify('Todos caíram: a carroça volta ao último marco.');
      }
      return null;
    }
    const near = alive.some((p) => dist(p.char, this) <= this.def.followRadius);
    if (!near) {
      this.state = 'waiting';
      this.speed = Math.max(0, this.speed - 4 * dt);
      this.vx = 0; this.vz = 0;
      return null;
    }
    this.state = 'moving';
    if (this.pendingAmbush) { const mk = this.pendingAmbush; this.pendingAmbush = null; this.ambush(mk); }
    // monstros em cima da carroça seguram o avanço (ela para enquanto é atacada de perto)
    const blocked = [...z.monsters.values()].some((m) => m.state !== 'dead' && m.escortTarget === this.eid && dist(m, this) < 2.5);
    if (blocked) { this.speed = 0; this.vx = 0; this.vz = 0; return null; }
    if (!this.path || !this.path.length) {
      const goal = this.points[this.next];
      this.path = z.nav.findPath(this.x, this.z, goal.x, goal.z) ?? [{ x: goal.x, z: goal.z }];
    }
    const before = { x: this.x, z: this.z };
    const done = followPath(this, this.path, dt, this.def.speed, { accel: 2, decel: 3, isFree: z.isFreeFn });
    this.vx = (this.x - before.x) / Math.max(dt, 1e-3);
    this.vz = (this.z - before.z) / Math.max(dt, 1e-3);
    if (done) this.reachPoint();
    return null;
  }

  reachPoint() {
    const idx = this.next;
    const pt = this.points[idx];
    this.path = null;
    if (pt.mark) {
      this.lastMark = idx;
      this.notify(`A carroça chegou ao marco ${pt.mark}.`, { mark: pt.mark });
      this.ambush(pt.mark);
    }
    if (idx >= this.points.length - 1) {
      this.state = 'arrived';
      this.arrivedAt = this.zone.now;
      this.speed = 0; this.vx = 0; this.vz = 0;
      const credited = this.escorts(false).filter((p) => dist(p.char, this) <= ARRIVE_CREDIT_R);
      this.notify('A carroça chegou inteira ao fim da rota!', { arrived: true });
      this.zone.hooks.onEscortArrived?.(this, credited);
      return;
    }
    this.next = idx + 1;
  }

  ambush(mark) {
    if (this.ambushDone.has(mark)) return;
    const list = this.def.ambush?.[String(mark)];
    if (!list) return;
    this.ambushDone.add(mark);
    const z = this.zone;
    const ahead = this.points[Math.min(this.next + 1, this.points.length - 1)];
    const dir = { x: ahead.x - this.x, z: ahead.z - this.z };
    const len = Math.hypot(dir.x, dir.z) || 1;
    let k = 0;
    for (const [monster, count] of list) {
      for (let i = 0; i < count; i++, k++) {
        const ang = (k - 1) * 0.8;
        const sx = this.x + (dir.x / len) * 7 * Math.cos(ang) - (dir.z / len) * 7 * Math.sin(ang);
        const sz = this.z + (dir.z / len) * 7 * Math.cos(ang) + (dir.x / len) * 7 * Math.sin(ang);
        const m = z.spawnMonster({ monster, x: sx, z: sz, radius: 1.5, count: 1 }, { noRespawn: true });
        m.escortTarget = this.eid;
        m.temp = true;
        m.state = 'chase';
      }
    }
    this.notify('Emboscada! Protejam a carroça.', { ambush: mark });
  }

  // ataque de um monstro emboscado na carroça (zone.tickMonster chama quando o monstro mira a carroça)
  monsterTick(m, dt, speed, mopts) {
    const z = this.zone;
    const d = dist(m, this);
    if (d > m.def.attackRange) {
      z.chase(m, { x: this.x, z: this.z }, m.def.attackRange * 0.8, speed, dt, mopts);
      return;
    }
    m.speed = 0; m.vx = 0; m.vz = 0;
    if (z.now >= m.nextAttackAt && this.state !== 'broken' && this.state !== 'arrived') {
      m.nextAttackAt = z.now + m.def.attackIntervalMs;
      const res = monsterAttack(m.def, this.stats, z.data, z.rng);
      z.broadcast({ t: 'hit', src: m.eid, dst: this.eid, dmg: res.damage, crit: !!res.crit, miss: !res.hit, skill: null, magic: false });
      if (res.hit) this.damage(res.damage);
    }
  }

  damage(amount) {
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp > 0) return;
    this.state = 'broken';
    this.brokenUntil = this.zone.now + BROKEN_MS;
    this.speed = 0; this.vx = 0; this.vz = 0;
    // os emboscados do trecho somem; o trecho é emboscado de novo quando a carroça voltar a passar
    for (const m of this.zone.monsters.values()) if (m.escortTarget === this.eid && m.state !== 'dead') { m.state = 'dead'; m.hp = 0; m.removeAt = this.zone.now; }
    this.notify('A carroça quebrou! Ela volta ao último marco em instantes.', { broken: true });
  }

  // esc/own/pty: de qual escolta é (o id em map.escorts ou map.defenses, o do campo escort/defense do objeto de
  // missão que a começa) e de quem (dono e grupo): o cliente esconde a carroça parada enquanto a do próprio grupo
  // está na rota (D183)
  view() {
    return { id: this.eid, k: 'e', def: this.def.model ?? 'cart', n: this.def.name, esc: this.defId, own: this.ownerCharId, pty: this.partyId ?? null, x: r2(this.x), z: r2(this.z), vx: r2(this.vx), vz: r2(this.vz), hp: Math.ceil(this.hp), mhp: this.mhp, st: this.state };
  }
}
