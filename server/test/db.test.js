// Contrato do banco que vale para os dois backends — SQLite em `npm test`, PostgreSQL em `npm run test:pg`
// (createStore escolhe): salvamento em lote, nomes e e-mail sem diferença de maiúsculas, transações,
// códigos de conta, ordem e formato das linhas, clãs, comércio e moderação, e as migrações escritas
// para os dois bancos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { createStore, isPostgresUrl, testSchemaFor } from '../src/db.js';
import { Store, MIGRATIONS } from '../src/store.js';
import { PgStore, PG_MIGRATIONS, parsePgUrl, questionToDollar } from '../src/store-pg.js';

const PG = !!process.env.CINZAS_TEST_PG;
const KIT = { equip: [], bag: [] };
const newChar = (st, acc, name, extra = {}) => st.createCharacter({
  accountId: acc, name, classId: 'breaker', hp: 100, mp: 20, mapId: 'estrada_velha', x: 30, z: 50, kit: KIT, slotFor: () => null, ...extra,
});
const item = (charId, id, qty = 1) => ({ id, charId, defId: 'potion_hp_s', qty, enh: 0, loc: 'bag', slot: null, source: 'teste' });

test('createStore: postgres:// vai para o PostgreSQL; arquivo e :memory: para o SQLite (ou esquema de teste)', () => {
  assert.ok(isPostgresUrl('postgres://u@h/db') && isPostgresUrl('postgresql://u@h/db') && isPostgresUrl('POSTGRES://u@h/db'));
  assert.ok(!isPostgresUrl('cinzas.db') && !isPostgresUrl(':memory:') && !isPostgresUrl(null));
  const st = createStore(':memory:');
  try {
    assert.ok(PG ? st instanceof PgStore : st instanceof Store);
    assert.equal(st.kind, PG ? 'postgres' : 'sqlite');
    assert.match(st.describe(), PG ? /^PostgreSQL / : /^SQLite :memory:$/);
  } finally { st.close(); }
  // modo de teste: o mesmo caminho dá o mesmo esquema; :memory: sempre um novo (apagado no close)
  assert.equal(testSchemaFor('/tmp/x/a.db').schema, testSchemaFor('/tmp/x/a.db').schema);
  assert.notEqual(testSchemaFor('/tmp/x/a.db').schema, testSchemaFor('/tmp/x/b.db').schema);
  assert.notEqual(testSchemaFor(':memory:').schema, testSchemaFor(':memory:').schema);
  assert.equal(testSchemaFor(':memory:').dropSchemaOnClose, true);
  // URL: ?schema= é nosso (sai da string de conexão); a senha não aparece na descrição
  const p = parsePgUrl('postgres://jogo:s3nh%40@db.exemplo:6543/cinzas?schema=zona1&sslmode=verify-full');
  assert.equal(p.schema, 'zona1');
  assert.ok(!p.connectionString.includes('schema=') && p.connectionString.includes('sslmode=verify-full'));
  assert.equal(p.label, 'jogo@db.exemplo:6543/cinzas');
  assert.equal(questionToDollar("SELECT * FROM t WHERE a = ? AND b = '?''x' AND c = ?"), "SELECT * FROM t WHERE a = $1 AND b = '?''x' AND c = $2");
});

test('senha do PostgreSQL num arquivo (CINZAS_DB_PASSWORD_FILE): entra na conexão, nunca no rótulo', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cinzas-senha-'));
  try {
    const file = join(dir, 'senha_banco.txt');
    writeFileSync(file, 's3nh@:/x\n'); // com a quebra de linha do "echo > arquivo"
    const p = parsePgUrl('postgres://cinzas@banco:5432/cinzas', { passwordFile: file });
    assert.equal(decodeURIComponent(new URL(p.connectionString).password), 's3nh@:/x');
    assert.equal(p.label, 'cinzas@banco:5432/cinzas');
    // senha na própria URL vence o arquivo; sem arquivo, nada muda
    assert.equal(new URL(parsePgUrl('postgres://u:na-url@h/db', { passwordFile: file }).connectionString).password, 'na-url');
    assert.equal(new URL(parsePgUrl('postgres://u@h/db', { passwordFile: null }).connectionString).password, '');
    // qualquer caractere chega intacto ao 'pg' (que decodifica a senha da URL: "%41" viraria "A")
    for (const pw of ['ab%41cd', '50%off', '%', 'é ç#?&=+/@:']) {
      writeFileSync(file, `${pw}\n`);
      const cs = parsePgUrl('postgres://cinzas@banco:5432/cinzas', { passwordFile: file }).connectionString;
      assert.equal(new pg.Client({ connectionString: cs }).password, pw, `senha ${JSON.stringify(pw)} como o 'pg' lê`);
    }
    writeFileSync(file, '\n');
    assert.throws(() => parsePgUrl('postgres://u@h/db', { passwordFile: file }), /vazio/);
    assert.throws(() => parsePgUrl('postgres://u@h/db', { passwordFile: join(dir, 'nao-existe') }), /CINZAS_DB_PASSWORD_FILE/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('migrações escritas para os dois bancos: mesmas versões e mesmos nomes', () => {
  assert.deepEqual(PG_MIGRATIONS.map((m) => [m.v, m.name]), MIGRATIONS.map((m) => [m.v, m.name]));
});

test('saveCharacters grava todos os personagens num lote (repetido: vale o último)', () => {
  const st = createStore(':memory:');
  try {
    const acc = st.createAccount('lote', 'senha');
    const chars = [1, 2, 3].map((i) => st.loadCharacter(newChar(st, acc, `Lote${i}`)));
    chars.forEach((c, i) => {
      Object.assign(c, { level: 5 + i, xp: 1000 * (i + 1), gold: 7 * i, x: 10.125 + i, z: 3.5, hp: 88.6, mp: 12.2, dead: i === 2, playedS: 61.25 * i,
        title: i ? `Título ${i}` : null, choices: { c4_reasons: 'a' }, alloc: { str: i }, skills: { s: 1 }, unspent: 2, skillPoints: 1, trialDone: i === 1 });
    });
    Object.assign(chars[1], { saveMapId: 'canais_eclusa', saveX: 100, saveZ: 184 }); // dentro do calabouço: grava o ponto de retorno
    st.saveCharacters([chars[0], chars[1], chars[2], { ...chars[0], gold: 999 }]);
    st.saveCharacters([]);
    const back = chars.map((c) => st.loadCharacter(c.id));
    assert.equal(back[0].gold, 999, 'repetido: vale o último');
    for (const [i, b] of back.entries()) {
      assert.equal(b.level, 5 + i); assert.equal(b.xp, 1000 * (i + 1)); assert.equal(b.hp, 89); assert.equal(b.mp, 12);
      assert.equal(b.dead, i === 2); assert.equal(b.playedS, 61.25 * i); assert.equal(b.trialDone, i === 1);
      assert.deepEqual(b.alloc, { str: i }); assert.deepEqual(b.skills, { s: 1 }); assert.deepEqual(b.choices, { c4_reasons: 'a' });
      assert.equal(b.title, i ? `Título ${i}` : null); assert.equal(b.unspent, 2); assert.equal(b.skillPoints, 1);
    }
    assert.deepEqual([back[0].mapId, back[0].x, back[0].z], ['estrada_velha', 10.125, 3.5]);
    assert.deepEqual([back[1].mapId, back[1].x, back[1].z], ['canais_eclusa', 100, 184]);
    assert.deepEqual([back[2].x, back[2].z], [12.125, 3.5]);
  } finally { st.close(); }
});

test('nomes de conta e de personagem e e-mail não diferenciam maiúsculas', () => {
  const st = createStore(':memory:');
  try {
    const acc = st.createAccount('Aurora', 'senha', { email: 'Aurora@Exemplo.com', verified: false });
    assert.throws(() => st.createAccount('AURORA', 'x'), 'conta repetida');
    assert.throws(() => st.createAccount('outra', 'x', { email: 'aurora@EXEMPLO.com' }), 'e-mail repetido');
    assert.equal(st.findAccount('aurora').id, acc);
    assert.equal(st.findAccountByEmail('AURORA@exemplo.COM').id, acc);
    assert.equal(st.verifyAccount('aUrOrA', 'senha').id, acc);
    assert.equal(st.verifyAccount('aurora', 'errada'), null);
    assert.equal(st.findAccount('aurora').verified, 0);
    newChar(st, acc, 'Zed');
    assert.equal(st.characterNameTaken('zED'), true);
    assert.throws(() => newChar(st, acc, 'ZED'), 'personagem repetido');
    assert.deepEqual(st.listCharacters(acc).map((c) => c.name), ['Zed'], 'o personagem recusado não deixou nada (transação)');
  } finally { st.close(); }
});

test('transação: erro desfaz tudo, tx dentro de tx é recusada, leitura dentro da transação vê o que ela gravou', () => {
  const st = createStore(':memory:');
  try {
    const acc = st.createAccount('tx', 'senha');
    const id = newChar(st, acc, 'Transa', { kit: { equip: [], bag: [['potion_hp_s', 2]] } });
    const before = st.countItems(id);
    assert.equal(before, 1);
    assert.throws(() => st.tx(() => { st.insertItem(item(id, 'novo-1')); throw new Error('falhou no meio'); }), /falhou no meio/);
    assert.equal(st.countItems(id), before, 'o item da transação desfeita não ficou');
    assert.throws(() => st.tx(() => st.tx(() => 1)));
    assert.equal(st.tx(() => 42), 42);
    const seen = st.tx(() => {
      st.insertItem(item(id, 'novo-2', 3));
      st.audit('teste_tx', { charId: id, n: 1 });
      return st.countItems(id);
    });
    assert.equal(seen, before + 1);
    assert.equal(st.countItems(id), before + 1);
    assert.equal(st.auditTail(1)[0].kind, 'teste_tx');
    assert.deepEqual(JSON.parse(st.auditTail(1, 'teste_tx')[0].data_json), { n: 1 });
    // e o banco segue usável fora de transação depois de uma desfeita
    const c = st.loadCharacter(id);
    c.gold = 5;
    st.saveCharacter(c);
    assert.equal(st.loadCharacter(id).gold, 5);
  } finally { st.close(); }
});

test('códigos de conta (uso único, 5 erros invalidam, o novo anula o anterior) e recompensa diária idempotente', () => {
  const st = createStore(':memory:');
  try {
    const acc = st.createAccount('cod', 'senha');
    const wrongFor = (c) => (c === '000000' ? '111111' : '000000');
    let code = st.issueCode(acc, 'verify');
    for (let i = 0; i < 4; i++) assert.equal(st.consumeCode(acc, 'verify', wrongFor(code)), false);
    assert.equal(st.consumeCode(acc, 'verify', code), true, 'quatro erros ainda deixam usar');
    assert.equal(st.consumeCode(acc, 'verify', code), false, 'uso único');
    code = st.issueCode(acc, 'reset');
    for (let i = 0; i < 5; i++) st.consumeCode(acc, 'reset', wrongFor(code));
    assert.equal(st.consumeCode(acc, 'reset', code), false, 'cinco erros invalidam');
    const c2 = st.issueCode(acc, 'reset');
    const c3 = st.issueCode(acc, 'reset');
    assert.equal(st.consumeCode(acc, 'reset', c2), c2 === c3, 'o código novo anula o anterior');
    assert.equal(st.consumeCode(acc, 'reset', c3), true);
    const id = newChar(st, acc, 'Diario');
    assert.equal(st.claimDaily(id, 'elite:x', '2026-11-20'), true);
    assert.equal(st.claimDaily(id, 'elite:x', '2026-11-20'), false);
    assert.equal(st.claimDaily(id, 'elite:x', '2026-11-21'), true);
    const purged = st.purgeOld(90);
    assert.equal(typeof purged.audit, 'number'); assert.equal(typeof purged.codes, 'number');
  } finally { st.close(); }
});

test('formato e ordem das linhas iguais nos dois bancos', () => {
  const st = createStore(':memory:');
  try {
    const acc = st.createAccount('ordem', 'senha');
    const row = st.findAccount('ordem');
    assert.equal(Object.getPrototypeOf(row), null, 'linhas sem protótipo, como no node:sqlite');
    assert.deepEqual(Object.keys(row), ['id', 'name', 'pass_hash', 'salt', 'created_at', 'email', 'verified', 'role', 'deleted_at', 'banned_until', 'ban_reason', 'muted_until']);
    assert.equal(typeof row.id, 'number'); assert.equal(typeof row.created_at, 'number'); assert.equal(row.role, 'player'); assert.equal(row.email, null);
    const id = newChar(st, acc, 'Ordem');
    assert.equal(typeof id, 'number');
    // missões: ordem binária de quest_id (no SQLite vem do índice da chave primária)
    for (const q of ['zeta', 'Alpha', 'beta', 'c1_x', 'B2']) st.saveQuest(id, q, 'active', { 0: 1 });
    st.saveQuest(id, 'beta', 'done', {});
    assert.deepEqual(st.loadQuests(id).map((r) => [r.quest_id, r.state]), [['Alpha', 'active'], ['B2', 'active'], ['beta', 'done'], ['c1_x', 'active'], ['zeta', 'active']]);
    // saque: por criação; vencido e reivindicado ficam de fora
    const now = Date.now();
    for (const [i, lid] of ['l3', 'l1', 'l2', 'velho'].entries()) {
      st.insertLoot({ id: lid, charId: id, defId: i ? 'potion_hp_s' : null, qty: 1, gold: i ? 0 : 5, mapId: 'estrada_velha', x: 1.25, z: 2, monsterDef: 'rat', killId: 'k', createdAt: now + i, expiresAt: lid === 'velho' ? now - 1 : now + 60000 });
    }
    st.markLootClaimed('l1', 'inst-1');
    st.markLootClaimed('l1', 'inst-2'); // segunda vez não muda nada
    assert.deepEqual(st.unclaimedLoot(id, now).map((l) => l.id), ['l3', 'l2']);
    assert.equal(st.getLoot('l1').claimed_instance_id, 'inst-1');
    assert.equal(st.getLoot('l3').x, 1.25);
    // depósito da conta: por criação; só um personagem tira a peça
    const other = newChar(st, acc, 'Outro');
    // (criados no mesmo milissegundo, o empate sai pelo id: d1 antes de d2 nos dois casos)
    for (const iid of ['d1', 'd2']) { st.insertItem(item(id, iid)); st.saveItems(id, [{ id: iid, qty: 1, enh: 0, loc: 'storage', slot: null }]); }
    assert.deepEqual(st.listAccountStorage(acc).map((r) => [r.id, r.owner]), [['d1', 'Ordem'], ['d2', 'Ordem']]);
    assert.equal(st.takeFromStorage(acc, 'd2', other).id, 'd2');
    assert.equal(st.takeFromStorage(acc, 'd2', id), null, 'a mesma peça não sai duas vezes');
    assert.equal(st.loadCharacter(other).items.get('d2').loc, 'bag');
    // telemetria: subida de nível repetida é ignorada
    st.logLevel(id, 2, 'breaker', 10.5); st.logLevel(id, 2, 'breaker', 99); st.logLevel(id, 3, 'breaker', 20);
    assert.deepEqual(st.levelLog().map((r) => [r.char_id, r.level, r.played_s]), [[id, 2, 10.5], [id, 3, 20]]);
  } finally { st.close(); }
});

test('clãs: nome e sigla sem diferença de maiúsculas (só no ASCII, como o NOCASE), membros em ordem, dissolução', () => {
  const st = createStore(':memory:');
  try {
    const acc = st.createAccount('cla', 'senha');
    const [lider, abel, bruno, carla] = ['Zed', 'abel', 'Bruno', 'Carla'].map((n) => newChar(st, acc, n));
    let id;
    st.tx(() => { id = st.createClan('Guarda do Sal', 'SAL', lider); });
    assert.equal(typeof id, 'number');
    const cl = st.clanById(id);
    assert.equal(Object.getPrototypeOf(cl), null);
    assert.deepEqual(Object.keys(cl), ['id', 'name', 'tag', 'leader_char_id', 'motd', 'created_at']);
    assert.deepEqual([cl.name, cl.tag, cl.leader_char_id, cl.motd], ['Guarda do Sal', 'SAL', lider, '']);
    assert.equal(st.clanByNameOrTag('GUARDA DO SAL', 'XYZ')?.id, id, 'nome sem diferença de maiúsculas');
    assert.equal(st.clanByNameOrTag('Outro', 'sal')?.id, id, 'sigla sem diferença de maiúsculas');
    assert.equal(st.clanByNameOrTag('Outro', 'OUT'), undefined);
    assert.throws(() => st.tx(() => st.createClan('guarda do sal', 'GDS', abel)), 'nome repetido');
    assert.throws(() => st.tx(() => st.createClan('Outro Nome', 'sal', abel)), 'sigla repetida');
    assert.equal(st.clanOfChar(abel), undefined, 'a criação recusada não deixou o fundador no clã');
    // fora do ASCII as maiúsculas contam, nos dois bancos (é o NOCASE do SQLite)
    const elan = newChar(st, acc, 'Élan');
    const elan2 = newChar(st, acc, 'élan');
    assert.notEqual(elan, elan2);
    assert.equal(st.characterNameTaken('ÉLAN'), true, 'L, A e N contam como iguais');
    assert.equal(st.characterByName('éLAN')?.id, elan2);
    assert.deepEqual(Object.keys(st.characterByName('zed')), ['id', 'name', 'account_id']);
    let other;
    st.tx(() => { other = st.createClan('Élan Errante', 'EE', elan); });
    assert.equal(st.clanByNameOrTag('élan errante', 'ZZ'), undefined);
    st.tx(() => st.createClan('élan errante', 'EE2', elan2));
    // membros: cargo em ordem binária, nome sem diferença de maiúsculas (abel antes de Bruno)
    st.addClanMember(id, bruno);
    st.addClanMember(id, abel);
    st.addClanMember(id, carla, 'officer');
    const members = st.clanMembers(id);
    assert.deepEqual(members.map((m) => [m.name, m.rank]), [['Zed', 'leader'], ['abel', 'member'], ['Bruno', 'member'], ['Carla', 'officer']]);
    assert.deepEqual(Object.keys(members[0]), ['char_id', 'rank', 'name', 'level', 'class_id']);
    assert.deepEqual(Object.keys(st.clanOfChar(abel)), ['id', 'name', 'tag', 'motd', 'leader_char_id', 'rank']);
    st.setClanRank(abel, 'officer');
    st.setClanMotd(id, 'Reunião na eclusa');
    st.tx(() => { st.setClanLeader(id, carla); st.setClanRank(carla, 'leader'); st.setClanRank(lider, 'officer'); });
    assert.deepEqual([st.clanById(id).leader_char_id, st.clanById(id).motd], [carla, 'Reunião na eclusa']);
    assert.equal(st.clanOfChar(abel).rank, 'officer');
    st.removeClanMember(bruno);
    assert.equal(st.clanOfChar(bruno), undefined);
    assert.throws(() => st.addClanMember(other, abel), 'um personagem, um clã');
    st.tx(() => st.deleteClan(other));
    assert.equal(st.clanById(other), undefined);
    assert.equal(st.clanOfChar(elan), undefined);
  } finally { st.close(); }
});

test('excluir a conta passa a liderança do clã ao oficial mais antigo de fora dela; sem ninguém, o clã acaba', () => {
  const st = createStore(':memory:');
  try {
    const dono = st.createAccount('dono', 'senha');
    const outra = st.createAccount('outra', 'senha');
    const lider = newChar(st, dono, 'Lider');
    const alt = newChar(st, dono, 'Alternativo'); // mesma conta: herda primeiro e sai junto, como no SQLite
    const [membro, ofVelho, ofNovo] = ['Membro', 'OficialVelho', 'OficialNovo'].map((n) => newChar(st, outra, n));
    let id;
    st.tx(() => { id = st.createClan('Ordem da Eclusa', 'OE', lider); });
    st.addClanMember(id, membro); // entrou antes dos oficiais, mas oficial vem primeiro
    st.addClanMember(id, alt, 'officer');
    st.addClanMember(id, ofVelho, 'officer');
    st.addClanMember(id, ofNovo, 'officer');
    // entradas em instantes distintos e nesta ordem, mesmo que tudo tenha sido no mesmo milissegundo
    const base = Date.now() - 10_000;
    for (const [i, c] of [membro, alt, ofVelho, ofNovo].entries()) st.db.prepare('UPDATE clan_members SET joined_at = ? WHERE char_id = ?').run(base + i, c);
    const solo = st.createAccount('solitario', 'senha');
    const s1 = newChar(st, solo, 'Solitario');
    let soloClan;
    st.tx(() => { soloClan = st.createClan('Sozinho', 'SOZ', s1); });

    assert.equal(st.deleteAccount(dono), 2);
    assert.equal(st.clanById(id).leader_char_id, ofVelho, 'o oficial mais antigo que não é da conta excluída');
    assert.equal(st.clanOfChar(ofVelho).rank, 'leader');
    assert.equal(st.clanOfChar(lider), undefined);
    assert.equal(st.clanOfChar(alt), undefined);
    assert.deepEqual(st.clanMembers(id).map((m) => [m.name, m.rank]), [['OficialVelho', 'leader'], ['Membro', 'member'], ['OficialNovo', 'officer']]);
    assert.equal(st.deleteAccount(solo), 1);
    assert.equal(st.clanById(soloClan), undefined, 'clã sem ninguém acaba');
    assert.equal(st.clanByNameOrTag('Sozinho', 'SOZ'), undefined);
  } finally { st.close(); }
});

test('comércio: transferItem só move item da bolsa do dono certo; moderação: suspensão e silêncio na conta', () => {
  const st = createStore(':memory:');
  try {
    const acc = st.createAccount('troca', 'senha');
    const a = newChar(st, acc, 'Vendedor');
    const b = newChar(st, acc, 'Comprador');
    st.insertItem(item(a, 'machado'));
    st.insertItem({ ...item(a, 'anel'), loc: 'equip', slot: 'ring1' });
    assert.equal(st.tx(() => st.transferItem('machado', a, b)), true);
    assert.equal(st.transferItem('machado', a, b), false, 'não é mais do vendedor');
    assert.equal(st.transferItem('anel', a, b), false, 'equipado não sai');
    assert.equal(st.transferItem('nada', a, b), false);
    const got = st.loadCharacter(b).items.get('machado');
    assert.deepEqual([got.loc, got.slot], ['bag', null]);
    // falha no meio da troca desfaz tudo
    st.insertItem(item(a, 'escudo'));
    assert.throws(() => st.tx(() => { st.transferItem('escudo', a, b); if (!st.transferItem('sumiu', a, b)) throw new Error('item sumiu'); }), /item sumiu/);
    assert.ok(st.loadCharacter(a).items.has('escudo'), 'a transação desfeita devolveu o item');
    // suspensão (com data ou "sem data") e silêncio
    const until = Date.now() + 3600_000;
    st.setBan(acc, until, 'teste');
    st.setMute(acc, until + 1);
    let row = st.findAccount('troca');
    assert.deepEqual([row.banned_until, row.ban_reason, row.muted_until], [until, 'teste', until + 1]);
    st.setBan(acc, 253402300799000, 'permanente');
    assert.equal(st.findAccountById(acc).banned_until, 253402300799000);
    st.setBan(acc, null, null);
    st.setMute(acc, null);
    row = st.findAccount('troca');
    assert.deepEqual([row.banned_until, row.ban_reason, row.muted_until], [null, null, null]);
    // várias contas de uma vez (conferência da moderação): sem as excluídas, sem repetir, em ordem de id
    const outra = st.createAccount('outra', 'senha');
    const fora = st.createAccount('fora', 'senha');
    st.deleteAccount(fora);
    assert.deepEqual(st.findAccountsByIds([outra, acc, acc, fora, 999999]).map((r) => r.name), ['troca', 'outra']);
    assert.deepEqual(st.findAccountsByIds([]), []);
  } finally { st.close(); }
});
