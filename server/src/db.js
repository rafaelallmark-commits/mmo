// Escolha do banco: createStore('postgres://...' | 'postgresql://...') -> PgStore (produção); qualquer
// outra coisa (caminho de arquivo, ':memory:') -> Store do SQLite (desenvolvimento), sem mudança nenhuma.
//
// Testes no PostgreSQL (npm run test:pg): com CINZAS_TEST_PG=<url>, todo banco que os testes pedirem
// por caminho vira um esquema próprio nesse servidor. O mesmo caminho dá o mesmo esquema (o teste de
// aceitação reinicia o servidor com o mesmo arquivo; o serviço de contas e a zona dividem o banco), e
// ':memory:' dá um esquema novo, apagado no close() — o mesmo isolamento que o SQLite dá de graça.
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { Store } from './store.js';
import { PgStore, isPostgresUrl } from './store-pg.js';

export { isPostgresUrl };

let memSeq = 0;

export function testSchemaFor(target) {
  if (!target || target === ':memory:') return { schema: `t_mem_${process.pid}_${++memSeq}`, dropSchemaOnClose: true };
  return { schema: `t_${createHash('sha256').update(resolve(String(target))).digest('hex').slice(0, 24)}` };
}

export function createStore(target = ':memory:', opts = {}) {
  if (isPostgresUrl(target)) return new PgStore(target, opts);
  const testPg = process.env.CINZAS_TEST_PG;
  if (testPg) return new PgStore(testPg, { ...opts, ...testSchemaFor(target) });
  return new Store(target);
}
