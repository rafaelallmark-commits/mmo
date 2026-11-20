// Relatório de telemetria de progressão a partir do banco do servidor (tabela level_log).
//   node tools/telemetria.mjs --db cinzas.db|postgres://... [--md docs/relatorio-telemetria.md]
// Para cada nível: tempo jogado para sair do nível anterior (mediana e média entre personagens) contra a
// meta de data/xp_table.json (targetMinutesToNext), com a faixa de aceitação de ±25%.
// Só lê: no SQLite abre o arquivo em modo leitura; no PostgreSQL conecta sem rodar migrações.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isPostgresUrl, parsePgUrl, PgStore } from '../src/store-pg.js';

const here = dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; };
const dbPath = arg('db', process.env.CINZAS_DB ?? 'cinzas.db');
const md = arg('md', null);
const xp = JSON.parse(readFileSync(join(here, '../../data/xp_table.json'), 'utf8'));
const pg = isPostgresUrl(dbPath);
const dbLabel = pg ? `PostgreSQL ${parsePgUrl(dbPath).label}` : dbPath; // sem a senha
let rows;
if (pg) {
  const st = new PgStore(dbPath, { migrate: false, appName: 'cinzas-telemetria' });
  try {
    rows = st.query("SELECT to_regclass('level_log') IS NOT NULL AS ok")[0].ok
      ? st.query('SELECT char_id, level, class_id, played_s FROM level_log ORDER BY char_id, level') : null;
  } finally { st.close(); }
} else {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  rows = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='level_log'").get()
    ? db.prepare('SELECT char_id, level, class_id, played_s FROM level_log ORDER BY char_id, level').all() : null;
}
if (!rows) {
  console.log(`O banco ${dbLabel} ainda não tem telemetria (tabela level_log). Ela é criada quando o servidor sobe com esta versão.`);
  process.exit(0);
}
const byChar = new Map();
for (const r of rows) {
  if (!byChar.has(r.char_id)) byChar.set(r.char_id, []);
  byChar.get(r.char_id).push(r);
}
// tempo para sair do nível L-1 = played_s(L) - played_s(L-1) (nível 1 começa em 0)
const per = new Map(); // nível alcançado -> [minutos]
for (const list of byChar.values()) {
  let prevLevel = 1, prevS = 0;
  for (const r of list) {
    if (r.level === prevLevel + 1) {
      if (!per.has(r.level)) per.set(r.level, []);
      per.get(r.level).push((r.played_s - prevS) / 60);
    }
    prevLevel = r.level; prevS = r.played_s;
  }
}
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const lines = ['| Nível | Personagens | Mediana (min) | Média (min) | Meta (min) | Situação |', '|---|---|---|---|---|---|'];
let fora = 0, medidos = 0;
for (let L = 2; L <= xp.cumulative.length; L++) {
  const a = per.get(L) ?? [];
  const target = xp.targetMinutesToNext[L - 2];
  if (!a.length) { lines.push(`| ${L - 1}→${L} | 0 | — | — | ${target} | sem dados |`); continue; }
  const m = med(a), mean = a.reduce((s, v) => s + v, 0) / a.length;
  const ok = m >= target * 0.75 && m <= target * 1.25;
  medidos++; if (!ok) fora++;
  lines.push(`| ${L - 1}→${L} | ${a.length} | ${m.toFixed(1)} | ${mean.toFixed(1)} | ${target} | ${ok ? 'dentro de ±25%' : (m < target ? 'rápido demais' : 'lento demais')} |`);
}
const out = `# Telemetria de progressão (${new Date().toISOString().slice(0, 10)})\n\nBanco: \`${dbLabel}\` — ${byChar.size} personagens com subidas de nível registradas.\n\n${lines.join('\n')}\n\nNíveis medidos: ${medidos}; fora da faixa: ${fora}.\n`;
console.log(out);
if (md) writeFileSync(md, out);
