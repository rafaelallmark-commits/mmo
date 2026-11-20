// Persistência simples em SQLite (node:sqlite, síncrono). Um arquivo por servidor de zona.
// Cada operação que muda inventário, XP ou saque roda numa transação única.
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pass_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS characters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  class_id TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 1,
  xp INTEGER NOT NULL DEFAULT 0,
  alloc_json TEXT NOT NULL DEFAULT '{}',
  unspent INTEGER NOT NULL DEFAULT 0,
  skill_points INTEGER NOT NULL DEFAULT 0,
  skills_json TEXT NOT NULL DEFAULT '{}',
  hp INTEGER NOT NULL,
  mp INTEGER NOT NULL,
  gold INTEGER NOT NULL DEFAULT 0,
  map_id TEXT NOT NULL,
  x REAL NOT NULL,
  z REAL NOT NULL,
  dead INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS item_instances (
  id TEXT PRIMARY KEY,
  char_id INTEGER NOT NULL REFERENCES characters(id),
  def_id TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1,
  enh INTEGER NOT NULL DEFAULT 0,
  loc TEXT NOT NULL CHECK (loc IN ('bag','equip','recovery','storage')),
  slot TEXT,
  source TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_items_char ON item_instances(char_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_items_equip_slot ON item_instances(char_id, slot) WHERE loc = 'equip';
CREATE TABLE IF NOT EXISTS loot_drops (
  id TEXT PRIMARY KEY,
  char_id INTEGER NOT NULL REFERENCES characters(id),
  def_id TEXT,
  qty INTEGER NOT NULL DEFAULT 1,
  gold INTEGER NOT NULL DEFAULT 0,
  map_id TEXT NOT NULL,
  x REAL NOT NULL,
  z REAL NOT NULL,
  monster_def TEXT NOT NULL,
  kill_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  claimed_at INTEGER,
  claimed_instance_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_loot_char ON loot_drops(char_id, claimed_at);
CREATE TABLE IF NOT EXISTS daily_claims (
  char_id INTEGER NOT NULL REFERENCES characters(id),
  claim_key TEXT NOT NULL,
  day TEXT NOT NULL,
  PRIMARY KEY (char_id, claim_key, day)
);
CREATE TABLE IF NOT EXISTS quest_progress (
  char_id INTEGER NOT NULL REFERENCES characters(id),
  quest_id TEXT NOT NULL,
  state TEXT NOT NULL,
  progress_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (char_id, quest_id)
);
`;

// Migrações versionadas: cada passo roda uma única vez, em ordem, numa transação, e a versão fica em
// schema_version. Bancos anteriores ao controle de versão (M1–M3) são reconhecidos como versão 1.
export const MIGRATIONS = [
  { v: 1, name: 'base (M1–M3)', up: (db) => {
    db.exec(SCHEMA);
    const cols = db.prepare('PRAGMA table_info(characters)').all().map((c) => c.name);
    if (!cols.includes('flags_json')) db.exec("ALTER TABLE characters ADD COLUMN flags_json TEXT NOT NULL DEFAULT '{}'");
  } },
  { v: 2, name: 'telemetria de progressão (M4)', up: (db) => {
    db.exec('ALTER TABLE characters ADD COLUMN played_s REAL NOT NULL DEFAULT 0');
    db.exec(`CREATE TABLE IF NOT EXISTS level_log (
      char_id INTEGER NOT NULL REFERENCES characters(id),
      level INTEGER NOT NULL,
      class_id TEXT NOT NULL,
      played_s REAL NOT NULL,
      at INTEGER NOT NULL,
      PRIMARY KEY (char_id, level)
    )`);
  } },
];

export function migrate(db) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');
  let row = db.prepare('SELECT version FROM schema_version').get();
  if (!row) {
    // banco novo ou anterior ao controle de versão: a migração 1 é idempotente (CREATE IF NOT EXISTS)
    db.prepare('INSERT INTO schema_version (version) VALUES (0)').run();
    row = { version: 0 };
  }
  const applied = [];
  for (const m of MIGRATIONS) {
    if (m.v <= row.version) continue;
    db.exec('BEGIN IMMEDIATE');
    try {
      m.up(db);
      db.prepare('UPDATE schema_version SET version = ?').run(m.v);
      db.exec('COMMIT');
      applied.push(m.v);
    } catch (e) {
      db.exec('ROLLBACK');
      throw new Error(`migração ${m.v} (${m.name}) falhou: ${e.message}`);
    }
  }
  return applied;
}

function hashPassword(password, salt) {
  return scryptSync(password, salt, 32).toString('hex');
}

export class Store {
  constructor(path = ':memory:') {
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    this.migrated = migrate(this.db);
    this.st = {};
  }

  close() { this.db.close(); }

  prep(sql) {
    return (this.st[sql] ??= this.db.prepare(sql));
  }

  tx(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const r = fn();
      this.db.exec('COMMIT');
      return r;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  // ---------- contas ----------
  createAccount(name, password) {
    const salt = randomBytes(16).toString('hex');
    const r = this.prep('INSERT INTO accounts (name, pass_hash, salt, created_at) VALUES (?, ?, ?, ?)')
      .run(name, hashPassword(password, salt), salt, Date.now());
    return Number(r.lastInsertRowid);
  }

  findAccount(name) {
    return this.prep('SELECT * FROM accounts WHERE name = ?').get(name);
  }

  verifyAccount(name, password) {
    const acc = this.findAccount(name);
    if (!acc) return null;
    const a = Buffer.from(hashPassword(password, acc.salt), 'hex');
    const b = Buffer.from(acc.pass_hash, 'hex');
    return a.length === b.length && timingSafeEqual(a, b) ? acc : null;
  }

  // ---------- personagens ----------
  listCharacters(accountId) {
    return this.prep('SELECT id, name, class_id, level, map_id FROM characters WHERE account_id = ? ORDER BY id').all(accountId);
  }

  characterNameTaken(name) {
    return !!this.prep('SELECT 1 FROM characters WHERE name = ?').get(name);
  }

  // kit: { equip: [defId], bag: [[defId, qty]] }; slotFor: defId -> slot
  createCharacter({ accountId, name, classId, hp, mp, mapId, x, z, kit, slotFor }) {
    return this.tx(() => {
      const now = Date.now();
      const r = this.prep(`INSERT INTO characters (account_id, name, class_id, hp, mp, map_id, x, z, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(accountId, name, classId, hp, mp, mapId, x, z, now, now);
      const charId = Number(r.lastInsertRowid);
      for (const defId of kit.equip) this.insertItem({ id: randomUUID(), charId, defId, qty: 1, enh: 0, loc: 'equip', slot: slotFor(defId), source: 'kit' });
      for (const [defId, qty] of kit.bag) this.insertItem({ id: randomUUID(), charId, defId, qty, enh: 0, loc: 'bag', slot: null, source: 'kit' });
      return charId;
    });
  }

  loadCharacter(charId) {
    const row = this.prep('SELECT * FROM characters WHERE id = ?').get(charId);
    if (!row) return null;
    const items = new Map();
    for (const it of this.prep('SELECT * FROM item_instances WHERE char_id = ? ORDER BY created_at, id').all(charId)) {
      if (it.loc === 'storage') continue; // fica no depósito da conta
      items.set(it.id, { id: it.id, defId: it.def_id, qty: it.qty, enh: it.enh, loc: it.loc, slot: it.slot });
    }
    return {
      id: row.id, accountId: row.account_id, name: row.name, classId: row.class_id, level: row.level, xp: row.xp,
      alloc: JSON.parse(row.alloc_json), unspent: row.unspent, skillPoints: row.skill_points, skills: JSON.parse(row.skills_json),
      hp: row.hp, mp: row.mp, gold: row.gold, mapId: row.map_id, x: row.x, z: row.z, dead: !!row.dead, items, playedS: row.played_s ?? 0,
      trialDone: !!JSON.parse(row.flags_json || '{}').trialDone,
    };
  }

  saveCharacter(c) {
    this.prep(`UPDATE characters SET level=?, xp=?, alloc_json=?, unspent=?, skill_points=?, skills_json=?, hp=?, mp=?, gold=?,
      map_id=?, x=?, z=?, dead=?, flags_json=?, played_s=?, updated_at=? WHERE id=?`).run(
      c.level, c.xp, JSON.stringify(c.alloc), c.unspent, c.skillPoints, JSON.stringify(c.skills), Math.round(c.hp), Math.round(c.mp),
      c.gold, c.saveMapId ?? c.mapId, c.saveX ?? c.x, c.saveZ ?? c.z, c.dead ? 1 : 0, JSON.stringify({ trialDone: !!c.trialDone }), c.playedS ?? 0, Date.now(), c.id);
  }

  insertItem({ id, charId, defId, qty, enh, loc, slot, source }) {
    this.prep(`INSERT INTO item_instances (id, char_id, def_id, qty, enh, loc, slot, source, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, charId, defId, qty, enh, loc, slot, source, Date.now());
  }

  // Grava posições de itens alterados. Primeiro tira todos os alterados do espaço de
  // equipamento para não violar o índice único durante trocas.
  saveItems(charId, items) {
    const clear = this.prep("UPDATE item_instances SET loc='bag', slot=NULL WHERE id=? AND char_id=?");
    for (const it of items) clear.run(it.id, charId);
    const upd = this.prep('UPDATE item_instances SET qty=?, enh=?, loc=?, slot=? WHERE id=? AND char_id=?');
    for (const it of items) upd.run(it.qty, it.enh || 0, it.loc, it.slot ?? null, it.id, charId);
  }

  deleteItem(charId, id) {
    this.prep('DELETE FROM item_instances WHERE id=? AND char_id=?').run(id, charId);
  }

  countItems(charId) {
    return this.prep('SELECT COUNT(*) AS n FROM item_instances WHERE char_id=?').get(charId).n;
  }

  // ---------- telemetria ----------
  logLevel(charId, level, classId, playedS) {
    this.prep('INSERT OR IGNORE INTO level_log (char_id, level, class_id, played_s, at) VALUES (?, ?, ?, ?, ?)').run(charId, level, classId, playedS, Date.now());
  }

  levelLog() {
    return this.prep('SELECT char_id, level, class_id, played_s FROM level_log ORDER BY char_id, level').all();
  }

  // ---------- missões ----------
  loadQuests(charId) {
    return this.prep('SELECT quest_id, state, progress_json FROM quest_progress WHERE char_id=?').all(charId);
  }

  saveQuest(charId, questId, state, progress) {
    this.prep(`INSERT INTO quest_progress (char_id, quest_id, state, progress_json, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(char_id, quest_id) DO UPDATE SET state=excluded.state, progress_json=excluded.progress_json, updated_at=excluded.updated_at`)
      .run(charId, questId, state, JSON.stringify(progress), Date.now());
  }

  // ---------- saque ----------
  insertLoot(d) {
    this.prep(`INSERT INTO loot_drops (id, char_id, def_id, qty, gold, map_id, x, z, monster_def, kill_id, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(d.id, d.charId, d.defId ?? null, d.qty, d.gold, d.mapId, d.x, d.z, d.monsterDef, d.killId, d.createdAt, d.expiresAt);
  }

  getLoot(id) {
    return this.prep('SELECT * FROM loot_drops WHERE id=?').get(id);
  }

  unclaimedLoot(charId, now) {
    return this.prep('SELECT * FROM loot_drops WHERE char_id=? AND claimed_at IS NULL AND expires_at > ? ORDER BY created_at').all(charId, now);
  }

  markLootClaimed(id, instanceId) {
    this.prep('UPDATE loot_drops SET claimed_at=?, claimed_instance_id=? WHERE id=? AND claimed_at IS NULL').run(Date.now(), instanceId ?? null, id);
  }

  // Recompensa diária: true só na primeira vez do dia (idempotente por chave primária).
  claimDaily(charId, key, day) {
    const r = this.prep('INSERT OR IGNORE INTO daily_claims (char_id, claim_key, day) VALUES (?, ?, ?)').run(charId, key, day);
    return r.changes > 0;
  }

  // ---------- depósito da conta ----------
  listAccountStorage(accountId) {
    return this.prep(`SELECT i.id, i.def_id, i.qty, i.enh, c.name AS owner FROM item_instances i JOIN characters c ON c.id = i.char_id
      WHERE c.account_id = ? AND i.loc = 'storage' ORDER BY i.created_at, i.id`).all(accountId);
  }

  takeFromStorage(accountId, itemId, charId) {
    return this.tx(() => {
      const row = this.prep(`SELECT i.* FROM item_instances i JOIN characters c ON c.id = i.char_id
        WHERE i.id = ? AND i.loc = 'storage' AND c.account_id = ?`).get(itemId, accountId);
      if (!row) return null;
      this.prep("UPDATE item_instances SET char_id = ?, loc = 'bag', slot = NULL WHERE id = ? AND loc = 'storage'").run(charId, itemId);
      return row;
    });
  }
}
