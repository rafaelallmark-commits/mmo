// Tutorial «Três do Outro Lado» (capítulo 0, Estrada Velha; D165). Cada personagem com a missão ativa tem
// os seus Bento, Ligia e Caio: entidades da zona (no mapa zone.escorts, como a carroça da escolta) que só
// o dono vê e que andam atrás dele depois de soltos. O bloco "rescue" do mapa (data/maps.json) diz onde
// cada um espera, o que o solta e o que diz; os passos guiados (dicas na tela) são os objetivos da missão
// (data/quests.json). O servidor confere as três pessoas dentro do círculo do posto para concluir.
import { randomUUID } from 'node:crypto';
import { monsterAttack } from './rules.js';
import { bagCount, BAG_CAPACITY } from './equipment.js';

export const TUTORIAL_QUEST = 'tutorial';
const DOWN_MS = 3000;        // Caio caído antes de voltar a esperar
const WAIT_LINE_MS = 15000;  // intervalo mínimo entre dois "espera!" da mesma pessoa
const GIVE_MS = 30000;       // Ligia passa no máximo um tônico a cada 30 s (só a quem está sem nenhum)
const LINE_GAP_MS = 2500;    // na chegada, cada um fala depois do outro
const MOVE = { accel: 10, decel: 14 };
// lugar de cada um atrás do dono: [para o lado, para trás] em metros
const SLOTS = [[-1.3, 2.2], [1.3, 2.6], [0, 3.8]];

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const r2 = (v) => Math.round(v * 100) / 100;

class Follower {
  constructor(zone, ownerCharId, who, pdef, followRadius, slot, onEvent) {
    this.zone = zone;
    this.eid = `e${++zone.escortSeq}`; // "e": a zona não deixa jogador mirar (entityById)
    this.ownerCharId = ownerCharId;
    this.ownerOnly = true;              // só o dono recebe nos snapshots
    this.who = who;
    this.pdef = pdef;
    this.followRadius = followRadius;
    this.slot = slot;
    this.onEvent = onEvent;
    this.mhp = pdef.hp;
    this.hp = pdef.hpStart ?? pdef.hp;
    this.stats = { defense: 4, evasion: 4, level: 1 };
    this.state = 'trapped';             // trapped | follow | wait | rest | down
    this.x = pdef.x; this.z = pdef.z;
    this.speed = 0; this.vx = 0; this.vz = 0;
    this.chase = null;
  }

  // nome e modelo que vão no snapshot (zone.snapRecords lê def.name e def.model)
  get def() { return { name: this.label(), model: this.pdef.look }; }

  label() {
    const n = this.pdef.name;
    if (this.state === 'trapped') return `${n} (${this.pdef.trapped})`;
    if (this.state === 'wait') return `${n} (esperando)`;
    if (this.state === 'down') return `${n} (caído)`;
    return n;
  }

  get freed() { return this.state === 'follow' || this.state === 'wait' || this.state === 'rest'; }

  stop() { this.speed = 0; this.vx = 0; this.vz = 0; }

  place(x, z) {
    const f = this.zone.nav.nearestFree(x, z, 4) ?? { x, z };
    this.x = f.x; this.z = f.z;
    this.chase = null;
    this.stop();
  }

  // Ponto atrás do dono (pela direção em que ele olha), um lugar para cada um.
  slotPoint(owner) {
    const f = owner.facing ?? { x: 1, z: 0 };
    const [side, back] = this.slot;
    const x = owner.char.x - f.x * back - f.z * side, z = owner.char.z - f.z * back + f.x * side;
    return this.zone.nav.isFree(x, z) ? { x, z } : (this.zone.nav.nearestFree(x, z, 2) ?? { x: owner.char.x, z: owner.char.z });
  }

  walk(goal, stopAt, speed, dt) {
    this.zone.chase(this, goal, stopAt, speed, dt, MOVE);
  }

  tick(dt) {
    const z = this.zone;
    if (this.state === 'down') {
      this.stop();
      if (z.now >= this.downUntil) { this.state = 'trapped'; this.hp = this.mhp; this.onEvent('up'); }
      return null;
    }
    if (this.state === 'trapped') { this.stop(); return null; }
    if (this.state === 'rest') {
      const [rx, rz] = this.pdef.rest;
      if (Math.hypot(rx - this.x, rz - this.z) > 0.5) this.walk({ x: rx, z: rz }, 0.3, 3.2, dt);
      else { this.stop(); this.chase = null; }
      return null;
    }
    // solto: segue o dono enquanto ele está a até followRadius m e de pé; senão espera onde está
    const o = z.players.get(this.ownerCharId);
    if (!o || o.char.dead || dist(o.char, this) > this.followRadius) {
      if (this.state === 'follow') { this.state = 'wait'; this.onEvent('wait'); }
      this.stop();
      return null;
    }
    this.state = 'follow';
    const goal = this.slotPoint(o);
    const d = Math.hypot(goal.x - this.x, goal.z - this.z);
    if (d < 0.6) { this.stop(); return null; }
    // longe do lugar, apressa o passo (alcança quem corre a 5 m/s); perto, acompanha andando
    this.walk(goal, 0.3, d > 5 ? 5.6 : 4.4, dt);
    return null;
  }

  // golpe de um dos bichos que cercam Caio (zone.tickMonster chama enquanto ninguém chamou a atenção dele)
  monsterTick(m, dt, speed, mopts) {
    const z = this.zone;
    if (dist(m, this) > m.def.attackRange) {
      z.chase(m, { x: this.x, z: this.z }, m.def.attackRange * 0.8, speed, dt, mopts);
      return;
    }
    m.speed = 0; m.vx = 0; m.vz = 0;
    if (z.now < m.nextAttackAt || this.state !== 'trapped') return;
    m.nextAttackAt = z.now + m.def.attackIntervalMs;
    const res = monsterAttack(m.def, this.stats, z.data, z.rng);
    z.send(this.ownerCharId, { t: 'hit', src: m.eid, dst: this.eid, dmg: res.damage, crit: !!res.crit, miss: !res.hit, skill: null, magic: false });
    if (res.hit) this.damage(res.damage);
  }

  damage(amount) {
    if (this.state !== 'trapped') return;
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp > 0) return;
    // caiu: os bichos somem e ele volta a esperar daqui a pouco, com a vida cheia
    this.state = 'down';
    this.downUntil = this.zone.now + DOWN_MS;
    for (const m of this.zone.monsters.values()) if (m.escortTarget === this.eid && m.state !== 'dead') { m.state = 'dead'; m.hp = 0; m.removeAt = this.zone.now; }
    this.onEvent('down');
  }

  view() {
    return { id: this.eid, k: 'e', def: this.pdef.look, n: this.label(), x: r2(this.x), z: r2(this.z), vx: r2(this.vx), vz: r2(this.vz), hp: Math.ceil(this.hp), mhp: this.mhp, st: this.state };
  }
}

export class TutorialManager {
  constructor(server) {
    this.s = server;
    this.byChar = new Map(); // charId -> { zone, followers: { who: Follower }, guards, met, bell, nextBellAt, lastLine }
  }

  get quests() { return this.s.quests; }

  active(char) { return char.quests?.get(TUTORIAL_QUEST)?.state === 'active'; }

  freed(char, who) { return this.quests.objectiveDone(char, TUTORIAL_QUEST, 'rescue', (o) => o.who === who); }

  // A cada passo da zona (Zone.hooks.onTick): cria os três de quem tem a missão ativa, confere o que solta
  // cada um, o segundo toque e a chegada; tira os de quem saiu do mapa. Depois da entrega eles ficam no
  // posto até o dono sair do mapa.
  tick(zone) {
    const def = zone.map.rescue;
    if (!def) return;
    for (const p of zone.players.values()) {
      let t = this.byChar.get(p.char.id);
      if (t && t.zone !== zone) { this.teardown(t); t = null; }
      // falas em fila (as três da chegada, uma depois da outra), também depois da entrega
      while (t?.lines?.length && zone.now >= t.lines[0].at) { const l = t.lines.shift(); this.say(t, l.f, l.text); }
      if (!this.active(p.char)) continue;
      if (!t) t = this.setup(zone, p, def);
      this.update(zone, p, t, def);
    }
    for (const t of [...this.byChar.values()]) {
      if (t.zone !== zone) continue;
      const p = zone.players.get(t.charId);
      const st = p?.char.quests?.get(TUTORIAL_QUEST)?.state;
      // entregue: ficam descansando no posto; concluída sem a chegada (comando de mestre), somem
      const resting = st === 'done' && Object.values(t.followers).every((f) => f.state === 'rest');
      if (!p || (st !== 'active' && !resting)) this.teardown(t);
    }
  }

  setup(zone, p, def) {
    const c = p.char;
    const t = { zone, charId: c.id, followers: {}, guards: [], met: new Set(), bell: null, nextBellAt: 0, lastLine: {} };
    const arrived = this.quests.objectiveDone(c, TUTORIAL_QUEST, 'arrive');
    let k = 0;
    for (const [who, pdef] of Object.entries(def.people)) {
      const f = new Follower(zone, c.id, who, pdef, def.followRadius ?? 14, SLOTS[k++ % SLOTS.length], (ev) => this.onFollowerEvent(t, f, ev));
      if (arrived) { f.state = 'rest'; f.hp = f.mhp; f.place(pdef.rest[0], pdef.rest[1]); }
      else if (this.freed(c, who)) {
        // já tinha sido solto (voltou ao jogo ou ao mapa): aparece atrás do dono
        f.state = 'follow'; f.hp = f.mhp;
        const pt = f.slotPoint(p);
        f.place(pt.x, pt.z);
      } else f.place(pdef.x, pdef.z);
      zone.escorts.set(f.eid, f);
      t.followers[who] = f;
    }
    this.byChar.set(c.id, t);
    return t;
  }

  teardown(t) {
    for (const f of Object.values(t.followers)) t.zone.escorts.delete(f.eid);
    for (const m of t.guards) if (m.state !== 'dead') { m.state = 'dead'; m.hp = 0; m.removeAt = t.zone.now; }
    this.byChar.delete(t.charId);
  }

  update(zone, p, t, def) {
    const c = p.char;
    if (!c.dead) {
      for (const [who, f] of Object.entries(t.followers)) {
        if (f.state !== 'trapped') continue;
        const pd = f.pdef, d = dist(c, f);
        if (pd.free === 'reach') {
          if (d <= pd.radius) this.free(t, p, who);
        } else if (pd.free === 'tonic') {
          // Ligia pede um tônico a quem chega; a quem está sem nenhum na bolsa, ela mesma passa um
          if (d <= pd.radius + 2) {
            if (!t.met.has(who)) { t.met.add(who); this.say(t, f, pd.lines?.meet); }
            if (zone.now >= (t.giveAt ?? 0) && !this.hasHpTonic(c) && this.giveTonic(p)) {
              t.giveAt = zone.now + GIVE_MS;
              this.say(t, f, pd.lines?.give);
            }
          }
        } else if (pd.free === 'guards') {
          if (d <= pd.radius && !t.guards.length) this.spawnGuards(zone, p, t, f);
        }
      }
    }
    this.tickBell(zone, p, t, def.bell);
    this.checkArrival(zone, p, t);
  }

  free(t, p, who) {
    const f = t.followers[who];
    if (!f || f.state !== 'trapped') return;
    f.state = 'follow';
    f.hp = f.mhp;
    this.say(t, f, f.pdef.lines?.free);
    this.s.notifyQuests(p, this.quests.onRescue(p.char, who));
  }

  say(t, f, text) {
    if (text) t.zone.send(t.charId, { t: 'say', eid: f.eid, name: f.pdef.name, text });
  }

  onFollowerEvent(t, f, ev) {
    if (ev === 'wait') {
      const at = t.zone.now;
      if (at - (t.lastLine[f.who] ?? -Infinity) < WAIT_LINE_MS) return;
      t.lastLine[f.who] = at;
      this.say(t, f, f.pdef.lines?.wait);
    } else if (ev === 'down') {
      t.guards = [];
      this.say(t, f, f.pdef.lines?.down);
      t.zone.send(t.charId, { t: 'system', text: `${f.pdef.name} caiu e os bichos fugiram. Volte até ele e chame a atenção deles antes que batam no menino.` });
    }
  }

  // ---------- Ligia: um tônico de vida bebido perto dela ----------
  hasHpTonic(c) {
    for (const it of c.items.values()) {
      const d = this.s.data.items[it.defId];
      if (it.loc === 'bag' && d?.kind === 'consumable' && d.use?.healHp && (d.level || 1) <= c.level) return true;
    }
    return false;
  }

  // dá um Tônico de Vida Pequeno (quem gastou todos antes de chegar a Ligia não fica preso no passo)
  giveTonic(p) {
    const c = p.char, defId = 'potion_hp_s', def = this.s.data.items[defId];
    const stack = [...c.items.values()].find((it) => it.loc === 'bag' && it.defId === defId && it.qty < (def.stack || 1) && !this.s.trades.isOffered(c.id, it.id));
    if (!stack && bagCount(c) >= BAG_CAPACITY) return false;
    this.s.store.tx(() => {
      if (stack) { stack.qty += 1; this.s.store.saveItems(c.id, [stack]); }
      else {
        const it = { id: randomUUID(), defId, qty: 1, enh: 0, loc: 'bag', slot: null };
        this.s.store.insertItem({ ...it, charId: c.id, source: `quest:${TUTORIAL_QUEST}` });
        c.items.set(it.id, it);
      }
    });
    p.zone.send(c.id, { t: 'char', char: p.zone.charView(p) });
    return true;
  }

  onUseItem(p, def) {
    if (!def?.use?.healHp) return;
    const t = this.byChar.get(p.char.id);
    if (!t || t.zone !== p.zone) return;
    for (const [who, f] of Object.entries(t.followers)) {
      if (f.pdef.free === 'tonic' && f.state === 'trapped' && dist(p.char, f) <= f.pdef.radius) this.free(t, p, who);
    }
  }

  // ---------- Caio: os bichos que o cercam ----------
  spawnGuards(zone, p, t, f) {
    // entre Caio e quem chega: o besouro na frente, "atrás de um besouro"
    const dx = p.char.x - f.x, dz = p.char.z - f.z, len = Math.hypot(dx, dz) || 1;
    const ux = dx / len, uz = dz / len;
    let k = 0;
    for (const [monster, count] of f.pdef.guards ?? []) {
      for (let i = 0; i < count; i++, k++) {
        const side = k === 0 ? 0 : (k % 2 ? 1.6 : -1.6);
        const m = zone.spawnMonster({ monster, x: f.x + ux * 2 - uz * side, z: f.z + uz * 2 + ux * side, radius: 0.3, count: 1 }, { noRespawn: true });
        m.temp = true;
        m.escortTarget = f.eid; // batem em Caio até alguém chamar a atenção
        m.state = 'chase';
        m.tutorialFor = t.charId;
        t.guards.push(m);
      }
    }
    this.say(t, f, f.pdef.lines?.meet);
  }

  onMonsterDeath(zone, m) {
    if (m.tutorialFor == null) return;
    m.tutorialKilled = true;
    const t = this.byChar.get(m.tutorialFor);
    if (!t || t.zone !== zone || !t.guards.includes(m) || !t.guards.every((g) => g.tutorialKilled)) return;
    t.guards = [];
    const p = zone.players.get(t.charId);
    const who = Object.keys(t.followers).find((w) => t.followers[w].pdef.free === 'guards' && t.followers[w].state === 'trapped');
    if (p && who) this.free(t, p, who);
  }

  // ---------- saque garantido enquanto falta coletar (o rato "derrubou um saque") ----------
  extraDrops(p, m, drops) {
    if (drops.length) return;
    for (const [id, st] of p.char.quests ?? []) {
      if (st.state !== 'active') continue;
      const q = this.quests.quests[id];
      const i = q.objectives.findIndex((o) => o.type === 'pickup' && o.guarantee);
      if (i < 0 || this.quests.objectiveStatus(p.char, q, st, i).done) continue;
      drops.push({ defId: q.objectives[i].guarantee, qty: 1, gold: 0 });
      return;
    }
  }

  // ---------- segundo toque: faixa sob o jogador, prévia das linhas do piso da Última Eclusa ----------
  tickBell(zone, p, t, b) {
    const c = p.char;
    if (!b || this.quests.objectiveDone(c, TUTORIAL_QUEST, 'bell')) { t.bell = null; return; }
    if (t.bell) {
      if (zone.now < t.bell.at) return;
      const s = t.bell;
      t.bell = null;
      if (c.dead) { t.nextBellAt = zone.now + b.retryMs; return; }
      const ox = c.x - s.ox, oz = c.z - s.oz;
      const along = ox * s.dx + oz * s.dz, across = Math.abs(-ox * s.dz + oz * s.dx);
      if (along >= -0.3 && along <= s.length + 0.3 && across <= s.width / 2 + 0.3) {
        // ficou na faixa: perde parte da vida (nunca cai) e o sino toca de novo
        const dmg = Math.max(1, Math.round(p.stats.maxHp * b.damagePct / 100));
        c.hp = Math.max(1, c.hp - dmg);
        p.lastHitAt = zone.now; p.lastCombatAt = zone.now;
        zone.send(c.id, { t: 'hit', src: 'bell', dst: p.eid, dmg, crit: false, miss: false, skill: 'bell', magic: true });
        zone.send(c.id, { t: 'system', text: 'O sulco se abriu embaixo de você! Quando o sino tocar de novo, saia da faixa para o lado.' });
        t.nextBellAt = zone.now + b.retryMs;
      } else {
        zone.send(c.id, { t: 'system', text: 'Fora da faixa a tempo. No calabouço da Última Eclusa o piso faz o mesmo: o sino avisa, a faixa acende e quem fica nela apanha.' });
        this.s.notifyQuests(p, this.quests.onBell(c));
      }
      return;
    }
    if (c.dead || zone.now < t.nextBellAt) return;
    if (!Object.values(t.followers).every((f) => f.freed)) return;
    const gp = zone.map.guardPost;
    if (dist(c, gp) > b.radius) return;
    // direção: para onde anda; parado, rumo ao posto
    let dx, dz;
    if ((c.speed || 0) > 0.5 && p.facing) { dx = p.facing.x; dz = p.facing.z; }
    else {
      const l = dist(c, gp);
      [dx, dz] = l > 1 ? [(gp.x - c.x) / l, (gp.z - c.z) / l] : [-1, 0];
    }
    const length = b.back + b.ahead;
    const s = { at: zone.now + b.warnMs, ox: c.x - dx * b.back, oz: c.z - dz * b.back, dx, dz, length, width: b.width };
    t.bell = s;
    zone.send(c.id, { t: 'warn', shape: 'line', kind: 'bell2', x: r2(s.ox), z: r2(s.oz), yaw: r2(Math.atan2(dx, dz)), length, width: b.width, ms: b.warnMs });
    zone.send(c.id, { t: 'system', text: 'Segundo toque do sino! Saia da faixa vermelha antes que o sulco se abra.' });
  }

  // ---------- chegada: o servidor confere as três pessoas dentro do círculo do posto ----------
  checkArrival(zone, p, t) {
    const c = p.char;
    if (this.quests.objectiveDone(c, TUTORIAL_QUEST, 'arrive')) return;
    const gp = zone.map.guardPost;
    const fs = Object.values(t.followers);
    if (!fs.length || !fs.every((f) => (f.state === 'follow' || f.state === 'wait') && dist(f, gp) <= gp.safeRadius)) return;
    for (const f of fs) f.state = 'rest';
    this.s.notifyQuests(p, this.quests.onArrive(c));
    t.lines = fs.filter((f) => f.pdef.lines?.home).map((f, i) => ({ at: zone.now + i * LINE_GAP_MS, f, text: f.pdef.lines.home }));
    const turnIn = this.quests.npcNames.get(this.quests.quests[TUTORIAL_QUEST].turnIn) ?? 'Mara';
    zone.send(c.id, { t: 'system', text: `${fs.map((f) => f.pdef.name).join(', ').replace(/, ([^,]*)$/, ' e $1')} chegaram ao ${gp.name}. Fale com ${turnIn} para entregar a missão.` });
  }
}
