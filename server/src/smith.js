// Ferreiro: refino +1 a +3 com custo, chance e prévia (regras puras, testáveis).
import { derivedStats } from './rules.js';

export function enhanceable(def) {
  return !!def && ['weapon', 'armor', 'offhand', 'jewel'].includes(def.kind);
}

// Custo e chance para ir do grau atual ao próximo; null se já está no máximo.
export function enhanceQuote(def, enh, data) {
  const f = data.formulas.enhance;
  if (enh >= f.maxLevel) return null;
  return {
    from: enh, to: enh + 1,
    chancePct: f.chancePct[enh],
    gold: f.goldBase * (enh + 1) * Math.max(1, def.level || 1),
    material: f.material,
    materialQty: f.materials[enh],
  };
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

// Rolagem com o RNG semeado da zona: sucesso se rolagem (0–100) < chance.
export function rollEnhance(rng, chancePct) {
  const roll = Math.round(rng() * 1000) / 10;
  return { roll, success: roll < chancePct };
}

export { derivedStats };
