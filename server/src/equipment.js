// Validação e aplicação de equipamento. O servidor é a única autoridade: o cliente
// só pede "equipar a instância X" e recebe sim/não com o motivo exato.
import { ATTRS } from './data.js';
import { permanentAttrs } from './rules.js';

export const EQUIP_SLOTS = ['weapon', 'offhand', 'head', 'body', 'hands', 'feet', 'ring1', 'ring2', 'amulet'];
export const BAG_CAPACITY = 30;

export function attrPhrase(attrId, req, cur, data) {
  const a = data.attributes[attrId];
  const fem = a.gender === 'f';
  return `${a.name} ${req} ${fem ? 'exigida' : 'exigido'}. ${fem ? 'Sua' : 'Seu'} ${a.name} ${fem ? 'atual' : 'atual'} é ${cur}.`;
}

export function className(classId, data) {
  return data.classes[classId]?.name ?? classId;
}

// Requisitos de nível, classe e atributos permanentes. Retorna lista de pendências (vazia = ok).
export function requirementFailures(char, def, data) {
  const out = [];
  if (char.level < def.level) {
    out.push({ code: 'level', reason: `Nível ${def.level} exigido. Seu nível atual é ${char.level}.`, required: def.level, current: char.level });
  }
  if (def.classes && !def.classes.includes(char.classId)) {
    const names = def.classes.map((c) => className(c, data)).join(' ou ');
    out.push({ code: 'class', reason: `Classe exigida: ${names}. Sua classe é ${className(char.classId, data)}.`, required: def.classes, current: char.classId });
  }
  const perm = permanentAttrs(char, data);
  for (const a of ATTRS) {
    const req = def.req?.[a];
    if (req && perm[a] < req) out.push({ code: `attr_${a}`, reason: attrPhrase(a, req, perm[a], data), required: req, current: perm[a] });
  }
  return out;
}

export function bagCount(char) {
  let n = 0;
  for (const it of char.items.values()) if (it.loc === 'bag') n++;
  return n;
}

export function equippedIn(char, slot) {
  for (const it of char.items.values()) if (it.loc === 'equip' && it.slot === slot) return it;
  return null;
}

export function equippedList(char, data) {
  const out = [];
  for (const it of char.items.values()) if (it.loc === 'equip') out.push({ inst: it, def: data.items[it.defId], enh: it.enh || 0 });
  return out;
}

function fail(code, reason, extra = {}) {
  return { ok: false, code, reason, reasons: [reason], ...extra };
}

// Decide se a instância pode ser equipada e o que sairá do lugar.
export function checkEquip(char, instanceId, data, capacity = BAG_CAPACITY) {
  const inst = char.items.get(instanceId);
  if (!inst || inst.loc !== 'bag') return fail('not_in_bag', 'Item não encontrado no seu inventário.');
  const def = data.items[inst.defId];
  if (!def || !def.slot) return fail('not_equippable', 'Este item não pode ser equipado.');

  const reqs = requirementFailures(char, def, data);
  if (reqs.length) return { ok: false, code: reqs[0].code, reason: reqs[0].reason, reasons: reqs.map((r) => r.reason), failures: reqs };

  // espaço e empunhadura
  let slot = def.slot;
  const displaced = [];
  const weapon = equippedIn(char, 'weapon');
  const weaponDef = weapon ? data.items[weapon.defId] : null;
  const offhand = equippedIn(char, 'offhand');
  if (def.slot === 'ring') {
    slot = !equippedIn(char, 'ring1') ? 'ring1' : !equippedIn(char, 'ring2') ? 'ring2' : 'ring1';
  }
  if (def.slot === 'offhand') {
    const cls = data.classes[char.classId];
    if (!cls.offhandFamilies.includes(def.family)) {
      return fail('slot', `${className(char.classId, data)} não usa ${data.families[def.family] ?? def.family} na mão secundária.`);
    }
    if (weaponDef && weaponDef.hands === 2) {
      return fail('two_handed', 'A arma de duas mãos ocupa a mão secundária. Desequipe-a antes de usar este item.');
    }
    if (weaponDef?.offhandOnly && !weaponDef.offhandOnly.includes(def.family)) {
      const names = weaponDef.offhandOnly.map((f) => data.families[f] ?? f).join(' ou ');
      return fail('slot', `${weaponDef.name} só aceita ${names} na mão secundária.`);
    }
  }
  const current = slot === 'ring1' || slot === 'ring2' ? equippedIn(char, slot) : equippedIn(char, slot);
  if (current) displaced.push(current.id);
  if (def.slot === 'weapon' && def.hands === 2 && offhand) displaced.push(offhand.id);
  if (def.slot === 'weapon' && def.offhandOnly && offhand && !def.offhandOnly.includes(data.items[offhand.defId].family)) {
    displaced.push(offhand.id);
  }
  // o item equipado sai da bolsa (libera 1); cada deslocado ocupa 1
  const free = capacity - bagCount(char) + 1;
  if (displaced.length > free) {
    return fail('bag_full', 'Inventário cheio: libere um espaço para guardar o item da mão secundária.');
  }
  return { ok: true, slot, displaced, def };
}

// Aplica o resultado de checkEquip. Retorna as instâncias alteradas.
export function applyEquip(char, instanceId, check) {
  const changed = [];
  for (const id of check.displaced) {
    const it = char.items.get(id);
    it.loc = 'bag'; it.slot = null; changed.push(it);
  }
  const inst = char.items.get(instanceId);
  inst.loc = 'equip'; inst.slot = check.slot; changed.push(inst);
  return changed;
}

export function checkUnequip(char, slot, capacity = BAG_CAPACITY) {
  if (!EQUIP_SLOTS.includes(slot)) return fail('slot', 'Espaço de equipamento inválido.');
  const it = equippedIn(char, slot);
  if (!it) return fail('empty', 'Não há item nesse espaço.');
  if (bagCount(char) >= capacity) return fail('bag_full', 'Inventário cheio.');
  return { ok: true, instanceId: it.id };
}

// Depois de redistribuir atributos: o que deixou de atender aos requisitos vai para a
// bolsa; se a bolsa estiver cheia, vai para a caixa de recuperação.
export function revalidateEquipment(char, data, capacity = BAG_CAPACITY) {
  const moved = [];
  for (const it of [...char.items.values()]) {
    if (it.loc !== 'equip') continue;
    const def = data.items[it.defId];
    if (requirementFailures(char, def, data).length === 0) continue;
    it.slot = null;
    it.loc = bagCount(char) < capacity ? 'bag' : 'recovery';
    moved.push(it);
  }
  return moved;
}
