// Pós-versão 1: refino +4..+6 (queda de grau e Selo de Proteção), comércio entre jogadores (troca
// atômica, travas, falhas que não mexem em nada), clãs (fundar, convidar, cargos, chat, sigla,
// desfazer) e duelos (contagem, luta até 1 de vida, fuga e desistência).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GameServer } from '../src/server.js';
import { enhanceQuote, enhanceOutcome, rollEnhance } from '../src/smith.js';
import { makeRng } from '../src/rng.js';
import { SimClient, sleep } from './helpers/client.js';

const log = (...a) => console.log('   ·', ...a);

async function withServer(fn, extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'cinzas-social-'));
  const server = new GameServer({ port: 0, host: '127.0.0.1', dbPath: join(dir, 'social.db'), timeScale: 1, seed: 77, dev: true, log: false, rateLimit: 1000, rateBurst: 1000, ...extra });
  const port = await server.start();
  try { await fn(server, `ws://127.0.0.1:${port}`); } finally { await server.stop().catch(() => {}); rmSync(dir, { recursive: true, force: true }); }
}

async function hero(url, name, classId = 'breaker', level = 1) {
  const c = new SimClient(name);
  await c.connect(url);
  await c.request('register', { account: `s_${name.toLowerCase()}`, password: 'senha123' });
  await c.request('login', { account: `s_${name.toLowerCase()}`, password: 'senha123' });
  const r = await c.request('create_char', { name, classId });
  assert.equal(r.ok, true, r.reason);
  const e = await c.request('enter', { charId: r.char.id });
  assert.equal(e.ok, true, e.reason);
  if (level > 1) assert.equal((await c.request('gm', { cmd: 'xp', level })).ok, true);
  return c;
}

const player = (server, c) => server.playerOf(c.char.id);
const tp = (c, x, z) => c.request('gm', { cmd: 'teleport', x, z });
// espera uma mensagem empurrada registrando o "ouvinte" antes de disparar o pedido
async function expectPush(c, pred, fire, what) {
  const w = c.waitFor(pred, 5000, what);
  const r = await fire();
  return { push: await w, res: r };
}

test('refino +4..+6: chances, queda de grau e Selo de Proteção', async () => {
  // regras puras
  await withServer(async (server, url) => {
    const data = server.data;
    const sword = { kind: 'weapon', level: 5 };
    const chances = [0, 1, 2, 3, 4, 5].map((g) => enhanceQuote(sword, g, data).chancePct);
    assert.deepEqual(chances, [90, 70, 45, 30, 20, 12]);
    assert.equal(enhanceQuote(sword, 6, data), null, '+6 é o máximo');
    assert.equal(enhanceQuote(sword, 2, data).downgradeOnFail, false, 'até +3 a falha não derruba');
    const q4 = enhanceQuote(sword, 3, data);
    assert.equal(q4.downgradeOnFail, true);
    assert.equal(q4.material, 'mat_refine_sup');
    assert.equal(q4.protectItem, 'protect_seal');
    assert.deepEqual(enhanceOutcome(3, false, q4, false), { enh: 2, protectUsed: false, downgraded: true });
    assert.deepEqual(enhanceOutcome(3, false, q4, true), { enh: 3, protectUsed: true, downgraded: false });
    assert.deepEqual(enhanceOutcome(3, true, q4, true), { enh: 4, protectUsed: false, downgraded: false });
    // taxa observada com o RNG semeado bate com a tabela (±1,5 ponto)
    const rng = makeRng(2026);
    for (const pct of [30, 20, 12]) {
      let ok = 0;
      for (let i = 0; i < 20000; i++) if (rollEnhance(rng, pct).success) ok++;
      assert.ok(Math.abs((ok / 200) - pct) < 1.5, `chance ${pct}%: observado ${(ok / 200).toFixed(1)}%`);
    }

    // no jogo, com o ferreiro de Pedrâmbar
    const c = await hero(url, 'Ferrante', 'breaker', 8);
    const zw = c.waitFor((m) => m.t === 'zone' && m.mapId === 'pedrambar', 5000, 'pedrâmbar');
    await c.request('gm', { cmd: 'teleport', mapId: 'pedrambar', x: 13, z: 44 });
    await zw;
    const p = player(server, c);
    const give = async (defId, qty = 1) => (await c.request('gm', { cmd: 'give', defId, qty })).instanceId;
    const axe = await give('axe_1h_t5');
    await give('mat_refine_sup', 30);
    await give('mat_refine', 10);
    await give('protect_seal', 2);
    await c.request('gm', { cmd: 'gold', amount: 100000 });
    const it = p.char.items.get(axe);
    const count = (defId) => [...p.char.items.values()].filter((x) => x.loc === 'bag' && x.defId === defId).reduce((s, x) => s + x.qty, 0);
    const realRng = p.zone.rng;
    const forced = (v) => { p.zone.rng = () => v; };
    try {
      it.enh = 3;
      let q = await c.request('enhance_quote', { npc: 'smith_gusmao', instance: axe });
      assert.equal(q.ok, true, q.reason);
      assert.equal(q.chancePct, 30);
      assert.equal(q.downgradeOnFail, true);
      assert.equal(q.protectHave, 2);
      // falha sem selo: cai para +2
      forced(0.99);
      let r = await c.request('enhance', { npc: 'smith_gusmao', instance: axe });
      assert.equal(r.ok, true, r.reason);
      assert.equal(r.success, false);
      assert.equal(r.downgraded, true);
      assert.equal(r.enh, 2);
      assert.match(r.message, /caiu para \+2/);
      assert.equal(count('protect_seal'), 2, 'sem pedir o selo, ele não é gasto');
      // falha com selo: segura em +3 e gasta um selo
      it.enh = 3;
      r = await c.request('enhance', { npc: 'smith_gusmao', instance: axe, protect: true });
      assert.equal(r.success, false);
      assert.equal(r.protectUsed, true);
      assert.equal(r.enh, 3);
      assert.equal(count('protect_seal'), 1);
      // sucesso com selo: sobe para +4 e o selo fica
      forced(0);
      r = await c.request('enhance', { npc: 'smith_gusmao', instance: axe, protect: true });
      assert.equal(r.success, true);
      assert.equal(r.enh, 4);
      assert.equal(count('protect_seal'), 1, 'o selo só é gasto quando segura uma falha');
      // até +6 e depois o máximo
      for (const to of [5, 6]) { r = await c.request('enhance', { npc: 'smith_gusmao', instance: axe }); assert.equal(r.enh, to); }
      assert.equal(server.store.loadCharacter(p.char.id).items.get(axe).enh, 6, '+6 gravado no banco');
      q = await c.request('enhance_quote', { npc: 'smith_gusmao', instance: axe });
      assert.equal(q.ok, false);
      assert.equal(q.code, 'max');
      // abaixo de +3 o selo nem é considerado
      it.enh = 1;
      forced(0.99);
      r = await c.request('enhance', { npc: 'smith_gusmao', instance: axe, protect: true });
      assert.equal(r.enh, 1);
      assert.ok(!r.protectUsed);
      assert.equal(count('protect_seal'), 1);
      // sem selo na bolsa → recusa sem gastar nada
      it.enh = 3;
      const sealId = [...p.char.items.values()].find((x) => x.defId === 'protect_seal').id;
      p.char.items.delete(sealId);
      server.store.deleteItem(p.char.id, sealId);
      const goldBefore = p.char.gold;
      r = await c.request('enhance', { npc: 'smith_gusmao', instance: axe, protect: true });
      assert.equal(r.ok, false);
      assert.equal(r.code, 'no_protect');
      assert.equal(p.char.gold, goldBefore);
      log('refino: queda, selo, máximo e recusa conferidos');
    } finally { p.zone.rng = realRng; }
    c.ws.close();
  });
});

test('comércio: travas, confirmação dupla, troca atômica e cancelamentos', async () => {
  await withServer(async (server, url) => {
    const A = await hero(url, 'Mercante');
    const B = await hero(url, 'Freguesa');
    const pa = player(server, A), pb = player(server, B);
    await tp(A, pa.char.x, pa.char.z);
    await tp(B, pa.char.x + 2, pa.char.z);
    const axe = (await A.request('gm', { cmd: 'give', defId: 'axe_1h_t1' })).instanceId;
    await B.request('gm', { cmd: 'gold', amount: 200 });
    const goldA = pa.char.gold, goldB = pb.char.gold;

    // pedido → convite → aceite
    let { push: inv, res } = await expectPush(B, (m) => m.t === 'trade_invite', () => A.request('trade_request', { name: 'freguesa' }), 'convite de troca');
    assert.equal(res.ok, true, res.reason);
    assert.equal(inv.from, 'Mercante');
    ({ res } = await expectPush(A, (m) => m.t === 'trade', () => B.request('trade_accept', { from: inv.fromId }), 'janela de troca'));
    assert.equal(res.ok, true, res.reason);
    assert.equal((await A.request('trade_request', { name: 'Freguesa' })).code, 'busy');

    // ofertas; item equipado não entra
    const equipped = [...pa.char.items.values()].find((x) => x.loc === 'equip');
    assert.equal((await A.request('trade_offer', { items: [equipped.id] })).code, 'bad_item');
    assert.equal((await B.request('trade_offer', { gold: 999999 })).code, 'no_gold');
    assert.equal((await A.request('trade_offer', { items: [axe], gold: 0 })).ok, true);
    assert.equal((await B.request('trade_offer', { items: [], gold: 50 })).ok, true);
    assert.equal((await A.request('trade_confirm')).code, 'not_locked');
    await A.request('trade_lock');
    await B.request('trade_lock');
    // mudar a oferta destrava os dois
    const w = A.waitFor((m) => m.t === 'trade' && m.trade.them.gold === 60, 3000, 'oferta nova');
    await B.request('trade_offer', { gold: 60 });
    const view = (await w).trade;
    assert.equal(view.me.locked, false);
    assert.equal(view.them.locked, false);
    assert.equal(view.me.items[0].defId, 'axe_1h_t1');
    await A.request('trade_lock');
    await B.request('trade_lock');
    const r1 = await A.request('trade_confirm');
    assert.equal(r1.waiting, true);
    const doneA = A.waitFor((m) => m.t === 'trade_done', 3000, 'troca feita (A)');
    const r2 = await B.request('trade_confirm');
    assert.equal(r2.ok, true, r2.reason);
    assert.equal(r2.done, true);
    await doneA;
    assert.equal(pa.char.gold, goldA + 60);
    assert.equal(pb.char.gold, goldB - 60);
    assert.ok(pb.char.items.has(axe) && !pa.char.items.has(axe));
    const dbA = server.store.loadCharacter(pa.char.id), dbB = server.store.loadCharacter(pb.char.id);
    assert.equal(dbA.gold, goldA + 60);
    assert.equal(dbB.gold, goldB - 60);
    assert.ok(dbB.items.has(axe) && !dbA.items.has(axe), 'item mudou de dono no banco');
    log('troca feita: machado por 60 de ouro');

    // falha no meio da transação: nada muda (o item de A já tinha passado e volta)
    const axe2 = (await A.request('gm', { cmd: 'give', defId: 'axe_1h_t1' })).instanceId;
    const charm = (await B.request('gm', { cmd: 'give', defId: 'claw_t1' })).instanceId;
    ({ push: inv } = await expectPush(B, (m) => m.t === 'trade_invite', () => A.request('trade_request', { name: 'Freguesa' }), 'convite 2'));
    await B.request('trade_accept', { from: inv.fromId });
    await A.request('trade_offer', { items: [axe2], gold: 5 });
    await B.request('trade_offer', { items: [charm], gold: 10 });
    await A.request('trade_lock');
    await B.request('trade_lock');
    server.store.deleteItem(pb.char.id, charm); // some do banco por fora (como uma falha de disco)
    const ga = pa.char.gold, gb = pb.char.gold;
    await A.request('trade_confirm');
    const closed = A.waitFor((m) => m.t === 'trade_closed', 3000, 'troca desfeita');
    const bad = await B.request('trade_confirm');
    assert.equal(bad.ok, false);
    assert.equal(bad.code, 'trade_failed');
    assert.match((await closed).reason, /Nada mudou/);
    assert.equal(pa.char.gold, ga);
    assert.equal(pb.char.gold, gb);
    assert.ok(pa.char.items.has(axe2), 'item continua com A em memória');
    assert.ok(server.store.loadCharacter(pa.char.id).items.has(axe2), 'e no banco (transação desfeita)');
    assert.equal(server.store.loadCharacter(pb.char.id).gold, gb);
    log('falha no meio: transação desfeita, nada mudou');

    // afastar-se cancela; desconectar também
    ({ push: inv } = await expectPush(B, (m) => m.t === 'trade_invite', () => A.request('trade_request', { name: 'Freguesa' }), 'convite 3'));
    await B.request('trade_accept', { from: inv.fromId });
    const far = A.waitFor((m) => m.t === 'trade_closed', 4000, 'cancelada por distância');
    await tp(B, pb.char.x + 30, pb.char.z);
    assert.match((await far).reason, /afastaram/);
    await tp(B, pa.char.x + 2, pa.char.z);
    ({ push: inv } = await expectPush(B, (m) => m.t === 'trade_invite', () => A.request('trade_request', { name: 'Freguesa' }), 'convite 4'));
    await B.request('trade_accept', { from: inv.fromId });
    const gone = A.waitFor((m) => m.t === 'trade_closed', 4000, 'cancelada por saída');
    B.ws.close();
    assert.match((await gone).reason, /saiu/);
    assert.equal(server.trades.trades.size, 0);
    A.ws.close();
  });
});

test('clãs: fundar, convidar, cargos, chat do clã, sigla no snapshot e desfazer', async () => {
  await withServer(async (server, url) => {
    const A = await hero(url, 'Fundadora', 'breaker', 10);
    const B = await hero(url, 'Oficial');
    const C = await hero(url, 'Recruta');
    const D = await hero(url, 'Forasteiro');
    const pa = player(server, A), pb = player(server, B), pc = player(server, C);
    assert.equal((await B.request('clan_create', { name: 'Guarda do Sal', tag: 'SAL' })).code, 'level');
    assert.equal((await A.request('clan_create', { name: 'Guarda do Sal', tag: 'SAL' })).code, 'no_gold');
    await A.request('gm', { cmd: 'gold', amount: 800 });
    assert.equal((await A.request('clan_create', { name: 'x', tag: 'SAL' })).code, 'bad_name');
    const goldBefore = pa.char.gold;
    let r = await A.request('clan_create', { name: 'Guarda do Sal', tag: 'sal' });
    assert.equal(r.ok, true, r.reason);
    assert.equal(r.clan.tag, 'SAL');
    assert.equal(r.clan.myRank, 'leader');
    assert.equal(pa.char.gold, goldBefore - 500);
    assert.equal(pa.char.clanTag, 'SAL');

    const join = async (inviter, c, label) => {
      const { push, res } = await expectPush(c, (m) => m.t === 'clan_invite', () => inviter.request('clan_invite', { name: c.char.name }), label);
      assert.equal(res.ok, true, res.reason);
      const a = await c.request('clan_accept', { clanId: push.clan.id });
      assert.equal(a.ok, true, a.reason);
      return a;
    };
    await join(A, B, 'convite B');
    assert.equal(pb.char.clanTag, 'SAL');
    assert.match(JSON.stringify(pa.zone.snapshot()), /"n":"Oficial"[^}]*"cl":"SAL"/, 'sigla no snapshot');
    // membro comum não convida; promovido a oficial, convida
    assert.equal((await B.request('clan_invite', { name: 'Recruta' })).code, 'forbidden');
    r = await A.request('clan_rank', { charId: pb.char.id, rank: 'officer' });
    assert.equal(r.ok, true, r.reason);
    await join(B, C, 'convite C');
    assert.equal((await A.request('clan_info')).clan.members.length, 3);

    // chat do clã chega aos membros e só a eles
    const got = [A, C].map((c) => c.waitFor((m) => m.t === 'chat' && m.channel === 'clan' && m.text === 'reunião no portão', 3000, `chat ${c.label}`));
    assert.equal((await B.request('chat', { channel: 'clan', text: 'reunião no portão' })).ok, true);
    const msgs = await Promise.all(got);
    assert.equal(msgs[0].from, 'Oficial');
    await sleep(200);
    assert.ok(!D.events.some((m) => m.t === 'chat' && m.channel === 'clan'), 'quem é de fora não recebe');
    assert.equal((await D.request('chat', { channel: 'clan', text: 'oi' })).code, 'no_clan');

    // cargos: oficial não mexe no líder; líder expulsa
    assert.equal((await B.request('clan_kick', { charId: pa.char.id })).code, 'forbidden');
    const left = C.waitFor((m) => m.t === 'clan_event' && m.left, 3000, 'aviso de expulsão');
    assert.equal((await A.request('clan_kick', { charId: pc.char.id })).ok, true);
    await left;
    assert.equal(pc.char.clanTag, null);
    // líder não sai sem passar a liderança
    assert.equal((await A.request('clan_leave')).code, 'leader');
    assert.equal((await A.request('clan_transfer', { charId: pb.char.id })).ok, true);
    assert.equal(server.store.clanOfChar(pb.char.id).rank, 'leader');
    assert.equal((await A.request('clan_leave')).ok, true);
    assert.equal(pa.char.clanTag, null);
    // mensagem do dia e desfazer
    assert.equal((await B.request('clan_motd', { text: 'Treino às 20h' })).clan.motd, 'Treino às 20h');
    assert.equal((await B.request('clan_disband')).ok, true);
    assert.equal(pb.char.clanTag, null);
    assert.equal(server.store.clanByNameOrTag('Guarda do Sal', 'SAL') ?? null, null);
    log('clã fundado, três membros, cargos, chat, transferência e fim');
    for (const c of [A, B, C, D]) c.ws.close();
  });
});

test('duelo: contagem, luta até 1 de vida, fuga e desistência', async () => {
  await withServer(async (server, url) => {
    const A = await hero(url, 'Duelista', 'breaker', 5);
    const B = await hero(url, 'Rival', 'breaker', 5);
    const C = await hero(url, 'Plateia');
    const pa = player(server, A), pb = player(server, B), pc = player(server, C);
    const zone = pa.zone;
    // longe dos monstros do caminho
    const sx = pa.char.x, sz = pa.char.z;
    await tp(A, sx, sz);
    await tp(B, sx + 3, sz);
    await tp(C, sx - 3, sz);
    // fora de duelo, jogador não é alvo
    assert.equal((await A.request('attack', { target: pc.eid })).code, 'bad_target');

    const start = async () => {
      const { push: inv, res } = await expectPush(B, (m) => m.t === 'duel_invite', () => A.request('duel_request', { name: 'Rival' }), 'desafio');
      assert.equal(res.ok, true, res.reason);
      const cd = A.waitFor((m) => m.t === 'duel' && m.state === 'countdown', 3000, 'contagem');
      assert.equal((await B.request('duel_accept', { from: inv.fromId })).ok, true);
      await cd;
      // durante a contagem ainda não vale
      assert.equal((await A.request('attack', { target: pb.eid })).code, 'bad_target');
      await A.waitFor((m) => m.t === 'duel' && m.state === 'active', 5000, 'início');
    };

    await start();
    assert.equal((await A.request('attack', { target: pc.eid })).code, 'bad_target', 'quem está de fora continua fora');
    pb.char.hp = 12;
    const end = B.waitFor((m) => m.t === 'duel' && m.state === 'ended', 20000, 'fim do duelo');
    assert.equal((await A.request('attack', { target: pb.eid })).ok, true);
    // habilidade de alvo único também vale
    await sleep(400);
    const cast = await A.request('cast', { skill: 'deep_cut', target: pb.eid });
    assert.ok(cast.ok || cast.code === 'bad_target', cast.reason);
    const e = await end;
    assert.equal(e.won, false);
    // perdeu com 1 de vida (a regeneração pode somar uma fração antes desta leitura)
    assert.ok(pb.char.hp >= 1 && pb.char.hp < 3, `ninguém morre em duelo (vida ${pb.char.hp})`);
    assert.equal(pb.char.dead, false);
    assert.equal(zone.duels.duels.size, 0);
    log(`duelo terminou: ${e.text}`);

    // fuga: afastar-se mais de 30 m do centro
    pb.char.hp = pb.stats.maxHp;
    await tp(A, sx, sz); await tp(B, sx + 3, sz);
    await start();
    const fled = A.waitFor((m) => m.t === 'duel' && m.state === 'ended', 4000, 'fuga');
    await tp(B, sx + 45, sz);
    const f = await fled;
    assert.equal(f.won, true);
    assert.match(f.text, /fugiu/);

    // desistência por desconexão
    await tp(B, sx + 3, sz);
    await start();
    const quit = A.waitFor((m) => m.t === 'duel' && m.state === 'ended', 4000, 'desistência');
    B.ws.close();
    const q = await quit;
    assert.equal(q.won, true);
    assert.equal(zone.duels.byChar.size, 0);
    log('fuga e desistência conferidas');
    A.ws.close(); C.ws.close();
  });
});

test('casos de borda: empate do duelo por tempo, troca com bolsa cheia, clã com nome ou sigla repetidos', async () => {
  // relógio de jogo 60x: os 3 minutos do duelo passam em 3 s
  await withServer(async (server, url) => {
    const A = await hero(url, 'Teimosa', 'breaker', 10);
    const B = await hero(url, 'Teimoso', 'breaker', 10);
    const pa = player(server, A), pb = player(server, B);
    await tp(A, pa.char.x, pa.char.z);
    await tp(B, pa.char.x + 2, pa.char.z);
    // duelo sem ninguém atacar: empate
    const { push: inv } = await expectPush(B, (m) => m.t === 'duel_invite', () => A.request('duel_request', { name: 'Teimoso' }), 'desafio');
    const end = A.waitFor((m) => m.t === 'duel' && m.state === 'ended', 10000, 'empate');
    await B.request('duel_accept', { from: inv.fromId });
    const e = await end;
    assert.equal(e.draw, true);
    assert.match(e.text, /empate/);

    // troca com a bolsa do outro lado cheia: recusa e nada muda
    const axe = (await A.request('gm', { cmd: 'give', defId: 'axe_1h_t1' })).instanceId;
    const { bagCount, BAG_CAPACITY } = await import('../src/equipment.js');
    while (bagCount(pb.char) < BAG_CAPACITY) await B.request('gm', { cmd: 'give', defId: 'claw_t1' });
    const { push: tinv } = await expectPush(B, (m) => m.t === 'trade_invite', () => A.request('trade_request', { name: 'Teimoso' }), 'troca');
    await B.request('trade_accept', { from: tinv.fromId });
    await A.request('trade_offer', { items: [axe] });
    await A.request('trade_lock');
    await B.request('trade_lock');
    await A.request('trade_confirm');
    const r = await B.request('trade_confirm');
    assert.equal(r.ok, false);
    assert.match(r.reason, /Bolsa de Teimoso cheia/);
    assert.ok(pa.char.items.has(axe) && !pb.char.items.has(axe));

    // clã: nome e sigla únicos (sem diferenciar maiúsculas)
    await A.request('gm', { cmd: 'gold', amount: 2000 });
    await B.request('gm', { cmd: 'gold', amount: 2000 });
    assert.equal((await A.request('clan_create', { name: 'Vigia Norte', tag: 'VN' })).ok, true);
    assert.equal((await B.request('clan_create', { name: 'vigia norte', tag: 'XY' })).code, 'taken');
    assert.equal((await B.request('clan_create', { name: 'Outro Clã', tag: 'vn' })).code, 'taken');
    assert.equal((await B.request('clan_create', { name: 'Outro Clã', tag: 'ABCDE' })).code, 'bad_tag');
    log('empate por tempo, bolsa cheia e nomes de clã conferidos');
    A.ws.close(); B.ws.close();
  }, { timeScale: 60 });
});

test('troca: item oferecido que muda depois de travar (tônico bebido, compra que empilharia) destrava e mostra o novo valor', async () => {
  await withServer(async (server, url) => {
    const A = await hero(url, 'Astuta');
    const B = await hero(url, 'Atento');
    const pa = server.playerOf(A.char.id), pb = server.playerOf(B.char.id);
    await tp(A, pa.char.x, pa.char.z);
    await tp(B, pa.char.x + 2, pa.char.z);
    await B.request('gm', { cmd: 'gold', amount: 900 });
    const pots = [...pa.char.items.values()].find((x) => x.defId === 'potion_hp_s' && x.loc === 'bag');
    const q0 = pots.qty;
    const { push: inv } = await expectPush(B, (m) => m.t === 'trade_invite', () => A.request('trade_request', { name: 'Atento' }), 'convite');
    await B.request('trade_accept', { from: inv.fromId });
    await A.request('trade_offer', { items: [pots.id] });
    await B.request('trade_offer', { gold: 900 });
    await A.request('trade_lock');
    await B.request('trade_lock');
    assert.equal((await A.request('trade_confirm')).waiting, true);
    // A bebe um tônico da pilha oferecida: B vê a quantidade nova e os dois destravam
    const seen = B.waitFor((m) => m.t === 'trade' && m.trade.them.items[0]?.qty === q0 - 1, 3000, 'pilha menor na tela de B');
    pa.potionReadyAt = 0;
    assert.equal((await A.request('use_item', { instance: pots.id })).ok, true);
    const v = (await seen).trade;
    assert.equal(v.them.locked, false);
    assert.equal(v.them.confirmed, false);
    assert.equal((await B.request('trade_confirm')).code, 'not_locked', 'B não confirma às cegas');
    // compra do mesmo tônico não entra na pilha oferecida
    const zw = A.waitFor((m) => m.t === 'zone' && m.mapId === 'pedrambar', 5000, 'pedrâmbar');
    const zb = B.waitFor((m) => m.t === 'zone' && m.mapId === 'pedrambar', 5000, 'pedrâmbar B');
    await A.request('gm', { cmd: 'teleport', mapId: 'pedrambar', x: 23, z: 48 });
    await zw;
    // trocar de mapa cancela a troca; abre outra lá
    await B.request('gm', { cmd: 'teleport', mapId: 'pedrambar', x: 24, z: 48 });
    await zb;
    const { push: inv2 } = await expectPush(B, (m) => m.t === 'trade_invite', () => A.request('trade_request', { name: 'Atento' }), 'convite 2');
    await B.request('trade_accept', { from: inv2.fromId });
    await A.request('trade_offer', { items: [pots.id] });
    await A.request('gm', { cmd: 'gold', amount: 100 });
    const before = pots.qty;
    assert.equal((await A.request('buy', { npc: 'potions_resina', item: 'potion_hp_s', qty: 2 })).ok, true);
    assert.equal(pots.qty, before, 'a pilha oferecida não cresceu');
    assert.ok([...pa.char.items.values()].some((x) => x.defId === 'potion_hp_s' && x.id !== pots.id && x.qty === 2), 'compra numa pilha nova');
    A.ws.close(); B.ws.close();
  });
});

test('duelo: queda por monstro encerra sem vencedor; de fora ninguém cura; só golpes e magias valem; escudo absorve', async () => {
  await withServer(async (server, url) => {
    const A = await hero(url, 'Golpe', 'breaker', 15);
    const B = await hero(url, 'Guarda', 'breaker', 15);
    const C = await hero(url, 'Curandeira', 'veilsinger', 5);
    const W = await hero(url, 'Marcadora', 'warden', 5);
    const pa = player(server, A), pb = player(server, B);
    const sx = pa.char.x, sz = pa.char.z;
    for (const [c, dx] of [[A, 0], [B, 3], [C, -3], [W, 1.5]]) await tp(c, sx + dx, sz);
    const zone = pa.zone;
    const start = async (ch, op, name) => {
      const { push: inv } = await expectPush(op, (m) => m.t === 'duel_invite', () => ch.request('duel_request', { name }), 'desafio');
      await op.request('duel_accept', { from: inv.fromId });
      await ch.waitFor((m) => m.t === 'duel' && m.state === 'active', 6000, 'início');
    };
    await start(A, B, 'Guarda');
    // de fora não cura o duelista
    pb.char.hp = 40;
    const heal = await C.request('cast', { skill: 'sustain_chant', ally: pb.eid });
    assert.equal(heal.code, 'in_duel');
    // escudo do próprio duelista absorve o golpe do duelo
    pb.shield = { amount: 500, until: zone.now + 10_000, by: pb.char.id };
    const hp0 = pb.char.hp;
    zone.duels.damage(pa, pb, 30);
    assert.equal(pb.char.hp, hp0, 'escudo absorveu');
    assert.equal(pb.shield.amount, 470);
    pb.shield = null;
    // monstro derruba um duelista: o duelo acaba sem vencedor (golpe no corpo não vale)
    const ended = A.waitFor((m) => m.t === 'duel' && m.state === 'ended', 4000, 'fim por queda');
    zone.applyRawDamage(pb, 99999);
    assert.equal(pb.char.dead, true);
    const cast = await A.request('cast', { skill: 'deep_cut', target: pb.eid });
    assert.equal(cast.ok, false, 'corpo não é alvo');
    const e = await ended;
    assert.equal(e.draw, true);
    assert.equal(pb.char.hp, 0, 'continua caído, sem vida inventada');
    // ninguém desafia caído; e quem cai depois do desafio não aceita
    assert.equal((await A.request('duel_request', { name: 'Guarda' })).code, 'dead');
    await B.request('respawn');
    await tp(B, sx + 3, sz); await tp(W, sx + 1.5, sz);
    const { push: inv2 } = await expectPush(B, (m) => m.t === 'duel_invite', () => A.request('duel_request', { name: 'Guarda' }), 'desafio');
    zone.applyRawDamage(pb, 99999);
    assert.equal((await B.request('duel_accept', { from: inv2.fromId })).code, 'dead');
    await B.request('respawn');
    await tp(B, sx + 3, sz);
    // marca da trilha (sem dano) não vale em duelo
    await start(W, B, 'Guarda');
    const mark = await W.request('cast', { skill: 'trail_mark', target: pb.eid });
    assert.equal(mark.code, 'not_in_duel');
    for (const c of [A, B, C, W]) c.ws.close();
  });
});
