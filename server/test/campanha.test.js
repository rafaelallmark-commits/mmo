// Campanha pelo protocolo: toda missão, principal ou secundária, é aceita no NPC, cumprida e entregue pelo mesmo
// protocolo do cliente. Os comandos de mestre do --dev só levam o personagem ao nível e às missões anteriores e o
// põem ao lado do alvo; o abate é o da zona (crédito, saque e missão pelo caminho de sempre). As missões com
// objetivos que pedem um roteiro próprio (tutorial, escolta, defesa e prova de classe) têm teste dedicado, e isso é
// conferido aqui; "A Última Eclusa" entra pela porta com um grupo de verdade.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GameServer } from '../src/server.js';
import { loadGameData } from '../src/data.js';
import { permanentAttrs } from '../src/rules.js';
import { SimClient } from './helpers/client.js';

const data = loadGameData();
const log = (...a) => console.log('   ·', ...a);
const HERE = dirname(fileURLToPath(import.meta.url));

// objetivos que precisam de um roteiro próprio, e o teste que faz cada um
const SPECIAL = { rescue: 'tutorial', skill: 'tutorial', pickup: 'tutorial', bell: 'tutorial', arrive: 'tutorial', escort: 'escolta', defend: 'defesa', trial: 'prova de classe' };
const CLASSES = Object.keys(data.classes);

async function withServer(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'cinzas-camp-'));
  const server = new GameServer({ port: 0, host: '127.0.0.1', dbPath: join(dir, 'camp.db'), timeScale: 4, seed: 4242, dev: true, log: false, rateLimit: 5000, rateBurst: 5000 });
  const port = await server.start();
  try { await fn(server, `ws://127.0.0.1:${port}`); } finally { await server.stop().catch(() => {}); rmSync(dir, { recursive: true, force: true }); }
}

// todas as missões anteriores (pré-requisitos dos pré-requisitos)
function prereqsOf(id, out = new Set()) {
  for (const pr of data.quests[id].prereq ?? []) if (!out.has(pr)) { out.add(pr); prereqsOf(pr, out); }
  return out;
}

// onde fica cada NPC (mapas abertos, não as instâncias)
const npcAt = new Map();
for (const [mapId, m] of Object.entries(data.maps)) {
  if (m.instanced) continue;
  for (const n of m.npcs ?? []) if (!npcAt.has(n.id)) npcAt.set(n.id, { ...n, mapId });
}
const objAt = new Map();
for (const [mapId, m] of Object.entries(data.maps)) {
  if (m.instanced) continue;
  for (const o of m.objects ?? []) if (!objAt.has(o.id)) objAt.set(o.id, { ...o, mapId });
}
const monsterMap = (defId) => Object.entries(data.maps).find(([, m]) => !m.instanced && (m.spawns ?? []).some((s) => s.monster === defId))?.[0];

// NPC de uma referência de missão: id, lista (qualquer um) ou '@master' (o mestre da classe)
function npcFor(ref, classId) {
  const ids = [].concat(ref);
  if (ids.includes('@master')) return [...npcAt.values()].find((n) => n.role === 'master' && n.classId === classId);
  const masters = ids.map((id) => npcAt.get(id)).filter((n) => n?.role === 'master');
  return masters.find((n) => n.classId === classId) ?? npcAt.get(ids[0]);
}

class Hero {
  constructor(server, c, charId) { this.server = server; this.c = c; this.charId = charId; }
  get p() { return this.server.playerOf(this.charId); }

  async go(mapId, x, z) {
    if (this.p.zone.mapId !== mapId) {
      const w = this.c.waitFor((m) => m.t === 'zone' && m.mapId === mapId, 8000, `entrar em ${mapId}`);
      const r = await this.c.request('gm', { cmd: 'teleport', mapId, x, z });
      assert.equal(r.ok, true, `${this.c.label}: ir a ${mapId}: ${r.reason}`);
      await w;
    } else {
      const r = await this.c.request('gm', { cmd: 'teleport', x, z });
      assert.equal(r.ok, true, `${this.c.label}: ir a ${x},${z}: ${r.reason}`);
    }
  }

  // vida cheia e de pé: o teste confere as missões, não o combate
  fresh() {
    const p = this.p;
    if (p.char.dead) { p.char.dead = false; }
    p.char.hp = p.stats.maxHp;
  }

  async toNpc(n) {
    this.fresh();
    await this.go(n.mapId, n.x + 1.5, n.z);
  }

  // derruba na hora o monstro vivo mais perto daquela espécie, com o personagem ao lado dele (crédito e saque)
  async kill(defId) {
    // o mapa onde o personagem está, se a espécie vive nele; senão, o primeiro mapa aberto com ela
    const here = !data.maps[this.p.zone.mapId].instanced && [...this.p.zone.monsters.values()].some((m) => m.defId === defId);
    const mapId = here ? this.p.zone.mapId : monsterMap(defId);
    assert.ok(mapId, `${defId}: nenhum mapa aberto com esse monstro`);
    if (this.p.zone.mapId !== mapId) await this.go(mapId, data.maps[mapId].spawnPoint.x, data.maps[mapId].spawnPoint.z);
    const z = this.p.zone;
    let live = [...z.monsters.values()].filter((m) => m.defId === defId && m.state !== 'dead');
    if (!live.length) {
      for (const m of z.monsters.values()) if (m.defId === defId && m.state === 'dead' && m.removeAt == null) z.placeMonster(m);
      live = [...z.monsters.values()].filter((m) => m.defId === defId && m.state !== 'dead');
    }
    assert.ok(live.length, `nenhum ${defId} vivo em ${z.mapId}`);
    const me = this.p.char;
    const m = live.sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0];
    this.fresh();
    await this.go(z.mapId, Math.min(data.maps[z.mapId].size[0], m.x + 1), m.z);
    z.damageMonster(m, this.charId, m.hp + 1e6);
    assert.equal(m.state, 'dead', `${defId} caiu`);
    await this.c.request('ping'); // o saque e o diário do abate chegam antes desta resposta
    return m;
  }

  async pickAll(defId) {
    let n = 0;
    for (const l of [...this.c.loot.values()]) {
      if (l.picked || (defId && l.defId !== defId)) continue;
      const r = await this.c.request('pickup', { loot: l.id });
      l.picked = true;
      if (r.ok) n++;
    }
    return n;
  }

  bagQty(defId) { return [...this.p.char.items.values()].filter((i) => i.loc === 'bag' && i.defId === defId).reduce((s, i) => s + i.qty, 0); }

  async quest(id) {
    const j = (await this.c.request('quests')).journal;
    return j.active.find((q) => q.id === id) ?? null;
  }

  // monstros que atacariam por perto (a canalização quebra quando o personagem é atingido)
  clearAround(x, z, r = 22) {
    const zone = this.p.zone;
    for (const m of zone.monsters.values()) {
      if (m.state === 'dead' || Math.hypot(m.x - x, m.z - z) > r) continue;
      zone.damageMonster(m, this.charId, m.hp + 1e6);
    }
  }

  async interact(objId) {
    const o = objAt.get(objId);
    assert.ok(o, `objeto ${objId} em algum mapa aberto`);
    for (let attempt = 0; attempt < 4; attempt++) {
      this.fresh();
      await this.go(o.mapId, o.x + 1, o.z);
      this.clearAround(o.x, o.z);
      const done = this.c.waitFor((m) => m.t === 'channel_end' && m.object === objId, 30000, `canalização em ${objId}`);
      const r = await this.c.request('interact', { object: objId });
      if (!r.ok) { done.catch(() => {}); return r; }
      if (!r.channel) { done.catch(() => {}); return r; }
      const end = await done;
      if (end.ok) return { ok: true };
    }
    return { ok: false, reason: `canalização em ${objId} interrompida 4 vezes` };
  }
}

async function newHero(server, url, i, classId) {
  const label = `camp${i}`;
  const c = new SimClient(label);
  await c.connect(url);
  await c.request('register', { account: `acc_${label}`, password: 'senha123' });
  await c.request('login', { account: `acc_${label}`, password: 'senha123' });
  const r = await c.request('create_char', { name: `Campanha${i}`, classId });
  assert.equal(r.ok, true, r.reason);
  const e = await c.request('enter', { charId: r.char.id });
  assert.equal(e.ok, true, e.reason);
  c.snap = e.snapshot; c.char = e.char;
  return new Hero(server, c, r.char.id);
}

// cumpre um objetivo como um jogador
async function fulfil(h, qid, i, o) {
  const label = `${qid}#${i} (${o.type})`;
  const isDone = async () => (await h.quest(qid))?.objectives[i]?.done;
  switch (o.type) {
    case 'talk': {
      const n = npcFor(o.npc, h.p.char.classId);
      assert.ok(n, `${label}: NPC ${o.npc}`);
      await h.toNpc(n);
      const r = await h.c.request('talk', { npc: n.id });
      assert.equal(r.ok, true, `${label}: falar com ${n.id}: ${r.reason}`);
      break;
    }
    case 'kill':
    case 'questDrop': {
      for (let k = 0; k < (o.count ?? 1) * 12 && !(await isDone()); k++) await h.kill(o.monster);
      break;
    }
    case 'collect': {
      if (o.drop) {
        for (let k = 0; k < o.count * 12 && h.bagQty(o.item) < o.count; k++) {
          await h.kill(o.drop.monster);
          await h.pickAll(o.item);
        }
      } else {
        // material do saque comum: aqui vem do comando de mestre (a fonte no jogo é conferida pelo validate-data)
        while (h.bagQty(o.item) < o.count) {
          const r = await h.c.request('gm', { cmd: 'give', defId: o.item, qty: o.count - h.bagQty(o.item) });
          assert.equal(r.ok, true, `${label}: ${r.reason}`);
        }
      }
      break;
    }
    case 'interact': {
      for (const objId of o.objects) {
        const st = await h.quest(qid);
        const prog = st?.objectives[i];
        if (prog?.done) break;
        const r = await h.interact(objId);
        assert.equal(r.ok, true, `${label}: ${objId}: ${r.reason}`);
      }
      break;
    }
    case 'level': {
      if (h.p.char.level < o.level) assert.equal((await h.c.request('gm', { cmd: 'xp', level: o.level })).ok, true);
      break;
    }
    case 'allocated': {
      const free = h.p.char.unspent;
      if (free > 0) {
        const r = await h.c.request('allocate', { points: { vit: free } });
        assert.equal(r.ok, true, `${label}: ${r.reason}`);
      }
      break;
    }
    case 'enterMap': {
      const md = data.maps[o.map];
      await h.go(o.map, md.spawnPoint.x, md.spawnPoint.z);
      break;
    }
    case 'choice': {
      const n = npcFor(o.npc, h.p.char.classId);
      await h.toNpc(n);
      await h.c.request('talk', { npc: n.id });
      const r = await h.c.request('quest_choice', { quest: qid, option: o.options[0].id, npc: n.id });
      assert.equal(r.ok, true, `${label}: ${r.reason}`);
      break;
    }
    case 'equipLevel': {
      // uma arma da classe no nível pedido, com os pontos livres onde a arma pede
      const c = h.p.char;
      const w = Object.values(data.items).filter((d) => d.slot === 'weapon' && d.level >= o.minLevel && d.level <= c.level && (!d.classes || d.classes.includes(c.classId)))
        .sort((a, b) => Object.values(a.req ?? {}).reduce((s, v) => s + v, 0) - Object.values(b.req ?? {}).reduce((s, v) => s + v, 0))[0];
      assert.ok(w, `${label}: arma de nível ${o.minLevel} para ${c.classId}`);
      const g = await h.c.request('gm', { cmd: 'give', defId: w.id });
      assert.equal(g.ok, true, g.reason);
      const perm = permanentAttrs(c, data);
      const need = {};
      for (const [k, v] of Object.entries(w.req ?? {})) if (v > perm[k]) need[k] = v - perm[k];
      if (Object.keys(need).length) assert.equal((await h.c.request('allocate', { points: need })).ok, true, `${label}: pontos para ${w.id}`);
      const r = await h.c.request('equip', { instance: g.instanceId });
      assert.equal(r.ok, true, `${label}: equipar ${w.id}: ${r.reason}`);
      break;
    }
    default:
      assert.fail(`${label}: objetivo sem roteiro neste teste`);
  }
  assert.ok(await isDone(), `${label}: objetivo cumprido`);
}

test('toda missão sem roteiro próprio é aceita, cumprida e entregue pelo protocolo; as outras têm teste dedicado', { timeout: 600000 }, async () => {
  const ids = Object.keys(data.quests).sort((a, b) => (data.quests[a].chapter - data.quests[b].chapter) || (data.quests[a].level - data.quests[b].level));
  const special = ids.filter((id) => id === 'c5_eclusa' || data.quests[id].objectives.some((o) => SPECIAL[o.type]));
  // as de roteiro próprio aparecem pelo id em outro teste (além deste arquivo)
  const others = readdirSync(HERE).filter((f) => f.endsWith('.test.js') && f !== 'campanha.test.js').map((f) => readFileSync(join(HERE, f), 'utf8'));
  for (const id of special) {
    if (id === 'c5_eclusa') continue; // logo abaixo, com a porta do calabouço
    assert.ok(others.some((src) => src.includes(`'${id}'`) || src.includes(`"${id}"`)), `${id} (${data.quests[id].objectives.map((o) => o.type).join(', ')}) sem teste dedicado`);
  }
  await withServer(async (server, url) => {
    let n = 0;
    const byType = {};
    for (const id of ids) {
      if (special.includes(id)) continue;
      const q = data.quests[id];
      const h = await newHero(server, url, ++n, CLASSES[n % CLASSES.length]);
      if (q.level > 1) assert.equal((await h.c.request('gm', { cmd: 'xp', level: q.level })).ok, true);
      const pre = [...prereqsOf(id)];
      if (pre.length) assert.equal((await h.c.request('gm', { cmd: 'quest_done', quests: pre })).ok, true);
      // aceitar no NPC
      const giver = npcFor(q.npc, h.p.char.classId);
      assert.ok(giver, `${id}: NPC ${q.npc}`);
      await h.toNpc(giver);
      const talk = await h.c.request('talk', { npc: giver.id });
      assert.ok(talk.quests.offer.some((x) => x.id === id), `${id}: ${giver.id} oferece "${q.title}"`);
      const acc = await h.c.request('quest_accept', { quest: id, npc: giver.id });
      assert.equal(acc.ok, true, `${id}: aceitar: ${acc.reason}`);
      // objetivos
      for (const [i, o] of q.objectives.entries()) {
        await fulfil(h, id, i, o);
        byType[o.type] = (byType[o.type] ?? 0) + 1;
      }
      const ready = await h.quest(id);
      assert.equal(ready.ready, true, `${id}: pronta para entregar`);
      // entregar
      const taker = npcFor(q.turnIn, h.p.char.classId);
      await h.toNpc(taker);
      const xp0 = h.p.char.xp;
      const done = await h.c.request('quest_turnin', { quest: id, npc: taker.id });
      assert.equal(done.ok, true, `${id}: entregar a ${taker.id}: ${done.reason}`);
      assert.ok(done.journal.done.some((x) => x.id === id), `${id}: concluída no diário`);
      if (q.rewards?.xp && h.p.char.level < data.levelCap) assert.ok(h.p.char.xp > xp0, `${id}: XP da recompensa`);
      for (const [it, qty] of q.rewards?.items ?? []) assert.ok(h.bagQty(it) >= qty || [...h.p.char.items.values()].some((x) => x.defId === it), `${id}: recompensa ${it}`);
      // item de missão sai da bolsa na entrega
      for (const o of q.objectives) if (o.type === 'collect' && data.items[o.item]?.questItem) assert.equal(h.bagQty(o.item), 0, `${id}: ${o.item} saiu da bolsa`);
      await h.c.close();
    }
    log(`${n} missões feitas pelo protocolo (objetivos: ${Object.entries(byType).map(([k, v]) => `${k} ${v}`).join(', ')}); ${special.length} com teste dedicado: ${special.join(', ')}`);
  });
});

test('A Última Eclusa (5.3): aceita com Ilda, o grupo entra pela porta, o Custódio cai e a missão é entregue', { timeout: 120000 }, async () => {
  await withServer(async (server, url) => {
    const a = await newHero(server, url, 901, 'warden');
    const b = await newHero(server, url, 902, 'dawnshield');
    for (const h of [a, b]) {
      assert.equal((await h.c.request('gm', { cmd: 'xp', level: 18 })).ok, true);
      assert.equal((await h.c.request('gm', { cmd: 'quest_done', quests: [...prereqsOf('c5_eclusa')] })).ok, true);
    }
    const ilda = npcFor('ilda', 'warden');
    await a.toNpc(ilda);
    assert.equal((await a.c.request('quest_accept', { quest: 'c5_eclusa', npc: ilda.id })).ok, true);
    // grupo e porta
    const inv = b.c.waitFor((m) => m.t === 'party_invite', 5000, 'convite');
    assert.equal((await a.c.request('party_invite', { name: b.p.char.name })).ok, true);
    assert.equal((await b.c.request('party_accept', { from: (await inv).fromId })).ok, true);
    const gate = objAt.get('eclusa_gate');
    for (const [k, h] of [a, b].entries()) await h.go(gate.mapId, gate.x - 1 + k, gate.z);
    const entered = [a, b].map((h) => h.c.waitFor((m) => m.t === 'zone' && m.mapId === 'ultima_eclusa', 8000, 'calabouço'));
    const r = await a.c.request('interact', { object: 'eclusa_gate' });
    assert.equal(r.ok, true, r.reason);
    await Promise.all(entered);
    // o encontro inteiro é do m3.test.js (três grupos de bots); aqui, o golpe final com os dois participando
    const zone = a.p.zone;
    assert.equal(zone.mapId, 'ultima_eclusa');
    const boss = [...zone.monsters.values()].find((m) => m.defId === 'lock_custodian');
    assert.ok(boss, 'o Custódio está na instância');
    boss.state = 'chase';
    for (const h of [a, b]) boss.score.set(h.charId, boss.def.hp * 0.3);
    boss.hp = 1;
    zone.damageMonster(boss, a.charId, 5);
    assert.equal(boss.state, 'dead');
    await a.c.request('ping');
    const q = await a.quest('c5_eclusa');
    assert.equal(q.ready, true, 'o Custódio conta para a missão');
    // volta para os Canais e entrega a Ilda
    await a.toNpc(ilda);
    const done = await a.c.request('quest_turnin', { quest: 'c5_eclusa', npc: ilda.id });
    assert.equal(done.ok, true, done.reason);
    log('A Última Eclusa: grupo de 2 pela porta, Custódio derrotado na instância, missão entregue a Ilda');
    for (const h of [a, b]) await h.c.close();
  });
});
