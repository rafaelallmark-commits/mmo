// Ferramenta de simulação de progressão (Marco 4, tools/simular-progressao.mjs): os planos de
// atributos cumprem os kits das faixas e uma rodada curta e acelerada sobe de nível só pelo
// protocolo, mede cada nível e devolve Date.now() ao relógio real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGameData } from '../src/data.js';
import { planoAtributos, verificarPlano } from '../tools/lib/progressao/planos.mjs';
import { simularClasse } from '../tools/lib/progressao/simulacao.mjs';

test('simulação: planos de atributos de todas as classes cumprem os requisitos do kit de cada faixa', () => {
  const data = loadGameData();
  for (const c of Object.keys(data.classes)) assert.deepEqual(verificarPlano(c, planoAtributos(c, data), data), [], c);
});

test('simulação acelerada: bots sobem do 1 ao 5 pelo protocolo e Date.now volta ao relógio real', () => {
  const antes = Date.now();
  for (const classId of ['breaker', 'emberweaver']) {
    const r = simularClasse({ classId, seed: 1, ateNivel: 5 });
    assert.equal(r.concluiu, true, `${classId} chegou ao nível 5`);
    const niveis = r.niveis.filter((n) => n.concluido);
    assert.equal(niveis.length, 4);
    for (const n of niveis) {
      assert.ok(n.minutos > 0 && n.abates > 0, `${classId} nível ${n.nivel}: ${n.minutos} min, ${n.abates} abates`);
      assert.ok(n.xpAbates > 0);
    }
    // gestão do personagem (atributos, graus, kit, equipar) nunca é recusada pelo servidor
    const recusas = Object.keys(r.rejeicoes).filter((k) => /^(allocate|learn_skill|gm_give|equip|unequip):/.test(k));
    assert.deepEqual(recusas, [], `${classId}: ${JSON.stringify(r.rejeicoes)}`);
    assert.ok(r.protocolo.pedidos > 100 && r.protocolo.snap + r.protocolo.snapDelta > 1000);
  }
  assert.ok(Math.abs(Date.now() - antes) < 60_000, 'Date.now() restaurado depois da simulação');
});

test('simulação acelerada: prova de classe no nível 10 e a caça depois dela, com os golpes avisados dos monstros', () => {
  // a prova e as mecânicas dos monstros dividem os avisos ('warn'); uma rodada que passa pela prova e volta a
  // caçar pega a mistura (na integração, o primeiro golpe avisado depois da prova derrubava o robô)
  for (const classId of ['breaker', 'emberweaver']) {
    const r = simularClasse({ classId, seed: 1, ateNivel: 12 });
    assert.equal(r.concluiu, true, `${classId} chegou ao nível 12`);
    assert.equal(r.provas.at(-1)?.resultado, 'success', `${classId}: ${JSON.stringify(r.provas)}`);
    assert.ok(r.mecanicas.avisos > 0, `${classId} viu golpes avisados de monstros`);
  }
});
