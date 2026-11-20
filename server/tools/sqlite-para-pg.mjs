// Leva um banco SQLite (desenvolvimento, teste antigo) para o PostgreSQL central.
//   node tools/sqlite-para-pg.mjs --de cinzas.db --para postgres://usuario:senha@host:5432/banco[?schema=x]
//
// 1. Tira uma foto consistente do arquivo (VACUUM INTO, pode ser com o servidor rodando) e migra a foto
//    até a última versão — o arquivo original não é alterado.
// 2. Abre o PostgreSQL (migrações rodam se faltar) e exige as tabelas do jogo vazias.
// 3. Copia tudo numa transação só, na ordem das chaves estrangeiras, com os mesmos ids; acerta as
//    sequências de identidade; confere a contagem de linhas de cada tabela.
// Os nomes valem igual nos dois bancos (nocase() do PostgreSQL = COLLATE NOCASE do SQLite, só no ASCII):
// o que o SQLite aceitou, os índices únicos do PostgreSQL aceitam.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { Store } from '../src/store.js';
import { PgStore, isPostgresUrl } from '../src/store-pg.js';

// ordem das chaves estrangeiras; schema_version não vai (o PostgreSQL já está na última versão)
export const TABLES = ['accounts', 'characters', 'clans', 'clan_members', 'item_instances', 'loot_drops', 'daily_claims', 'quest_progress', 'level_log', 'account_codes', 'audit_log'];
const IDENTITY = { accounts: 'id', characters: 'id', clans: 'id', audit_log: 'id' };
const CHUNK = 500;

export function importSqliteToPg(sqlitePath, pg, { log = () => {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'cinzas-import-'));
  try {
    const snap = join(dir, 'foto.db');
    const src = new DatabaseSync(sqlitePath, { readOnly: true });
    src.exec(`VACUUM INTO '${snap.replace(/'/g, "''")}'`);
    src.close();
    const lite = new Store(snap); // migra a foto, não o original
    try {
      for (const t of TABLES) {
        if (pg.query(`SELECT EXISTS (SELECT 1 FROM ${t}) AS cheio`)[0].cheio) throw new Error(`a tabela ${t} do PostgreSQL não está vazia: importe num banco (ou esquema) novo`);
      }
      const counts = {};
      pg.tx(() => {
        for (const t of TABLES) {
          const cols = lite.db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
          const sql = `INSERT INTO ${t} (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})`;
          const rows = lite.db.prepare(`SELECT ${cols.join(', ')} FROM ${t} ORDER BY rowid`).all();
          for (let i = 0; i < rows.length; i += CHUNK) pg.batch(rows.slice(i, i + CHUNK).map((r) => [sql, cols.map((c) => r[c])]));
          if (IDENTITY[t]) pg.query(`SELECT setval(pg_get_serial_sequence('${t}', '${IDENTITY[t]}'), COALESCE((SELECT MAX(${IDENTITY[t]}) FROM ${t}), 0) + 1, false)`);
          counts[t] = rows.length;
          log(`  ${t}: ${rows.length}`);
        }
      });
      for (const t of TABLES) {
        const n = pg.query(`SELECT COUNT(*) AS n FROM ${t}`)[0].n;
        if (n !== counts[t]) throw new Error(`contagem não confere em ${t}: SQLite ${counts[t]}, PostgreSQL ${n}`);
      }
      return counts;
    } finally { lite.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; };
  const from = arg('de', null);
  const to = arg('para', process.env.CINZAS_DB ?? null);
  if (!from || !isPostgresUrl(to)) {
    console.error('uso: node tools/sqlite-para-pg.mjs --de cinzas.db --para postgres://usuario:senha@host:5432/banco');
    process.exit(2);
  }
  const t0 = Date.now();
  const pg = new PgStore(to, { appName: 'cinzas-importacao' });
  try {
    console.log(`importando ${from} para ${pg.describe()}`);
    const counts = importSqliteToPg(from, pg, { log: console.log });
    console.log(`pronto: ${Object.values(counts).reduce((s, n) => s + n, 0)} linhas em ${Date.now() - t0} ms; contagens conferidas.`);
  } catch (e) {
    console.error(`importação desfeita: ${e.message}`);
    process.exitCode = 1;
  } finally { pg.close(); }
}
