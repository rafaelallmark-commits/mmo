// Valida a coerência dos arquivos de dados. Uso: npm run validate-data
// Também é importado pelos testes e pelo gerador de documentação.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadGameData, ATTRS, DEFAULT_DATA_DIR } from '../src/data.js';
import { totalAttributePoints } from '../src/rules.js';

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
  // alcance máximo de um monstro agressivo do bando: raio do bando + passeio (1 + até 4 m, zone.tickMonster) + agressão
  const aggroReach = (sp) => { const md = data.monsters[sp.monster]; return md?.aggro === 'aggressive' ? sp.radius + 1 + Math.min(4, sp.radius) + md.aggroRadius : null; };
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
  // chegada por portal (D164): quem atravessa não aparece, ainda na tela de carregamento, no alcance de um bando agressivo
  for (const [mid, m] of Object.entries(data.maps)) {
    for (const pt of m.portals ?? []) {
      const dm = data.maps[pt.to];
      if (!dm || !Number.isFinite(pt.toX) || !Number.isFinite(pt.toZ)) continue;
      for (const sp of dm.spawns ?? []) {
        const reach = aggroReach(sp);
        if (reach == null) continue;
        const d = Math.hypot(sp.x - pt.toX, sp.z - pt.toZ);
        if (d <= reach) errors.push(`portal ${mid}/${pt.id}: a chegada em ${pt.to} (${pt.toX}, ${pt.toZ}) fica no alcance de ${data.monsters[sp.monster].name} em (${sp.x}, ${sp.z}): ${d.toFixed(1)} m para ${reach} m`);
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
  const npcOk = (ref) => ref === '@master' || npcIds.has(ref);
  for (const [qid, q] of Object.entries(data.quests || {})) {
    if (!npcOk(q.npc) || !npcOk(q.turnIn)) errors.push(`missão ${qid}: NPC inexistente`);
    for (const pr of q.prereq) if (!data.quests[pr]) errors.push(`missão ${qid}: pré-requisito ${pr}`);
    for (const o of q.objectives) {
      if ((o.type === 'kill' || o.type === 'questDrop') && !data.monsters[o.monster]) errors.push(`missão ${qid}: monstro ${o.monster}`);
      if (o.type === 'collect' && !data.items[o.item]) errors.push(`missão ${qid}: item ${o.item}`);
      if (o.type === 'interact') for (const ob of o.objects) if (!objIds.has(ob)) errors.push(`missão ${qid}: objeto ${ob}`);
      if (o.type === 'talk' && !npcOk(o.npc)) errors.push(`missão ${qid}: NPC ${o.npc}`);
      // tutorial
      if (o.type === 'rescue' && !people.has(o.who)) errors.push(`missão ${qid}: pessoa ${o.who} sem bloco rescue em nenhum mapa`);
      if (o.type === 'skill' && !(Number.isInteger(o.slot) && o.slot >= 1 && o.slot <= data.skillRules.unlockLevels.length)) errors.push(`missão ${qid}: tecla de habilidade ${o.slot}`);
      if (o.type === 'pickup' && (!Number.isInteger(o.count) || o.count < 1 || (o.guarantee != null && !data.items[o.guarantee]))) errors.push(`missão ${qid}: coleta (count/guarantee) inválida`);
      if ((o.type === 'bell' || o.type === 'arrive') && !people.size) errors.push(`missão ${qid}: ${o.type} sem bloco rescue em nenhum mapa`);
      if ((o.tipMelee || o.tipRanged || o.step != null) && typeof o.hint !== 'string') errors.push(`missão ${qid}: dica da classe ou passo sem hint`);
      if (o.step != null && !Number.isInteger(o.step)) errors.push(`missão ${qid}: passo ${o.step}`);
    }
    if (q.startHint != null && typeof q.startHint !== 'string') errors.push(`missão ${qid}: startHint`);
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
