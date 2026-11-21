// Valida a coerência dos arquivos de dados. Uso: npm run validate-data
// Também é importado pelos testes e pelo gerador de documentação.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadGameData, ATTRS, DEFAULT_DATA_DIR } from '../src/data.js';
import { totalAttributePoints } from '../src/rules.js';
import { MECHANIC_KINDS, TELEGRAPH_SHAPES, DEBUFF_MODS, MIN_WARN_MS, MAX_DEBUFF_MS, MAX_STUN_MS } from '../src/mechanics.js';

export const TIERS = [1, 5, 9, 13, 17, 20, 21, 25];
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
  for (const [mid, m] of Object.entries(data.monsters)) errors.push(...mechanicErrors(mid, m, data));
  for (const [tid, t] of Object.entries(data.lootTables)) {
    for (const e of t.entries) {
      const ids = e.type === 'item' ? [e.defId] : e.type === 'pool' ? e.pool : e.type === 'classDrop' ? Object.values(e.byClass) : [];
      for (const id of ids) if (!items[id]) errors.push(`tabela ${tid}: item ${id}`);
      if (e.type === 'classDrop') for (const [c, id] of Object.entries(e.byClass)) if (items[id]?.classes && !items[id].classes.includes(c)) errors.push(`tabela ${tid}: ${id} não serve para ${c}`);
    }
  }
  const npcIds = new Set(), objIds = new Set();
  for (const [mid, m] of Object.entries(data.maps)) {
    for (const sp of m.spawns || []) if (!data.monsters[sp.monster]) errors.push(`mapa ${mid}: monstro ${sp.monster}`);
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
  const npcOk = (ref) => ref === '@master' || npcIds.has(ref);
  for (const [qid, q] of Object.entries(data.quests || {})) {
    if (!npcOk(q.npc) || !npcOk(q.turnIn)) errors.push(`missão ${qid}: NPC inexistente`);
    for (const pr of q.prereq) if (!data.quests[pr]) errors.push(`missão ${qid}: pré-requisito ${pr}`);
    for (const o of q.objectives) {
      if ((o.type === 'kill' || o.type === 'questDrop') && !data.monsters[o.monster]) errors.push(`missão ${qid}: monstro ${o.monster}`);
      if (o.type === 'collect' && !data.items[o.item]) errors.push(`missão ${qid}: item ${o.item}`);
      if (o.type === 'interact') for (const ob of o.objects) if (!objIds.has(ob)) errors.push(`missão ${qid}: objeto ${ob}`);
      if (o.type === 'talk' && !npcOk(o.npc)) errors.push(`missão ${qid}: NPC ${o.npc}`);
    }
    for (const [it] of q.rewards.items || []) if (!data.items[it]) errors.push(`missão ${qid}: recompensa ${it}`);
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
  if (errors.length) { for (const e of errors) console.log('ERRO:', e); process.exit(1); }
  console.log(`Dados válidos: ${Object.keys(data.items).length} itens, ${Object.keys(data.monsters).length} monstros, ${Object.keys(data.skills).length} habilidades.`);
}
