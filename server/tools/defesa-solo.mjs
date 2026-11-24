// Defesa do Joca (missão 2.2, "O Teste de Pressão") jogada por alguém sozinho, sem atalho dentro da defesa:
// um GameServer em processo (banco em memória, modo dev, sem rede) avançado em passos de 100 ms de jogo, como o
// servidor de verdade, e o bot da revisão que achou a defesa difícil demais para quem chega sozinho (D185):
// ataca o monstro da onda mais perto do Joca, usa as duas primeiras habilidades da classe quando dá e bebe um
// Tônico de Vida abaixo de 40% da vida. Antes da defesa, o personagem sobe ao nível pedido por comando de
// mestre, gasta os pontos no que a arma comum de faixa 5 da família do kit pede (o resto vai no atributo
// principal) e fica com exatamente N tônicos na bolsa; como no script da revisão, os pontos de habilidade ficam
// sem gastar (as habilidades no grau 1). Ferramenta de MEDIÇÃO: não muda regra nem dado.
//
// Uso (na pasta server):
//   npm run defesa-solo -- [--classes a,b] [--nivel 6] [--tonicos 3] [--equip kit|arma|5] [--sementes 20]
//     [--semente-inicial 1] [--reacao-ms 480] [--passo-ms 100] [--janela-s 0] [--ajuste '{"hp":900}']
//     [--revida] [--habilidades 2] [--graus] [--grupo a,b] [--json arquivo] [--detalhe]
//
// --equip kit: só o equipamento inicial da classe; arma: o inicial com a arma comum de faixa 5 da família do kit (a
//   que o Capataz da 1.5, pré-requisito da 2.1, dá a cada um, menos ao Bastião: o Capataz lhe dá a Garra de Manivela,
//   e aqui ele leva o Martelo de Ferreiro da Ponte, da família do martelo do kit; D187); 5: as peças comuns de faixa 5
//   da classe (o armeiro vende a partir do nível 5), as mesmas do GEAR=5 do script da revisão.
// --reacao-ms: intervalo entre as decisões do bot, em tempo de jogo (480 ms = os 120 ms do script da revisão
//   com o servidor a 4x).
// --janela-s 0 (padrão): só a primeira tentativa (Joca caído ou o jogador caído é derrota). Com N > 0, como o
//   script da revisão: segue até N s de jogo, e a vitória numa tentativa seguinte (Joca tenta de novo em 30 s)
//   também conta.
// --revida: o bot também ataca primeiro um monstro do mapa (fora das ondas) que venha atrás dele, como qualquer
//   jogador faria; sem isso (o script da revisão) ele só bate nos monstros da onda.
// --habilidades N: quantas das primeiras habilidades da classe o bot usa (2 = o script da revisão); --graus: antes
//   da defesa, gasta os pontos de habilidade nelas, alternando, até o teto do nível. A taxa de cada classe muda
//   muito com essa conduta (o total, pouco): servem para ver quanto de uma diferença entre classes é do bot.
// --grupo: outros bots (classes) no grupo de cada classe medida, cada um com o mesmo nível, equipamento e
//   tônicos; o da classe medida abre a válvula. Em grupo, quem cai espera e os outros seguem.
// --ajuste: JSON somado à definição da defesa (data/maps.json, brejo_bombas.defenses.joca_valve) só nesta
//   medição, para comparar números antes de mudar os dados.
import { writeFileSync } from 'node:fs';
import { loadGameData } from '../src/data.js';
import { GameServer } from '../src/server.js';
import { ClienteEmProcesso } from './lib/progressao/cliente.mjs';
import { congelarZonasVazias } from './lib/progressao/simulacao.mjs';

const PREREQS = ['tutorial', 'c1_count', 'c1_rats', 'c1_master', 'c1_route', 'c1_foreman', 'c2_water'];
// atributo principal de cada classe (a "build simples" do script da revisão)
const MAIN_ATTR = { breaker: 'str', bastion: 'str', pikeman: 'str', dawnshield: 'str', warden: 'agi', windwalker: 'agi', veilsinger: 'spi', emberweaver: 'spi' };
// onde cada um espera perto da válvula (110, 56 é o ponto do script da revisão)
const SPOTS = [{ x: 110, z: 56 }, { x: 111.5, z: 55 }, { x: 108.5, z: 57.5 }, { x: 112, z: 54 }, { x: 108, z: 55 }];

const data = loadGameData();

const must = (r, what) => {
  if (!r?.ok) throw new Error(`${what}: ${r?.reason ?? r?.code ?? 'sem resposta'}`);
  return r;
};

// Prepara um personagem: conta, nível, missões anteriores, a 2.2 aceita com o Joca, pontos, equipamento e
// exatamente N tônicos, parado em `spot` perto da válvula e com a vida cheia. skills: quantas das primeiras
// habilidades da classe o bot usa; ranks: gasta os pontos de habilidade nelas.
function prepareHero(server, i, classId, { level, tonics, gear, skills = 2, ranks = false }, spot) {
  const c = new ClienteEmProcesso(server, `bot${i}`);
  const account = `defesa_${i}`;
  must(c.pedir('register', { account, password: 'senha123' }), 'cadastro');
  must(c.pedir('login', { account, password: 'senha123' }), 'login');
  const name = `Defensor${String.fromCharCode(97 + i)}`;
  const charId = must(c.pedir('create_char', { name, classId }), 'personagem').char.id;
  must(c.pedir('enter', { charId }), 'entrar');
  must(c.pedir('gm', { cmd: 'xp', level }), 'nível');
  must(c.pedir('gm', { cmd: 'quest_done', quests: PREREQS }), 'missões anteriores');
  const joca = data.maps.brejo_bombas.npcs.find((n) => n.id === 'joca');
  must(c.pedir('gm', { cmd: 'teleport', mapId: 'brejo_bombas', x: joca.x + 1.5, z: joca.z }), 'viagem ao brejo');
  must(c.pedir('quest_accept', { quest: 'c2_pressure', npc: 'joca' }), 'aceitar a missão');
  const p = server.playerOf(charId);
  const cls = data.classes[classId];
  // pontos: primeiro o que a arma comum de faixa 5 da família do kit pede, o resto no atributo principal
  const kitFamily = data.items[cls.startingKit.equip[0]].family;
  const w5 = Object.values(data.items).find((d) => d.level === 5 && d.rarity === 'common' && d.family === kitFamily);
  const points = {};
  let left = p.char.unspent;
  for (const [a, v] of Object.entries(w5?.req ?? {})) {
    const n = Math.min(Math.max(0, v - (cls.start[a] ?? 0)), left);
    if (n) { points[a] = n; left -= n; }
  }
  if (left) points[MAIN_ATTR[classId]] = (points[MAIN_ATTR[classId]] ?? 0) + left;
  must(c.pedir('allocate', { points }), 'atributos');
  // habilidades que o bot usa; com ranks, os pontos de habilidade vão nelas, alternando (as ainda trancadas e as
  // que chegaram ao teto do nível recusam o ponto)
  const used = cls.skills.slice(0, skills);
  if (ranks) for (let k = 0; used.length && k < 4 * used.length && p.char.skillPoints > 0; k++) c.pedir('learn_skill', { skill: used[k % used.length] });
  if (gear === '5' || gear === 'arma') {
    const kitOffhand = (d) => cls.startingKit.equip.some((e) => data.items[e].kind === 'offhand' && data.items[e].family === d.family);
    const want = Object.values(data.items).filter((d) => d.level === 5 && d.rarity === 'common' && (!d.classes || d.classes.includes(classId))
      && (gear === 'arma' ? ['weapon'] : ['weapon', 'armor', 'offhand']).includes(d.kind) && (d.kind !== 'weapon' || d.family === kitFamily) && (d.kind !== 'offhand' || kitOffhand(d)));
    for (const d of want) {
      const g = must(c.pedir('gm', { cmd: 'give', defId: d.id }), `dar ${d.id}`);
      must(c.pedir('equip', { instance: g.instanceId }), `equipar ${d.id}`);
    }
  }
  // exatamente N tônicos: descarta as pilhas do kit e dá N
  for (const it of [...p.char.items.values()]) if (it.loc === 'bag' && it.defId === 'potion_hp_s') must(c.pedir('discard', { instance: it.id }), 'descartar tônicos');
  if (tonics > 0) must(c.pedir('gm', { cmd: 'give', defId: 'potion_hp_s', qty: tonics }), 'dar tônicos');
  must(c.pedir('gm', { cmd: 'teleport', x: spot.x, z: spot.z }), 'ir à válvula');
  p.char.hp = p.stats.maxHp; p.char.mp = p.stats.maxMp; // chega descansado
  return { c, p, cls, charId, name, used, potions: 0, strays: new Set() };
}

// Uma defesa do começo ao fim, sozinho (party vazio) ou em grupo (party: classes dos outros bots; o primeiro
// abre a válvula). Devolve { won, attempts, jocaHp, jocaMinHp, jocaMaxHp, potions, playerDown, fellAtS, strays, spawned, skillRanks }
// (potions: média por personagem; playerDown: quantos caíram; strays: monstros do mapa, fora das ondas, que vieram
// atrás de alguém durante a defesa; spawned: monstros das ondas; skillRanks: graus das habilidades que o primeiro
// usa). skills e ranks: ver prepareHero.
export function runDefense({ classId, party = [], level = 6, tonics = 3, gear = 'kit', seed = 1, reactMs = 480, stepMs = 100, windowS = 0, override = null, fightBack = false, skills = 2, ranks = false }) {
  const realNow = Date.now;
  const base = realNow.call(Date);
  let simMs = 0;
  Date.now = () => base + simMs; // prazos de relógio de parede seguem o tempo simulado (como na simulação de progressão)
  try {
    const server = new GameServer({ dbPath: ':memory:', dev: true, log: false, seed, tickHz: 10, rateLimit: 1e9, rateBurst: 1e9, partyInviteGapMs: 0 });
    congelarZonasVazias(server, () => simMs, 0);
    const heroes = [classId, ...party].map((cid, i) => prepareHero(server, i, cid, { level, tonics, gear, skills, ranks }, SPOTS[i % SPOTS.length]));
    const [lead] = heroes;
    for (const h of heroes.slice(1)) {
      must(lead.c.pedir('party_invite', { name: h.name }), 'convite do grupo');
      must(h.c.pedir('party_accept', { from: lead.charId }), 'entrar no grupo');
    }
    const zone = lead.p.zone;
    if (override) zone.map.defenses = { ...zone.map.defenses, joca_valve: { ...zone.map.defenses.joca_valve, ...override } };
    const before = new Set(zone.monsters.keys());
    const def = zone.escorts.get(must(lead.c.pedir('interact', { object: 'main_valve' }), 'válvula').escort);
    const limitMs = windowS > 0 ? windowS * 1000 : def.def.durationMs + 1000;
    let elapsed = 0, nextDecision = 0, attempts = 1, fellAtS = null, jocaMinHp = def.hp, wasBroken = false;
    const waveIds = new Set();
    while (elapsed < limitMs) {
      if (def.state === 'arrived' || !zone.escorts.has(def.eid)) break;
      if (def.state === 'broken') {
        if (!wasBroken) { wasBroken = true; fellAtS ??= Math.round((zone.now - def.startedAt) / 1000); if (windowS <= 0) break; }
      } else if (wasBroken) { wasBroken = false; attempts++; }
      if (elapsed >= nextDecision) {
        nextDecision = elapsed + reactMs;
        // sozinho, o script da revisão para quando o jogador cai; em grupo, quem caiu espera e os outros seguem
        if (heroes.every((h) => h.p.char.dead)) break;
        const wave = [...zone.monsters.values()].filter((m) => m.escortTarget === def.eid && m.state !== 'dead');
        for (const h of heroes) {
          const { c, p } = h;
          if (p.char.dead) continue;
          if (p.char.hp < p.stats.maxHp * 0.4) {
            const pot = [...p.char.items.values()].find((i) => i.loc === 'bag' && i.defId.startsWith('potion_hp'));
            if (pot && c.pedir('use_item', { instance: pot.id }).ok) h.potions++;
          }
          const stray = fightBack ? [...zone.monsters.values()].find((m) => !m.escortTarget && m.state !== 'dead' && m.targetId === p.eid) : null;
          if (!stray && !wave.length) continue;
          const tgt = stray ?? wave.sort((a, b) => Math.hypot(a.x - def.x, a.z - def.z) - Math.hypot(b.x - def.x, b.z - def.z))[0];
          if (p.targetId !== tgt.eid) c.pedir('attack', { target: tgt.eid });
          for (const sk of h.used) if ((p.char.skills[sk] || 0) > 0) c.pedir('cast', { skill: sk, target: tgt.eid, x: tgt.x, z: tgt.z });
        }
      }
      server.step(stepMs);
      simMs += stepMs;
      elapsed += stepMs;
      if (def.state === 'moving') jocaMinHp = Math.min(jocaMinHp, def.hp);
      for (const m of zone.monsters.values()) {
        if (m.escortTarget === def.eid) waveIds.add(m.eid);
        else if (before.has(m.eid) && m.state !== 'dead') for (const h of heroes) if (m.targetId === h.p.eid) h.strays.add(m.eid);
      }
    }
    const won = def.state === 'arrived';
    if (won) { server.step(stepMs); simMs += stepMs; }
    const ready = !!lead.c.pedir('quests').journal?.active?.find((q) => q.id === 'c2_pressure')?.ready;
    const strays = new Set(heroes.flatMap((h) => [...h.strays]));
    const res = {
      won: won && ready, attempts, jocaHp: Math.ceil(def.hp), jocaMinHp: Math.ceil(jocaMinHp), jocaMaxHp: def.mhp,
      potions: heroes.reduce((s, h) => s + h.potions, 0) / heroes.length, playerDown: heroes.filter((h) => h.p.char.dead).length,
      fellAtS, strays: strays.size, spawned: waveIds.size, skillRanks: lead.used.map((s) => lead.p.char.skills[s] ?? 0),
    };
    server.store.close();
    return res;
  } finally {
    Date.now = realNow;
  }
}

function main() {
  const argv = process.argv.slice(2);
  const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i === -1 || argv[i + 1] === undefined || argv[i + 1].startsWith('--') ? d : argv[i + 1]; };
  const flag = (k) => argv.includes(`--${k}`);
  if (flag('ajuda') || flag('help')) {
    console.log('Uso: npm run defesa-solo -- [--classes a,b] [--nivel 6] [--tonicos 3] [--equip kit|arma|5] [--sementes 20] [--semente-inicial 1] [--reacao-ms 480] [--passo-ms 100] [--janela-s 0] [--ajuste JSON] [--revida] [--habilidades 2] [--graus] [--grupo a,b] [--json arquivo] [--detalhe]');
    return;
  }
  const all = Object.entries(data.classes).filter(([, c]) => ['M1', 'M2'].includes(c.implementedIn)).map(([id]) => id);
  const classes = opt('classes') ? opt('classes').split(',').map((s) => s.trim()).filter(Boolean) : all;
  for (const c of classes) if (!all.includes(c)) { console.error(`Classe inválida: ${c}. Opções: ${all.join(', ')}`); process.exitCode = 1; return; }
  const cfg = {
    level: Number(opt('nivel', 6)), tonics: Number(opt('tonicos', 3)), gear: opt('equip', 'kit'),
    reactMs: Number(opt('reacao-ms', 480)), stepMs: Number(opt('passo-ms', 100)), windowS: Number(opt('janela-s', 0)),
    override: opt('ajuste') ? JSON.parse(opt('ajuste')) : null, fightBack: flag('revida'),
    skills: Number(opt('habilidades', 2)), ranks: flag('graus'),
    party: opt('grupo') ? opt('grupo').split(',').map((s) => s.trim()).filter(Boolean) : [],
  };
  if (!(Number.isInteger(cfg.skills) && cfg.skills >= 0)) { console.error('--habilidades: um número inteiro de 0 em diante'); process.exitCode = 1; return; }
  for (const c of cfg.party) if (!all.includes(c)) { console.error(`Classe inválida no grupo: ${c}. Opções: ${all.join(', ')}`); process.exitCode = 1; return; }
  if (!['kit', 'arma', '5'].includes(cfg.gear)) { console.error('--equip: kit, arma ou 5'); process.exitCode = 1; return; }
  const n = Math.max(1, Number(opt('sementes', 20)));
  const seed0 = Number(opt('semente-inicial', 1));
  const t0 = performance.now();
  const who = cfg.party.length ? `em grupo (cada classe abaixo com ${cfg.party.map((c) => data.classes[c].name).join(', ')})` : 'sozinho';
  console.log(`Defesa do Joca ${who}: nível ${cfg.level}, ${cfg.tonics} tônicos, equipamento ${{ kit: 'do kit', arma: 'do kit com a arma de faixa 5', 5: 'comum de faixa 5' }[cfg.gear]}, ${n} sementes (${seed0}..${seed0 + n - 1}), ${cfg.windowS > 0 ? `janela de ${cfg.windowS} s` : 'só a primeira tentativa'}${cfg.fightBack ? ', revidando monstros do mapa' : ''}${cfg.skills !== 2 ? `, usando ${cfg.skills} habilidade(s)` : ''}${cfg.ranks ? ', com os pontos de habilidade gastos' : ''}${cfg.override ? `, ajuste ${JSON.stringify(cfg.override)}` : ''}`);
  const rows = [];
  for (const classId of classes) {
    const runs = [];
    for (let i = 0; i < n; i++) {
      const r = runDefense({ classId, seed: seed0 + i, ...cfg });
      runs.push(r);
      if (flag('detalhe')) console.log(`  ${classId} semente ${seed0 + i}: ${r.won ? 'venceu' : 'perdeu'}${r.fellAtS != null ? ` (Joca caiu aos ${r.fellAtS} s)` : ''}${r.playerDown ? ` (${cfg.party.length ? `${r.playerDown} caíram` : 'jogador caiu'})` : ''}${r.strays ? ` (${r.strays} monstro(s) do mapa vieram junto)` : ''} — Joca ${r.jocaHp}/${r.jocaMaxHp} (mínimo ${r.jocaMinHp}), tônicos ${r.potions}, ${r.spawned} monstros nas ondas`);
    }
    const wins = runs.filter((r) => r.won);
    const avg = (list, f) => (list.length ? list.reduce((s, r) => s + f(r), 0) / list.length : 0);
    const row = {
      classId, name: data.classes[classId].name, runs: n, wins: wins.length,
      winPct: Math.round((wins.length / n) * 100),
      jocaFell: runs.filter((r) => r.fellAtS != null).length,
      playerDown: runs.filter((r) => r.playerDown).length,
      jocaHpOnWinPct: Math.round(avg(wins, (r) => r.jocaHp / r.jocaMaxHp) * 100),
      jocaMinPct: Math.round(avg(runs, (r) => r.jocaMinHp / r.jocaMaxHp) * 100),
      potions: Math.round(avg(runs, (r) => r.potions) * 10) / 10,
      strays: runs.filter((r) => r.strays).length,
    };
    rows.push(row);
    console.log(`${row.name.padEnd(22)} ${String(row.wins).padStart(3)}/${n} (${String(row.winPct).padStart(3)}%)  Joca caiu ${row.jocaFell}, ${cfg.party.length ? 'alguém caiu' : 'jogador caiu'} ${row.playerDown}, vida do Joca nas vitórias ${row.jocaHpOnWinPct}%, mínimo médio ${row.jocaMinPct}%, tônicos ${row.potions}${row.strays ? `, monstros do mapa em ${row.strays}` : ''}`);
  }
  const total = rows.reduce((s, r) => s + r.wins, 0);
  console.log(`Total: ${total}/${rows.length * n} (${Math.round((total / (rows.length * n)) * 100)}%) em ${((performance.now() - t0) / 1000).toFixed(0)} s`);
  if (opt('json')) writeFileSync(opt('json'), JSON.stringify({ cfg, seeds: [seed0, seed0 + n - 1], rows }, null, 1));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
