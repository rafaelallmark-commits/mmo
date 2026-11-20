// Teste de carga: N clientes simulados numa mesma zona andando, atacando e medindo a latência.
//
//   node tools/carga.mjs --clientes 100 --duracao 60 [--aquecimento 15] [--mapa estrada_velha]
//                        [--url ws://127.0.0.1:7777 --metricas http://127.0.0.1:9100] [--lag-ms 0]
//                        [--saida relatorio.json] [--md docs/relatorio-carga.md]
//
// Sem --url, sobe um servidor próprio (banco temporário, métricas numa porta livre) e o encerra no fim.
// Mede no servidor: duração do tick (p50/p95/p99/máx), ticks > 50 ms, CPU, memória e bytes enviados;
// nos clientes: ida e volta do "ping" (p50/p95/p99), intervalo entre snapshots e banda recebida.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const here = dirname(fileURLToPath(import.meta.url));
function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = process.argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
}
const N = Number(arg('clientes', 100));
const DURATION = Number(arg('duracao', 60));
const WARMUP = Number(arg('aquecimento', 15));
const MAP = arg('mapa', 'estrada_velha');
const LAG = Number(arg('lag-ms', 0));
const RAMP = Number(arg('entradas-por-s', 20));
const FULL = !!arg('completo', false); // snapshots completos (sem diferença/interesse), para comparar
let URL = arg('url', null);
let METRICS = arg('metricas', null);
const OUT = arg('saida', null);
const MD = arg('md', null);
const TAG = Math.random().toString(36).slice(2, 7);
const CLASSES = ['breaker', 'bastion', 'pikeman', 'warden', 'dawnshield', 'windwalker', 'veilsinger', 'emberweaver'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (arr, p) => { if (!arr.length) return 0; const a = [...arr].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };
const r1 = (v) => Math.round(v * 10) / 10;

async function startOwnServer() {
  const dir = mkdtempSync(join(tmpdir(), 'cinzas-carga-'));
  const port = 7700 + Math.floor(Math.random() * 200);
  const mport = 9300 + Math.floor(Math.random() * 200);
  const args = ['--disable-warning=ExperimentalWarning', join(here, '../src/main.js'), '--port', String(port), '--db', join(dir, 'carga.db'), '--metrics-port', String(mport)];
  if (LAG > 0) args.push('--lag-ms', String(LAG));
  const proc = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  proc.stdout.on('data', (d) => { out += d; });
  proc.stderr.on('data', (d) => { out += d; });
  for (let i = 0; i < 100 && !out.includes('métricas em'); i++) await sleep(100);
  if (!out.includes('métricas em')) throw new Error('servidor não subiu:\n' + out);
  return { proc, dir, url: `ws://127.0.0.1:${port}`, metrics: `http://127.0.0.1:${mport}` };
}

class Bot {
  constructor(i) {
    this.i = i;
    this.rid = 0;
    this.pending = new Map();
    this.rtts = [];
    this.snapGaps = [];
    this.lastSnap = 0;
    this.bytes = 0;
    this.snaps = 0;
    this.measuring = false;
    this.ents = new Map();
    this.errors = 0;
  }
  connect(url) {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url, { perMessageDeflate: false });
      this.ws.on('open', resolve);
      this.ws.on('error', reject);
      this.ws.on('message', (buf, isBinary) => this.onMessage(buf));
      this.ws.on('close', () => { this.closed = true; });
    });
  }
  onMessage(buf) {
    const now = performance.now();
    if (this.measuring) this.bytes += buf.length;
    if (buf[2] === 0x74 && buf[6] === 0x73 && buf[7] === 0x6e) { // {"t":"sn...
      if (this.measuring) {
        this.snaps++;
        if (this.lastSnap) this.snapGaps.push(now - this.lastSnap);
      }
      this.lastSnap = now;
      if (FULL) { this.snapText = buf; return; } // completo: só decodifica quando precisa
      const m = JSON.parse(buf.toString());
      if (m.full) this.ents.clear();
      for (const d of m.ents) this.ents.set(d.id, { ...(this.ents.get(d.id) ?? {}), ...d });
      for (const id of m.gone) this.ents.delete(id);
      return;
    }
    let m;
    try { m = JSON.parse(buf.toString()); } catch { return; }
    if (m.t === 'res') {
      const p = this.pending.get(m.rid);
      if (p) { this.pending.delete(m.rid); p(m); }
    }
  }
  request(t, payload = {}) {
    const rid = `${this.i}-${++this.rid}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(rid); reject(new Error(`sem resposta: ${t}`)); }, 20000);
      this.pending.set(rid, (m) => { clearTimeout(timer); resolve(m); });
      this.ws.send(JSON.stringify({ t, rid, ...payload }));
    });
  }
  async join() {
    const account = `carga_${TAG}_${this.i}`;
    await this.request('register', { account, password: 'carga123' });
    const lg = await this.request('login', { account, password: 'carga123', delta: !FULL });
    if (!lg.ok) throw new Error('login: ' + lg.reason);
    const cls = CLASSES[this.i % CLASSES.length];
    const cr = await this.request('create_char', { name: `C${TAG}${this.i}`, classId: cls });
    if (!cr.ok) throw new Error('criar: ' + cr.reason);
    const en = await this.request('enter', { charId: cr.char.id });
    if (!en.ok) throw new Error('entrar: ' + en.reason);
    this.char = en.char;
    this.home = { x: en.char.x, z: en.char.z };
  }
  async ping() {
    const t0 = performance.now();
    try {
      await this.request('ping');
      if (this.measuring) this.rtts.push(performance.now() - t0);
    } catch { this.errors++; }
  }
  // anda pela região perto do posto e, de vez em quando, ataca o monstro mais próximo
  async act() {
    try {
      const list = FULL ? (this.snapText ? JSON.parse(this.snapText.toString()).ents : []) : [...this.ents.values()];
      if (Math.random() < 0.3 && list.length) {
        const me = list.find((e) => e.id === this.char.eid);
        let best = null, bd = 1e9;
        for (const e of list) {
          if (e.k !== 'm' || !me) continue;
          const d = Math.hypot(e.x - me.x, e.z - me.z);
          if (d < bd) { bd = d; best = e; }
        }
        if (best && bd < 25) { await this.request('attack', { target: best.id }); return; }
      }
      const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 30;
      await this.request('move', { x: this.home.x + Math.cos(a) * r, z: this.home.z + Math.sin(a) * r });
    } catch { this.errors++; }
  }
}

async function main() {
  let own = null;
  if (!URL) {
    own = await startOwnServer();
    URL = own.url;
    METRICS = own.metrics;
  }
  console.log(`carga: ${N} clientes em ${URL} (${MAP}), aquecimento ${WARMUP}s, medição ${DURATION}s${LAG ? `, atraso ${LAG} ms` : ''}${FULL ? ', snapshots completos' : ''}`);
  const bots = [];
  const t0 = Date.now();
  for (let i = 0; i < N; i++) {
    const b = new Bot(i);
    bots.push(b);
    await b.connect(URL);
    b.join().catch((e) => { b.failed = e.message; });
    if ((i + 1) % RAMP === 0) await sleep(1000);
  }
  for (let k = 0; k < 300 && bots.some((b) => !b.char && !b.failed); k++) await sleep(100);
  const joined = bots.filter((b) => b.char);
  console.log(`  ${joined.length}/${N} no mundo em ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  // comportamento contínuo: cada bot decide a cada 2–5 s e mede o ping a cada 2 s
  let running = true;
  for (const b of joined) {
    (async () => { await sleep(Math.random() * 2000); while (running && !b.closed) { await b.act(); await sleep(2000 + Math.random() * 3000); } })();
    (async () => { await sleep(Math.random() * 2000); while (running && !b.closed) { await b.ping(); await sleep(2000); } })();
  }
  await sleep(WARMUP * 1000);
  if (METRICS) await fetch(`${METRICS}/metrics/reset`, { method: 'POST' }).catch(() => {});
  for (const b of joined) b.measuring = true;
  const lagProbe = [];
  const probeTimer = setInterval(() => { const t = performance.now(); setImmediate(() => lagProbe.push(performance.now() - t)); }, 200);
  await sleep(DURATION * 1000);
  for (const b of joined) b.measuring = false;
  clearInterval(probeTimer);
  const srv = METRICS ? await fetch(`${METRICS}/metrics.json`).then((r) => r.json()).catch(() => null) : null;
  running = false;
  const rtts = joined.flatMap((b) => b.rtts);
  const gaps = joined.flatMap((b) => b.snapGaps);
  const kbps = joined.map((b) => b.bytes / DURATION / 1024);
  const report = {
    data: new Date().toISOString(), clientes: N, conectados: joined.length, falhas: bots.filter((b) => b.failed).map((b) => b.failed).slice(0, 5),
    mapa: MAP, duracaoS: DURATION, atrasoArtificialMs: LAG, snapshots: FULL ? 'completos' : 'por diferença e interesse',
    servidor: srv && {
      tickMs: { p50: r1(srv.tickMs.p50), p95: r1(srv.tickMs.p95), p99: r1(srv.tickMs.p99), max: r1(srv.tickMs.max), media: r1(srv.tickMs.mean), acima50ms: srv.tickMs.slow, amostras: srv.tickMs.n },
      cpuPct: r1(srv.cpuPct), rssMb: r1(srv.rssMb), jogadores: srv.players,
      kbEnviadosPorS: r1(srv.bytesOutPerS / 1024), kbSnapshotsPorS: r1(srv.snapBytesOutPerS / 1024), msgsRecebidasPorS: r1(srv.msgsInPerS),
    },
    clientesMedidos: {
      pingMs: { p50: r1(pct(rtts, 0.5)), p95: r1(pct(rtts, 0.95)), p99: r1(pct(rtts, 0.99)), max: r1(pct(rtts, 1)), amostras: rtts.length },
      intervaloSnapshotsMs: { p50: r1(pct(gaps, 0.5)), p95: r1(pct(gaps, 0.95)), p99: r1(pct(gaps, 0.99)) },
      kbRecebidosPorSPorCliente: { media: r1(kbps.reduce((s, v) => s + v, 0) / Math.max(1, kbps.length)), max: r1(Math.max(0, ...kbps)) },
      erros: joined.reduce((s, b) => s + b.errors, 0),
      atrasoDoGeradorMs: { p95: r1(pct(lagProbe, 0.95)), max: r1(pct(lagProbe, 1)) },
    },
  };
  report.aprovado = !!(srv && srv.tickMs.slow === 0 && srv.tickMs.max <= 50 && joined.length === N);
  console.log(JSON.stringify(report, null, 2));
  if (OUT) writeFileSync(OUT, JSON.stringify(report, null, 2));
  if (MD) writeFileSync(MD, markdown(report));
  for (const b of bots) try { b.ws.close(); } catch { /* */ }
  if (own) { own.proc.kill('SIGTERM'); await sleep(500); rmSync(own.dir, { recursive: true, force: true }); }
  process.exit(report.aprovado ? 0 : 1);
}

function markdown(r) {
  const s = r.servidor || {};
  const c = r.clientesMedidos;
  return `# Teste de carga — ${r.clientes} clientes (${r.data.slice(0, 10)})

Comando: \`node tools/carga.mjs --clientes ${r.clientes} --duracao ${r.duracaoS}${r.atrasoArtificialMs ? ` --lag-ms ${r.atrasoArtificialMs}` : ''}\`
(${r.conectados}/${r.clientes} conectados no mapa \`${r.mapa}\`, medição de ${r.duracaoS} s depois do aquecimento, snapshots ${r.snapshots}).

| Servidor | p50 | p95 | p99 | máx |
|---|---|---|---|---|
| Duração do tick (ms) | ${s.tickMs?.p50} | ${s.tickMs?.p95} | ${s.tickMs?.p99} | ${s.tickMs?.max} |

Ticks acima de 50 ms: **${s.tickMs?.acima50ms}** de ${s.tickMs?.amostras}. CPU do processo: ${s.cpuPct}%. Memória: ${s.rssMb} MB.
Banda enviada: ${s.kbEnviadosPorS} KB/s no total (${s.kbSnapshotsPorS} KB/s de snapshots).

| Clientes | p50 | p95 | p99 | máx |
|---|---|---|---|---|
| Ida e volta do ping (ms) | ${c.pingMs.p50} | ${c.pingMs.p95} | ${c.pingMs.p99} | ${c.pingMs.max} |
| Intervalo entre snapshots (ms) | ${c.intervaloSnapshotsMs.p50} | ${c.intervaloSnapshotsMs.p95} | ${c.intervaloSnapshotsMs.p99} | — |

Banda recebida por cliente: média ${c.kbRecebidosPorSPorCliente.media} KB/s (máx ${c.kbRecebidosPorSPorCliente.max} KB/s). Erros: ${c.erros}.
Atraso do próprio gerador de carga (p95/máx): ${c.atrasoDoGeradorMs.p95}/${c.atrasoDoGeradorMs.max} ms.

Resultado: **${r.aprovado ? 'aprovado' : 'reprovado'}** (critério: nenhum tick acima de 50 ms com todos conectados).
`;
}

main().catch((e) => { console.error(e); process.exit(2); });
