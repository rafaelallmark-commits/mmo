// Linha de execução (worker_threads) que roda uma simulação (classe + semente) e devolve o
// resultado ao processo principal. Date.now() é trocado só dentro desta linha.
import { parentPort, workerData } from 'node:worker_threads';
import { simularClasse } from './simulacao.mjs';

const { classId, seed, ateNivel, opcoes, bancoArquivo, maxHoras } = workerData;
try {
  const res = simularClasse({
    classId, seed, ateNivel, opcoes, bancoArquivo, maxHoras,
    aoNivel: (info) => parentPort.postMessage({ tipo: 'nivel', classId, seed, info }),
  });
  parentPort.postMessage({ tipo: 'fim', classId, seed, res });
} catch (e) {
  parentPort.postMessage({ tipo: 'erro', classId, seed, erro: String(e?.stack ?? e) });
}
