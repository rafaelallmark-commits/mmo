// Ponto de entrada do serviço de contas:
//   node src/contas-main.js --port 7780 --db cinzas.db --token-secret S
//     [--email console|arquivo|smtp] [--email-dir emails] [--smtp-host h --smtp-port 587 --smtp-user u
//      --smtp-pass p --smtp-from "Nome <x@y>" --smtp-tls direto|starttls|nenhum --smtp-helo dominio
//      --smtp-ca ca-extra.pem]
//     [--trust-proxy] [--docs-dir ../docs] [--metrics-port 9101 --metrics-host 127.0.0.1]
// Cada opção também vem do ambiente (CINZAS_EMAIL, CINZAS_SMTP_HOST/PORT/USER/PASS/FROM/TLS/HELO/CA,
// CINZAS_CONTAS_METRICS_PORT). Métricas (GET /metrics: pedidos, cadastros, falhas de e-mail) só numa porta à
// parte, que o proxy não repassa, e só para endereços internos (loopback e redes privadas).
// O servidor de zona precisa do mesmo segredo (--token-secret ou CINZAS_TOKEN_SECRET) e de --auth token.
import { AccountsService } from './contas.js';
import { mailConfig, mailProblems, mailSummary, mailWarning } from './mailcfg.js';
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
const metricsPort = arg('metrics-port', process.env.CINZAS_CONTAS_METRICS_PORT || null);
if (metricsPort != null && !/^\d{1,5}$/.test(String(metricsPort))) { console.error('--metrics-port (ou CINZAS_CONTAS_METRICS_PORT) precisa de um número de porta.'); process.exit(2); }
const metricsHost = arg('metrics-host', '127.0.0.1');
if (metricsHost === true) { console.error('--metrics-host precisa de um endereço (ex.: 127.0.0.1, ou 0.0.0.0 na rede interna do contêiner).'); process.exit(2); }

const svc = new AccountsService({
  port: Number(arg('port', process.env.CINZAS_CONTAS_PORT ?? 7780)),
  host: arg('host', '0.0.0.0'),
  dbPath: arg('db', process.env.CINZAS_DB ?? 'cinzas.db'),
  tokenSecret,
  trustProxy: !!arg('trust-proxy', ['1', 'true', 'sim'].includes(String(process.env.CINZAS_TRUST_PROXY ?? '').toLowerCase())),
  mail,
  ...(arg('docs-dir', process.env.CINZAS_DOCS_DIR ?? null) ? { docsDir: arg('docs-dir', process.env.CINZAS_DOCS_DIR) } : {}),
  metricsPort,
  metricsHost,
});
await svc.start();
svc.log(mailSummary(mail));
const stop = async () => { await svc.stop(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
