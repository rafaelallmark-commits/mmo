// Cenários críticos reproduzíveis (M4): roda as suítes de aceitação e os testes de carga e escreve um
// relatório único.
//   node tools/cenarios.mjs [--rapido] [--md ../docs/relatorio-cenarios.md]
// --rapido encurta a carga (50 clientes, 20 s) para uso no dia a dia; sem ele: 100 clientes por 60 s
// e 100 clientes com 150 ms de atraso por 30 s.
import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const has = (f) => process.argv.includes(`--${f}`);
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; };
const QUICK = has('rapido');
const MD = arg('md', join(root, '../docs/relatorio-cenarios.md'));

const SUITES = [
  ['Núcleo do M1: dois clientes, saque individual, anti-duplicação (coleta simultânea, mesmo rid, reconexão), requisitos de equipamento, reinício do servidor', 'test/acceptance.test.js'],
  ['Grupo de 5, papéis (ameaça, cura reduz tônicos ≥ 40%, XP sem dano), prova de classe com queda de conexão', 'test/m2.test.js'],
  ['Calabouço com 3 composições e bots que reagem aos avisos, recompensa única, refino com RNG semeado (10.000 tentativas), depósito', 'test/m3.test.js'],
  ['Snapshots por diferença = estado completo; saída do raio; troca de zona', 'test/snapshots.test.js'],
  ['Migração de banco antigo (uma única vez)', 'test/store.test.js'],
  ['Regras, morte, equipamento, habilidades, navegação, dados', 'test/rules.test.js test/death.test.js test/equipment.test.js test/skills.test.js test/nav.test.js test/data.test.js'],
];

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const p = spawn(cmd, args, { cwd: root, ...opts });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    p.on('close', (code) => resolve({ code, out, secs: (Date.now() - t0) / 1000 }));
  });
}

const results = [];
for (const [what, files] of SUITES) {
  process.stdout.write(`• ${what}... `);
  const r = await run(process.execPath, ['--disable-warning=ExperimentalWarning', '--test', '--test-reporter=spec', ...files.split(' ')]);
  const pass = Number(/ℹ pass (\d+)/.exec(r.out)?.[1] ?? 0);
  const fail = Number(/ℹ fail (\d+)/.exec(r.out)?.[1] ?? 0);
  results.push({ what, files, ok: r.code === 0, pass, fail, secs: r.secs, tail: r.code === 0 ? '' : r.out.split('\n').filter((l) => l.includes('✖') || l.includes('Error')).slice(0, 6).join('\n') });
  console.log(r.code === 0 ? `ok (${pass} testes, ${r.secs.toFixed(0)} s)` : `FALHOU (${fail} falhas)`);
}

const tmp = mkdtempSync(join(tmpdir(), 'cinzas-cenarios-'));
const loads = [
  { what: QUICK ? 'Carga: 50 clientes, 20 s' : 'Carga: 100 clientes numa zona, 60 s', args: ['--clientes', QUICK ? '50' : '100', '--duracao', QUICK ? '20' : '60', '--aquecimento', '10'] },
  { what: QUICK ? 'Carga com 150 ms de atraso: 50 clientes, 20 s' : 'Carga com 150 ms de atraso: 100 clientes, 30 s', args: ['--clientes', QUICK ? '50' : '100', '--duracao', QUICK ? '20' : '30', '--aquecimento', '10', '--lag-ms', '150'] },
];
for (const L of loads) {
  process.stdout.write(`• ${L.what}... `);
  const out = join(tmp, `carga-${results.length}.json`);
  const r = await run(process.execPath, ['--disable-warning=ExperimentalWarning', 'tools/carga.mjs', ...L.args, '--saida', out]);
  let rep = null;
  try { rep = JSON.parse(readFileSync(out, 'utf8')); } catch { /* falhou antes de escrever */ }
  const s = rep?.servidor, c = rep?.clientesMedidos;
  const ok = !!rep && rep.aprovado && c.erros === 0;
  results.push({
    what: L.what, files: 'tools/carga.mjs', ok, secs: r.secs,
    detail: rep ? `tick p50/p95/p99/máx ${s.tickMs.p50}/${s.tickMs.p95}/${s.tickMs.p99}/${s.tickMs.max} ms (acima de 50 ms: ${s.tickMs.acima50ms}); ping p50/p95/p99 ${c.pingMs.p50}/${c.pingMs.p95}/${c.pingMs.p99} ms; ${c.kbRecebidosPorSPorCliente.media} KB/s por cliente; ${rep.conectados}/${rep.clientes} conectados` : r.out.slice(-400),
  });
  console.log(ok ? 'ok' : 'FALHOU');
}
rmSync(tmp, { recursive: true, force: true });

const allOk = results.every((r) => r.ok);
const md = `# Cenários críticos (${new Date().toISOString().slice(0, 10)})

Comando: \`cd server && npm run cenarios${QUICK ? ' -- --rapido' : ''}\` — resultado geral: **${allOk ? 'tudo passou' : 'há falhas'}**.

| Cenário | Onde | Resultado | Tempo |
|---|---|---|---|
${results.map((r) => `| ${r.what}${r.detail ? `<br><small>${r.detail}</small>` : ''} | \`${r.files}\` | ${r.ok ? `ok${r.pass ? ` (${r.pass} testes)` : ''}` : `**falhou**${r.tail ? `<br><small>${r.tail.replace(/\n/g, '<br>')}</small>` : ''}`} | ${r.secs.toFixed(0)} s |`).join('\n')}

Critérios do M4: nenhum tick acima de 50 ms com 100 clientes; tolerância a 150 ms de atraso (sem erros, todos conectados).
Medição de tempo por nível: ver \`docs/relatorio-progressao.md\` (simulação) e \`tools/telemetria.mjs\` (banco real).
`;
writeFileSync(MD, md);
console.log(`\nrelatório: ${MD}`);
process.exit(allOk ? 0 : 1);
