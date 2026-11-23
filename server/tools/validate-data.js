// Valida a coerência dos arquivos de dados. Uso: npm run validate-data
// Também é importado pelos testes e pelo gerador de documentação.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadGameData, ATTRS, DEFAULT_DATA_DIR } from '../src/data.js';
import { totalAttributePoints } from '../src/rules.js';
import { TRIAL_KINDS } from '../src/trial.js';

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

// Provas de classe (data/maps.json → arena_prova.trial.classes; regras em server/src/trial.js): uma por
// classe, com os campos que a regra (kind) usa, monstros da arena e posições dentro dela, e as premissas que
// cada prova ensina (o cone da Ruptura pega dois pilares, o salto do Avanço do Fosso cruza o fosso, o jato
// passa da vida do aprendiz, a fila de alvos está ao alcance do arco, o tempo cabe na instância).
// modelos que o cliente sabe desenhar para as peças e os monstros da prova (art.gd)
export const TRIAL_MODELS = ['pillar', 'dummy', 'target', 'bell', 'archer', 'runner'];

export function validateTrials(data) {
  const errors = [];
  const arena = data.maps.arena_prova;
  const trial = arena?.trial;
  if (!trial?.classes) return ['arena_prova: falta trial.classes (uma prova por classe)'];
  const [W, H] = arena.size;
  const dentro = (where, x, z) => { if (!(x >= 0 && x <= W && z >= 0 && z <= H)) errors.push(`${where}: (${x}, ${z}) fora da arena`); };
  const monstro = (where, id) => {
    const m = data.monsters[id];
    if (!m) errors.push(`${where}: monstro ${id} inexistente`);
    else if (m.area !== 'arena_prova') errors.push(`${where}: ${id} não é monstro da arena (area ${m.area})`);
    return m;
  };
  const num = (where, v, min = 0) => { if (typeof v !== 'number' || !Number.isFinite(v) || v < min) errors.push(`${where}: número inválido (${v})`); };
  const aliado = (where, a) => {
    if (!a || typeof a.name !== 'string' || !a.name) { errors.push(`${where}: aliado sem nome`); return; }
    if (!['apprentice', 'pilgrim'].includes(a.model)) errors.push(`${where}: modelo ${a.model} desconhecido (apprentice, pilgrim)`);
    if (typeof a.fem !== 'boolean') errors.push(`${where}: ${a.name} sem "fem" (true/false: o corpo do morador no cliente)`);
    num(`${where}: vida`, a.hp, 1);
    dentro(where, a.x, a.z);
  };
  // peças da arena: aparência própria no cliente (client/scripts/art.gd trial_piece e monster) e peças paradas
  // (inert) só dentro da prova
  for (const [id, m] of Object.entries(data.monsters)) {
    if (m.model !== undefined && !TRIAL_MODELS.includes(m.model)) errors.push(`monstro ${id}: model ${m.model} desconhecido (${TRIAL_MODELS.join(', ')})`);
    if (m.inert && m.area !== 'arena_prova') errors.push(`monstro ${id}: peça parada (inert) fora da Arena da Prova`);
  }
  for (const [cid, cls] of Object.entries(data.classes)) {
    const c = trial.classes[cid];
    const w = `prova ${cid}`;
    if (!c) { errors.push(`${w}: a classe ${cls.name} não tem prova`); continue; }
    if (!TRIAL_KINDS.includes(c.kind)) { errors.push(`${w}: regra ${c.kind} desconhecida (${TRIAL_KINDS.join(', ')})`); continue; }
    for (const k of ['title', 'objective', 'hint']) if (typeof c[k] !== 'string' || c[k].length < 4) errors.push(`${w}: ${k} vazio`);
    if (!Number.isInteger(c.timeMs) || c.timeMs < 20000 || c.timeMs > trial.durationMs) errors.push(`${w}: timeMs ${c.timeMs} fora de 20000..${trial.durationMs}`);
    const sig = cls.skills.map((s) => data.skills[s]).find((s) => s?.unlockLevel === 10);
    if (!sig) errors.push(`${w}: a classe não tem habilidade do nível 10 para emprestar`);
    for (const b of c.blocked ?? []) { dentro(`${w}: área bloqueada`, b.x0, b.z0); dentro(`${w}: área bloqueada`, b.x1, b.z1); }
    switch (c.kind) {
      case 'pillars': {
        const m = monstro(w, c.monster);
        if (m && !m.inert) errors.push(`${w}: o pilar precisa ser inert`);
        if (!(c.pillars?.length >= 2)) errors.push(`${w}: pelo menos 2 pilares`);
        for (const [x, z] of c.pillars ?? []) dentro(w, x, z);
        // o cone da Ruptura (alcance e ângulo da habilidade) precisa conseguir pegar dois pilares de uma vez
        const reach = 2 * (sig?.range ?? 4) * Math.sin(((sig?.effect?.angleDeg ?? 90) / 2) * Math.PI / 180);
        const par = (c.pillars ?? []).some((a, i) => c.pillars.some((b, j) => j > i && Math.hypot(a[0] - b[0], a[1] - b[1]) <= reach));
        if (!par) errors.push(`${w}: nenhum par de pilares cabe no cone de ${sig?.name ?? 'Ruptura'} (até ${reach.toFixed(1)} m entre eles)`);
        for (const k of ['everyMs', 'warnMs', 'radius', 'damagePctMaxHp']) num(`${w}: debris.${k}`, c.debris?.[k], 0.1);
        break;
      }
      case 'hold': {
        aliado(w, c.ally);
        if (!(c.spawns?.length)) errors.push(`${w}: sem construtos`);
        for (const sp of c.spawns ?? []) { monstro(w, sp.monster); dentro(w, sp.x, sp.z); num(`${w}: count`, sp.count, 1); if (sp.atMs >= c.timeMs) errors.push(`${w}: construtos depois do fim (${sp.atMs} ms)`); }
        for (const at of c.rushes ?? []) if (at + (c.rushMs ?? 0) > c.timeMs) errors.push(`${w}: investida passa do fim da prova`);
        num(`${w}: threatDecay.pctPerSec`, c.threatDecay?.pctPerSec);
        num(`${w}: threatDecay.flatPerSec`, c.threatDecay?.flatPerSec);
        break;
      }
      case 'rows': {
        const m = monstro(w, c.monster);
        if (m && !m.inert) errors.push(`${w}: o boneco precisa ser inert`);
        if (!(c.rows?.length)) errors.push(`${w}: sem filas`);
        for (const row of c.rows ?? []) {
          dentro(w, row.from[0], row.from[1]); dentro(w, row.to[0], row.to[1]);
          if (!(row.count >= 2)) errors.push(`${w}: fila com menos de 2 bonecos`);
          // atrás de um fosso: o salto do Avanço do Fosso precisa alcançar a fila a partir da beirada
          const mz = (row.from[1] + row.to[1]) / 2;
          const fosso = (c.blocked ?? []).filter((bb) => bb.z1 <= mz).sort((a, b) => b.z1 - a.z1)[0];
          if (fosso && mz - (fosso.z0 - 0.7) > (sig?.range ?? 10)) errors.push(`${w}: a fila em z=${mz} fica longe demais da beirada do fosso para ${sig?.name ?? 'o salto'}`);
        }
        num(`${w}: standUpMs`, c.standUpMs, 1000); num(`${w}: regenAfterMs`, c.regenAfterMs, 1000);
        break;
      }
      case 'targets': {
        const m = monstro(w, c.monster);
        if (m && !m.inert) errors.push(`${w}: o alvo precisa ser inert`);
        const p = c.post;
        if (!p) { errors.push(`${w}: sem posto de tiro`); break; }
        dentro(w, p.x0, p.z0); dentro(w, p.x1, p.z1);
        const total = (c.waves ?? []).reduce((n, wv) => n + wv.count, 0);
        if (!(c.need >= 1 && c.need <= total)) errors.push(`${w}: need ${c.need} fora de 1..${total}`);
        // o trilho mais longe precisa estar ao alcance do arco da classe a partir da borda do posto
        const kit = cls.startingKit.equip.map((id) => data.items[id]).find((d) => d?.slot === 'weapon');
        for (const wv of c.waves ?? []) {
          dentro(w, wv.from[0], wv.from[1]); dentro(w, wv.to[0], wv.to[1]);
          num(`${w}: speed`, wv.speed, 0.1);
          const far = Math.max(wv.from[1], wv.to[1]) - p.z1;
          if (kit?.range && far > kit.range) errors.push(`${w}: trilho a ${far} m do posto, além do alcance de ${kit.name} (${kit.range} m)`);
        }
        break;
      }
      case 'escort': {
        aliado(w, c.ally);
        num(`${w}: velocidade do peregrino`, c.ally?.speed, 0.1);
        if (!(c.route?.length >= 2)) errors.push(`${w}: rota com menos de 2 pontos`);
        for (const [x, z] of c.route ?? []) dentro(w, x, z);
        const marks = new Set((c.route ?? []).map((pt) => pt[2]).filter((x) => x != null));
        for (const amb of c.ambush ?? []) {
          if (!marks.has(amb.at)) errors.push(`${w}: emboscada no marco ${amb.at}, que a rota não tem`);
          for (const sp of amb.spawns ?? []) { monstro(w, sp.monster); dentro(w, sp.x, sp.z); }
        }
        break;
      }
      case 'course': {
        const m = monstro(w, c.monster);
        if (m && !m.inert) errors.push(`${w}: o sino precisa ser inert`);
        if (!(c.bells?.length >= 2)) errors.push(`${w}: pelo menos 2 sinos`);
        for (const [x, z] of c.bells ?? []) dentro(w, x, z);
        const ch = c.chasers;
        if (!ch) { errors.push(`${w}: sem perseguidores`); break; }
        monstro(w, ch.monster);
        for (const [x, z] of [...(ch.start ?? []), ...(ch.spawnAt ?? [])]) dentro(w, x, z);
        num(`${w}: speedBase`, ch.speedBase, 0.1);
        num(`${w}: speedPerBell`, ch.speedPerBell ?? 0);
        // a dica promete que os perseguidores nunca correm mais que a Andarilha (sem reforço de velocidade):
        // o perigo da prova é ser encurralada parada no arremesso, não ser alcançada na corrida
        const top = ch.speedBase + (ch.speedPerBell ?? 0) * Math.max(0, (c.bells?.length ?? 1) - 1);
        const run = data.formulas.movement.playerSpeed;
        if (top >= run) errors.push(`${w}: perseguidores chegam a ${top.toFixed(2)} m/s, não menos que a corrida do jogador (${run} m/s)`);
        break;
      }
      case 'vigil': {
        if (!(c.allies?.length)) errors.push(`${w}: sem aprendizes`);
        for (const a of c.allies ?? []) aliado(w, a);
        num(`${w}: soot.damage`, c.soot?.damage, 1); num(`${w}: soot.everyMs`, c.soot?.everyMs, 100);
        num(`${w}: jets.everyMs`, c.jets?.everyMs, 1000); num(`${w}: jets.warnMs`, c.jets?.warnMs, 500);
        // o jato passa da vida cheia do aprendiz: só o escudo (a habilidade do nível 10) segura
        const maxHp = Math.max(...(c.allies ?? []).map((a) => a.hp));
        if (!(c.jets?.damage > maxHp)) errors.push(`${w}: o jato (${c.jets?.damage}) precisa passar da vida cheia dos aprendizes (${maxHp})`);
        if ((c.jets?.everyMs ?? 0) < (sig?.cooldownMs ?? 0)) errors.push(`${w}: jatos mais frequentes que a recarga de ${sig?.name}`);
        break;
      }
      case 'waves': {
        num(`${w}: line`, c.line, 1); num(`${w}: leaks`, c.leaks, 1);
        if (!(c.waves?.length)) errors.push(`${w}: sem ondas`);
        for (const wv of c.waves ?? []) {
          if (wv.atMs >= c.timeMs) errors.push(`${w}: onda depois do fim`);
          for (const sp of wv.spawns ?? []) { monstro(w, sp.monster); dentro(w, sp.x, sp.z); }
        }
        break;
      }
      default:
    }
  }
  for (const id of Object.keys(trial.classes)) if (!data.classes[id]) errors.push(`prova ${id}: classe inexistente`);
  return errors;
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
  errors.push(...validateTrials(data));
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
