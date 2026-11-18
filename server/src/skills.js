// Execução de habilidades. A zona já validou grau, recarga, mana e alcance; aqui ficam a
// escolha de alvos pela forma (alvo, cone, linha, área, chão) e os efeitos.
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// Tipos de efeito implementados no servidor (os demais respondem "ainda não implementada").
export const IMPLEMENTED_KINDS = new Set([
  'strike', 'spell', 'buff_self', 'ground_aoe', 'cone_strike', 'line_strike', 'charge', 'pull',
  'party_buff', 'debuff', 'dash', 'guard_ally', 'heal', 'party_heal', 'shield_ally', 'aoe_spell',
]);

const perRank = (eff, key, rank) => (eff[key] || 0) + (eff[`${key}PerRank`] || 0) * (rank - 1);

// Direção do conjurador para formas direcionais: alvo > ponto > última direção.
function facing(p, target, x, z) {
  const c = p.char;
  let dx, dz;
  if (target) { dx = target.x - c.x; dz = target.z - c.z; }
  else if (typeof x === 'number' && typeof z === 'number') { dx = x - c.x; dz = z - c.z; }
  else { dx = p.facing?.x ?? 1; dz = p.facing?.z ?? 0; }
  const d = Math.hypot(dx, dz) || 1;
  return { x: dx / d, z: dz / d };
}

function inCone(origin, dir, m, range, angleDeg) {
  const dx = m.x - origin.x, dz = m.z - origin.z;
  const d = Math.hypot(dx, dz);
  if (d > range || d < 1e-6) return d < 1e-6;
  const cos = (dx * dir.x + dz * dir.z) / d;
  return cos >= Math.cos((angleDeg / 2) * Math.PI / 180);
}

function inLine(origin, dir, m, length, width) {
  const dx = m.x - origin.x, dz = m.z - origin.z;
  const along = dx * dir.x + dz * dir.z;
  if (along < 0 || along > length) return false;
  const perp = Math.abs(dx * dir.z - dz * dir.x);
  return perp <= width / 2 + 0.6; // 0,6 m ≈ raio do monstro
}

export function executeSkill(zone, p, s, rank, { target, x, z, ally }) {
  const eff = s.effect;
  const c = p.char;
  const skill = { def: s, rank };
  const range = s.range === 'weapon' ? p.stats.range : s.range;
  const hits = [];
  const hitAll = (list, opts = {}) => {
    for (const m of list) {
      const res = zone.hitMonster(p, m, opts.skill ?? skill, s.id);
      hits.push(m.eid);
      if (res.hit) applyOnHit(zone, p, m, eff, rank);
    }
  };

  switch (eff.kind) {
    case 'strike':
    case 'spell': {
      const res = zone.hitMonster(p, target, skill, s.id);
      hits.push(target.eid);
      if (res.hit) {
        applyOnHit(zone, p, target, eff, rank);
        if (eff.bounceTargets) {
          const next = zone.monstersInCircle(target.x, target.z, 6).filter((m) => m !== target).sort((a, b) => dist(a, target) - dist(b, target)).slice(0, eff.bounceTargets);
          hitAll(next);
        }
      }
      break;
    }
    case 'cone_strike': {
      const dir = facing(p, target, x, z);
      hitAll(zone.monstersInCircle(c.x, c.z, range).filter((m) => inCone(c, dir, m, range, eff.angleDeg || 90)));
      break;
    }
    case 'line_strike': {
      const dir = facing(p, target, x, z);
      let list = zone.monstersInCircle(c.x, c.z, range + 1).filter((m) => inLine(c, dir, m, range, eff.width || 1.5)).sort((a, b) => dist(a, c) - dist(b, c));
      if (eff.maxTargets) list = list.slice(0, eff.maxTargets);
      hitAll(list);
      break;
    }
    case 'charge': {
      // investida: o servidor move o personagem até o alvo (sem atravessar bloqueios)
      const dir = facing(p, target);
      const d = Math.max(0, dist(c, target) - 1.2);
      zone.teleportSafe(p, c.x + dir.x * d, c.z + dir.z * d);
      const res = zone.hitMonster(p, target, skill, s.id);
      hits.push(target.eid);
      if (res.hit) applyOnHit(zone, p, target, eff, rank);
      const splash = { def: { ...s, effect: { ...eff, pct: eff.splashPct, pctPerRank: 0 } }, rank };
      hitAll(zone.monstersInCircle(target.x, target.z, eff.splashRadius || 2.5).filter((m) => m !== target), { skill: splash });
      break;
    }
    case 'pull': {
      const max = (eff.maxTargets || 3) + Math.floor((rank - 1) / 2) * (eff.extraTargetEvery2Ranks || 0);
      const list = zone.monstersInCircle(c.x, c.z, range).sort((a, b) => dist(a, c) - dist(b, c)).slice(0, max);
      for (const m of list) {
        zone.pullMonster(m, p, 1.6);
        const res = zone.hitMonster(p, m, skill, s.id);
        hits.push(m.eid);
        zone.addThreat(m, p, (res.damage || 1) * (eff.threatMult || 1) + 50);
        m.targetId = p.eid; m.state = 'chase';
        zone.creditControl(m, p, 1.0);
      }
      break;
    }
    case 'ground_aoe': {
      zone.addGroundEffect(p, s, rank, x, z);
      break;
    }
    case 'aoe_spell': {
      const list = zone.monstersInCircle(c.x, c.z, eff.radius || range);
      for (const m of list) {
        const res = zone.hitMonster(p, m, skill, s.id);
        hits.push(m.eid);
        if (res.hit) applyOnHit(zone, p, m, eff, rank);
      }
      break;
    }
    case 'debuff': {
      zone.addMonsterFx(target, { kind: 'mark', until: zone.now + eff.durationMs, physDamageTakenPct: perRank(eff, 'physDamageTakenPct', rank), evasionDown: eff.evasionDown || 0, by: c.id });
      zone.addThreat(target, p, 10);
      zone.creditControl(target, p, 0.5);
      hits.push(target.eid);
      break;
    }
    case 'buff_self': {
      const mods = {};
      for (const k of ['physDamagePct', 'attackSpeedPct', 'defensePct', 'critPct', 'moveSpeedPct']) if (eff[k] !== undefined) mods[k] = perRank(eff, k, rank);
      zone.addBuff(p, { id: s.id, until: zone.now + eff.durationMs, mods });
      break;
    }
    case 'party_buff': {
      const mods = {};
      for (const k of ['physDamagePct', 'defensePct', 'moveSpeedPct', 'regenPctMaxHpPerSec']) if (eff[k] !== undefined) mods[k] = perRank(eff, k, rank);
      for (const a of zone.alliesNear(p, range)) {
        zone.addBuff(a, { id: s.id, until: zone.now + eff.durationMs, mods, by: c.id });
        if (eff.redirectDamagePct && a !== p) zone.addGuard(a, p, eff.redirectDamagePct, zone.now + eff.durationMs, s.id);
      }
      break;
    }
    case 'guard_ally': {
      const a = ally ?? p;
      if (a !== p) zone.addGuard(a, p, perRank(eff, 'redirectDamagePct', rank), zone.now + eff.durationMs, s.id);
      if (eff.selfDefensePct) zone.addBuff(p, { id: `${s.id}_self`, until: zone.now + eff.durationMs, mods: { defensePct: eff.selfDefensePct } });
      break;
    }
    case 'dash': {
      const dir = facing(p, target, x, z);
      let vx = dir.x, vz = dir.z;
      if (eff.lateral) { vx = -dir.z; vz = dir.x; }
      zone.teleportSafe(p, c.x + vx * eff.distance, c.z + vz * eff.distance);
      if (eff.nextAttackPct) p.nextAttackPct = perRank(eff, 'nextAttackPct', rank);
      if (eff.evasion) zone.addBuff(p, { id: s.id, until: zone.now + (eff.durationMs || 5000), mods: { evasion: perRank(eff, 'evasion', rank) } });
      break;
    }
    case 'heal': {
      const a = ally ?? p;
      zone.healPlayer(p, a, healAmount(p, eff, rank));
      break;
    }
    case 'party_heal': {
      const amount = eff.healPctMaxHp ? null : healAmount(p, eff, rank);
      for (const a of zone.alliesNear(p, range)) zone.healPlayer(p, a, amount ?? Math.round(a.stats.maxHp * perRank(eff, 'healPctMaxHp', rank) / 100));
      break;
    }
    case 'shield_ally': {
      const a = ally ?? p;
      const amount = Math.round(healAmount(p, eff, rank));
      a.shield = { amount, until: zone.now + eff.durationMs, by: c.id, breakKnockbackRadius: eff.breakKnockbackRadius || 0 };
      zone.creditSupport(p, a, amount * 0.5);
      zone.broadcast({ t: 'shield', eid: a.eid, amount, ms: eff.durationMs });
      break;
    }
    default:
      return { ok: false, code: 'not_implemented', reason: 'Habilidade ainda não implementada neste marco.' };
  }
  return { ok: true, hits };
}

function healAmount(p, eff, rank) {
  const base = perRank(eff, 'flat', rank) + Math.floor(p.stats.attrs.spi * (eff.spiCoef || 0));
  return Math.round(base * (1 + (p.stats.healBonusPct || 0) / 100));
}

// Efeitos secundários em cada monstro atingido.
function applyOnHit(zone, p, m, eff, rank) {
  if (m.state === 'dead') return;
  const c = p.char;
  if (eff.dot) zone.addDot(m, c.id, perRank(eff.dot, 'dps', rank), eff.dot.durationMs);
  if (eff.defenseDownPct) zone.addMonsterFx(m, { kind: 'defenseDown', until: zone.now + (eff.durationMs || 6000), pct: eff.defenseDownPct, by: c.id });
  if (eff.slowPct && eff.kind !== 'ground_aoe') { zone.addMonsterFx(m, { kind: 'slow', until: zone.now + 3000, pct: eff.slowPct, by: c.id }); zone.creditControl(m, p, 1.5); }
  if (eff.rootMs) {
    const ms = perRank(eff, 'rootMs', rank);
    zone.addMonsterFx(m, { kind: 'root', until: zone.now + ms, by: c.id });
    zone.creditControl(m, p, ms / 1000);
  }
  if (eff.knockbackM) zone.pushMonster(m, c, eff.knockbackM);
  if (eff.bonusSacred) zone.sacredDamage(p, m, perRank(eff, 'bonusSacred', rank));
}
