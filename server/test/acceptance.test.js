// Teste de aceitação do Marco 1: servidor real + dois clientes simulados via WebSocket.
// Cobre: visibilidade de movimento, combate, XP, saque individual idempotente, recusa de
// equipamento com motivo exato, subida de nível, distribuição de pontos, validação de
// classe/atributos/espaço/empunhadura, redistribuição, reconexão e reinício do servidor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GameServer } from '../src/server.js';
import { SimClient, sleep } from './helpers/client.js';

const TIME_SCALE = 4; // 1 s real = 4 s de jogo (só acelera o teste; regras iguais)
const log = (...a) => console.log('   ·', ...a);
const d2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

async function startServer(dbPath) {
  const server = new GameServer({ port: 0, host: '127.0.0.1', dbPath, timeScale: TIME_SCALE, xpRate: 1, seed: 20261118, dev: true, log: false });
  const port = await server.start();
  return { server, url: `ws://127.0.0.1:${port}` };
}

async function joinAs(url, label, account, { create, classId, name } = {}) {
  const c = new SimClient(label);
  await c.connect(url);
  if (create) assert.equal((await c.request('register', { account, password: 'senha123' })).ok, true);
  const login = await c.request('login', { account, password: 'senha123' });
  assert.equal(login.ok, true, login.reason);
  let charId = login.chars[0]?.id;
  if (create) {
    const r = await c.request('create_char', { name, classId });
    assert.equal(r.ok, true, r.reason);
    charId = r.char.id;
  }
  const enter = await c.request('enter', { charId });
  assert.equal(enter.ok, true, enter.reason);
  c.snap = enter.snapshot;
  for (const l of enter.loot) c.loot.set(l.id, l);
  c.enter = enter;
  return c;
}

async function goTo(c, x, z, timeout = 8000) {
  const r = await c.request('move', { x, z });
  assert.equal(r.ok, true, r.reason);
  const dest = r.dest ?? { x, z }; // o servidor pode deslocar o destino para fora de um tronco
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const me = c.me();
    if (me && d2(me, dest) < 0.6) return me;
    await sleep(40);
  }
  throw new Error(`${c.label}: não chegou em ${x},${z}`);
}

const invCount = (c) => c.char.items.length;
const findItem = (c, defId, loc) => c.char.items.find((i) => i.defId === defId && (!loc || i.loc === loc));

// Ataca até matar; usa habilidade de nível 1 e tônicos quando preciso.
async function kill(c, eid, skill) {
  let done = false;
  const dead = c.waitFor((m) => m.t === 'death' && m.eid === eid, 60000, `morte de ${eid}`).then(() => { done = true; });
  assert.equal((await c.request('attack', { target: eid })).ok, true);
  let nextCast = 0;
  while (!done) {
    await sleep(60);
    const me = c.me();
    if (!me) continue;
    if (me.dead) { await c.request('respawn'); await c.request('attack', { target: eid }); continue; }
    if (me.hp / me.mhp < 0.45) {
      const pot = findItem(c, 'potion_hp_s', 'bag');
      if (pot) await c.request('use_item', { instance: pot.id });
    }
    const t = c.entity(eid);
    if (skill && t && Date.now() > nextCast && d2(me, t) < 14) {
      const r = await c.request('cast', { skill, target: eid });
      nextCast = Date.now() + (r.ok ? 300 : 150);
    }
  }
  await dead;
}

async function collectLoot(c, { onlyIds } = {}) {
  await sleep(50);
  const picked = [];
  for (const l of [...c.loot.values()]) {
    if (l.picked || (onlyIds && !onlyIds.includes(l.id))) continue;
    await goTo(c, l.x, l.z);
    const r = await c.request('pickup', { loot: l.id });
    assert.equal(r.ok, true, r.reason);
    l.picked = true; l.instanceId = r.instanceId;
    picked.push({ ...l, res: r });
  }
  return picked;
}

function nearestMonster(c, defIds, exclude = new Set()) {
  const me = c.me();
  return c.snap.ents.filter((e) => e.k === 'm' && defIds.includes(e.def) && e.st !== 'return' && !exclude.has(e.id))
    .sort((a, b) => d2(me, a) - d2(me, b))[0];
}

test('Marco 1 — dois jogadores do início ao equipamento persistido', { timeout: 300000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cinzas-'));
  const dbPath = join(dir, 'm1.db');
  let { server, url } = await startServer(dbPath);
  try {
    // 1) Entrada no mesmo mapa
    const A = await joinAs(url, 'A', 'conta_a', { create: true, classId: 'breaker', name: 'Brakka' });
    const B = await joinAs(url, 'B', 'conta_b', { create: true, classId: 'emberweaver', name: 'Ilvo' });
    assert.equal(A.char.mapId, 'estrada_velha'); assert.equal(B.char.mapId, 'estrada_velha');
    assert.equal(A.char.level, 1); assert.equal(B.char.level, 1);
    assert.equal(findItem(A, 'axe_1h_t1', 'equip').slot, 'weapon');
    assert.equal(findItem(B, 'wand_t1', 'equip').slot, 'weapon');
    assert.equal(findItem(B, 'focus_t1', 'equip').slot, 'offhand');
    await B.waitFor((m) => m.t === 'snap' && m.ents.some((e) => e.id === A.char.eid), 3000, 'A no snapshot de B');
    await A.waitFor((m) => m.t === 'snap' && m.ents.some((e) => e.id === B.char.eid), 3000, 'B no snapshot de A');
    log('A (Quebraferro "Brakka") e B (Tecelão "Ilvo") estão na Estrada Velha e veem um ao outro');

    // 2) Movimento visto pelo outro
    const moveA = A.request('move', { x: 27, z: 46 });
    assert.equal((await moveA).ok, true);
    await B.waitFor((m) => m.t === 'snap' && m.ents.some((e) => e.id === A.char.eid && d2(e, { x: 27, z: 46 }) < 0.5), 8000, 'B ver A chegar');
    await goTo(B, 27, 54);
    await A.waitFor((m) => m.t === 'snap' && m.ents.some((e) => e.id === B.char.eid && d2(e, { x: 27, z: 54 }) < 0.5), 3000, 'A ver B chegar');
    const blocked = await A.request('move', { x: 72, z: 48 });
    assert.equal(blocked.ok, false); assert.equal(blocked.reason, 'Não dá para chegar ali.');
    log('movimento de cada um apareceu no snapshot do outro; destino bloqueado recusado pelo servidor');

    // 3) Combate em dupla contra o elite (nível 4) com personagens de nível 1
    const foreman = A.snap.ents.find((e) => e.def === 'cracked_foreman');
    assert.ok(foreman, 'elite presente');
    await goTo(A, foreman.x - 6, foreman.z - 6); await goTo(B, foreman.x - 12, foreman.z - 10);
    const xpA = A.waitFor((m) => m.t === 'xp' && m.monster === 'cracked_foreman', 60000);
    const xpB = B.waitFor((m) => m.t === 'xp' && m.monster === 'cracked_foreman', 60000);
    await Promise.all([kill(A, foreman.id, 'deep_cut'), (async () => { await sleep(300); await kill(B, foreman.id, 'glass_spark'); })()]);
    const [ga, gb] = await Promise.all([xpA, xpB]);
    log(`Capataz Rachado derrotado: XP A=${ga.gained} (parte ${ga.share}), B=${gb.gained} (parte ${gb.share}); níveis ${ga.level} e ${gb.level}`);
    assert.ok(ga.gained > 0 && gb.gained > 0);
    // A parte de cada um varia com as rolagens; quem ficou no nível 1 caça ratos (14 XP cada)
    // até o nível 2 — impossível passar do 2 assim, o que mantém a recusa do passo 5 exata.
    for (const [c, g, skill] of [[A, ga, 'deep_cut'], [B, gb, 'glass_spark']]) {
      let level = g.level;
      while (level < 2) {
        const rat = nearestMonster(c, ['furrow_rat']);
        const xp = c.waitFor((m) => m.t === 'xp', 60000);
        await kill(c, rat.id, skill);
        level = (await xp).level;
        log(`${c.label} ainda no nível 1: caçou um Rato de Sulco (nível ${level})`);
      }
    }
    assert.equal((await A.request('char')).char.level, 2); assert.equal((await B.request('char')).char.level, 2);

    // 4) Saque individual: cada um vê só o seu, com IDs únicos
    await sleep(100);
    const lootA = [...A.loot.values()], lootB = [...B.loot.values()];
    const axeLoot = lootA.find((l) => l.defId === 'axe_1h_t5');
    const wandLoot = lootB.find((l) => l.defId === 'wand_t5');
    assert.ok(axeLoot, 'A recebeu Machado de Pedreira'); assert.ok(wandLoot, 'B recebeu Varinha de Vidro Fosco');
    assert.ok(!lootA.some((l) => B.loot.has(l.id)), 'saques separados');
    const stolen = await B.request('pickup', { loot: axeLoot.id });
    assert.equal(stolen.ok, false); assert.equal(stolen.reason, 'Este saque não pertence a você.');
    await goTo(A, axeLoot.x, axeLoot.z);
    const before = invCount(A);
    // mesma peça pedida duas vezes ao mesmo tempo (rids diferentes) + repetição do mesmo rid
    const [p1, p2] = await Promise.all([A.request('pickup', { loot: axeLoot.id }), A.request('pickup', { loot: axeLoot.id })]);
    const p3 = await A.request('pickup', { loot: axeLoot.id }, 'A-repetido');
    const p4 = await A.request('pickup', { loot: axeLoot.id }, 'A-repetido');
    assert.equal(p1.ok && p2.ok && p3.ok && p4.ok, true);
    assert.deepEqual([p1.alreadyClaimed, p2.alreadyClaimed, p3.alreadyClaimed], [false, true, true]);
    assert.equal(p4.duplicate, true);
    assert.equal(new Set([p1.instanceId, p2.instanceId, p3.instanceId, p4.instanceId]).size, 1);
    assert.equal(invCount(A), before + 1);
    assert.equal(A.char.items.filter((i) => i.defId === 'axe_1h_t5').length, 1);
    axeLoot.picked = true;
    const axeId = p1.instanceId;
    log(`saque idempotente: 4 pedidos do mesmo machado -> 1 instância (${axeId.slice(0, 8)}…), inventário +1`);
    const goldBefore = { A: A.char.gold, B: B.char.gold };
    const pickedA = await collectLoot(A); const pickedB = await collectLoot(B);
    assert.ok(A.char.gold > goldBefore.A && B.char.gold > goldBefore.B, 'ouro coletado');
    const wandId = pickedB.find((l) => l.defId === 'wand_t5').instanceId;
    // peças não empilháveis têm instância própria; tônicos/materiais somam ao monte existente
    const unique = (l) => l.defId && !A.defs.items[l.defId].stack;
    const allIds = [axeId, ...pickedA.filter(unique).map((l) => l.instanceId), ...pickedB.filter(unique).map((l) => l.instanceId)];
    log(`A coletou ${pickedA.length + 1} saques (ouro ${A.char.gold}); B coletou ${pickedB.length} (ouro ${B.char.gold})`);

    // 5) Tentativa de equipar cedo demais
    const early = await A.request('equip', { instance: axeId });
    assert.equal(early.ok, false); assert.equal(early.code, 'level');
    assert.equal(early.reason, 'Nível 5 exigido. Seu nível atual é 2.');
    const earlyB = await B.request('equip', { instance: wandId });
    assert.equal(earlyB.reason, 'Nível 5 exigido. Seu nível atual é 2.');
    log(`recusa: "${early.reason}"`);

    // 6) Caça até o nível 5 (taxa de XP de evento ligada pelo operador para encurtar o teste)
    server.zone.xpRate = 15;
    const hunt = async (c, skill) => {
      let kills = 0;
      while (c.char.level < 5) {
        const other = c === A ? B : A;
        const target = nearestMonster(c, ['furrow_rat', 'ember_beetle'], new Set([other.me()?.tgt].filter(Boolean)));
        if (!target) { await sleep(200); continue; }
        await kill(c, target.id, skill);
        kills++;
        await collectLoot(c);
        const ch = await c.request('char');
        c.char = ch.char;
      }
      return kills;
    };
    const [killsA, killsB] = await Promise.all([hunt(A, 'deep_cut'), hunt(B, 'glass_spark')]);
    server.zone.xpRate = 1;
    log(`nível 5 alcançado: A com ${killsA} abates, B com ${killsB} abates; pontos livres A=${A.char.unspent}, B=${B.char.unspent}`);
    assert.equal(A.char.level, 5); assert.equal(A.char.unspent, 20);
    assert.ok(A.char.skills.momentum === 1, 'Ímpeto liberado no nível 5');

    // 7) Atributos insuficientes -> recusa com valores; distribui e equipa
    const noAttr = await A.request('equip', { instance: axeId });
    assert.equal(noAttr.ok, false);
    assert.deepEqual(noAttr.reasons, ['Força 22 exigida. Sua Força atual é 17.', 'Talento 14 exigido. Seu Talento atual é 11.']);
    log(`recusa: "${noAttr.reasons.join(' ')}"`);
    const overspend = await A.request('allocate', { points: { str: 30 } });
    assert.equal(overspend.reason, 'Pontos insuficientes: 30 pedidos, 20 disponíveis.');
    const alloc = await A.request('allocate', { points: { str: 5, tal: 3 } });
    assert.equal(alloc.ok, true); assert.equal(alloc.char.permanent.str, 22); assert.equal(alloc.char.unspent, 12);
    const ok = await A.request('equip', { instance: axeId });
    assert.equal(ok.ok, true, ok.reason); assert.equal(ok.slot, 'weapon');
    assert.equal(findItem(A, 'axe_1h_t1').loc, 'bag');
    log('A distribuiu Força +5 e Talento +3 e equipou o Machado de Pedreira');

    // classe, espaço e empunhadura
    const gmWand = await A.request('gm', { cmd: 'give', defId: 'wand_t1' });
    const cls = await A.request('equip', { instance: gmWand.instanceId });
    assert.equal(cls.reason, 'Classe exigida: Cantora do Véu ou Tecelão da Brasa. Sua classe é Quebraferro.');
    const pot = findItem(A, 'potion_hp_s', 'bag');
    assert.equal((await A.request('equip', { instance: pot.id })).reason, 'Este item não pode ser equipado.');
    const twoH = await A.request('equip', { instance: findItem(A, 'axe_2h_t1').id });
    assert.equal(twoH.ok, true); assert.equal(findItem(A, 'axe_1h_t5').loc, 'bag');
    assert.equal((await A.request('equip', { instance: axeId })).ok, true);
    log(`recusa de classe: "${cls.reason}"`);

    const noSpi = await B.request('equip', { instance: wandId });
    assert.equal(noSpi.reason, 'Espírito 25 exigido. Seu Espírito atual é 20.');
    assert.equal((await B.request('allocate', { points: { spi: 5, tal: 2 } })).ok, true);
    assert.equal((await B.request('equip', { instance: wandId })).ok, true);
    const staff = await B.request('equip', { instance: findItem(B, 'staff_2h_t1').id });
    assert.equal(staff.ok, true); assert.equal(staff.displaced.length, 2);
    const focus = findItem(B, 'focus_t1');
    assert.equal(focus.loc, 'bag');
    const blockedFocus = await B.request('equip', { instance: focus.id });
    assert.equal(blockedFocus.reason, 'A arma de duas mãos ocupa a mão secundária. Desequipe-a antes de usar este item.');
    assert.equal((await B.request('equip', { instance: wandId })).ok, true);
    assert.equal((await B.request('equip', { instance: focus.id })).ok, true);
    log(`B: "${noSpi.reason}" -> distribuiu e equipou; cajado de 2 mãos liberou a mão secundária; foco recusado com o cajado`);

    // redistribuição que invalida equipamento
    const reset = await A.request('reset_attrs');
    assert.equal(reset.ok, true);
    assert.ok(reset.moved.some((m) => m.id === axeId && m.loc === 'bag'));
    assert.equal((await A.request('allocate', { points: { str: 5, tal: 3, vit: 12 } })).ok, true);
    assert.equal((await A.request('equip', { instance: axeId })).ok, true);
    log('redistribuição devolveu o machado à bolsa; após redistribuir de novo, reequipado');

    // 8) Queda de conexão e reconexão (sessão antiga ainda aberta: servidor a derruba)
    const kicked = A.waitFor((m) => m.t === 'kicked', 5000);
    const left = B.waitFor((m) => m.t === 'left' && m.eid === A.char.eid, 5000);
    const A2 = await joinAs(url, 'A2', 'conta_a');
    await kicked; await left;
    assert.equal(A2.char.level, 5);
    const eq = A2.char.items.find((i) => i.id === axeId);
    assert.equal(eq.loc, 'equip'); assert.equal(eq.slot, 'weapon');
    assert.deepEqual(A2.char.alloc, { str: 5, tal: 3, vit: 12 });
    const again = await A2.request('pickup', { loot: axeLoot.id });
    assert.equal(again.ok, true); assert.equal(again.alreadyClaimed, true); assert.equal(again.instanceId, axeId);
    assert.equal(A2.char.items.filter((i) => i.defId === 'axe_1h_t5').length, 1);
    assert.equal(new Set(allIds).size, allIds.length, 'IDs de instância únicos');
    assert.ok(allIds.length >= 2, 'ao menos machado e varinha');
    log('reconexão: sessão antiga derrubada, machado continua equipado, saque antigo não duplica');

    // 9) Reinício completo do servidor com o mesmo banco
    await A2.close(); await B.close();
    await server.stop();
    ({ server, url } = await startServer(dbPath));
    const A3 = await joinAs(url, 'A3', 'conta_a');
    const B3 = await joinAs(url, 'B3', 'conta_b');
    assert.equal(A3.char.items.find((i) => i.id === axeId).slot, 'weapon');
    assert.equal(B3.char.items.find((i) => i.id === wandId).slot, 'weapon');
    assert.equal(B3.char.items.find((i) => i.id === focus.id).slot, 'offhand');
    assert.equal(A3.char.level, 5); assert.equal(A3.char.stats.weapon, 'axe_1h_t5');
    log(`após reiniciar o servidor: A nv${A3.char.level} com ${A3.char.stats.weapon}, B nv${B3.char.level} com ${B3.char.stats.weapon} + foco`);
    await A3.close(); await B3.close();
  } finally {
    await server.stop().catch(() => {});
    rmSync(dir, { recursive: true, force: true });
  }
});
