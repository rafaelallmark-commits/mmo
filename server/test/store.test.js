// Migrações versionadas do banco (M4): banco antigo (sem controle de versão, sem colunas novas) é
// atualizado uma única vez; abrir de novo não reaplica nada; a telemetria de nível é gravada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Store, MIGRATIONS } from '../src/store.js';

// Monta um arquivo SQLite "antigo" com node:sqlite e abre com o Store do SQLite: não tem equivalente
// direto no PostgreSQL. A migração equivalente lá (banco parado numa versão antiga sobe sem perder
// dados) está em store-pg.test.js.
const SQLITE_ONLY = process.env.CINZAS_TEST_PG ? 'só SQLite: abre um arquivo .db antigo direto com node:sqlite; no PostgreSQL o caso equivalente é store-pg.test.js' : false;

test('banco do M1 sem controle de versão é migrado uma única vez', { skip: SQLITE_ONLY }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'cinzas-store-'));
  try {
    const path = join(dir, 'antigo.db');
    const old = new DatabaseSync(path);
    old.exec(`CREATE TABLE accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE COLLATE NOCASE, pass_hash TEXT NOT NULL, salt TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE TABLE characters (id INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER NOT NULL, name TEXT NOT NULL UNIQUE COLLATE NOCASE, class_id TEXT NOT NULL,
        level INTEGER NOT NULL DEFAULT 1, xp INTEGER NOT NULL DEFAULT 0, alloc_json TEXT NOT NULL DEFAULT '{}', unspent INTEGER NOT NULL DEFAULT 0,
        skill_points INTEGER NOT NULL DEFAULT 0, skills_json TEXT NOT NULL DEFAULT '{}', hp INTEGER NOT NULL, mp INTEGER NOT NULL, gold INTEGER NOT NULL DEFAULT 0,
        map_id TEXT NOT NULL, x REAL NOT NULL, z REAL NOT NULL, dead INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
      INSERT INTO accounts (name, pass_hash, salt, created_at) VALUES ('velha', 'x', 'y', 1);
      INSERT INTO characters (account_id, name, class_id, hp, mp, map_id, x, z, created_at, updated_at) VALUES (1, 'Antigo', 'breaker', 100, 20, 'estrada_velha', 30, 50, 1, 1);`);
    old.close();
    const s1 = new Store(path);
    assert.deepEqual(s1.migrated, MIGRATIONS.map((m) => m.v));
    const cols = s1.db.prepare('PRAGMA table_info(characters)').all().map((c) => c.name);
    assert.ok(cols.includes('flags_json') && cols.includes('played_s'));
    const c = s1.loadCharacter(1);
    assert.equal(c.name, 'Antigo');
    assert.equal(c.playedS, 0);
    c.playedS = 125.5;
    s1.saveCharacter(c);
    s1.logLevel(1, 2, 'breaker', 125.5);
    s1.logLevel(1, 2, 'breaker', 999); // repetido: ignorado
    s1.close();
    const s2 = new Store(path);
    assert.deepEqual(s2.migrated, []);
    assert.equal(s2.loadCharacter(1).playedS, 125.5);
    assert.deepEqual(s2.levelLog().map((r) => [r.level, r.played_s]), [[2, 125.5]]);
    assert.equal(s2.db.prepare('SELECT version FROM schema_version').get().version, MIGRATIONS.at(-1).v);
    s2.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('migração 6: contas antigas ficam com os termos na versão 1 e a data do aceite vem da auditoria do cadastro', { skip: SQLITE_ONLY }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'cinzas-store-'));
  try {
    const path = join(dir, 'v5.db');
    // banco parado na versão 5 (antes do aceite gravado na conta), com uma conta do serviço de contas (que tem a
    // linha account_created com a versão aceita) e uma criada direto na zona (sem aceite nenhum)
    const old = new DatabaseSync(path);
    old.exec('CREATE TABLE schema_version (version INTEGER NOT NULL)');
    for (const m of MIGRATIONS.filter((x) => x.v <= 5)) m.up(old);
    old.exec(`INSERT INTO schema_version (version) VALUES (5);
      INSERT INTO accounts (name, pass_hash, salt, created_at, email, verified) VALUES ('cadastro', 'x', 'y', 1000, 'c@exemplo.com', 1);
      INSERT INTO accounts (name, pass_hash, salt, created_at) VALUES ('dazona', 'x', 'y', 2000);
      INSERT INTO audit_log (at, kind, account_id, ip, data_json) VALUES (1500, 'account_created', 1, '10.0.0.1', '{"terms":1}');
      INSERT INTO audit_log (at, kind, account_id, ip, data_json) VALUES (1600, 'login', 2, '10.0.0.1', '{"via":"senha"}');`);
    old.close();
    const st = new Store(path);
    try {
      assert.deepEqual(st.migrated, [6]);
      assert.deepEqual([st.findAccount('cadastro').terms_version, st.findAccount('cadastro').terms_at], [1, 1500]);
      assert.deepEqual([st.findAccount('dazona').terms_version, st.findAccount('dazona').terms_at], [1, null]);
      assert.deepEqual(st.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'account_events'").all().map((r) => r.name), ['account_events']);
    } finally { st.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
