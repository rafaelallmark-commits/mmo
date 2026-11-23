// Simulação autoritativa de uma zona (um mapa ou uma instância). Roda num único laço:
// toda alteração de estado de personagem acontece aqui, em ordem, o que serializa operações
// simultâneas do mesmo personagem.
import { randomUUID } from 'node:crypto';
import { Escort } from './escort.js';
import { Defense } from './defense.js';
import { DuelManager } from './duel.js';
import {
  derivedStats, playerAttack, monsterAttack, splitKillXp, levelForXp, rankCap, totalAttributePoints, rollInt, mitigate,
} from './rules.js';
import { equippedList, equippedIn, bagCount, BAG_CAPACITY } from './equipment.js';
import { executeSkill, IMPLEMENTED_KINDS } from './skills.js';
import { makeRng } from './rng.js';
import { NavGrid, followPath, brake } from './nav.js';
import {
  mechanicTick, meleeMods, afterMeleeHit, recordBlow, tryEcho, afterMonsterDamaged, onMonsterDeath, tickHazards,
  cancelWindup, resetMechanic, summonOrphaned, territoryRadius, railGoal, idlePath, defenseFactor, debuffText,
} from './mechanics.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const r2 = (v) => Math.round(v * 100) / 100;
const LOOT_TTL_MS = 30 * 60 * 1000;
const NPC_RANGE = 6;
const OBJECT_RANGE = 3.5;

// Construções (casas) viram retângulos bloqueados; rotação de 90°/270° troca largura e fundo.
function structureRects(structs) {
  return structs.map((h) => {
    const sideways = h.rot === 90 || h.rot === 270;
    const hw = (sideways ? h.d : h.w) / 2, hd = (sideways ? h.w : h.d) / 2;
    return { name: h.type, x0: h.x - hw, z0: h.z - hd, x1: h.x + hw, z1: h.z + hd };
  });
}

// Grade de navegação de um mapa: áreas bloqueadas + construções + peças de cenário com colisão, em
// células de 0,5 m com o raio do personagem (a mesma para a zona e para tools/medir-caminhos.mjs).
export const NAV_OPTS = { cell: 0.5, radius: 0.4 };
export function navSpec(map) {
  return { size: map.size, blocked: [...(map.blocked ?? []), ...structureRects(map.structures ?? [])], props: map.props ?? [] };
}

// dia (UTC) para recompensas diárias
export const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);

export class Zone {
  // hooks: { send(charId,msg), broadcast(msg) [só esta zona], partyIdOf(charId), onKillCredit(p, monsterDefId), onLevelUp(p) }
  constructor({ mapId, data, store, rng = makeRng(1), xpRate = 1, send, broadcast, hooks = {}, instanceId = null, mapOverride = null }) {
    this.mapId = mapId;
    this.instanceId = instanceId;
    this.map = mapOverride ?? data.maps[mapId];
    this.data = data;
    this.f = data.formulas;
    this.store = store;
    this.rng = rng;
    this.xpRate = xpRate;
    this.send = send;
    this.broadcast = broadcast;
    this.hooks = hooks;
    this.now = 0;
    this.players = new Map(); // charId -> player
    this.monsters = new Map(); // eid -> monster
    this.groundEffects = [];
    this.hazards = []; // áreas avisadas dos monstros (mechanics.js)
    this.hazardSeq = 0;
    this.npcs = this.map.npcs ?? [];
    this.objects = this.map.objects ?? [];
    this.portals = this.map.portals ?? [];
    // navegação: áreas bloqueadas + construções + peças de cenário com colisão
    const navMap = navSpec(this.map);
    this.rects = navMap.blocked;
    this.nav = new NavGrid(navMap, NAV_OPTS);
    this.isFreeFn = (x, z) => this.nav.isFree(x, z);
    this.mv = { accel: this.f.movement.accel ?? 18, decel: this.f.movement.decel ?? 24 };
    this.monsterSeq = 0;
    this.escorts = new Map(); // eid -> Escort (ou Defense, que é uma escolta parada)
    this.escortSeq = 0;
    // perigos do mapa (a esteira da Oficina): estado de cada um; só ligam com alguém que precise deles. Lista
    // própria, separada de this.hazards (os golpes avisados dos monstros, mechanics.js), que tem outro formato.
    this.mapHazards = Object.entries(this.map.hazards ?? {}).map(([id, def]) => ({ id, def, state: 'idle', at: 0, pattern: 0, list: [] }));
    this.duels = new DuelManager(this);
    for (const sp of this.map.spawns ?? []) for (let i = 0; i < sp.count; i++) this.spawnMonster(sp);
  }

  get key() { return this.instanceId ?? this.mapId; }

  spawnMonster(sp, opts = {}) {
    const def = this.data.monsters[sp.monster];
    const m = { eid: `m${this.instanceId ? this.instanceId.slice(0, 4) : ''}${++this.monsterSeq}`, defId: sp.monster, def, spawn: sp, hp: def.hp, state: 'idle', threat: new Map(), score: new Map(), dots: [], fx: [], nextAttackAt: 0, wanderAt: 0, noRespawn: !!opts.noRespawn };
    this.placeMonster(m);
    this.monsters.set(m.eid, m);
    return m;
  }

  placeMonster(m) {
    const a = this.rng() * Math.PI * 2, d = Math.sqrt(this.rng()) * m.spawn.radius;
    m.x = m.spawn.x + Math.cos(a) * d; m.z = m.spawn.z + Math.sin(a) * d;
    const free = this.nav.nearestFree(m.x, m.z, 4) ?? this.nav.nearestFree(m.spawn.x, m.spawn.z, 8) ?? { x: m.spawn.x, z: m.spawn.z };
    m.x = free.x; m.z = free.z;
    m.home = { x: m.x, z: m.z };
    m.hp = m.def.hp; m.state = 'idle'; m.targetId = null; m.threat.clear(); m.score.clear(); m.dots = []; m.fx = []; m.dest = null;
    m.path = null; m.chase = null; m.speed = 0; m.vx = 0; m.vz = 0; m.slotOffset = (this.rng() - 0.5) * 1.8;
    m.mech = null; m.windup = null;
  }

  // ---------- jogadores ----------
  addPlayer(char) {
    const p = { eid: `p${char.id}`, char, zone: this, cooldowns: {}, buffs: [], debuffs: [], guards: [], shield: null, nextAttackPct: 0, targetId: null, dest: null, nextAttackAt: 0, lastCombatAt: -1e9, potionReadyAt: 0, facing: { x: 1, z: 0 } };
    if (char.dead) this.respawnAtPost(p, false); // caiu (ou desconectou) morto: restaura no posto
    if (!this.inBounds(char.x, char.z) || this.isBlocked(char.x, char.z)) { char.x = this.map.spawnPoint.x; char.z = this.map.spawnPoint.z; }
    if (!this.nav.isFree(char.x, char.z)) {
      const f = this.nav.nearestFree(char.x, char.z, 6) ?? this.nav.nearestFree(this.map.spawnPoint.x, this.map.spawnPoint.z, 10);
      if (f) { char.x = f.x; char.z = f.z; }
    }
    char.speed = 0; char.vx = 0; char.vz = 0;
    char.mapId = this.mapId;
    this.grantUnlockedSkills(char);
    this.players.set(char.id, p);
    this.recalc(p);
    char.hp = Math.min(char.hp, p.stats.maxHp); char.mp = Math.min(char.mp, p.stats.maxMp);
    return p;
  }

  removePlayer(charId, save = true) {
    const p = this.players.get(charId);
    if (!p) return null;
    this.duels.forfeit(charId);
    this.players.delete(charId);
    for (const m of this.monsters.values()) {
      m.threat.delete(charId);
      if (m.targetId === p.eid) m.targetId = null;
    }
    for (const o of this.players.values()) o.guards = o.guards.filter((g) => g.guardianId !== charId);
    if (save) this.store.saveCharacter(p.char);
    return p;
  }

  recalc(p) {
    const buffs = {};
    // reforços das habilidades e efeitos negativos dos monstros (mods negativos) somam do mesmo jeito
    for (const b of p.buffs) for (const [k, v] of Object.entries(b.mods)) buffs[k] = (buffs[k] || 0) + v;
    for (const d of p.debuffs ?? []) for (const [k, v] of Object.entries(d.mods ?? {})) buffs[k] = (buffs[k] || 0) + v;
    const eq = equippedList(p.char, this.data);
    const speedBefore = p.stats?.moveSpeedPct;
    p.stats = derivedStats(p.char, eq.map((e) => ({ def: e.def, enh: e.enh })), this.data, buffs);
    p.weaponDefId = eq.find((e) => e.def.slot === 'weapon')?.def.id ?? null;
    p.offhandDefId = eq.find((e) => e.def.slot === 'offhand')?.def.id ?? null;
    p.char.hp = Math.min(p.char.hp, p.stats.maxHp);
    p.char.mp = Math.min(p.char.mp, p.stats.maxMp);
    // a velocidade mudou (reforço, Desorientado, Atolado): o cliente acerta a previsão do próprio movimento
    if (speedBefore !== undefined && speedBefore !== p.stats.moveSpeedPct && this.players.get(p.char.id) === p) {
      this.send(p.char.id, { t: 'speed', moveSpeed: this.moveSpeedOf(p) });
    }
  }

  // Velocidade de caminhada do jogador (m/s) com reforços e efeitos negativos.
  moveSpeedOf(p) {
    return r2(this.f.movement.playerSpeed * (1 + (p.stats.moveSpeedPct || 0) / 100));
  }

  grantUnlockedSkills(char) {
    const cls = this.data.classes[char.classId];
    let changed = false;
    for (const sid of cls.skills) {
      const s = this.data.skills[sid];
      // ficha gravada antes de os dados passarem a habilidade para um nível acima do personagem (ex.:
      // Luz Compartilhada, do 5 para o 15): ela sai da ficha e os graus comprados voltam como pontos
      if (char.skills[sid] && s.unlockLevel > char.level) {
        char.skillPoints += Math.max(0, char.skills[sid] - this.data.skillRules.unlockGivesRank);
        delete char.skills[sid];
        changed = true;
        continue;
      }
      // a habilidade do nível 10 é liberada pela prova de classe, não pelo nível
      if (s.unlockLevel === 10 && !char.trialDone) continue;
      if (s.unlockLevel <= char.level && !char.skills[sid]) { char.skills[sid] = this.data.skillRules.unlockGivesRank; changed = true; }
    }
    return changed;
  }

  // XP vindo de abates ou missões. Retorna true se subiu de nível.
  grantXp(p, amount) {
    const c = p.char;
    c.xp += amount;
    const lvl = levelForXp(c.xp, this.data);
    if (lvl <= c.level) return false;
    const gained = lvl - c.level;
    const from = c.level;
    c.level = lvl;
    for (let L = from + 1; L <= lvl; L++) this.hooks.onLevelUp?.(p, L);
    c.unspent += gained * this.data.pointsPerLevel;
    c.skillPoints += gained * this.data.skillPointsPerLevel;
    this.grantUnlockedSkills(c);
    this.recalc(p);
    // quem sobe de nível caído (crédito do chefe) continua caído: a vida cheia não o levanta
    if (!c.dead) { c.hp = p.stats.maxHp; c.mp = p.stats.maxMp; }
    return true;
  }

  // Atordoamento em jogador (descarga do Custódio, Fio Condutor da Aranha, Descarga do Fragmento): imunidade
  // (Égide Firme etc.) anula, e a resistência a controle da Vitalidade (ccResistPct, até 50%) encurta — a regra
  // de controlMs, que vale para todo controle de monstro em jogador (o Selo também). A interface mostra
  // "Atordoado" ('debuff' com id 'stun'). Devolve a duração aplicada.
  stunPlayer(p, ms) {
    const dur = this.controlMs(p, ms);
    if (dur <= 0) return 0;
    p.stunUntil = Math.max(p.stunUntil || 0, this.now + dur);
    this.broadcast({ t: 'debuff', eid: p.eid, id: 'stun', name: 'Atordoado', ms: Math.round(p.stunUntil - this.now), text: debuffText({ stun: true }) });
    return dur;
  }

  // Duração de um controle de monstro em jogador (atordoamento, selo): imunidade a controle anula e a
  // resistência da Vitalidade (ccResistPct, até 50%) encurta.
  controlMs(p, ms) {
    if (p.char.dead || p.ccImmuneUntil > this.now) return 0;
    return Math.round(ms * (1 - Math.min(50, p.stats.ccResistPct || 0) / 100));
  }

  // Efeito negativo de monstro em jogador (Desorientado, Atolado, Selado, Sanguessuga): curto, aparece na
  // interface ('debuff') e a Alvorada tira (cleansePlayer). mods entram nas estatísticas como os reforços;
  // mpPctPerSec drena a mana; silence impede habilidades e, como controle, passa pela regra do atordoamento
  // (controlMs). O mesmo efeito de novo renova a duração.
  addDebuff(p, d, by = null) {
    if (p.char.dead) return null;
    const ms = d.silence ? this.controlMs(p, d.durationMs) : d.durationMs;
    if (ms <= 0) return null;
    const until = this.now + ms;
    let cur = p.debuffs.find((x) => x.id === d.id);
    if (cur) { cur.until = Math.max(cur.until, until); cur.by = by; }
    else {
      cur = { id: d.id, name: d.name, until, mods: d.mods ?? null, mpPctPerSec: d.mpPctPerSec || 0, silence: !!d.silence, by, drainMsgAt: this.now + 1000 };
      p.debuffs.push(cur);
      if (cur.mods) this.recalc(p);
    }
    this.broadcast({ t: 'debuff', eid: p.eid, id: d.id, name: d.name, ms: Math.round(cur.until - this.now), text: debuffText(d) });
    return cur;
  }

  // Tira um efeito negativo do jogador (Alvorada: "perdem um efeito negativo"): o atordoamento primeiro;
  // senão, o efeito com mais tempo pela frente.
  cleansePlayer(p) {
    if (p.stunUntil > this.now) { p.stunUntil = 0; this.broadcast({ t: 'cleanse', eid: p.eid, id: 'stun' }); return true; }
    const live = p.debuffs.filter((d) => d.until > this.now);
    if (!live.length) return false;
    const d = live.reduce((a, b) => (b.until > a.until ? b : a));
    p.debuffs = p.debuffs.filter((x) => x !== d);
    if (d.mods) this.recalc(p);
    this.broadcast({ t: 'cleanse', eid: p.eid, id: d.id });
    return true;
  }

  inBounds(x, z) {
    const [w, h] = this.map.size;
    return x >= 0 && z >= 0 && x <= w && z <= h;
  }

  isBlocked(x, z) {
    return this.rects.some((b) => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1);
  }

  inSafeZone(pos) {
    return dist(pos, this.map.guardPost) <= this.map.guardPost.safeRadius;
  }

  entityById(eid) {
    if (eid?.startsWith('p')) return this.players.get(Number(eid.slice(1))) ?? null;
    if (eid?.startsWith('e')) return null; // carroça de escolta não é alvo de jogador
    return this.monsters.get(eid) ?? null;
  }

  // ---------- escolta ----------
  startEscort(defId, owner) {
    const def = this.map.escorts?.[defId];
    if (!def) return { ok: false, code: 'bad_escort', reason: 'Nada para escoltar aqui.' };
    const partyId = this.hooks.partyIdOf?.(owner.char.id) ?? null;
    for (const e of this.escorts.values()) {
      if (e.defId === defId && (e.ownerCharId === owner.char.id || (partyId && e.partyId === partyId))) return { ok: true, escort: e, already: true };
    }
    const e = new Escort(this, defId, def, owner, partyId, ++this.escortSeq);
    this.escorts.set(e.eid, e);
    e.notify(`${def.name} partiu. Fiquem perto dela até o fim da rota.`, { started: true });
    return { ok: true, escort: e };
  }

  // Defesa parada (Joca na válvula principal): uma por jogador ou grupo, como a escolta.
  startDefense(defId, owner) {
    const def = this.map.defenses?.[defId];
    if (!def) return { ok: false, code: 'bad_defense', reason: 'Nada para defender aqui.' };
    const partyId = this.hooks.partyIdOf?.(owner.char.id) ?? null;
    for (const e of this.escorts.values()) {
      if (e.defId === defId && (e.ownerCharId === owner.char.id || (partyId && e.partyId === partyId))) return { ok: true, escort: e, already: true };
    }
    const e = new Defense(this, defId, def, owner, partyId, ++this.escortSeq);
    this.escorts.set(e.eid, e);
    return { ok: true, escort: e };
  }

  // ---------- perigos do mapa ----------
  // A esteira desgovernada da Oficina: só liga enquanto alguém na área precisa dela (missão "Esteira
  // Desgovernada") e só para essas pessoas ("Pina religa a esteira só para quem está com a missão"): elas
  // recebem o aviso das faixas que vão ser varridas (o mesmo aviso de linha do Custódio) e, depois dele, quem
  // delas estiver numa faixa é atingido (dano em % da vida; o gancho zera os abates seguidos da missão). Quem
  // caça as Lâminas sem a missão não vê, não ouve o sino do aviso nem leva a varrida.
  hazardLines(h, k) {
    const a = h.def.area;
    const pats = h.def.patterns ?? [];
    return (pats[k % pats.length] ?? []).map((l) => (l.axis === 'z'
      ? { axis: 'z', at: l.at, x: a.x0, z: l.at, yaw: Math.PI / 2, length: a.x1 - a.x0 }
      : { axis: 'x', at: l.at, x: l.at, z: a.z0, yaw: 0, length: a.z1 - a.z0 }));
  }

  inArea(a, c) { return c.x >= a.x0 && c.x <= a.x1 && c.z >= a.z0 && c.z <= a.z1; }

  tickMapHazards() {
    for (const h of this.mapHazards) {
      const d = h.def;
      const inside = [...this.players.values()].filter((p) => !p.char.dead && this.inArea(d.area, p.char));
      if (h.state === 'idle') {
        if (this.now < h.at) continue;
        const targets = inside.filter((p) => this.hooks.hazardWanted?.(p, h.id));
        if (!targets.length) { h.at = this.now + 1000; continue; }
        h.list = this.hazardLines(h, h.pattern++);
        h.state = 'warning';
        h.at = this.now + d.warnMs;
        // só quem recebeu o aviso pode ser varrido nesta passada (ninguém leva dano sem ter visto as faixas)
        h.warned = new Set(targets.map((p) => p.char.id));
        for (const p of targets) for (const l of h.list) this.send(p.char.id, { t: 'warn', shape: 'line', x: l.x, z: l.z, yaw: l.yaw, length: l.length, width: d.width, ms: d.warnMs, kind: 'line', hazard: h.id });
      } else if (this.now >= h.at) {
        for (const p of inside) {
          const c = p.char;
          if (!h.warned?.has(c.id)) continue;
          if (!h.list.some((l) => Math.abs((l.axis === 'z' ? c.z : c.x) - l.at) <= d.width / 2 + 0.3)) continue;
          const dmg = Math.max(1, Math.round(p.stats.maxHp * d.damagePctMaxHp / 100));
          this.broadcast({ t: 'hit', src: `hz:${h.id}`, dst: p.eid, dmg, crit: false, miss: false, skill: 'hazard', magic: false });
          this.applyRawDamage(p, dmg);
          this.hooks.onHazardHit?.(p, h.id);
        }
        h.state = 'idle';
        h.list = [];
        h.warned = null;
        h.at = this.now + Math.max(500, d.periodMs - d.warnMs);
      }
    }
  }

  // ---------- canalização (interação com tempo; mover, agir ou ser atingido interrompe) ----------
  startChannel(p, object, ms, text) {
    if (p.char.dead) return { ok: false, code: 'dead', reason: 'Você está caído.' };
    p.channel = { object, text, startAt: this.now, endAt: this.now + ms, sx: p.char.x, sz: p.char.z };
    p.targetId = null; p.dest = null; p.path = null; p.chase = null;
    return { ok: true, channel: { object, ms, text } };
  }

  cancelChannel(p, reason) {
    if (!p.channel) return;
    const ch = p.channel;
    p.channel = null;
    this.send(p.char.id, { t: 'channel_end', ok: false, object: ch.object, reason });
  }

  tickChannel(p) {
    const ch = p.channel;
    if (p.char.dead) return this.cancelChannel(p, 'Você caiu.');
    if (Math.hypot(p.char.x - ch.sx, p.char.z - ch.sz) > 0.35) return this.cancelChannel(p, 'Interrompido: você se moveu.');
    if ((p.lastHitAt ?? -1) > ch.startAt) return this.cancelChannel(p, 'Interrompido: você foi atingido.');
    if (this.now >= ch.endAt) {
      p.channel = null;
      this.send(p.char.id, { t: 'channel_end', ok: true, object: ch.object });
      if (ch.object.startsWith('revive:')) return this.finishRevive(p, ch.object.slice(7));
      this.hooks.onChannelDone?.(p, ch.object);
    }
  }

  // ---------- levantar um aliado caído (qualquer jogador, fora de combate, canalizando) ----------
  cmdReviveAlly(p, t) {
    const f = this.f.death;
    if (p.char.dead) return { ok: false, code: 'dead', reason: 'Você está caído.' };
    if (!t || t === p || this.players.get(t.char.id) !== t) return { ok: false, code: 'bad_target', reason: 'Escolha um aliado caído neste mapa.' };
    if (!t.char.dead) return { ok: false, code: 'not_dead', reason: `${t.char.name} não está caído.` };
    if (dist(p.char, t.char) > f.allyReviveRange) return { ok: false, code: 'too_far', reason: `Chegue mais perto (${f.allyReviveRange} m) para levantar ${t.char.name}.` };
    if (this.now - (p.lastCombatAt ?? -Infinity) <= this.f.regen.outOfCombatAfterMs) return { ok: false, code: 'in_combat', reason: 'Em combate: espere 5 s sem lutar para levantar alguém.' };
    if (this.duels.duelOf(p.char.id)) return { ok: false, code: 'duel', reason: 'Não durante um duelo.' };
    return this.startChannel(p, `revive:${t.eid}`, f.allyReviveMs, `Levantando ${t.char.name}…`);
  }

  finishRevive(p, eid) {
    const t = this.entityById(eid);
    const f = this.f.death;
    if (!t || !t.char?.dead || dist(p.char, t.char) > f.allyReviveRange + 1) {
      this.send(p.char.id, { t: 'system', text: 'Não deu para levantar: o aliado já voltou ou ficou longe.' });
      return;
    }
    this.revivePlayer(t, f.allyReviveHpPct, p);
    this.store.saveCharacter(t.char);
    this.send(t.char.id, { t: 'system', text: `${p.char.name} levantou você.` });
    this.send(p.char.id, { t: 'system', text: `Você levantou ${t.char.name}.` });
  }

  npcNear(p, npcId) {
    const n = this.npcs.find((x) => x.id === npcId);
    if (!n) return null;
    return dist(p.char, n) <= NPC_RANGE ? n : null;
  }

  objectNear(p, objectId) {
    const o = this.objects.find((x) => x.id === objectId);
    if (!o) return null;
    return dist(p.char, o) <= OBJECT_RANGE ? o : null;
  }

  // ---------- comandos (validados) ----------
  cmdMove(p, x, z) {
    if (p.char.dead) return { ok: false, code: 'dead', reason: 'Você está caído. Volte ao posto de guarda.' };
    if (typeof x !== 'number' || typeof z !== 'number' || !Number.isFinite(x) || !Number.isFinite(z)) return { ok: false, code: 'bad_request', reason: 'Destino inválido.' };
    if (!this.inBounds(x, z)) return { ok: false, code: 'out_of_bounds', reason: 'Destino fora do mapa.' };
    if (this.isBlocked(x, z)) return { ok: false, code: 'blocked', reason: 'Não dá para chegar ali.' };
    const c = p.char;
    const path = this.nav.findPath(c.x, c.z, x, z);
    if (!path || !path.length) return { ok: false, code: 'blocked', reason: 'Não dá para chegar ali.' };
    if (p.channel) this.cancelChannel(p, 'Interrompido: você se moveu.');
    if (p.casting) this.cancelCast(p, 'Conjuração interrompida: você se moveu.');
    p.path = path; p.dest = path[path.length - 1]; p.targetId = null; p.chase = null;
    // o cliente usa o caminho para prever o movimento sem esperar os snapshots
    return { ok: true, dest: { x: r2(p.dest.x), z: r2(p.dest.z) }, path: path.map((q) => [r2(q.x), r2(q.z)]) };
  }

  cmdAttack(p, targetId) {
    if (p.char.dead) return { ok: false, code: 'dead', reason: 'Você está caído.' };
    if (p.casting) this.cancelCast(p, 'Conjuração interrompida: você atacou.');
    if (typeof targetId === 'string' && targetId.startsWith('p')) {
      // jogador só é alvo no duelo
      const op = this.entityById(targetId);
      if (!op || !this.duels.active(p, op)) return { ok: false, code: 'bad_target', reason: 'Só dá para atacar jogadores num duelo.' };
      if (p.channel) this.cancelChannel(p, 'Interrompido: você atacou.');
      p.targetId = targetId; p.dest = null; p.path = null;
      return { ok: true };
    }
    const m = this.monsters.get(targetId);
    if (!m || m.state === 'dead') return { ok: false, code: 'bad_target', reason: 'Alvo inválido.' };
    if (p.channel) this.cancelChannel(p, 'Interrompido: você atacou.');
    p.targetId = targetId; p.dest = null; p.path = null;
    return { ok: true };
  }

  cmdStop(p) { p.targetId = null; p.dest = null; p.path = null; p.chase = null; return { ok: true }; }

  cmdPortal(p, portalId) {
    const pt = this.portals.find((x) => x.id === portalId);
    if (!pt) return { ok: false, code: 'bad_portal', reason: 'Passagem inexistente.' };
    if (p.char.dead) return { ok: false, code: 'dead', reason: 'Você está caído.' };
    if (dist(p.char, pt) > pt.radius + 1.5) return { ok: false, code: 'too_far', reason: `Chegue mais perto de ${pt.name}.` };
    if (p.char.level < (pt.minLevel || 1)) return { ok: false, code: 'level', reason: `Nível ${pt.minLevel} exigido para ${this.data.maps[pt.to]?.name ?? pt.to}. Seu nível atual é ${p.char.level}.` };
    return { ok: true, to: pt.to, x: pt.toX, z: pt.toZ };
  }

  // Habilidade pedida pelo cliente: recarga global (globalCooldownMs, salvo habilidades com offGcd) e
  // tempo de conjuração (castMs): parado, o alvo é conferido no começo e de novo no fim; mover-se,
  // atacar, usar item ou outra habilidade interrompe. Sem castMs, sai na hora.
  cmdCast(p, skillId, targetId, x, z, allyId) {
    const s = this.data.skills[skillId];
    const gcd = this.f.skills?.globalCooldownMs ?? 1000;
    if (p.casting) {
      // trocar de ideia no meio da conjuração: a anterior não saiu (nada gasto) e a nova pode sair já
      this.cancelCast(p, 'Conjuração interrompida: você usou outra habilidade.', 'switched');
      p.gcdUntil = Math.min(p.gcdUntil || 0, this.now);
    }
    if (s && !s.offGcd && this.now < (p.gcdUntil || 0)) return { ok: false, code: 'gcd', reason: `Recarga global: ${((p.gcdUntil - this.now) / 1000).toFixed(1)} s.` };
    if (s && s.castMs > 0) {
      const chk = this.castNow(p, skillId, targetId, x, z, allyId, true);
      if (!chk.ok) return chk;
      p.casting = { skillId, targetId, x, z, allyId, startAt: this.now, endAt: this.now + s.castMs, sx: p.char.x, sz: p.char.z };
      p.dest = null; p.path = null; p.char.chase = null;
      if (!s.offGcd) p.gcdUntil = this.now + Math.max(gcd, s.castMs);
      this.broadcast({ t: 'cast_start', eid: p.eid, skill: skillId, ms: s.castMs });
      return { ok: true, casting: { skill: skillId, ms: s.castMs, name: s.name }, gcdMs: s.offGcd ? 0 : Math.max(gcd, s.castMs) };
    }
    const r = this.castNow(p, skillId, targetId, x, z, allyId);
    if (r.ok && s && !s.offGcd) { p.gcdUntil = this.now + gcd; r.gcdMs = gcd; }
    return r;
  }

  cancelCast(p, reason, code = 'interrupted') {
    if (!p.casting) return;
    const cs = p.casting;
    p.casting = null;
    p.gcdUntil = Math.min(p.gcdUntil || 0, this.now + 300); // interrompida: libera logo outra ação
    this.send(p.char.id, { t: 'cast_end', ok: false, skill: cs.skillId, reason, code });
    this.broadcast({ t: 'cast_cancel', eid: p.eid, skill: cs.skillId });
  }

  tickCast(p) {
    const cs = p.casting;
    if (p.char.dead) return this.cancelCast(p, 'Você caiu.');
    if (Math.hypot(p.char.x - cs.sx, p.char.z - cs.sz) > 0.35) return this.cancelCast(p, 'Conjuração interrompida: você se moveu.');
    if (this.now < cs.endAt) return;
    p.casting = null;
    const r = this.castNow(p, cs.skillId, cs.targetId, cs.x, cs.z, cs.allyId);
    this.send(p.char.id, { t: 'cast_end', ok: !!r.ok, skill: cs.skillId, reason: r.ok ? undefined : r.reason, mp: r.mp, cooldownMs: r.cooldownMs });
  }

  castNow(p, skillId, targetId, x, z, allyId, dry = false) {
    const s = this.data.skills[skillId];
    const c = p.char;
    if (c.dead) return { ok: false, code: 'dead', reason: 'Você está caído.' };
    if (p.channel) this.cancelChannel(p, 'Interrompido: você usou uma habilidade.');
    if (!s || s.classId !== c.classId) return { ok: false, code: 'bad_skill', reason: 'Habilidade desconhecida para sua classe.' };
    const rank = c.skills[skillId] || 0;
    if (rank < 1) {
      if (s.unlockLevel === 10 && c.level >= 10) return { ok: false, code: 'not_learned', reason: `${s.name} é liberada pela prova de classe.` };
      return { ok: false, code: 'not_learned', reason: `Nível ${s.unlockLevel} exigido para ${s.name}. Seu nível atual é ${c.level}.` };
    }
    if (!IMPLEMENTED_KINDS.has(s.effect.kind)) return { ok: false, code: 'not_implemented', reason: 'Habilidade ainda não implementada neste marco.' };
    // Selo do Selador da Porta Funda: sem habilidades enquanto durar
    const sealed = p.debuffs.find((d) => d.silence && d.until > this.now);
    if (sealed) return { ok: false, code: 'silenced', reason: `${sealed.name}: sem habilidades por ${((sealed.until - this.now) / 1000).toFixed(1)} s.` };
    const ready = p.cooldowns[skillId] || 0;
    if (this.now < ready) return { ok: false, code: 'cooldown', reason: `${s.name} em recarga (${((ready - this.now) / 1000).toFixed(1)} s).` };
    const cost = s.mp + (s.mpPerRank || 0) * (rank - 1);
    if (c.mp < cost) return { ok: false, code: 'no_mana', reason: `Mana insuficiente: ${cost} necessária, você tem ${Math.floor(c.mp)}.` };
    const range = s.range === 'weapon' ? p.stats.range : s.range;
    const tol = this.f.movement.rangeTolerance;
    let target = null, ally = null;
    const needsEnemy = s.target === 'enemy' || ['charge'].includes(s.effect.kind);
    if (needsEnemy && typeof targetId === 'string' && targetId.startsWith('p')) {
      // duelo: habilidade de alvo único no oponente (só o dano; efeitos de controle não valem em duelo)
      const op = this.entityById(targetId);
      if (!op || !this.duels.active(p, op) || op.char.dead) return { ok: false, code: 'bad_target', reason: 'Só dá para atacar jogadores num duelo.' };
      if (!['strike', 'spell'].includes(s.effect.kind)) return { ok: false, code: 'not_in_duel', reason: `${s.name} não vale em duelo (só golpes e magias de alvo único).` };
      const d = dist(c, op.char);
      if (d > range + tol) return { ok: false, code: 'out_of_range', reason: `Alvo fora de alcance (${d.toFixed(1)} m; alcance ${range} m).` };
      if (dry) return { ok: true, dry: true };
      this.duels.attack(p, op, { def: s, rank }, skillId);
      c.mp -= cost;
      p.cooldowns[skillId] = this.now + s.cooldownMs;
      p.targetId = op.eid;
      this.broadcast({ t: 'cast', eid: p.eid, skill: skillId, target: op.eid });
      return { ok: true, mp: Math.floor(c.mp), cooldownMs: s.cooldownMs, hits: 1 };
    }
    if (needsEnemy) {
      target = this.monsters.get(targetId);
      if (!target || target.state === 'dead') return { ok: false, code: 'bad_target', reason: 'Alvo inválido.' };
      const d = dist(c, target);
      if (d > range + tol) return { ok: false, code: 'out_of_range', reason: `Alvo fora de alcance (${d.toFixed(1)} m; alcance ${range} m).` };
    } else if (['cone', 'line'].includes(s.target)) {
      target = targetId ? this.monsters.get(targetId) ?? null : null;
      if (target?.state === 'dead') target = null;
    } else if (s.target === 'ground') {
      if (typeof x !== 'number' || typeof z !== 'number') return { ok: false, code: 'bad_request', reason: 'Escolha um ponto no chão.' };
      if (Math.hypot(x - c.x, z - c.z) > range + tol) return { ok: false, code: 'out_of_range', reason: `Ponto fora de alcance (alcance ${range} m).` };
    } else if (s.target === 'ally_dead') {
      ally = allyId ? this.entityById(allyId) : null;
      if (!ally || !ally.char || !ally.char.dead) return { ok: false, code: 'bad_target', reason: 'Escolha um aliado caído.' };
      if (dist(c, ally.char) > range + tol) return { ok: false, code: 'out_of_range', reason: `Aliado fora de alcance (alcance ${range} m).` };
    } else if (s.target === 'ally') {
      ally = allyId ? this.entityById(allyId) : p;
      if (!ally || !ally.char || ally.char.dead) return { ok: false, code: 'bad_target', reason: 'Aliado inválido.' };
      if (ally !== p && ally.char && this.duels.duelOf(ally.char.id)) return { ok: false, code: 'in_duel', reason: `${ally.char.name} está num duelo: ninguém de fora ajuda.` };
      if (ally !== p && dist(c, ally.char) > range + tol) return { ok: false, code: 'out_of_range', reason: `Aliado fora de alcance (alcance ${range} m).` };
    }
    if (dry) return { ok: true, dry: true };
    const res = executeSkill(this, p, s, rank, { target, x, z, ally });
    if (!res.ok) return res;
    c.mp -= cost;
    p.cooldowns[skillId] = this.now + s.cooldownMs;
    p.lastCombatAt = this.now;
    if (target && target.state !== 'dead' && needsEnemy) p.targetId = target.eid;
    this.broadcast({ t: 'cast', eid: p.eid, skill: skillId, target: target?.eid ?? ally?.eid ?? null, x: typeof x === 'number' ? r2(x) : undefined, z: typeof z === 'number' ? r2(z) : undefined });
    this.hooks.onCast?.(p, skillId);
    return { ok: true, mp: Math.floor(c.mp), cooldownMs: s.cooldownMs, hits: res.hits };
  }

  cmdUseItem(p, instanceId) {
    const c = p.char;
    if (p.channel) this.cancelChannel(p, 'Interrompido: você usou um item.');
    if (p.casting) this.cancelCast(p, 'Conjuração interrompida: você usou um item.');
    const it = c.items.get(instanceId);
    if (!it || it.loc !== 'bag') return { ok: false, code: 'not_in_bag', reason: 'Item não encontrado no seu inventário.' };
    const def = this.data.items[it.defId];
    if (def.kind !== 'consumable') return { ok: false, code: 'not_usable', reason: 'Este item não pode ser usado.' };
    if (c.dead) return { ok: false, code: 'dead', reason: 'Você está caído.' };
    if ((def.level || 1) > c.level) return { ok: false, code: 'level', reason: `Nível ${def.level} exigido para usar ${def.name}. Seu nível atual é ${c.level}.` };
    if (this.now < p.potionReadyAt) return { ok: false, code: 'cooldown', reason: `Tônicos em recarga (${((p.potionReadyAt - this.now) / 1000).toFixed(1)} s).` };
    p.potionReadyAt = this.now + this.f.potions.sharedCooldownMs;
    if (def.use.healHp) c.hp = Math.min(p.stats.maxHp, c.hp + def.use.healHp);
    if (def.use.healMp) c.mp = Math.min(p.stats.maxMp, c.mp + def.use.healMp);
    it.qty -= 1;
    c.potionsUsed = (c.potionsUsed || 0) + 1;
    this.store.tx(() => {
      if (it.qty <= 0) { c.items.delete(it.id); this.store.deleteItem(c.id, it.id); } else this.store.saveItems(c.id, [it]);
      this.store.saveCharacter(c);
    });
    this.hooks.onUseItem?.(p, def);
    return { ok: true, hp: Math.floor(c.hp), mp: Math.floor(c.mp), remaining: Math.max(0, it.qty) };
  }

  respawnAtPost(p, announce = true) {
    const c = p.char;
    const gp = this.map.guardPost;
    const st = p.stats ?? derivedStats(c, equippedList(c, this.data).map((e) => ({ def: e.def, enh: e.enh })), this.data);
    c.dead = false; c.x = gp.x + (this.rng() - 0.5) * 4; c.z = gp.z + (this.rng() - 0.5) * 4;
    c.hp = Math.max(1, Math.round(st.maxHp * this.f.death.respawnHpPct / 100));
    c.mp = Math.max(c.mp, Math.round(st.maxMp * this.f.death.respawnMpPct / 100));
    p.targetId = null; p.dest = null;
    this.store.saveCharacter(c);
    if (announce) this.broadcast({ t: 'respawn', eid: p.eid, x: r2(c.x), z: r2(c.z) });
  }

  cmdRespawn(p) {
    if (!p.char.dead) return { ok: false, code: 'not_dead', reason: 'Você não está caído.' };
    this.respawnAtPost(p);
    return { ok: true };
  }

  cmdLearnSkill(p, skillId) {
    const c = p.char;
    const s = this.data.skills[skillId];
    if (!s || s.classId !== c.classId) return { ok: false, code: 'bad_skill', reason: 'Habilidade desconhecida para sua classe.' };
    if (c.level < s.unlockLevel) return { ok: false, code: 'level', reason: `Nível ${s.unlockLevel} exigido. Seu nível atual é ${c.level}.` };
    const rank = c.skills[skillId] || 0;
    if (rank === 0) return { ok: false, code: 'locked', reason: s.unlockLevel === 10 ? 'Vença a prova de classe para liberar esta habilidade.' : 'Habilidade ainda não liberada.' };
    const cap = rankCap(c.level, this.data);
    if (rank >= cap) return { ok: false, code: 'rank_cap', reason: `Grau máximo para o nível ${c.level} é ${cap}.` };
    if (c.skillPoints < 1) return { ok: false, code: 'no_points', reason: 'Sem pontos de habilidade.' };
    c.skillPoints -= 1; c.skills[skillId] = rank + 1;
    this.store.saveCharacter(c);
    return { ok: true, rank: rank + 1 };
  }

  // ---------- serviços para skills.js ----------
  monstersInCircle(x, z, r) {
    const out = [];
    for (const m of this.monsters.values()) if (m.state !== 'dead' && Math.hypot(m.x - x, m.z - z) <= r) out.push(m);
    return out;
  }

  alliesNear(p, r) {
    const out = [p];
    const pid = this.hooks.partyIdOf?.(p.char.id);
    if (pid == null) return out;
    for (const o of this.players.values()) {
      // quem está num duelo não recebe cura nem reforço do grupo (só o próprio duelista se ajuda)
      if (o !== p && !o.char.dead && this.hooks.partyIdOf(o.char.id) === pid && dist(o.char, p.char) <= r && !this.duels.duelOf(o.char.id)) out.push(o);
    }
    return out;
  }

  teleportSafe(p, x, z) {
    const [w, h] = this.map.size;
    x = Math.max(0, Math.min(w, x)); z = Math.max(0, Math.min(h, z));
    if (!this.isBlocked(x, z) && this.nav.isFree(x, z)) { p.char.x = x; p.char.z = z; p.dest = null; p.path = null; p.char.speed = 0; }
  }

  pullMonster(m, p, keep) {
    const dx = m.x - p.char.x, dz = m.z - p.char.z;
    const d = Math.hypot(dx, dz) || 1;
    const nx = p.char.x + (dx / d) * keep, nz = p.char.z + (dz / d) * keep;
    if (!this.isBlocked(nx, nz) && this.nav.isFree(nx, nz)) { m.x = nx; m.z = nz; m.path = null; m.chase = null; }
  }

  pushMonster(m, from, meters) {
    const dx = m.x - from.x, dz = m.z - from.z;
    const d = Math.hypot(dx, dz) || 1;
    const nx = m.x + (dx / d) * meters, nz = m.z + (dz / d) * meters;
    if (this.inBounds(nx, nz) && !this.isBlocked(nx, nz) && this.nav.isFree(nx, nz)) { m.x = nx; m.z = nz; m.path = null; m.chase = null; }
  }

  addBuff(p, buff) {
    p.buffs = p.buffs.filter((b) => b.id !== buff.id);
    p.buffs.push(buff);
    this.recalc(p);
    this.broadcast({ t: 'buff', eid: p.eid, skill: buff.id, ms: Math.round(buff.until - this.now) });
  }

  addGuard(ally, guardian, pct, until, skillId) {
    ally.guards = ally.guards.filter((g) => g.guardianId !== guardian.char.id);
    ally.guards.push({ guardianId: guardian.char.id, pct, until, skillId });
  }

  addMonsterFx(m, fx) {
    m.fx = m.fx.filter((f) => f.kind !== fx.kind);
    m.fx.push(fx);
  }

  monsterFx(m, kind) {
    return m.fx.find((f) => f.kind === kind && f.until > this.now) ?? null;
  }

  addDot(m, ownerId, dps, durationMs) {
    m.dots.push({ ownerId, dps, until: this.now + durationMs, nextAt: this.now + 1000 });
  }

  // opts: { follow (acompanha o dono), delayMs (primeiro pulso atrasado), pulses }
  addGroundEffect(p, s, rank, x, z, opts = {}) {
    const eff = s.effect;
    const pulses = opts.pulses ?? eff.pulses ?? 1;
    const intervalMs = eff.intervalMs ?? 1000;
    const delay = opts.delayMs ?? 0;
    this.groundEffects.push({ ownerId: p.char.id, skillId: s.id, rank, x, z, radius: eff.radius, pulses, intervalMs, nextAt: this.now + delay, follow: !!opts.follow });
    const ms = delay + (pulses - (delay ? 1 : 0)) * intervalMs;
    this.broadcast({ t: 'ground', skill: s.id, x: r2(x), z: r2(z), radius: eff.radius, ms: Math.max(ms, delay || 300), by: p.eid, follow: opts.follow ? p.eid : undefined });
  }

  // Volta à vida (Canção da Aurora etc.) sem voltar ao posto.
  revivePlayer(ally, hpPct, by) {
    const c = ally.char;
    c.dead = false;
    c.hp = Math.max(1, Math.round(ally.stats.maxHp * hpPct / 100));
    ally.lastCombatAt = this.now;
    this.broadcast({ t: 'respawn', eid: ally.eid, x: r2(c.x), z: r2(c.z), revived: true });
  }

  // Dano mágico fixo (espinhos do escudo etc.), mitigado pela resistência mágica.
  magicFlat(p, m, flat, skillId = 'thorns') {
    if (!m || m.state === 'dead') return;
    const dmg = mitigate(flat, m.def.mres, p.char.level, this.data);
    this.broadcast({ t: 'hit', src: p.eid, dst: m.eid, dmg, crit: false, miss: false, skill: skillId, magic: true });
    this.damageMonster(m, p.char.id, dmg);
  }

  buffMod(p, key) {
    let v = 0;
    for (const b of p.buffs) if (b.until > this.now && b.mods[key]) v += b.mods[key];
    return v;
  }

  // participação: soma ao placar do monstro (usado para XP e saque)
  credit(m, charId, amount) {
    if (amount > 0 && m.state !== 'dead') m.score.set(charId, (m.score.get(charId) || 0) + amount);
  }

  creditControl(m, p, seconds) {
    this.credit(m, p.char.id, seconds * this.f.xp.participation.controlSeconds);
  }

  // cura/escudo: crédito nos monstros engajados com o aliado ajudado
  creditSupport(p, ally, amount) {
    const engaged = [...this.monsters.values()].filter((m) => m.state !== 'dead' && (m.targetId === ally.eid || m.threat.has(ally.char.id)));
    if (!engaged.length) return;
    for (const m of engaged) {
      this.credit(m, p.char.id, (amount * this.f.xp.participation.healing) / engaged.length);
      m.threat.set(p.char.id, (m.threat.get(p.char.id) || 0) + (amount * this.f.threat.healingPerHp) / engaged.length);
    }
  }

  healPlayer(p, ally, amount) {
    const before = ally.char.hp;
    ally.char.hp = Math.min(ally.stats.maxHp, ally.char.hp + amount);
    const healed = Math.round(ally.char.hp - before);
    p.char.healingDone = (p.char.healingDone || 0) + healed;
    this.creditSupport(p, ally, healed);
    this.broadcast({ t: 'heal', src: p.eid, dst: ally.eid, amount: healed });
    return healed;
  }

  sacredDamage(p, m, flat) {
    const dmg = mitigate(flat, m.def.mres, p.char.level, this.data);
    this.broadcast({ t: 'hit', src: p.eid, dst: m.eid, dmg, crit: false, miss: false, skill: 'sacred', magic: true });
    this.damageMonster(m, p.char.id, dmg);
  }

  // ---------- simulação ----------
  tick(dtMs) {
    this.now += dtMs;
    this.lastDt = dtMs;
    const dt = dtMs / 1000;
    for (const p of this.players.values()) this.tickPlayer(p, dt);
    this.duels.tick();
    for (const m of this.monsters.values()) this.tickMonster(m, dt);
    tickHazards(this);
    for (const [eid, e] of this.escorts) {
      const r = e.tick(dt);
      if (r === 'abandoned' || r === 'done') {
        for (const m of this.monsters.values()) if (m.escortTarget === eid && m.state !== 'dead') { m.state = 'dead'; m.hp = 0; m.removeAt = this.now; }
        this.escorts.delete(eid);
      }
    }
    if (this.mapHazards.length) this.tickMapHazards();
    this.tickGround();
    this.hooks.onTick?.(dt); // tutorial da Estrada Velha (server/src/tutorial.js)
  }

  // Persegue um ponto: direto se houver linha de visão; senão por caminho A* recalculado
  // a cada 0,4 s ou quando o alvo andar mais de 1,5 m.
  chase(e, goal, stopAt, speed, dt, opts) {
    if (this.nav.lineOfSight(e.x, e.z, goal.x, goal.z)) e.chase = { path: [{ x: goal.x, z: goal.z }], at: this.now, goal };
    else if (!e.chase || !e.chase.path.length || this.now >= e.chase.at + 400 || Math.hypot(e.chase.goal.x - goal.x, e.chase.goal.z - goal.z) > 1.5) {
      e.chase = { path: this.nav.findPath(e.x, e.z, goal.x, goal.z) ?? [{ x: goal.x, z: goal.z }], at: this.now, goal };
    }
    followPath(e, e.chase.path, dt, speed, { ...opts, stopAt, isFree: this.isFreeFn });
  }

  // Ponto em volta do alvo onde este monstro prefere ficar (espalha o grupo) + separação.
  attackSlot(m, tc, reach) {
    let dx = m.x - tc.x, dz = m.z - tc.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len; dz /= len;
    const ca = Math.cos(m.slotOffset), sa = Math.sin(m.slotOffset);
    let gx = tc.x + (dx * ca - dz * sa) * reach * 0.75;
    let gz = tc.z + (dx * sa + dz * ca) * reach * 0.75;
    for (const o of this.monsters.values()) {
      if (o === m || o.state === 'dead') continue;
      const ox = m.x - o.x, oz = m.z - o.z;
      const od = Math.hypot(ox, oz);
      if (od > 1e-3 && od < 1.3) { gx += (ox / od) * (1.3 - od) * 0.8; gz += (oz / od) * (1.3 - od) * 0.8; }
    }
    if (this.nav.isFree(gx, gz)) return { x: gx, z: gz };
    return this.nav.nearestFree(gx, gz, 2) ?? { x: tc.x, z: tc.z };
  }

  moveToward(e, tx, tz, speed, dt, stopAt = 0) {
    const dx = tx - e.x, dz = tz - e.z;
    const d = Math.hypot(dx, dz);
    if (d <= stopAt + 1e-6) return true;
    const step = Math.min(speed * dt, d - stopAt);
    const nx = e.x + (dx / d) * step, nz = e.z + (dz / d) * step;
    if (this.isBlocked(nx, nz)) return true; // obstáculo: para (sem pathfinding ainda)
    e.x = nx; e.z = nz;
    return d - step <= stopAt + 1e-6;
  }

  tickPlayer(p, dt) {
    const c = p.char;
    if (p.channel) this.tickChannel(p);
    if (p.casting) this.tickCast(p);
    if (c.dead) {
      // ninguém levantou em death.corpseTimeoutMs: volta sozinho ao posto (como o botão)
      if (p.deadAt != null && this.now - p.deadAt >= this.f.death.corpseTimeoutMs) { p.deadAt = null; this.respawnAtPost(p); }
      return;
    }
    if (p.buffs.length) {
      const before = p.buffs.length;
      p.buffs = p.buffs.filter((b) => b.until > this.now);
      if (p.buffs.length !== before) this.recalc(p);
    }
    if (p.guards.length) p.guards = p.guards.filter((g) => g.until > this.now);
    if (p.debuffs.length) this.tickDebuffs(p, dt);
    if (p.shield && p.shield.until <= this.now) p.shield = null;
    const speed = this.f.movement.playerSpeed * (1 + (p.stats.moveSpeedPct || 0) / 100);
    const ox = c.x, oz = c.z;
    if (p.stunUntil > this.now) { brake(c, dt, this.mv.decel * 2); if (p.casting) this.cancelCast(p, 'Conjuração interrompida: você foi atordoado.'); return; } // atordoado (descarga do chefe)
    if (p.casting) { brake(c, dt, this.mv.decel * 2); return; } // conjurando: parado, sem ataque básico
    const opts = { accel: this.mv.accel, decel: this.mv.decel };
    if (p.targetId && p.targetId.startsWith('p')) {
      // duelo: persegue e golpeia o oponente
      const op = this.entityById(p.targetId);
      if (!op || op.char.dead || !this.duels.active(p, op)) { p.targetId = null; c.chase = null; brake(c, dt, this.mv.decel); }
      else {
        const range = p.stats.range;
        const d = dist(c, op.char);
        if (d > range) this.chase(c, op.char, Math.max(0.5, range - 0.3), speed, dt, opts);
        else {
          brake(c, dt, this.mv.decel * 1.5);
          if (this.now >= p.nextAttackAt) { p.nextAttackAt = this.now + p.stats.attackIntervalMs; this.duels.attack(p, op); }
        }
        p.facing = { x: (op.char.x - c.x) / (d || 1), z: (op.char.z - c.z) / (d || 1) };
      }
    } else if (p.targetId) {
      const t = this.monsters.get(p.targetId);
      if (!t || t.state === 'dead') { p.targetId = null; c.chase = null; brake(c, dt, this.mv.decel); }
      else {
        const range = p.stats.range;
        const d = dist(c, t);
        if (d > range) this.chase(c, t, Math.max(0.5, range - 0.3), speed, dt, opts);
        else {
          brake(c, dt, this.mv.decel * 1.5);
          if (this.now >= p.nextAttackAt) {
            p.nextAttackAt = this.now + p.stats.attackIntervalMs;
            p.lastCombatAt = this.now;
            this.hitMonster(p, t, null, null);
            const pierce = this.buffMod(p, 'basicPierce');
            if (pierce > 0) {
              // a estocada atravessa: atinge até N monstros logo atrás do alvo
              const dx = (t.x - c.x) / (d || 1), dz = (t.z - c.z) / (d || 1);
              const behind = this.monstersInCircle(t.x, t.z, 3.5).filter((o) => o !== t && ((o.x - t.x) * dx + (o.z - t.z) * dz) > 0).slice(0, pierce);
              for (const o of behind) this.hitMonster(p, o, null, null);
            }
          }
        }
        p.facing = { x: (t.x - c.x) / (d || 1), z: (t.z - c.z) / (d || 1) };
      }
    } else if (p.path && p.path.length) {
      if (followPath(c, p.path, dt, speed, { ...opts, isFree: this.isFreeFn })) { p.path = null; p.dest = null; }
    } else {
      brake(c, dt, this.mv.decel);
    }
    if (c.x !== ox || c.z !== oz) {
      const md = Math.hypot(c.x - ox, c.z - oz);
      p.facing = { x: (c.x - ox) / md, z: (c.z - oz) / md };
    }
    const r = this.f.regen;
    const factor = this.now - p.lastCombatAt > r.outOfCombatAfterMs ? 1 : r.inCombatFactor;
    c.hp = Math.min(p.stats.maxHp, c.hp + ((p.stats.maxHp * r.hpPctPerSec / 100) * factor + (p.stats.maxHp * (p.stats.regenPctMaxHpPerSec || 0) / 100)) * dt);
    c.mp = Math.min(p.stats.maxMp, c.mp + ((p.stats.maxMp * r.mpPctPerSec / 100) + p.stats.attrs.spi * r.mpPerSpiPerSec) * dt * factor);
  }

  // Efeitos negativos do jogador: vencem sozinhos; a sanguessuga drena a mana (mpPctPerSec) e avisa a
  // cada segundo quanto tirou ('mech' drain, para o cliente desenhar e mostrar o número).
  tickDebuffs(p, dt) {
    const before = p.debuffs.length;
    p.debuffs = p.debuffs.filter((d) => d.until > this.now);
    if (p.debuffs.length !== before) this.recalc(p);
    for (const d of p.debuffs) {
      if (!d.mpPctPerSec) continue;
      const take = Math.min(p.char.mp, (p.stats.maxMp * d.mpPctPerSec / 100) * dt);
      p.char.mp -= take;
      d.drained = (d.drained || 0) + take;
      if (this.now >= d.drainMsgAt) {
        d.drainMsgAt = this.now + 1000;
        if (d.drained >= 0.5) this.broadcast({ t: 'mech', kind: 'drain', eid: d.by, dst: p.eid, amount: Math.round(d.drained) });
        d.drained = 0;
      }
    }
  }

  monsterCombatStats(m) {
    const dd = this.monsterFx(m, 'defenseDown');
    const mark = this.monsterFx(m, 'mark');
    // pressão baixa da Bomba-Mestra: defesa e resistência mágica caem
    const low = defenseFactor(this, m);
    return {
      level: m.def.level,
      defense: Math.round(m.def.defense * (1 - (dd?.pct || 0) / 100) * low),
      mres: Math.round(m.def.mres * low),
      evasion: Math.max(0, m.def.evasion - (mark?.evasionDown || 0)),
    };
  }

  // Ataque de jogador (básico se skill = null). Aplica dano, ameaça e participação.
  hitMonster(p, m, skill, skillId) {
    if (m.state === 'dead') return { hit: false, damage: 0 };
    let stats = p.stats;
    if (p.nextAttackPct && (!skill || skill.def.effect.damageType !== 'magic')) {
      stats = { ...stats, physDamagePct: (stats.physDamagePct || 0) + p.nextAttackPct };
      p.nextAttackPct = 0;
    }
    const res = playerAttack(stats, this.monsterCombatStats(m), this.data, this.rng, skill ?? undefined);
    if (res.hit && !res.magic) {
      const mark = this.monsterFx(m, 'mark');
      if (mark) res.damage = Math.round(res.damage * (1 + mark.physDamageTakenPct / 100));
    }
    this.broadcast({ t: 'hit', src: p.eid, dst: m.eid, dmg: res.damage, crit: !!res.crit, miss: !res.hit, skill: skillId, magic: !!res.magic });
    if (!res.hit) { this.addThreat(m, p, 1); return res; }
    recordBlow(this, m, p, res); // o Ecoante guarda o último golpe que levou
    this.damageMonster(m, p.char.id, res.damage);
    return res;
  }

  addThreat(m, p, amount) {
    m.threat.set(p.char.id, (m.threat.get(p.char.id) || 0) + amount);
    if (m.state === 'idle' || m.state === 'return') m.state = 'chase';
    if (!m.targetId) m.targetId = p.eid;
  }

  damageMonster(m, charId, dmg) {
    if (m.state === 'dead') return;
    if (m.damageFilter) dmg = m.damageFilter(dmg, charId);
    const p = this.players.get(charId);
    const real = Math.min(dmg, m.hp);
    m.hp -= real;
    this.credit(m, charId, real * this.f.xp.participation.damage);
    if (p) {
      this.addThreat(m, p, dmg * (this.f.threat.classMult[p.char.classId] || 1));
      if (m.def.aggro === 'aggressive') {
        for (const o of this.monsters.values()) {
          if (o !== m && o.defId === m.defId && o.state === 'idle' && dist(o, m) <= 8) { o.state = 'chase'; o.targetId = p.eid; o.threat.set(charId, this.f.threat.proximityAggro); }
        }
      }
    }
    if (m.hp <= 0) this.killMonster(m);
    else afterMonsterDamaged(this, m); // limiares de vida (Supervisor de Turno chama reforços)
  }

  killMonster(m) {
    m.state = 'dead'; m.hp = 0; m.targetId = null;
    if (m.temp) m.removeAt = this.now + 3000;
    m.respawnAt = m.def.respawnSec > 0 && !m.noRespawn ? this.now + m.def.respawnSec * 1000 : Infinity;
    this.broadcast({ t: 'death', eid: m.eid });
    onMonsterDeath(this, m); // o golpe que preparava não sai; explosão avisada (Sapo-Bomba, Escória)
    this.hooks.onMonsterDeath?.(m);
    const radius = this.f.xp.shareRadius;
    // chefe: quem caiu na reta final também leva XP, saque e o crédito da missão (a participação já está
    // registrada); nos demais monstros, só quem está de pé
    const near = (p) => p && (!p.char.dead || m.def.rank === 'boss') && dist(p.char, m) <= radius;
    // participantes diretos + membros de grupo próximos (mesmo sem participação)
    const contrib = new Map();
    for (const [charId, score] of m.score) {
      const p = this.players.get(charId);
      if (!near(p)) continue;
      contrib.set(charId, { charId, level: p.char.level, score, partyId: this.hooks.partyIdOf?.(charId) ?? null });
    }
    for (const c of [...contrib.values()]) {
      if (c.partyId == null) continue;
      for (const o of this.players.values()) {
        if (!contrib.has(o.char.id) && near(o) && this.hooks.partyIdOf(o.char.id) === c.partyId) contrib.set(o.char.id, { charId: o.char.id, level: o.char.level, score: 0, partyId: c.partyId });
      }
    }
    const split = splitKillXp(m.def, [...contrib.values()], this.data, this.xpRate);
    const killId = randomUUID();
    const nowWall = Date.now();
    const notifications = [];
    this.store.tx(() => {
      for (const s of split) {
        const p = this.players.get(s.charId);
        const c = p.char;
        const lvlBefore = c.level;
        // elite diária (pontos de caça do M3, monstros com daily): o primeiro abate do dia dá XP em dobro e
        // uma rolagem extra de saque
        let daily = false;
        if (m.def.daily && s.lootEligible && this.store.claimDaily(c.id, `elite:${m.defId}`, dayKey(nowWall))) daily = true;
        this.grantXp(p, daily ? s.xp * 2 : s.xp);
        this.store.saveCharacter(c);
        // reforços invocados (Supervisor, Mãe do Eco) não deixam saque nem material de missão
        const drops = s.lootEligible && !m.noLoot ? [...this.rollLoot(m, c), ...(daily ? this.rollLoot(m, c) : [])] : [];
        // materiais de coleta que só caem com a missão ativa: para todo participante creditado (como os
        // abates das missões), um por abate
        if (!m.noLoot) for (const q of this.hooks.questDrops?.(c, m.defId) ?? []) if (this.rng() < q.chance) drops.push({ defId: q.defId, qty: 1, gold: 0 });
        if (s.lootEligible && !m.noLoot) this.hooks.extraDrops?.(p, m, drops); // ex.: o saque garantido do tutorial
        if (daily) this.send(c.id, { t: 'system', text: `Elite diária: ${m.def.name} — XP em dobro e saque extra hoje.` });
        for (const d of drops) {
          const lp = this.nav.nearestFree(m.x + (this.rng() - 0.5) * 2, m.z + (this.rng() - 0.5) * 2, 3) ?? { x: m.x, z: m.z };
          const row = { id: randomUUID(), charId: c.id, defId: d.defId, qty: d.qty, gold: d.gold, mapId: this.mapId, x: r2(lp.x), z: r2(lp.z), monsterDef: m.defId, killId, createdAt: nowWall, expiresAt: nowWall + LOOT_TTL_MS };
          this.store.insertLoot(row);
          d.row = row;
        }
        notifications.push({ p, s, lvlBefore, drops });
      }
    });
    for (const { p, s, lvlBefore, drops } of notifications) {
      const c = p.char;
      this.send(c.id, { t: 'xp', gained: s.xp, share: Math.round(s.share * 100) / 100, xp: c.xp, level: c.level, monster: m.defId });
      if (c.level > lvlBefore) {
        this.broadcast({ t: 'level_up', eid: p.eid, level: c.level });
        this.send(c.id, { t: 'char', char: this.charView(p) });
      }
      for (const d of drops) this.send(c.id, { t: 'loot', loot: lootView(d.row) });
      this.hooks.onKillCredit?.(p, m.defId);
    }
  }

  rollLoot(m, char) {
    const table = this.data.lootTables[m.def.lootTable];
    if (!table) return [];
    const out = [];
    // chefe: a arma e a joia únicas saem uma única vez por personagem
    const uniqueOk = m.def.rank !== 'boss' || this.store.claimDaily(char.id, `unique:${m.defId}`, 'sempre');
    for (const e of table.entries) {
      if (!uniqueOk && (e.type === 'classDrop' || e.type === 'pool')) continue;
      if (this.rng() >= e.chance) continue;
      if (e.type === 'gold') out.push({ defId: null, qty: 0, gold: rollInt(this.rng, e.min, e.max) });
      else if (e.type === 'item') out.push({ defId: e.defId, qty: rollInt(this.rng, e.min, e.max), gold: 0 });
      else if (e.type === 'pool') out.push({ defId: e.pool[Math.floor(this.rng() * e.pool.length)], qty: 1, gold: 0 });
      else if (e.type === 'classDrop' && e.byClass[char.classId]) out.push({ defId: this.classDropPick(e.byClass[char.classId], char), qty: 1, gold: 0 });
      // uma peça sorteada da lista da classe (ex.: armadura ou mão secundária única do Custódio)
      else if (e.type === 'classPool' && e.byClass[char.classId]?.length) {
        const defId = this.classPoolPick(m, e.byClass[char.classId], char);
        if (defId) out.push({ defId, qty: 1, gold: 0 });
      }
    }
    return out;
  }

  // classPool: uma peça sorteada da lista da classe. No chefe, cada peça sai uma única vez por personagem,
  // como a arma e a joia (D60): sorteia a ordem e fica com a primeira que ele ainda não ganhou (a chave
  // permanente em daily_claims só é gravada para a peça entregue). Com o conjunto completo, nada: o Custódio
  // não vira fonte sem fim de peças únicas para vender, trocar ou passar pelo depósito (D160).
  classPoolPick(m, list, char) {
    if (m.def.rank !== 'boss') return list[Math.floor(this.rng() * list.length)];
    const order = [...list];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    return order.find((id) => this.store.claimDaily(char.id, `unique:${m.defId}:${id}`, 'sempre')) ?? null;
  }

  // classDrop com várias armas para a classe: a da família que o personagem tem equipada (o Quebraferro de
  // duas mãos leva o Grande Machado; o de uma mão, o Machado do Meridiano Partido); sem nenhuma da lista,
  // sorteia.
  classDropPick(choice, char) {
    if (!Array.isArray(choice)) return choice;
    const w = equippedIn(char, 'weapon');
    const fam = w ? this.data.items[w.defId]?.family : null;
    return choice.find((id) => this.data.items[id]?.family === fam) ?? choice[Math.floor(this.rng() * choice.length)];
  }

  tickMonster(m, dt) {
    if (m.state === 'dead') {
      if (m.removeAt != null && this.now >= m.removeAt) { this.monsters.delete(m.eid); return; }
      if (this.now >= m.respawnAt) { this.placeMonster(m); this.broadcast({ t: 'spawn', eid: m.eid }); }
      return;
    }
    if (m.dots.length) {
      for (const d of m.dots) {
        while (d.nextAt <= this.now && d.nextAt <= d.until && m.state !== 'dead') {
          d.nextAt += 1000;
          const real = Math.max(1, Math.round(d.dps));
          this.broadcast({ t: 'hit', src: `p${d.ownerId}`, dst: m.eid, dmg: real, crit: false, miss: false, skill: 'dot', magic: false });
          this.damageMonster(m, d.ownerId, real);
        }
      }
      m.dots = m.dots.filter((d) => d.nextAt <= d.until);
      if (m.state === 'dead') return;
    }
    // reforço invocado cujo invocador caiu ou desistiu: some junto (sem XP nem saque)
    if (m.summonerEid && summonOrphaned(this, m)) {
      if (m.windup) cancelWindup(this, m);
      m.state = 'dead'; m.hp = 0; m.targetId = null; m.threat.clear(); m.removeAt = this.now;
      this.broadcast({ t: 'mech', kind: 'vanish', eid: m.eid });
      return;
    }
    if (m.fx.length) m.fx = m.fx.filter((f) => f.until > this.now);
    // atordoado: não anda nem bate, e o golpe avisado que preparava não sai
    if (this.monsterFx(m, 'stun')) { if (m.windup) cancelWindup(this, m); brake(m, dt, 30); return; }
    // preparando um golpe avisado: parado até a área resolver (tickHazards)
    if (m.windup) { brake(m, dt, 30); return; }
    const rooted = !!this.monsterFx(m, 'root');
    const slow = this.monsterFx(m, 'slow');
    const speed = rooted ? 0 : m.def.moveSpeed * (slow ? 1 - slow.pct / 100 : 1);
    const mopts = { accel: 14, decel: 20 };
    if (m.state === 'return') {
      if (m.mech) resetMechanic(this, m); // desistiu da luta: a próxima começa do zero
      // (a Lâmina de Esteira volta pelos trilhos)
      if (!m.path) m.path = idlePath(this, m, m.home.x, m.home.z) ?? [{ x: m.home.x, z: m.home.z }];
      if (followPath(m, m.path, dt, m.def.moveSpeed * 1.5, { ...mopts, isFree: this.isFreeFn })) { m.state = 'idle'; m.hp = m.def.hp; m.score.clear(); m.path = null; }
      return;
    }
    // emboscada da escolta: mira a carroça até alguém do grupo chamar a atenção (ameaça)
    if (m.escortTarget && !m.threat.size) {
      const esc = this.escorts.get(m.escortTarget);
      if (esc && esc.state !== 'broken' && esc.state !== 'arrived') { esc.monsterTick(m, dt, speed, mopts); return; }
      m.state = 'dead'; m.hp = 0; m.removeAt = this.now + 500; // carroça sumiu: a emboscada se desfaz
      return;
    }
    let target = m.targetId ? this.entityById(m.targetId) : null;
    if (target && (target.char.dead || !this.players.has(target.char.id))) {
      m.threat.delete(target.char.id); target = null; m.targetId = null;
    }
    // troca de alvo: quem gerar 10% mais ameaça que o alvo atual
    if (m.threat.size) {
      let best = null, bestT = -1;
      for (const [cid, t] of m.threat) {
        const p = this.players.get(cid);
        if (p && !p.char.dead && t > bestT) { best = p; bestT = t; }
      }
      if (!best) m.threat.clear();
      else if (!target || (best !== target && bestT > (m.threat.get(target.char.id) || 0) * this.f.threat.switchMargin)) { target = best; m.targetId = best.eid; }
    }
    if (!target && m.state === 'chase') { m.state = 'return'; m.path = null; m.chase = null; return; }
    // agressivo: ataca quem chega ao raio de agressão; passivo com território (ninho, margem): ao raio dele
    const aggroR = m.def.aggroRadius > 0 ? m.def.aggroRadius : territoryRadius(m);
    if (!target && aggroR > 0) {
      for (const p of this.players.values()) {
        if (!p.char.dead && !this.inSafeZone(p.char) && dist(p.char, m) <= aggroR) { target = p; m.targetId = p.eid; m.state = 'chase'; m.threat.set(p.char.id, this.f.threat.proximityAggro); break; }
      }
    }
    if (!target) {
      if (this.now >= m.wanderAt) {
        m.wanderAt = this.now + 4000 + this.rng() * 6000;
        // patrulha (Fragmento do Custódio): passeia mais longe de casa que os demais
        const roam = m.def.mechanic?.patrolRadius ?? Math.min(4, m.spawn.radius);
        const a = this.rng() * Math.PI * 2, d = 1 + this.rng() * roam;
        const tx = m.home.x + Math.cos(a) * d, tz = m.home.z + Math.sin(a) * d;
        // (a Lâmina de Esteira passeia pelos trilhos: um eixo de cada vez)
        m.path = this.nav.isFree(tx, tz) ? idlePath(this, m, tx, tz) : null;
      }
      // passeio calmo: acelera e para devagar
      if (m.path && m.path.length) { if (followPath(m, m.path, dt, speed * 0.4, { accel: 4, decel: 6, isFree: this.isFreeFn })) m.path = null; }
      else brake(m, dt, 8);
      return;
    }
    if (m.def.leashRadius > 0 && dist(m, m.home) > m.def.leashRadius) {
      m.state = 'return'; m.targetId = null; m.threat.clear(); m.path = null; m.chase = null; return;
    }
    const tc = target.char;
    const d = dist(m, tc);
    m.path = null;
    // mecânica do monstro (data/monsters.json "mechanic"): golpe avisado pronto, pressão alternada
    if (mechanicTick(this, m, target, d)) { brake(m, dt, 30); return; }
    if (d > m.def.attackRange) {
      // trilho (Lâmina de Esteira): persegue andando nos eixos do mapa
      this.chase(m, railGoal(this, m, this.attackSlot(m, tc, m.def.attackRange)), 0, speed, dt, mopts);
      return;
    }
    brake(m, dt, mopts.decel * 1.5);
    // em alcance: se encostou em outro monstro, abre espaço devagar
    for (const o of this.monsters.values()) {
      if (o === m || o.state === 'dead') continue;
      const ox = m.x - o.x, oz = m.z - o.z;
      const od = Math.hypot(ox, oz);
      if (od > 1e-3 && od < 0.9) {
        const nx = m.x + (ox / od) * 0.6 * dt, nz = m.z + (oz / od) * 0.6 * dt;
        if (this.nav.isFree(nx, nz)) { m.x = nx; m.z = nz; }
      }
    }
    if (this.now >= m.nextAttackAt) {
      m.nextAttackAt = this.now + m.def.attackIntervalMs;
      // o Ecoante devolve o último golpe que levou, no lugar do golpe comum
      if (tryEcho(this, m, target)) return;
      // enxame, garras que atravessam couraça, pressão alta
      const res = monsterAttack(m.def, target.stats, this.data, this.rng, meleeMods(this, m));
      target.lastCombatAt = this.now;
      // golpe bloqueado pelo escudo: chega como "errou" (block marca o motivo) e não causa dano
      this.broadcast({ t: 'hit', src: m.eid, dst: target.eid, dmg: res.damage, crit: !!res.crit, miss: !res.hit || !!res.blocked, block: res.blocked || undefined, skill: null, magic: false });
      if (res.hit && !res.blocked) { this.damagePlayer(target, res.damage, m); afterMeleeHit(this, m, target); }
    }
  }

  // Dano em jogador: guardiões (redirecionamento) → escudo → vida. Proteção conta como participação.
  damagePlayer(p, amount, m) {
    p.lastHitAt = this.now;
    if (m?.defId) p.lastHitBy = m.defId; // telemetria de mortes: o último monstro que acertou
    const prot = this.f.xp.participation.threatAbsorbed;
    const down = this.buffMod(p, 'damageTakenDownPct');
    if (down) amount = Math.max(1, Math.round(amount * (1 - Math.min(down, 80) / 100)));
    if (p.shield?.thornsMagic && m) this.magicFlat(p, m, p.shield.thornsMagic + Math.floor(p.stats.attrs.spi * 0.2));
    for (const g of p.guards) {
      const gp = this.players.get(g.guardianId);
      if (!gp || gp.char.dead || g.until <= this.now) continue;
      const portion = Math.round(amount * g.pct / 100);
      if (portion <= 0) continue;
      amount -= portion;
      this.applyRawDamage(gp, portion);
      this.credit(m, gp.char.id, portion * prot);
      this.broadcast({ t: 'hit', src: m.eid, dst: gp.eid, dmg: portion, crit: false, miss: false, skill: 'redirect', magic: false });
    }
    if (p.shield && amount > 0) {
      const absorbed = Math.min(p.shield.amount, amount);
      p.shield.amount -= absorbed; amount -= absorbed;
      if (absorbed > 0) this.credit(m, p.shield.by, absorbed * this.f.xp.participation.healing);
      if (p.shield.amount <= 0) {
        if (p.shield.breakKnockbackRadius) for (const o of this.monstersInCircle(p.char.x, p.char.z, p.shield.breakKnockbackRadius)) this.pushMonster(o, p.char, 3);
        p.shield = null;
      }
    }
    if (amount > 0) this.credit(m, p.char.id, amount * prot);
    this.applyRawDamage(p, amount);
  }

  applyRawDamage(p, amount) {
    p.lastHitAt = this.now;
    if (amount <= 0 || p.char.dead) return;
    p.char.hp -= amount;
    p.lastCombatAt = this.now;
    if (p.char.hp <= 0) this.killPlayer(p);
  }

  killPlayer(p) {
    const c = p.char;
    const attackers = [...this.monsters.values()].filter((m) => m.state !== 'dead' && m.targetId === p.eid).length;
    c.hp = 0; c.dead = true; p.targetId = null; p.dest = null; p.buffs = []; p.debuffs = []; p.guards = []; p.shield = null; p.stunUntil = 0;
    this.recalc(p); // sem reforços nem efeitos negativos: quem volta ao posto (ou é levantado) volta sem eles
    p.deadAt = this.now; // volta sozinho ao posto depois de death.corpseTimeoutMs
    for (const m of this.monsters.values()) { m.threat.delete(c.id); if (m.targetId === p.eid) m.targetId = null; }
    this.store.saveCharacter(c);
    this.broadcast({ t: 'player_dead', eid: p.eid });
    this.hooks.onPlayerDeath?.(p, { by: p.lastHitBy ?? null, attackers });
  }

  tickGround() {
    for (const g of this.groundEffects) {
      while (g.pulses > 0 && g.nextAt <= this.now) {
        g.pulses--; g.nextAt += g.intervalMs;
        const p = this.players.get(g.ownerId);
        if (!p || (g.follow && p.char.dead)) { g.pulses = 0; break; }
        if (g.follow) { g.x = p.char.x; g.z = p.char.z; }
        const s = this.data.skills[g.skillId];
        for (const m of this.monstersInCircle(g.x, g.z, g.radius)) {
          if (s.effect.slowPct) { this.addMonsterFx(m, { kind: 'slow', until: this.now + g.intervalMs + 200, pct: s.effect.slowPct, by: g.ownerId }); this.creditControl(m, p, g.intervalMs / 2000); }
          this.hitMonster(p, m, { def: s, rank: g.rank }, g.skillId);
        }
      }
    }
    this.groundEffects = this.groundEffects.filter((g) => g.pulses > 0);
  }

  // ---------- visões enviadas ao cliente ----------
  // forCharId: quem recebe (entidades só do dono, como os resgatados do tutorial, vão só para ele)
  snapshot(forCharId = null) {
    const ents = [];
    for (const p of this.players.values()) {
      const c = p.char;
      ents.push({ id: p.eid, k: 'p', n: c.name, cls: c.classId, lvl: c.level, x: r2(c.x), z: r2(c.z), vx: r2(c.vx || 0), vz: r2(c.vz || 0), hp: Math.ceil(c.hp), mhp: p.stats.maxHp, dead: c.dead, tgt: p.targetId, w: p.weaponDefId ?? null, oh: p.offhandDefId ?? null, party: this.hooks.partyIdOf?.(c.id) ?? null, sh: p.shield ? Math.round(p.shield.amount) : 0, ttl: c.title ?? null, cl: c.clanTag ?? null, staff: !!c.staff });
    }
    for (const m of this.monsters.values()) {
      if (m.state === 'dead') continue;
      const fx = m.fx.filter((f) => f.until > this.now).map((f) => f.kind);
      ents.push({ id: m.eid, k: 'm', def: m.defId, lvl: m.def.level, x: r2(m.x), z: r2(m.z), vx: r2(m.vx || 0), vz: r2(m.vz || 0), hp: Math.ceil(m.hp), mhp: m.def.hp, st: m.state, tgt: m.targetId, fx: fx.length ? fx : undefined });
    }
    for (const e of this.escorts.values()) if (!e.ownerOnly || e.ownerCharId === forCharId) ents.push(e.view());
    return { t: 'snap', now: Math.round(this.now), map: this.mapId, ents };
  }

  // Há entidades que só o dono vê? (o snapshot completo deixa de ser o mesmo para todos)
  hasPrivate() {
    for (const e of this.escorts.values()) if (e.ownerOnly) return true;
    return false;
  }

  // Registros para snapshots por diferença (server.js sendSnapshots): os mesmos campos do
  // snapshot completo, em quatro grupos já serializados — A (identidade), P (posição),
  // V (velocidade) e C (combate) — mais posição e velocidade arredondadas para a previsão. A marca da
  // equipe (staff) vai sempre na identidade, verdadeira ou falsa: o cliente junta os campos recebidos com os
  // que já tinha, e um mestre rebaixado precisa perder a marca.
  snapRecords() {
    const recs = [];
    for (const p of this.players.values()) {
      const c = p.char;
      const px = r2(c.x), pz = r2(c.z), vx = r2(c.vx || 0), vz = r2(c.vz || 0);
      recs.push({
        id: p.eid, x: c.x, z: c.z, px, pz, vx, vz,
        A: `"k":"p","n":${JSON.stringify(c.name)},"cls":"${c.classId}","lvl":${c.level},"mhp":${p.stats.maxHp},"w":${p.weaponDefId ? `"${p.weaponDefId}"` : 'null'},"oh":${p.offhandDefId ? `"${p.offhandDefId}"` : 'null'},"party":${JSON.stringify(this.hooks.partyIdOf?.(c.id) ?? null)},"ttl":${JSON.stringify(c.title ?? null)},"cl":${JSON.stringify(c.clanTag ?? null)},"staff":${!!c.staff}`,
        P: `"x":${px},"z":${pz}`,
        V: `"vx":${vx},"vz":${vz}`,
        C: `"hp":${Math.ceil(c.hp)},"dead":${!!c.dead},"tgt":${p.targetId ? `"${p.targetId}"` : 'null'},"sh":${p.shield ? Math.round(p.shield.amount) : 0}`,
      });
    }
    for (const m of this.monsters.values()) {
      if (m.state === 'dead') continue;
      const fx = m.fx.filter((f) => f.until > this.now).map((f) => f.kind);
      const px = r2(m.x), pz = r2(m.z), vx = r2(m.vx || 0), vz = r2(m.vz || 0);
      recs.push({
        id: m.eid, x: m.x, z: m.z, px, pz, vx, vz,
        A: `"k":"m","def":"${m.defId}","lvl":${m.def.level},"mhp":${m.def.hp}`,
        P: `"x":${px},"z":${pz}`,
        V: `"vx":${vx},"vz":${vz}`,
        C: `"hp":${Math.ceil(m.hp)},"st":"${m.state}","tgt":${m.targetId ? `"${m.targetId}"` : 'null'},"fx":${JSON.stringify(fx)}`,
      });
    }
    for (const e of this.escorts.values()) {
      const px = r2(e.x), pz = r2(e.z), vx = r2(e.vx || 0), vz = r2(e.vz || 0);
      recs.push({
        id: e.eid, x: e.x, z: e.z, px, pz, vx, vz, owner: e.ownerOnly ? e.ownerCharId : null,
        A: `"k":"e","def":"${e.def.model ?? 'cart'}","n":${JSON.stringify(e.def.name)},"mhp":${e.mhp},"npc":${JSON.stringify(e.def.npc ?? null)}`,
        P: `"x":${px},"z":${pz}`,
        V: `"vx":${vx},"vz":${vz}`,
        C: `"hp":${Math.ceil(e.hp)},"st":"${e.state}"`,
      });
    }
    return recs;
  }

  charView(p) {
    const c = p.char, s = p.stats;
    const cum = this.data.xp.cumulative;
    return {
      id: c.id, eid: p.eid, name: c.name, classId: c.classId, level: c.level, xp: c.xp,
      xpLevelStart: cum[c.level - 1], xpNext: c.level >= this.data.levelCap ? null : cum[c.level],
      unspent: c.unspent, skillPoints: c.skillPoints, skills: c.skills, alloc: c.alloc, trialDone: !!c.trialDone, title: c.title ?? null,
      titles: this.hooks.titlesOf?.(c) ?? (c.title ? [c.title] : []),
      permanent: s.permanent, attrs: s.attrs, hp: Math.ceil(c.hp), mp: Math.floor(c.mp), gold: c.gold, dead: c.dead,
      x: r2(c.x), z: r2(c.z), mapId: this.mapId, instance: this.instanceId,
      stats: { maxHp: s.maxHp, maxMp: s.maxMp, defense: s.defense, mres: s.mres, evasion: s.evasion, accuracy: s.accuracy, crit: s.crit, magicCrit: s.magicCrit, magicPower: s.magicPower, attackIntervalMs: s.attackIntervalMs, range: s.range, weapon: s.weapon.id, ccResistPct: s.ccResistPct,
        moveSpeed: this.moveSpeedOf(p), accel: this.mv.accel, decel: this.mv.decel },
      items: [...c.items.values()].map((it) => ({ id: it.id, defId: it.defId, qty: it.qty, enh: it.enh || 0, loc: it.loc, slot: it.slot })),
      bagCapacity: BAG_CAPACITY, bagUsed: bagCount(c),
      cooldowns: Object.fromEntries(Object.entries(p.cooldowns).map(([k, v]) => [k, Math.max(0, Math.round(v - this.now))])),
    };
  }
}

export function lootView(row) {
  return { id: row.id, defId: row.def_id ?? row.defId ?? null, qty: row.qty, gold: row.gold, x: row.x, z: row.z, mapId: row.map_id ?? row.mapId };
}

export function totalPointsCheck(char, data) {
  const spent = Object.values(char.alloc).reduce((s, v) => s + v, 0);
  return spent + char.unspent === totalAttributePoints(char.level, data);
}
