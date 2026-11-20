// Snapshots por diferença e interesse (M4): o estado reconstruído pelo cliente tem que bater com o
// snapshot completo, quem sai do raio de 70 m some, a troca de zona recomeça o conjunto e a
// previsão por velocidade mantém o erro de posição abaixo de 10 cm.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GameServer } from '../src/server.js';
import { SimClient, sleep } from './helpers/client.js';

async function withServer(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'cinzas-snap-'));
  const server = new GameServer({ port: 0, host: '127.0.0.1', dbPath: join(dir, 's.db'), seed: 77, dev: true, log: false });
  const port = await server.start();
  try { await fn(server, `ws://127.0.0.1:${port}`); } finally { await server.stop().catch(() => {}); rmSync(dir, { recursive: true, force: true }); }
}

async function enter(url, label, classId, delta) {
  const c = new SimClient(label, { delta });
  await c.connect(url);
  await c.request('register', { account: `s_${label}`, password: 'senha123' });
  await c.request('login', { account: `s_${label}`, password: 'senha123' });
  const r = await c.request('create_char', { name: `S${label}`, classId });
  const e = await c.request('enter', { charId: r.char.id });
  assert.equal(e.ok, true, e.reason);
  return c;
}

const sameSnap = (snapA, snapB) => snapA.now === snapB.now;

test('snapshots por diferença reconstroem o mesmo estado do snapshot completo', async () => {
  await withServer(async (server, url) => {
    const full = await enter(url, 'full', 'breaker', false);
    const delta = await enter(url, 'delta', 'warden', true);
    const other = await enter(url, 'outro', 'pikeman', true);
    // movimento e combate perto do posto para gerar mudanças de posição, velocidade e vida
    const zone = server.zones.get('estrada_velha');
    const meO = zone.players.get(other.char.id);
    await other.request('move', { x: meO.char.x + 12, z: meO.char.z + 6 });
    await full.request('move', { x: zone.players.get(full.char.id).char.x - 8, z: zone.players.get(full.char.id).char.z + 3 });
    let compared = 0, worst = 0;
    for (let i = 0; i < 25; i++) {
      // espera um snapshot do mesmo instante nos dois clientes
      const a = await full.waitFor((m) => m.t === 'snap', 3000, 'snap completo');
      const b = await delta.waitFor((m) => m.t === 'snap' && m.now === a.now, 3000, 'snap por diferença');
      const me = delta.entity(delta.char.eid) ?? full.entity(delta.char.eid);
      assert.ok(me, 'o próprio personagem aparece');
      const byId = new Map(delta.snap.ents.map((e) => [e.id, e]));
      for (const e of a.ents) {
        const inRange = Math.hypot(e.x - me.x, e.z - me.z) <= 70;
        const d = byId.get(e.id);
        if (!inRange) continue;
        assert.ok(d, `${e.id} dentro do raio precisa estar no estado reconstruído`);
        for (const k of ['k', 'hp', 'mhp', 'lvl', 'dead', 'tgt', 'st', 'n', 'cls', 'w', 'party', 'sh', 'def', 'vx', 'vz']) {
          if (k in e) assert.deepEqual(d[k], e[k], `${e.id}.${k}`);
        }
        const err = Math.hypot(d.x - e.x, d.z - e.z);
        worst = Math.max(worst, err);
        assert.ok(err <= 0.11, `${e.id}: erro de posição ${err.toFixed(3)} m`);
        compared++;
      }
      assert.ok(sameSnap(a, delta.snap));
    }
    console.log(`   · ${compared} comparações de entidade; maior erro de posição ${worst.toFixed(3)} m`);
    assert.ok(compared > 100);
    for (const c of [full, delta, other]) await c.close();
  });
});

test('quem sai do raio de interesse some; troca de zona recomeça com "full"', async () => {
  await withServer(async (server, url) => {
    const a = await enter(url, 'raio_a', 'breaker', true);
    const b = await enter(url, 'raio_b', 'warden', true);
    await a.waitFor((m) => m.t === 'snap' && a.entity(b.char.eid), 3000, 'b visível para a');
    // b vai para longe (mais de 70 m) dentro do mesmo mapa
    const zone = server.zones.get('estrada_velha');
    const pb = zone.players.get(b.char.id);
    const pa = zone.players.get(a.char.id);
    const far = zone.nav.nearestFree(pa.char.x + 95, pa.char.z, 10) ?? zone.nav.nearestFree(pa.char.x - 95, pa.char.z, 10);
    assert.ok(far, 'ponto livre distante');
    pb.char.x = far.x; pb.char.z = far.z;
    const m = await a.waitFor((x) => x.t === 'snap' && x.gone?.includes(b.char.eid), 3000, 'b em "gone"');
    assert.equal(a.entity(b.char.eid), null);
    // volta para perto: reaparece com todos os campos
    pb.char.x = pa.char.x + 2; pb.char.z = pa.char.z + 1;
    await a.waitFor((x) => x.t === 'snap' && a.entity(b.char.eid)?.n === b.char.name, 3000, 'b de volta com nome');
    // troca de zona: primeiro snapshot por diferença vem com "full"
    server.moveToZone(pa, 'brejo_bombas', 20, 20);
    const z = await a.waitFor((x) => x.t === 'zone', 3000, 'zone');
    assert.equal(z.mapId, 'brejo_bombas');
    const f = await a.waitFor((x) => x.t === 'snap' && x.map === 'brejo_bombas', 3000, 'snap do brejo');
    assert.equal(f.full, 1);
    assert.ok(a.entity(a.char.eid), 'o próprio personagem no novo mapa');
    assert.equal(a.entity(b.char.eid), null, 'quem ficou no outro mapa não aparece');
    void m;
    await a.close(); await b.close();
  });
});

test('snapshot por diferença é bem menor que o completo com muitos jogadores parados', async () => {
  await withServer(async (server, url) => {
    const clients = [];
    for (let i = 0; i < 12; i++) clients.push(await enter(url, `m${i}`, 'breaker', i === 0));
    const full = clients[1];
    let fullBytes = 0, deltaBytes = 0;
    const onFull = (buf) => { if (buf.toString().startsWith('{"t":"snap"')) fullBytes += buf.length; };
    const onDelta = (buf) => { if (buf.toString().startsWith('{"t":"snap"')) deltaBytes += buf.length; };
    await sleep(500);
    full.ws.on('message', onFull);
    clients[0].ws.on('message', onDelta);
    await sleep(2000);
    console.log(`   · 2 s com 12 jogadores: completo ${fullBytes} B, por diferença ${deltaBytes} B`);
    assert.ok(deltaBytes * 4 < fullBytes, 'pelo menos 4× menor');
    for (const c of clients) await c.close();
  });
});
