// Teste de fumaça da implantação (docs/10-subir-no-vps.md): joga pelo mesmo caminho dos jogadores — o serviço de
// contas em https://DOMINIO/contas e a zona em wss://DOMINIO, através do proxy — e confere, numa conta nova:
// página do jogo, métricas fora do proxy, cadastro com e-mail, código de confirmação, sessão (token), entrada na
// zona, personagem, mundo, movimento, combate, saque, equipamento, ouro, missão e saída; depois, numa conexão
// nova, que o personagem voltou igual (posição, bolsa, equipados, ouro, XP e missões).
//
//   node tools/fumaca-deploy.mjs --url https://jogo.exemplo.com.br --email voce+fumaca1@gmail.com
//        [--estado ARQUIVO]       guarda conta, senha e o retrato do personagem, para conferir depois com
//                                 --conferir (de um reinício dos contêineres, por exemplo)
//        [--codigos-dir PASTA]    lê o código dos e-mails gravados nessa pasta (CINZAS_EMAIL=arquivo ou um SMTP
//                                 de teste) em vez de perguntar no terminal
//        [--excluir]              exclui a conta de teste no fim (pelo serviço de contas)
//        [--classe breaker]       classe do personagem de teste (padrão breaker)
//   node tools/fumaca-deploy.mjs --conferir ARQUIVO [--excluir]
//        entra de novo com a conta guardada por --estado e confere que o personagem está como foi guardado; com
//        --excluir, exclui a conta e apaga o arquivo no fim
//   --contas URL e --ws URL trocam os endereços deduzidos de --url (https://h → https://h/contas e wss://h); sem
//   --url (só --contas e --ws), a página do jogo e as métricas não são conferidas. --tempo SEGUNDOS: prazo total
//   (padrão 300). Certificado de uma CA privada (ensaio com a CA interna do Caddy): NODE_EXTRA_CA_CERTS=ca.crt.
//
// No VPS, de dentro do contêiner do servidor (o arquivo fica no volume de dados, que sobrevive aos reinícios):
//   docker compose exec servidor node tools/fumaca-deploy.mjs --url https://DOMINIO --email EU@... --estado /data/fumaca.json
// Saída: 0 se tudo deu certo; 1 na primeira falha (com o passo e o motivo); 2 para opção errada.
import http from 'node:http';
import https from 'node:https';
import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const PROTOCOL = 3; // o mesmo PROTOCOL_VERSION do servidor (src/server.js)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const d2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export class StepError extends Error {}

// Erro de rede → frase com o que conferir (DNS, firewall, certificado, proxy).
export function networkHint(e) {
  const m = `${e?.code ?? ''} ${e?.message ?? e}`;
  if (/ENOTFOUND|EAI_AGAIN/.test(m)) return `${e.message} — o nome não resolve: confira o registro A do domínio no DNS (pode levar alguns minutos para valer).`;
  if (/ECONNREFUSED/.test(m)) return `${e.message} — nada escutando nessa porta: o proxy está no ar? (docker compose ps; docker compose logs proxy)`;
  if (/ETIMEDOUT|sem resposta|ECONNRESET|socket hang up/.test(m)) return `${e.message} — sem resposta: firewall do VPS ou do provedor liberando as portas 80 e 443? proxy no ar?`;
  if (/certificate|self.signed|SELF_SIGNED|UNABLE_TO_VERIFY|CERT_|altnames/i.test(m)) return `${e.message} — certificado inválido para esse nome: veja docker compose logs proxy (o Let's Encrypt precisa do DNS apontando para o VPS e da porta 80 aberta).`;
  return String(e?.message ?? e);
}

// Pedido HTTP(S) com corpo JSON; resolve { status, headers, text, json } (json = null se a resposta não é JSON).
export function httpRequest(method, url, body = null, timeoutMs = 20_000) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const data = body == null ? null : Buffer.from(JSON.stringify(body));
    const headers = { 'user-agent': 'cinzas-fumaca-deploy', ...(data ? { 'content-type': 'application/json', 'content-length': data.length } : {}) };
    const req = lib.request(u, { method, headers, timeout: timeoutMs }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch { /* não é JSON */ }
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    req.on('timeout', () => req.destroy(new Error(`sem resposta em ${timeoutMs / 1000} s`)));
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// Código de 6 dígitos do e-mail mais novo para `email` gravado em `dir` depois de `since` (ms). Os .eml do modo
// "arquivo" (src/mailer.js) e os de um SMTP de teste têm o mesmo formato: cabeçalhos, linha vazia e o texto em
// base64. Devolve null se ainda não chegou.
export function codeFromDir(dir, email, since = 0) {
  let files;
  try { files = readdirSync(dir).filter((f) => f.endsWith('.eml')).sort().reverse(); } catch { return null; }
  for (const f of files) {
    const stamp = Number(/^(\d{13})-/.exec(f)?.[1] ?? NaN);
    if (Number.isFinite(stamp) && stamp < since - 2000) break; // os nomes começam com a hora: daqui para trás é velho
    let raw;
    try { raw = readFileSync(join(dir, f), 'utf8'); } catch { continue; }
    const cut = raw.indexOf('\r\n\r\n');
    if (cut < 0) continue;
    const head = raw.slice(0, cut);
    const to = /^To:\s*(.+)$/mi.exec(head)?.[1]?.trim() ?? '';
    if (to.toLowerCase() !== email.toLowerCase() && !to.toLowerCase().includes(`<${email.toLowerCase()}>`)) continue;
    const body = /base64/i.test(head) ? Buffer.from(raw.slice(cut + 4).replace(/\s+/g, ''), 'base64').toString('utf8') : raw.slice(cut + 4);
    const code = /\b(\d{6})\b/.exec(body)?.[1];
    if (code) return code;
  }
  return null;
}

// Cliente da zona: o mesmo protocolo JSON do cliente Godot, com snapshots completos (sem "delta").
export class ZoneClient {
  constructor(url) {
    this.url = url;
    this.rid = 0;
    this.pending = new Map();
    this.waiters = [];
    this.snap = null;
    this.char = null;
    this.hello = null;
    this.loot = new Map();
    this.closedReason = null;
  }

  connect(timeoutMs = 15_000) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url, { handshakeTimeout: timeoutMs });
      this.ws = ws;
      let opened = false;
      ws.on('open', () => { opened = true; });
      ws.on('message', (buf) => {
        let m;
        try { m = JSON.parse(buf.toString()); } catch { return; }
        if (m.t === 'hello' && !this.hello) { this.hello = m; resolve(m); }
        this.onMessage(m);
      });
      ws.on('error', (e) => { if (!opened || !this.hello) reject(e); });
      ws.on('unexpected-response', (_req, res) => reject(new Error(`o endereço respondeu HTTP ${res.statusCode} em vez de abrir o WebSocket (proxy mandando o pedido para outro lugar?)`)));
      ws.on('close', (code, reason) => {
        this.closedReason = `conexão fechada (${code}${reason?.length ? `: ${reason}` : ''})`;
        for (const [, p] of this.pending) p.reject(new Error(this.closedReason));
        this.pending.clear();
        if (!this.hello) reject(new Error(`${this.closedReason} antes do hello do servidor`));
      });
      setTimeout(() => { if (!this.hello) { reject(new Error(`sem o hello do servidor em ${timeoutMs / 1000} s`)); try { ws.terminate(); } catch { /* já fechado */ } } }, timeoutMs);
    });
  }

  onMessage(m) {
    if (m.t === 'res') {
      const p = this.pending.get(m.rid);
      if (p) { this.pending.delete(m.rid); p.resolve(m); }
      if (m.char && m.char.items) this.char = m.char;
    } else if (m.t === 'snap') this.snap = m;
    else if (m.t === 'char') this.char = m.char;
    else if (m.t === 'loot') this.loot.set(m.loot.id, m.loot);
    else if (m.t === 'zone') { this.snap = m.snapshot; if (m.char) this.char = m.char; this.loot = new Map((m.loot ?? []).map((l) => [l.id, l])); }
    for (const w of [...this.waiters]) {
      if (w.pred(m)) { this.waiters.splice(this.waiters.indexOf(w), 1); clearTimeout(w.timer); w.resolve(m); }
    }
  }

  request(t, payload = {}, timeoutMs = 15_000) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return Promise.reject(new Error(this.closedReason ?? 'conexão fechada'));
    const rid = `fumaca-${++this.rid}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(rid); reject(new Error(`sem resposta para "${t}" em ${timeoutMs / 1000} s`)); }, timeoutMs);
      this.pending.set(rid, { resolve: (m) => { clearTimeout(timer); resolve(m); }, reject: (e) => { clearTimeout(timer); reject(e); } });
      this.ws.send(JSON.stringify({ t, rid, ...payload }));
    });
  }

  waitFor(pred, timeoutMs, what) {
    return new Promise((resolve, reject) => {
      const w = { pred, resolve, timer: setTimeout(() => { this.waiters.splice(this.waiters.indexOf(w), 1); reject(new Error(`tempo esgotado esperando ${what}`)); }, timeoutMs) };
      this.waiters.push(w);
    });
  }

  entity(eid) { return this.snap?.ents?.find((e) => e.id === eid) ?? null; }
  me() { return this.char ? this.entity(this.char.eid) : null; }

  close() {
    if (!this.ws || this.ws.readyState === WebSocket.CLOSED) return Promise.resolve();
    return new Promise((r) => { this.ws.once('close', r); this.ws.close(1000, 'fim do teste de fumaça'); setTimeout(r, 3000); });
  }
}

// O que precisa voltar igual numa conexão nova: lugar, nível, XP, ouro, cada item (bolsa, equipados, refino) e
// cada missão (estado e progresso de cada objetivo).
export function portrait(char, journal) {
  const items = (char.items ?? []).map(({ id, defId, qty, enh, loc, slot }) => ({ id, defId, qty, enh: enh || 0, loc, slot: slot ?? null }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const quests = (journal?.active ?? []).map((q) => ({ id: q.id, state: q.state, objectives: (q.objectives ?? []).map((o) => ({ done: !!o.done, cur: o.cur ?? null, need: o.need ?? null })) }))
    .concat((journal?.done ?? []).map((q) => ({ id: q.id, state: 'done' })))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { id: char.id, name: char.name, mapId: char.mapId, x: char.x, z: char.z, level: char.level, xp: char.xp, gold: char.gold, items, quests };
}

// Diferenças entre dois retratos, em frases (lista vazia = iguais). A posição aceita 0,5 m de diferença.
export function comparePortraits(want, got) {
  const out = [];
  for (const k of ['id', 'name', 'mapId', 'level', 'xp', 'gold']) if (want[k] !== got[k]) out.push(`${k}: esperado ${JSON.stringify(want[k])}, veio ${JSON.stringify(got[k])}`);
  const dist = Math.hypot((want.x ?? 0) - (got.x ?? 0), (want.z ?? 0) - (got.z ?? 0));
  if (!(dist <= 0.5)) out.push(`posição: esperada (${want.x}, ${want.z}), veio (${got.x}, ${got.z}) — ${dist.toFixed(2)} m`);
  const items = (p) => new Map(p.items.map((i) => [i.id, JSON.stringify(i)]));
  const [wi, gi] = [items(want), items(got)];
  for (const [id, s] of wi) if (gi.get(id) !== s) out.push(`item ${s}: ${gi.has(id) ? `veio ${gi.get(id)}` : 'sumiu'}`);
  for (const [id, s] of gi) if (!wi.has(id)) out.push(`item a mais: ${s}`);
  if (JSON.stringify(want.quests) !== JSON.stringify(got.quests)) out.push(`missões: esperado ${JSON.stringify(want.quests)}, veio ${JSON.stringify(got.quests)}`);
  return out;
}

export const describeItems = (p, defs) => {
  const name = (id) => defs?.[id]?.name ?? id;
  const eq = p.items.filter((i) => i.loc === 'equip').map((i) => `${name(i.defId)} (${i.slot})`);
  const bag = p.items.filter((i) => i.loc === 'bag').map((i) => `${name(i.defId)}${i.qty > 1 ? ` x${i.qty}` : ''}`);
  return `equipados: ${eq.join(', ') || 'nada'}; bolsa: ${bag.join(', ') || 'vazia'}`;
};

// ------------------------------------------------------------------------------------------------------------
// Execução pela linha de comando
// ------------------------------------------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) return { error: `argumento inesperado: ${a}` };
    const k = a.slice(2);
    if (['excluir', 'ajuda'].includes(k)) { opts[k] = true; continue; }
    if (!['url', 'contas', 'ws', 'email', 'estado', 'conferir', 'codigos-dir', 'classe', 'tempo'].includes(k)) return { error: `opção desconhecida: ${a}` };
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) return { error: `${a} precisa de um valor` };
    opts[k] = v;
    i++;
  }
  return { opts };
}

export function endpoints(opts) {
  let contas = opts.contas ?? null, ws = opts.ws ?? null, site = null;
  if (opts.url) {
    const u = new URL(opts.url);
    if (!/^https?:$/.test(u.protocol)) throw new StepError('--url precisa começar com https:// (ou http:// num ensaio sem TLS)');
    site = `${u.protocol}//${u.host}`;
    contas ??= `${site}/contas`;
    ws ??= `${u.protocol === 'https:' ? 'wss' : 'ws'}://${u.host}`;
  }
  if (!contas || !ws) throw new StepError('diga o endereço do jogo com --url https://DOMINIO (ou --contas e --ws)');
  return { site, contas: contas.replace(/\/+$/, ''), ws };
}

async function main() {
  const { opts, error } = parseArgs(process.argv.slice(2));
  const usage = 'uso: node tools/fumaca-deploy.mjs --url https://DOMINIO --email voce@exemplo.com [--estado arquivo.json] [--codigos-dir pasta] [--excluir]\n' +
    '     node tools/fumaca-deploy.mjs --conferir arquivo.json [--excluir]   (detalhes no começo deste arquivo e em docs/10-subir-no-vps.md)';
  if (error || opts.ajuda) { console.error(error ? `${error}\n${usage}` : usage); process.exit(error ? 2 : 0); }
  let saved = null;
  if (opts.conferir) {
    try { saved = JSON.parse(readFileSync(opts.conferir, 'utf8')); } catch (e) { console.error(`--conferir: não deu para ler ${opts.conferir}: ${e.message}`); process.exit(2); }
    for (const k of ['url', 'contas', 'ws']) opts[k] ??= saved[k] ?? undefined;
  } else if (!opts.email) { console.error(`falta --email (o endereço que vai receber o código de confirmação)\n${usage}`); process.exit(2); }
  const limitS = Number(opts.tempo ?? 300);
  if (!(limitS > 0)) { console.error('--tempo precisa de segundos'); process.exit(2); }
  let ep;
  try { ep = endpoints(opts); } catch (e) { console.error(e.message); process.exit(2); }

  const t0 = Date.now();
  let n = 0;
  const log = (s) => console.log(`[fumaça] ${s}`);
  const step = async (title, fn) => {
    n++;
    try {
      const detail = await Promise.race([fn(), sleep(Math.max(1000, t0 + limitS * 1000 - Date.now())).then(() => { throw new StepError(`prazo total de ${limitS} s esgotado (--tempo)`); })]);
      log(`ok ${String(n).padStart(2)}. ${title}${detail ? ` — ${detail}` : ''}`);
      return detail;
    } catch (e) {
      log(`FALHOU ${n}. ${title}: ${e instanceof StepError ? e.message : networkHint(e)}`);
      process.exitCode = 1;
      throw e;
    }
  };
  const expectOk = (r, what) => {
    if (r.status >= 200 && r.status < 300 && r.json?.ok) return r.json;
    throw new StepError(`${what}: HTTP ${r.status}${r.json?.erro ? ` — ${r.json.erro}` : r.json ? '' : ` (resposta não é do serviço de contas: ${r.text.slice(0, 80).replace(/\s+/g, ' ')})`}${r.status >= 500 ? ' (docker compose logs contas)' : ''}`);
  };
  const post = (path, body) => httpRequest('POST', `${ep.contas}${path}`, body);

  log(`${saved ? 'conferindo de novo a conta de ' + opts.conferir : 'conta nova'} em ${ep.site ?? ep.contas} (contas: ${ep.contas}; jogo: ${ep.ws})`);
  let zone = null;
  const defsRef = { items: null };
  // entra na zona com um token novo do serviço de contas; devolve a resposta do login
  const joinZone = async (conta, senha) => {
    const s = expectOk(await post('/sessoes', { conta, senha }), 'sessão recusada');
    zone = new ZoneClient(ep.ws);
    const defs = new Promise((resolve) => { zone.waitFor((m) => m.t === 'defs', 20_000, 'definições').then((m) => { defsRef.items = m.items; resolve(); }, resolve); });
    await zone.connect();
    const h = zone.hello;
    if (h.protocol !== PROTOCOL) throw new StepError(`servidor com protocolo ${h.protocol}, esta ferramenta fala o ${PROTOCOL}: use a ferramenta da mesma versão do servidor`);
    const r = await zone.request('login_token', { token: s.token });
    if (!r.ok) throw new StepError(`a zona recusou o token: ${r.reason}`);
    await defs;
    return { r, hello: h, expiresIn: s.expiraEm };
  };
  const enterChar = async (charId) => {
    const r = await zone.request('enter', { charId });
    if (!r.ok) throw new StepError(`a zona recusou a entrada: ${r.reason}`);
    zone.snap = r.snapshot; zone.char = r.char;
    for (const l of r.loot ?? []) zone.loot.set(l.id, l);
    return r;
  };
  const currentPortrait = async () => {
    const c = await zone.request('char');
    const q = await zone.request('quests');
    return portrait(c.char, q.journal);
  };
  const goTo = async (x, z, timeoutMs = 25_000) => {
    const r = await zone.request('move', { x, z });
    if (!r.ok) throw new StepError(`a zona recusou o movimento para (${x}, ${z}): ${r.reason}`);
    const dest = r.dest ?? { x, z };
    const tEnd = Date.now() + timeoutMs;
    while (Date.now() < tEnd) {
      const me = zone.me();
      if (me && d2(me, dest) < 0.8) return me;
      await sleep(100);
    }
    throw new StepError(`não chegou a (${dest.x}, ${dest.z}) em ${timeoutMs / 1000} s`);
  };

  try {
    if (saved) {
      await step('serviço de contas no ar', async () => { expectOk(await httpRequest('GET', `${ep.contas}/saude`), `${ep.contas}/saude`); return `${ep.contas}/saude`; });
      await step(`sessão e entrada na zona com a conta ${saved.conta}`, async () => {
        const { r, hello } = await joinZone(saved.conta, saved.senha);
        if (!r.chars.some((c) => c.id === saved.retrato.id)) throw new StepError(`o personagem ${saved.retrato.name} (id ${saved.retrato.id}) não está na conta: personagens ${JSON.stringify(r.chars.map((c) => c.name))}`);
        return `servidor ${hello.version}`;
      });
      await step(`${saved.retrato.name} voltou igual (posição, bolsa, equipados, ouro, XP, missões)`, async () => {
        await enterChar(saved.retrato.id);
        const got = await currentPortrait();
        const diff = comparePortraits(saved.retrato, got);
        if (diff.length) throw new StepError(`diferenças:\n           - ${diff.join('\n           - ')}`);
        return `em (${got.x}, ${got.z}) de ${got.mapId}, ${got.gold} de ouro, ${got.items.length} itens, ${got.quests.length} missão(ões)`;
      });
      await step('saiu da zona', async () => { await zone.close(); zone = null; });
      if (opts.excluir) {
        await step('conta de teste excluída', async () => {
          expectOk(await post('/contas/excluir', { conta: saved.conta, senha: saved.senha }), 'exclusão recusada');
          const after = await post('/sessoes', { conta: saved.conta, senha: saved.senha });
          if (after.status !== 401) throw new StepError(`depois de excluir, a sessão devia ser recusada (401), veio HTTP ${after.status}`);
          rmSync(opts.conferir, { force: true });
          return `sessão recusada depois; ${opts.conferir} apagado`;
        });
      }
      log(`TUDO CERTO em ${((Date.now() - t0) / 1000).toFixed(0)} s.`);
      return;
    }

    const conta = `fumaca_${randomBytes(4).toString('hex')}`;
    const senha = randomBytes(12).toString('base64url');
    const email = opts.email;
    if (ep.site) {
      await step('página do jogo e serviço de contas no ar', async () => {
        const page = await httpRequest('GET', `${ep.site}/`);
        if (page.status !== 200 || !/text\/html/.test(page.headers['content-type'] ?? '')) throw new StepError(`${ep.site}/ respondeu HTTP ${page.status} (${page.headers['content-type'] ?? 'sem tipo'}); esperava a página do jogo`);
        expectOk(await httpRequest('GET', `${ep.contas}/saude`), `${ep.contas}/saude`);
        const terms = await httpRequest('GET', `${ep.contas}/termos`);
        if (terms.status !== 200) throw new StepError(`${ep.contas}/termos respondeu HTTP ${terms.status}`);
        return `${ep.site}/ (página), ${ep.contas}/saude e /termos`;
      });
      await step('métricas e saúde internas não passam pelo proxy', async () => {
        for (const path of ['/metrics', '/metrics.json', '/health', '/contas/metrics']) {
          const r = await httpRequest('GET', `${ep.site}${path}`);
          // texto do Prometheus (linhas cinzas_...) ou o JSON das métricas/saúde da zona e das contas
          const leaked = r.status === 200 && (/^(# (HELP|TYPE) )?cinzas_[a-z_]+[ {]/m.test(r.text) ||
            (r.json && typeof r.json === 'object' && !Array.isArray(r.json) && r.json.ok !== undefined && path !== '/contas/metrics') ||
            (r.json && typeof r.json === 'object' && ('uptimeS' in r.json || 'counters' in r.json || 'tickMs' in r.json)));
          if (leaked) throw new StepError(`${ep.site}${path} mostra dados internos do servidor para a internet (HTTP ${r.status}): confira o Caddyfile`);
        }
        return '/metrics, /metrics.json, /health e /contas/metrics não respondem de fora';
      });
    }
    const since = Date.now();
    await step(`cadastro da conta ${conta} com o e-mail ${email}`, async () => {
      const r = await post('/contas', { conta, email, senha, aceite: true });
      if (r.json?.codigo === 'email') throw new StepError(`a conta foi criada, mas o e-mail com o código NÃO saiu: docker compose logs contas mostra o motivo na linha "falha no envio do e-mail" (senha de app errada, porta do SMTP bloqueada pelo provedor do VPS, remetente recusado...)`);
      if (r.status !== 201) throw new StepError(`cadastro recusado: HTTP ${r.status}${r.json?.erro ? ` — ${r.json.erro}` : ''}${r.status >= 500 ? ' (docker compose logs contas)' : ''}`);
      return r.json.mensagem;
    });
    let code = null;
    await step('código de confirmação recebido', async () => {
      if (opts['codigos-dir']) {
        const tEnd = Date.now() + 60_000;
        while (!(code = codeFromDir(opts['codigos-dir'], email, since))) {
          if (Date.now() > tEnd) throw new StepError(`nenhum e-mail para ${email} chegou em ${opts['codigos-dir']} em 60 s: docker compose logs contas (falha de envio?)`);
          await sleep(500);
        }
        return `${code}, lido do e-mail gravado em ${opts['codigos-dir']}`;
      }
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      try {
        for (let i = 0; i < 3 && !code; i++) {
          const a = (await rl.question(`[fumaça] digite o código de 6 dígitos que chegou em ${email} (olhe também o lixo eletrônico): `)).trim();
          if (/^\d{6}$/.test(a)) code = a;
          else console.log('[fumaça] são 6 algarismos.');
        }
      } finally { rl.close(); }
      if (!code) throw new StepError('nenhum código digitado (sem e-mail? docker compose logs contas mostra falhas de envio)');
      return 'digitado';
    });
    await step('e-mail confirmado', async () => expectOk(await post('/contas/verificar', { conta, codigo: code }), 'confirmação recusada').mensagem);
    let charId = null, enter = null;
    await step('sessão (token) e entrada na zona pelo WebSocket', async () => {
      const { r, hello, expiresIn } = await joinZone(conta, senha);
      if (hello.auth !== 'token') log(`aviso: o servidor aceita login "${hello.auth}"; no teste público ele deve aceitar só "token" (CINZAS_AUTH=token)`);
      if (hello.dev) log('aviso: servidor com --dev (comandos de mestre liberados para todos): nunca no teste público');
      return `token de ${expiresIn} s aceito; servidor ${hello.version}, protocolo ${hello.protocol}, login "${hello.auth}"; ${r.chars.length} personagem(ns)`;
    });
    const charName = `Fumaca${Array.from(randomBytes(5), (b) => 'abcdefghijklmnopqrstuvwxyz'[b % 26]).join('')}`;
    await step(`personagem ${charName} criado`, async () => {
      const r = await zone.request('create_char', { name: charName, classId: opts.classe ?? 'breaker' });
      if (!r.ok) throw new StepError(`criação recusada: ${r.reason}`);
      charId = r.char.id;
      return `${r.char.classId}, nível ${r.char.level}`;
    });
    await step('entrou no mundo', async () => {
      enter = await enterChar(charId);
      return `${enter.char.mapId} em (${enter.char.x}, ${enter.char.z}), ${enter.snapshot.ents.length} entidades à vista`;
    });
    await step('andou (posição confirmada pelo snapshot do servidor)', async () => { const me = await goTo(36, 50); return `chegou em (${me.x}, ${me.z})`; });
    const gold0 = zone.char.gold;
    let killed = null;
    await step('derrotou um Rato de Sulco', async () => {
      for (let attempt = 1; attempt <= 6 && !killed; attempt++) {
        const me = zone.me();
        const rat = (zone.snap?.ents ?? []).filter((e) => e.k === 'm' && e.def === 'furrow_rat' && e.st !== 'return' && e.hp > 0)
          .sort((a, b) => d2(me, a) - d2(me, b))[0];
        if (!rat) { await sleep(1000); continue; }
        const death = zone.waitFor((m) => m.t === 'death' && m.eid === rat.id, 60_000, 'a morte do rato');
        const xp = zone.waitFor((m) => m.t === 'xp', 60_000, 'o XP do abate');
        const a = await zone.request('attack', { target: rat.id });
        if (!a.ok) { death.catch(() => {}); xp.catch(() => {}); await sleep(500); continue; }
        let done = false;
        death.then(() => { done = true; }, () => {});
        const tEnd = Date.now() + 60_000;
        while (!done && Date.now() < tEnd) {
          await sleep(250);
          const mine = zone.me();
          if (mine?.dead) { await zone.request('respawn'); await zone.request('attack', { target: rat.id }); continue; }
          const target = zone.entity(rat.id);
          if (!target || target.st === 'return') break; // outro jogador derrubou primeiro, ou ele voltou para casa
          if (mine && !mine.tgt) await zone.request('attack', { target: rat.id });
        }
        if (!done) { death.catch(() => {}); xp.catch(() => {}); continue; }
        const g = await xp.catch(() => null);
        killed = { id: rat.id, xp: g?.gained ?? null };
      }
      if (!killed) throw new StepError('nenhum Rato de Sulco derrotado em 6 tentativas');
      return `+${killed.xp ?? '?'} de XP`;
    });
    await step('coletou o saque e ganhou ouro', async () => {
      await sleep(400);
      const drops = [...zone.loot.values()].filter((l) => !l.picked);
      if (!drops.length) throw new StepError('o abate não deixou saque para este personagem');
      const got = [];
      for (const l of drops) {
        await goTo(l.x, l.z);
        const r = await zone.request('pickup', { loot: l.id });
        if (!r.ok) throw new StepError(`coleta recusada: ${r.reason}`);
        l.picked = true;
        got.push(l.gold ? `${l.gold} de ouro` : `${defsRef.items?.[l.defId]?.name ?? l.defId}${l.qty > 1 ? ` x${l.qty}` : ''}`);
      }
      const c = (await zone.request('char')).char;
      if (!(c.gold > gold0)) throw new StepError(`o ouro não subiu (${gold0} → ${c.gold})`);
      return `${got.join(', ')}; ouro ${gold0} → ${c.gold}`;
    });
    await step('equipou uma arma da bolsa', async () => {
      const c = (await zone.request('char')).char;
      const weapon = c.items.find((i) => i.loc === 'bag' && defsRef.items?.[i.defId]?.slot === 'weapon' && (defsRef.items[i.defId].level ?? 1) <= c.level);
      if (!weapon) throw new StepError(`nenhuma arma de nível ${c.level} na bolsa para equipar (${c.items.map((i) => i.defId).join(', ')})`);
      const r = await zone.request('equip', { instance: weapon.id });
      if (!r.ok) throw new StepError(`a zona recusou equipar ${weapon.defId}: ${r.reason}`);
      const now = r.char.items.find((i) => i.id === weapon.id);
      if (now?.loc !== 'equip') throw new StepError(`${weapon.defId} não ficou equipado`);
      return `${defsRef.items[weapon.defId]?.name ?? weapon.defId} na mão (${r.slot})`;
    });
    await step('aceitou uma missão (Três do Outro Lado, com Mara Quintela)', async () => {
      await goTo(24, 47);
      const r = await zone.request('quest_accept', { quest: 'tutorial', npc: 'mara' });
      if (!r.ok) throw new StepError(`Mara recusou a missão: ${r.reason}`);
      if (!r.journal?.active?.some((q) => q.id === 'tutorial')) throw new StepError('a missão não apareceu no diário');
      return 'no diário';
    });
    let before = null;
    await step('saiu da zona (o servidor grava ao sair)', async () => {
      await goTo(22, 51);
      await sleep(600); // parado de vez antes do retrato
      before = await currentPortrait();
      await zone.close();
      zone = null;
      return `em (${before.x}, ${before.z}); ${describeItems(before, defsRef.items)}; ${before.gold} de ouro`;
    });
    await step('conexão nova: o personagem voltou igual (posição, bolsa, equipados, ouro, XP, missões)', async () => {
      await sleep(500);
      const { r } = await joinZone(conta, senha);
      if (!r.chars.some((c) => c.id === charId)) throw new StepError(`o personagem não está na lista da conta (${JSON.stringify(r.chars.map((c) => c.name))})`);
      await enterChar(charId);
      const after = await currentPortrait();
      const diff = comparePortraits(before, after);
      if (diff.length) throw new StepError(`diferenças:\n           - ${diff.join('\n           - ')}`);
      await zone.close();
      zone = null;
      return `${after.items.length} itens, ${after.gold} de ouro, ${after.xp} de XP e ${after.quests.length} missão(ões) iguais`;
    });
    if (opts.estado) {
      await step(`retrato guardado em ${opts.estado} (para --conferir depois)`, async () => {
        writeFileSync(opts.estado, JSON.stringify({ quando: new Date().toISOString(), url: opts.url ?? null, contas: ep.contas, ws: ep.ws, conta, senha, email, retrato: before }, null, 2) + '\n', { mode: 0o600 });
        return `conferir: node tools/fumaca-deploy.mjs --conferir ${opts.estado} (acrescente --excluir na última vez)`;
      });
    }
    if (opts.excluir) {
      await step('conta de teste excluída', async () => {
        expectOk(await post('/contas/excluir', { conta, senha }), 'exclusão recusada');
        const after = await post('/sessoes', { conta, senha });
        if (after.status !== 401) throw new StepError(`depois de excluir, a sessão devia ser recusada (401), veio HTTP ${after.status}`);
        return 'sessão recusada depois';
      });
    } else if (!opts.estado) log(`a conta de teste ${conta} continua lá (sem --excluir); a senha dela é ${senha}`);
    log(`TUDO CERTO em ${((Date.now() - t0) / 1000).toFixed(0)} s.`);
  } catch {
    // a linha do passo que falhou já foi escrita
  } finally {
    if (zone) await zone.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
  process.exit(process.exitCode ?? 0);
}
