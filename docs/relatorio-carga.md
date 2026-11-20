# Teste de carga — 100 clientes (2026-11-20)

Comando: `node tools/carga.mjs --clientes 100 --duracao 60`
(100/100 conectados no mapa `estrada_velha`, medição de 60 s depois do aquecimento, snapshots por diferença e interesse).

| Servidor | p50 | p95 | p99 | máx |
|---|---|---|---|---|
| Duração do tick (ms) | 4.8 | 7.7 | 10.2 | 22.2 |

Ticks acima de 50 ms: **0** de 599. CPU do processo: 7.4%. Memória: 143.9 MB.
Banda enviada: 921.2 KB/s no total (881.9 KB/s de snapshots).

| Clientes | p50 | p95 | p99 | máx |
|---|---|---|---|---|
| Ida e volta do ping (ms) | 0.4 | 4 | 6.7 | 20 |
| Intervalo entre snapshots (ms) | 100.1 | 102.9 | 106.8 | — |

Banda recebida por cliente: média 9.2 KB/s (máx 9.4 KB/s). Erros: 0.
Atraso do próprio gerador de carga (p95/máx): 0.1/3.1 ms.

Resultado: **aprovado** (critério: nenhum tick acima de 50 ms com todos conectados).
