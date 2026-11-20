// Ponto de entrada do serviço de contas:
//   node src/contas-main.js --port 7780 --db cinzas.db --token-secret S
//     [--email console|arquivo|smtp] [--email-dir emails] [--smtp-host h --smtp-port 587 --smtp-user u
//      --smtp-pass p --smtp-from "Nome <x@y>" --smtp-tls direto|starttls|nenhum --smtp-helo dominio]
//     [--trust-proxy] [--docs-dir ../docs]
// Cada opção também vem do ambiente (CINZAS_EMAIL, CINZAS_SMTP_HOST/PORT/USER/PASS/FROM/TLS/HELO).
// O servidor de zona precisa do mesmo segredo (--token-secret ou CINZAS_TOKEN_SECRET) e de --auth token.
import { AccountsService } from './contas.js';
import { mailConfig, mailProblems, mailWarning } from './mailcfg.js';
import { checkSecrets } from './segredo.js';

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = process.argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
}

const mail = mailConfig(arg);
const problems = mailProblems(mail);
if (problems.length) { for (const p of problems) console.error(p); process.exit(2); }
const warning = mailWarning(mail);
if (warning) console.error(warning);
const tokenSecret = arg('token-secret', process.env.CINZAS_TOKEN_SECRET ?? null);
if (!checkSecrets([['CINZAS_TOKEN_SECRET (--token-secret)', tokenSecret]])) process.exit(2);

const svc = new AccountsService({
  port: Number(arg('port', process.env.CINZAS_CONTAS_PORT ?? 7780)),
  host: arg('host', '0.0.0.0'),
  dbPath: arg('db', process.env.CINZAS_DB ?? 'cinzas.db'),
  tokenSecret,
  trustProxy: !!arg('trust-proxy', ['1', 'true', 'sim'].includes(String(process.env.CINZAS_TRUST_PROXY ?? '').toLowerCase())),
  mail,
  ...(arg('docs-dir', process.env.CINZAS_DOCS_DIR ?? null) ? { docsDir: arg('docs-dir', process.env.CINZAS_DOCS_DIR) } : {}),
});
await svc.start();
const stop = async () => { await svc.stop(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
