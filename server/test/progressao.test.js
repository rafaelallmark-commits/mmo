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

test('simulação passa pela prova de classe: os avisos da prova (pedras do Quebraferro) vão ao piloto e os dos monstros à esquiva', () => {
  // a junção das frentes deixou dois "case 'warn'" e dois tipos em this.avisos: na prova, o primeiro aviso
  // derrubava a rodada com "this.avisos.set is not a function"
  const r = simularClasse({ classId: 'breaker', seed: 1, ateNivel: 11 });
  assert.equal(r.concluiu, true, `breaker chegou ao nível 11: ${r.erro ?? ''}`);
  assert.ok(r.provas.some((p) => p.resultado === 'success'), `prova vencida: ${JSON.stringify(r.provas)}`);
});
