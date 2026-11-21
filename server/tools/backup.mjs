// Backup a quente do banco, com o servidor rodando, mantendo só as N cópias mais recentes.
//
//   SQLite:     node tools/backup.mjs --db cinzas.db [--para backups] [--manter 14]
//     VACUUM INTO: foto consistente da última transação confirmada, sem travar o jogo por mais que alguns
//     milissegundos; confere a integridade da cópia.
//   PostgreSQL: node tools/backup.mjs --db postgres://usuario:senha@host:5432/banco[?schema=x] [--para backups] [--manter 14] [--pg-bin DIR]
//     pg_dump no formato custom (-Fc: comprimido, foto consistente de uma transação, restaurável por
//     tabela) e conferência do arquivo com pg_restore --list. A senha vai por PGPASSWORD (não aparece no
//     ps); ?schema= vira --schema. Restaurar: pg_restore (docs/08-operacao.md §8.11).
//   --db também vem de CINZAS_DB; --pg-bin (ou CINZAS_PG_BIN) aponta a pasta do pg_dump/pg_restore
//   quando não estão no PATH (a versão precisa ser igual ou mais nova que a do servidor).
//
//   --dias 14          além das N mais recentes, apaga as cópias com mais de 14 dias (a política de
//                      privacidade promete que as cópias são substituídas em até 14 dias)
//   --metrica ARQUIVO  (ou CINZAS_BACKUP_METRICA) grava a hora do último backup conferido, o tamanho, a
//                      duração, as cópias guardadas e a hora da última falha no formato de texto do
//                      Prometheus, para o coletor "textfile" do node-exporter (alerta de backup atrasado)
//   --a-cada SEGUNDOS  fica rodando: um backup agora e outro a cada intervalo (serviço "backup" do
//                      docker-compose.yml, de hora em hora); uma falha é registrada e a próxima rodada vem
//   --somente-sqlite   sai sem fazer nada (código 0) se o banco for o PostgreSQL: o serviço "backup" do
//                      compose não tem pg_dump; lá o backup do PostgreSQL é o serviço "backup-banco"
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { isPostgresUrl, parsePgUrl, PgStore } from '../src/store-pg.js';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; };
const flag = (n) => process.argv.includes(`--${n}`);
const db = arg('db', process.env.CINZAS_DB ?? 'cinzas.db');
const dir = arg('para', 'backups');
const keep = Number(arg('manter', 14));
const maxDays = Number(arg('dias', 14));
const metricFile = arg('metrica', process.env.CINZAS_BACKUP_METRICA || null);
const everyRaw = arg('a-cada', null); // presente sem valor: undefined, vira NaN e erro abaixo
const everyS = everyRaw === null ? null : Number(everyRaw);
const binDir = arg('pg-bin', process.env.CINZAS_PG_BIN ?? null);

function usage(msg) { console.error(msg); process.exit(2); }
if (!Number.isInteger(keep) || keep < 1) usage('--manter precisa ser um número inteiro de 1 para cima.');
if (!(maxDays > 0)) usage('--dias precisa ser um número maior que zero.');
if (everyS != null && !(everyS >= 1)) usage('--a-cada precisa do intervalo em segundos (1 ou mais).');
if (metricFile === true || metricFile === undefined) usage('--metrica precisa do caminho do arquivo.');

class BackupError extends Error {}
const kind = isPostgresUrl(db) ? 'postgres' : 'sqlite';

if (flag('somente-sqlite') && kind === 'postgres') {
  console.log('o banco é o PostgreSQL (CINZAS_DB): este serviço só faz o backup do SQLite; o do PostgreSQL é o serviço backup-banco do docker-compose.yml (perfil postgres). Nada a fazer aqui.');
  process.exit(0);
}

// Apaga as cópias deste prefixo e extensão além das N mais recentes e as com mais de --dias dias.
function prune(prefix, ext) {
  const mine = readdirSync(dir).filter((f) => f.startsWith(`${prefix}-`) && f.endsWith(ext)).sort();
  const old = Date.now() - maxDays * 86_400_000;
  let kept = 0;
  mine.forEach((f, i) => {
    const p = join(dir, f);
    let tooOld = false;
    try { tooOld = statSync(p).mtimeMs < old; } catch { return; }
    if (i < mine.length - keep || tooOld) rmSync(p, { force: true });
    else kept++;
  });
  return kept;
}

function backupPostgres(t0, stamp) {
  const p = parsePgUrl(db);
  const u = new URL(p.connectionString); // já sem ?schema=
  // decodificada como o 'pg' faz (a do arquivo de senha vem codificada por parsePgUrl); "%" solto na URL fica
  let password = u.password;
  try { password = decodeURIComponent(password); } catch { /* "%" sem dois dígitos hex: a senha é o texto como está */ }
  u.password = '';
  const prefix = `${p.database}${p.schema ? `-${p.schema}` : ''}`.replace(/[^A-Za-z0-9_.-]/g, '_');
  const out = join(dir, `${prefix}-${stamp}.dump`);
  // grava com outro nome e só dá o nome final depois de conferido: uma falha (ou o processo morto no meio)
  // não apaga um backup bom com o mesmo nome (duas execuções no mesmo segundo) nem deixa um arquivo pela
  // metade que pareceria um backup e entraria na conta dos N mantidos
  const partial = `${out}.parcial`;
  const fail = (msg) => { rmSync(partial, { force: true }); throw new BackupError(msg); };
  const exe = (name) => (binDir ? join(binDir, name) : name);
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
  console.log(`backup: ${out} (${(bytes / 1048576).toFixed(1)} MB, pg_dump -Fc de ${p.label}${p.schema ? ` esquema ${p.schema}` : ''}, ${tables} tabelas com dados, ${chars} personagens no banco, conferido com pg_restore --list, ${Date.now() - t0} ms)`);
  return { out, bytes, copies: prune(prefix, '.dump') };
}

function backupSqlite(t0, stamp) {
  // --db de um arquivo SQLite com o servidor no PostgreSQL (CINZAS_DB): quase sempre a linha antiga do cron
  // depois de ligar o perfil "postgres" — a cópia sairia "certa", mas de um banco que ninguém mais usa
  if (isPostgresUrl(process.env.CINZAS_DB)) {
    console.error(`aviso: o banco do servidor é o PostgreSQL (CINZAS_DB), mas este backup é do arquivo SQLite ${db}: os dados do jogo não estão nele (backup do PostgreSQL: docs/08-operacao.md §8.11)`);
  }
  const out = join(dir, `${basename(db, '.db')}-${stamp}.db`);
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
  console.log(`backup: ${out} (${(bytes / 1048576).toFixed(1)} MB, ${chars} personagens, integridade: ok, ${Date.now() - t0} ms)`);
  return { out, bytes, copies: prune(basename(db, '.db'), '.db') };
}

// ---------- métrica para o node-exporter (coletor textfile) ----------
const METRICS = [
  ['cinzas_backup_last_success_timestamp_seconds', 'Fim do último backup conferido (hora Unix, em segundos; 0 = nenhum ainda).'],
  ['cinzas_backup_last_failure_timestamp_seconds', 'Hora (Unix, em segundos) da última falha de backup; 0 = nenhuma.'],
  ['cinzas_backup_last_size_bytes', 'Tamanho do último backup conferido, em bytes.'],
  ['cinzas_backup_last_duration_seconds', 'Duração do último backup conferido, em segundos.'],
  ['cinzas_backup_copies', 'Cópias guardadas na pasta de backups depois do último backup conferido.'],
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
    for (const [name, help] of METRICS) lines.push(`# HELP ${name} ${help}`, `# TYPE ${name} gauge`, `${name}{db="${kind}"} ${v[name] ?? 0}`);
    // arquivo temporário + rename: o coletor nunca lê um arquivo pela metade
    const tmp = `${metricFile}.${process.pid}.tmp`;
    writeFileSync(tmp, lines.join('\n') + '\n');
    renameSync(tmp, metricFile);
  } catch (e) {
    console.error(`aviso: não deu para gravar a métrica do backup em ${metricFile}: ${e.message}`);
  }
}

/** Um backup completo: true se deu certo (e a métrica registra o sucesso ou a falha). */
function runOnce() {
  const t0 = Date.now();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  try {
    mkdirSync(dir, { recursive: true });
    const r = kind === 'postgres' ? backupPostgres(t0, stamp) : backupSqlite(t0, stamp);
    writeMetrics({
      cinzas_backup_last_success_timestamp_seconds: Math.round(Date.now() / 1000),
      cinzas_backup_last_size_bytes: r.bytes,
      cinzas_backup_last_duration_seconds: (Date.now() - t0) / 1000,
      cinzas_backup_copies: r.copies,
    });
    return true;
  } catch (e) {
    console.error(e instanceof BackupError ? e.message : `backup falhou: ${e.message}`);
    writeMetrics({ cinzas_backup_last_failure_timestamp_seconds: Math.round(Date.now() / 1000) });
    return false;
  }
}

if (everyS == null) {
  process.exit(runOnce() ? 0 : 1);
} else {
  console.log(`backup agendado: ${kind === 'postgres' ? 'PostgreSQL' : `SQLite ${db}`} a cada ${everyS} s para ${dir} (mantém ${keep}, no máximo ${maxDays} dias)${metricFile ? `; métrica em ${metricFile}` : ''}`);
  for (const s of ['SIGTERM', 'SIGINT']) process.on(s, () => { console.log('backup agendado: encerrando.'); process.exit(0); });
  runOnce();
  setInterval(runOnce, everyS * 1000);
}
