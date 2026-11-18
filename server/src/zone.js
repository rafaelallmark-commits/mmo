// Simulação autoritativa de uma zona (um mapa ou uma instância). Roda num único laço:
// toda alteração de estado de personagem acontece aqui, em ordem, o que serializa operações
// simultâneas do mesmo personagem.
import { randomUUID } from 'node:crypto';
import {
  derivedStats, playerAttack, monsterAttack, splitKillXp, levelForXp, rankCap, totalAttributePoints, rollInt, mitigate,
} from './rules.js';
import { equippedList, bagCount, BAG_CAPACITY } from './equipment.js';
import { executeSkill, IMPLEMENTED_KINDS } from './skills.js';
import { makeRng } from './rng.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const r2 = (v) => Math.round(v * 100) / 100;
const LOOT_TTL_MS = 30 * 60 * 1000;
const NPC_RANGE = 6;
const OBJECT_RANGE = 3.5;

export class Zone {
  // hooks: { send(charId,msg), broadcast(msg) [só esta zona], partyIdOf(charId), onKillCredit(p, monsterDefId), onLevelUp(p) }
  constructor({ mapId, data, store, rng = makeRng(1), xpRate = 1, send, broadcast, hooks = {}, instanceId = null, mapOverride = null }) {
    this.mapId = mapId;
    this.instanceId = instanceId;
    this.map = mapOverride ?? data.maps[mapId];
    this.data = data;
    this.f = data.formulas;
    this.store = store;
    this.rng = rng;
    this.xpRate = xpRate;
    this.send = send;
    this.broadcast = broadcast;
    this.hooks = hooks;
    this.now = 0;
    this.players = new Map(); // charId -> player
    this.monsters = new Map(); // eid -> monster
    this.groundEffects = [];
    this.npcs = this.map.npcs ?? [];
    this.objects = this.map.objects ?? [];
    this.portals = this.map.portals ?? [];
    this.monsterSeq = 0;
    for (const sp of this.map.spawns ?? []) for (let i = 0; i < sp.count; i++) this.spawnMonster(sp);
  }

  get key() { return this.instanceId ?? this.mapId; }

  spawnMonster(sp, opts = {}) {
    const def = this.data.monsters[sp.monster];
    const m = { eid: `m${this.instanceId ? this.instanceId.slice(0, 4) : ''}${++this.monsterSeq}`, defId: sp.monster, def, spawn: sp, hp: def.hp, state: 'idle', threat: new Map(), score: new Map(), dots: [], fx: [], nextAttackAt: 0, wanderAt: 0, noRespawn: !!opts.noRespawn };
    this.placeMonster(m);
    this.monsters.set(m.eid, m);
    return m;
  }

  placeMonster(m) {
    const a = this.rng() * Math.PI * 2, d = Math.sqrt(this.rng()) * m.spawn.radius;
    m.x = m.spawn.x + Math.cos(a) * d; m.z = m.spawn.z + Math.sin(a) * d;
    m.home = { x: m.x, z: m.z };
    m.hp = m.def.hp; m.state = 'idle'; m.targetId = null; m.threat.clear(); m.score.clear(); m.dots = []; m.fx = []; m.dest = null;
  }

  // ---------- jogadores ----------
  addPlayer(char) {
    const p = { eid: `p${char.id}`, char, zone: this, cooldowns: {}, buffs: [], guards: [], shield: null, nextAttackPct: 0, targetId: null, dest: null, nextAttackAt: 0, lastCombatAt: -1e9, potionReadyAt: 0, facing: { x: 1, z: 0 } };
    if (char.dead) this.respawnAtPost(p, false); // caiu (ou desconectou) morto: restaura no posto
    if (!this.inBounds(char.x, char.z) || this.isBlocked(char.x, char.z)) { char.x = this.map.spawnPoint.x; char.z = this.map.spawnPoint.z; }
    char.mapId = this.mapId;
    this.grantUnlockedSkills(char);
    this.players.set(char.id, p);
    this.recalc(p);
    char.hp = Math.min(char.hp, p.stats.maxHp); char.mp = Math.min(char.mp, p.stats.maxMp);
    return p;
  }

  removePlayer(charId, save = true) {
    const p = this.players.get(charId);
    if (!p) return null;
    this.players.delete(charId);
    for (const m of this.monsters.values()) {
      m.threat.delete(charId);
      if (m.targetId === p.eid) m.targetId = null;
    }
    for (const o of this.players.values()) o.guards = o.guards.filter((g) => g.guardianId !== charId);
    if (save) this.store.saveCharacter(p.char);
    return p;
  }

  recalc(p) {
    const buffs = {};
    for (const b of p.buffs) for (const [k, v] of Object.entries(b.mods)) buffs[k] = (buffs[k] || 0) + v;
    p.stats = derivedStats(p.char, equippedList(p.char, this.data).map((e) => ({ def: e.def, enh: e.enh })), this.data, buffs);
    p.char.hp = Math.min(p.char.hp, p.stats.maxHp);
    p.char.mp = Math.min(p.char.mp, p.stats.maxMp);
  }

  grantUnlockedSkills(char) {
    const cls = this.data.classes[char.classId];
    let changed = false;
    for (const sid of cls.skills) {
      const s = this.data.skills[sid];
      // a habilidade do nível 10 é liberada pela prova de classe, não pelo nível
      if (s.unlockLevel === 10 && !char.trialDone) continue;
      if (s.unlockLevel <= char.level && !char.skills[sid]) { char.skills[sid] = this.data.skillRules.unlockGivesRank; changed = true; }
    }
    return changed;
  }

  // XP vindo de abates ou missões. Retorna true se subiu de nível.
  grantXp(p, amount) {
    const c = p.char;
    c.xp += amount;
    const lvl = levelForXp(c.xp, this.data);
    if (lvl <= c.level) return false;
    const gained = lvl - c.level;
    c.level = lvl;
    c.unspent += gained * this.data.pointsPerLevel;
    c.skillPoints += gained * this.data.skillPointsPerLevel;
    this.grantUnlockedSkills(c);
    this.recalc(p);
    c.hp = p.stats.maxHp; c.mp = p.stats.maxMp;
    return true;
  }

  inBounds(x, z) {
    const [w, h] = this.map.size;
    return x >= 0 && z >= 0 && x <= w && z <= h;
  }

  isBlocked(x, z) {
    return (this.map.blocked ?? []).some((b) => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1);
  }

  inSafeZone(pos) {
    return dist(pos, this.map.guardPost) <= this.map.guardPost.safeRadius;
  }

  entityById(eid) {
    if (eid?.startsWith('p')) return this.players.get(Number(eid.slice(1))) ?? null;
    return this.monsters.get(eid) ?? null;
  }

  npcNear(p, npcId) {
    const n = this.npcs.find((x) => x.id === npcId);
    if (!n) return null;
    return dist(p.char, n) <= NPC_RANGE ? n : null;
  }

  objectNear(p, objectId) {
    const o = this.objects.find((x) => x.id === objectId);
    if (!o) return null;
    return dist(p.char, o) <= OBJECT_RANGE ? o : null;
  }

  // ---------- comandos (validados) ----------
  cmdMove(p, x, z) {
    if (p.char.dead) return { ok: false, code: 'dead', reason: 'Você está caído. Volte ao posto de guarda.' };
    if (typeof x !== 'number' || typeof z !== 'number' || !Number.isFinite(x) || !Number.isFinite(z)) return { ok: false, code: 'bad_request', reason: 'Destino inválido.' };
    if (!this.inBounds(x, z)) return { ok: false, code: 'out_of_bounds', reason: 'Destino fora do mapa.' };
    if (this.isBlocked(x, z)) return { ok: false, code: 'blocked', reason: 'Não dá para chegar ali.' };
    p.dest = { x, z }; p.targetId = null;
    return { ok: true };
  }

  cmdAttack(p, targetId) {
    if (p.char.dead) return { ok: false, code: 'dead', reason: 'Você está caído.' };
    const m = this.monsters.get(targetId);
    if (!m || m.state === 'dead') return { ok: false, code: 'bad_target', reason: 'Alvo inválido.' };
    p.targetId = targetId; p.dest = null;
    return { ok: true };
  }

  cmdStop(p) { p.targetId = null; p.dest = null; return { ok: true }; }

  cmdPortal(p, portalId) {
    const pt = this.portals.find((x) => x.id === portalId);
    if (!pt) return { ok: false, code: 'bad_portal', reason: 'Passagem inexistente.' };
    if (p.char.dead) return { ok: false, code: 'dead', reason: 'Você está caído.' };
    if (dist(p.char, pt) > pt.radius + 1.5) return { ok: false, code: 'too_far', reason: `Chegue mais perto de ${pt.name}.` };
    if (p.char.level < (pt.minLevel || 1)) return { ok: false, code: 'level', reason: `Nível ${pt.minLevel} exigido para ${this.data.maps[pt.to]?.name ?? pt.to}. Seu nível atual é ${p.char.level}.` };
    return { ok: true, to: pt.to, x: pt.toX, z: pt.toZ };
  }

  cmdCast(p, skillId, targetId, x, z, allyId) {
    const s = this.data.skills[skillId];
    const c = p.char;
    if (c.dead) return { ok: false, code: 'dead', reason: 'Você está caído.' };
    if (!s || s.classId !== c.classId) return { ok: false, code: 'bad_skill', reason: 'Habilidade desconhecida para sua classe.' };
    const rank = c.skills[skillId] || 0;
    if (rank < 1) {
      if (s.unlockLevel === 10 && c.level >= 10) return { ok: false, code: 'not_learned', reason: `${s.name} é liberada pela prova de classe.` };
      return { ok: false, code: 'not_learned', reason: `Nível ${s.unlockLevel} exigido para ${s.name}. Seu nível atual é ${c.level}.` };
    }
    if (!IMPLEMENTED_KINDS.has(s.effect.kind)) return { ok: false, code: 'not_implemented', reason: 'Habilidade ainda não implementada neste marco.' };
    const ready = p.cooldowns[skillId] || 0;
    if (this.now < ready) return { ok: false, code: 'cooldown', reason: `${s.name} em recarga (${((ready - this.now) / 1000).toFixed(1)} s).` };
    const cost = s.mp + (s.mpPerRank || 0) * (rank - 1);
    if (c.mp < cost) return { ok: false, code: 'no_mana', reason: `Mana insuficiente: ${cost} necessária, você tem ${Math.floor(c.mp)}.` };
    const range = s.range === 'weapon' ? p.stats.range : s.range;
    const tol = this.f.movement.rangeTolerance;
    let target = null, ally = null;
    const needsEnemy = s.target === 'enemy' || ['charge'].includes(s.effect.kind);
    if (needsEnemy) {
      target = this.monsters.get(targetId);
      if (!target || target.state === 'dead') return { ok: false, code: 'bad_target', reason: 'Alvo inválido.' };
      const d = dist(c, target);
      if (d > range + tol) return { ok: false, code: 'out_of_range', reason: `Alvo fora de alcance (${d.toFixed(1)} m; alcance ${range} m).` };
    } else if (['cone', 'line'].includes(s.target)) {
      target = targetId ? this.monsters.get(targetId) ?? null : null;
      if (target?.state === 'dead') target = null;
    } else if (s.target === 'ground') {
      if (typeof x !== 'number' || typeof z !== 'number') return { ok: false, code: 'bad_request', reason: 'Escolha um ponto no chão.' };
      if (Math.hypot(x - c.x, z - c.z) > range + tol) return { ok: false, code: 'out_of_range', reason: `Ponto fora de alcance (alcance ${range} m).` };
    } else if (s.target === 'ally') {
      ally = allyId ? this.entityById(allyId) : p;
      if (!ally || !ally.char || ally.char.dead) return { ok: false, code: 'bad_target', reason: 'Aliado inválido.' };
      if (ally !== p && dist(c, ally.char) > range + tol) return { ok: false, code: 'out_of_range', reason: `Aliado fora de alcance (alcance ${range} m).` };
    }
    const res = executeSkill(this, p, s, rank, { target, x, z, ally });
    if (!res.ok) return res;
    c.mp -= cost;
    p.cooldowns[skillId] = this.now + s.cooldownMs;
    p.lastCombatAt = this.now;
    if (target && target.state !== 'dead' && needsEnemy) p.targetId = target.eid;
    this.broadcast({ t: 'cast', eid: p.eid, skill: skillId, target: target?.eid ?? ally?.eid ?? null, x: typeof x === 'number' ? r2(x) : undefined, z: typeof z === 'number' ? r2(z) : undefined });
    return { ok: true, mp: Math.floor(c.mp), cooldownMs: s.cooldownMs, hits: res.hits };
  }

  cmdUseItem(p, instanceId) {
    const c = p.char;
    const it = c.items.get(instanceId);
    if (!it || it.loc !== 'bag') return { ok: false, code: 'not_in_bag', reason: 'Item não encontrado no seu inventário.' };
    const def = this.data.items[it.defId];
    if (def.kind !== 'consumable') return { ok: false, code: 'not_usable', reason: 'Este item não pode ser usado.' };
    if (c.dead) return { ok: false, code: 'dead', reason: 'Você está caído.' };
    if (this.now < p.potionReadyAt) return { ok: false, code: 'cooldown', reason: `Tônicos em recarga (${((p.potionReadyAt - this.now) / 1000).toFixed(1)} s).` };
    p.potionReadyAt = this.now + this.f.potions.sharedCooldownMs;
    if (def.use.healHp) c.hp = Math.min(p.stats.maxHp, c.hp + def.use.healHp);
    if (def.use.healMp) c.mp = Math.min(p.stats.maxMp, c.mp + def.use.healMp);
    it.qty -= 1;
    c.potionsUsed = (c.potionsUsed || 0) + 1;
    this.store.tx(() => {
      if (it.qty <= 0) { c.items.delete(it.id); this.store.deleteItem(c.id, it.id); } else this.store.saveItems(c.id, [it]);
      this.store.saveCharacter(c);
    });
    return { ok: true, hp: Math.floor(c.hp), mp: Math.floor(c.mp), remaining: Math.max(0, it.qty) };
  }

  respawnAtPost(p, announce = true) {
    const c = p.char;
    const gp = this.map.guardPost;
    const st = p.stats ?? derivedStats(c, equippedList(c, this.data).map((e) => ({ def: e.def, enh: e.enh })), this.data);
    c.dead = false; c.x = gp.x + (this.rng() - 0.5) * 4; c.z = gp.z + (this.rng() - 0.5) * 4;
    c.hp = Math.max(1, Math.round(st.maxHp * this.f.death.respawnHpPct / 100));
    c.mp = Math.max(c.mp, Math.round(st.maxMp * this.f.death.respawnMpPct / 100));
    p.targetId = null; p.dest = null;
    this.store.saveCharacter(c);
    if (announce) this.broadcast({ t: 'respawn', eid: p.eid, x: r2(c.x), z: r2(c.z) });
  }

  cmdRespawn(p) {
    if (!p.char.dead) return { ok: false, code: 'not_dead', reason: 'Você não está caído.' };
    this.respawnAtPost(p);
    return { ok: true };
  }

  cmdLearnSkill(p, skillId) {
    const c = p.char;
    const s = this.data.skills[skillId];
    if (!s || s.classId !== c.classId) return { ok: false, code: 'bad_skill', reason: 'Habilidade desconhecida para sua classe.' };
    if (c.level < s.unlockLevel) return { ok: false, code: 'level', reason: `Nível ${s.unlockLevel} exigido. Seu nível atual é ${c.level}.` };
    const rank = c.skills[skillId] || 0;
    if (rank === 0) return { ok: false, code: 'locked', reason: s.unlockLevel === 10 ? 'Vença a prova de classe para liberar esta habilidade.' : 'Habilidade ainda não liberada.' };
    const cap = rankCap(c.level, this.data);
    if (rank >= cap) return { ok: false, code: 'rank_cap', reason: `Grau máximo para o nível ${c.level} é ${cap}.` };
    if (c.skillPoints < 1) return { ok: false, code: 'no_points', reason: 'Sem pontos de habilidade.' };
    c.skillPoints -= 1; c.skills[skillId] = rank + 1;
    this.store.saveCharacter(c);
    return { ok: true, rank: rank + 1 };
  }

  // ---------- serviços para skills.js ----------
  monstersInCircle(x, z, r) {
    const out = [];
    for (const m of this.monsters.values()) if (m.state !== 'dead' && Math.hypot(m.x - x, m.z - z) <= r) out.push(m);
    return out;
  }

  alliesNear(p, r) {
    const out = [p];
    const pid = this.hooks.partyIdOf?.(p.char.id);
    if (pid == null) return out;
    for (const o of this.players.values()) {
      if (o !== p && !o.char.dead && this.hooks.partyIdOf(o.char.id) === pid && dist(o.char, p.char) <= r) out.push(o);
    }
    return out;
  }

  teleportSafe(p, x, z) {
    const [w, h] = this.map.size;
    x = Math.max(0, Math.min(w, x)); z = Math.max(0, Math.min(h, z));
    if (!this.isBlocked(x, z)) { p.char.x = x; p.char.z = z; p.dest = null; }
  }

  pullMonster(m, p, keep) {
    const dx = m.x - p.char.x, dz = m.z - p.char.z;
    const d = Math.hypot(dx, dz) || 1;
    const nx = p.char.x + (dx / d) * keep, nz = p.char.z + (dz / d) * keep;
    if (!this.isBlocked(nx, nz)) { m.x = nx; m.z = nz; }
  }

  pushMonster(m, from, meters) {
    const dx = m.x - from.x, dz = m.z - from.z;
    const d = Math.hypot(dx, dz) || 1;
    const nx = m.x + (dx / d) * meters, nz = m.z + (dz / d) * meters;
    if (this.inBounds(nx, nz) && !this.isBlocked(nx, nz)) { m.x = nx; m.z = nz; }
  }

  addBuff(p, buff) {
    p.buffs = p.buffs.filter((b) => b.id !== buff.id);
    p.buffs.push(buff);
    this.recalc(p);
    this.broadcast({ t: 'buff', eid: p.eid, skill: buff.id, ms: Math.round(buff.until - this.now) });
  }

  addGuard(ally, guardian, pct, until, skillId) {
    ally.guards = ally.guards.filter((g) => g.guardianId !== guardian.char.id);
    ally.guards.push({ guardianId: guardian.char.id, pct, until, skillId });
  }

  addMonsterFx(m, fx) {
    m.fx = m.fx.filter((f) => f.kind !== fx.kind);
    m.fx.push(fx);
  }

  monsterFx(m, kind) {
    return m.fx.find((f) => f.kind === kind && f.until > this.now) ?? null;
  }

  addDot(m, ownerId, dps, durationMs) {
    m.dots.push({ ownerId, dps, until: this.now + durationMs, nextAt: this.now + 1000 });
  }

  addGroundEffect(p, s, rank, x, z) {
    const eff = s.effect;
    this.groundEffects.push({ ownerId: p.char.id, skillId: s.id, rank, x, z, radius: eff.radius, pulses: eff.pulses, intervalMs: eff.intervalMs, nextAt: this.now });
    this.broadcast({ t: 'ground', skill: s.id, x: r2(x), z: r2(z), radius: eff.radius, ms: eff.pulses * eff.intervalMs, by: p.eid });
  }

  // participação: soma ao placar do monstro (usado para XP e saque)
  credit(m, charId, amount) {
    if (amount > 0 && m.state !== 'dead') m.score.set(charId, (m.score.get(charId) || 0) + amount);
  }

  creditControl(m, p, seconds) {
    this.credit(m, p.char.id, seconds * this.f.xp.participation.controlSeconds);
  }

  // cura/escudo: crédito nos monstros engajados com o aliado ajudado
  creditSupport(p, ally, amount) {
    const engaged = [...this.monsters.values()].filter((m) => m.state !== 'dead' && (m.targetId === ally.eid || m.threat.has(ally.char.id)));
    if (!engaged.length) return;
    for (const m of engaged) {
      this.credit(m, p.char.id, (amount * this.f.xp.participation.healing) / engaged.length);
      m.threat.set(p.char.id, (m.threat.get(p.char.id) || 0) + (amount * this.f.threat.healingPerHp) / engaged.length);
    }
  }

  healPlayer(p, ally, amount) {
    const before = ally.char.hp;
    ally.char.hp = Math.min(ally.stats.maxHp, ally.char.hp + amount);
    const healed = Math.round(ally.char.hp - before);
    p.char.healingDone = (p.char.healingDone || 0) + healed;
    this.creditSupport(p, ally, healed);
    this.broadcast({ t: 'heal', src: p.eid, dst: ally.eid, amount: healed });
    return healed;
  }

  sacredDamage(p, m, flat) {
    const dmg = mitigate(flat, m.def.mres, p.char.level, this.data);
    this.broadcast({ t: 'hit', src: p.eid, dst: m.eid, dmg, crit: false, miss: false, skill: 'sacred', magic: true });
    this.damageMonster(m, p.char.id, dmg);
  }

  // ---------- simulação ----------
  tick(dtMs) {
    this.now += dtMs;
    const dt = dtMs / 1000;
    for (const p of this.players.values()) this.tickPlayer(p, dt);
    for (const m of this.monsters.values()) this.tickMonster(m, dt);
    this.tickGround();
  }

  moveToward(e, tx, tz, speed, dt, stopAt = 0) {
    const dx = tx - e.x, dz = tz - e.z;
    const d = Math.hypot(dx, dz);
    if (d <= stopAt + 1e-6) return true;
    const step = Math.min(speed * dt, d - stopAt);
    const nx = e.x + (dx / d) * step, nz = e.z + (dz / d) * step;
    if (this.isBlocked(nx, nz)) return true; // obstáculo: para (sem pathfinding ainda)
    e.x = nx; e.z = nz;
    return d - step <= stopAt + 1e-6;
  }

  tickPlayer(p, dt) {
    const c = p.char;
    if (c.dead) return;
    if (p.buffs.length) {
      const before = p.buffs.length;
      p.buffs = p.buffs.filter((b) => b.until > this.now);
      if (p.buffs.length !== before) this.recalc(p);
    }
    if (p.guards.length) p.guards = p.guards.filter((g) => g.until > this.now);
    if (p.shield && p.shield.until <= this.now) p.shield = null;
    const speed = this.f.movement.playerSpeed * (1 + (p.stats.moveSpeedPct || 0) / 100);
    const ox = c.x, oz = c.z;
    if (p.targetId) {
      const t = this.monsters.get(p.targetId);
      if (!t || t.state === 'dead') { p.targetId = null; }
      else {
        const range = p.stats.range;
        const d = dist(c, t);
        if (d > range) this.moveToward(c, t.x, t.z, speed, dt, Math.max(0.5, range - 0.3));
        else if (this.now >= p.nextAttackAt) {
          p.nextAttackAt = this.now + p.stats.attackIntervalMs;
          p.lastCombatAt = this.now;
          this.hitMonster(p, t, null, null);
        }
        p.facing = { x: (t.x - c.x) / (d || 1), z: (t.z - c.z) / (d || 1) };
      }
    } else if (p.dest) {
      if (this.moveToward(c, p.dest.x, p.dest.z, speed, dt)) p.dest = null;
    }
    if (c.x !== ox || c.z !== oz) {
      const md = Math.hypot(c.x - ox, c.z - oz);
      p.facing = { x: (c.x - ox) / md, z: (c.z - oz) / md };
    }
    const r = this.f.regen;
    const factor = this.now - p.lastCombatAt > r.outOfCombatAfterMs ? 1 : r.inCombatFactor;
    c.hp = Math.min(p.stats.maxHp, c.hp + ((p.stats.maxHp * r.hpPctPerSec / 100) * factor + (p.stats.maxHp * (p.stats.regenPctMaxHpPerSec || 0) / 100)) * dt);
    c.mp = Math.min(p.stats.maxMp, c.mp + ((p.stats.maxMp * r.mpPctPerSec / 100) + p.stats.attrs.spi * r.mpPerSpiPerSec) * dt * factor);
  }

  monsterCombatStats(m) {
    const dd = this.monsterFx(m, 'defenseDown');
    const mark = this.monsterFx(m, 'mark');
    return {
      level: m.def.level,
      defense: Math.round(m.def.defense * (1 - (dd?.pct || 0) / 100)),
      mres: m.def.mres,
      evasion: Math.max(0, m.def.evasion - (mark?.evasionDown || 0)),
    };
  }

  // Ataque de jogador (básico se skill = null). Aplica dano, ameaça e participação.
  hitMonster(p, m, skill, skillId) {
    if (m.state === 'dead') return { hit: false, damage: 0 };
    let stats = p.stats;
    if (p.nextAttackPct && (!skill || skill.def.effect.damageType !== 'magic')) {
      stats = { ...stats, physDamagePct: (stats.physDamagePct || 0) + p.nextAttackPct };
      p.nextAttackPct = 0;
    }
    const res = playerAttack(stats, this.monsterCombatStats(m), this.data, this.rng, skill ?? undefined);
    if (res.hit && !res.magic) {
      const mark = this.monsterFx(m, 'mark');
      if (mark) res.damage = Math.round(res.damage * (1 + mark.physDamageTakenPct / 100));
    }
    this.broadcast({ t: 'hit', src: p.eid, dst: m.eid, dmg: res.damage, crit: !!res.crit, miss: !res.hit, skill: skillId, magic: !!res.magic });
    if (!res.hit) { this.addThreat(m, p, 1); return res; }
    this.damageMonster(m, p.char.id, res.damage);
    return res;
  }

  addThreat(m, p, amount) {
    m.threat.set(p.char.id, (m.threat.get(p.char.id) || 0) + amount);
    if (m.state === 'idle' || m.state === 'return') m.state = 'chase';
    if (!m.targetId) m.targetId = p.eid;
  }

  damageMonster(m, charId, dmg) {
    if (m.state === 'dead') return;
    const p = this.players.get(charId);
    const real = Math.min(dmg, m.hp);
    m.hp -= real;
    this.credit(m, charId, real * this.f.xp.participation.damage);
    if (p) {
      this.addThreat(m, p, dmg * (this.f.threat.classMult[p.char.classId] || 1));
      if (m.def.aggro === 'aggressive') {
        for (const o of this.monsters.values()) {
          if (o !== m && o.defId === m.defId && o.state === 'idle' && dist(o, m) <= 8) { o.state = 'chase'; o.targetId = p.eid; o.threat.set(charId, this.f.threat.proximityAggro); }
        }
      }
    }
    if (m.hp <= 0) this.killMonster(m);
  }

  killMonster(m) {
    m.state = 'dead'; m.hp = 0; m.targetId = null;
    m.respawnAt = m.def.respawnSec > 0 && !m.noRespawn ? this.now + m.def.respawnSec * 1000 : Infinity;
    this.broadcast({ t: 'death', eid: m.eid });
    const radius = this.f.xp.shareRadius;
    const near = (p) => p && !p.char.dead && dist(p.char, m) <= radius;
    // participantes diretos + membros de grupo próximos (mesmo sem participação)
    const contrib = new Map();
    for (const [charId, score] of m.score) {
      const p = this.players.get(charId);
      if (!near(p)) continue;
      contrib.set(charId, { charId, level: p.char.level, score, partyId: this.hooks.partyIdOf?.(charId) ?? null });
    }
    for (const c of [...contrib.values()]) {
      if (c.partyId == null) continue;
      for (const o of this.players.values()) {
        if (!contrib.has(o.char.id) && near(o) && this.hooks.partyIdOf(o.char.id) === c.partyId) contrib.set(o.char.id, { charId: o.char.id, level: o.char.level, score: 0, partyId: c.partyId });
      }
    }
    const split = splitKillXp(m.def, [...contrib.values()], this.data, this.xpRate);
    const killId = randomUUID();
    const nowWall = Date.now();
    const notifications = [];
    this.store.tx(() => {
      for (const s of split) {
        const p = this.players.get(s.charId);
        const c = p.char;
        const lvlBefore = c.level;
        this.grantXp(p, s.xp);
        this.store.saveCharacter(c);
        const drops = s.lootEligible ? this.rollLoot(m, c) : [];
        for (const d of drops) {
          const row = { id: randomUUID(), charId: c.id, defId: d.defId, qty: d.qty, gold: d.gold, mapId: this.mapId, x: r2(m.x + (this.rng() - 0.5) * 2), z: r2(m.z + (this.rng() - 0.5) * 2), monsterDef: m.defId, killId, createdAt: nowWall, expiresAt: nowWall + LOOT_TTL_MS };
          this.store.insertLoot(row);
          d.row = row;
        }
        notifications.push({ p, s, lvlBefore, drops });
      }
    });
    for (const { p, s, lvlBefore, drops } of notifications) {
      const c = p.char;
      this.send(c.id, { t: 'xp', gained: s.xp, share: Math.round(s.share * 100) / 100, xp: c.xp, level: c.level, monster: m.defId });
      if (c.level > lvlBefore) {
        this.broadcast({ t: 'level_up', eid: p.eid, level: c.level });
        this.send(c.id, { t: 'char', char: this.charView(p) });
      }
      for (const d of drops) this.send(c.id, { t: 'loot', loot: lootView(d.row) });
      this.hooks.onKillCredit?.(p, m.defId);
    }
  }

  rollLoot(m, char) {
    const table = this.data.lootTables[m.def.lootTable];
    if (!table) return [];
    const out = [];
    for (const e of table.entries) {
      if (this.rng() >= e.chance) continue;
      if (e.type === 'gold') out.push({ defId: null, qty: 0, gold: rollInt(this.rng, e.min, e.max) });
      else if (e.type === 'item') out.push({ defId: e.defId, qty: rollInt(this.rng, e.min, e.max), gold: 0 });
      else if (e.type === 'pool') out.push({ defId: e.pool[Math.floor(this.rng() * e.pool.length)], qty: 1, gold: 0 });
      else if (e.type === 'classDrop' && e.byClass[char.classId]) out.push({ defId: e.byClass[char.classId], qty: 1, gold: 0 });
    }
    return out;
  }

  tickMonster(m, dt) {
    if (m.state === 'dead') {
      if (this.now >= m.respawnAt) { this.placeMonster(m); this.broadcast({ t: 'spawn', eid: m.eid }); }
      return;
    }
    if (m.dots.length) {
      for (const d of m.dots) {
        while (d.nextAt <= this.now && d.nextAt <= d.until && m.state !== 'dead') {
          d.nextAt += 1000;
          const real = Math.max(1, Math.round(d.dps));
          this.broadcast({ t: 'hit', src: `p${d.ownerId}`, dst: m.eid, dmg: real, crit: false, miss: false, skill: 'dot', magic: false });
          this.damageMonster(m, d.ownerId, real);
        }
      }
      m.dots = m.dots.filter((d) => d.nextAt <= d.until);
      if (m.state === 'dead') return;
    }
    if (m.fx.length) m.fx = m.fx.filter((f) => f.until > this.now);
    const rooted = !!this.monsterFx(m, 'root');
    const slow = this.monsterFx(m, 'slow');
    const speed = rooted ? 0 : m.def.moveSpeed * (slow ? 1 - slow.pct / 100 : 1);
    if (m.state === 'return') {
      if (this.moveToward(m, m.home.x, m.home.z, m.def.moveSpeed * 1.5, dt)) { m.state = 'idle'; m.hp = m.def.hp; m.score.clear(); }
      return;
    }
    let target = m.targetId ? this.entityById(m.targetId) : null;
    if (target && (target.char.dead || !this.players.has(target.char.id))) {
      m.threat.delete(target.char.id); target = null; m.targetId = null;
    }
    // troca de alvo: quem gerar 10% mais ameaça que o alvo atual
    if (m.threat.size) {
      let best = null, bestT = -1;
      for (const [cid, t] of m.threat) {
        const p = this.players.get(cid);
        if (p && !p.char.dead && t > bestT) { best = p; bestT = t; }
      }
      if (!best) m.threat.clear();
      else if (!target || (best !== target && bestT > (m.threat.get(target.char.id) || 0) * this.f.threat.switchMargin)) { target = best; m.targetId = best.eid; }
    }
    if (!target && m.state === 'chase') { m.state = 'return'; return; }
    if (!target && m.def.aggroRadius > 0) {
      for (const p of this.players.values()) {
        if (!p.char.dead && !this.inSafeZone(p.char) && dist(p.char, m) <= m.def.aggroRadius) { target = p; m.targetId = p.eid; m.state = 'chase'; m.threat.set(p.char.id, this.f.threat.proximityAggro); break; }
      }
    }
    if (!target) {
      if (this.now >= m.wanderAt) {
        m.wanderAt = this.now + 4000 + this.rng() * 6000;
        const a = this.rng() * Math.PI * 2, d = this.rng() * Math.min(4, m.spawn.radius);
        m.dest = { x: m.home.x + Math.cos(a) * d, z: m.home.z + Math.sin(a) * d };
      }
      if (m.dest && speed > 0 && this.moveToward(m, m.dest.x, m.dest.z, speed * 0.4, dt)) m.dest = null;
      return;
    }
    if (m.def.leashRadius > 0 && dist(m, m.home) > m.def.leashRadius) {
      m.state = 'return'; m.targetId = null; m.threat.clear(); return;
    }
    const tc = target.char;
    const d = dist(m, tc);
    if (d > m.def.attackRange) { if (speed > 0) this.moveToward(m, tc.x, tc.z, speed, dt, m.def.attackRange * 0.8); return; }
    if (this.now >= m.nextAttackAt) {
      m.nextAttackAt = this.now + m.def.attackIntervalMs;
      const res = monsterAttack(m.def, target.stats, this.data, this.rng);
      target.lastCombatAt = this.now;
      this.broadcast({ t: 'hit', src: m.eid, dst: target.eid, dmg: res.damage, crit: !!res.crit, miss: !res.hit, skill: null, magic: false });
      if (res.hit) this.damagePlayer(target, res.damage, m);
    }
  }

  // Dano em jogador: guardiões (redirecionamento) → escudo → vida. Proteção conta como participação.
  damagePlayer(p, amount, m) {
    const prot = this.f.xp.participation.threatAbsorbed;
    for (const g of p.guards) {
      const gp = this.players.get(g.guardianId);
      if (!gp || gp.char.dead || g.until <= this.now) continue;
      const portion = Math.round(amount * g.pct / 100);
      if (portion <= 0) continue;
      amount -= portion;
      this.applyRawDamage(gp, portion);
      this.credit(m, gp.char.id, portion * prot);
      this.broadcast({ t: 'hit', src: m.eid, dst: gp.eid, dmg: portion, crit: false, miss: false, skill: 'redirect', magic: false });
    }
    if (p.shield && amount > 0) {
      const absorbed = Math.min(p.shield.amount, amount);
      p.shield.amount -= absorbed; amount -= absorbed;
      if (absorbed > 0) this.credit(m, p.shield.by, absorbed * this.f.xp.participation.healing);
      if (p.shield.amount <= 0) {
        if (p.shield.breakKnockbackRadius) for (const o of this.monstersInCircle(p.char.x, p.char.z, p.shield.breakKnockbackRadius)) this.pushMonster(o, p.char, 3);
        p.shield = null;
      }
    }
    if (amount > 0) this.credit(m, p.char.id, amount * prot);
    this.applyRawDamage(p, amount);
  }

  applyRawDamage(p, amount) {
    if (amount <= 0 || p.char.dead) return;
    p.char.hp -= amount;
    p.lastCombatAt = this.now;
    if (p.char.hp <= 0) this.killPlayer(p);
  }

  killPlayer(p) {
    const c = p.char;
    c.hp = 0; c.dead = true; p.targetId = null; p.dest = null; p.buffs = []; p.guards = []; p.shield = null;
    for (const m of this.monsters.values()) { m.threat.delete(c.id); if (m.targetId === p.eid) m.targetId = null; }
    this.store.saveCharacter(c);
    this.broadcast({ t: 'player_dead', eid: p.eid });
  }

  tickGround() {
    for (const g of this.groundEffects) {
      while (g.pulses > 0 && g.nextAt <= this.now) {
        g.pulses--; g.nextAt += g.intervalMs;
        const p = this.players.get(g.ownerId);
        if (!p) { g.pulses = 0; break; }
        const s = this.data.skills[g.skillId];
        for (const m of this.monstersInCircle(g.x, g.z, g.radius)) {
          if (s.effect.slowPct) { this.addMonsterFx(m, { kind: 'slow', until: this.now + g.intervalMs + 200, pct: s.effect.slowPct, by: g.ownerId }); this.creditControl(m, p, g.intervalMs / 2000); }
          this.hitMonster(p, m, { def: s, rank: g.rank }, g.skillId);
        }
      }
    }
    this.groundEffects = this.groundEffects.filter((g) => g.pulses > 0);
  }

  // ---------- visões enviadas ao cliente ----------
  snapshot() {
    const ents = [];
    for (const p of this.players.values()) {
      const c = p.char;
      const w = equippedList(c, this.data).find((e) => e.def.slot === 'weapon');
      ents.push({ id: p.eid, k: 'p', n: c.name, cls: c.classId, lvl: c.level, x: r2(c.x), z: r2(c.z), hp: Math.ceil(c.hp), mhp: p.stats.maxHp, dead: c.dead, tgt: p.targetId, w: w?.def.id ?? null, party: this.hooks.partyIdOf?.(c.id) ?? null, sh: p.shield ? Math.round(p.shield.amount) : 0 });
    }
    for (const m of this.monsters.values()) {
      if (m.state === 'dead') continue;
      const fx = m.fx.filter((f) => f.until > this.now).map((f) => f.kind);
      ents.push({ id: m.eid, k: 'm', def: m.defId, lvl: m.def.level, x: r2(m.x), z: r2(m.z), hp: Math.ceil(m.hp), mhp: m.def.hp, st: m.state, tgt: m.targetId, fx: fx.length ? fx : undefined });
    }
    return { t: 'snap', now: Math.round(this.now), map: this.mapId, ents };
  }

  charView(p) {
    const c = p.char, s = p.stats;
    const cum = this.data.xp.cumulative;
    return {
      id: c.id, eid: p.eid, name: c.name, classId: c.classId, level: c.level, xp: c.xp,
      xpLevelStart: cum[c.level - 1], xpNext: c.level >= this.data.levelCap ? null : cum[c.level],
      unspent: c.unspent, skillPoints: c.skillPoints, skills: c.skills, alloc: c.alloc, trialDone: !!c.trialDone,
      permanent: s.permanent, attrs: s.attrs, hp: Math.ceil(c.hp), mp: Math.floor(c.mp), gold: c.gold, dead: c.dead,
      x: r2(c.x), z: r2(c.z), mapId: this.mapId, instance: this.instanceId,
      stats: { maxHp: s.maxHp, maxMp: s.maxMp, defense: s.defense, mres: s.mres, evasion: s.evasion, accuracy: s.accuracy, crit: s.crit, magicCrit: s.magicCrit, magicPower: s.magicPower, attackIntervalMs: s.attackIntervalMs, range: s.range, weapon: s.weapon.id, ccResistPct: s.ccResistPct },
      items: [...c.items.values()].map((it) => ({ id: it.id, defId: it.defId, qty: it.qty, enh: it.enh || 0, loc: it.loc, slot: it.slot })),
      bagCapacity: BAG_CAPACITY, bagUsed: bagCount(c),
      cooldowns: Object.fromEntries(Object.entries(p.cooldowns).map(([k, v]) => [k, Math.max(0, Math.round(v - this.now))])),
    };
  }
}

export function lootView(row) {
  return { id: row.id, defId: row.def_id ?? row.defId ?? null, qty: row.qty, gold: row.gold, x: row.x, z: row.z, mapId: row.map_id ?? row.mapId };
}

export function totalPointsCheck(char, data) {
  const spent = Object.values(char.alloc).reduce((s, v) => s + v, 0);
  return spent + char.unspent === totalAttributePoints(char.level, data);
}
