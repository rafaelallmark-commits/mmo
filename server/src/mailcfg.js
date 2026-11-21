// Configuração de e-mail do serviço de contas, da linha de comando (arg) e do ambiente (env).
// O Docker e o systemd configuram tudo por variável de ambiente; o TLS segue a porta final (465 = TLS
// direto), venha ela de --smtp-port ou de CINZAS_SMTP_PORT. CINZAS_SMTP_TLS (ou --smtp-tls) força o modo:
//   direto   — TLS desde o início (porta 465)
//   starttls — conexão comum que vira TLS antes de autenticar (587); sem STARTTLS o envio falha
//   nenhum   — sem criptografia (só para um relé local de desenvolvimento)
import { senderDomain } from './mailer.js';

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
  return out;
}

/** Aviso de subida para os modos que não entregam e-mail a ninguém (null nos outros). */
export function mailWarning(cfg) {
  if (cfg.kind === 'arquivo') return `AVISO: e-mail em modo "arquivo": os códigos ficam em ${cfg.dir} e nenhum jogador recebe e-mail. No teste público use CINZAS_EMAIL=smtp.`;
  if (cfg.kind === 'console') return 'AVISO: e-mail em modo "console": os códigos só aparecem neste registro. No teste público use CINZAS_EMAIL=smtp.';
  if (cfg.kind === 'smtp' && cfg.tlsMode === 'nenhum') return 'AVISO: SMTP sem criptografia (CINZAS_SMTP_TLS=nenhum): use só com um relé local.';
  return null;
}
