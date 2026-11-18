// Simulação autoritativa de uma zona (um mapa). Roda num único laço: toda alteração de
// estado de personagem acontece aqui, em ordem, o que serializa operações simultâneas.
import { randomUUID } from 'node:crypto';
import {
  derivedStats, playerAttack, monsterAttack, splitKillXp, levelForXp, rankCap, totalAttributePoints, rollInt,
} from './rules.js';
import { equippedList, bagCount, BAG_CAPACITY } from './equipment.js';
import { makeRng } from './rng.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const r2 = (v) => Math.round(v * 100) / 100;
const LOOT_TTL_MS = 30 * 60 * 1000;

export class Zone {
  constructor({ mapId, data, store, rng = makeRng(1), xpRate = 1, send, broadcast }) {
    this.mapId = mapId;
    this.map = data.maps[mapId];
    this.data = data;
    this.f = data.formulas;
    this.store = store;
    this.rng = rng;
    this.xpRate = xpRate;
    this.send = send; // (charId, msg)
    this.broadcast = broadcast; // (msg)
    this.now = 0;
    this.players = new Map(); // charId -> player
    this.monsters = new Map(); // eid -> monster
    this.groundEffects = [];
    this.events = [];
    let n = 0;
    for (const sp of this.map.spawns) {
      for (let i = 0; i < sp.count; i++) {
        const def = data.monsters[sp.monster];
        const m = { eid: `m${++n}`, defId: sp.monster, def, spawn: sp, hp: def.hp, state: 'idle', threat: new Map(), damageBy: new Map(), dots: [], nextAttackAt: 0, wanderAt: 0 };
        this.placeMonster(m);
        this.monsters.set(m.eid, m);
      }
    }
  }

  placeMonster(m) {
    const a = this.rng() * Math.PI * 2, d = Math.sqrt(this.rng()) * m.spawn.radius;
    m.x = m.spawn.x + Math.cos(a) * d; m.z = m.spawn.z + Math.sin(a) * d;
    m.home = { x: m.x, z: m.z };
    m.hp = m.def.hp; m.state = 'idle'; m.targetId = null; m.threat.clear(); m.damageBy.clear(); m.dots = []; m.dest = null; m.slowUntil = 0;
  }

  // ---------- jogadores ----------
  addPlayer(char) {
    const p = { eid: `p${char.id}`, char, cooldowns: {}, buffs: [], targetId: null, dest: null, nextAttackAt: 0, lastCombatAt: -1e9, potionReadyAt: 0 };
    if (char.dead) {
      // Caiu (ou desconectou) morto: restaura de forma consistente no posto de guarda.
      this.respawnAtPost(p, false);
    }
    if (!this.inBounds(char.x, char.z) || this.isBlocked(char.x, char.z)) { char.x = this.map.spawnPoint.x; char.z = this.map.spawnPoint.z; }
    this.grantUnlockedSkills(char);
    this.players.set(char.id, p);
    this.recalc(p);
    char.hp = Math.min(char.hp, p.stats.maxHp); char.mp = Math.min(char.mp, p.stats.maxMp);
    return p;
  }

  removePlayer(charId) {
    const p = this.players.get(charId);
    if (!p) return null;
    this.players.delete(charId);
    for (const m of this.monsters.values()) {
      m.threat.delete(charId);
      if (m.targetId === p.eid) m.targetId = null;
    }
    this.store.saveCharacter(p.char);
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
      if (s.unlockLevel <= char.level && !char.skills[sid]) { char.skills[sid] = this.data.skillRules.unlockGivesRank; changed = true; }
    }
    return changed;
  }

  inBounds(x, z) {
    const [w, h] = this.map.size;
    return x >= 0 && z >= 0 && x <= w && z <= h;
  }

  isBlocked(x, z) {
    return this.map.blocked.some((b) => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1);
  }

  inSafeZone(pos) {
    return dist(pos, this.map.guardPost) <= this.map.guardPost.safeRadius;
  }

  entityById(eid) {
    if (eid?.startsWith('p')) return this.players.get(Number(eid.slice(1))) ?? null;
    return this.monsters.get(eid) ?? null;
  }

  // ---------- comandos (validados) ----------
  cmdMove(p, x, z) {
    if (p.char.dead) return { ok: false, code: 'dead', reason: 'Você está caído. Volte ao posto de guarda.' };
    if (typeof x !== 'number' || typeof z !== 'number' || !Number.isFinite(x) || !Number.isFinite(z)) return { ok: false, code: 'bad_request', reason: 'Destino inválido.' };
    if (!this.inBounds(x, z)) return { ok: false, code: 'out_of_bounds', reason: 'Destino fora do mapa.' };
    if (this.isBlocked(x, z)) return { ok: false, code: 'blocked', reason: 'Não dá para chegar ali.' };
    p.dest = { x, z }; p.targetId = null; p.pendingStopAt = null;
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

  cmdCast(p, skillId, targetId, x, z) {
    const s = this.data.skills[skillId];
    const c = p.char;
    if (c.dead) return { ok: false, code: 'dead', reason: 'Você está caído.' };
    if (!s || s.classId !== c.classId) return { ok: false, code: 'bad_skill', reason: 'Habilidade desconhecida para sua classe.' };
    const rank = c.skills[skillId] || 0;
    if (rank < 1) return { ok: false, code: 'not_learned', reason: `Nível ${s.unlockLevel} exigido para ${s.name}. Seu nível atual é ${c.level}.` };
    if (!['strike', 'spell', 'buff_self', 'ground_aoe'].includes(s.effect.kind)) return { ok: false, code: 'not_implemented', reason: 'Habilidade ainda não implementada neste marco.' };
    const ready = p.cooldowns[skillId] || 0;
    if (this.now < ready) return { ok: false, code: 'cooldown', reason: `${s.name} em recarga (${((ready - this.now) / 1000).toFixed(1)} s).` };
    const cost = s.mp + (s.mpPerRank || 0) * (rank - 1);
    if (c.mp < cost) return { ok: false, code: 'no_mana', reason: `Mana insuficiente: ${cost} necessária, você tem ${Math.floor(c.mp)}.` };
    const range = s.range === 'weapon' ? p.stats.range : s.range;
    let target = null;
    if (s.target === 'enemy') {
      target = this.monsters.get(targetId);
      if (!target || target.state === 'dead') return { ok: false, code: 'bad_target', reason: 'Alvo inválido.' };
      const d = dist(c, target);
      if (d > range + this.f.movement.rangeTolerance) return { ok: false, code: 'out_of_range', reason: `Alvo fora de alcance (${d.toFixed(1)} m; alcance ${range} m).` };
    } else if (s.target === 'ground') {
      if (typeof x !== 'number' || typeof z !== 'number') return { ok: false, code: 'bad_request', reason: 'Escolha um ponto no chão.' };
      if (Math.hypot(x - c.x, z - c.z) > range + this.f.movement.rangeTolerance) return { ok: false, code: 'out_of_range', reason: `Ponto fora de alcance (alcance ${range} m).` };
    }
    c.mp -= cost;
    p.cooldowns[skillId] = this.now + s.cooldownMs;
    p.lastCombatAt = this.now;
    const eff = s.effect;
    if (eff.kind === 'strike' || eff.kind === 'spell') {
      const res = playerAttack(p.stats, this.monsterCombatStats(target), this.data, this.rng, { def: s, rank });
      this.applyDamageToMonster(p, target, res, skillId);
      if (res.hit && eff.dot) {
        target.dots.push({ ownerId: c.id, dps: eff.dot.dps + (eff.dot.dpsPerRank || 0) * (rank - 1), until: this.now + eff.dot.durationMs, nextAt: this.now + 1000 });
      }
      if (target.state !== 'dead') { p.targetId = target.eid; }
    } else if (eff.kind === 'buff_self') {
      const mods = {};
      if (eff.physDamagePct) mods.physDamagePct = eff.physDamagePct + (eff.physDamagePctPerRank || 0) * (rank - 1);
      if (eff.attackSpeedPct) mods.attackSpeedPct = eff.attackSpeedPct;
      if (eff.defensePct) mods.defensePct = eff.defensePct + (eff.defensePctPerRank || 0) * (rank - 1);
      p.buffs = p.buffs.filter((b) => b.id !== skillId);
      p.buffs.push({ id: skillId, until: this.now + eff.durationMs, mods });
      this.recalc(p);
      this.broadcast({ t: 'buff', eid: p.eid, skill: skillId, ms: eff.durationMs });
    } else if (eff.kind === 'ground_aoe') {
      this.groundEffects.push({ ownerId: c.id, skillId, rank, x, z, radius: eff.radius, pulses: eff.pulses, intervalMs: eff.intervalMs, nextAt: this.now });
      this.broadcast({ t: 'ground', skill: skillId, x: r2(x), z: r2(z), radius: eff.radius, ms: eff.pulses * eff.intervalMs, by: p.eid });
    }
    this.broadcast({ t: 'cast', eid: p.eid, skill: skillId, target: target?.eid ?? null });
    return { ok: true, mp: Math.floor(c.mp), cooldownMs: s.cooldownMs };
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
    const cap = rankCap(c.level, this.data);
    if (rank >= cap) return { ok: false, code: 'rank_cap', reason: `Grau máximo para o nível ${c.level} é ${cap}.` };
    if (c.skillPoints < 1) return { ok: false, code: 'no_points', reason: 'Sem pontos de habilidade.' };
    c.skillPoints -= 1; c.skills[skillId] = rank + 1;
    this.store.saveCharacter(c);
    return { ok: true, rank: rank + 1 };
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
    if (this.isBlocked(nx, nz)) return true; // obstáculo: para (sem pathfinding no M1)
    e.x = nx; e.z = nz;
    return d - step <= stopAt + 1e-6;
  }

  tickPlayer(p, dt) {
    const c = p.char;
    if (c.dead) return;
    // efeitos temporários
    if (p.buffs.length) {
      const before = p.buffs.length;
      p.buffs = p.buffs.filter((b) => b.until > this.now);
      if (p.buffs.length !== before) this.recalc(p);
    }
    const speed = this.f.movement.playerSpeed;
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
          const res = playerAttack(p.stats, this.monsterCombatStats(t), this.data, this.rng);
          this.applyDamageToMonster(p, t, res, null);
        }
      }
    } else if (p.dest) {
      if (this.moveToward(c, p.dest.x, p.dest.z, speed, dt)) p.dest = null;
    }
    // regeneração
    const r = this.f.regen;
    const factor = this.now - p.lastCombatAt > r.outOfCombatAfterMs ? 1 : r.inCombatFactor;
    c.hp = Math.min(p.stats.maxHp, c.hp + (p.stats.maxHp * r.hpPctPerSec / 100) * dt * factor);
    c.mp = Math.min(p.stats.maxMp, c.mp + ((p.stats.maxMp * r.mpPctPerSec / 100) + p.stats.attrs.spi * r.mpPerSpiPerSec) * dt * factor);
  }

  monsterCombatStats(m) {
    return { level: m.def.level, defense: m.def.defense, mres: m.def.mres, evasion: m.def.evasion };
  }

  applyDamageToMonster(p, m, res, skillId) {
    this.broadcast({ t: 'hit', src: p.eid, dst: m.eid, dmg: res.damage, crit: !!res.crit, miss: !res.hit, skill: skillId, magic: !!res.magic });
    if (!res.hit) { this.addThreat(m, p, 1); return; }
    this.damageMonster(m, p.char.id, res.damage);
  }

  addThreat(m, p, amount) {
    m.threat.set(p.char.id, (m.threat.get(p.char.id) || 0) + amount);
    if (m.state === 'idle' || m.state === 'return') { m.state = 'chase'; }
    if (!m.targetId) m.targetId = p.eid;
  }

  damageMonster(m, charId, dmg) {
    if (m.state === 'dead') return;
    const p = this.players.get(charId);
    const real = Math.min(dmg, m.hp);
    m.hp -= real;
    m.damageBy.set(charId, (m.damageBy.get(charId) || 0) + real);
    if (p) {
      this.addThreat(m, p, dmg);
      // matilha: membros da mesma espécie por perto entram na briga
      if (m.def.aggro === 'aggressive') {
        for (const o of this.monsters.values()) {
          if (o !== m && o.defId === m.defId && o.state === 'idle' && dist(o, m) <= 8) { o.state = 'chase'; o.targetId = p.eid; o.threat.set(charId, 1); }
        }
      }
    }
    if (m.hp <= 0) this.killMonster(m);
  }

  killMonster(m) {
    m.state = 'dead'; m.hp = 0; m.targetId = null;
    m.respawnAt = m.def.respawnSec > 0 ? this.now + m.def.respawnSec * 1000 : Infinity;
    this.broadcast({ t: 'death', eid: m.eid });
    // contribuição: dano causado por jogadores online e próximos
    const contributions = [];
    for (const [charId, dmg] of m.damageBy) {
      const p = this.players.get(charId);
      if (!p || p.char.dead || dist(p.char, m) > this.f.xp.shareRadius) continue;
      contributions.push({ charId, level: p.char.level, score: dmg });
    }
    const split = splitKillXp(m.def, contributions, this.data, this.xpRate);
    const killId = randomUUID();
    const nowWall = Date.now();
    const notifications = [];
    this.store.tx(() => {
      for (const s of split) {
        const p = this.players.get(s.charId);
        const c = p.char;
        const lvlBefore = c.level;
        c.xp += s.xp;
        const lvl = levelForXp(c.xp, this.data);
        if (lvl > c.level) {
          const gained = lvl - c.level;
          c.level = lvl;
          c.unspent += gained * this.data.pointsPerLevel;
          c.skillPoints += gained * this.data.skillPointsPerLevel;
          this.grantUnlockedSkills(c);
          this.recalc(p);
          c.hp = p.stats.maxHp; c.mp = p.stats.maxMp;
        }
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
    // efeitos contínuos (sangramento etc.)
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
    const speed = m.def.moveSpeed * (this.now < m.slowUntil ? 1 - m.slowPct / 100 : 1);
    if (m.state === 'return') {
      if (this.moveToward(m, m.home.x, m.home.z, speed * 1.5, dt)) { m.state = 'idle'; m.hp = m.def.hp; m.damageBy.clear(); }
      return;
    }
    let target = m.targetId ? this.entityById(m.targetId) : null;
    if (target && (target.char.dead || !this.players.has(target.char.id))) {
      m.threat.delete(target.char.id); target = null; m.targetId = null;
    }
    if (!target && m.threat.size) {
      let best = null, bestT = -1;
      for (const [cid, t] of m.threat) {
        const p = this.players.get(cid);
        if (p && !p.char.dead && t > bestT) { best = p; bestT = t; }
      }
      if (best) { target = best; m.targetId = best.eid; } else m.threat.clear();
    }
    if (!target && m.state === 'chase') { m.state = 'return'; return; }
    if (!target && m.def.aggroRadius > 0) {
      for (const p of this.players.values()) {
        if (!p.char.dead && !this.inSafeZone(p.char) && dist(p.char, m) <= m.def.aggroRadius) { target = p; m.targetId = p.eid; m.state = 'chase'; m.threat.set(p.char.id, 1); break; }
      }
    }
    if (!target) {
      // vagueia perto de casa
      if (this.now >= m.wanderAt) {
        m.wanderAt = this.now + 4000 + this.rng() * 6000;
        const a = this.rng() * Math.PI * 2, d = this.rng() * Math.min(4, m.spawn.radius);
        m.dest = { x: m.home.x + Math.cos(a) * d, z: m.home.z + Math.sin(a) * d };
      }
      if (m.dest && this.moveToward(m, m.dest.x, m.dest.z, speed * 0.4, dt)) m.dest = null;
      return;
    }
    // persegue / ataca
    if (m.def.leashRadius > 0 && dist(m, m.home) > m.def.leashRadius) {
      m.state = 'return'; m.targetId = null; m.threat.clear(); return;
    }
    const tc = target.char;
    const d = dist(m, tc);
    if (d > m.def.attackRange) { this.moveToward(m, tc.x, tc.z, speed, dt, m.def.attackRange * 0.8); return; }
    if (this.now >= m.nextAttackAt) {
      m.nextAttackAt = this.now + m.def.attackIntervalMs;
      const res = monsterAttack(m.def, target.stats, this.data, this.rng);
      target.lastCombatAt = this.now;
      this.broadcast({ t: 'hit', src: m.eid, dst: target.eid, dmg: res.damage, crit: !!res.crit, miss: !res.hit, skill: null, magic: false });
      if (res.hit) {
        tc.hp -= res.damage;
        if (tc.hp <= 0) this.killPlayer(target);
      }
    }
  }

  killPlayer(p) {
    const c = p.char;
    c.hp = 0; c.dead = true; p.targetId = null; p.dest = null;
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
        for (const m of this.monsters.values()) {
          if (m.state === 'dead' || Math.hypot(m.x - g.x, m.z - g.z) > g.radius) continue;
          const res = playerAttack(p.stats, this.monsterCombatStats(m), this.data, this.rng, { def: s, rank: g.rank });
          if (s.effect.slowPct) { m.slowUntil = this.now + g.intervalMs + 200; m.slowPct = s.effect.slowPct; }
          this.applyDamageToMonster(p, m, res, g.skillId);
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
      ents.push({ id: p.eid, k: 'p', n: c.name, cls: c.classId, lvl: c.level, x: r2(c.x), z: r2(c.z), hp: Math.ceil(c.hp), mhp: p.stats.maxHp, dead: c.dead, tgt: p.targetId, w: w?.def.id ?? null });
    }
    for (const m of this.monsters.values()) {
      if (m.state === 'dead') continue;
      ents.push({ id: m.eid, k: 'm', def: m.defId, lvl: m.def.level, x: r2(m.x), z: r2(m.z), hp: Math.ceil(m.hp), mhp: m.def.hp, st: m.state, tgt: m.targetId });
    }
    return { t: 'snap', now: Math.round(this.now), ents };
  }

  charView(p) {
    const c = p.char, s = p.stats;
    const cum = this.data.xp.cumulative;
    return {
      id: c.id, eid: p.eid, name: c.name, classId: c.classId, level: c.level, xp: c.xp,
      xpLevelStart: cum[c.level - 1], xpNext: c.level >= this.data.levelCap ? null : cum[c.level],
      unspent: c.unspent, skillPoints: c.skillPoints, skills: c.skills, alloc: c.alloc,
      permanent: s.permanent, attrs: s.attrs, hp: Math.ceil(c.hp), mp: Math.floor(c.mp), gold: c.gold, dead: c.dead,
      x: r2(c.x), z: r2(c.z), mapId: c.mapId,
      stats: { maxHp: s.maxHp, maxMp: s.maxMp, defense: s.defense, mres: s.mres, evasion: s.evasion, accuracy: s.accuracy, crit: s.crit, magicCrit: s.magicCrit, magicPower: s.magicPower, attackIntervalMs: s.attackIntervalMs, range: s.range, weapon: s.weapon.id },
      items: [...c.items.values()].map((it) => ({ id: it.id, defId: it.defId, qty: it.qty, enh: it.enh || 0, loc: it.loc, slot: it.slot })),
      bagCapacity: BAG_CAPACITY, bagUsed: bagCount(c),
      cooldowns: Object.fromEntries(Object.entries(p.cooldowns).map(([k, v]) => [k, Math.max(0, Math.round(v - this.now))])),
    };
  }
}

export function lootView(row) {
  return { id: row.id, defId: row.def_id ?? row.defId ?? null, qty: row.qty, gold: row.gold, x: row.x, z: row.z };
}

export function totalPointsCheck(char, data) {
  const spent = Object.values(char.alloc).reduce((s, v) => s + v, 0);
  return spent + char.unspent === totalAttributePoints(char.level, data);
}
