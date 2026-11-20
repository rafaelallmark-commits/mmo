// Sobe localmente o serviço de mundo e N servidores de zona (um processo cada) no mesmo banco, para
// testar o modo de várias zonas na mão (docs/08 §8.10):
//   npm run multizona -- --zonas 2 [--porta 7777] [--porta-mundo 7790] [--host 127.0.0.1] [--db cinzas.db]
//     [--mapas "estrada_velha,pedrambar,vau_de_nacar;brejo_bombas,oficina_soterrada,galerias_eco,canais_eclusa"]
//     [--dev] [--time-scale 2] ...   (as demais opções vão para todas as zonas)
// A zona i ouve em porta+i (a primeira é a "porta de entrada" dos clientes). Sem --mapas, a primeira zona
// fica com a Estrada Velha e as duas cidades e as outras dividem o resto. O segredo do mundo vem de
// CINZAS_WORLD_SECRET (ou --segredo); sem ele, um aleatório vale só para esta execução. Ctrl+C desliga
// as zonas (salvando) e depois o mundo.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGameData } from '../src/data.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const OWN = new Set(['zonas', 'porta', 'porta-mundo', 'host', 'db', 'mapas', 'segredo']);
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i === -1 || argv[i + 1] === undefined || argv[i + 1].startsWith('--') ? d : argv[i + 1]; };
// o que não é desta ferramenta vai para as zonas (ex.: --dev, --time-scale 2)
const passthrough = [];
for (let i = 0; i < argv.length; i++) {
  const name = argv[i].startsWith('--') ? argv[i].slice(2) : null;
  const hasValue = argv[i + 1] !== undefined && !argv[i + 1].startsWith('--');
  if (name && OWN.has(name)) { if (hasValue) i++; continue; }
  passthrough.push(argv[i]);
}

const host = arg('host', '127.0.0.1');
const port = Number(arg('porta', 7777));
const worldPort = Number(arg('porta-mundo', 7790));
const db = arg('db', process.env.CINZAS_DB ?? 'cinzas.db');
const secret = arg('segredo', process.env.CINZAS_WORLD_SECRET) || randomBytes(24).toString('hex');

// mapas abertos (os mesmos que um servidor de zona pode hospedar)
const data = loadGameData();
const open = Object.entries(data.maps).filter(([, m]) => m.implementedIn && !m.instanced && (m.spawns || m.city)).map(([id]) => id);
let groups;
if (arg('mapas')) {
  groups = arg('mapas').split(';').map((g) => g.split(',').map((x) => x.trim()).filter(Boolean)).filter((g) => g.length);
} else {
  const first = ['estrada_velha', 'pedrambar', 'vau_de_nacar'].filter((id) => open.includes(id));
  const rest = open.filter((id) => !first.includes(id));
  const n = Math.max(1, Math.min(Number(arg('zonas', 2)) || 2, rest.length + 1));
  groups = n === 1 ? [open] : [first, ...Array.from({ length: n - 1 }, () => [])];
  if (n > 1) rest.forEach((id, i) => groups[1 + (i % (n - 1))].push(id));
}
for (const g of groups) for (const id of g) if (!open.includes(id)) { console.error(`mapa "${id}" não existe ou não é aberto (abertos: ${open.join(', ')})`); process.exit(2); }

const env = { ...process.env, CINZAS_WORLD_SECRET: secret };
const children = [];
const zoneName = (i) => `zona-${String.fromCharCode(97 + i)}`;

function run(label, script, args) {
  const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', join(SRC, script), ...args], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  const tag = `[${label}]`.padEnd(9);
  for (const stream of [child.stdout, child.stderr]) {
    let buf = '';
    stream.on('data', (d) => {
      buf += d;
      let k;
      while ((k = buf.indexOf('\n')) >= 0) { console.log(tag, buf.slice(0, k)); buf = buf.slice(k + 1); }
    });
  }
  child.on('exit', (code, sig) => { console.log(tag, `encerrado (${sig ?? code})`); if (!stopping && label === 'mundo') stop(); });
  children.push({ label, child });
  return child;
}

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  const wait = (c) => (c.exitCode != null || c.signalCode != null ? null : new Promise((r) => c.once('exit', r)));
  // zonas primeiro (salvam e liberam as posses), depois o mundo
  const zones = children.filter((c) => c.label !== 'mundo');
  for (const { child } of zones) child.kill('SIGTERM');
  await Promise.all(zones.map(({ child }) => wait(child)));
  for (const { child } of children.filter((c) => c.label === 'mundo')) { child.kill('SIGTERM'); await wait(child); }
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
// a ferramenta saiu por outro motivo (erro, sinal só para ela): nenhum processo filho fica para trás
process.on('exit', () => { for (const { child } of children) if (child.exitCode == null && child.signalCode == null) child.kill('SIGTERM'); });

run('mundo', 'world-main.js', ['--port', String(worldPort), '--host', host]);
await new Promise((r) => setTimeout(r, 400));
// Ctrl+C aqui é desligamento local: sem o prazo de aviso aos jogadores, a menos que peçam um
const grace = passthrough.includes('--shutdown-grace') ? [] : ['--shutdown-grace', '0'];
groups.forEach((maps, i) => {
  run(zoneName(i), 'main.js', ['--port', String(port + i), '--host', host, '--db', db, '--world', `ws://${host}:${worldPort}`,
    '--zone-id', zoneName(i), '--maps', maps.join(','), ...grace, ...passthrough]);
});
console.log(`mundo em ws://${host}:${worldPort} (saúde: http://${host}:${worldPort}/saude); banco ${db}`);
groups.forEach((maps, i) => console.log(`${zoneName(i)}: ws://${host}:${port + i} — ${maps.join(', ')}`));
console.log(`clientes entram por qualquer zona, ex.: --server=ws://${host}:${port}. Ctrl+C encerra tudo.`);
