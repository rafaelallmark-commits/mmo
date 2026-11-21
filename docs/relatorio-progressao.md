<!-- Arquivo gerado por `npm run simular-progressao` (server/tools/simular-progressao.mjs). Rode de novo para atualizar. -->

# Relatório de progressão simulada (Marco 4)

Simulação acelerada, em processo, de caça solo do nível 1 ao 25 para 8 classes, contra as metas de teste de `data/xp_table.json` (`targetMinutesToNext`, ver [docs/04](04-progressao-e-formulas.md)). Cada classe foi jogada por um bot que só caça (sem missões), com 8 sementes (1, 2, 3, 4, 5, 6, 7, 8). Os números abaixo são **médias das sementes**; a meta é considerada atingida quando o tempo fica a até ±25% dela.

Gerado em 2026-11-20 22:42 UTC · tempo real 10,8 min (3 linhas de execução) · 464 h de jogo simuladas.

```
cd server && npm run simular-progressao
```

## Resumo

- Meta só caça do 1 ao 25: **7,7 h**. Média das classes: **7,26 h** (-6%).
- Mais rápida: Tecelão da Brasa (6,46 h); mais lenta: Quebraferro (7,71 h) — razão 1,2×.
- Níveis em que a média das classes sai da faixa de ±25%: nenhum.
- Viagens (troca de mapa a 60 s cada: ir às novas áreas, à loja, ao armeiro e à prova) são 22% do tempo. Recuperação fora de combate (tônico ou descanso) fica em 2–13% para todas as classes, porque os bots compram e bebem tônicos em vez de esperar a regeneração (1,5% da vida por segundo).

| Classe | Horas 1→25 (média) | Mín–máx | Desvio da meta | Abates | Mortes | Fugas | Tônicos V/M | Ouro ganho/h | Gasto/h (tônicos + equip.) | Prova |
|---|---|---|---|---|---|---|---|---|---|---|
| Tecelão da Brasa | 6,46 | 6,03–6,67 | -16% | 2.044 | 4,5 | 0,0 | 950 / 1.002 | 14.146 | 9.253 (4.235 + 5.017) | 8/8 |
| Andarilha do Vento | 6,80 | 6,60–6,94 | -12% | 2.064 | 5,1 | 3,9 | 1.705 / 256 | 13.867 | 9.784 (4.137 + 5.646) | 8/8 |
| Vigia do Espinhal | 7,05 | 6,70–7,58 | -8% | 2.076 | 6,8 | 2,5 | 1.671 / 275 | 13.637 | 9.058 (3.850 + 5.208) | 8/8 |
| Cantora do Véu | 7,29 | 7,09–7,59 | -5% | 2.059 | 3,9 | 0,3 | 623 / 763 | 12.177 | 7.849 (2.763 + 5.086) | 8/8 |
| Escudeiro do Alvorecer | 7,48 | 7,20–7,73 | -3% | 2.047 | 2,5 | 6,8 | 1.712 / 249 | 12.572 | 9.487 (4.031 + 5.456) | 8/8 |
| Lanceiro do Fosso | 7,58 | 7,22–8,19 | -2% | 2.112 | 6,5 | 10,0 | 1.962 / 258 | 12.741 | 9.026 (4.782 + 4.244) | 8/8 |
| Bastião de Bronze | 7,68 | 7,23–8,32 | -0% | 2.059 | 3,4 | 8,1 | 1.652 / 255 | 11.613 | 7.908 (3.114 + 4.794) | 8/8 |
| Quebraferro | 7,71 | 7,21–8,46 | +0% | 2.101 | 7,0 | 10,4 | 2.090 / 252 | 12.639 | 8.988 (4.845 + 4.143) | 8/8 |

### Para onde vai o tempo

Fatia do tempo total de cada classe. Viagens: trocas de mapa a 60 s cada, com a quantidade média por motivo (caça inclui trocar de área por perigo).

| Classe | Combate | Deslocamento e saque | Recuperação | Viagens | Trocas de mapa: caça / tônicos e venda / equipamento / prova | Cidade e prova | Caído e fugindo |
|---|---|---|---|---|---|---|---|
| Tecelão da Brasa | 57% | 6% | 13% | 24% | 50 / 28 / 12 / 2 | 0% | 0% |
| Andarilha do Vento | 69% | 6% | 2% | 22% | 49 / 22 / 17 / 3 | 0% | 0% |
| Vigia do Espinhal | 70% | 6% | 3% | 21% | 47 / 21 / 17 / 3 | 0% | 0% |
| Cantora do Véu | 72% | 5% | 4% | 19% | 44 / 21 / 15 / 3 | 0% | 0% |
| Escudeiro do Alvorecer | 71% | 4% | 2% | 22% | 52 / 26 / 18 / 3 | 0% | 0% |
| Lanceiro do Fosso | 66% | 6% | 4% | 24% | 58 / 34 / 14 / 2 | 0% | 0% |
| Bastião de Bronze | 73% | 5% | 3% | 19% | 48 / 23 / 16 / 2 | 0% | 0% |
| Quebraferro | 68% | 5% | 4% | 23% | 56 / 34 / 13 / 2 | 0% | 0% |

## Tempo por nível: média das classes × meta

Minutos simulados para sair de cada nível. "Fora" marca a média fora de ±25% da meta; a coluna seguinte conta quantas classes, individualmente, ficaram fora.

| Nível | Meta (min) | Média (min) | Desvio | Faixa | Classes fora | Mais rápida | Mais lenta | Abates/min | Mortes |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 2,0 | 1,6 | -18% | ok | 4/8 | Andarilha do Vento 1,3 | Tecelão da Brasa 2,4 | 10,1 | 0,00 |
| 2 | 3,5 | 4,1 | +18% | ok | 2/8 | Andarilha do Vento 3,8 | Cantora do Véu 4,8 | 3,9 | 0,00 |
| 3 | 5,0 | 4,7 | -6% | ok | 1/8 | Andarilha do Vento 3,8 | Cantora do Véu 6,5 | 6,6 | 0,00 |
| 4 | 6,5 | 5,9 | -10% | ok | 3/8 | Andarilha do Vento 3,9 | Bastião de Bronze 8,7 | 5,3 | 0,00 |
| 5 | 8,0 | 7,5 | -6% | ok | 1/8 | Vigia do Espinhal 5,9 | Lanceiro do Fosso 9,3 | 3,7 | 0,00 |
| 6 | 9,5 | 10,1 | +6% | ok | 0/8 | Bastião de Bronze 9,2 | Tecelão da Brasa 11,6 | 2,9 | 0,03 |
| 7 | 11,0 | 11,2 | +2% | ok | 1/8 | Vigia do Espinhal 8,7 | Lanceiro do Fosso 15,2 | 3,2 | 0,02 |
| 8 | 12,5 | 11,4 | -9% | ok | 1/8 | Vigia do Espinhal 8,1 | Quebraferro 14,1 | 4,0 | 0,02 |
| 9 | 14,0 | 15,8 | +13% | ok | 1/8 | Cantora do Véu 11,8 | Lanceiro do Fosso 18,5 | 3,2 | 0,56 |
| 10 | 15,5 | 18,7 | +21% | ok | 3/8 | Vigia do Espinhal 16,8 | Escudeiro do Alvorecer 21,1 | 3,2 | 1,03 |
| 11 | 17,0 | 14,5 | -15% | ok | 2/8 | Cantora do Véu 11,8 | Bastião de Bronze 19,4 | 4,2 | 0,45 |
| 12 | 18,5 | 14,8 | -20% | ok | 1/8 | Andarilha do Vento 13,8 | Bastião de Bronze 17,3 | 5,3 | 0,00 |
| 13 | 20,0 | 20,3 | +1% | ok | 0/8 | Andarilha do Vento 19,1 | Bastião de Bronze 22,7 | 4,2 | 0,00 |
| 14 | 21,5 | 18,3 | -15% | ok | 2/8 | Andarilha do Vento 14,7 | Cantora do Véu 23,4 | 5,6 | 0,36 |
| 15 | 23,0 | 21,7 | -6% | ok | 1/8 | Tecelão da Brasa 12,5 | Quebraferro 25,4 | 5,4 | 0,42 |
| 16 | 24,5 | 24,1 | -2% | ok | 1/8 | Tecelão da Brasa 11,7 | Bastião de Bronze 29,6 | 5,2 | 0,33 |
| 17 | 26,0 | 27,5 | +6% | ok | 0/8 | Tecelão da Brasa 22,1 | Quebraferro 31,1 | 4,3 | 0,06 |
| 18 | 27,5 | 21,9 | -20% | ok | 3/8 | Tecelão da Brasa 14,8 | Lanceiro do Fosso 28,4 | 5,7 | 0,05 |
| 19 | 29,0 | 25,7 | -12% | ok | 0/8 | Lanceiro do Fosso 23,7 | Quebraferro 30,9 | 5,6 | 0,08 |
| 20 | 30,5 | 27,7 | -9% | ok | 0/8 | Andarilha do Vento 25,2 | Cantora do Véu 32,2 | 4,5 | 0,00 |
| 21 | 32,0 | 29,9 | -7% | ok | 1/8 | Tecelão da Brasa 21,6 | Escudeiro do Alvorecer 34,3 | 5,2 | 0,00 |
| 22 | 33,5 | 29,7 | -11% | ok | 1/8 | Andarilha do Vento 24,3 | Tecelão da Brasa 35,2 | 5,8 | 0,33 |
| 23 | 35,0 | 32,7 | -7% | ok | 1/8 | Tecelão da Brasa 18,7 | Bastião de Bronze 37,6 | 5,4 | 0,28 |
| 24 | 36,5 | 35,6 | -2% | ok | 1/8 | Bastião de Bronze 26,3 | Cantora do Véu 40,9 | 5,2 | 0,94 |

### Minutos por nível e classe

| Nível | Meta | Tecelão da Brasa | Andarilha do Vento | Vigia do Espinhal | Cantora do Véu | Escudeiro do Alvorecer | Lanceiro do Fosso | Bastião de Bronze | Quebraferro |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 2,0 | 2,4 | **1,3** | **1,4** | 2,1 | **1,4** | **1,5** | 1,6 | 1,5 |
| 2 | 3,5 | **4,7** | 3,8 | 3,9 | **4,8** | 3,8 | 4,0 | 4,3 | 3,8 |
| 3 | 5,0 | 5,2 | 3,8 | 4,2 | **6,5** | 3,9 | 5,2 | 4,8 | 4,0 |
| 4 | 6,5 | 5,9 | **3,9** | **4,0** | 6,5 | 5,2 | 7,2 | **8,7** | 5,7 |
| 5 | 8,0 | 9,2 | 6,2 | **5,9** | 6,9 | 6,3 | 9,3 | 8,6 | 7,7 |
| 6 | 9,5 | 11,6 | 9,9 | 10,2 | 9,7 | 9,3 | 9,9 | 9,2 | 10,6 |
| 7 | 11,0 | 11,4 | 9,8 | 8,7 | 9,8 | 12,0 | **15,2** | 10,8 | 11,8 |
| 8 | 12,5 | 13,5 | 9,5 | **8,1** | 9,5 | 10,7 | 13,4 | 12,3 | 14,1 |
| 9 | 14,0 | 16,3 | 15,9 | 17,0 | 11,8 | 15,6 | **18,5** | 16,1 | 14,9 |
| 10 | 15,5 | 17,0 | 19,1 | 16,8 | **19,9** | **21,1** | 17,6 | **19,6** | 18,5 |
| 11 | 17,0 | 14,9 | 14,5 | 13,5 | **11,8** | **12,5** | 14,6 | 19,4 | 15,1 |
| 12 | 18,5 | 14,6 | **13,8** | 14,2 | 14,5 | 15,3 | 14,2 | 17,3 | 14,8 |
| 13 | 20,0 | 20,5 | 19,1 | 19,6 | 20,8 | 20,5 | 19,4 | 22,7 | 19,7 |
| 14 | 21,5 | 19,5 | **14,7** | **15,6** | 23,4 | 18,7 | 17,1 | 20,6 | 16,6 |
| 15 | 23,0 | **12,5** | 24,5 | 24,2 | 17,4 | 23,0 | 22,7 | 23,9 | 25,4 |
| 16 | 24,5 | **11,7** | 23,0 | 26,8 | 20,9 | 25,0 | 26,9 | 29,6 | 29,1 |
| 17 | 26,0 | 22,1 | 25,5 | 26,4 | 26,7 | 30,8 | 29,3 | 28,1 | 31,1 |
| 18 | 27,5 | **14,8** | **18,6** | 21,1 | **19,7** | 22,0 | 28,4 | 25,3 | 25,6 |
| 19 | 29,0 | 26,2 | 24,1 | 25,5 | 24,3 | 24,9 | 23,7 | 25,7 | 30,9 |
| 20 | 30,5 | 25,4 | 25,2 | 25,8 | 32,2 | 28,8 | 28,5 | 28,4 | 27,0 |
| 21 | 32,0 | **21,6** | 30,5 | 31,5 | 29,9 | 34,3 | 30,3 | 31,9 | 29,4 |
| 22 | 33,5 | 35,2 | **24,3** | 28,9 | 32,9 | 29,0 | 26,0 | 28,4 | 32,8 |
| 23 | 35,0 | **18,7** | 32,7 | 30,5 | 34,3 | 37,4 | 34,5 | 37,6 | 35,8 |
| 24 | 36,5 | 32,6 | 34,3 | 39,4 | 40,9 | 37,5 | 37,4 | **26,3** | 36,7 |

Negrito: fora de ±25% da meta.

## Mecânicas dos monstros

Golpes avisados no chão (o bot percebe o aviso 0,6 s depois, como um jogador, clica no ponto seguro mais perto e espera fora até o golpe sair; fora da área, não anda nem ataca para dentro dela) e as mecânicas sem aviso (eco do Ecoante, sanguessuga, enxame, garras de pedra, território). Números por execução (média das sementes).

| Classe | Avisos vistos | Estava dentro | Esquivas | Esperas fora | Golpes de mecânica levados | Dano de mecânica (fatia do recebido) | Efeitos negativos recebidos |
|---|---|---|---|---|---|---|---|
| Tecelão da Brasa | 654 | 608 | 637 | 7 | 143 | 2.142 (1,3%) | Sanguessuga 9 |
| Andarilha do Vento | 814 | 743 | 704 | 6 | 235 | 4.068 (1,8%) | Sanguessuga 8 |
| Vigia do Espinhal | 803 | 752 | 756 | 19 | 232 | 4.797 (2,1%) | Atordoado 0 |
| Cantora do Véu | 892 | 855 | 802 | 11 | 187 | 2.575 (0,8%) | Sanguessuga 22 |
| Escudeiro do Alvorecer | 908 | 893 | 866 | 504 | 226 | 3.402 (1,4%) | Sanguessuga 13, Atolado 7, Atordoado 1 |
| Lanceiro do Fosso | 741 | 725 | 715 | 233 | 162 | 3.102 (1,1%) | Sanguessuga 8, Atolado 6 |
| Bastião de Bronze | 965 | 953 | 923 | 512 | 186 | 2.874 (1,2%) | Sanguessuga 28, Atolado 4, Atordoado 1 |
| Quebraferro | 848 | 823 | 792 | 468 | 168 | 2.652 (0,9%) | Sanguessuga 11, Atolado 6 |

Golpes de mecânica levados por execução, média das classes:

| Mecânica | Monstro (nível) | Golpes levados | Dano |
|---|---|---|---|
| Eco | Ecoante (14) | 173,7 | 2.362 |
| Explosão de Escória | Escória Pressurizada (18) | 15,4 | 782 |
| Arrasto | Draga Viva (17) | 2,8 | 47 |
| Fio Condutor | Aranha de Conduto (16) | 0,2 | 6 |
| Estouro de Vapor | Sapo-Bomba (5) | 0,2 | 3 |
| Corrida no Trilho | Lâmina de Esteira (12) | 0,0 | 1 |
| Cone de Faíscas | Soldador Cego (11) | 0,0 | 0 |

## Detalhe por classe

### Tecelão da Brasa (`emberweaver`)

6,46 h do 1 ao 25 (-16% da meta; 8/8 execuções concluídas). Plano de atributos: example_builds.json (emberweaver_magic). Tempo: combate 57%, deslocamento e saque 6%, recuperação 13%, viagens 24%, cidade e prova 0%, caído/fugindo 0%. Dano por fonte: ataque básico 40%, Faísca de Vidro 28%, Chão em Brasa 14%, Círculo de Fuligem 10%, Coração da Fornalha 6%; acerto 100%; 1.849 de dano causado e 421 recebido por minuto.

| Nível | Min | Meta | Desvio | Abates | Abates/min | Mortes | Fugas | Tônicos V/M | Ouro ganho (moedas + vendas) | Gasto: tônicos / equip. | XP de abates | Monstro principal |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 2,4 | 2,0 | +19% | 16 | 6,7 | 0,0 | 0,0 | 0 / 0 | 60 | 3 / 3 | 80 | Rato de Sulco (1) |
| 2 | **4,7** | 3,5 | +34% | 16 | 3,4 | 0,0 | 0,0 | 0 / 0 | 78 | 45 / 29 | 256 | Besouro-Brasa (2) |
| 3 | 5,2 | 5,0 | +4% | 30 | 5,8 | 0,0 | 0,0 | 10 / 6 | 115 | 0 / 0 | 570 | Cão de Ferrugem (3) |
| 4 | 5,9 | 6,5 | -10% | 24 | 4,2 | 0,0 | 0,0 | 3 / 1 | 102 | 0 / 0 | 1.036 | Lagarto de Lastro (4) |
| 5 | 9,2 | 8,0 | +15% | 26 | 2,8 | 0,0 | 0,0 | 0 / 7 | 105 | 0 / 0 | 1.716 | Sapo-Bomba (5) |
| 6 | 11,6 | 9,5 | +23% | 30 | 2,5 | 0,1 | 0,0 | 19 / 11 | 456 | 342 / 249 | 2.551 | Enguia de Lodo (6) |
| 7 | 11,4 | 11,0 | +4% | 33 | 2,9 | 0,0 | 0,0 | 32 / 20 | 542 | 392 / 168 | 3.605 | Válvula Errante (7) |
| 8 | 13,5 | 12,5 | +8% | 42 | 3,1 | 0,0 | 0,0 | 17 / 23 | 815 | 321 / 5 | 4.868 | Garça de Ferrugem (8) |
| 9 | 16,3 | 14,0 | +16% | 51 | 3,1 | 0,9 | 0,0 | 35 / 26 | 830 | 526 / 310 | 6.443 | Garça de Ferrugem (8) |
| 10 | 17,0 | 15,5 | +10% | 57 | 3,3 | 0,9 | 0,0 | 37 / 39 | 1.278 | 552 / 550 | 8.234 | Rato-Engrenagem (10) |
| 11 | 14,9 | 17,0 | -13% | 58 | 3,9 | 0,0 | 0,0 | 30 / 44 | 1.846 | 809 / 385 | 10.320 | Soldador Cego (11) |
| 12 | 14,6 | 18,5 | -21% | 79 | 5,4 | 0,0 | 0,0 | 19 / 45 | 2.235 | 0 / 0 | 12.641 | Lâmina de Esteira (12) |
| 13 | 20,5 | 20,0 | +2% | 86 | 4,2 | 0,0 | 0,0 | 35 / 65 | 3.147 | 772 / 3.037 | 15.301 | Larva Térmica (13) |
| 14 | 19,5 | 21,5 | -9% | 99 | 5,1 | 0,0 | 0,0 | 45 / 64 | 3.912 | 3.645 / 459 | 18.282 | Ecoante (14) |
| 15 | **12,5** | 23,0 | -46% | 105 | 8,4 | 0,0 | 0,0 | 38 / 45 | 3.383 | 681 / 0 | 21.524 | Guardião de Galeria (15) |
| 16 | **11,7** | 24,5 | -52% | 108 | 9,3 | 0,0 | 0,0 | 66 / 46 | 2.948 | 0 / 0 | 25.196 | Aranha de Conduto (16) |
| 17 | 22,1 | 26,0 | -15% | 118 | 5,3 | 0,1 | 0,0 | 39 / 48 | 5.846 | 3.548 / 6.591 | 29.089 | Draga Viva (17) |
| 18 | **14,8** | 27,5 | -46% | 120 | 8,1 | 0,0 | 0,0 | 43 / 53 | 4.299 | 0 / 0 | 33.348 | Escória Pressurizada (18) |
| 19 | 26,2 | 29,0 | -10% | 142 | 5,4 | 0,0 | 0,0 | 45 / 55 | 7.206 | 2.408 / 6.532 | 38.064 | Escória Pressurizada (18) |
| 20 | 25,4 | 30,5 | -17% | 124 | 4,9 | 0,0 | 0,0 | 49 / 73 | 7.855 | 1.436 / 3.458 | 43.026 | Salamandra de Cisterna (21) |
| 21 | **21,6** | 32,0 | -32% | 153 | 7,1 | 0,0 | 0,0 | 46 / 77 | 8.136 | 0 / 0 | 48.422 | Salamandra de Cisterna (21) |
| 22 | 35,2 | 33,5 | +5% | 172 | 4,9 | 0,9 | 0,0 | 85 / 82 | 13.646 | 5.625 / 3.453 | 54.010 | Sineiro de Bronze (22) |
| 23 | **18,7** | 35,0 | -47% | 165 | 8,8 | 0,0 | 0,0 | 119 / 86 | 8.899 | 0 / 0 | 60.326 | Voz Soterrada (23) |
| 24 | 32,6 | 36,5 | -11% | 190 | 5,8 | 1,6 | 0,0 | 140 / 87 | 13.583 | 6.237 / 7.162 | 66.790 | Toupeira de Basalto (24) |

### Andarilha do Vento (`windwalker`)

6,80 h do 1 ao 25 (-12% da meta; 8/8 execuções concluídas). Plano de atributos: gerado (requisitos das faixas + Agilidade/Vitalidade 2:3). Tempo: combate 69%, deslocamento e saque 6%, recuperação 2%, viagens 22%, cidade e prova 0%, caído/fugindo 0%. Dano por fonte: ataque básico 89%, Arremesso de Retorno 7%, Rajada Cortante 3%, Olho do Furacão 2%; acerto 96%; 1.755 de dano causado e 552 recebido por minuto.

| Nível | Min | Meta | Desvio | Abates | Abates/min | Mortes | Fugas | Tônicos V/M | Ouro ganho (moedas + vendas) | Gasto: tônicos / equip. | XP de abates | Monstro principal |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **1,3** | 2,0 | -37% | 16 | 12,5 | 0,0 | 0,0 | 0 / 0 | 58 | 0 / 0 | 80 | Rato de Sulco (1) |
| 2 | 3,8 | 3,5 | +8% | 16 | 4,3 | 0,0 | 0,0 | 0 / 0 | 78 | 47 / 33 | 256 | Besouro-Brasa (2) |
| 3 | 3,8 | 5,0 | -24% | 30 | 7,9 | 0,0 | 0,0 | 13 / 3 | 100 | 0 / 0 | 569 | Cão de Ferrugem (3) |
| 4 | **3,9** | 6,5 | -40% | 25 | 6,3 | 0,0 | 0,0 | 9 / 4 | 116 | 0 / 0 | 1.041 | Lagarto de Lastro (4) |
| 5 | 6,2 | 8,0 | -22% | 26 | 4,2 | 0,0 | 0,0 | 8 / 4 | 107 | 0 / 0 | 1.716 | Sapo-Bomba (5) |
| 6 | 9,9 | 9,5 | +4% | 28 | 2,9 | 0,0 | 0,8 | 42 / 3 | 420 | 320 / 253 | 2.525 | Enguia de Lodo (6) |
| 7 | 9,8 | 11,0 | -11% | 35 | 3,5 | 0,0 | 0,0 | 40 / 4 | 581 | 221 / 190 | 3.611 | Válvula Errante (7) |
| 8 | 9,5 | 12,5 | -24% | 43 | 4,6 | 0,0 | 0,1 | 36 / 4 | 658 | 219 / 0 | 4.881 | Garça de Ferrugem (8) |
| 9 | 15,9 | 14,0 | +14% | 50 | 3,1 | 0,5 | 0,4 | 56 / 7 | 828 | 692 / 367 | 6.415 | Autômato Escavador (9) |
| 10 | 19,1 | 15,5 | +24% | 63 | 3,3 | 1,3 | 0,3 | 64 / 9 | 1.180 | 252 / 688 | 8.242 | Autômato Escavador (9) |
| 11 | 14,5 | 17,0 | -15% | 60 | 4,2 | 0,6 | 0,3 | 59 / 7 | 1.506 | 272 / 179 | 10.331 | Lâmina de Esteira (12) |
| 12 | **13,8** | 18,5 | -25% | 79 | 5,7 | 0,0 | 0,1 | 19 / 9 | 2.205 | 165 / 0 | 12.659 | Lâmina de Esteira (12) |
| 13 | 19,1 | 20,0 | -4% | 86 | 4,5 | 0,0 | 0,0 | 19 / 16 | 3.198 | 556 / 3.605 | 15.305 | Larva Térmica (13) |
| 14 | **14,7** | 21,5 | -32% | 100 | 6,8 | 0,1 | 0,0 | 86 / 11 | 2.852 | 0 / 0 | 18.239 | Ecoante (14) |
| 15 | 24,5 | 23,0 | +6% | 116 | 4,7 | 0,9 | 0,3 | 108 / 10 | 4.675 | 3.828 / 2.539 | 21.526 | Guardião de Galeria (15) |
| 16 | 23,0 | 24,5 | -6% | 121 | 5,3 | 0,4 | 0,1 | 151 / 11 | 3.941 | 1.754 / 1.410 | 25.178 | Aranha de Conduto (16) |
| 17 | 25,5 | 26,0 | -2% | 114 | 4,5 | 0,0 | 0,0 | 65 / 14 | 5.068 | 3.048 / 1.824 | 29.065 | Draga Viva (17) |
| 18 | **18,6** | 27,5 | -33% | 119 | 6,4 | 0,0 | 0,0 | 107 / 15 | 4.305 | 0 / 0 | 33.445 | Escória Pressurizada (18) |
| 19 | 24,1 | 29,0 | -17% | 141 | 5,9 | 0,0 | 0,4 | 111 / 17 | 5.779 | 1.697 / 2.526 | 38.030 | Escória Pressurizada (18) |
| 20 | 25,2 | 30,5 | -17% | 124 | 4,9 | 0,0 | 0,0 | 71 / 13 | 6.680 | 0 / 0 | 43.012 | Salamandra de Cisterna (21) |
| 21 | 30,5 | 32,0 | -5% | 153 | 5,0 | 0,0 | 0,0 | 57 / 24 | 12.082 | 3.094 / 10.386 | 48.382 | Salamandra de Cisterna (21) |
| 22 | **24,3** | 33,5 | -28% | 168 | 6,9 | 0,1 | 0,1 | 189 / 20 | 9.772 | 926 / 0 | 54.084 | Sineiro de Bronze (22) |
| 23 | 32,7 | 35,0 | -7% | 170 | 5,2 | 0,3 | 0,8 | 180 / 25 | 13.796 | 5.517 / 11.034 | 60.241 | Voz Soterrada (23) |
| 24 | 34,3 | 36,5 | -6% | 182 | 5,3 | 1,0 | 0,4 | 214 / 26 | 14.274 | 5.513 / 3.345 | 66.889 | Voz Soterrada (23) |

### Vigia do Espinhal (`warden`)

7,05 h do 1 ao 25 (-8% da meta; 8/8 execuções concluídas). Plano de atributos: gerado (requisitos das faixas + Agilidade/Vitalidade 2:3). Tempo: combate 70%, deslocamento e saque 6%, recuperação 3%, viagens 21%, cidade e prova 0%, caído/fugindo 0%. Dano por fonte: ataque básico 84%, Flecha de Passagem 6%, Tiro do Espinhal 5%, Chuva de Espinhos 5%; acerto 98%; 1.740 de dano causado e 529 recebido por minuto.

| Nível | Min | Meta | Desvio | Abates | Abates/min | Mortes | Fugas | Tônicos V/M | Ouro ganho (moedas + vendas) | Gasto: tônicos / equip. | XP de abates | Monstro principal |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **1,4** | 2,0 | -29% | 16 | 11,3 | 0,0 | 0,0 | 0 / 1 | 59 | 0 / 0 | 80 | Rato de Sulco (1) |
| 2 | 3,9 | 3,5 | +12% | 16 | 4,1 | 0,0 | 0,0 | 0 / 1 | 75 | 50 / 33 | 256 | Besouro-Brasa (2) |
| 3 | 4,2 | 5,0 | -16% | 30 | 7,2 | 0,0 | 0,0 | 14 / 4 | 117 | 0 / 0 | 570 | Cão de Ferrugem (3) |
| 4 | **4,0** | 6,5 | -39% | 25 | 6,2 | 0,0 | 0,0 | 9 / 2 | 106 | 0 / 0 | 1.038 | Lagarto de Lastro (4) |
| 5 | **5,9** | 8,0 | -26% | 26 | 4,4 | 0,0 | 0,0 | 8 / 5 | 105 | 0 / 0 | 1.716 | Sapo-Bomba (5) |
| 6 | 10,2 | 9,5 | +7% | 29 | 2,8 | 0,0 | 0,4 | 35 / 3 | 485 | 329 / 281 | 2.548 | Enguia de Lodo (6) |
| 7 | 8,7 | 11,0 | -21% | 33 | 3,8 | 0,0 | 0,0 | 41 / 4 | 533 | 178 / 142 | 3.614 | Válvula Errante (7) |
| 8 | **8,1** | 12,5 | -35% | 41 | 5,0 | 0,0 | 0,0 | 31 / 5 | 737 | 0 / 0 | 4.869 | Garça de Ferrugem (8) |
| 9 | 17,0 | 14,0 | +21% | 47 | 2,8 | 0,4 | 0,0 | 42 / 8 | 822 | 528 / 536 | 6.426 | Autômato Escavador (9) |
| 10 | 16,8 | 15,5 | +8% | 54 | 3,2 | 0,9 | 0,0 | 55 / 11 | 1.068 | 344 / 733 | 8.234 | Autômato Escavador (9) |
| 11 | 13,5 | 17,0 | -21% | 62 | 4,6 | 1,1 | 0,1 | 69 / 7 | 1.584 | 708 / 0 | 10.323 | Soldador Cego (11) |
| 12 | 14,2 | 18,5 | -24% | 78 | 5,5 | 0,0 | 0,0 | 25 / 10 | 2.234 | 0 / 0 | 12.637 | Lâmina de Esteira (12) |
| 13 | 19,6 | 20,0 | -2% | 86 | 4,4 | 0,0 | 0,0 | 26 / 14 | 3.137 | 1.133 / 3.116 | 15.305 | Larva Térmica (13) |
| 14 | **15,6** | 21,5 | -28% | 100 | 6,4 | 0,0 | 0,0 | 90 / 12 | 2.808 | 0 / 0 | 18.308 | Ecoante (14) |
| 15 | 24,2 | 23,0 | +5% | 108 | 4,4 | 0,3 | 0,5 | 99 / 12 | 4.622 | 3.594 / 2.869 | 21.486 | Guardião de Galeria (15) |
| 16 | 26,8 | 24,5 | +9% | 113 | 4,2 | 0,8 | 0,8 | 176 / 12 | 3.872 | 2.891 / 1.536 | 25.152 | Aranha de Conduto (16) |
| 17 | 26,4 | 26,0 | +1% | 117 | 4,5 | 0,1 | 0,1 | 83 / 13 | 4.854 | 2.138 / 1.018 | 29.156 | Draga Viva (17) |
| 18 | 21,1 | 27,5 | -23% | 119 | 5,6 | 0,0 | 0,0 | 99 / 16 | 4.638 | 911 / 250 | 33.341 | Escória Pressurizada (18) |
| 19 | 25,5 | 29,0 | -12% | 142 | 5,6 | 0,3 | 0,0 | 115 / 18 | 5.474 | 704 / 1.415 | 38.078 | Escória Pressurizada (18) |
| 20 | 25,8 | 30,5 | -16% | 124 | 4,8 | 0,0 | 0,0 | 66 / 15 | 6.560 | 0 / 0 | 42.974 | Salamandra de Cisterna (21) |
| 21 | 31,5 | 32,0 | -2% | 153 | 4,9 | 0,0 | 0,0 | 66 / 24 | 12.656 | 2.630 / 10.677 | 48.461 | Salamandra de Cisterna (21) |
| 22 | 28,9 | 33,5 | -14% | 172 | 6,0 | 0,6 | 0,1 | 144 / 24 | 11.552 | 2.748 / 447 | 54.008 | Sineiro de Bronze (22) |
| 23 | 30,5 | 35,0 | -13% | 181 | 5,9 | 1,1 | 0,4 | 184 / 26 | 12.181 | 2.779 / 4.864 | 60.300 | Voz Soterrada (23) |
| 24 | 39,4 | 36,5 | +8% | 207 | 5,3 | 1,3 | 0,1 | 195 / 30 | 15.858 | 5.477 / 8.800 | 66.825 | Voz Soterrada (23) |

### Cantora do Véu (`veilsinger`)

7,29 h do 1 ao 25 (-5% da meta; 8/8 execuções concluídas). Plano de atributos: gerado (requisitos das faixas + Espírito/Vitalidade 2:3). Tempo: combate 72%, deslocamento e saque 5%, recuperação 4%, viagens 19%, cidade e prova 0%, caído/fugindo 0%. Dano por fonte: ataque básico 54%, Nota Clara 46%; acerto 100%; 1.675 de dano causado e 758 recebido por minuto; 232 de cura por minuto.

| Nível | Min | Meta | Desvio | Abates | Abates/min | Mortes | Fugas | Tônicos V/M | Ouro ganho (moedas + vendas) | Gasto: tônicos / equip. | XP de abates | Monstro principal |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 2,1 | 2,0 | +4% | 16 | 7,7 | 0,0 | 0,0 | 0 / 0 | 63 | 0 / 0 | 80 | Rato de Sulco (1) |
| 2 | **4,8** | 3,5 | +36% | 16 | 3,4 | 0,0 | 0,0 | 0 / 0 | 84 | 54 / 33 | 256 | Besouro-Brasa (2) |
| 3 | **6,5** | 5,0 | +30% | 30 | 4,6 | 0,0 | 0,0 | 17 / 5 | 98 | 0 / 0 | 570 | Cão de Ferrugem (3) |
| 4 | 6,5 | 6,5 | +0% | 27 | 4,1 | 0,0 | 0,1 | 2 / 0 | 113 | 0 / 0 | 1.040 | Lagarto de Lastro (4) |
| 5 | 6,9 | 8,0 | -14% | 26 | 3,8 | 0,0 | 0,0 | 0 / 2 | 106 | 0 / 0 | 1.716 | Sapo-Bomba (5) |
| 6 | 9,7 | 9,5 | +2% | 29 | 2,9 | 0,0 | 0,1 | 13 / 12 | 465 | 334 / 254 | 2.537 | Enguia de Lodo (6) |
| 7 | 9,8 | 11,0 | -11% | 34 | 3,5 | 0,0 | 0,0 | 10 / 17 | 512 | 329 / 191 | 3.616 | Válvula Errante (7) |
| 8 | 9,5 | 12,5 | -24% | 43 | 4,5 | 0,0 | 0,0 | 6 / 15 | 751 | 140 / 9 | 4.868 | Garça de Ferrugem (8) |
| 9 | 11,8 | 14,0 | -16% | 44 | 3,7 | 0,3 | 0,0 | 15 / 23 | 589 | 299 / 185 | 6.425 | Autômato Escavador (9) |
| 10 | **19,9** | 15,5 | +28% | 63 | 3,2 | 1,0 | 0,0 | 25 / 35 | 1.323 | 605 / 865 | 8.269 | Garça de Ferrugem (8) |
| 11 | **11,8** | 17,0 | -31% | 59 | 5,0 | 0,3 | 0,0 | 13 / 33 | 1.554 | 129 / 247 | 10.301 | Soldador Cego (11) |
| 12 | 14,5 | 18,5 | -22% | 79 | 5,4 | 0,0 | 0,0 | 3 / 21 | 2.342 | 426 / 0 | 12.659 | Lâmina de Esteira (12) |
| 13 | 20,8 | 20,0 | +4% | 85 | 4,1 | 0,0 | 0,0 | 0 / 47 | 3.222 | 311 / 3.564 | 15.282 | Larva Térmica (13) |
| 14 | 23,4 | 21,5 | +9% | 100 | 4,3 | 0,1 | 0,0 | 32 / 43 | 3.634 | 2.837 / 538 | 18.231 | Ecoante (14) |
| 15 | 17,4 | 23,0 | -24% | 106 | 6,1 | 0,0 | 0,0 | 35 / 39 | 3.108 | 319 / 496 | 21.592 | Guardião de Galeria (15) |
| 16 | 20,9 | 24,5 | -15% | 110 | 5,3 | 0,0 | 0,0 | 101 / 49 | 3.140 | 323 / 688 | 25.130 | Aranha de Conduto (16) |
| 17 | 26,7 | 26,0 | +3% | 116 | 4,3 | 0,0 | 0,0 | 20 / 36 | 6.112 | 3.821 / 5.626 | 29.140 | Draga Viva (17) |
| 18 | **19,7** | 27,5 | -28% | 119 | 6,0 | 0,0 | 0,0 | 23 / 44 | 4.178 | 0 / 0 | 33.404 | Escória Pressurizada (18) |
| 19 | 24,3 | 29,0 | -16% | 141 | 5,8 | 0,0 | 0,0 | 32 / 53 | 5.460 | 353 / 1.431 | 37.963 | Escória Pressurizada (18) |
| 20 | 32,2 | 30,5 | +6% | 125 | 3,9 | 0,0 | 0,0 | 1 / 34 | 7.963 | 1.373 / 3.465 | 43.068 | Salamandra de Cisterna (21) |
| 21 | 29,9 | 32,0 | -7% | 153 | 5,1 | 0,0 | 0,0 | 0 / 44 | 9.678 | 971 / 6.140 | 48.382 | Salamandra de Cisterna (21) |
| 22 | 32,9 | 33,5 | -2% | 168 | 5,1 | 0,3 | 0,0 | 61 / 63 | 11.214 | 1.526 / 650 | 54.043 | Sineiro de Bronze (22) |
| 23 | 34,3 | 35,0 | -2% | 174 | 5,1 | 0,5 | 0,0 | 80 / 69 | 10.603 | 2.064 / 6.124 | 60.289 | Voz Soterrada (23) |
| 24 | 40,9 | 36,5 | +12% | 199 | 4,9 | 1,5 | 0,0 | 136 / 81 | 12.439 | 3.926 / 6.565 | 66.803 | Toupeira de Basalto (24) |

### Escudeiro do Alvorecer (`dawnshield`)

7,48 h do 1 ao 25 (-3% da meta; 8/8 execuções concluídas). Plano de atributos: gerado (requisitos das faixas + Força/Vitalidade 2:3). Tempo: combate 71%, deslocamento e saque 4%, recuperação 2%, viagens 22%, cidade e prova 0%, caído/fugindo 0%. Dano por fonte: ataque básico 75%, Corte Solar 17%, Lâmina do Meio-Dia 5%, dano sagrado extra 4%; acerto 80%; 1.569 de dano causado e 557 recebido por minuto; 5 de cura por minuto.

| Nível | Min | Meta | Desvio | Abates | Abates/min | Mortes | Fugas | Tônicos V/M | Ouro ganho (moedas + vendas) | Gasto: tônicos / equip. | XP de abates | Monstro principal |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **1,4** | 2,0 | -29% | 16 | 11,1 | 0,0 | 0,0 | 0 / 0 | 60 | 0 / 0 | 80 | Rato de Sulco (1) |
| 2 | 3,8 | 3,5 | +10% | 16 | 4,2 | 0,0 | 0,0 | 1 / 1 | 83 | 54 / 33 | 257 | Besouro-Brasa (2) |
| 3 | 3,9 | 5,0 | -23% | 30 | 7,8 | 0,0 | 0,0 | 15 / 2 | 66 | 0 / 0 | 569 | Cão de Ferrugem (3) |
| 4 | 5,2 | 6,5 | -19% | 36 | 6,9 | 0,0 | 0,3 | 10 / 4 | 146 | 0 / 0 | 1.041 | Cão de Ferrugem (3) |
| 5 | 6,3 | 8,0 | -22% | 26 | 4,2 | 0,0 | 0,0 | 8 / 4 | 108 | 0 / 0 | 1.712 | Sapo-Bomba (5) |
| 6 | 9,3 | 9,5 | -2% | 28 | 3,1 | 0,0 | 1,0 | 37 / 2 | 305 | 262 / 195 | 2.525 | Enguia de Lodo (6) |
| 7 | 12,0 | 11,0 | +9% | 37 | 3,1 | 0,0 | 1,4 | 41 / 3 | 500 | 292 / 219 | 3.624 | Válvula Errante (7) |
| 8 | 10,7 | 12,5 | -15% | 46 | 4,3 | 0,1 | 0,5 | 21 / 6 | 719 | 56 / 10 | 4.859 | Garça de Ferrugem (8) |
| 9 | 15,6 | 14,0 | +11% | 46 | 3,0 | 0,4 | 0,9 | 62 / 5 | 712 | 617 / 225 | 6.436 | Autômato Escavador (9) |
| 10 | **21,1** | 15,5 | +36% | 59 | 2,8 | 0,8 | 0,0 | 54 / 6 | 1.235 | 550 / 899 | 8.295 | Rato-Engrenagem (10) |
| 11 | **12,5** | 17,0 | -26% | 59 | 4,7 | 0,1 | 0,0 | 54 / 7 | 1.574 | 56 / 246 | 10.288 | Soldador Cego (11) |
| 12 | 15,3 | 18,5 | -17% | 79 | 5,1 | 0,0 | 0,1 | 27 / 10 | 2.279 | 204 / 0 | 12.640 | Lâmina de Esteira (12) |
| 13 | 20,5 | 20,0 | +3% | 86 | 4,2 | 0,0 | 0,0 | 21 / 14 | 3.242 | 632 / 3.629 | 15.305 | Larva Térmica (13) |
| 14 | 18,7 | 21,5 | -13% | 100 | 5,4 | 0,5 | 0,4 | 106 / 10 | 2.612 | 1.086 / 0 | 18.236 | Ecoante (14) |
| 15 | 23,0 | 23,0 | +0% | 111 | 4,8 | 0,3 | 0,9 | 107 / 12 | 3.921 | 3.030 / 716 | 21.553 | Guardião de Galeria (15) |
| 16 | 25,0 | 24,5 | +2% | 117 | 4,7 | 0,1 | 0,4 | 140 / 12 | 3.935 | 2.265 / 1.649 | 25.150 | Aranha de Conduto (16) |
| 17 | 30,8 | 26,0 | +18% | 115 | 3,7 | 0,0 | 0,1 | 95 / 12 | 4.895 | 2.400 / 3.546 | 29.125 | Draga Viva (17) |
| 18 | 22,0 | 27,5 | -20% | 120 | 5,5 | 0,0 | 0,0 | 103 / 12 | 4.593 | 726 / 125 | 33.409 | Escória Pressurizada (18) |
| 19 | 24,9 | 29,0 | -14% | 141 | 5,7 | 0,0 | 0,0 | 101 / 18 | 5.847 | 1.266 / 1.628 | 38.030 | Escória Pressurizada (18) |
| 20 | 28,8 | 30,5 | -6% | 126 | 4,4 | 0,0 | 0,0 | 79 / 17 | 7.169 | 800 / 1.621 | 43.083 | Salamandra de Cisterna (21) |
| 21 | 34,3 | 32,0 | +7% | 152 | 4,4 | 0,0 | 0,0 | 62 / 24 | 12.399 | 3.079 / 9.795 | 48.303 | Salamandra de Cisterna (21) |
| 22 | 29,0 | 33,5 | -13% | 168 | 5,8 | 0,0 | 0,0 | 171 / 18 | 9.529 | 902 / 0 | 54.089 | Sineiro de Bronze (22) |
| 23 | 37,4 | 35,0 | +7% | 168 | 4,5 | 0,1 | 0,5 | 169 / 28 | 15.159 | 6.420 / 14.311 | 60.266 | Voz Soterrada (23) |
| 24 | 37,5 | 36,5 | +3% | 167 | 4,4 | 0,1 | 0,4 | 229 / 23 | 12.974 | 5.463 / 1.971 | 66.809 | Toupeira de Basalto (24) |

### Lanceiro do Fosso (`pikeman`)

7,58 h do 1 ao 25 (-2% da meta; 8/8 execuções concluídas). Plano de atributos: gerado (requisitos das faixas + Força/Vitalidade 2:3). Tempo: combate 66%, deslocamento e saque 6%, recuperação 4%, viagens 24%, cidade e prova 0%, caído/fugindo 0%. Dano por fonte: ataque básico 77%, Estocada Longa 14%, Avanço do Fosso 4%, Muralha de Piques 3%, Linha Partida 3%; acerto 86%; 1.624 de dano causado e 600 recebido por minuto.

| Nível | Min | Meta | Desvio | Abates | Abates/min | Mortes | Fugas | Tônicos V/M | Ouro ganho (moedas + vendas) | Gasto: tônicos / equip. | XP de abates | Monstro principal |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **1,5** | 2,0 | -25% | 16 | 10,7 | 0,0 | 0,0 | 0 / 0 | 61 | 0 / 0 | 80 | Rato de Sulco (1) |
| 2 | 4,0 | 3,5 | +14% | 16 | 4,0 | 0,0 | 0,0 | 1 / 0 | 80 | 53 / 33 | 256 | Besouro-Brasa (2) |
| 3 | 5,2 | 5,0 | +4% | 31 | 5,9 | 0,0 | 1,0 | 19 / 2 | 63 | 0 / 0 | 573 | Cão de Ferrugem (3) |
| 4 | 7,2 | 6,5 | +10% | 34 | 4,7 | 0,0 | 0,9 | 9 / 2 | 143 | 0 / 0 | 1.039 | Cão de Ferrugem (3) |
| 5 | 9,3 | 8,0 | +16% | 30 | 3,3 | 0,0 | 0,3 | 12 / 4 | 118 | 58 / 42 | 1.699 | Sapo-Bomba (5) |
| 6 | 9,9 | 9,5 | +4% | 31 | 3,2 | 0,1 | 1,4 | 39 / 2 | 266 | 160 / 121 | 2.542 | Enguia de Lodo (6) |
| 7 | **15,2** | 11,0 | +39% | 38 | 2,5 | 0,1 | 2,3 | 45 / 3 | 429 | 320 / 188 | 3.592 | Válvula Errante (7) |
| 8 | 13,4 | 12,5 | +7% | 49 | 3,7 | 0,0 | 1,0 | 37 / 6 | 760 | 276 / 19 | 4.908 | Garça de Ferrugem (8) |
| 9 | **18,5** | 14,0 | +32% | 58 | 3,1 | 1,0 | 0,1 | 45 / 6 | 951 | 260 / 194 | 6.417 | Garça de Ferrugem (8) |
| 10 | 17,6 | 15,5 | +14% | 64 | 3,6 | 1,1 | 0,0 | 65 / 10 | 1.198 | 576 / 785 | 8.241 | Garça de Ferrugem (8) |
| 11 | 14,6 | 17,0 | -14% | 59 | 4,1 | 0,5 | 0,4 | 63 / 7 | 1.740 | 638 / 65 | 10.317 | Soldador Cego (11) |
| 12 | 14,2 | 18,5 | -23% | 80 | 5,6 | 0,0 | 0,0 | 33 / 11 | 2.202 | 0 / 0 | 12.672 | Lâmina de Esteira (12) |
| 13 | 19,4 | 20,0 | -3% | 86 | 4,4 | 0,0 | 0,0 | 29 / 16 | 3.207 | 1.006 / 3.402 | 15.305 | Larva Térmica (13) |
| 14 | 17,1 | 21,5 | -21% | 102 | 5,9 | 0,6 | 0,0 | 99 / 9 | 2.795 | 687 / 0 | 18.254 | Ecoante (14) |
| 15 | 22,7 | 23,0 | -1% | 121 | 5,3 | 0,8 | 0,3 | 110 / 12 | 3.803 | 2.778 / 677 | 21.498 | Larva Térmica (13) |
| 16 | 26,9 | 24,5 | +10% | 125 | 4,7 | 0,4 | 0,5 | 151 / 13 | 4.027 | 2.807 / 1.973 | 25.125 | Aranha de Conduto (16) |
| 17 | 29,3 | 26,0 | +13% | 118 | 4,0 | 0,3 | 0,1 | 114 / 16 | 4.702 | 1.988 / 1.966 | 29.202 | Draga Viva (17) |
| 18 | 28,4 | 27,5 | +3% | 125 | 4,4 | 0,4 | 0,4 | 127 / 14 | 5.109 | 2.926 / 824 | 33.395 | Escória Pressurizada (18) |
| 19 | 23,7 | 29,0 | -18% | 142 | 6,0 | 0,0 | 0,0 | 127 / 16 | 5.322 | 786 / 0 | 37.968 | Escória Pressurizada (18) |
| 20 | 28,5 | 30,5 | -7% | 124 | 4,4 | 0,0 | 0,1 | 101 / 16 | 7.995 | 2.624 / 3.011 | 43.070 | Salamandra de Cisterna (21) |
| 21 | 30,3 | 32,0 | -5% | 153 | 5,0 | 0,0 | 0,0 | 90 / 21 | 11.479 | 3.589 / 5.536 | 48.382 | Salamandra de Cisterna (21) |
| 22 | 26,0 | 33,5 | -22% | 169 | 6,5 | 0,4 | 0,0 | 194 / 21 | 9.520 | 902 / 406 | 54.056 | Sineiro de Bronze (22) |
| 23 | 34,5 | 35,0 | -2% | 166 | 4,8 | 0,0 | 0,8 | 222 / 24 | 14.578 | 6.437 / 11.339 | 60.296 | Voz Soterrada (23) |
| 24 | 37,4 | 36,5 | +3% | 177 | 4,7 | 0,9 | 0,6 | 229 / 27 | 16.001 | 7.373 / 1.578 | 66.883 | Voz Soterrada (23) |

### Bastião de Bronze (`bastion`)

7,68 h do 1 ao 25 (-0% da meta; 8/8 execuções concluídas). Plano de atributos: gerado (requisitos das faixas + Força/Vitalidade 2:3). Tempo: combate 73%, deslocamento e saque 5%, recuperação 3%, viagens 19%, cidade e prova 0%, caído/fugindo 0%. Dano por fonte: ataque básico 82%, Pulso de Atração 10%, Engrenagem Travada 8%; acerto 85%; 1.552 de dano causado e 513 recebido por minuto.

| Nível | Min | Meta | Desvio | Abates | Abates/min | Mortes | Fugas | Tônicos V/M | Ouro ganho (moedas + vendas) | Gasto: tônicos / equip. | XP de abates | Monstro principal |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1,6 | 2,0 | -21% | 16 | 10,1 | 0,0 | 0,0 | 0 / 0 | 61 | 0 / 0 | 80 | Rato de Sulco (1) |
| 2 | 4,3 | 3,5 | +21% | 16 | 3,8 | 0,0 | 0,0 | 1 / 0 | 79 | 53 / 33 | 256 | Besouro-Brasa (2) |
| 3 | 4,8 | 5,0 | -4% | 30 | 6,3 | 0,0 | 0,0 | 18 / 2 | 51 | 0 / 0 | 570 | Cão de Ferrugem (3) |
| 4 | **8,7** | 6,5 | +33% | 41 | 4,7 | 0,0 | 1,3 | 14 / 1 | 126 | 0 / 0 | 1.036 | Cão de Ferrugem (3) |
| 5 | 8,6 | 8,0 | +7% | 34 | 4,0 | 0,0 | 0,0 | 4 / 8 | 200 | 37 / 59 | 1.713 | Sapo-Bomba (5) |
| 6 | 9,2 | 9,5 | -3% | 29 | 3,2 | 0,0 | 1,3 | 36 / 4 | 342 | 239 / 183 | 2.550 | Enguia de Lodo (6) |
| 7 | 10,8 | 11,0 | -1% | 36 | 3,3 | 0,0 | 1,9 | 41 / 3 | 352 | 205 / 138 | 3.588 | Válvula Errante (7) |
| 8 | 12,3 | 12,5 | -2% | 45 | 3,7 | 0,0 | 0,3 | 32 / 6 | 718 | 158 / 76 | 4.907 | Garça de Ferrugem (8) |
| 9 | 16,1 | 14,0 | +15% | 48 | 3,0 | 0,6 | 0,9 | 65 / 7 | 671 | 539 / 125 | 6.403 | Autômato Escavador (9) |
| 10 | **19,6** | 15,5 | +26% | 62 | 3,2 | 1,3 | 0,0 | 74 / 8 | 1.138 | 452 / 670 | 8.266 | Autômato Escavador (9) |
| 11 | 19,4 | 17,0 | +14% | 60 | 3,1 | 0,3 | 0,3 | 68 / 8 | 1.646 | 620 / 550 | 10.321 | Soldador Cego (11) |
| 12 | 17,3 | 18,5 | -6% | 79 | 4,6 | 0,0 | 0,0 | 29 / 11 | 2.336 | 0 / 0 | 12.651 | Lâmina de Esteira (12) |
| 13 | 22,7 | 20,0 | +14% | 85 | 3,8 | 0,0 | 0,0 | 22 / 13 | 3.122 | 828 / 3.037 | 15.282 | Larva Térmica (13) |
| 14 | 20,6 | 21,5 | -4% | 101 | 4,9 | 0,6 | 0,1 | 102 / 6 | 2.065 | 720 / 0 | 18.243 | Ecoante (14) |
| 15 | 23,9 | 23,0 | +4% | 113 | 4,8 | 0,3 | 0,5 | 92 / 14 | 4.086 | 2.556 / 807 | 21.547 | Guardião de Galeria (15) |
| 16 | 29,6 | 24,5 | +21% | 114 | 3,8 | 0,4 | 0,8 | 158 / 9 | 3.335 | 2.663 / 1.702 | 25.135 | Aranha de Conduto (16) |
| 17 | 28,1 | 26,0 | +8% | 116 | 4,1 | 0,0 | 0,0 | 74 / 18 | 5.533 | 1.623 / 3.013 | 29.148 | Draga Viva (17) |
| 18 | 25,3 | 27,5 | -8% | 119 | 4,7 | 0,0 | 0,1 | 94 / 15 | 4.789 | 1.148 / 656 | 33.365 | Escória Pressurizada (18) |
| 19 | 25,7 | 29,0 | -11% | 142 | 5,5 | 0,0 | 0,3 | 97 / 17 | 5.975 | 1.421 / 2.392 | 38.097 | Escória Pressurizada (18) |
| 20 | 28,4 | 30,5 | -7% | 124 | 4,4 | 0,0 | 0,0 | 81 / 16 | 7.176 | 653 / 1.535 | 42.972 | Salamandra de Cisterna (21) |
| 21 | 31,9 | 32,0 | -0% | 153 | 4,8 | 0,0 | 0,0 | 54 / 23 | 12.310 | 2.695 / 7.535 | 48.343 | Salamandra de Cisterna (21) |
| 22 | 28,4 | 33,5 | -15% | 168 | 5,9 | 0,0 | 0,0 | 140 / 21 | 9.776 | 882 / 650 | 54.172 | Sineiro de Bronze (22) |
| 23 | 37,6 | 35,0 | +7% | 165 | 4,4 | 0,0 | 0,6 | 158 / 21 | 14.679 | 6.435 / 13.674 | 60.287 | Voz Soterrada (23) |
| 24 | **26,3** | 36,5 | -28% | 164 | 6,2 | 0,0 | 0,0 | 201 / 24 | 8.671 | 0 / 0 | 66.866 | Toupeira de Basalto (24) |

### Quebraferro (`breaker`)

7,71 h do 1 ao 25 (+0% da meta; 8/8 execuções concluídas). Plano de atributos: example_builds.json (breaker_physical). Tempo: combate 68%, deslocamento e saque 5%, recuperação 4%, viagens 23%, cidade e prova 0%, caído/fugindo 0%. Dano por fonte: ataque básico 78%, Talho Profundo 13%, Ruptura 4%, dano contínuo 3%, Fenda Sísmica 3%; acerto 88%; 1.567 de dano causado e 646 recebido por minuto.

| Nível | Min | Meta | Desvio | Abates | Abates/min | Mortes | Fugas | Tônicos V/M | Ouro ganho (moedas + vendas) | Gasto: tônicos / equip. | XP de abates | Monstro principal |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1,5 | 2,0 | -25% | 16 | 10,6 | 0,0 | 0,0 | 0 / 0 | 63 | 0 / 0 | 80 | Rato de Sulco (1) |
| 2 | 3,8 | 3,5 | +8% | 16 | 4,3 | 0,0 | 0,0 | 2 / 1 | 77 | 49 / 33 | 257 | Besouro-Brasa (2) |
| 3 | 4,0 | 5,0 | -20% | 30 | 7,5 | 0,0 | 0,0 | 19 / 2 | 71 | 0 / 0 | 570 | Cão de Ferrugem (3) |
| 4 | 5,7 | 6,5 | -12% | 30 | 5,2 | 0,0 | 0,4 | 8 / 4 | 158 | 0 / 0 | 1.049 | Lagarto de Lastro (4) |
| 5 | 7,7 | 8,0 | -3% | 26 | 3,3 | 0,0 | 0,0 | 7 / 3 | 102 | 0 / 0 | 1.700 | Sapo-Bomba (5) |
| 6 | 10,6 | 9,5 | +11% | 29 | 2,7 | 0,0 | 1,5 | 43 / 2 | 323 | 273 / 198 | 2.530 | Enguia de Lodo (6) |
| 7 | 11,8 | 11,0 | +8% | 39 | 3,3 | 0,0 | 2,0 | 40 / 3 | 380 | 256 / 168 | 3.619 | Enguia de Lodo (6) |
| 8 | 14,1 | 12,5 | +13% | 49 | 3,5 | 0,0 | 1,9 | 28 / 7 | 902 | 278 / 0 | 4.898 | Garça de Ferrugem (8) |
| 9 | 14,9 | 14,0 | +7% | 56 | 3,8 | 0,5 | 0,6 | 68 / 5 | 756 | 391 / 315 | 6.411 | Garça de Ferrugem (8) |
| 10 | 18,5 | 15,5 | +19% | 59 | 3,2 | 1,1 | 0,0 | 70 / 6 | 1.045 | 560 / 631 | 8.241 | Rato-Engrenagem (10) |
| 11 | 15,1 | 17,0 | -11% | 59 | 3,9 | 0,8 | 0,4 | 62 / 6 | 1.678 | 663 / 41 | 10.317 | Lâmina de Esteira (12) |
| 12 | 14,8 | 18,5 | -20% | 79 | 5,4 | 0,0 | 0,0 | 41 / 9 | 2.164 | 0 / 0 | 12.643 | Lâmina de Esteira (12) |
| 13 | 19,7 | 20,0 | -1% | 86 | 4,3 | 0,0 | 0,0 | 32 / 13 | 3.283 | 1.255 / 2.804 | 15.305 | Larva Térmica (13) |
| 14 | 16,6 | 21,5 | -23% | 102 | 6,1 | 0,9 | 0,0 | 108 / 7 | 2.228 | 0 / 0 | 18.255 | Ecoante (14) |
| 15 | 25,4 | 23,0 | +10% | 127 | 5,0 | 1,0 | 0,5 | 88 / 14 | 4.348 | 2.397 / 694 | 21.542 | Larva Térmica (13) |
| 16 | 29,1 | 24,5 | +19% | 117 | 4,0 | 0,6 | 0,5 | 177 / 16 | 4.659 | 3.984 / 2.764 | 25.174 | Aranha de Conduto (16) |
| 17 | 31,1 | 26,0 | +20% | 121 | 3,9 | 0,0 | 0,4 | 129 / 12 | 4.790 | 3.326 / 1.338 | 29.103 | Draga Viva (17) |
| 18 | 25,6 | 27,5 | -7% | 119 | 4,7 | 0,0 | 0,4 | 136 / 13 | 4.892 | 1.700 / 824 | 33.398 | Escória Pressurizada (18) |
| 19 | 30,9 | 29,0 | +7% | 150 | 4,9 | 0,4 | 0,5 | 144 / 20 | 8.067 | 4.598 / 3.458 | 38.011 | Escória Pressurizada (18) |
| 20 | 27,0 | 30,5 | -12% | 124 | 4,6 | 0,0 | 0,0 | 113 / 17 | 7.321 | 914 / 863 | 43.080 | Salamandra de Cisterna (21) |
| 21 | 29,4 | 32,0 | -8% | 153 | 5,2 | 0,0 | 0,0 | 97 / 19 | 10.049 | 2.276 / 4.113 | 48.343 | Salamandra de Cisterna (21) |
| 22 | 32,8 | 33,5 | -2% | 169 | 5,2 | 0,4 | 0,3 | 196 / 22 | 11.866 | 3.374 / 2.113 | 54.089 | Sineiro de Bronze (22) |
| 23 | 35,8 | 35,0 | +2% | 169 | 4,7 | 0,3 | 0,6 | 241 / 23 | 14.904 | 5.537 / 9.077 | 60.298 | Voz Soterrada (23) |
| 24 | 36,7 | 36,5 | +1% | 178 | 4,9 | 1,1 | 0,5 | 244 / 28 | 13.303 | 5.517 / 2.499 | 66.803 | Voz Soterrada (23) |

## Economia: ouro ganho × gasto (tônicos e equipamento)

Ganho = moedas saqueadas + vendas ao comerciante (sucata, peças substituídas e de outras classes, a `value × economy.sellFraction`). Gasto = tônicos na loja da cidade e peças comuns no armeiro (`value × economy.gearPriceMult`), sempre com ouro real (`buy`/`sell`). "Fatia" = gasto ÷ ganho.

| Classe | Moedas | Vendas | Gasto em tônicos | Gasto em equipamento | Fatia tônicos / equip. | Saldo no nível 25 | Ganho/h | Tônicos usados (V+M) | Itens vendidos | Idas à loja |
|---|---|---|---|---|---|---|---|---|---|---|
| Tecelão da Brasa | 75.049 | 16.268 | 27.342 | 32.390 | 30% / 35% | 31.586 | 14.146 | 1.952 | 799 | 13,3 |
| Andarilha do Vento | 74.464 | 19.793 | 28.122 | 38.380 | 30% / 41% | 27.756 | 13.867 | 1.961 | 837 | 12,3 |
| Vigia do Espinhal | 76.296 | 19.839 | 27.142 | 36.715 | 28% / 38% | 32.277 | 13.637 | 1.946 | 858 | 11,5 |
| Cantora do Véu | 73.444 | 15.303 | 20.138 | 37.069 | 23% / 42% | 31.540 | 12.177 | 1.386 | 702 | 11,4 |
| Escudeiro do Alvorecer | 72.208 | 21.848 | 30.160 | 40.817 | 32% / 43% | 23.080 | 12.572 | 1.961 | 854 | 13,1 |
| Lanceiro do Fosso | 72.744 | 23.805 | 36.241 | 32.159 | 38% / 33% | 28.149 | 12.741 | 2.220 | 925 | 14,1 |
| Bastião de Bronze | 71.889 | 17.344 | 23.925 | 36.834 | 27% / 41% | 28.473 | 11.613 | 1.907 | 765 | 12,4 |
| Quebraferro | 72.629 | 24.801 | 37.348 | 31.933 | 38% / 33% | 28.149 | 12.639 | 2.342 | 909 | 14,0 |

Por faixa de nível (média das classes): ouro ganho e gasto por hora, a fatia do ganho que vai para tônicos e para equipamento, e tônicos bebidos por hora.

| Níveis | Ganho/h | Tônicos/h (ouro) | Equipamento/h (ouro) | Fatia tônicos / equip. | Tônicos bebidos/h | Classe que mais gasta em tônicos (fatia) |
|---|---|---|---|---|---|---|
| 1–4 | 1.326 | 191 | 124 | 15% / 9% | 114 | Bastião de Bronze (17%) |
| 5–8 | 2.648 | 1.119 | 641 | 43% / 24% | 191 | Tecelão da Brasa (55%) |
| 9–12 | 5.511 | 1.465 | 1.154 | 27% / 21% | 222 | Tecelão da Brasa (30%) |
| 13–16 | 9.929 | 4.563 | 4.232 | 47% / 43% | 299 | Bastião de Bronze (54%) |
| 17–20 | 13.694 | 3.658 | 4.562 | 27% / 33% | 251 | Quebraferro (42%) |
| 21–24 | 22.811 | 6.462 | 9.578 | 28% / 42% | 339 | Lanceiro do Fosso (35%) |

- O ouro ganho por hora cresce de ~1.326/h (níveis 1–4) para ~22.811/h (21–24); o gasto com tônicos acompanha o dano recebido, não o nível: classes de distância que matam antes do contato compram pouco.
- Preço dos tônicos = 2 × valor (Pequeno de Vida 8, Médio de Vida 24, Pequeno de Mana 10, Médio de Mana 30); peças do armeiro = 2,5 × valor; venda ao comerciante = 0,50 × valor.

## Efeito da prova de classe (habilidade do nível 10)

A rodada principal faz a prova de classe no nível 10 (premissas). Para medir também a caça pura, sem nenhuma missão, as mesmas sementes foram simuladas **sem a prova**: sem a habilidade marcante do nível 10 e sem o tempo da viagem e da luta na arena. Média das classes: **7,26 h com prova** (-6% da meta) e **7,18 h sem prova** (-7%).

| Classe | Habilidade do nível 10 | Horas com prova | Horas sem prova | Diferença | Min nos níveis 10–24 (com / sem) | Mortes (com / sem) |
|---|---|---|---|---|---|---|
| Tecelão da Brasa | Círculo de Fuligem | 6,46 | 7,25 | +12% | 307 / 355 | 4,5 / 8,1 |
| Quebraferro | Ruptura | 7,71 | 7,89 | +2% | 388 / 399 | 7,0 / 6,6 |
| Lanceiro do Fosso | Avanço do Fosso | 7,58 | 7,63 | +1% | 371 / 374 | 6,5 / 7,1 |
| Cantora do Véu | Selo do Véu | 7,29 | 7,12 | -2% | 370 / 360 | 3,9 / 4,1 |
| Vigia do Espinhal | Chuva de Espinhos | 7,05 | 6,82 | -3% | 360 / 346 | 6,8 / 4,5 |
| Andarilha do Vento | Vento a Favor | 6,80 | 6,49 | -5% | 344 / 325 | 5,1 / 5,0 |
| Escudeiro do Alvorecer | Juramento | 7,48 | 7,09 | -5% | 381 / 357 | 2,5 / 3,4 |
| Bastião de Bronze | Reforço de Campo | 7,68 | 7,12 | -7% | 385 / 351 | 3,4 / 3,5 |

| Nível | Meta (min) | Média com prova | Média sem prova |
|---|---|---|---|
| 10 | 15,5 | 18,7 | 17,0 |
| 11 | 17,0 | 14,5 | 14,5 |
| 12 | 18,5 | 14,8 | 15,2 |
| 13 | 20,0 | 20,3 | 20,3 |
| 14 | 21,5 | 18,3 | 18,1 |
| 15 | 23,0 | 21,7 | 21,9 |
| 16 | 24,5 | 24,1 | 24,1 |
| 17 | 26,0 | 27,5 | 26,2 |
| 18 | 27,5 | 21,9 | 21,9 |
| 19 | 29,0 | 25,7 | 24,1 |
| 20 | 30,5 | 27,7 | 28,0 |
| 21 | 32,0 | 29,9 | 30,0 |
| 22 | 33,5 | 29,7 | 29,3 |
| 23 | 35,0 | 32,7 | 33,3 |
| 24 | 36,5 | 35,6 | 34,7 |

Prova: 64 de 64 execuções venceram (1,0 tentativa(s) por execução em média; 32 s de luta na arena). A diferença de tempo inclui a ida à cidade da classe e a volta (2 × as trocas de mapa até lá). Com a habilidade extra o bot gasta mana em mais uma habilidade; ele só usa reforços de defesa caros, escudos e áreas em volta de si quando a luta pede (vários atacantes ou vida baixa), e nunca usa área que acorde monstro parado.

## Equipamento

Peças comuns do kit da faixa (arma + mão secundária + 4 de armadura) compradas no armeiro com ouro, e quantos minutos de jogo depois de chegar ao nível da faixa o kit ficou completo (equipado ou na bolsa à espera de requisito). "Já tinha" conta peças da faixa que o bot já possuía ao chegar (saque ou compra adiantada).

| Classe | Peças compradas | Já tinha ao chegar | Melhorias do chão | Kit 5: atraso (min) | Kit 9: atraso (min) | Kit 13: atraso (min) | Kit 17: atraso (min) | Kit 21: atraso (min) | Exemplos do chão |
|---|---|---|---|---|---|---|---|---|---|
| Tecelão da Brasa | 38,9 | 6,8 | 5,6 | 26 | 35 | 5 | 6 | 0 | `ring_t1`, `amulet_t21`, `robe_circlet_t1`, `robe_t5`, `focus_t17`, `ring_t21`, `robe_t9`, `ring_t9` |
| Andarilha do Vento | 41,1 | 5,6 | 4,9 | 20 | 29 | 3 | 5 | 5 | `amulet_t17`, `amulet_t1`, `light_boots_t9`, `ring_t9`, `ring_t17`, `light_armor_t25`, `light_hood_t13`, `amulet_t13` |
| Vigia do Espinhal | 40,4 | 6,4 | 5,6 | 18 | 21 | 3 | 4 | 5 | `quiver_t9`, `ring_t5`, `quiver_t17`, `amulet_t13`, `ring_t13`, `amulet_t17`, `amulet_second_toll`, `ring_t9` |
| Cantora do Véu | 42,6 | 5,0 | 6,1 | 22 | 28 | 4 | 5 | 3 | `focus_t9`, `amulet_t9`, `ring_t17`, `amulet_t21`, `ring_t21`, `amulet_t25`, `robe_sandals_t5`, `amulet_t13` |
| Escudeiro do Alvorecer | 41,6 | 4,6 | 3,9 | 23 | 33 | 4 | 10 | 5 | `heavy_boots_t5`, `amulet_t5`, `heavy_helm_t13`, `ring_t13`, `amulet_t17`, `sword_1h_t21`, `amulet_t21`, `heavy_boots_t25` |
| Lanceiro do Fosso | 36,0 | 5,3 | 5,1 | 30 | 27 | 3 | 19 | 5 | `ring_t5`, `heavy_helm_t9`, `amulet_t17`, `heavy_armor_t21`, `heavy_armor_t25`, `ring_t1`, `ring_t9`, `heavy_boots_t13` |
| Bastião de Bronze | 39,8 | 5,6 | 6,1 | 25 | 41 | 4 | 12 | 5 | `amulet_t9`, `heavy_helm_t21`, `amulet_t21`, `ring_t21`, `shield_t21`, `amulet_t13`, `shield_t25`, `ring_t25` |
| Quebraferro | 35,6 | 6,4 | 5,5 | 23 | 24 | 3 | 16 | 3 | `ring_t5`, `amulet_t17`, `ring_t17`, `amulet_t21`, `ring_t1`, `heavy_boots_t5`, `heavy_armor_t9`, `amulet_t13` |

## Premissas do modelo

- **Só caça.** Nenhuma missão é feita nem entregue (sem XP, ouro ou itens de missão). Exceção modelada: a **prova de classe no nível 10**, porque é o que libera a habilidade do nível 10. Os pré-requisitos de "Prova de Classe" são marcados como concluídos com o comando de mestre `quest_done` (sem recompensas), a missão é aceita no mestre da classe e a prova é lutada de verdade na arena; a missão não é entregue (o XP de 1.800 não entra).
- **Ações só pelo protocolo:** move, attack, stop, cast, use_item, pickup, equip/unequip, allocate, learn_skill, buy, sell, respawn, quest_accept/trial_start e os comandos de mestre teleport/quest_done. As decisões usam a visão montada pelos snapshots e a ficha devolvida pelo pedido `char` (o bot não lê o estado interno da zona). Reação a cada 200 ms, no máximo uma habilidade por decisão, respeitando a recarga global; habilidades com conjuração só começam com o personagem parado e o bot não age até o fim (`cast_end`). 0,5 s de pausa depois de cada abate antes de escolher o próximo alvo. É um jogador eficiente: um jogador humano tende a ser mais lento (pausas, erros de posicionamento, distração).
- **Viagem entre mapas:** teleporte de mestre até o posto de guarda do mapa (ou ao lado do NPC, na cidade) seguido de 60 s parados por troca de mapa no caminho de portais (busca em largura respeitando o nível mínimo de cada portal). Dentro do mapa o bot anda (move/attack) como um jogador.
- **Área de caça:** grupos de monstros normais com nível em [nível−2, nível+1], preferindo o próprio nível, monstros passivos e grupos agressivos menos densos; elites, chefes e elites diárias ficam de fora (só são enfrentados se atacarem). O alvo é o monstro do grupo com menos vizinhos agressivos a 8,5 m (puxar pela borda). Morte vale 3 pontos de perigo e fuga 1; 3 pontos em 10 min fazem o bot caçar um nível abaixo por 20 min, longe daquela área.
- **Golpes avisados dos monstros:** o bot recebe o mesmo aviso que o cliente desenha (`warn`: círculo, cone ou linha, com a duração) e só o percebe 0,6 s depois, como um jogador que vê o chão marcar e clica; se está dentro (com meio metro de folga), anda até o ponto seguro mais perto fora de todas as áreas marcadas (até no meio de uma conjuração) e espera lá até o golpe sair; se está fora, não anda nem ataca para dentro (o ataque corpo a corpo perseguiria o monstro no meio do círculo). Atordoamento, puxão e efeitos negativos (Desorientado, Atolado, Sanguessuga) valem para ele como para qualquer jogador; o bot não usa a Alvorada nem habilidades para interromper o aviso.
- **Tônicos:** em combate, vida abaixo de 40% — 50% com dois monstros batendo e 65% com três ou mais, quando a recarga de 3 s dos tônicos é o gargalo (com três ou mais bebe o maior tônico que tem; senão, o menor que aproveita bem a cura); fora de combate, vida abaixo de 55% (sem tônico, descansa com `stop` até 92%). Conjuradores (Tecelão, Cantora): mana abaixo de 20% em combate e de 35% fora (sem tônico, descansa até 85%); as classes físicas não param por mana (lutam com o ataque básico). Tônico Médio só a partir do nível 9 (o servidor confere o nível do item). Foge para o posto abaixo de 20% de vida sem tônico; caído, espera 5 s e volta ao posto (`respawn`, 50% de vida).
- **Cidade:** na cidade da classe (Pedrâmbar ou Vau de Nácar), primeiro o armeiro, depois a loja de tônicos. Vai quando restam menos de 5 tônicos e 80% do ouro compra ao menos 40 Pequenos, quando o ouro paga o equipamento que falta (abaixo) ou quando a bolsa enche. Estoque-alvo: 100 tônicos de vida ou 2,5 × o gasto do nível anterior ou do atual (o maior), até 300; de mana, 60 (ou 2,5 × o gasto, até 300) para conjuradores e 10 para os demais. A ida e a volta custam as mesmas trocas de mapa.
- **Equipamento:** ao chegar ao nível 5, 9, 13, 17, 21 ou 25 o bot quer as peças comuns da faixa (arma, mão secundária e 4 de armadura; o Cetro da faixa 17 é raro, então a Cantora usa a Varinha comum nessa faixa) e as **compra no armeiro com ouro** (`buy`, valor × `economy.gearPriceMult`), a arma primeiro, guardando antes o ouro de 60 tônicos de vida (e 40 de mana para conjuradores; essa reserva nunca passa de 60% do ouro). Vai à cidade só por isso quando o ouro, tirada a reserva, paga todas as peças que faltam (no máximo uma ida dessas a cada 10 min). Com o kit completo e ouro além do estoque cheio de tônicos, compra adiantado o kit da próxima faixa (a até 2 níveis dela) e as joias da faixa. Também recolhe do chão as melhorias da própria classe e equipa quando cumpre os requisitos. Sem refino no ferreiro.
- **Venda:** materiais, peças de outras classes e peças substituídas são recolhidos do chão (com mais de 5 espaços livres na bolsa) e vendidos ao comerciante (`sell`, valor × `economy.sellFraction`) a cada visita à cidade; o depósito não é usado.
- **Atributos e habilidades:** Quebraferro e Tecelão seguem os planos de `data/example_builds.json`; as demais classes usam um plano gerado no mesmo espírito (requisitos do kit da próxima faixa espalhados pelos níveis até ela e o resto 2:3 entre o atributo de dano da arma e Vitalidade), conferido nível a nível. Graus de habilidade: um ponto por nível na ordem de prioridade da classe (`server/tools/lib/progressao/planos.mjs`).

## Problemas e observações encontrados no jogo

1. **Equilíbrio entre classes na caça solo:** Tecelão da Brasa chega ao nível 25 em 6,46 h e Quebraferro em 7,71 h (1,2×). Todas as classes ficam a até ±25% da meta total (de -16% a +0%).
2. **Dano por classe:** Tecelão da Brasa 1.849/min (básico 40%, Faísca de Vidro 28%; recebe 421/min); Andarilha do Vento 1.755/min (básico 89%, Arremesso de Retorno 7%; recebe 552/min); Vigia do Espinhal 1.740/min (básico 84%, Flecha de Passagem 6%; recebe 529/min); Cantora do Véu 1.675/min (básico 54%, Nota Clara 46%; recebe 758/min); Lanceiro do Fosso 1.624/min (básico 77%, Estocada Longa 14%; recebe 600/min); Escudeiro do Alvorecer 1.569/min (básico 75%, Corte Solar 17%; recebe 557/min); Quebraferro 1.567/min (básico 78%, Talho Profundo 13%; recebe 646/min); Bastião de Bronze 1.552/min (básico 82%, Pulso de Atração 10%; recebe 513/min). Média: 1.666 de dano causado por minuto.
3. **Ataque básico ainda é quase todo o dano de:** Bastião de Bronze (82%), Vigia do Espinhal (84%), Andarilha do Vento (89%).
4. **Cantora do Véu antes do nível 15:** -4% da meta somando os níveis 1–14; é a classe mais lenta nos níveis 2, 3, 14. Nota Clara (nível 5) faz 46% do dano da rodada inteira; as curas somam 232 de vida por minuto.
5. **Curva de XP:** todos os níveis ficam a até ±25% da meta na média das classes (maior desvio: nível 10, +21%). O total 1→25 fica em -6% da meta. Ritmo médio: 10,1 abates/min no nível 1, 4,9 na média dos níveis.
6. **Onde se morre:** níveis com mais mortes: 10 (1,03 por classe), 24 (0,94 por classe), 9 (0,56 por classe), 11 (0,45 por classe). Monstros que mais derrubam (mortes por execução, somando as classes; um monstro conta em toda morte em que estava batendo): Rato-Engrenagem (nv 10, agressivo) 7,5, Toupeira de Basalto (nv 24, agressivo) 5,7, Autômato Escavador (nv 9, agressivo) 5,4, Sineiro de Bronze (nv 22, agressivo) 4,2, Ecoante (nv 14, agressivo) 3,7. Mortes por classe (média por execução): Tecelão da Brasa 4,5, Andarilha do Vento 5,1, Vigia do Espinhal 6,8, Cantora do Véu 3,9, Escudeiro do Alvorecer 2,5, Lanceiro do Fosso 6,5, Bastião de Bronze 3,4, Quebraferro 7,0 — 5,0 em média. Quase toda queda é numa briga com vários monstros ao mesmo tempo (de 4,1 a 5,0 atacantes, em média, nos 10 s antes de cair; 94% a 100% das mortes com 3 ou mais). Todas as classes entram em brigas com 4 ou mais monstros num ritmo parecido (4,3 a 7,0 por hora: assistência dos iguais a até 8 m, agressão por proximidade e monstros que reaparecem perto); o que muda é quanto cada uma aguenta: mortes por briga dessas de 0,05 (Escudeiro do Alvorecer) a 0,22 (Vigia do Espinhal). Do nível 9 em diante, 42% a 100% das mortes acontecem já sem tônico médio na bolsa (o bot só compra o médio quando o ouro paga 40 e segue caçando com os pequenos quando os médios acabam).
7. **Mecânicas dos monstros:** cada execução vê em média 828 golpes avisados; o bot estava dentro de 794, saiu 774 vezes e esperou fora (sem entrar para atacar) 220 vezes. O que ainda acerta — áreas em que a reação de 0,6 s não bastou e as mecânicas sem aviso — soma de 0,8% a 2,1% do dano recebido; mais dano: Eco (Ecoante, 2.362 por execução), Explosão de Escória (Escória Pressurizada, 782 por execução), Arrasto (Draga Viva, 47 por execução).
8. **Economia:** do ouro ganho (moedas + vendas), os tônicos levam de 23% a 38% (mais: Quebraferro) e o equipamento do armeiro de 33% a 43%; juntos, 64% a 75%. As vendas ao comerciante são 21% do ganho. Saldo ao chegar ao nível 25: 23.080 a 32.277 de ouro (inclui o que sobra para o kit da faixa 25, que o bot só compra adiantado com ouro de sobra).
9. **Equipamento comprado no armeiro:** 39,5 peças por classe em média; o kit comum fica completo, em média, 23 min depois do nível 5, 30 min depois do nível 9, 4 min depois do nível 13, 9 min depois do nível 17, 4 min depois do nível 21 (o atraso é o tempo de juntar o ouro e ir à cidade). Pelo saque chegam 5,4 melhorias por classe.
10. **Conjuração e recarga global:** Vigia do Espinhal conjurou 103 vezes (103 concluídas, 0 interrompidas); Tecelão da Brasa conjurou 170 vezes (168 concluídas, 2 interrompidas). O bot só começa a conjurar parado e não age durante a conjuração; com a recarga global de 1,0 s ele não tenta outra habilidade antes do fim dela.

## Modo acelerado e desempenho da ferramenta

- Laço de `server.step(100)` (100 ms de jogo por chamada) num GameServer sem `start()`: banco SQLite em memória (`--banco-arquivo` usa um arquivo temporário), modo dev, sessões falsas e pedidos síncronos por `server.onMessage`. 464 h de jogo simuladas em 15,5 min de CPU (1.797× o tempo real por linha de execução); 3 linhas de execução (`worker_threads`) em paralelo, 10,8 min de relógio no total.
- Temporizadores do jogo usam `zone.now` (soma dos dt): recargas, conjurações, efeitos, regeneração, tônicos, ataques e reaparecimento funcionam acelerados sem ajuste. `Date.now()` aparece em prazos de relógio de parede (validade do saque de 30 min, dia da elite diária, carimbos do banco, convites e calabouço); dentro da simulação ele segue o tempo simulado, para esses prazos correrem no ritmo do jogo.
- Zonas abertas sem jogador param 30 s depois que o último jogador sai e, quando alguém entra, o relógio da zona é adiantado até o tempo global (o valor que teria sem parar), então monstros mortos reaparecem e recargas levadas entre zonas continuam valendo; instâncias não são tocadas. 87% dos ticks de zona foram pulados. Um passo com só a zona ativa custa ~20–40 µs.
- Snapshots: o bot pede `{ delta: true }` no login. Se o servidor manda diferenças, elas são mescladas como em `mergeSnap` (test/helpers/client.js); se manda o snapshot completo, só o último é decodificado, quando o bot olha o mundo. Nesta rodada o servidor mandou diferenças. A sessão falsa nasce por `server.onConnection` (com um ws falso) e a simulação desliga o limite de comandos por conexão (`rateLimit`), que é medido em tempo real. Mensagens `hit`/`heal` alimentam a contabilidade de dano e `cast_end` encerra a conjuração do bot; as de efeito visual são descartadas sem decodificar.
