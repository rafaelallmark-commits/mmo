// Teste de fumaça da implantação (tools/fumaca-deploy.mjs, docs/10-subir-no-vps.md): a ferramenta que o dono
// roda no VPS, aqui contra uma zona (--auth token) e um serviço de contas de verdade, com o e-mail no modo
// "arquivo". Confere o fluxo inteiro (cadastro, código lido do e-mail, sessão, zona, personagem, combate, saque,
// ouro, equipamento, missão, saída e a volta igual), o --conferir depois de reiniciar a zona, a recusa de um
// retrato que não bate e o --excluir no fim.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GameServer } from '../src/server.js';
import { AccountsService } from '../src/contas.js';
import { codeFromDir, comparePortraits, endpoints, portrait } from '../tools/fumaca-deploy.mjs';

const TOOL = join(dirname(fileURLToPath(import.meta.url)), '..', 'tools', 'fumaca-deploy.mjs');
const SECRET = 'segredo-de-teste-da-fumaca-0123456789';

// a ferramenta roda em outro processo (o laço deste segue servindo zona e contas)
function runTool(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', TOOL, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    const timer = setTimeout(() => child.kill('SIGKILL'), 150_000);
    child.on('exit', (code) => { clearTimeout(timer); resolve({ code, out }); });
  });
}

test('partes da ferramenta: endereços deduzidos, código lido do e-mail e retrato comparado', () => {
  assert.deepEqual(endpoints({ url: 'https://jogo.exemplo.com.br' }), { site: 'https://jogo.exemplo.com.br', contas: 'https://jogo.exemplo.com.br/contas', ws: 'wss://jogo.exemplo.com.br' });
  assert.deepEqual(endpoints({ url: 'http://127.0.0.1:8080/', ws: 'ws://127.0.0.1:7777' }), { site: 'http://127.0.0.1:8080', contas: 'http://127.0.0.1:8080/contas', ws: 'ws://127.0.0.1:7777' });
  assert.throws(() => endpoints({}), /--url/);
  const dir = mkdtempSync(join(tmpdir(), 'cinzas-fumaca-eml-'));
  try {
    const eml = (to, text) => `From: J <j@x.com>\r\nTo: ${to}\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from(text).toString('base64').replace(/.{76}/g, '$&\r\n')}`;
    const now = Date.now();
    writeFileSync(join(dir, `${now - 600_000}-aaaa.eml`), eml('a@x.com', 'Seu código é 111111.'));
    writeFileSync(join(dir, `${now}-bbbb.eml`), eml('b@x.com', 'Seu código é 222222.'));
    writeFileSync(join(dir, `${now + 1}-cccc.eml`), eml('a@x.com', 'Olá!\n\nSeu código de confirmação é 333333. Ele vale por 30 minutos.'));
    assert.equal(codeFromDir(dir, 'a@x.com', now), '333333', 'o mais novo para o endereço');
    assert.equal(codeFromDir(dir, 'b@x.com', now), '222222');
    assert.equal(codeFromDir(dir, 'a@x.com', now + 60_000), null, 'nada mais novo que o pedido');
    assert.equal(codeFromDir(join(dir, 'nao-existe'), 'a@x.com'), null);
  } finally { rmSync(dir, { recursive: true, force: true }); }
  const char = { id: 7, name: 'Teste', mapId: 'estrada_velha', x: 22, z: 51, level: 1, xp: 5, gold: 3, items: [{ id: 'b', defId: 'axe_2h_t1', qty: 1, enh: 0, loc: 'equip', slot: 'weapon' }, { id: 'a', defId: 'potion_hp_s', qty: 5, enh: 0, loc: 'bag', slot: null }] };
  const journal = { active: [{ id: 'tutorial', state: 'active', objectives: [{ done: false, cur: 0, need: 1, text: 'x', hint: 'y' }] }], done: [] };
  const p = portrait(char, journal);
  assert.deepEqual(comparePortraits(p, portrait({ ...char, x: 22.3 }, journal)), [], 'posição aceita 0,5 m');
  const moved = { ...char, x: 30, gold: 4, items: [char.items[1]] };
  const diff = comparePortraits(p, portrait(moved, { active: [], done: [] }));
  assert.ok(diff.some((d) => /^gold: esperado 3, veio 4/.test(d)), diff.join('\n'));
  assert.ok(diff.some((d) => /^posição/.test(d)));
  assert.ok(diff.some((d) => /axe_2h_t1.*sumiu/.test(d)));
  assert.ok(diff.some((d) => /^missões/.test(d)));
});

test('fumaça da implantação: conta nova até a volta igual, --conferir depois de reiniciar a zona, retrato que não bate e --excluir', { timeout: 300_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cinzas-fumaca-'));
  const dbPath = join(dir, 'f.db');
  const mails = join(dir, 'emails');
  const state = join(dir, 'fumaca.json');
  let zone = new GameServer({ port: 0, host: '127.0.0.1', dbPath, seed: 11, timeScale: 2, log: false, auth: 'token', tokenSecret: SECRET });
  const accounts = new AccountsService({ port: 0, dbPath, tokenSecret: SECRET, log: false, mail: { kind: 'arquivo', dir: mails } });
  try {
    let zport = await zone.start();
    const cport = await accounts.start();
    const base = ['--contas', `http://127.0.0.1:${cport}`, '--ws', `ws://127.0.0.1:${zport}`];
    let r = await runTool([...base, '--email', 'fumaca@exemplo.com', '--codigos-dir', mails, '--estado', state]);
    assert.equal(r.code, 0, r.out);
    for (const re of [/ok  1\. cadastro da conta fumaca_[0-9a-f]{8} com o e-mail fumaca@exemplo.com/, /ok  2\. código de confirmação recebido — \d{6}, lido do e-mail/,
      /ok  3\. e-mail confirmado/, /login "token"/, /ok  8\. derrotou um Rato de Sulco/, /coletou o saque e ganhou ouro — .*ouro 0 → \d+/, /equipou uma arma da bolsa — Machado de Lenhador/,
      /aceitou uma missão/, /conexão nova: o personagem voltou igual/, /retrato guardado/, /TUDO CERTO/]) assert.match(r.out, re);
    assert.doesNotMatch(r.out, /página do jogo/, 'sem --url, a página e as métricas não são conferidas');
    const saved = JSON.parse(readFileSync(state, 'utf8'));
    assert.match(saved.conta, /^fumaca_/);
    assert.ok(saved.retrato.gold > 0);
    assert.ok(saved.retrato.items.some((i) => i.defId === 'axe_2h_t1' && i.loc === 'equip'));
    assert.ok(saved.retrato.quests.some((q) => q.id === 'tutorial'));

    // reinício da zona (o mesmo banco): o personagem continua como foi guardado
    await zone.stop();
    zone = new GameServer({ port: 0, host: '127.0.0.1', dbPath, seed: 12, timeScale: 2, log: false, auth: 'token', tokenSecret: SECRET });
    zport = await zone.start();
    const base2 = ['--contas', `http://127.0.0.1:${cport}`, '--ws', `ws://127.0.0.1:${zport}`];
    r = await runTool(['--conferir', state, ...base2]);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /voltou igual .* — em \(22, 51\) de estrada_velha/);

    // retrato que não bate: falha com a diferença e código 1
    writeFileSync(state, JSON.stringify({ ...saved, retrato: { ...saved.retrato, gold: saved.retrato.gold + 1 } }));
    r = await runTool(['--conferir', state, ...base2]);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, new RegExp(`FALHOU 3\\..*gold: esperado ${saved.retrato.gold + 1}, veio ${saved.retrato.gold}`, 's'));

    // a última conferência exclui a conta e apaga o arquivo
    writeFileSync(state, JSON.stringify(saved));
    r = await runTool(['--conferir', state, ...base2, '--excluir']);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /conta de teste excluída — sessão recusada depois/);
    assert.equal(existsSync(state), false);
    assert.ok(!accounts.store.findAccount(saved.conta), 'a conta não existe mais');

    // e-mail que não sai (senha do SMTP recusada, porta bloqueada): falha no cadastro, já dizendo onde olhar
    const broken = new AccountsService({ port: 0, dbPath, tokenSecret: SECRET, log: false, mailer: { send: async () => { throw new Error('SMTP 535: senha recusada'); } } });
    const bport = await broken.start();
    try {
      r = await runTool(['--contas', `http://127.0.0.1:${bport}`, '--ws', `ws://127.0.0.1:${zport}`, '--email', 'semcorreio@exemplo.com', '--codigos-dir', mails]);
      assert.equal(r.code, 1, r.out);
      assert.match(r.out, /FALHOU 1\. cadastro .*o e-mail com o código NÃO saiu: docker compose logs contas/);
    } finally { await broken.stop(); }

    // opção errada: código 2, sem tocar em nada
    r = await runTool(['--url', 'https://x', '--emial', 'a@b.c']);
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, /opção desconhecida: --emial/);
  } finally {
    await zone.stop().catch(() => {});
    await accounts.stop().catch(() => {});
    rmSync(dir, { recursive: true, force: true });
  }
});
