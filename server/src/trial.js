// Prova de classe (docs/02-campanha.md §3.3): instância solo por tentativa, com uma regra por classe
// (data/maps.json → arena_prova.trial.classes[classe].kind) que ensina a habilidade do nível 10. Durante a
// prova essa habilidade fica emprestada no grau 1 (p.trialSkill: a zona aceita conjurar e a ficha mostra) e
// a vitória a libera de vez (server.js endTrial). O controlador só usa a API da zona: monstros com os
// ganchos da prova (inert, shieldHit, allyTarget/fixated, noReward), aliados com vida que os monstros
// atacam (TrialAlly, em zone.allies), avisos ('warn') e o estado da prova ('trial'), que o cliente desenha.
import { monsterAttack } from './rules.js';
import { followPath, brake } from './nav.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const r2 = (v) => Math.round(v * 100) / 100;
const STATUS_MS = 500;
const secs = (ms) => Math.max(0, Math.ceil(ms / 1000));

export const TRIAL_KINDS = ['pillars', 'hold', 'rows', 'targets', 'escort', 'course', 'vigil', 'waves'];

// ---------------------------------------------------------------- aliado com vida
// Aprendiz ou peregrino: não é jogador (não vai ao banco), mas tem a mesma forma que as habilidades de aliado
// usam (char, stats, buffs, guards, shield): curar, pôr escudo, Juramento e Reforço de Campo valem nele, e
// zone.damagePlayer aplica o dano com redirecionamento e escudo. Pode andar por uma rota (peregrino).
export class TrialAlly {
  constructor(zone, n, def) {
    this.zone = zone;
    this.eid = `a${n}`;
    this.isAlly = true;
    this.def = def;
    this.model = def.model ?? 'apprentice';
    this.char = { id: `aliado-${n}`, name: def.name, x: def.x, z: def.z, hp: def.hp, dead: false, speed: 0, vx: 0, vz: 0 };
    this.buffs = [];
    this.guards = [];
    this.shield = null;
    this.lastCombatAt = -1e9;
    this.lastHitAt = -1e9;
    this.route = null; // { points: [{x, z, mark}], next, path, speed, followRadius, reached, waiting }
    this.recalc();
  }

  recalc() {
    const mods = {};
    for (const b of this.buffs) for (const [k, v] of Object.entries(b.mods ?? {})) mods[k] = (mods[k] || 0) + v;
    this.stats = {
      level: this.def.level ?? 10, maxHp: this.def.hp,
      defense: Math.floor((this.def.defense ?? 15) * (1 + (mods.defensePct || 0) / 100)),
      evasion: (this.def.evasion ?? 5) + (mods.evasion || 0), mres: this.def.mres ?? 10, blockPct: 0,
      attrs: { str: 0, spi: 0, tal: 0, agi: 0, vit: 0 }, healBonusPct: 0, ccResistPct: 0,
      regenPctMaxHpPerSec: mods.regenPctMaxHpPerSec || 0, moveSpeedPct: mods.moveSpeedPct || 0,
    };
  }

  tick(dt) {
    const z = this.zone, c = this.char;
    if (this.buffs.length) {
      const n = this.buffs.length;
      this.buffs = this.buffs.filter((b) => b.until > z.now);
      if (n !== this.buffs.length) this.recalc();
    }
    if (this.guards.length) this.guards = this.guards.filter((g) => g.until > z.now);
    if (this.shield && this.shield.until <= z.now) this.shield = null;
    if (c.dead) { c.speed = 0; c.vx = 0; c.vz = 0; return; }
    // Guarda da Aurora: regenera uma fração da vida por segundo enquanto durar
    if (this.stats.regenPctMaxHpPerSec) c.hp = Math.min(this.stats.maxHp, c.hp + (this.stats.maxHp * this.stats.regenPctMaxHpPerSec / 100) * dt);
    if (this.route) this.walk(dt);
    else brake(c, dt, 8);
  }

  // Segue a rota só com um jogador por perto e espera, parado, enquanto houver monstro de pé (uma emboscada
  // de cada vez: seguir andando com a anterior viva juntava duas em cima de quem protege).
  walk(dt) {
    const z = this.zone, r = this.route, c = this.char;
    if (r.next >= r.points.length) { brake(c, dt, 6); return; }
    const guarded = [...z.players.values()].some((p) => !p.char.dead && dist(p.char, c) <= r.followRadius);
    const ambush = [...z.monsters.values()].some((m) => m.state !== 'dead' && !m.inert);
    r.waiting = !guarded ? 'far' : ambush ? 'ambush' : null;
    if (r.waiting) { c.speed = 0; c.vx = 0; c.vz = 0; return; }
    if (!r.path || !r.path.length) {
      const g = r.points[r.next];
      r.path = z.nav.findPath(c.x, c.z, g.x, g.z) ?? [{ x: g.x, z: g.z }];
    }
    if (followPath(c, r.path, dt, r.speed, { accel: 3, decel: 4, isFree: z.isFreeFn })) {
      r.path = null;
      r.reached = r.next;
      r.next++;
    }
  }

  // Ataque de um monstro que mira este aliado (zone.tickMonster chama enquanto o monstro está nele).
  monsterTick(m, dt, speed, mopts) {
    const z = this.zone, c = this.char;
    m.targetId = this.eid;
    m.state = 'chase';
    const d = dist(m, c);
    if (d > m.def.attackRange) {
      z.chase(m, m.def.attackRange > 4 ? { x: c.x, z: c.z } : z.attackSlot(m, c, m.def.attackRange), m.def.attackRange > 4 ? m.def.attackRange * 0.8 : 0, speed, dt, mopts);
      return;
    }
    brake(m, dt, mopts.decel * 1.5);
    if (z.now < m.nextAttackAt) return;
    m.nextAttackAt = z.now + m.def.attackIntervalMs;
    const res = monsterAttack(m.def, this.stats, z.data, z.rng);
    this.lastCombatAt = z.now;
    z.broadcast({ t: 'hit', src: m.eid, dst: this.eid, dmg: res.damage, crit: !!res.crit, miss: !res.hit, skill: null, magic: false });
    if (res.hit) z.damagePlayer(this, res.damage, m);
  }

  die() {
    const z = this.zone, c = this.char;
    c.hp = 0; c.dead = true; this.buffs = []; this.guards = []; this.shield = null;
    c.speed = 0; c.vx = 0; c.vz = 0;
    for (const m of z.monsters.values()) if (m.targetId === this.eid) m.targetId = null;
    z.broadcast({ t: 'player_dead', eid: this.eid });
  }

  // fem: corpo do morador no cliente (Aprendiz Lia, Aprendiz Brás...)
  view() {
    const c = this.char;
    return { id: this.eid, k: 'a', def: this.model, n: c.name, fem: !!this.def.fem, x: r2(c.x), z: r2(c.z), vx: r2(c.vx || 0), vz: r2(c.vz || 0), hp: Math.ceil(c.hp), mhp: this.stats.maxHp, dead: !!c.dead, sh: this.shield ? Math.round(this.shield.amount) : 0 };
  }

  // registro para os snapshots por diferença (mesmos grupos de server.js sendSnapshots)
  record() {
    const c = this.char;
    const px = r2(c.x), pz = r2(c.z), vx = r2(c.vx || 0), vz = r2(c.vz || 0);
    return {
      id: this.eid, x: c.x, z: c.z, px, pz, vx, vz,
      A: `"k":"a","def":"${this.model}","n":${JSON.stringify(c.name)},"fem":${!!this.def.fem},"mhp":${this.stats.maxHp}`,
      P: `"x":${px},"z":${pz}`,
      V: `"vx":${vx},"vz":${vz}`,
      C: `"hp":${Math.ceil(c.hp)},"dead":${!!c.dead},"sh":${this.shield ? Math.round(this.shield.amount) : 0}`,
    };
  }
}

// ---------------------------------------------------------------- controlador
export class Trial {
  // returnTo: { mapId, x, z } — onde o personagem volta ao fim (perto do mestre)
  constructor({ key, zone, data, classId, charId, returnTo }) {
    const all = data.maps.arena_prova.trial;
    this.key = key;
    this.zone = zone;
    this.data = data;
    this.classId = classId;
    this.charId = charId;
    this.returnTo = returnTo;
    this.cfg = all.classes[classId];
    this.kind = this.cfg.kind;
    this.rules = KINDS[this.kind];
    this.skill = data.classes[classId].skills.find((s) => data.skills[s].unlockLevel === 10);
    this.timeMs = Math.min(this.cfg.timeMs ?? all.durationMs, all.durationMs);
    this.startedAt = zone.now;
    this.lastStatusAt = -1e9;
    this.allySeq = 0;
    this.marks = [];
    this.s = {};      // estado da regra da classe
    this.alert = null; // aviso urgente na tela ({ text, until })
    this.over = false;
    this.done = false; // server.js endTrial
  }

  get elapsed() { return this.zone.now - this.startedAt; }
  get left() { return Math.max(0, this.timeMs - this.elapsed); }

  // Começa com o jogador já na arena: empresta a habilidade, monta a prova e avisa o cliente.
  start(p) {
    const z = this.zone;
    p.trialSkill = this.skill;
    this.startedAt = z.now;
    this.rules.setup(this, p);
    const s = this.data.skills[this.skill];
    z.send(this.charId, {
      t: 'trial', state: 'started', classId: this.classId, kind: this.kind, title: this.cfg.title, objective: this.cfg.objective,
      hint: this.cfg.hint, skill: this.skill, skillName: s.name, ms: this.timeMs, marks: this.marks, char: z.charView(p),
    });
    z.send(this.charId, { t: 'system', text: `Prova de classe: ${this.cfg.objective} ${s.name} fica emprestada (grau 1) durante a prova.` });
    this.status(p);
  }

  // A cada passo do servidor. Devolve { success, message } quando a prova acaba.
  tick(p) {
    if (this.over) return null;
    const r = this.rules.tick(this, p);
    if (r) return this.finish(r);
    if (this.elapsed >= this.timeMs) return this.finish(this.rules.timeout?.(this, p) ?? { success: false, message: 'O tempo da prova acabou. Fale com o mestre para tentar de novo.' });
    if (this.dirty || this.zone.now - this.lastStatusAt >= STATUS_MS) this.status(p);
    return null;
  }

  finish(r) {
    this.over = true;
    return r;
  }

  say(text) { this.zone.send(this.charId, { t: 'system', text }); }

  warnNow(text, ms = 3000) {
    this.alert = { text, until: this.zone.now + ms };
    this.dirty = true;
  }

  status(p) {
    this.lastStatusAt = this.zone.now;
    this.dirty = false;
    const st = this.rules.status(this, p);
    const alert = this.alert && this.alert.until > this.zone.now ? this.alert.text : null;
    this.zone.send(this.charId, { t: 'trial', state: 'status', kind: this.kind, left: Math.round(this.left), alert, ...st });
  }

  // monstro da prova: sem XP nem saque; "inert" (pilar, boneco, alvo, sino, fagulha) a prova move e confere
  spawn(sp, extra = {}) {
    const m = this.zone.spawnMonster({ monster: sp.monster, x: sp.x, z: sp.z, radius: sp.radius ?? 0, count: 1 }, { noRespawn: true });
    m.noReward = true;
    m.inert = !!m.def.inert;
    const over = {};
    for (const k of ['hp', 'damage', 'moveSpeed']) if (sp[k] !== undefined) over[k] = sp[k];
    if (Object.keys(over).length) { m.def = { ...m.def, ...over }; m.hp = m.def.hp; }
    Object.assign(m, extra);
    return m;
  }

  addAlly(def) {
    const a = new TrialAlly(this.zone, ++this.allySeq, def);
    this.zone.allies.set(a.eid, a);
    return a;
  }

  // dano do ambiente (pedra, fuligem, jato) num jogador ou aliado: passa pelo escudo e pelos guardiões; o
  // 'hit' mostra o que a vida perdeu de fato ("absorvido" quando o escudo segurou tudo)
  hurt(target, amount, skill) {
    const z = this.zone, c = target.char;
    if (c.dead) return 0;
    const before = c.hp;
    z.damagePlayer(target, amount, null);
    const lost = Math.max(0, Math.round(before - Math.max(0, c.hp)));
    z.broadcast({ t: 'hit', src: null, dst: target.eid, dmg: lost, crit: false, miss: false, skill, magic: true, note: lost === 0 ? 'absorvido' : undefined });
    return lost;
  }

  warnCircle(x, zz, radius, ms, kind, color = 'amber') {
    this.zone.broadcast({ t: 'warn', shape: 'circle', x: r2(x), z: r2(zz), radius, ms, kind, color });
  }

  live(list) { return list.filter((m) => m.state !== 'dead'); }
}

const setFx = (m, kind, on) => {
  const has = m.fx.some((f) => f.kind === kind);
  if (on && !has) m.fx.push({ kind, until: Infinity });
  if (!on && has) m.fx = m.fx.filter((f) => f.kind !== kind);
  return has !== on;
};

// Ameaça que esfria: sem golpes novos, o monstro esquece quem bateu e volta para o aliado que mira.
function coolThreat(m, cool, dt) {
  if (!m.threat.size) return;
  for (const [cid, v] of m.threat) {
    const nv = v * (1 - (cool.pctPerSec / 100) * dt) - cool.flatPerSec * dt;
    if (nv <= 0) m.threat.delete(cid); else m.threat.set(cid, nv);
  }
  if (!m.threat.size) m.targetId = null;
}

// ---------------------------------------------------------------- regras por classe
const KINDS = {
  // Quebraferro: três pilares blindados que só a Ruptura racha (de vez); com a mana curta do nível 10, a
  // prova pede pegar dois pilares no mesmo cone. Pedras caem do teto onde o jogador está, com aviso; o
  // teto cede no fim do tempo.
  pillars: {
    setup(t) {
      const c = t.cfg;
      t.s.down = 0;
      t.s.falling = [];
      t.s.debrisAt = t.zone.now + (c.debris.firstMs ?? c.debris.everyMs);
      t.s.batch = null; // pilares rachados pela mesma Ruptura ({ at, n }), para a dica do cone
      t.s.coneTip = false;
      t.s.pillars = c.pillars.map(([x, z]) => {
        const m = t.spawn({ monster: c.monster, x, z });
        m.cracked = false;
        setFx(m, 'armor', true);
        m.shieldHit = (p, skillId) => {
          if (p && skillId === t.skill && !m.cracked) {
            m.cracked = true;
            setFx(m, 'armor', false);
            t.dirty = true;
            if (t.s.batch?.at === t.zone.now) t.s.batch.n++;
            else t.s.batch = { at: t.zone.now, n: 1 };
            return null;
          }
          return m.cracked ? null : 'blindado';
        };
        return m;
      });
    },
    tick(t, p) {
      const z = t.zone, c = t.cfg, s = t.s;
      // Ruptura terminada: quantos pilares o cone pegou (um só, com dois ou mais ainda blindados, ganha a dica)
      if (s.batch && s.batch.at < z.now) {
        const armored = s.pillars.filter((m) => m.state !== 'dead' && !m.cracked).length;
        t.say(s.batch.n > 1 ? `A Ruptura rachou ${s.batch.n} pilares de uma vez: agora os golpes entram.` : 'A Ruptura rachou a blindagem de um pilar: agora os golpes entram.');
        if (s.batch.n === 1 && armored >= 2 && !s.coneTip) {
          s.coneTip = true;
          t.say('Dica: a mana não dá para uma Ruptura por pilar. Sem alvo selecionado (Esc tira a seleção), a Ruptura sai para onde o cursor aponta: de frente para dois pilares, aponte entre eles.');
          t.warnNow('Pegue dois pilares no mesmo cone: aponte a Ruptura entre eles.', 5000);
        }
        s.batch = null;
      }
      const down = s.pillars.filter((m) => m.state === 'dead').length;
      if (down !== s.down) {
        s.down = down;
        t.dirty = true;
        if (down < s.pillars.length) t.say(`Pilar rompido! Faltam ${s.pillars.length - down}.`);
      }
      if (down >= s.pillars.length) return { success: true, message: 'Os três pilares caíram antes do teto. Prova vencida!' };
      if (z.now >= s.debrisAt && !p.char.dead) {
        s.debrisAt = z.now + c.debris.everyMs;
        const fx = p.char.x + (z.rng() - 0.5) * 1.6, fz = p.char.z + (z.rng() - 0.5) * 1.6;
        s.falling.push({ x: fx, z: fz, at: z.now + c.debris.warnMs });
        t.warnCircle(fx, fz, c.debris.radius, c.debris.warnMs, 'rock');
      }
      for (const f of s.falling) {
        if (f.at > z.now) continue;
        f.done = true;
        if (!p.char.dead && dist(p.char, f) <= c.debris.radius + 0.3) t.hurt(p, Math.round((p.stats.maxHp * c.debris.damagePctMaxHp) / 100), 'debris');
      }
      s.falling = s.falling.filter((f) => !f.done);
      return null;
    },
    timeout() { return { success: false, message: 'O teto cedeu antes de os pilares caírem. Fale com o mestre para tentar de novo.' }; },
    status(t) {
      const s = t.s, n = s.pillars.length;
      const armored = s.pillars.filter((m) => m.state !== 'dead' && !m.cracked).length;
      return {
        text: `Pilares rompidos: ${s.down}/${n}`,
        sub: `${armored ? `${armored} ainda blindado${armored > 1 ? 's' : ''} · ` : ''}o teto cede em ${secs(t.left)} s`,
        frac: t.left / t.timeMs, bar: 'Teto',
      };
    },
  },

  // Bastião: um aprendiz no centro; seis construtos que miram nele e esquecem quem bateu se não apanharem de
  // novo; investidas avisadas (rushes; hoje uma, aos 30 s) em que eles largam tudo e vão no aprendiz. Vence
  // quem segura o tempo.
  hold: {
    setup(t) {
      const c = t.cfg;
      t.s.ally = t.addAlly(c.ally);
      t.s.spawns = c.spawns.map((sp) => ({ ...sp, done: false }));
      t.s.rushes = c.rushes.map((at) => ({ at, warned: false, started: false, ended: false }));
      t.s.monsters = [];
    },
    tick(t) {
      const z = t.zone, c = t.cfg, s = t.s, el = t.elapsed;
      if (s.ally.char.dead) return { success: false, message: `${s.ally.char.name} caiu. Fale com o mestre para tentar de novo.` };
      for (const sp of s.spawns) {
        if (sp.done || el < sp.atMs) continue;
        sp.done = true;
        for (let i = 0; i < sp.count; i++) s.monsters.push(t.spawn(sp, { allyTarget: s.ally.eid, state: 'chase' }));
        t.say(`${sp.count} construtos entram na arena atrás do aprendiz!`);
      }
      const live = t.live(s.monsters);
      const dt = (z.lastDt || 100) / 1000;
      for (const m of live) if (!m.fixated) coolThreat(m, c.threatDecay, dt);
      for (const r of s.rushes) {
        if (!r.warned && el >= r.at - c.rushWarnMs) {
          r.warned = true;
          t.warnNow(`Investida em ${secs(c.rushWarnMs)} s! Reforço de Campo perto do aprendiz.`, c.rushWarnMs + c.rushMs);
          t.say(`Os construtos vão investir contra ${s.ally.char.name} em ${secs(c.rushWarnMs)} s!`);
        }
        if (!r.started && el >= r.at) {
          r.started = true;
          const mult = c.rushDamageMult ?? 1;
          for (const m of live) {
            m.threat.clear(); m.targetId = null; m.fixated = true;
            m.baseDamage = m.def.damage;
            m.def = { ...m.def, damage: m.def.damage.map((d) => Math.round(d * mult)) };
          }
          t.warnNow('Investida! Os construtos ignoram você e batem mais forte por alguns segundos.', c.rushMs);
        }
        if (r.started && !r.ended && el >= r.at + c.rushMs) {
          r.ended = true;
          for (const m of s.monsters) {
            m.fixated = false;
            if (m.baseDamage) { m.def = { ...m.def, damage: m.baseDamage }; m.baseDamage = null; }
          }
          t.dirty = true;
        }
      }
      return null;
    },
    timeout(t) { return { success: true, message: `${t.s.ally.char.name} aguentou até o fim. Prova vencida!` }; },
    status(t) {
      const a = t.s.ally;
      const onAlly = t.live(t.s.monsters).filter((m) => m.targetId === a.eid).length;
      return { text: `${a.char.name}: ${Math.ceil(a.char.hp)}/${a.stats.maxHp}`, sub: `${onAlly ? `${onAlly} construto${onAlly > 1 ? 's' : ''} no aprendiz · ` : ''}resista ${secs(t.left)} s`, frac: a.char.hp / a.stats.maxHp, bar: 'Aprendiz', ally: a.eid };
    },
  },

  // Lanceiro: duas filas de bonecos. Boneco caído levanta em standUpMs e o que fica regenAfterMs sem apanhar
  // volta inteiro: a fila só conta com todos no chão ao mesmo tempo (golpes em linha e em área).
  rows: {
    setup(t) {
      const c = t.cfg;
      t.s.rows = c.rows.map((row, ri) => {
        const list = [];
        for (let i = 0; i < row.count; i++) {
          const k = row.count === 1 ? 0 : i / (row.count - 1);
          const m = t.spawn({ monster: c.monster, x: row.from[0] + (row.to[0] - row.from[0]) * k, z: row.from[1] + (row.to[1] - row.from[1]) * k });
          m.row = ri;
          m.hitAt = -1e9;
          m.downAt = null;
          m.shieldHit = () => { m.hitAt = t.zone.now; return null; };
          list.push(m);
        }
        return { list, done: false };
      });
      t.marks = c.rows.map((row, i) => ({ id: `row${i + 1}`, kind: 'line', x: row.from[0], z: row.from[1], x2: row.to[0], z2: row.to[1], label: `Fila ${i + 1}` }));
      // fossos (áreas bloqueadas desta prova, server.js hTrialStart): o cliente desenha a vala
      for (const [i, b] of (c.blocked ?? []).entries()) t.marks.push({ id: `ditch${i + 1}`, kind: 'ditch', x: b.x0, z: b.z0, x2: b.x1, z2: b.z1, label: b.name });
    },
    tick(t) {
      const z = t.zone, c = t.cfg;
      for (const [i, row] of t.s.rows.entries()) {
        if (row.done) continue;
        let down = 0;
        for (const m of row.list) {
          if (m.state === 'dead') { m.downAt ??= z.now; down++; continue; }
          m.downAt = null;
          if (m.hp < m.def.hp && z.now - m.hitAt >= c.regenAfterMs) { m.hp = m.def.hp; t.dirty = true; }
        }
        if (down === row.list.length) {
          row.done = true;
          t.dirty = true;
          const left = t.s.rows.filter((r) => !r.done).length;
          t.say(left ? `Fila ${i + 1} no chão! Falta ${left === 1 ? 'uma fila' : `${left} filas`}.` : `Fila ${i + 1} no chão!`);
          continue;
        }
        for (const m of row.list) {
          if (m.state !== 'dead' || z.now - m.downAt < c.standUpMs) continue;
          m.state = 'idle'; m.hp = m.def.hp; m.downAt = null; m.hitAt = -1e9; m.targetId = null; m.dots = [];
          z.broadcast({ t: 'spawn', eid: m.eid });
          t.dirty = true;
        }
      }
      if (t.s.rows.every((r) => r.done)) return { success: true, message: 'As duas filas caíram. Prova vencida!' };
      return null;
    },
    timeout() { return { success: false, message: 'O tempo acabou com bonecos de pé. Fale com o mestre para tentar de novo.' }; },
    status(t) {
      const rows = t.s.rows;
      const done = rows.filter((r) => r.done).length;
      const cur = rows.find((r) => !r.done);
      const curDown = cur ? cur.list.filter((m) => m.state === 'dead').length : 0;
      return { text: `Filas derrubadas: ${done}/${rows.length}`, sub: cur ? `Fila ${rows.indexOf(cur) + 1}: ${curDown}/${cur.list.length} no chão · ${secs(t.left)} s` : '', frac: t.left / t.timeMs, bar: 'Tempo', marks: rows.map((r, i) => ({ id: `row${i + 1}`, done: r.done })) };
    },
  },

  // Vigia: ondas de alvos correm em trilhos do outro lado da arena; só vale o tiro dado de dentro do posto
  // de tiro. Vence com need alvos derrubados; perde quando os que escaparam tornam isso impossível.
  targets: {
    setup(t) {
      const c = t.cfg;
      t.s.waves = c.waves.map((w) => ({ ...w, spawned: false, list: [] }));
      t.s.total = c.waves.reduce((n, w) => n + w.count, 0);
      t.s.downed = 0;
      t.s.escaped = 0;
      const post = c.post;
      t.marks = [{ id: 'post', kind: 'zone', x: post.x0, z: post.z0, x2: post.x1, z2: post.z1, label: 'Posto de tiro' }];
      t.s.inPost = (pc) => pc.x >= post.x0 && pc.x <= post.x1 && pc.z >= post.z0 && pc.z <= post.z1;
    },
    tick(t, p) {
      const z = t.zone, c = t.cfg, s = t.s, el = t.elapsed;
      const dt = (z.lastDt || 100) / 1000;
      // fora do posto (o ataque automático anda atrás do alvo que saiu do alcance): aviso na tela enquanto durar
      if (!s.inPost(p.char) && s.waves.some((w) => w.spawned && w.list.some((m) => m.state !== 'dead')) && z.now - (s.outWarnAt ?? -1e9) >= 1000) {
        s.outWarnAt = z.now;
        t.warnNow('Fora do posto de tiro: daqui os tiros não valem. Volte para a faixa marcada.', 1200);
      }
      for (const w of s.waves) {
        if (!w.spawned && el >= w.atMs) {
          w.spawned = true;
          const len = Math.hypot(w.to[0] - w.from[0], w.to[1] - w.from[1]);
          w.dir = { x: (w.to[0] - w.from[0]) / len, z: (w.to[1] - w.from[1]) / len };
          w.len = len;
          for (let i = 0; i < w.count; i++) {
            // a fila entra em formação: o primeiro na frente, os outros atrás no mesmo trilho
            const back = i * w.spacing;
            const m = t.spawn({ monster: c.monster, x: w.from[0] + w.dir.x * (w.count - 1) * w.spacing - w.dir.x * back, z: w.from[1] + w.dir.z * (w.count - 1) * w.spacing - w.dir.z * back });
            m.along = (w.count - 1 - i) * w.spacing;
            m.phase = i * 1.3;
            m.wave = w;
            m.shieldHit = (p) => (!p || s.inPost(p.char) ? null : 'fora do posto');
            w.list.push(m);
          }
          t.say(`Alvos no trilho! (${s.waves.indexOf(w) + 1}/${s.waves.length})`);
        }
        if (!w.spawned) continue;
        for (const m of w.list) {
          if (m.state === 'dead') {
            if (!m.counted) { m.counted = true; s.downed++; t.dirty = true; }
            continue;
          }
          m.along += w.speed * dt;
          if (m.along >= w.len) {
            // chegou ao fim do trilho: escapou (some na parede)
            m.state = 'dead'; m.hp = 0; m.counted = true; m.removeAt = z.now;
            s.escaped++;
            t.dirty = true;
            continue;
          }
          const wob = Math.sin((z.now / 1000) * 1.7 + m.phase) * 0.6;
          const nx = w.from[0] + w.dir.x * m.along - w.dir.z * wob;
          const nz = w.from[1] + w.dir.z * m.along + w.dir.x * wob;
          m.vx = (nx - m.x) / dt; m.vz = (nz - m.z) / dt;
          m.x = nx; m.z = nz;
        }
      }
      if (s.downed >= c.need) return { success: true, message: `${s.downed} alvos derrubados do posto de tiro. Prova vencida!` };
      if (s.total - s.escaped < c.need) return { success: false, message: `Alvos demais escaparam (${s.escaped}). Fale com o mestre para tentar de novo.` };
      if (s.waves.every((w) => w.spawned && w.list.every((m) => m.state === 'dead'))) return { success: false, message: `Só ${s.downed} alvos derrubados de ${c.need}. Fale com o mestre para tentar de novo.` };
      return null;
    },
    status(t) {
      const s = t.s, c = t.cfg;
      return { text: `Alvos derrubados: ${s.downed}/${c.need}`, sub: `Escaparam: ${s.escaped} de ${s.total - c.need} que podem escapar · ${secs(t.left)} s`, frac: s.downed / c.need, bar: 'Alvos' };
    },
  },

  // Escudeiro: o peregrino atravessa a arena por uma rota (só anda com o Escudeiro perto e espera parado
  // enquanto a emboscada estiver de pé); em cada marco, uma emboscada mira nele — os atiradores não largam nunca.
  escort: {
    setup(t) {
      const c = t.cfg;
      const a = t.addAlly(c.ally);
      a.route = { points: c.route.map(([x, z, mark]) => ({ x, z, mark: mark ?? null })), next: 0, path: null, speed: c.ally.speed, followRadius: c.ally.followRadius, reached: -1, waiting: null };
      t.s.ally = a;
      t.s.ambushed = new Set();
      t.s.monsters = [];
      t.s.ends = c.route.length;
      t.marks = c.route.map(([x, z, mark], i) => ({ id: `wp${i}`, kind: 'goal', x, z, r: 1.4, label: i === c.route.length - 1 ? 'Portão' : mark ? `Marco ${mark}` : '' })).filter((m) => m.label);
      // o caminho que ele vai fazer, pontilhado no chão
      t.marks.push({ id: 'route', kind: 'path', x: c.ally.x, z: c.ally.z, pts: [[c.ally.x, c.ally.z], ...c.route.map(([x, z]) => [x, z])] });
    },
    tick(t) {
      const c = t.cfg, s = t.s, a = s.ally, r = a.route;
      if (a.char.dead) return { success: false, message: `${a.char.name} caiu. Fale com o mestre para tentar de novo.` };
      const pt = r.points[r.reached];
      if (pt?.mark && !s.ambushed.has(pt.mark)) {
        s.ambushed.add(pt.mark);
        const amb = c.ambush.find((x) => x.at === pt.mark);
        for (const sp of amb?.spawns ?? []) {
          for (let i = 0; i < sp.count; i++) {
            const m = t.spawn(sp, { allyTarget: a.eid, state: 'chase' });
            if (m.def.attackRange > 4) m.fixated = true; // atirador: só mira o peregrino
            s.monsters.push(m);
          }
        }
        if (amb) { t.say(`Emboscada no marco ${pt.mark}! Proteja ${a.char.name}.`); t.warnNow(`Emboscada no marco ${pt.mark}!`, 2500); }
      }
      if (r.next >= r.points.length) return { success: true, message: `${a.char.name} atravessou a arena. Prova vencida!` };
      return null;
    },
    timeout(t) { return { success: false, message: `O tempo acabou antes de ${t.s.ally.char.name} chegar ao portão. Fale com o mestre para tentar de novo.` }; },
    status(t) {
      const a = t.s.ally, r = a.route;
      const fem = !!a.def.fem;
      const why = r.waiting === 'far' ? 'esperando você chegar perto' : r.waiting === 'ambush' ? `${fem ? 'parada' : 'parado'} até a emboscada acabar` : 'andando';
      return { text: `${a.char.name}: ${Math.ceil(a.char.hp)}/${a.stats.maxHp}`, sub: `Trecho ${Math.max(0, r.reached + 1)}/${r.points.length} · ${why} · ${secs(t.left)} s`, frac: a.char.hp / a.stats.maxHp, bar: fem ? 'Peregrina' : 'Peregrino', ally: a.eid };
    },
  },

  // Andarilha: quatro sinos em ordem (só o aceso aceita golpes) e perseguidores que aceleram a cada sino.
  course: {
    setup(t) {
      const c = t.cfg, ch = c.chasers;
      t.s.cur = 0;
      t.s.speed = ch.speedBase;
      t.s.bells = c.bells.map(([x, z], i) => {
        const m = t.spawn({ monster: c.monster, x, z });
        m.bell = i;
        setFx(m, 'idle', i !== 0);
        m.shieldHit = () => (m.bell === t.s.cur ? null : 'apagado');
        return m;
      });
      t.s.chasers = ch.start.map(([x, z]) => t.spawn({ monster: ch.monster, x, z, moveSpeed: ch.speedBase }));
      t.marks = c.bells.map(([x, z], i) => ({ id: `bell${i + 1}`, kind: 'goal', x, z, r: 1.2, label: `${i + 1}`, active: i === 0 }));
    },
    tick(t, p) {
      const z = t.zone, c = t.cfg, ch = c.chasers, s = t.s;
      const bell = s.bells[s.cur];
      if (bell.state !== 'dead') return null;
      s.cur++;
      t.dirty = true;
      if (s.cur >= s.bells.length) return { success: true, message: 'Os quatro sinos tocaram. Prova vencida!' };
      setFx(s.bells[s.cur], 'idle', false);
      s.speed = ch.speedBase + ch.speedPerBell * s.cur;
      for (const m of t.live(s.chasers)) m.def = { ...m.def, moveSpeed: s.speed };
      // reforço: nasce no ponto de entrada mais longe da Andarilha
      const far = [...ch.spawnAt].sort((a, b) => Math.hypot(b[0] - p.char.x, b[1] - p.char.z) - Math.hypot(a[0] - p.char.x, a[1] - p.char.z))[0];
      for (let i = 0; i < ch.addPerBell && t.live(s.chasers).length < (ch.max ?? 99); i++) s.chasers.push(t.spawn({ monster: ch.monster, x: far[0], z: far[1], radius: 1, moveSpeed: s.speed }));
      t.say(`Sino ${s.cur} tocou! Os perseguidores aceleram (${s.speed.toFixed(2).replace('.', ',')} m/s). Próximo: sino ${s.cur + 1}.`);
      return null;
    },
    timeout() { return { success: false, message: 'O tempo acabou antes do último sino. Fale com o mestre para tentar de novo.' }; },
    status(t) {
      const s = t.s;
      return { text: `Sinos: ${s.cur}/${s.bells.length}`, sub: `${t.live(s.chasers).length} perseguidores a ${s.speed.toFixed(2).replace('.', ',')} m/s · ${secs(t.left)} s`, frac: t.left / t.timeMs, bar: 'Tempo', marks: s.bells.map((b, i) => ({ id: `bell${i + 1}`, active: i === s.cur, done: i < s.cur })) };
    },
  },

  // Cantora: três aprendizes sob fuligem (dano contínuo) e jatos de vapor avisados, mais fortes que a vida
  // deles: só o Selo do Véu no aprendiz marcado segura o jato. Vence quem mantém os três de pé até o fim.
  vigil: {
    setup(t) {
      const c = t.cfg;
      t.s.allies = c.allies.map((d) => t.addAlly(d));
      t.s.sootAt = t.zone.now + c.soot.everyMs;
      t.s.jetAt = t.zone.now + c.jets.firstMs;
      t.s.jetIdx = 0;
      t.s.jet = null; // { ally, at }
    },
    tick(t) {
      const z = t.zone, c = t.cfg, s = t.s;
      const lost = () => {
        const fallen = s.allies.find((a) => a.char.dead);
        return fallen ? { success: false, message: `${fallen.char.name} caiu. Fale com o mestre para tentar de novo.` } : null;
      };
      if (lost()) return lost();
      if (z.now >= s.sootAt) {
        s.sootAt += c.soot.everyMs;
        for (const a of s.allies) t.hurt(a, c.soot.damage, 'soot');
      }
      if (!s.jet && z.now >= s.jetAt) {
        const alive = s.allies.filter((a) => !a.char.dead);
        const a = alive[s.jetIdx++ % alive.length];
        s.jet = { ally: a, at: z.now + c.jets.warnMs };
        s.jetAt += c.jets.everyMs;
        t.warnCircle(a.char.x, a.char.z, c.jets.radius, c.jets.warnMs, 'steam');
        t.warnNow(`Jato de vapor em ${a.char.name} em ${secs(c.jets.warnMs)} s: Selo do Véu ${a.def.fem ? 'nela' : 'nele'}!`, c.jets.warnMs);
        t.say(`O vapor vai estourar em ${a.char.name}!`);
      }
      if (s.jet && z.now >= s.jet.at) {
        const a = s.jet.ally;
        s.jet = null;
        t.hurt(a, c.jets.damage, 'steam');
        t.dirty = true;
      }
      // a fuligem e o jato deste passo também derrubam: conferir antes do fim do tempo (a fuligem dos 70 s
      // que derrubasse um aprendiz contava como vitória)
      return lost();
    },
    timeout() { return { success: true, message: 'Os três aprendizes resistiram à fuligem. Prova vencida!' }; },
    status(t) {
      const s = t.s;
      const alive = s.allies.filter((a) => !a.char.dead).length;
      return {
        text: `Aprendizes de pé: ${alive}/${s.allies.length}`, sub: `Resista ${secs(t.left)} s`, frac: t.left / t.timeMs, bar: 'Fuligem',
        allies: s.allies.map((a) => ({ eid: a.eid, n: a.char.name, hp: Math.ceil(a.char.hp), mhp: a.stats.maxHp, sh: a.shield ? Math.round(a.shield.amount) : 0 })),
        jet: s.jet ? { eid: s.jet.ally.eid, ms: Math.max(0, Math.round(s.jet.at - t.zone.now)) } : null,
      };
    },
  },

  // Tecelão: três ondas; as fagulhas correm para a saída e passam pela linha de contenção se ninguém as
  // segurar (enraizar, atordoar e lentidão valem); os construtos da onda caçam o Tecelão.
  waves: {
    setup(t) {
      const c = t.cfg;
      t.s.waves = c.waves.map((w) => ({ ...w, spawned: false, list: [] }));
      t.s.leaks = 0;
      t.s.wave = 0;
      t.marks = [{ id: 'line', kind: 'line', x: 1.5, z: c.line, x2: 34.5, z2: c.line, label: 'Linha de contenção' }];
    },
    tick(t) {
      const z = t.zone, c = t.cfg, s = t.s, el = t.elapsed;
      const dt = (z.lastDt || 100) / 1000;
      for (const [i, w] of s.waves.entries()) {
        if (w.spawned || el < w.atMs) continue;
        w.spawned = true;
        s.wave = i + 1;
        for (const sp of w.spawns) for (let k = 0; k < sp.count; k++) w.list.push(t.spawn(sp));
        t.say(`Onda ${i + 1} de ${s.waves.length}!`);
        t.warnNow(`Onda ${i + 1} de ${s.waves.length}!`, 2000);
      }
      const gate = { x: 18, z: c.line - 3 };
      for (const w of s.waves) {
        for (const m of w.list) {
          if (m.state === 'dead' || !m.inert) continue;
          const stopped = z.monsterFx(m, 'root') || z.monsterFx(m, 'stun');
          const slow = z.monsterFx(m, 'slow');
          const sp = stopped ? 0 : m.def.moveSpeed * (slow ? 1 - slow.pct / 100 : 1);
          const dx = gate.x - m.x, dz = gate.z - m.z, d = Math.hypot(dx, dz) || 1;
          const step = Math.min(d, sp * dt);
          m.vx = (dx / d) * sp; m.vz = (dz / d) * sp;
          m.x += (dx / d) * step; m.z += (dz / d) * step;
          if (m.z <= c.line) {
            m.state = 'dead'; m.hp = 0; m.removeAt = z.now;
            s.leaks++;
            t.dirty = true;
            t.say(`Uma fagulha passou pela linha! (${s.leaks}/${c.leaks})`);
          }
        }
      }
      if (s.leaks >= c.leaks) return { success: false, message: `${s.leaks} fagulhas passaram pela linha de contenção. Fale com o mestre para tentar de novo.` };
      if (s.waves.every((w) => w.spawned && w.list.every((m) => m.state === 'dead'))) return { success: true, message: 'As três ondas foram contidas. Prova vencida!' };
      return null;
    },
    timeout() { return { success: false, message: 'O tempo acabou com fagulhas na arena. Fale com o mestre para tentar de novo.' }; },
    status(t) {
      const s = t.s, c = t.cfg;
      const live = s.waves.reduce((n, w) => n + t.live(w.list).length, 0);
      return { text: `Onda ${s.wave}/${s.waves.length} · na arena: ${live}`, sub: `Passaram: ${s.leaks}/${c.leaks} · ${secs(t.left)} s`, frac: 1 - s.leaks / c.leaks, bar: 'Contenção' };
    },
  },
};
