// Capítulo 4 completo: recalibração com canalização interrompível, escolta da carroça (emboscadas,
// quebra volta ao último marco, chegada conta para o grupo) e a escolha de resposta em "Duas Razões"
// (título e falas que mudam depois).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GameServer } from '../src/server.js';
import { SimClient, sleep } from './helpers/client.js';

const log = (...a) => console.log('   ·', ...a);

async function withServer(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'cinzas-c4-'));
  const server = new GameServer({ port: 0, host: '127.0.0.1', dbPath: join(dir, 'c4.db'), timeScale: 4, seed: 404, dev: true, log: false });
  const port = await server.start();
  try { await fn(server, `ws://127.0.0.1:${port}`); } finally { await server.stop().catch(() => {}); rmSync(dir, { recursive: true, force: true }); }
}

// tudo antes do capítulo 4 + o primeiro passo dele
const preOf = (server) => [...Object.entries(server.data.quests).filter(([, q]) => q.chapter < 4).map(([id]) => id), 'c4_bells'];

async function hero(server, url, label, classId, level, done, accept) {
  const c = new SimClient(label);
  await c.connect(url);
  await c.request('register', { account: `c4_${label}`, password: 'senha123' });
  await c.request('login', { account: `c4_${label}`, password: 'senha123' });
  const r = await c.request('create_char', { name: `Q${label}`, classId });
  await c.request('enter', { charId: r.char.id });
  assert.equal((await c.request('gm', { cmd: 'xp', level })).ok, true);
  const known = done.filter((q) => server.data.quests[q]);
  await c.request('gm', { cmd: 'quest_done', quests: known });
  const zw = c.waitFor((m) => m.t === 'zone' && m.mapId === 'galerias_eco', 5000, 'galerias');
  await c.request('gm', { cmd: 'teleport', mapId: 'galerias_eco', x: 24, z: 86 });
  await zw;
  for (const q of accept) {
    const npc = server.data.quests[q].npc;
    const n = server.data.maps.galerias_eco.npcs.find((x) => x.id === npc);
    await c.request('gm', { cmd: 'teleport', x: n.x + 1.5, z: n.z });
    const r2 = await c.request('quest_accept', { quest: q, npc });
    assert.equal(r2.ok, true, `${q}: ${r2.reason}`);
  }
  return c;
}

const player = (server, c) => server.zoneOfChar(c.char.id).players.get(c.char.id);

test('recalibração: canalização de 4 s; mover ou apanhar interrompe', async () => {
  await withServer(async (server, url) => {
    const c = await hero(server, url, 'gauge', 'bastion', 13, preOf(server), ['c4_ilda']);
    const p = player(server, c);
    const zone = p.zone;
    // medidor 1: fica parado até o fim
    await c.request('gm', { cmd: 'teleport', x: 92, z: 72.5 });
    let r = await c.request('interact', { object: 'gauge_1' });
    assert.equal(r.ok, true, r.reason);
    assert.equal(r.channel.ms, 4000);
    let end = await c.waitFor((m) => m.t === 'channel_end', 4000, 'fim da canalização');
    assert.equal(end.ok, true);
    let v = c.events.filter((m) => m.t === 'quest').pop();
    log('medidor 1 recalibrado');
    // medidor 2: anda no meio → interrompe, sem progresso
    await c.request('gm', { cmd: 'teleport', x: 128, z: 84.5 });
    r = await c.request('interact', { object: 'gauge_2' });
    assert.equal(r.ok, true);
    await sleep(150);
    const wMove = c.waitFor((m) => m.t === 'channel_end', 3000, 'interrupção por movimento');
    await c.request('move', { x: 124, z: 84 });
    end = await wMove;
    assert.equal(end.ok, false);
    assert.match(end.reason, /moveu/);
    // de novo, agora levando um golpe
    await c.request('gm', { cmd: 'teleport', x: 128, z: 84.5 });
    r = await c.request('interact', { object: 'gauge_2' });
    assert.equal(r.ok, true);
    await sleep(100);
    const wHit = c.waitFor((m) => m.t === 'channel_end', 3000, 'interrupção por dano');
    zone.applyRawDamage(p, 1);
    end = await wHit;
    assert.equal(end.ok, false);
    assert.match(end.reason, /atingido/);
    let j = (await c.request('quests')).journal.active.find((q) => q.id === 'c4_ilda');
    assert.equal(j.objectives[0].cur, 1, 'só o primeiro medidor conta');
    // terceira tentativa sem interrupção conclui
    r = await c.request('interact', { object: 'gauge_2' });
    end = await c.waitFor((m) => m.t === 'channel_end', 4000, 'fim');
    assert.equal(end.ok, true);
    j = (await c.request('quests')).journal.active.find((q) => q.id === 'c4_ilda');
    assert.equal(j.ready, true);
    // sem missão, não canaliza
    r = await c.request('interact', { object: 'gauge_1' });
    assert.equal(r.ok, false);
    void v;
    await c.close();
  });
});

test('escolta da carroça: emboscadas, quebra volta ao marco, chegada conta para o grupo', async () => {
  await withServer(async (server, url) => {
    const pre = [...preOf(server), 'c4_ilda'];
    const a = await hero(server, url, 'esca', 'bastion', 14, pre, ['c4_route']);
    const b = await hero(server, url, 'escb', 'veilsinger', 14, pre, ['c4_route']);
    // grupo
    await a.request('party_invite', { name: b.char.name });
    await b.request('party_accept', { from: a.char.id });
    await a.request('gm', { cmd: 'teleport', x: 30, z: 93.5 });
    const st = await a.request('interact', { object: 'ilda_cart' });
    assert.equal(st.ok, true, st.reason);
    const zone = player(server, a).zone;
    const esc = zone.escorts.get(st.escort);
    assert.ok(esc, 'escolta criada');
    await a.waitFor((m) => m.t === 'snap' && m.ents.some((e) => e.id === esc.eid && e.k === 'e'), 3000, 'carroça no snapshot');
    // sem ninguém por perto, ela não anda
    await a.request('gm', { cmd: 'teleport', x: 20, z: 60 });
    await b.request('gm', { cmd: 'teleport', x: 20, z: 62 });
    const x0 = esc.x;
    await sleep(800);
    assert.ok(Math.abs(esc.x - x0) < 0.2, 'parada sem escolta');
    // acompanha a carroça e derruba os emboscados
    let ambushes = 0, broke = false;
    const follow = setInterval(() => {
      for (const c of [a, b]) {
        const p = player(server, c);
        if (!p || p.char.dead) continue;
        p.char.x = esc.x + (c === a ? 1.5 : -1.5); p.char.z = esc.z + 1;
      }
      for (const m of zone.monsters.values()) if (m.escortTarget === esc.eid && m.state !== 'dead') {
        if (!m.seen) { m.seen = true; ambushes++; }
        zone.damageMonster(m, a.char.id, 9999);
      }
    }, 100);
    try {
      // quebra no meio: volta ao último marco com vida cheia
      await a.waitFor((m) => m.t === 'escort' && m.mark === 2, 60000, 'marco 2');
      const mark2 = esc.points[esc.lastMark];
      esc.damage(esc.hp);
      broke = true;
      await a.waitFor((m) => m.t === 'escort' && /consertada/.test(m.text), 5000, 'conserto');
      assert.ok(Math.hypot(esc.x - mark2.x, esc.z - mark2.z) < 0.01, 'voltou ao marco 2');
      assert.equal(esc.hp, esc.mhp);
      await a.waitFor((m) => m.t === 'escort' && m.arrived, 90000, 'chegada');
    } finally { clearInterval(follow); }
    log(`emboscadas enfrentadas: ${ambushes}${broke ? ', uma quebra' : ''}`);
    assert.ok(ambushes >= 6, 'emboscadas nos três marcos (e de novo depois da quebra)');
    for (const c of [a, b]) {
      const j = (await c.request('quests')).journal.active.find((q) => q.id === 'c4_route');
      assert.equal(j.ready, true, `${c.label}: escolta concluída`);
    }
    await a.close(); await b.close();
  });
});

test('Duas Razões: escolha muda a fala, dá um título e muda a próxima missão', async () => {
  await withServer(async (server, url) => {
    const pre = [...preOf(server), 'c4_ilda', 'c4_route'];
    const c = await hero(server, url, 'razoes', 'warden', 15, pre, ['c4_reasons']);
    const p = player(server, c);
    // antes das medições, Ilda não pergunta nada
    await c.request('gm', { cmd: 'teleport', x: 24, z: 86 });
    let t = await c.request('talk', { npc: 'ilda' });
    assert.equal(t.choice, undefined);
    // medições feitas
    const st = p.char.quests.get('c4_reasons');
    st.progress[0] = ['thermo_1', 'thermo_2', 'thermo_3'];
    t = await c.request('talk', { npc: 'ilda' });
    assert.ok(t.choice, 'Ilda pergunta');
    assert.deepEqual(t.choice.options.map((o) => o.id), ['cautela', 'inverno']);
    const r = await c.request('quest_choice', { quest: 'c4_reasons', option: 'cautela', npc: 'ilda' });
    assert.equal(r.ok, true, r.reason);
    assert.equal(r.title, 'Voz de Vargem Funda');
    assert.match(r.reply, /Não concordo/);
    // não dá para escolher de novo
    assert.equal((await c.request('quest_choice', { quest: 'c4_reasons', option: 'inverno', npc: 'ilda' })).ok, false);
    const done = await c.request('quest_turnin', { quest: 'c4_reasons', npc: 'ilda' });
    assert.equal(done.ok, true, done.reason);
    assert.match(done.dialogue, /devagar/);
    // título aparece no snapshot e na ficha
    await c.waitFor((m) => m.t === 'snap' && c.entity(c.char.eid)?.ttl === 'Voz de Vargem Funda', 3000, 'título no snapshot');
    // a próxima missão oferece a fala da escolha
    t = await c.request('talk', { npc: 'ilda' });
    const offer = t.quests.offer.find((q) => q.id === 'c4_order');
    assert.ok(offer);
    assert.match(offer.dialogue.offer, /cuidado/);
    // persiste
    server.store.saveCharacter(p.char);
    const loaded = server.store.loadCharacter(p.char.id);
    assert.equal(loaded.title, 'Voz de Vargem Funda');
    assert.deepEqual(loaded.choices, { duas_razoes: 'cautela' });
    await c.close();
  });
});
