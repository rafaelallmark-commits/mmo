// Bancada das provas de classe: um GameServer em processo (banco em memória, modo dev, sem rede), um
// personagem de nível 10 preparado como um jogador chegaria ao mestre (pontos distribuídos pelo plano de
// atributos do robô e o kit inicial ou o da faixa 5) e o piloto (piloto.mjs) jogando a prova pelo protocolo.
// Cada server.step(100) são 100 ms de jogo: a prova inteira roda em uma fração de segundo.
import { GameServer } from '../../../src/server.js';
import { ClienteEmProcesso } from '../progressao/cliente.mjs';
import { planoAtributos, kitDaFaixa } from '../progressao/planos.mjs';
import { criarPiloto } from './piloto.mjs';

const CIDADE = { amber: 'pedrambar', nacre: 'vau_de_nacar' };

function cadeia(questId, quests, out = []) {
  for (const pr of quests[questId]?.prereq ?? []) { cadeia(pr, quests, out); if (!out.includes(pr)) out.push(pr); }
  return out;
}

// Atributos distribuídos até o nível L pelo plano do robô da simulação (o mesmo dos exemplos de evolução).
export function pontosAte(classId, nivel, data) {
  const plano = planoAtributos(classId, data);
  const soma = {};
  for (let l = 2; l <= nivel; l++) for (const [a, v] of Object.entries(plano.porNivel[l] || {})) soma[a] = (soma[a] || 0) + v;
  return soma;
}

// Prepara o personagem e entra na prova. Devolve { server, cli, eid, data } com o jogador já na arena.
export function prepararProva({ classId, faixa = 1, seed = 1, nivel = 10, server = null }) {
  server ??= new GameServer({ dbPath: ':memory:', dev: true, log: false, seed, tickHz: 10, rateLimit: 1e9, rateBurst: 1e9 });
  const data = server.data;
  const cli = new ClienteEmProcesso(server, `pv${classId.slice(0, 4)}${seed}${faixa}`);
  const conta = `prova_${classId}_${seed}_${faixa}`.slice(0, 20);
  cli.pedir('register', { account: conta, password: 'senha123' });
  const l = cli.pedir('login', { account: conta, password: 'senha123', delta: true });
  if (!l.ok) throw new Error(`login: ${l.reason}`);
  const c = cli.pedir('create_char', { name: `Pv${classId.slice(0, 8)}${seed}${faixa}`.slice(0, 16), classId });
  if (!c.ok) throw new Error(`create_char: ${c.reason}`);
  const e = cli.pedir('enter', { charId: c.char.id });
  if (!e.ok) throw new Error(`enter: ${e.reason}`);
  const ok = (r, o) => { if (!r.ok) throw new Error(`${o}: ${r.reason}`); return r; };
  ok(cli.pedir('gm', { cmd: 'xp', level: nivel }), 'xp');
  ok(cli.pedir('allocate', { points: pontosAte(classId, nivel, data) }), 'allocate');
  if (faixa !== 1) {
    for (const id of kitDaFaixa(classId, faixa, data)) {
      const g = ok(cli.pedir('gm', { cmd: 'give', defId: id }), `give ${id}`);
      ok(cli.pedir('equip', { instance: g.instanceId }), `equip ${id}`);
    }
  }
  ok(cli.pedir('gm', { cmd: 'quest_done', quests: cadeia('c3_trial', data.quests) }), 'quest_done');
  const cidade = CIDADE[data.classes[classId].origin];
  const mestre = data.maps[cidade].npcs.find((n) => n.id === `master_${classId}`);
  ok(cli.pedir('gm', { cmd: 'teleport', mapId: cidade, x: mestre.x, z: mestre.z + 2 }), 'teleport');
  ok(cli.pedir('quest_accept', { quest: 'c3_trial', npc: mestre.id }), 'quest_accept');
  return { server, cli, eid: e.char.eid, data, mestre: mestre.id };
}

// Roda a prova inteira com o piloto. opcoes: { semHabilidade, miraNoAlvo, bateNaBlindagem, reacaoMs, maxS, aoPasso(v), manter } —
// reacaoMs: o piloto só decide a cada tantos ms (100 = todo passo; 300 a 500 lembra um jogador humano);
// manter: devolve o servidor aberto (server, cli, mestre) para o chamador seguir (ex.: entregar a missão).
export function rodarProva({ classId, faixa = 1, seed = 1, semHabilidade = false, miraNoAlvo = false, bateNaBlindagem = false, reacaoMs = 100, maxS = 200, aoPasso = null, manter = false }) {
  const { server, cli, eid, data, mestre } = prepararProva({ classId, faixa, seed });
  const prova = { iniciada: null, status: null, fim: null };
  const avisos = [];
  const eventos = [];
  let agora = 0;
  let char = null;
  cli.aoEvento = (m) => {
    if (m.t === 'trial') {
      if (m.state === 'started') prova.iniciada = m;
      else if (m.state === 'status') prova.status = m;
      else if (m.state === 'success' || m.state === 'failed') prova.fim = m;
      if (m.char) char = m.char;
    } else if (m.t === 'warn') avisos.push({ x: m.x, z: m.z, radius: m.radius, ate: agora + m.ms + 150, kind: m.kind });
    eventos.push(m);
  };
  let ultimoGolpe = -1e9;
  cli.aoCombate = (m) => { if (m.t === 'hit' && m.src === eid) ultimoGolpe = agora; };
  char = cli.pedir('char').char;
  const inicio = cli.pedir('trial_start', { npc: mestre });
  if (!inicio.ok) throw new Error(`trial_start: ${inicio.reason}`);
  const piloto = criarPiloto(classId, data, { semHabilidade, miraNoAlvo, bateNaBlindagem });
  let decideEm = 0;
  // ações (uma por tipo por passo; recargas conferidas pelas respostas do servidor)
  const cd = {};
  let gcdAte = 0, alvo = null, destino = null, destinoEm = -1e9, tonicoEm = -1e9;
  const usadas = {};
  const acoes = {
    mover(x, z) {
      if (destino && Math.hypot(destino.x - x, destino.z - z) < 0.4 && agora - destinoEm < 1500) return;
      const r = cli.pedir('move', { x, z });
      if (r.ok) { destino = { x, z }; destinoEm = agora; alvo = null; }
    },
    atacar(id) {
      if (alvo === id) return;
      const r = cli.pedir('attack', { target: id });
      if (r.ok) { alvo = id; destino = null; }
    },
    parar() { cli.pedir('stop'); alvo = null; destino = null; },
    pronta(skill) { return (char.skills?.[skill] ?? 0) > 0 && agora >= (cd[skill] ?? 0) && agora >= gcdAte; },
    lancar(skill, o = {}) {
      const r = cli.pedir('cast', { skill, ...o });
      if (r.ok) {
        cd[skill] = agora + (r.cooldownMs ?? 0);
        gcdAte = agora + (r.gcdMs ?? 0);
        usadas[skill] = (usadas[skill] || 0) + 1;
        if (r.char) char = r.char;
        if (o.target && data.skills[skill].target === 'enemy') alvo = o.target;
      } else if (r.code === 'cooldown' || r.code === 'gcd') {
        cd[skill] = Math.max(cd[skill] ?? 0, agora + 300);
      } else {
        cd[skill] = Math.max(cd[skill] ?? 0, agora + 400);
      }
      return r;
    },
    tonico() {
      if (agora - tonicoEm < 3100) return;
      const pot = (char.items ?? []).filter((i) => i.loc === 'bag' && data.items[i.defId]?.use?.healHp && (data.items[i.defId].level ?? 1) <= char.level)
        .sort((a, b) => data.items[b.defId].use.healHp - data.items[a.defId].use.healHp)[0];
      if (!pot) return;
      const r = cli.pedir('use_item', { instance: pot.id });
      tonicoEm = agora;
      if (r.ok && r.char) char = r.char;
    },
  };
  const passos = Math.round((maxS * 1000) / 100);
  let minHp = Infinity, minAliado = Infinity;
  for (let i = 0; i < passos && !prova.fim; i++) {
    agora += 100;
    server.step(100);
    if (prova.fim) break;
    if (i % 10 === 0) { const rc = cli.pedir('char'); if (rc.ok) char = rc.char; }
    const ents = cli.mundo();
    const eu = ents.get(eid);
    if (eu && prova.status) minHp = Math.min(minHp, eu.hp / eu.mhp);
    for (const e of ents.values()) if (e.k === 'a' && prova.status) minAliado = Math.min(minAliado, e.hp / e.mhp);
    const v = { agora, eu, ents, char, prova, avisos: avisos.filter((w) => w.ate > agora), ultimoGolpe };
    // a arena só depois do 'started'; uma decisão a cada reacaoMs
    if (prova.iniciada && eu && agora >= decideEm) { decideEm = agora + reacaoMs; piloto.decidir(v, acoes); }
    aoPasso?.(v, server);
  }
  const fim = prova.fim ?? { state: 'timeout', message: 'sem resultado' };
  const ch = cli.pedir('char').char;
  if (!manter) server.store.close();
  return {
    ...(manter ? { server, cli, mestre } : {}),
    classId, faixa, seed, success: fim.state === 'success', message: fim.message, segundos: Math.round(agora / 100) / 10,
    usadas, minHpPct: Math.round(minHp * 100), minAliadoPct: Number.isFinite(minAliado) ? Math.round(minAliado * 100) : null, trialDone: !!ch?.trialDone, skills: ch?.skills, kind: piloto.kind, ultimoStatus: prova.status, eventos,
  };
}
