// Configuração de e-mail do serviço de contas, da linha de comando (arg) e do ambiente (env).
// O Docker e o systemd configuram tudo por variável de ambiente; o TLS segue a porta final (465 = TLS
// direto), venha ela de --smtp-port ou de CINZAS_SMTP_PORT. CINZAS_SMTP_TLS (ou --smtp-tls) força o modo:
//   direto   — TLS desde o início (porta 465)
//   starttls — conexão comum que vira TLS antes de autenticar (587); sem STARTTLS o envio falha
//   nenhum   — sem criptografia (só para um relé local de desenvolvimento)
// CINZAS_SMTP_CA (ou --smtp-ca): arquivo PEM com autoridades a mais para o certificado do servidor de e-mail
// (relé próprio com certificado de uma CA privada). Soma às autoridades de sempre — a verificação nunca é
// desligada; arquivo vazio (o /dev/null do compose) = nenhuma a mais. Gmail, Brevo e afins não precisam.
import { readExtraCa, senderDomain } from './mailer.js';

const text = (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

export function mailConfig(arg, env = process.env) {
  const kind = text(arg('email', env.CINZAS_EMAIL)) ?? 'console';
  if (kind === 'arquivo') return { kind, dir: text(arg('email-dir', env.CINZAS_EMAIL_DIR)) ?? 'emails' };
  if (kind !== 'smtp') return { kind };
  const port = Number(text(String(arg('smtp-port', env.CINZAS_SMTP_PORT ?? '') || '')) ?? 587);
  const mode = (text(arg('smtp-tls', env.CINZAS_SMTP_TLS)) ?? (port === 465 ? 'direto' : 'starttls')).toLowerCase();
  return {
    kind,
    host: text(arg('smtp-host', env.CINZAS_SMTP_HOST)),
    port,
    user: text(arg('smtp-user', env.CINZAS_SMTP_USER)),
    pass: text(arg('smtp-pass', env.CINZAS_SMTP_PASS)),
    from: text(arg('smtp-from', env.CINZAS_SMTP_FROM)),
    helo: text(arg('smtp-helo', env.CINZAS_SMTP_HELO)),
    caFile: text(arg('smtp-ca', env.CINZAS_SMTP_CA)),
    tlsMode: mode,
    secure: mode === 'direto',
    starttls: mode === 'starttls',
    allowPlainAuth: mode === 'nenhum',
  };
}

/** Problemas que impedem o envio (lista vazia = configuração utilizável). */
export function mailProblems(cfg) {
  if (cfg.kind === 'console' || cfg.kind === 'arquivo') return [];
  if (cfg.kind !== 'smtp') return [`CINZAS_EMAIL desconhecido: «${cfg.kind}» (use smtp, arquivo ou console).`];
  const out = [];
  if (!cfg.host) out.push('CINZAS_SMTP_HOST (--smtp-host) é obrigatório com CINZAS_EMAIL=smtp.');
  if (!Number.isInteger(cfg.port) || cfg.port < 1 || cfg.port > 65535) out.push('CINZAS_SMTP_PORT inválida.');
  if (!['direto', 'starttls', 'nenhum'].includes(cfg.tlsMode)) out.push(`CINZAS_SMTP_TLS desconhecido: «${cfg.tlsMode}» (use direto, starttls ou nenhum).`);
  if (!cfg.from) out.push('CINZAS_SMTP_FROM (--smtp-from) é obrigatório: "Nome <endereco@seu-dominio>", com o domínio verificado no provedor.');
  else if (!senderDomain(cfg.from)) out.push(`CINZAS_SMTP_FROM sem domínio válido: «${cfg.from}».`);
  if (cfg.user && !cfg.pass) out.push('CINZAS_SMTP_PASS vazio com usuário definido.');
  if (cfg.caFile) {
    try { readExtraCa(cfg.caFile); } catch (e) { out.push(`CINZAS_SMTP_CA (--smtp-ca): não deu para usar «${cfg.caFile}»: ${e.code === 'ENOENT' ? 'arquivo não encontrado' : e.message}.`); }
  }
  return out;
}

/** Linha do registro de subida: para onde vão os e-mails (sem usuário nem senha). */
export function mailSummary(cfg) {
  if (cfg.kind === 'arquivo') return `e-mail: arquivo, em ${cfg.dir}`;
  if (cfg.kind !== 'smtp') return `e-mail: ${cfg.kind}`;
  let extra = 0;
  try { extra = cfg.caFile ? readExtraCa(cfg.caFile).length : 0; } catch { /* mailProblems já recusou */ }
  const mode = { direto: 'TLS direto', starttls: 'STARTTLS obrigatório', nenhum: 'sem criptografia' }[cfg.tlsMode] ?? cfg.tlsMode;
  return `e-mail: SMTP ${cfg.host}:${cfg.port} (${mode}${cfg.user ? ', com usuário e senha' : ', sem autenticação'}), remetente ${cfg.from}` +
    (extra ? `; ${extra} autoridade(s) a mais para o certificado, de ${cfg.caFile}` : '');
}

/** Aviso de subida para os modos que não entregam e-mail a ninguém (null nos outros). */
export function mailWarning(cfg) {
  if (cfg.kind === 'arquivo') return `AVISO: e-mail em modo "arquivo": os códigos ficam em ${cfg.dir} e nenhum jogador recebe e-mail. No teste público use CINZAS_EMAIL=smtp.`;
  if (cfg.kind === 'console') return 'AVISO: e-mail em modo "console": os códigos só aparecem neste registro. No teste público use CINZAS_EMAIL=smtp.';
  if (cfg.kind === 'smtp' && cfg.tlsMode === 'nenhum') return 'AVISO: SMTP sem criptografia (CINZAS_SMTP_TLS=nenhum): use só com um relé local.';
  return null;
}
