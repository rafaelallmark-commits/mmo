# Cenários críticos (2026-11-20)

Comando: `cd server && npm run cenarios` — resultado geral: **tudo passou**.

| Cenário | Onde | Resultado | Tempo |
|---|---|---|---|
| Núcleo do M1: dois clientes, saque individual, anti-duplicação (coleta simultânea, mesmo rid, reconexão), requisitos de equipamento, reinício do servidor | `test/acceptance.test.js` | ok (1 testes) | 54 s |
| Grupo de 5, papéis (ameaça, cura reduz tônicos ≥ 40%, XP sem dano), prova de classe com queda de conexão | `test/m2.test.js` | ok (3 testes) | 52 s |
| Calabouço com 3 composições e bots que reagem aos avisos, recompensa única, refino com RNG semeado (10.000 tentativas), depósito | `test/m3.test.js` | ok (5 testes) | 123 s |
| Snapshots por diferença = estado completo; saída do raio; troca de zona | `test/snapshots.test.js` | ok (3 testes) | 7 s |
| Migração de banco antigo (uma única vez) | `test/store.test.js` | ok (1 testes) | 0 s |
| Regras, morte, equipamento, habilidades, navegação, dados | `test/rules.test.js test/death.test.js test/equipment.test.js test/skills.test.js test/nav.test.js test/data.test.js` | ok (36 testes) | 1 s |
| Capítulo 4 completo: canalização, escolta da carroça, escolha de diálogo | `test/ch4.test.js` | ok (3 testes) | 27 s |
| Pós-versão 1: refino +4..+6 com selo, troca atômica, clãs, duelos (e casos de borda) | `test/social.test.js` | ok (7 testes) | 22 s |
| Teste público: contas e token, limites, papéis, desligamento gracioso, TLS, SMTP, moderação e denúncias | `test/publico.test.js test/moderacao.test.js` | ok (7 testes) | 17 s |
| Ajustes do M4: recargas entre zonas, tônicos por nível, venda, descarte, armeiro, pedido que falha no meio sai sem gravar | `test/ajustes.test.js` | ok (4 testes) | 1 s |
| Níveis 21–25: teto, A Cava Primeira, elite diária, habilidades do nível 25, capítulo 6 inteiro | `test/nivel25.test.js` | ok (6 testes) | 13 s |
| Várias zonas: mundo + 2 zonas, transferência com token, posse única, grupo e clã entre zonas, quedas e moderação | `test/multizona.test.js` | ok (13 testes) | 28 s |
| Banco: mesmas migrações no SQLite e no PostgreSQL (a suíte no PostgreSQL roda com `npm run test:pg`) | `test/db.test.js test/store-pg.test.js` | ok (11 testes) | 1 s |
| Simulação de progressão acelerada: bots pelo protocolo, relógio real restaurado | `test/progressao.test.js` | ok (2 testes) | 2 s |
| Carga: 100 clientes numa zona, 60 s<br><small>tick p50/p95/p99/máx 4.5/7.8/14.1/21.7 ms (acima de 50 ms: 0); ping p50/p95/p99 0.4/5.5/9.1 ms; 9.5 KB/s por cliente; 100/100 conectados</small> | `tools/carga.mjs` | ok | 84 s |
| Carga com 150 ms de atraso: 100 clientes, 30 s<br><small>tick p50/p95/p99/máx 3.2/5.2/8.7/13.9 ms (acima de 50 ms: 0); ping p50/p95/p99 150.7/153.9/156.7 ms; 9.4 KB/s por cliente; 100/100 conectados</small> | `tools/carga.mjs` | ok | 50 s |

Critérios do M4: nenhum tick acima de 50 ms com 100 clientes; tolerância a 150 ms de atraso (sem erros, todos conectados).
Medição de tempo por nível: ver `docs/relatorio-progressao.md` (simulação) e `tools/telemetria.mjs` (banco real).
