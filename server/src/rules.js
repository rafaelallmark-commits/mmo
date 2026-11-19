// Regras puras de progressão e combate. Sem estado, sem rede: tudo testável e usado
// também pelo gerador de documentação (os exemplos calculados saem destas funções).
import { ATTRS } from './data.js';

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export const UNARMED = {
  id: 'unarmed', name: 'Mãos nuas', kind: 'weapon', damage: [1, 3], attackIntervalMs: 1200, range: 2.5,
  crit: 0, damageType: 'phys', scaling: { str: 0.2 }, ranged: false, hands: 1,
};

// ---------- níveis e pontos ----------
export function levelForXp(xp, data) {
  const cum = data.xp.cumulative;
  let level = 1;
  for (let i = 1; i < cum.length; i++) if (xp >= cum[i]) level = i + 1;
  return Math.min(level, data.levelCap);
}

export function xpToNext(level, data) {
  const cum = data.xp.cumulative;
  return level >= data.levelCap ? null : cum[level];
}

export function totalAttributePoints(level, data) {
  return Math.max(0, level - 1) * data.pointsPerLevel;
}

export function totalSkillPoints(level, data) {
  return Math.max(0, level - 1) * data.skillPointsPerLevel;
}

// Atributos permanentes = iniciais da classe + pontos distribuídos. Itens e poções nunca entram aqui.
export function permanentAttrs(char, data) {
  const start = data.classes[char.classId].start;
  const out = {};
  for (const a of ATTRS) out[a] = start[a] + (char.alloc?.[a] || 0);
  return out;
}

export function rankCap(level, data) {
  let cap = 0;
  for (const [lvl, c] of data.skillRules.rankCapByLevel) if (level >= lvl) cap = c;
  return Math.min(cap, data.skillRules.maxRank);
}

// ---------- estatísticas derivadas ----------
// equipped: lista de { def, enh } dos itens equipados.
export function derivedStats(char, equipped, data, buffs = {}) {
  const cls = data.classes[char.classId];
  const f = data.formulas;
  const perm = permanentAttrs(char, data);
  const attrs = { ...perm };
  let defense = 0, mres = 0, evasion = 0, accuracy = 0, critBonus = 0, magicPower = 0, bonusHp = 0, bonusMp = 0, healBonusPct = 0;
  let weapon = UNARMED, weaponEnh = 0;
  for (const { def, enh = 0 } of equipped) {
    const enhMul = 1 + (f.defense.enhancePct * enh) / 100;
    if (def.bonusAttrs) for (const [a, v] of Object.entries(def.bonusAttrs)) attrs[a] += v;
    if (def.defense) defense += def.defense * enhMul;
    if (def.mres) mres += def.mres;
    if (def.evasion) evasion += def.evasion;
    if (def.accuracy) accuracy += def.accuracy;
    if (def.magicPower) magicPower += def.magicPower * enhMul;
    if (def.bonusHp) bonusHp += def.bonusHp;
    if (def.bonusMp) bonusMp += def.bonusMp;
    if (def.healBonusPct) healBonusPct += def.healBonusPct;
    if (def.slot === 'weapon') { weapon = def; weaponEnh = enh; }
    else if (def.crit) critBonus += def.crit;
  }
  const L = char.level;
  const maxHp = Math.round(cls.hpBase + attrs.vit * cls.hpPerVit + (L - 1) * cls.hpPerLevel + bonusHp);
  const maxMp = Math.round(cls.mpBase + attrs.spi * cls.mpPerSpi + (L - 1) * cls.mpPerLevel + bonusMp);
  defense = Math.floor(defense) + Math.floor(attrs.vit * f.defense.vitCoef) + L * f.defense.perLevel;
  if (buffs.defensePct) defense = Math.floor(defense * (1 + buffs.defensePct / 100));
  mres = Math.floor(mres) + Math.floor(attrs.spi * f.magicResist.spiCoef) + Math.floor(attrs.vit * f.magicResist.vitCoef);
  evasion = Math.floor(attrs.agi * f.evasion.agiCoef) + L + evasion + (buffs.evasion || 0);
  const accCoef = weapon.ranged && weapon.damageType === 'phys' ? f.accuracy.ranged : f.accuracy.melee;
  accuracy += Object.entries(accCoef).reduce((s, [a, c]) => s + attrs[a] * c, 0) + L * f.accuracy.perLevel + (weapon.accuracy || 0);
  const crit = clamp((weapon.crit || 0) + critBonus + (buffs.critPct || 0) + attrs.tal * f.crit.talCoef + attrs.agi * f.crit.agiCoef, 0, f.crit.cap);
  const magicCrit = clamp(f.crit.magic.base + attrs.spi * f.crit.magic.spiCoef + attrs.tal * f.crit.magic.talCoef, 0, f.crit.cap);
  let attackIntervalMs = weapon.attackIntervalMs;
  if (buffs.attackSpeedPct) attackIntervalMs = Math.round(attackIntervalMs / (1 + buffs.attackSpeedPct / 100));
  return {
    level: L, attrs, permanent: perm, maxHp, maxMp, defense, mres, evasion, accuracy: Math.floor(accuracy),
    crit: round1(crit), magicCrit: round1(magicCrit), magicPower: Math.floor(magicPower), healBonusPct,
    weapon, weaponEnh, attackIntervalMs, range: weapon.range, physDamagePct: buffs.physDamagePct || 0,
    moveSpeedPct: buffs.moveSpeedPct || 0, regenPctMaxHpPerSec: buffs.regenPctMaxHpPerSec || 0,
    // Vitalidade: resistência a controle (reduz duração de atordoamento/enraizamento de monstros, M3)
    ccResistPct: Math.min(50, Math.floor(attrs.vit * 0.5)),
  };
}

const round1 = (v) => Math.round(v * 10) / 10;

// ---------- combate ----------
// rng: função () => [0,1). Para exemplos documentados, passe um rng determinístico.
export function rollInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

export function mitigationK(attackerLevel, data) {
  const m = data.formulas.mitigation;
  return m.base + m.perAttackerLevel * attackerLevel;
}

export function mitigate(raw, defense, attackerLevel, data, minDamage = 1) {
  const K = mitigationK(attackerLevel, data);
  return Math.max(minDamage, Math.round((raw * K) / (K + Math.max(0, defense))));
}

export function physicalHitChance(accuracy, evasion, attLevel, defLevel, data) {
  const a = data.formulas.accuracy;
  return round1(clamp(a.baseHit + (accuracy - evasion) * a.diffFactor + (attLevel - defLevel) * a.levelDiffPct, a.minHit, a.maxHit));
}

export function magicHitChance(attLevel, defLevel, data) {
  const m = data.formulas.accuracy.magicHit;
  return clamp(m.base + (attLevel - defLevel) * m.perLevel, m.min, m.max);
}

export function critChanceVs(baseCrit, attLevel, defLevel, data) {
  const pen = data.formulas.crit.levelPenaltyPct * Math.max(0, defLevel - attLevel);
  return round1(clamp(baseCrit - pen, 0, data.formulas.crit.cap));
}

// Ataque de jogador (básico ou habilidade). Retorna o detalhamento completo.
// skill: undefined (ataque básico) ou { def, rank }.
export function playerAttack(stats, target, data, rng, skill) {
  const f = data.formulas;
  const w = stats.weapon;
  const eff = skill?.def.effect;
  const rank = skill?.rank || 1;
  const isSpell = eff && (eff.kind === 'spell' || eff.kind === 'ground_aoe' && eff.damageType === 'magic' || eff.kind === 'aoe_spell' || eff.kind === 'delayed_aoe');
  const magic = isSpell || (!eff && w.damageType === 'magic');
  const steps = {};
  // acerto
  if (magic) steps.hitChance = magicHitChance(stats.level, target.level, data);
  else steps.hitChance = physicalHitChance(stats.accuracy, target.evasion, stats.level, target.level, data);
  steps.hitRoll = round1(rng() * 100);
  steps.hit = steps.hitRoll < steps.hitChance;
  if (!steps.hit) return { ...steps, magic, damage: 0 };
  // dano bruto
  if (isSpell) {
    steps.flat = eff.flat + (eff.flatPerRank || 0) * (rank - 1);
    steps.spiPart = Math.floor(stats.attrs.spi * eff.spiCoef);
    steps.magicPower = stats.magicPower;
    steps.raw = steps.flat + steps.spiPart + steps.magicPower;
  } else if (magic) {
    steps.roll = rollInt(rng, w.damage[0], w.damage[1]);
    steps.attrPart = Math.floor(stats.attrs.spi * f.magic.basicSpiCoef);
    steps.raw = steps.roll + steps.attrPart;
  } else {
    steps.roll = rollInt(rng, w.damage[0], w.damage[1]);
    if (stats.weaponEnh) steps.roll = Math.floor(steps.roll * (1 + ((f.enhance?.weaponDamagePct ?? 0) * stats.weaponEnh) / 100));
    steps.attrPart = Math.floor(Object.entries(w.scaling || {}).reduce((s, [a, c]) => s + stats.attrs[a] * c, 0));
    steps.raw = steps.roll + steps.attrPart;
    if (eff && eff.pct) {
      steps.skillPct = eff.pct + (eff.pctPerRank || 0) * (rank - 1);
      steps.raw = Math.floor((steps.raw * steps.skillPct) / 100);
    }
    if (stats.physDamagePct) {
      steps.buffPct = stats.physDamagePct;
      steps.raw = Math.floor(steps.raw * (1 + stats.physDamagePct / 100));
    }
  }
  // crítico
  const baseCrit = magic ? stats.magicCrit : stats.crit;
  steps.critChance = critChanceVs(baseCrit, stats.level, target.level, data);
  steps.critRoll = round1(rng() * 100);
  steps.crit = steps.critRoll < steps.critChance || !!skill?.forceCrit;
  steps.afterCrit = steps.crit ? Math.floor(steps.raw * (magic ? f.crit.magic.mult : f.crit.physMult)) : steps.raw;
  // mitigação
  steps.mitigationK = mitigationK(stats.level, data);
  steps.targetDefense = magic ? target.mres : target.defense;
  steps.damage = mitigate(steps.afterCrit, steps.targetDefense, stats.level, data, magic ? f.magic.minDamage : f.physical.minDamage);
  return { ...steps, magic };
}

// Ataque de monstro contra jogador (sempre físico no M1).
export function monsterAttack(mdef, targetStats, data, rng) {
  const f = data.formulas;
  const steps = {};
  steps.hitChance = physicalHitChance(mdef.accuracy, targetStats.evasion, mdef.level, targetStats.level, data);
  steps.hitRoll = round1(rng() * 100);
  steps.hit = steps.hitRoll < steps.hitChance;
  if (!steps.hit) return { ...steps, damage: 0 };
  steps.roll = rollInt(rng, mdef.damage[0], mdef.damage[1]);
  steps.critChance = 5;
  steps.critRoll = round1(rng() * 100);
  steps.crit = steps.critRoll < steps.critChance;
  steps.afterCrit = steps.crit ? Math.floor(steps.roll * f.crit.physMult) : steps.roll;
  steps.damage = mitigate(steps.afterCrit, targetStats.defense, mdef.level, data);
  return steps;
}

// ---------- XP ----------
export function levelDiffMod(monsterLevel, playerLevel, data) {
  const x = data.formulas.xp;
  const d = clamp(monsterLevel - playerLevel, x.levelDiffClampMin, x.levelDiffClampMax);
  return x.levelDiffMod[String(d)];
}

// contributions: [{ charId, level, score, partyId? }]. Membros de grupo próximos entram
// mesmo com score 0 (o chamador decide quem está perto). Retorna [{ charId, share, xp, lootEligible }].
// Sem grupo: xp = base × parte × cooperação × diferença de nível (igual ao M1).
// Em grupo: o grupo recebe base × (parte do grupo) × cooperação; metade é dividida igualmente
// entre os membros próximos e metade pela participação de cada um.
export function splitKillXp(mdef, contributions, data, xpRate = 1) {
  const x = data.formulas.xp;
  const total = contributions.reduce((s, c) => s + c.score, 0);
  if (total <= 0) return [];
  const coop = 1 + x.cooperationBonusPerExtra * Math.max(0, contributions.length - 1);
  const groups = new Map();
  for (const c of contributions) {
    const key = c.partyId != null ? `party:${c.partyId}` : `solo:${c.charId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }
  const out = [];
  for (const members of groups.values()) {
    const gs = members.reduce((s, c) => s + c.score, 0);
    if (gs <= 0) continue;
    const gShare = gs / total;
    const n = members.length;
    for (const c of members) {
      const weight = n === 1 ? 1 : 0.5 / n + 0.5 * (c.score / gs);
      const xp = Math.max(1, Math.round(mdef.xp * gShare * weight * coop * levelDiffMod(mdef.level, c.level, data) * xpRate));
      out.push({ charId: c.charId, share: c.score / total, groupShare: gShare, xp, lootEligible: gShare >= x.minShareForLoot });
    }
  }
  return out;
}
