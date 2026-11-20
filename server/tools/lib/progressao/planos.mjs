// Planos dos bots de progressão: kit padrão de cada faixa, distribuição de atributos nível a
// nível, prioridade de graus de habilidade, rotas entre mapas (portais) e áreas de caça.
// Tudo derivado de /data; nada aqui muda regra do jogo.
import { ATTRS } from '../../../src/data.js';
import { loadBuilds } from '../../validate-data.js';

// faixas com peças comuns (a 20 só tem as únicas do Custódio; 21 e 25 são do pós-v1)
export const FAIXAS = [1, 5, 9, 13, 17, 21, 25];

const ARMADURA = {
  heavy: ['heavy_armor', 'heavy_helm', 'heavy_gloves', 'heavy_boots'],
  light: ['light_armor', 'light_hood', 'light_gloves', 'light_boots'],
  robe: ['robe', 'robe_circlet', 'robe_gloves', 'robe_sandals'],
};

const RARIDADE = { common: 0, uncommon: 1, rare: 2, unique: 3 };

// Família da arma e da mão secundária do kit inicial da classe (a escolha "padrão" de cada classe,
// a mesma dos exemplos de evolução da documentação).
export function kitPadrao(classId, data) {
  const cls = data.classes[classId];
  const defs = cls.startingKit.equip.map((id) => data.items[id]);
  const arma = defs.find((d) => d.slot === 'weapon');
  const mao = defs.find((d) => d.slot === 'offhand');
  return { arma: arma.family, maoSecundaria: arma.hands === 1 ? mao?.family ?? null : null, armaduras: ARMADURA[cls.armorWeight] };
}

// Peças comuns da faixa: arma + mão secundária (arma de uma mão) + 4 peças de armadura.
export function kitDaFaixa(classId, faixa, data) {
  const k = kitPadrao(classId, data);
  const ids = [`${k.arma}_t${faixa}`];
  if (k.maoSecundaria) ids.push(`${k.maoSecundaria}_t${faixa}`);
  for (const f of k.armaduras) ids.push(`${f}_t${faixa}`);
  return ids.filter((id) => data.items[id]);
}

function requisitos(ids, data) {
  const need = {};
  for (const id of ids) for (const [a, v] of Object.entries(data.items[id].req || {})) need[a] = Math.max(need[a] || 0, v);
  return need;
}

// Atributo de dano da classe (para os pontos livres dos planos gerados).
export function atributoPrincipal(classId, data) {
  const w = data.items[`${kitPadrao(classId, data).arma}_t1`];
  if (w.damageType === 'magic') return 'spi';
  return Object.entries(w.scaling || { str: 1 }).sort((a, b) => b[1] - a[1])[0][0];
}

// Plano de atributos: o de data/example_builds.json quando existe para a classe; senão um plano
// gerado no mesmo espírito (requisitos do kit da próxima faixa espalhados pelos níveis que faltam
// até ela; o resto na proporção 2 atributo principal : 3 Vitalidade, como os exemplos fazem).
export function planoAtributos(classId, data, builds = loadBuilds()) {
  const exemplo = Object.entries(builds).find(([, b]) => b.classId === classId);
  if (exemplo) return { fonte: `example_builds.json (${exemplo[0]})`, porNivel: exemplo[1].perLevel };
  const cls = data.classes[classId];
  const attrs = { ...cls.start };
  const faixas = FAIXAS.filter((t) => t > 1);
  const req = Object.fromEntries(faixas.map((t) => [t, requisitos(kitDaFaixa(classId, t, data), data)]));
  const principal = atributoPrincipal(classId, data);
  const pesos = { [principal]: 2, vit: 3 };
  const dados = Object.fromEntries(Object.keys(pesos).map((a) => [a, 0]));
  const porNivel = {};
  for (let L = 2; L <= data.levelCap; L++) {
    let pts = data.pointsPerLevel;
    const alloc = {};
    const T = faixas.find((t) => t >= L);
    if (T) {
      const def = {};
      let falta = 0;
      for (const a of ATTRS) { def[a] = Math.max(0, (req[T][a] || 0) - attrs[a]); falta += def[a]; }
      let agora = Math.min(pts, Math.ceil(falta / (T - L + 1)));
      while (agora > 0) {
        const a = ATTRS.filter((x) => def[x] > 0).sort((x, y) => def[y] - def[x])[0];
        if (!a) break;
        alloc[a] = (alloc[a] || 0) + 1; def[a]--; attrs[a]++; agora--; pts--;
      }
    }
    while (pts > 0) {
      const a = Object.keys(pesos).sort((x, y) => dados[x] / pesos[x] - dados[y] / pesos[y])[0];
      alloc[a] = (alloc[a] || 0) + 1; dados[a]++; attrs[a]++; pts--;
    }
    porNivel[L] = alloc;
  }
  return { fonte: `gerado (requisitos das faixas + ${data.attributes[principal].name}/Vitalidade 2:3)`, porNivel };
}

// Confere o plano: soma 5 por nível e cumpre os requisitos do kit de cada faixa no nível da faixa.
export function verificarPlano(classId, plano, data) {
  const attrs = { ...data.classes[classId].start };
  const erros = [];
  for (let L = 2; L <= data.levelCap; L++) {
    const a = plano.porNivel[String(L)] || {};
    const soma = Object.values(a).reduce((s, v) => s + v, 0);
    if (soma !== data.pointsPerLevel) erros.push(`nível ${L}: ${soma} pontos`);
    for (const [k, v] of Object.entries(a)) attrs[k] += v;
    if (FAIXAS.includes(L)) {
      for (const [k, v] of Object.entries(requisitos(kitDaFaixa(classId, L, data), data))) if (attrs[k] < v) erros.push(`nível ${L}: ${k} ${attrs[k]}/${v}`);
    }
  }
  return erros;
}

// Ordem de compra de graus (1 ponto por grau, respeitando o teto da faixa de nível): primeiro o que
// mais acelera a caça solo da classe. Classes sem entrada usam a ordem de data/classes.json.
export const PRIORIDADE_HABILIDADES = {
  breaker: ['deep_cut', 'rupture', 'momentum', 'seismic_rift', 'gravel_carapace'],
  bastion: ['pull_pulse', 'locked_gear', 'dynamic_plate', 'field_reinforcement', 'living_bastille'],
  pikeman: ['long_thrust', 'moat_charge', 'split_line', 'firm_haft', 'pike_wall'],
  warden: ['passage_arrow', 'thorn_rain', 'trail_mark', 'spinal_shot', 'recoil_step'],
  dawnshield: ['solar_cut', 'noon_blade', 'dawn_guard', 'oath', 'daybreak'],
  windwalker: ['return_throw', 'cutting_gust', 'side_step', 'tailwind', 'eye_of_storm'],
  veilsinger: ['sustain_chant', 'clear_note', 'veil_seal', 'shared_light', 'renewal_choir'],
  emberweaver: ['glass_spark', 'ember_ground', 'soot_circle', 'heat_veil', 'furnace_heart'],
};

export function prioridadeHabilidades(classId, data) {
  return PRIORIDADE_HABILIDADES[classId] ?? data.classes[classId].skills;
}

// Comparação de peças do mesmo espaço: nível do item, depois raridade, depois bônus de atributo.
export function valorItem(def) {
  const bonus = Object.values(def.bonusAttrs || {}).reduce((s, v) => s + v, 0);
  return def.level * 100 + (RARIDADE[def.rarity] ?? 0) * 10 + bonus;
}

// ---------- mapas ----------
export function grafoMapas(data) {
  const adj = new Map();
  for (const [id, m] of Object.entries(data.maps)) {
    if (!m.implementedIn || m.instanced) continue;
    adj.set(id, (m.portals ?? []).filter((p) => data.maps[p.to] && !data.maps[p.to].instanced).map((p) => ({ to: p.to, minLevel: p.minLevel || 1 })));
  }
  return adj;
}

// Menor sequência de mapas (sem o de origem) respeitando o nível mínimo dos portais; null se não há.
export function rota(adj, de, para, nivel) {
  if (de === para) return [];
  const prev = new Map([[de, null]]);
  const fila = [de];
  while (fila.length) {
    const cur = fila.shift();
    for (const e of adj.get(cur) ?? []) {
      if (prev.has(e.to) || nivel < e.minLevel) continue;
      prev.set(e.to, cur);
      if (e.to === para) {
        const out = [];
        for (let c = para; c !== de; c = prev.get(c)) out.unshift(c);
        return out;
      }
      fila.push(e.to);
    }
  }
  return null;
}

export function cidadeDaClasse(classId, data) {
  for (const [id, m] of Object.entries(data.maps)) {
    const mestre = (m.npcs ?? []).find((n) => n.role === 'master' && n.classId === classId);
    if (mestre) {
      return {
        mapId: id, mestre,
        loja: (m.npcs ?? []).find((n) => n.role === 'shop') ?? null,
        deposito: (m.npcs ?? []).find((n) => n.role === 'storage') ?? null,
      };
    }
  }
  return null;
}

// Grupos de monstros normais dos mapas abertos (elites, chefes e diárias ficam de fora).
export function areasDeCaca(data) {
  const out = [];
  for (const [mapId, m] of Object.entries(data.maps)) {
    if (!m.implementedIn || m.instanced || !m.spawns) continue;
    m.spawns.forEach((sp, i) => {
      const def = data.monsters[sp.monster];
      if (def.rank !== 'normal' || def.daily) return;
      out.push({ id: `${mapId}#${i}`, mapId, monster: sp.monster, def, x: sp.x, z: sp.z, radius: sp.radius, count: sp.count, guardPost: m.guardPost });
    });
  }
  return out;
}

// Área para o nível: monstros em [nível−2, nível+1] (a janela do enunciado), de preferência no
// próprio nível; empate: passivos, grupos agressivos menos densos (mais fáceis de puxar um a um),
// mapa atual (menos viagem), grupo maior.
// Modo de perigo (ajuste < 0, depois de mortes e fugas): monstros agressivos só até nível+ajuste
// (e preferidos nesse nível); os passivos — que lutam um a um, sem chamar o grupo nem atacar por
// proximidade — continuam na janela inteira e pesam mais. Áreas evitadas (onde o bot caiu há
// pouco) ficam de fora enquanto houver outra: antes de voltar a uma delas, a janela desce um
// nível por vez (até 3 abaixo); só então aceita as evitadas.
export function escolherArea(areas, adj, { nivel, ajuste = 0, mapaAtual, evitar = new Set() }) {
  const perigo = ajuste < 0;
  const passivo = (a) => a.def.aggro === 'passive';
  const teto = (a) => (perigo && !passivo(a) ? nivel + ajuste : nivel + 1);
  const alvo = (a) => (perigo && !passivo(a) ? nivel + ajuste : nivel);
  const alcancavel = (a) => rota(adj, mapaAtual, a.mapId, nivel) !== null;
  const janela = (min) => areas.filter((a) => a.def.level >= min && a.def.level <= teto(a) && alcancavel(a));
  let lista = [];
  for (let desce = 0; desce <= 3 && !lista.length; desce++) lista = janela(nivel - 2 - desce).filter((a) => !evitar.has(a.id));
  if (!lista.length) lista = janela(nivel - 2);
  if (!lista.length) lista = areas.filter((a) => a.def.level <= nivel + 1 && alcancavel(a));
  let melhor = null, melhorNota = Infinity;
  for (const a of lista) {
    const r = rota(adj, mapaAtual, a.mapId, nivel);
    const L = a.def.level;
    const densidade = passivo(a) ? 0 : (a.count / (Math.PI * a.radius * a.radius)) * 100;
    const nota = Math.abs(L - alvo(a)) + (L > alvo(a) ? 0.35 : 0) - (passivo(a) ? (perigo ? 1.2 : 0.3) : 0) + densidade * 0.05 + r.length * 0.05 - a.count * 0.01;
    if (nota < melhorNota) { melhorNota = nota; melhor = a; }
  }
  return melhor;
}
