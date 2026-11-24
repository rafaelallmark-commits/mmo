// Escolha do banco: createStore('postgres://...' | 'postgresql://...') -> PgStore (produção); qualquer
// outra coisa (caminho de arquivo, ':memory:') -> Store do SQLite (desenvolvimento), sem mudança nenhuma.
//
// Testes no PostgreSQL (npm run test:pg): com CINZAS_TEST_PG=<url>, todo banco que os testes pedirem
// por caminho vira um esquema próprio nesse servidor. O mesmo caminho dá o mesmo esquema (o teste de
// aceitação reinicia o servidor com o mesmo arquivo; o serviço de contas e a zona dividem o banco), e
// ':memory:' dá um esquema novo, apagado no close() — o mesmo isolamento que o SQLite dá de graça.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
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
  warnUnusedPassword(target);
  return new Store(target);
}

// Erros de "o banco ainda não aceita conexões": PostgreSQL subindo ou desligando (57P03), contêiner do banco
// parado ou sem nome na rede ainda, prazo de conexão. Senha errada, banco inexistente e afins não entram: esses
// têm que parar a subida na hora.
const DB_NOT_READY = new Set(['57P03', '08001', '08006', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'CINZAS_PG_TIMEOUT']);
export const isDbNotReady = (e) => DB_NOT_READY.has(e?.code);

// Abre o banco com fn() e, enquanto o erro for de banco ainda não pronto, tenta de novo a cada stepMs até waitS
// segundos (depois lança o último erro). O serviço de contas sobe por aqui: no "docker compose restart" ele
// reinicia na hora, enquanto o banco espera a zona gravar (desligamento "smart", D177), e sair a cada tentativa
// o jogava no recuo crescente de reinícios do Docker — fora do ar até ~1 min depois de o banco voltar.
export async function openWhenDbReady(fn, { waitS = 90, stepMs = 2000, log = (m) => console.error(m) } = {}) {
  const until = Date.now() + waitS * 1000;
  let warnedAt = 0;
  for (;;) {
    try {
      return fn();
    } catch (e) {
      if (!isDbNotReady(e) || Date.now() + stepMs > until) throw e;
      if (Date.now() - warnedAt >= 10_000) {
        warnedAt = Date.now();
        log(`banco ainda indisponível (${e.message}); tentando de novo por até ${Math.ceil((until - Date.now()) / 1000)} s`);
      }
      await new Promise((r) => setTimeout(r, stepMs));
    }
  }
}

// Senha do PostgreSQL configurada (perfil "postgres" do Docker Compose) com o banco no SQLite: quase
// sempre é CINZAS_DB que faltou — sem o aviso, o jogo rodaria no SQLite com o PostgreSQL parado ao lado.
function warnUnusedPassword(target) {
  const file = process.env.CINZAS_DB_PASSWORD_FILE;
  if (!file) return;
  let text = '';
  try { text = readFileSync(file, 'utf8').trim(); } catch { return; }
  if (text) console.warn(`aviso: CINZAS_DB_PASSWORD_FILE (${file}) tem uma senha, mas o banco é o SQLite ${target}: faltou CINZAS_DB=postgres://...?`);
}
