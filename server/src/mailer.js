// Envio de e-mail do serviço de contas. Tipos: "console" (imprime; desenvolvimento), "arquivo" (grava
// .eml numa pasta) e "smtp" (cliente SMTP mínimo: EHLO, STARTTLS, AUTH LOGIN, MAIL/RCPT/DATA).
import net from 'node:net';
import tls from 'node:tls';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

// domínio do remetente ("Nome <x@dominio>" → "dominio"): vai no Message-ID e no EHLO
export function senderDomain(from) {
  const addr = /<([^>]+)>/.exec(from ?? '')?.[1] ?? from ?? '';
  const d = addr.split('@')[1]?.trim().toLowerCase();
  return d && /^[a-z0-9.-]+$/.test(d) ? d : null;
}

function message({ from, to, subject, text }) {
  const enc = (s) => `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`;
  return [
    `From: ${from}`, `To: ${to}`, `Subject: ${enc(subject)}`, `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${randomUUID()}@${senderDomain(from) ?? 'cinzas.local'}>`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64', '', Buffer.from(text, 'utf8').toString('base64').replace(/.{76}/g, '$&\r\n'),
  ].join('\r\n');
}

export function createMailer(cfg = { kind: 'console' }) {
  // texto vazio (variável de ambiente definida sem valor) conta como ausente
  const from = cfg.from || 'Cinzas do Meridiano <nao-responda@cinzas.local>';
  if (cfg.kind === 'arquivo') {
    mkdirSync(cfg.dir, { recursive: true });
    return { async send(m) { const f = join(cfg.dir, `${Date.now()}-${randomUUID().slice(0, 8)}.eml`); writeFileSync(f, message({ from, ...m })); return f; } };
  }
  if (cfg.kind === 'smtp') return { send: (m) => smtpSend({ ...cfg, from }, m) };
  return { async send(m) { console.log(`[e-mail] para ${m.to}: ${m.subject}\n${m.text}\n`); return 'console'; } };
}

// Cliente SMTP mínimo (sem dependências). cfg: host, port, secure (TLS direto, 465), starttls (587),
// user, pass, from, helo, rejectUnauthorized, allowPlainAuth.
// Usuário e senha só vão por conexão cifrada: sem TLS direto e sem STARTTLS anunciado, o envio falha
// (a menos de allowPlainAuth, só para um relé local de desenvolvimento).
export function smtpSend(cfg, m) {
  return new Promise((resolve, reject) => {
    let done = false;
    let sent = false; // o servidor já aceitou a mensagem (250 depois do DATA): o resto não é falha
    const fail = (e) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { sock.destroy(); } catch { /* já fechado */ }
      if (sent) resolve('smtp'); else reject(e);
    };
    let sock = cfg.secure ? tls.connect({ host: cfg.host, port: cfg.port, servername: cfg.host, rejectUnauthorized: cfg.rejectUnauthorized !== false })
      : net.connect({ host: cfg.host, port: cfg.port });
    let buf = '';
    const queue = [];
    const timer = setTimeout(() => fail(new Error('SMTP: tempo esgotado')), cfg.timeoutMs ?? 15000);
    const helo = cfg.helo || senderDomain(cfg.from) || 'cinzas.local';
    const onData = (d) => {
      buf += d.toString('utf8');
      // resposta completa: última linha "NNN espaço"
      const lines = buf.split('\r\n');
      const last = lines.length >= 2 ? lines[lines.length - 2] : '';
      if (/^\d{3} /.test(last)) {
        const code = Number(last.slice(0, 3));
        const all = buf;
        buf = '';
        const w = queue.shift();
        if (w) w(code, all);
      }
    };
    const expect = (ok) => new Promise((res, rej) => queue.push((code, text) => (ok.includes(code) ? res(text) : rej(new Error(`SMTP ${code}: ${text.trim()}`)))));
    const cmd = (line, ok) => { const p = expect(ok); sock.write(line + '\r\n'); return p; };
    sock.on('data', onData);
    sock.on('error', fail);
    sock.on('close', () => fail(new Error('SMTP: conexão fechada pelo servidor')));
    (async () => {
      await expect([220]);
      const ehlo = await cmd(`EHLO ${helo}`, [250]);
      let encrypted = !!cfg.secure;
      if (!cfg.secure && cfg.starttls !== false && /STARTTLS/i.test(ehlo)) {
        await cmd('STARTTLS', [220]);
        sock.removeListener('data', onData);
        const plain = sock;
        plain.removeAllListeners('close');
        // o soquete TLS precisa do próprio tratador de erro: certificado de outro nome ou cadeia
        // desconhecida viram falha deste envio, não um 'error' sem dono que derruba o processo
        sock = tls.connect({ socket: plain, servername: cfg.host, rejectUnauthorized: cfg.rejectUnauthorized !== false });
        sock.on('error', fail);
        sock.on('close', () => fail(new Error('SMTP: conexão fechada pelo servidor')));
        sock.on('data', onData);
        await new Promise((r, rej) => { sock.once('secureConnect', r); sock.once('error', rej); });
        encrypted = true;
        await cmd(`EHLO ${helo}`, [250]);
      }
      if (cfg.user && !encrypted && !cfg.allowPlainAuth) {
        throw new Error('SMTP: o servidor não ofereceu STARTTLS; usuário e senha não são enviados sem criptografia (use a porta 465 ou um provedor com STARTTLS)');
      }
      if (cfg.user) {
        await cmd('AUTH LOGIN', [334]);
        await cmd(Buffer.from(cfg.user).toString('base64'), [334]);
        await cmd(Buffer.from(cfg.pass ?? '').toString('base64'), [235]);
      }
      const addr = (s) => (/<([^>]+)>/.exec(s)?.[1] ?? s);
      await cmd(`MAIL FROM:<${addr(cfg.from)}>`, [250]);
      await cmd(`RCPT TO:<${addr(m.to)}>`, [250, 251]);
      await cmd('DATA', [354]);
      const body = message({ from: cfg.from, ...m }).replace(/^\./gm, '..');
      await cmd(`${body}\r\n.`, [250]);
      sent = true;
      await Promise.race([cmd('QUIT', [221]).catch(() => {}), new Promise((r) => setTimeout(r, 2000))]);
      if (done) return;
      done = true;
      clearTimeout(timer);
      sock.removeAllListeners('close');
      sock.end();
      resolve('smtp');
    })().catch(fail);
  });
}
