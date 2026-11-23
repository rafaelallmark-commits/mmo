<!-- Arquivo gerado por `npm run simular-progressao` (server/tools/simular-progressao.mjs). Rode de novo para atualizar. -->

# Relatório de progressão simulada (Marco 4)

Simulação acelerada, em processo, de caça solo do nível 1 ao 25 para 8 classes, contra as metas de teste de `data/xp_table.json` (`targetMinutesToNext`, ver [docs/04](04-progressao-e-formulas.md)). Cada classe foi jogada por um bot que só caça (sem missões), com 8 sementes (1, 2, 3, 4, 5, 6, 7, 8). Os números abaixo são **médias das sementes**; a meta é considerada atingida quando o tempo fica a até ±25% dela.

Gerado em 2026-11-21 03:55 UTC · tempo real 11,9 min (3 linhas de execução) · 459 h de jogo simuladas.

```
cd server && npm run simular-progressao
```

## Resumo

- Meta só caça do 1 ao 25: **7,7 h**. Média das classes: **7,17 h** (-7%).
- Mais rápida: Tecelão da Brasa (6,51 h); mais lenta: Quebraferro (7,75 h) — razão 1,2×.
- Níveis em que a média das classes sai da faixa de ±25%: nenhum.
- Viagens (troca de mapa a 60 s cada: ir às novas áreas, à loja, ao armeiro e à prova) são 21% do tempo. Recuperação fora de combate (tônico ou descanso) fica em 2–14% para todas as classes, porque os bots compram e bebem tônicos em vez de esperar a regeneração (1,5% da vida por segundo).

| Classe | Horas 1→25 (média) | Mín–máx | Desvio da meta | Abates | Mortes | Fugas | Tônicos V/M | Ouro ganho/h | Gasto/h (tônicos + equip.) | Prova |
|---|---|---|---|---|---|---|---|---|---|---|
| Tecelão da Brasa | 6,51 | 6,19–6,96 | -15% | 2.039 | 4,0 | 0,0 | 911 / 1.004 | 13.964 | 8.229 (3.739 + 4.490) | 8/8 |
| Andarilha do Vento | 6,68 | 6,40–7,05 | -13% | 2.056 | 4,6 | 2,6 | 1.680 / 258 | 14.147 | 9.714 (4.053 + 5.661) | 8/8 |
| Vigia do Espinhal | 6,79 | 6,52–7,03 | -12% | 2.036 | 3,8 | 1,5 | 1.621 / 283 | 13.708 | 8.674 (3.480 + 5.195) | 8/8 |
| Cantora do Véu | 7,29 | 7,06–7,62 | -5% | 2.044 | 3,9 | 0,3 | 635 / 792 | 11.832 | 8.157 (2.631 + 5.525) | 8/8 |
| Escudeiro do Alvorecer | 7,34 | 6,81–7,79 | -5% | 2.056 | 3,0 | 7,1 | 1.659 / 258 | 12.564 | 9.183 (3.797 + 5.386) | 8/8 |
| Lanceiro do Fosso | 7,37 | 7,03–7,74 | -4% | 2.101 | 6,4 | 10,3 | 1.875 / 265 | 13.243 | 9.462 (4.520 + 4.943) | 8/8 |
| Bastião de Bronze | 7,59 | 7,44–7,78 | -2% | 2.065 | 3,3 | 7,6 | 1.595 / 255 | 11.791 | 7.978 (2.916 + 5.062) | 8/8 |
| Quebraferro | 7,75 | 7,13–8,45 | +1% | 2.119 | 7,1 | 10,3 | 2.061 / 263 | 12.655 | 9.174 (4.817 + 4.357) | 8/8 |

### Para onde vai o tempo

Fatia do tempo total de cada classe. Viagens: trocas de mapa a 60 s cada, com a quantidade média por motivo (caça inclui trocar de área por perigo).

| Classe | Combate | Deslocamento e saque | Recuperação | Viagens | Trocas de mapa: caça / tônicos e venda / equipamento / prova | Cidade e prova | Caído e fugindo |
|---|---|---|---|---|---|---|---|
| Tecelão da Brasa | 57% | 6% | 14% | 24% | 50 / 27 / 13 / 2 | 0% | 0% |
| Andarilha do Vento | 70% | 6% | 2% | 22% | 47 / 22 / 17 / 3 | 0% | 0% |
| Vigia do Espinhal | 71% | 6% | 2% | 20% | 43 / 19 / 16 / 3 | 0% | 0% |
| Cantora do Véu | 72% | 5% | 4% | 19% | 44 / 18 / 18 / 3 | 0% | 0% |
| Escudeiro do Alvorecer | 72% | 5% | 2% | 20% | 48 / 25 / 14 / 3 | 0% | 0% |
| Lanceiro do Fosso | 67% | 5% | 5% | 22% | 52 / 28 / 15 / 2 | 0% | 0% |
| Bastião de Bronze | 74% | 5% | 3% | 18% | 45 / 18 / 18 / 2 | 0% | 0% |
| Quebraferro | 68% | 5% | 4% | 22% | 56 / 32 / 14 / 2 | 0% | 0% |

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
| 7 | 11,0 | 11,3 | +3% | ok | 1/8 | Vigia do Espinhal 8,7 | Lanceiro do Fosso 16,2 | 3,2 | 0,03 |
| 8 | 12,5 | 11,3 | -10% | ok | 1/8 | Vigia do Espinhal 8,1 | Tecelão da Brasa 13,5 | 4,0 | 0,02 |
| 9 | 14,0 | 15,8 | +13% | ok | 1/8 | Cantora do Véu 11,8 | Lanceiro do Fosso 18,6 | 3,2 | 0,58 |
| 10 | 15,5 | 18,6 | +20% | ok | 3/8 | Vigia do Espinhal 16,5 | Escudeiro do Alvorecer 20,5 | 3,2 | 0,94 |
| 11 | 17,0 | 14,0 | -18% | ok | 1/8 | Vigia do Espinhal 12,2 | Bastião de Bronze 17,7 | 4,3 | 0,20 |
| 12 | 18,5 | 15,0 | -19% | ok | 2/8 | Cantora do Véu 12,8 | Bastião de Bronze 18,5 | 5,3 | 0,00 |
| 13 | 20,0 | 20,4 | +2% | ok | 0/8 | Andarilha do Vento 19,0 | Bastião de Bronze 22,7 | 4,2 | 0,00 |
| 14 | 21,5 | 18,1 | -16% | ok | 2/8 | Andarilha do Vento 14,7 | Cantora do Véu 24,6 | 5,7 | 0,33 |
| 15 | 23,0 | 21,1 | -8% | ok | 1/8 | Tecelão da Brasa 12,9 | Bastião de Bronze 25,2 | 5,7 | 0,44 |
| 16 | 24,5 | 23,5 | -4% | ok | 1/8 | Tecelão da Brasa 12,9 | Quebraferro 30,5 | 5,2 | 0,41 |
| 17 | 26,0 | 26,9 | +4% | ok | 1/8 | Tecelão da Brasa 22,4 | Quebraferro 33,5 | 4,4 | 0,06 |
| 18 | 27,5 | 21,2 | -23% | ok | 4/8 | Tecelão da Brasa 15,1 | Quebraferro 26,2 | 5,8 | 0,10 |
| 19 | 29,0 | 24,5 | -16% | ok | 0/8 | Andarilha do Vento 22,5 | Escudeiro do Alvorecer 28,2 | 5,8 | 0,00 |
| 20 | 30,5 | 27,5 | -10% | ok | 0/8 | Lanceiro do Fosso 24,5 | Bastião de Bronze 29,8 | 4,5 | 0,00 |
| 21 | 32,0 | 30,2 | -6% | ok | 1/8 | Tecelão da Brasa 21,6 | Cantora do Véu 34,6 | 5,1 | 0,00 |
| 22 | 33,5 | 29,3 | -13% | ok | 0/8 | Andarilha do Vento 26,4 | Tecelão da Brasa 37,2 | 5,9 | 0,36 |
| 23 | 35,0 | 33,3 | -5% | ok | 1/8 | Tecelão da Brasa 21,0 | Cantora do Véu 39,0 | 5,2 | 0,24 |
| 24 | 36,5 | 34,1 | -7% | ok | 0/8 | Tecelão da Brasa 28,9 | Quebraferro 38,5 | 5,3 | 0,78 |

### Minutos por nível e classe

| Nível | Meta | Tecelão da Brasa | Andarilha do Vento | Vigia do Espinhal | Cantora do Véu | Escudeiro do Alvorecer | Lanceiro do Fosso | Quebraferro | Bastião de Bronze |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 2,0 | 2,4 | **1,3** | **1,4** | 2,1 | **1,4** | **1,5** | 1,6 | 1,5 |
| 2 | 3,5 | **4,7** | 3,8 | 3,9 | **4,8** | 3,8 | 4,0 | 4,3 | 3,8 |
| 3 | 5,0 | 5,2 | 3,8 | 4,2 | **6,5** | 3,9 | 5,2 | 4,8 | 4,0 |
| 4 | 6,5 | 5,9 | **3,9** | **4,0** | 6,5 | 5,2 | 7,2 | **8,7** | 5,7 |
| 5 | 8,0 | 9,2 | 6,2 | **5,9** | 6,9 | 6,3 | 9,3 | 8,6 | 7,7 |
| 6 | 9,5 | 11,6 | 9,9 | 10,2 | 9,7 | 9,3 | 9,9 | 9,2 | 10,6 |
| 7 | 11,0 | 11,4 | 9,8 | 8,7 | 9,8 | 12,0 | **16,2** | 10,8 | 11,9 |
| 8 | 12,5 | 13,5 | 9,5 | **8,1** | 9,5 | 10,7 | 13,1 | 12,3 | 13,4 |
| 9 | 14,0 | 16,3 | 15,9 | 17,0 | 11,8 | 15,6 | **18,6** | 16,1 | 15,5 |
| 10 | 15,5 | 17,0 | 18,3 | 16,5 | 18,5 | **20,5** | 18,6 | **19,9** | **19,4** |
| 11 | 17,0 | 13,3 | 13,6 | **12,2** | 13,8 | 13,8 | 13,0 | 17,7 | 14,6 |
| 12 | 18,5 | 16,4 | **13,0** | 15,4 | **12,8** | 14,8 | 14,8 | 18,5 | 14,6 |
| 13 | 20,0 | 21,5 | 19,0 | 20,3 | 20,5 | 20,5 | 19,2 | 22,7 | 19,3 |
| 14 | 21,5 | 18,7 | **14,7** | **15,3** | 24,6 | 16,6 | 17,9 | 18,7 | 18,4 |
| 15 | 23,0 | **12,9** | 22,9 | 22,8 | 18,0 | 24,4 | 19,9 | 25,2 | 22,6 |
| 16 | 24,5 | **12,9** | 22,4 | 24,4 | 19,7 | 24,1 | 28,5 | 25,4 | 30,5 |
| 17 | 26,0 | 22,4 | 25,8 | 26,1 | 27,0 | 28,1 | 23,3 | 29,2 | **33,5** |
| 18 | 27,5 | **15,1** | **19,0** | **20,1** | 21,1 | **20,4** | 25,3 | 22,0 | 26,2 |
| 19 | 29,0 | 23,8 | 22,5 | 23,1 | 24,6 | 28,2 | 23,8 | 23,1 | 26,9 |
| 20 | 30,5 | 27,9 | 25,8 | 25,6 | 29,7 | 27,8 | 24,5 | 29,8 | 29,3 |
| 21 | 32,0 | **21,6** | 29,3 | 31,0 | 34,6 | 30,4 | 31,3 | 33,4 | 30,4 |
| 22 | 33,5 | 37,2 | 26,4 | 28,2 | 27,9 | 28,3 | 29,7 | 26,7 | 30,3 |
| 23 | 35,0 | **21,0** | 30,5 | 32,4 | 39,0 | 37,6 | 31,9 | 37,5 | 36,5 |
| 24 | 36,5 | 28,9 | 33,8 | 31,0 | 38,3 | 37,0 | 35,5 | 29,4 | 38,5 |

Negrito: fora de ±25% da meta.

## Mecânicas dos monstros

Golpes avisados no chão (o bot percebe o aviso 0,6 s depois, como um jogador, clica no ponto seguro mais perto e espera fora até o golpe sair; fora da área, não anda nem ataca para dentro dela) e as mecânicas sem aviso (eco do Ecoante, sanguessuga, enxame, garras de pedra, território). Números por execução (média das sementes).

| Classe | Avisos vistos | Estava dentro | Esquivas | Esperas fora | Golpes de mecânica levados | Dano de mecânica (fatia do recebido) | Efeitos negativos recebidos |
|---|---|---|---|---|---|---|---|
| Tecelão da Brasa | 655 | 609 | 653 | 16 | 129 | 1.471 (0,9%) | Sanguessuga 3 |
| Andarilha do Vento | 766 | 709 | 696 | 13 | 202 | 3.250 (1,5%) | Sanguessuga 5 |
| Vigia do Espinhal | 799 | 744 | 761 | 25 | 173 | 2.784 (1,3%) | Atordoado 1 |
| Cantora do Véu | 879 | 839 | 795 | 15 | 220 | 2.349 (0,7%) | Sanguessuga 32 |
| Escudeiro do Alvorecer | 807 | 792 | 800 | 598 | 255 | 3.140 (1,3%) | Sanguessuga 6, Atolado 2 |
| Lanceiro do Fosso | 708 | 691 | 719 | 319 | 149 | 2.680 (1,0%) | Sanguessuga 20, Atolado 1 |
| Bastião de Bronze | 908 | 897 | 905 | 646 | 204 | 2.651 (1,2%) | Sanguessuga 17, Atolado 1 |
| Quebraferro | 777 | 752 | 756 | 533 | 181 | 2.559 (0,9%) | Sanguessuga 12, Atolado 1 |

Golpes de mecânica levados por execução, média das classes:

| Mecânica | Monstro (nível) | Golpes levados | Dano |
|---|---|---|---|
| Eco | Ecoante (14) | 186,0 | 2.482 |
| Explosão de Escória | Escória Pressurizada (18) | 2,0 | 105 |
| Arrasto | Draga Viva (17) | 0,7 | 12 |
| Fio Condutor | Aranha de Conduto (16) | 0,3 | 7 |
| Estouro de Vapor | Sapo-Bomba (5) | 0,2 | 3 |
| Corrida no Trilho | Lâmina de Esteira (12) | 0,1 | 2 |
| Cone de Faíscas | Soldador Cego (11) | 0,0 | 0 |

## Detalhe por classe

### Tecelão da Brasa (`emberweaver`)

6,51 h do 1 ao 25 (-15% da meta; 8/8 execuções concluídas). Plano de atributos: example_builds.json (emberweaver_magic). Tempo: combate 57%, deslocamento e saque 6%, recuperação 14%, viagens 24%, cidade e prova 0%, caído/fugindo 0%. Dano por fonte: ataque básico 39%, Faísca de Vidro 28%, Chão em Brasa 14%, Círculo de Fuligem 10%, Coração da Fornalha 6%; acerto 100%; 1.835 de dano causado e 406 recebido por minuto.

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
| 10 | 17,0 | 15,5 | +10% | 54 | 3,2 | 0,8 | 0,0 | 34 / 41 | 1.156 | 573 / 493 | 8.249 | Rato-Engrenagem (10) |
| 11 | 13,3 | 17,0 | -22% | 58 | 4,4 | 0,0 | 0,0 | 29 / 47 | 1.756 | 630 / 304 | 10.278 | Soldador Cego (11) |
| 12 | 16,4 | 18,5 | -12% | 79 | 4,8 | 0,0 | 0,0 | 21 / 47 | 2.252 | 280 / 109 | 12.664 | Lâmina de Esteira (12) |
| 13 | 21,5 | 20,0 | +7% | 86 | 4,0 | 0,0 | 0,0 | 36 / 58 | 3.172 | 782 / 3.063 | 15.301 | Larva Térmica (13) |
| 14 | 18,7 | 21,5 | -13% | 99 | 5,3 | 0,0 | 0,0 | 44 / 63 | 3.754 | 2.981 / 564 | 18.283 | Ecoante (14) |
| 15 | **12,9** | 23,0 | -44% | 105 | 8,1 | 0,0 | 0,0 | 38 / 50 | 3.323 | 671 / 0 | 21.510 | Guardião de Galeria (15) |
| 16 | **12,9** | 24,5 | -47% | 109 | 8,4 | 0,0 | 0,0 | 61 / 47 | 3.302 | 694 / 496 | 25.165 | Aranha de Conduto (16) |
| 17 | 22,4 | 26,0 | -14% | 114 | 5,1 | 0,0 | 0,0 | 28 / 48 | 6.165 | 2.954 / 6.017 | 29.074 | Draga Viva (17) |
| 18 | **15,1** | 27,5 | -45% | 119 | 7,8 | 0,0 | 0,0 | 37 / 53 | 4.226 | 0 / 0 | 33.395 | Escória Pressurizada (18) |
| 19 | 23,8 | 29,0 | -18% | 142 | 5,9 | 0,0 | 0,0 | 42 / 58 | 6.573 | 1.965 / 4.570 | 38.097 | Escória Pressurizada (18) |
| 20 | 27,9 | 30,5 | -9% | 123 | 4,4 | 0,0 | 0,0 | 46 / 71 | 8.570 | 2.243 / 5.209 | 42.947 | Salamandra de Cisterna (21) |
| 21 | **21,6** | 32,0 | -33% | 153 | 7,1 | 0,0 | 0,0 | 47 / 76 | 8.229 | 0 / 0 | 48.461 | Salamandra de Cisterna (21) |
| 22 | 37,2 | 33,5 | +11% | 170 | 4,6 | 0,6 | 0,0 | 85 / 73 | 13.901 | 4.881 / 3.169 | 54.038 | Sineiro de Bronze (22) |
| 23 | **21,0** | 35,0 | -40% | 168 | 8,0 | 0,3 | 0,0 | 118 / 86 | 9.581 | 1.157 / 1.781 | 60.304 | Voz Soterrada (23) |
| 24 | 28,9 | 36,5 | -21% | 194 | 6,7 | 1,4 | 0,0 | 131 / 94 | 11.849 | 2.907 / 2.694 | 66.781 | Toupeira de Basalto (24) |

### Andarilha do Vento (`windwalker`)

6,68 h do 1 ao 25 (-13% da meta; 8/8 execuções concluídas). Plano de atributos: gerado (requisitos das faixas + Agilidade/Vitalidade 2:3). Tempo: combate 70%, deslocamento e saque 6%, recuperação 2%, viagens 22%, cidade e prova 0%, caído/fugindo 0%. Dano por fonte: ataque básico 89%, Arremesso de Retorno 7%, Rajada Cortante 2%, Olho do Furacão 2%; acerto 96%; 1.777 de dano causado e 553 recebido por minuto.

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
| 10 | 18,3 | 15,5 | +18% | 58 | 3,2 | 0,9 | 0,0 | 70 / 9 | 1.169 | 257 / 688 | 8.260 | Rato-Engrenagem (10) |
| 11 | 13,6 | 17,0 | -20% | 59 | 4,4 | 0,3 | 0,1 | 54 / 7 | 1.725 | 439 / 235 | 10.336 | Soldador Cego (11) |
| 12 | **13,0** | 18,5 | -30% | 79 | 6,1 | 0,0 | 0,0 | 21 / 9 | 2.263 | 0 / 0 | 12.643 | Lâmina de Esteira (12) |
| 13 | 19,0 | 20,0 | -5% | 85 | 4,5 | 0,0 | 0,0 | 20 / 14 | 3.233 | 627 / 3.721 | 15.260 | Larva Térmica (13) |
| 14 | **14,7** | 21,5 | -32% | 100 | 6,8 | 0,1 | 0,0 | 80 / 12 | 2.890 | 0 / 0 | 18.283 | Ecoante (14) |
| 15 | 22,9 | 23,0 | -0% | 117 | 5,1 | 0,8 | 0,1 | 99 / 14 | 4.551 | 2.913 / 2.167 | 21.539 | Guardião de Galeria (15) |
| 16 | 22,4 | 24,5 | -9% | 120 | 5,4 | 0,4 | 0,1 | 149 / 13 | 3.902 | 1.757 / 1.612 | 25.159 | Aranha de Conduto (16) |
| 17 | 25,8 | 26,0 | -1% | 115 | 4,5 | 0,0 | 0,0 | 67 / 14 | 5.519 | 3.937 / 2.405 | 29.122 | Draga Viva (17) |
| 18 | **19,0** | 27,5 | -31% | 119 | 6,2 | 0,0 | 0,0 | 108 / 13 | 4.185 | 0 / 0 | 33.410 | Escória Pressurizada (18) |
| 19 | 22,5 | 29,0 | -22% | 141 | 6,3 | 0,0 | 0,0 | 106 / 17 | 5.607 | 515 / 1.191 | 37.996 | Escória Pressurizada (18) |
| 20 | 25,8 | 30,5 | -15% | 124 | 4,8 | 0,0 | 0,0 | 68 / 14 | 7.107 | 692 / 529 | 43.097 | Salamandra de Cisterna (21) |
| 21 | 29,3 | 32,0 | -8% | 152 | 5,2 | 0,0 | 0,0 | 59 / 22 | 11.787 | 2.472 / 9.194 | 48.303 | Salamandra de Cisterna (21) |
| 22 | 26,4 | 33,5 | -21% | 171 | 6,5 | 0,6 | 0,0 | 171 / 19 | 10.761 | 1.822 / 0 | 54.155 | Sineiro de Bronze (22) |
| 23 | 30,5 | 35,0 | -13% | 172 | 5,6 | 0,3 | 0,5 | 179 / 27 | 13.470 | 4.625 / 9.088 | 60.251 | Voz Soterrada (23) |
| 24 | 33,8 | 36,5 | -7% | 175 | 5,2 | 0,9 | 0,5 | 225 / 23 | 13.445 | 5.537 / 6.164 | 66.768 | Toupeira de Basalto (24) |

### Vigia do Espinhal (`warden`)

6,79 h do 1 ao 25 (-12% da meta; 8/8 execuções concluídas). Plano de atributos: gerado (requisitos das faixas + Agilidade/Vitalidade 2:3). Tempo: combate 71%, deslocamento e saque 6%, recuperação 2%, viagens 20%, cidade e prova 0%, caído/fugindo 0%. Dano por fonte: ataque básico 84%, Flecha de Passagem 6%, Tiro do Espinhal 5%, Chuva de Espinhos 5%; acerto 98%; 1.772 de dano causado e 536 recebido por minuto.

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
| 10 | 16,5 | 15,5 | +6% | 53 | 3,2 | 0,5 | 0,0 | 55 / 11 | 1.213 | 340 / 733 | 8.257 | Rato-Engrenagem (10) |
| 11 | **12,2** | 17,0 | -28% | 59 | 4,9 | 0,5 | 0,0 | 63 / 9 | 1.644 | 630 / 0 | 10.311 | Soldador Cego (11) |
| 12 | 15,4 | 18,5 | -17% | 79 | 5,1 | 0,0 | 0,0 | 23 / 10 | 2.309 | 708 / 0 | 12.641 | Lâmina de Esteira (12) |
| 13 | 20,3 | 20,0 | +2% | 86 | 4,2 | 0,0 | 0,0 | 26 / 15 | 2.894 | 753 / 3.131 | 15.305 | Larva Térmica (13) |
| 14 | **15,3** | 21,5 | -29% | 99 | 6,5 | 0,0 | 0,0 | 83 / 14 | 2.915 | 0 / 0 | 18.282 | Ecoante (14) |
| 15 | 22,8 | 23,0 | -1% | 106 | 4,7 | 0,1 | 0,3 | 96 / 15 | 4.451 | 2.793 / 2.677 | 21.507 | Guardião de Galeria (15) |
| 16 | 24,4 | 24,5 | -0% | 112 | 4,6 | 0,4 | 0,4 | 165 / 12 | 4.268 | 2.264 / 2.383 | 25.142 | Aranha de Conduto (16) |
| 17 | 26,1 | 26,0 | +1% | 116 | 4,4 | 0,0 | 0,0 | 65 / 14 | 5.159 | 2.733 / 887 | 29.134 | Draga Viva (17) |
| 18 | **20,1** | 27,5 | -27% | 118 | 5,9 | 0,0 | 0,0 | 95 / 15 | 4.222 | 0 / 0 | 33.414 | Escória Pressurizada (18) |
| 19 | 23,1 | 29,0 | -20% | 141 | 6,1 | 0,0 | 0,0 | 100 / 18 | 5.102 | 0 / 0 | 37.996 | Escória Pressurizada (18) |
| 20 | 25,6 | 30,5 | -16% | 123 | 4,8 | 0,0 | 0,0 | 62 / 17 | 7.097 | 437 / 978 | 43.004 | Salamandra de Cisterna (21) |
| 21 | 31,0 | 32,0 | -3% | 153 | 4,9 | 0,0 | 0,0 | 62 / 26 | 12.260 | 2.827 / 10.371 | 48.382 | Salamandra de Cisterna (21) |
| 22 | 28,2 | 33,5 | -16% | 172 | 6,1 | 0,5 | 0,0 | 155 / 19 | 10.417 | 1.811 / 0 | 54.110 | Sineiro de Bronze (22) |
| 23 | 32,4 | 35,0 | -8% | 168 | 5,2 | 0,3 | 0,3 | 187 / 28 | 13.941 | 5.411 / 11.488 | 60.208 | Voz Soterrada (23) |
| 24 | 31,0 | 36,5 | -15% | 190 | 6,1 | 1,1 | 0,3 | 206 / 27 | 12.205 | 1.853 / 1.656 | 66.932 | Voz Soterrada (23) |

### Cantora do Véu (`veilsinger`)

7,29 h do 1 ao 25 (-5% da meta; 8/8 execuções concluídas). Plano de atributos: gerado (requisitos das faixas + Espírito/Vitalidade 2:3). Tempo: combate 72%, deslocamento e saque 5%, recuperação 4%, viagens 19%, cidade e prova 0%, caído/fugindo 0%. Dano por fonte: ataque básico 54%, Nota Clara 46%; acerto 100%; 1.653 de dano causado e 755 recebido por minuto; 231 de cura por minuto.

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
| 10 | 18,5 | 15,5 | +19% | 61 | 3,3 | 1,3 | 0,0 | 25 / 36 | 1.162 | 550 / 686 | 8.218 | Rato-Engrenagem (10) |
| 11 | 13,8 | 17,0 | -19% | 61 | 4,4 | 0,3 | 0,0 | 10 / 29 | 1.687 | 448 / 398 | 10.344 | Soldador Cego (11) |
| 12 | **12,8** | 18,5 | -31% | 79 | 6,2 | 0,0 | 0,0 | 1 / 28 | 2.214 | 0 / 0 | 12.633 | Lâmina de Esteira (12) |
| 13 | 20,5 | 20,0 | +3% | 86 | 4,2 | 0,0 | 0,0 | 0 / 45 | 3.262 | 435 / 3.459 | 15.349 | Larva Térmica (13) |
| 14 | 24,6 | 21,5 | +15% | 99 | 4,0 | 0,3 | 0,0 | 46 / 57 | 3.708 | 3.221 / 735 | 18.257 | Ecoante (14) |
| 15 | 18,0 | 23,0 | -22% | 108 | 6,0 | 0,0 | 0,0 | 33 / 40 | 3.198 | 589 / 549 | 21.509 | Guardião de Galeria (15) |
| 16 | 19,7 | 24,5 | -20% | 109 | 5,5 | 0,0 | 0,0 | 83 / 49 | 3.087 | 0 / 0 | 25.105 | Aranha de Conduto (16) |
| 17 | 27,0 | 26,0 | +4% | 116 | 4,3 | 0,0 | 0,0 | 20 / 37 | 5.651 | 2.585 / 6.496 | 29.174 | Draga Viva (17) |
| 18 | 21,1 | 27,5 | -23% | 119 | 5,6 | 0,0 | 0,0 | 26 / 61 | 4.601 | 769 / 400 | 33.397 | Escória Pressurizada (18) |
| 19 | 24,6 | 29,0 | -15% | 141 | 5,7 | 0,0 | 0,0 | 25 / 53 | 5.543 | 881 / 609 | 38.030 | Escória Pressurizada (18) |
| 20 | 29,7 | 30,5 | -3% | 124 | 4,2 | 0,0 | 0,0 | 0 / 33 | 7.005 | 600 / 1.181 | 43.040 | Salamandra de Cisterna (21) |
| 21 | 34,6 | 32,0 | +8% | 153 | 4,4 | 0,0 | 0,0 | 0 / 44 | 11.088 | 1.118 / 10.912 | 48.422 | Salamandra de Cisterna (21) |
| 22 | 27,9 | 33,5 | -17% | 170 | 6,1 | 0,4 | 0,0 | 65 / 58 | 8.804 | 0 / 0 | 54.010 | Sineiro de Bronze (22) |
| 23 | 39,0 | 35,0 | +12% | 174 | 4,5 | 0,5 | 0,0 | 102 / 71 | 11.853 | 3.845 / 11.310 | 60.248 | Voz Soterrada (23) |
| 24 | 38,3 | 36,5 | +5% | 182 | 4,8 | 1,0 | 0,0 | 139 / 79 | 10.660 | 2.999 / 2.892 | 66.820 | Voz Soterrada (23) |

### Escudeiro do Alvorecer (`dawnshield`)

7,34 h do 1 ao 25 (-5% da meta; 8/8 execuções concluídas). Plano de atributos: gerado (requisitos das faixas + Força/Vitalidade 2:3). Tempo: combate 72%, deslocamento e saque 5%, recuperação 2%, viagens 20%, cidade e prova 0%, caído/fugindo 0%. Dano por fonte: ataque básico 75%, Corte Solar 17%, Lâmina do Meio-Dia 5%, dano sagrado extra 4%; acerto 80%; 1.603 de dano causado e 555 recebido por minuto; 6 de cura por minuto.

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
| 10 | **20,5** | 15,5 | +32% | 60 | 2,9 | 0,8 | 0,0 | 61 / 7 | 1.216 | 436 / 859 | 8.305 | Rato-Engrenagem (10) |
| 11 | 13,8 | 17,0 | -19% | 59 | 4,3 | 0,3 | 0,3 | 60 / 6 | 1.651 | 259 / 286 | 10.282 | Soldador Cego (11) |
| 12 | 14,8 | 18,5 | -20% | 79 | 5,3 | 0,0 | 0,0 | 25 / 9 | 2.200 | 0 / 0 | 12.625 | Lâmina de Esteira (12) |
| 13 | 20,5 | 20,0 | +3% | 86 | 4,2 | 0,0 | 0,0 | 19 / 15 | 3.298 | 1.224 / 3.023 | 15.305 | Larva Térmica (13) |
| 14 | 16,6 | 21,5 | -23% | 100 | 6,0 | 0,4 | 0,0 | 100 / 8 | 1.911 | 0 / 0 | 18.285 | Ecoante (14) |
| 15 | 24,4 | 23,0 | +6% | 121 | 5,0 | 0,8 | 0,8 | 93 / 11 | 3.861 | 2.826 / 1.476 | 21.487 | Guardião de Galeria (15) |
| 16 | 24,1 | 24,5 | -2% | 120 | 5,0 | 0,4 | 0,5 | 111 / 18 | 4.509 | 1.478 / 2.572 | 25.170 | Aranha de Conduto (16) |
| 17 | 28,1 | 26,0 | +8% | 116 | 4,1 | 0,0 | 0,0 | 74 / 15 | 5.124 | 1.992 / 2.259 | 29.126 | Draga Viva (17) |
| 18 | **20,4** | 27,5 | -26% | 119 | 5,8 | 0,0 | 0,0 | 97 / 13 | 4.141 | 0 / 0 | 33.427 | Escória Pressurizada (18) |
| 19 | 28,2 | 29,0 | -3% | 141 | 5,0 | 0,0 | 0,0 | 104 / 16 | 6.610 | 2.699 / 4.560 | 38.030 | Escória Pressurizada (18) |
| 20 | 27,8 | 30,5 | -9% | 124 | 4,5 | 0,0 | 0,0 | 78 / 18 | 7.390 | 863 / 1.410 | 42.996 | Salamandra de Cisterna (21) |
| 21 | 30,4 | 32,0 | -5% | 153 | 5,0 | 0,0 | 0,0 | 66 / 21 | 11.075 | 1.916 / 6.030 | 48.382 | Salamandra de Cisterna (21) |
| 22 | 28,3 | 33,5 | -16% | 167 | 5,9 | 0,0 | 0,1 | 157 / 22 | 9.556 | 926 / 406 | 54.059 | Sineiro de Bronze (22) |
| 23 | 37,6 | 35,0 | +7% | 165 | 4,4 | 0,0 | 0,6 | 178 / 28 | 14.096 | 6.459 / 14.001 | 60.331 | Voz Soterrada (23) |
| 24 | 37,0 | 36,5 | +1% | 165 | 4,5 | 0,0 | 0,9 | 242 / 26 | 12.895 | 5.512 / 1.971 | 66.794 | Toupeira de Basalto (24) |

### Lanceiro do Fosso (`pikeman`)

7,37 h do 1 ao 25 (-4% da meta; 8/8 execuções concluídas). Plano de atributos: gerado (requisitos das faixas + Força/Vitalidade 2:3). Tempo: combate 67%, deslocamento e saque 5%, recuperação 5%, viagens 22%, cidade e prova 0%, caído/fugindo 0%. Dano por fonte: ataque básico 77%, Estocada Longa 14%, Avanço do Fosso 4%, Muralha de Piques 3%, Linha Partida 3%; acerto 85%; 1.662 de dano causado e 592 recebido por minuto.

| Nível | Min | Meta | Desvio | Abates | Abates/min | Mortes | Fugas | Tônicos V/M | Ouro ganho (moedas + vendas) | Gasto: tônicos / equip. | XP de abates | Monstro principal |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **1,5** | 2,0 | -25% | 16 | 10,7 | 0,0 | 0,0 | 0 / 0 | 61 | 0 / 0 | 80 | Rato de Sulco (1) |
| 2 | 4,0 | 3,5 | +14% | 16 | 4,0 | 0,0 | 0,0 | 1 / 0 | 80 | 53 / 33 | 256 | Besouro-Brasa (2) |
| 3 | 5,2 | 5,0 | +4% | 31 | 5,9 | 0,0 | 1,0 | 19 / 2 | 63 | 0 / 0 | 573 | Cão de Ferrugem (3) |
| 4 | 7,2 | 6,5 | +10% | 34 | 4,7 | 0,0 | 0,9 | 9 / 2 | 143 | 0 / 0 | 1.039 | Cão de Ferrugem (3) |
| 5 | 9,3 | 8,0 | +16% | 30 | 3,3 | 0,0 | 0,3 | 12 / 4 | 118 | 58 / 42 | 1.699 | Sapo-Bomba (5) |
| 6 | 9,9 | 9,5 | +4% | 31 | 3,2 | 0,1 | 1,4 | 39 / 2 | 266 | 160 / 121 | 2.542 | Enguia de Lodo (6) |
| 7 | **16,2** | 11,0 | +47% | 35 | 2,2 | 0,3 | 2,4 | 44 / 2 | 441 | 345 / 207 | 3.593 | Válvula Errante (7) |
| 8 | 13,1 | 12,5 | +5% | 49 | 3,7 | 0,0 | 1,0 | 36 / 5 | 690 | 246 / 0 | 4.905 | Garça de Ferrugem (8) |
| 9 | **18,6** | 14,0 | +33% | 58 | 3,1 | 1,0 | 0,1 | 45 / 7 | 957 | 260 / 194 | 6.430 | Garça de Ferrugem (8) |
| 10 | 18,6 | 15,5 | +20% | 64 | 3,4 | 1,1 | 0,0 | 58 / 10 | 1.245 | 615 / 785 | 8.239 | Garça de Ferrugem (8) |
| 11 | 13,0 | 17,0 | -24% | 59 | 4,6 | 0,3 | 0,0 | 65 / 6 | 1.587 | 81 / 81 | 10.346 | Soldador Cego (11) |
| 12 | 14,8 | 18,5 | -20% | 80 | 5,4 | 0,0 | 0,0 | 34 / 12 | 2.233 | 0 / 0 | 12.629 | Lâmina de Esteira (12) |
| 13 | 19,2 | 20,0 | -4% | 86 | 4,5 | 0,0 | 0,0 | 28 / 15 | 3.297 | 1.462 / 3.472 | 15.305 | Larva Térmica (13) |
| 14 | 17,9 | 21,5 | -17% | 101 | 5,7 | 0,9 | 0,1 | 103 / 10 | 2.864 | 1.197 / 0 | 18.226 | Ecoante (14) |
| 15 | 19,9 | 23,0 | -13% | 128 | 6,4 | 0,8 | 0,0 | 85 / 15 | 3.508 | 0 / 0 | 21.516 | Larva Térmica (13) |
| 16 | 28,5 | 24,5 | +16% | 122 | 4,3 | 0,8 | 1,1 | 137 / 14 | 4.905 | 3.749 / 3.956 | 25.191 | Guardião de Galeria (15) |
| 17 | 23,3 | 26,0 | -10% | 116 | 5,0 | 0,0 | 0,1 | 94 / 17 | 4.731 | 1.115 / 1.134 | 29.120 | Draga Viva (17) |
| 18 | 25,3 | 27,5 | -8% | 122 | 4,8 | 0,4 | 0,1 | 111 / 20 | 6.629 | 3.476 / 1.425 | 33.385 | Escória Pressurizada (18) |
| 19 | 23,8 | 29,0 | -18% | 143 | 6,0 | 0,0 | 0,1 | 123 / 18 | 5.899 | 1.626 / 882 | 38.086 | Escória Pressurizada (18) |
| 20 | 24,5 | 30,5 | -20% | 124 | 5,1 | 0,0 | 0,0 | 104 / 16 | 7.514 | 872 / 1.292 | 43.036 | Salamandra de Cisterna (21) |
| 21 | 31,3 | 32,0 | -2% | 153 | 4,9 | 0,0 | 0,0 | 86 / 23 | 12.160 | 4.360 / 9.436 | 48.382 | Salamandra de Cisterna (21) |
| 22 | 29,7 | 33,5 | -11% | 170 | 5,7 | 0,4 | 0,0 | 190 / 19 | 11.966 | 2.686 / 650 | 54.045 | Sineiro de Bronze (22) |
| 23 | 31,9 | 35,0 | -9% | 165 | 5,2 | 0,0 | 0,6 | 209 / 22 | 12.778 | 4.472 / 8.156 | 60.276 | Voz Soterrada (23) |
| 24 | 35,5 | 36,5 | -3% | 170 | 4,8 | 0,5 | 1,0 | 244 / 25 | 13.426 | 6.464 / 4.549 | 66.839 | Toupeira de Basalto (24) |

### Bastião de Bronze (`bastion`)

7,59 h do 1 ao 25 (-2% da meta; 8/8 execuções concluídas). Plano de atributos: gerado (requisitos das faixas + Força/Vitalidade 2:3). Tempo: combate 74%, deslocamento e saque 5%, recuperação 3%, viagens 18%, cidade e prova 0%, caído/fugindo 0%. Dano por fonte: ataque básico 82%, Pulso de Atração 11%, Engrenagem Travada 8%; acerto 85%; 1.575 de dano causado e 498 recebido por minuto.

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
| 10 | **19,9** | 15,5 | +29% | 58 | 2,9 | 0,9 | 0,1 | 69 / 9 | 1.146 | 537 / 614 | 8.279 | Rato-Engrenagem (10) |
| 11 | 17,7 | 17,0 | +4% | 58 | 3,3 | 0,0 | 0,3 | 66 / 9 | 1.778 | 373 / 619 | 10.291 | Soldador Cego (11) |
| 12 | 18,5 | 18,5 | 0% | 79 | 4,3 | 0,0 | 0,1 | 30 / 10 | 2.194 | 219 / 0 | 12.649 | Lâmina de Esteira (12) |
| 13 | 22,7 | 20,0 | +14% | 86 | 3,8 | 0,0 | 0,0 | 23 / 16 | 3.300 | 606 / 3.393 | 15.327 | Larva Térmica (13) |
| 14 | 18,7 | 21,5 | -13% | 101 | 5,4 | 0,5 | 0,1 | 93 / 9 | 2.543 | 435 / 0 | 18.240 | Ecoante (14) |
| 15 | 25,2 | 23,0 | +10% | 115 | 4,6 | 0,5 | 0,5 | 107 / 11 | 3.441 | 2.958 / 953 | 21.515 | Guardião de Galeria (15) |
| 16 | 25,4 | 24,5 | +4% | 116 | 4,6 | 0,5 | 0,4 | 120 / 15 | 4.693 | 2.040 / 1.452 | 25.124 | Aranha de Conduto (16) |
| 17 | 29,2 | 26,0 | +12% | 115 | 3,9 | 0,0 | 0,0 | 68 / 15 | 5.522 | 2.295 / 4.237 | 29.129 | Draga Viva (17) |
| 18 | 22,0 | 27,5 | -20% | 119 | 5,4 | 0,0 | 0,0 | 94 / 11 | 4.228 | 0 / 0 | 33.500 | Escória Pressurizada (18) |
| 19 | 23,1 | 29,0 | -21% | 141 | 6,1 | 0,0 | 0,0 | 92 / 17 | 4.972 | 0 / 0 | 37.929 | Escória Pressurizada (18) |
| 20 | 29,8 | 30,5 | -2% | 124 | 4,2 | 0,0 | 0,0 | 77 / 15 | 7.150 | 680 / 975 | 43.036 | Salamandra de Cisterna (21) |
| 21 | 33,4 | 32,0 | +4% | 153 | 4,6 | 0,0 | 0,0 | 52 / 22 | 12.110 | 3.514 / 10.492 | 48.422 | Salamandra de Cisterna (21) |
| 22 | 26,7 | 33,5 | -20% | 167 | 6,3 | 0,0 | 0,0 | 142 / 21 | 8.683 | 0 / 0 | 54.037 | Sineiro de Bronze (22) |
| 23 | 37,5 | 35,0 | +7% | 167 | 4,5 | 0,3 | 0,6 | 143 / 24 | 15.055 | 6.350 / 13.550 | 60.318 | Voz Soterrada (23) |
| 24 | 29,4 | 36,5 | -19% | 171 | 5,8 | 0,0 | 0,0 | 209 / 22 | 10.063 | 892 / 1.511 | 66.902 | Toupeira de Basalto (24) |

### Quebraferro (`breaker`)

7,75 h do 1 ao 25 (+1% da meta; 8/8 execuções concluídas). Plano de atributos: example_builds.json (breaker_physical). Tempo: combate 68%, deslocamento e saque 5%, recuperação 4%, viagens 22%, cidade e prova 0%, caído/fugindo 0%. Dano por fonte: ataque básico 79%, Talho Profundo 12%, Ruptura 3%, dano contínuo 3%, Fenda Sísmica 2%; acerto 88%; 1.569 de dano causado e 636 recebido por minuto.

| Nível | Min | Meta | Desvio | Abates | Abates/min | Mortes | Fugas | Tônicos V/M | Ouro ganho (moedas + vendas) | Gasto: tônicos / equip. | XP de abates | Monstro principal |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1,5 | 2,0 | -25% | 16 | 10,6 | 0,0 | 0,0 | 0 / 0 | 63 | 0 / 0 | 80 | Rato de Sulco (1) |
| 2 | 3,8 | 3,5 | +8% | 16 | 4,3 | 0,0 | 0,0 | 2 / 1 | 77 | 49 / 33 | 257 | Besouro-Brasa (2) |
| 3 | 4,0 | 5,0 | -20% | 30 | 7,5 | 0,0 | 0,0 | 19 / 2 | 71 | 0 / 0 | 570 | Cão de Ferrugem (3) |
| 4 | 5,7 | 6,5 | -12% | 30 | 5,2 | 0,0 | 0,4 | 8 / 4 | 158 | 0 / 0 | 1.049 | Lagarto de Lastro (4) |
| 5 | 7,7 | 8,0 | -3% | 26 | 3,3 | 0,0 | 0,0 | 7 / 3 | 102 | 0 / 0 | 1.700 | Sapo-Bomba (5) |
| 6 | 10,6 | 9,5 | +11% | 29 | 2,7 | 0,0 | 1,5 | 43 / 2 | 323 | 273 / 198 | 2.530 | Enguia de Lodo (6) |
| 7 | 11,9 | 11,0 | +8% | 39 | 3,3 | 0,0 | 2,0 | 40 / 3 | 381 | 256 / 168 | 3.619 | Enguia de Lodo (6) |
| 8 | 13,4 | 12,5 | +7% | 48 | 3,6 | 0,0 | 1,3 | 31 / 8 | 922 | 291 / 0 | 4.892 | Garça de Ferrugem (8) |
| 9 | 15,5 | 14,0 | +11% | 56 | 3,6 | 0,6 | 0,6 | 69 / 5 | 757 | 391 / 315 | 6.423 | Autômato Escavador (9) |
| 10 | **19,4** | 15,5 | +25% | 61 | 3,1 | 1,4 | 0,4 | 73 / 7 | 1.083 | 575 / 631 | 8.243 | Rato-Engrenagem (10) |
| 11 | 14,6 | 17,0 | -14% | 59 | 4,1 | 0,1 | 0,1 | 57 / 8 | 1.876 | 664 / 41 | 10.340 | Soldador Cego (11) |
| 12 | 14,6 | 18,5 | -21% | 79 | 5,4 | 0,0 | 0,0 | 37 / 9 | 2.168 | 0 / 0 | 12.625 | Lâmina de Esteira (12) |
| 13 | 19,3 | 20,0 | -3% | 85 | 4,4 | 0,0 | 0,0 | 30 / 15 | 3.270 | 1.099 / 3.299 | 15.282 | Larva Térmica (13) |
| 14 | 18,4 | 21,5 | -14% | 101 | 5,5 | 0,5 | 0,3 | 110 / 10 | 2.546 | 1.221 / 0 | 18.271 | Ecoante (14) |
| 15 | 22,6 | 23,0 | -2% | 121 | 5,3 | 0,6 | 0,5 | 110 / 12 | 3.403 | 1.986 / 66 | 21.559 | Guardião de Galeria (15) |
| 16 | 30,5 | 24,5 | +24% | 128 | 4,2 | 0,9 | 0,8 | 170 / 13 | 4.353 | 3.398 / 1.283 | 25.128 | Aranha de Conduto (16) |
| 17 | **33,5** | 26,0 | +29% | 132 | 3,9 | 0,5 | 0,3 | 121 / 18 | 5.876 | 2.594 / 3.592 | 29.135 | Draga Viva (17) |
| 18 | 26,2 | 27,5 | -5% | 124 | 4,7 | 0,4 | 0,5 | 135 / 16 | 5.117 | 2.918 / 800 | 33.367 | Escória Pressurizada (18) |
| 19 | 26,9 | 29,0 | -7% | 142 | 5,3 | 0,0 | 0,0 | 135 / 18 | 6.478 | 2.400 / 2.380 | 38.072 | Escória Pressurizada (18) |
| 20 | 29,3 | 30,5 | -4% | 125 | 4,3 | 0,0 | 0,3 | 109 / 16 | 7.744 | 926 / 846 | 43.065 | Salamandra de Cisterna (21) |
| 21 | 30,4 | 32,0 | -5% | 152 | 5,0 | 0,0 | 0,0 | 90 / 23 | 11.667 | 3.545 / 7.447 | 48.263 | Salamandra de Cisterna (21) |
| 22 | 30,3 | 33,5 | -10% | 170 | 5,6 | 0,4 | 0,1 | 193 / 18 | 10.361 | 1.847 / 447 | 54.156 | Sineiro de Bronze (22) |
| 23 | 36,5 | 35,0 | +4% | 171 | 4,7 | 0,4 | 0,6 | 231 / 27 | 14.943 | 6.460 / 10.642 | 60.301 | Voz Soterrada (23) |
| 24 | 38,5 | 36,5 | +6% | 181 | 4,7 | 1,4 | 0,8 | 242 / 26 | 14.336 | 6.437 / 1.578 | 66.727 | Voz Soterrada (23) |

## Economia: ouro ganho × gasto (tônicos e equipamento)

Ganho = moedas saqueadas + vendas ao comerciante (sucata, peças substituídas e de outras classes, a `value × economy.sellFraction`). Gasto = tônicos na loja da cidade e peças comuns no armeiro (`value × economy.gearPriceMult`), sempre com ouro real (`buy`/`sell`). "Fatia" = gasto ÷ ganho.

| Classe | Moedas | Vendas | Gasto em tônicos | Gasto em equipamento | Fatia tônicos / equip. | Saldo no nível 25 | Ganho/h | Tônicos usados (V+M) | Itens vendidos | Idas à loja |
|---|---|---|---|---|---|---|---|---|---|---|
| Tecelão da Brasa | 75.417 | 15.493 | 24.345 | 29.232 | 27% / 32% | 37.333 | 13.964 | 1.915 | 725 | 13,3 |
| Andarilha do Vento | 74.714 | 19.842 | 27.092 | 37.838 | 29% / 40% | 29.627 | 14.147 | 1.938 | 819 | 11,9 |
| Vigia do Espinhal | 75.549 | 17.586 | 23.644 | 35.294 | 25% / 38% | 34.197 | 13.708 | 1.904 | 771 | 10,8 |
| Cantora do Véu | 72.572 | 13.729 | 19.193 | 40.298 | 22% / 47% | 26.810 | 11.832 | 1.427 | 636 | 11,0 |
| Escudeiro do Alvorecer | 73.073 | 19.153 | 27.870 | 39.534 | 30% / 43% | 24.823 | 12.564 | 1.917 | 842 | 12,3 |
| Lanceiro do Fosso | 73.550 | 24.010 | 33.297 | 36.414 | 34% / 37% | 27.849 | 13.243 | 2.140 | 939 | 12,9 |
| Bastião de Bronze | 73.079 | 16.396 | 22.128 | 38.410 | 25% / 43% | 28.937 | 11.791 | 1.850 | 741 | 11,6 |
| Quebraferro | 74.212 | 23.859 | 37.329 | 33.766 | 38% / 34% | 26.977 | 12.655 | 2.324 | 921 | 13,8 |

Por faixa de nível (média das classes): ouro ganho e gasto por hora, a fatia do ganho que vai para tônicos e para equipamento, e tônicos bebidos por hora.

| Níveis | Ganho/h | Tônicos/h (ouro) | Equipamento/h (ouro) | Fatia tônicos / equip. | Tônicos bebidos/h | Classe que mais gasta em tônicos (fatia) |
|---|---|---|---|---|---|---|
| 1–4 | 1.326 | 191 | 124 | 15% / 9% | 114 | Bastião de Bronze (17%) |
| 5–8 | 2.644 | 1.121 | 641 | 43% / 24% | 191 | Tecelão da Brasa (55%) |
| 9–12 | 5.589 | 1.479 | 1.165 | 26% / 21% | 224 | Vigia do Espinhal (37%) |
| 13–16 | 10.169 | 4.171 | 4.480 | 41% / 44% | 293 | Quebraferro (57%) |
| 17–20 | 14.125 | 3.355 | 4.270 | 24% / 30% | 247 | Quebraferro (35%) |
| 21–24 | 22.533 | 6.208 | 10.057 | 28% / 45% | 341 | Lanceiro do Fosso (36%) |

- O ouro ganho por hora cresce de ~1.326/h (níveis 1–4) para ~22.533/h (21–24); o gasto com tônicos acompanha o dano recebido, não o nível: classes de distância que matam antes do contato compram pouco.
- Preço dos tônicos = 2 × valor (Pequeno de Vida 8, Médio de Vida 24, Pequeno de Mana 10, Médio de Mana 30); peças do armeiro = 2,5 × valor; venda ao comerciante = 0,50 × valor.

## Efeito da prova de classe (habilidade do nível 10)

A rodada principal faz a prova de classe no nível 10 (premissas). Para medir também a caça pura, sem nenhuma missão, as mesmas sementes foram simuladas **sem a prova**: sem a habilidade marcante do nível 10 e sem o tempo da viagem e da luta na arena. Média das classes: **7,17 h com prova** (-7% da meta) e **7,08 h sem prova** (-8%).

| Classe | Habilidade do nível 10 | Horas com prova | Horas sem prova | Diferença | Min nos níveis 10–24 (com / sem) | Mortes (com / sem) |
|---|---|---|---|---|---|---|
| Tecelão da Brasa | Círculo de Fuligem | 6,51 | 7,17 | +10% | 311 / 350 | 4,0 / 7,0 |
| Lanceiro do Fosso | Avanço do Fosso | 7,37 | 7,42 | +1% | 357 / 360 | 6,4 / 7,0 |
| Vigia do Espinhal | Chuva de Espinhos | 6,79 | 6,75 | -1% | 344 / 341 | 3,8 / 4,4 |
| Andarilha do Vento | Vento a Favor | 6,68 | 6,59 | -1% | 337 / 332 | 4,6 / 5,0 |
| Quebraferro | Ruptura | 7,75 | 7,59 | -2% | 391 / 382 | 7,1 / 7,0 |
| Cantora do Véu | Selo do Véu | 7,29 | 6,96 | -5% | 370 / 350 | 3,9 / 2,8 |
| Escudeiro do Alvorecer | Juramento | 7,34 | 6,99 | -5% | 372 / 352 | 3,0 / 3,8 |
| Bastião de Bronze | Reforço de Campo | 7,59 | 7,19 | -5% | 379 / 355 | 3,3 / 3,0 |

| Nível | Meta (min) | Média com prova | Média sem prova |
|---|---|---|---|
| 10 | 15,5 | 18,6 | 17,1 |
| 11 | 17,0 | 14,0 | 13,8 |
| 12 | 18,5 | 15,0 | 14,6 |
| 13 | 20,0 | 20,4 | 20,0 |
| 14 | 21,5 | 18,1 | 17,8 |
| 15 | 23,0 | 21,1 | 21,0 |
| 16 | 24,5 | 23,5 | 23,7 |
| 17 | 26,0 | 26,9 | 25,8 |
| 18 | 27,5 | 21,2 | 20,1 |
| 19 | 29,0 | 24,5 | 24,2 |
| 20 | 30,5 | 27,5 | 28,0 |
| 21 | 32,0 | 30,2 | 29,4 |
| 22 | 33,5 | 29,3 | 28,7 |
| 23 | 35,0 | 33,3 | 33,4 |
| 24 | 36,5 | 34,1 | 35,1 |

Prova: 64 de 64 execuções venceram (1,0 tentativa(s) por execução em média; 32 s de luta na arena). A diferença de tempo inclui a ida à cidade da classe e a volta (2 × as trocas de mapa até lá). Com a habilidade extra o bot gasta mana em mais uma habilidade; ele só usa reforços de defesa caros, escudos e áreas em volta de si quando a luta pede (vários atacantes ou vida baixa), e nunca usa área que acorde monstro parado.

## Equipamento

Peças comuns do kit da faixa (arma + mão secundária + 4 de armadura) compradas no armeiro com ouro, e quantos minutos de jogo depois de chegar ao nível da faixa o kit ficou completo (equipado ou na bolsa à espera de requisito). "Já tinha" conta peças da faixa que o bot já possuía ao chegar (saque ou compra adiantada).

| Classe | Peças compradas | Já tinha ao chegar | Melhorias do chão | Kit 5: atraso (min) | Kit 9: atraso (min) | Kit 13: atraso (min) | Kit 17: atraso (min) | Kit 21: atraso (min) | Exemplos do chão |
|---|---|---|---|---|---|---|---|---|---|
| Tecelão da Brasa | 37,5 | 7,3 | 6,6 | 26 | 35 | 6 | 5 | 0 | `ring_t1`, `ring_t13`, `amulet_t17`, `robe_circlet_t1`, `robe_t5`, `focus_t17`, `ring_t17`, `amulet_t13` |
| Andarilha do Vento | 41,1 | 6,0 | 5,4 | 20 | 29 | 3 | 5 | 5 | `ring_t9`, `ring_t21`, `light_shield_t21`, `amulet_t1`, `light_boots_t9`, `light_hood_t17`, `amulet_t17`, `light_boots_t21` |
| Vigia do Espinhal | 39,5 | 7,3 | 5,8 | 18 | 21 | 4 | 2 | 5 | `quiver_t9`, `ring_t5`, `quiver_t17`, `light_gloves_t21`, `quiver_t21`, `ring_t25`, `amulet_second_toll`, `ring_t13` |
| Cantora do Véu | 44,0 | 2,1 | 3,9 | 22 | 29 | 4 | 7 | 5 | `ring_t13`, `scepter_t9`, `robe_t25`, `robe_sandals_t5`, `amulet_t5`, `ring_t5`, `amulet_t9`, `ring_t21` |
| Escudeiro do Alvorecer | 41,0 | 8,0 | 5,5 | 23 | 33 | 4 | 6 | 3 | `heavy_boots_t5`, `amulet_t5`, `amulet_t9`, `heavy_armor_t13`, `heavy_helm_t17`, `shield_t13`, `amulet_t21`, `ring_t5` |
| Lanceiro do Fosso | 38,9 | 5,1 | 4,0 | 30 | 29 | 3 | 4 | 5 | `ring_t5`, `heavy_armor_t21`, `ring_t1`, `ring_t9`, `ring_t17`, `amulet_t1`, `ring_t13`, `heavy_helm_t17` |
| Bastião de Bronze | 40,5 | 4,1 | 5,9 | 25 | 41 | 5 | 5 | 5 | `amulet_t9`, `ring_t9`, `amulet_t13`, `amulet_t17`, `ring_t13`, `ring_t17`, `hammer_1h_t21`, `heavy_boots_t21` |
| Quebraferro | 36,9 | 4,1 | 4,6 | 23 | 26 | 3 | 15 | 4 | `ring_t5`, `ring_t9`, `heavy_armor_t17`, `amulet_t17`, `ring_t17`, `amulet_t25`, `ring_t1`, `heavy_boots_t5` |

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

1. **Equilíbrio entre classes na caça solo:** Tecelão da Brasa chega ao nível 25 em 6,51 h e Quebraferro em 7,75 h (1,2×). Todas as classes ficam a até ±25% da meta total (de -15% a +1%).
2. **Dano por classe:** Tecelão da Brasa 1.835/min (básico 39%, Faísca de Vidro 28%; recebe 406/min); Andarilha do Vento 1.777/min (básico 89%, Arremesso de Retorno 7%; recebe 553/min); Vigia do Espinhal 1.772/min (básico 84%, Flecha de Passagem 6%; recebe 536/min); Lanceiro do Fosso 1.662/min (básico 77%, Estocada Longa 14%; recebe 592/min); Cantora do Véu 1.653/min (básico 54%, Nota Clara 46%; recebe 755/min); Escudeiro do Alvorecer 1.603/min (básico 75%, Corte Solar 17%; recebe 555/min); Bastião de Bronze 1.575/min (básico 82%, Pulso de Atração 11%; recebe 498/min); Quebraferro 1.569/min (básico 79%, Talho Profundo 12%; recebe 636/min). Média: 1.681 de dano causado por minuto.
3. **Ataque básico ainda é quase todo o dano de:** Bastião de Bronze (82%), Vigia do Espinhal (84%), Andarilha do Vento (89%).
4. **Cantora do Véu antes do nível 15:** -4% da meta somando os níveis 1–14; é a classe mais lenta nos níveis 2, 3, 14. Nota Clara (nível 5) faz 46% do dano da rodada inteira; as curas somam 231 de vida por minuto.
5. **Curva de XP:** todos os níveis ficam a até ±25% da meta na média das classes (maior desvio: nível 18, -23%). O total 1→25 fica em -7% da meta. Ritmo médio: 10,1 abates/min no nível 1, 4,9 na média dos níveis.
6. **Onde se morre:** níveis com mais mortes: 10 (0,94 por classe), 24 (0,78 por classe), 9 (0,58 por classe), 15 (0,44 por classe). Monstros que mais derrubam (mortes por execução, somando as classes; um monstro conta em toda morte em que estava batendo): Autômato Escavador (nv 9, agressivo) 5,9, Rato-Engrenagem (nv 10, agressivo) 5,7, Toupeira de Basalto (nv 24, agressivo) 5,4, Sineiro de Bronze (nv 22, agressivo) 3,9, Guardião de Galeria (nv 15, agressivo) 3,6. Mortes por classe (média por execução): Tecelão da Brasa 4,0, Andarilha do Vento 4,6, Vigia do Espinhal 3,8, Cantora do Véu 3,9, Escudeiro do Alvorecer 3,0, Lanceiro do Fosso 6,4, Bastião de Bronze 3,3, Quebraferro 7,1 — 4,5 em média. Quase toda queda é numa briga com vários monstros ao mesmo tempo (de 4,0 a 4,8 atacantes, em média, nos 10 s antes de cair; 92% a 100% das mortes com 3 ou mais). Todas as classes entram em brigas com 4 ou mais monstros num ritmo parecido (4,2 a 7,6 por hora: assistência dos iguais a até 8 m, agressão por proximidade e monstros que reaparecem perto); o que muda é quanto cada uma aguenta: mortes por briga dessas de 0,06 (Bastião de Bronze) a 0,14 (Lanceiro do Fosso). Do nível 9 em diante, 50% a 100% das mortes acontecem já sem tônico médio na bolsa (o bot só compra o médio quando o ouro paga 40 e segue caçando com os pequenos quando os médios acabam).
7. **Mecânicas dos monstros:** cada execução vê em média 787 golpes avisados; o bot estava dentro de 754, saiu 760 vezes e esperou fora (sem entrar para atacar) 271 vezes. O que ainda acerta — áreas em que a reação de 0,6 s não bastou e as mecânicas sem aviso — soma de 0,7% a 1,5% do dano recebido; mais dano: Eco (Ecoante, 2.482 por execução), Explosão de Escória (Escória Pressurizada, 105 por execução), Arrasto (Draga Viva, 12 por execução).
8. **Economia:** do ouro ganho (moedas + vendas), os tônicos levam de 22% a 38% (mais: Quebraferro) e o equipamento do armeiro de 32% a 47%; juntos, 59% a 73%. As vendas ao comerciante são 20% do ganho. Saldo ao chegar ao nível 25: 24.823 a 37.333 de ouro (inclui o que sobra para o kit da faixa 25, que o bot só compra adiantado com ouro de sobra).
9. **Equipamento comprado no armeiro:** 39,9 peças por classe em média; o kit comum fica completo, em média, 23 min depois do nível 5, 30 min depois do nível 9, 4 min depois do nível 13, 6 min depois do nível 17, 4 min depois do nível 21 (o atraso é o tempo de juntar o ouro e ir à cidade). Pelo saque chegam 5,2 melhorias por classe.
10. **Conjuração e recarga global:** Vigia do Espinhal conjurou 97 vezes (97 concluídas, 1 interrompidas); Tecelão da Brasa conjurou 174 vezes (173 concluídas, 1 interrompidas). O bot só começa a conjurar parado e não age durante a conjuração; com a recarga global de 1,0 s ele não tenta outra habilidade antes do fim dela.

## Modo acelerado e desempenho da ferramenta

- Laço de `server.step(100)` (100 ms de jogo por chamada) num GameServer sem `start()`: banco SQLite em memória (`--banco-arquivo` usa um arquivo temporário), modo dev, sessões falsas e pedidos síncronos por `server.onMessage`. 459 h de jogo simuladas em 16,4 min de CPU (1.681× o tempo real por linha de execução); 3 linhas de execução (`worker_threads`) em paralelo, 11,9 min de relógio no total.
- Temporizadores do jogo usam `zone.now` (soma dos dt): recargas, conjurações, efeitos, regeneração, tônicos, ataques e reaparecimento funcionam acelerados sem ajuste. `Date.now()` aparece em prazos de relógio de parede (validade do saque de 30 min, dia da elite diária, carimbos do banco, convites e calabouço); dentro da simulação ele segue o tempo simulado, para esses prazos correrem no ritmo do jogo.
- Zonas abertas sem jogador param 30 s depois que o último jogador sai e, quando alguém entra, o relógio da zona é adiantado até o tempo global (o valor que teria sem parar), então monstros mortos reaparecem e recargas levadas entre zonas continuam valendo; instâncias não são tocadas. 87% dos ticks de zona foram pulados. Um passo com só a zona ativa custa ~20–40 µs.
- Snapshots: o bot pede `{ delta: true }` no login. Se o servidor manda diferenças, elas são mescladas como em `mergeSnap` (test/helpers/client.js); se manda o snapshot completo, só o último é decodificado, quando o bot olha o mundo. Nesta rodada o servidor mandou diferenças. A sessão falsa nasce por `server.onConnection` (com um ws falso) e a simulação desliga o limite de comandos por conexão (`rateLimit`), que é medido em tempo real. Mensagens `hit`/`heal` alimentam a contabilidade de dano e `cast_end` encerra a conjuração do bot; as de efeito visual são descartadas sem decodificar.
