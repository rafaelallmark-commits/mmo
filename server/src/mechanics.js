// Mecânicas dos monstros: o campo "mechanic" de data/monsters.json (docs/06-mundo-e-mapas.md, "Monstros e
// mecânicas"). A zona chama os ganchos daqui; só o Custódio tem um controlador próprio (dungeon.js).
//
// Golpe avisado (telegraph): o monstro para, a zona manda { t: 'warn' } com a forma (círculo em volta dele,
// círculo onde o alvo estava, cone ou linha à frente) e, vencido o aviso, acerta quem ficou dentro; quem saiu
// não leva nada. Atordoar o monstro durante o aviso cancela o golpe ({ t: 'warn_cancel' }). Os demais tipos:
// explosão ao morrer (death_burst, também avisada), sanguessuga (leech), enxame (swarm), garras que atravessam
// couraça (pierce), eco do último golpe (echo), invocação por limiar de vida (summon), pressão alternada
// (pressure) e território de monstro passivo (territorial).
import { mitigate, rollInt } from './rules.js';

export const MECHANIC_KINDS = ['telegraph', 'death_burst', 'leech', 'swarm', 'pierce', 'echo', 'summon', 'pressure', 'territorial'];
export const TELEGRAPH_SHAPES = ['circle', 'target_circle', 'cone', 'line'];
export const DEBUFF_MODS = ['hitChancePct', 'moveSpeedPct'];
// aviso mínimo de um golpe de área: reação de quem joga clicando (~0,7 s) + o clique + os passos para fora
export const MIN_WARN_MS = 1200;
// efeitos negativos em jogador são curtos (validate-data confere os dados contra estes tetos)
export const MAX_DEBUFF_MS = 6000;
export const MAX_STUN_MS = 2000;
// folga do corpo do jogador nas bordas das áreas (a mesma das linhas do Custódio)
export const BODY = 0.3;
// círculo no alvo: o monstro só o lança em quem está a até esta distância
const TARGET_CIRCLE_RANGE = 14;

const r2 = (v) => Math.round(v * 100) / 100;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
// ângulo no chão com a convenção das linhas do Custódio e do cliente: direção (sin yaw, cos yaw) = (dx, dz)
export const yawOf = (dx, dz) => Math.atan2(dx, dz);

// Distância (ao monstro) em que o golpe avisado é lançado: [mín, máx].
export function triggerRange(spec) {
  const lo = spec.minRange ?? 0;
  if (spec.maxRange != null) return [lo, spec.maxRange];
  if (spec.shape === 'circle') return [lo, spec.radius];
  if (spec.shape === 'target_circle') return [lo, TARGET_CIRCLE_RANGE];
  if (spec.shape === 'cone') return [lo, spec.range];
  return [lo, spec.length];
}

// O ponto (x, z) está dentro da área? extra: folga do corpo (BODY) nas bordas.
export function inShape(h, x, z, extra = BODY) {
  const dx = x - h.x, dz = z - h.z;
  if (h.shape === 'circle') return Math.hypot(dx, dz) <= h.radius + extra;
  const ux = Math.sin(h.yaw), uz = Math.cos(h.yaw);
  const along = dx * ux + dz * uz;
  const perp = Math.abs(dx * uz - dz * ux);
  if (h.shape === 'cone') {
    const d = Math.hypot(dx, dz);
    if (d <= 0.5 + extra) return true; // colado na boca do cone
    if (d > h.range + extra) return false;
    const half = ((h.angleDeg / 2) * Math.PI) / 180;
    const ang = Math.atan2(perp, along);
    if (ang <= half) return true;
    // fora do ângulo: ainda pega quem está a até `extra` da borda
    return ang - half < Math.PI / 2 && d * Math.sin(ang - half) <= extra;
  }
  // linha: retângulo a partir da origem, na direção yaw
  if (along < -extra || along > h.length + extra) return false;
  return perp <= h.width / 2 + extra;
}

// Texto curto do efeito negativo para a interface ("−25% de acerto, −25% de velocidade").
export function debuffText(d) {
  const out = [];
  const pct = (v) => `${v > 0 ? '+' : '−'}${Math.abs(v)}%`;
  if (d.mods?.hitChancePct) out.push(`${pct(d.mods.hitChancePct)} de acerto`);
  if (d.mods?.moveSpeedPct) out.push(`${pct(d.mods.moveSpeedPct)} de velocidade`);
  if (d.mpPctPerSec) out.push(`−${d.mpPctPerSec}% da mana por segundo`);
  if (d.silence) out.push('sem habilidades');
  if (d.stun) out.push('sem agir');
  return out.join(', ');
}

// Estado de luta do monstro (zerado quando ele reaparece ou volta para casa).
function state(m) {
  if (!m.mech) m.mech = { combatAt: null, readyAt: 0, marks: 0, blow: null, echoAt: 0, phase: null, phaseUntil: 0 };
  return m.mech;
}

// Volta para casa ou reaparece: esquece a luta (próximo aviso volta a esperar firstMs, limiares de novo).
export function resetMechanic(zone, m) {
  if (m.windup) cancelWindup(zone, m);
  m.mech = null;
  if (m.fx?.length) m.fx = m.fx.filter((f) => f.kind !== 'pressure_high' && f.kind !== 'pressure_low');
}

function warnMessage(h) {
  const s = h.spec;
  const msg = { t: 'warn', shape: h.shape, x: r2(h.x), z: r2(h.z), ms: s.warnMs, kind: s.id, name: s.name, src: h.src, id: h.id };
  if (h.shape === 'circle') msg.radius = h.radius;
  else if (h.shape === 'cone') { msg.yaw = r2(h.yaw); msg.range = h.range; msg.angleDeg = h.angleDeg; }
  else { msg.yaw = r2(h.yaw); msg.length = h.length; msg.width = h.width; }
  return msg;
}

// Começa um golpe avisado: o monstro fica parado até a área resolver (tickHazards).
export function startTelegraph(zone, m, spec, target) {
  const h = { id: `h${++zone.hazardSeq}`, src: m.eid, owner: m, def: m.def, spec, at: zone.now + spec.warnMs, x: m.x, z: m.z, shape: spec.shape };
  const tc = target?.char ?? target;
  if (spec.shape === 'target_circle') { h.shape = 'circle'; h.x = tc.x; h.z = tc.z; h.radius = spec.radius; }
  else if (spec.shape === 'circle') h.radius = spec.radius;
  else {
    let dx = tc ? tc.x - m.x : 0, dz = tc ? tc.z - m.z : 1;
    // trilho: só anda nos eixos do mapa (a direção dominante até o alvo)
    if (spec.rails) { if (Math.abs(dx) >= Math.abs(dz)) dz = 0; else dx = 0; }
    if (Math.hypot(dx, dz) < 1e-3) { dx = 0; dz = 1; }
    h.yaw = yawOf(dx, dz);
    if (spec.shape === 'cone') { h.range = spec.range; h.angleDeg = spec.angleDeg; }
    else { h.length = spec.length; h.width = spec.width; }
  }
  zone.hazards.push(h);
  m.windup = h;
  m.vx = 0; m.vz = 0; m.path = null; m.chase = null;
  zone.broadcast(warnMessage(h));
  return h;
}

// Monstro atordoado, morto ou que desistiu durante o aviso: o golpe não sai.
export function cancelWindup(zone, m) {
  const h = m.windup;
  if (!h) return;
  m.windup = null;
  zone.hazards = zone.hazards.filter((x) => x !== h);
  zone.broadcast({ t: 'warn_cancel', id: h.id, src: m.eid });
  if (m.mech) m.mech.readyAt = Math.max(m.mech.readyAt, zone.now + 2000);
}

// Em combate, a cada passo do monstro: começa o golpe avisado quando está pronto e o alvo está na
// distância certa; cuida da pressão alternada. Devolve true quando o monstro fica parado preparando o golpe.
export function mechanicTick(zone, m, target, d) {
  const mech = m.def.mechanic;
  if (!mech) return false;
  const st = state(m);
  if (st.combatAt == null) {
    st.combatAt = zone.now;
    st.readyAt = zone.now + (mech.firstMs ?? 0);
    st.echoAt = zone.now + (mech.firstMs ?? mech.everyMs ?? 0);
    if (mech.kind === 'pressure') enterPhase(zone, m, 'high', mech.highMs);
  }
  if (mech.kind === 'telegraph') {
    if (zone.now < st.readyAt) return false;
    const [lo, hi] = triggerRange(mech);
    if (d < lo || d > hi) return false;
    startTelegraph(zone, m, mech, target);
    st.readyAt = zone.now + mech.everyMs;
    return true;
  }
  if (mech.kind === 'pressure' && zone.now >= st.phaseUntil) {
    if (st.phase === 'high') {
      // fim da pressão alta: o vapor sai em volta (avisado) e a pressão cai
      startTelegraph(zone, m, mech.vent, target);
      enterPhase(zone, m, 'low', mech.vent.warnMs + mech.lowMs);
      return true;
    }
    enterPhase(zone, m, 'high', mech.highMs);
  }
  return false;
}

function enterPhase(zone, m, phase, ms) {
  const st = state(m);
  st.phase = phase;
  st.phaseUntil = zone.now + ms;
  m.fx = m.fx.filter((f) => f.kind !== 'pressure_high' && f.kind !== 'pressure_low');
  m.fx.push({ kind: phase === 'high' ? 'pressure_high' : 'pressure_low', until: st.phaseUntil });
  zone.broadcast({ t: 'mech', kind: 'pressure', eid: m.eid, phase, ms });
}

// Pressão baixa: defesa e resistência mágica caem (lowDefensePct).
export function defenseFactor(zone, m) {
  const mech = m.def.mechanic;
  if (mech?.kind !== 'pressure' || m.mech?.phase !== 'low' || zone.now >= m.mech.phaseUntil) return 1;
  return 1 - mech.lowDefensePct / 100;
}

// Modificadores do golpe corpo a corpo: enxame, garras que atravessam couraça e pressão alta.
export function meleeMods(zone, m) {
  const mech = m.def.mechanic;
  if (!mech) return undefined;
  if (mech.kind === 'swarm') {
    let n = 0;
    for (const o of zone.monsters.values()) {
      if (o !== m && o.defId === m.defId && o.state === 'chase' && dist(o, m) <= mech.radius) n++;
    }
    n = Math.min(n, mech.maxAllies);
    return n ? { damagePct: n * mech.damagePctPerAlly, allies: n } : undefined;
  }
  if (mech.kind === 'pierce') return { defensePiercePct: mech.defensePiercePct };
  if (mech.kind === 'pressure' && m.mech?.phase === 'high' && zone.now < m.mech.phaseUntil) return { damagePct: mech.highDamagePct };
  return undefined;
}

// Golpe corpo a corpo que acertou (e não foi bloqueado): a sanguessuga gruda.
export function afterMeleeHit(zone, m, p) {
  const mech = m.def.mechanic;
  if (mech?.kind === 'leech' && !p.char.dead) zone.addDebuff(p, mech.debuff, m.eid);
}

// Eco: o monstro guarda o último golpe que levou de um jogador (básico ou habilidade).
export function recordBlow(zone, m, p, res) {
  if (m.def.mechanic?.kind !== 'echo' || m.state === 'dead' || !res.hit || !(res.damage > 0)) return;
  state(m).blow = { charId: p.char.id, dmg: res.damage, magic: !!res.magic, at: zone.now };
}

// Na vez de bater, o Ecoante devolve o último golpe guardado (no lugar do golpe comum) a quem o deu.
export function tryEcho(zone, m, target) {
  const mech = m.def.mechanic;
  if (mech?.kind !== 'echo') return false;
  const st = state(m);
  const b = st.blow;
  if (!b || zone.now < st.echoAt || zone.now - b.at > mech.memoryMs) return false;
  const author = zone.players.get(b.charId);
  const victim = author && !author.char.dead && dist(author.char, m) <= mech.range ? author : target;
  if (!victim || victim.char.dead) return false;
  const raw = Math.max(1, Math.min(Math.round((b.dmg * mech.pct) / 100), Math.round((m.def.damage[1] * mech.capPct) / 100)));
  const dmg = mitigate(raw, b.magic ? victim.stats.mres : victim.stats.defense, m.def.level, zone.data);
  st.echoAt = zone.now + mech.everyMs;
  st.blow = null;
  zone.broadcast({ t: 'mech', kind: 'echo', eid: m.eid, dst: victim.eid, magic: b.magic });
  zone.broadcast({ t: 'hit', src: m.eid, dst: victim.eid, dmg, crit: false, miss: false, skill: mech.id, magic: b.magic });
  victim.lastCombatAt = zone.now;
  zone.damagePlayer(victim, dmg, m);
  return true;
}

// Invocação por limiar de vida (Supervisor de Turno): a cada limiar cruzado, chama reforços.
export function afterMonsterDamaged(zone, m) {
  const mech = m.def.mechanic;
  if (mech?.kind !== 'summon' || m.state === 'dead' || m.hp <= 0) return;
  const st = state(m);
  const pct = (m.hp / m.def.hp) * 100;
  while (st.marks < mech.thresholdsPct.length && pct <= mech.thresholdsPct[st.marks]) {
    st.marks++;
    const adds = spawnAdds(zone, m, mech);
    if (adds.length) {
      const text = `${m.def.name}: ${mech.name}! ${adds.length === 1 ? 'Chegou um' : `Chegaram ${adds.length}`} ${zone.data.monsters[mech.monster].name}${adds.length === 1 ? '' : 's'}.`;
      for (const charId of m.threat.keys()) zone.send(charId, { t: 'system', text });
    }
  }
}

// Reforços (Ratos-Engrenagem do Supervisor, Ecoantes da Mãe do Eco): entram na briga com quem o invocador
// enfrenta, não deixam saque e somem quando o invocador cai ou desiste. maxAlive: teto de vivos por invocador.
export function spawnAdds(zone, m, sp) {
  let alive = 0;
  for (const o of zone.monsters.values()) if (o.summonerEid === m.eid && o.state !== 'dead') alive++;
  const n = Math.max(0, Math.min(sp.count, sp.maxAlive - alive));
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = zone.spawnMonster({ monster: sp.monster, x: m.x, z: m.z, radius: 2.5 }, { noRespawn: true });
    a.temp = true; a.noLoot = true; a.summonerEid = m.eid;
    for (const [cid, t] of m.threat) a.threat.set(cid, t);
    a.targetId = m.targetId;
    a.state = 'chase';
    out.push(a.eid);
  }
  if (out.length) zone.broadcast({ t: 'mech', kind: 'summon', eid: m.eid, adds: out, x: r2(m.x), z: r2(m.z) });
  return out;
}

// Reforço cujo invocador caiu, voltou para casa ou sumiu: some junto.
export function summonOrphaned(zone, m) {
  if (!m.summonerEid) return false;
  const s = zone.monsters.get(m.summonerEid);
  return !s || s.state === 'dead' || s.state === 'return' || s.state === 'idle' || m.state === 'return';
}

// Morreu: o golpe que preparava não sai; a explosão (death_burst) é avisada onde ele caiu.
export function onMonsterDeath(zone, m) {
  if (m.windup) cancelWindup(zone, m);
  const mech = m.def.mechanic;
  if (mech?.kind !== 'death_burst') return;
  const h = { id: `h${++zone.hazardSeq}`, src: m.eid, owner: m, def: m.def, spec: mech, at: zone.now + mech.warnMs, x: m.x, z: m.z, shape: 'circle', radius: mech.radius, posthumous: true };
  zone.hazards.push(h);
  zone.broadcast(warnMessage(h));
}

// Território: o monstro passivo ataca quem chega a esse raio (o ninho do Besouro-Brasa, a margem da Salamandra).
export function territoryRadius(m) {
  return m.def.mechanic?.kind === 'territorial' ? m.def.mechanic.radius : 0;
}

// Trilho: o monstro persegue andando só nos eixos do mapa (um eixo de cada vez).
export function railGoal(zone, m, goal) {
  if (!m.def.mechanic?.rails) return goal;
  const dx = goal.x - m.x, dz = goal.z - m.z;
  if (Math.abs(dx) < 0.6 || Math.abs(dz) < 0.6) return goal;
  const g = Math.abs(dx) >= Math.abs(dz) ? { x: goal.x, z: m.z } : { x: m.x, z: goal.z };
  return zone.nav.isFree(g.x, g.z) ? g : goal;
}

// Áreas avisadas que venceram neste passo.
export function tickHazards(zone) {
  if (!zone.hazards.length) return;
  const due = zone.hazards.filter((h) => h.at <= zone.now);
  if (!due.length) return;
  zone.hazards = zone.hazards.filter((h) => h.at > zone.now);
  for (const h of due) resolveHazard(zone, h);
}

function resolveHazard(zone, h) {
  const m = h.owner, s = h.spec;
  if (m.windup === h) m.windup = null;
  if (!h.posthumous && m.state === 'dead') return;
  let area = h;
  if (s.dash) area = dashAlong(zone, m, h);
  const victims = [...zone.players.values()].filter((p) => !p.char.dead && inShape(area, p.char.x, p.char.z));
  const pulled = [];
  for (const p of victims) {
    if (s.damagePct > 0) {
      const raw = Math.max(1, Math.round((rollInt(zone.rng, h.def.damage[0], h.def.damage[1]) * s.damagePct) / 100));
      const dmg = mitigate(raw, s.magic ? p.stats.mres : p.stats.defense, h.def.level, zone.data);
      zone.broadcast({ t: 'hit', src: h.src, dst: p.eid, dmg, crit: false, miss: false, skill: s.id, magic: !!s.magic });
      p.lastCombatAt = zone.now;
      zone.damagePlayer(p, dmg, m);
    }
    if (p.char.dead) continue;
    if (s.pullTo && pullPlayer(zone, m, p, s.pullTo)) pulled.push(p.eid);
    if (s.stunMs) zone.stunPlayer(p, s.stunMs);
    if (s.debuff) zone.addDebuff(p, s.debuff, h.src);
  }
  if (pulled.length) zone.broadcast({ t: 'mech', kind: 'pull', eid: h.src, dst: pulled, x: r2(m.x), z: r2(m.z) });
  if (h.posthumous) zone.broadcast({ t: 'mech', kind: 'burst', eid: h.src, x: r2(h.x), z: r2(h.z), radius: h.radius, hits: victims.length });
  if (s.spawn && m.state !== 'dead') spawnAdds(zone, m, s.spawn);
}

// Investida: o monstro corre pela linha avisada até o fim (ou até um obstáculo) e acerta quem está no caminho.
function dashAlong(zone, m, h) {
  const ux = Math.sin(h.yaw), uz = Math.cos(h.yaw);
  const step = 0.25;
  let t = 0;
  while (t + step <= h.length) {
    const nx = h.x + ux * (t + step), nz = h.z + uz * (t + step);
    if (!zone.inBounds(nx, nz) || zone.isBlocked(nx, nz) || !zone.nav.isFree(nx, nz)) break;
    t += step;
  }
  const x0 = m.x, z0 = m.z;
  m.x = h.x + ux * t; m.z = h.z + uz * t;
  m.vx = 0; m.vz = 0; m.speed = 0; m.path = null; m.chase = null;
  m.nextAttackAt = Math.max(m.nextAttackAt, zone.now + 800);
  zone.broadcast({ t: 'mech', kind: 'dash', eid: m.eid, x0: r2(x0), z0: r2(z0), x1: r2(m.x), z1: r2(m.z) });
  return { ...h, length: Math.max(t, 0.5) };
}

// Puxão: traz o jogador até `to` metros do monstro (sem atravessar bloqueios). Imunidade a controle anula.
function pullPlayer(zone, m, p, to) {
  if (p.ccImmuneUntil > zone.now) return false;
  const c = p.char;
  const dx = c.x - m.x, dz = c.z - m.z;
  const d = Math.hypot(dx, dz);
  if (d <= to + 0.2) return false;
  let x = m.x + (dx / d) * to, z = m.z + (dz / d) * to;
  if (zone.isBlocked(x, z) || !zone.nav.isFree(x, z)) {
    const f = zone.nav.nearestFree(x, z, 2);
    if (!f) return false;
    x = f.x; z = f.z;
  }
  if (p.casting) zone.cancelCast(p, 'Conjuração interrompida: você foi puxado.');
  if (p.channel) zone.cancelChannel(p, 'Interrompido: você foi puxado.');
  c.x = x; c.z = z; c.speed = 0; c.vx = 0; c.vz = 0; c.chase = null;
  p.path = null; p.dest = null;
  return true;
}
