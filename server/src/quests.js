// Motor de missões. O estado vive em char.quests (Map questId -> { state, progress }) e é
// gravado em quest_progress a cada mudança. Toda conclusão roda numa transação e é idempotente.
//
// Referências de NPC (npc, turnIn e o npc de um objetivo "talk"): um id, '@master' (o mestre da classe do
// personagem) ou uma lista deles (vale qualquer um: "Gusmão ou Tiela", "um mestre de cada cidade").
// Missões com repeat "daily" voltam no dia seguinte (dia UTC, como as elites diárias da D54): a entrega
// grava o dia em progress._day.
import { randomUUID } from 'node:crypto';
import { bagCount, BAG_CAPACITY, equippedIn } from './equipment.js';

// dia (UTC) das missões diárias: o mesmo relógio das elites diárias (zone.js, dayKey)
export const questDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const DAY_MS = 86_400_000;

// Faixas de nível das contas de XP de missão (uma por capítulo; docs/02 e docs/04). A missão entra na faixa
// do nível em que fica disponível; a última faixa inclui o teto.
export const QUEST_BANDS = [
  { chapter: 1, from: 1, to: 5 }, { chapter: 2, from: 5, to: 9 }, { chapter: 3, from: 9, to: 12 },
  { chapter: 4, from: 12, to: 16 }, { chapter: 5, from: 16, to: 20 }, { chapter: 6, from: 20, to: 25 },
];
export const MISSION_XP_CAP = 0.55; // teto do XP de uma faixa vindo de missões (principais + secundárias)

export function bandOf(level) {
  return QUEST_BANDS.find((b, i) => level >= b.from && (level < b.to || i === QUEST_BANDS.length - 1)) ?? null;
}

// XP de missões por faixa contra a tabela de XP: principais (capítulo 0–6) e secundárias (id s_*), as
// diárias contadas uma vez. Usado pelo validador e pelo docs/04.
export function missionXpByBand(data) {
  const cum = data.xp.cumulative;
  return QUEST_BANDS.map((b) => {
    const span = cum[b.to - 1] - cum[b.from - 1];
    let main = 0, side = 0;
    const sideList = [], mainList = [];
    for (const [id, q] of Object.entries(data.quests)) {
      if (bandOf(q.level) !== b) continue;
      const xp = q.rewards?.xp || 0;
      if (isSideQuest(id, q)) { side += xp; sideList.push(id); } else { main += xp; mainList.push(id); }
    }
    return { ...b, span, main, side, total: main + side, mainPct: main / span, sidePct: side / span, totalPct: (main + side) / span, mainList, sideList };
  });
}

export function isSideQuest(id, q) { return q.side === true || id.startsWith('s_'); }

const refList = (ref) => (Array.isArray(ref) ? ref : ref == null ? [] : [ref]);

export class QuestEngine {
  constructor({ data, store }) {
    this.data = data;
    this.store = store;
    this.quests = data.quests ?? {};
    this.now = () => Date.now(); // relógio das diárias (os testes avançam um dia trocando esta função)
    // nome de exibição de cada NPC (o diário mostrava o id interno: "fale com master_veilsinger") e os mapas
    // onde ele fica (o quadro de missões diz onde procurar)
    this.npcNames = new Map();
    this.npcMaps = new Map();
    this.monsterMaps = new Map();
    for (const [mapId, m] of Object.entries(data.maps ?? {})) {
      for (const n of m?.npcs ?? []) {
        if (!this.npcNames.has(n.id)) this.npcNames.set(n.id, n.name);
        if (!this.npcMaps.has(n.id)) this.npcMaps.set(n.id, []);
        this.npcMaps.get(n.id).push(mapId);
      }
      if (m?.instanced) continue;
      for (const sp of m?.spawns ?? []) {
        if (!this.monsterMaps.has(sp.monster)) this.monsterMaps.set(sp.monster, []);
        if (!this.monsterMaps.get(sp.monster).includes(mapId)) this.monsterMaps.get(sp.monster).push(mapId);
      }
    }
    // dicas do tutorial por classe: à distância (arma inicial com "ranged") ou corpo a corpo
    this.rangedClass = new Map();
    for (const [cid, c] of Object.entries(data.classes ?? {})) {
      const w = (c.startingKit?.equip ?? []).map((id) => data.items?.[id]).find((d) => d?.slot === 'weapon');
      this.rangedClass.set(cid, !!w?.ranged);
    }
  }

  load(char) {
    char.quests = new Map();
    for (const r of this.store.loadQuests(char.id)) char.quests.set(r.quest_id, { state: r.state, progress: JSON.parse(r.progress_json) });
  }

  save(char, questId) {
    const q = char.quests.get(questId);
    this.store.saveQuest(char.id, questId, q.state, q.progress);
  }

  // '@master' = mestre da classe do personagem; lista = qualquer um deles
  npcMatches(char, ref, npcId) {
    return refList(ref).some((r) => (r === '@master' ? npcId === `master_${char.classId}` : r === npcId));
  }

  // id do NPC para o cliente (o primeiro da lista)
  npcLabel(char, ref) {
    const r = refList(ref)[0] ?? null;
    return r === '@master' ? `master_${char.classId}` : r;
  }

  // nome para mostrar: o rótulo da missão (npcLabel/turnInLabel), senão os nomes ("Gusmão, ferreiro ou Tiela...")
  npcDisplay(char, ref, label) {
    if (label) return label;
    const ids = refList(ref).map((r) => (r === '@master' ? `master_${char.classId}` : r));
    return ids.map((id) => this.npcNames.get(id) ?? id).join(' ou ');
  }

  isDone(char, id) { return char.quests?.get(id)?.state === 'done'; }

  isDaily(q) { return q?.repeat === 'daily'; }

  today() { return questDay(this.now()); }

  // segundos até a virada do dia UTC (quando a diária volta)
  secondsToReset() {
    const now = this.now();
    return Math.max(1, Math.ceil((Math.floor(now / DAY_MS) * DAY_MS + DAY_MS - now) / 1000));
  }

  // diária entregue hoje (ainda não voltou)
  doneToday(char, id) {
    const st = char.quests.get(id);
    return st?.state === 'done' && st.progress?._day === this.today();
  }

  // Pode aceitar agora? (estado, diária, nível e pré-requisitos; o NPC é conferido em accept)
  canAccept(char, id) {
    const q = this.quests[id];
    const st = char.quests.get(id);
    if (st?.state === 'active') return false;
    if (st?.state === 'done' && !(this.isDaily(q) && !this.doneToday(char, id))) return false;
    if (char.level < q.level) return false;
    return q.prereq.every((pr) => this.isDone(char, pr));
  }

  available(char) {
    return Object.keys(this.quests).filter((id) => this.canAccept(char, id));
  }

  objectiveStatus(char, q, st, i) {
    const o = q.objectives[i];
    const pr = st.progress[i];
    switch (o.type) {
      case 'talk': return { done: !!pr, cur: pr ? 1 : 0, need: 1 };
      case 'kill': case 'questDrop': return { done: (pr || 0) >= o.count, cur: Math.min(pr || 0, o.count), need: o.count };
      case 'collect': {
        const n = this.bagCountOf(char, o.item);
        return { done: n >= o.count, cur: Math.min(n, o.count), need: o.count };
      }
      case 'interact': { const got = (pr || []).length; return { done: got >= o.objects.length, cur: got, need: o.objects.length }; }
      case 'level': return { done: char.level >= o.level, cur: Math.min(char.level, o.level), need: o.level };
      case 'allocated': return { done: char.unspent === 0, cur: char.unspent === 0 ? 1 : 0, need: 1 };
      // arma equipada de nível mínimo (só se equipa arma da própria classe: "uma arma de nível 5 da sua classe")
      case 'equipLevel': { const w = equippedIn(char, 'weapon'); const ok = !!w && this.data.items[w.defId].level >= o.minLevel; return { done: ok, cur: ok ? 1 : 0, need: 1 }; }
      case 'enterMap': return { done: !!pr, cur: pr ? 1 : 0, need: 1 };
      case 'trial': return { done: !!pr || !!char.trialDone, cur: pr || char.trialDone ? 1 : 0, need: 1 };
      // escolta e defesa só valem com o "true" gravado na chegada (progresso antigo de outro tipo não conta)
      case 'escort': case 'defend': return { done: pr === true, cur: pr === true ? 1 : 0, need: 1 };
      case 'choice': return { done: !!pr, cur: pr ? 1 : 0, need: 1 };
      // tutorial: pessoa solta, habilidade da tecla N usada, faixa do segundo toque, chegada ao posto
      case 'rescue': case 'skill': case 'bell': case 'arrive': return { done: pr === true, cur: pr === true ? 1 : 0, need: 1 };
      case 'pickup': return { done: (pr || 0) >= o.count, cur: Math.min(pr || 0, o.count), need: o.count };
      default: return { done: false, cur: 0, need: 1 };
    }
  }

  bagCountOf(char, defId) {
    let n = 0;
    for (const it of char.items.values()) if (it.loc === 'bag' && it.defId === defId) n += it.qty;
    return n;
  }

  // Dica na tela de um objetivo (tutorial): o texto geral e a dica da classe (à distância ou corpo a corpo).
  hintFor(char, o) {
    if (!o.hint) return {};
    const cls = this.data.classes?.[char.classId];
    const skill = this.data.skills?.[cls?.skills?.[(o.slot ?? 1) - 1] ?? cls?.skills?.[0]]?.name ?? 'a habilidade da tecla 1';
    const tip = this.rangedClass.get(char.classId) ? o.tipRanged : o.tipMelee;
    return { hint: o.hint.replaceAll('{skill}', skill), ...(tip ? { tip } : {}), ...(o.step ? { step: o.step } : {}) };
  }

  // O objetivo deste tipo (e que satisfaz pred) já foi cumprido numa missão ativa?
  objectiveDone(char, questId, type, pred = () => true) {
    const st = char.quests.get(questId);
    if (!st || st.state !== 'active') return false;
    const q = this.quests[questId];
    return q.objectives.some((o, i) => o.type === type && pred(o) && this.objectiveStatus(char, q, st, i).done);
  }

  // Falas que mudam conforme escolhas anteriores (dialogueByChoice: { chave: { opção: { offer?, progress?, complete? } } }).
  dialogueFor(char, q) {
    let d = q.dialogue;
    for (const [key, variants] of Object.entries(q.dialogueByChoice ?? {})) {
      const picked = char.choices?.[key];
      if (picked && variants[picked]) d = { ...d, ...variants[picked] };
    }
    return d;
  }

  // Título de uma recompensa: texto ou { default, byClass } (ex.: "Provado"/"Provada" conforme a classe).
  resolveTitle(char, t) {
    if (!t) return null;
    if (typeof t === 'string') return t;
    return t.byClass?.[char.classId] ?? t.default ?? null;
  }

  // Itens da recompensa para este personagem: os fixos + os do peso de armadura da classe (byArmor) e da
  // classe (byClass).
  rewardItems(char, q) {
    const rw = q.rewards ?? {};
    const cls = this.data.classes[char.classId];
    return [...(rw.items ?? []), ...(rw.byArmor?.[cls?.armorWeight] ?? []), ...(rw.byClass?.[char.classId] ?? [])];
  }

  // Recompensa como o cliente mostra: itens já resolvidos para a classe e o título por extenso.
  rewardsView(char, q) {
    const { byArmor, byClass, title, ...rest } = q.rewards ?? {};
    void byArmor; void byClass;
    return { ...rest, items: this.rewardItems(char, q), title: this.resolveTitle(char, title) };
  }

  // Mapa onde procurar o NPC: o "where" da missão; senão, entre os mapas em que ele fica, o da faixa da
  // missão (Joca está em quatro); cidades e NPCs de um mapa só aparecem como estão.
  npcMapFor(char, q, ref) {
    if (q.where) return refList(q.where);
    const ids = refList(ref).map((r) => (r === '@master' ? `master_${char.classId}` : r));
    const maps = [...new Set(ids.flatMap((id) => this.npcMaps.get(id) ?? []))];
    if (maps.length <= 1) return maps;
    const field = maps.filter((m) => this.data.maps[m]?.levelRange && !this.data.maps[m].city);
    const lr = (m) => this.data.maps[m].levelRange;
    const strict = field.filter((m) => q.level >= lr(m)[0] && q.level < lr(m)[1]);
    const loose = field.filter((m) => q.level >= lr(m)[0] && q.level <= lr(m)[1]);
    return strict.length ? [strict[0]] : loose.length ? [loose[0]] : maps;
  }

  // Onde se caça: o mapa do primeiro monstro dos objetivos (abate ou coleta).
  huntMapFor(q) {
    for (const o of q.objectives) {
      const mon = o.monster ?? o.drop?.monster;
      if (mon && this.monsterMaps.has(mon)) return this.monsterMaps.get(mon)[0];
    }
    return null;
  }

  view(char, id, npcId = null) {
    const q = this.quests[id];
    const saved = char.quests.get(id);
    // diária entregue num dia anterior: aparece como disponível de novo, com o progresso zerado
    const stale = saved?.state === 'done' && this.isDaily(q) && !this.doneToday(char, id);
    const st = saved && !stale ? saved : { state: 'available', progress: {} };
    const objectives = q.objectives.map((o, i) => ({ text: o.text, ...this.objectiveStatus(char, q, st, i), ...this.hintFor(char, o) }));
    // conversando com um NPC da lista, ele é o "npc"/"turnIn" da missão (o cliente compara com o NPC aberto)
    const here = (ref) => (npcId && this.npcMatches(char, ref, npcId) ? npcId : this.npcLabel(char, ref));
    const daily = this.isDaily(q);
    return {
      id, title: q.title, chapter: q.chapter, state: st.state, level: q.level, side: isSideQuest(id, q), ...(q.startHint ? { startHint: q.startHint } : {}),
      npc: here(q.npc), turnIn: here(q.turnIn), objectives,
      npcName: this.npcDisplay(char, q.npc, q.npcLabel),
      turnInName: this.npcDisplay(char, q.turnIn, q.turnInLabel),
      ready: st.state === 'active' && objectives.every((o) => o.done), rewards: this.rewardsView(char, q), dialogue: this.dialogueFor(char, q),
      ...(daily ? { repeat: 'daily', ...(this.doneToday(char, id) ? { backInS: this.secondsToReset() } : {}) } : {}),
    };
  }

  // Alguma missão ativa avançaria com esta interação?
  wouldProgressInteract(char, objectId) {
    for (const [id, st] of char.quests) {
      if (st.state !== 'active') continue;
      const q = this.quests[id];
      if (q.objectives.some((o, i) => o.type === 'interact' && o.objects.includes(objectId) && !(st.progress[i] || []).includes(objectId))) return true;
    }
    return false;
  }

  hasPending(char, type, pred = () => true) {
    for (const [id, st] of char.quests) {
      if (st.state !== 'active') continue;
      const q = this.quests[id];
      if (q.objectives.some((o, i) => o.type === type && pred(o) && !st.progress[i])) return id;
    }
    return null;
  }

  // Escolha de diálogo pendente com este NPC: só depois dos objetivos anteriores da missão.
  pendingChoice(char, npcId) {
    for (const [id, st] of char.quests) {
      if (st.state !== 'active') continue;
      const q = this.quests[id];
      for (let i = 0; i < q.objectives.length; i++) {
        const o = q.objectives[i];
        if (o.type !== 'choice' || st.progress[i] || !this.npcMatches(char, o.npc, npcId)) continue;
        const before = q.objectives.slice(0, i).every((_, j) => this.objectiveStatus(char, q, st, j).done);
        if (!before) continue;
        return { quest: id, index: i, prompt: o.prompt, options: o.options.map((op) => ({ id: op.id, text: op.text })) };
      }
    }
    return null;
  }

  choose(char, questId, optionId, npcId) {
    const pc = this.pendingChoice(char, npcId);
    if (!pc || pc.quest !== questId) return { ok: false, code: 'no_choice', reason: 'Não há o que responder agora.' };
    const o = this.quests[questId].objectives[pc.index];
    const op = o.options.find((x) => x.id === optionId);
    if (!op) return { ok: false, code: 'bad_option', reason: 'Resposta inválida.' };
    const st = char.quests.get(questId);
    st.progress[pc.index] = op.id;
    char.choices = { ...(char.choices ?? {}), [o.key]: op.id };
    if (op.title) char.title = op.title;
    this.save(char, questId);
    this.store.saveCharacter(char);
    return { ok: true, option: op, quest: questId };
  }

  // Títulos que o personagem já ganhou: respostas escolhidas (4.4, 6.4) e missões entregues com título
  // (3.3, 5.4). Saem do estado das missões, então nada novo é gravado; o título mostrado é char.title.
  titles(char) {
    const out = [];
    const add = (t) => { if (t && !out.includes(t)) out.push(t); };
    for (const [id, q] of Object.entries(this.quests)) {
      if (this.isDone(char, id)) add(this.resolveTitle(char, q.rewards?.title));
      for (const o of q.objectives) {
        if (o.type !== 'choice') continue;
        const picked = char.choices?.[o.key];
        add(o.options.find((op) => op.id === picked)?.title);
      }
    }
    add(char.title);
    return out;
  }

  journal(char) {
    const active = [], done = [];
    for (const [id, st] of char.quests) {
      if (!this.quests[id]) continue;
      (st.state === 'done' ? done : active).push(this.view(char, id));
    }
    return {
      active,
      done: done.map((d) => ({ id: d.id, title: d.title, chapter: d.chapter, ...(d.repeat ? { repeat: d.repeat } : {}), ...(d.backInS ? { backInS: d.backInS } : {}) })),
      available: this.available(char).map((id) => this.view(char, id)),
    };
  }

  // Quadro de missões das cidades: tudo o que o personagem pode aceitar agora no mundo inteiro, com nível,
  // NPC e mapa, e as diárias que voltam amanhã.
  board(char) {
    const mapName = (m) => this.data.maps[m]?.name ?? m;
    const row = (id) => {
      const q = this.quests[id];
      const hunt = this.huntMapFor(q);
      return {
        id, title: q.title, chapter: q.chapter, level: q.level, side: isSideQuest(id, q), repeat: q.repeat ?? null,
        npcName: this.npcDisplay(char, q.npc, q.npcLabel), maps: this.npcMapFor(char, q, q.npc).map(mapName),
        area: hunt ? mapName(hunt) : null,
      };
    };
    const sort = (a, b) => (a.level - b.level) || (a.side - b.side) || a.title.localeCompare(b.title);
    const daily = Object.entries(this.quests).filter(([id, q]) => this.isDaily(q) && this.doneToday(char, id)).map(([id]) => ({ ...row(id), backInS: this.secondsToReset() }));
    return { available: this.available(char).map(row).sort(sort), dailyDone: daily.sort(sort), level: char.level };
  }

  // O que o NPC tem para o personagem: missões a oferecer e a entregar.
  npcQuests(char, npcId) {
    const offer = this.available(char).filter((id) => this.npcMatches(char, this.quests[id].npc, npcId)).map((id) => this.view(char, id, npcId));
    const active = [...char.quests].filter(([id, st]) => st.state === 'active' && this.quests[id] && (this.npcMatches(char, this.quests[id].turnIn, npcId) || this.npcMatches(char, this.quests[id].npc, npcId))).map(([id]) => this.view(char, id, npcId));
    return { offer, active };
  }

  accept(char, id, npcId) {
    const q = this.quests[id];
    if (!q) return { ok: false, code: 'bad_quest', reason: 'Missão inexistente.' };
    if (char.quests.get(id)?.state === 'active') return { ok: true, already: true, quest: this.view(char, id, npcId) };
    if (this.isDone(char, id)) {
      if (!this.isDaily(q)) return { ok: false, code: 'done', reason: 'Você já concluiu esta missão.' };
      if (this.doneToday(char, id)) return { ok: false, code: 'daily_done', reason: `Você já fez esta missão hoje. Ela volta à 00:00 UTC (${this.waitText()}).` };
    }
    if (!this.npcMatches(char, q.npc, npcId)) return { ok: false, code: 'wrong_npc', reason: 'Esta missão não é oferecida aqui.' };
    if (char.level < q.level) return { ok: false, code: 'level', reason: `Nível ${q.level} exigido. Seu nível atual é ${char.level}.` };
    const missing = q.prereq.filter((pr) => !this.isDone(char, pr));
    if (missing.length) return { ok: false, code: 'prereq', reason: `Conclua antes: ${missing.map((m) => this.quests[m].title).join(', ')}.` };
    const progress = {};
    // "entrar no mapa X" aceita já dentro de X conta na hora (Ilda também atende no Posto de Escuta da Cava)
    q.objectives.forEach((o, i) => { if (o.type === 'enterMap' && o.map === char.mapId) progress[i] = true; });
    char.quests.set(id, { state: 'active', progress });
    this.save(char, id);
    return { ok: true, quest: this.view(char, id, npcId) };
  }

  // "em 5 h 12 min" até a virada do dia UTC
  waitText() {
    const s = this.secondsToReset();
    const h = Math.floor(s / 3600), m = Math.ceil((s % 3600) / 60);
    return h > 0 ? `em ${h} h ${m} min` : `em ${m} min`;
  }

  // Eventos de progresso. Retornam os ids de missões alteradas.
  onTalk(char, npcId) {
    return this.bump(char, (o) => o.type === 'talk' && this.npcMatches(char, o.npc, npcId), (o, pr) => (pr ? null : true));
  }

  onKill(char, monsterId, rng) {
    return this.bump(char, (o) => (o.type === 'kill' || o.type === 'questDrop') && o.monster === monsterId, (o, pr) => {
      if ((pr || 0) >= o.count) return null;
      if (o.type === 'questDrop' && rng() >= o.chance) return null;
      return (pr || 0) + 1;
    });
  }

  onEnterMap(char, mapId) {
    return this.bump(char, (o) => o.type === 'enterMap' && o.map === mapId, (o, pr) => (pr ? null : true));
  }

  onInteract(char, objectId) {
    return this.bump(char, (o) => o.type === 'interact' && o.objects.includes(objectId), (o, pr) => ((pr || []).includes(objectId) ? null : [...(pr || []), objectId]));
  }

  // escolta que chegou ou defesa vencida (as duas chegam pela mesma entidade de escolta da zona)
  onEscort(char, escortId) {
    return this.bump(char, (o) => (o.type === 'escort' && o.escort === escortId) || (o.type === 'defend' && o.defense === escortId), (o, pr) => (pr === true ? null : true));
  }

  onTrial(char) {
    return this.bump(char, (o) => o.type === 'trial', (o, pr) => (pr ? null : true));
  }

  // Atingido por um perigo do mapa (a esteira da Oficina): abates seguidos "sem ser atingido" voltam a zero.
  onHazard(char, hazardId) {
    return this.bump(char, (o) => o.type === 'kill' && o.resetOnHazard === hazardId, (o, pr) => ((pr || 0) > 0 && (pr || 0) < o.count ? 0 : null));
  }

  // Alguém aqui quer o perigo ligado? (abates "sem ser atingido" ainda por fazer)
  wantsHazard(char, hazardId) {
    for (const [id, st] of char.quests) {
      if (st.state !== 'active') continue;
      const q = this.quests[id];
      if (q?.objectives.some((o, i) => o.type === 'kill' && o.resetOnHazard === hazardId && (st.progress[i] || 0) < o.count)) return true;
    }
    return false;
  }

  // Materiais de coleta que só caem com a missão ativa (objetivo collect com drop): o que este monstro pode
  // deixar para o personagem agora. Para de cair quando a bolsa já tem o bastante.
  questDrops(char, monsterId) {
    const out = [];
    for (const [id, st] of char.quests) {
      if (st.state !== 'active') continue;
      const q = this.quests[id];
      for (const o of q?.objectives ?? []) {
        if (o.type !== 'collect' || o.drop?.monster !== monsterId) continue;
        if (this.bagCountOf(char, o.item) >= o.count) continue;
        out.push({ defId: o.item, chance: o.drop.chance ?? 1, quest: id });
      }
    }
    return out;
  }

  // Alguma missão ativa ainda usa este item? (item de missão no chão depois da entrega não entra na bolsa)
  needsItem(char, defId) {
    for (const [id, st] of char.quests) {
      if (st.state === 'active' && this.quests[id]?.objectives.some((o) => o.type === 'collect' && o.item === defId)) return true;
    }
    return false;
  }

  // missões ativas com coleta deste item (o diário atualiza ao coletar)
  collectingQuests(char, defId) {
    return [...char.quests].filter(([id, st]) => st.state === 'active' && this.quests[id]?.objectives.some((o) => o.type === 'collect' && o.item === defId)).map(([id]) => id);
  }

  // ---------- tutorial (server/src/tutorial.js) ----------
  onRescue(char, who) {
    return this.bump(char, (o) => o.type === 'rescue' && o.who === who, (o, pr) => (pr ? null : true));
  }

  // habilidade da tecla "slot" da barra (as habilidades da classe na ordem de data/classes.json)
  onSkill(char, skillId) {
    const skills = this.data.classes?.[char.classId]?.skills ?? [];
    return this.bump(char, (o) => o.type === 'skill' && skills[(o.slot ?? 1) - 1] === skillId, (o, pr) => (pr ? null : true));
  }

  onPickup(char) {
    return this.bump(char, (o) => o.type === 'pickup', (o, pr) => ((pr || 0) >= o.count ? null : (pr || 0) + 1));
  }

  onBell(char) {
    return this.bump(char, (o) => o.type === 'bell', (o, pr) => (pr ? null : true));
  }

  onArrive(char) {
    return this.bump(char, (o) => o.type === 'arrive', (o, pr) => (pr ? null : true));
  }

  bump(char, match, next) {
    const changed = [];
    for (const [id, st] of char.quests) {
      if (st.state !== 'active') continue;
      const q = this.quests[id];
      if (!q) continue;
      let touched = false;
      q.objectives.forEach((o, i) => {
        if (!match(o)) return;
        const v = next(o, st.progress[i]);
        if (v === null || v === undefined) return;
        st.progress[i] = v; touched = true;
      });
      if (touched) { this.save(char, id); changed.push(id); }
    }
    return changed;
  }

  // Entrega. grantXp(amount) é fornecido pela zona (cuida da subida de nível).
  turnIn(char, id, npcId, grantXp) {
    const q = this.quests[id];
    if (!q) return { ok: false, code: 'bad_quest', reason: 'Missão inexistente.' };
    const st = char.quests.get(id);
    if (st?.state === 'done') return { ok: true, alreadyDone: true, quest: { id, title: q.title } };
    if (!st) return { ok: false, code: 'not_active', reason: 'Você não aceitou esta missão.' };
    if (!this.npcMatches(char, q.turnIn, npcId)) return { ok: false, code: 'wrong_npc', reason: 'Entregue esta missão a outra pessoa.' };
    const v = this.view(char, id);
    if (!v.ready) {
      const miss = v.objectives.filter((o) => !o.done).map((o) => `${o.text} (${o.cur}/${o.need})`);
      return { ok: false, code: 'incomplete', reason: `Ainda falta: ${miss.join('; ')}.` };
    }
    const rewardItems = this.rewardItems(char, q);
    const newStacks = rewardItems.filter(([defId]) => !this.data.items[defId].stack || ![...char.items.values()].some((it) => it.loc === 'bag' && it.defId === defId)).length;
    const consumesSlots = q.objectives.filter((o) => o.type === 'collect').length;
    if (bagCount(char) + newStacks > BAG_CAPACITY + consumesSlots) return { ok: false, code: 'bag_full', reason: 'Inventário cheio: libere espaço para a recompensa.' };
    const title = this.resolveTitle(char, q.rewards.title);
    const changedItems = [], deleted = [];
    let leveled = false;
    this.store.tx(() => {
      // consome os itens de "collect"; item de missão sai todo da bolsa (o que sobrou não serve para mais nada)
      for (const o of q.objectives.filter((x) => x.type === 'collect')) {
        const all = !!this.data.items[o.item]?.questItem;
        let need = all ? Infinity : o.count;
        for (const it of [...char.items.values()]) {
          if (need <= 0) break;
          if (it.loc !== 'bag' || it.defId !== o.item) continue;
          const take = Math.min(need, it.qty);
          it.qty -= take; need -= take;
          if (it.qty <= 0) { char.items.delete(it.id); this.store.deleteItem(char.id, it.id); deleted.push(it.id); } else changedItems.push(it);
        }
      }
      for (const [defId, qty] of rewardItems) {
        const def = this.data.items[defId];
        const stack = def.stack ? [...char.items.values()].find((it) => it.loc === 'bag' && it.defId === defId && it.qty + qty <= def.stack) : null;
        if (stack) { stack.qty += qty; changedItems.push(stack); }
        else {
          const it = { id: randomUUID(), defId, qty, enh: 0, loc: 'bag', slot: null };
          this.store.insertItem({ ...it, charId: char.id, source: `quest:${id}` });
          char.items.set(it.id, it);
        }
      }
      if (changedItems.length) this.store.saveItems(char.id, changedItems);
      char.gold += q.rewards.gold || 0;
      if (q.rewards.skillRank) {
        const first = this.data.classes[char.classId].skills[0];
        if ((char.skills[first] || 0) === 1) char.skills[first] = 2;
      }
      if (title) char.title = title;
      leveled = grantXp(q.rewards.xp || 0);
      st.state = 'done';
      // diária: o dia da entrega (UTC) decide quando ela volta
      st.progress = this.isDaily(q) ? { _day: this.today() } : st.progress;
      this.save(char, id);
      this.store.saveCharacter(char);
    });
    return {
      ok: true, alreadyDone: false, quest: { id, title: q.title }, rewards: this.rewardsView(char, q), leveled, title,
      dialogue: this.dialogueFor(char, q).complete, ...(this.isDaily(q) ? { repeat: 'daily', backInS: this.secondsToReset() } : {}),
    };
  }
}
