<!-- Arquivo gerado por `npm run simular-progressao` (server/tools/simular-progressao.mjs). Rode de novo para atualizar. -->

# Relatório de progressão simulada (Marco 4)

Simulação acelerada, em processo, de caça solo do nível 1 ao 25 para 8 classes, contra as metas de teste de `data/xp_table.json` (`targetMinutesToNext`, ver [docs/04](04-progressao-e-formulas.md)). Cada classe foi jogada por um bot que só caça (sem missões), com 8 sementes (1, 2, 3, 4, 5, 6, 7, 8). Os números abaixo são **médias das sementes**; a meta é considerada atingida quando o tempo fica a até ±25% dela.

Gerado em 2026-11-23 05:50 UTC · tempo real 9,4 min (3 linhas de execução) · 469 h de jogo simuladas.

```
cd server && npm run simular-progressao
```

## Resumo

- Meta só caça do 1 ao 25: **7,7 h**. Média das classes: **7,33 h** (-5%).
- Mais rápida: Tecelão da Brasa (6,42 h); mais lenta: Bastião de Bronze (8,26 h) — razão 1,3×.
- Níveis em que a média das classes sai da faixa de ±25%: nenhum.
- Viagens (troca de mapa a 60 s cada: ir às novas áreas, à loja, ao armeiro e à prova) são 23% do tempo. Recuperação fora de combate (tônico ou descanso) fica em 1–13% para todas as classes, porque os bots compram e bebem tônicos em vez de esperar a regeneração (1,5% da vida por segundo).

| Classe | Horas 1→25 (média) | Mín–máx | Desvio da meta | Abates | Mortes | Fugas | Tônicos V/M | Ouro ganho/h | Gasto/h (tônicos + equip.) | Prova |
|---|---|---|---|---|---|---|---|---|---|---|
| Tecelão da Brasa | 6,42 | 6,17–6,83 | -17% | 2.057 | 4,4 | 0,0 | 975 / 1.002 | 14.448 | 8.919 (4.119 + 4.801) | 8/8 |
| Andarilha do Vento | 6,54 | 6,19–6,75 | -15% | 2.048 | 3,8 | 3,8 | 1.719 / 259 | 14.392 | 10.180 (4.303 + 5.876) | 8/8 |
| Vigia do Espinhal | 6,73 | 6,31–7,09 | -13% | 2.031 | 3,8 | 2,3 | 1.638 / 263 | 13.978 | 9.274 (3.859 + 5.416) | 8/8 |
| Cantora do Véu | 7,25 | 7,09–7,44 | -6% | 2.037 | 3,6 | 0,6 | 705 / 755 | 12.062 | 7.911 (2.767 + 5.144) | 8/8 |
| Escudeiro do Alvorecer | 7,28 | 7,04–7,83 | -6% | 2.071 | 2,9 | 8,1 | 1.720 / 256 | 12.766 | 9.339 (3.961 + 5.378) | 8/8 |
| Lanceiro do Fosso | 7,99 | 6,91–9,13 | +4% | 2.104 | 6,3 | 15,6 | 2.121 / 249 | 11.753 | 8.830 (4.771 + 4.058) | 8/8 |
| Quebraferro | 8,15 | 7,21–9,18 | +6% | 2.111 | 7,1 | 13,6 | 2.206 / 253 | 11.193 | 8.810 (4.709 + 4.101) | 8/8 |
| Bastião de Bronze | 8,26 | 7,03–9,26 | +7% | 2.072 | 3,6 | 14,6 | 1.811 / 240 | 10.519 | 7.927 (3.479 + 4.448) | 8/8 |

### Para onde vai o tempo

Fatia do tempo total de cada classe. Viagens: trocas de mapa a 60 s cada, com a quantidade média por motivo (caça inclui trocar de área por perigo).

| Classe | Combate | Deslocamento e saque | Recuperação | Viagens | Trocas de mapa: caça / tônicos e venda / equipamento / prova | Cidade e prova | Caído e fugindo |
|---|---|---|---|---|---|---|---|
| Tecelão da Brasa | 57% | 6% | 13% | 23% | 48 / 26 / 13 / 2 | 0% | 0% |
| Andarilha do Vento | 70% | 6% | 2% | 22% | 47 / 22 / 15 / 2 | 0% | 0% |
| Vigia do Espinhal | 71% | 5% | 3% | 20% | 43 / 19 / 16 / 3 | 0% | 0% |
| Cantora do Véu | 72% | 4% | 5% | 18% | 43 / 21 / 14 / 3 | 0% | 0% |
| Escudeiro do Alvorecer | 71% | 5% | 1% | 22% | 52 / 28 / 15 / 2 | 0% | 0% |
| Lanceiro do Fosso | 63% | 5% | 5% | 26% | 68 / 41 / 16 / 2 | 0% | 1% |
| Quebraferro | 64% | 5% | 5% | 26% | 67 / 41 / 17 / 2 | 0% | 0% |
| Bastião de Bronze | 68% | 4% | 3% | 24% | 64 / 37 / 18 / 2 | 0% | 0% |

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
| 10 | 15,5 | 18,7 | +21% | ok | 1/8 | Vigia do Espinhal 16,6 | Andarilha do Vento 19,4 | 2,9 | 0,78 |
| 11 | 17,0 | 13,6 | -20% | ok | 2/8 | Cantora do Véu 9,5 | Bastião de Bronze 18,9 | 4,5 | 0,18 |
| 12 | 18,5 | 15,8 | -15% | ok | 1/8 | Andarilha do Vento 13,7 | Bastião de Bronze 19,6 | 5,1 | 0,00 |
| 13 | 20,0 | 20,3 | +2% | ok | 0/8 | Andarilha do Vento 19,0 | Bastião de Bronze 23,9 | 4,2 | 0,00 |
| 14 | 21,5 | 18,7 | -13% | ok | 1/8 | Andarilha do Vento 14,7 | Cantora do Véu 26,8 | 5,5 | 0,33 |
| 15 | 23,0 | 21,7 | -6% | ok | 2/8 | Tecelão da Brasa 11,6 | Bastião de Bronze 26,2 | 5,5 | 0,33 |
| 16 | 24,5 | 22,7 | -8% | ok | 1/8 | Tecelão da Brasa 11,7 | Quebraferro 29,3 | 5,4 | 0,16 |
| 17 | 26,0 | 27,1 | +4% | ok | 2/8 | Tecelão da Brasa 21,3 | Lanceiro do Fosso 34,2 | 4,5 | 0,21 |
| 18 | 27,5 | 25,6 | -7% | ok | 5/8 | Tecelão da Brasa 13,5 | Lanceiro do Fosso 40,0 | 5,4 | 0,38 |
| 19 | 29,0 | 28,8 | -1% | ok | 0/8 | Vigia do Espinhal 23,3 | Bastião de Bronze 34,6 | 5,1 | 0,13 |
| 20 | 30,5 | 26,9 | -12% | ok | 1/8 | Andarilha do Vento 22,1 | Bastião de Bronze 31,2 | 4,8 | 0,00 |
| 21 | 32,0 | 30,2 | -6% | ok | 1/8 | Tecelão da Brasa 21,3 | Quebraferro 36,3 | 5,2 | 0,00 |
| 22 | 33,5 | 29,4 | -12% | ok | 1/8 | Andarilha do Vento 23,0 | Tecelão da Brasa 36,3 | 5,9 | 0,35 |
| 23 | 35,0 | 33,6 | -4% | ok | 1/8 | Tecelão da Brasa 20,0 | Escudeiro do Alvorecer 39,1 | 5,3 | 0,35 |
| 24 | 36,5 | 33,4 | -9% | ok | 0/8 | Bastião de Bronze 29,0 | Cantora do Véu 38,1 | 5,3 | 0,50 |

### Minutos por nível e classe

| Nível | Meta | Tecelão da Brasa | Andarilha do Vento | Vigia do Espinhal | Cantora do Véu | Escudeiro do Alvorecer | Lanceiro do Fosso | Quebraferro | Bastião de Bronze |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 2,0 | 2,4 | **1,3** | **1,4** | 2,1 | **1,4** | **1,5** | 1,5 | 1,6 |
| 2 | 3,5 | **4,7** | 3,8 | 3,9 | **4,8** | 3,8 | 4,0 | 3,8 | 4,2 |
| 3 | 5,0 | 5,2 | 4,0 | 4,2 | **6,6** | 3,8 | 4,9 | 4,1 | 5,8 |
| 4 | 6,5 | 6,1 | **4,2** | **3,9** | 6,1 | 5,4 | 6,6 | 6,6 | 7,6 |
| 5 | 8,0 | 9,6 | **6,0** | **5,7** | 7,5 | 6,1 | 8,5 | 7,7 | 7,5 |
| 6 | 9,5 | 9,5 | 10,8 | 10,1 | 9,3 | 9,9 | 11,0 | 10,1 | 10,8 |
| 7 | 11,0 | 11,7 | 8,8 | 9,1 | 10,3 | 11,8 | **17,0** | **15,8** | 12,3 |
| 8 | 12,5 | 12,8 | 10,5 | **8,4** | **9,1** | 10,9 | 11,2 | 11,5 | 13,8 |
| 9 | 14,0 | 15,3 | 13,6 | 16,4 | 14,5 | 16,2 | **18,7** | 17,1 | 17,1 |
| 10 | 15,5 | 19,0 | **19,4** | 16,6 | 19,3 | 18,2 | 18,6 | 19,2 | 19,3 |
| 11 | 17,0 | 13,5 | **12,3** | 13,1 | **9,5** | 13,1 | 13,7 | 14,5 | 18,9 |
| 12 | 18,5 | 14,6 | **13,7** | 16,2 | 16,3 | 14,7 | 15,8 | 15,1 | 19,6 |
| 13 | 20,0 | 19,7 | 19,0 | 19,7 | 20,2 | 20,3 | 19,9 | 19,8 | 23,9 |
| 14 | 21,5 | 21,1 | **14,7** | 16,2 | 26,8 | 16,4 | 16,2 | 18,0 | 20,1 |
| 15 | 23,0 | **11,6** | 22,8 | 23,8 | **16,7** | 23,0 | 25,2 | 24,3 | 26,2 |
| 16 | 24,5 | **11,7** | 21,9 | 22,2 | 19,2 | 25,0 | 25,5 | 29,3 | 26,5 |
| 17 | 26,0 | 21,3 | 21,8 | 23,3 | 26,1 | 24,6 | **34,2** | 31,7 | **34,1** |
| 18 | 27,5 | **13,5** | **19,0** | 20,8 | **19,2** | 23,2 | **40,0** | **38,4** | 30,7 |
| 19 | 29,0 | 25,0 | 27,0 | 23,3 | 27,9 | 27,1 | 33,9 | 31,9 | 34,6 |
| 20 | 30,5 | 24,0 | **22,1** | 23,1 | 30,0 | 28,0 | 26,2 | 30,7 | 31,2 |
| 21 | 32,0 | **21,3** | 27,5 | 31,0 | 26,9 | 33,0 | 31,5 | 36,3 | 34,4 |
| 22 | 33,5 | 36,3 | **23,0** | 25,6 | 34,2 | 27,1 | 27,4 | 34,2 | 27,4 |
| 23 | 35,0 | **20,0** | 34,6 | 35,5 | 34,6 | 39,1 | 32,0 | 34,4 | 38,9 |
| 24 | 36,5 | 35,5 | 30,8 | 30,1 | 38,1 | 34,8 | 35,7 | 33,2 | 29,0 |

Negrito: fora de ±25% da meta.

## Detalhe por classe

### Tecelão da Brasa (`emberweaver`)

6,42 h do 1 ao 25 (-17% da meta; 8/8 execuções concluídas). Plano de atributos: example_builds.json (emberweaver_magic). Tempo: combate 57%, deslocamento e saque 6%, recuperação 13%, viagens 23%, cidade e prova 0%, caído/fugindo 0%. Dano por fonte: ataque básico 40%, Faísca de Vidro 28%, Chão em Brasa 14%, Círculo de Fuligem 10%, Coração da Fornalha 6%; acerto 100%; 1.877 de dano causado e 439 recebido por minuto.

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
| 10 | 19,0 | 15,5 | +23% | 57 | 3,0 | 0,8 | 0,0 | 29 / 36 | 1.402 | 617 / 877 | 8.251 | Rato-Engrenagem (10) |
| 11 | 13,5 | 17,0 | -20% | 58 | 4,3 | 0,1 | 0,0 | 33 / 42 | 1.759 | 755 / 179 | 10.313 | Soldador Cego (11) |
| 12 | 14,6 | 18,5 | -21% | 79 | 5,4 | 0,0 | 0,0 | 39 / 51 | 2.251 | 197 / 0 | 12.632 | Lâmina de Esteira (12) |
| 13 | 19,7 | 20,0 | -2% | 86 | 4,4 | 0,0 | 0,0 | 34 / 64 | 3.040 | 780 / 3.065 | 15.305 | Larva Térmica (13) |
| 14 | 21,1 | 21,5 | -2% | 99 | 4,7 | 0,0 | 0,0 | 54 / 65 | 4.285 | 4.536 / 512 | 18.239 | Ecoante (14) |
| 15 | **11,6** | 23,0 | -50% | 105 | 9,1 | 0,0 | 0,0 | 37 / 45 | 3.202 | 0 / 0 | 21.534 | Guardião de Galeria (15) |
| 16 | **11,7** | 24,5 | -52% | 109 | 9,3 | 0,0 | 0,0 | 66 / 46 | 3.186 | 0 / 0 | 25.162 | Aranha de Conduto (16) |
| 17 | 21,3 | 26,0 | -18% | 114 | 5,4 | 0,0 | 0,0 | 40 / 47 | 5.824 | 3.211 / 6.441 | 29.105 | Draga Viva (17) |
| 18 | **13,5** | 27,5 | -51% | 119 | 8,8 | 0,0 | 0,0 | 51 / 54 | 4.320 | 0 / 0 | 33.425 | Escória Pressurizada (18) |
| 19 | 25,0 | 29,0 | -14% | 141 | 5,7 | 0,0 | 0,0 | 58 / 60 | 7.953 | 3.166 / 7.692 | 38.030 | Escória Pressurizada (18) |
| 20 | 24,0 | 30,5 | -21% | 124 | 5,2 | 0,0 | 0,0 | 47 / 73 | 7.622 | 1.220 / 2.612 | 43.074 | Salamandra de Cisterna (21) |
| 21 | **21,3** | 32,0 | -34% | 153 | 7,2 | 0,0 | 0,0 | 46 / 77 | 8.157 | 0 / 0 | 48.343 | Salamandra de Cisterna (21) |
| 22 | 36,3 | 33,5 | +8% | 170 | 4,7 | 0,5 | 0,0 | 93 / 76 | 14.112 | 5.967 / 3.859 | 54.108 | Sineiro de Bronze (22) |
| 23 | **20,0** | 35,0 | -43% | 173 | 8,6 | 0,6 | 0,0 | 117 / 90 | 9.014 | 0 / 0 | 60.241 | Voz Soterrada (23) |
| 24 | 35,5 | 36,5 | -3% | 204 | 5,8 | 1,6 | 0,0 | 127 / 94 | 13.623 | 4.643 / 4.923 | 66.826 | Toupeira de Basalto (24) |

### Andarilha do Vento (`windwalker`)

6,54 h do 1 ao 25 (-15% da meta; 8/8 execuções concluídas). Plano de atributos: gerado (requisitos das faixas + Agilidade/Vitalidade 2:3). Tempo: combate 70%, deslocamento e saque 6%, recuperação 2%, viagens 22%, cidade e prova 0%, caído/fugindo 0%. Dano por fonte: ataque básico 89%, Arremesso de Retorno 7%, Rajada Cortante 3%, Olho do Furacão 2%; acerto 96%; 1.809 de dano causado e 580 recebido por minuto.

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
| 10 | **19,4** | 15,5 | +25% | 54 | 2,8 | 0,8 | 0,0 | 59 / 7 | 1.321 | 602 / 1.159 | 8.265 | Rato-Engrenagem (10) |
| 11 | **12,3** | 17,0 | -28% | 59 | 4,8 | 0,3 | 0,1 | 61 / 8 | 1.675 | 329 / 93 | 10.245 | Soldador Cego (11) |
| 12 | **13,7** | 18,5 | -26% | 79 | 5,8 | 0,0 | 0,0 | 31 / 10 | 2.186 | 0 / 0 | 12.670 | Lâmina de Esteira (12) |
| 13 | 19,0 | 20,0 | -5% | 86 | 4,5 | 0,0 | 0,0 | 21 / 14 | 3.278 | 1.019 / 3.590 | 15.305 | Larva Térmica (13) |
| 14 | **14,7** | 21,5 | -32% | 100 | 6,8 | 0,1 | 0,0 | 88 / 10 | 2.714 | 0 / 0 | 18.284 | Ecoante (14) |
| 15 | 22,8 | 23,0 | -1% | 114 | 5,0 | 0,6 | 0,3 | 103 / 13 | 4.460 | 2.916 / 1.870 | 21.543 | Guardião de Galeria (15) |
| 16 | 21,9 | 24,5 | -11% | 120 | 5,5 | 0,1 | 0,1 | 151 / 13 | 4.011 | 2.215 / 2.013 | 25.168 | Aranha de Conduto (16) |
| 17 | 21,8 | 26,0 | -16% | 114 | 5,2 | 0,0 | 0,1 | 98 / 14 | 5.114 | 2.706 / 1.473 | 29.070 | Draga Viva (17) |
| 18 | **19,0** | 27,5 | -31% | 121 | 6,4 | 0,0 | 0,1 | 111 / 14 | 4.769 | 620 / 125 | 33.427 | Escória Pressurizada (18) |
| 19 | 27,0 | 29,0 | -7% | 141 | 5,2 | 0,0 | 0,5 | 119 / 19 | 7.975 | 4.433 / 6.423 | 37.996 | Escória Pressurizada (18) |
| 20 | **22,1** | 30,5 | -27% | 125 | 5,6 | 0,0 | 0,0 | 69 / 15 | 6.754 | 0 / 0 | 43.100 | Salamandra de Cisterna (21) |
| 21 | 27,5 | 32,0 | -14% | 152 | 5,6 | 0,0 | 0,0 | 53 / 24 | 10.626 | 1.151 / 5.059 | 48.303 | Salamandra de Cisterna (21) |
| 22 | **23,0** | 33,5 | -31% | 171 | 7,4 | 0,4 | 0,0 | 150 / 21 | 8.923 | 0 / 0 | 54.046 | Sineiro de Bronze (22) |
| 23 | 34,6 | 35,0 | -1% | 166 | 4,8 | 0,0 | 0,8 | 178 / 26 | 15.561 | 7.334 / 16.026 | 60.341 | Voz Soterrada (23) |
| 24 | 30,8 | 36,5 | -16% | 173 | 5,6 | 0,6 | 0,3 | 222 / 23 | 11.799 | 3.701 / 0 | 66.811 | Toupeira de Basalto (24) |

### Vigia do Espinhal (`warden`)

6,73 h do 1 ao 25 (-13% da meta; 8/8 execuções concluídas). Plano de atributos: gerado (requisitos das faixas + Agilidade/Vitalidade 2:3). Tempo: combate 71%, deslocamento e saque 5%, recuperação 3%, viagens 20%, cidade e prova 0%, caído/fugindo 0%. Dano por fonte: ataque básico 85%, Flecha de Passagem 5%, Chuva de Espinhos 5%, Tiro do Espinhal 5%; acerto 98%; 1.776 de dano causado e 551 recebido por minuto.

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
| 10 | 16,6 | 15,5 | +7% | 49 | 2,9 | 0,5 | 0,0 | 65 / 8 | 1.228 | 323 / 781 | 8.275 | Rato-Engrenagem (10) |
| 11 | 13,1 | 17,0 | -23% | 59 | 4,5 | 0,3 | 0,1 | 61 / 8 | 1.804 | 822 / 0 | 10.337 | Soldador Cego (11) |
| 12 | 16,2 | 18,5 | -12% | 79 | 4,9 | 0,0 | 0,0 | 28 / 8 | 2.231 | 0 / 0 | 12.619 | Lâmina de Esteira (12) |
| 13 | 19,7 | 20,0 | -2% | 85 | 4,3 | 0,0 | 0,0 | 25 / 15 | 3.284 | 1.222 / 3.249 | 15.282 | Larva Térmica (13) |
| 14 | 16,2 | 21,5 | -25% | 100 | 6,1 | 0,1 | 0,0 | 91 / 10 | 2.898 | 0 / 0 | 18.286 | Ecoante (14) |
| 15 | 23,8 | 23,0 | +4% | 112 | 4,7 | 0,6 | 0,3 | 94 / 13 | 4.509 | 3.147 / 1.821 | 21.537 | Guardião de Galeria (15) |
| 16 | 22,2 | 24,5 | -9% | 112 | 5,0 | 0,1 | 0,1 | 129 / 13 | 4.206 | 1.839 / 2.199 | 25.122 | Aranha de Conduto (16) |
| 17 | 23,3 | 26,0 | -10% | 114 | 4,9 | 0,0 | 0,0 | 104 / 13 | 5.323 | 3.000 / 1.691 | 29.139 | Draga Viva (17) |
| 18 | 20,8 | 27,5 | -24% | 119 | 5,7 | 0,0 | 0,1 | 101 / 17 | 4.864 | 1.685 / 525 | 33.376 | Escória Pressurizada (18) |
| 19 | 23,3 | 29,0 | -20% | 141 | 6,1 | 0,0 | 0,1 | 114 / 17 | 5.987 | 1.283 / 2.355 | 38.030 | Escória Pressurizada (18) |
| 20 | 23,1 | 30,5 | -24% | 124 | 5,4 | 0,0 | 0,0 | 66 / 15 | 6.533 | 0 / 0 | 43.168 | Salamandra de Cisterna (21) |
| 21 | 31,0 | 32,0 | -3% | 152 | 4,9 | 0,0 | 0,0 | 59 / 25 | 12.844 | 2.371 / 10.174 | 48.224 | Salamandra de Cisterna (21) |
| 22 | 25,6 | 33,5 | -24% | 170 | 6,7 | 0,6 | 0,1 | 164 / 21 | 9.414 | 926 / 0 | 54.088 | Sineiro de Bronze (22) |
| 23 | 35,5 | 35,0 | +1% | 176 | 5,0 | 0,5 | 0,1 | 165 / 24 | 14.542 | 5.461 / 11.046 | 60.314 | Voz Soterrada (23) |
| 24 | 30,1 | 36,5 | -18% | 175 | 5,8 | 0,4 | 0,3 | 198 / 24 | 11.326 | 2.711 / 1.578 | 66.889 | Toupeira de Basalto (24) |

### Cantora do Véu (`veilsinger`)

7,25 h do 1 ao 25 (-6% da meta; 8/8 execuções concluídas). Plano de atributos: gerado (requisitos das faixas + Espírito/Vitalidade 2:3). Tempo: combate 72%, deslocamento e saque 4%, recuperação 5%, viagens 18%, cidade e prova 0%, caído/fugindo 0%. Dano por fonte: ataque básico 55%, Nota Clara 45%; acerto 100%; 1.669 de dano causado e 796 recebido por minuto; 243 de cura por minuto.

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
| 10 | 19,3 | 15,5 | +24% | 52 | 2,7 | 0,6 | 0,0 | 17 / 30 | 1.104 | 278 / 919 | 8.254 | Rato-Engrenagem (10) |
| 11 | **9,5** | 17,0 | -44% | 59 | 6,2 | 0,1 | 0,0 | 9 / 29 | 1.627 | 0 / 0 | 10.279 | Soldador Cego (11) |
| 12 | 16,3 | 18,5 | -12% | 79 | 4,8 | 0,0 | 0,0 | 1 / 18 | 2.357 | 175 / 263 | 12.637 | Lâmina de Esteira (12) |
| 13 | 20,2 | 20,0 | +1% | 86 | 4,2 | 0,0 | 0,0 | 0 / 44 | 3.349 | 443 / 3.748 | 15.349 | Larva Térmica (13) |
| 14 | 26,8 | 21,5 | +25% | 100 | 3,8 | 0,6 | 0,0 | 75 / 49 | 4.025 | 4.406 / 328 | 18.224 | Ecoante (14) |
| 15 | **16,7** | 23,0 | -27% | 107 | 6,4 | 0,0 | 0,0 | 38 / 41 | 2.794 | 0 / 0 | 21.588 | Guardião de Galeria (15) |
| 16 | 19,2 | 24,5 | -22% | 111 | 5,8 | 0,1 | 0,0 | 79 / 47 | 3.369 | 0 / 0 | 25.150 | Aranha de Conduto (16) |
| 17 | 26,1 | 26,0 | +0% | 116 | 4,5 | 0,1 | 0,0 | 31 / 41 | 5.905 | 3.420 / 6.650 | 29.102 | Draga Viva (17) |
| 18 | **19,2** | 27,5 | -30% | 119 | 6,2 | 0,0 | 0,0 | 37 / 49 | 4.359 | 0 / 0 | 33.432 | Escória Pressurizada (18) |
| 19 | 27,9 | 29,0 | -4% | 141 | 5,1 | 0,0 | 0,0 | 57 / 59 | 6.636 | 1.727 / 5.259 | 37.963 | Escória Pressurizada (18) |
| 20 | 30,0 | 30,5 | -2% | 125 | 4,2 | 0,0 | 0,0 | 1 / 37 | 7.540 | 949 / 2.276 | 43.126 | Salamandra de Cisterna (21) |
| 21 | 26,9 | 32,0 | -16% | 152 | 5,7 | 0,0 | 0,0 | 0 / 43 | 8.787 | 360 / 3.262 | 48.263 | Salamandra de Cisterna (21) |
| 22 | 34,2 | 33,5 | +2% | 171 | 5,0 | 0,5 | 0,0 | 61 / 57 | 10.868 | 1.954 / 1.950 | 54.113 | Sineiro de Bronze (22) |
| 23 | 34,6 | 35,0 | -1% | 175 | 5,1 | 0,6 | 0,0 | 114 / 72 | 10.274 | 2.194 / 5.782 | 60.221 | Voz Soterrada (23) |
| 24 | 38,1 | 36,5 | +4% | 182 | 4,8 | 0,6 | 0,0 | 122 / 75 | 11.431 | 3.031 / 5.920 | 66.837 | Toupeira de Basalto (24) |

### Escudeiro do Alvorecer (`dawnshield`)

7,28 h do 1 ao 25 (-6% da meta; 8/8 execuções concluídas). Plano de atributos: gerado (requisitos das faixas + Força/Vitalidade 2:3). Tempo: combate 71%, deslocamento e saque 5%, recuperação 1%, viagens 22%, cidade e prova 0%, caído/fugindo 0%. Dano por fonte: ataque básico 76%, Corte Solar 16%, Lâmina do Meio-Dia 5%, dano sagrado extra 4%; acerto 80%; 1.630 de dano causado e 569 recebido por minuto; 5 de cura por minuto.

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
| 10 | 18,2 | 15,5 | +18% | 51 | 2,8 | 0,5 | 0,0 | 61 / 6 | 1.257 | 318 / 689 | 8.267 | Rato-Engrenagem (10) |
| 11 | 13,1 | 17,0 | -23% | 58 | 4,5 | 0,0 | 0,1 | 59 / 7 | 1.562 | 205 / 314 | 10.288 | Soldador Cego (11) |
| 12 | 14,7 | 18,5 | -21% | 79 | 5,4 | 0,0 | 0,0 | 25 / 12 | 2.324 | 333 / 0 | 12.651 | Lâmina de Esteira (12) |
| 13 | 20,3 | 20,0 | +2% | 85 | 4,2 | 0,0 | 0,0 | 19 / 15 | 3.362 | 905 / 3.564 | 15.282 | Larva Térmica (13) |
| 14 | 16,4 | 21,5 | -24% | 101 | 6,1 | 0,3 | 0,0 | 89 / 10 | 2.679 | 0 / 0 | 18.230 | Ecoante (14) |
| 15 | 23,0 | 23,0 | +0% | 115 | 5,0 | 0,5 | 0,4 | 91 / 12 | 4.007 | 3.087 / 1.651 | 21.567 | Guardião de Galeria (15) |
| 16 | 25,0 | 24,5 | +2% | 121 | 4,9 | 0,4 | 0,5 | 149 / 10 | 3.629 | 2.513 / 2.659 | 25.164 | Aranha de Conduto (16) |
| 17 | 24,6 | 26,0 | -5% | 119 | 4,9 | 0,0 | 0,3 | 103 / 12 | 4.288 | 1.869 / 1.810 | 29.088 | Draga Viva (17) |
| 18 | 23,2 | 27,5 | -16% | 123 | 5,3 | 0,3 | 0,1 | 119 / 13 | 4.919 | 1.580 / 506 | 33.446 | Escória Pressurizada (18) |
| 19 | 27,1 | 29,0 | -7% | 145 | 5,3 | 0,3 | 0,4 | 117 / 18 | 6.828 | 3.396 / 3.628 | 38.008 | Escória Pressurizada (18) |
| 20 | 28,0 | 30,5 | -8% | 129 | 4,6 | 0,0 | 0,1 | 77 / 18 | 7.388 | 1.052 / 892 | 43.056 | Salamandra de Cisterna (21) |
| 21 | 33,0 | 32,0 | +3% | 153 | 4,6 | 0,0 | 0,0 | 53 / 24 | 11.337 | 1.292 / 6.917 | 48.382 | Salamandra de Cisterna (21) |
| 22 | 27,1 | 33,5 | -19% | 167 | 6,2 | 0,0 | 0,0 | 159 / 21 | 8.867 | 0 / 0 | 54.062 | Sineiro de Bronze (22) |
| 23 | 39,1 | 35,0 | +12% | 165 | 4,2 | 0,0 | 1,1 | 191 / 25 | 15.571 | 7.324 / 15.749 | 60.294 | Voz Soterrada (23) |
| 24 | 34,8 | 36,5 | -5% | 172 | 4,9 | 0,0 | 0,5 | 209 / 23 | 12.069 | 3.692 / 0 | 66.846 | Toupeira de Basalto (24) |

### Lanceiro do Fosso (`pikeman`)

7,99 h do 1 ao 25 (+4% da meta; 8/8 execuções concluídas). Plano de atributos: gerado (requisitos das faixas + Força/Vitalidade 2:3). Tempo: combate 63%, deslocamento e saque 5%, recuperação 5%, viagens 26%, cidade e prova 0%, caído/fugindo 1%. Dano por fonte: ataque básico 78%, Estocada Longa 13%, Avanço do Fosso 4%, Muralha de Piques 3%, Linha Partida 3%; acerto 86%; 1.549 de dano causado e 615 recebido por minuto.

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
| 10 | 18,6 | 15,5 | +20% | 60 | 3,2 | 1,4 | 0,0 | 63 / 8 | 1.250 | 466 / 716 | 8.241 | Garça de Ferrugem (8) |
| 11 | 13,7 | 17,0 | -19% | 59 | 4,3 | 0,1 | 0,4 | 59 / 8 | 1.501 | 513 / 0 | 10.370 | Lâmina de Esteira (12) |
| 12 | 15,8 | 18,5 | -14% | 79 | 5,0 | 0,0 | 0,0 | 40 / 8 | 2.241 | 0 / 0 | 12.584 | Lâmina de Esteira (12) |
| 13 | 19,9 | 20,0 | -1% | 86 | 4,3 | 0,0 | 0,0 | 30 / 13 | 3.163 | 1.517 / 2.949 | 15.327 | Larva Térmica (13) |
| 14 | 16,2 | 21,5 | -25% | 101 | 6,2 | 0,6 | 0,0 | 109 / 9 | 2.329 | 0 / 0 | 18.223 | Ecoante (14) |
| 15 | 25,2 | 23,0 | +10% | 109 | 4,3 | 0,1 | 0,8 | 125 / 11 | 4.630 | 4.779 / 859 | 21.530 | Guardião de Galeria (15) |
| 16 | 25,5 | 24,5 | +4% | 116 | 4,6 | 0,1 | 0,6 | 184 / 11 | 3.692 | 3.575 / 734 | 25.181 | Aranha de Conduto (16) |
| 17 | **34,2** | 26,0 | +32% | 121 | 3,5 | 0,6 | 1,4 | 191 / 8 | 3.214 | 3.220 / 1.737 | 29.048 | Draga Viva (17) |
| 18 | **40,0** | 27,5 | +45% | 132 | 3,3 | 1,3 | 1,6 | 191 / 11 | 4.900 | 3.775 / 549 | 33.529 | Escória Pressurizada (18) |
| 19 | 33,9 | 29,0 | +17% | 142 | 4,2 | 0,0 | 1,1 | 148 / 18 | 7.055 | 3.105 / 2.351 | 37.958 | Escória Pressurizada (18) |
| 20 | 26,2 | 30,5 | -14% | 124 | 4,7 | 0,0 | 0,1 | 94 / 16 | 7.290 | 793 / 303 | 43.063 | Salamandra de Cisterna (21) |
| 21 | 31,5 | 32,0 | -1% | 153 | 4,8 | 0,0 | 0,0 | 79 / 24 | 11.417 | 2.406 / 7.292 | 48.382 | Salamandra de Cisterna (21) |
| 22 | 27,4 | 33,5 | -18% | 169 | 6,2 | 0,4 | 0,1 | 179 / 23 | 10.789 | 1.825 / 1.097 | 54.113 | Sineiro de Bronze (22) |
| 23 | 32,0 | 35,0 | -9% | 171 | 5,3 | 0,4 | 0,4 | 214 / 23 | 13.100 | 4.514 / 8.110 | 60.188 | Voz Soterrada (23) |
| 24 | 35,7 | 36,5 | -2% | 174 | 4,9 | 0,3 | 0,6 | 222 / 28 | 14.303 | 6.440 / 4.936 | 66.823 | Toupeira de Basalto (24) |

### Quebraferro (`breaker`)

8,15 h do 1 ao 25 (+6% da meta; 8/8 execuções concluídas). Plano de atributos: example_builds.json (breaker_physical). Tempo: combate 64%, deslocamento e saque 5%, recuperação 5%, viagens 26%, cidade e prova 0%, caído/fugindo 0%. Dano por fonte: ataque básico 79%, Talho Profundo 12%, Ruptura 4%, dano contínuo 3%, Fenda Sísmica 2%; acerto 88%; 1.492 de dano causado e 641 recebido por minuto.

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
| 10 | 19,2 | 15,5 | +24% | 56 | 2,9 | 1,1 | 0,0 | 70 / 10 | 1.241 | 550 / 894 | 8.279 | Rato-Engrenagem (10) |
| 11 | 14,5 | 17,0 | -15% | 59 | 4,1 | 0,1 | 0,1 | 66 / 7 | 1.650 | 796 / 0 | 10.298 | Soldador Cego (11) |
| 12 | 15,1 | 18,5 | -18% | 79 | 5,2 | 0,0 | 0,0 | 42 / 11 | 2.245 | 0 / 0 | 12.614 | Lâmina de Esteira (12) |
| 13 | 19,8 | 20,0 | -1% | 86 | 4,3 | 0,0 | 0,0 | 32 / 14 | 3.163 | 1.427 / 2.628 | 15.372 | Larva Térmica (13) |
| 14 | 18,0 | 21,5 | -16% | 100 | 5,6 | 0,4 | 0,1 | 114 / 10 | 2.548 | 867 / 0 | 18.210 | Ecoante (14) |
| 15 | 24,3 | 23,0 | +6% | 121 | 5,0 | 0,6 | 0,5 | 117 / 10 | 3.667 | 2.598 / 289 | 21.551 | Guardião de Galeria (15) |
| 16 | 29,3 | 24,5 | +20% | 117 | 4,0 | 0,4 | 0,9 | 186 / 16 | 4.631 | 5.022 / 2.359 | 25.152 | Aranha de Conduto (16) |
| 17 | 31,7 | 26,0 | +22% | 124 | 3,9 | 0,4 | 0,8 | 179 / 13 | 4.538 | 2.055 / 1.776 | 29.082 | Draga Viva (17) |
| 18 | **38,4** | 27,5 | +40% | 130 | 3,4 | 1,4 | 1,5 | 174 / 13 | 4.440 | 3.669 / 1.328 | 33.430 | Escória Pressurizada (18) |
| 19 | 31,9 | 29,0 | +10% | 153 | 4,8 | 0,4 | 0,8 | 181 / 14 | 4.742 | 2.455 / 150 | 37.949 | Escória Pressurizada (18) |
| 20 | 30,7 | 30,5 | +1% | 130 | 4,2 | 0,0 | 0,3 | 97 / 15 | 6.918 | 784 / 0 | 43.130 | Salamandra de Cisterna (21) |
| 21 | 36,3 | 32,0 | +13% | 153 | 4,2 | 0,0 | 0,0 | 79 / 21 | 11.594 | 4.115 / 9.193 | 48.382 | Salamandra de Cisterna (21) |
| 22 | 34,2 | 33,5 | +2% | 170 | 5,0 | 0,4 | 0,5 | 196 / 23 | 13.273 | 4.607 / 1.706 | 54.055 | Sineiro de Bronze (22) |
| 23 | 34,4 | 35,0 | -2% | 171 | 5,0 | 0,4 | 0,6 | 235 / 26 | 12.239 | 4.628 / 7.755 | 60.305 | Voz Soterrada (23) |
| 24 | 33,2 | 36,5 | -9% | 170 | 5,1 | 0,5 | 0,4 | 251 / 24 | 11.599 | 3.702 / 4.733 | 66.787 | Toupeira de Basalto (24) |

### Bastião de Bronze (`bastion`)

8,26 h do 1 ao 25 (+7% da meta; 8/8 execuções concluídas). Plano de atributos: gerado (requisitos das faixas + Força/Vitalidade 2:3). Tempo: combate 68%, deslocamento e saque 4%, recuperação 3%, viagens 24%, cidade e prova 0%, caído/fugindo 0%. Dano por fonte: ataque básico 83%, Pulso de Atração 9%, Engrenagem Travada 8%; acerto 85%; 1.473 de dano causado e 505 recebido por minuto.

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
| 10 | 19,3 | 15,5 | +24% | 54 | 2,8 | 0,6 | 0,1 | 78 / 6 | 1.129 | 389 / 488 | 8.248 | Rato-Engrenagem (10) |
| 11 | 18,9 | 17,0 | +11% | 60 | 3,2 | 0,4 | 0,9 | 76 / 7 | 1.701 | 721 / 514 | 10.307 | Soldador Cego (11) |
| 12 | 19,6 | 18,5 | +6% | 79 | 4,0 | 0,0 | 0,0 | 35 / 10 | 2.370 | 425 / 156 | 12.635 | Lâmina de Esteira (12) |
| 13 | 23,9 | 20,0 | +19% | 86 | 3,6 | 0,0 | 0,0 | 25 / 15 | 3.197 | 434 / 3.361 | 15.349 | Larva Térmica (13) |
| 14 | 20,1 | 21,5 | -7% | 101 | 5,0 | 0,5 | 0,3 | 100 / 8 | 2.696 | 633 / 0 | 18.218 | Ecoante (14) |
| 15 | 26,2 | 23,0 | +14% | 112 | 4,3 | 0,1 | 0,8 | 121 / 10 | 3.658 | 3.252 / 826 | 21.575 | Guardião de Galeria (15) |
| 16 | 26,5 | 24,5 | +8% | 113 | 4,3 | 0,0 | 0,6 | 169 / 9 | 3.111 | 2.636 / 1.283 | 25.106 | Aranha de Conduto (16) |
| 17 | **34,1** | 26,0 | +31% | 123 | 3,6 | 0,5 | 1,3 | 130 / 12 | 4.230 | 2.569 / 2.566 | 29.104 | Draga Viva (17) |
| 18 | 30,7 | 27,5 | +12% | 125 | 4,1 | 0,1 | 0,9 | 131 / 11 | 4.047 | 1.340 / 823 | 33.444 | Escória Pressurizada (18) |
| 19 | 34,6 | 29,0 | +19% | 142 | 4,1 | 0,4 | 1,0 | 131 / 18 | 6.631 | 4.210 / 1.296 | 37.991 | Escória Pressurizada (18) |
| 20 | 31,2 | 30,5 | +2% | 138 | 4,4 | 0,0 | 0,3 | 92 / 16 | 7.000 | 1.010 / 485 | 43.098 | Salamandra de Cisterna (21) |
| 21 | 34,4 | 32,0 | +8% | 153 | 4,4 | 0,0 | 0,0 | 47 / 21 | 11.322 | 1.626 / 8.438 | 48.343 | Salamandra de Cisterna (21) |
| 22 | 27,4 | 33,5 | -18% | 168 | 6,1 | 0,0 | 0,0 | 147 / 22 | 8.882 | 0 / 0 | 54.103 | Sineiro de Bronze (22) |
| 23 | 38,9 | 35,0 | +11% | 171 | 4,4 | 0,3 | 1,0 | 149 / 27 | 15.167 | 7.294 / 15.125 | 60.271 | Voz Soterrada (23) |
| 24 | 29,0 | 36,5 | -21% | 165 | 5,7 | 0,0 | 0,1 | 177 / 22 | 9.152 | 926 / 683 | 66.880 | Toupeira de Basalto (24) |

## Economia: ouro ganho × gasto (tônicos e equipamento)

Ganho = moedas saqueadas + vendas ao comerciante (sucata, peças substituídas e de outras classes, a `value × economy.sellFraction`). Gasto = tônicos na loja da cidade e peças comuns no armeiro (`value × economy.gearPriceMult`), sempre com ouro real (`buy`/`sell`). "Fatia" = gasto ÷ ganho.

| Classe | Moedas | Vendas | Gasto em tônicos | Gasto em equipamento | Fatia tônicos / equip. | Saldo no nível 25 | Ganho/h | Tônicos usados (V+M) | Itens vendidos | Idas à loja |
|---|---|---|---|---|---|---|---|---|---|---|
| Tecelão da Brasa | 76.487 | 16.261 | 26.440 | 30.816 | 29% / 33% | 35.493 | 14.448 | 1.977 | 769 | 12,3 |
| Andarilha do Vento | 74.814 | 19.316 | 28.146 | 38.433 | 30% / 41% | 27.552 | 14.392 | 1.978 | 855 | 11,8 |
| Vigia do Espinhal | 75.341 | 18.675 | 25.953 | 36.427 | 28% / 39% | 31.636 | 13.978 | 1.901 | 805 | 10,6 |
| Cantora do Véu | 73.682 | 13.782 | 20.064 | 37.298 | 23% / 43% | 30.102 | 12.062 | 1.460 | 686 | 10,6 |
| Escudeiro do Alvorecer | 71.654 | 21.265 | 28.834 | 39.143 | 31% / 42% | 24.942 | 12.766 | 1.976 | 860 | 12,8 |
| Lanceiro do Fosso | 71.584 | 22.296 | 38.112 | 32.417 | 41% / 35% | 23.351 | 11.753 | 2.370 | 884 | 15,8 |
| Quebraferro | 70.254 | 20.977 | 38.381 | 33.422 | 42% / 37% | 19.428 | 11.193 | 2.459 | 878 | 15,9 |
| Bastião de Bronze | 69.187 | 17.690 | 28.730 | 36.740 | 33% / 42% | 21.407 | 10.519 | 2.051 | 777 | 16,0 |

Por faixa de nível (média das classes): ouro ganho e gasto por hora, a fatia do ganho que vai para tônicos e para equipamento, e tônicos bebidos por hora.

| Níveis | Ganho/h | Tônicos/h (ouro) | Equipamento/h (ouro) | Fatia tônicos / equip. | Tônicos bebidos/h | Classe que mais gasta em tônicos (fatia) |
|---|---|---|---|---|---|---|
| 1–4 | 1.303 | 189 | 121 | 15% / 9% | 109 | Bastião de Bronze (19%) |
| 5–8 | 2.598 | 1.056 | 645 | 41% / 25% | 181 | Tecelão da Brasa (56%) |
| 9–12 | 5.650 | 1.431 | 1.230 | 26% / 22% | 224 | Bastião de Bronze (34%) |
| 13–16 | 10.121 | 5.003 | 4.117 | 50% / 41% | 311 | Lanceiro do Fosso (71%) |
| 17–20 | 13.399 | 4.480 | 4.832 | 35% / 34% | 279 | Lanceiro do Fosso (48%) |
| 21–24 | 22.125 | 5.703 | 9.506 | 26% / 43% | 333 | Quebraferro (35%) |

- O ouro ganho por hora cresce de ~1.303/h (níveis 1–4) para ~22.125/h (21–24); o gasto com tônicos acompanha o dano recebido, não o nível: classes de distância que matam antes do contato compram pouco.
- Preço dos tônicos = 2 × valor (Pequeno de Vida 8, Médio de Vida 24, Pequeno de Mana 10, Médio de Mana 30); peças do armeiro = 2,5 × valor; venda ao comerciante = 0,50 × valor.

## Efeito da prova de classe (habilidade do nível 10)

A rodada principal faz a prova de classe no nível 10 (premissas). Para medir também a caça pura, sem nenhuma missão, as mesmas sementes foram simuladas **sem a prova**: sem a habilidade marcante do nível 10 e sem o tempo da viagem e da luta na arena. Média das classes: **7,33 h com prova** (-5% da meta) e **7,14 h sem prova** (-7%).

| Classe | Habilidade do nível 10 | Horas com prova | Horas sem prova | Diferença | Min nos níveis 10–24 (com / sem) | Mortes (com / sem) |
|---|---|---|---|---|---|---|
| Tecelão da Brasa | Círculo de Fuligem | 6,42 | 6,91 | +8% | 308 / 337 | 4,4 / 6,8 |
| Andarilha do Vento | Vento a Favor | 6,54 | 6,48 | -1% | 330 / 326 | 3,8 / 3,9 |
| Vigia do Espinhal | Chuva de Espinhos | 6,73 | 6,64 | -1% | 341 / 335 | 3,8 / 3,6 |
| Escudeiro do Alvorecer | Juramento | 7,28 | 7,17 | -2% | 367 / 361 | 2,9 / 2,8 |
| Cantora do Véu | Selo do Véu | 7,25 | 7,10 | -2% | 365 / 356 | 3,6 / 3,4 |
| Lanceiro do Fosso | Avanço do Fosso | 7,99 | 7,64 | -4% | 396 / 375 | 6,3 / 5,0 |
| Quebraferro | Ruptura | 8,15 | 7,68 | -6% | 411 / 383 | 7,1 / 6,9 |
| Bastião de Bronze | Reforço de Campo | 8,26 | 7,46 | -10% | 415 / 367 | 3,6 / 3,8 |

| Nível | Meta (min) | Média com prova | Média sem prova |
|---|---|---|---|
| 10 | 15,5 | 18,7 | 17,0 |
| 11 | 17,0 | 13,6 | 12,9 |
| 12 | 18,5 | 15,8 | 14,7 |
| 13 | 20,0 | 20,3 | 20,0 |
| 14 | 21,5 | 18,7 | 17,6 |
| 15 | 23,0 | 21,7 | 21,8 |
| 16 | 24,5 | 22,7 | 23,1 |
| 17 | 26,0 | 27,1 | 25,3 |
| 18 | 27,5 | 25,6 | 23,4 |
| 19 | 29,0 | 28,8 | 25,0 |
| 20 | 30,5 | 26,9 | 26,6 |
| 21 | 32,0 | 30,2 | 31,6 |
| 22 | 33,5 | 29,4 | 28,5 |
| 23 | 35,0 | 33,6 | 34,0 |
| 24 | 36,5 | 33,4 | 33,4 |

Prova: 64 de 64 execuções venceram (1,0 tentativa(s) por execução em média; 47 s de luta na arena). A diferença de tempo inclui a ida à cidade da classe e a volta (2 × as trocas de mapa até lá). Com a habilidade extra o bot gasta mana em mais uma habilidade; ele só usa reforços de defesa caros, escudos e áreas em volta de si quando a luta pede (vários atacantes ou vida baixa), e nunca usa área que acorde monstro parado.

## Equipamento

Peças comuns do kit da faixa (arma + mão secundária + 4 de armadura) compradas no armeiro com ouro, e quantos minutos de jogo depois de chegar ao nível da faixa o kit ficou completo (equipado ou na bolsa à espera de requisito). "Já tinha" conta peças da faixa que o bot já possuía ao chegar (saque ou compra adiantada).

| Classe | Peças compradas | Já tinha ao chegar | Melhorias do chão | Kit 5: atraso (min) | Kit 9: atraso (min) | Kit 13: atraso (min) | Kit 17: atraso (min) | Kit 21: atraso (min) | Exemplos do chão |
|---|---|---|---|---|---|---|---|---|---|
| Tecelão da Brasa | 38,8 | 6,6 | 6,9 | 24 | 32 | 4 | 4 | 0 | `amulet_t1`, `ring_t5`, `ring_t17`, `robe_sandals_t17`, `amulet_t17`, `robe_circlet_t1`, `wand_t5`, `robe_t5` |
| Andarilha do Vento | 42,4 | 7,5 | 4,5 | 20 | 27 | 3 | 3 | 4 | `amulet_t13`, `amulet_t17`, `light_boots_t25`, `amulet_t1`, `amulet_t5`, `ring_t9`, `ring_t13`, `light_shield_t17` |
| Vigia do Espinhal | 41,1 | 6,1 | 5,6 | 18 | 23 | 3 | 3 | 5 | `ring_t5`, `amulet_t5`, `amulet_t9`, `ring_t17`, `amulet_t21`, `amulet_t1`, `ring_t13`, `light_gloves_t25` |
| Cantora do Véu | 42,4 | 5,6 | 3,9 | 22 | 23 | 3 | 6 | 2 | `amulet_t5`, `amulet_second_toll`, `robe_t17`, `robe_circlet_t21`, `robe_t25`, `robe_circlet_t17`, `ring_t17`, `amulet_t25` |
| Escudeiro do Alvorecer | 40,8 | 7,1 | 5,6 | 28 | 29 | 3 | 8 | 5 | `heavy_boots_t5`, `sword_1h_t13`, `amulet_t17`, `heavy_helm_t21`, `heavy_gloves_t25`, `ring_t25`, `amulet_t21`, `heavy_helm_t9` |
| Lanceiro do Fosso | 35,5 | 2,4 | 5,6 | 33 | 22 | 3 | 63 | 6 | `amulet_t5`, `ring_t5`, `amulet_t13`, `amulet_t17`, `ring_t21`, `amulet_t21`, `ring_t1`, `heavy_helm_t13` |
| Quebraferro | 35,8 | 2,5 | 5,1 | 30 | 27 | 3 | 29 | 9 | `amulet_t1`, `heavy_gloves_t5`, `amulet_second_toll`, `amulet_t17`, `ring_t1`, `heavy_boots_t1`, `amulet_t5`, `heavy_boots_t13` |
| Bastião de Bronze | 39,1 | 4,1 | 6,6 | 34 | 45 | 8 | 36 | 7 | `ring_t9`, `ring_t17`, `heavy_armor_t21`, `ring_t21`, `ring_t5`, `heavy_boots_t13`, `amulet_t13`, `shield_t21` |

## Premissas do modelo

- **Só caça.** Nenhuma missão é feita nem entregue (sem XP, ouro ou itens de missão). Exceção modelada: a **prova de classe no nível 10**, porque é o que libera a habilidade do nível 10. Os pré-requisitos de "Prova de Classe" são marcados como concluídos com o comando de mestre `quest_done` (sem recompensas), a missão é aceita no mestre da classe e a prova é lutada de verdade na arena; a missão não é entregue (o XP de 1.800 não entra).
- **Ações só pelo protocolo:** move, attack, stop, cast, use_item, pickup, equip/unequip, allocate, learn_skill, buy, sell, respawn, quest_accept/trial_start e os comandos de mestre teleport/quest_done. As decisões usam a visão montada pelos snapshots e a ficha devolvida pelo pedido `char` (o bot não lê o estado interno da zona). Reação a cada 200 ms, no máximo uma habilidade por decisão, respeitando a recarga global; habilidades com conjuração só começam com o personagem parado e o bot não age até o fim (`cast_end`). 0,5 s de pausa depois de cada abate antes de escolher o próximo alvo. É um jogador eficiente: um jogador humano tende a ser mais lento (pausas, erros de posicionamento, distração).
- **Viagem entre mapas:** teleporte de mestre até o posto de guarda do mapa (ou ao lado do NPC, na cidade) seguido de 60 s parados por troca de mapa no caminho de portais (busca em largura respeitando o nível mínimo de cada portal). Dentro do mapa o bot anda (move/attack) como um jogador.
- **Área de caça:** grupos de monstros normais com nível em [nível−2, nível+1], preferindo o próprio nível, monstros passivos e grupos agressivos menos densos; elites, chefes e elites diárias ficam de fora (só são enfrentados se atacarem). O alvo é o monstro do grupo com menos vizinhos agressivos a 8,5 m (puxar pela borda). Morte vale 3 pontos de perigo e fuga 1; 3 pontos em 10 min fazem o bot caçar um nível abaixo por 20 min, longe daquela área.
- **Tônicos:** em combate, vida abaixo de 40% — 50% com dois monstros batendo e 65% com três ou mais, quando a recarga de 3 s dos tônicos é o gargalo (com três ou mais bebe o maior tônico que tem; senão, o menor que aproveita bem a cura); fora de combate, vida abaixo de 55% (sem tônico, descansa com `stop` até 92%). Conjuradores (Tecelão, Cantora): mana abaixo de 20% em combate e de 35% fora (sem tônico, descansa até 85%); as classes físicas não param por mana (lutam com o ataque básico). Tônico Médio só a partir do nível 9 (o servidor confere o nível do item). Foge para o posto abaixo de 20% de vida sem tônico; caído, espera 5 s e volta ao posto (`respawn`, 50% de vida).
- **Cidade:** na cidade da classe (Pedrâmbar ou Vau de Nácar), primeiro o armeiro, depois a loja de tônicos. Vai quando restam menos de 5 tônicos e 80% do ouro compra ao menos 40 Pequenos, quando o ouro paga o equipamento que falta (abaixo) ou quando a bolsa enche. Estoque-alvo: 100 tônicos de vida ou 2,5 × o gasto do nível anterior ou do atual (o maior), até 300; de mana, 60 (ou 2,5 × o gasto, até 300) para conjuradores e 10 para os demais. A ida e a volta custam as mesmas trocas de mapa.
- **Equipamento:** ao chegar ao nível 5, 9, 13, 17, 21 ou 25 o bot quer as peças comuns da faixa (arma, mão secundária e 4 de armadura; o Cetro da faixa 17 é raro, então a Cantora usa a Varinha comum nessa faixa) e as **compra no armeiro com ouro** (`buy`, valor × `economy.gearPriceMult`), a arma primeiro, guardando antes o ouro de 60 tônicos de vida (e 40 de mana para conjuradores; essa reserva nunca passa de 60% do ouro). Vai à cidade só por isso quando o ouro, tirada a reserva, paga todas as peças que faltam (no máximo uma ida dessas a cada 10 min). Com o kit completo e ouro além do estoque cheio de tônicos, compra adiantado o kit da próxima faixa (a até 2 níveis dela) e as joias da faixa. Também recolhe do chão as melhorias da própria classe e equipa quando cumpre os requisitos. Sem refino no ferreiro.
- **Venda:** materiais, peças de outras classes e peças substituídas são recolhidos do chão (com mais de 5 espaços livres na bolsa) e vendidos ao comerciante (`sell`, valor × `economy.sellFraction`) a cada visita à cidade; o depósito não é usado.
- **Atributos e habilidades:** Quebraferro e Tecelão seguem os planos de `data/example_builds.json`; as demais classes usam um plano gerado no mesmo espírito (requisitos do kit da próxima faixa espalhados pelos níveis até ela e o resto 2:3 entre o atributo de dano da arma e Vitalidade), conferido nível a nível. Graus de habilidade: um ponto por nível na ordem de prioridade da classe (`server/tools/lib/progressao/planos.mjs`).

## Problemas e observações encontrados no jogo

1. **Equilíbrio entre classes na caça solo:** Tecelão da Brasa chega ao nível 25 em 6,42 h e Bastião de Bronze em 8,26 h (1,3×). Todas as classes ficam a até ±25% da meta total (de -17% a +7%).
2. **Dano por classe:** Tecelão da Brasa 1.877/min (básico 40%, Faísca de Vidro 28%; recebe 439/min); Andarilha do Vento 1.809/min (básico 89%, Arremesso de Retorno 7%; recebe 580/min); Vigia do Espinhal 1.776/min (básico 85%, Flecha de Passagem 5%; recebe 551/min); Cantora do Véu 1.669/min (básico 55%, Nota Clara 45%; recebe 796/min); Escudeiro do Alvorecer 1.630/min (básico 76%, Corte Solar 16%; recebe 569/min); Lanceiro do Fosso 1.549/min (básico 78%, Estocada Longa 13%; recebe 615/min); Quebraferro 1.492/min (básico 79%, Talho Profundo 12%; recebe 641/min); Bastião de Bronze 1.473/min (básico 83%, Pulso de Atração 9%; recebe 505/min). Média: 1.659 de dano causado por minuto.
3. **Ataque básico ainda é quase todo o dano de:** Bastião de Bronze (83%), Vigia do Espinhal (85%), Andarilha do Vento (89%).
4. **Cantora do Véu antes do nível 15:** -1% da meta somando os níveis 1–14; é a classe mais lenta nos níveis 2, 3, 14. Nota Clara (nível 5) faz 45% do dano da rodada inteira; as curas somam 243 de vida por minuto.
5. **Curva de XP:** todos os níveis ficam a até ±25% da meta na média das classes (maior desvio: nível 10, +21%). O total 1→25 fica em -5% da meta. Ritmo médio: 10,1 abates/min no nível 1, 4,9 na média dos níveis.
6. **Onde se morre:** níveis com mais mortes: 10 (0,78 por classe), 9 (0,71 por classe), 24 (0,50 por classe), 18 (0,38 por classe). Monstros que mais derrubam (mortes por execução, somando as classes; um monstro conta em toda morte em que estava batendo): Autômato Escavador (nv 9, agressivo) 6,7, Rato-Engrenagem (nv 10, agressivo) 4,8, Sineiro de Bronze (nv 22, agressivo) 4,1, Ecoante (nv 14, agressivo) 3,4, Toupeira de Basalto (nv 24, agressivo) 3,1. Mortes por classe (média por execução): Tecelão da Brasa 4,4, Andarilha do Vento 3,8, Vigia do Espinhal 3,8, Cantora do Véu 3,6, Escudeiro do Alvorecer 2,9, Lanceiro do Fosso 6,3, Quebraferro 7,1, Bastião de Bronze 3,6 — 4,4 em média. Quase toda queda é numa briga com vários monstros ao mesmo tempo (de 4,3 a 4,8 atacantes, em média, nos 10 s antes de cair; 96% a 100% das mortes com 3 ou mais). Todas as classes entram em brigas com 4 ou mais monstros num ritmo parecido (3,8 a 5,8 por hora: assistência dos iguais a até 8 m, agressão por proximidade e monstros que reaparecem perto); o que muda é quanto cada uma aguenta: mortes por briga dessas de 0,07 (Escudeiro do Alvorecer) a 0,17 (Quebraferro). Do nível 9 em diante, 52% a 100% das mortes acontecem já sem tônico médio na bolsa (o bot só compra o médio quando o ouro paga 40 e segue caçando com os pequenos quando os médios acabam).
7. **Economia:** do ouro ganho (moedas + vendas), os tônicos levam de 23% a 42% (mais: Quebraferro) e o equipamento do armeiro de 33% a 43%; juntos, 62% a 79%. As vendas ao comerciante são 20% do ganho. Saldo ao chegar ao nível 25: 19.428 a 35.493 de ouro (inclui o que sobra para o kit da faixa 25, que o bot só compra adiantado com ouro de sobra).
8. **Equipamento comprado no armeiro:** 39,5 peças por classe em média; o kit comum fica completo, em média, 26 min depois do nível 5, 28 min depois do nível 9, 4 min depois do nível 13, 19 min depois do nível 17, 5 min depois do nível 21 (o atraso é o tempo de juntar o ouro e ir à cidade). Pelo saque chegam 5,5 melhorias por classe.
9. **Conjuração e recarga global:** Vigia do Espinhal conjurou 91 vezes (90 concluídas, 0 interrompidas); Tecelão da Brasa conjurou 175 vezes (174 concluídas, 1 interrompidas). O bot só começa a conjurar parado e não age durante a conjuração; com a recarga global de 1,0 s ele não tenta outra habilidade antes do fim dela.

## Modo acelerado e desempenho da ferramenta

- Laço de `server.step(100)` (100 ms de jogo por chamada) num GameServer sem `start()`: banco SQLite em memória (`--banco-arquivo` usa um arquivo temporário), modo dev, sessões falsas e pedidos síncronos por `server.onMessage`. 469 h de jogo simuladas em 15,1 min de CPU (1.857× o tempo real por linha de execução); 3 linhas de execução (`worker_threads`) em paralelo, 9,4 min de relógio no total.
- Temporizadores do jogo usam `zone.now` (soma dos dt): recargas, conjurações, efeitos, regeneração, tônicos, ataques e reaparecimento funcionam acelerados sem ajuste. `Date.now()` aparece em prazos de relógio de parede (validade do saque de 30 min, dia da elite diária, carimbos do banco, convites e calabouço); dentro da simulação ele segue o tempo simulado, para esses prazos correrem no ritmo do jogo.
- Zonas abertas sem jogador param 30 s depois que o último jogador sai e, quando alguém entra, o relógio da zona é adiantado até o tempo global (o valor que teria sem parar), então monstros mortos reaparecem e recargas levadas entre zonas continuam valendo; instâncias não são tocadas. 87% dos ticks de zona foram pulados. Um passo com só a zona ativa custa ~20–40 µs.
- Snapshots: o bot pede `{ delta: true }` no login. Se o servidor manda diferenças, elas são mescladas como em `mergeSnap` (test/helpers/client.js); se manda o snapshot completo, só o último é decodificado, quando o bot olha o mundo. Nesta rodada o servidor mandou diferenças. A sessão falsa nasce por `server.onConnection` (com um ws falso) e a simulação desliga o limite de comandos por conexão (`rateLimit`), que é medido em tempo real. Mensagens `hit`/`heal` alimentam a contabilidade de dano e `cast_end` encerra a conjuração do bot; as de efeito visual são descartadas sem decodificar.
