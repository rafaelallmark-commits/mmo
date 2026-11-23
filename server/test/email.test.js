// E-mail do serviço de contas: configuração por ambiente (Docker/systemd), TLS obrigatório antes de
// autenticar, erro de certificado depois do STARTTLS sem derrubar o processo, remetente obrigatório.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import net from 'node:net';
import tls from 'node:tls';
import { createMailer, readExtraCa, smtpSend, senderDomain, SMTP_TIMEOUT_MS } from '../src/mailer.js';
import { mailConfig, mailProblems, mailSummary, mailWarning } from '../src/mailcfg.js';

const noArgs = (_name, def) => def; // nenhuma opção na linha de comando: tudo vem do ambiente

function selfSigned() {
  const dir = mkdtempSync(join(tmpdir(), 'cinzas-smtp-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(dir, 'k.pem'), '-out', join(dir, 'c.pem'), '-days', '1', '-subj', '/CN=smtp.falso'], { stdio: 'ignore' });
  const pair = { key: readFileSync(join(dir, 'k.pem')), cert: readFileSync(join(dir, 'c.pem')) };
  rmSync(dir, { recursive: true, force: true });
  return pair;
}

// Servidor SMTP falso. opts.starttls: anuncia e faz o STARTTLS; opts.direct: TLS desde o início.
// Cada linha recebida fica em seen como { line, tls } (tls = já chegou cifrada).
function fakeSmtp(opts = {}) {
  const seen = [];
  const state = { data: '' };
  const serve = (sock, encrypted) => {
    let mode = 'cmd';
    let pending = '';
    const onData = (d) => {
      pending += d.toString();
      const parts = pending.split('\r\n');
      pending = parts.pop();
      for (const line of parts) {
        if (mode === 'data') {
          if (line === '.') { mode = 'cmd'; sock.write('250 aceito\r\n'); } else state.data += line + '\n';
          continue;
        }
        if (!line) continue;
        seen.push({ line, tls: encrypted });
        const prev = seen.slice(0, -1).map((s) => s.line);
        if (/^EHLO/.test(line)) sock.write(opts.starttls && !encrypted ? '250-falso\r\n250-STARTTLS\r\n250 AUTH LOGIN\r\n' : '250-falso\r\n250 AUTH LOGIN\r\n');
        else if (line === 'STARTTLS' && opts.starttls && !encrypted) {
          sock.write('220 vai\r\n');
          sock.removeListener('data', onData);
          const t = new tls.TLSSocket(sock, { isServer: true, key: opts.key, cert: opts.cert });
          t.on('error', () => {});
          serve(t, true);
          return;
        } else if (line === 'AUTH LOGIN') sock.write('334 VXNlcm5hbWU6\r\n');
        else if (prev.at(-1) === 'AUTH LOGIN') sock.write('334 UGFzc3dvcmQ6\r\n');
        else if (prev.at(-2) === 'AUTH LOGIN') sock.write('235 ok\r\n');
        else if (/^MAIL FROM|^RCPT TO/.test(line)) sock.write('250 ok\r\n');
        else if (line === 'DATA') { mode = 'data'; sock.write('354 manda\r\n'); }
        else if (line === 'QUIT') { sock.write('221 tchau\r\n'); sock.end(); }
        else sock.write('502 não\r\n');
      }
    };
    sock.on('data', onData);
    sock.on('error', () => {});
    if (!encrypted || opts.direct) sock.write('220 falso ESMTP\r\n');
  };
  const srv = opts.direct
    ? tls.createServer({ key: opts.key, cert: opts.cert }, (s) => serve(s, true))
    : net.createServer((s) => serve(s, false));
  srv.on('tlsClientError', () => {});
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ srv, seen, state, port: srv.address().port })));
}

const MSG = { to: 'a@b.com', subject: 'Teste', text: 'Seu código é 123456.' };

test('configuração por ambiente: porta 465 liga o TLS direto; remetente e servidor obrigatórios', () => {
  let c = mailConfig(noArgs, { CINZAS_EMAIL: 'smtp', CINZAS_SMTP_HOST: 'smtp.x.com', CINZAS_SMTP_PORT: '465', CINZAS_SMTP_FROM: 'Jogo <j@x.com>', CINZAS_SMTP_USER: 'u', CINZAS_SMTP_PASS: 'p' });
  assert.equal(c.port, 465);
  assert.equal(c.secure, true, 'porta 465 vinda do ambiente usa TLS direto');
  assert.deepEqual(mailProblems(c), []);
  c = mailConfig(noArgs, { CINZAS_EMAIL: 'smtp', CINZAS_SMTP_HOST: 'smtp.x.com', CINZAS_SMTP_FROM: 'Jogo <j@x.com>' });
  assert.equal(c.port, 587);
  assert.equal(c.secure, false);
  assert.equal(c.starttls, true);
  assert.equal(c.allowPlainAuth, false);
  // compose com variáveis vazias: sem remetente nem servidor, recusa subir com a explicação
  c = mailConfig(noArgs, { CINZAS_EMAIL: 'smtp', CINZAS_SMTP_HOST: '', CINZAS_SMTP_PORT: '587', CINZAS_SMTP_FROM: '' });
  const probs = mailProblems(c).join(' ');
  assert.match(probs, /CINZAS_SMTP_HOST/);
  assert.match(probs, /CINZAS_SMTP_FROM/);
  assert.match(mailProblems(mailConfig(noArgs, { CINZAS_EMAIL: 'smtp', CINZAS_SMTP_HOST: 'h', CINZAS_SMTP_FROM: 'sem-dominio' })).join(' '), /domínio/);
  assert.match(mailProblems(mailConfig(noArgs, { CINZAS_EMAIL: 'smpt' })).join(' '), /desconhecido/);
  // linha de comando vence o ambiente; modo explícito
  const cli = (n, def) => ({ 'smtp-port': '2525', 'smtp-tls': 'nenhum' })[n] ?? def;
  c = mailConfig(cli, { CINZAS_EMAIL: 'smtp', CINZAS_SMTP_HOST: 'relay', CINZAS_SMTP_PORT: '465', CINZAS_SMTP_FROM: 'j@x.com' });
  assert.equal(c.port, 2525);
  assert.equal(c.secure, false);
  assert.equal(c.allowPlainAuth, true);
  assert.match(mailWarning(c), /sem criptografia/);
  // modos que não entregam e-mail avisam na subida
  assert.match(mailWarning(mailConfig(noArgs, { CINZAS_EMAIL: 'arquivo' })), /nenhum jogador recebe/);
  assert.match(mailWarning(mailConfig(noArgs, {})), /console/);
  assert.equal(senderDomain('Cinzas <nao-responda@Jogo.Exemplo.com.br>'), 'jogo.exemplo.com.br');
});

test('sem TLS (servidor sem STARTTLS), usuário e senha não são enviados', async () => {
  const f = await fakeSmtp();
  try {
    await assert.rejects(smtpSend({ host: '127.0.0.1', port: f.port, user: 'u', pass: 'p', from: 'Jogo <j@x.com>' }, MSG), /criptografia/);
    assert.ok(!f.seen.some((s) => s.line === 'AUTH LOGIN'), 'AUTH nunca chega em texto puro');
    // relé local explícito (CINZAS_SMTP_TLS=nenhum): conversa completa, EHLO e Message-ID com o domínio do remetente
    await smtpSend({ host: '127.0.0.1', port: f.port, user: 'u', pass: 'p', from: 'Jogo <j@x.com>', starttls: false, allowPlainAuth: true }, MSG);
    assert.ok(f.seen.some((s) => s.line === 'EHLO x.com'), 'EHLO com o domínio do remetente');
    assert.ok(f.seen.some((s) => s.line === 'MAIL FROM:<j@x.com>'));
    assert.ok(f.seen.some((s) => s.line === 'RCPT TO:<a@b.com>'));
    assert.match(f.state.data, /Message-ID: <[^>]+@x\.com>/);
    const b64 = f.state.data.split('\n\n')[1].replace(/\s/g, '');
    assert.match(Buffer.from(b64, 'base64').toString('utf8'), /123456/);
  } finally { f.srv.close(); }
});

test('STARTTLS: certificado inválido vira erro do envio (o processo segue); válido, autentica já cifrado', async () => {
  const pair = selfSigned();
  const f = await fakeSmtp({ starttls: true, ...pair });
  try {
    // certificado autoassinado com verificação ligada: o envio falha com o erro do TLS, sem 'error' sem dono
    await assert.rejects(smtpSend({ host: '127.0.0.1', port: f.port, user: 'u', pass: 'p', from: 'Jogo <j@x.com>' }, MSG), (e) => /certificate|self.signed|SMTP/i.test(e.message));
    assert.ok(!f.seen.some((s) => s.line === 'AUTH LOGIN'), 'sem TLS válido, sem AUTH');
    f.seen.length = 0;
    await smtpSend({ host: '127.0.0.1', port: f.port, user: 'u', pass: 'p', from: 'Jogo <j@x.com>', rejectUnauthorized: false }, MSG);
    const auth = f.seen.find((s) => s.line === 'AUTH LOGIN');
    assert.ok(auth && auth.tls, 'AUTH só depois do STARTTLS');
    assert.ok(f.seen.find((s) => s.line.startsWith('MAIL FROM')).tls);
  } finally { f.srv.close(); }
});

test('TLS direto (porta 465)', async () => {
  const pair = selfSigned();
  const f = await fakeSmtp({ direct: true, ...pair });
  try {
    await smtpSend({ host: '127.0.0.1', port: f.port, secure: true, user: 'u', pass: 'p', from: 'Jogo <j@x.com>', rejectUnauthorized: false }, MSG);
    assert.ok(f.seen.every((s) => s.tls));
    assert.ok(f.seen.some((s) => s.line === 'AUTH LOGIN'));
    assert.match(f.state.data, /123456|MTIzNDU2/);
  } finally { f.srv.close(); }
});

test('servidor que fecha a conexão no meio: erro do envio, não espera o prazo inteiro', async () => {
  const srv = net.createServer((s) => { s.write('220 falso\r\n'); s.on('data', () => s.destroy()); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  try {
    const t0 = Date.now();
    await assert.rejects(smtpSend({ host: '127.0.0.1', port: srv.address().port, from: 'j@x.com', timeoutMs: 10_000 }, MSG), /fechada|ECONNRESET/);
    assert.ok(Date.now() - t0 < 5000, 'falha logo, sem esperar os 10 s');
  } finally { srv.close(); }
});

test('zona, contas e mundo recusam subir com segredo de exemplo ou curto; contas recusam SMTP sem remetente', async () => {
  const { spawnSync } = await import('node:child_process');
  const { secretProblem } = await import('../src/segredo.js');
  assert.equal(secretProblem('S', 'a'.repeat(64)), null);
  assert.match(secretProblem('S', 'troque-por-um-segredo-longo'), /exemplo/);
  assert.match(secretProblem('S', 'curto-demais-123'), /curto demais/);
  assert.equal(secretProblem('S', null), null, 'ausente: quem exige o segredo confere à parte');
  const run = (script, args, env = {}) => spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', new URL(`../src/${script}`, import.meta.url).pathname, ...args], { encoding: 'utf8', timeout: 20_000, env: { ...process.env, CINZAS_TOKEN_SECRET: '', CINZAS_WORLD_SECRET: '', CINZAS_EMAIL: '', ...env } });
  let r = run('main.js', ['--auth', 'token', '--port', '0', '--db', ':memory:'], { CINZAS_TOKEN_SECRET: 'troque-por-um-segredo-longo' });
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /exemplo/);
  r = run('world-main.js', ['--port', '0'], { CINZAS_WORLD_SECRET: 'curtinho' });
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /curto demais/);
  r = run('contas-main.js', ['--port', '0', '--db', ':memory:'], { CINZAS_TOKEN_SECRET: 'b'.repeat(40), CINZAS_EMAIL: 'smtp', CINZAS_SMTP_HOST: 'smtp.x.com', CINZAS_SMTP_FROM: '' });
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /CINZAS_SMTP_FROM/);
  r = run('contas-main.js', ['--port', '0', '--db', ':memory:'], { CINZAS_TOKEN_SECRET: 'troque-por-um-segredo-longo', CINZAS_EMAIL: 'console' });
  assert.equal(r.status, 2, r.stderr);
});

// CA privada e certificado do servidor assinado por ela, para o nome dado (SAN).
function caAndLeaf(name) {
  const dir = mkdtempSync(join(tmpdir(), 'cinzas-ca-'));
  const f = (n) => join(dir, n);
  const run = (args) => execFileSync('openssl', args, { stdio: 'ignore' });
  run(['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', f('ca.key'), '-out', f('ca.pem'), '-days', '1', '-subj', '/CN=CA de teste',
    '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign,cRLSign']);
  run(['req', '-newkey', 'rsa:2048', '-nodes', '-keyout', f('k.pem'), '-out', f('r.csr'), '-subj', `/CN=${name}`]);
  writeFileSync(f('ext'), `subjectAltName=DNS:${name}\nbasicConstraints=CA:FALSE\nextendedKeyUsage=serverAuth\n`);
  run(['x509', '-req', '-in', f('r.csr'), '-CA', f('ca.pem'), '-CAkey', f('ca.key'), '-CAcreateserial', '-out', f('c.pem'), '-days', '1', '-extfile', f('ext')]);
  return { dir, caFile: f('ca.pem'), keyFile: f('k.pem'), key: readFileSync(f('k.pem')), cert: readFileSync(f('c.pem')) };
}

test('CINZAS_SMTP_CA: autoridade a mais para um relé com CA privada, sem desligar a verificação', async () => {
  const pki = caAndLeaf('localhost');
  const other = caAndLeaf('outro.nome');
  const f = await fakeSmtp({ starttls: true, key: pki.key, cert: pki.cert });
  const g = await fakeSmtp({ starttls: true, key: other.key, cert: other.cert });
  const env = (port, ca) => ({ CINZAS_EMAIL: 'smtp', CINZAS_SMTP_HOST: 'localhost', CINZAS_SMTP_PORT: String(port), CINZAS_SMTP_USER: 'u', CINZAS_SMTP_PASS: 'p', CINZAS_SMTP_FROM: 'Jogo <j@x.com>', CINZAS_SMTP_CA: ca });
  try {
    // arquivo: certificados PEM; vazio (o /dev/null do compose) = nenhum a mais; texto sem certificado é erro
    assert.equal(readExtraCa(pki.caFile).length, 1);
    assert.deepEqual(readExtraCa('/dev/null'), []);
    assert.throws(() => readExtraCa(pki.keyFile), /nenhum certificado/);
    writeFileSync(join(pki.dir, 'quebrado.pem'), '-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----\n');
    assert.throws(() => readExtraCa(join(pki.dir, 'quebrado.pem')));
    assert.deepEqual(mailProblems(mailConfig(noArgs, env(f.port, '/dev/null'))), []);
    assert.match(mailProblems(mailConfig(noArgs, env(f.port, pki.keyFile))).join(' '), /CINZAS_SMTP_CA.*nenhum certificado/);
    assert.match(mailProblems(mailConfig(noArgs, env(f.port, join(pki.dir, 'nao-existe.pem')))).join(' '), /CINZAS_SMTP_CA.*não encontrado/);
    // sem a CA (ou com o arquivo vazio): o certificado da CA privada é recusado e a senha não sai
    for (const ca of ['', '/dev/null']) {
      await assert.rejects(createMailer(mailConfig(noArgs, env(f.port, ca))).send(MSG), /certificate|verify/i);
    }
    assert.ok(!f.seen.some((s) => s.line === 'AUTH LOGIN'), 'sem confiar no certificado, nada de AUTH');
    // com a CA: entrega, com AUTH só depois do STARTTLS
    const cfg = mailConfig(noArgs, env(f.port, pki.caFile));
    assert.match(mailSummary(cfg), /localhost:\d+ \(STARTTLS obrigatório, com usuário e senha\).*1 autoridade/);
    assert.equal(await createMailer(cfg).send(MSG), 'smtp');
    assert.ok(f.seen.find((s) => s.line === 'AUTH LOGIN')?.tls, 'AUTH depois do STARTTLS');
    assert.match(f.state.data, /MTIzNDU2|123456/);
    // a CA a mais não aceita certificado de outra CA nem de outro nome: a verificação continua inteira
    await assert.rejects(createMailer(mailConfig(noArgs, env(g.port, pki.caFile))).send(MSG), /certificate|verify/i);
    await assert.rejects(createMailer(mailConfig(noArgs, env(g.port, other.caFile))).send(MSG), /altnames|localhost/i);
    assert.ok(!g.seen.some((s) => s.line === 'AUTH LOGIN'));
  } finally {
    f.srv.close(); g.srv.close();
    rmSync(pki.dir, { recursive: true, force: true }); rmSync(other.dir, { recursive: true, force: true });
  }
  // o serviço de contas recusa subir com um arquivo de CA que não serve
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', new URL('../src/contas-main.js', import.meta.url).pathname, '--port', '0', '--db', ':memory:'], {
    encoding: 'utf8', timeout: 20_000,
    env: { ...process.env, CINZAS_TOKEN_SECRET: 'c'.repeat(40), CINZAS_EMAIL: 'smtp', CINZAS_SMTP_HOST: 'smtp.x.com', CINZAS_SMTP_FROM: 'Jogo <j@x.com>', CINZAS_SMTP_CA: '/nao/existe/ca.pem' },
  });
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /CINZAS_SMTP_CA/);
});

// ---------- revisão final antes do teste público (D176) ----------

test('destinatário vai ao RCPT TO como está gravado na conta: "a<b@c.com>" não é entregue a b@c.com', async () => {
  const f = await fakeSmtp();
  try {
    await smtpSend({ host: '127.0.0.1', port: f.port, from: 'Jogo <j@x.com>', starttls: false }, { ...MSG, to: 'a<vitima@exemplo.com>' });
    const rcpt = f.seen.find((s) => /^RCPT TO/.test(s.line))?.line;
    assert.equal(rcpt, 'RCPT TO:<a<vitima@exemplo.com>>', 'um servidor de verdade recusa a sintaxe; nunca vira RCPT TO:<vitima@exemplo.com>');
    // o remetente continua lido de "Nome <endereço>"
    assert.ok(f.seen.some((s) => s.line === 'MAIL FROM:<j@x.com>'));
  } finally { f.srv.close(); }
});

test('prazo do SMTP abaixo do prazo do cliente: com o servidor de e-mail preso, o cadastro responde (202 "email") antes de o cliente desistir', () => {
  // o cliente desiste do pedido ao serviço de contas em http.timeout (main.gd, _accounts_post); o cadastro espera o
  // envio. Com folga para o resto do pedido (hash da senha, banco, proxy)
  const main = readFileSync(new URL('../../client/scripts/main.gd', import.meta.url), 'utf8');
  const body = /func _accounts_post\([\s\S]*?\n(?=func )/.exec(main)?.[0] ?? '';
  const clientS = Number(/http\.timeout = ([\d.]+)/.exec(body)?.[1]);
  assert.ok(clientS > 0, 'prazo do cliente achado em _accounts_post');
  assert.ok(SMTP_TIMEOUT_MS + 5000 <= clientS * 1000, `SMTP ${SMTP_TIMEOUT_MS} ms contra o cliente ${clientS} s`);
});
