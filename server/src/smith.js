// Ferreiro: refino +1 a +6 com custo, chance, risco e prévia (regras puras, testáveis).
import { derivedStats } from './rules.js';

export function enhanceable(def) {
  return !!def && ['weapon', 'armor', 'offhand', 'jewel'].includes(def.kind);
}

// Custo e chance para ir do grau atual ao próximo; null se já está no máximo. A partir de +3 → +4
// (downgradeFrom), a falha derruba um grau, a menos que se gaste um Selo de Proteção.
export function enhanceQuote(def, enh, data) {
  const f = data.formulas.enhance;
  if (enh >= f.maxLevel) return null;
  const risky = f.downgradeFrom != null && enh >= f.downgradeFrom;
  return {
    from: enh, to: enh + 1,
    chancePct: f.chancePct[enh],
    gold: f.goldBase * (enh + 1) * Math.max(1, def.level || 1),
    material: f.materialByGrade?.[enh] ?? f.material,
    materialQty: f.materials[enh],
    downgradeOnFail: risky,
    protectItem: risky ? f.protectItem ?? null : null,
  };
}

// Resultado de uma tentativa: novo grau e se o selo foi gasto.
export function enhanceOutcome(enh, success, quote, useProtect) {
  if (success) return { enh: enh + 1, protectUsed: false, downgraded: false };
  if (!quote.downgradeOnFail) return { enh, protectUsed: false, downgraded: false };
  if (useProtect) return { enh, protectUsed: true, downgraded: false };
  return { enh: Math.max(0, enh - 1), protectUsed: false, downgraded: true };
}

// Prévia: o que muda na peça (dano da arma, defesa, poder mágico) com o próximo grau.
export function enhancePreview(def, enh, data) {
  const f = data.formulas;
  const mul = (g) => 1 + (f.defense.enhancePct * g) / 100;
  const wmul = (g) => 1 + (f.enhance.weaponDamagePct * g) / 100;
  const out = { before: {}, after: {} };
  for (const [k, g] of [['before', enh], ['after', enh + 1]]) {
    if (def.damage) out[k].damage = [Math.floor(def.damage[0] * wmul(g)), Math.floor(def.damage[1] * wmul(g))];
    if (def.defense) out[k].defense = Math.floor(def.defense * mul(g));
    if (def.magicPower) out[k].magicPower = Math.floor(def.magicPower * mul(g));
  }
  return out;
}

// Rolagem (0–100, uma casa) contra a chance: sucesso se rolagem < chance. O servidor passa um RNG
// criptográfico (server.refineRng); o RNG semeado da zona seria previsível para quem vê as rolagens.
export function rollEnhance(rng, chancePct) {
  const roll = Math.round(rng() * 1000) / 10;
  return { roll, success: roll < chancePct };
}

export { derivedStats };
