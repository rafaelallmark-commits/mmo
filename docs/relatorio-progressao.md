<!-- Arquivo gerado por `npm run simular-progressao` (server/tools/simular-progressao.mjs). Rode de novo para atualizar. -->

# Relatório de progressão simulada (Marco 4)

Simulação acelerada, em processo, de caça solo do nível 1 ao 25 para 8 classes, contra as metas de teste de `data/xp_table.json` (`targetMinutesToNext`, ver [docs/04](04-progressao-e-formulas.md)). Cada classe foi jogada por um bot que só caça (sem missões), com 8 sementes (1, 2, 3, 4, 5, 6, 7, 8). Os números abaixo são **médias das sementes**; a meta é considerada atingida quando o tempo fica a até ±25% dela.

Gerado em 2026-11-20 14:52 UTC · tempo real 12,8 min (3 linhas de execução) · 471 h de jogo simuladas.

```
cd server && npm run simular-progressao
```

## Resumo

- Meta só caça do 1 ao 25: **7,7 h**. Média das classes: **7,36 h** (-4%).
- Mais rápida: Tecelão da Brasa (6,49 h); mais lenta: Quebraferro (8,57 h) — razão 1,3×.
- Níveis em que a média das classes sai da faixa de ±25%: nenhum.
- Viagens (troca de mapa a 60 s cada: ir às novas áreas, à loja, ao armeiro e à prova) são 23% do tempo. Recuperação fora de combate (tônico ou descanso) fica em 2–15% para todas as classes, porque os bots compram e bebem tônicos em vez de esperar a regeneração (1,5% da vida por segundo).

| Classe | Horas 1→25 (média) | Mín–máx | Desvio da meta | Abates | Mortes | Fugas | Tônicos V/M | Ouro ganho/h | Gasto/h (tônicos + equip.) | Prova |
|---|---|---|---|---|---|---|---|---|---|---|
| Tecelão da Brasa | 6,49 | 6,31–6,81 | -16% | 2.050 | 4,3 | 0,0 | 948 / 966 | 14.312 | 9.491 (4.021 + 5.470) | 8/8 |
| Andarilha do Vento | 6,57 | 6,27–6,96 | -15% | 2.043 | 3,8 | 3,9 | 1.698 / 271 | 14.611 | 10.105 (4.248 + 5.857) | 8/8 |
| Vigia do Espinhal | 6,66 | 6,51–6,82 | -14% | 2.044 | 4,5 | 2,8 | 1.613 / 273 | 14.384 | 9.093 (3.632 + 5.461) | 8/8 |
| Cantora do Véu | 7,28 | 6,91–7,62 | -6% | 2.046 | 3,5 | 0,6 | 687 / 757 | 12.026 | 7.902 (2.772 + 5.129) | 8/8 |
| Escudeiro do Alvorecer | 7,41 | 6,93–8,20 | -4% | 2.071 | 2,8 | 9,5 | 1.726 / 255 | 12.571 | 9.182 (3.912 + 5.270) | 8/8 |
| Lanceiro do Fosso | 7,90 | 7,21–9,39 | +3% | 2.122 | 6,3 | 14,6 | 2.105 / 243 | 11.685 | 8.591 (4.753 + 3.839) | 8/8 |
| Bastião de Bronze | 8,01 | 7,28–9,08 | +4% | 2.075 | 3,9 | 13,0 | 1.749 / 239 | 10.776 | 7.971 (3.182 + 4.788) | 8/8 |
| Quebraferro | 8,57 | 7,52–10,01 | +11% | 2.140 | 10,3 | 15,6 | 2.295 / 243 | 10.867 | 8.473 (4.775 + 3.698) | 8/8 |

### Para onde vai o tempo

Fatia do tempo total de cada classe. Viagens: trocas de mapa a 60 s cada, com a quantidade média por motivo (caça inclui trocar de área por perigo).

| Classe | Combate | Deslocamento e saque | Recuperação | Viagens | Trocas de mapa: caça / tônicos e venda / equipamento / prova | Cidade e prova | Caído e fugindo |
|---|---|---|---|---|---|---|---|
| Tecelão da Brasa | 56% | 5% | 15% | 23% | 48 / 27 / 12 / 2 | 0% | 0% |
| Andarilha do Vento | 69% | 6% | 2% | 23% | 48 / 21 / 18 / 2 | 0% | 0% |
| Vigia do Espinhal | 72% | 6% | 3% | 20% | 42 / 20 / 15 / 3 | 0% | 0% |
| Cantora do Véu | 72% | 4% | 5% | 18% | 43 / 20 / 15 / 3 | 0% | 0% |
| Escudeiro do Alvorecer | 70% | 4% | 2% | 23% | 54 / 29 / 16 / 2 | 0% | 0% |
| Lanceiro do Fosso | 64% | 5% | 5% | 25% | 64 / 38 / 16 / 2 | 0% | 1% |
| Bastião de Bronze | 70% | 4% | 3% | 22% | 57 / 31 / 17 / 2 | 0% | 0% |
| Quebraferro | 62% | 5% | 5% | 27% | 75 / 47 / 17 / 2 | 0% | 1% |

## Tempo por nível: média das classes × meta

Minutos simulados para sair de cada nível. "Fora" marca a média fora de ±25% da meta; a coluna seguinte conta quantas classes, individualmente, ficaram fora.

| Nível | Meta (min) | Média (min) | Desvio | Faixa | Classes fora | Mais rápida | Mais lenta | Abates/min | Mortes |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 2,0 | 1,6 | -18% | ok | 4/8 | Andarilha do Vento 1,3 | Tecelão da Brasa 2,4 | 10,1 | 0,00 |
| 2 | 3,5 | 4,1 | +18% | ok | 2/8 | Andarilha do Vento 3,8 | Cantora do Véu 4,8 | 3,9 | 0,00 |
| 3 | 5,0 | 4,8 | -4% | ok | 1/8 | Escudeiro do Alvorecer 3,8 | Cantora do Véu 6,6 | 6,4 | 0,00 |
| 4 | 6,5 | 5,8 | -11% | ok | 2/8 | Vigia do Espinhal 3,9 | Bastião de Bronze 7,6 | 5,1 | 0,00 |
| 5 | 8,0 | 7,3 | -9% | ok | 2/8 | Vigia do Espinhal 5,7 | Tecelão da Brasa 9,6 | 3,7 | 0,00 |
| 6 | 9,5 | 10,2 | +7% | ok | 0/8 | Cantora do Véu 9,3 | Lanceiro do Fosso 11,0 | 2,9 | 0,03 |
| 7 | 11,0 | 12,1 | +10% | ok | 2/8 | Andarilha do Vento 8,8 | Lanceiro do Fosso 17,0 | 3,1 | 0,03 |
| 8 | 12,5 | 11,0 | -12% | ok | 2/8 | Vigia do Espinhal 8,4 | Bastião de Bronze 13,8 | 4,2 | 0,00 |
| 9 | 14,0 | 16,1 | +15% | ok | 1/8 | Andarilha do Vento 13,6 | Lanceiro do Fosso 18,7 | 3,3 | 0,71 |
| 10 | 15,5 | 18,4 | +19% | ok | 2/8 | Vigia do Espinhal 16,5 | Bastião de Bronze 19,5 | 3,1 | 0,81 |
| 11 | 17,0 | 13,4 | -21% | ok | 3/8 | Cantora do Véu 9,5 | Bastião de Bronze 18,7 | 4,6 | 0,16 |
| 12 | 18,5 | 15,6 | -16% | ok | 1/8 | Andarilha do Vento 13,5 | Bastião de Bronze 17,2 | 5,1 | 0,03 |
| 13 | 20,0 | 20,4 | +2% | ok | 0/8 | Andarilha do Vento 18,8 | Bastião de Bronze 23,6 | 4,2 | 0,00 |
| 14 | 21,5 | 18,7 | -13% | ok | 2/8 | Andarilha do Vento 14,5 | Cantora do Véu 25,8 | 5,5 | 0,28 |
| 15 | 23,0 | 22,6 | -2% | ok | 1/8 | Tecelão da Brasa 13,8 | Bastião de Bronze 27,4 | 5,2 | 0,39 |
| 16 | 24,5 | 22,3 | -9% | ok | 1/8 | Tecelão da Brasa 11,7 | Lanceiro do Fosso 28,9 | 5,5 | 0,14 |
| 17 | 26,0 | 27,0 | +4% | ok | 2/8 | Tecelão da Brasa 20,4 | Quebraferro 37,4 | 4,5 | 0,16 |
| 18 | 27,5 | 25,7 | -7% | ok | 4/8 | Tecelão da Brasa 14,9 | Quebraferro 38,2 | 5,2 | 0,36 |
| 19 | 29,0 | 29,3 | +1% | ok | 3/8 | Andarilha do Vento 21,2 | Quebraferro 45,5 | 5,3 | 0,41 |
| 20 | 30,5 | 27,1 | -11% | ok | 0/8 | Vigia do Espinhal 23,0 | Cantora do Véu 31,8 | 4,8 | 0,03 |
| 21 | 32,0 | 31,6 | -1% | ok | 0/8 | Tecelão da Brasa 24,1 | Quebraferro 36,7 | 4,9 | 0,00 |
| 22 | 33,5 | 28,8 | -14% | ok | 0/8 | Andarilha do Vento 25,8 | Tecelão da Brasa 33,1 | 6,0 | 0,41 |
| 23 | 35,0 | 34,5 | -1% | ok | 0/8 | Tecelão da Brasa 26,7 | Escudeiro do Alvorecer 38,9 | 5,0 | 0,39 |
| 24 | 36,5 | 33,3 | -9% | ok | 0/8 | Bastião de Bronze 27,6 | Cantora do Véu 38,8 | 5,3 | 0,56 |

### Minutos por nível e classe

| Nível | Meta | Tecelão da Brasa | Andarilha do Vento | Vigia do Espinhal | Cantora do Véu | Escudeiro do Alvorecer | Lanceiro do Fosso | Bastião de Bronze | Quebraferro |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 2,0 | 2,4 | **1,3** | **1,4** | 2,1 | **1,4** | **1,5** | 1,6 | 1,5 |
| 2 | 3,5 | **4,7** | 3,8 | 3,9 | **4,8** | 3,8 | 4,0 | 4,2 | 3,8 |
| 3 | 5,0 | 5,2 | 4,0 | 4,2 | **6,6** | 3,8 | 4,9 | 5,8 | 4,1 |
| 4 | 6,5 | 6,1 | **4,2** | **3,9** | 6,1 | 5,4 | 6,6 | 7,6 | 6,6 |
| 5 | 8,0 | 9,6 | **6,0** | **5,7** | 7,5 | 6,1 | 8,5 | 7,5 | 7,7 |
| 6 | 9,5 | 9,5 | 10,8 | 10,1 | 9,3 | 9,9 | 11,0 | 10,8 | 10,1 |
| 7 | 11,0 | 11,7 | 8,8 | 9,1 | 10,3 | 11,8 | **17,0** | 12,3 | **15,8** |
| 8 | 12,5 | 12,8 | 10,5 | **8,4** | **9,1** | 10,9 | 11,2 | 13,8 | 11,5 |
| 9 | 14,0 | 15,3 | 13,6 | 16,4 | 14,5 | 16,2 | **18,7** | 17,1 | 17,1 |
| 10 | 15,5 | 18,4 | **19,4** | 16,5 | 18,3 | 17,3 | 18,4 | **19,5** | 19,3 |
| 11 | 17,0 | **12,6** | 13,3 | 13,3 | **9,5** | 13,1 | **12,8** | 18,7 | 14,1 |
| 12 | 18,5 | 16,0 | **13,5** | 15,0 | 16,6 | 15,4 | 16,1 | 17,2 | 15,3 |
| 13 | 20,0 | 20,1 | 18,8 | 19,5 | 20,2 | 20,7 | 19,8 | 23,6 | 20,3 |
| 14 | 21,5 | 19,1 | **14,5** | **15,5** | 25,8 | 18,6 | 19,6 | 18,2 | 18,2 |
| 15 | 23,0 | **13,8** | 24,8 | 23,6 | 19,6 | 22,0 | 22,2 | 27,4 | 27,1 |
| 16 | 24,5 | **11,7** | 19,8 | 19,7 | 19,1 | 23,6 | 28,9 | 27,0 | 28,6 |
| 17 | 26,0 | 20,4 | 22,6 | 20,9 | 25,9 | 26,2 | **33,4** | 29,2 | **37,4** |
| 18 | 27,5 | **14,9** | **19,6** | 23,8 | **19,1** | 29,3 | 31,4 | 29,2 | **38,2** |
| 19 | 29,0 | 23,7 | **21,2** | 22,0 | 27,2 | 26,5 | 31,6 | **36,6** | **45,5** |
| 20 | 30,5 | 25,0 | 24,8 | 23,0 | 31,8 | 26,6 | 29,6 | 26,2 | 29,6 |
| 21 | 32,0 | 24,1 | 31,9 | 31,2 | 28,4 | 36,0 | 31,9 | 32,8 | 36,7 |
| 22 | 33,5 | 33,1 | 25,8 | 28,1 | 28,5 | 27,1 | 27,5 | 28,0 | 31,9 |
| 23 | 35,0 | 26,7 | 31,7 | 33,1 | 37,6 | 38,9 | 34,0 | 38,7 | 35,4 |
| 24 | 36,5 | 33,1 | 29,4 | 31,3 | 38,8 | 34,2 | 33,7 | 27,6 | 38,6 |

Negrito: fora de ±25% da meta.

## Detalhe por classe

### Tecelão da Brasa (`emberweaver`)

6,49 h do 1 ao 25 (-16% da meta; 8/8 execuções concluídas). Plano de atributos: example_builds.json (emberweaver_magic). Tempo: combate 56%, deslocamento e saque 5%, recuperação 15%, viagens 23%, cidade e prova 0%, caído/fugindo 0%. Dano por fonte: ataque básico 40%, Faísca de Vidro 28%, Chão em Brasa 14%, Círculo de Fuligem 10%, Coração da Fornalha 6%; acerto 100%; 1.845 de dano causado e 428 recebido por minuto.

| Nível | Min | Meta | Desvio | Abates | Abates/min | Mortes | Fugas | Tônicos V/M | Ouro ganho (moedas + vendas) | Gasto: tônicos / equip. | XP de abates | Monstro principal |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 2,4 | 2,0 | +19% | 16 | 6,7 | 0,0 | 0,0 | 0 / 0 | 60 | 3 / 3 | 80 | Rato de Sulco (1) |
| 2 | **4,7** | 3,5 | +34% | 16 | 3,4 | 0,0 | 0,0 | 0 / 0 | 79 | 45 / 29 | 256 | Besouro-Brasa (2) |
| 3 | 5,2 | 5,0 | +4% | 30 | 5,8 | 0,0 | 0,0 | 10 / 6 | 112 | 0 / 0 | 570 | Cão de Ferrugem (3) |
| 4 | 6,1 | 6,5 | -7% | 25 | 4,1 | 0,0 | 0,0 | 3 / 1 | 101 | 0 / 0 | 1.040 | Lagarto de Lastro (4) |
| 5 | 9,6 | 8,0 | +20% | 26 | 2,7 | 0,0 | 0,0 | 0 / 2 | 103 | 0 / 0 | 1.708 | Sapo-Bomba (5) |
| 6 | 9,5 | 9,5 | -0% | 29 | 3,0 | 0,0 | 0,0 | 18 / 16 | 465 | 327 / 233 | 2.559 | Enguia de Lodo (6) |
| 7 | 11,7 | 11,0 | +6% | 34 | 2,9 | 0,0 | 0,0 | 25 / 18 | 527 | 349 / 184 | 3.608 | Válvula Errante (7) |
| 8 | 12,8 | 12,5 | +2% | 41 | 3,2 | 0,0 | 0,0 | 17 / 22 | 789 | 379 / 11 | 4.852 | Garça de Ferrugem (8) |
| 9 | 15,3 | 14,0 | +9% | 51 | 3,3 | 0,8 | 0,0 | 31 / 21 | 765 | 248 / 197 | 6.450 | Garça de Ferrugem (8) |
| 10 | 18,4 | 15,5 | +18% | 59 | 3,2 | 0,8 | 0,0 | 28 / 36 | 1.376 | 620 / 877 | 8.225 | Rato-Engrenagem (10) |
| 11 | **12,6** | 17,0 | -26% | 58 | 4,7 | 0,0 | 0,0 | 32 / 40 | 1.705 | 671 / 179 | 10.317 | Soldador Cego (11) |
| 12 | 16,0 | 18,5 | -13% | 79 | 4,9 | 0,0 | 0,0 | 38 / 46 | 2.386 | 522 / 0 | 12.641 | Lâmina de Esteira (12) |
| 13 | 20,1 | 20,0 | +0% | 86 | 4,3 | 0,0 | 0,0 | 33 / 63 | 3.069 | 689 / 3.196 | 15.346 | Larva Térmica (13) |
| 14 | 19,1 | 21,5 | -11% | 99 | 5,2 | 0,0 | 0,0 | 51 / 55 | 3.822 | 3.131 / 223 | 18.213 | Ecoante (14) |
| 15 | **13,8** | 23,0 | -40% | 106 | 7,7 | 0,0 | 0,0 | 40 / 45 | 3.658 | 1.007 / 877 | 21.601 | Guardião de Galeria (15) |
| 16 | **11,7** | 24,5 | -52% | 109 | 9,3 | 0,1 | 0,0 | 64 / 46 | 3.042 | 0 / 0 | 25.165 | Aranha de Conduto (16) |
| 17 | 20,4 | 26,0 | -22% | 114 | 5,6 | 0,0 | 0,0 | 42 / 47 | 5.533 | 2.457 / 5.544 | 29.075 | Draga Viva (17) |
| 18 | **14,9** | 27,5 | -46% | 119 | 8,0 | 0,0 | 0,0 | 50 / 51 | 4.617 | 435 / 275 | 33.371 | Escória Pressurizada (18) |
| 19 | 23,7 | 29,0 | -18% | 141 | 6,0 | 0,0 | 0,0 | 59 / 62 | 7.500 | 2.763 / 7.406 | 37.996 | Escória Pressurizada (18) |
| 20 | 25,0 | 30,5 | -18% | 124 | 5,0 | 0,0 | 0,0 | 44 / 70 | 7.620 | 1.153 / 2.037 | 43.003 | Salamandra de Cisterna (21) |
| 21 | 24,1 | 32,0 | -25% | 153 | 6,3 | 0,0 | 0,0 | 41 / 68 | 8.175 | 0 / 0 | 48.461 | Salamandra de Cisterna (21) |
| 22 | 33,1 | 33,5 | -1% | 171 | 5,2 | 0,6 | 0,0 | 86 / 78 | 12.477 | 3.555 / 3.209 | 54.041 | Sineiro de Bronze (22) |
| 23 | 26,7 | 35,0 | -24% | 174 | 6,5 | 0,8 | 0,0 | 111 / 90 | 11.819 | 3.405 / 5.776 | 60.289 | Voz Soterrada (23) |
| 24 | 33,1 | 36,5 | -9% | 194 | 5,9 | 1,3 | 0,0 | 124 / 84 | 13.125 | 4.352 / 5.257 | 66.791 | Toupeira de Basalto (24) |

### Andarilha do Vento (`windwalker`)

6,57 h do 1 ao 25 (-15% da meta; 8/8 execuções concluídas). Plano de atributos: gerado (requisitos das faixas + Agilidade/Vitalidade 2:3). Tempo: combate 69%, deslocamento e saque 6%, recuperação 2%, viagens 23%, cidade e prova 0%, caído/fugindo 0%. Dano por fonte: ataque básico 88%, Arremesso de Retorno 8%, Rajada Cortante 3%, Olho do Furacão 2%; acerto 96%; 1.797 de dano causado e 567 recebido por minuto.

| Nível | Min | Meta | Desvio | Abates | Abates/min | Mortes | Fugas | Tônicos V/M | Ouro ganho (moedas + vendas) | Gasto: tônicos / equip. | XP de abates | Monstro principal |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **1,3** | 2,0 | -37% | 16 | 12,5 | 0,0 | 0,0 | 0 / 0 | 58 | 0 / 0 | 80 | Rato de Sulco (1) |
| 2 | 3,8 | 3,5 | +8% | 16 | 4,3 | 0,0 | 0,0 | 0 / 0 | 78 | 47 / 33 | 256 | Besouro-Brasa (2) |
| 3 | 4,0 | 5,0 | -21% | 30 | 7,6 | 0,0 | 0,0 | 14 / 3 | 103 | 0 / 0 | 570 | Cão de Ferrugem (3) |
| 4 | **4,2** | 6,5 | -35% | 26 | 6,1 | 0,0 | 0,0 | 8 / 4 | 124 | 0 / 0 | 1.049 | Lagarto de Lastro (4) |
| 5 | **6,0** | 8,0 | -25% | 26 | 4,3 | 0,0 | 0,0 | 10 / 3 | 98 | 0 / 0 | 1.691 | Sapo-Bomba (5) |
| 6 | 10,8 | 9,5 | +14% | 29 | 2,7 | 0,0 | 0,5 | 37 / 2 | 471 | 349 / 280 | 2.548 | Enguia de Lodo (6) |
| 7 | 8,8 | 11,0 | -20% | 36 | 4,1 | 0,0 | 0,3 | 41 / 5 | 509 | 203 / 152 | 3.613 | Válvula Errante (7) |
| 8 | 10,5 | 12,5 | -16% | 45 | 4,3 | 0,0 | 0,5 | 37 / 6 | 738 | 343 / 65 | 4.894 | Garça de Ferrugem (8) |
| 9 | 13,6 | 14,0 | -3% | 53 | 3,9 | 0,9 | 0,3 | 59 / 6 | 788 | 178 / 73 | 6.423 | Garça de Ferrugem (8) |
| 10 | **19,4** | 15,5 | +25% | 58 | 3,0 | 0,8 | 0,1 | 68 / 7 | 1.306 | 675 / 994 | 8.243 | Rato-Engrenagem (10) |
| 11 | 13,3 | 17,0 | -22% | 59 | 4,5 | 0,3 | 0,1 | 63 / 9 | 1.761 | 372 / 219 | 10.334 | Soldador Cego (11) |
| 12 | **13,5** | 18,5 | -27% | 79 | 5,8 | 0,0 | 0,0 | 30 / 12 | 2.212 | 0 / 0 | 12.624 | Lâmina de Esteira (12) |
| 13 | 18,8 | 20,0 | -6% | 85 | 4,5 | 0,0 | 0,0 | 20 / 14 | 3.153 | 1.076 / 3.338 | 15.282 | Larva Térmica (13) |
| 14 | **14,5** | 21,5 | -33% | 99 | 6,9 | 0,0 | 0,0 | 88 / 11 | 2.756 | 0 / 0 | 18.285 | Ecoante (14) |
| 15 | 24,8 | 23,0 | +8% | 112 | 4,5 | 0,8 | 0,6 | 107 / 14 | 5.193 | 4.311 / 3.461 | 21.550 | Guardião de Galeria (15) |
| 16 | 19,8 | 24,5 | -19% | 116 | 5,8 | 0,0 | 0,3 | 152 / 14 | 3.479 | 1.019 / 490 | 25.156 | Aranha de Conduto (16) |
| 17 | 22,6 | 26,0 | -13% | 114 | 5,1 | 0,0 | 0,0 | 97 / 14 | 5.584 | 2.903 / 1.628 | 29.078 | Draga Viva (17) |
| 18 | **19,6** | 27,5 | -29% | 120 | 6,1 | 0,0 | 0,0 | 106 / 16 | 4.977 | 1.492 / 650 | 33.391 | Escória Pressurizada (18) |
| 19 | **21,2** | 29,0 | -27% | 142 | 6,7 | 0,0 | 0,0 | 113 / 19 | 5.952 | 1.536 / 1.814 | 38.064 | Escória Pressurizada (18) |
| 20 | 24,8 | 30,5 | -19% | 124 | 5,0 | 0,0 | 0,0 | 62 / 15 | 6.648 | 0 / 0 | 42.994 | Salamandra de Cisterna (21) |
| 21 | 31,9 | 32,0 | -0% | 153 | 4,8 | 0,0 | 0,0 | 50 / 26 | 13.595 | 2.315 / 11.448 | 48.422 | Salamandra de Cisterna (21) |
| 22 | 25,8 | 33,5 | -23% | 171 | 6,7 | 0,6 | 0,1 | 145 / 21 | 10.955 | 1.853 / 0 | 54.039 | Sineiro de Bronze (22) |
| 23 | 31,7 | 35,0 | -10% | 165 | 5,2 | 0,0 | 0,8 | 189 / 24 | 13.608 | 5.530 / 10.180 | 60.254 | Voz Soterrada (23) |
| 24 | 29,4 | 36,5 | -19% | 171 | 5,8 | 0,5 | 0,4 | 202 / 25 | 11.783 | 3.687 / 3.627 | 66.957 | Toupeira de Basalto (24) |

### Vigia do Espinhal (`warden`)

6,66 h do 1 ao 25 (-14% da meta; 8/8 execuções concluídas). Plano de atributos: gerado (requisitos das faixas + Agilidade/Vitalidade 2:3). Tempo: combate 72%, deslocamento e saque 6%, recuperação 3%, viagens 20%, cidade e prova 0%, caído/fugindo 0%. Dano por fonte: ataque básico 85%, Flecha de Passagem 6%, Chuva de Espinhos 5%, Tiro do Espinhal 5%; acerto 98%; 1.806 de dano causado e 545 recebido por minuto.

| Nível | Min | Meta | Desvio | Abates | Abates/min | Mortes | Fugas | Tônicos V/M | Ouro ganho (moedas + vendas) | Gasto: tônicos / equip. | XP de abates | Monstro principal |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **1,4** | 2,0 | -29% | 16 | 11,3 | 0,0 | 0,0 | 0 / 1 | 59 | 0 / 0 | 80 | Rato de Sulco (1) |
| 2 | 3,9 | 3,5 | +12% | 16 | 4,1 | 0,0 | 0,0 | 0 / 1 | 75 | 50 / 33 | 256 | Besouro-Brasa (2) |
| 3 | 4,2 | 5,0 | -16% | 30 | 7,2 | 0,0 | 0,0 | 14 / 4 | 117 | 0 / 0 | 570 | Cão de Ferrugem (3) |
| 4 | **3,9** | 6,5 | -40% | 24 | 6,2 | 0,0 | 0,0 | 8 / 3 | 102 | 0 / 0 | 1.038 | Lagarto de Lastro (4) |
| 5 | **5,7** | 8,0 | -29% | 26 | 4,6 | 0,0 | 0,0 | 8 / 4 | 103 | 0 / 0 | 1.716 | Sapo-Bomba (5) |
| 6 | 10,1 | 9,5 | +6% | 29 | 2,8 | 0,0 | 0,5 | 31 / 4 | 462 | 357 / 283 | 2.548 | Enguia de Lodo (6) |
| 7 | 9,1 | 11,0 | -18% | 34 | 3,8 | 0,1 | 0,0 | 37 / 5 | 544 | 141 / 133 | 3.597 | Válvula Errante (7) |
| 8 | **8,4** | 12,5 | -33% | 41 | 4,9 | 0,0 | 0,0 | 31 / 6 | 704 | 0 / 0 | 4.870 | Garça de Ferrugem (8) |
| 9 | 16,4 | 14,0 | +17% | 48 | 2,9 | 0,5 | 0,5 | 47 / 6 | 856 | 616 / 561 | 6.417 | Autômato Escavador (9) |
| 10 | 16,5 | 15,5 | +7% | 52 | 3,1 | 0,5 | 0,0 | 63 / 9 | 1.228 | 326 / 781 | 8.306 | Rato-Engrenagem (10) |
| 11 | 13,3 | 17,0 | -22% | 59 | 4,5 | 0,5 | 0,6 | 64 / 6 | 1.801 | 909 / 0 | 10.263 | Soldador Cego (11) |
| 12 | 15,0 | 18,5 | -19% | 79 | 5,3 | 0,0 | 0,0 | 31 / 9 | 2.186 | 0 / 0 | 12.641 | Lâmina de Esteira (12) |
| 13 | 19,5 | 20,0 | -3% | 86 | 4,4 | 0,0 | 0,0 | 25 / 15 | 3.238 | 951 / 3.275 | 15.346 | Larva Térmica (13) |
| 14 | **15,5** | 21,5 | -28% | 99 | 6,4 | 0,0 | 0,0 | 87 / 11 | 2.911 | 0 / 0 | 18.237 | Ecoante (14) |
| 15 | 23,6 | 23,0 | +3% | 110 | 4,7 | 0,4 | 0,1 | 83 / 17 | 4.962 | 3.585 / 3.463 | 21.535 | Guardião de Galeria (15) |
| 16 | 19,7 | 24,5 | -20% | 111 | 5,6 | 0,1 | 0,1 | 126 / 13 | 3.592 | 513 / 768 | 25.133 | Aranha de Conduto (16) |
| 17 | 20,9 | 26,0 | -20% | 114 | 5,4 | 0,0 | 0,0 | 91 / 16 | 4.850 | 1.793 / 1.479 | 29.158 | Draga Viva (17) |
| 18 | 23,8 | 27,5 | -13% | 119 | 5,0 | 0,0 | 0,3 | 96 / 16 | 6.393 | 2.840 / 1.150 | 33.414 | Escória Pressurizada (18) |
| 19 | 22,0 | 29,0 | -24% | 142 | 6,4 | 0,3 | 0,0 | 108 / 18 | 5.726 | 570 / 1.540 | 37.941 | Escória Pressurizada (18) |
| 20 | 23,0 | 30,5 | -25% | 124 | 5,4 | 0,0 | 0,0 | 69 / 14 | 6.632 | 0 / 0 | 43.199 | Salamandra de Cisterna (21) |
| 21 | 31,2 | 32,0 | -3% | 152 | 4,9 | 0,0 | 0,0 | 60 / 24 | 12.333 | 2.371 / 10.683 | 48.224 | Salamandra de Cisterna (21) |
| 22 | 28,1 | 33,5 | -16% | 172 | 6,1 | 0,6 | 0,3 | 152 / 21 | 10.610 | 1.853 / 406 | 54.148 | Sineiro de Bronze (22) |
| 23 | 33,1 | 35,0 | -5% | 178 | 5,4 | 0,6 | 0,3 | 171 / 28 | 14.046 | 4.592 / 8.800 | 60.233 | Voz Soterrada (23) |
| 24 | 31,3 | 36,5 | -14% | 183 | 5,9 | 0,9 | 0,1 | 209 / 25 | 12.293 | 2.730 / 3.024 | 66.865 | Toupeira de Basalto (24) |

### Cantora do Véu (`veilsinger`)

7,28 h do 1 ao 25 (-6% da meta; 8/8 execuções concluídas). Plano de atributos: gerado (requisitos das faixas + Espírito/Vitalidade 2:3). Tempo: combate 72%, deslocamento e saque 4%, recuperação 5%, viagens 18%, cidade e prova 0%, caído/fugindo 0%. Dano por fonte: ataque básico 54%, Nota Clara 46%; acerto 100%; 1.675 de dano causado e 799 recebido por minuto; 245 de cura por minuto.

| Nível | Min | Meta | Desvio | Abates | Abates/min | Mortes | Fugas | Tônicos V/M | Ouro ganho (moedas + vendas) | Gasto: tônicos / equip. | XP de abates | Monstro principal |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 2,1 | 2,0 | +4% | 16 | 7,7 | 0,0 | 0,0 | 0 / 0 | 63 | 0 / 0 | 80 | Rato de Sulco (1) |
| 2 | **4,8** | 3,5 | +36% | 16 | 3,4 | 0,0 | 0,0 | 0 / 0 | 86 | 54 / 33 | 256 | Besouro-Brasa (2) |
| 3 | **6,6** | 5,0 | +32% | 30 | 4,5 | 0,0 | 0,0 | 18 / 5 | 107 | 0 / 0 | 570 | Cão de Ferrugem (3) |
| 4 | 6,1 | 6,5 | -6% | 25 | 4,1 | 0,0 | 0,0 | 1 / 0 | 117 | 0 / 0 | 1.047 | Lagarto de Lastro (4) |
| 5 | 7,5 | 8,0 | -6% | 26 | 3,5 | 0,0 | 0,0 | 0 / 1 | 107 | 30 / 19 | 1.708 | Sapo-Bomba (5) |
| 6 | 9,3 | 9,5 | -2% | 28 | 3,0 | 0,0 | 0,6 | 21 / 15 | 406 | 280 / 211 | 2.525 | Enguia de Lodo (6) |
| 7 | 10,3 | 11,0 | -7% | 34 | 3,3 | 0,0 | 0,0 | 10 / 16 | 609 | 333 / 211 | 3.616 | Válvula Errante (7) |
| 8 | **9,1** | 12,5 | -27% | 41 | 4,5 | 0,0 | 0,0 | 1 / 10 | 774 | 0 / 0 | 4.890 | Garça de Ferrugem (8) |
| 9 | 14,5 | 14,0 | +4% | 45 | 3,1 | 0,3 | 0,0 | 13 / 17 | 771 | 432 / 468 | 6.437 | Autômato Escavador (9) |
| 10 | 18,3 | 15,5 | +18% | 54 | 3,0 | 0,6 | 0,0 | 15 / 29 | 1.094 | 278 / 919 | 8.207 | Rato-Engrenagem (10) |
| 11 | **9,5** | 17,0 | -44% | 60 | 6,3 | 0,0 | 0,0 | 12 / 31 | 1.572 | 0 / 0 | 10.335 | Soldador Cego (11) |
| 12 | 16,6 | 18,5 | -10% | 79 | 4,8 | 0,0 | 0,0 | 1 / 14 | 2.373 | 95 / 131 | 12.632 | Lâmina de Esteira (12) |
| 13 | 20,2 | 20,0 | +1% | 86 | 4,3 | 0,0 | 0,0 | 0 / 39 | 3.319 | 401 / 3.929 | 15.349 | Larva Térmica (13) |
| 14 | 25,8 | 21,5 | +20% | 100 | 3,9 | 0,4 | 0,0 | 52 / 51 | 4.097 | 3.912 / 459 | 18.230 | Ecoante (14) |
| 15 | 19,6 | 23,0 | -15% | 110 | 5,6 | 0,0 | 0,0 | 42 / 41 | 3.331 | 0 / 0 | 21.568 | Guardião de Galeria (15) |
| 16 | 19,1 | 24,5 | -22% | 112 | 5,9 | 0,1 | 0,0 | 78 / 48 | 2.884 | 0 / 0 | 25.130 | Aranha de Conduto (16) |
| 17 | 25,9 | 26,0 | -0% | 117 | 4,5 | 0,1 | 0,0 | 28 / 41 | 6.064 | 3.327 / 7.239 | 29.133 | Draga Viva (17) |
| 18 | **19,1** | 27,5 | -31% | 119 | 6,2 | 0,0 | 0,0 | 37 / 49 | 4.080 | 0 / 0 | 33.426 | Escória Pressurizada (18) |
| 19 | 27,2 | 29,0 | -6% | 141 | 5,2 | 0,0 | 0,0 | 53 / 62 | 6.267 | 1.564 / 3.903 | 37.963 | Escória Pressurizada (18) |
| 20 | 31,8 | 30,5 | +4% | 126 | 4,0 | 0,1 | 0,0 | 10 / 34 | 7.755 | 2.247 / 2.675 | 43.047 | Salamandra de Cisterna (21) |
| 21 | 28,4 | 32,0 | -11% | 153 | 5,4 | 0,0 | 0,0 | 0 / 43 | 9.527 | 390 / 3.640 | 48.422 | Salamandra de Cisterna (21) |
| 22 | 28,5 | 33,5 | -15% | 169 | 5,9 | 0,3 | 0,0 | 51 / 60 | 9.115 | 525 / 0 | 54.055 | Sineiro de Bronze (22) |
| 23 | 37,6 | 35,0 | +8% | 176 | 4,7 | 0,8 | 0,0 | 113 / 73 | 12.047 | 3.420 / 9.939 | 60.214 | Voz Soterrada (23) |
| 24 | 38,8 | 36,5 | +6% | 183 | 4,7 | 0,9 | 0,0 | 132 / 80 | 10.951 | 2.886 / 3.548 | 66.862 | Toupeira de Basalto (24) |

### Escudeiro do Alvorecer (`dawnshield`)

7,41 h do 1 ao 25 (-4% da meta; 8/8 execuções concluídas). Plano de atributos: gerado (requisitos das faixas + Força/Vitalidade 2:3). Tempo: combate 70%, deslocamento e saque 4%, recuperação 2%, viagens 23%, cidade e prova 0%, caído/fugindo 0%. Dano por fonte: ataque básico 75%, Corte Solar 16%, Lâmina do Meio-Dia 5%, dano sagrado extra 4%; acerto 80%; 1.601 de dano causado e 563 recebido por minuto; 5 de cura por minuto.

| Nível | Min | Meta | Desvio | Abates | Abates/min | Mortes | Fugas | Tônicos V/M | Ouro ganho (moedas + vendas) | Gasto: tônicos / equip. | XP de abates | Monstro principal |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **1,4** | 2,0 | -29% | 16 | 11,1 | 0,0 | 0,0 | 0 / 0 | 59 | 0 / 0 | 80 | Rato de Sulco (1) |
| 2 | 3,8 | 3,5 | +9% | 16 | 4,3 | 0,0 | 0,0 | 0 / 1 | 84 | 53 / 32 | 257 | Besouro-Brasa (2) |
| 3 | 3,8 | 5,0 | -24% | 30 | 7,9 | 0,0 | 0,0 | 15 / 2 | 72 | 0 / 0 | 570 | Cão de Ferrugem (3) |
| 4 | 5,4 | 6,5 | -18% | 33 | 6,2 | 0,0 | 0,3 | 9 / 3 | 143 | 0 / 0 | 1.044 | Cão de Ferrugem (3) |
| 5 | 6,1 | 8,0 | -24% | 27 | 4,4 | 0,0 | 0,0 | 8 / 5 | 131 | 0 / 0 | 1.695 | Sapo-Bomba (5) |
| 6 | 9,9 | 9,5 | +4% | 30 | 3,0 | 0,0 | 1,3 | 41 / 2 | 264 | 261 / 199 | 2.544 | Enguia de Lodo (6) |
| 7 | 11,8 | 11,0 | +8% | 37 | 3,2 | 0,0 | 2,3 | 41 / 4 | 468 | 262 / 199 | 3.597 | Enguia de Lodo (6) |
| 8 | 10,9 | 12,5 | -13% | 47 | 4,4 | 0,0 | 0,5 | 23 / 9 | 841 | 76 / 50 | 4.921 | Garça de Ferrugem (8) |
| 9 | 16,2 | 14,0 | +16% | 51 | 3,2 | 0,8 | 0,4 | 62 / 4 | 774 | 617 / 286 | 6.419 | Autômato Escavador (9) |
| 10 | 17,3 | 15,5 | +12% | 54 | 3,1 | 0,5 | 0,0 | 59 / 8 | 1.230 | 354 / 689 | 8.218 | Rato-Engrenagem (10) |
| 11 | 13,1 | 17,0 | -23% | 59 | 4,5 | 0,0 | 0,1 | 61 / 8 | 1.540 | 133 / 171 | 10.360 | Soldador Cego (11) |
| 12 | 15,4 | 18,5 | -17% | 78 | 5,1 | 0,0 | 0,1 | 28 / 11 | 2.354 | 181 / 171 | 12.576 | Lâmina de Esteira (12) |
| 13 | 20,7 | 20,0 | +3% | 86 | 4,2 | 0,0 | 0,0 | 20 / 14 | 3.356 | 1.181 / 3.472 | 15.349 | Larva Térmica (13) |
| 14 | 18,6 | 21,5 | -14% | 100 | 5,4 | 0,3 | 0,3 | 101 / 8 | 2.321 | 1.104 / 0 | 18.265 | Ecoante (14) |
| 15 | 22,0 | 23,0 | -4% | 113 | 5,1 | 0,4 | 0,4 | 89 / 13 | 4.227 | 2.463 / 807 | 21.516 | Guardião de Galeria (15) |
| 16 | 23,6 | 24,5 | -4% | 122 | 5,2 | 0,4 | 0,5 | 124 / 14 | 4.359 | 2.591 / 1.631 | 25.144 | Aranha de Conduto (16) |
| 17 | 26,2 | 26,0 | +1% | 123 | 4,7 | 0,0 | 0,6 | 142 / 8 | 3.397 | 2.306 / 3.208 | 29.158 | Aranha de Conduto (16) |
| 18 | 29,3 | 27,5 | +7% | 124 | 4,2 | 0,0 | 1,4 | 118 / 11 | 4.679 | 2.225 / 1.153 | 33.391 | Escória Pressurizada (18) |
| 19 | 26,5 | 29,0 | -9% | 150 | 5,7 | 0,5 | 0,4 | 120 / 20 | 6.670 | 1.968 / 1.656 | 37.965 | Escória Pressurizada (18) |
| 20 | 26,6 | 30,5 | -13% | 125 | 4,7 | 0,0 | 0,1 | 67 / 16 | 6.994 | 765 / 150 | 43.058 | Salamandra de Cisterna (21) |
| 21 | 36,0 | 32,0 | +12% | 153 | 4,3 | 0,0 | 0,0 | 51 / 25 | 13.031 | 1.590 / 9.943 | 48.422 | Salamandra de Cisterna (21) |
| 22 | 27,1 | 33,5 | -19% | 167 | 6,2 | 0,0 | 0,0 | 164 / 20 | 8.796 | 0 / 0 | 54.022 | Sineiro de Bronze (22) |
| 23 | 38,9 | 35,0 | +11% | 166 | 4,3 | 0,0 | 0,5 | 180 / 25 | 15.439 | 7.148 / 15.227 | 60.358 | Voz Soterrada (23) |
| 24 | 34,2 | 36,5 | -6% | 166 | 4,8 | 0,0 | 0,5 | 204 / 23 | 11.905 | 3.705 / 0 | 66.841 | Toupeira de Basalto (24) |

### Lanceiro do Fosso (`pikeman`)

7,90 h do 1 ao 25 (+3% da meta; 8/8 execuções concluídas). Plano de atributos: gerado (requisitos das faixas + Força/Vitalidade 2:3). Tempo: combate 64%, deslocamento e saque 5%, recuperação 5%, viagens 25%, cidade e prova 0%, caído/fugindo 1%. Dano por fonte: ataque básico 78%, Estocada Longa 13%, Avanço do Fosso 3%, Muralha de Piques 3%, Linha Partida 2%; acerto 86%; 1.572 de dano causado e 618 recebido por minuto.

| Nível | Min | Meta | Desvio | Abates | Abates/min | Mortes | Fugas | Tônicos V/M | Ouro ganho (moedas + vendas) | Gasto: tônicos / equip. | XP de abates | Monstro principal |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **1,5** | 2,0 | -25% | 16 | 10,7 | 0,0 | 0,0 | 0 / 0 | 61 | 0 / 0 | 80 | Rato de Sulco (1) |
| 2 | 4,0 | 3,5 | +14% | 16 | 4,0 | 0,0 | 0,0 | 1 / 1 | 82 | 51 / 33 | 256 | Besouro-Brasa (2) |
| 3 | 4,9 | 5,0 | -2% | 30 | 6,2 | 0,0 | 0,5 | 20 / 2 | 65 | 0 / 0 | 569 | Cão de Ferrugem (3) |
| 4 | 6,6 | 6,5 | +1% | 32 | 4,9 | 0,0 | 0,4 | 9 / 5 | 162 | 0 / 0 | 1.041 | Lagarto de Lastro (4) |
| 5 | 8,5 | 8,0 | +6% | 26 | 3,1 | 0,0 | 0,0 | 9 / 4 | 111 | 0 / 0 | 1.716 | Sapo-Bomba (5) |
| 6 | 11,0 | 9,5 | +16% | 31 | 2,8 | 0,1 | 2,1 | 42 / 1 | 237 | 259 / 194 | 2.533 | Enguia de Lodo (6) |
| 7 | **17,0** | 11,0 | +55% | 44 | 2,6 | 0,0 | 4,8 | 25 / 3 | 501 | 284 / 180 | 3.590 | Enguia de Lodo (6) |
| 8 | 11,2 | 12,5 | -10% | 51 | 4,5 | 0,0 | 0,5 | 43 / 6 | 665 | 48 / 5 | 4.911 | Garça de Ferrugem (8) |
| 9 | **18,7** | 14,0 | +33% | 64 | 3,5 | 0,9 | 0,3 | 46 / 10 | 1.124 | 544 / 373 | 6.421 | Garça de Ferrugem (8) |
| 10 | 18,4 | 15,5 | +18% | 62 | 3,4 | 1,5 | 0,0 | 63 / 9 | 1.213 | 470 / 688 | 8.243 | Rato-Engrenagem (10) |
| 11 | **12,8** | 17,0 | -25% | 59 | 4,6 | 0,1 | 0,0 | 60 / 6 | 1.504 | 240 / 0 | 10.317 | Lâmina de Esteira (12) |
| 12 | 16,1 | 18,5 | -13% | 79 | 4,9 | 0,0 | 0,0 | 39 / 7 | 2.221 | 0 / 0 | 12.643 | Lâmina de Esteira (12) |
| 13 | 19,8 | 20,0 | -1% | 86 | 4,3 | 0,0 | 0,0 | 30 / 12 | 3.290 | 1.784 / 3.028 | 15.305 | Larva Térmica (13) |
| 14 | 19,6 | 21,5 | -9% | 101 | 5,1 | 0,8 | 0,1 | 112 / 8 | 2.620 | 1.770 / 0 | 18.258 | Ecoante (14) |
| 15 | 22,2 | 23,0 | -4% | 119 | 5,4 | 0,5 | 0,3 | 114 / 12 | 3.453 | 1.845 / 386 | 21.518 | Guardião de Galeria (15) |
| 16 | 28,9 | 24,5 | +18% | 112 | 3,9 | 0,0 | 1,3 | 182 / 15 | 4.674 | 5.073 / 2.429 | 25.175 | Aranha de Conduto (16) |
| 17 | **33,4** | 26,0 | +28% | 123 | 3,7 | 0,4 | 1,8 | 162 / 11 | 3.517 | 2.322 / 538 | 29.069 | Draga Viva (17) |
| 18 | 31,4 | 27,5 | +14% | 132 | 4,2 | 0,6 | 0,9 | 162 / 14 | 4.461 | 2.448 / 374 | 33.448 | Escória Pressurizada (18) |
| 19 | 31,6 | 29,0 | +9% | 149 | 4,7 | 0,5 | 0,5 | 173 / 18 | 6.140 | 2.982 / 2.209 | 38.025 | Escória Pressurizada (18) |
| 20 | 29,6 | 30,5 | -3% | 132 | 4,5 | 0,0 | 0,1 | 106 / 15 | 7.418 | 1.251 / 1.441 | 43.033 | Salamandra de Cisterna (21) |
| 21 | 31,9 | 32,0 | -1% | 153 | 4,8 | 0,0 | 0,0 | 80 / 23 | 11.208 | 3.399 / 5.793 | 48.382 | Salamandra de Cisterna (21) |
| 22 | 27,5 | 33,5 | -18% | 169 | 6,2 | 0,3 | 0,0 | 184 / 20 | 10.907 | 1.794 / 203 | 54.038 | Sineiro de Bronze (22) |
| 23 | 34,0 | 35,0 | -3% | 170 | 5,0 | 0,3 | 0,8 | 216 / 21 | 13.765 | 5.450 / 9.305 | 60.303 | Voz Soterrada (23) |
| 24 | 33,7 | 36,5 | -8% | 167 | 5,0 | 0,4 | 0,5 | 229 / 23 | 12.935 | 5.542 / 3.155 | 66.754 | Toupeira de Basalto (24) |

### Bastião de Bronze (`bastion`)

8,01 h do 1 ao 25 (+4% da meta; 8/8 execuções concluídas). Plano de atributos: gerado (requisitos das faixas + Força/Vitalidade 2:3). Tempo: combate 70%, deslocamento e saque 4%, recuperação 3%, viagens 22%, cidade e prova 0%, caído/fugindo 0%. Dano por fonte: ataque básico 83%, Pulso de Atração 9%, Engrenagem Travada 8%; acerto 85%; 1.512 de dano causado e 509 recebido por minuto.

| Nível | Min | Meta | Desvio | Abates | Abates/min | Mortes | Fugas | Tônicos V/M | Ouro ganho (moedas + vendas) | Gasto: tônicos / equip. | XP de abates | Monstro principal |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1,6 | 2,0 | -21% | 16 | 10,1 | 0,0 | 0,0 | 0 / 0 | 61 | 0 / 0 | 80 | Rato de Sulco (1) |
| 2 | 4,2 | 3,5 | +21% | 16 | 3,8 | 0,0 | 0,0 | 0 / 0 | 83 | 54 / 33 | 256 | Besouro-Brasa (2) |
| 3 | 5,8 | 5,0 | +16% | 30 | 5,2 | 0,0 | 0,9 | 20 / 1 | 42 | 0 / 0 | 570 | Cão de Ferrugem (3) |
| 4 | 7,6 | 6,5 | +17% | 35 | 4,6 | 0,0 | 0,9 | 10 / 1 | 103 | 0 / 0 | 1.042 | Cão de Ferrugem (3) |
| 5 | 7,5 | 8,0 | -6% | 27 | 3,6 | 0,0 | 0,0 | 5 / 5 | 123 | 0 / 0 | 1.713 | Sapo-Bomba (5) |
| 6 | 10,8 | 9,5 | +13% | 31 | 2,9 | 0,1 | 1,8 | 23 / 5 | 252 | 220 / 170 | 2.526 | Enguia de Lodo (6) |
| 7 | 12,3 | 11,0 | +12% | 36 | 2,9 | 0,0 | 2,6 | 41 / 3 | 412 | 206 / 128 | 3.617 | Válvula Errante (7) |
| 8 | 13,8 | 12,5 | +11% | 46 | 3,3 | 0,0 | 0,5 | 29 / 6 | 809 | 292 / 137 | 4.877 | Garça de Ferrugem (8) |
| 9 | 17,1 | 14,0 | +22% | 48 | 2,8 | 0,6 | 0,9 | 76 / 5 | 706 | 494 / 228 | 6.427 | Autômato Escavador (9) |
| 10 | **19,5** | 15,5 | +26% | 57 | 2,9 | 0,6 | 0,4 | 75 / 7 | 1.087 | 440 / 522 | 8.256 | Rato-Engrenagem (10) |
| 11 | 18,7 | 17,0 | +10% | 60 | 3,2 | 0,3 | 0,5 | 84 / 7 | 1.773 | 555 / 538 | 10.314 | Soldador Cego (11) |
| 12 | 17,2 | 18,5 | -7% | 79 | 4,6 | 0,0 | 0,0 | 32 / 11 | 2.299 | 73 / 99 | 12.637 | Lâmina de Esteira (12) |
| 13 | 23,6 | 20,0 | +18% | 86 | 3,6 | 0,0 | 0,0 | 24 / 14 | 3.296 | 925 / 3.323 | 15.327 | Larva Térmica (13) |
| 14 | 18,2 | 21,5 | -16% | 102 | 5,6 | 0,5 | 0,0 | 87 / 9 | 2.534 | 0 / 0 | 18.233 | Ecoante (14) |
| 15 | 27,4 | 23,0 | +19% | 117 | 4,3 | 0,5 | 0,6 | 116 / 10 | 3.485 | 3.429 / 1.205 | 21.514 | Guardião de Galeria (15) |
| 16 | 27,0 | 24,5 | +10% | 118 | 4,4 | 0,3 | 0,8 | 149 / 15 | 4.286 | 2.898 / 1.565 | 25.161 | Aranha de Conduto (16) |
| 17 | 29,2 | 26,0 | +12% | 119 | 4,1 | 0,1 | 0,4 | 137 / 8 | 3.376 | 1.862 / 2.275 | 29.147 | Draga Viva (17) |
| 18 | 29,2 | 27,5 | +6% | 126 | 4,3 | 0,5 | 0,9 | 128 / 14 | 3.767 | 1.289 / 303 | 33.420 | Escória Pressurizada (18) |
| 19 | **36,6** | 29,0 | +26% | 145 | 4,0 | 0,1 | 1,3 | 120 / 14 | 6.481 | 3.886 / 2.867 | 37.987 | Escória Pressurizada (18) |
| 20 | 26,2 | 30,5 | -14% | 131 | 5,0 | 0,1 | 0,0 | 74 / 20 | 7.207 | 0 / 0 | 43.053 | Salamandra de Cisterna (21) |
| 21 | 32,8 | 32,0 | +2% | 153 | 4,7 | 0,0 | 0,0 | 45 / 20 | 10.927 | 1.521 / 7.272 | 48.343 | Salamandra de Cisterna (21) |
| 22 | 28,0 | 33,5 | -16% | 168 | 6,0 | 0,0 | 0,0 | 146 / 19 | 8.740 | 0 / 0 | 54.103 | Sineiro de Bronze (22) |
| 23 | 38,7 | 35,0 | +10% | 167 | 4,3 | 0,1 | 0,8 | 140 / 26 | 16.224 | 7.340 / 17.680 | 60.289 | Voz Soterrada (23) |
| 24 | 27,6 | 36,5 | -25% | 166 | 6,0 | 0,0 | 0,0 | 190 / 20 | 8.218 | 0 / 0 | 66.812 | Toupeira de Basalto (24) |

### Quebraferro (`breaker`)

8,57 h do 1 ao 25 (+11% da meta; 8/8 execuções concluídas). Plano de atributos: example_builds.json (breaker_physical). Tempo: combate 62%, deslocamento e saque 5%, recuperação 5%, viagens 27%, cidade e prova 0%, caído/fugindo 1%. Dano por fonte: ataque básico 80%, Talho Profundo 12%, Ruptura 3%, dano contínuo 3%, Fenda Sísmica 2%; acerto 88%; 1.440 de dano causado e 631 recebido por minuto.

| Nível | Min | Meta | Desvio | Abates | Abates/min | Mortes | Fugas | Tônicos V/M | Ouro ganho (moedas + vendas) | Gasto: tônicos / equip. | XP de abates | Monstro principal |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1,5 | 2,0 | -25% | 16 | 10,6 | 0,0 | 0,0 | 0 / 0 | 63 | 0 / 0 | 80 | Rato de Sulco (1) |
| 2 | 3,8 | 3,5 | +9% | 16 | 4,2 | 0,0 | 0,0 | 1 / 0 | 81 | 49 / 32 | 256 | Besouro-Brasa (2) |
| 3 | 4,1 | 5,0 | -17% | 30 | 7,3 | 0,0 | 0,1 | 19 / 1 | 63 | 0 / 0 | 570 | Cão de Ferrugem (3) |
| 4 | 6,6 | 6,5 | +2% | 32 | 4,8 | 0,0 | 0,9 | 8 / 3 | 120 | 0 / 0 | 1.041 | Lagarto de Lastro (4) |
| 5 | 7,7 | 8,0 | -4% | 26 | 3,4 | 0,0 | 0,0 | 7 / 3 | 106 | 0 / 0 | 1.704 | Sapo-Bomba (5) |
| 6 | 10,1 | 9,5 | +6% | 30 | 3,0 | 0,0 | 1,8 | 36 / 3 | 264 | 222 / 171 | 2.533 | Enguia de Lodo (6) |
| 7 | **15,8** | 11,0 | +43% | 38 | 2,4 | 0,1 | 3,6 | 32 / 3 | 423 | 262 / 199 | 3.610 | Enguia de Lodo (6) |
| 8 | 11,5 | 12,5 | -8% | 48 | 4,2 | 0,0 | 0,6 | 35 / 6 | 745 | 189 / 5 | 4.863 | Garça de Ferrugem (8) |
| 9 | 17,1 | 14,0 | +22% | 57 | 3,3 | 1,0 | 0,3 | 50 / 8 | 876 | 384 / 206 | 6.442 | Garça de Ferrugem (8) |
| 10 | 19,3 | 15,5 | +24% | 60 | 3,1 | 1,3 | 0,0 | 65 / 11 | 1.254 | 555 / 894 | 8.241 | Rato-Engrenagem (10) |
| 11 | 14,1 | 17,0 | -17% | 59 | 4,2 | 0,1 | 0,5 | 66 / 8 | 1.698 | 728 / 0 | 10.348 | Soldador Cego (11) |
| 12 | 15,3 | 18,5 | -17% | 79 | 5,1 | 0,3 | 0,0 | 52 / 8 | 2.203 | 0 / 0 | 12.630 | Lâmina de Esteira (12) |
| 13 | 20,3 | 20,0 | +1% | 86 | 4,2 | 0,0 | 0,0 | 32 / 10 | 3.163 | 1.449 / 2.776 | 15.327 | Larva Térmica (13) |
| 14 | 18,2 | 21,5 | -15% | 100 | 5,5 | 0,4 | 0,1 | 111 / 9 | 2.809 | 1.113 / 131 | 18.278 | Ecoante (14) |
| 15 | 27,1 | 23,0 | +18% | 115 | 4,3 | 0,6 | 0,5 | 125 / 9 | 4.224 | 4.467 / 777 | 21.496 | Guardião de Galeria (15) |
| 16 | 28,6 | 24,5 | +17% | 113 | 4,0 | 0,1 | 0,9 | 227 / 10 | 3.261 | 4.788 / 0 | 25.190 | Aranha de Conduto (16) |
| 17 | **37,4** | 26,0 | +44% | 120 | 3,2 | 0,6 | 1,4 | 192 / 10 | 3.625 | 2.300 / 1.368 | 29.024 | Draga Viva (17) |
| 18 | **38,2** | 27,5 | +39% | 134 | 3,5 | 1,8 | 1,6 | 190 / 13 | 3.856 | 2.333 / 709 | 33.413 | Escória Pressurizada (18) |
| 19 | **45,5** | 29,0 | +57% | 166 | 3,7 | 1,9 | 2,3 | 196 / 18 | 6.481 | 4.614 / 1.142 | 38.052 | Escória Pressurizada (18) |
| 20 | 29,6 | 30,5 | -3% | 135 | 4,6 | 0,0 | 0,0 | 123 / 18 | 7.287 | 132 / 603 | 43.106 | Salamandra de Cisterna (21) |
| 21 | 36,7 | 32,0 | +15% | 153 | 4,2 | 0,0 | 0,0 | 80 / 20 | 11.343 | 3.793 / 8.229 | 48.343 | Salamandra de Cisterna (21) |
| 22 | 31,9 | 33,5 | -5% | 173 | 5,4 | 0,9 | 0,1 | 155 / 22 | 11.801 | 2.744 / 1.097 | 54.051 | Salamandra de Cisterna (21) |
| 23 | 35,4 | 35,0 | +1% | 176 | 5,0 | 0,6 | 0,3 | 238 / 23 | 13.596 | 4.370 / 8.354 | 60.285 | Voz Soterrada (23) |
| 24 | 38,6 | 36,5 | +6% | 179 | 4,6 | 0,6 | 0,8 | 254 / 28 | 13.791 | 6.435 / 5.001 | 66.813 | Toupeira de Basalto (24) |

## Economia: ouro ganho × gasto (tônicos e equipamento)

Ganho = moedas saqueadas + vendas ao comerciante (sucata, peças substituídas e de outras classes, a `value × economy.sellFraction`). Gasto = tônicos na loja da cidade e peças comuns no armeiro (`value × economy.gearPriceMult`), sempre com ouro real (`buy`/`sell`). "Fatia" = gasto ÷ ganho.

| Classe | Moedas | Vendas | Gasto em tônicos | Gasto em equipamento | Fatia tônicos / equip. | Saldo no nível 25 | Ganho/h | Tônicos usados (V+M) | Itens vendidos | Idas à loja |
|---|---|---|---|---|---|---|---|---|---|---|
| Tecelão da Brasa | 75.817 | 17.104 | 26.109 | 35.513 | 28% / 38% | 31.299 | 14.312 | 1.914 | 783 | 12,5 |
| Andarilha do Vento | 74.543 | 21.385 | 27.889 | 38.450 | 29% / 40% | 29.589 | 14.611 | 1.969 | 876 | 12,1 |
| Vigia do Espinhal | 75.958 | 19.864 | 24.196 | 36.379 | 25% / 38% | 35.246 | 14.384 | 1.886 | 770 | 10,8 |
| Cantora do Véu | 73.377 | 14.137 | 20.173 | 37.325 | 23% / 43% | 30.016 | 12.026 | 1.444 | 653 | 10,6 |
| Escudeiro do Alvorecer | 71.356 | 21.777 | 28.982 | 39.042 | 31% / 42% | 25.109 | 12.571 | 1.981 | 854 | 13,4 |
| Lanceiro do Fosso | 70.943 | 21.390 | 37.554 | 30.333 | 41% / 33% | 24.447 | 11.685 | 2.348 | 911 | 15,3 |
| Bastião de Bronze | 69.154 | 17.135 | 25.484 | 38.344 | 30% / 44% | 22.462 | 10.776 | 1.988 | 773 | 14,5 |
| Quebraferro | 70.992 | 22.139 | 40.926 | 31.692 | 44% / 34% | 20.513 | 10.867 | 2.538 | 914 | 17,5 |

Por faixa de nível (média das classes): ouro ganho e gasto por hora, a fatia do ganho que vai para tônicos e para equipamento, e tônicos bebidos por hora.

| Níveis | Ganho/h | Tônicos/h (ouro) | Equipamento/h (ouro) | Fatia tônicos / equip. | Tônicos bebidos/h | Classe que mais gasta em tônicos (fatia) |
|---|---|---|---|---|---|---|
| 1–4 | 1.303 | 189 | 121 | 15% / 9% | 109 | Bastião de Bronze (19%) |
| 5–8 | 2.598 | 1.056 | 645 | 41% / 25% | 181 | Tecelão da Brasa (56%) |
| 9–12 | 5.696 | 1.382 | 1.219 | 24% / 21% | 228 | Tecelão da Brasa (33%) |
| 13–16 | 10.154 | 5.066 | 4.084 | 51% / 40% | 303 | Quebraferro (88%) |
| 17–20 | 13.073 | 4.003 | 4.281 | 32% / 32% | 278 | Quebraferro (44%) |
| 21–24 | 22.259 | 5.753 | 10.003 | 26% / 45% | 324 | Quebraferro (34%) |

- O ouro ganho por hora cresce de ~1.303/h (níveis 1–4) para ~22.259/h (21–24); o gasto com tônicos acompanha o dano recebido, não o nível: classes de distância que matam antes do contato compram pouco.
- Preço dos tônicos = 2 × valor (Pequeno de Vida 8, Médio de Vida 24, Pequeno de Mana 10, Médio de Mana 30); peças do armeiro = 2,5 × valor; venda ao comerciante = 0,50 × valor.

## Efeito da prova de classe (habilidade do nível 10)

A rodada principal faz a prova de classe no nível 10 (premissas). Para medir também a caça pura, sem nenhuma missão, as mesmas sementes foram simuladas **sem a prova**: sem a habilidade marcante do nível 10 e sem o tempo da viagem e da luta na arena. Média das classes: **7,36 h com prova** (-4% da meta) e **7,14 h sem prova** (-7%).

| Classe | Habilidade do nível 10 | Horas com prova | Horas sem prova | Diferença | Min nos níveis 10–24 (com / sem) | Mortes (com / sem) |
|---|---|---|---|---|---|---|
| Tecelão da Brasa | Círculo de Fuligem | 6,49 | 6,91 | +7% | 313 / 337 | 4,3 / 6,8 |
| Vigia do Espinhal | Chuva de Espinhos | 6,66 | 6,64 | -0% | 337 / 335 | 4,5 / 3,6 |
| Andarilha do Vento | Vento a Favor | 6,57 | 6,48 | -1% | 331 / 326 | 3,8 / 3,9 |
| Cantora do Véu | Selo do Véu | 7,28 | 7,10 | -3% | 366 / 356 | 3,5 / 3,4 |
| Escudeiro do Alvorecer | Juramento | 7,41 | 7,17 | -3% | 375 / 361 | 2,8 / 2,8 |
| Lanceiro do Fosso | Avanço do Fosso | 7,90 | 7,64 | -3% | 391 / 375 | 6,3 / 5,0 |
| Bastião de Bronze | Reforço de Campo | 8,01 | 7,46 | -7% | 400 / 367 | 3,9 / 3,8 |
| Quebraferro | Ruptura | 8,57 | 7,68 | -10% | 436 / 383 | 10,3 / 6,9 |

| Nível | Meta (min) | Média com prova | Média sem prova |
|---|---|---|---|
| 10 | 15,5 | 18,4 | 17,0 |
| 11 | 17,0 | 13,4 | 12,9 |
| 12 | 18,5 | 15,6 | 14,7 |
| 13 | 20,0 | 20,4 | 20,0 |
| 14 | 21,5 | 18,7 | 17,6 |
| 15 | 23,0 | 22,6 | 21,8 |
| 16 | 24,5 | 22,3 | 23,1 |
| 17 | 26,0 | 27,0 | 25,3 |
| 18 | 27,5 | 25,7 | 23,4 |
| 19 | 29,0 | 29,3 | 25,0 |
| 20 | 30,5 | 27,1 | 26,6 |
| 21 | 32,0 | 31,6 | 31,6 |
| 22 | 33,5 | 28,8 | 28,5 |
| 23 | 35,0 | 34,5 | 34,0 |
| 24 | 36,5 | 33,3 | 33,4 |

Prova: 64 de 64 execuções venceram (1,0 tentativa(s) por execução em média; 31 s de luta na arena). A diferença de tempo inclui a ida à cidade da classe e a volta (2 × as trocas de mapa até lá). Com a habilidade extra o bot gasta mana em mais uma habilidade; ele só usa reforços de defesa caros, escudos e áreas em volta de si quando a luta pede (vários atacantes ou vida baixa), e nunca usa área que acorde monstro parado.

## Equipamento

Peças comuns do kit da faixa (arma + mão secundária + 4 de armadura) compradas no armeiro com ouro, e quantos minutos de jogo depois de chegar ao nível da faixa o kit ficou completo (equipado ou na bolsa à espera de requisito). "Já tinha" conta peças da faixa que o bot já possuía ao chegar (saque ou compra adiantada).

| Classe | Peças compradas | Já tinha ao chegar | Melhorias do chão | Kit 5: atraso (min) | Kit 9: atraso (min) | Kit 13: atraso (min) | Kit 17: atraso (min) | Kit 21: atraso (min) | Exemplos do chão |
|---|---|---|---|---|---|---|---|---|---|
| Tecelão da Brasa | 40,6 | 7,5 | 5,1 | 24 | 31 | 5 | 4 | 0 | `amulet_t1`, `ring_t5`, `wand_t17`, `ring_t17`, `robe_gloves_t21`, `amulet_t21`, `focus_t21`, `robe_t21` |
| Andarilha do Vento | 41,9 | 5,9 | 5,1 | 20 | 29 | 3 | 3 | 6 | `light_armor_t9`, `ring_t13`, `amulet_t13`, `javelin_t17`, `light_gloves_t17`, `light_boots_t21`, `light_gloves_t21`, `amulet_t1` |
| Vigia do Espinhal | 41,5 | 7,0 | 5,6 | 18 | 23 | 3 | 2 | 5 | `ring_t5`, `amulet_t5`, `amulet_t13`, `bow_t17`, `amulet_t17`, `quiver_t25`, `bow_t21`, `light_boots_t25` |
| Cantora do Véu | 42,3 | 5,5 | 5,5 | 22 | 22 | 3 | 5 | 2 | `amulet_t5`, `amulet_second_toll`, `scepter_t21`, `amulet_t21`, `amulet_t25`, `focus_t25`, `ring_t21`, `robe_gloves_t13` |
| Escudeiro do Alvorecer | 41,3 | 4,0 | 5,6 | 28 | 31 | 4 | 21 | 6 | `heavy_boots_t5`, `amulet_t13`, `shield_t17`, `heavy_armor_t21`, `shield_t21`, `sword_1h_t21`, `ring_t25`, `ring_t9` |
| Lanceiro do Fosso | 34,6 | 4,8 | 5,8 | 33 | 22 | 3 | 49 | 7 | `amulet_t5`, `ring_t5`, `ring_t13`, `heavy_boots_t17`, `heavy_gloves_t25`, `heavy_armor_t21`, `ring_t21`, `amulet_t21` |
| Bastião de Bronze | 39,8 | 6,1 | 6,5 | 34 | 44 | 7 | 22 | 5 | `amulet_t9`, `hammer_1h_t17`, `shield_t21`, `ring_t5`, `ring_t17`, `amulet_t17`, `heavy_armor_t21`, `ring_t1` |
| Quebraferro | 34,3 | 2,3 | 6,3 | 30 | 27 | 3 | 62 | 9 | `amulet_t1`, `heavy_gloves_t5`, `amulet_second_toll`, `amulet_t9`, `axe_1h_t17`, `amulet_t13`, `heavy_armor_t17`, `ring_t17` |

## Premissas do modelo

- **Só caça.** Nenhuma missão é feita nem entregue (sem XP, ouro ou itens de missão). Exceção modelada: a **prova de classe no nível 10**, porque é o que libera a habilidade do nível 10. Os pré-requisitos de "Prova de Classe" são marcados como concluídos com o comando de mestre `quest_done` (sem recompensas), a missão é aceita no mestre da classe e a prova é lutada de verdade na arena; a missão não é entregue (o XP de 1.800 não entra).
- **Ações só pelo protocolo:** move, attack, stop, cast, use_item, pickup, equip/unequip, allocate, learn_skill, buy, sell, respawn, quest_accept/trial_start e os comandos de mestre teleport/quest_done. As decisões usam a visão montada pelos snapshots e a ficha devolvida pelo pedido `char` (o bot não lê o estado interno da zona). Reação a cada 200 ms, no máximo uma habilidade por decisão, respeitando a recarga global; habilidades com conjuração só começam com o personagem parado e o bot não age até o fim (`cast_end`). 0,5 s de pausa depois de cada abate antes de escolher o próximo alvo. É um jogador eficiente: um jogador humano tende a ser mais lento (pausas, erros de posicionamento, distração).
- **Viagem entre mapas:** teleporte de mestre até o posto de guarda do mapa (ou ao lado do NPC, na cidade) seguido de 60 s parados por troca de mapa no caminho de portais (busca em largura respeitando o nível mínimo de cada portal). Dentro do mapa o bot anda (move/attack) como um jogador.
- **Área de caça:** grupos de monstros normais com nível em [nível−2, nível+1], preferindo o próprio nível, monstros passivos e grupos agressivos menos densos; elites, chefes e elites diárias ficam de fora (só são enfrentados se atacarem). O alvo é o monstro do grupo com menos vizinhos agressivos a 8,5 m (puxar pela borda). Morte vale 3 pontos de perigo e fuga 1; 3 pontos em 10 min fazem o bot caçar um nível abaixo por 20 min, longe daquela área.
- **Tônicos:** em combate, vida abaixo de 40% — 50% com dois monstros batendo e 65% com três ou mais, quando a recarga de 3 s dos tônicos é o gargalo (com três ou mais bebe o maior tônico que tem; senão, o menor que aproveita bem a cura); fora de combate, vida abaixo de 55% (sem tônico, descansa com `stop` até 92%). Conjuradores (Tecelão, Cantora): mana abaixo de 20% em combate e de 35% fora (sem tônico, descansa até 85%); as classes físicas não param por mana (lutam com o ataque básico). Tônico Médio só a partir do nível 9 (o servidor confere o nível do item). Foge para o posto abaixo de 20% de vida sem tônico; caído, espera 5 s e volta ao posto (`respawn`, 50% de vida).
- **Cidade:** na cidade da classe (Pedrâmbar ou Vau de Nácar), primeiro o armeiro, depois a loja de tônicos. Vai quando restam menos de 5 tônicos e 80% do ouro compra ao menos 40 Pequenos, quando o ouro paga o equipamento que falta (abaixo) ou quando a bolsa enche. Estoque-alvo: 100 tônicos de vida ou o dobro do gasto no nível anterior (até 200); 60 de mana para conjuradores, 10 para os demais. A ida e a volta custam as mesmas trocas de mapa.
- **Equipamento:** ao chegar ao nível 5, 9, 13, 17, 21 ou 25 o bot quer as peças comuns da faixa (arma, mão secundária e 4 de armadura; o Cetro da faixa 17 é raro, então a Cantora usa a Varinha comum nessa faixa) e as **compra no armeiro com ouro** (`buy`, valor × `economy.gearPriceMult`), a arma primeiro, guardando antes o ouro de 60 tônicos de vida (40 de mana para conjuradores). Vai à cidade só por isso quando o ouro que sobra paga o kit que falta ou a próxima peça e 60% do resto (no máximo uma ida dessas a cada 10 min). Com o kit completo e ouro além do estoque cheio de tônicos, compra adiantado o kit da próxima faixa (a até 2 níveis dela) e as joias da faixa. Também recolhe do chão as melhorias da própria classe e equipa quando cumpre os requisitos. Sem refino no ferreiro.
- **Venda:** materiais, peças de outras classes e peças substituídas são recolhidos do chão (com mais de 5 espaços livres na bolsa) e vendidos ao comerciante (`sell`, valor × `economy.sellFraction`) a cada visita à cidade; o depósito não é usado.
- **Atributos e habilidades:** Quebraferro e Tecelão seguem os planos de `data/example_builds.json`; as demais classes usam um plano gerado no mesmo espírito (requisitos do kit da próxima faixa espalhados pelos níveis até ela e o resto 2:3 entre o atributo de dano da arma e Vitalidade), conferido nível a nível. Graus de habilidade: um ponto por nível na ordem de prioridade da classe (`server/tools/lib/progressao/planos.mjs`).

## Problemas e observações encontrados no jogo

1. **Equilíbrio entre classes na caça solo:** Tecelão da Brasa chega ao nível 25 em 6,49 h e Quebraferro em 8,57 h (1,3×). Todas as classes ficam a até ±25% da meta total (de -16% a +11%).
2. **Dano por classe:** Tecelão da Brasa 1.845/min (básico 40%, Faísca de Vidro 28%; recebe 428/min); Vigia do Espinhal 1.806/min (básico 85%, Flecha de Passagem 6%; recebe 545/min); Andarilha do Vento 1.797/min (básico 88%, Arremesso de Retorno 8%; recebe 567/min); Cantora do Véu 1.675/min (básico 54%, Nota Clara 46%; recebe 799/min); Escudeiro do Alvorecer 1.601/min (básico 75%, Corte Solar 16%; recebe 563/min); Lanceiro do Fosso 1.572/min (básico 78%, Estocada Longa 13%; recebe 618/min); Bastião de Bronze 1.512/min (básico 83%, Pulso de Atração 9%; recebe 509/min); Quebraferro 1.440/min (básico 80%, Talho Profundo 12%; recebe 631/min). Média: 1.656 de dano causado por minuto.
3. **Ataque básico ainda é quase todo o dano de:** Bastião de Bronze (83%), Vigia do Espinhal (85%), Andarilha do Vento (88%).
4. **Cantora do Véu antes do nível 15:** -2% da meta somando os níveis 1–14; é a classe mais lenta nos níveis 2, 3, 14. Nota Clara (nível 5) faz 46% do dano da rodada inteira; as curas somam 245 de vida por minuto.
5. **Curva de XP:** todos os níveis ficam a até ±25% da meta na média das classes (maior desvio: nível 11, -21%). O total 1→25 fica em -4% da meta. Ritmo médio: 10,1 abates/min no nível 1, 4,9 na média dos níveis.
6. **Onde se morre:** níveis com mais mortes: 10 (0,81 por classe), 9 (0,71 por classe), 24 (0,56 por classe), 19 (0,41 por classe). Monstros que mais derrubam (mortes por execução, somando as classes; um monstro conta em toda morte em que estava batendo): Autômato Escavador (nv 9, agressivo) 6,8, Rato-Engrenagem (nv 10, agressivo) 4,5, Sineiro de Bronze (nv 22, agressivo) 4,4, Voz Soterrada (nv 23, agressivo) 3,7, Escória Pressurizada (nv 18, agressivo) 3,7. Mortes por classe (média por execução): Tecelão da Brasa 4,3, Andarilha do Vento 3,8, Vigia do Espinhal 4,5, Cantora do Véu 3,5, Escudeiro do Alvorecer 2,8, Lanceiro do Fosso 6,3, Bastião de Bronze 3,9, Quebraferro 10,3 — 4,9 em média. Quase toda queda é numa briga com vários monstros ao mesmo tempo (de 4,2 a 4,9 atacantes, em média, nos 10 s antes de cair; 97% a 100% das mortes com 3 ou mais). Todas as classes entram em brigas com 4 ou mais monstros num ritmo parecido (3,7 a 5,9 por hora: assistência dos iguais a até 8 m, agressão por proximidade e monstros que reaparecem perto); o que muda é quanto cada uma aguenta: mortes por briga dessas de 0,06 (Escudeiro do Alvorecer) a 0,21 (Quebraferro). Do nível 9 em diante, 57% a 100% das mortes acontecem já sem tônico médio na bolsa (o bot só compra o médio quando o ouro paga 40 e segue caçando com os pequenos quando os médios acabam).
7. **Economia:** do ouro ganho (moedas + vendas), os tônicos levam de 23% a 44% (mais: Quebraferro) e o equipamento do armeiro de 33% a 44%; juntos, 63% a 78%. As vendas ao comerciante são 21% do ganho. Saldo ao chegar ao nível 25: 20.513 a 35.246 de ouro (inclui o que sobra para o kit da faixa 25, que o bot só compra adiantado com ouro de sobra).
8. **Equipamento comprado no armeiro:** 39,5 peças por classe em média; o kit comum fica completo, em média, 26 min depois do nível 5, 28 min depois do nível 9, 4 min depois do nível 13, 21 min depois do nível 17, 5 min depois do nível 21 (o atraso é o tempo de juntar o ouro e ir à cidade). Pelo saque chegam 5,7 melhorias por classe.
9. **Conjuração e recarga global:** Vigia do Espinhal conjurou 90 vezes (90 concluídas, 0 interrompidas); Tecelão da Brasa conjurou 178 vezes (177 concluídas, 2 interrompidas). O bot só começa a conjurar parado e não age durante a conjuração; com a recarga global de 1,0 s ele não tenta outra habilidade antes do fim dela.

## Modo acelerado e desempenho da ferramenta

- Laço de `server.step(100)` (100 ms de jogo por chamada) num GameServer sem `start()`: banco SQLite em memória (`--banco-arquivo` usa um arquivo temporário), modo dev, sessões falsas e pedidos síncronos por `server.onMessage`. 471 h de jogo simuladas em 19,0 min de CPU (1.491× o tempo real por linha de execução); 3 linhas de execução (`worker_threads`) em paralelo, 12,8 min de relógio no total.
- Temporizadores do jogo usam `zone.now` (soma dos dt): recargas, conjurações, efeitos, regeneração, tônicos, ataques e reaparecimento funcionam acelerados sem ajuste. `Date.now()` aparece em prazos de relógio de parede (validade do saque de 30 min, dia da elite diária, carimbos do banco, convites e calabouço); dentro da simulação ele segue o tempo simulado, para esses prazos correrem no ritmo do jogo.
- Zonas abertas sem jogador param 30 s depois que o último jogador sai e, quando alguém entra, o relógio da zona é adiantado até o tempo global (o valor que teria sem parar), então monstros mortos reaparecem e recargas levadas entre zonas continuam valendo; instâncias não são tocadas. 87% dos ticks de zona foram pulados. Um passo com só a zona ativa custa ~20–40 µs.
- Snapshots: o bot pede `{ delta: true }` no login. Se o servidor manda diferenças, elas são mescladas como em `mergeSnap` (test/helpers/client.js); se manda o snapshot completo, só o último é decodificado, quando o bot olha o mundo. Nesta rodada o servidor mandou diferenças. A sessão falsa nasce por `server.onConnection` (com um ws falso) e a simulação desliga o limite de comandos por conexão (`rateLimit`), que é medido em tempo real. Mensagens `hit`/`heal` alimentam a contabilidade de dano e `cast_end` encerra a conjuração do bot; as de efeito visual são descartadas sem decodificar.
