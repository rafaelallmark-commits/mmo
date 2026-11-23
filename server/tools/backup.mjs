// Backup a quente do banco, com o servidor rodando, e rotação das cópias.
//
//   SQLite:     node tools/backup.mjs --db cinzas.db [--para backups] [--manter 14] [--diarias] [--dias 14]
//     VACUUM INTO: foto consistente da última transação confirmada, sem travar o jogo por mais que alguns
//     milissegundos; confere a integridade da cópia.
//   PostgreSQL: node tools/backup.mjs --db postgres://usuario:senha@host:5432/banco[?schema=x] [--para backups] [--manter 14] [--pg-bin DIR]
//     pg_dump no formato custom (-Fc: comprimido, foto consistente de uma transação, restaurável por
//     tabela) e conferência do arquivo com pg_restore --list. A senha vai por PGPASSWORD (não aparece no
//     ps); ?schema= vira --schema. Restaurar: pg_restore (docs/08-operacao.md §8.11).
//   --db também vem de CINZAS_DB; --pg-bin (ou CINZAS_PG_BIN) aponta a pasta do pg_dump/pg_restore
//   quando não estão no PATH (a versão precisa ser igual ou mais nova que a do servidor).
//
//   Rotação (D148), depois de cada backup conferido: ficam as --manter N cópias mais recentes (padrão 14) e,
//   com --diarias, também a mais nova de cada dia (UTC); nenhuma passa de --dias D (padrão 14), porque a
//   política de privacidade promete cópias substituídas em até 14 dias. Só contam os arquivos com o nome que
//   o backup dá (<banco>-AAAA-MM-DDTHH-MM-SS.db ou .dump): o resto da pasta não é tocado.
//   --metrica ARQUIVO  (ou CINZAS_BACKUP_METRICA) grava, no formato de texto do Prometheus, a hora do último
//                      backup conferido e da última falha, o tamanho, a duração, as cópias guardadas e a
//                      mais velha delas, para o coletor "textfile" do node-exporter (alertas de backup)
//   --a-cada SEGUNDOS  fica rodando (serviço "backup" do docker-compose.yml, de hora em hora): o próximo
//                      backup sai quando a cópia mais nova da pasta completa o intervalo (na hora, se não
//                      houver nenhuma recente: reiniciar o contêiner não gera cópias a mais); uma falha é
//                      registrada e o serviço segue para a rodada seguinte
//   --somente-sqlite   com o banco no PostgreSQL não faz nada (a imagem do jogo não tem pg_dump; no compose
//                      o backup do PostgreSQL é o serviço "backup-banco"): sai com 0 ou, com --a-cada, fica
//                      parado (sem reinícios em série do contêiner) e apaga a própria métrica, que já não
//                      diz nada sobre o banco do jogo
//   --saude --metrica ARQUIVO [--idade-max SEGUNDOS]
//                      não copia nada: lê a métrica e sai com 0 se o último backup conferido tem até
//                      --idade-max segundos (padrão 7500) e nenhuma falha depois dele, e com 1 se não (com o
//                      motivo). É a verificação de saúde do serviço "backup" no compose.
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { isPostgresUrl, parsePgUrl, PgStore } from '../src/store-pg.js';

const DAY_MS = 86_400_000;
const argv = process.argv.slice(2);
// opção com valor: ausente devolve o padrão; presente sem valor (ou seguida de outra opção), undefined
const arg = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  if (i === -1) return d;
  const v = argv[i + 1];
  return v === undefined || v.startsWith('--') ? undefined : v;
};
const flag = (n) => argv.includes(`--${n}`);
const db = arg('db', process.env.CINZAS_DB || 'cinzas.db');
const dir = arg('para', 'backups');
const keepN = Number(arg('manter', 14));
const maxDays = Number(arg('dias', 14));
const daily = flag('diarias');
const metricFile = arg('metrica', process.env.CINZAS_BACKUP_METRICA || null);
const everyRaw = arg('a-cada', null);
const everyS = everyRaw === null ? null : Number(everyRaw);
const binDir = arg('pg-bin', process.env.CINZAS_PG_BIN || null);

function usage(msg) { console.error(msg); process.exit(2); }
if (db === undefined) usage('--db precisa do arquivo SQLite ou da URL postgres://...');
if (dir === undefined) usage('--para precisa da pasta das cópias.');
if (!Number.isInteger(keepN) || keepN < 1) usage('--manter precisa ser um número inteiro de 1 para cima.');
if (!(maxDays > 0)) usage('--dias precisa ser um número maior que zero.');
// até ~23 dias: o setTimeout do Node não espera mais que 2^31 ms
if (everyS != null && !(everyS >= 1 && everyS <= 2_000_000)) usage('--a-cada precisa do intervalo em segundos (de 1 a 2000000).');
if (metricFile === undefined) usage('--metrica precisa do caminho do arquivo.');
if (binDir === undefined) usage('--pg-bin precisa da pasta dos binários do PostgreSQL.');

class BackupError extends Error {}
const kind = isPostgresUrl(db) ? 'postgres' : 'sqlite';
const STAMP_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})$/;

// Prefixo e extensão das cópias deste banco: cinzas-AAAA-MM-DDTHH-MM-SS.db (SQLite) ou
// <banco>[-<esquema>]-AAAA-MM-DDTHH-MM-SS.dump (PostgreSQL; o mesmo nome do deploy/backup-postgres.sh).
function naming() {
  if (kind === 'sqlite') return { prefix: basename(db, '.db'), ext: '.db' };
  const p = parsePgUrl(db, { passwordFile: null });
  return { prefix: `${p.database}${p.schema ? `-${p.schema}` : ''}`.replace(/[^A-Za-z0-9_.-]/g, '_'), ext: '.dump' };
}

// Cópias deste banco na pasta, da mais velha para a mais nova ({ file, path, at }, com "at" em ms tirado do nome).
function copies({ prefix, ext }) {
  let names;
  try { names = readdirSync(dir); } catch { return []; }
  const list = [];
  for (const file of names) {
    if (!file.startsWith(`${prefix}-`) || !file.endsWith(ext)) continue;
    const m = STAMP_RE.exec(file.slice(prefix.length + 1, file.length - ext.length));
    if (m) list.push({ file, path: join(dir, file), at: Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) });
  }
  return list.sort((a, b) => a.at - b.at);
}

// Rotação: ficam as keepN mais recentes e, com --diarias, a mais nova de cada dia; nada com mais de maxDays
// dias. Também apaga sobras de execuções interrompidas (.parcial) com mais de uma hora.
function prune(name, now = Date.now()) {
  const list = copies(name);
  const keep = new Set(list.slice(-keepN).map((c) => c.file));
  if (daily) {
    const days = new Set();
    for (let i = list.length - 1; i >= 0; i--) {
      const day = new Date(list[i].at).toISOString().slice(0, 10);
      if (!days.has(day)) { days.add(day); keep.add(list[i].file); }
    }
  }
  const limit = now - maxDays * DAY_MS;
  const kept = [];
  for (const c of list) {
    if (keep.has(c.file) && c.at >= limit) kept.push(c);
    else rmSync(c.path, { force: true });
  }
  for (const f of readdirSync(dir)) {
    if (!f.startsWith(`${name.prefix}-`) || !f.endsWith(`${name.ext}.parcial`)) continue;
    try { if (statSync(join(dir, f)).mtimeMs < now - 3_600_000) rmSync(join(dir, f), { force: true }); } catch { /* já foi */ }
  }
  return { copies: kept.length, oldestAt: kept.length ? kept[0].at : null };
}

function backupPostgres(stamp, name) {
  const p = parsePgUrl(db);
  const u = new URL(p.connectionString); // já sem ?schema=
  // decodificada como o 'pg' faz (a do arquivo de senha vem codificada por parsePgUrl); "%" solto na URL fica
  let password = u.password;
  try { password = decodeURIComponent(password); } catch { /* "%" sem dois dígitos hex: a senha é o texto como está */ }
  u.password = '';
  const out = join(dir, `${name.prefix}-${stamp}${name.ext}`);
  // grava com outro nome e só dá o nome final depois de conferido: uma falha (ou o processo morto no meio)
  // não apaga um backup bom com o mesmo nome (duas execuções no mesmo segundo) nem deixa um arquivo pela
  // metade que pareceria um backup e entraria na conta dos N mantidos
  const partial = `${out}.parcial`;
  const fail = (msg) => { rmSync(partial, { force: true }); throw new BackupError(msg); };
  const exe = (cmd) => (binDir ? join(binDir, cmd) : cmd);
  const env = { ...process.env, ...(password ? { PGPASSWORD: password } : {}) };
  const dump = spawnSync(exe('pg_dump'), ['--format=custom', '--file', partial, ...(p.schema ? ['--schema', p.schema] : []), '--dbname', u.toString()], { env, encoding: 'utf8' });
  if (dump.error || dump.status !== 0) fail(`backup falhou: pg_dump ${dump.error ? dump.error.message : `saiu com ${dump.status}`}\n${(dump.stderr || '').trim()}`);
  const list = spawnSync(exe('pg_restore'), ['--list', partial], { encoding: 'utf8' });
  if (list.error || list.status !== 0) fail(`backup gerado mas ilegível para o pg_restore: ${list.error?.message ?? list.stderr}`);
  renameSync(partial, out);
  const tables = list.stdout.split('\n').filter((l) => / TABLE DATA /.test(l)).length;
  let chars = '?';
  try {
    const st = new PgStore(db, { migrate: false, appName: 'cinzas-backup' });
    try { chars = st.query('SELECT COUNT(*) AS n FROM characters')[0].n; } finally { st.close(); }
  } catch { /* banco ainda sem tabelas */ }
  const bytes = statSync(out).size;
  return { out, bytes, detail: `${(bytes / 1048576).toFixed(1)} MB, pg_dump -Fc de ${p.label}${p.schema ? ` esquema ${p.schema}` : ''}, ${tables} tabelas com dados, ${chars} personagens no banco, conferido com pg_restore --list` };
}

function backupSqlite(stamp, name) {
  // --db de um arquivo SQLite com o servidor no PostgreSQL (CINZAS_DB): quase sempre a linha antiga do cron
  // depois de ligar o perfil "postgres" — a cópia sairia "certa", mas de um banco que ninguém mais usa
  if (isPostgresUrl(process.env.CINZAS_DB)) {
    console.error(`aviso: o banco do servidor é o PostgreSQL (CINZAS_DB), mas este backup é do arquivo SQLite ${db}: os dados do jogo não estão nele (backup do PostgreSQL: docs/08-operacao.md §8.11)`);
  }
  // abrir um caminho que não existe criaria um banco vazio ali (e um "backup" dele)
  if (!existsSync(db)) throw new BackupError(`backup falhou: o banco ${db} não existe (o servidor ainda não subiu, ou --db/CINZAS_DB aponta outro arquivo)`);
  const out = join(dir, `${name.prefix}-${stamp}${name.ext}`);
  // como no PostgreSQL: grava com outro nome e só dá o nome final depois da conferência de integridade.
  // Uma cópia corrompida sai com erro (o backup.service e o cron acusam a falha) e não entra na conta das
  // N mantidas, onde empurraria uma cópia boa para fora.
  const partial = `${out}.parcial`;
  const fail = (msg) => { rmSync(partial, { force: true }); throw new BackupError(msg); };
  let integrity = '?';
  let chars = '?';
  try {
    const conn = new DatabaseSync(db);
    try { conn.exec(`VACUUM INTO '${partial.replace(/'/g, "''")}'`); } finally { conn.close(); }
    const check = new DatabaseSync(partial, { readOnly: true });
    try {
      integrity = check.prepare('PRAGMA integrity_check').all().map((r) => Object.values(r)[0]).join('; ');
      if (integrity === 'ok') chars = check.prepare('SELECT COUNT(*) AS n FROM characters').get().n;
    } finally { check.close(); }
  } catch (e) {
    fail(`backup falhou: ${e.message}`);
  }
  if (integrity !== 'ok') fail(`backup falhou: a cópia não passou na conferência de integridade (${integrity.slice(0, 500)}); nenhuma cópia antiga foi apagada`);
  renameSync(partial, out);
  const bytes = statSync(out).size;
  return { out, bytes, detail: `${(bytes / 1048576).toFixed(1)} MB, ${chars} personagens, integridade: ok` };
}

// ---------- métrica para o node-exporter (coletor textfile) ----------
// Os mesmos nomes e textos do deploy/backup-postgres.sh: o node-exporter junta os arquivos da pasta.
const METRICS = [
  ['cinzas_backup_last_success_timestamp_seconds', 'Hora (Unix, em segundos) do último backup conferido; 0 = nenhum ainda.'],
  ['cinzas_backup_last_failure_timestamp_seconds', 'Hora (Unix, em segundos) da última falha de backup; 0 = nenhuma.'],
  ['cinzas_backup_last_size_bytes', 'Tamanho do último backup conferido, em bytes.'],
  ['cinzas_backup_last_duration_seconds', 'Duração do último backup conferido, em segundos.'],
  ['cinzas_backup_copies', 'Cópias guardadas na pasta de backups depois da última rotação.'],
  ['cinzas_backup_oldest_copy_timestamp_seconds', 'Hora (Unix, em segundos) da cópia mais velha guardada; 0 = nenhuma.'],
];

// valores da gravação anterior (uma falha mantém a hora do último sucesso)
function previousMetrics() {
  const prev = {};
  try {
    for (const line of readFileSync(metricFile, 'utf8').split('\n')) {
      const m = /^(cinzas_backup_[a-z_]+)\{[^}]*\} (\S+)$/.exec(line);
      if (m && Number.isFinite(Number(m[2]))) prev[m[1]] = Number(m[2]);
    }
  } catch { /* primeira gravação */ }
  return prev;
}

function writeMetrics(values) {
  if (!metricFile) return;
  try {
    mkdirSync(dirname(metricFile), { recursive: true });
    const v = { ...previousMetrics(), ...values };
    const lines = [];
    for (const [metric, help] of METRICS) lines.push(`# HELP ${metric} ${help}`, `# TYPE ${metric} gauge`, `${metric}{db="${kind}"} ${v[metric] ?? 0}`);
    // arquivo temporário + rename: o coletor nunca lê um arquivo pela metade
    const tmp = `${metricFile}.${process.pid}.tmp`;
    writeFileSync(tmp, lines.join('\n') + '\n', { mode: 0o644 });
    renameSync(tmp, metricFile);
  } catch (e) {
    console.error(`aviso: não deu para gravar a métrica do backup em ${metricFile}: ${e.message}`);
  }
}

const secs = (ms) => Math.round(ms / 1000);

/** Um backup completo com a rotação: true se deu certo (a métrica registra o sucesso ou a falha). */
function runOnce() {
  const t0 = Date.now();
  const stamp = new Date(t0).toISOString().replace(/[:.]/g, '-').slice(0, 19);
  try {
    const name = naming();
    mkdirSync(dir, { recursive: true });
    const r = kind === 'postgres' ? backupPostgres(stamp, name) : backupSqlite(stamp, name);
    const rot = prune(name);
    const ms = Date.now() - t0;
    console.log(`backup: ${r.out} (${r.detail}, ${ms} ms); ${rot.copies} cópia${rot.copies === 1 ? '' : 's'} guardada${rot.copies === 1 ? '' : 's'}, a mais velha de ${new Date(rot.oldestAt).toISOString().slice(0, 16).replace('T', ' ')} UTC`);
    writeMetrics({
      cinzas_backup_last_success_timestamp_seconds: secs(Date.now()),
      cinzas_backup_last_size_bytes: r.bytes,
      cinzas_backup_last_duration_seconds: ms / 1000,
      cinzas_backup_copies: rot.copies,
      cinzas_backup_oldest_copy_timestamp_seconds: rot.oldestAt == null ? 0 : secs(rot.oldestAt),
    });
    return true;
  } catch (e) {
    console.error(e instanceof BackupError ? e.message : `backup falhou: ${e.message}`);
    writeMetrics({ cinzas_backup_last_failure_timestamp_seconds: secs(Date.now()) });
    return false;
  }
}

// Modo agendado: métrica semeada com as cópias que já estão na pasta (volume de métricas novo ou arquivo
// apagado) e o primeiro backup quando a cópia mais nova completar o intervalo. Sem cópia nenhuma o backup sai
// na hora e grava a métrica de verdade em seguida.
function schedule() {
  const name = naming();
  const list = copies(name);
  const newest = list.at(-1);
  if (metricFile && newest && !(previousMetrics().cinzas_backup_last_success_timestamp_seconds > 0)) {
    writeMetrics({
      cinzas_backup_last_success_timestamp_seconds: secs(newest.at),
      cinzas_backup_last_size_bytes: statSync(newest.path).size,
      cinzas_backup_copies: list.length,
      cinzas_backup_oldest_copy_timestamp_seconds: secs(list[0].at),
    });
  }
  const firstIn = newest ? Math.max(0, newest.at + everyS * 1000 - Date.now()) : 0;
  console.log(`backup agendado: ${kind === 'postgres' ? 'PostgreSQL' : `SQLite ${db}`} a cada ${everyS} s para ${dir} (mantém ${keepN}${daily ? ' e a mais nova de cada dia' : ''}, nada com mais de ${maxDays} dias)${metricFile ? `; métrica em ${metricFile}` : ''}; ${firstIn > 0 ? `próximo em ${Math.ceil(firstIn / 60000)} min (cópia mais nova: ${newest.file})` : 'primeiro agora'}`);
  const round = () => {
    const t0 = Date.now();
    runOnce();
    setTimeout(round, Math.max(1000, t0 + everyS * 1000 - Date.now()));
  };
  setTimeout(round, firstIn);
}

// --saude: verificação de saúde do serviço "backup" do compose (o HEALTHCHECK da imagem é o da zona, que este
// serviço não roda). Saudável com um backup conferido há no máximo --idade-max segundos (padrão 7500: duas
// rodadas de hora em hora e folga, como o alerta BackupAtrasado) e nenhuma falha depois dele. Com
// --somente-sqlite e o banco no PostgreSQL o serviço fica parado de propósito: saudável.
if (flag('saude')) {
  if (kind === 'postgres' && flag('somente-sqlite')) { console.log('backup do SQLite parado de propósito: o banco é o PostgreSQL (serviço backup-banco).'); process.exit(0); }
  if (!metricFile) usage('--saude precisa de --metrica (o arquivo que o backup agendado grava).');
  const maxAge = Number(arg('idade-max', 7500));
  if (!(maxAge > 0)) usage('--idade-max precisa de um número de segundos maior que zero.');
  const m = previousMetrics();
  const ok = m.cinzas_backup_last_success_timestamp_seconds ?? 0;
  const bad = m.cinzas_backup_last_failure_timestamp_seconds ?? 0;
  const iso = (s) => new Date(s * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  const ageS = Date.now() / 1000 - ok;
  // código 1 = "unhealthy" para o Docker (o 2 do usage() é reservado no HEALTHCHECK)
  const unhealthy = (msg) => { console.log(msg); process.exit(1); };
  if (!(ok > 0)) unhealthy(`nenhum backup conferido ainda (métrica ${metricFile}): docker compose logs backup`);
  if (bad > ok) unhealthy(`o último backup falhou (${iso(bad)}); o último conferido é de ${iso(ok)}: docker compose logs backup`);
  if (ageS > maxAge) unhealthy(`o último backup conferido é de ${iso(ok)}, há ${Math.round(ageS / 60)} min (limite: ${Math.round(maxAge / 60)} min): docker compose logs backup`);
  console.log(`backup em dia: o último conferido é de ${iso(ok)}, há ${Math.round(ageS / 60)} min.`);
  process.exit(0);
}

for (const s of ['SIGTERM', 'SIGINT']) process.on(s, () => { if (everyS != null) console.log('backup: encerrando.'); process.exit(0); });

if (kind === 'postgres' && flag('somente-sqlite')) {
  console.log('o banco é o PostgreSQL (CINZAS_DB): este serviço só faz o backup do SQLite; o do PostgreSQL é o serviço backup-banco do docker-compose.yml (perfil postgres).');
  if (metricFile) rmSync(metricFile, { force: true });
  if (everyS == null) process.exit(0);
  console.log('backup do SQLite parado: nada a fazer enquanto o banco for o PostgreSQL.');
  setInterval(() => {}, 1 << 30); // segura o processo (e o contêiner) sem fazer nada
} else if (everyS == null) {
  process.exit(runOnce() ? 0 : 1);
} else {
  schedule();
}
