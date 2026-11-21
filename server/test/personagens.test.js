// Personagens e administração (auditoria antes do teste público): excluir um personagem pela tela de
// personagens (mesma limpeza da exclusão de conta, depósito da conta mantido), senha conferida fora da
// thread do jogo com limite de tentativas (o tick segue andando), nomes reservados da equipe para
// personagem e clã, e os comandos de administração (renomear personagem e clã, retirar itens e ouro).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GameServer } from '../src/server.js';
import { hashPassword } from '../src/store.js';
import { hasStaffWord, foldName, isReservedCharName, isReservedClanName, isReservedClanTag } from '../src/names.js';
import { SimClient, sleep } from './helpers/client.js';

const log = (...a) => console.log('   ·', ...a);

async function boot(opts = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'cinzas-pers-'));
  const server = new GameServer({ port: 0, host: '127.0.0.1', dbPath: join(dir, 'p.db'), seed: 9, log: false, ...opts });
  const port = await server.start();
  return { server, url: `ws://127.0.0.1:${port}`, done: async () => { await server.stop().catch(() => {}); rmSync(dir, { recursive: true, force: true }); } };
}

async function waitUntil(pred, what, ms = 5000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (pred()) return; await sleep(20); }
  throw new Error(`tempo esgotado: ${what}`);
}

// conta logada na tela de personagens (cria a conta se ainda não existe); role: papel dado antes do login
async function account(server, url, acc, role = null) {
  const c = new SimClient(acc);
  await c.connect(url);
  await c.request('register', { account: acc, password: 'senha123' });
  if (role) server.store.setRole(server.store.findAccount(acc).id, role);
  const l = await c.request('login', { account: acc, password: 'senha123' });
  assert.equal(l.ok, true, l.reason);
  c.login = l;
  return c;
}

async function makeChar(c, name, classId = 'breaker') {
  const r = await c.request('create_char', { name, classId });
  assert.equal(r.ok, true, `${name}: ${r.reason}`);
  return r.char.id;
}

async function enter(c, charId) {
  const e = await c.request('enter', { charId });
  assert.equal(e.ok, true, e.reason);
  c.snap = e.snapshot;
  return e;
}

// conta + personagem no mundo
async function player(server, url, acc, name, role = null) {
  const c = await account(server, url, acc, role);
  const id = c.login.chars.find((x) => x.name === name)?.id ?? await makeChar(c, name);
  await enter(c, id);
  return { c, id };
}

// nomes de gente que começam ou terminam com gm, adm, mod ou dev: precisam valer (D145)
const COMMON_NAMES = ['Modesto', 'Devanir', 'Admir', 'Admilson', 'Modena', 'Devon', 'Gmelina', 'GMelina', 'MODESTO', 'Admar', 'Devair',
  'Modestina', 'Ademar', 'Ademod', 'Desmod', 'Modelo', 'Lia-Moda', 'Ana_Devota', 'Bjørn', 'Joana', 'Gema', 'Tomas', 'Aurora', 'Lia_2004', 'Remo'];
// imitações: a palavra curta inteira ou separada por _, -, algarismo ou troca de maiúscula; as longas também no começo
// ou no fim; algarismos lidos como letras
const IMITATIONS = ['GM', 'gm', 'G_M', 'GM_Fulano', 'gm_joao', 'Joao-GM', 'Fulano-Mod', 'Dev1', 'Gm2', 'Adm_Lia', 'Ana_GM_Lia', 'GMJoao',
  'JoaoGM', 'AdmLia', 'DevMaria', 'maria-dev', 'Ana-Mods', 'M0d', 'D3V', 'M0d_Ana', 'Ana_d3v', 'mod-ana', 'Admin', 'Adm1n', 'ADMINISTRADOR',
  'Équipe', 'EquipeAzul', 'Moderação', 'Moderador_X', 'Suporte', 'sup_orte', 'Sistema', 'Staff_1', 'St4ff', 'Mestre', 'Grão_Mestre',
  'excluido_3', 'Excluída_9'];

test('nomes reservados: palavras da equipe sem diferença de maiúsculas e acentos, ignorando _ e -; nomes de gente valem', async () => {
  // regra pura (names.js)
  for (const n of IMITATIONS) assert.equal(isReservedCharName(n), true, `${n} é reservado`);
  for (const n of COMMON_NAMES) assert.equal(isReservedCharName(n), false, `${n} vale`);
  assert.equal(foldName('Grão_Mestre-7'), 'graomestret');
  assert.equal(hasStaffWord('Clã do Mestre'), true);
  assert.equal(isReservedClanName('Equipe Azul'), true);
  assert.equal(isReservedClanName("Guarda d'Equipe"), true);
  assert.equal(isReservedClanName('Clã do GM'), true, 'palavra curta separada por espaço');
  assert.equal(isReservedClanName('Os GMs'), true, 'no plural');
  for (const n of ['Guarda do Sal', 'Moda Livre', 'Devotos do Vau']) assert.equal(isReservedClanName(n), false, `clã ${n} vale`);
  for (const t of ['GM', 'ADM', 'MOD', 'DEV', 'STAF', 'EQP', 'gm', 'GMX', 'XGM', 'M0D']) assert.equal(isReservedClanTag(t), true, `sigla ${t}`);
  for (const t of ['SAL', 'VAU', 'OE', 'EQ']) assert.equal(isReservedClanTag(t), false, `sigla ${t} vale`);

  // no servidor: criação de personagem e de clã
  const { server, url, done } = await boot({ dev: true });
  try {
    const c = await account(server, url, 'p_nomes');
    for (const n of ['GM_Joao', 'Dev1', 'Fulano-Mod', 'Adm_Lia', 'Admin', 'Équipe', 'moderação', 'joao-gm', 'Sup_Orte', 'Mestre', 'excluido_1']) {
      const r = await c.request('create_char', { name: n, classId: 'breaker' });
      assert.equal(r.code, 'bad_name', `${n}: ${r.reason}`);
    }
    // nomes de gente com gm, adm, mod ou dev no começo ou no fim são aceitos (4 por conta)
    for (const n of ['Modesto', 'Devanir', 'Admilson', 'Gmelina']) await makeChar(c, n);
    const c2 = await account(server, url, 'p_nomes2');
    const id = await makeChar(c2, 'Fundadora');
    await enter(c2, id);
    await c2.request('gm', { cmd: 'xp', level: 10 });
    await c2.request('gm', { cmd: 'gold', amount: 600 });
    assert.equal((await c2.request('clan_create', { name: 'Equipe Azul', tag: 'AZL' })).code, 'bad_name');
    assert.equal((await c2.request('clan_create', { name: 'Clã do Mestre', tag: 'CDM' })).code, 'bad_name');
    assert.equal((await c2.request('clan_create', { name: 'Clã do GM', tag: 'CGM' })).code, 'bad_name');
    for (const tag of ['GM', 'adm', 'MOD', 'DEV', 'STAF', 'EQP']) assert.equal((await c2.request('clan_create', { name: 'Guarda do Sal', tag })).code, 'bad_tag', `sigla ${tag}`);
    const ok = await c2.request('clan_create', { name: 'Guarda do Sal', tag: 'SAL' });
    assert.equal(ok.ok, true, ok.reason);
    log('personagem e clã com palavras da equipe recusados; Modesto, Devanir, Admilson e Gmelina aceitos; Guarda do Sal [SAL] criado');
    c.ws.close(); c2.ws.close();
    await sleep(50);
  } finally { await done(); }
});

test('excluir personagem: senha, limpeza igual à da conta (clã, grupo, ignorados, itens, nome) e depósito mantido', async () => {
  const { server, url, done } = await boot({ dev: true });
  const st = server.store;
  try {
    const d1 = await account(server, url, 'p_dono');
    const liderId = await makeChar(d1, 'Lider');
    await makeChar(d1, 'Alterno', 'warden');
    await enter(d1, liderId);
    await d1.request('gm', { cmd: 'xp', level: 10 });
    await d1.request('gm', { cmd: 'gold', amount: 600 });
    assert.equal((await d1.request('clan_create', { name: 'Ordem do Teste', tag: 'ODT' })).ok, true);
    const { c: o, id: ofId } = await player(server, url, 'p_oficiala', 'Oficiala');
    const { c: m, id: memId } = await player(server, url, 'p_membrana', 'Membrana');
    for (const [cl, nm] of [[o, 'Oficiala'], [m, 'Membrana']]) {
      const inv = cl.waitFor((x) => x.t === 'clan_invite', 3000, 'convite de clã');
      assert.equal((await d1.request('clan_invite', { name: nm })).ok, true);
      assert.equal((await cl.request('clan_accept', { clanId: (await inv).clan.id })).ok, true);
    }
    assert.equal((await d1.request('clan_rank', { charId: ofId, rank: 'officer' })).ok, true);
    // a Membrana ignora o Lider e o chama para um grupo
    assert.equal((await m.request('ignore_add', { name: 'lider' })).ok, true);
    const pinv = d1.waitFor((x) => x.t === 'party_invite', 3000, 'convite de grupo');
    assert.equal((await m.request('party_invite', { name: 'Lider' })).ok, true);
    assert.equal((await d1.request('party_accept', { from: (await pinv).fromId })).ok, true);
    // peça guardada pelo Lider no depósito da conta: é da conta e fica
    st.insertItem({ id: 'guardada-1', charId: liderId, defId: 'potion_hp_s', qty: 3, enh: 0, loc: 'storage', slot: null, source: 'teste' });

    // no mundo, recusado
    assert.equal((await d1.request('delete_char', { charId: liderId, password: 'senha123' })).code, 'in_world');
    // de volta à tela de personagens (conexão nova)
    d1.ws.close();
    await waitUntil(() => !server.byChar.has(liderId), 'o Lider sair do mundo');
    const d2 = await account(server, url, 'p_dono');
    assert.equal((await d2.request('delete_char', { charId: ofId, password: 'senha123' })).code, 'bad_char', 'personagem de outra conta');
    assert.equal((await d2.request('delete_char', { charId: 'x', password: 'senha123' })).code, 'bad_char');
    assert.equal((await d2.request('delete_char', { charId: liderId, password: 'errada' })).code, 'bad_password');
    assert.equal((await d2.request('delete_char', { charId: liderId })).code, 'bad_password');

    const left = o.waitFor((x) => x.t === 'clan_event' && /Lider saiu do clã/.test(x.text), 3000, 'aviso de saída');
    const lead = o.waitFor((x) => x.t === 'clan_event' && /Oficiala é o novo líder/.test(x.text), 3000, 'aviso de liderança');
    const partyGone = m.waitFor((x) => x.t === 'party' && x.party === null, 3000, 'grupo desfeito');
    const r = await d2.request('delete_char', { charId: liderId, password: 'senha123' });
    assert.equal(r.ok, true, r.reason);
    assert.equal(r.name, 'Lider');
    assert.deepEqual(r.chars.map((x) => x.name), ['Alterno'], 'a lista volta sem o excluído');
    await left; await lead; await partyGone;

    const clan = st.clanOfChar(ofId);
    assert.equal(clan.rank, 'leader');
    assert.equal(st.clanById(clan.id).leader_char_id, ofId);
    assert.equal(server.playerOf(ofId).char.clanRank, 'leader', 'a memória do novo líder (on-line) foi atualizada');
    assert.deepEqual(st.clanMembers(clan.id).map((x) => x.name).sort(), ['Membrana', 'Oficiala']);
    assert.equal(st.characterNameTaken('Lider'), false, 'nome liberado');
    assert.deepEqual(st.characterItems(liderId).map((i) => [i.id, i.loc]), [['guardada-1', 'storage']], 'bolsa e equipamento apagados; o depósito fica');
    assert.deepEqual(st.listIgnored(memId), [], 'some das listas de ignorados dos outros');
    assert.equal(server.playerOf(memId).char.ignored.has(liderId), false);
    const audit = st.auditTail(20, 'char_deleted')[0];
    assert.equal(audit.char_id, liderId);
    assert.equal(JSON.parse(audit.data_json).name, 'Lider');
    // o excluído não é mais alvo de comando de mestre (renomeá-lo o traria de volta à lista da conta)
    assert.equal((await o.request('gm', { cmd: 'rename', name: `excluido_${liderId}`, newName: 'Voltou' })).code, 'not_found');
    log('Lider excluído: liderança com a Oficiala, grupo desfeito, ignorado retirado, peça do depósito mantida');

    // a conta continua: o nome volta a valer e a peça do depósito aparece para o outro personagem
    const again = await d2.request('create_char', { name: 'Lider', classId: 'breaker' });
    assert.equal(again.ok, true, again.reason);
    const accId = st.findAccount('p_dono').id;
    const view = server.storageView({ char: { accountId: accId } });
    assert.deepEqual(view.items.map((i) => [i.id, i.owner]), [['guardada-1', 'personagem excluído']]);
    for (const c of [d2, o, m]) c.ws.close();
    await sleep(50);
  } finally { await done(); }
});

test('excluir a conta pelo jogo: senha conferida fora do laço, clã avisado e sessão encerrada', async () => {
  const { server, url, done } = await boot({ dev: true });
  try {
    const { c: a, id: soloId } = await player(server, url, 'p_solista', 'Solista');
    await a.request('gm', { cmd: 'xp', level: 10 });
    await a.request('gm', { cmd: 'gold', amount: 600 });
    assert.equal((await a.request('clan_create', { name: 'Coro Unico', tag: 'CRU' })).ok, true);
    const { c: b, id: segId } = await player(server, url, 'p_seguidora', 'Seguidora');
    const inv = b.waitFor((x) => x.t === 'clan_invite', 3000, 'convite');
    await a.request('clan_invite', { name: 'Seguidora' });
    assert.equal((await b.request('clan_accept', { clanId: (await inv).clan.id })).ok, true);
    a.ws.close();
    await waitUntil(() => !server.byChar.has(soloId), 'sair do mundo');
    const a2 = await account(server, url, 'p_solista');
    assert.equal((await a2.request('delete_account', { password: 'errada' })).code, 'bad_password');
    const lead = b.waitFor((x) => x.t === 'clan_event' && /Seguidora é o novo líder/.test(x.text), 3000, 'liderança');
    const r = await a2.request('delete_account', { password: 'senha123' });
    assert.equal(r.ok, true, r.reason);
    await a2.closed;
    await lead;
    assert.equal(server.store.findAccount('p_solista'), undefined);
    assert.equal(server.playerOf(segId).char.clanRank, 'leader');
    b.ws.close();
    await sleep(50);
  } finally { await done(); }
});

test('senha fora do laço do jogo: o tick anda durante tentativas repetidas; 5 erradas por conta a cada 10 min', async () => {
  const { server, url, done } = await boot({ rateLimit: 1000, rateBurst: 1000 });
  try {
    const N = 8, TRIES = 5;
    const clients = [];
    for (let i = 0; i < N; i++) clients.push(await account(server, url, `p_tick${i}`));
    // quanto as mesmas conferências custariam na thread do jogo (scrypt síncrono, como antes)
    const t0 = performance.now();
    for (let i = 0; i < 4; i++) hashPassword('senha-errada', 'sal-do-teste');
    const perHash = (performance.now() - t0) / 4;
    // cada tick anota o instante em que rodou
    const stamps = [];
    const step = server.step.bind(server);
    server.step = (dt) => { stamps.push(performance.now()); return step(dt); };
    await sleep(350);
    const from = performance.now();
    const res = await Promise.all(clients.flatMap((c) => Array.from({ length: TRIES }, (_, k) => c.request('delete_account', { password: `errada-${k}` }))));
    const to = performance.now();
    await sleep(250);
    assert.ok(res.every((r) => r.code === 'bad_password'), JSON.stringify(res.map((r) => r.code)));
    const around = stamps.filter((t) => t >= from - 150 && t <= to + 150);
    let maxGap = 0;
    for (let i = 1; i < around.length; i++) maxGap = Math.max(maxGap, around[i] - around[i - 1]);
    const syncCost = perHash * N * TRIES;
    log(`${N * TRIES} senhas erradas em ${(to - from).toFixed(0)} ms; ${around.length} ticks no período, maior intervalo ${maxGap.toFixed(0)} ms (síncrono pararia o jogo ~${syncCost.toFixed(0)} ms)`);
    assert.ok(around.length >= 3, 'o tick rodou durante as conferências');
    assert.ok(maxGap < Math.max(400, syncCost / 2), `intervalo entre ticks ${maxGap.toFixed(0)} ms`);
    server.step = step;

    // a sexta tentativa da conta é recusada sem calcular, mesmo com a senha certa; vale para excluir personagem
    let r = await clients[0].request('delete_account', { password: 'senha123' });
    assert.equal(r.code, 'too_many');
    assert.match(r.reason, /Tente de novo em \d+ min/);
    const cid = await makeChar(clients[0], 'Travada');
    assert.equal((await clients[0].request('delete_char', { charId: cid, password: 'senha123' })).code, 'too_many');
    assert.ok(server.store.auditTail(100, 'password_fail').length >= N * TRIES, 'cada senha errada fica na auditoria');
    // dez minutos depois, libera
    const accId = server.store.findAccount('p_tick0').id;
    server.pwFails.set(accId, server.pwFails.get(accId).map((t) => t - 10 * 60_000 - 1));
    r = await clients[0].request('delete_char', { charId: cid, password: 'senha123' });
    assert.equal(r.ok, true, r.reason);
    assert.equal(server.pwFails.has(accId), false, 'a senha certa zera a contagem');
    for (const c of clients) c.ws.close();
    await sleep(50);
  } finally { await done(); }
});

test('administração: /gm renomear, renomear_cla, retirar e retirar_ouro só para admin; on-line na memória, fora do ar no banco', async () => {
  const { server, url, done } = await boot(); // sem --dev: valem os papéis
  const st = server.store;
  try {
    const { c: A } = await player(server, url, 'p_chefia', 'Chefia', 'admin');
    const { c: G, id: gId } = await player(server, url, 'p_guarda', 'Sentinela', 'gm');
    const { c: P, id: pId } = await player(server, url, 'p_feioso', 'Feioso');
    const { c: Q, id: qId } = await player(server, url, 'p_ausente', 'Ausente');

    // papéis
    assert.equal((await P.request('gm', { cmd: 'rename', name: 'Ausente', newName: 'Outro' })).code, 'forbidden');
    for (const cmd of [{ cmd: 'rename', name: 'Feioso', newName: 'Belo' }, { cmd: 'take_gold', name: 'Feioso', amount: 1 }, { cmd: 'take_item', name: 'Feioso', defId: 'potion_hp_s' }, { cmd: 'rename_clan', tag: 'XYZ', newName: 'Nada' }]) {
      const r = await G.request('gm', cmd);
      assert.equal(r.code, 'forbidden', `${cmd.cmd}: ${r.reason}`);
      assert.match(r.reason, /só para administradores/);
    }

    // renomear on-line: memória (busca por nome, snapshot dos outros) e banco
    const told = P.waitFor((m) => m.t === 'system' && /renomeou seu personagem/.test(m.text), 3000, 'aviso ao renomeado');
    const charMsg = P.waitFor((m) => m.t === 'char' && m.char?.name === 'Renomeada', 3000, 'ficha nova');
    let r = await A.request('gm', { cmd: 'rename', name: 'feioso', newName: 'Renomeada', reason: 'nome ofensivo' });
    assert.equal(r.ok, true, r.reason);
    await told; await charMsg;
    assert.equal(server.byName.get('renomeada'), pId);
    assert.equal(server.byName.get('feioso'), undefined);
    assert.equal(st.characterByName('Renomeada').id, pId);
    await G.waitFor((m) => m.t === 'snap' && m.ents.some((e) => e.n === 'Renomeada'), 3000, 'nome novo no snapshot');
    const w = P.waitFor((m) => m.t === 'chat' && m.channel === 'whisper' && m.text === 'teste', 3000, 'sussurro pelo nome novo');
    assert.equal((await G.request('chat', { channel: 'whisper', to: 'Renomeada', text: 'teste' })).ok, true);
    await w;
    // regras de nome
    assert.equal((await A.request('gm', { cmd: 'rename', name: 'Renomeada', newName: 'sentinela' })).code, 'name_taken');
    assert.equal((await A.request('gm', { cmd: 'rename', name: 'Renomeada', newName: 'GM_Novo' })).code, 'bad_name');
    assert.equal((await A.request('gm', { cmd: 'rename', name: 'Renomeada', newName: 'ab' })).code, 'bad_name');
    assert.equal((await A.request('gm', { cmd: 'rename', name: 'Renomeada', newName: 'Renomeada' })).code, 'same');
    assert.equal((await A.request('gm', { cmd: 'rename', name: 'Ninguem', newName: 'Algum' })).code, 'not_found');
    // ninguém mexe em quem tem papel igual ou maior
    st.setRole(st.findAccount('p_ausente').id, 'admin');
    assert.equal((await A.request('gm', { cmd: 'rename', name: 'Ausente', newName: 'Distante' })).code, 'forbidden');
    st.setRole(st.findAccount('p_ausente').id, 'player');
    // fora do ar: direto no banco (o nome aparece na próxima entrada)
    Q.ws.close();
    await waitUntil(() => !server.byChar.has(qId), 'Ausente sair');
    r = await A.request('gm', { cmd: 'rename', name: 'Ausente', newName: 'Distante' });
    assert.equal(r.ok, true, r.reason);
    const q2 = await account(server, url, 'p_ausente');
    assert.deepEqual(q2.login.chars.map((c) => c.name), ['Distante']);
    q2.ws.close();
    log('renomear: on-line (memória, snapshot, sussurro) e fora do ar (banco); regras de nome e de papel');

    // retirar item on-line: da bolsa primeiro, depois do equipamento (atributos recalculados)
    const bagPotion = () => server.playerOf(pId).char.items.size && [...server.playerOf(pId).char.items.values()].filter((i) => i.defId === 'potion_hp_s').reduce((n, i) => n + i.qty, 0);
    const before = bagPotion();
    const msg = P.waitFor((m) => m.t === 'system' && /A equipe retirou/.test(m.text), 3000, 'aviso de retirada');
    r = await A.request('gm', { cmd: 'take_item', name: 'Renomeada', defId: 'potion_hp_s', qty: 2 });
    assert.equal(r.ok, true, r.reason);
    await msg;
    assert.equal(bagPotion(), before - 2);
    assert.equal(st.characterItems(pId).filter((i) => i.def_id === 'potion_hp_s').reduce((n, i) => n + i.qty, 0), before - 2, 'banco igual à memória');
    st.insertItem({ id: 'irregular-guardada', charId: pId, defId: 'potion_hp_s', qty: 4, enh: 0, loc: 'storage', slot: null, source: 'teste' });
    r = await A.request('gm', { cmd: 'take_item', name: 'Renomeada', defId: 'potion_hp_s' });
    assert.equal(r.qty, before - 2 + 4, 'sem quantidade: todas as unidades, inclusive as do depósito');
    assert.equal(st.characterItems(pId).some((i) => i.def_id === 'potion_hp_s'), false);
    const p = server.playerOf(pId);
    assert.equal(p.weaponDefId, 'axe_1h_t1');
    r = await A.request('gm', { cmd: 'take_item', name: 'Renomeada', defId: 'axe_1h_t1' });
    assert.equal(r.ok, true, r.reason);
    assert.equal(p.weaponDefId, null, 'arma equipada retirada: atributos recalculados');
    assert.equal((await A.request('gm', { cmd: 'take_item', name: 'Renomeada', defId: 'potion_hp_s' })).code, 'not_found');
    assert.equal((await A.request('gm', { cmd: 'take_item', name: 'Renomeada', defId: 'nao_existe' })).code, 'bad_item');
    assert.equal((await A.request('gm', { cmd: 'take_item', name: 'Renomeada', defId: 'axe_2h_t1', qty: 0 })).code, 'bad_request');
    // fora do ar: no banco
    r = await A.request('gm', { cmd: 'take_item', name: 'Distante', defId: 'potion_hp_s', qty: 1 });
    assert.equal(r.ok, true, r.reason);
    assert.equal(st.characterItems(qId).filter((i) => i.def_id === 'potion_hp_s').reduce((n, i) => n + i.qty, 0), 4);

    // retirar ouro: on-line (memória) e fora do ar (banco), até o que ele tem
    p.char.gold = 500;
    st.saveCharacter(p.char);
    r = await A.request('gm', { cmd: 'take_gold', name: 'Renomeada', amount: 200 });
    assert.equal(r.ok, true, r.reason);
    assert.equal(p.char.gold, 300);
    r = await A.request('gm', { cmd: 'take_gold', name: 'Renomeada', amount: 1000 });
    assert.match(r.message, /300 de ouro \(ficou com 0\)/);
    assert.equal(st.loadCharacter(pId).gold, 0);
    assert.equal((await A.request('gm', { cmd: 'take_gold', name: 'Renomeada', amount: 5 })).code, 'no_gold');
    assert.equal((await A.request('gm', { cmd: 'take_gold', name: 'Renomeada', amount: 'muito' })).code, 'bad_request');
    st.setCharacterGold(qId, 50);
    r = await A.request('gm', { cmd: 'take_gold', name: 'Distante', amount: 20 });
    assert.equal(r.ok, true, r.reason);
    assert.equal(st.loadCharacter(qId).gold, 30);

    // renomear clã: membros on-line avisados; regras do nome do clã
    let clanId, other;
    st.tx(() => { clanId = st.createClan('Clã Feio', 'FEI', pId); other = st.createClan('Outra Ordem', 'OUT', gId); });
    server.clans.attach(p.char);
    const ev = P.waitFor((m) => m.t === 'clan_event' && /renomeou o clã para Guarda Nova/.test(m.text), 3000, 'aviso do clã');
    r = await A.request('gm', { cmd: 'rename_clan', tag: 'fei', newName: 'Guarda Nova' });
    assert.equal(r.ok, true, r.reason);
    await ev;
    assert.equal(st.clanById(clanId).name, 'Guarda Nova');
    assert.equal((await A.request('gm', { cmd: 'rename_clan', tag: 'FEI', newName: 'outra ordem' })).code, 'taken');
    assert.equal((await A.request('gm', { cmd: 'rename_clan', tag: 'FEI', newName: 'Equipe Nova' })).code, 'bad_name');
    assert.equal((await A.request('gm', { cmd: 'rename_clan', tag: 'XYZ', newName: 'Qualquer' })).code, 'not_found');
    assert.ok(other);

    const kinds = new Set(st.auditTail(300).map((a) => a.kind));
    for (const k of ['mod_rename', 'mod_rename_clan', 'mod_take_item', 'mod_take_gold']) assert.ok(kinds.has(k), `auditoria: ${k}`);
    const ren = JSON.parse(st.auditTail(50, 'mod_rename').at(-1).data_json);
    assert.deepEqual([ren.from, ren.to, ren.reason], ['Feioso', 'Renomeada', 'nome ofensivo']);
    log('retirar itens (bolsa, equipamento, depósito) e ouro, on-line e fora do ar; clã renomeado; tudo na auditoria');
    for (const c of [A, G, P]) c.ws.close();
    await sleep(50);
  } finally { await done(); }
});
