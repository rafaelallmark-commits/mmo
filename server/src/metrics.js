// Métricas do servidor: duração de cada tick (com percentis), mensagens e bytes trocados, jogadores e
// recursos do processo. Expostas em HTTP (texto do Prometheus em /metrics, JSON em /metrics.json e
// saúde em /health) quando o servidor sobe com --metrics-port.
import http from 'node:http';

const WINDOW = 6000; // últimos 6000 ticks (10 min a 10 Hz)

export class Metrics {
  constructor() {
    this.tick = new Float64Array(WINDOW);
    this.reset();
  }

  reset() {
    this.n = 0;
    this.idx = 0;
    this.maxTick = 0;
    this.slowTicks = 0; // ticks acima de 50 ms
    this.ticks = 0;
    this.msgsIn = 0;
    this.bytesIn = 0;
    this.msgsOut = 0;
    this.bytesOut = 0;
    this.snapsOut = 0;
    this.snapBytesOut = 0;
    this.since = Date.now();
    this.cpu0 = process.cpuUsage();
  }

  recordTick(ms) {
    this.tick[this.idx] = ms;
    this.idx = (this.idx + 1) % WINDOW;
    if (this.n < WINDOW) this.n++;
    this.ticks++;
    if (ms > this.maxTick) this.maxTick = ms;
    if (ms > 50) this.slowTicks++;
  }

  in(bytes) { this.msgsIn++; this.bytesIn += bytes; }
  out(bytes, snap = false) {
    this.msgsOut++;
    this.bytesOut += bytes;
    if (snap) { this.snapsOut++; this.snapBytesOut += bytes; }
  }

  tickStats() {
    const arr = Array.from(this.tick.subarray(0, this.n)).sort((a, b) => a - b);
    const q = (p) => (arr.length ? arr[Math.min(arr.length - 1, Math.floor(p * arr.length))] : 0);
    const mean = arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
    return { n: arr.length, mean, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: arr.length ? arr[arr.length - 1] : 0, slow: this.slowTicks };
  }

  snapshot(extra = {}) {
    const secs = Math.max(0.001, (Date.now() - this.since) / 1000);
    const cpu = process.cpuUsage(this.cpu0);
    const mem = process.memoryUsage();
    return {
      uptimeS: Math.round(process.uptime()),
      windowS: Math.round(secs * 10) / 10,
      tickMs: this.tickStats(),
      ticks: this.ticks,
      msgsInPerS: this.msgsIn / secs,
      bytesInPerS: this.bytesIn / secs,
      msgsOutPerS: this.msgsOut / secs,
      bytesOutPerS: this.bytesOut / secs,
      snapBytesOutPerS: this.snapBytesOut / secs,
      cpuPct: ((cpu.user + cpu.system) / 1000 / (secs * 1000)) * 100,
      rssMb: mem.rss / 1048576,
      heapMb: mem.heapUsed / 1048576,
      ...extra,
    };
  }
}

/** Texto no formato do Prometheus a partir de um objeto de métricas. */
export function prometheusText(m) {
  const lines = [];
  const g = (name, help, v, labels = '') => {
    lines.push(`# HELP cinzas_${name} ${help}`, `# TYPE cinzas_${name} gauge`, `cinzas_${name}${labels} ${Number.isFinite(v) ? v : 0}`);
  };
  g('players_online', 'Personagens no mundo.', m.players);
  g('sessions', 'Conexões abertas.', m.sessions);
  g('zones', 'Zonas e instâncias ativas.', m.zones);
  for (const k of ['p50', 'p95', 'p99', 'max', 'mean']) g(`tick_ms_${k}`, `Duração do tick (${k}) em ms.`, m.tickMs[k]);
  g('slow_ticks_total', 'Ticks acima de 50 ms desde o início da janela.', m.tickMs.slow);
  g('msgs_in_per_s', 'Mensagens recebidas por segundo.', m.msgsInPerS);
  g('msgs_out_per_s', 'Mensagens enviadas por segundo.', m.msgsOutPerS);
  g('bytes_out_per_s', 'Bytes enviados por segundo.', m.bytesOutPerS);
  g('bytes_in_per_s', 'Bytes recebidos por segundo.', m.bytesInPerS);
  g('cpu_pct', 'Uso de CPU do processo na janela (%).', m.cpuPct);
  g('rss_mb', 'Memória residente (MB).', m.rssMb);
  g('uptime_s', 'Tempo no ar (s).', m.uptimeS);
  if (m.db) { // PostgreSQL: cada chamada pela ponte síncrona para o laço de eventos
    g('db_calls_per_s', 'Chamadas ao banco por segundo.', m.db.callsPerS);
    g('db_wait_ms_per_s', 'Milissegundos por segundo com o laço de eventos parado esperando o banco.', m.db.waitMsPerS);
    for (const k of ['p50', 'p99', 'max']) g(`db_call_ms_${k}`, `Duração de uma chamada ao banco (${k}) em ms.`, m.db[`${k}Ms`]);
  }
  return lines.join('\n') + '\n';
}

/** Servidor HTTP de métricas e saúde. `collect()` devolve o objeto de métricas atual. */
export function startMetricsServer({ port, host = '127.0.0.1', collect, onReset, isHealthy = () => true }) {
  const srv = http.createServer((req, res) => {
    const url = (req.url || '/').split('?')[0];
    if (url === '/health') {
      const ok = isHealthy();
      res.writeHead(ok ? 200 : 503, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ ok }));
    }
    if (url === '/metrics.json') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(collect()));
    }
    if (url === '/metrics') {
      res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4' });
      return res.end(prometheusText(collect()));
    }
    if (url === '/metrics/reset' && req.method === 'POST') {
      onReset?.();
      res.writeHead(204);
      return res.end();
    }
    res.writeHead(404);
    res.end();
  });
  return new Promise((resolve) => srv.listen(port, host, () => resolve(srv)));
}
