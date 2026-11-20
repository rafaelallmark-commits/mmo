// Ponto de entrada: node src/main.js [--port 7777] [--db cinzas.db] [--dev] [--xp-rate 1] [--time-scale 1] [--seed N]
//   [--metrics-port 9100] [--metrics-host 127.0.0.1] [--lag-ms 0] [--jitter-ms 0]
//   [--auth both|password|token] [--token-secret S | CINZAS_TOKEN_SECRET] [--tls-cert f --tls-key f]
//   [--rate-limit 20] [--rate-burst 40] [--max-conn-per-ip 0] [--trust-proxy] [--log-format text|json]
//   [--shutdown-grace 30] [--audit-days 90]
import { GameServer } from './server.js';

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = process.argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
}

const server = new GameServer({
  port: Number(arg('port', process.env.PORT ?? 7777)),
  host: arg('host', '0.0.0.0'),
  dbPath: arg('db', process.env.CINZAS_DB ?? 'cinzas.db'),
  dev: !!arg('dev', false),
  xpRate: Number(arg('xp-rate', 1)),
  timeScale: Number(arg('time-scale', 1)),
  seed: arg('seed', undefined) !== undefined ? Number(arg('seed')) : undefined,
  metricsPort: arg('metrics-port', process.env.CINZAS_METRICS_PORT ?? null),
  metricsHost: arg('metrics-host', '127.0.0.1'),
  lagMs: Number(arg('lag-ms', 0)),
  jitterMs: Number(arg('jitter-ms', 0)),
  auth: arg('auth', process.env.CINZAS_AUTH ?? 'both'),
  tokenSecret: arg('token-secret', process.env.CINZAS_TOKEN_SECRET ?? null),
  tlsCert: arg('tls-cert', process.env.CINZAS_TLS_CERT ?? null),
  tlsKey: arg('tls-key', process.env.CINZAS_TLS_KEY ?? null),
  rateLimit: Number(arg('rate-limit', 20)),
  rateBurst: Number(arg('rate-burst', 40)),
  maxConnPerIp: Number(arg('max-conn-per-ip', process.env.CINZAS_MAX_CONN_PER_IP ?? 0)),
  trustProxy: !!arg('trust-proxy', ['1', 'true', 'sim'].includes(String(process.env.CINZAS_TRUST_PROXY ?? '').toLowerCase())),
  logFormat: arg('log-format', process.env.CINZAS_LOG_FORMAT ?? 'text'),
  shutdownGraceS: Number(arg('shutdown-grace', 30)),
  auditDays: Number(arg('audit-days', 90)),
});
await server.start();
if (server.opts.auth === 'token' && !server.opts.tokenSecret) {
  console.error('--auth token exige --token-secret (ou CINZAS_TOKEN_SECRET).');
  process.exit(2);
}
// SIGTERM (systemd/Docker): avisa os jogadores, espera o prazo, salva e sai. SIGINT (Ctrl+C): já.
let stopping = false;
const shutdown = (grace) => async () => {
  if (stopping) { console.log('saindo agora.'); process.exit(0); }
  stopping = true;
  console.log(grace > 0 ? `desligamento gracioso em ${grace} s...` : 'salvando e encerrando...');
  await server.shutdown(grace);
  process.exit(0);
};
process.on('SIGTERM', shutdown(server.opts.shutdownGraceS));
process.on('SIGINT', shutdown(0));
