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
