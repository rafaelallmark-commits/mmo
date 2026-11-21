// Valida a coerência dos arquivos de dados. Uso: npm run validate-data
// Também é importado pelos testes e pelo gerador de documentação.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadGameData, ATTRS, DEFAULT_DATA_DIR } from '../src/data.js';
import { totalAttributePoints } from '../src/rules.js';
import { missionXpByBand, MISSION_XP_CAP } from '../src/quests.js';
import { MECHANIC_KINDS, TELEGRAPH_SHAPES, DEBUFF_MODS, MIN_WARN_MS, MAX_DEBUFF_MS, MAX_STUN_MS } from '../src/mechanics.js';

export const TIERS = [1, 5, 9, 13, 17, 20, 21, 25];
export const MAX_DESCRIPTION = 80; // caracteres da descrição do monstro (uma linha no quadro do alvo)
export const WEAPON_FAMILIES = ['axe_1h', 'axe_2h', 'claw', 'hammer_1h', 'spear_2h', 'bow', 'sword_1h', 'sword_2h', 'javelin', 'wand', 'scepter', 'staff_2h'];
const ARMOR_BY_WEIGHT = {
  heavy: ['heavy_armor', 'heavy_helm', 'heavy_gloves', 'heavy_boots'],
  light: ['light_armor', 'light_hood', 'light_gloves', 'light_boots'],
  robe: ['robe', 'robe_circlet', 'robe_gloves', 'robe_sandals'],
};

export function loadBuilds(dir = DEFAULT_DATA_DIR) {
  return JSON.parse(readFileSync(join(dir, 'example_builds.json'), 'utf8')).builds;
}

// Pontos que a classe precisa gastar para usar um conjunto de itens ao mesmo tempo.
export function spendNeeded(classId, defIds, data) {
  const start = data.classes[classId].start;
  const need = {};
  for (const id of defIds) for (const [a, v] of Object.entries(data.items[id].req || {})) need[a] = Math.max(need[a] || 0, v);
  let total = 0;
  const per = {};
  for (const a of ATTRS) { per[a] = Math.max(0, (need[a] || 0) - start[a]); total += per[a]; }
  return { need, per, total };
}

// Para cada classe, faixa e família de arma da classe: o conjunto completo (arma +
// mão secundária, quando aplicável + 4 peças de armadura) cabe nos pontos disponíveis?
export function reachability(data) {
  const rows = [];
  for (const [classId, cls] of Object.entries(data.classes)) {
    for (const fam of cls.weaponFamilies) {
      for (const t of TIERS) {
        const weapon = `${fam}_t${t}`;
        const w = data.items[weapon];
        const kit = [weapon, ...ARMOR_BY_WEIGHT[cls.armorWeight].map((f) => `${f}_t${t}`)];
        if (w.hands === 1 && cls.offhandFamilies.length) kit.push(`${cls.offhandFamilies[0]}_t${t}`);
        const usable = kit.filter((id) => !data.items[id].classes || data.items[id].classes.includes(classId));
        const s = spendNeeded(classId, usable, data);
        const available = totalAttributePoints(t, data);
        rows.push({ classId, family: fam, tier: t, kit: usable, exclusive: usable.length !== kit.length, need: s.need, spend: s.total, available, spare: available - s.total, ok: s.total <= available });
      }
    }
  }
  return rows;
}

// Executa um plano de distribuição nível a nível e verifica os conjuntos de cada faixa.
export function runBuild(build, data) {
  const cls = data.classes[build.classId];
  const attrs = { ...cls.start };
  const steps = [];
  const errors = [];
  let spent = 0;
  for (let L = 1; L <= data.levelCap; L++) {
    const alloc = L >= 2 ? build.perLevel[String(L)] || {} : {};
    const sum = Object.values(alloc).reduce((s, v) => s + v, 0);
    if (L >= 2 && sum !== data.pointsPerLevel) errors.push(`nível ${L}: distribui ${sum} pontos, deveria distribuir ${data.pointsPerLevel}`);
    for (const [a, v] of Object.entries(alloc)) attrs[a] += v;
    spent += sum;
    const available = totalAttributePoints(L, data);
    if (spent > available) errors.push(`nível ${L}: gastou ${spent} de ${available}`);
    const step = { level: L, alloc, attrs: { ...attrs }, spent, available, unlocked: [] };
    const kit = build.kitByTier[String(L)];
    if (kit) {
      for (const id of kit) {
        const def = data.items[id];
        const missing = Object.entries(def.req || {}).filter(([a, v]) => attrs[a] < v).map(([a, v]) => `${data.attributes[a].name} ${attrs[a]}/${v}`);
        const okLevel = L >= def.level;
        const okClass = !def.classes || def.classes.includes(build.classId);
        if (missing.length || !okLevel || !okClass) errors.push(`nível ${L}: ${def.name} não atendido (${missing.join(', ')})`);
        step.unlocked.push({ id, name: def.name, req: def.req, ok: !missing.length && okLevel && okClass });
      }
    }
    steps.push(step);
  }
  return { steps, errors };
}

// De onde cada item pode vir: saque (tabelas), loja, armeiro (peças comuns da classe), kit inicial ou missão
// (recompensa ou material de coleta). Item sem nenhuma fonte foi publicado sem existir no jogo.
export function itemSources(data) {
  const src = new Map();
  const add = (id, how) => { if (!src.has(id)) src.set(id, new Set()); src.get(id).add(how); };
  const list = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);
  for (const [tid, t] of Object.entries(data.lootTables)) {
    for (const e of t.entries) {
      if (e.type === 'item') add(e.defId, `saque:${tid}`);
      if (e.type === 'pool') for (const id of e.pool) add(id, `saque:${tid}`);
      if (e.type === 'classDrop' || e.type === 'classPool') for (const v of Object.values(e.byClass)) for (const id of list(v)) add(id, `saque:${tid}`);
    }
  }
  const hasArmorer = Object.values(data.maps).some((m) => (m.npcs ?? []).some((n) => n.role === 'armorer'));
  for (const m of Object.values(data.maps)) for (const n of m.npcs ?? []) for (const id of n.shop ?? []) add(id, `loja:${n.id}`);
  if (hasArmorer) for (const d of Object.values(data.items)) if (d.rarity === 'common' && ['weapon', 'armor', 'offhand', 'jewel'].includes(d.kind)) add(d.id, 'armeiro');
  for (const [cid, c] of Object.entries(data.classes)) for (const id of [...c.startingKit.equip, ...c.startingKit.bag.map((b) => b[0])]) add(id, `kit:${cid}`);
  for (const [qid, q] of Object.entries(data.quests ?? {})) {
    const rw = q.rewards ?? {};
    for (const [id] of [...(rw.items ?? []), ...Object.values(rw.byArmor ?? {}).flat(), ...Object.values(rw.byClass ?? {}).flat()]) add(id, `missão:${qid}`);
    for (const o of q.objectives) if (o.type === 'collect' && o.drop) add(o.item, `coleta:${qid}`);
  }
  return src;
}

// Mecânica do monstro (campo "mechanic", server/src/mechanics.js): tipo conhecido, id e nome, números nas
// faixas que o servidor espera, golpe de área sempre avisado com tempo de reação justo (MIN_WARN_MS) e efeitos
// negativos curtos (MAX_DEBUFF_MS, MAX_STUN_MS). Devolve a lista de erros.
export function mechanicErrors(mid, m, data) {
  const e = [];
  const mech = m.mechanic;
  if (mech == null) return e;
  const where = `monstro ${mid}: mecânica`;
  const num = (obj, w, k, { min = 0, max = Infinity, int = false, opt = false } = {}) => {
    const v = obj[k];
    if (v == null) { if (!opt) e.push(`${w}: falta ${k}`); return; }
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max || (int && !Number.isInteger(v))) e.push(`${w}: ${k} = ${v} (esperado ${int ? 'inteiro ' : ''}de ${min} a ${max})`);
  };
  const str = (obj, w, k) => { if (typeof obj[k] !== 'string' || !obj[k].trim()) e.push(`${w}: falta ${k}`); };
  if (typeof mech !== 'object' || !MECHANIC_KINDS.includes(mech.kind)) { e.push(`${where}: tipo ${mech?.kind} desconhecido (${MECHANIC_KINDS.join(', ')})`); return e; }
  str(mech, where, 'id'); str(mech, where, 'name');
  const debuff = (d, w) => {
    if (d == null) return;
    str(d, w, 'id'); str(d, w, 'name');
    num(d, w, 'durationMs', { min: 500, max: MAX_DEBUFF_MS, int: true });
    for (const [k, v] of Object.entries(d.mods ?? {})) if (!DEBUFF_MODS.includes(k) || typeof v !== 'number' || v >= 0 || v < -60) e.push(`${w}: mod ${k} = ${v} (só ${DEBUFF_MODS.join(', ')}, de −60 a −1)`);
    num(d, w, 'mpPctPerSec', { min: 0.5, max: 10, opt: true });
    if (d.silence != null && d.silence !== true) e.push(`${w}: silence = ${d.silence}`);
    if (!Object.keys(d.mods ?? {}).length && !d.mpPctPerSec && !d.silence) e.push(`${w}: efeito negativo sem efeito`);
  };
  const adds = (sp, w) => {
    const def = data.monsters[sp.monster];
    if (!def) e.push(`${w}: monstro ${sp.monster} inexistente`);
    else if (def.rank !== 'normal' || def.mechanic?.kind === 'summon' || def.mechanic?.spawn) e.push(`${w}: ${sp.monster} não serve de reforço (só monstro normal que não invoca)`);
    num(sp, w, 'count', { min: 1, max: 4, int: true });
    num(sp, w, 'maxAlive', { min: 1, max: 8, int: true });
  };
  const telegraph = (t, w) => {
    if (!TELEGRAPH_SHAPES.includes(t.shape)) { e.push(`${w}: forma ${t.shape} (${TELEGRAPH_SHAPES.join(', ')})`); return; }
    str(t, w, 'id'); str(t, w, 'name');
    num(t, w, 'warnMs', { min: MIN_WARN_MS, max: 5000, int: true });
    num(t, w, 'damagePct', { min: 0, max: 400 });
    if (t.shape === 'circle' || t.shape === 'target_circle') num(t, w, 'radius', { min: 1, max: 10 });
    if (t.shape === 'cone') { num(t, w, 'range', { min: 2, max: 12 }); num(t, w, 'angleDeg', { min: 20, max: 180 }); }
    if (t.shape === 'line') { num(t, w, 'length', { min: 3, max: 20 }); num(t, w, 'width', { min: 0.8, max: 4 }); }
    if ((t.dash || t.rails) && t.shape !== 'line') e.push(`${w}: dash e rails só valem para a linha`);
    num(t, w, 'minRange', { min: 0, max: 20, opt: true });
    num(t, w, 'maxRange', { min: 1, max: 20, opt: true });
    if (t.minRange != null && t.maxRange != null && t.minRange >= t.maxRange) e.push(`${w}: minRange ≥ maxRange`);
    num(t, w, 'stunMs', { min: 200, max: MAX_STUN_MS, int: true, opt: true });
    num(t, w, 'pullTo', { min: 1, max: 4, opt: true });
    debuff(t.debuff, `${w}: efeito negativo`);
    if (t.spawn) adds(t.spawn, `${w}: reforços`);
    if (!(t.damagePct > 0) && !t.debuff && !t.stunMs && !t.pullTo && !t.spawn) e.push(`${w}: golpe avisado sem nenhum efeito`);
  };
  switch (mech.kind) {
    case 'telegraph':
      telegraph(mech, where);
      num(mech, where, 'everyMs', { min: (mech.warnMs || 0) + 2000, max: 60000, int: true });
      num(mech, where, 'firstMs', { min: 0, max: 30000, int: true });
      num(mech, where, 'patrolRadius', { min: 1, max: 15, opt: true });
      break;
    case 'death_burst':
      num(mech, where, 'radius', { min: 1, max: 10 });
      num(mech, where, 'warnMs', { min: MIN_WARN_MS, max: 5000, int: true });
      num(mech, where, 'damagePct', { min: 1, max: 400 });
      break;
    case 'leech':
      if (!mech.debuff) e.push(`${where}: falta debuff`);
      debuff(mech.debuff, `${where}: efeito negativo`);
      break;
    case 'swarm':
      num(mech, where, 'radius', { min: 1, max: 12 });
      num(mech, where, 'damagePctPerAlly', { min: 1, max: 100 });
      num(mech, where, 'maxAllies', { min: 1, max: 6, int: true });
      break;
    case 'pierce':
      num(mech, where, 'defensePiercePct', { min: 1, max: 80 });
      break;
    case 'echo':
      num(mech, where, 'everyMs', { min: 1000, max: 60000, int: true });
      num(mech, where, 'firstMs', { min: 0, max: 30000, int: true, opt: true });
      num(mech, where, 'pct', { min: 1, max: 200 });
      num(mech, where, 'capPct', { min: 50, max: 400 });
      num(mech, where, 'memoryMs', { min: 1000, max: 20000, int: true });
      num(mech, where, 'range', { min: 2, max: 30 });
      break;
    case 'summon': {
      const th = mech.thresholdsPct;
      if (!Array.isArray(th) || !th.length || th.some((v, i) => typeof v !== 'number' || v <= 0 || v >= 100 || (i > 0 && v >= th[i - 1]))) e.push(`${where}: thresholdsPct deve ser uma lista decrescente entre 0 e 100`);
      adds(mech, where);
      break;
    }
    case 'pressure':
      num(mech, where, 'highMs', { min: 2000, max: 60000, int: true });
      num(mech, where, 'lowMs', { min: 2000, max: 60000, int: true });
      num(mech, where, 'highDamagePct', { min: 1, max: 100 });
      num(mech, where, 'lowDefensePct', { min: 1, max: 90 });
      if (!mech.vent) e.push(`${where}: falta vent`);
      else telegraph(mech.vent, `${where}: vent`);
      break;
    case 'territorial':
      if (m.aggro !== 'passive') e.push(`${where}: território é só para monstro passivo`);
      num(mech, where, 'radius', { min: 1, max: 6 });
      break;
    default: break;
  }
  return e;
}

export function validate(data, builds) {
  const errors = [];
  const warn = [];
  const items = data.items;
  for (const [cid, c] of Object.entries(data.classes)) {
    for (const sid of c.skills) if (data.skills[sid]?.classId !== cid) errors.push(`classe ${cid}: habilidade ${sid} inválida`);
    const levels = c.skills.map((s) => data.skills[s].unlockLevel).join(',');
    if (levels !== data.skillRules.unlockLevels.join(',')) errors.push(`classe ${cid}: níveis de desbloqueio ${levels}`);
    const sum = ATTRS.reduce((s, a) => s + c.start[a], 0);
    if (sum !== 60) warn.push(`classe ${cid}: atributos iniciais somam ${sum}`);
    for (const id of [...c.startingKit.equip, ...c.startingKit.bag.map((b) => b[0])]) {
      const d = items[id];
      if (!d) { errors.push(`kit ${cid}: item ${id} inexistente`); continue; }
      if (d.slot && d.level > 1) errors.push(`kit ${cid}: ${id} acima do nível 1`);
      if (d.classes && !d.classes.includes(cid)) errors.push(`kit ${cid}: ${id} não é da classe`);
      for (const [a, v] of Object.entries(d.req || {})) if (c.start[a] < v) errors.push(`kit ${cid}: ${id} exige ${a} ${v}, classe começa com ${c.start[a]}`);
    }
  }
  for (const [id, d] of Object.entries(items)) {
    if (d.id !== id) errors.push(`item ${id}: id interno diferente`);
    if (!Number.isInteger(d.level) || d.level < 1) errors.push(`item ${id}: nível mínimo ausente`);
    for (const a of Object.keys(d.req || {})) if (!ATTRS.includes(a)) errors.push(`item ${id}: atributo ${a}`);
    for (const c of d.classes || []) if (!data.classes[c]) errors.push(`item ${id}: classe ${c}`);
    if (d.kind === 'weapon' && ![1, 2].includes(d.hands)) errors.push(`item ${id}: empunhadura`);
    if (d.kind === 'weapon') {
      for (const c of d.classes || []) if (!data.classes[c].weaponFamilies.includes(d.family)) errors.push(`item ${id}: classe ${c} não usa ${d.family}`);
    }
    if (!data.rarities[d.rarity]) errors.push(`item ${id}: raridade ${d.rarity}`);
  }
  for (const fam of WEAPON_FAMILIES) for (const t of TIERS) if (!items[`${fam}_t${t}`]) errors.push(`falta ${fam} na faixa ${t}`);
  // Valores que viram ouro, quantidade ou XP no banco têm de ser inteiros: o PostgreSQL recusa fração numa
  // coluna inteira (o SQLite guardaria calado) e o salvamento falharia em produção.
  const int = (where, v) => { if (v != null && !Number.isInteger(v)) errors.push(`${where}: ${v} não é inteiro (vai para coluna inteira no banco)`); };
  for (const [id, d] of Object.entries(items)) { int(`item ${id}: value`, d.value); int(`item ${id}: stack`, d.stack); }
  for (const [mid, m] of Object.entries(data.monsters)) int(`monstro ${mid}: xp`, m.xp);
  for (const [tid, t] of Object.entries(data.lootTables)) for (const e of t.entries) { int(`tabela ${tid}: min`, e.min); int(`tabela ${tid}: max`, e.max); }
  for (const [qid, q] of Object.entries(data.quests || {})) {
    int(`missão ${qid}: ouro`, q.rewards?.gold); int(`missão ${qid}: xp`, q.rewards?.xp);
    for (const [def, n] of q.rewards?.items ?? []) int(`missão ${qid}: ${def}`, n);
  }
  for (const [cid, c] of Object.entries(data.classes)) for (const [def, n] of c.startingKit.bag) int(`kit ${cid}: ${def}`, n);
  int('pointsPerLevel', data.pointsPerLevel); int('skillPointsPerLevel', data.skillPointsPerLevel);
  // ferreiro: as regras ficam em formulas.enhance (smith.js); ouro = goldBase × (grau+1) × nível do item
  const smith = data.formulas.enhance ?? {};
  int('ferreiro: goldBase', smith.goldBase);
  for (const n of smith.materials ?? []) int('ferreiro: materials', n);
  for (const [mid, m] of Object.entries(data.monsters)) if (!data.lootTables[m.lootTable]) errors.push(`monstro ${mid}: tabela ${m.lootTable}`);
  const asList = (v) => (Array.isArray(v) ? v : [v]);
  for (const [mid, m] of Object.entries(data.monsters)) errors.push(...mechanicErrors(mid, m, data));
  // a descrição aparece numa linha no quadro do alvo (client/scripts/hud.gd): curta, sem quebra
  for (const [mid, m] of Object.entries(data.monsters)) {
    if (typeof m.description !== 'string' || !m.description.trim()) errors.push(`monstro ${mid}: falta a descrição`);
    else if (m.description.length > MAX_DESCRIPTION || /\n/.test(m.description)) errors.push(`monstro ${mid}: descrição com ${m.description.length} caracteres (até ${MAX_DESCRIPTION}, numa linha só: o quadro do alvo mostra uma linha)`);
  }
  // o id da mecânica nomeia o golpe nos avisos, nos golpes ("skill") e no efeito do cliente: um por mecânica
  const mechIds = new Map();
  for (const [mid, m] of Object.entries(data.monsters)) {
    for (const id of [m.mechanic?.id, m.mechanic?.vent?.id].filter(Boolean)) {
      if (mechIds.has(id)) errors.push(`monstro ${mid}: mecânica ${id} repete o id de ${mechIds.get(id)}`);
      else mechIds.set(id, mid);
    }
  }
  for (const [tid, t] of Object.entries(data.lootTables)) {
    for (const e of t.entries) {
      if (!['gold', 'item', 'pool', 'classDrop', 'classPool'].includes(e.type)) errors.push(`tabela ${tid}: tipo ${e.type}`);
      const ids = e.type === 'item' ? [e.defId] : e.type === 'pool' ? e.pool : e.type === 'classDrop' || e.type === 'classPool' ? Object.values(e.byClass).flatMap(asList) : [];
      for (const id of ids) if (!items[id]) errors.push(`tabela ${tid}: item ${id}`);
      if (e.type === 'classDrop' || e.type === 'classPool') {
        for (const [c, v] of Object.entries(e.byClass)) {
          if (!data.classes[c]) errors.push(`tabela ${tid}: classe ${c}`);
          if (e.type === 'classPool' && (!Array.isArray(v) || !v.length)) errors.push(`tabela ${tid}: classPool de ${c} precisa de uma lista`);
          for (const id of asList(v)) if (items[id]?.classes && !items[id].classes.includes(c)) errors.push(`tabela ${tid}: ${id} não serve para ${c}`);
        }
      }
    }
  }
  const npcIds = new Set(), objIds = new Set();
  const defenseIds = new Set(), hazardIds = new Set();
  for (const [mid, m] of Object.entries(data.maps)) {
    for (const sp of m.spawns || []) if (!data.monsters[sp.monster]) errors.push(`mapa ${mid}: monstro ${sp.monster}`);
    // defesas (alvo parado com ondas) e perigos do mapa (só ligam com a missão que precisa deles)
    for (const [did, d] of Object.entries(m.defenses ?? {})) {
      defenseIds.add(did);
      if (!(d.hp > 0) || !(d.durationMs > 0) || !(d.retryMs >= 0)) errors.push(`mapa ${mid}: defesa ${did} sem vida, duração ou intervalo`);
      if (d.npc && !(m.npcs ?? []).some((n) => n.id === d.npc)) errors.push(`mapa ${mid}: defesa ${did} mostra o NPC ${d.npc}, que não está no mapa`);
      for (const w of d.waves ?? []) {
        if (!(w.atMs >= 0 && w.atMs < d.durationMs)) errors.push(`mapa ${mid}: defesa ${did}: onda fora do cronômetro (${w.atMs})`);
        for (const [mon] of w.monsters) if (!data.monsters[mon]) errors.push(`mapa ${mid}: defesa ${did}: monstro ${mon}`);
      }
      for (const p of [d, ...(d.spawnAt ?? [])]) if (p.x < 0 || p.z < 0 || p.x > m.size[0] || p.z > m.size[1]) errors.push(`mapa ${mid}: defesa ${did}: ponto fora do mapa`);
    }
    for (const [hid, h] of Object.entries(m.hazards ?? {})) {
      hazardIds.add(hid);
      const a = h.area ?? {};
      if (!(a.x1 > a.x0 && a.z1 > a.z0)) errors.push(`mapa ${mid}: perigo ${hid} sem área`);
      if (!(h.warnMs > 0 && h.periodMs > h.warnMs && h.width > 0 && h.damagePctMaxHp > 0)) errors.push(`mapa ${mid}: perigo ${hid}: tempos, largura ou dano inválidos`);
      for (const pat of h.patterns ?? []) for (const l of pat) {
        if (!['x', 'z'].includes(l.axis)) errors.push(`mapa ${mid}: perigo ${hid}: eixo ${l.axis}`);
        else if (l.axis === 'z' ? l.at < a.z0 || l.at > a.z1 : l.at < a.x0 || l.at > a.x1) errors.push(`mapa ${mid}: perigo ${hid}: faixa ${l.axis}=${l.at} fora da área`);
      }
      if (!(h.patterns ?? []).length) errors.push(`mapa ${mid}: perigo ${hid} sem padrões`);
    }
    for (const o of m.objects ?? []) {
      if (o.kind === 'defense' && !m.defenses?.[o.defense]) errors.push(`mapa ${mid}: objeto ${o.id} aponta para a defesa ${o.defense}, que não existe neste mapa`);
      if (o.kind === 'escort' && !m.escorts?.[o.escort]) errors.push(`mapa ${mid}: objeto ${o.id} aponta para a escolta ${o.escort}, que não existe neste mapa`);
    }
    for (const pt of m.portals || []) {
      const dest = data.maps[pt.to];
      if (!dest) { errors.push(`mapa ${mid}: portal para ${pt.to} inexistente`); continue; }
      if (pt.toX < 0 || pt.toZ < 0 || pt.toX > dest.size[0] || pt.toZ > dest.size[1]) errors.push(`mapa ${mid}: portal ${pt.id} cai fora de ${pt.to}`);
    }
    for (const n of m.npcs || []) npcIds.add(n.id);
    for (const o of m.objects || []) objIds.add(o.id);
    for (const n of m.npcs || []) for (const it of n.shop || []) if (!data.items[it]) errors.push(`loja ${n.id}: item ${it}`);
  }
  for (const c of Object.keys(data.classes)) if (!npcIds.has(`master_${c}`)) errors.push(`falta mestre de classe para ${c}`);
  // alcance máximo de um monstro que ataca sozinho: raio do bando + passeio (1 + até 4 m, zone.tickMonster) + agressão;
  // o passivo com território (ninho do Besouro-Brasa, margem da Salamandra) morde quem chega ao raio dele e conta igual (D172)
  const aggroReach = (sp) => {
    const md = data.monsters[sp.monster];
    const r = md?.aggro === 'aggressive' ? md.aggroRadius : md?.mechanic?.kind === 'territorial' ? md.mechanic.radius : 0;
    return r > 0 ? sp.radius + 1 + Math.min(4, sp.radius) + r : null;
  };
  // estrada segura (D164): nenhum agressivo alcança as faixas safeCorridor do mapa
  for (const [mid, m] of Object.entries(data.maps)) {
    const rects = m.safeCorridor?.rects ?? [];
    if (m.safeCorridor && !rects.length) errors.push(`mapa ${mid}: safeCorridor sem faixas`);
    for (const rc of rects) {
      if (![rc.x0, rc.z0, rc.x1, rc.z1].every(Number.isFinite) || rc.x0 >= rc.x1 || rc.z0 >= rc.z1) { errors.push(`mapa ${mid}: faixa segura inválida ${JSON.stringify(rc)}`); continue; }
      for (const sp of m.spawns ?? []) {
        const reach = aggroReach(sp);
        if (reach == null) continue;
        const gap = Math.hypot(Math.max(rc.x0 - sp.x, 0, sp.x - rc.x1), Math.max(rc.z0 - sp.z, 0, sp.z - rc.z1));
        if (gap <= reach) errors.push(`mapa ${mid}: ${data.monsters[sp.monster].name} em (${sp.x}, ${sp.z}) alcança a estrada segura (faixa x ${rc.x0}–${rc.x1}, z ${rc.z0}–${rc.z1}): ${gap.toFixed(1)} m para ${reach} m de alcance`);
      }
    }
  }
  // tutorial (D165): pessoas a resgatar do bloco rescue e o segundo toque
  const LOOKS = ['man', 'woman', 'boy'], FREES = ['reach', 'tonic', 'guards'];
  const people = new Set();
  for (const [mid, m] of Object.entries(data.maps)) {
    const r = m.rescue;
    if (!r) continue;
    const gp = m.guardPost;
    if (!gp) errors.push(`mapa ${mid}: rescue sem posto de guarda (a chegada é no círculo do posto)`);
    if (!(r.followRadius > 0)) errors.push(`mapa ${mid}: rescue.followRadius ausente`);
    const inside = (x, z) => Number.isFinite(x) && Number.isFinite(z) && x > 0 && z > 0 && x < m.size[0] && z < m.size[1] && !(m.blocked ?? []).some((b) => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1);
    for (const [who, pd] of Object.entries(r.people ?? {})) {
      const w = `mapa ${mid}: resgate ${who}`;
      if (people.has(who)) errors.push(`${w} repetido em outro mapa`);
      people.add(who);
      if (typeof pd.name !== 'string' || !pd.name || typeof pd.trapped !== 'string') errors.push(`${w}: nome e situação (trapped) obrigatórios`);
      if (!LOOKS.includes(pd.look)) errors.push(`${w}: look ${pd.look} (use ${LOOKS.join(', ')})`);
      if (!FREES.includes(pd.free)) errors.push(`${w}: free ${pd.free} (use ${FREES.join(', ')})`);
      if (!inside(pd.x, pd.z)) errors.push(`${w}: (${pd.x}, ${pd.z}) fora do mapa ou em área bloqueada`);
      if (!(pd.radius > 0)) errors.push(`${w}: radius ausente`);
      if (!Number.isInteger(pd.hp) || pd.hp < 1 || (pd.hpStart != null && (!Number.isInteger(pd.hpStart) || pd.hpStart < 1 || pd.hpStart > pd.hp))) errors.push(`${w}: hp/hpStart inválidos`);
      if (!Array.isArray(pd.rest) || !inside(pd.rest[0], pd.rest[1]) || (gp && Math.hypot(pd.rest[0] - gp.x, pd.rest[1] - gp.z) > gp.safeRadius)) errors.push(`${w}: rest precisa ficar dentro do círculo do posto`);
      if (pd.free === 'guards') {
        if (!pd.guards?.length) errors.push(`${w}: free "guards" sem guards`);
        for (const [mon, n] of pd.guards ?? []) if (!data.monsters[mon] || !Number.isInteger(n) || n < 1) errors.push(`${w}: guarda ${mon} ×${n} inválido`);
      }
      for (const [k, v] of Object.entries(pd.lines ?? {})) if (typeof v !== 'string' || !v) errors.push(`${w}: fala ${k} vazia`);
      // quem resgata tem nível 1: nenhum agressivo alcança quem está perto da pessoa
      for (const sp of m.spawns ?? []) {
        const reach = aggroReach(sp);
        if (reach != null && Math.hypot(sp.x - pd.x, sp.z - pd.z) <= reach + pd.radius + 2) errors.push(`${w}: ${data.monsters[sp.monster].name} em (${sp.x}, ${sp.z}) alcança quem vai buscá-lo`);
      }
    }
    if (!people.size) errors.push(`mapa ${mid}: rescue sem pessoas`);
    if (r.bell) {
      for (const k of ['radius', 'warnMs', 'width', 'back', 'ahead', 'damagePct', 'retryMs']) if (!(r.bell[k] > 0)) errors.push(`mapa ${mid}: rescue.bell.${k} ausente`);
      if (r.bell.damagePct >= 100) errors.push(`mapa ${mid}: o segundo toque não derruba ninguém (damagePct < 100)`);
    }
  }
  for (const [id, d] of Object.entries(items)) {
    // o mapa (tecla M) não se equipa e é do personagem: não vende, não descarta, não troca, não vai ao depósito
    if (d.kind === 'map' && (d.slot != null || !d.questItem || d.stack)) errors.push(`item ${id}: mapa sem espaço de equipamento, não empilhável e com questItem`);
  }
  // referência de NPC: id, '@master' ou uma lista deles (qualquer um vale)
  const npcOk = (ref) => (Array.isArray(ref) ? ref.length > 0 && ref.every((r) => r === '@master' || npcIds.has(r)) : ref === '@master' || npcIds.has(ref));
  const dropped = new Set();
  for (const [qid, q] of Object.entries(data.quests || {})) {
    if (!npcOk(q.npc) || !npcOk(q.turnIn)) errors.push(`missão ${qid}: NPC inexistente`);
    for (const pr of q.prereq) if (!data.quests[pr]) errors.push(`missão ${qid}: pré-requisito ${pr}`);
    if (q.repeat != null && q.repeat !== 'daily') errors.push(`missão ${qid}: repeat "${q.repeat}" (só "daily")`);
    for (const w of [].concat(q.where ?? [])) if (!data.maps[w]) errors.push(`missão ${qid}: where ${w}`);
    for (const o of q.objectives) {
      if ((o.type === 'kill' || o.type === 'questDrop') && !data.monsters[o.monster]) errors.push(`missão ${qid}: monstro ${o.monster}`);
      if (o.type === 'kill' && o.resetOnHazard && !hazardIds.has(o.resetOnHazard)) errors.push(`missão ${qid}: perigo ${o.resetOnHazard} inexistente`);
      if (o.type === 'collect' && !data.items[o.item]) errors.push(`missão ${qid}: item ${o.item}`);
      if (o.type === 'collect' && o.drop) {
        // material de coleta que só cai com a missão ativa: item de missão (não vende, não troca, sai na entrega)
        if (!data.monsters[o.drop.monster]) errors.push(`missão ${qid}: coleta de monstro inexistente ${o.drop.monster}`);
        if (!(o.drop.chance > 0 && o.drop.chance <= 1)) errors.push(`missão ${qid}: chance de coleta ${o.drop.chance}`);
        if (data.items[o.item] && !data.items[o.item].questItem) errors.push(`missão ${qid}: ${o.item} cai só com a missão e precisa ser item de missão (questItem)`);
        dropped.add(o.item);
      }
      if (o.type === 'interact') for (const ob of o.objects) if (!objIds.has(ob)) errors.push(`missão ${qid}: objeto ${ob}`);
      if ((o.type === 'talk' || o.type === 'choice') && !npcOk(o.npc)) errors.push(`missão ${qid}: NPC ${o.npc}`);
      if (o.type === 'defend' && !defenseIds.has(o.defense)) errors.push(`missão ${qid}: defesa ${o.defense} inexistente`);
      if (o.type === 'equipLevel' && !Number.isInteger(o.minLevel)) errors.push(`missão ${qid}: equipLevel sem minLevel`);
      // tutorial
      if (o.type === 'rescue' && !people.has(o.who)) errors.push(`missão ${qid}: pessoa ${o.who} sem bloco rescue em nenhum mapa`);
      if (o.type === 'skill' && !(Number.isInteger(o.slot) && o.slot >= 1 && o.slot <= data.skillRules.unlockLevels.length)) errors.push(`missão ${qid}: tecla de habilidade ${o.slot}`);
      if (o.type === 'pickup' && (!Number.isInteger(o.count) || o.count < 1 || (o.guarantee != null && !data.items[o.guarantee]))) errors.push(`missão ${qid}: coleta (count/guarantee) inválida`);
      if ((o.type === 'bell' || o.type === 'arrive') && !people.size) errors.push(`missão ${qid}: ${o.type} sem bloco rescue em nenhum mapa`);
      if ((o.tipMelee || o.tipRanged || o.step != null) && typeof o.hint !== 'string') errors.push(`missão ${qid}: dica da classe ou passo sem hint`);
      if (o.step != null && !Number.isInteger(o.step)) errors.push(`missão ${qid}: passo ${o.step}`);
      if (!o.text) errors.push(`missão ${qid}: objetivo ${o.type} sem texto`);
    }
    if (q.startHint != null && typeof q.startHint !== 'string') errors.push(`missão ${qid}: startHint`);
    const rw = q.rewards ?? {};
    for (const [it] of rw.items || []) if (!data.items[it]) errors.push(`missão ${qid}: recompensa ${it}`);
    // recompensa por armadura: as três armaduras, cada peça servindo para quem usa aquele peso
    if (rw.byArmor) {
      for (const w of ['heavy', 'light', 'robe']) if (!rw.byArmor[w]?.length) errors.push(`missão ${qid}: byArmor sem ${w}`);
      for (const [w, list] of Object.entries(rw.byArmor)) {
        const users = Object.entries(data.classes).filter(([, c]) => c.armorWeight === w).map(([cid]) => cid);
        if (!users.length) errors.push(`missão ${qid}: peso de armadura ${w} inexistente`);
        for (const [it, n] of list) {
          if (!data.items[it]) { errors.push(`missão ${qid}: recompensa ${it}`); continue; }
          int(`missão ${qid}: ${it}`, n);
          for (const cid of users) if (data.items[it].classes && !data.items[it].classes.includes(cid)) errors.push(`missão ${qid}: ${it} não serve para ${cid} (armadura ${w})`);
        }
      }
    }
    for (const [cid, list] of Object.entries(rw.byClass ?? {})) {
      if (!data.classes[cid]) errors.push(`missão ${qid}: classe ${cid}`);
      for (const [it] of list) if (!data.items[it] || (data.items[it].classes && !data.items[it].classes.includes(cid))) errors.push(`missão ${qid}: ${it} não serve para ${cid}`);
    }
    if (rw.title != null) {
      const t = rw.title;
      const texts = typeof t === 'string' ? [t] : [t.default, ...Object.values(t.byClass ?? {})];
      if (!texts.every((x) => typeof x === 'string' && x.trim())) errors.push(`missão ${qid}: título vazio`);
      for (const cid of Object.keys(t.byClass ?? {})) if (!data.classes[cid]) errors.push(`missão ${qid}: título para classe ${cid}`);
    }
  }
  // item de missão sem coleta que o derrube ficaria preso (não se vende nem se descarta)
  // (o mapa da tecla M é de missão de propósito: fica com o personagem para sempre)
  for (const d of Object.values(items)) if (d.questItem && d.kind !== 'map' && !dropped.has(d.id)) errors.push(`item ${d.id}: item de missão sem missão que o derrube`);
  // todo item publicado precisa de uma fonte no jogo (saque, loja, armeiro, kit ou missão)
  const sources = itemSources(data);
  for (const id of Object.keys(items)) if (!sources.has(id)) errors.push(`item ${id}: sem fonte (não cai, não se compra, não vem no kit nem de missão)`);
  // XP de missões por faixa (principais + secundárias, diárias uma vez): no máximo 55% do XP da faixa (docs/04, 4.2)
  for (const b of missionXpByBand(data)) {
    if (b.totalPct > MISSION_XP_CAP + 1e-9) errors.push(`faixa ${b.from}–${b.to}: missões somam ${Math.round(b.totalPct * 1000) / 10}% do XP (teto ${Math.round(MISSION_XP_CAP * 100)}%)`);
  }
  const cum = data.xp.cumulative;
  if (cum.length !== data.levelCap) errors.push('tabela de XP com tamanho errado');
  for (let i = 1; i < cum.length; i++) if (cum[i] <= cum[i - 1]) errors.push(`XP não crescente no nível ${i + 1}`);
  for (const r of reachability(data)) if (!r.ok) errors.push(`${r.classId}/${r.family} faixa ${r.tier}: precisa ${r.spend} pontos, tem ${r.available}`);
  for (const [bid, b] of Object.entries(builds)) for (const e of runBuild(b, data).errors) errors.push(`build ${bid}: ${e}`);
  return { errors, warn };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const data = loadGameData();
  const { errors, warn } = validate(data, loadBuilds());
  for (const w of warn) console.log('aviso:', w);
  const tight = reachability(data).filter((r) => r.tier > 1).sort((a, b) => a.spare - b.spare).slice(0, 5);
  console.log('Conjuntos com menor folga de pontos:');
  for (const r of tight) console.log(`  ${data.classes[r.classId].name} / ${r.family} nv${r.tier}: gasta ${r.spend} de ${r.available} (sobram ${r.spare})`);
  const pct = (v) => `${Math.round(v * 1000) / 10}%`;
  console.log(`XP de missões por faixa (principais + secundárias, diárias uma vez; teto ${Math.round(MISSION_XP_CAP * 100)}%):`);
  for (const b of missionXpByBand(data)) console.log(`  níveis ${b.from}–${b.to}: ${b.span} de XP; principais ${b.main} (${pct(b.mainPct)}) + secundárias ${b.side} (${pct(b.sidePct)}) = ${pct(b.totalPct)}`);
  if (errors.length) { for (const e of errors) console.log('ERRO:', e); process.exit(1); }
  console.log(`Dados válidos: ${Object.keys(data.items).length} itens, ${Object.keys(data.monsters).length} monstros, ${Object.keys(data.skills).length} habilidades.`);
}
