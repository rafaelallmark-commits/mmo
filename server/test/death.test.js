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

test('qualquer aliado levanta um caído canalizando 5 s fora de combate (20% de vida); sem ajuda, volta sozinho ao posto', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cinzas-revive-'));
  const server = new GameServer({ port: 0, host: '127.0.0.1', dbPath: join(dir, 'r.db'), log: false, seed: 8 });
  const port = await server.start();
  try {
    const enter = async (acc, name, classId) => {
      const c = new SimClient(acc);
      await c.connect(`ws://127.0.0.1:${port}`);
      await c.request('register', { account: acc, password: 'senha123' });
      await c.request('login', { account: acc, password: 'senha123' });
      const { char } = await c.request('create_char', { name, classId });
      await c.request('enter', { charId: char.id });
      return { c, p: server.zone.players.get(char.id) };
    };
    const { p: caido } = await enter('rv_caido', 'Tombado', 'breaker');
    const { c: amigo, p: pa } = await enter('rv_amigo', 'Socorro', 'warden'); // nem precisa ser do grupo
    caido.char.x = 60; caido.char.z = 50; pa.char.x = 61.5; pa.char.z = 50; pa.dest = null;
    server.zone.killPlayer(caido);
    // longe demais
    pa.char.x = 70;
    assert.equal((await amigo.request('revive_ally', { name: 'Tombado' })).code, 'too_far');
    pa.char.x = 61.5;
    // em combate
    pa.lastCombatAt = server.zone.now;
    assert.equal((await amigo.request('revive_ally', { name: 'Tombado' })).code, 'in_combat');
    pa.lastCombatAt = -1e9;
    // ser atingido interrompe
    let r = await amigo.request('revive_ally', { name: 'Tombado' });
    assert.equal(r.ok, true, r.reason);
    assert.equal(r.channel.ms, 5000);
    pa.lastHitAt = server.zone.now + 1;
    const cut = await amigo.waitFor((m) => m.t === 'channel_end' && !m.ok, 3000, 'interrompido');
    assert.match(cut.reason, /atingido/);
    assert.equal(caido.char.dead, true);
    // canalização completa: levanta com 20% da vida
    pa.lastHitAt = -1;
    r = await amigo.request('revive_ally', { name: 'Tombado' });
    assert.equal(r.ok, true, r.reason);
    await amigo.waitFor((m) => m.t === 'channel_end' && m.ok, 8000, 'canalização concluída');
    assert.equal(caido.char.dead, false, 'levantado');
    assert.equal(caido.char.hp, Math.round(caido.stats.maxHp * 0.2));
    assert.ok(Math.hypot(caido.char.x - 60, caido.char.z - 50) < 0.5, 'levanta onde caiu, não no posto');
    assert.equal((await amigo.request('revive_ally', { name: 'Tombado' })).code, 'not_dead');
    // sem ajuda: volta sozinho ao posto depois de death.corpseTimeoutMs
    server.zone.killPlayer(caido);
    server.zone.now += server.data.formulas.death.corpseTimeoutMs;
    server.zone.tick(100);
    assert.equal(caido.char.dead, false, 'voltou sozinho');
    const gp = server.data.maps.estrada_velha.guardPost;
    assert.ok(Math.hypot(caido.char.x - gp.x, caido.char.z - gp.z) < 4, 'no posto de guarda');
  } finally { await server.stop(); rmSync(dir, { recursive: true, force: true }); }
});

test('comando de mestre hp (cenário, D186): 0 derruba como um golpe final e o renascer volta ao posto; fora do --dev, só administrador', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cinzas-death-hp-'));
  const server = new GameServer({ port: 0, host: '127.0.0.1', dbPath: join(dir, 'h.db'), log: false, seed: 7, dev: true, rateLimit: 1000, rateBurst: 1000 });
  const port = await server.start();
  try {
    const c = new SimClient('H');
    await c.connect(`ws://127.0.0.1:${port}`);
    await c.request('register', { account: 'vida_gm', password: 'senha123' });
    await c.request('login', { account: 'vida_gm', password: 'senha123' });
    const { char } = await c.request('create_char', { name: 'Vidinha', classId: 'warden' });
    await c.request('enter', { charId: char.id });
    const p = server.playerOf(char.id);
    assert.equal((await c.request('gm', { cmd: 'hp', value: -1 })).code, 'bad_request');
    let r = await c.request('gm', { cmd: 'hp', value: 7 });
    assert.equal(r.ok, true, r.reason);
    assert.equal(p.char.hp, 7);
    assert.equal(server.store.loadCharacter(char.id).hp, 7, 'vida gravada');
    // longe do posto, cai: evento player_dead e caído no snapshot, como um golpe final de monstro
    await c.request('gm', { cmd: 'teleport', x: 60, z: 50 });
    const deadEv = c.waitFor((m) => m.t === 'player_dead' && m.eid === p.eid, 3000, 'player_dead');
    r = await c.request('gm', { cmd: 'hp', value: 0 });
    assert.equal(r.ok, true, r.reason);
    await deadEv;
    assert.equal(p.char.dead, true);
    await c.waitFor((m) => m.t === 'snap' && m.ents.find((e) => e.id === p.eid)?.dead === true, 3000, 'snapshot caído');
    assert.equal((await c.request('gm', { cmd: 'hp', value: 0 })).code, 'dead', 'caído não cai de novo');
    // renascer: evento respawn com o lugar novo (no posto), longe de onde caiu
    const back = c.waitFor((m) => m.t === 'respawn' && m.eid === p.eid, 3000, 'respawn');
    assert.equal((await c.request('respawn')).ok, true);
    const ev = await back;
    const gp = server.data.maps.estrada_velha.guardPost;
    assert.ok(Math.hypot(ev.x - gp.x, ev.z - gp.z) < 4, 'renasce no posto');
    assert.ok(Math.hypot(ev.x - 60, ev.z - 50) > 7, 'longe de onde caiu (o cliente desfaz e forma o corpo)');
    c.ws.close();
  } finally {
    await server.stop().catch(() => {});
    rmSync(dir, { recursive: true, force: true });
  }
  // servidor de produção: conta comum não usa comando de mestre; gm modera mas não mexe na vida
  const dir2 = mkdtempSync(join(tmpdir(), 'cinzas-death-hp2-'));
  const prod = new GameServer({ port: 0, host: '127.0.0.1', dbPath: join(dir2, 'h2.db'), log: false, seed: 7, rateLimit: 1000, rateBurst: 1000 });
  const port2 = await prod.start();
  try {
    const c = new SimClient('H2');
    await c.connect(`ws://127.0.0.1:${port2}`);
    await c.request('register', { account: 'vida_comum', password: 'senha123' });
    await c.request('login', { account: 'vida_comum', password: 'senha123' });
    const { char } = await c.request('create_char', { name: 'Comum', classId: 'warden' });
    await c.request('enter', { charId: char.id });
    assert.equal((await c.request('gm', { cmd: 'hp', value: 0 })).code, 'forbidden');
    const s = prod.byChar.get(char.id);
    s.role = 'gm';
    assert.equal((await c.request('gm', { cmd: 'hp', value: 0 })).code, 'forbidden', 'gm não usa comando de cenário');
    assert.equal(prod.playerOf(char.id).char.dead, false);
    c.ws.close();
  } finally {
    await prod.stop().catch(() => {});
    rmSync(dir2, { recursive: true, force: true });
  }
});
