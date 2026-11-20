# Cenários críticos (2026-11-20)

Comando: `cd server && npm run cenarios` — resultado geral: **tudo passou**.

| Cenário | Onde | Resultado | Tempo |
|---|---|---|---|
| Núcleo do M1: dois clientes, saque individual, anti-duplicação (coleta simultânea, mesmo rid, reconexão), requisitos de equipamento, reinício do servidor | `test/acceptance.test.js` | ok (1 testes) | 21 s |
| Grupo de 5, papéis (ameaça, cura reduz tônicos ≥ 40%, XP sem dano), prova de classe com queda de conexão | `test/m2.test.js` | ok (3 testes) | 95 s |
| Calabouço com 3 composições e bots que reagem aos avisos, recompensa única, refino com RNG semeado (10.000 tentativas), depósito | `test/m3.test.js` | ok (5 testes) | 94 s |
| Snapshots por diferença = estado completo; saída do raio; troca de zona | `test/snapshots.test.js` | ok (3 testes) | 7 s |
| Migração de banco antigo (uma única vez) | `test/store.test.js` | ok (1 testes) | 0 s |
| Regras, morte, equipamento, habilidades, navegação, dados | `test/rules.test.js test/death.test.js test/equipment.test.js test/skills.test.js test/nav.test.js test/data.test.js` | ok (30 testes) | 1 s |
| Carga: 100 clientes numa zona, 60 s<br><small>tick p50/p95/p99/máx 5/9/16.9/32.3 ms (acima de 50 ms: 0); ping p50/p95/p99 0.3/4.5/7.5 ms; 9.6 KB/s por cliente; 100/100 conectados</small> | `tools/carga.mjs` | ok | 83 s |
| Carga com 150 ms de atraso: 100 clientes, 30 s<br><small>tick p50/p95/p99/máx 2.8/4.2/8.9/10.9 ms (acima de 50 ms: 0); ping p50/p95/p99 150.6/153.7/156.7 ms; 9.9 KB/s por cliente; 100/100 conectados</small> | `tools/carga.mjs` | ok | 48 s |

Critérios do M4: nenhum tick acima de 50 ms com 100 clientes; tolerância a 150 ms de atraso (sem erros, todos conectados).
Medição de tempo por nível: ver `docs/relatorio-progressao.md` (simulação) e `tools/telemetria.mjs` (banco real).
