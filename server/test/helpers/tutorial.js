// Roteiro do tutorial «Três do Outro Lado» para clientes simulados (tutorial.test.js e m2.test.js): os sete
// passos guiados na ordem do documento, com Bento, Ligia e Caio escoltados até o círculo do Posto da Ponte.
import assert from 'node:assert/strict';
import { sleep } from './client.js';

export const d2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const POST = { x: 20, z: 50 };

export async function waitUntil(fn, timeout, what) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const v = fn();
    if (v) return v;
    await sleep(40);
  }
  throw new Error(`tempo esgotado esperando ${what}`);
}

export async function goTo(c, x, z, timeout = 20000) {
  const r = await c.request('move', { x, z });
  assert.equal(r.ok, true, `${c.label}: andar até ${x},${z}: ${r.reason}`);
  const dest = r.dest ?? { x, z }; // o servidor pode deslocar o destino para fora de um tronco
  await waitUntil(() => { const me = c.me(); return me && d2(me, dest) < 0.8 ? me : null; }, timeout, `${c.label} chegar em ${x},${z}`);
  return c.me();
}

// resgatados do tutorial que o cliente vê (entidades "e" com gente: man, woman, boy)
export const followers = (c) => (c.snap?.ents ?? []).filter((e) => e.k === 'e' && ['man', 'woman', 'boy'].includes(e.def));
export const follower = (c, name) => followers(c).find((e) => e.n.startsWith(name));

export async function tutorialQuest(c) {
  const j = (await c.request('quests')).journal;
  return j.active.find((q) => q.id === 'tutorial') ?? null;
}

// Espera o objetivo i do tutorial ficar feito (confere na hora e depois pelos quest_update).
export async function waitObjective(c, i, timeout = 30000) {
  const ev = c.waitFor((m) => m.t === 'quest_update' && m.quests.some((q) => q.id === 'tutorial' && q.objectives[i]?.done), timeout, `objetivo ${i} do tutorial`);
  const q = await tutorialQuest(c);
  if (q?.objectives[i].done) { ev.catch(() => {}); return q; }
  await ev;
  return tutorialQuest(c);
}

const findItem = (c, defId) => c.char?.items.find((i) => i.defId === defId && i.loc === 'bag');

export async function kill(c, eid, skill) {
  let done = false;
  const dead = c.waitFor((m) => m.t === 'death' && m.eid === eid, 60000, `morte de ${eid}`).then(() => { done = true; });
  const a = await c.request('attack', { target: eid });
  if (!a.ok) { dead.catch(() => {}); await sleep(150); return false; }
  let nextCast = 0;
  while (!done) {
    await sleep(60);
    const me = c.me();
    if (!me) continue;
    if (me.dead) { await c.request('respawn'); await c.request('attack', { target: eid }); continue; }
    if (me.hp / me.mhp < 0.45) { const pot = findItem(c, 'potion_hp_s'); if (pot) await c.request('use_item', { instance: pot.id }); }
    if (skill && Date.now() > nextCast) { const r = await c.request('cast', { skill, target: eid }); nextCast = Date.now() + (r.ok ? 300 : 150); }
  }
  await dead;
  return true;
}

const nearest = (c, pred, from = c.me()) => (c.snap?.ents ?? []).filter((e) => e.k === 'm' && pred(e)).sort((a, b) => d2(a, from) - d2(b, from))[0] ?? null;

// Sai da faixa do segundo toque: anda 4 m para o lado (a faixa tem 4 m de largura e o jogador está no meio).
export async function dodge(c, w) {
  const me = c.me();
  const px = Math.cos(w.yaw), pz = -Math.sin(w.yaw); // perpendicular à direção (sin yaw, cos yaw)
  for (const k of [4, -4, 5.5, -5.5]) {
    const r = await c.request('move', { x: me.x + px * k, z: me.z + pz * k });
    if (r.ok) return r;
  }
  throw new Error('não deu para sair da faixa');
}

// Faz o tutorial inteiro a partir do Posto da Ponte. skill: habilidade da tecla 1 da classe (com alvo se
// target for true). failBell: fica parado na primeira faixa (apanha) antes de sair dela na segunda.
export async function playTutorial(c, { skill, skillNeedsTarget = true, failBell = false, log = () => {} }) {
  await goTo(c, 25, 48);
  const t = await c.request('talk', { npc: 'mara' });
  assert.ok(t.quests.offer.some((q) => q.id === 'tutorial'), 'Mara oferece o tutorial');
  const acc = await c.request('quest_accept', { quest: 'tutorial', npc: 'mara' });
  assert.equal(acc.ok, true, acc.reason);
  assert.equal(acc.quest.objectives.length, 8);
  assert.ok(acc.quest.objectives.slice(0, 7).every((o, i) => o.step === i + 1 && o.hint), 'sete passos guiados com dica');
  await waitUntil(() => followers(c).length === 3, 5000, 'Bento, Ligia e Caio');
  const trapped = followers(c).map((f) => f.n).sort();
  assert.deepEqual(trapped, ['Bento (preso no entulho)', 'Caio (cercado)', 'Ligia (ferida)']);
  log('missão aceita com Mara: Bento, Ligia e Caio esperam (só o dono os vê)');

  // 1) andar até Bento
  const bento = follower(c, 'Bento');
  const saidBento = c.waitFor((m) => m.t === 'say' && m.name === 'Bento', 20000, 'fala de Bento');
  await goTo(c, bento.x - 2.5, bento.z + 1);
  log(`Bento: "${(await saidBento).text}"`);
  await waitObjective(c, 0);
  await waitUntil(() => follower(c, 'Bento')?.st === 'follow', 5000, 'Bento seguindo');

  // 2) atacar um Rato de Sulco (ataque básico) — o primeiro abate garante um saque
  for (let guard = 0; !(await tutorialQuest(c)).objectives[1].done && guard < 6; guard++) {
    const rat = nearest(c, (e) => e.def === 'furrow_rat');
    assert.ok(rat, 'há ratos no Campo do Sulco');
    await kill(c, rat.id, null);
    await sleep(100);
  }
  await waitObjective(c, 1);
  await waitUntil(() => c.loot.size > 0, 5000, 'saque do rato');
  log(`rato derrotado com o ataque básico; saque no chão: ${[...c.loot.values()].map((l) => l.defId ?? `${l.gold} ouro`).join(', ')}`);

  // 3) habilidade da tecla 1
  for (let guard = 0; !(await tutorialQuest(c)).objectives[2].done && guard < 20; guard++) {
    if (skillNeedsTarget) {
      const rat = nearest(c, (e) => e.def === 'furrow_rat');
      if (rat && d2(rat, c.me()) > 12) await goTo(c, rat.x - 3, rat.z);
      const r = rat ? await c.request('cast', { skill, target: rat.id }) : { ok: false };
      if (!r.ok) await sleep(300);
      else if (rat) await kill(c, rat.id, skill);
    } else {
      const r = await c.request('cast', { skill });
      if (!r.ok) await sleep(300);
    }
  }
  await waitObjective(c, 2);
  log(`habilidade da tecla 1 (${skill}) usada`);

  // 4) Ligia ferida: tônico perto dela
  const ligia = follower(c, 'Ligia');
  assert.ok(ligia.hp < ligia.mhp, 'Ligia espera ferida');
  const saidLigia = c.waitFor((m) => m.t === 'say' && m.name === 'Ligia', 20000, 'fala de Ligia');
  await goTo(c, ligia.x + 2, ligia.z - 1);
  log(`Ligia: "${(await saidLigia).text}"`);
  c.char = (await c.request('char')).char;
  const pot = findItem(c, 'potion_hp_s');
  assert.ok(pot, 'tônico na bolsa');
  await sleep(800); // a recarga compartilhada dos tônicos (3 s de jogo) pode estar correndo da luta
  let used = await c.request('use_item', { instance: pot.id });
  for (let i = 0; !used.ok && used.code === 'cooldown' && i < 10; i++) { await sleep(300); used = await c.request('use_item', { instance: pot.id }); }
  assert.equal(used.ok, true, used.reason);
  await waitObjective(c, 3);
  await waitUntil(() => { const l = follower(c, 'Ligia'); return l && l.st === 'follow' && l.hp === l.mhp; }, 5000, 'Ligia curada e seguindo');
  log('tônico dividido com Ligia: ela levanta e segue');

  // 5) coletar o saque
  for (const l of [...c.loot.values()]) {
    await goTo(c, l.x, l.z);
    const r = await c.request('pickup', { loot: l.id });
    assert.equal(r.ok, true, r.reason);
    c.loot.delete(l.id);
    if ((await tutorialQuest(c)).objectives[4].done) break;
  }
  await waitObjective(c, 4);
  log('saque coletado');

  // 6) Caio cercado: dois bichos aparecem e batem nele até alguém chamar a atenção
  const caio = follower(c, 'Caio');
  const before = new Set((c.snap?.ents ?? []).filter((e) => e.k === 'm').map((e) => e.id));
  const saidCaio = c.waitFor((m) => m.t === 'say' && m.name === 'Caio', 20000, 'fala de Caio');
  await goTo(c, caio.x - 5, caio.z + 2);
  log(`Caio: "${(await saidCaio).text}"`);
  const guards = await waitUntil(() => {
    const g = (c.snap?.ents ?? []).filter((e) => e.k === 'm' && !before.has(e.id) && d2(e, caio) < 6);
    return g.length >= 2 ? g : null;
  }, 5000, 'os dois bichos de Caio');
  assert.deepEqual(guards.map((g) => g.def).sort(), ['ember_beetle', 'furrow_rat']);
  for (const g of guards) await kill(c, g.id, skillNeedsTarget ? skill : null);
  await waitObjective(c, 5);
  await waitUntil(() => follower(c, 'Caio')?.st === 'follow', 5000, 'Caio seguindo');
  log('os dois bichos caíram: Caio solto');

  // 7) segundo toque: faixa embaixo do jogador na volta ao posto
  let bellHits = 0;
  const warn1 = c.waitFor((m) => m.t === 'warn' && m.kind === 'bell2', 40000, 'segundo toque');
  await c.request('move', { x: 30, z: 50 });
  let w = await warn1;
  assert.equal(w.shape, 'line');
  if (failBell) {
    await c.request('stop');
    const hit = await c.waitFor((m) => m.t === 'hit' && m.skill === 'bell' && m.dst === c.char.eid, 15000, 'faixa estourando');
    bellHits++;
    await sleep(150);
    const me = c.me();
    assert.ok(me.hp >= 1 && !me.dead, 'a faixa não derruba');
    log(`ficou na faixa: ${hit.dmg} de dano (vida ${me.hp}/${me.mhp}); o sino toca de novo`);
    w = await c.waitFor((m) => m.t === 'warn' && m.kind === 'bell2', 20000, 'segundo toque, de novo');
  }
  await dodge(c, w);
  await waitObjective(c, 6);
  log('saiu da faixa a tempo no segundo toque');

  // 8) os três dentro do círculo do posto (o servidor confere a posição deles)
  await goTo(c, 22, 50);
  const q = await waitObjective(c, 7);
  assert.equal(q.ready, true);
  await waitUntil(() => followers(c).every((f) => f.st === 'rest'), 8000, 'os três descansando no posto');
  log('Bento, Ligia e Caio no círculo do Posto da Ponte: missão pronta para entregar');
  return { bellHits };
}
