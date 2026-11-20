// Cópia consistente do banco SQLite com o servidor rodando (VACUUM INTO: uma foto da última transação
// confirmada, sem travar o jogo por mais que alguns milissegundos).
//   node tools/backup.mjs --db cinzas.db [--para backups] [--manter 14]
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; };
const db = arg('db', process.env.CINZAS_DB ?? 'cinzas.db');
const dir = arg('para', 'backups');
const keep = Number(arg('manter', 14));
mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const out = join(dir, `${basename(db, '.db')}-${stamp}.db`);
const t0 = Date.now();
const conn = new DatabaseSync(db);
conn.exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`);
conn.close();
const check = new DatabaseSync(out, { readOnly: true });
const ok = check.prepare('PRAGMA integrity_check').get();
const chars = check.prepare('SELECT COUNT(*) AS n FROM characters').get().n;
check.close();
console.log(`backup: ${out} (${(statSync(out).size / 1048576).toFixed(1)} MB, ${chars} personagens, integridade: ${Object.values(ok)[0]}, ${Date.now() - t0} ms)`);
// mantém só os N mais recentes deste banco
const mine = readdirSync(dir).filter((f) => f.startsWith(`${basename(db, '.db')}-`) && f.endsWith('.db')).sort();
for (const f of mine.slice(0, Math.max(0, mine.length - keep))) rmSync(join(dir, f));
