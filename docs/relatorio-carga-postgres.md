# Teste de carga com PostgreSQL — 100 clientes (2026-11-20)

Comando: `node tools/carga.mjs --clientes 100 --duracao 60 --db postgres://…`
(100/100 conectados no mapa `estrada_velha`, medição de 60 s depois do aquecimento, snapshots por diferença e interesse; banco: PostgreSQL 16 local, cluster temporário com fsync ligado (`npm run pg-temp -- --duravel`), soquete Unix).

| Servidor | p50 | p95 | p99 | máx |
|---|---|---|---|---|
| Duração do tick (ms) | 5.1 | 9.5 | 14.5 | 27.3 |

Ticks acima de 50 ms: **0** de 599. CPU do processo: 7.7%. Memória: 175.6 MB.
Banda enviada: 994.3 KB/s no total (956.9 KB/s de snapshots).
Ponte síncrona do banco: 5.4 chamadas/s, laço de eventos parado 2.7 ms por segundo; cada chamada: média 0.5 ms, p50 0.23, p99 4.04, máx 11.92 ms (327 chamadas na medição).

| Clientes | p50 | p95 | p99 | máx |
|---|---|---|---|---|
| Ida e volta do ping (ms) | 0.5 | 5.9 | 11 | 21.2 |
| Intervalo entre snapshots (ms) | 100.1 | 104.6 | 109.8 | — |

Banda recebida por cliente: média 9.9 KB/s (máx 10.1 KB/s). Erros: 0.
Atraso do próprio gerador de carga (p95/máx): 0.2/1.6 ms.

Resultado: **aprovado** (critério: nenhum tick acima de 50 ms com todos conectados).
