// Serviço de contas (teste público): processo HTTP separado do servidor de zona, no mesmo banco.
// Cria conta com e-mail e código de confirmação, emite token de sessão de curta duração (que o
// servidor de zona aceita em "login_token"), troca senha por código e exclui conta.
//
//   POST /contas            { conta, email, senha, aceite } → 201; manda o código por e-mail (aceite: true =
//                           declara 13 anos ou mais e aceita os Termos de Uso e a Política de Privacidade)
//   POST /contas/verificar  { conta, codigo }            → conta confirmada
//   POST /contas/reenviar   { conta }                    → novo código (se ainda não confirmada)
//   POST /sessoes           { conta, senha }             → { token, expiraEm } (só conta confirmada)
//   POST /senha/esqueci     { email }                    → 200 sempre (não revela se o e-mail existe)
//   POST /senha/redefinir   { email, codigo, senha }     → senha trocada
//   POST /contas/dados      { conta, senha }             → tudo o que guardamos da conta (portabilidade)
//   POST /contas/excluir    { conta, senha }             → conta excluída (dados pessoais apagados)
//   GET  /saude · GET /termos · GET /privacidade (texto dos documentos, para o cliente abrir no navegador)
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AccountsMetrics, startMetricsServer } from './metrics.js';
import { createStore } from './db.js';
import { signToken } from './token.js';
import { banMessage } from './moderation.js';

export const TERMS_VERSION = 1; // versão de docs/TERMOS.md aceita no cadastro (fica na auditoria)
import { createMailer } from './mailer.js';

const ACCOUNT_RE = /^[a-zA-Z0-9_]{3,20}$/;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;

export class AccountsService {
  constructor(opts = {}) {
    this.opts = { port: 7780, host: '127.0.0.1', dbPath: 'cinzas.db', tokenSecret: null, tokenTtlS: 300, minPassword: 8, perIpPerMin: 20, trustProxy: false, log: true,
      docsDir: join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs'), ...opts };
    if (!this.opts.tokenSecret) throw new Error('serviço de contas precisa de --token-secret (ou CINZAS_TOKEN_SECRET)');
    this.store = opts.store ?? createStore(this.opts.dbPath); // arquivo SQLite ou postgres://...
    // pedidos, cadastros e e-mails (enviados e com falha), expostos em GET /metrics numa porta à parte (start)
    this.metrics = new AccountsMetrics();
    this.mailer = this.metrics.wrapMailer(opts.mailer ?? createMailer(opts.mail ?? { kind: 'console' })); // conta envios e falhas
    this.hits = new Map(); // ip -> [instantes]
  }

  log(...a) { if (this.opts.log) console.log(new Date().toISOString().slice(11, 19), '[contas]', ...a); }

  // Métricas (opts.metricsPort, padrão desligada; opts.metricsHost, padrão 127.0.0.1) numa porta à parte, que o
  // proxy nunca repassa: o Caddy só conhece a porta principal, e /contas/metrics lá cai em "Rota inexistente".
  async start() {
    this.srv = http.createServer((req, res) => this.onRequest(req, res));
    await new Promise((resolve) => this.srv.listen(this.opts.port, this.opts.host, () => {
      this.port = this.srv.address().port;
      this.log(`serviço de contas em http://${this.opts.host}:${this.port}`);
      resolve();
    }));
    if (this.opts.metricsPort != null && this.opts.metricsPort !== false) {
      const host = this.opts.metricsHost ?? '127.0.0.1';
      this.metricsSrv = await startMetricsServer({ port: Number(this.opts.metricsPort), host, collect: () => this.metrics.summary(), text: () => this.metrics.text() });
      this.metricsPort = this.metricsSrv.address().port;
      this.log(`métricas do serviço de contas em http://${host}:${this.metricsPort}/metrics`);
    }
    return this.port;
  }

  async stop() {
    await new Promise((r) => this.srv.close(() => r()));
    if (this.metricsSrv) await new Promise((r) => this.metricsSrv.close(() => r()));
    if (!this.opts.store) this.store.close();
  }

  ipOf(req) {
    if (this.opts.trustProxy) {
      const f = req.headers['x-forwarded-for'];
      if (typeof f === 'string' && f.trim()) return f.split(',')[0].trim();
    }
    return req.socket.remoteAddress ?? '?';
  }

  limited(ip) {
    const now = Date.now();
    const arr = (this.hits.get(ip) ?? []).filter((t) => now - t < 60000);
    arr.push(now);
    this.hits.set(ip, arr);
    return arr.length > this.opts.perIpPerMin;
  }

  async onRequest(req, res) {
    const url = (req.url || '/').split('?')[0];
    res.on('finish', () => this.metrics.request(url, res.statusCode));
    const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); };
    if (req.method === 'GET' && url === '/saude') return send(200, { ok: true });
    if (req.method === 'GET' && (url === '/termos' || url === '/privacidade')) {
      // texto puro (Markdown) dos documentos; o cliente abre esta página no navegador
      try {
        const text = readFileSync(join(this.opts.docsDir, url === '/termos' ? 'TERMOS.md' : 'PRIVACIDADE.md'), 'utf8');
        res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
        return res.end(text);
      } catch { return send(404, { ok: false, erro: 'Documento indisponível.' }); }
    }
    if (req.method !== 'POST') return send(404, { ok: false, erro: 'Rota inexistente.' });
    const ip = this.ipOf(req);
    if (this.limited(ip)) return send(429, { ok: false, erro: 'Muitas tentativas. Espere um minuto.' });
    let body = '';
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 8192) return send(413, { ok: false, erro: 'Pedido grande demais.' });
    }
    let b;
    try { b = JSON.parse(body || '{}'); } catch { b = undefined; }
    if (!b || typeof b !== 'object' || Array.isArray(b)) return send(400, { ok: false, erro: 'JSON inválido.' });
    try {
      const { status, ...rest } = await this.route(url, b, ip);
      return send(status ?? (rest.ok ? 200 : 400), rest);
    } catch (e) {
      this.log('erro', url, e.message);
      return send(500, { ok: false, erro: 'Erro interno.' });
    }
  }

  async route(url, b, ip) {
    const st = this.store;
    switch (url) {
      case '/contas': {
        const { conta, email, senha } = b;
        if (typeof conta !== 'string' || !ACCOUNT_RE.test(conta)) return { ok: false, erro: 'Conta: 3 a 20 letras, números ou _.' };
        if (typeof email !== 'string' || !EMAIL_RE.test(email)) return { ok: false, erro: 'E-mail inválido.' };
        if (typeof senha !== 'string' || senha.length < this.opts.minPassword) return { ok: false, erro: `A senha precisa de pelo menos ${this.opts.minPassword} caracteres.` };
        if (b.aceite !== true) return { ok: false, erro: 'Para criar a conta, confirme que tem 13 anos ou mais e aceita os Termos de Uso e a Política de Privacidade.' };
        if (st.findAccount(conta)) return { ok: false, status: 409, erro: 'Essa conta já existe.' };
        if (st.findAccountByEmail(email)) return { ok: false, status: 409, erro: 'Esse e-mail já tem conta.' };
        const id = st.createAccount(conta, senha, { email, verified: false });
        const code = st.issueCode(id, 'verify');
        await this.mailer.send({ to: email, subject: 'Confirme sua conta — Cinzas do Meridiano', text: `Olá, ${conta}!\n\nSeu código de confirmação é ${code}. Ele vale por 30 minutos.\n\nSe não foi você quem criou esta conta, ignore esta mensagem.` });
        st.audit('account_created', { accountId: id, ip, terms: TERMS_VERSION });
        this.log(`conta criada: ${conta}`);
        return { ok: true, status: 201, mensagem: 'Conta criada. Enviamos um código para o seu e-mail.' };
      }
      case '/contas/verificar': {
        const acc = typeof b.conta === 'string' ? st.findAccount(b.conta) : null;
        if (!acc) return { ok: false, erro: 'Conta ou código incorretos.' };
        if (acc.verified) return { ok: true, mensagem: 'Conta já confirmada.' };
        if (!st.consumeCode(acc.id, 'verify', String(b.codigo ?? ''))) return { ok: false, erro: 'Conta ou código incorretos.' };
        st.setVerified(acc.id);
        st.audit('account_verified', { accountId: acc.id, ip });
        return { ok: true, mensagem: 'Conta confirmada. Já dá para entrar.' };
      }
      case '/contas/reenviar': {
        const acc = typeof b.conta === 'string' ? st.findAccount(b.conta) : null;
        if (acc && !acc.verified && acc.email) {
          const code = st.issueCode(acc.id, 'verify');
          await this.mailer.send({ to: acc.email, subject: 'Confirme sua conta — Cinzas do Meridiano', text: `Seu novo código de confirmação é ${code}. Ele vale por 30 minutos.` });
        }
        return { ok: true, mensagem: 'Se a conta existir e não estiver confirmada, enviamos um novo código.' };
      }
      case '/sessoes': {
        const acc = typeof b.conta === 'string' && typeof b.senha === 'string' ? st.verifyAccount(b.conta, b.senha) : null;
        if (!acc) { st.audit('login_fail', { ip, via: 'contas' }); return { ok: false, status: 401, erro: 'Conta ou senha incorretas.' }; }
        if (!acc.verified) return { ok: false, status: 403, erro: 'Confirme seu e-mail antes de entrar.' };
        const ban = banMessage(acc);
        if (ban) { st.audit('login_banned', { accountId: acc.id, ip, via: 'contas' }); return { ok: false, status: 403, erro: ban }; }
        const token = signToken({ sub: acc.id, name: acc.name, role: acc.role }, this.opts.tokenSecret, this.opts.tokenTtlS);
        return { ok: true, token, expiraEm: this.opts.tokenTtlS };
      }
      case '/senha/esqueci': {
        const acc = typeof b.email === 'string' ? st.findAccountByEmail(b.email) : null;
        if (acc) {
          const code = st.issueCode(acc.id, 'reset');
          await this.mailer.send({ to: acc.email, subject: 'Troca de senha — Cinzas do Meridiano', text: `Olá, ${acc.name}!\n\nSeu código para trocar a senha é ${code}. Ele vale por 30 minutos.\n\nSe não foi você, ignore esta mensagem: sua senha continua a mesma.` });
          st.audit('password_reset_requested', { accountId: acc.id, ip });
        }
        return { ok: true, mensagem: 'Se o e-mail tiver conta, enviamos um código.' };
      }
      case '/senha/redefinir': {
        const acc = typeof b.email === 'string' ? st.findAccountByEmail(b.email) : null;
        if (typeof b.senha !== 'string' || b.senha.length < this.opts.minPassword) return { ok: false, erro: `A senha precisa de pelo menos ${this.opts.minPassword} caracteres.` };
        if (!acc || !st.consumeCode(acc.id, 'reset', String(b.codigo ?? ''))) return { ok: false, erro: 'E-mail ou código incorretos.' };
        st.setPassword(acc.id, b.senha);
        if (!acc.verified) st.setVerified(acc.id); // receber o código prova o e-mail
        st.audit('password_reset', { accountId: acc.id, ip });
        return { ok: true, mensagem: 'Senha trocada.' };
      }
      case '/contas/dados': {
        // portabilidade: devolve tudo o que guardamos da conta (confirmado com a senha)
        const acc = typeof b.conta === 'string' && typeof b.senha === 'string' ? st.verifyAccount(b.conta, b.senha) : null;
        if (!acc) return { ok: false, status: 401, erro: 'Conta ou senha incorretas.' };
        st.audit('account_export', { accountId: acc.id, ip });
        return { ok: true, dados: st.exportAccount(acc.id) };
      }
      case '/contas/excluir': {
        const acc = typeof b.conta === 'string' && typeof b.senha === 'string' ? st.verifyAccount(b.conta, b.senha) : null;
        if (!acc) return { ok: false, status: 401, erro: 'Conta ou senha incorretas.' };
        const n = st.deleteAccount(acc.id);
        st.audit('account_deleted', { accountId: acc.id, ip, characters: n });
        this.log(`conta excluída: ${acc.id}`);
        return { ok: true, mensagem: 'Conta excluída. Seus dados pessoais foram apagados.' };
      }
      default:
        return { ok: false, status: 404, erro: 'Rota inexistente.' };
    }
  }
}
