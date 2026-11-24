// Métricas do servidor: duração de cada tick (com percentis), mensagens e bytes trocados, jogadores e
// recursos do processo. Expostas em HTTP (texto do Prometheus em /metrics, JSON em /metrics.json e
// saúde em /health) quando o servidor sobe com --metrics-port.
//
// No texto do Prometheus, tudo o que se acumula é contador monotônico (_total, desde a subida do processo):
// CPU, mensagens e bytes de entrada e saída, ticks, ticks lentos e espera do banco. Taxa e porcentagem
// saem no próprio Prometheus com rate()/increase() — uma média desde a subida vira linha reta depois de
// horas no ar e esconde um pico de agora. Os percentis do tick são da janela dos últimos 6000 ticks
// (10 min). O JSON continua com as médias por segundo desde o último POST /metrics/reset, que a ferramenta
// de carga usa para medir uma janela própria; o reset não mexe nos contadores.
import http from 'node:http';

const WINDOW = 6000; // últimos 6000 ticks (10 min a 10 Hz)

export class Metrics {
  constructor() {
    this.tick = new Float64Array(WINDOW);
    // contadores do processo inteiro (não zeram com a janela): denúncias e /bug gravados (D146)
    this.reportsTotal = 0;
    this.bugReportsTotal = 0;
    // contadores monotônicos (Prometheus): nunca zeram enquanto o processo vive
    this.total = { ticks: 0, slowTicks: 0, msgsIn: 0, bytesIn: 0, msgsOut: 0, bytesOut: 0, snapsOut: 0, snapBytesOut: 0 };
    this.lastTickAt = performance.now(); // fim do último tick (saúde: o laço do jogo parou?)
    this.reset();
  }

  // zera só a janela (percentis, médias do JSON); os contadores _total seguem
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
    this.total.ticks++;
    if (ms > this.maxTick) this.maxTick = ms;
    if (ms > 50) { this.slowTicks++; this.total.slowTicks++; }
    this.lastTickAt = performance.now();
  }

  in(bytes) { this.msgsIn++; this.bytesIn += bytes; this.total.msgsIn++; this.total.bytesIn += bytes; }
  out(bytes, snap = false) {
    this.msgsOut++;
    this.bytesOut += bytes;
    this.total.msgsOut++;
    this.total.bytesOut += bytes;
    if (snap) { this.snapsOut++; this.snapBytesOut += bytes; this.total.snapsOut++; this.total.snapBytesOut += bytes; }
  }

  /** Milissegundos desde o fim do último tick. */
  tickAgeMs() { return performance.now() - this.lastTickAt; }

  tickStats() {
    const arr = Array.from(this.tick.subarray(0, this.n)).sort((a, b) => a - b);
    const q = (p) => (arr.length ? arr[Math.min(arr.length - 1, Math.floor(p * arr.length))] : 0);
    const mean = arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
    return { n: arr.length, mean, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: arr.length ? arr[arr.length - 1] : 0, slow: this.slowTicks };
  }

  snapshot(extra = {}) {
    const secs = Math.max(0.001, (Date.now() - this.since) / 1000);
    const cpu = process.cpuUsage(this.cpu0);
    const cpuAll = process.cpuUsage(); // desde a subida do processo
    const mem = process.memoryUsage();
    return {
      uptimeS: Math.round(process.uptime()),
      windowS: Math.round(secs * 10) / 10,
      tickMs: this.tickStats(),
      ticks: this.ticks,
      lastTickAgoMs: Math.round(this.tickAgeMs()),
      // médias da janela (desde o último reset): para a ferramenta de carga
      msgsInPerS: this.msgsIn / secs,
      bytesInPerS: this.bytesIn / secs,
      msgsOutPerS: this.msgsOut / secs,
      bytesOutPerS: this.bytesOut / secs,
      snapBytesOutPerS: this.snapBytesOut / secs,
      cpuPct: ((cpu.user + cpu.system) / 1000 / (secs * 1000)) * 100,
      // contadores desde a subida (o que o Prometheus recebe)
      cpuS: (cpuAll.user + cpuAll.system) / 1e6,
      totals: { ...this.total },
      rssMb: mem.rss / 1048576,
      heapMb: mem.heapUsed / 1048576,
      reportsTotal: this.reportsTotal,
      bugReportsTotal: this.bugReportsTotal,
      ...extra,
    };
  }
}

// Linhas do formato de texto do Prometheus (versão 0.0.4).
function promLines() {
  const lines = [];
  const add = (type) => (name, help, v, labels = '') => {
    lines.push(`# HELP ${name} ${help}`, `# TYPE ${name} ${type}`, `${name}${labels} ${Number.isFinite(v) ? v : 0}`);
  };
  return { lines, gauge: add('gauge'), counter: add('counter') };
}

/** Texto no formato do Prometheus a partir de um objeto de métricas do servidor de zona. */
export function prometheusText(m) {
  const { lines, gauge, counter } = promLines();
  const t = m.totals ?? {};
  gauge('cinzas_players_online', 'Personagens no mundo.', m.players);
  gauge('cinzas_sessions', 'Conexões abertas.', m.sessions);
  gauge('cinzas_zones', 'Zonas e instâncias ativas.', m.zones);
  for (const k of ['p50', 'p95', 'p99', 'max', 'mean']) gauge(`cinzas_tick_ms_${k}`, `Duração do tick (${k}) em ms nos últimos 6000 ticks (10 min).`, m.tickMs[k]);
  gauge('cinzas_last_tick_age_seconds', 'Segundos desde o fim do último tick (acima de 5, o laço do jogo parou e /health responde 503).', (m.lastTickAgoMs ?? 0) / 1000);
  counter('cinzas_ticks_total', 'Ticks simulados desde a subida.', t.ticks);
  counter('cinzas_slow_ticks_total', 'Ticks acima de 50 ms desde a subida.', t.slowTicks);
  counter('cinzas_cpu_seconds_total', 'Tempo de CPU do processo (usuário + sistema) desde a subida, em segundos.', m.cpuS);
  counter('cinzas_msgs_in_total', 'Mensagens recebidas dos clientes desde a subida.', t.msgsIn);
  counter('cinzas_msgs_out_total', 'Mensagens enviadas aos clientes desde a subida.', t.msgsOut);
  counter('cinzas_bytes_in_total', 'Bytes recebidos dos clientes desde a subida.', t.bytesIn);
  counter('cinzas_bytes_out_total', 'Bytes enviados aos clientes desde a subida.', t.bytesOut);
  counter('cinzas_snapshot_bytes_out_total', 'Bytes enviados em snapshots desde a subida (parte de cinzas_bytes_out_total).', t.snapBytesOut);
  gauge('cinzas_rss_mb', 'Memória residente (MB).', m.rssMb);
  gauge('cinzas_heap_mb', 'Heap do JavaScript em uso (MB).', m.heapMb);
  gauge('cinzas_uptime_s', 'Tempo no ar (s).', m.uptimeS);
  if (m.maxPlayers != null) gauge('cinzas_max_players', 'Teto de jogadores no mundo (0 = sem limite).', m.maxPlayers);
  if (m.fullRefusals != null) counter('cinzas_server_full_total', 'Entradas recusadas com o servidor cheio (teto de jogadores) desde a subida.', m.fullRefusals);
  // denúncias e /bug gravados (D146)
  counter('cinzas_reports_total', 'Denúncias de jogadores gravadas desde que o processo subiu.', m.reportsTotal);
  counter('cinzas_bug_reports_total', 'Relatos de problema (/bug) gravados desde que o processo subiu.', m.bugReportsTotal);
  if (m.db) { // PostgreSQL: cada chamada pela ponte síncrona para o laço de eventos
    counter('cinzas_db_calls_total', 'Chamadas ao banco desde a subida.', m.db.totalCalls);
    counter('cinzas_db_wait_seconds_total', 'Segundos com o laço de eventos parado esperando o banco, desde a subida.', (m.db.totalWaitMs ?? 0) / 1000);
    for (const k of ['p50', 'p99', 'max']) gauge(`cinzas_db_call_ms_${k}`, `Duração de uma chamada ao banco (${k}) em ms nas últimas 8192 chamadas.`, m.db[`${k}Ms`]);
  }
  return lines.join('\n') + '\n';
}

// Endereço de quem pede as métricas: loopback ou rede privada (a rede do Docker Compose é 172.16.0.0/12;
// 100.64.0.0/10 é a de VPNs como Tailscale; ULA e link-local no IPv6). Qualquer outro recebe 403.
export function isInternalAddress(addr) {
  if (typeof addr !== 'string') return false;
  let a = addr.toLowerCase();
  if (a.startsWith('::ffff:')) a = a.slice(7); // IPv4 mapeado no IPv6
  if (a === '::1') return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(a);
  if (m) {
    const o1 = Number(m[1]), o2 = Number(m[2]);
    return o1 === 127 || o1 === 10 || (o1 === 172 && o2 >= 16 && o2 <= 31) || (o1 === 192 && o2 === 168)
      || (o1 === 169 && o2 === 254) || (o1 === 100 && o2 >= 64 && o2 <= 127);
  }
  return /^f[cd][0-9a-f]{0,2}:/.test(a) || /^fe[89ab][0-9a-f]?:/.test(a);
}

// Pedido que pode ver métricas: veio direto de um endereço interno (sem passar por proxy, que poria
// X-Forwarded-For) — defesa extra caso a porta acabe publicada ou repassada por engano.
function internalRequest(req) {
  return isInternalAddress(req.socket?.remoteAddress) && req.headers['x-forwarded-for'] == null && req.headers.forwarded == null;
}

/**
 * Servidor HTTP de métricas e saúde. `collect()` devolve o objeto de métricas atual; `health()` devolve
 * { ok, ... } (ok false responde 503, o que marca o contêiner como unhealthy no Docker). Só responde a
 * endereços internos (loopback e redes privadas): o resto recebe 403.
 */
export function startMetricsServer({ port, host = '127.0.0.1', collect, onReset, isHealthy = () => true, health = null, text = prometheusText }) {
  const srv = http.createServer((req, res) => {
    if (!internalRequest(req)) {
      res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
      return res.end('Métricas só pela rede interna.\n');
    }
    const url = (req.url || '/').split('?')[0];
    if (url === '/health') {
      const h = health ? health() : { ok: !!isHealthy() };
      res.writeHead(h.ok ? 200 : 503, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(h));
    }
    if (url === '/metrics.json') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(collect()));
    }
    if (url === '/metrics') {
      res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4; charset=utf-8' });
      return res.end(text(collect()));
    }
    if (url === '/metrics/reset' && req.method === 'POST' && onReset) {
      onReset();
      res.writeHead(204);
      return res.end();
    }
    res.writeHead(404);
    res.end();
  });
  return new Promise((resolve) => srv.listen(port, host, () => resolve(srv)));
}

// Rotas do serviço de contas que viram rótulo nas métricas; qualquer outro caminho conta como "outra" (um
// robô varrendo endereços não cria uma série nova por caminho).
export const ACCOUNTS_ROUTES = new Set(['/saude', '/termos', '/privacidade', '/contas', '/contas/verificar', '/contas/reenviar',
  '/sessoes', '/termos/aceitar', '/senha/esqueci', '/senha/redefinir', '/contas/dados', '/contas/excluir']);

/**
 * Contadores do serviço de contas (GET /metrics na porta de métricas dele, só rede interna): pedidos por
 * rota e resposta, cadastros, e-mails enviados e envios que falharam.
 */
export class AccountsMetrics {
  constructor() {
    this.requests = new Map(); // "rota|status" -> n
    this.signups = 0;
    this.mailSent = 0;
    this.mailFailed = 0;
  }

  request(route, status, routes = ACCOUNTS_ROUTES) {
    const r = routes.has(route) ? route : 'outra';
    const k = `${r}|${status}`;
    this.requests.set(k, (this.requests.get(k) ?? 0) + 1);
    // 202: conta criada, mas o e-mail do código não saiu (a falha conta em cinzas_accounts_email_failures_total)
    if (route === '/contas' && (status === 201 || status === 202)) this.signups++;
  }

  /** Embrulha o envio de e-mail para contar sucessos e falhas; o resto do objeto passa direto. */
  wrapMailer(mailer) {
    const send = async (msg) => {
      try {
        const r = await mailer.send(msg);
        this.mailSent++;
        return r;
      } catch (e) {
        this.mailFailed++;
        throw e;
      }
    };
    return new Proxy(mailer, {
      get(target, key) {
        if (key === 'send') return send;
        const v = Reflect.get(target, key, target);
        return typeof v === 'function' ? v.bind(target) : v;
      },
    });
  }

  summary() {
    return { requests: Object.fromEntries(this.requests), signups: this.signups, mailSent: this.mailSent, mailFailed: this.mailFailed, uptimeS: Math.round(process.uptime()) };
  }

  text() {
    const { lines, gauge, counter } = promLines();
    const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
    lines.push('# HELP cinzas_accounts_requests_total Pedidos ao serviço de contas por rota e código de resposta HTTP.', '# TYPE cinzas_accounts_requests_total counter');
    for (const [k, n] of [...this.requests].sort(([a], [b]) => (a < b ? -1 : 1))) {
      const [route, status] = k.split('|');
      lines.push(`cinzas_accounts_requests_total{route="${esc(route)}",status="${esc(status)}"} ${n}`);
    }
    counter('cinzas_accounts_signups_total', 'Contas criadas (cadastro aceito) desde a subida.', this.signups);
    counter('cinzas_accounts_emails_sent_total', 'E-mails entregues ao servidor de envio desde a subida.', this.mailSent);
    counter('cinzas_accounts_email_failures_total', 'Envios de e-mail que falharam desde a subida (servidor fora, recusa, certificado).', this.mailFailed);
    const cpu = process.cpuUsage();
    counter('cinzas_accounts_cpu_seconds_total', 'Tempo de CPU do processo de contas desde a subida, em segundos.', (cpu.user + cpu.system) / 1e6);
    gauge('cinzas_accounts_rss_mb', 'Memória residente do processo de contas (MB).', process.memoryUsage().rss / 1048576);
    gauge('cinzas_accounts_uptime_s', 'Tempo no ar do serviço de contas (s).', Math.round(process.uptime()));
    return lines.join('\n') + '\n';
  }
}
