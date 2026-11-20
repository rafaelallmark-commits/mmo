// Token de sessão de curta duração: o serviço de contas assina, o servidor de zona confere.
// Formato: base64url(JSON) "." base64url(HMAC-SHA256(segredo, parte1)). Campos: sub (id da conta),
// name, role, iat, exp (segundos), jti (único, para não aceitar o mesmo token duas vezes).
import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';

const b64u = (buf) => Buffer.from(buf).toString('base64url');

export function signToken(payload, secret, ttlS = 300) {
  if (!secret) throw new Error('segredo do token ausente');
  const now = Math.floor(Date.now() / 1000);
  const body = b64u(JSON.stringify({ ...payload, iat: now, exp: now + ttlS, jti: randomUUID() }));
  const sig = b64u(createHmac('sha256', secret).update(body).digest());
  return `${body}.${sig}`;
}

/** Devolve o conteúdo do token se a assinatura confere e ele não venceu; senão null. */
export function verifyToken(token, secret) {
  if (typeof token !== 'string' || !secret) return null;
  const dot = token.indexOf('.');
  if (dot <= 0 || dot !== token.lastIndexOf('.')) return null;
  const body = token.slice(0, dot);
  const sig = Buffer.from(token.slice(dot + 1), 'base64url');
  const want = createHmac('sha256', secret).update(body).digest();
  if (sig.length !== want.length || !timingSafeEqual(sig, want)) return null;
  let p;
  try { p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return null; }
  if (typeof p.exp !== 'number' || p.exp < Math.floor(Date.now() / 1000)) return null;
  return p;
}

/** Lembra os jti já usados até vencerem (um token só entra uma vez). */
export class ReplayGuard {
  constructor() { this.seen = new Map(); }
  use(p) {
    const now = Math.floor(Date.now() / 1000);
    for (const [k, exp] of this.seen) if (exp < now) this.seen.delete(k);
    if (!p.jti || this.seen.has(p.jti)) return false;
    this.seen.set(p.jti, p.exp);
    return true;
  }
}
