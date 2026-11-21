// Ponto de entrada: node src/main.js [--port 7777] [--db cinzas.db] [--dev] [--xp-rate 1] [--time-scale 1] [--seed N]
//   [--metrics-port 9100] [--metrics-host 127.0.0.1] [--lag-ms 0] [--jitter-ms 0]
//   [--auth both|password|token] [--token-secret S | CINZAS_TOKEN_SECRET] [--tls-cert f --tls-key f]
//   [--rate-limit 20] [--rate-burst 40] [--max-conn-per-ip 0] [--trust-proxy] [--log-format text|json]
//   [--shutdown-grace 30] [--audit-days 90] [--max-players 0 | CINZAS_MAX_PLAYERS] (0 = sem teto)
//   várias zonas: [--world ws://127.0.0.1:7790 --zone-id zona-a --maps estrada_velha,pedrambar
//                  --public-url ws://host:7777] com o segredo do mundo em CINZAS_WORLD_SECRET (ou --world-secret)
import { GameServer } from './server.js';
import { checkSecrets } from './segredo.js';

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = process.argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
}

// opção que precisa de um valor (texto): sem valor é erro, ausente fica com o padrão
function textArg(name, def) {
  const v = arg(name, def ?? undefined);
  if (v === true) { console.error(`--${name} precisa de um valor.`); process.exit(2); }
  return v || undefined;
}

const opts = {
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
  world: textArg('world', process.env.CINZAS_WORLD),
  worldSecret: textArg('world-secret', process.env.CINZAS_WORLD_SECRET),
  zoneId: textArg('zone-id', process.env.CINZAS_ZONE_ID),
  maps: textArg('maps', process.env.CINZAS_MAPS),
  publicUrl: textArg('public-url', process.env.CINZAS_PUBLIC_URL),
  // teto de personagens no mundo; com o servidor cheio, "enter" responde server_full (gm e admin entram)
  maxPlayers: Number(textArg('max-players', process.env.CINZAS_MAX_PLAYERS || '0')),
};
if (!Number.isInteger(opts.maxPlayers) || opts.maxPlayers < 0) {
  console.error('--max-players (ou CINZAS_MAX_PLAYERS) precisa ser um número inteiro de 0 para cima (0 = sem teto).');
  process.exit(2);
}
if (!opts.world && (opts.maps || opts.zoneId || opts.publicUrl)) console.error('aviso: --maps, --zone-id e --public-url só valem com --world (várias zonas); ignorados.');
if (!checkSecrets([['CINZAS_TOKEN_SECRET (--token-secret)', opts.tokenSecret], ['CINZAS_WORLD_SECRET (--world-secret)', opts.worldSecret]], { dev: opts.dev })) process.exit(2);
let server;
try { server = new GameServer(opts); } catch (e) { console.error(`não foi possível iniciar: ${e.message}`); process.exit(2); }
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
  if (grace > 0) console.log(`desligamento gracioso em ${grace} s...`); // "salvando e encerrando..." vem do servidor
  await server.shutdown(grace);
  process.exit(0);
};
process.on('SIGTERM', shutdown(server.opts.shutdownGraceS));
process.on('SIGINT', shutdown(0));
