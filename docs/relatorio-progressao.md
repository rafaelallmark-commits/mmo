<!-- Arquivo gerado por `npm run simular-progressao` (server/tools/simular-progressao.mjs). Rode de novo para atualizar. -->

# Relatório de progressão simulada (Marco 4)

Simulação acelerada, em processo, de caça solo do nível 1 ao 20 para 8 classes, contra as metas de teste de `data/xp_table.json` (`targetMinutesToNext`, ver [docs/04](04-progressao-e-formulas.md)). Cada classe foi jogada por um bot que só caça (sem missões), com 8 sementes (1, 2, 3, 4, 5, 6, 7, 8). Os números abaixo são **médias das sementes**; a meta é considerada atingida quando o tempo fica a até ±25% dela.

Gerado em 2026-11-20 05:23 UTC · tempo real 5,4 min (3 linhas de execução) · 232 h de jogo simuladas.

```
cd server && npm run simular-progressao
```

## Resumo

- Meta só caça do 1 ao 20: **4,9 h**. Média das classes: **3,63 h** (-26%).
- Mais rápida: Tecelão da Brasa (1,92 h); mais lenta: Bastião de Bronze (6,07 h) — razão 3,2×.
- Níveis em que a média das classes sai da faixa de ±25%: 1 (-74%), 2 (-54%), 3 (-49%), 4 (-28%), 5 (-37%), 12 (-32%), 13 (-43%), 14 (-36%), 15 (-32%), 16 (-25%), 17 (-29%), 18 (-30%), 19 (-26%).
- Viagens (troca de mapa a 60 s cada: ir às novas áreas, à loja e à prova) são 22% do tempo. Recuperação fora de combate (tônico ou descanso) fica em 2–7% para as demais classes, porque os bots compram e bebem tônicos em vez de esperar a regeneração (1,5% da vida por segundo); Tecelão da Brasa passa 25% do tempo recuperando (mana: o dano vem quase todo de magia).

| Classe | Horas 1→20 (média) | Mín–máx | Desvio da meta | Abates | Mortes | Fugas | Tônicos V/M | Ouro/h saqueado | Ouro/h em tônicos | Prova |
|---|---|---|---|---|---|---|---|---|---|---|
| Tecelão da Brasa | 1,92 | 1,80–2,06 | -61% | 904 | 0,1 | 0,0 | 67 / 222 | 16.280 | 1.587 | 8/8 |
| Andarilha do Vento | 2,78 | 2,49–2,95 | -43% | 1.019 | 4,6 | 1,0 | 595 / 121 | 11.599 | 2.207 | 8/8 |
| Vigia do Espinhal | 3,24 | 2,95–3,40 | -34% | 1.018 | 4,6 | 0,8 | 640 / 136 | 10.122 | 2.427 | 8/8 |
| Escudeiro do Alvorecer | 3,64 | 3,45–3,79 | -26% | 1.098 | 6,5 | 5,6 | 740 / 127 | 7.808 | 3.483 | 8/8 |
| Lanceiro do Fosso | 3,73 | 3,61–3,88 | -24% | 1.109 | 6,3 | 8,9 | 793 / 127 | 7.769 | 3.568 | 8/8 |
| Quebraferro | 3,78 | 3,39–4,82 | -23% | 1.073 | 6,3 | 7,1 | 848 / 128 | 7.253 | 3.956 | 8/8 |
| Cantora do Véu | 3,88 | 3,70–4,11 | -21% | 942 | 1,9 | 0,1 | 82 / 362 | 7.264 | 1.627 | 8/8 |
| Bastião de Bronze | 6,07 | 4,86–7,04 | +24% | 1.137 | 12,5 | 19,6 | 1.317 / 105 | 3.406 | 3.197 | 8/8 |

### Para onde vai o tempo

Fatia do tempo total de cada classe. Viagens: trocas de mapa a 60 s cada, com a quantidade média por motivo (caça inclui trocar de área por perigo).

| Classe | Combate | Deslocamento e saque | Recuperação | Viagens | Trocas de mapa: caça / compras / prova | Cidade e prova | Caído e fugindo |
|---|---|---|---|---|---|---|---|
| Tecelão da Brasa | 38% | 16% | 25% | 20% | 14 / 6 / 3 | 1% | 0% |
| Andarilha do Vento | 73% | 7% | 3% | 16% | 17 / 7 / 3 | 1% | 0% |
| Vigia do Espinhal | 71% | 6% | 4% | 18% | 21 / 11 / 3 | 1% | 0% |
| Escudeiro do Alvorecer | 68% | 6% | 4% | 21% | 29 / 16 / 2 | 1% | 1% |
| Lanceiro do Fosso | 65% | 6% | 7% | 21% | 28 / 16 / 2 | 1% | 1% |
| Quebraferro | 64% | 6% | 6% | 24% | 32 / 20 / 2 | 1% | 1% |
| Cantora do Véu | 76% | 4% | 2% | 18% | 23 / 15 / 3 | 1% | 0% |
| Bastião de Bronze | 58% | 4% | 7% | 29% | 58 / 45 / 2 | 0% | 1% |

## Tempo por nível: média das classes × meta

Minutos simulados para sair de cada nível. "Fora" marca a média fora de ±25% da meta; a coluna seguinte conta quantas classes, individualmente, ficaram fora.

| Nível | Meta (min) | Média (min) | Desvio | Faixa | Classes fora | Mais rápida | Mais lenta | Abates/min | Mortes |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 2,0 | 0,5 | -74% | **fora** | 8/8 | Tecelão da Brasa 0,2 | Cantora do Véu 0,8 | 13,5 | 0,00 |
| 2 | 3,5 | 1,6 | -54% | **fora** | 8/8 | Tecelão da Brasa 1,3 | Bastião de Bronze 2,2 | 7,1 | 0,00 |
| 3 | 5,0 | 2,6 | -49% | **fora** | 8/8 | Tecelão da Brasa 2,1 | Cantora do Véu 3,3 | 6,0 | 0,00 |
| 4 | 6,5 | 4,7 | -28% | **fora** | 5/8 | Tecelão da Brasa 3,2 | Bastião de Bronze 7,4 | 5,3 | 0,00 |
| 5 | 8,0 | 5,1 | -37% | **fora** | 6/8 | Vigia do Espinhal 4,1 | Bastião de Bronze 6,3 | 5,1 | 0,00 |
| 6 | 9,5 | 8,1 | -15% | ok | 3/8 | Andarilha do Vento 4,7 | Bastião de Bronze 11,4 | 4,1 | 0,00 |
| 7 | 11,0 | 10,1 | -9% | ok | 3/8 | Tecelão da Brasa 5,3 | Bastião de Bronze 13,9 | 4,0 | 0,02 |
| 8 | 12,5 | 10,0 | -20% | ok | 5/8 | Tecelão da Brasa 5,7 | Bastião de Bronze 16,1 | 4,5 | 0,03 |
| 9 | 14,0 | 11,9 | -15% | ok | 2/8 | Tecelão da Brasa 6,3 | Bastião de Bronze 16,9 | 4,2 | 0,52 |
| 10 | 15,5 | 16,7 | +8% | ok | 3/8 | Tecelão da Brasa 10,5 | Cantora do Véu 21,4 | 4,1 | 0,81 |
| 11 | 17,0 | 15,8 | -7% | ok | 3/8 | Tecelão da Brasa 4,3 | Bastião de Bronze 22,7 | 6,5 | 0,78 |
| 12 | 18,5 | 12,6 | -32% | **fora** | 6/8 | Tecelão da Brasa 5,6 | Cantora do Véu 19,8 | 5,3 | 0,03 |
| 13 | 20,0 | 11,4 | -43% | **fora** | 6/8 | Tecelão da Brasa 7,2 | Cantora do Véu 16,6 | 5,6 | 0,00 |
| 14 | 21,5 | 13,7 | -36% | **fora** | 6/8 | Tecelão da Brasa 8,2 | Cantora do Véu 23,0 | 5,6 | 0,57 |
| 15 | 23,0 | 15,5 | -32% | **fora** | 7/8 | Tecelão da Brasa 11,4 | Bastião de Bronze 25,9 | 5,5 | 0,52 |
| 16 | 24,5 | 18,4 | -25% | **fora** | 3/8 | Tecelão da Brasa 7,9 | Bastião de Bronze 29,6 | 5,9 | 0,50 |
| 17 | 26,0 | 18,4 | -29% | **fora** | 5/8 | Tecelão da Brasa 8,7 | Bastião de Bronze 35,4 | 5,3 | 0,60 |
| 18 | 27,5 | 19,4 | -30% | **fora** | 7/8 | Tecelão da Brasa 7,4 | Bastião de Bronze 43,8 | 5,7 | 0,50 |
| 19 | 29,0 | 21,5 | -26% | **fora** | 7/8 | Tecelão da Brasa 10,2 | Bastião de Bronze 53,0 | 5,9 | 0,49 |

### Minutos por nível e classe

| Nível | Meta | Tecelão da Brasa | Andarilha do Vento | Vigia do Espinhal | Escudeiro do Alvorecer | Lanceiro do Fosso | Quebraferro | Cantora do Véu | Bastião de Bronze |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 2,0 | **0,2** | **0,4** | **0,5** | **0,5** | **0,5** | **0,5** | **0,8** | **0,7** |
| 2 | 3,5 | **1,3** | **1,3** | **1,3** | **1,6** | **1,8** | **1,6** | **1,8** | **2,2** |
| 3 | 5,0 | **2,1** | **2,3** | **2,8** | **2,2** | **2,6** | **2,2** | **3,3** | **2,8** |
| 4 | 6,5 | **3,2** | **3,9** | **3,8** | **4,4** | 5,0 | **4,4** | 5,2 | 7,4 |
| 5 | 8,0 | **5,1** | **4,1** | **4,1** | **4,7** | **5,5** | **4,8** | 6,1 | 6,3 |
| 6 | 9,5 | **4,8** | **4,7** | **5,1** | 9,7 | 9,9 | 9,0 | 10,2 | 11,4 |
| 7 | 11,0 | **5,3** | 9,1 | 9,1 | **7,3** | 12,3 | 10,8 | 12,7 | **13,9** |
| 8 | 12,5 | **5,7** | **6,4** | **7,1** | 10,6 | 11,6 | **8,5** | 13,9 | **16,1** |
| 9 | 14,0 | **6,3** | **7,2** | 12,0 | 12,7 | 12,2 | 12,5 | 15,1 | 16,9 |
| 10 | 15,5 | **10,5** | 15,2 | 15,1 | 17,5 | 16,9 | 16,4 | **21,4** | **20,4** |
| 11 | 17,0 | **4,3** | **12,5** | 14,6 | 17,6 | 16,9 | 17,9 | 19,9 | **22,7** |
| 12 | 18,5 | **5,6** | **9,7** | **11,3** | **12,0** | **11,7** | **11,6** | 19,8 | 18,8 |
| 13 | 20,0 | **7,2** | **9,2** | **10,0** | **10,8** | **10,6** | **11,1** | 16,6 | 15,7 |
| 14 | 21,5 | **8,2** | **8,5** | **11,1** | **12,8** | **12,2** | **12,7** | 23,0 | 21,3 |
| 15 | 23,0 | **11,4** | **12,4** | **14,6** | **15,0** | **16,5** | **16,6** | **11,9** | 25,9 |
| 16 | 24,5 | **7,9** | **17,7** | 20,0 | 19,6 | 21,0 | 20,9 | **10,3** | 29,6 |
| 17 | 26,0 | **8,7** | **13,0** | **16,1** | 20,6 | 19,7 | 20,6 | **13,1** | **35,4** |
| 18 | 27,5 | **7,4** | **14,3** | **17,0** | **17,9** | **19,4** | 22,8 | **12,6** | **43,8** |
| 19 | 29,0 | **10,2** | **14,8** | **18,7** | **20,9** | **17,7** | 21,9 | **15,0** | **53,0** |

Negrito: fora de ±25% da meta.

## Detalhe por classe

### Tecelão da Brasa (`emberweaver`)

1,92 h do 1 ao 20 (-61% da meta; 8/8 execuções concluídas). Plano de atributos: example_builds.json (emberweaver_magic). Tempo: combate 38%, deslocamento e saque 16%, recuperação 25%, viagens 20%, cidade e prova 1%, caído/fugindo 0%. Dano por fonte: Faísca de Vidro 57%, ataque básico 19%, Chão em Brasa 17%, Círculo de Fuligem 7%, queimadura do escudo 1%; acerto 100%; 2.328 de dano causado e 121 recebido por minuto.

| Nível | Min | Meta | Desvio | Abates | Abates/min | Mortes | Fugas | Tônicos V/M | Ouro saqueado | Ouro gasto | XP de abates | Monstro principal |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **0,2** | 2,0 | -90% | 6 | 29,8 | 0,0 | 0,0 | 0 / 0 | 20 | 0 | 84 | Rato de Sulco (1) |
| 2 | **1,3** | 3,5 | -64% | 11 | 8,8 | 0,0 | 0,0 | 0 / 0 | 44 | 0 | 263 | Besouro-Brasa (2) |
| 3 | **2,1** | 5,0 | -58% | 15 | 7,1 | 0,0 | 0,0 | 1 / 1 | 52 | 0 | 570 | Cão de Ferrugem (3) |
| 4 | **3,2** | 6,5 | -50% | 20 | 6,3 | 0,0 | 0,0 | 0 / 0 | 87 | 0 | 1.041 | Lagarto de Lastro (4) |
| 5 | **5,1** | 8,0 | -37% | 24 | 4,8 | 0,0 | 0,0 | 0 / 0 | 96 | 0 | 1.680 | Sapo-Bomba (5) |
| 6 | **4,8** | 9,5 | -50% | 29 | 6,0 | 0,0 | 0,0 | 2 / 8 | 305 | 140 | 2.556 | Enguia de Lodo (6) |
| 7 | **5,3** | 11,0 | -52% | 34 | 6,4 | 0,0 | 0,0 | 4 / 10 | 387 | 251 | 3.616 | Válvula Errante (7) |
| 8 | **5,7** | 12,5 | -54% | 35 | 6,1 | 0,0 | 0,0 | 2 / 8 | 530 | 0 | 4.872 | Garça de Ferrugem (8) |
| 9 | **6,3** | 14,0 | -55% | 42 | 6,7 | 0,0 | 0,0 | 7 / 14 | 442 | 197 | 6.426 | Autômato Escavador (9) |
| 10 | **10,5** | 15,5 | -33% | 53 | 5,1 | 0,1 | 0,0 | 13 / 21 | 865 | 432 | 8.295 | Rato-Engrenagem (10) |
| 11 | **4,3** | 17,0 | -75% | 52 | 12,1 | 0,0 | 0,0 | 6 / 21 | 1.375 | 0 | 10.287 | Soldador Cego (11) |
| 12 | **5,6** | 18,5 | -70% | 56 | 9,9 | 0,0 | 0,0 | 6 / 18 | 1.331 | 0 | 12.651 | Lâmina de Esteira (12) |
| 13 | **7,2** | 20,0 | -64% | 60 | 8,4 | 0,0 | 0,0 | 6 / 9 | 2.455 | 0 | 15.300 | Larva Térmica (13) |
| 14 | **8,2** | 21,5 | -62% | 65 | 7,9 | 0,0 | 0,0 | 5 / 14 | 2.467 | 257 | 18.289 | Ecoante (14) |
| 15 | **11,4** | 23,0 | -51% | 69 | 6,1 | 0,0 | 0,0 | 1 / 17 | 2.732 | 1.013 | 21.558 | Guardião de Galeria (15) |
| 16 | **7,9** | 24,5 | -68% | 74 | 9,4 | 0,0 | 0,0 | 6 / 20 | 2.937 | 504 | 25.208 | Aranha de Conduto (16) |
| 17 | **8,7** | 26,0 | -67% | 79 | 9,0 | 0,0 | 0,0 | 3 / 20 | 4.359 | 252 | 29.063 | Draga Viva (17) |
| 18 | **7,4** | 27,5 | -73% | 83 | 11,2 | 0,0 | 0,0 | 4 / 22 | 4.901 | 0 | 33.374 | Escória Pressurizada (18) |
| 19 | **10,2** | 29,0 | -65% | 99 | 9,7 | 0,0 | 0,0 | 2 / 20 | 5.859 | 0 | 38.019 | Escória Pressurizada (18) |

### Andarilha do Vento (`windwalker`)

2,78 h do 1 ao 20 (-43% da meta; 8/8 execuções concluídas). Plano de atributos: gerado (requisitos das faixas + Agilidade/Vitalidade 2:3). Tempo: combate 73%, deslocamento e saque 7%, recuperação 3%, viagens 16%, cidade e prova 1%, caído/fugindo 0%. Dano por fonte: ataque básico 84%, Arremesso de Retorno 15%, Rajada Cortante 2%; acerto 95%; 1.647 de dano causado e 413 recebido por minuto.

| Nível | Min | Meta | Desvio | Abates | Abates/min | Mortes | Fugas | Tônicos V/M | Ouro saqueado | Ouro gasto | XP de abates | Monstro principal |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **0,4** | 2,0 | -78% | 6 | 13,6 | 0,0 | 0,0 | 0 / 0 | 20 | 0 | 84 | Rato de Sulco (1) |
| 2 | **1,3** | 3,5 | -62% | 11 | 8,3 | 0,0 | 0,0 | 0 / 0 | 42 | 0 | 263 | Besouro-Brasa (2) |
| 3 | **2,3** | 5,0 | -53% | 15 | 6,4 | 0,0 | 0,0 | 4 / 1 | 52 | 0 | 570 | Cão de Ferrugem (3) |
| 4 | **3,9** | 6,5 | -40% | 21 | 5,3 | 0,0 | 0,0 | 4 / 1 | 90 | 0 | 1.041 | Lagarto de Lastro (4) |
| 5 | **4,1** | 8,0 | -49% | 24 | 5,9 | 0,0 | 0,0 | 4 / 2 | 97 | 0 | 1.680 | Sapo-Bomba (5) |
| 6 | **4,7** | 9,5 | -51% | 29 | 6,2 | 0,0 | 0,1 | 22 / 3 | 262 | 44 | 2.559 | Enguia de Lodo (6) |
| 7 | 9,1 | 11,0 | -17% | 35 | 3,8 | 0,0 | 0,4 | 33 / 3 | 358 | 555 | 3.603 | Válvula Errante (7) |
| 8 | **6,4** | 12,5 | -49% | 36 | 5,6 | 0,0 | 0,0 | 26 / 4 | 519 | 0 | 4.901 | Garça de Ferrugem (8) |
| 9 | **7,2** | 14,0 | -49% | 44 | 6,1 | 0,3 | 0,0 | 46 / 4 | 475 | 0 | 6.431 | Autômato Escavador (9) |
| 10 | 15,2 | 15,5 | -2% | 67 | 4,4 | 0,9 | 0,1 | 24 / 13 | 857 | 841 | 8.208 | Garça de Ferrugem (8) |
| 11 | **12,5** | 17,0 | -26% | 77 | 6,1 | 0,6 | 0,1 | 47 / 8 | 1.145 | 175 | 10.317 | Garça de Ferrugem (8) |
| 12 | **9,7** | 18,5 | -48% | 56 | 5,8 | 0,0 | 0,0 | 24 / 6 | 1.367 | 0 | 12.721 | Lâmina de Esteira (12) |
| 13 | **9,2** | 20,0 | -54% | 60 | 6,5 | 0,0 | 0,0 | 14 / 6 | 2.382 | 0 | 15.300 | Larva Térmica (13) |
| 14 | **8,5** | 21,5 | -61% | 64 | 7,6 | 0,1 | 0,0 | 42 / 9 | 2.404 | 0 | 18.198 | Ecoante (14) |
| 15 | **12,4** | 23,0 | -46% | 81 | 6,5 | 0,8 | 0,1 | 54 / 10 | 3.030 | 407 | 21.523 | Guardião de Galeria (15) |
| 16 | **17,7** | 24,5 | -28% | 109 | 6,2 | 0,8 | 0,1 | 54 / 14 | 4.116 | 1.715 | 25.205 | Larva Térmica (13) |
| 17 | **13,0** | 26,0 | -50% | 82 | 6,3 | 0,4 | 0,0 | 59 / 10 | 4.527 | 534 | 29.162 | Draga Viva (17) |
| 18 | **14,3** | 27,5 | -48% | 92 | 6,4 | 0,6 | 0,0 | 71 / 13 | 4.527 | 1.132 | 33.388 | Escória Pressurizada (18) |
| 19 | **14,8** | 29,0 | -49% | 111 | 7,5 | 0,3 | 0,0 | 67 / 16 | 5.988 | 737 | 37.995 | Escória Pressurizada (18) |

### Vigia do Espinhal (`warden`)

3,24 h do 1 ao 20 (-34% da meta; 8/8 execuções concluídas). Plano de atributos: gerado (requisitos das faixas + Agilidade/Vitalidade 2:3). Tempo: combate 71%, deslocamento e saque 6%, recuperação 4%, viagens 18%, cidade e prova 1%, caído/fugindo 0%. Dano por fonte: ataque básico 91%, Chuva de Espinhos 5%, Flecha de Passagem 4%; acerto 97%; 1.401 de dano causado e 381 recebido por minuto.

| Nível | Min | Meta | Desvio | Abates | Abates/min | Mortes | Fugas | Tônicos V/M | Ouro saqueado | Ouro gasto | XP de abates | Monstro principal |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **0,5** | 2,0 | -74% | 6 | 11,6 | 0,0 | 0,0 | 0 / 0 | 19 | 0 | 84 | Rato de Sulco (1) |
| 2 | **1,3** | 3,5 | -63% | 11 | 8,4 | 0,0 | 0,0 | 0 / 0 | 45 | 0 | 264 | Besouro-Brasa (2) |
| 3 | **2,8** | 5,0 | -44% | 15 | 5,4 | 0,0 | 0,0 | 4 / 1 | 57 | 0 | 570 | Cão de Ferrugem (3) |
| 4 | **3,8** | 6,5 | -41% | 21 | 5,5 | 0,0 | 0,0 | 6 / 2 | 89 | 0 | 1.047 | Lagarto de Lastro (4) |
| 5 | **4,1** | 8,0 | -49% | 24 | 5,9 | 0,0 | 0,0 | 3 / 4 | 101 | 0 | 1.680 | Sapo-Bomba (5) |
| 6 | **5,1** | 9,5 | -46% | 29 | 5,6 | 0,0 | 0,0 | 23 / 3 | 313 | 61 | 2.537 | Enguia de Lodo (6) |
| 7 | 9,1 | 11,0 | -18% | 34 | 3,7 | 0,0 | 0,3 | 37 / 4 | 370 | 460 | 3.628 | Válvula Errante (7) |
| 8 | **7,1** | 12,5 | -43% | 35 | 4,9 | 0,0 | 0,0 | 24 / 5 | 515 | 0 | 4.898 | Garça de Ferrugem (8) |
| 9 | 12,0 | 14,0 | -14% | 42 | 3,5 | 0,1 | 0,1 | 44 / 6 | 442 | 597 | 6.415 | Autômato Escavador (9) |
| 10 | 15,1 | 15,5 | -3% | 61 | 4,1 | 0,8 | 0,0 | 32 / 14 | 851 | 337 | 8.247 | Garça de Ferrugem (8) |
| 11 | 14,6 | 17,0 | -14% | 98 | 6,7 | 1,0 | 0,0 | 40 / 13 | 1.332 | 0 | 10.261 | Garça de Ferrugem (8) |
| 12 | **11,3** | 18,5 | -39% | 64 | 5,7 | 0,0 | 0,0 | 39 / 9 | 1.388 | 0 | 12.747 | Lâmina de Esteira (12) |
| 13 | **10,0** | 20,0 | -50% | 60 | 6,0 | 0,0 | 0,0 | 18 / 7 | 2.348 | 0 | 15.300 | Larva Térmica (13) |
| 14 | **11,1** | 21,5 | -48% | 68 | 6,1 | 0,9 | 0,0 | 52 / 9 | 2.601 | 0 | 18.244 | Ecoante (14) |
| 15 | **14,6** | 23,0 | -36% | 84 | 5,7 | 0,8 | 0,0 | 49 / 12 | 3.211 | 395 | 21.501 | Larva Térmica (13) |
| 16 | 20,0 | 24,5 | -18% | 102 | 5,1 | 0,6 | 0,0 | 57 / 12 | 3.904 | 1.313 | 25.174 | Larva Térmica (13) |
| 17 | **16,1** | 26,0 | -38% | 79 | 4,9 | 0,3 | 0,1 | 65 / 10 | 4.408 | 1.068 | 29.125 | Draga Viva (17) |
| 18 | **17,0** | 27,5 | -38% | 86 | 5,1 | 0,1 | 0,0 | 73 / 12 | 4.834 | 1.647 | 33.399 | Escória Pressurizada (18) |
| 19 | **18,7** | 29,0 | -36% | 100 | 5,4 | 0,1 | 0,3 | 76 / 15 | 5.951 | 1.981 | 38.069 | Escória Pressurizada (18) |

### Escudeiro do Alvorecer (`dawnshield`)

3,64 h do 1 ao 20 (-26% da meta; 8/8 execuções concluídas). Plano de atributos: gerado (requisitos das faixas + Força/Vitalidade 2:3). Tempo: combate 68%, deslocamento e saque 6%, recuperação 4%, viagens 21%, cidade e prova 1%, caído/fugindo 1%. Dano por fonte: ataque básico 77%, Corte Solar 16%, dano sagrado extra 4%, Lâmina do Meio-Dia 3%; acerto 83%; 1.299 de dano causado e 428 recebido por minuto.

| Nível | Min | Meta | Desvio | Abates | Abates/min | Mortes | Fugas | Tônicos V/M | Ouro saqueado | Ouro gasto | XP de abates | Monstro principal |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **0,5** | 2,0 | -77% | 6 | 12,9 | 0,0 | 0,0 | 0 / 0 | 20 | 0 | 84 | Rato de Sulco (1) |
| 2 | **1,6** | 3,5 | -55% | 11 | 7,0 | 0,0 | 0,0 | 0 / 0 | 44 | 0 | 260 | Besouro-Brasa (2) |
| 3 | **2,2** | 5,0 | -56% | 15 | 6,9 | 0,0 | 0,0 | 6 / 0 | 17 | 0 | 570 | Cão de Ferrugem (3) |
| 4 | **4,4** | 6,5 | -33% | 26 | 5,9 | 0,0 | 0,5 | 6 / 1 | 97 | 0 | 1.048 | Cão de Ferrugem (3) |
| 5 | **4,7** | 8,0 | -41% | 25 | 5,3 | 0,0 | 0,0 | 3 / 5 | 144 | 0 | 1.688 | Sapo-Bomba (5) |
| 6 | 9,7 | 9,5 | +2% | 29 | 3,0 | 0,0 | 1,5 | 26 / 2 | 133 | 345 | 2.554 | Enguia de Lodo (6) |
| 7 | **7,3** | 11,0 | -34% | 37 | 5,1 | 0,0 | 1,0 | 47 / 3 | 324 | 81 | 3.601 | Válvula Errante (7) |
| 8 | 10,6 | 12,5 | -15% | 48 | 4,6 | 0,0 | 0,5 | 28 / 7 | 514 | 226 | 4.880 | Garça de Ferrugem (8) |
| 9 | 12,7 | 14,0 | -9% | 46 | 3,6 | 0,8 | 0,4 | 54 / 5 | 377 | 383 | 6.441 | Autômato Escavador (9) |
| 10 | 17,5 | 15,5 | +13% | 69 | 4,0 | 1,0 | 0,3 | 40 / 11 | 739 | 458 | 8.230 | Garça de Ferrugem (8) |
| 11 | 17,6 | 17,0 | +3% | 112 | 6,4 | 1,0 | 0,0 | 49 / 14 | 1.388 | 0 | 10.268 | Garça de Ferrugem (8) |
| 12 | **12,0** | 18,5 | -35% | 56 | 4,7 | 0,0 | 0,0 | 26 / 8 | 1.361 | 0 | 12.768 | Lâmina de Esteira (12) |
| 13 | **10,8** | 20,0 | -46% | 60 | 5,5 | 0,0 | 0,0 | 20 / 5 | 2.369 | 0 | 15.300 | Larva Térmica (13) |
| 14 | **12,8** | 21,5 | -41% | 72 | 5,6 | 0,9 | 0,0 | 38 / 10 | 2.608 | 407 | 18.220 | Larva Térmica (13) |
| 15 | **15,0** | 23,0 | -35% | 89 | 6,0 | 0,9 | 0,0 | 46 / 10 | 3.185 | 392 | 21.560 | Larva Térmica (13) |
| 16 | 19,6 | 24,5 | -20% | 112 | 5,7 | 0,8 | 0,3 | 72 / 13 | 3.679 | 1.891 | 25.083 | Larva Térmica (13) |
| 17 | 20,6 | 26,0 | -21% | 96 | 4,6 | 1,3 | 0,4 | 85 / 11 | 3.397 | 2.666 | 29.135 | Draga Viva (17) |
| 18 | **17,9** | 27,5 | -35% | 90 | 5,0 | 0,0 | 0,5 | 90 / 11 | 3.971 | 1.992 | 33.580 | Escória Pressurizada (18) |
| 19 | **20,9** | 29,0 | -28% | 100 | 4,8 | 0,0 | 0,4 | 104 / 11 | 4.042 | 3.833 | 37.894 | Escória Pressurizada (18) |

### Lanceiro do Fosso (`pikeman`)

3,73 h do 1 ao 20 (-24% da meta; 8/8 execuções concluídas). Plano de atributos: gerado (requisitos das faixas + Força/Vitalidade 2:3). Tempo: combate 65%, deslocamento e saque 6%, recuperação 7%, viagens 21%, cidade e prova 1%, caído/fugindo 1%. Dano por fonte: ataque básico 82%, Estocada Longa 12%, Avanço do Fosso 4%, Linha Partida 2%; acerto 88%; 1.302 de dano causado e 429 recebido por minuto.

| Nível | Min | Meta | Desvio | Abates | Abates/min | Mortes | Fugas | Tônicos V/M | Ouro saqueado | Ouro gasto | XP de abates | Monstro principal |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **0,5** | 2,0 | -74% | 6 | 11,6 | 0,0 | 0,0 | 0 / 0 | 20 | 0 | 84 | Rato de Sulco (1) |
| 2 | **1,8** | 3,5 | -49% | 11 | 6,2 | 0,0 | 0,0 | 0 / 0 | 45 | 0 | 264 | Besouro-Brasa (2) |
| 3 | **2,6** | 5,0 | -48% | 15 | 5,8 | 0,0 | 0,4 | 9 / 1 | 29 | 0 | 570 | Cão de Ferrugem (3) |
| 4 | 5,0 | 6,5 | -23% | 27 | 5,4 | 0,0 | 1,4 | 8 / 3 | 121 | 0 | 1.036 | Cão de Ferrugem (3) |
| 5 | **5,5** | 8,0 | -31% | 25 | 4,5 | 0,0 | 0,0 | 3 / 5 | 116 | 0 | 1.685 | Sapo-Bomba (5) |
| 6 | 9,9 | 9,5 | +4% | 29 | 2,9 | 0,0 | 1,4 | 34 / 2 | 130 | 320 | 2.554 | Enguia de Lodo (6) |
| 7 | 12,3 | 11,0 | +12% | 40 | 3,3 | 0,1 | 2,9 | 42 / 3 | 337 | 242 | 3.588 | Válvula Errante (7) |
| 8 | 11,6 | 12,5 | -7% | 54 | 4,7 | 0,0 | 1,0 | 33 / 5 | 461 | 126 | 4.892 | Sapo-Bomba (5) |
| 9 | 12,2 | 14,0 | -13% | 49 | 4,0 | 1,0 | 0,4 | 45 / 5 | 457 | 258 | 6.479 | Garça de Ferrugem (8) |
| 10 | 16,9 | 15,5 | +9% | 75 | 4,4 | 1,0 | 0,0 | 36 / 13 | 817 | 559 | 8.202 | Garça de Ferrugem (8) |
| 11 | 16,9 | 17,0 | -1% | 110 | 6,5 | 1,0 | 0,0 | 56 / 11 | 1.335 | 0 | 10.291 | Garça de Ferrugem (8) |
| 12 | **11,7** | 18,5 | -37% | 56 | 4,8 | 0,0 | 0,0 | 41 / 5 | 1.311 | 0 | 12.768 | Lâmina de Esteira (12) |
| 13 | **10,6** | 20,0 | -47% | 60 | 5,7 | 0,0 | 0,0 | 24 / 6 | 2.326 | 0 | 15.300 | Larva Térmica (13) |
| 14 | **12,2** | 21,5 | -43% | 73 | 6,0 | 1,0 | 0,0 | 43 / 6 | 2.719 | 0 | 18.244 | Larva Térmica (13) |
| 15 | **16,5** | 23,0 | -28% | 91 | 5,5 | 0,9 | 0,0 | 52 / 12 | 3.276 | 809 | 21.498 | Larva Térmica (13) |
| 16 | 21,0 | 24,5 | -14% | 115 | 5,5 | 0,6 | 0,4 | 75 / 13 | 3.919 | 1.947 | 25.151 | Larva Térmica (13) |
| 17 | 19,7 | 26,0 | -24% | 85 | 4,3 | 0,5 | 0,4 | 93 / 12 | 2.305 | 3.013 | 29.074 | Aranha de Conduto (16) |
| 18 | **19,4** | 27,5 | -29% | 90 | 4,6 | 0,1 | 0,5 | 100 / 13 | 4.382 | 3.716 | 33.470 | Escória Pressurizada (18) |
| 19 | **17,7** | 29,0 | -39% | 99 | 5,6 | 0,0 | 0,3 | 100 / 14 | 4.902 | 2.330 | 37.990 | Escória Pressurizada (18) |

### Quebraferro (`breaker`)

3,78 h do 1 ao 20 (-23% da meta; 8/8 execuções concluídas). Plano de atributos: example_builds.json (breaker_physical). Tempo: combate 64%, deslocamento e saque 6%, recuperação 6%, viagens 24%, cidade e prova 1%, caído/fugindo 1%. Dano por fonte: ataque básico 81%, Talho Profundo 13%, dano contínuo 3%, Ruptura 3%; acerto 90%; 1.248 de dano causado e 463 recebido por minuto.

| Nível | Min | Meta | Desvio | Abates | Abates/min | Mortes | Fugas | Tônicos V/M | Ouro saqueado | Ouro gasto | XP de abates | Monstro principal |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **0,5** | 2,0 | -74% | 6 | 11,4 | 0,0 | 0,0 | 0 / 0 | 20 | 0 | 84 | Rato de Sulco (1) |
| 2 | **1,6** | 3,5 | -53% | 11 | 6,7 | 0,0 | 0,0 | 0 / 0 | 46 | 0 | 264 | Besouro-Brasa (2) |
| 3 | **2,2** | 5,0 | -56% | 15 | 6,8 | 0,0 | 0,1 | 9 / 1 | 34 | 0 | 570 | Cão de Ferrugem (3) |
| 4 | **4,4** | 6,5 | -32% | 26 | 5,8 | 0,0 | 0,5 | 8 / 2 | 107 | 0 | 1.046 | Cão de Ferrugem (3) |
| 5 | **4,8** | 8,0 | -40% | 25 | 5,2 | 0,0 | 0,0 | 4 / 5 | 125 | 0 | 1.684 | Sapo-Bomba (5) |
| 6 | 9,0 | 9,5 | -5% | 29 | 3,2 | 0,0 | 1,1 | 32 / 2 | 136 | 301 | 2.548 | Enguia de Lodo (6) |
| 7 | 10,8 | 11,0 | -2% | 37 | 3,4 | 0,0 | 2,1 | 41 / 3 | 320 | 351 | 3.590 | Válvula Errante (7) |
| 8 | **8,5** | 12,5 | -32% | 38 | 4,4 | 0,0 | 0,5 | 37 / 5 | 555 | 40 | 4.890 | Garça de Ferrugem (8) |
| 9 | 12,5 | 14,0 | -11% | 49 | 4,0 | 0,9 | 0,0 | 34 / 5 | 503 | 107 | 6.454 | Garça de Ferrugem (8) |
| 10 | 16,4 | 15,5 | +6% | 70 | 4,2 | 1,0 | 0,0 | 36 / 11 | 732 | 691 | 8.222 | Garça de Ferrugem (8) |
| 11 | 17,9 | 17,0 | +5% | 111 | 6,2 | 1,0 | 0,0 | 55 / 12 | 1.319 | 64 | 10.287 | Garça de Ferrugem (8) |
| 12 | **11,6** | 18,5 | -37% | 56 | 4,8 | 0,0 | 0,0 | 37 / 8 | 1.359 | 0 | 12.768 | Lâmina de Esteira (12) |
| 13 | **11,1** | 20,0 | -45% | 60 | 5,4 | 0,0 | 0,0 | 25 / 7 | 2.439 | 0 | 15.300 | Larva Térmica (13) |
| 14 | **12,7** | 21,5 | -41% | 72 | 5,7 | 0,9 | 0,1 | 46 / 8 | 2.509 | 407 | 18.219 | Larva Térmica (13) |
| 15 | **16,6** | 23,0 | -28% | 83 | 5,0 | 0,5 | 0,3 | 66 / 10 | 3.025 | 1.235 | 21.512 | Larva Térmica (13) |
| 16 | 20,9 | 24,5 | -15% | 107 | 5,1 | 0,6 | 0,4 | 81 / 16 | 3.492 | 3.191 | 25.153 | Larva Térmica (13) |
| 17 | 20,6 | 26,0 | -21% | 86 | 4,2 | 0,5 | 0,5 | 108 / 9 | 1.718 | 2.774 | 29.153 | Draga Viva (17) |
| 18 | 22,8 | 27,5 | -17% | 90 | 4,0 | 0,5 | 0,9 | 109 / 13 | 4.290 | 3.247 | 33.329 | Escória Pressurizada (18) |
| 19 | 21,9 | 29,0 | -25% | 104 | 4,8 | 0,4 | 0,6 | 120 / 14 | 4.704 | 2.553 | 38.099 | Escória Pressurizada (18) |

### Cantora do Véu (`veilsinger`)

3,88 h do 1 ao 20 (-21% da meta; 8/8 execuções concluídas). Plano de atributos: gerado (requisitos das faixas + Espírito/Vitalidade 2:3). Tempo: combate 76%, deslocamento e saque 4%, recuperação 2%, viagens 18%, cidade e prova 1%, caído/fugindo 0%. Dano por fonte: ataque básico 63%, Nota Clara 37%; acerto 100%; 1.161 de dano causado e 651 recebido por minuto; 349 de cura por minuto.

| Nível | Min | Meta | Desvio | Abates | Abates/min | Mortes | Fugas | Tônicos V/M | Ouro saqueado | Ouro gasto | XP de abates | Monstro principal |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **0,8** | 2,0 | -61% | 6 | 7,8 | 0,0 | 0,0 | 0 / 0 | 20 | 0 | 84 | Rato de Sulco (1) |
| 2 | **1,8** | 3,5 | -47% | 11 | 6,0 | 0,0 | 0,0 | 0 / 0 | 44 | 0 | 264 | Besouro-Brasa (2) |
| 3 | **3,3** | 5,0 | -33% | 15 | 4,5 | 0,0 | 0,0 | 0 / 1 | 50 | 0 | 570 | Cão de Ferrugem (3) |
| 4 | 5,2 | 6,5 | -20% | 22 | 4,1 | 0,0 | 0,0 | 0 / 0 | 97 | 0 | 1.040 | Lagarto de Lastro (4) |
| 5 | 6,1 | 8,0 | -24% | 24 | 4,0 | 0,0 | 0,0 | 0 / 0 | 96 | 0 | 1.680 | Sapo-Bomba (5) |
| 6 | 10,2 | 9,5 | +7% | 29 | 2,8 | 0,0 | 0,1 | 8 / 11 | 188 | 247 | 2.559 | Enguia de Lodo (6) |
| 7 | 12,7 | 11,0 | +16% | 35 | 2,8 | 0,0 | 0,0 | 4 / 17 | 321 | 280 | 3.619 | Válvula Errante (7) |
| 8 | 13,9 | 12,5 | +11% | 39 | 2,8 | 0,0 | 0,0 | 6 / 6 | 459 | 170 | 4.862 | Garça de Ferrugem (8) |
| 9 | 15,1 | 14,0 | +8% | 44 | 2,9 | 0,4 | 0,0 | 9 / 23 | 377 | 355 | 6.447 | Autômato Escavador (9) |
| 10 | **21,4** | 15,5 | +38% | 61 | 2,9 | 0,8 | 0,0 | 19 / 43 | 549 | 386 | 8.239 | Garça de Ferrugem (8) |
| 11 | 19,9 | 17,0 | +17% | 61 | 3,0 | 0,4 | 0,0 | 6 / 39 | 919 | 332 | 10.322 | Soldador Cego (11) |
| 12 | 19,8 | 18,5 | +7% | 63 | 3,2 | 0,3 | 0,0 | 6 / 26 | 1.493 | 321 | 12.691 | Lâmina de Esteira (12) |
| 13 | 16,6 | 20,0 | -17% | 60 | 3,6 | 0,0 | 0,0 | 0 / 6 | 2.404 | 0 | 15.297 | Larva Térmica (13) |
| 14 | 23,0 | 21,5 | +7% | 65 | 2,8 | 0,1 | 0,0 | 10 / 45 | 1.953 | 1.744 | 18.202 | Ecoante (14) |
| 15 | **11,9** | 23,0 | -48% | 71 | 6,0 | 0,0 | 0,0 | 0 / 23 | 2.659 | 1.341 | 21.619 | Guardião de Galeria (15) |
| 16 | **10,3** | 24,5 | -58% | 74 | 7,2 | 0,0 | 0,0 | 0 / 33 | 2.465 | 0 | 25.160 | Aranha de Conduto (16) |
| 17 | **13,1** | 26,0 | -50% | 81 | 6,2 | 0,0 | 0,0 | 2 / 23 | 4.365 | 572 | 29.050 | Draga Viva (17) |
| 18 | **12,6** | 27,5 | -54% | 83 | 6,6 | 0,0 | 0,0 | 0 / 30 | 4.778 | 261 | 33.487 | Escória Pressurizada (18) |
| 19 | **15,0** | 29,0 | -48% | 99 | 6,6 | 0,0 | 0,0 | 13 / 37 | 4.945 | 306 | 37.923 | Escória Pressurizada (18) |

### Bastião de Bronze (`bastion`)

6,07 h do 1 ao 20 (+24% da meta; 8/8 execuções concluídas). Plano de atributos: gerado (requisitos das faixas + Força/Vitalidade 2:3). Tempo: combate 58%, deslocamento e saque 4%, recuperação 7%, viagens 29%, cidade e prova 0%, caído/fugindo 1%. Dano por fonte: ataque básico 98%, Pulso de Atração 1%, Engrenagem Travada 1%; acerto 88%; 807 de dano causado e 410 recebido por minuto.

| Nível | Min | Meta | Desvio | Abates | Abates/min | Mortes | Fugas | Tônicos V/M | Ouro saqueado | Ouro gasto | XP de abates | Monstro principal |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **0,7** | 2,0 | -67% | 6 | 9,2 | 0,0 | 0,0 | 0 / 0 | 22 | 0 | 84 | Rato de Sulco (1) |
| 2 | **2,2** | 3,5 | -39% | 11 | 5,1 | 0,0 | 0,0 | 0 / 0 | 44 | 0 | 264 | Besouro-Brasa (2) |
| 3 | **2,8** | 5,0 | -44% | 15 | 5,4 | 0,0 | 0,1 | 9 / 0 | 24 | 0 | 570 | Cão de Ferrugem (3) |
| 4 | 7,4 | 6,5 | +13% | 27 | 3,7 | 0,0 | 2,3 | 9 / 1 | 107 | 0 | 1.046 | Cão de Ferrugem (3) |
| 5 | 6,3 | 8,0 | -22% | 34 | 5,4 | 0,0 | 0,0 | 6 / 4 | 155 | 0 | 1.687 | Cão de Ferrugem (3) |
| 6 | 11,4 | 9,5 | +20% | 31 | 2,7 | 0,0 | 2,1 | 37 / 3 | 143 | 363 | 2.523 | Enguia de Lodo (6) |
| 7 | **13,9** | 11,0 | +27% | 46 | 3,3 | 0,0 | 3,0 | 48 / 4 | 305 | 205 | 3.608 | Enguia de Lodo (6) |
| 8 | **16,1** | 12,5 | +29% | 47 | 2,9 | 0,3 | 1,1 | 32 / 6 | 488 | 80 | 4.915 | Garça de Ferrugem (8) |
| 9 | 16,9 | 14,0 | +21% | 48 | 2,8 | 0,8 | 0,5 | 50 / 4 | 466 | 440 | 6.439 | Garça de Ferrugem (8) |
| 10 | **20,4** | 15,5 | +32% | 75 | 3,7 | 1,0 | 0,0 | 51 / 11 | 835 | 447 | 8.224 | Garça de Ferrugem (8) |
| 11 | **22,7** | 17,0 | +34% | 103 | 4,6 | 1,3 | 0,3 | 69 / 12 | 1.247 | 294 | 10.275 | Garça de Ferrugem (8) |
| 12 | 18,8 | 18,5 | +2% | 59 | 3,2 | 0,0 | 0,1 | 48 / 6 | 1.359 | 525 | 12.758 | Lâmina de Esteira (12) |
| 13 | 15,7 | 20,0 | -22% | 60 | 3,8 | 0,0 | 0,0 | 25 / 9 | 2.424 | 0 | 15.300 | Larva Térmica (13) |
| 14 | 21,3 | 21,5 | -1% | 71 | 3,3 | 0,6 | 0,4 | 53 / 8 | 2.167 | 1.580 | 18.224 | Larva Térmica (13) |
| 15 | 25,9 | 23,0 | +13% | 77 | 3,0 | 0,4 | 0,9 | 102 / 7 | 1.920 | 2.759 | 21.555 | Guardião de Galeria (15) |
| 16 | 29,6 | 24,5 | +21% | 89 | 3,0 | 0,6 | 1,1 | 159 / 9 | 1.856 | 4.164 | 25.138 | Aranha de Conduto (16) |
| 17 | **35,4** | 26,0 | +36% | 99 | 2,8 | 1,9 | 1,9 | 166 / 5 | 1.568 | 2.517 | 29.130 | Guardião de Galeria (15) |
| 18 | **43,8** | 27,5 | +59% | 106 | 2,4 | 2,6 | 3,0 | 195 / 8 | 2.603 | 2.434 | 33.323 | Vigia de Comporta (16) |
| 19 | **53,0** | 29,0 | +83% | 134 | 2,5 | 3,1 | 2,9 | 260 / 8 | 2.936 | 3.592 | 38.066 | Vigia de Comporta (16) |

## Economia: ouro ganho × gasto em tônicos

Ouro saqueado inclui só moedas (não há venda de itens no jogo). Gasto = tônicos comprados na loja da cidade com ouro real (`buy`).

| Classe | Ouro saqueado | Gasto em tônicos | Saldo no nível 20 | Ouro/h | Gasto/h | Tônicos usados (V+M) | Comprados | Idas à loja |
|---|---|---|---|---|---|---|---|---|
| Tecelão da Brasa | 31.243 | 3.045 | 28.198 | 16.280 | 1.587 | 289 | 165 | 3,0 |
| Andarilha do Vento | 32.256 | 6.138 | 26.118 | 11.599 | 2.207 | 716 | 319 | 3,1 |
| Vigia do Espinhal | 32.778 | 7.859 | 24.919 | 10.122 | 2.427 | 776 | 377 | 3,9 |
| Escudeiro do Alvorecer | 28.409 | 12.672 | 15.737 | 7.808 | 3.483 | 867 | 555 | 5,9 |
| Lanceiro do Fosso | 29.006 | 13.320 | 15.687 | 7.769 | 3.568 | 920 | 578 | 5,9 |
| Quebraferro | 27.430 | 14.960 | 12.470 | 7.253 | 3.956 | 976 | 645 | 6,6 |
| Cantora do Véu | 28.182 | 6.314 | 21.868 | 7.264 | 1.627 | 444 | 338 | 6,0 |
| Bastião de Bronze | 20.668 | 19.399 | 1.269 | 3.406 | 3.197 | 1.422 | 1.078 | 12,4 |

Por faixa de nível (média das classes): ouro saqueado por hora, gasto por hora e tônicos bebidos por hora.

| Níveis | Ouro/h | Gasto/h | Tônicos/h | Classe que mais gasta (gasto/h) |
|---|---|---|---|---|
| 1–4 | 1.349 | 0 | 77 | Tecelão da Brasa (0) |
| 5–8 | 2.312 | 1.143 | 183 | Andarilha do Vento (1.479) |
| 9–12 | 4.539 | 1.101 | 205 | Tecelão da Brasa (1.416) |
| 13–16 | 12.071 | 3.292 | 210 | Bastião de Bronze (5.519) |
| 17–19 | 16.406 | 5.127 | 280 | Lanceiro do Fosso (9.556) |

- O ouro saqueado cresce de ~1.349/h (níveis 1–4) para ~16.406/h (17–19); o gasto com tônicos acompanha o dano recebido, não o nível: classes de distância que matam antes do contato quase não compram.
- Preço dos tônicos = 2 × valor (Pequeno de Vida 8, Médio de Vida 30, Pequeno de Mana 10, Médio de Mana 36). O Pequeno cura mais por moeda (45 de vida por 8) que o Médio (140 por 30); o Médio vale pela cura por gole (recarga compartilhada de 3 s).

## Efeito da prova de classe (habilidade do nível 10)

A rodada principal faz a prova de classe no nível 10 (premissas). Para medir também a caça pura, sem nenhuma missão, as mesmas sementes foram simuladas **sem a prova**: sem a habilidade marcante do nível 10 e sem o tempo da viagem e da luta na arena. Média das classes: **3,63 h com prova** (-26% da meta) e **3,59 h sem prova** (-27%).

| Classe | Habilidade do nível 10 | Horas com prova | Horas sem prova | Diferença | Min nos níveis 10–19 (com / sem) | Mortes (com / sem) |
|---|---|---|---|---|---|---|
| Lanceiro do Fosso | Avanço do Fosso | 3,73 | 3,79 | +2% | 163 / 166 | 6,3 / 4,3 |
| Quebraferro | Ruptura | 3,78 | 3,81 | +1% | 173 / 174 | 6,3 / 7,0 |
| Cantora do Véu | Selo do Véu | 3,88 | 3,87 | -0% | 164 / 163 | 1,9 / 2,8 |
| Bastião de Bronze | Reforço de Campo | 6,07 | 6,04 | -1% | 287 / 285 | 12,5 / 11,9 |
| Vigia do Espinhal | Chuva de Espinhos | 3,24 | 3,18 | -2% | 149 / 145 | 4,6 / 3,9 |
| Andarilha do Vento | Vento a Favor | 2,78 | 2,71 | -3% | 127 / 123 | 4,6 / 3,3 |
| Tecelão da Brasa | Círculo de Fuligem | 1,92 | 1,85 | -4% | 81 / 77 | 0,1 / 0,1 |
| Escudeiro do Alvorecer | Juramento | 3,64 | 3,49 | -4% | 165 / 156 | 6,5 / 4,9 |

| Nível | Meta (min) | Média com prova | Média sem prova |
|---|---|---|---|
| 10 | 15,5 | 16,7 | 13,2 |
| 11 | 17,0 | 15,8 | 16,7 |
| 12 | 18,5 | 12,6 | 14,1 |
| 13 | 20,0 | 11,4 | 11,8 |
| 14 | 21,5 | 13,7 | 13,4 |
| 15 | 23,0 | 15,5 | 15,7 |
| 16 | 24,5 | 18,4 | 19,2 |
| 17 | 26,0 | 18,4 | 18,0 |
| 18 | 27,5 | 19,4 | 17,9 |
| 19 | 29,0 | 21,5 | 21,3 |

Prova: 64 de 64 execuções venceram (1,0 tentativa(s) por execução em média; 48 s de luta na arena). A diferença de tempo inclui a ida à cidade da classe e a volta (2 × as trocas de mapa até lá). Com a habilidade extra o bot gasta mana em mais uma habilidade; ele só usa reforços de defesa caros, escudos e áreas em volta de si quando a luta pede (vários atacantes ou vida baixa), e nunca usa área que acorde monstro parado.

## Equipamento

Peças comuns do kit da faixa (arma + mão secundária + 4 de armadura) obtidas por saque antes do nível da faixa versus modeladas como compradas/obtidas no nível da faixa (comando de mestre `give`, ver premissas).

| Classe | Kit da faixa 1 completado no início | Peças das faixas 5–17 modeladas | Peças das faixas 5–17 que já tinha por saque | Peças úteis recolhidas do chão | Exemplos |
|---|---|---|---|---|---|
| Tecelão da Brasa | 3,0 | 23,3 | 0,8 | 2,9 | `amulet_t1`, `ring_t5`, `amulet_t9`, `ring_t13`, `focus_t17`, `amulet_t13`, `amulet_t17`, `ring_t9` |
| Andarilha do Vento | 3,0 | 23,4 | 0,6 | 2,9 | `ring_t5`, `amulet_t9`, `ring_t9`, `light_boots_t13`, `light_boots_t17`, `light_shield_t17`, `javelin_t17`, `amulet_t13` |
| Vigia do Espinhal | 3,0 | 23,6 | 0,4 | 2,8 | `ring_t5`, `amulet_t5`, `ring_t13`, `ring_t17`, `ring_t9`, `amulet_t9`, `amulet_t13`, `amulet_t17` |
| Escudeiro do Alvorecer | 3,0 | 23,6 | 0,4 | 2,8 | `ring_t5`, `amulet_t17`, `amulet_t9`, `amulet_t13`, `ring_t17`, `amulet_t1`, `amulet_t5`, `heavy_boots_t17` |
| Lanceiro do Fosso | 3,0 | 19,6 | 0,4 | 3,3 | `ring_t1`, `amulet_t1`, `amulet_t5`, `amulet_t9`, `amulet_t13`, `ring_t17`, `ring_t13`, `amulet_t17` |
| Quebraferro | 3,0 | 19,9 | 0,1 | 3,0 | `ring_t5`, `amulet_t5`, `amulet_t13`, `amulet_t17`, `axe_1h_t17`, `ring_t1`, `amulet_t1`, `amulet_second_toll` |
| Cantora do Véu | 3,0 | 23,4 | 0,6 | 2,1 | `focus_t13`, `robe_t17`, `ring_t17`, `robe_gloves_t9`, `ring_t5`, `amulet_t13`, `amulet_t5`, `ring_t13` |
| Bastião de Bronze | 3,0 | 23,9 | 0,1 | 2,1 | `amulet_t17`, `ring_t17`, `amulet_t1`, `ring_t9`, `ring_t13`, `amulet_t5`, `amulet_t13`, `ring_t5` |

## Premissas do modelo

- **Só caça.** Nenhuma missão é feita nem entregue (sem XP, ouro ou itens de missão). Exceção modelada: a **prova de classe no nível 10**, porque é o que libera a habilidade do nível 10. Os pré-requisitos de "Prova de Classe" são marcados como concluídos com o comando de mestre `quest_done` (sem recompensas), a missão é aceita no mestre da classe e a prova é lutada de verdade na arena; a missão não é entregue (o XP de 1.800 não entra).
- **Ações só pelo protocolo:** move, attack, stop, cast, use_item, pickup, equip/unequip, allocate, learn_skill, buy, storage_put, respawn, quest_accept/trial_start e os comandos de mestre teleport/give/quest_done. As decisões usam a visão montada pelos snapshots e a ficha devolvida pelo pedido `char` (o bot não lê o estado interno da zona). Reação a cada 200 ms, no máximo uma habilidade por decisão e 0,5 s de pausa depois de cada abate antes de escolher o próximo alvo. É um jogador eficiente: um jogador humano tende a ser mais lento (pausas, erros de posicionamento, distração).
- **Viagem entre mapas:** teleporte de mestre até o posto de guarda do mapa (ou ao lado do NPC, na cidade) seguido de 60 s parados por troca de mapa no caminho de portais (busca em largura respeitando o nível mínimo de cada portal). Dentro do mapa o bot anda (move/attack) como um jogador.
- **Área de caça:** grupos de monstros normais com nível em [nível−2, nível+1], preferindo o próprio nível, monstros passivos e grupos agressivos menos densos; elites, chefes e elites diárias ficam de fora (só são enfrentados se atacarem). O alvo é o monstro do grupo com menos vizinhos agressivos a 8,5 m (puxar pela borda). Morte vale 3 pontos de perigo e fuga 1; 3 pontos em 10 min fazem o bot caçar um nível abaixo por 20 min, longe daquela área.
- **Tônicos:** em combate, vida abaixo de 40%; fora de combate, vida abaixo de 55% (sem tônico, descansa com `stop` até 92%). Conjuradores (Tecelão, Cantora): mana abaixo de 20% em combate e de 35% fora (sem tônico, descansa até 85%); as classes físicas não param por mana (lutam com o ataque básico). Tônico Médio só a partir do nível 9 (nível do item). Foge para o posto abaixo de 20% de vida sem tônico; caído, espera 5 s e volta ao posto (`respawn`, 50% de vida).
- **Compras:** na loja da cidade da classe (Pedrâmbar ou Vau de Nácar), com ouro de verdade (`buy`), quando restam menos de 5 tônicos e 80% do ouro compra ao menos 40 Pequenos. Estoque-alvo: 100 tônicos de vida ou o dobro do gasto no nível anterior (até 200); 60 de mana para conjuradores, 10 para os demais. A ida e a volta custam as mesmas trocas de mapa.
- **Equipamento:** recolhe ouro, tônicos e peças da própria classe (família de arma e mão secundária do kit inicial, armadura do seu peso, joias) que sejam melhores que as que tem; equipa quando cumpre os requisitos. **Kit da faixa:** se ao chegar ao nível 5, 9, 13 ou 17 o bot ainda não tem a peça comum da faixa (arma, mão secundária, 4 peças de armadura), ela é obtida com o comando de mestre `give`, como se fosse comprada/ganha fora da caça — o jogo não tem loja de equipamento e o saque raramente a entrega. Na faixa 1, o kit inicial só traz arma, corpo (e mão secundária): elmo, luvas e botas comuns também são dados no início. Sem refino no ferreiro.
- **Atributos e habilidades:** Quebraferro e Tecelão seguem os planos de `data/example_builds.json`; as demais classes usam um plano gerado no mesmo espírito (requisitos do kit da próxima faixa espalhados pelos níveis até ela e o resto 2:3 entre o atributo de dano da arma e Vitalidade), conferido nível a nível. Graus de habilidade: um ponto por nível na ordem de prioridade da classe (`server/tools/lib/progressao/planos.mjs`).
- **Peças substituídas** vão para o depósito da conta nas visitas à cidade (não há venda nem descarte).

## Problemas e observações encontrados no jogo

1. **Bug: recargas de habilidade "herdadas" travam habilidades na prova de classe (e no calabouço).** `GameServer.moveToZone` copia `p.cooldowns` para a zona de destino, mas esses valores são instantes absolutos do relógio da zona de origem (`zone.now`), e uma instância nova começa com `now = 0`. Em 64 de 64 execuções, ao entrar na Arena da Prova o personagem tinha habilidades com até 90 min de recarga restante (a maior recarga de classe é 90 s) — tudo o que foi usado no mundo aberto fica inutilizável durante a prova inteira. Reprodução direta, sem o bot e sem o modo acelerado: com o servidor ligado há 10 min, Ímpeto (recarga de 25 s) usado em Pedrâmbar e logo antes de `trial_start` responde "Ímpeto em recarga (599,0 s)" 26 s depois, dentro da arena. Num servidor ligado há dias a trava é de dias. Sugestão: guardar recargas como tempo restante ao trocar de zona (ou usar um relógio único do servidor). Os bots venceram a prova mesmo assim, só com o ataque básico e as habilidades não usadas antes.
2. **Equilíbrio entre classes na caça solo:** Tecelão da Brasa chega ao nível 20 em 1,92 h e Bastião de Bronze em 6,07 h (3,2×). Fora de ±25% da meta total: Vigia do Espinhal (-34%), Escudeiro do Alvorecer (-26%), Andarilha do Vento (-43%), Tecelão da Brasa (-61%).
3. **Tecelão da Brasa muito acima das demais:** 2.328 de dano por minuto contra 1.266 da média das outras classes, recebendo 121 por minuto (média das outras: 454). Causas medidas: Faísca de Vidro (57% do dano) soma o poder mágico inteiro da arma e do foco a cada conjuração de 2 s; magia ignora evasão e a resistência mágica dos monstros é ~2/3 da defesa; Chão em Brasa (17%) aplica o poder mágico de novo em cada um dos 4 pulsos, em todos os monstros da área; e os monstros levam ~4 s para cruzar os 16 m de alcance. Um grupo agressivo inteiro que vem pela assistência morre antes de causar dano relevante.
4. **Habilidades com pouco peso no dano solo:** Bastião de Bronze — ataque básico = 98% do dano (dano de habilidade só no Pulso de Atração (60%, e puxa até 3 monstros — perigoso solo) e, do 15 em diante, na Engrenagem Travada); Vigia do Espinhal — ataque básico = 91% do dano (a Flecha de Passagem tem recarga de 8 s e a Marca da Trilha não causa dano; o arco atira a cada 1,2 s).
5. **Cantora do Véu solo antes do nível 15:** é a classe mais lenta nos níveis 1, 3, 10, 12, 13, 14; com a Nota Clara (nível 15) passa a 37% do dano e os níveis 15–19 ficam entre os mais rápidos. As curas (349 de vida por minuto) seguram a vida, mas não aceleram o abate.
6. **Curva de XP:** a média das classes fica abaixo de −25% da meta nos níveis 1, 2, 3, 4, 5, 12, 13, 14, 15, 17, 18, 19. Os níveis 1–5 saem em poucos minutos: monstros de 45–117 de vida morrem em 2–4 golpes, os primeiros grupos são passivos e o ritmo chega a 13 abates/min no nível 1, contra os 3 abates/min da calibração. Do nível 6 ao 11 o ritmo cai para ~4 abates/min (grupos agressivos com assistência) e os tempos encostam na meta; do 12 ao 19, com o kit das faixas 9–17, a maioria das classes volta a ficar abaixo dela.
7. **Onde se morre:** níveis com mais mortes: 10 (0,81 por classe), 11 (0,78 por classe), 17 (0,60 por classe), 14 (0,57 por classe). Monstros que mais derrubam (mortes por execução, somando as classes; um monstro conta em toda morte em que estava batendo): Rato-Engrenagem (nv 10, agressivo) 10,5, Guardião de Galeria (nv 15, agressivo) 5,5, Aranha de Conduto (nv 16, agressivo) 5,0, Ecoante (nv 14, agressivo) 4,9, Autômato Escavador (nv 9, agressivo) 4,6. Quase todas acontecem em grupos agressivos densos, em que puxar um monstro traz outros pela assistência (iguais a até 8 m). Mortes por classe (média): Tecelão da Brasa 0,1, Andarilha do Vento 4,6, Vigia do Espinhal 4,6, Escudeiro do Alvorecer 6,5, Lanceiro do Fosso 6,3, Quebraferro 6,3, Cantora do Véu 1,9, Bastião de Bronze 12,5 — 5,4 em média.
8. **Economia:** tônicos são o único destino de ouro de quem só caça (não há venda de itens; o ferreiro não foi simulado). Bastião de Bronze gasta 94% do que saqueia e chega ao nível 20 com 1.269 de ouro — sem folga: quando o ouro acaba ele compra tônicos pequenos, morre mais e viaja mais à loja. As outras 7 classes terminam com 12.470 a 28.198 de ouro sem ter onde gastar.
9. **Equipamento da faixa quase nunca vem do saque:** das ~23 peças comuns das faixas 5, 9, 13 e 17 que cada classe usa, em média 0,4 caíram antes do nível da faixa; 22,6 tiveram de ser modeladas como obtidas fora da caça. O conjunto da faixa cai de um sorteio de 4% entre 30 peças de todas as classes (≈0,13% por peça por abate), e não há loja de equipamento. Sem missões ou comércio, a curva de poder pretendida não se sustenta só caçando.
10. **`castMs` não é implementado:** Tiro do Espinhal (1 s), Coração da Fornalha (1,5 s) e Coro do Recomeço (2 s) saem instantâneos (`zone.cmdCast` não lê `castMs`).
11. **`projectiles` sem efeito:** Rajada Cortante descreve "3 azagaias em leque, 90% cada", mas `cone_strike` só repete o golpe com `effect.hits` (usado pela Muralha de Piques); o campo `projectiles: 3` não é lido, então cada alvo leva um golpe de 90%.
12. **Nível de consumíveis não é conferido:** Tônico de Vida/Mana Médio têm nível 9, mas `use_item` e `buy` não checam nível (qualquer personagem de nível 1 com ouro compra e bebe). Os bots respeitaram o nível 9 por conta própria.
13. **Sem venda nem descarte de itens:** a bolsa (30 espaços) enche com as peças substituídas a cada faixa e com saques; o bot guardou em média 22,4 itens por classe no depósito da conta (60 espaços), que só adia o problema. Itens sem uso ficam no chão (em média 373 saques ignorados por classe).
14. **Sem recarga global:** todas as habilidades podem ser usadas no mesmo tick. O bot usa no máximo uma por decisão (200 ms), como um jogador apertando teclas, mas um cliente automatizado pode despejar todas de uma vez.

## Modo acelerado e desempenho da ferramenta

- Laço de `server.step(100)` (100 ms de jogo por chamada) num GameServer sem `start()`: banco SQLite em memória (`--banco-arquivo` usa um arquivo temporário), modo dev, sessões falsas e pedidos síncronos por `server.onMessage`. 232 h de jogo simuladas em 8,5 min de CPU (1.644× o tempo real por linha de execução); 3 linhas de execução (`worker_threads`) em paralelo, 5,4 min de relógio no total.
- Temporizadores do jogo usam `zone.now` (soma dos dt): recargas, efeitos, regeneração, tônicos, ataques e reaparecimento funcionam acelerados sem ajuste. `Date.now()` aparece em prazos de relógio de parede (validade do saque de 30 min, dia da elite diária, carimbos do banco, convites e calabouço); dentro da simulação ele segue o tempo simulado, para esses prazos correrem no ritmo do jogo.
- Zonas abertas sem jogador param 30 s depois que o último jogador sai e, quando alguém entra, o relógio da zona é adiantado até o tempo global (o valor que teria sem parar), então monstros mortos reaparecem e recargas levadas entre zonas continuam valendo; instâncias não são tocadas. 85% dos ticks de zona foram pulados. Um passo com só a zona ativa custa ~20–40 µs.
- Snapshots: o bot pede `{ delta: true }` no login. Se o servidor manda diferenças, elas são mescladas como em `mergeSnap` (test/helpers/client.js); se manda o snapshot completo, só o último é decodificado, quando o bot olha o mundo. Nesta rodada o servidor mandou snapshots completos. A sessão falsa nasce por `server.onConnection` (com um ws falso) e a simulação desliga o limite de comandos por conexão (`rateLimit`), que, onde existe, é medido em tempo real — os dois caminhos foram exercitados contra uma versão em desenvolvimento do servidor com snapshots por diferença. Mensagens `hit`/`heal` alimentam a contabilidade de dano; as de efeito visual são descartadas sem decodificar.
