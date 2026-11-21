// Conferência dos segredos compartilhados (token de sessão e serviço de mundo) antes de subir.
// O valor de exemplo de deploy/cinzas.env.exemplo é público no repositório, e um segredo curto cai por
// força bruta: com qualquer um dos dois, alguém assinaria um token de sessão para qualquer conta.
export const MIN_SECRET_LEN = 32;
const EXAMPLE_RE = /troque|exemplo|changeme|change-me/i;

/** Texto do problema (ou null se o segredo serve). Ausente não é problema aqui: quem exige confere. */
export function secretProblem(label, value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') return `${label} precisa de um valor.`;
  if (EXAMPLE_RE.test(value)) return `${label} é o valor de exemplo; gere um segredo de verdade com: openssl rand -hex 32`;
  if (value.length < MIN_SECRET_LEN) return `${label} curto demais (${value.length} caracteres, mínimo ${MIN_SECRET_LEN}); gere um com: openssl rand -hex 32`;
  return null;
}

/** Confere uma lista [rótulo, valor]; com dev, só avisa. Devolve false se algum impede a subida. */
export function checkSecrets(pairs, { dev = false, log = console.error } = {}) {
  let ok = true;
  for (const [label, value] of pairs) {
    const p = secretProblem(label, value);
    if (!p) continue;
    if (dev) log(`aviso (--dev): ${p}`);
    else { log(p); ok = false; }
  }
  return ok;
}
