// Ponto de entrada do serviço de mundo (modo de várias zonas):
//   node src/world-main.js [--port 7790] [--host 127.0.0.1] [--secret S | CINZAS_WORLD_SECRET]
//     [--heartbeat-ms 2000] [--down-after-ms 10000]
// Só os servidores de zona falam com ele (rede interna). Cada zona sobe com --world ws://host:7790,
// o mesmo segredo (CINZAS_WORLD_SECRET), --zone-id e --maps. GET /saude mostra zonas e posses.
import { WorldService } from './world.js';
import { checkSecrets } from './segredo.js';

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = process.argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
}

const secret = arg('secret', process.env.CINZAS_WORLD_SECRET ?? null);
if (!checkSecrets([['CINZAS_WORLD_SECRET (--secret)', secret]])) process.exit(2);
let svc;
try {
  svc = new WorldService({
    port: Number(arg('port', process.env.CINZAS_WORLD_PORT ?? 7790)),
    host: arg('host', '127.0.0.1'),
    secret,
    heartbeatMs: Number(arg('heartbeat-ms', 2000)),
    downAfterMs: Number(arg('down-after-ms', 10000)),
  });
} catch (e) {
  console.error(e.message);
  process.exit(2);
}
await svc.start();
const stop = async () => { await svc.stop(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
