// Ponto de entrada do serviço de contas:
//   node src/contas-main.js --port 7780 --db cinzas.db --token-secret S
//     [--email console|arquivo|smtp] [--email-dir emails] [--smtp-host h --smtp-port 587 --smtp-user u
//      --smtp-pass p --smtp-from "Nome <x@y>" --smtp-starttls] [--trust-proxy] [--docs-dir ../docs]
// O servidor de zona precisa do mesmo segredo (--token-secret ou CINZAS_TOKEN_SECRET) e de --auth token.
import { AccountsService } from './contas.js';

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = process.argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
}

const kind = arg('email', process.env.CINZAS_EMAIL ?? 'console');
const mail = kind === 'smtp'
  ? { kind, host: arg('smtp-host', process.env.CINZAS_SMTP_HOST), port: Number(arg('smtp-port', process.env.CINZAS_SMTP_PORT ?? 587)), user: arg('smtp-user', process.env.CINZAS_SMTP_USER), pass: arg('smtp-pass', process.env.CINZAS_SMTP_PASS), from: arg('smtp-from', process.env.CINZAS_SMTP_FROM), starttls: !!arg('smtp-starttls', true), secure: Number(arg('smtp-port', 587)) === 465 }
  : kind === 'arquivo' ? { kind, dir: arg('email-dir', 'emails') } : { kind: 'console' };

const svc = new AccountsService({
  port: Number(arg('port', process.env.CINZAS_CONTAS_PORT ?? 7780)),
  host: arg('host', '0.0.0.0'),
  dbPath: arg('db', process.env.CINZAS_DB ?? 'cinzas.db'),
  tokenSecret: arg('token-secret', process.env.CINZAS_TOKEN_SECRET ?? null),
  trustProxy: !!arg('trust-proxy', ['1', 'true', 'sim'].includes(String(process.env.CINZAS_TRUST_PROXY ?? '').toLowerCase())),
  mail,
  ...(arg('docs-dir', process.env.CINZAS_DOCS_DIR ?? null) ? { docsDir: arg('docs-dir', process.env.CINZAS_DOCS_DIR) } : {}),
});
await svc.start();
const stop = async () => { await svc.stop(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
