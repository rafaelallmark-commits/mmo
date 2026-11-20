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
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { isPostgresUrl, parsePgUrl, PgStore } from '../src/store-pg.js';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; };
const db = arg('db', process.env.CINZAS_DB ?? 'cinzas.db');
const dir = arg('para', 'backups');
const keep = Number(arg('manter', 14));
mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const t0 = Date.now();

// mantém só os N mais recentes com este prefixo e extensão
function prune(prefix, ext) {
  const mine = readdirSync(dir).filter((f) => f.startsWith(`${prefix}-`) && f.endsWith(ext)).sort();
  for (const f of mine.slice(0, Math.max(0, mine.length - keep))) rmSync(join(dir, f));
}

if (isPostgresUrl(db)) {
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
  const fail = (msg) => { rmSync(partial, { force: true }); console.error(msg); process.exit(1); };
  const binDir = arg('pg-bin', process.env.CINZAS_PG_BIN ?? null);
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
  console.log(`backup: ${out} (${(statSync(out).size / 1048576).toFixed(1)} MB, pg_dump -Fc de ${p.label}${p.schema ? ` esquema ${p.schema}` : ''}, ${tables} tabelas com dados, ${chars} personagens no banco, conferido com pg_restore --list, ${Date.now() - t0} ms)`);
  prune(prefix, '.dump');
} else {
  // --db de um arquivo SQLite com o servidor no PostgreSQL (CINZAS_DB): quase sempre a linha antiga do cron
  // depois de ligar o perfil "postgres" — a cópia sairia "certa", mas de um banco que ninguém mais usa
  if (isPostgresUrl(process.env.CINZAS_DB)) {
    console.error(`aviso: o banco do servidor é o PostgreSQL (CINZAS_DB), mas este backup é do arquivo SQLite ${db}: os dados do jogo não estão nele (backup do PostgreSQL: docs/08-operacao.md §8.11)`);
  }
  const out = join(dir, `${basename(db, '.db')}-${stamp}.db`);
  const conn = new DatabaseSync(db);
  conn.exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`);
  conn.close();
  const check = new DatabaseSync(out, { readOnly: true });
  const ok = check.prepare('PRAGMA integrity_check').get();
  const chars = check.prepare('SELECT COUNT(*) AS n FROM characters').get().n;
  check.close();
  console.log(`backup: ${out} (${(statSync(out).size / 1048576).toFixed(1)} MB, ${chars} personagens, integridade: ${Object.values(ok)[0]}, ${Date.now() - t0} ms)`);
  prune(basename(db, '.db'), '.db');
}
