// Envio de e-mail do serviço de contas. Tipos: "console" (imprime; desenvolvimento), "arquivo" (grava
// .eml numa pasta) e "smtp" (cliente SMTP mínimo: EHLO, STARTTLS, AUTH LOGIN, MAIL/RCPT/DATA).
import net from 'node:net';
import tls from 'node:tls';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

function message({ from, to, subject, text }) {
  const enc = (s) => `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`;
  return [
    `From: ${from}`, `To: ${to}`, `Subject: ${enc(subject)}`, `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${randomUUID()}@cinzas>`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64', '', Buffer.from(text, 'utf8').toString('base64').replace(/.{76}/g, '$&\r\n'),
  ].join('\r\n');
}

export function createMailer(cfg = { kind: 'console' }) {
  const from = cfg.from ?? 'Cinzas do Meridiano <nao-responda@cinzas.local>';
  if (cfg.kind === 'arquivo') {
    mkdirSync(cfg.dir, { recursive: true });
    return { async send(m) { const f = join(cfg.dir, `${Date.now()}-${randomUUID().slice(0, 8)}.eml`); writeFileSync(f, message({ from, ...m })); return f; } };
  }
  if (cfg.kind === 'smtp') return { send: (m) => smtpSend({ ...cfg, from }, m) };
  return { async send(m) { console.log(`[e-mail] para ${m.to}: ${m.subject}\n${m.text}\n`); return 'console'; } };
}

// Cliente SMTP mínimo (sem dependências). cfg: host, port, secure (TLS direto, 465), starttls (587),
// user, pass, from, rejectUnauthorized.
export function smtpSend(cfg, m) {
  return new Promise((resolve, reject) => {
    let sock = cfg.secure ? tls.connect({ host: cfg.host, port: cfg.port, servername: cfg.host, rejectUnauthorized: cfg.rejectUnauthorized !== false })
      : net.connect({ host: cfg.host, port: cfg.port });
    let buf = '';
    const queue = [];
    const timer = setTimeout(() => { sock.destroy(); reject(new Error('SMTP: tempo esgotado')); }, cfg.timeoutMs ?? 15000);
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
    sock.on('error', (e) => { clearTimeout(timer); reject(e); });
    (async () => {
      await expect([220]);
      const ehlo = await cmd(`EHLO ${cfg.helo ?? 'cinzas.local'}`, [250]);
      if (!cfg.secure && cfg.starttls && /STARTTLS/i.test(ehlo)) {
        await cmd('STARTTLS', [220]);
        sock.removeListener('data', onData);
        sock = tls.connect({ socket: sock, servername: cfg.host, rejectUnauthorized: cfg.rejectUnauthorized !== false });
        sock.on('data', onData);
        await new Promise((r) => sock.once('secureConnect', r));
        await cmd(`EHLO ${cfg.helo ?? 'cinzas.local'}`, [250]);
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
      await cmd('QUIT', [221]).catch(() => {});
      clearTimeout(timer);
      sock.end();
      resolve('smtp');
    })().catch((e) => { clearTimeout(timer); sock.destroy(); reject(e); });
  });
}
