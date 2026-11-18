// Queda de conexão durante a morte: o servidor grava "caído" e, ao voltar, restaura o
// personagem no posto de guarda com 50% de vida.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GameServer } from '../src/server.js';
import { SimClient } from './helpers/client.js';

test('personagem que cai e desconecta volta no posto com 50% de vida', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cinzas-death-'));
  const server = new GameServer({ port: 0, host: '127.0.0.1', dbPath: join(dir, 'd.db'), log: false, seed: 7 });
  const port = await server.start();
  try {
    const c = new SimClient('D');
    await c.connect(`ws://127.0.0.1:${port}`);
    await c.request('register', { account: 'morte', password: 'senha123' });
    await c.request('login', { account: 'morte', password: 'senha123' });
    const { char } = await c.request('create_char', { name: 'Caido', classId: 'breaker' });
    const enter = await c.request('enter', { charId: char.id });
    // move para longe do posto e morre ali (simula o golpe final de um monstro)
    const p = server.zone.players.get(char.id);
    p.char.x = 100; p.char.z = 40;
    server.zone.killPlayer(p);
    const dead = await c.waitFor((m) => m.t === 'snap' && m.ents.find((e) => e.id === enter.char.eid)?.dead === true, 3000, 'snapshot caído');
    assert.ok(dead);
    await c.close(); // conexão cai enquanto está caído
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(server.store.loadCharacter(char.id).dead, true, 'estado caído gravado');

    const c2 = new SimClient('D2');
    await c2.connect(`ws://127.0.0.1:${port}`);
    await c2.request('login', { account: 'morte', password: 'senha123' });
    const back = await c2.request('enter', { charId: char.id });
    assert.equal(back.ok, true);
    assert.equal(back.restoredFromDeath, true);
    assert.equal(back.char.dead, false);
    const gp = server.data.maps.estrada_velha.guardPost;
    assert.ok(Math.hypot(back.char.x - gp.x, back.char.z - gp.z) < 4, 'no posto de guarda');
    assert.equal(back.char.hp, Math.round(back.char.stats.maxHp * 0.5));
    await c2.close();
  } finally {
    await server.stop();
    rmSync(dir, { recursive: true, force: true });
  }
});
