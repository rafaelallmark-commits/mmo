// A suíte inteira no PostgreSQL: sobe um cluster temporário (tools/pg-temp.mjs), roda os mesmos testes
// do `npm test` com CINZAS_TEST_PG=<url> — cada banco que os testes pedirem vira um esquema isolado nesse
// servidor (src/db.js) — e no fim para o cluster e apaga o diretório.
//   npm run test:pg                      todos os arquivos de test/
//   npm run test:pg -- test/m3.test.js   só alguns (opções --xyz vão para o node --test)
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startTempPostgres } from './pg-temp.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const files = args.filter((a) => !a.startsWith('--'));
const flags = args.filter((a) => a.startsWith('--'));
const list = files.length ? files : readdirSync(join(root, 'test')).filter((f) => f.endsWith('.test.js')).sort().map((f) => join('test', f));

const t0 = Date.now();
const pg = await startTempPostgres();
console.log(`PostgreSQL temporário em ${pg.dir}${pg.user ? ` (rodando como ${pg.user}: o PostgreSQL não aceita root)` : ''}`);
let code = 1;
try {
  const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', '--test', '--test-reporter=spec', ...flags, ...list], {
    cwd: root, stdio: 'inherit', env: { ...process.env, CINZAS_TEST_PG: pg.url },
  });
  for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => child.kill(s));
  code = await new Promise((r) => child.on('exit', (c) => r(c ?? 1)));
} finally {
  pg.stop();
}
console.log(`test:pg terminou em ${((Date.now() - t0) / 1000).toFixed(0)} s (código ${code}); cluster apagado.`);
process.exit(code);
