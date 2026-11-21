// Migrações e conexões no PostgreSQL (só com CINZAS_TEST_PG, isto é, em `npm run test:pg`):
// - banco novo vai à última versão e o esquema bate com o do SQLite tabela a tabela, coluna a coluna;
// - banco parado numa versão antiga, com dados, sobe sem perder nada (o equivalente do "banco do M1" de
//   store.test.js, que só existe no SQLite);
// - três processos subindo juntos no mesmo esquema aplicam cada migração uma vez só (trava consultiva);
// - duas conexões no mesmo esquema: isolamento da transação e espera de trava limitada (lock_timeout).
// - um banco SQLite importado (tools/sqlite-para-pg.mjs) responde igual nos dois bancos (fração em coluna
//   inteira é arredondada); papel de menor privilégio, dono só do próprio esquema, sobe e migra.
// - falhas da ponte: conexão derrubada parada ou no meio da transação, prazo esgotado com o erro engolido
//   dentro de tx(fn), comando que falha dentro da transação, banco recusando conexões (falha na hora em
//   vez de esperar), migração esperando outro processo além do lock_timeout, close() encerrando o worker.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { Store, MIGRATIONS } from '../src/store.js';
import { PgStore } from '../src/store-pg.js';
import { importSqliteToPg } from '../tools/sqlite-para-pg.mjs';

const PG_URL = process.env.CINZAS_TEST_PG;
const skip = PG_URL ? false : 'só no PostgreSQL: rode `npm run test:pg` (sobe um servidor temporário)';
const schemaOf = (tag) => `t_pgmig_${tag}_${process.pid}`;
const PG_TYPE = { INTEGER: 'bigint', REAL: 'double precision', TEXT: 'text' };
const KIT = { equip: [], bag: [] };
const newChar = (st, acc, name) => st.createCharacter({ accountId: acc, name, classId: 'breaker', hp: 100, mp: 20, mapId: 'estrada_velha', x: 1, z: 2, kit: KIT, slotFor: () => null });
const bagItem = (charId, id) => ({ id, charId, defId: 'potion_hp_s', qty: 1, enh: 0, loc: 'bag', slot: null, source: 'teste' });
// espera síncrona (a thread principal parada, como numa chamada da ponte; o worker segue rodando)
const block = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const pidOf = (st) => st.query('SELECT pg_backend_pid() AS pid')[0].pid;

test('PostgreSQL: banco novo vai à última versão, reabrir não reaplica, esquema igual ao do SQLite', { skip }, () => {
  const schema = schemaOf('novo');
  const lite = new Store(':memory:');
  let st = new PgStore(PG_URL, { schema });
  try {
    assert.deepEqual(st.migrated, MIGRATIONS.map((m) => m.v));
    st.close();
    st = new PgStore(PG_URL, { schema, dropSchemaOnClose: true });
    assert.deepEqual(st.migrated, [], 'reabrir não reaplica');
    assert.equal(st.query('SELECT version FROM schema_version')[0].version, MIGRATIONS.at(-1).v);
    const tables = lite.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((r) => r.name);
    const pgTables = st.query("SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE' ORDER BY table_name COLLATE \"C\"", [schema]).map((r) => r.table_name);
    assert.deepEqual(pgTables, tables, 'mesmas tabelas');
    for (const t of tables) {
      const lc = lite.db.prepare(`PRAGMA table_info(${t})`).all();
      const pc = st.query('SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position', [schema, t])
        .filter((c) => !(t === 'account_codes' && c.column_name === 'rid')); // o rowid implícito do SQLite vira coluna no PostgreSQL
      assert.deepEqual(pc.map((c) => c.column_name), lc.map((c) => c.name), `colunas de ${t}, na mesma ordem`);
      for (const [i, c] of lc.entries()) {
        const where = `${t}.${c.name}`;
        assert.equal(pc[i].data_type, PG_TYPE[c.type], `${where}: tipo`);
        assert.equal(pc[i].is_nullable === 'NO', c.notnull === 1 || c.pk > 0, `${where}: NOT NULL`);
        const pgDefault = pc[i].column_default?.replace(/::[a-z ]+$/i, '') ?? null;
        assert.equal(pgDefault, c.dflt_value, `${where}: padrão`);
      }
    }
    // índices com nome no SQLite existem no PostgreSQL com a mesma unicidade e o mesmo filtro;
    // os UNIQUE COLLATE NOCASE viram índices únicos em nocase(...) (o NOCASE do SQLite: só A-Z)
    const pgIdx = new Map(st.query('SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = $1', [schema]).map((r) => [r.indexname, r.indexdef]));
    for (const ix of lite.db.prepare("SELECT name, tbl_name, sql FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL").all()) {
      const def = pgIdx.get(ix.name);
      assert.ok(def, `índice ${ix.name} existe`);
      assert.equal(/^CREATE UNIQUE/.test(def), /^CREATE UNIQUE/i.test(ix.sql), `${ix.name}: unicidade`);
      assert.equal(/ WHERE /.test(def), / WHERE /i.test(ix.sql), `${ix.name}: filtro`);
    }
    for (const [ix, table, col] of [['idx_accounts_name', 'accounts', 'name'], ['idx_characters_name', 'characters', 'name'], ['idx_clans_name', 'clans', 'name'], ['idx_clans_tag', 'clans', 'tag']]) {
      assert.match(pgIdx.get(ix) ?? '', new RegExp(`^CREATE UNIQUE INDEX ${ix} ON ${schema}\\.${table} USING btree \\((?:${schema}\\.)?nocase\\(${col}\\)\\)$`));
    }
    assert.match(pgIdx.get('idx_accounts_email') ?? '', /nocase\(email\)\) WHERE \(email IS NOT NULL\)$/);
    // nocase() troca só A-Z (fora do ASCII as maiúsculas contam, como no SQLite) e é imutável (serve para índice)
    assert.deepEqual(st.query("SELECT nocase('ÉLAN Zé') AS n")[0], Object.assign(Object.create(null), { n: 'Élan zé' }));
  } finally { st.close(); lite.close(); }
});

test('PostgreSQL: banco parado na versão 1, com dados, sobe para a última sem perder nada', { skip }, () => {
  const schema = schemaOf('v1');
  const old = new PgStore(PG_URL, { schema, targetVersion: 1 });
  let charId;
  try {
    assert.deepEqual(old.migrated, [1]);
    assert.equal(old.query("SELECT 1 FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'characters' AND column_name = 'played_s'", [schema]).length, 0, 'v1 ainda sem played_s');
    const [{ id: accId }] = old.query("INSERT INTO accounts (name, pass_hash, salt, created_at) VALUES ('velha', 'x', 'y', 1) RETURNING id");
    [{ id: charId }] = old.query(`INSERT INTO characters (account_id, name, class_id, hp, mp, map_id, x, z, created_at, updated_at)
      VALUES ($1, 'Antigo', 'breaker', 100, 20, 'estrada_velha', 30, 50, 1, 1) RETURNING id`, [accId]);
  } finally { old.close(); }
  const s1 = new PgStore(PG_URL, { schema });
  try {
    assert.deepEqual(s1.migrated, MIGRATIONS.filter((m) => m.v > 1).map((m) => m.v));
    const c = s1.loadCharacter(charId);
    assert.equal(c.name, 'Antigo'); assert.equal(c.playedS, 0); assert.equal(c.x, 30);
    c.playedS = 125.5;
    s1.saveCharacter(c);
    s1.logLevel(charId, 2, 'breaker', 125.5);
    s1.logLevel(charId, 2, 'breaker', 999); // repetido: ignorado
    const acc = s1.findAccount('VELHA');
    assert.equal(acc.verified, 1, 'conta antiga fica confirmada');
    assert.equal(acc.role, 'player'); assert.equal(acc.email, null); assert.equal(acc.deleted_at, null);
    // a identidade continua depois das linhas que já existiam
    assert.ok(s1.createAccount('nova', 'senha') > acc.id);
  } finally { s1.close(); }
  const s2 = new PgStore(PG_URL, { schema, dropSchemaOnClose: true });
  try {
    assert.deepEqual(s2.migrated, []);
    assert.equal(s2.loadCharacter(charId).playedS, 125.5);
    assert.deepEqual(s2.levelLog().map((r) => [r.level, r.played_s]), [[2, 125.5]]);
    assert.equal(s2.query('SELECT version FROM schema_version')[0].version, MIGRATIONS.at(-1).v);
  } finally { s2.close(); }
});

test('PostgreSQL: migração 6 — contas antigas com os termos na versão 1 e a data do aceite vinda da auditoria do cadastro', { skip }, () => {
  const schema = schemaOf('v5');
  const old = new PgStore(PG_URL, { schema, targetVersion: 5 });
  try {
    assert.deepEqual(old.migrated, [1, 2, 3, 4, 5]);
    old.exec(`INSERT INTO accounts (name, pass_hash, salt, created_at, email, verified) VALUES ('cadastro', 'x', 'y', 1000, 'c@exemplo.com', 1);
      INSERT INTO accounts (name, pass_hash, salt, created_at) VALUES ('dazona', 'x', 'y', 2000);
      INSERT INTO audit_log (at, kind, account_id, ip, data_json) VALUES (1500, 'account_created', 1, '10.0.0.1', '{"terms":1}');
      INSERT INTO audit_log (at, kind, account_id, ip, data_json) VALUES (1600, 'login', 2, '10.0.0.1', '{"via":"senha"}');`);
  } finally { old.close(); }
  const st = new PgStore(PG_URL, { schema, dropSchemaOnClose: true });
  try {
    assert.deepEqual(st.migrated, [6]);
    assert.deepEqual([st.findAccount('CADASTRO').terms_version, st.findAccount('cadastro').terms_at], [1, 1500]);
    assert.deepEqual([st.findAccount('dazona').terms_version, st.findAccount('dazona').terms_at], [1, null]);
    st.noteAccountEvent('mail', 1, 'c@exemplo.com');
    assert.equal(st.accountEventStats('mail', 1, 'C@EXEMPLO.COM', 0).address.n, 1);
  } finally { st.close(); }
});

test('PostgreSQL: três processos subindo juntos no mesmo esquema aplicam cada migração uma vez', { skip }, async () => {
  const schema = schemaOf('corrida');
  const code = `import { PgStore } from ${JSON.stringify(new URL('../src/store-pg.js', import.meta.url).href)};
    const s = new PgStore(process.env.PG_URL, { schema: process.env.PG_SCHEMA }); console.log(JSON.stringify(s.migrated)); s.close();`;
  const one = () => new Promise((resolve, reject) => {
    const p = spawn(process.execPath, ['--input-type=module', '-e', code], { env: { ...process.env, PG_URL, PG_SCHEMA: schema } });
    let out = '', err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('exit', (c) => (c === 0 ? resolve(JSON.parse(out.trim())) : reject(new Error(`processo saiu com ${c}: ${err}`))));
  });
  const results = await Promise.all([one(), one(), one()]);
  const all = MIGRATIONS.map((m) => m.v);
  assert.deepEqual(results.flat().sort(), all, `cada migração aplicada exatamente uma vez: ${JSON.stringify(results)}`);
  const st = new PgStore(PG_URL, { schema, dropSchemaOnClose: true });
  try {
    assert.deepEqual(st.migrated, []);
    assert.deepEqual(st.query('SELECT version FROM schema_version').map((r) => r.version), [all.at(-1)], 'uma linha só em schema_version');
  } finally { st.close(); }
});

test('PostgreSQL: duas conexões no mesmo esquema — isolamento da transação e espera de trava limitada', { skip }, () => {
  const schema = schemaOf('duas');
  const a = new PgStore(PG_URL, { schema });
  const b = new PgStore(PG_URL, { schema, lockTimeoutMs: 300 });
  try {
    const acc = a.createAccount('duas', 'senha');
    const id = a.createCharacter({ accountId: acc, name: 'Dupla', classId: 'breaker', hp: 100, mp: 20, mapId: 'estrada_velha', x: 1, z: 2, kit: KIT, slotFor: () => null });
    a.tx(() => {
      a.insertItem({ id: 'so-depois', charId: id, defId: 'potion_hp_s', qty: 1, enh: 0, loc: 'bag', slot: null, source: 'teste' });
      assert.equal(b.countItems(id), 0, 'a outra conexão não vê a transação aberta');
      const c = a.loadCharacter(id);
      c.gold = 10;
      a.saveCharacter(c); // a linha do personagem fica travada até o COMMIT
      const t0 = Date.now();
      assert.throws(() => b.saveCharacter({ ...c, gold: 20 }), (e) => e.code === '55P03', 'espera de trava vira erro em vez de travar para sempre');
      assert.ok(Date.now() - t0 < 3000);
    });
    assert.equal(b.countItems(id), 1, 'depois do COMMIT a outra conexão vê');
    assert.equal(b.loadCharacter(id).gold, 10);
  } finally { a.close(); b.close(); new PgStore(PG_URL, { schema, migrate: false, dropSchemaOnClose: true }).close(); }
});

test('PostgreSQL: banco SQLite importado (sqlite-para-pg) responde igual nos dois bancos', { skip }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'cinzas-import-'));
  const schema = schemaOf('import');
  const lite = new Store(join(dir, 'origem.db'));
  let pg;
  try {
    // um pouco de tudo, pela mesma interface que o jogo usa
    const a1 = lite.createAccount('Aurora', 'senha', { email: 'Aurora@Exemplo.com', verified: false });
    const a2 = lite.createAccount('bento', 'senha');
    const kit = { equip: ['axe_1h_t1'], bag: [['potion_hp_s', 3]] };
    const c1 = lite.createCharacter({ accountId: a1, name: 'Zed', classId: 'breaker', hp: 120, mp: 30, mapId: 'estrada_velha', x: 10.25, z: 20.5, kit, slotFor: () => 'weapon' });
    const c2 = lite.createCharacter({ accountId: a1, name: 'Yara', classId: 'warden', hp: 90, mp: 40, mapId: 'pedrambar', x: 1, z: 2, kit: KIT, slotFor: () => null });
    lite.createCharacter({ accountId: a2, name: 'Bento', classId: 'pikeman', hp: 100, mp: 20, mapId: 'estrada_velha', x: 3, z: 4, kit: KIT, slotFor: () => null });
    const z = lite.loadCharacter(c1);
    Object.assign(z, { level: 7, xp: 4321, gold: 99, playedS: 812.75, title: 'Guarda do Inverno', choices: { c4_reasons: 'b' }, alloc: { str: 10 }, skills: { cleave: 2 } });
    lite.saveCharacters([z]);
    for (const q of ['tutorial', 'c1_rats', 'C2']) lite.saveQuest(c1, q, q === 'tutorial' ? 'done' : 'active', { 0: 3 });
    const now = Date.now();
    lite.insertLoot({ id: 'loot-a', charId: c1, defId: 'potion_hp_s', qty: 2, gold: 0, mapId: 'estrada_velha', x: 5.5, z: 6, monsterDef: 'rat', killId: 'k1', createdAt: now, expiresAt: now + 60000 });
    lite.insertLoot({ id: 'loot-b', charId: c1, defId: null, qty: 0, gold: 12, mapId: 'estrada_velha', x: 5, z: 6, monsterDef: 'rat', killId: 'k1', createdAt: now + 1, expiresAt: now + 60000 });
    lite.markLootClaimed('loot-b', null);
    lite.claimDaily(c1, 'elite:x', '2026-11-20');
    lite.logLevel(c1, 2, 'breaker', 100.5);
    lite.logLevel(c1, 3, 'breaker', 300);
    lite.insertItem({ id: 'guardado', charId: c2, defId: 'potion_hp_s', qty: 5, enh: 0, loc: 'storage', slot: null, source: 'teste' });
    lite.issueCode(a1, 'verify');
    lite.noteAccountEvent('mail', a1, 'Aurora@Exemplo.com');
    lite.setTermsAccepted(a1, 1, now - 5000);
    lite.audit('login', { accountId: a1, ip: '10.0.0.1' });
    lite.audit('loot', { charId: c1, loot: 'loot-b', gold: 12 });
    let clan;
    lite.tx(() => { clan = lite.createClan('Guarda do Sal', 'SAL', c1); });
    lite.addClanMember(clan, c2, 'officer');
    lite.setClanMotd(clan, 'Reunião na eclusa');
    lite.setBan(a2, 253402300799000, 'teste de importação');
    lite.setMute(a1, now + 3600_000);
    lite.close();

    pg = new PgStore(PG_URL, { schema, dropSchemaOnClose: true });
    const counts = importSqliteToPg(join(dir, 'origem.db'), pg);
    assert.deepEqual(counts, { accounts: 2, characters: 3, clans: 1, clan_members: 2, item_instances: 3, loot_drops: 2, daily_claims: 1, quest_progress: 3, level_log: 2, account_codes: 1, account_events: 1, audit_log: 2 });
    assert.throws(() => importSqliteToPg(join(dir, 'origem.db'), pg), /não está vazia/, 'não importa por cima de dados');

    const src = new Store(join(dir, 'origem.db'));
    try {
      // itens criados no mesmo milissegundo: a ordem do empate difere (rowid × id), então compara ordenado
      const sortItems = (e) => ({ ...e, itens: [...e.itens].sort((x, y) => (x.char_id - y.char_id) || x.def_id.localeCompare(y.def_id)) });
      for (const [what, f] of [
        ['findAccount', (s) => s.findAccount('AURORA')], ['findAccountByEmail', (s) => s.findAccountByEmail('aurora@exemplo.com')],
        ['listCharacters', (s) => s.listCharacters(a1)], ['loadCharacter', (s) => s.loadCharacter(c1)], ['loadCharacter 2', (s) => s.loadCharacter(c2)],
        ['loadQuests', (s) => s.loadQuests(c1)], ['unclaimedLoot', (s) => s.unclaimedLoot(c1, now)], ['getLoot', (s) => s.getLoot('loot-b')],
        ['levelLog', (s) => s.levelLog()], ['auditTail', (s) => s.auditTail(10)], ['listAccountStorage', (s) => s.listAccountStorage(a1)],
        ['countItems', (s) => s.countItems(c1)], ['characterNameTaken', (s) => s.characterNameTaken('zed')], ['exportAccount', (s) => sortItems(s.exportAccount(a1))],
        ['clanOfChar', (s) => s.clanOfChar(c2)], ['clanMembers', (s) => s.clanMembers(s.clanOfChar(c1).id)], ['clanByNameOrTag', (s) => s.clanByNameOrTag('guarda do sal', 'x')],
        ['characterByName', (s) => s.characterByName('YARA')], ['findAccountsByIds', (s) => s.findAccountsByIds([a2, a1])], ['findAccount banida', (s) => s.findAccount('bento')],
        ['accountEventStats', (s) => s.accountEventStats('mail', a1, 'aurora@exemplo.com', 0)],
      ]) assert.deepStrictEqual(f(pg), f(src), `${what}: mesmo resultado nos dois bancos`);
      assert.throws(() => pg.tx(() => pg.createClan('GUARDA DO SAL', 'NOVA', c2)), 'nome importado continua único');
      let novo;
      pg.tx(() => { novo = pg.createClan('Outro Clã', 'OUT', pg.characterByName('bento').id); });
      assert.ok(novo > pg.clanOfChar(c1).id, 'identidade dos clãs continua depois dos ids importados');
      assert.equal(pg.claimDaily(c1, 'elite:x', '2026-11-20'), false, 'recompensa diária já tirada continua tirada');
      assert.ok(pg.createAccount('nova', 'x') > a2, 'identidade continua depois dos ids importados');
      assert.ok(pg.verifyAccount('bento', 'senha'), 'senha importada confere');
    } finally { src.close(); }
  } finally { pg?.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('PostgreSQL: importação arredonda fração guardada numa coluna inteira do SQLite (o BIGINT recusaria)', { skip }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'cinzas-import-'));
  const pg = new PgStore(PG_URL, { schema: schemaOf('fracao'), dropSchemaOnClose: true });
  try {
    const lite = new Store(join(dir, 'origem.db'));
    const acc = lite.createAccount('fracao', 'senha');
    const until = Date.now() + 0.123456789 * 3600_000; // "/gm suspender Nome 0.123456789 ...", antes do arredondamento
    lite.db.prepare('UPDATE accounts SET banned_until = ?, ban_reason = ? WHERE id = ?').run(until, 'teste', acc);
    assert.equal(lite.db.prepare('SELECT typeof(banned_until) AS t FROM accounts').get().t, 'real', 'o SQLite guarda a fração');
    lite.close();
    const log = [];
    assert.equal(importSqliteToPg(join(dir, 'origem.db'), pg, { log: (l) => log.push(l) }).accounts, 1);
    assert.deepEqual([pg.findAccount('FRACAO').banned_until, pg.findAccount('fracao').ban_reason], [Math.round(until), 'teste']);
    assert.ok(log.some((l) => /1 valor/.test(l)), 'a importação conta o que arredondou');
  } finally { pg.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('PostgreSQL: papel de menor privilégio (dono só do próprio esquema, sem CREATE no banco) sobe, migra e reabre', { skip }, () => {
  const role = `cz_papel_${process.pid}`;
  const admin = new PgStore(PG_URL, { migrate: false });
  try {
    // senha para o CI (TCP com scram-sha-256); o servidor temporário do test:pg confia no soquete
    admin.exec(`CREATE ROLE ${role} LOGIN PASSWORD 'senha-do-teste'; CREATE SCHEMA ${role} AUTHORIZATION ${role}`);
    assert.equal(admin.query("SELECT has_database_privilege($1, current_database(), 'CREATE') AS pode", [role])[0].pode, false, 'o papel não cria esquemas no banco');
    const u = new URL(PG_URL);
    u.username = role;
    u.password = 'senha-do-teste';
    u.searchParams.set('schema', role);
    const st = new PgStore(u.toString());
    try {
      assert.deepEqual(st.migrated, MIGRATIONS.map((m) => m.v));
      const acc = st.createAccount('Menor', 'senha');
      assert.equal(st.findAccount('MENOR').id, acc);
    } finally { st.close(); }
    const again = new PgStore(u.toString());
    try { assert.deepEqual(again.migrated, [], 'reabrir não reaplica'); } finally { again.close(); }
  } finally {
    admin.exec(`DROP SCHEMA IF EXISTS ${role} CASCADE; DROP ROLE IF EXISTS ${role}`);
    admin.close();
  }
});

test('PostgreSQL: conexão derrubada parada reconecta sozinha; derrubada no meio da transação desfaz tudo', { skip }, async () => {
  const schema = schemaOf('queda');
  const st = new PgStore(PG_URL, { schema });
  const admin = new PgStore(PG_URL, { schema, migrate: false, dropSchemaOnClose: true });
  try {
    const acc = st.createAccount('queda', 'senha');
    const id = newChar(st, acc, 'Queda');
    // parada (entre um pedido e outro): o seguinte reconecta, sem erro
    const pid1 = pidOf(st);
    assert.equal(admin.query('SELECT pg_terminate_backend($1) AS ok', [pid1])[0].ok, true);
    await sleep(300);
    assert.equal(st.countItems(id), 0);
    const pid2 = pidOf(st);
    assert.notEqual(pid2, pid1, 'conexão nova');
    // no meio da transação: o comando seguinte falha, a transação inteira é desfeita, o banco segue usável
    assert.throws(() => st.tx(() => {
      st.insertItem(bagItem(id, 'antes-da-queda'));
      admin.query('SELECT pg_terminate_backend($1)', [pid2]);
      block(300);
      st.insertItem(bagItem(id, 'depois-da-queda'));
    }), (e) => ['08006', '57P01'].includes(e.code) || /conex|terminat/i.test(e.message));
    assert.equal(st.countItems(id), 0, 'nada da transação ficou');
    st.insertItem(bagItem(id, 'de-novo'));
    assert.equal(st.countItems(id), 1);
  } finally { st.close(); admin.close(); }
});

test('PostgreSQL: prazo esgotado no meio da transação, com o erro engolido dentro de tx(fn), não grava a metade', { skip }, () => {
  const schema = schemaOf('prazo');
  const st = new PgStore(PG_URL, { schema, bridgeTimeoutMs: 300 });
  try {
    const acc = st.createAccount('prazo', 'senha');
    const id = newChar(st, acc, 'Prazo');
    const gen = st.bridge.gen;
    let swallowed = null;
    assert.throws(() => st.tx(() => {
      st.insertItem(bagItem(id, 'antes'));
      try { st.query('SELECT pg_sleep(1.5)'); } catch (e) { swallowed = e; } // como o audit() do servidor engole o erro
      assert.throws(() => st.insertItem(bagItem(id, 'depois')), (e) => e.code === '08006', 'nada roda numa conexão nova');
    }), (e) => e.code === '08006', 'tx() não finge que gravou');
    assert.equal(swallowed?.code, 'CINZAS_PG_TIMEOUT');
    // logo depois: falha na hora (recuo), sem parar a thread principal pelo prazo inteiro
    const t0 = performance.now();
    assert.throws(() => st.countItems(id), (e) => e.code === '08001');
    assert.ok(performance.now() - t0 < 100, 'falhou na hora');
    block(700);
    assert.equal(st.countItems(id), 0, 'worker e conexão novos; nada da transação ficou');
    assert.equal(st.bridge.gen, gen + 1);
    st.insertItem(bagItem(id, 'normal'));
    assert.equal(st.countItems(id), 1);
  } finally {
    st.close();
    block(1500); // a conexão antiga só desiste depois do pg_sleep; aí o esquema pode ser apagado
    new PgStore(PG_URL, { schema, migrate: false, dropSchemaOnClose: true }).close();
  }
});

test('PostgreSQL: comando que falha dentro da transação (erro engolido) desfaz a transação inteira e o COMMIT avisa', { skip }, () => {
  const st = new PgStore(PG_URL, { schema: schemaOf('falha'), dropSchemaOnClose: true });
  try {
    const acc = st.createAccount('falha', 'senha');
    const id = newChar(st, acc, 'Falha');
    assert.throws(() => st.tx(() => {
      st.insertItem(bagItem(id, 'x1'));
      assert.throws(() => st.insertItem(bagItem(id, 'x1')), (e) => e.code === '23505');
      assert.throws(() => st.insertItem(bagItem(id, 'x2')), (e) => e.code === '25P02');
    }), (e) => e.code === '25P02');
    assert.equal(st.countItems(id), 0, 'no PostgreSQL a transação inteira volta (no SQLite, só o comando que falhou)');
    // a auditoria dentro da transação é a exceção: falha dela não desfaz o resto (SAVEPOINT)
    st.tx(() => {
      st.insertItem(bagItem(id, 'com-auditoria'));
      assert.throws(() => st.audit('x'.repeat(10), { charId: 'não é número' }));
      st.insertItem(bagItem(id, 'depois-da-auditoria'));
    });
    assert.equal(st.countItems(id), 2);
  } finally { st.close(); }
});

test('PostgreSQL: banco recusando conexões — os pedidos falham na hora (recuo) e voltam sozinhos', { skip }, async () => {
  const db = `cz_queda_${process.pid}`;
  const admin = new PgStore(PG_URL, { schema: schemaOf('adm'), dropSchemaOnClose: true });
  admin.query(`CREATE DATABASE ${db}`);
  const u = new URL(PG_URL);
  u.pathname = `/${db}`;
  const st = new PgStore(u.toString(), { connectTimeoutMs: 3000, reconnectTimeoutMs: 1000 });
  try {
    const acc = st.createAccount('fora', 'senha');
    admin.query(`ALTER DATABASE ${db} ALLOW_CONNECTIONS false`);
    admin.query('SELECT pg_terminate_backend($1)', [pidOf(st)]);
    await sleep(300);
    assert.throws(() => st.findAccountById(acc), (e) => e.code === '55000', 'primeira tentativa de reconectar: o erro do banco');
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) assert.throws(() => st.findAccountById(acc), (e) => e.code === '08001');
    assert.ok(performance.now() - t0 < 200, `20 pedidos durante o recuo falham na hora (${(performance.now() - t0).toFixed(0)} ms)`);
    // dentro de tx(fn), um primeiro comando que falha por isso (erro engolido) derruba a transação inteira
    assert.throws(() => st.tx(() => {
      assert.throws(() => st.setRole(acc, 'gm'), (e) => e.code === '08001');
      assert.throws(() => st.setRole(acc, 'admin'), (e) => e.code === '08006');
    }), (e) => e.code === '08006');
    admin.query(`ALTER DATABASE ${db} ALLOW_CONNECTIONS true`);
    await sleep(1200);
    assert.equal(st.findAccountById(acc).name, 'fora', 'voltou sozinho depois do recuo');
    assert.equal(st.findAccountById(acc).role, 'player', 'nada da transação que falhou');
  } finally {
    st.close();
    try { admin.query(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`); } finally { admin.close(); }
  }
});

test('PostgreSQL: migração espera o outro processo migrando, mesmo além do lock_timeout', { skip }, async () => {
  const schema = schemaOf('espera');
  const code = `import { PgStore, lockKey } from ${JSON.stringify(new URL('../src/store-pg.js', import.meta.url).href)};
    import { writeSync } from 'node:fs';
    const s = new PgStore(process.env.PG_URL, { schema: process.env.PG_SCHEMA, migrate: false });
    s.exec('CREATE SCHEMA IF NOT EXISTS ' + process.env.PG_SCHEMA);
    s.tx(() => { s.lockMigrations(lockKey(process.env.PG_SCHEMA)); writeSync(1, 'travado\\n'); s.query('SELECT pg_sleep(1.2)'); });
    s.close();`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', code], { env: { ...process.env, PG_URL, PG_SCHEMA: schema } });
  let err = '';
  child.stderr.on('data', (d) => { err += d; });
  const exited = new Promise((r) => child.on('exit', r));
  await new Promise((resolve, reject) => {
    child.stdout.on('data', (d) => { if (String(d).includes('travado')) resolve(); });
    child.on('exit', (c) => reject(new Error(`o processo que segura a trava saiu antes (${c}): ${err}`)));
  });
  const t0 = performance.now();
  const st = new PgStore(PG_URL, { schema, lockTimeoutMs: 200, bridgeTimeoutMs: 500, dropSchemaOnClose: true });
  try {
    assert.ok(performance.now() - t0 > 600, 'esperou o outro processo');
    assert.deepEqual(st.migrated, MIGRATIONS.map((m) => m.v));
  } finally { st.close(); }
  assert.equal(await exited, 0, err);
});

test('PostgreSQL: close() encerra o worker; depois dele o banco recusa pedidos', { skip }, async () => {
  const st = new PgStore(PG_URL, { schema: schemaOf('fecha'), dropSchemaOnClose: true });
  const worker = st.bridge.worker;
  const exited = new Promise((r) => worker.once('exit', r));
  st.close();
  st.close(); // de novo: nada
  await Promise.race([exited, sleep(5000).then(() => { throw new Error('o worker não terminou'); })]);
  assert.throws(() => st.findAccount('x'), /fechado/);
});
