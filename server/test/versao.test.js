// Versões identificáveis no teste público (D150): a release grava a tag na imagem (CINZAS_VERSION) e o
// servidor a manda no hello, no log de início e no /bug com o sufixo inteiro (0.4.0-teste.2 não vira 0.4.0);
// o /bug guarda também a versão inteira do cliente. Sem a variável vale a do package.json, e um valor que
// não parece uma tag (espaço, aspas, comprido demais) não deixa o servidor subir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import WebSocket from 'ws';
import { GameServer, deploymentVersion } from '../src/server.js';
import { SimClient } from './helpers/client.js';

const PKG_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const MAIN = new URL('../src/main.js', import.meta.url).pathname;
// processo do servidor sem os segredos do ambiente de quem roda os testes
const childEnv = (extra) => ({ ...process.env, CINZAS_TOKEN_SECRET: '', CINZAS_WORLD_SECRET: '', CINZAS_VERSION: '', ...extra });

// a primeira mensagem de toda conexão é o hello
function hello(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => { ws.terminate(); reject(new Error('sem hello')); }, 5000);
    ws.once('message', (b) => { clearTimeout(timer); ws.close(); resolve(JSON.parse(b.toString())); });
    ws.once('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

// sobe src/main.js numa porta livre, devolve o hello e o log de início, e desliga com Ctrl+C (salva e sai)
async function helloFromProcess(env) {
  const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', MAIN, '--host', '127.0.0.1', '--port', '0', '--db', ':memory:'], { env: childEnv(env), stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  const exited = new Promise((r) => child.on('exit', (code) => r(code)));
  try {
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`o servidor não subiu: ${out}`)), 15_000);
      const onData = (b) => {
        out += b.toString();
        const m = /servidor ouvindo em ws:\/\/[^:\s]+:(\d+)/.exec(out);
        if (m) { clearTimeout(timer); resolve(Number(m[1])); }
      };
      child.stdout.on('data', onData);
      child.stderr.on('data', onData);
      exited.then((code) => { clearTimeout(timer); reject(new Error(`o servidor saiu (código ${code}): ${out}`)); });
    });
    return { hello: await hello(`ws://127.0.0.1:${port}`), log: out };
  } finally {
    child.kill('SIGINT');
    await exited;
  }
}

test('versão da release no hello e no /bug com o sufixo; o /bug guarda a versão inteira do cliente', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cinzas-versao-'));
  const server = new GameServer({ port: 0, host: '127.0.0.1', dbPath: join(dir, 'v.db'), seed: 7, log: false, version: '0.4.0-teste.2' });
  const port = await server.start();
  const url = `ws://127.0.0.1:${port}`;
  try {
    const h = await hello(url);
    assert.equal(h.version, '0.4.0-teste.2', 'a tag inteira, não só 0.4.0');
    assert.equal(h.protocol, 3);
    const c = new SimClient('versao');
    await c.connect(url);
    await c.request('register', { account: 'testadora', password: 'senha123' });
    assert.equal((await c.request('login', { account: 'testadora', password: 'senha123' })).ok, true);
    const ch = (await c.request('create_char', { name: 'Testadora', classId: 'breaker' })).char;
    assert.equal((await c.request('enter', { charId: ch.id })).ok, true);
    const r = await c.request('bug_report', { text: 'a ponte sumiu quando cheguei ao posto', client: '0.4.0-teste.2' });
    assert.equal(r.ok, true, r.reason);
    const bug = JSON.parse(server.store.auditTail(5, 'bug_report')[0].data_json);
    assert.equal(bug.client, '0.4.0-teste.2', 'versão do cliente inteira, com o sufixo');
    assert.equal(bug.server, '0.4.0-teste.2', 'versão do servidor vinda da release');
    assert.match(bug.data, /^[0-9a-f]{12}$/, 'e a dos dados');
    await c.close();
  } finally { await server.stop(); rmSync(dir, { recursive: true, force: true }); }
});

test('sem a versão da release vale a do package.json; valor que não parece tag é recusado', () => {
  for (const empty of [undefined, null, '', '   ']) assert.equal(deploymentVersion(empty), PKG_VERSION);
  for (const ok of ['0.4.0', '0.4.0-teste.2', '0.0.0-dev.1a2b3c4', '1.2.3+build.7', ' 0.4.0-teste.2 ']) assert.equal(deploymentVersion(ok), ok.trim());
  for (const bad of ['0.4.0 teste', '0.4.0"', '-0.4.0', '.4', '0.4.0;id', 'v0.4/0', 'x'.repeat(65), '0.4.0\u001b[2K']) {
    assert.throws(() => deploymentVersion(bad), /versão inválida em CINZAS_VERSION/, bad);
  }
});

test('src/main.js lê CINZAS_VERSION do ambiente (a imagem da release traz a tag) e recusa valor inválido', async () => {
  const withTag = await helloFromProcess({ CINZAS_VERSION: '9.9.9-teste.1' });
  assert.equal(withTag.hello.version, '9.9.9-teste.1');
  assert.match(withTag.log, /CINZAS DO MERIDIANO 9\.9\.9-teste\.1 — servidor ouvindo/, 'o log de início mostra a versão');
  const withoutTag = await helloFromProcess({});
  assert.equal(withoutTag.hello.version, PKG_VERSION, 'sem a variável, a do package.json');
  const bad = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', MAIN, '--host', '127.0.0.1', '--port', '0', '--db', ':memory:'],
    { encoding: 'utf8', timeout: 20_000, env: childEnv({ CINZAS_VERSION: '0.4.0 "teste"' }) });
  assert.equal(bad.status, 2, bad.stderr);
  assert.match(bad.stderr, /versão inválida em CINZAS_VERSION/);
});
