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

## Nova medição com a versão do teste público (2026-11-20)

Mesmo comando, com comércio, clãs, duelos, moderação e campos novos nos snapshots (`cl`, `oh`), numa máquina de
4 núcleos **compartilhada** com outros processos pesados (testes e exportações rodando ao mesmo tempo):

| Servidor | p50 | p95 | p99 | máx |
|---|---|---|---|---|
| Duração do tick (ms) | 5.5 | 9.9 | 14.8 | 28.5 |

Ticks acima de 50 ms: **0** de 598. CPU do processo: 7.5%. Memória: 145.7 MB. Banda recebida por cliente: média
9.4 KB/s (máx 9.6). Ping p99 8.7 ms; intervalo entre snapshots p99 109.4 ms. Erros: 0. Resultado: **aprovado**.
A diferença para a medição anterior (p99 10.2 ms) vem da máquina ocupada; a banda quase não mudou (+0,2 KB/s).

## Busca de caminho: antes e depois (2026-11-21)

Cada pedido `move` (e cada perseguição e volta para casa de monstro) roda uma busca na grade de navegação do mapa
(células de 0,5 m). Medido com `npm run medir-caminhos -- --pares 300 --repeticoes 15` (Node 22, mesma máquina de
4 núcleos, os dois na mesma hora; a versão de antes é a do commit 674fdd6, passada com `--nav`): casos fixos de canto a
canto nos três mapas grandes, mediana de 15 repetições, e 3.000 pedidos sorteados em todos os mapas.

| Caso | Antes (A*): mediana | Expansões | Depois (pontos de salto): mediana | Expansões |
|---|---|---|---|---|
| Galerias do Eco (2,153)→(167,2) | 77,1 ms | 54.595 | 1,00 ms | 2.589 |
| Galerias do Eco, canto a canto (4 diagonais) | 11,4–20,2 ms | 23.706–25.221 | 0,35–0,56 ms | 488–621 |
| A Cava Primeira, canto a canto (4 diagonais) | 5,7–26,3 ms | 8.035–33.636 | 0,38–0,76 ms | 317–1.065 |
| Canais da Eclusa, canto a canto (4 diagonais) | 11,5–20,7 ms | 17.523–26.032 | 0,26–0,51 ms | 297–575 |
| 3.000 pedidos sorteados: p99 / máximo de uma execução | 17,5 / 53,4 ms | — | 0,55 / 1,47 ms | — |
| Pior pedido (mediana das repetições) | 77,1 ms | — | 1,00 ms | — |

A 20 pedidos por segundo do pior caso, a busca de antes ocupava 1,5 s de processamento a cada segundo (o tick de
100 ms travava); a de agora, 20 ms. Em outra rodada, com a máquina menos ocupada, o pior caso de antes ficou em 52 ms e
o de agora em 1,1 ms. O máximo de uma execução isolada passa de 1 ms só em pausas do coletor de lixo ou da máquina
(5,8 ms uma vez em 195 execuções dos casos fixos). O preparo da grade, feito uma vez quando a zona sobe, passou de
~1 ms para 6–27 ms por mapa (tabelas de saltos, regiões e folga).

**O que mudou** (D149): a busca é A* com **pontos de salto** (JPS) na mesma grade e com as mesmas regras de passo (8
direções, diagonal só com os dois vizinhos retos livres, custo 1 e √2): o custo do caminho é o mesmo ótimo do A* — os
testes conferem contra um A* de referência em grades sorteadas e nos mapas reais —, mas só entram na fila de prioridade
(binária, em vetores tipados e sem alocar nada por pedido) os pontos onde o caminho pode virar; os trechos retos são
pulados com distâncias calculadas na construção da grade. Destino numa região cercada é recusado na hora, sem busca (o
A* de antes varria a região inteira até desistir), e a linha de visão da suavização pula as amostras que a folga até o
bloqueio mais próximo garante livres (resultado idêntico ao de conferir uma a uma).

**O movimento não mudou**: mesmos destinos aceitos e recusados (nenhuma diferença nos 3.000 pares sorteados), mesma
suavização, mesmo seguidor com aceleração e frenagem. Entre caminhos de custo igual na grade a escolha pode ser outra,
então o caminho suavizado às vezes muda um pouco (`npm run medir-caminhos -- --comparar /tmp/nav-antigo.js`): dos 2.921
caminhos, 60,3% saíram idênticos, 22,9% mais curtos e 16,7% mais longos, com o total 0,18% mais curto (p99 da
diferença: +2,1%; a maior, +10,8%; nos casos de canto a canto, de −0,1% a +1,4%).
