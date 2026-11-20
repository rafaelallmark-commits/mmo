// Teste de aceitação do Marco 2 (servidor real, clientes simulados via WebSocket).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GameServer } from '../src/server.js';
import { SimClient, sleep } from './helpers/client.js';

const log = (...a) => console.log('   ·', ...a);
const d2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

async function withServer(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'cinzas-m2-'));
  const server = new GameServer({ port: 0, host: '127.0.0.1', dbPath: join(dir, 'm2.db'), timeScale: 4, seed: 4242, dev: true, log: false });
  const port = await server.start();
  try { await fn(server, `ws://127.0.0.1:${port}`, dir); } finally { await server.stop().catch(() => {}); rmSync(dir, { recursive: true, force: true }); }
}

async function newChar(url, label, classId, name) {
  const c = new SimClient(label);
  await c.connect(url);
  await c.request('register', { account: `acc_${label}`, password: 'senha123' });
  await c.request('login', { account: `acc_${label}`, password: 'senha123' });
  const r = await c.request('create_char', { name, classId });
  assert.equal(r.ok, true, r.reason);
  const e = await c.request('enter', { charId: r.char.id });
  c.snap = e.snapshot; c.journal = e.journal;
  return c;
}

async function relog(url, label) {
  const c = new SimClient(label);
  await c.connect(url);
  const l = await c.request('login', { account: `acc_${label.replace(/\d+$/, '')}`, password: 'senha123' });
  const e = await c.request('enter', { charId: l.chars[0].id });
  c.snap = e.snapshot;
  return c;
}

async function goTo(c, x, z, timeout = 20000) {
  const r = await c.request('move', { x, z });
  if (!r.ok && process.env.DEBUG_M2) {
    const hits = c.events.filter((m) => m.t === 'hit' && m.dst === c.char?.eid).slice(-3);
    console.log('DEBUG', c.label, 'em', c.me(), 'indo para', x, z, 'últimos golpes', hits);
  }
  assert.equal(r.ok, true, r.reason);
  const dest = r.dest ?? { x, z }; // o servidor pode deslocar o destino para fora de um tronco
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const me = c.me();
    if (me && d2(me, dest) < 0.8) return me;
    await sleep(40);
  }
  throw new Error(`${c.label}: não chegou em ${x},${z}`);
}

async function portal(c, id, x, z) {
  await goTo(c, x, z);
  const changed = c.waitFor((m) => m.t === 'zone', 5000, 'troca de zona');
  const r = await c.request('portal', { portal: id });
  assert.equal(r.ok, true, r.reason);
  return changed;
}

const findItem = (c, defId, loc) => c.char.items.find((i) => i.defId === defId && (!loc || i.loc === loc));

async function kill(c, eid, skill, { ally } = {}) {
  let done = false;
  const dead = c.waitFor((m) => m.t === 'death' && m.eid === eid, 60000, `morte de ${eid}`).then(() => { done = true; });
  const a = await c.request('attack', { target: eid });
  // alvo já morto (snapshot atrasado): espera o próximo snapshot antes de o chamador escolher outro. Sem a
  // espera, com a máquina carregada o laço repetia o ataque recusado sem parar, estourava o limite de
  // comandos (20/s) e o servidor expulsava o cliente no meio da prova (D75).
  if (!a.ok) { dead.catch(() => {}); await sleep(150); return; }
  let nextCast = 0;
  while (!done) {
    await sleep(60);
    const me = c.me();
    if (!me) continue;
    if (me.dead) { await c.request('respawn'); await c.request('attack', { target: eid }); continue; }
    if (me.hp / me.mhp < 0.4) { const pot = findItem(c, 'potion_hp_s', 'bag'); if (pot) await c.request('use_item', { instance: pot.id }); }
    if (skill && Date.now() > nextCast) { const r = await c.request('cast', { skill, target: eid, ally }); nextCast = Date.now() + (r.ok ? 300 : 150); }
  }
  await dead;
}

test('M2 — grupo de 5 papéis no Poço das Sanguessugas', { timeout: 240000 }, async () => {
  await withServer(async (server, url) => {
    const roles = [['bastion', 'Bastiao'], ['veilsinger', 'Cantora'], ['pikeman', 'Lanceiro'], ['warden', 'Vigia'], ['windwalker', 'Andarilha']];
    const cs = [];
    for (const [cls, name] of roles) cs.push(await newChar(url, cls, cls, name));
    const [B, C, L, V, W] = cs;
    for (const c of cs) {
      await c.request('gm', { cmd: 'xp', level: 9 });
      const r = await c.request('char');
      c.char = r.char;
    }
    // o Bastião se prepara para o ponto de grupo: equipamento de faixa 5 (requisitos cumpridos) e tônicos médios
    const gear = [];
    for (const id of ['hammer_1h_t5', 'shield_t5', 'heavy_armor_t5']) gear.push((await B.request('gm', { cmd: 'give', defId: id })).instanceId);
    await B.request('gm', { cmd: 'give', defId: 'potion_hp_m', qty: 20 });
    assert.equal((await B.request('allocate', { points: { str: 6, tal: 2, vit: 32 } })).ok, true);
    for (const id of gear) assert.equal((await B.request('equip', { instance: id })).ok, true);
    B.char = (await B.request('char')).char;
    log(`cinco personagens de nível 9; Bastião com martelo, escudo e couraça de faixa 5 (vida ${B.char.stats.maxHp}, defesa ${B.char.stats.defense})`);
    // portal com nível mínimo: todos caminham até a trilha do brejo
    await Promise.all(cs.map((c) => portal(c, 'to_brejo', 149, 91)));
    assert.ok(cs.every((c) => c.char.mapId === 'brejo_bombas'));
    log('todos atravessaram o portal da Estrada Velha para o Brejo das Bombas');
    // grupo
    for (const c of cs.slice(1)) {
      const inv = c.waitFor((m) => m.t === 'party_invite', 3000, 'convite');
      assert.equal((await B.request('party_invite', { name: c.char.name })).ok, true);
      const m = await inv;
      assert.equal((await c.request('party_accept', { from: m.fromId })).ok, true);
    }
    await B.waitFor((m) => m.t === 'party' && m.party?.members.length === 5, 3000, 'grupo completo');
    const sixth = await newChar(url, 'extra', 'breaker', 'Sexto');
    const full = await B.request('party_invite', { name: 'Sexto' });
    assert.equal(full.reason, 'Grupo cheio (máximo 5).');
    await sixth.close();
    const pchat = V.waitFor((m) => m.t === 'chat' && m.channel === 'party', 3000);
    await C.request('chat', { channel: 'party', text: 'Segura que eu curo.' });
    assert.equal((await pchat).text, 'Segura que eu curo.');
    const wh = L.waitFor((m) => m.t === 'chat' && m.channel === 'whisper', 3000);
    await W.request('chat', { channel: 'whisper', to: 'Lanceiro', text: 'Linha na esquerda.' });
    assert.equal((await wh).from, 'Andarilha');
    log('grupo de 5 formado (o sexto convite é recusado), chat de grupo e sussurro funcionam');
    // Bastião entra primeiro no poço e puxa
    // sem busca de caminho ainda: contorna a Lagoa funda por cima
    for (const [x, z] of [[30, 50], [90, 52], [130, 56]]) await Promise.all(cs.map((c) => goTo(c, x, z)));
    await Promise.all([L, V, W].map((c, i) => goTo(c, 152 - i, 50)));
    await goTo(C, 155, 47); // dentro dos 16 m da cura até o Bastião e fora do raio de agressão do poço
    const xp = new Map(cs.map((c) => [c.label, 0]));
    for (const c of cs) c.ws.on('message', (buf) => { const m = JSON.parse(buf.toString()); if (m.t === 'xp') xp.set(c.label, xp.get(c.label) + m.gained); });
    // a Cantora só cura (nunca ataca)
    let healing = true;
    const healer = (async () => {
      while (healing) {
        await sleep(200);
        const me = B.me();
        if (me && !me.dead && me.hp < me.mhp * 0.85) await C.request('cast', { skill: 'sustain_chant', ally: B.char.eid }).catch(() => {});
        if (me && !me.dead && me.hp < me.mhp * 0.5) { const pot = findItem(B, 'potion_hp_m', 'bag'); if (pot) { const r = await B.request('use_item', { instance: pot.id }).catch(() => ({})); if (r.char) B.char = r.char; } }
      }
    })();
    assert.equal((await B.request('cast', { skill: 'dynamic_plate' })).ok, true);
    await goTo(B, 168, 41);
    let held = 0;
    const t0 = Date.now();
    while (held < 3 && Date.now() - t0 < 10000) {
      const pull = await B.request('cast', { skill: 'pull_pulse' });
      if (!pull.ok && pull.code !== 'cooldown') assert.fail(pull.reason);
      await sleep(300);
      held = B.snap.ents.filter((e) => e.k === 'm' && e.tgt === B.char.eid).length;
    }
    if (held < 3) { healing = false; await healer; }
    assert.ok(held >= 3, `Bastião segura ${held} monstros`);
    log(`Pulso de Atração: ${held} sanguessugas presas no Bastião`);
    const dps = [L, V, W];
    let kills = 0;
    while (kills < 4) {
      const target = B.snap.ents.filter((e) => e.k === 'm' && e.def === 'boiling_leech' && e.tgt === B.char.eid)[0]
        ?? B.snap.ents.filter((e) => e.k === 'm' && e.def === 'boiling_leech').sort((a, b) => d2(a, B.me()) - d2(b, B.me()))[0];
      await Promise.all([kill(B, target.id), ...dps.map((c, i) => kill(c, target.id, ['long_thrust', 'trail_mark', 'return_throw'][i]))]);
      kills++;
    }
    healing = false; await healer;
    await sleep(200);
    log(`XP por membro após ${kills} abates: ${[...xp].map(([k, v]) => `${k}=${v}`).join(', ')}`);
    for (const [k, v] of xp) assert.ok(v > 0, `${k} recebeu XP`);
    const cHits = C.events.filter((m) => m.t === 'hit' && m.src === C.char.eid).length;
    assert.equal(cHits, 0, 'a Cantora não causou dano');
    const heals = C.events.filter((m) => m.t === 'heal' && m.src === C.char.eid).length;
    assert.ok(heals > 0, 'a Cantora curou');
    const cDeaths = C.events.filter((m) => m.t === 'player_dead' && m.eid === C.char.eid).length;
    if (process.env.DEBUG_M2) {
      const hitsOnC = C.events.filter((m) => m.t === 'hit' && m.dst === C.char.eid);
      const by = {};
      for (const h of hitsOnC) by[h.src] = (by[h.src] || 0) + h.dmg;
      console.log('DEBUG golpes na Cantora por origem', by, 'snap C', C.me());
    }
    assert.equal(cDeaths, 0, 'o Bastião segurou os monstros longe da Cantora');
    log(`a Cantora curou ${heals} vezes sem causar dano e sem ser atingida, e recebeu ${xp.get('veilsinger')} XP`);
    // saque individual: cada um só recebe o próprio
    const lootOwners = cs.map((c) => [...c.loot.keys()]);
    const all = lootOwners.flat();
    assert.equal(new Set(all).size, all.length, 'nenhum saque aparece para dois membros');
    // equipamento de faixa 9 só com requisitos
    const v9 = await V.request('gm', { cmd: 'give', defId: 'bow_t9' });
    const early = await V.request('equip', { instance: v9.instanceId });
    assert.deepEqual(early.reasons, ['Talento 18 exigido. Seu Talento atual é 13.', 'Agilidade 30 exigida. Sua Agilidade atual é 18.']);
    assert.equal((await V.request('allocate', { points: { agi: 12, tal: 5 } })).ok, true);
    assert.equal((await V.request('equip', { instance: v9.instanceId })).ok, true);
    log('Vigia: Arco de Freixo Negro recusado por Agilidade; após distribuir pontos, equipado');
    for (const c of cs) await c.close();
  });
});

test('M2 — prova de classe com queda de conexão no meio concede a habilidade uma vez', { timeout: 240000 }, async () => {
  await withServer(async (server, url) => {
    let A = await newChar(url, 'prova', 'breaker', 'Provador');
    await A.request('gm', { cmd: 'xp', level: 10 });
    await A.request('gm', { cmd: 'quest_done', quests: ['tutorial', 'c1_count', 'c1_rats', 'c1_master', 'c1_route', 'c1_foreman', 'c2_water', 'c2_pressure', 'c2_pages', 'c2_group', 'c2_signature', 'c3_fuses', 'c3_rats'] });
    const axe = await A.request('gm', { cmd: 'give', defId: 'axe_1h_t9' });
    const armor = await A.request('gm', { cmd: 'give', defId: 'heavy_armor_t9' });
    await A.request('gm', { cmd: 'give', defId: 'potion_hp_m', qty: 10 });
    assert.equal((await A.request('allocate', { points: { str: 13, tal: 9, vit: 23 } })).ok, true);
    assert.equal((await A.request('equip', { instance: axe.instanceId })).ok, true);
    assert.equal((await A.request('equip', { instance: armor.instanceId })).ok, true);
    await portal(A, 'to_pedrambar', 4, 50);
    assert.equal(A.char.mapId, 'pedrambar');
    await goTo(A, 14, 16);
    const talk = await A.request('talk', { npc: 'master_breaker' });
    assert.equal(talk.ok, true);
    assert.ok(talk.quests.offer.some((q) => q.id === 'c3_trial'));
    assert.equal((await A.request('quest_accept', { quest: 'c3_trial', npc: 'master_breaker' })).ok, true);
    assert.equal((await A.request('cast', { skill: 'rupture' })).reason, 'Ruptura é liberada pela prova de classe.');
    // 1ª tentativa: cai a conexão no meio
    let inArena = A.waitFor((m) => m.t === 'zone' && m.mapId === 'arena_prova', 5000);
    assert.equal((await A.request('trial_start', { npc: 'master_breaker' })).ok, true);
    await inArena;
    log('prova iniciada em instância solo; a conexão cai no meio da primeira onda');
    await A.close();
    await sleep(200);
    A = await relog(url, 'prova2');
    assert.equal(A.char.mapId, 'pedrambar', 'volta para a cidade do mestre');
    assert.equal(A.char.trialDone, false);
    assert.equal(A.char.skills.rupture, undefined);
    // 2ª tentativa: vence as duas ondas
    await goTo(A, 14, 16);
    inArena = A.waitFor((m) => m.t === 'zone' && m.mapId === 'arena_prova', 5000);
    assert.equal((await A.request('trial_start', { npc: 'master_breaker' })).ok, true);
    await inArena;
    const result = A.waitFor((m) => m.t === 'trial' && (m.state === 'success' || m.state === 'failed'), 120000, 'fim da prova');
    let finished = false;
    result.then(() => { finished = true; });
    while (!finished) {
      const target = A.snap?.ents.find((e) => e.k === 'm');
      if (!target) { await sleep(100); continue; }
      await Promise.race([kill(A, target.id, 'deep_cut').catch(() => {}), result]);
    }
    const end = await result;
    assert.equal(end.state, 'success', end.message);
    await sleep(200);
    const ch = (await A.request('char')).char;
    assert.equal(ch.trialDone, true); assert.equal(ch.skills.rupture, 1); assert.equal(ch.mapId, 'pedrambar');
    log('segunda tentativa vencida: Ruptura liberada no grau 1, de volta a Pedrâmbar');
    assert.equal((await A.request('trial_start', { npc: 'master_breaker' })).reason, 'Você já venceu a prova da sua classe.');
    const xpBefore = ch.xp;
    const t1 = await A.request('quest_turnin', { quest: 'c3_trial', npc: 'master_breaker' });
    assert.equal(t1.ok, true, t1.reason);
    const t2 = await A.request('quest_turnin', { quest: 'c3_trial', npc: 'master_breaker' });
    assert.equal(t2.alreadyDone, true);
    assert.equal((await A.request('char')).char.xp, xpBefore + 1800);
    log('entrega da missão concede 1.800 XP uma única vez; nova prova é recusada');
    await A.close();
  });
});

test('M2 — missões do capítulo 1: tutorial, Contar as Pessoas e Ratos no Sulco', { timeout: 240000 }, async () => {
  await withServer(async (server, url) => {
    const A = await newChar(url, 'missao', 'emberweaver', 'Aprendiz');
    assert.ok(A.journal.available.some((q) => q.id === 'tutorial'));
    await goTo(A, 26, 48);
    const t = await A.request('talk', { npc: 'mara' });
    assert.ok(t.quests.offer.some((q) => q.id === 'tutorial'));
    assert.equal((await A.request('quest_accept', { quest: 'tutorial', npc: 'mara' })).ok, true);
    const early = await A.request('quest_turnin', { quest: 'tutorial', npc: 'mara' });
    assert.equal(early.reason, 'Ainda falta: Resgate Bento, Ligia e Caio (0/3).');
    for (const [id, x, z] of [['rescue_bento', 34, 44], ['rescue_ligia', 40, 58], ['rescue_caio', 50, 40]]) {
      await goTo(A, x, z + 1);
      assert.equal((await A.request('interact', { object: id })).ok, true);
    }
    await goTo(A, 26, 48);
    const done = await A.request('quest_turnin', { quest: 'tutorial', npc: 'mara' });
    assert.equal(done.ok, true, done.reason);
    assert.equal(done.char.xp, 60);
    log('tutorial: três resgates por interação, entrega a Mara: +60 XP e 3 tônicos');
    await goTo(A, 16, 48);
    assert.equal((await A.request('quest_accept', { quest: 'c1_count', npc: 'teodoro' })).ok, true);
    await goTo(A, 23, 54);
    await A.request('talk', { npc: 'ruy' });
    assert.equal((await A.request('quest_turnin', { quest: 'c1_count', npc: 'ruy' })).ok, true);
    assert.equal((await A.request('quest_accept', { quest: 'c1_rats', npc: 'ruy' })).ok, true);
    log('Contar as Pessoas entregue a Ruy; Ratos no Sulco aceita');
    // caça ratos até 8 abates e 3 sucatas
    const status = async () => (await A.request('quests')).journal.active.find((q) => q.id === 'c1_rats');
    let st = await status();
    let guard = 0;
    while (!st.ready && guard++ < 40) {
      const rat = A.snap.ents.filter((e) => e.k === 'm' && e.def === 'furrow_rat').sort((a, b) => d2(a, A.me()) - d2(b, A.me()))[0];
      if (!rat) { await sleep(300); continue; }
      await kill(A, rat.id, 'glass_spark');
      await sleep(80);
      for (const l of [...A.loot.values()].filter((x) => !x.picked)) {
        await goTo(A, l.x, l.z);
        await A.request('pickup', { loot: l.id });
        l.picked = true;
      }
      A.char = (await A.request('char')).char;
      st = await status();
    }
    assert.ok(st.ready, `objetivos: ${JSON.stringify(st.objectives)}`);
    const scrapBefore = A.char.items.filter((i) => i.defId === 'mat_scrap').reduce((s, i) => s + i.qty, 0);
    await goTo(A, 23, 54);
    const r = await A.request('quest_turnin', { quest: 'c1_rats', npc: 'ruy' });
    assert.equal(r.ok, true, r.reason);
    const scrapAfter = r.char.items.filter((i) => i.defId === 'mat_scrap').reduce((s, i) => s + i.qty, 0);
    assert.equal(scrapBefore - scrapAfter, 3, 'três sucatas consumidas');
    assert.equal((await A.request('quest_turnin', { quest: 'c1_rats', npc: 'ruy' })).alreadyDone, true);
    log(`Ratos no Sulco: ${st.objectives.map((o) => `${o.text} ${o.cur}/${o.need}`).join('; ')} → entregue (3 sucatas consumidas, +80 XP, +20 ouro), entrega repetida não duplica`);
    await A.close();
  });
});
