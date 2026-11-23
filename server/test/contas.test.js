// Serviço de contas depois do cadastro: confirmar o e-mail a qualquer momento (código pedido de novo, código
// próprio na recusa do login), conta nunca confirmada que expira em 7 dias, limites de e-mail e de tentativas
// de código por conta e por endereço (no banco: valem depois de reiniciar), aceite dos termos gravado na conta
// antes do e-mail e novo aceite quando a versão dos termos sobe.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { GameServer } from '../src/server.js';
import { AccountsService, TERMS_VERSION, MAIL_PER_DAY, CODE_FAILS_PER_DAY } from '../src/contas.js';
import { SimClient } from './helpers/client.js';

const SECRET = 'segredo-de-teste-0123456789';
const DAY = 86400000;
const SENHA = 'senha-forte-1';

function tmp(prefix) { return mkdtempSync(join(tmpdir(), prefix)); }

async function post(port, path, body) {
  const r = await fetch(`http://127.0.0.1:${port}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, ...(await r.json()) };
}

const codeOf = (m) => /(\d{6})/.exec(m.text)[1];
const wrongFor = (c) => (c === '000000' ? '111111' : '000000');

// "o tempo passa" para os limites: recua os eventos anotados no banco (e-mails mandados e códigos errados)
const passa = (st, ms) => st.db.prepare('UPDATE account_events SET at = at - ?').run(ms);

// Serviço de contas num banco temporário, com os e-mails em memória (o limite por IP fica folgado: os limites
// testados aqui são os por conta e por endereço).
async function startAccounts(dbPath, opts = {}) {
  const mails = [];
  const svc = new AccountsService({ port: 0, dbPath, tokenSecret: SECRET, log: false, perIpPerMin: 1000, mailer: { send: async (m) => { mails.push(m); return 'mem'; } }, ...opts });
  const port = await svc.start();
  return { svc, port, mails };
}

test('confirmar o e-mail depois: login recusado com o código "confirmar", novo código por /contas/reenviar; a troca de senha também confirma', async () => {
  const dir = tmp('cinzas-conf-');
  const { svc, port, mails } = await startAccounts(join(dir, 'c.db'));
  try {
    let r = await post(port, '/contas', { conta: 'tarde', email: 'tarde@exemplo.com', senha: SENHA, aceite: true });
    assert.equal(r.status, 201, r.erro);
    // fechou o jogo sem confirmar: a recusa traz um código próprio, para o cliente abrir a tela do código
    r = await post(port, '/sessoes', { conta: 'tarde', senha: SENHA });
    assert.equal(r.status, 403);
    assert.equal(r.codigo, 'confirmar');
    assert.match(r.erro, /código/);
    // outro código logo depois do cadastro: um e-mail por minuto
    r = await post(port, '/contas/reenviar', { conta: 'tarde' });
    assert.equal(r.status, 429);
    assert.equal(r.codigo, 'limite');
    assert.match(r.erro, /Espere \d+ s/);
    assert.equal(mails.length, 1, 'nada foi enviado');
    passa(svc.store, 61_000);
    r = await post(port, '/contas/reenviar', { conta: 'tarde' });
    assert.equal(r.ok, true, r.erro);
    assert.equal(mails.length, 2);
    // o código antigo deixou de valer; o novo confirma (nome sem diferença de maiúsculas)
    if (codeOf(mails[0]) !== codeOf(mails[1])) assert.equal((await post(port, '/contas/verificar', { conta: 'tarde', codigo: codeOf(mails[0]) })).ok, false);
    r = await post(port, '/contas/verificar', { conta: 'TARDE', codigo: codeOf(mails[1]) });
    assert.equal(r.ok, true, r.erro);
    assert.equal((await post(port, '/sessoes', { conta: 'tarde', senha: SENHA })).ok, true);
    // conta confirmada ou inexistente: resposta genérica e nenhum e-mail
    passa(svc.store, 61_000);
    for (const conta of ['tarde', 'ninguem']) assert.equal((await post(port, '/contas/reenviar', { conta })).ok, true);
    assert.equal(mails.length, 2);
    // outra conta: o código da troca de senha também confirma o e-mail
    assert.equal((await post(port, '/contas', { conta: 'esquece', email: 'esquece@exemplo.com', senha: SENHA, aceite: true })).status, 201);
    passa(svc.store, 61_000);
    await post(port, '/senha/esqueci', { email: 'esquece@exemplo.com' });
    assert.match(mails.at(-1).subject, /senha/i);
    r = await post(port, '/senha/redefinir', { email: 'esquece@exemplo.com', codigo: codeOf(mails.at(-1)), senha: 'senha-nova-22' });
    assert.equal(r.ok, true, r.erro);
    assert.equal((await post(port, '/sessoes', { conta: 'esquece', senha: 'senha-nova-22' })).ok, true, 'confirmada pela troca de senha');
  } finally { await svc.stop(); rmSync(dir, { recursive: true, force: true }); }
});

test('conta nunca confirmada expira em 7 dias na limpeza periódica da zona e libera o nome e o e-mail', async () => {
  const dir = tmp('cinzas-expira-');
  const db = join(dir, 'e.db');
  const zone = new GameServer({ port: 0, host: '127.0.0.1', dbPath: db, seed: 5, log: false, auth: 'token', tokenSecret: SECRET });
  await zone.start();
  const { svc, port, mails } = await startAccounts(db);
  const age = (days) => svc.store.db.prepare('UPDATE accounts SET created_at = ? WHERE name = ?').run(Date.now() - days * DAY, 'sumida');
  try {
    assert.equal((await post(port, '/contas', { conta: 'sumida', email: 'sumida@exemplo.com', senha: SENHA, aceite: true })).status, 201);
    assert.equal((await post(port, '/contas', { conta: 'sumida', email: 'outro@exemplo.com', senha: SENHA, aceite: true })).status, 409, 'nome ocupado enquanto não vence');
    age(6);
    assert.equal(zone.purge().unverified, 0, 'com 6 dias ainda fica');
    age(7.01);
    assert.equal(zone.purge().unverified, 1);
    assert.equal(svc.store.findAccount('sumida'), undefined);
    assert.equal((await post(port, '/contas/verificar', { conta: 'sumida', codigo: codeOf(mails[0]) })).ok, false, 'o código da conta apagada não vale');
    // nome e e-mail livres (passado o minuto do e-mail anterior para o mesmo endereço)
    passa(svc.store, 61_000);
    const r = await post(port, '/contas', { conta: 'Sumida', email: 'SUMIDA@exemplo.com', senha: 'senha-forte-2', aceite: true });
    assert.equal(r.status, 201, r.erro);
    assert.equal(zone.purge().unverified, 0, 'a conta nova fica');
  } finally { await svc.stop(); await zone.stop(); rmSync(dir, { recursive: true, force: true }); }
});

test('limites de e-mail: um por minuto e 10 por 24 h por conta e por endereço, guardados no banco; "Esqueci a senha" continua genérico', async () => {
  const dir = tmp('cinzas-lim-');
  const db = join(dir, 'l.db');
  let { svc, port, mails } = await startAccounts(db);
  try {
    assert.equal((await post(port, '/contas', { conta: 'lotada', email: 'lotada@exemplo.com', senha: SENHA, aceite: true })).status, 201);
    // o cadastro e mais 9 reenvios espaçados de um minuto: 10 e-mails em 24 h
    for (let i = 1; i < MAIL_PER_DAY; i++) {
      passa(svc.store, 61_000);
      const r = await post(port, '/contas/reenviar', { conta: 'lotada' });
      assert.equal(r.ok, true, `reenvio ${i}: ${r.erro}`);
    }
    assert.equal(mails.length, MAIL_PER_DAY);
    passa(svc.store, 61_000);
    let r = await post(port, '/contas/reenviar', { conta: 'lotada' });
    assert.equal(r.status, 429);
    assert.equal(r.codigo, 'limite');
    assert.match(r.erro, new RegExp(`${MAIL_PER_DAY} e-mails`));
    assert.match(r.erro, /cerca de \d+ h/);
    // "Esqueci a senha": a mesma resposta com ou sem conta, com ou sem limite; nada sai além do limite
    const generic = await post(port, '/senha/esqueci', { email: 'ninguem@exemplo.com' });
    r = await post(port, '/senha/esqueci', { email: 'LOTADA@exemplo.com' });
    assert.deepEqual(r, generic, 'resposta idêntica: não revela se o e-mail tem conta nem se bateu no limite');
    assert.equal(mails.length, MAIL_PER_DAY);
    assert.equal(svc.store.auditTail(5, 'password_reset_limited').length, 1, 'o pedido barrado fica na auditoria');
    // reiniciar o serviço não zera os contadores
    await svc.stop();
    ({ svc, port, mails } = await startAccounts(db));
    assert.equal((await post(port, '/contas/reenviar', { conta: 'lotada' })).status, 429, 'contador no banco, não na memória');
    // passadas 24 h, volta a mandar
    passa(svc.store, DAY);
    r = await post(port, '/contas/reenviar', { conta: 'lotada' });
    assert.equal(r.ok, true, r.erro);
    assert.equal(mails.length, 1);
    // por endereço: excluir a conta e cadastrar outra com o mesmo e-mail em seguida não fura o limite
    assert.equal((await post(port, '/contas/excluir', { conta: 'lotada', senha: SENHA })).ok, true);
    r = await post(port, '/contas', { conta: 'outra', email: 'Lotada@Exemplo.com', senha: SENHA, aceite: true });
    assert.equal(r.status, 429, 'o endereço recebeu um e-mail há menos de um minuto');
    assert.equal(r.codigo, 'limite');
    assert.equal(svc.store.findAccount('outra'), undefined, 'nada foi criado');
    passa(svc.store, 61_000);
    assert.equal((await post(port, '/contas', { conta: 'outra', email: 'lotada@exemplo.com', senha: SENHA, aceite: true })).status, 201);
    assert.equal(mails.length, 2);
  } finally { await svc.stop(); rmSync(dir, { recursive: true, force: true }); }
});

test('envio de e-mail que falha: cadastro criado com a explicação (202, codigo "email"), reenvio 502 e "Esqueci a senha" igual; nada de "Erro interno"', async () => {
  const dir = tmp('cinzas-semcorreio-');
  let down = true;
  const sent = [];
  const { svc, port } = await startAccounts(join(dir, 's.db'), { mailer: { send: async (m) => { if (down) throw new Error('SMTP 535: 535 5.7.8 Username and Password not accepted'); sent.push(m); return 'mem'; } } });
  try {
    let r = await post(port, '/contas', { conta: 'semcorreio', email: 'semcorreio@exemplo.com', senha: SENHA, aceite: true });
    assert.equal(r.status, 202, r.erro ?? r.mensagem);
    assert.equal(r.ok, true, 'a conta existe: o cliente abre a tela do código');
    assert.equal(r.codigo, 'email');
    assert.match(r.mensagem, /Reenviar código/);
    assert.equal(svc.store.findAccount('semcorreio')?.verified, 0, 'conta criada, ainda sem confirmar');
    // reenviar com o servidor de e-mail ainda fora: erro com o que fazer (e o limite de um por minuto vale)
    passa(svc.store, 61_000);
    r = await post(port, '/contas/reenviar', { conta: 'semcorreio' });
    assert.equal(r.status, 502);
    assert.equal(r.codigo, 'email');
    assert.match(r.erro, /alguns minutos/);
    // "Esqueci a senha" responde igual com ou sem conta, mesmo com o envio falhando; a falha fica na auditoria
    passa(svc.store, 61_000);
    const generic = await post(port, '/senha/esqueci', { email: 'ninguem@exemplo.com' });
    r = await post(port, '/senha/esqueci', { email: 'semcorreio@exemplo.com' });
    assert.deepEqual(r, generic);
    assert.equal(svc.store.auditTail(5, 'password_reset_mail_failed').length, 1);
    assert.equal(svc.store.auditTail(5, 'password_reset_requested').length, 0);
    // o servidor de e-mail voltou: o reenvio manda o código e a conta confirma
    down = false;
    passa(svc.store, 61_000);
    r = await post(port, '/contas/reenviar', { conta: 'semcorreio' });
    assert.equal(r.ok, true, r.erro);
    assert.equal(sent.length, 1);
    r = await post(port, '/contas/verificar', { conta: 'semcorreio', codigo: codeOf(sent[0]) });
    assert.equal(r.ok, true, r.erro);
    assert.equal(svc.metrics.mailFailed, 3, 'cada falha conta na métrica (alerta FalhaNoEnvioDeEmail)');
  } finally { await svc.stop(); rmSync(dir, { recursive: true, force: true }); }
});

test('tentativas de código: no máximo 20 erradas por conta em 24 h, somando confirmação e troca de senha; a ferramenta libera', async () => {
  const dir = tmp('cinzas-cod-');
  const db = join(dir, 'k.db');
  const { svc, port, mails } = await startAccounts(db);
  const email = 'chute@exemplo.com';
  try {
    assert.equal((await post(port, '/contas', { conta: 'chute', email, senha: SENHA, aceite: true })).status, 201);
    // palpite sem código válido (nenhuma troca de senha pedida) não conta: ninguém tranca a conta de outro à toa
    for (let i = 0; i < 25; i++) assert.equal((await post(port, '/senha/redefinir', { email, codigo: '123456', senha: 'senha-nova-22' })).status, 400);
    // 5 erros por código (o quinto invalida o código); cada código novo é um e-mail (um por minuto)
    const wrongVerify = async () => {
      for (let i = 0; i < 5; i++) {
        const r = await post(port, '/contas/verificar', { conta: 'chute', codigo: wrongFor(codeOf(mails.at(-1))) });
        assert.equal(r.status, 400, r.erro);
      }
    };
    const wrongReset = async () => {
      for (let i = 0; i < 5; i++) {
        const r = await post(port, '/senha/redefinir', { email, codigo: wrongFor(codeOf(mails.at(-1))), senha: 'senha-nova-22' });
        assert.equal(r.status, 400, r.erro);
      }
    };
    await wrongVerify(); // 5: código do cadastro
    passa(svc.store, 61_000);
    assert.equal((await post(port, '/contas/reenviar', { conta: 'chute' })).ok, true);
    await wrongVerify(); // 10
    passa(svc.store, 61_000);
    await post(port, '/senha/esqueci', { email });
    await wrongReset(); // 15
    passa(svc.store, 61_000);
    await post(port, '/senha/esqueci', { email });
    await wrongReset(); // 20
    // a partir daqui, recusa com mensagem clara, mesmo com o código certo (que continua guardado)
    passa(svc.store, 61_000);
    await post(port, '/senha/esqueci', { email });
    assert.equal(mails.length, 5);
    let r = await post(port, '/senha/redefinir', { email, codigo: codeOf(mails.at(-1)), senha: 'senha-nova-22' });
    assert.equal(r.status, 429);
    assert.equal(r.codigo, 'tentativas');
    assert.match(r.erro, new RegExp(`${CODE_FAILS_PER_DAY} em 24 horas`));
    r = await post(port, '/contas/verificar', { conta: 'chute', codigo: '123456' });
    assert.equal(r.status, 429, 'vale para a confirmação também');
    assert.equal(svc.store.accountEventStats('code_fail', svc.store.findAccount('chute').id, null, 0).account.n, CODE_FAILS_PER_DAY, 'recusado antes de conferir: não conta mais');
    // a janela é de 24 h a partir dos erros: com 23 h ainda recusa; passadas as 24 h, o código válido funciona
    // (e confirma a conta)
    passa(svc.store, 23 * 3600_000);
    assert.equal((await post(port, '/contas/verificar', { conta: 'chute', codigo: '123456' })).status, 429);
    passa(svc.store, 3600_000 + 1000);
    r = await post(port, '/senha/redefinir', { email, codigo: codeOf(mails.at(-1)), senha: 'senha-nova-22' });
    assert.equal(r.ok, true, r.erro);
    assert.equal((await post(port, '/sessoes', { conta: 'chute', senha: 'senha-nova-22' })).ok, true);
    // a equipe libera antes das 24 h pela ferramenta (npm run conta -- --conta nome --liberar-limites)
    assert.equal((await post(port, '/contas', { conta: 'trancada', email: 'trancada@exemplo.com', senha: SENHA, aceite: true })).status, 201);
    const tid = svc.store.findAccount('trancada').id;
    for (let i = 0; i < CODE_FAILS_PER_DAY; i++) svc.store.noteAccountEvent('code_fail', tid);
    assert.equal((await post(port, '/contas/verificar', { conta: 'trancada', codigo: codeOf(mails.at(-1)) })).status, 429);
    const tool = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', new URL('../tools/conta.mjs', import.meta.url).pathname, '--db', db, '--conta', 'trancada', '--liberar-limites'],
      { encoding: 'utf8', timeout: 30_000 });
    assert.equal(tool.status, 0, tool.stderr);
    assert.match(tool.stdout, /liberados/);
    assert.equal((await post(port, '/contas/verificar', { conta: 'trancada', codigo: codeOf(mails.at(-1)) })).ok, true, 'liberada, o código do cadastro confirma');
    assert.equal(svc.store.auditTail(5, 'limits_cleared').length, 1);
  } finally { await svc.stop(); rmSync(dir, { recursive: true, force: true }); }
});

test('aceite dos termos: gravado na conta antes do e-mail; versão nova pede novo aceite no login; exportação traz versão e data', async () => {
  const dir = tmp('cinzas-termos-');
  const db = join(dir, 't.db');
  const zone = new GameServer({ port: 0, host: '127.0.0.1', dbPath: db, seed: 6, log: false, auth: 'token', tokenSecret: SECRET });
  const zport = await zone.start();
  const mails = [];
  let atSend = null;
  let svc = new AccountsService({ port: 0, dbPath: db, tokenSecret: SECRET, log: false, mailer: { send: async (m) => {
    // na hora do envio, o aceite e a linha da auditoria já estão gravados
    const row = svc.store.findAccountByEmail(m.to);
    atSend = { terms: [row.terms_version, typeof row.terms_at], audit: svc.store.auditTail(5, 'account_created').length };
    mails.push(m);
    return 'mem';
  } } });
  let port = await svc.start();
  try {
    const t0 = Date.now();
    let r = await post(port, '/contas', { conta: 'leitora', email: 'leitora@exemplo.com', senha: SENHA, aceite: true });
    assert.equal(r.status, 201, r.erro);
    assert.deepEqual(atSend, { terms: [TERMS_VERSION, 'number'], audit: 1 });
    const acc = svc.store.findAccount('leitora');
    assert.ok(acc.terms_at >= t0 && acc.terms_at <= Date.now(), 'data do aceite = hora do cadastro');
    assert.equal(JSON.parse(svc.store.auditTail(5, 'account_created')[0].data_json).terms, TERMS_VERSION);
    assert.equal((await post(port, '/contas/verificar', { conta: 'leitora', codigo: codeOf(mails[0]) })).ok, true);
    assert.equal((await post(port, '/sessoes', { conta: 'leitora', senha: SENHA })).ok, true, 'versão atual aceita: entra');
    // os termos mudam (versão nova no serviço): o login pede novo aceite
    await svc.stop();
    svc = new AccountsService({ port: 0, dbPath: db, tokenSecret: SECRET, log: false, termsVersion: TERMS_VERSION + 1, mailer: { send: async () => 'mem' } });
    port = await svc.start();
    r = await post(port, '/sessoes', { conta: 'leitora', senha: SENHA });
    assert.equal(r.status, 403);
    assert.equal(r.codigo, 'termos');
    assert.equal(r.versao, TERMS_VERSION + 1);
    assert.equal(r.token, undefined, 'sem token antes do aceite');
    assert.match(r.erro, /Termos de Uso/);
    // conta suspensa vê a suspensão, não a tela dos termos
    svc.store.setBan(acc.id, Date.now() + 3600_000, 'teste');
    r = await post(port, '/sessoes', { conta: 'leitora', senha: SENHA });
    assert.equal(r.codigo, 'suspensa');
    svc.store.setBan(acc.id, null, null);
    // aceite: senha certa e caixa marcada
    assert.equal((await post(port, '/termos/aceitar', { conta: 'leitora', senha: 'errada-123', aceite: true })).status, 401);
    r = await post(port, '/termos/aceitar', { conta: 'leitora', senha: SENHA });
    assert.equal(r.ok, false);
    assert.match(r.erro, /aceite/);
    assert.equal(svc.store.findAccount('leitora').terms_version, TERMS_VERSION, 'sem aceite, nada muda');
    const t1 = Date.now();
    r = await post(port, '/termos/aceitar', { conta: 'LEITORA', senha: SENHA, aceite: true });
    assert.equal(r.ok, true, r.erro);
    assert.equal(r.versao, TERMS_VERSION + 1);
    const after = svc.store.findAccount('leitora');
    assert.equal(after.terms_version, TERMS_VERSION + 1);
    assert.ok(after.terms_at >= t1);
    const audit = svc.store.auditTail(10, 'terms_accepted');
    assert.equal(audit.length, 1);
    assert.equal(JSON.parse(audit[0].data_json).terms, TERMS_VERSION + 1);
    // aceitar de novo a mesma versão não troca a data
    assert.equal((await post(port, '/termos/aceitar', { conta: 'leitora', senha: SENHA, aceite: true })).ok, true);
    assert.equal(svc.store.findAccount('leitora').terms_at, after.terms_at);
    assert.equal(svc.store.auditTail(10, 'terms_accepted').length, 1);
    // o login segue até o servidor de zona
    r = await post(port, '/sessoes', { conta: 'leitora', senha: SENHA });
    assert.equal(r.ok, true, r.erro);
    const c = new SimClient('termos');
    await c.connect(`ws://127.0.0.1:${zport}`);
    const lg = await c.request('login_token', { token: r.token });
    assert.equal(lg.ok, true, lg.reason);
    await c.close();
    // exportação: versão e data do aceite, e a linha da auditoria
    const exp = await post(port, '/contas/dados', { conta: 'leitora', senha: SENHA });
    assert.equal(exp.ok, true);
    assert.deepEqual([exp.dados.conta.terms_version, exp.dados.conta.terms_at], [TERMS_VERSION + 1, after.terms_at]);
    assert.ok(exp.dados.auditoria.some((a) => a.kind === 'terms_accepted'));
  } finally { await svc.stop(); await zone.stop(); rmSync(dir, { recursive: true, force: true }); }
});

test('versão dos termos: TERMS_VERSION é o número no topo de docs/TERMOS.md e de docs/PRIVACIDADE.md (o texto que o cliente abre)', () => {
  // subir só o número (ou só o texto) pediria o aceite de uma versão que não é a que o jogador lê em /termos
  for (const f of ['TERMOS.md', 'PRIVACIDADE.md']) {
    const text = readFileSync(new URL(`../../docs/${f}`, import.meta.url), 'utf8');
    assert.equal(Number(/\*Versão (\d+)/.exec(text)?.[1]), TERMS_VERSION, `${f}: a versão no topo do texto`);
  }
});
