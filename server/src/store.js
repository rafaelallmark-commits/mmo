// Persistência simples em SQLite (node:sqlite, síncrono). Um arquivo por servidor de zona.
// Cada operação que muda inventário, XP ou saque roda numa transação única.
// SQLite é o banco de desenvolvimento; em produção o mesmo contrato roda no PostgreSQL (store-pg.js,
// escolhido por createStore em db.js). Toda migração nova precisa existir nos dois (MIGRATIONS aqui e
// PG_MIGRATIONS em store-pg.js, com a mesma versão e o mesmo nome).
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, scryptSync, scrypt, randomBytes, timingSafeEqual, createHash, randomInt } from 'node:crypto';

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
  { v: 3, name: 'contas para o teste público: e-mail, papel, exclusão, códigos e auditoria', up: (db) => {
    db.exec("ALTER TABLE accounts ADD COLUMN email TEXT");
    db.exec('ALTER TABLE accounts ADD COLUMN verified INTEGER NOT NULL DEFAULT 1');
    db.exec("ALTER TABLE accounts ADD COLUMN role TEXT NOT NULL DEFAULT 'player'");
    db.exec('ALTER TABLE accounts ADD COLUMN deleted_at INTEGER');
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_email ON accounts(email COLLATE NOCASE) WHERE email IS NOT NULL');
    db.exec(`CREATE TABLE IF NOT EXISTS account_codes (
      account_id INTEGER NOT NULL REFERENCES accounts(id),
      kind TEXT NOT NULL CHECK (kind IN ('verify','reset')),
      code_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      used_at INTEGER,
      created_at INTEGER NOT NULL
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_codes_account ON account_codes(account_id, kind)');
    db.exec(`CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at INTEGER NOT NULL,
      kind TEXT NOT NULL,
      account_id INTEGER,
      char_id INTEGER,
      ip TEXT,
      data_json TEXT NOT NULL DEFAULT '{}'
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_audit_char ON audit_log(char_id, at)');
  } },
  { v: 4, name: 'clãs (pós-versão 1)', up: (db) => {
    db.exec(`CREATE TABLE IF NOT EXISTS clans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      tag TEXT NOT NULL UNIQUE COLLATE NOCASE,
      leader_char_id INTEGER NOT NULL REFERENCES characters(id),
      motd TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS clan_members (
      clan_id INTEGER NOT NULL REFERENCES clans(id),
      char_id INTEGER NOT NULL PRIMARY KEY REFERENCES characters(id),
      rank TEXT NOT NULL CHECK (rank IN ('leader','officer','member')),
      joined_at INTEGER NOT NULL
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_clan_members_clan ON clan_members(clan_id)');
  } },
  { v: 5, name: 'moderação: suspensão e silêncio por conta', up: (db) => {
    db.exec('ALTER TABLE accounts ADD COLUMN banned_until INTEGER');
    db.exec('ALTER TABLE accounts ADD COLUMN ban_reason TEXT');
    db.exec('ALTER TABLE accounts ADD COLUMN muted_until INTEGER');
  } },
  { v: 6, name: 'contas: aceite dos termos na conta e limites de e-mail e de tentativas', up: (db) => {
    // versão dos Termos de Uso e da Política de Privacidade aceita e quando; as contas que já existem ficam
    // com a versão 1 (a única até aqui) e a data da linha account_created da auditoria, se ela ainda existir
    db.exec('ALTER TABLE accounts ADD COLUMN terms_version INTEGER NOT NULL DEFAULT 1');
    db.exec('ALTER TABLE accounts ADD COLUMN terms_at INTEGER');
    db.exec(`UPDATE accounts SET terms_at = (SELECT MIN(a.at) FROM audit_log a
      WHERE a.kind = 'account_created' AND a.account_id = accounts.id AND a.data_json LIKE '%"terms":%')`);
    // e-mails mandados ('mail', com o resumo do endereço de destino) e códigos errados ('code_fail'), para os
    // limites por conta e por endereço; sem chave estrangeira: o contador do endereço sobrevive à exclusão
    db.exec(`CREATE TABLE IF NOT EXISTS account_events (
      kind TEXT NOT NULL CHECK (kind IN ('mail','code_fail')),
      account_id INTEGER,
      addr_hash TEXT,
      at INTEGER NOT NULL
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_account_events_account ON account_events(account_id, kind, at)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_account_events_addr ON account_events(addr_hash, kind, at)');
  } },
  { v: 7, name: 'lista de ignorados por personagem', up: (db) => {
    db.exec(`CREATE TABLE IF NOT EXISTS char_ignores (
      char_id INTEGER NOT NULL REFERENCES characters(id),
      ignored_id INTEGER NOT NULL REFERENCES characters(id),
      created_at INTEGER NOT NULL,
      PRIMARY KEY (char_id, ignored_id)
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_ignores_ignored ON char_ignores(ignored_id)');
  } },
];

export function migrate(db) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');
  let row = db.prepare('SELECT version FROM schema_version').get();
  if (!row) {
    // banco novo ou anterior ao controle de versão: a migração 1 é idempotente (CREATE IF NOT EXISTS)
    db.prepare('INSERT INTO schema_version (version) SELECT 0 WHERE NOT EXISTS (SELECT 1 FROM schema_version)').run();
    row = { version: 0 };
  }
  const applied = [];
  for (const m of MIGRATIONS) {
    if (m.v <= row.version) continue;
    db.exec('BEGIN IMMEDIATE');
    try {
      // outro processo no mesmo banco (várias zonas) pode ter migrado enquanto esperávamos a trava
      row = db.prepare('SELECT MAX(version) AS version FROM schema_version').get();
      if (m.v <= row.version) { db.exec('COMMIT'); continue; }
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

// ---------- partes puras, compartilhadas com o PostgreSQL (store-pg.js) ----------
export function hashPassword(password, salt) {
  return scryptSync(password, salt, 32).toString('hex');
}

// Mesma conta de hashPassword, fora da thread do jogo (o scrypt roda no pool do libuv): a conferência de
// senha dentro do servidor de zona (excluir conta ou personagem) não para o tick de ninguém (D144).
export function hashPasswordAsync(password, salt) {
  return new Promise((resolve, reject) => scrypt(password, salt, 32, (err, key) => (err ? reject(err) : resolve(key.toString('hex')))));
}

export async function checkPasswordAsync(acc, password) {
  if (!acc?.salt || !acc?.pass_hash || typeof password !== 'string') return false;
  const a = Buffer.from(await hashPasswordAsync(password, acc.salt), 'hex');
  const b = Buffer.from(acc.pass_hash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

// hash do código de 6 dígitos (só ele fica no banco)
export function codeHash(accountId, code) {
  return createHash('sha256').update(`${accountId}:${String(code)}`).digest('hex');
}

// resumo do endereço de e-mail para os limites de envio (o endereço em si não fica em account_events)
export function addressHash(email) {
  return createHash('sha256').update(`email:${String(email).trim().toLowerCase()}`).digest('hex');
}

// Retenção do serviço de contas (purgeOld): conta nunca confirmada some depois de 7 dias (libera nome e
// e-mail); os eventos dos limites (e-mails mandados, códigos errados) valem por 24 h.
export const UNVERIFIED_TTL_MS = 7 * 86400000;
export const ACCOUNT_EVENTS_TTL_MS = 86400000;

// { n, first, last } de um evento de conta (contagem e instantes do primeiro e do último na janela)
export function eventStat(row) {
  return { n: Number(row?.n ?? 0), first: row?.first ?? null, last: row?.last ?? null };
}

// linha de characters + linhas de item_instances (já ordenadas) -> personagem em memória
export function charFromRow(row, itemRows) {
  const items = new Map();
  for (const it of itemRows) {
    if (it.loc === 'storage') continue; // fica no depósito da conta
    items.set(it.id, { id: it.id, defId: it.def_id, qty: it.qty, enh: it.enh, loc: it.loc, slot: it.slot });
  }
  return {
    id: row.id, accountId: row.account_id, name: row.name, classId: row.class_id, level: row.level, xp: row.xp,
    alloc: JSON.parse(row.alloc_json), unspent: row.unspent, skillPoints: row.skill_points, skills: JSON.parse(row.skills_json),
    hp: row.hp, mp: row.mp, gold: row.gold, mapId: row.map_id, x: row.x, z: row.z, dead: !!row.dead, items, playedS: row.played_s ?? 0,
    ...(() => { const f = JSON.parse(row.flags_json || '{}'); return { trialDone: !!f.trialDone, title: f.title ?? null, choices: f.choices ?? {} }; })(),
  };
}

// valores do UPDATE de saveCharacter, na ordem das colunas (o id vai por último)
export function charSaveValues(c, now = Date.now()) {
  return [
    c.level, c.xp, JSON.stringify(c.alloc), c.unspent, c.skillPoints, JSON.stringify(c.skills), Math.round(c.hp), Math.round(c.mp),
    c.gold, c.saveMapId ?? c.mapId, c.saveX ?? c.x, c.saveZ ?? c.z, c.dead ? 1 : 0, JSON.stringify({ trialDone: !!c.trialDone, title: c.title ?? null, choices: c.choices ?? {} }), c.playedS ?? 0, now, c.id,
  ];
}

// Exportação dos dados da conta (LGPD): a denúncia que a conta fez sai sem as falas do denunciado e sem o id
// da conta dele (dados de outra pessoa, guardados só para a equipe analisar); fica o número de falas.
export function exportAuditRows(rows) {
  return rows.map((r) => {
    if (r.kind !== 'report') return r;
    try {
      const { chat, targetAccount, ...d } = JSON.parse(r.data_json);
      return { ...r, data_json: JSON.stringify({ ...d, chatLines: Array.isArray(chat) ? chat.length : 0 }) };
    } catch { return r; }
  });
}

export class Store {
  constructor(path = ':memory:') {
    this.path = path;
    this.db = new DatabaseSync(path);
    // vários processos no mesmo banco (várias zonas): a espera pela trava vale desde o começo, e a troca
    // para WAL (que exige acesso exclusivo e não espera sozinha) é tentada de novo por até ~1 s
    this.db.exec('PRAGMA busy_timeout = 3000');
    for (let i = 0; ; i++) {
      try { this.db.exec('PRAGMA journal_mode = WAL'); break; } catch (e) {
        if (i >= 50 || !/locked|busy/i.test(e.message)) throw e;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
      }
    }
    this.db.exec('PRAGMA foreign_keys = ON');
    this.migrated = migrate(this.db);
    this.st = {};
  }

  get kind() { return 'sqlite'; }
  describe() { return `SQLite ${this.path}`; }

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
  // email/verified: contas criadas pelo serviço de contas (teste público) começam sem verificação.
  // termsVersion/termsAt: aceite dos termos no cadastro, gravado junto com a conta (sem eles: versão 1, sem data).
  createAccount(name, password, { email = null, verified = true, termsVersion = 1, termsAt = null } = {}) {
    const salt = randomBytes(16).toString('hex');
    const r = this.prep('INSERT INTO accounts (name, pass_hash, salt, created_at, email, verified, terms_version, terms_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(name, hashPassword(password, salt), salt, Date.now(), email, verified ? 1 : 0, termsVersion, termsAt);
    return Number(r.lastInsertRowid);
  }

  findAccount(name) {
    return this.prep('SELECT * FROM accounts WHERE name = ? AND deleted_at IS NULL').get(name);
  }

  findAccountById(id) {
    return this.prep('SELECT * FROM accounts WHERE id = ? AND deleted_at IS NULL').get(id);
  }

  // várias contas de uma vez (conferência periódica da moderação), em ordem de id; no PostgreSQL é uma
  // consulta só, para não parar o tick com uma ida e volta por jogador
  findAccountsByIds(ids) {
    return [...new Set(ids)].sort((a, b) => a - b).map((id) => this.findAccountById(id)).filter(Boolean);
  }

  findAccountByEmail(email) {
    return this.prep('SELECT * FROM accounts WHERE email = ? COLLATE NOCASE AND deleted_at IS NULL').get(email);
  }

  verifyAccount(name, password) {
    const acc = this.findAccount(name);
    if (!acc) return null;
    return this.checkPassword(acc, password) ? acc : null;
  }

  checkPassword(acc, password) {
    const a = Buffer.from(hashPassword(password, acc.salt), 'hex');
    const b = Buffer.from(acc.pass_hash, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  }

  // a mesma conferência sem parar a thread do jogo (promessa)
  checkPasswordAsync(acc, password) { return checkPasswordAsync(acc, password); }

  setPassword(accountId, password) {
    const salt = randomBytes(16).toString('hex');
    this.prep('UPDATE accounts SET pass_hash = ?, salt = ? WHERE id = ?').run(hashPassword(password, salt), salt, accountId);
  }

  setVerified(accountId) { this.prep('UPDATE accounts SET verified = 1 WHERE id = ?').run(accountId); }
  setRole(accountId, role) { this.prep('UPDATE accounts SET role = ? WHERE id = ?').run(role, accountId); }
  setBan(accountId, until, reason) { this.prep('UPDATE accounts SET banned_until = ?, ban_reason = ? WHERE id = ?').run(until, reason, accountId); }
  setMute(accountId, until) { this.prep('UPDATE accounts SET muted_until = ? WHERE id = ?').run(until, accountId); }
  setTermsAccepted(accountId, version, at = Date.now()) { this.prep('UPDATE accounts SET terms_version = ?, terms_at = ? WHERE id = ?').run(version, at, accountId); }

  // Eventos dos limites do serviço de contas: 'mail' (e-mail mandado: conta e resumo do endereço de destino)
  // e 'code_fail' (palpite errado contra um código válido, anotado por consumeCode).
  noteAccountEvent(kind, accountId, email = null) {
    this.prep('INSERT INTO account_events (kind, account_id, addr_hash, at) VALUES (?, ?, ?, ?)').run(kind, accountId ?? null, email ? addressHash(email) : null, Date.now());
  }

  // libera os limites de uma conta antes do prazo (ferramenta de operação): apaga os eventos dela
  clearAccountEvents(accountId) {
    return Number(this.prep('DELETE FROM account_events WHERE account_id = ?').run(accountId).changes);
  }

  // Contagem e instantes (primeiro, último) de um tipo de evento desde `since`, separados por conta e por
  // endereço de destino: { account: { n, first, last }, address: { n, first, last } }.
  accountEventStats(kind, accountId, email, since) {
    const q = 'SELECT COUNT(*) AS n, MIN(at) AS first, MAX(at) AS last FROM account_events WHERE kind = ? AND at > ? AND ';
    return {
      account: eventStat(this.prep(`${q}account_id = ?`).get(kind, since, accountId ?? null)),
      address: eventStat(this.prep(`${q}addr_hash = ?`).get(kind, since, email ? addressHash(email) : null)),
    };
  }

  // Código de 6 dígitos (verificação de e-mail ou troca de senha). Guarda só o hash; vale 30 min.
  issueCode(accountId, kind, ttlMs = 30 * 60 * 1000) {
    const code = String(randomInt(0, 1000000)).padStart(6, '0');
    this.prep('UPDATE account_codes SET used_at = ? WHERE account_id = ? AND kind = ? AND used_at IS NULL').run(Date.now(), accountId, kind);
    this.prep('INSERT INTO account_codes (account_id, kind, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(accountId, kind, codeHash(accountId, code), Date.now() + ttlMs, Date.now());
    return code;
  }

  // true se o código confere (usa uma vez; 5 tentativas erradas invalidam). Palpite errado contra um código
  // válido também vira um evento 'code_fail' da conta (limite diário do serviço de contas).
  consumeCode(accountId, kind, code) {
    const row = this.prep('SELECT rowid AS rid, * FROM account_codes WHERE account_id = ? AND kind = ? AND used_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1').get(accountId, kind, Date.now());
    if (!row) return false;
    const ok = row.code_hash === codeHash(accountId, code);
    if (ok) this.prep('UPDATE account_codes SET used_at = ? WHERE rowid = ?').run(Date.now(), row.rid);
    else {
      this.prep('UPDATE account_codes SET attempts = attempts + 1, used_at = CASE WHEN attempts + 1 >= 5 THEN ? ELSE NULL END WHERE rowid = ?').run(Date.now(), row.rid);
      this.noteAccountEvent('code_fail', accountId);
    }
    return ok;
  }

  // Apaga o que é de um personagem (dentro de tx): sai do clã — o clã que ele liderava passa para o oficial
  // (ou membro) mais antigo e, vazio, acaba —, itens, missões, saques não pegos e as listas de ignorados (a
  // dele e as entradas dele nas dos outros); o nome vira excluido_<id> (liberado) e o ouro some. A linha fica,
  // anônima, para a integridade das referências (saque, auditoria). keepStorage: as peças que ele guardou no
  // depósito continuam no depósito da conta, que não acaba com o personagem (D144).
  wipeCharacter(charId, { keepStorage = false } = {}) {
    this.prep('DELETE FROM clan_members WHERE char_id = ?').run(charId);
    for (const cl of this.prep('SELECT id FROM clans WHERE leader_char_id = ?').all(charId)) {
      const next = this.prep("SELECT char_id FROM clan_members WHERE clan_id = ? ORDER BY CASE rank WHEN 'officer' THEN 0 ELSE 1 END, joined_at, char_id LIMIT 1").get(cl.id);
      if (next) { this.prep('UPDATE clans SET leader_char_id = ? WHERE id = ?').run(next.char_id, cl.id); this.prep("UPDATE clan_members SET rank = 'leader' WHERE char_id = ?").run(next.char_id); }
      else this.prep('DELETE FROM clans WHERE id = ?').run(cl.id);
    }
    this.prep(keepStorage ? "DELETE FROM item_instances WHERE char_id = ? AND loc <> 'storage'" : 'DELETE FROM item_instances WHERE char_id = ?').run(charId);
    this.prep('DELETE FROM quest_progress WHERE char_id = ?').run(charId);
    this.prep('DELETE FROM loot_drops WHERE char_id = ? AND claimed_at IS NULL').run(charId);
    this.prep('DELETE FROM char_ignores WHERE char_id = ? OR ignored_id = ?').run(charId, charId);
    this.prep("UPDATE characters SET name = ?, gold = 0, flags_json = '{}' WHERE id = ?").run(`excluido_${charId}`, charId);
  }

  // Exclusão de conta (privacidade): apaga dados pessoais e itens, mantém linhas anônimas para a
  // integridade das referências (saque, auditoria).
  deleteAccount(accountId) {
    return this.tx(() => {
      const chars = this.prep('SELECT id FROM characters WHERE account_id = ?').all(accountId);
      for (const c of chars) this.wipeCharacter(c.id);
      this.prep('DELETE FROM account_codes WHERE account_id = ?').run(accountId);
      this.prep("UPDATE accounts SET name = ?, email = NULL, pass_hash = '', salt = '', deleted_at = ? WHERE id = ?").run(`excluida_${accountId}`, Date.now(), accountId);
      return chars.length;
    });
  }

  // Exclusão de um personagem da conta (a conta continua): a mesma limpeza da exclusão de conta para ele.
  // Devolve o nome que ele tinha, ou null se o personagem não é desta conta (ou já foi excluído).
  deleteCharacter(accountId, charId) {
    return this.tx(() => {
      const row = this.prep("SELECT id, name FROM characters WHERE id = ? AND account_id = ? AND name NOT LIKE 'excluido\\_%' ESCAPE '\\'").get(charId, accountId);
      if (!row) return null;
      this.wipeCharacter(row.id, { keepStorage: true });
      return row.name;
    });
  }

  // Portabilidade (LGPD): tudo o que guardamos da conta, em JSON.
  exportAccount(accountId) {
    const acc = this.prep('SELECT id, name, email, verified, role, created_at, terms_version, terms_at, banned_until, ban_reason, muted_until FROM accounts WHERE id = ?').get(accountId);
    const chars = this.prep('SELECT id, name, class_id, level, xp, gold, map_id, played_s, created_at, updated_at FROM characters WHERE account_id = ?').all(accountId);
    const ids = chars.map((c) => c.id);
    const inChars = (sql) => ids.flatMap((id) => this.prep(sql).all(id));
    return {
      conta: acc,
      personagens: chars,
      itens: inChars('SELECT char_id, def_id, qty, enh, loc, slot, source, created_at FROM item_instances WHERE char_id = ?'),
      missoes: inChars('SELECT char_id, quest_id, state, updated_at FROM quest_progress WHERE char_id = ?'),
      clas: inChars('SELECT m.char_id, c.name, c.tag, m.rank, m.joined_at FROM clan_members m JOIN clans c ON c.id = m.clan_id WHERE m.char_id = ?'),
      ignorados: inChars('SELECT i.char_id, c.name AS ignorado, i.created_at FROM char_ignores i JOIN characters c ON c.id = i.ignored_id WHERE i.char_id = ? ORDER BY i.created_at, i.ignored_id'),
      // a conta e os personagens dela (as linhas do jogo — saque, compra, venda, refino, troca, clã — têm só o personagem)
      auditoria: exportAuditRows(this.prep('SELECT at, kind, char_id, ip, data_json FROM audit_log WHERE account_id = ? OR char_id IN (SELECT id FROM characters WHERE account_id = ?) ORDER BY at, id').all(accountId, accountId)),
    };
  }

  // ---------- comércio ----------
  // Passa um item da bolsa de um personagem para a de outro (dentro de tx); false se não estava lá.
  transferItem(itemId, fromChar, toChar) {
    return this.prep("UPDATE item_instances SET char_id = ?, loc = 'bag', slot = NULL WHERE id = ? AND char_id = ? AND loc = 'bag'").run(toChar, itemId, fromChar).changes === 1;
  }

  // ---------- clãs ----------
  createClan(name, tag, leaderCharId) {
    const r = this.prep('INSERT INTO clans (name, tag, leader_char_id, created_at) VALUES (?, ?, ?, ?)').run(name, tag, leaderCharId, Date.now());
    const id = Number(r.lastInsertRowid);
    this.prep("INSERT INTO clan_members (clan_id, char_id, rank, joined_at) VALUES (?, ?, 'leader', ?)").run(id, leaderCharId, Date.now());
    return id;
  }
  clanById(id) { return this.prep('SELECT * FROM clans WHERE id = ?').get(id); }
  clanByNameOrTag(name, tag) { return this.prep('SELECT * FROM clans WHERE name = ? OR tag = ?').get(name, tag); }
  clanByName(name) { return this.prep('SELECT * FROM clans WHERE name = ?').get(name); }
  clanByTag(tag) { return this.prep('SELECT * FROM clans WHERE tag = ?').get(tag); }
  renameClan(clanId, name) { this.prep('UPDATE clans SET name = ? WHERE id = ?').run(name, clanId); }
  clanOfChar(charId) {
    return this.prep('SELECT c.id, c.name, c.tag, c.motd, c.leader_char_id, m.rank FROM clan_members m JOIN clans c ON c.id = m.clan_id WHERE m.char_id = ?').get(charId);
  }
  clanMembers(clanId) {
    return this.prep('SELECT m.char_id, m.rank, ch.name, ch.level, ch.class_id FROM clan_members m JOIN characters ch ON ch.id = m.char_id WHERE m.clan_id = ? ORDER BY m.rank, ch.name').all(clanId);
  }
  addClanMember(clanId, charId, rank = 'member') { this.prep('INSERT INTO clan_members (clan_id, char_id, rank, joined_at) VALUES (?, ?, ?, ?)').run(clanId, charId, rank, Date.now()); }
  removeClanMember(charId) { this.prep('DELETE FROM clan_members WHERE char_id = ?').run(charId); }
  setClanRank(charId, rank) { this.prep('UPDATE clan_members SET rank = ? WHERE char_id = ?').run(rank, charId); }
  setClanLeader(clanId, charId) { this.prep('UPDATE clans SET leader_char_id = ? WHERE id = ?').run(charId, clanId); }
  setClanMotd(clanId, motd) { this.prep('UPDATE clans SET motd = ? WHERE id = ?').run(motd, clanId); }
  deleteClan(clanId) {
    this.prep('DELETE FROM clan_members WHERE clan_id = ?').run(clanId);
    this.prep('DELETE FROM clans WHERE id = ?').run(clanId);
  }

  // ---------- auditoria ----------
  audit(kind, { accountId = null, charId = null, ip = null, ...data } = {}) {
    this.prep('INSERT INTO audit_log (at, kind, account_id, char_id, ip, data_json) VALUES (?, ?, ?, ?, ?, ?)')
      .run(Date.now(), kind, accountId, charId, ip, JSON.stringify(data));
  }

  auditTail(limit = 50, kind = null) {
    return kind ? this.prep('SELECT * FROM audit_log WHERE kind = ? ORDER BY id DESC LIMIT ?').all(kind, limit)
      : this.prep('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?').all(limit);
  }

  // retenção: apaga auditoria mais velha que N dias, códigos vencidos, eventos dos limites com mais de 24 h e
  // contas nunca confirmadas com mais de 7 dias (sem personagens: quem não confirmou nunca entrou no jogo), o
  // que libera o nome e o e-mail delas
  purgeOld(auditDays) {
    const now = Date.now();
    const cut = now - auditDays * 86400000;
    const a = this.prep('DELETE FROM audit_log WHERE at < ?').run(cut).changes;
    const c = this.prep('DELETE FROM account_codes WHERE expires_at < ?').run(now - 86400000).changes;
    const e = this.prep('DELETE FROM account_events WHERE at < ?').run(now - ACCOUNT_EVENTS_TTL_MS).changes;
    const stale = `SELECT id FROM accounts WHERE verified = 0 AND deleted_at IS NULL AND created_at < ?
      AND NOT EXISTS (SELECT 1 FROM characters c WHERE c.account_id = accounts.id)`;
    const u = this.tx(() => {
      this.prep(`DELETE FROM account_codes WHERE account_id IN (${stale})`).run(now - UNVERIFIED_TTL_MS);
      return this.prep(`DELETE FROM accounts WHERE id IN (${stale})`).run(now - UNVERIFIED_TTL_MS).changes;
    });
    return { audit: Number(a), codes: Number(c), events: Number(e), unverified: Number(u) };
  }

  // ---------- personagens ----------
  listCharacters(accountId) {
    return this.prep("SELECT id, name, class_id, level, map_id FROM characters WHERE account_id = ? AND name NOT LIKE 'excluido\\_%' ESCAPE '\\' ORDER BY id").all(accountId);
  }

  characterNameTaken(name) {
    return !!this.prep('SELECT 1 FROM characters WHERE name = ?').get(name);
  }

  characterByName(name) {
    return this.prep('SELECT id, name, account_id FROM characters WHERE name = ? COLLATE NOCASE').get(name);
  }

  // administração (/gm renomear, retirar, retirar_ouro), inclusive de personagem fora do ar
  renameCharacter(charId, name) { this.prep('UPDATE characters SET name = ? WHERE id = ?').run(name, charId); }
  setCharacterGold(charId, gold) { this.prep('UPDATE characters SET gold = ? WHERE id = ?').run(gold, charId); }
  // todas as peças do personagem, inclusive as que ele guardou no depósito da conta
  characterItems(charId) {
    return this.prep('SELECT id, def_id, qty, enh, loc, slot FROM item_instances WHERE char_id = ? ORDER BY created_at, id').all(charId);
  }

  // ---------- lista de ignorados (por personagem) ----------
  listIgnored(charId) {
    return this.prep('SELECT i.ignored_id, c.name FROM char_ignores i JOIN characters c ON c.id = i.ignored_id WHERE i.char_id = ? ORDER BY c.name, i.ignored_id').all(charId);
  }
  addIgnore(charId, ignoredId) {
    return this.prep('INSERT OR IGNORE INTO char_ignores (char_id, ignored_id, created_at) VALUES (?, ?, ?)').run(charId, ignoredId, Date.now()).changes > 0;
  }
  removeIgnore(charId, ignoredId) {
    return this.prep('DELETE FROM char_ignores WHERE char_id = ? AND ignored_id = ?').run(charId, ignoredId).changes > 0;
  }
  isIgnoring(charId, otherId) {
    return !!this.prep('SELECT 1 FROM char_ignores WHERE char_id = ? AND ignored_id = ?').get(charId, otherId);
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
    return charFromRow(row, this.prep('SELECT * FROM item_instances WHERE char_id = ? ORDER BY created_at, id').all(charId));
  }

  saveCharacter(c) {
    this.prep(`UPDATE characters SET level=?, xp=?, alloc_json=?, unspent=?, skill_points=?, skills_json=?, hp=?, mp=?, gold=?,
      map_id=?, x=?, z=?, dead=?, flags_json=?, played_s=?, updated_at=? WHERE id=?`).run(...charSaveValues(c));
  }

  // Salvamento periódico de todos os personagens conectados (GameServer.saveAll): uma transação só.
  saveCharacters(list) {
    if (!list.length) return;
    if (this.db.isTransaction) { for (const c of list) this.saveCharacter(c); return; }
    this.tx(() => { for (const c of list) this.saveCharacter(c); });
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
