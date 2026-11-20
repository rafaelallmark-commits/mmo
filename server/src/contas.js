// Serviço de contas (teste público): processo HTTP separado do servidor de zona, no mesmo banco.
// Cria conta com e-mail e código de confirmação, emite token de sessão de curta duração (que o
// servidor de zona aceita em "login_token"), troca senha por código e exclui conta.
//
//   POST /contas            { conta, email, senha }      → 201; manda o código por e-mail
//   POST /contas/verificar  { conta, codigo }            → conta confirmada
//   POST /contas/reenviar   { conta }                    → novo código (se ainda não confirmada)
//   POST /sessoes           { conta, senha }             → { token, expiraEm } (só conta confirmada)
//   POST /senha/esqueci     { email }                    → 200 sempre (não revela se o e-mail existe)
//   POST /senha/redefinir   { email, codigo, senha }     → senha trocada
//   POST /contas/dados      { conta, senha }             → tudo o que guardamos da conta (portabilidade)
//   POST /contas/excluir    { conta, senha }             → conta excluída (dados pessoais apagados)
//   GET  /saude
import http from 'node:http';
import { Store } from './store.js';
import { signToken } from './token.js';
import { createMailer } from './mailer.js';

const ACCOUNT_RE = /^[a-zA-Z0-9_]{3,20}$/;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;

export class AccountsService {
  constructor(opts = {}) {
    this.opts = { port: 7780, host: '127.0.0.1', dbPath: 'cinzas.db', tokenSecret: null, tokenTtlS: 300, minPassword: 8, perIpPerMin: 20, trustProxy: false, log: true, ...opts };
    if (!this.opts.tokenSecret) throw new Error('serviço de contas precisa de --token-secret (ou CINZAS_TOKEN_SECRET)');
    this.store = opts.store ?? new Store(this.opts.dbPath);
    this.mailer = opts.mailer ?? createMailer(opts.mail ?? { kind: 'console' });
    this.hits = new Map(); // ip -> [instantes]
  }

  log(...a) { if (this.opts.log) console.log(new Date().toISOString().slice(11, 19), '[contas]', ...a); }

  start() {
    this.srv = http.createServer((req, res) => this.onRequest(req, res));
    return new Promise((resolve) => this.srv.listen(this.opts.port, this.opts.host, () => {
      this.port = this.srv.address().port;
      this.log(`serviço de contas em http://${this.opts.host}:${this.port}`);
      resolve(this.port);
    }));
  }

  async stop() {
    await new Promise((r) => this.srv.close(() => r()));
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
    const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); };
    const url = (req.url || '/').split('?')[0];
    if (req.method === 'GET' && url === '/saude') return send(200, { ok: true });
    if (req.method !== 'POST') return send(404, { ok: false, erro: 'Rota inexistente.' });
    const ip = this.ipOf(req);
    if (this.limited(ip)) return send(429, { ok: false, erro: 'Muitas tentativas. Espere um minuto.' });
    let body = '';
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 8192) return send(413, { ok: false, erro: 'Pedido grande demais.' });
    }
    let b;
    try { b = JSON.parse(body || '{}'); } catch { return send(400, { ok: false, erro: 'JSON inválido.' }); }
    try {
      const r = await this.route(url, b, ip);
      return send(r.status ?? (r.ok ? 200 : 400), r.body ?? r);
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
        if (st.findAccount(conta)) return { ok: false, status: 409, erro: 'Essa conta já existe.' };
        if (st.findAccountByEmail(email)) return { ok: false, status: 409, erro: 'Esse e-mail já tem conta.' };
        const id = st.createAccount(conta, senha, { email, verified: false });
        const code = st.issueCode(id, 'verify');
        await this.mailer.send({ to: email, subject: 'Confirme sua conta — Cinzas do Meridiano', text: `Olá, ${conta}!\n\nSeu código de confirmação é ${code}. Ele vale por 30 minutos.\n\nSe não foi você quem criou esta conta, ignore esta mensagem.` });
        st.audit('account_created', { accountId: id, ip });
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
