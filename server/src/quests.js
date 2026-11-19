// Motor de missões. O estado vive em char.quests (Map questId -> { state, progress }) e é
// gravado em quest_progress a cada mudança. Toda conclusão roda numa transação e é idempotente.
import { randomUUID } from 'node:crypto';
import { bagCount, BAG_CAPACITY, equippedIn } from './equipment.js';

export class QuestEngine {
  constructor({ data, store }) {
    this.data = data;
    this.store = store;
    this.quests = data.quests ?? {};
  }

  load(char) {
    char.quests = new Map();
    for (const r of this.store.loadQuests(char.id)) char.quests.set(r.quest_id, { state: r.state, progress: JSON.parse(r.progress_json) });
  }

  save(char, questId) {
    const q = char.quests.get(questId);
    this.store.saveQuest(char.id, questId, q.state, q.progress);
  }

  // '@master' = mestre da classe do personagem
  npcMatches(char, ref, npcId) {
    if (ref === '@master') return npcId === `master_${char.classId}`;
    return ref === npcId;
  }

  npcLabel(char, ref) {
    if (ref !== '@master') return ref;
    return `master_${char.classId}`;
  }

  isDone(char, id) { return char.quests.get(id)?.state === 'done'; }

  available(char) {
    const out = [];
    for (const [id, q] of Object.entries(this.quests)) {
      if (char.quests.has(id)) continue;
      if (char.level < q.level) continue;
      if (!q.prereq.every((pr) => this.isDone(char, pr))) continue;
      out.push(id);
    }
    return out;
  }

  objectiveStatus(char, q, st, i) {
    const o = q.objectives[i];
    const pr = st.progress[i];
    switch (o.type) {
      case 'talk': return { done: !!pr, cur: pr ? 1 : 0, need: 1 };
      case 'kill': case 'questDrop': return { done: (pr || 0) >= o.count, cur: Math.min(pr || 0, o.count), need: o.count };
      case 'collect': {
        let n = 0;
        for (const it of char.items.values()) if (it.loc === 'bag' && it.defId === o.item) n += it.qty;
        return { done: n >= o.count, cur: Math.min(n, o.count), need: o.count };
      }
      case 'interact': { const got = (pr || []).length; return { done: got >= o.objects.length, cur: got, need: o.objects.length }; }
      case 'level': return { done: char.level >= o.level, cur: Math.min(char.level, o.level), need: o.level };
      case 'allocated': return { done: char.unspent === 0, cur: char.unspent === 0 ? 1 : 0, need: 1 };
      case 'equipLevel': { const w = equippedIn(char, 'weapon'); const ok = !!w && this.data.items[w.defId].level >= o.minLevel; return { done: ok, cur: ok ? 1 : 0, need: 1 }; }
      case 'enterMap': return { done: !!pr, cur: pr ? 1 : 0, need: 1 };
      case 'trial': return { done: !!pr || !!char.trialDone, cur: pr || char.trialDone ? 1 : 0, need: 1 };
      default: return { done: false, cur: 0, need: 1 };
    }
  }

  view(char, id) {
    const q = this.quests[id];
    const st = char.quests.get(id) ?? { state: 'available', progress: {} };
    const objectives = q.objectives.map((o, i) => ({ text: o.text, ...this.objectiveStatus(char, q, st, i) }));
    return {
      id, title: q.title, chapter: q.chapter, state: st.state, level: q.level,
      npc: this.npcLabel(char, q.npc), turnIn: this.npcLabel(char, q.turnIn), objectives,
      ready: st.state === 'active' && objectives.every((o) => o.done), rewards: q.rewards, dialogue: q.dialogue,
    };
  }

  journal(char) {
    const active = [], done = [];
    for (const [id, st] of char.quests) (st.state === 'done' ? done : active).push(this.view(char, id));
    return { active, done: done.map((d) => ({ id: d.id, title: d.title, chapter: d.chapter })), available: this.available(char).map((id) => this.view(char, id)) };
  }

  // O que o NPC tem para o personagem: missões a oferecer e a entregar.
  npcQuests(char, npcId) {
    const offer = this.available(char).filter((id) => this.npcMatches(char, this.quests[id].npc, npcId)).map((id) => this.view(char, id));
    const active = [...char.quests].filter(([id, st]) => st.state === 'active' && (this.npcMatches(char, this.quests[id].turnIn, npcId) || this.npcMatches(char, this.quests[id].npc, npcId))).map(([id]) => this.view(char, id));
    return { offer, active };
  }

  accept(char, id, npcId) {
    const q = this.quests[id];
    if (!q) return { ok: false, code: 'bad_quest', reason: 'Missão inexistente.' };
    if (char.quests.get(id)?.state === 'active') return { ok: true, already: true, quest: this.view(char, id) };
    if (this.isDone(char, id)) return { ok: false, code: 'done', reason: 'Você já concluiu esta missão.' };
    if (!this.npcMatches(char, q.npc, npcId)) return { ok: false, code: 'wrong_npc', reason: 'Esta missão não é oferecida aqui.' };
    if (char.level < q.level) return { ok: false, code: 'level', reason: `Nível ${q.level} exigido. Seu nível atual é ${char.level}.` };
    const missing = q.prereq.filter((pr) => !this.isDone(char, pr));
    if (missing.length) return { ok: false, code: 'prereq', reason: `Conclua antes: ${missing.map((m) => this.quests[m].title).join(', ')}.` };
    char.quests.set(id, { state: 'active', progress: {} });
    this.save(char, id);
    return { ok: true, quest: this.view(char, id) };
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

  onTrial(char) {
    return this.bump(char, (o) => o.type === 'trial', (o, pr) => (pr ? null : true));
  }

  bump(char, match, next) {
    const changed = [];
    for (const [id, st] of char.quests) {
      if (st.state !== 'active') continue;
      const q = this.quests[id];
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
    const rewardItems = q.rewards.items ?? [];
    const newStacks = rewardItems.filter(([defId]) => !this.data.items[defId].stack || ![...char.items.values()].some((it) => it.loc === 'bag' && it.defId === defId)).length;
    const consumesSlots = q.objectives.filter((o) => o.type === 'collect').length;
    if (bagCount(char) + newStacks > BAG_CAPACITY + consumesSlots) return { ok: false, code: 'bag_full', reason: 'Inventário cheio: libere espaço para a recompensa.' };
    const changedItems = [], deleted = [];
    let leveled = false;
    this.store.tx(() => {
      // consome os itens de "collect"
      for (const o of q.objectives.filter((x) => x.type === 'collect')) {
        let need = o.count;
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
      leveled = grantXp(q.rewards.xp || 0);
      st.state = 'done';
      this.save(char, id);
      this.store.saveCharacter(char);
    });
    return { ok: true, alreadyDone: false, quest: { id, title: q.title }, rewards: q.rewards, leveled, dialogue: q.dialogue.complete };
  }
}
