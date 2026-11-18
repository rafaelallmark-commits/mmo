// Ponto de entrada: node src/main.js [--port 7777] [--db cinzas.db] [--dev] [--xp-rate 1] [--time-scale 1] [--seed N]
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
});
await server.start();
const shutdown = async () => { console.log('salvando e encerrando...'); await server.stop(); process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
