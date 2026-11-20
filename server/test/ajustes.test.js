// Ajustes do Marco 4 apontados pela simulação de progressão: recargas que atravessam zonas como tempo
// restante (antes travavam habilidades na prova e no calabouço), nível dos tônicos conferido na compra e
// no uso, venda ao comerciante e descarte de itens (com a troca aberta acompanhando).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GameServer } from '../src/server.js';
import { SimClient } from './helpers/client.js';

async function withServer(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'cinzas-ajustes-'));
  const server = new GameServer({ port: 0, host: '127.0.0.1', dbPath: join(dir, 'a.db'), seed: 9, dev: true, log: false, rateLimit: 1000, rateBurst: 1000 });
  const port = await server.start();
  try { await fn(server, `ws://127.0.0.1:${port}`); } finally { await server.stop().catch(() => {}); rmSync(dir, { recursive: true, force: true }); }
}

async function hero(url, name, classId = 'breaker') {
  const c = new SimClient(name);
  await c.connect(url);
  await c.request('register', { account: `aj_${name.toLowerCase()}`, password: 'senha123' });
  await c.request('login', { account: `aj_${name.toLowerCase()}`, password: 'senha123' });
  const r = await c.request('create_char', { name, classId });
  assert.equal((await c.request('enter', { charId: r.char.id })).ok, true);
  return c;
}

test('recargas atravessam a troca de zona como tempo restante (instância nova começa no relógio 0)', async () => {
  await withServer(async (server, url) => {
    const c = await hero(url, 'Viajante');
    const p = server.playerOf(c.char.id);
    const from = p.zone;
    from.now += 600_000; // servidor ligado há 10 min
    p.cooldowns.momentum = from.now + 25_000;
    p.cooldowns.deep_cut = from.now - 1_000; // já pronta
    p.potionReadyAt = from.now + 8_000;
    const inst = server.createZone('arena_prova', 'teste-inst-1');
    assert.ok(inst.now < 1000, 'instância nova começa perto de 0');
    const np = server.moveToZone(p, inst.key, inst.map.guardPost?.x ?? 20, inst.map.guardPost?.z ?? 20);
    const left = np.cooldowns.momentum - inst.now;
    assert.ok(left > 24_000 && left <= 25_000, `Ímpeto continua com ~25 s de recarga (${left} ms)`);
    assert.equal(np.cooldowns.deep_cut, undefined, 'recarga vencida não viaja');
    assert.ok(np.potionReadyAt - inst.now > 7_000 && np.potionReadyAt - inst.now <= 8_000, 'tônico também');
    c.ws.close();
  });
});

test('tônico acima do nível: não compra nem usa; venda e descarte; item vendido sai da troca', async () => {
  await withServer(async (server, url) => {
    const A = await hero(url, 'Vendedora');
    const B = await hero(url, 'Comprador');
    const zw = A.waitFor((m) => m.t === 'zone' && m.mapId === 'pedrambar', 5000, 'pedrâmbar');
    await A.request('gm', { cmd: 'teleport', mapId: 'pedrambar', x: 23, z: 48 });
    await zw;
    const pa = server.playerOf(A.char.id);
    await A.request('gm', { cmd: 'gold', amount: 500 });
    // uma compra cabe numa pilha: 5 a mais que a pilha de tônicos é recusado
    const stackHp = server.data.items.potion_hp_s.stack;
    assert.equal((await A.request('buy', { npc: 'potions_resina', item: 'potion_hp_s', qty: stackHp + 1 })).code, 'bad_request');
    // tônico médio é do nível 9
    let r = await A.request('buy', { npc: 'potions_resina', item: 'potion_hp_m', qty: 1 });
    assert.equal(r.code, 'level');
    const med = (await A.request('gm', { cmd: 'give', defId: 'potion_hp_m', qty: 2 })).instanceId;
    r = await A.request('use_item', { instance: med });
    assert.equal(r.code, 'level');
    assert.match(r.reason, /Nível 9 exigido/);

    // venda: pilha inteira de tônicos pequenos a metade do valor por unidade
    const small = [...pa.char.items.values()].find((x) => x.defId === 'potion_hp_s' && x.loc === 'bag');
    const value = server.data.items.potion_hp_s.value;
    const gold0 = pa.char.gold, qty0 = small.qty;
    r = await A.request('sell', { npc: 'potions_resina', instance: small.id });
    assert.equal(r.ok, true, r.reason);
    assert.equal(r.gold, Math.max(1, Math.floor(value / 2)) * qty0);
    assert.equal(pa.char.gold, gold0 + r.gold);
    assert.ok(!pa.char.items.has(small.id));
    assert.equal(server.store.loadCharacter(pa.char.id).gold, pa.char.gold, 'ouro gravado');
    // equipado não vende; longe da loja também não
    const weapon = [...pa.char.items.values()].find((x) => x.loc === 'equip');
    assert.equal((await A.request('sell', { npc: 'potions_resina', instance: weapon.id })).code, 'not_in_bag');
    await A.request('gm', { cmd: 'teleport', x: 60, z: 20 });
    assert.equal((await A.request('sell', { npc: 'potions_resina', instance: med })).code, 'too_far');
    // descarte
    r = await A.request('discard', { instance: med });
    assert.equal(r.ok, true, r.reason);
    assert.ok(!pa.char.items.has(med));
    assert.ok(!server.store.loadCharacter(pa.char.id).items.has(med), 'apagado do banco');

    // item numa oferta de troca vendido por fora: sai da oferta e destrava os dois
    const zb = B.waitFor((m) => m.t === 'zone' && m.mapId === 'pedrambar', 5000, 'pedrâmbar B');
    await B.request('gm', { cmd: 'teleport', mapId: 'pedrambar', x: 24, z: 48 });
    await zb;
    await A.request('gm', { cmd: 'teleport', x: 23, z: 48 });
    const axe = (await A.request('gm', { cmd: 'give', defId: 'axe_1h_t1' })).instanceId;
    const inv = B.waitFor((m) => m.t === 'trade_invite', 3000, 'convite');
    await A.request('trade_request', { name: 'Comprador' });
    await B.request('trade_accept', { from: (await inv).fromId });
    await A.request('trade_offer', { items: [axe] });
    await A.request('trade_lock');
    await B.request('trade_lock');
    const upd = B.waitFor((m) => m.t === 'trade' && m.trade.them.items.length === 0, 3000, 'oferta sem o machado');
    assert.equal((await A.request('sell', { npc: 'potions_resina', instance: axe })).ok, true);
    const t = (await upd).trade;
    assert.equal(t.them.locked, false);
    assert.equal(t.me.locked, false);
    A.ws.close(); B.ws.close();
  });
});

test('armeiro: peças comuns da classe, faixa atual e próxima; compra a 3× o valor; vende de volta', async () => {
  await withServer(async (server, url) => {
    const c = await hero(url, 'Fregues', 'warden');
    const zw = c.waitFor((m) => m.t === 'zone' && m.mapId === 'pedrambar', 5000, 'pedrâmbar');
    await c.request('gm', { cmd: 'teleport', mapId: 'pedrambar', x: 17, z: 48 });
    await zw;
    await c.request('gm', { cmd: 'xp', level: 10 });
    await c.request('gm', { cmd: 'gold', amount: 5000 });
    const t = await c.request('talk', { npc: 'armorer_amaro' });
    assert.equal(t.ok, true, t.reason);
    assert.ok(t.shop.length > 3, 'tem peças à venda');
    const items = server.data.items;
    for (const s of t.shop) {
      const d = items[s.defId];
      assert.equal(d.rarity, 'common');
      assert.ok(!d.classes || d.classes.includes('warden'), `${d.name} serve para a Vigia`);
      assert.ok([9, 13].includes(d.level), `${d.name}: faixa 9 (atual) ou 13 (próxima)`);
      assert.equal(s.price, Math.round(d.value * 3));
    }
    assert.ok(t.shop.some((s) => items[s.defId].family === 'bow' && items[s.defId].level === 9), 'arco da faixa');
    const bow = t.shop.find((s) => items[s.defId].family === 'bow' && items[s.defId].level === 9);
    const p = server.playerOf(c.char.id);
    const g0 = p.char.gold;
    let r = await c.request('buy', { npc: 'armorer_amaro', item: bow.defId, qty: 1 });
    assert.equal(r.ok, true, r.reason);
    assert.equal(p.char.gold, g0 - bow.price);
    assert.equal((await c.request('buy', { npc: 'armorer_amaro', item: bow.defId, qty: 2 })).code, 'bad_request', 'equipamento um por vez');
    assert.equal((await c.request('buy', { npc: 'armorer_amaro', item: 'axe_1h_t9' })).code, 'not_sold', 'peça de outra classe não está à venda');
    const inst = [...p.char.items.values()].find((x) => x.defId === bow.defId && x.loc === 'bag');
    r = await c.request('sell', { npc: 'armorer_amaro', instance: inst.id });
    assert.equal(r.ok, true, r.reason);
    assert.equal(r.gold, Math.floor(items[bow.defId].value / 2));
    c.ws.close();
  });
});

test('pedido que falha no meio (banco caiu): o jogador sai sem gravar e volta com o que está no banco', async () => {
  await withServer(async (server, url) => {
    const A = await hero(url, 'Azarado');
    const zw = A.waitFor((m) => m.t === 'zone' && m.mapId === 'pedrambar', 5000, 'pedrâmbar');
    await A.request('gm', { cmd: 'teleport', mapId: 'pedrambar', x: 23, z: 48 });
    await zw;
    await A.request('gm', { cmd: 'gold', amount: 500 });
    const charId = A.char.id;
    const goldDb = server.store.loadCharacter(charId).gold;
    const potsDb = [...server.store.loadCharacter(charId).items.values()].filter((x) => x.defId === 'potion_hp_s').reduce((n, x) => n + x.qty, 0);
    // o banco falha no meio da compra: o ouro já foi tirado na memória quando a gravação do item lança
    const real = server.store.insertItem.bind(server.store);
    const realSave = server.store.saveItems.bind(server.store);
    server.store.insertItem = () => { throw new Error('banco fora do ar (teste)'); };
    server.store.saveItems = () => { throw new Error('banco fora do ar (teste)'); };
    const kicked = A.waitFor((m) => m.t === 'kicked', 3000, 'expulsão sem gravar');
    const r = await A.request('buy', { npc: 'potions_resina', item: 'potion_hp_s', qty: 1 });
    assert.equal(r.code, 'server_error');
    assert.match((await kicked).reason, /sem gravar/);
    await A.closed;
    server.store.insertItem = real;
    server.store.saveItems = realSave;
    // nada pela metade no banco: ouro e tônicos como antes da compra que falhou
    const after = server.store.loadCharacter(charId);
    assert.equal(after.gold, goldDb, 'o ouro tirado só na memória não foi gravado');
    assert.equal([...after.items.values()].filter((x) => x.defId === 'potion_hp_s').reduce((n, x) => n + x.qty, 0), potsDb);
    assert.ok(server.store.auditTail(5, 'request_error').length >= 1, 'a falha fica na auditoria');
    // e o jogador entra de novo normalmente
    const B = new SimClient('Azarado2');
    await B.connect(url);
    const l = await B.request('login', { account: 'aj_azarado', password: 'senha123' });
    assert.equal(l.ok, true);
    assert.equal((await B.request('enter', { charId })).ok, true);
    B.ws.close();
  });
});
