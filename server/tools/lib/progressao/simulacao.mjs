// Uma simulação acelerada: um GameServer em processo (banco temporário, modo dev, sem rede),
// um bot e um laço que chama server.step(100) — cada chamada são 100 ms de jogo.
//
// Modo acelerado:
// - A zona mede tempo com zone.now (soma dos dt): recargas, efeitos, regeneração, tônicos,
//   ataques e reaparecimento funcionam sem ajuste.
// - Date.now() aparece em pontos de relógio de parede: validade do saque (30 min), elite diária
//   (dia UTC), carimbos do banco, convites e calabouço. Aqui Date.now() passa a seguir o tempo
//   simulado durante a simulação, para que esses prazos corram no mesmo ritmo do jogo.
// - Zonas abertas sem jogador congelam 30 s depois que o último jogador sai (economiza CPU).
//   Ao receber um jogador, o relógio da zona é adiantado até o tempo global — exatamente o
//   valor que teria se nunca tivesse parado —, então os monstros mortos reaparecem e as recargas
//   levadas de uma zona para outra continuam valendo. Instâncias (prova, calabouço) não mudam.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GameServer } from '../../../src/server.js';
import { BotProgressao } from './bot.mjs';

export function congelarZonasVazias(server, relogio, esperaMs = 30_000) {
  const est = { ticksPulados: 0, ticksRodados: 0, adiantamentos: 0, msAdiantados: 0 };
  for (const z of server.zones.values()) {
    if (z.instanceId) continue;
    const tick = z.tick.bind(z);
    const addPlayer = z.addPlayer.bind(z);
    let ativaAte = esperaMs;
    z.tick = (dt) => {
      if (z.players.size) ativaAte = relogio() + esperaMs;
      else if (relogio() > ativaAte) { est.ticksPulados++; return; }
      est.ticksRodados++;
      tick(dt);
    };
    z.addPlayer = (char) => {
      const atraso = relogio() - z.now;
      if (atraso > 0) { z.now += atraso; est.adiantamentos++; est.msAdiantados += atraso; }
      ativaAte = relogio() + esperaMs;
      return addPlayer(char);
    };
  }
  return est;
}

export function simularClasse({ classId, seed = 1, ateNivel = 20, opcoes = {}, aoNivel = null, bancoArquivo = false, maxHoras = 60 }) {
  const relogioReal = Date.now;
  const base = relogioReal.call(Date);
  let simMs = 0;
  Date.now = () => base + simMs;
  const t0 = performance.now();
  let dir = null;
  try {
    if (bancoArquivo) dir = mkdtempSync(join(tmpdir(), 'cinzas-prog-'));
    // rateLimit/rateBurst: versões do servidor com limite de comandos por conexão medem o limite em
    // tempo real; acelerado, o bot manda centenas de comandos por segundo real (opção ignorada
    // por versões sem limite)
    const server = new GameServer({ dbPath: dir ? join(dir, 'sim.db') : ':memory:', dev: true, log: false, seed, tickHz: 10, rateLimit: Infinity, rateBurst: Infinity });
    const congel = congelarZonasVazias(server, () => simMs);
    const bot = new BotProgressao({ server, classId, seed, ateNivel, opcoes, aoNivel });
    bot.iniciar();
    const dt = 100;
    const limite = maxHoras * 3_600_000;
    while (!bot.terminou && simMs < limite) {
      simMs += dt;
      server.step(dt);
      bot.tick(simMs);
    }
    const res = bot.resultados();
    res.tempoRealS = Math.round((performance.now() - t0) / 100) / 10;
    res.horasSimuladas = Math.round((simMs / 3_600_000) * 100) / 100;
    res.limiteAtingido = !bot.terminou;
    res.zonas = congel;
    server.store.close();
    return res;
  } finally {
    Date.now = relogioReal;
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
}
