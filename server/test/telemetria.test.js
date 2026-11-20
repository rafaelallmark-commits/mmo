// Telemetria do teste público (D171): mortes, fim de sessão, missões aceitas e tentativas do calabouço
// vão para a auditoria, e `npm run telemetria` as resume ao lado do tempo por nível.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { GameServer } from '../src/server.js';
import { loadGameData } from '../src/data.js';
import { createStore } from '../src/db.js';
import { Zone } from '../src/zone.js';
import { Dungeon } from '../src/dungeon.js';
import { makeRng } from '../src/rng.js';
import { auditReport } from '../tools/lib/telemetria-auditoria.mjs';
import { SimClient, sleep } from './helpers/client.js';

const data = loadGameData();

test('telemetria: morte, fim de sessão e missão aceita vão para a auditoria e para o relatório', { timeout: 60000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cinzas-tel-'));
  const db = join(dir, 't.db');
  const server = new GameServer({ port: 0, host: '127.0.0.1', dbPath: db, seed: 31, log: false, dev: true });
  const port = await server.start();
  try {
    const c = new SimClient('tel');
    await c.connect(`ws://127.0.0.1:${port}`);
    await c.request('register', { account: 'telemetria', password: 'senha123' });
    await c.request('login', { account: 'telemetria', password: 'senha123' });
    const { char } = await c.request('create_char', { name: 'Medido', classId: 'warden' });
    await c.request('enter', { charId: char.id });
    const mara = server.data.maps.estrada_velha.npcs.find((n) => n.id === 'mara');
    await c.request('gm', { cmd: 'teleport', x: mara.x - 1, z: mara.z });
    const acc = await c.request('quest_accept', { quest: 'tutorial', npc: 'mara' });
    assert.equal(acc.ok, true, acc.reason);
    // morre para um rato, com dois monstros em cima
    const p = server.zone.players.get(char.id);
    const rats = [...server.zone.monsters.values()].filter((m) => m.defId === 'furrow_rat').slice(0, 2);
    for (const m of rats) { m.state = 'chase'; m.targetId = p.eid; }
    server.zone.damagePlayer(p, p.char.hp + 999, rats[0]);
    assert.equal(p.char.dead, true);
    await c.close();
    await sleep(150);
    const death = JSON.parse(server.store.auditTail(5, 'death')[0].data_json);
    assert.equal(death.by, 'furrow_rat');
    assert.equal(death.attackers, 2);
    assert.equal(death.map, 'estrada_velha');
    assert.equal(death.classId, 'warden');
    const sessRow = server.store.auditTail(5, 'session_end')[0];
    const sess = JSON.parse(sessRow.data_json);
    assert.equal(sessRow.char_id, char.id, 'o personagem vai na coluna char_id');
    assert.equal(sess.dead, true);
    assert.equal(sess.map, 'estrada_velha');
    assert.ok(server.store.auditTail(5, 'quest_accept').some((r) => JSON.parse(r.data_json).quest === 'tutorial'));
  } finally { await server.stop(); }
  // o relatório lê o banco (só leitura) e resume
  const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', new URL('../tools/telemetria.mjs', import.meta.url).pathname, '--db', db], { encoding: 'utf8', timeout: 20000 });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /## Mortes\n\n1 mortes/);
  assert.match(r.stdout, /Último golpe:\*\* furrow_rat \(1\)/);
  assert.match(r.stdout, /\| tutorial \| 1 \| 0 \| 0% \|/);
  assert.match(r.stdout, /1 sessões de 1 personagens/);
  rmSync(dir, { recursive: true, force: true });
});

test('telemetria: o calabouço avisa começo de tentativa, queda do grupo e vitória', () => {
  const store = createStore(':memory:');
  const zone = new Zone({ mapId: 'ultima_eclusa', data, store, rng: makeRng(4), send: () => {}, broadcast: () => {} });
  const events = [];
  const dg = new Dungeon({ key: 'dungeon:t', zone, partyId: 'g', members: [1, 2], data, onlineCount: () => 2, onEvent: (kind, d) => events.push([kind, d]) });
  assert.deepEqual(events[0][0], 'start');
  assert.equal(events[0][1].attempt, 1);
  dg.wipe('Todos caíram.');
  assert.ok(events.some(([k, d]) => k === 'wipe' && d.reason === 'Todos caíram.'));
  dg.victory();
  assert.ok(events.some(([k]) => k === 'victory'));
  // e o relatório conta
  const rows = events.map(([result, d], i) => ({ at: i, kind: 'dungeon', char_id: null, data_json: JSON.stringify({ result, ...d }) }));
  const md = auditReport(rows);
  assert.match(md, /tentativas, 1 quedas e 1 vitórias/);
});

test('telemetria: economia soma o ouro que entra e que sai por origem; desistência pelo último dia jogado', () => {
  const day = 86400000;
  const rows = [
    { at: 0, kind: 'loot', char_id: 1, data_json: JSON.stringify({ gold: 30 }) },
    { at: 1, kind: 'quest_reward', char_id: 1, data_json: JSON.stringify({ quest: 'c1_count', gold: 20 }) },
    { at: 2, kind: 'sell', char_id: 1, data_json: JSON.stringify({ gold: 5 }) },
    { at: 3, kind: 'buy', char_id: 1, data_json: JSON.stringify({ cost: 40 }) },
    { at: 4, kind: 'enhance', char_id: 1, data_json: JSON.stringify({ gold: 12 }) },
    { at: 5, kind: 'session_end', char_id: 1, data_json: JSON.stringify({ level: 4, map: 'estrada_velha', sessionS: 1800 }) },
    { at: 10 * day, kind: 'session_end', char_id: 2, data_json: JSON.stringify({ level: 9, map: 'oficina_soterrada', sessionS: 600 }) },
  ];
  const md = auditReport(rows, { now: 11 * day, parouDias: 3 });
  assert.match(md, /Entrou 55 \(saque 30, missões 20, vendas 5\); saiu 52/);
  assert.match(md, /Sem voltar há mais de 3 dias: 1 personagens/);
  assert.match(md, /Nível em que pararam:\*\* nível 4 \(1\)/);
});
