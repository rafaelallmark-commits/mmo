<!-- Arquivo gerado por `npm run simular-progressao` (server/tools/simular-progressao.mjs). Rode de novo para atualizar. -->

# Relatório de progressão simulada (Marco 4)

Simulação acelerada, em processo, de caça solo do nível 1 ao 25 para 8 classes, contra as metas de teste de `data/xp_table.json` (`targetMinutesToNext`, ver [docs/04](04-progressao-e-formulas.md)). Cada classe foi jogada por um bot que só caça (sem missões), com 8 sementes (1, 2, 3, 4, 5, 6, 7, 8). Os números abaixo são **médias das sementes**; a meta é considerada atingida quando o tempo fica a até ±25% dela.

Gerado em 2026-11-23 06:19 UTC · tempo real 9,1 min (3 linhas de execução) · 466 h de jogo simuladas.

```
cd server && npm run simular-progressao
```

## Resumo

- Meta só caça do 1 ao 25: **7,7 h**. Média das classes: **7,28 h** (-5%).
- Mais rápida: Andarilha do Vento (6,58 h); mais lenta: Bastião de Bronze (8,10 h) — razão 1,2×.
- Níveis em que a média das classes sai da faixa de ±25%: nenhum.
- Viagens (troca de mapa a 60 s cada: ir às novas áreas, à loja, ao armeiro e à prova) são 21% do tempo. Recuperação fora de combate (tônico ou descanso) fica em 2–14% para todas as classes, porque os bots compram e bebem tônicos em vez de esperar a regeneração (1,5% da vida por segundo).

| Classe | Horas 1→25 (média) | Mín–máx | Desvio da meta | Abates | Mortes | Fugas | Tônicos V/M | Ouro ganho/h | Gasto/h (tônicos + equip.) | Prova |
|---|---|---|---|---|---|---|---|---|---|---|
| Andarilha do Vento | 6,58 | 6,41–6,79 | -15% | 2.043 | 4,4 | 2,4 | 1.652 / 261 | 14.226 | 9.893 (3.954 + 5.939) | 8/8 |
| Tecelão da Brasa | 6,59 | 6,36–6,93 | -14% | 2.047 | 4,6 | 0,4 | 921 / 984 | 14.242 | 9.660 (4.247 + 5.413) | 8/8 |
| Vigia do Espinhal | 6,81 | 6,51–7,10 | -12% | 2.030 | 4,3 | 2,8 | 1.639 / 266 | 13.989 | 9.277 (3.951 + 5.326) | 8/8 |
| Cantora do Véu | 7,26 | 6,98–7,53 | -6% | 2.047 | 3,3 | 0,8 | 633 / 735 | 12.101 | 8.172 (2.708 + 5.463) | 8/8 |
| Escudeiro do Alvorecer | 7,36 | 7,14–7,55 | -4% | 2.055 | 2,8 | 8,1 | 1.629 / 258 | 12.586 | 9.100 (3.667 + 5.433) | 8/8 |
| Lanceiro do Fosso | 7,55 | 7,17–7,89 | -2% | 2.076 | 4,6 | 13,5 | 1.939 / 256 | 12.342 | 8.989 (4.603 + 4.386) | 8/8 |
| Quebraferro | 8,01 | 7,59–8,37 | +4% | 2.103 | 6,6 | 10,5 | 2.155 / 261 | 11.932 | 8.942 (4.995 + 3.947) | 8/8 |
| Bastião de Bronze | 8,10 | 7,27–8,82 | +5% | 2.061 | 3,3 | 11,4 | 1.702 / 240 | 11.071 | 7.556 (3.079 + 4.477) | 8/8 |

### Para onde vai o tempo

Fatia do tempo total de cada classe. Viagens: trocas de mapa a 60 s cada, com a quantidade média por motivo (caça inclui trocar de área por perigo).

| Classe | Combate | Deslocamento e saque | Recuperação | Viagens | Trocas de mapa: caça / tônicos e venda / equipamento / prova | Cidade e prova | Caído e fugindo |
|---|---|---|---|---|---|---|---|
| Andarilha do Vento | 70% | 6% | 2% | 21% | 45 / 22 / 15 / 2 | 0% | 0% |
| Tecelão da Brasa | 56% | 6% | 14% | 24% | 50 / 28 / 13 / 2 | 0% | 0% |
| Vigia do Espinhal | 71% | 6% | 2% | 20% | 44 / 23 / 13 / 2 | 0% | 0% |
| Cantora do Véu | 72% | 5% | 4% | 18% | 43 / 20 / 14 / 3 | 0% | 0% |
| Escudeiro do Alvorecer | 72% | 5% | 3% | 20% | 48 / 23 / 15 / 2 | 0% | 0% |
| Lanceiro do Fosso | 66% | 5% | 6% | 23% | 55 / 30 / 15 / 2 | 0% | 0% |
| Quebraferro | 67% | 5% | 4% | 24% | 61 / 36 / 15 / 2 | 0% | 0% |
| Bastião de Bronze | 72% | 4% | 3% | 20% | 52 / 25 / 18 / 2 | 0% | 0% |

## Tempo por nível: média das classes × meta

Minutos simulados para sair de cada nível. "Fora" marca a média fora de ±25% da meta; a coluna seguinte conta quantas classes, individualmente, ficaram fora.

| Nível | Meta (min) | Média (min) | Desvio | Faixa | Classes fora | Mais rápida | Mais lenta | Abates/min | Mortes |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 2,0 | 1,7 | -18% | ok | 4/8 | Andarilha do Vento 1,3 | Tecelão da Brasa 2,4 | 10,1 | 0,00 |
| 2 | 3,5 | 4,2 | +20% | ok | 2/8 | Andarilha do Vento 3,8 | Cantora do Véu 4,9 | 3,8 | 0,00 |
| 3 | 5,0 | 5,0 | -1% | ok | 1/8 | Andarilha do Vento 4,1 | Cantora do Véu 6,5 | 6,2 | 0,00 |
| 4 | 6,5 | 6,6 | +2% | ok | 4/8 | Vigia do Espinhal 3,9 | Bastião de Bronze 8,8 | 5,0 | 0,00 |
| 5 | 8,0 | 8,0 | -1% | ok | 1/8 | Vigia do Espinhal 6,0 | Tecelão da Brasa 9,6 | 3,6 | 0,00 |
| 6 | 9,5 | 10,3 | +9% | ok | 1/8 | Tecelão da Brasa 9,3 | Lanceiro do Fosso 12,5 | 2,9 | 0,00 |
| 7 | 11,0 | 12,2 | +11% | ok | 2/8 | Vigia do Espinhal 9,2 | Lanceiro do Fosso 15,5 | 3,0 | 0,08 |
| 8 | 12,5 | 11,4 | -9% | ok | 2/8 | Andarilha do Vento 8,5 | Tecelão da Brasa 13,6 | 4,1 | 0,02 |
| 9 | 14,0 | 15,8 | +13% | ok | 1/8 | Escudeiro do Alvorecer 13,9 | Lanceiro do Fosso 18,2 | 3,3 | 0,74 |
| 10 | 15,5 | 18,9 | +22% | ok | 4/8 | Vigia do Espinhal 16,1 | Escudeiro do Alvorecer 21,2 | 2,9 | 0,83 |
| 11 | 17,0 | 14,0 | -18% | ok | 2/8 | Cantora do Véu 10,2 | Bastião de Bronze 18,1 | 4,4 | 0,30 |
| 12 | 18,5 | 15,7 | -15% | ok | 1/8 | Andarilha do Vento 12,6 | Bastião de Bronze 20,7 | 5,1 | 0,02 |
| 13 | 20,0 | 20,5 | +2% | ok | 0/8 | Andarilha do Vento 19,3 | Bastião de Bronze 23,9 | 4,2 | 0,00 |
| 14 | 21,5 | 19,0 | -12% | ok | 2/8 | Andarilha do Vento 14,5 | Cantora do Véu 24,4 | 5,4 | 0,27 |
| 15 | 23,0 | 21,1 | -8% | ok | 1/8 | Tecelão da Brasa 12,6 | Bastião de Bronze 25,2 | 5,4 | 0,25 |
| 16 | 24,5 | 23,5 | -4% | ok | 2/8 | Tecelão da Brasa 11,8 | Quebraferro 31,3 | 5,2 | 0,24 |
| 17 | 26,0 | 27,2 | +5% | ok | 1/8 | Tecelão da Brasa 22,3 | Quebraferro 32,9 | 4,4 | 0,03 |
| 18 | 27,5 | 21,3 | -23% | ok | 5/8 | Tecelão da Brasa 14,8 | Lanceiro do Fosso 25,4 | 5,7 | 0,05 |
| 19 | 29,0 | 25,7 | -11% | ok | 0/8 | Cantora do Véu 22,6 | Quebraferro 31,1 | 5,5 | 0,03 |
| 20 | 30,5 | 28,1 | -8% | ok | 0/8 | Andarilha do Vento 24,2 | Bastião de Bronze 32,6 | 4,5 | 0,00 |
| 21 | 32,0 | 29,0 | -9% | ok | 1/8 | Tecelão da Brasa 22,1 | Bastião de Bronze 33,7 | 5,3 | 0,00 |
| 22 | 33,5 | 29,5 | -12% | ok | 1/8 | Andarilha do Vento 24,7 | Tecelão da Brasa 35,7 | 5,8 | 0,30 |
| 23 | 35,0 | 33,3 | -5% | ok | 1/8 | Tecelão da Brasa 19,6 | Cantora do Véu 41,1 | 5,3 | 0,27 |
| 24 | 36,5 | 35,1 | -4% | ok | 0/8 | Andarilha do Vento 31,5 | Quebraferro 39,2 | 5,1 | 0,83 |

### Minutos por nível e classe

| Nível | Meta | Andarilha do Vento | Tecelão da Brasa | Vigia do Espinhal | Cantora do Véu | Escudeiro do Alvorecer | Lanceiro do Fosso | Quebraferro | Bastião de Bronze |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 2,0 | **1,3** | 2,4 | **1,4** | 2,1 | **1,4** | **1,5** | 1,5 | 1,6 |
| 2 | 3,5 | 3,8 | **4,8** | 4,0 | **4,9** | 3,9 | 4,1 | 3,9 | 4,4 |
| 3 | 5,0 | 4,1 | 5,3 | 4,5 | **6,5** | 4,2 | 5,3 | 4,3 | 5,4 |
| 4 | 6,5 | **4,8** | 6,2 | **3,9** | 7,4 | 5,9 | **8,4** | 7,5 | **8,8** |
| 5 | 8,0 | 6,2 | 9,6 | **6,0** | 7,5 | 7,1 | 9,5 | 9,5 | 8,2 |
| 6 | 9,5 | 9,5 | 9,3 | 10,4 | 9,5 | 10,6 | **12,5** | 9,8 | 10,9 |
| 7 | 11,0 | 11,0 | 11,2 | 9,2 | 9,4 | 13,5 | **15,5** | 13,3 | **14,8** |
| 8 | 12,5 | **8,5** | 13,6 | **8,5** | 9,6 | 12,2 | 12,6 | 12,7 | 13,5 |
| 9 | 14,0 | 15,4 | 15,8 | 16,7 | 14,4 | 13,9 | **18,2** | 16,6 | 15,6 |
| 10 | 15,5 | 17,3 | 17,8 | 16,1 | 18,5 | **21,2** | **19,9** | **19,5** | **21,1** |
| 11 | 17,0 | 14,1 | 14,1 | **11,7** | **10,2** | 13,5 | 13,9 | 16,2 | 18,1 |
| 12 | 18,5 | **12,6** | 16,9 | 14,8 | 14,2 | 14,7 | 16,0 | 15,8 | 20,7 |
| 13 | 20,0 | 19,3 | 21,0 | 19,4 | 20,2 | 20,4 | 19,8 | 19,9 | 23,9 |
| 14 | 21,5 | **14,5** | 19,8 | **15,4** | 24,4 | 17,6 | 20,6 | 20,1 | 19,8 |
| 15 | 23,0 | 21,9 | **12,6** | 22,2 | 17,7 | 23,2 | 21,1 | 25,1 | 25,2 |
| 16 | 24,5 | 22,0 | **11,8** | 26,2 | 19,6 | 23,0 | 25,7 | **31,3** | 28,8 |
| 17 | 26,0 | 23,6 | 22,3 | 23,9 | 26,6 | 27,9 | 28,3 | **32,9** | 32,1 |
| 18 | 27,5 | **20,4** | **14,8** | **20,0** | **19,5** | **20,5** | 25,4 | 25,0 | 25,0 |
| 19 | 29,0 | 24,4 | 26,2 | 25,5 | 22,6 | 25,1 | 23,9 | 31,1 | 26,9 |
| 20 | 30,5 | 24,2 | 28,1 | 25,3 | 32,4 | 27,6 | 26,3 | 28,7 | 32,6 |
| 21 | 32,0 | 27,5 | **22,1** | 27,5 | 30,0 | 31,8 | 29,8 | 29,5 | 33,7 |
| 22 | 33,5 | **24,7** | 35,7 | 32,1 | 28,8 | 26,9 | 27,4 | 31,1 | 29,0 |
| 23 | 35,0 | 32,2 | **19,6** | 29,4 | 41,1 | 38,8 | 34,3 | 36,4 | 34,4 |
| 24 | 36,5 | 31,5 | 34,3 | 35,0 | 39,0 | 36,9 | 33,3 | 39,2 | 32,0 |

Negrito: fora de ±25% da meta.

## Mecânicas dos monstros

Golpes avisados no chão (o bot percebe o aviso 0,6 s depois, como um jogador, clica no ponto seguro mais perto e espera fora até o golpe sair; fora da área, não anda nem ataca para dentro dela) e as mecânicas sem aviso (eco do Ecoante, sanguessuga, enxame, garras de pedra, território). Números por execução (média das sementes).

| Classe | Avisos vistos | Estava dentro | Esquivas | Esperas fora | Golpes de mecânica levados | Dano de mecânica (fatia do recebido) | Efeitos negativos recebidos |
|---|---|---|---|---|---|---|---|
| Andarilha do Vento | 768 | 709 | 704 | 12 | 206 | 3.265 (1,5%) | — |
| Tecelão da Brasa | 639 | 590 | 628 | 17 | 128 | 1.530 (1,0%) | Sanguessuga 10 |
| Vigia do Espinhal | 777 | 732 | 753 | 26 | 176 | 2.755 (1,2%) | Sanguessuga 13 |
| Cantora do Véu | 843 | 808 | 783 | 15 | 190 | 2.115 (0,6%) | — |
| Escudeiro do Alvorecer | 825 | 812 | 830 | 610 | 203 | 2.490 (1,0%) | Sanguessuga 12, Atolado 2 |
| Lanceiro do Fosso | 814 | 797 | 808 | 362 | 172 | 3.099 (1,1%) | Sanguessuga 5, Atolado 1 |
| Quebraferro | 813 | 790 | 800 | 608 | 180 | 2.564 (0,8%) | Sanguessuga 40, Atolado 2 |
| Bastião de Bronze | 928 | 916 | 924 | 667 | 197 | 2.547 (1,0%) | Sanguessuga 15, Atolado 3, Atordoado 1 |

Golpes de mecânica levados por execução, média das classes:

| Mecânica | Monstro (nível) | Golpes levados | Dano |
|---|---|---|---|
| Eco | Ecoante (14) | 178,1 | 2.413 |
| Explosão de Escória | Escória Pressurizada (18) | 2,0 | 107 |
| Arrasto | Draga Viva (17) | 1,0 | 16 |
| Fio Condutor | Aranha de Conduto (16) | 0,1 | 4 |
| Estouro de Vapor | Sapo-Bomba (5) | 0,2 | 4 |
| Cone de Faíscas | Soldador Cego (11) | 0,1 | 1 |
| Corrida no Trilho | Lâmina de Esteira (12) | 0,0 | 1 |

## Detalhe por classe

### Andarilha do Vento (`windwalker`)

6,58 h do 1 ao 25 (-15% da meta; 8/8 execuções concluídas). Plano de atributos: gerado (requisitos das faixas + Agilidade/Vitalidade 2:3). Tempo: combate 70%, deslocamento e saque 6%, recuperação 2%, viagens 21%, cidade e prova 0%, caído/fugindo 0%. Dano por fonte: ataque básico 89%, Arremesso de Retorno 7%, Rajada Cortante 2%, Olho do Furacão 2%; acerto 96%; 1.795 de dano causado e 554 recebido por minuto.

| Nível | Min | Meta | Desvio | Abates | Abates/min | Mortes | Fugas | Tônicos V/M | Ouro ganho (moedas + vendas) | Gasto: tônicos / equip. | XP de abates | Monstro principal |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **1,3** | 2,0 | -37% | 16 | 12,6 | 0,0 | 0,0 | 0 / 0 | 59 | 0 / 0 | 80 | Rato de Sulco (1) |
| 2 | 3,8 | 3,5 | +9% | 16 | 4,2 | 0,0 | 0,0 | 1 / 1 | 78 | 46 / 33 | 256 | Besouro-Brasa (2) |
| 3 | 4,1 | 5,0 | -19% | 30 | 7,4 | 0,0 | 0,0 | 15 / 2 | 92 | 0 / 0 | 570 | Cão de Ferrugem (3) |
| 4 | **4,8** | 6,5 | -27% | 26 | 5,4 | 0,0 | 0,0 | 7 / 4 | 127 | 0 / 0 | 1.050 | Lagarto de Lastro (4) |
| 5 | 6,2 | 8,0 | -23% | 26 | 4,1 | 0,0 | 0,0 | 8 / 4 | 105 | 0 / 0 | 1.691 | Sapo-Bomba (5) |
| 6 | 9,5 | 9,5 | +0% | 29 | 3,0 | 0,0 | 0,6 | 38 / 2 | 417 | 300 / 233 | 2.548 | Enguia de Lodo (6) |
| 7 | 11,0 | 11,0 | +0% | 36 | 3,3 | 0,0 | 0,3 | 42 / 4 | 566 | 320 / 226 | 3.601 | Válvula Errante (7) |
| 8 | **8,5** | 12,5 | -32% | 46 | 5,4 | 0,0 | 0,0 | 36 / 5 | 735 | 170 / 0 | 4.885 | Garça de Ferrugem (8) |
| 9 | 15,4 | 14,0 | +10% | 53 | 3,4 | 0,6 | 0,3 | 57 / 6 | 812 | 479 / 488 | 6.442 | Autômato Escavador (9) |
| 10 | 17,3 | 15,5 | +12% | 49 | 2,9 | 0,6 | 0,1 | 66 / 9 | 1.250 | 457 / 686 | 8.243 | Rato-Engrenagem (10) |
| 11 | 14,1 | 17,0 | -17% | 60 | 4,2 | 0,5 | 0,3 | 60 / 7 | 1.743 | 664 / 123 | 10.311 | Soldador Cego (11) |
| 12 | **12,6** | 18,5 | -32% | 79 | 6,3 | 0,0 | 0,0 | 28 / 11 | 2.200 | 0 / 0 | 12.644 | Lâmina de Esteira (12) |
| 13 | 19,3 | 20,0 | -3% | 85 | 4,4 | 0,0 | 0,0 | 20 / 15 | 3.320 | 686 / 3.601 | 15.282 | Larva Térmica (13) |
| 14 | **14,5** | 21,5 | -33% | 101 | 6,9 | 0,3 | 0,0 | 80 / 13 | 2.843 | 0 / 0 | 18.317 | Ecoante (14) |
| 15 | 21,9 | 23,0 | -5% | 114 | 5,2 | 0,8 | 0,4 | 104 / 12 | 4.151 | 2.361 / 1.757 | 21.463 | Guardião de Galeria (15) |
| 16 | 22,0 | 24,5 | -10% | 119 | 5,4 | 0,4 | 0,0 | 131 / 17 | 4.354 | 1.796 / 1.881 | 25.168 | Aranha de Conduto (16) |
| 17 | 23,6 | 26,0 | -9% | 114 | 4,8 | 0,0 | 0,0 | 61 / 14 | 5.445 | 2.831 / 2.154 | 29.155 | Draga Viva (17) |
| 18 | **20,4** | 27,5 | -26% | 118 | 5,8 | 0,0 | 0,0 | 101 / 14 | 4.597 | 392 / 400 | 33.397 | Escória Pressurizada (18) |
| 19 | 24,4 | 29,0 | -16% | 141 | 5,8 | 0,0 | 0,0 | 106 / 15 | 6.170 | 1.508 / 2.787 | 38.030 | Escória Pressurizada (18) |
| 20 | 24,2 | 30,5 | -21% | 124 | 5,1 | 0,0 | 0,0 | 70 / 16 | 7.182 | 836 / 900 | 43.007 | Salamandra de Cisterna (21) |
| 21 | 27,5 | 32,0 | -14% | 153 | 5,6 | 0,0 | 0,0 | 56 / 24 | 10.880 | 2.156 / 8.113 | 48.422 | Salamandra de Cisterna (21) |
| 22 | **24,7** | 33,5 | -26% | 171 | 6,9 | 0,5 | 0,1 | 151 / 20 | 9.591 | 926 / 650 | 54.015 | Sineiro de Bronze (22) |
| 23 | 32,2 | 35,0 | -8% | 168 | 5,2 | 0,3 | 0,1 | 200 / 24 | 13.888 | 5.528 / 11.222 | 60.348 | Voz Soterrada (23) |
| 24 | 31,5 | 36,5 | -14% | 171 | 5,4 | 0,5 | 0,3 | 216 / 25 | 12.972 | 4.556 / 3.812 | 66.780 | Toupeira de Basalto (24) |

### Tecelão da Brasa (`emberweaver`)

6,59 h do 1 ao 25 (-14% da meta; 8/8 execuções concluídas). Plano de atributos: example_builds.json (emberweaver_magic). Tempo: combate 56%, deslocamento e saque 6%, recuperação 14%, viagens 24%, cidade e prova 0%, caído/fugindo 0%. Dano por fonte: ataque básico 39%, Faísca de Vidro 28%, Chão em Brasa 14%, Círculo de Fuligem 10%, Coração da Fornalha 6%; acerto 100%; 1.820 de dano causado e 404 recebido por minuto.

| Nível | Min | Meta | Desvio | Abates | Abates/min | Mortes | Fugas | Tônicos V/M | Ouro ganho (moedas + vendas) | Gasto: tônicos / equip. | XP de abates | Monstro principal |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 2,4 | 2,0 | +19% | 16 | 6,7 | 0,0 | 0,0 | 0 / 0 | 60 | 3 / 3 | 80 | Rato de Sulco (1) |
| 2 | **4,8** | 3,5 | +37% | 16 | 3,3 | 0,0 | 0,0 | 0 / 0 | 78 | 44 / 29 | 256 | Besouro-Brasa (2) |
| 3 | 5,3 | 5,0 | +6% | 30 | 5,7 | 0,0 | 0,0 | 10 / 6 | 109 | 0 / 0 | 570 | Cão de Ferrugem (3) |
| 4 | 6,2 | 6,5 | -4% | 26 | 4,2 | 0,0 | 0,1 | 5 / 1 | 100 | 0 / 0 | 1.041 | Lagarto de Lastro (4) |
| 5 | 9,6 | 8,0 | +21% | 26 | 2,7 | 0,0 | 0,0 | 0 / 6 | 114 | 31 / 19 | 1.716 | Sapo-Bomba (5) |
| 6 | 9,3 | 9,5 | -2% | 29 | 3,1 | 0,0 | 0,0 | 25 / 11 | 394 | 233 / 182 | 2.537 | Enguia de Lodo (6) |
| 7 | 11,2 | 11,0 | +2% | 34 | 3,0 | 0,1 | 0,3 | 30 / 19 | 629 | 378 / 240 | 3.580 | Válvula Errante (7) |
| 8 | 13,6 | 12,5 | +9% | 42 | 3,1 | 0,0 | 0,0 | 14 / 16 | 807 | 305 / 30 | 4.923 | Garça de Ferrugem (8) |
| 9 | 15,8 | 14,0 | +13% | 53 | 3,4 | 0,9 | 0,0 | 32 / 26 | 832 | 369 / 222 | 6.391 | Garça de Ferrugem (8) |
| 10 | 17,8 | 15,5 | +15% | 53 | 3,0 | 0,6 | 0,0 | 35 / 40 | 1.273 | 760 / 828 | 8.271 | Rato-Engrenagem (10) |
| 11 | 14,1 | 17,0 | -17% | 60 | 4,2 | 0,1 | 0,0 | 29 / 41 | 1.814 | 641 / 263 | 10.299 | Soldador Cego (11) |
| 12 | 16,9 | 18,5 | -9% | 79 | 4,7 | 0,0 | 0,0 | 16 / 37 | 2.173 | 0 / 0 | 12.659 | Lâmina de Esteira (12) |
| 13 | 21,0 | 20,0 | +5% | 86 | 4,1 | 0,0 | 0,0 | 33 / 56 | 3.215 | 771 / 3.116 | 15.305 | Larva Térmica (13) |
| 14 | 19,8 | 21,5 | -8% | 99 | 5,0 | 0,0 | 0,0 | 45 / 66 | 3.952 | 3.761 / 578 | 18.260 | Ecoante (14) |
| 15 | **12,6** | 23,0 | -45% | 105 | 8,3 | 0,0 | 0,0 | 35 / 45 | 3.272 | 682 / 0 | 21.559 | Guardião de Galeria (15) |
| 16 | **11,8** | 24,5 | -52% | 108 | 9,2 | 0,0 | 0,0 | 59 / 46 | 3.054 | 0 / 0 | 25.162 | Aranha de Conduto (16) |
| 17 | 22,3 | 26,0 | -14% | 115 | 5,2 | 0,0 | 0,0 | 29 / 48 | 5.895 | 2.199 / 7.496 | 29.092 | Draga Viva (17) |
| 18 | **14,8** | 27,5 | -46% | 118 | 8,0 | 0,0 | 0,0 | 40 / 54 | 4.286 | 0 / 0 | 33.412 | Escória Pressurizada (18) |
| 19 | 26,2 | 29,0 | -10% | 141 | 5,4 | 0,0 | 0,0 | 41 / 59 | 7.008 | 2.524 / 6.296 | 37.996 | Escória Pressurizada (18) |
| 20 | 28,1 | 30,5 | -8% | 124 | 4,4 | 0,0 | 0,0 | 45 / 69 | 8.291 | 1.560 / 3.214 | 43.042 | Salamandra de Cisterna (21) |
| 21 | **22,1** | 32,0 | -31% | 153 | 6,9 | 0,0 | 0,0 | 47 / 76 | 8.050 | 0 / 0 | 48.382 | Salamandra de Cisterna (21) |
| 22 | 35,7 | 33,5 | +6% | 169 | 4,7 | 0,4 | 0,0 | 96 / 80 | 14.660 | 5.816 / 3.900 | 54.080 | Sineiro de Bronze (22) |
| 23 | **19,6** | 35,0 | -44% | 172 | 8,7 | 0,4 | 0,0 | 116 / 90 | 9.041 | 0 / 0 | 60.288 | Voz Soterrada (23) |
| 24 | 34,3 | 36,5 | -6% | 192 | 5,6 | 2,1 | 0,0 | 140 / 92 | 14.728 | 7.904 / 9.252 | 66.808 | Toupeira de Basalto (24) |

### Vigia do Espinhal (`warden`)

6,81 h do 1 ao 25 (-12% da meta; 8/8 execuções concluídas). Plano de atributos: gerado (requisitos das faixas + Agilidade/Vitalidade 2:3). Tempo: combate 71%, deslocamento e saque 6%, recuperação 2%, viagens 20%, cidade e prova 0%, caído/fugindo 0%. Dano por fonte: ataque básico 85%, Flecha de Passagem 6%, Chuva de Espinhos 5%, Tiro do Espinhal 5%; acerto 98%; 1.760 de dano causado e 547 recebido por minuto.

| Nível | Min | Meta | Desvio | Abates | Abates/min | Mortes | Fugas | Tônicos V/M | Ouro ganho (moedas + vendas) | Gasto: tônicos / equip. | XP de abates | Monstro principal |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **1,4** | 2,0 | -29% | 16 | 11,3 | 0,0 | 0,0 | 0 / 1 | 59 | 0 / 0 | 80 | Rato de Sulco (1) |
| 2 | 4,0 | 3,5 | +13% | 16 | 4,0 | 0,0 | 0,0 | 0 / 1 | 85 | 48 / 33 | 256 | Besouro-Brasa (2) |
| 3 | 4,5 | 5,0 | -10% | 30 | 6,7 | 0,0 | 0,0 | 14 / 2 | 111 | 0 / 0 | 570 | Cão de Ferrugem (3) |
| 4 | **3,9** | 6,5 | -40% | 24 | 6,1 | 0,0 | 0,0 | 8 / 3 | 104 | 0 / 0 | 1.042 | Lagarto de Lastro (4) |
| 5 | **6,0** | 8,0 | -25% | 26 | 4,3 | 0,0 | 0,0 | 8 / 4 | 105 | 0 / 0 | 1.716 | Sapo-Bomba (5) |
| 6 | 10,4 | 9,5 | +9% | 29 | 2,8 | 0,0 | 0,6 | 35 / 3 | 479 | 388 / 319 | 2.537 | Enguia de Lodo (6) |
| 7 | 9,2 | 11,0 | -16% | 33 | 3,6 | 0,0 | 0,0 | 40 / 3 | 490 | 133 / 119 | 3.596 | Válvula Errante (7) |
| 8 | **8,5** | 12,5 | -32% | 41 | 4,8 | 0,0 | 0,0 | 29 / 6 | 728 | 0 / 0 | 4.904 | Garça de Ferrugem (8) |
| 9 | 16,7 | 14,0 | +19% | 50 | 3,0 | 0,6 | 0,3 | 44 / 6 | 834 | 552 / 568 | 6.407 | Autômato Escavador (9) |
| 10 | 16,1 | 15,5 | +4% | 52 | 3,2 | 0,5 | 0,0 | 48 / 9 | 1.291 | 252 / 711 | 8.247 | Rato-Engrenagem (10) |
| 11 | **11,7** | 17,0 | -31% | 59 | 5,1 | 0,5 | 0,0 | 56 / 6 | 1.623 | 139 / 0 | 10.306 | Soldador Cego (11) |
| 12 | 14,8 | 18,5 | -20% | 79 | 5,4 | 0,0 | 0,0 | 26 / 10 | 2.260 | 327 / 0 | 12.670 | Lâmina de Esteira (12) |
| 13 | 19,4 | 20,0 | -3% | 86 | 4,4 | 0,0 | 0,0 | 22 / 16 | 3.315 | 1.338 / 3.629 | 15.305 | Larva Térmica (13) |
| 14 | **15,4** | 21,5 | -28% | 99 | 6,4 | 0,0 | 0,0 | 85 / 13 | 2.932 | 0 / 0 | 18.216 | Ecoante (14) |
| 15 | 22,2 | 23,0 | -4% | 107 | 4,8 | 0,1 | 0,3 | 94 / 14 | 4.182 | 2.337 / 1.921 | 21.579 | Guardião de Galeria (15) |
| 16 | 26,2 | 24,5 | +7% | 111 | 4,3 | 0,5 | 0,4 | 146 / 15 | 4.755 | 3.809 / 2.966 | 25.141 | Aranha de Conduto (16) |
| 17 | 23,9 | 26,0 | -8% | 115 | 4,8 | 0,0 | 0,0 | 59 / 13 | 4.568 | 1.218 / 718 | 29.096 | Draga Viva (17) |
| 18 | **20,0** | 27,5 | -27% | 118 | 5,9 | 0,0 | 0,0 | 102 / 15 | 4.246 | 0 / 0 | 33.400 | Escória Pressurizada (18) |
| 19 | 25,5 | 29,0 | -12% | 142 | 5,5 | 0,0 | 0,1 | 100 / 19 | 5.990 | 1.601 / 2.816 | 38.064 | Escória Pressurizada (18) |
| 20 | 25,3 | 30,5 | -17% | 124 | 4,9 | 0,0 | 0,0 | 67 / 17 | 7.563 | 1.004 / 1.599 | 42.994 | Salamandra de Cisterna (21) |
| 21 | 27,5 | 32,0 | -14% | 153 | 5,6 | 0,0 | 0,0 | 69 / 21 | 10.719 | 1.854 / 5.815 | 48.461 | Salamandra de Cisterna (21) |
| 22 | 32,1 | 33,5 | -4% | 170 | 5,3 | 0,5 | 0,8 | 178 / 22 | 13.034 | 4.596 / 1.706 | 54.023 | Sineiro de Bronze (22) |
| 23 | 29,4 | 35,0 | -16% | 171 | 5,8 | 0,4 | 0,0 | 186 / 24 | 11.403 | 2.747 / 5.173 | 60.344 | Voz Soterrada (23) |
| 24 | 35,0 | 36,5 | -4% | 182 | 5,2 | 1,1 | 0,4 | 221 / 24 | 14.458 | 4.586 / 8.201 | 66.717 | Toupeira de Basalto (24) |

### Cantora do Véu (`veilsinger`)

7,26 h do 1 ao 25 (-6% da meta; 8/8 execuções concluídas). Plano de atributos: gerado (requisitos das faixas + Espírito/Vitalidade 2:3). Tempo: combate 72%, deslocamento e saque 5%, recuperação 4%, viagens 18%, cidade e prova 0%, caído/fugindo 0%. Dano por fonte: ataque básico 54%, Nota Clara 46%; acerto 100%; 1.664 de dano causado e 759 recebido por minuto; 228 de cura por minuto.

| Nível | Min | Meta | Desvio | Abates | Abates/min | Mortes | Fugas | Tônicos V/M | Ouro ganho (moedas + vendas) | Gasto: tônicos / equip. | XP de abates | Monstro principal |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 2,1 | 2,0 | +4% | 16 | 7,7 | 0,0 | 0,0 | 0 / 0 | 63 | 0 / 0 | 80 | Rato de Sulco (1) |
| 2 | **4,9** | 3,5 | +39% | 16 | 3,3 | 0,0 | 0,0 | 0 / 0 | 86 | 56 / 33 | 256 | Besouro-Brasa (2) |
| 3 | **6,5** | 5,0 | +30% | 30 | 4,6 | 0,0 | 0,0 | 17 / 5 | 97 | 0 / 0 | 570 | Cão de Ferrugem (3) |
| 4 | 7,4 | 6,5 | +14% | 31 | 4,1 | 0,0 | 0,3 | 4 / 2 | 124 | 0 / 0 | 1.042 | Lagarto de Lastro (4) |
| 5 | 7,5 | 8,0 | -6% | 27 | 3,6 | 0,0 | 0,1 | 0 / 2 | 112 | 30 / 19 | 1.716 | Sapo-Bomba (5) |
| 6 | 9,5 | 9,5 | -0% | 29 | 3,0 | 0,0 | 0,4 | 19 / 12 | 421 | 265 / 187 | 2.537 | Enguia de Lodo (6) |
| 7 | 9,4 | 11,0 | -15% | 35 | 3,7 | 0,1 | 0,0 | 12 / 15 | 603 | 336 / 227 | 3.603 | Válvula Errante (7) |
| 8 | 9,6 | 12,5 | -23% | 42 | 4,4 | 0,0 | 0,0 | 2 / 11 | 761 | 84 / 19 | 4.890 | Garça de Ferrugem (8) |
| 9 | 14,4 | 14,0 | +3% | 48 | 3,3 | 0,5 | 0,0 | 16 / 17 | 738 | 362 / 323 | 6.421 | Autômato Escavador (9) |
| 10 | 18,5 | 15,5 | +19% | 49 | 2,7 | 0,4 | 0,0 | 18 / 26 | 1.388 | 387 / 978 | 8.290 | Rato-Engrenagem (10) |
| 11 | **10,2** | 17,0 | -40% | 60 | 5,8 | 0,0 | 0,0 | 11 / 31 | 1.594 | 169 / 0 | 10.264 | Soldador Cego (11) |
| 12 | 14,2 | 18,5 | -23% | 79 | 5,6 | 0,0 | 0,0 | 0 / 14 | 2.274 | 0 / 0 | 12.642 | Lâmina de Esteira (12) |
| 13 | 20,2 | 20,0 | +1% | 86 | 4,3 | 0,0 | 0,0 | 0 / 42 | 3.317 | 369 / 4.220 | 15.349 | Larva Térmica (13) |
| 14 | 24,4 | 21,5 | +13% | 99 | 4,1 | 0,0 | 0,0 | 29 / 51 | 4.034 | 2.858 / 394 | 18.216 | Ecoante (14) |
| 15 | 17,7 | 23,0 | -23% | 107 | 6,0 | 0,0 | 0,0 | 30 / 40 | 3.280 | 589 / 496 | 21.599 | Guardião de Galeria (15) |
| 16 | 19,6 | 24,5 | -20% | 109 | 5,6 | 0,0 | 0,0 | 83 / 48 | 3.207 | 0 / 0 | 25.096 | Aranha de Conduto (16) |
| 17 | 26,6 | 26,0 | +2% | 116 | 4,3 | 0,0 | 0,0 | 15 / 35 | 6.055 | 3.734 / 7.146 | 29.121 | Draga Viva (17) |
| 18 | **19,5** | 27,5 | -29% | 118 | 6,1 | 0,0 | 0,0 | 21 / 42 | 4.225 | 0 / 0 | 33.393 | Escória Pressurizada (18) |
| 19 | 22,6 | 29,0 | -22% | 142 | 6,3 | 0,0 | 0,0 | 23 / 50 | 5.092 | 0 / 0 | 38.064 | Escória Pressurizada (18) |
| 20 | 32,4 | 30,5 | +6% | 124 | 3,8 | 0,0 | 0,0 | 1 / 38 | 8.188 | 1.436 / 3.323 | 43.040 | Salamandra de Cisterna (21) |
| 21 | 30,0 | 32,0 | -6% | 153 | 5,1 | 0,0 | 0,0 | 0 / 44 | 9.567 | 994 / 6.099 | 48.382 | Salamandra de Cisterna (21) |
| 22 | 28,8 | 33,5 | -14% | 170 | 5,9 | 0,5 | 0,0 | 72 / 61 | 9.505 | 394 / 0 | 54.065 | Sineiro de Bronze (22) |
| 23 | 41,1 | 35,0 | +18% | 173 | 4,2 | 0,6 | 0,0 | 125 / 69 | 11.787 | 5.012 / 12.352 | 60.260 | Voz Soterrada (23) |
| 24 | 39,0 | 36,5 | +7% | 191 | 4,9 | 1,1 | 0,0 | 135 / 80 | 11.393 | 2.603 / 3.876 | 66.812 | Voz Soterrada (23) |

### Escudeiro do Alvorecer (`dawnshield`)

7,36 h do 1 ao 25 (-4% da meta; 8/8 execuções concluídas). Plano de atributos: gerado (requisitos das faixas + Força/Vitalidade 2:3). Tempo: combate 72%, deslocamento e saque 5%, recuperação 3%, viagens 20%, cidade e prova 0%, caído/fugindo 0%. Dano por fonte: ataque básico 75%, Corte Solar 17%, Lâmina do Meio-Dia 5%, dano sagrado extra 4%; acerto 80%; 1.596 de dano causado e 546 recebido por minuto; 6 de cura por minuto.

| Nível | Min | Meta | Desvio | Abates | Abates/min | Mortes | Fugas | Tônicos V/M | Ouro ganho (moedas + vendas) | Gasto: tônicos / equip. | XP de abates | Monstro principal |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **1,4** | 2,0 | -28% | 16 | 11,1 | 0,0 | 0,0 | 0 / 0 | 61 | 0 / 0 | 80 | Rato de Sulco (1) |
| 2 | 3,9 | 3,5 | +11% | 16 | 4,1 | 0,0 | 0,0 | 1 / 1 | 80 | 51 / 33 | 256 | Besouro-Brasa (2) |
| 3 | 4,2 | 5,0 | -16% | 30 | 7,2 | 0,0 | 0,8 | 18 / 1 | 39 | 0 / 0 | 570 | Cão de Ferrugem (3) |
| 4 | 5,9 | 6,5 | -9% | 37 | 6,2 | 0,0 | 0,3 | 8 / 3 | 158 | 0 / 0 | 1.043 | Cão de Ferrugem (3) |
| 5 | 7,1 | 8,0 | -12% | 29 | 4,1 | 0,0 | 0,1 | 7 / 5 | 112 | 0 / 0 | 1.693 | Sapo-Bomba (5) |
| 6 | 10,6 | 9,5 | +12% | 30 | 2,9 | 0,0 | 1,8 | 39 / 2 | 248 | 224 / 172 | 2.551 | Enguia de Lodo (6) |
| 7 | 13,5 | 11,0 | +22% | 37 | 2,7 | 0,1 | 2,5 | 31 / 3 | 512 | 306 / 189 | 3.631 | Enguia de Lodo (6) |
| 8 | 12,2 | 12,5 | -2% | 47 | 3,8 | 0,0 | 0,5 | 29 / 6 | 746 | 234 / 77 | 4.852 | Garça de Ferrugem (8) |
| 9 | 13,9 | 14,0 | -1% | 52 | 3,7 | 0,6 | 0,1 | 60 / 5 | 754 | 250 / 125 | 6.428 | Garça de Ferrugem (8) |
| 10 | **21,2** | 15,5 | +37% | 60 | 2,8 | 1,1 | 0,0 | 57 / 8 | 1.201 | 618 / 1.093 | 8.255 | Garça de Ferrugem (8) |
| 11 | 13,5 | 17,0 | -21% | 59 | 4,4 | 0,0 | 0,1 | 56 / 6 | 1.673 | 205 / 128 | 10.314 | Soldador Cego (11) |
| 12 | 14,7 | 18,5 | -21% | 79 | 5,4 | 0,0 | 0,0 | 26 / 10 | 2.233 | 0 / 0 | 12.623 | Lâmina de Esteira (12) |
| 13 | 20,4 | 20,0 | +2% | 86 | 4,2 | 0,0 | 0,0 | 20 / 14 | 3.201 | 915 / 3.511 | 15.327 | Larva Térmica (13) |
| 14 | 17,6 | 21,5 | -18% | 100 | 5,7 | 0,3 | 0,1 | 93 / 9 | 2.582 | 537 / 0 | 18.255 | Ecoante (14) |
| 15 | 23,2 | 23,0 | +1% | 113 | 4,9 | 0,5 | 0,5 | 96 / 14 | 3.724 | 3.044 / 1.168 | 21.545 | Guardião de Galeria (15) |
| 16 | 23,0 | 24,5 | -6% | 116 | 5,1 | 0,1 | 0,3 | 108 / 15 | 4.148 | 1.583 / 1.715 | 25.155 | Aranha de Conduto (16) |
| 17 | 27,9 | 26,0 | +7% | 115 | 4,1 | 0,0 | 0,0 | 82 / 15 | 5.260 | 2.112 / 3.367 | 29.089 | Draga Viva (17) |
| 18 | **20,5** | 27,5 | -25% | 119 | 5,8 | 0,0 | 0,0 | 94 / 13 | 4.144 | 0 / 0 | 33.465 | Escória Pressurizada (18) |
| 19 | 25,1 | 29,0 | -13% | 141 | 5,6 | 0,0 | 0,0 | 101 / 15 | 6.072 | 1.313 / 2.993 | 37.963 | Escória Pressurizada (18) |
| 20 | 27,6 | 30,5 | -10% | 125 | 4,5 | 0,0 | 0,0 | 78 / 17 | 7.163 | 617 / 1.336 | 43.005 | Salamandra de Cisterna (21) |
| 21 | 31,8 | 32,0 | -1% | 153 | 4,8 | 0,0 | 0,0 | 67 / 23 | 11.044 | 2.576 / 8.253 | 48.422 | Salamandra de Cisterna (21) |
| 22 | 26,9 | 33,5 | -20% | 168 | 6,2 | 0,0 | 0,0 | 157 / 21 | 8.808 | 0 / 0 | 54.081 | Sineiro de Bronze (22) |
| 23 | 38,8 | 35,0 | +11% | 165 | 4,3 | 0,0 | 0,6 | 176 / 27 | 15.639 | 7.341 / 15.849 | 60.385 | Voz Soterrada (23) |
| 24 | 36,9 | 36,5 | +1% | 164 | 4,5 | 0,0 | 0,5 | 226 / 25 | 13.079 | 5.080 / 0 | 66.728 | Toupeira de Basalto (24) |

### Lanceiro do Fosso (`pikeman`)

7,55 h do 1 ao 25 (-2% da meta; 8/8 execuções concluídas). Plano de atributos: gerado (requisitos das faixas + Força/Vitalidade 2:3). Tempo: combate 66%, deslocamento e saque 5%, recuperação 6%, viagens 23%, cidade e prova 0%, caído/fugindo 0%. Dano por fonte: ataque básico 77%, Estocada Longa 13%, Avanço do Fosso 4%, Muralha de Piques 3%, Linha Partida 3%; acerto 86%; 1.609 de dano causado e 600 recebido por minuto.

| Nível | Min | Meta | Desvio | Abates | Abates/min | Mortes | Fugas | Tônicos V/M | Ouro ganho (moedas + vendas) | Gasto: tônicos / equip. | XP de abates | Monstro principal |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **1,5** | 2,0 | -25% | 16 | 10,7 | 0,0 | 0,0 | 0 / 0 | 61 | 0 / 0 | 80 | Rato de Sulco (1) |
| 2 | 4,1 | 3,5 | +17% | 16 | 3,9 | 0,0 | 0,0 | 2 / 1 | 77 | 55 / 33 | 256 | Besouro-Brasa (2) |
| 3 | 5,3 | 5,0 | +6% | 30 | 5,7 | 0,0 | 0,9 | 24 / 1 | 60 | 0 / 0 | 572 | Cão de Ferrugem (3) |
| 4 | **8,4** | 6,5 | +29% | 35 | 4,1 | 0,0 | 1,5 | 6 / 2 | 106 | 0 / 0 | 1.044 | Cão de Ferrugem (3) |
| 5 | 9,5 | 8,0 | +19% | 26 | 2,7 | 0,0 | 0,0 | 5 / 2 | 105 | 0 / 0 | 1.691 | Sapo-Bomba (5) |
| 6 | **12,5** | 9,5 | +32% | 33 | 2,7 | 0,0 | 2,4 | 31 / 2 | 281 | 187 / 138 | 2.551 | Enguia de Lodo (6) |
| 7 | **15,5** | 11,0 | +41% | 40 | 2,6 | 0,3 | 3,6 | 41 / 3 | 464 | 295 / 202 | 3.595 | Enguia de Lodo (6) |
| 8 | 12,6 | 12,5 | +1% | 50 | 4,0 | 0,1 | 0,9 | 39 / 7 | 698 | 175 / 44 | 4.904 | Garça de Ferrugem (8) |
| 9 | **18,2** | 14,0 | +30% | 57 | 3,1 | 0,9 | 0,0 | 41 / 5 | 940 | 166 / 206 | 6.428 | Garça de Ferrugem (8) |
| 10 | **19,9** | 15,5 | +28% | 59 | 3,0 | 1,1 | 0,0 | 67 / 13 | 1.215 | 698 / 881 | 8.244 | Rato-Engrenagem (10) |
| 11 | 13,9 | 17,0 | -18% | 59 | 4,3 | 0,4 | 0,3 | 67 / 7 | 1.633 | 616 / 0 | 10.300 | Soldador Cego (11) |
| 12 | 16,0 | 18,5 | -13% | 79 | 4,9 | 0,0 | 0,1 | 33 / 9 | 2.267 | 318 / 0 | 12.656 | Lâmina de Esteira (12) |
| 13 | 19,8 | 20,0 | -1% | 86 | 4,3 | 0,0 | 0,0 | 30 / 13 | 3.226 | 1.074 / 3.074 | 15.305 | Larva Térmica (13) |
| 14 | 20,6 | 21,5 | -4% | 101 | 4,9 | 0,5 | 0,5 | 114 / 8 | 2.879 | 2.052 / 0 | 18.249 | Ecoante (14) |
| 15 | 21,1 | 23,0 | -8% | 115 | 5,5 | 0,3 | 0,4 | 113 / 14 | 3.717 | 1.932 / 0 | 21.565 | Guardião de Galeria (15) |
| 16 | 25,7 | 24,5 | +5% | 114 | 4,5 | 0,1 | 1,0 | 156 / 11 | 3.445 | 3.242 / 1.205 | 25.131 | Aranha de Conduto (16) |
| 17 | 28,3 | 26,0 | +9% | 116 | 4,1 | 0,0 | 0,0 | 106 / 14 | 4.965 | 1.229 / 3.509 | 29.153 | Draga Viva (17) |
| 18 | 25,4 | 27,5 | -8% | 119 | 4,7 | 0,0 | 0,1 | 112 / 16 | 5.655 | 3.154 / 525 | 33.391 | Escória Pressurizada (18) |
| 19 | 23,9 | 29,0 | -18% | 141 | 5,9 | 0,1 | 0,1 | 131 / 17 | 5.950 | 1.521 / 1.253 | 37.996 | Escória Pressurizada (18) |
| 20 | 26,3 | 30,5 | -14% | 124 | 4,7 | 0,0 | 0,0 | 100 / 16 | 7.135 | 822 / 1.128 | 43.090 | Salamandra de Cisterna (21) |
| 21 | 29,8 | 32,0 | -7% | 152 | 5,1 | 0,0 | 0,0 | 87 / 22 | 10.910 | 3.562 / 7.976 | 48.303 | Salamandra de Cisterna (21) |
| 22 | 27,4 | 33,5 | -18% | 169 | 6,2 | 0,1 | 0,1 | 194 / 20 | 10.333 | 1.634 / 406 | 54.134 | Sineiro de Bronze (22) |
| 23 | 34,3 | 35,0 | -2% | 166 | 4,9 | 0,1 | 0,9 | 214 / 24 | 14.207 | 6.472 / 11.095 | 60.287 | Voz Soterrada (23) |
| 24 | 33,3 | 36,5 | -9% | 172 | 5,2 | 0,6 | 0,8 | 227 / 29 | 12.858 | 5.555 / 1.439 | 66.791 | Toupeira de Basalto (24) |

### Quebraferro (`breaker`)

8,01 h do 1 ao 25 (+4% da meta; 8/8 execuções concluídas). Plano de atributos: example_builds.json (breaker_physical). Tempo: combate 67%, deslocamento e saque 5%, recuperação 4%, viagens 24%, cidade e prova 0%, caído/fugindo 0%. Dano por fonte: ataque básico 80%, Talho Profundo 12%, Ruptura 3%, dano contínuo 3%, Fenda Sísmica 2%; acerto 88%; 1.505 de dano causado e 639 recebido por minuto.

| Nível | Min | Meta | Desvio | Abates | Abates/min | Mortes | Fugas | Tônicos V/M | Ouro ganho (moedas + vendas) | Gasto: tônicos / equip. | XP de abates | Monstro principal |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1,5 | 2,0 | -25% | 16 | 10,6 | 0,0 | 0,0 | 0 / 0 | 63 | 0 / 0 | 80 | Rato de Sulco (1) |
| 2 | 3,9 | 3,5 | +11% | 16 | 4,1 | 0,0 | 0,0 | 2 / 0 | 75 | 49 / 33 | 256 | Besouro-Brasa (2) |
| 3 | 4,3 | 5,0 | -15% | 30 | 7,1 | 0,0 | 0,3 | 20 / 1 | 42 | 0 / 0 | 571 | Cão de Ferrugem (3) |
| 4 | 7,5 | 6,5 | +16% | 40 | 5,3 | 0,0 | 1,0 | 12 / 4 | 128 | 0 / 0 | 1.040 | Cão de Ferrugem (3) |
| 5 | 9,5 | 8,0 | +19% | 33 | 3,4 | 0,0 | 0,3 | 7 / 5 | 149 | 59 / 42 | 1.703 | Sapo-Bomba (5) |
| 6 | 9,8 | 9,5 | +3% | 30 | 3,1 | 0,0 | 1,6 | 35 / 2 | 250 | 203 / 145 | 2.538 | Enguia de Lodo (6) |
| 7 | 13,3 | 11,0 | +21% | 38 | 2,8 | 0,0 | 2,5 | 38 / 4 | 457 | 309 / 179 | 3.601 | Válvula Errante (7) |
| 8 | 12,7 | 12,5 | +2% | 44 | 3,5 | 0,0 | 0,6 | 29 / 6 | 729 | 109 / 5 | 4.902 | Garça de Ferrugem (8) |
| 9 | 16,6 | 14,0 | +18% | 53 | 3,2 | 1,1 | 0,3 | 55 / 8 | 865 | 555 / 246 | 6.416 | Garça de Ferrugem (8) |
| 10 | **19,5** | 15,5 | +26% | 63 | 3,2 | 1,3 | 0,0 | 72 / 6 | 1.036 | 299 / 838 | 8.247 | Garça de Ferrugem (8) |
| 11 | 16,2 | 17,0 | -5% | 62 | 3,8 | 0,4 | 0,4 | 65 / 6 | 1.723 | 1.043 / 0 | 10.297 | Soldador Cego (11) |
| 12 | 15,8 | 18,5 | -15% | 79 | 5,0 | 0,1 | 0,1 | 32 / 10 | 2.315 | 258 / 0 | 12.657 | Lâmina de Esteira (12) |
| 13 | 19,9 | 20,0 | -1% | 86 | 4,3 | 0,0 | 0,0 | 32 / 17 | 3.017 | 771 / 2.750 | 15.349 | Larva Térmica (13) |
| 14 | 20,1 | 21,5 | -7% | 101 | 5,0 | 0,8 | 0,3 | 118 / 8 | 2.814 | 1.452 / 0 | 18.229 | Ecoante (14) |
| 15 | 25,1 | 23,0 | +9% | 107 | 4,3 | 0,1 | 0,5 | 167 / 8 | 2.900 | 3.690 / 747 | 21.571 | Guardião de Galeria (15) |
| 16 | **31,3** | 24,5 | +28% | 119 | 3,8 | 0,6 | 1,1 | 172 / 14 | 4.203 | 4.238 / 0 | 25.113 | Aranha de Conduto (16) |
| 17 | **32,9** | 26,0 | +26% | 128 | 3,9 | 0,3 | 0,0 | 131 / 17 | 5.911 | 1.957 / 3.510 | 29.115 | Draga Viva (17) |
| 18 | 25,0 | 27,5 | -9% | 121 | 4,9 | 0,4 | 0,1 | 139 / 15 | 4.257 | 723 / 0 | 33.416 | Escória Pressurizada (18) |
| 19 | 31,1 | 29,0 | +7% | 141 | 4,5 | 0,1 | 0,3 | 135 / 20 | 7.474 | 4.599 / 3.678 | 37.990 | Escória Pressurizada (18) |
| 20 | 28,7 | 30,5 | -6% | 125 | 4,4 | 0,0 | 0,0 | 122 / 15 | 7.848 | 1.727 / 2.080 | 43.091 | Salamandra de Cisterna (21) |
| 21 | 29,5 | 32,0 | -8% | 153 | 5,2 | 0,0 | 0,0 | 96 / 20 | 9.997 | 2.538 / 4.278 | 48.382 | Salamandra de Cisterna (21) |
| 22 | 31,1 | 33,5 | -7% | 171 | 5,5 | 0,4 | 0,0 | 188 / 22 | 11.892 | 2.586 / 1.259 | 54.013 | Sineiro de Bronze (22) |
| 23 | 36,4 | 35,0 | +4% | 167 | 4,6 | 0,1 | 0,8 | 241 / 26 | 13.452 | 6.471 / 10.911 | 60.331 | Voz Soterrada (23) |
| 24 | 39,2 | 36,5 | +7% | 182 | 4,6 | 1,0 | 0,5 | 249 / 26 | 13.999 | 6.380 / 921 | 66.833 | Voz Soterrada (23) |

### Bastião de Bronze (`bastion`)

8,10 h do 1 ao 25 (+5% da meta; 8/8 execuções concluídas). Plano de atributos: gerado (requisitos das faixas + Força/Vitalidade 2:3). Tempo: combate 72%, deslocamento e saque 4%, recuperação 3%, viagens 20%, cidade e prova 0%, caído/fugindo 0%. Dano por fonte: ataque básico 83%, Pulso de Atração 9%, Engrenagem Travada 7%; acerto 85%; 1.486 de dano causado e 500 recebido por minuto.

| Nível | Min | Meta | Desvio | Abates | Abates/min | Mortes | Fugas | Tônicos V/M | Ouro ganho (moedas + vendas) | Gasto: tônicos / equip. | XP de abates | Monstro principal |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1,6 | 2,0 | -21% | 16 | 10,1 | 0,0 | 0,0 | 0 / 0 | 61 | 0 / 0 | 80 | Rato de Sulco (1) |
| 2 | 4,4 | 3,5 | +24% | 16 | 3,7 | 0,0 | 0,0 | 1 / 1 | 80 | 54 / 33 | 256 | Besouro-Brasa (2) |
| 3 | 5,4 | 5,0 | +9% | 30 | 5,6 | 0,0 | 0,8 | 20 / 1 | 38 | 0 / 0 | 570 | Cão de Ferrugem (3) |
| 4 | **8,8** | 6,5 | +35% | 37 | 4,2 | 0,0 | 1,1 | 10 / 1 | 105 | 0 / 0 | 1.049 | Cão de Ferrugem (3) |
| 5 | 8,2 | 8,0 | +3% | 29 | 3,5 | 0,0 | 0,0 | 3 / 6 | 126 | 0 / 0 | 1.689 | Sapo-Bomba (5) |
| 6 | 10,9 | 9,5 | +15% | 31 | 2,9 | 0,0 | 2,3 | 27 / 3 | 254 | 164 / 124 | 2.551 | Enguia de Lodo (6) |
| 7 | **14,8** | 11,0 | +34% | 35 | 2,4 | 0,0 | 3,3 | 39 / 3 | 462 | 328 / 241 | 3.593 | Válvula Errante (7) |
| 8 | 13,5 | 12,5 | +8% | 47 | 3,4 | 0,0 | 0,4 | 28 / 8 | 835 | 265 / 109 | 4.882 | Garça de Ferrugem (8) |
| 9 | 15,6 | 14,0 | +11% | 50 | 3,2 | 0,6 | 0,5 | 71 / 6 | 754 | 359 / 286 | 6.444 | Autômato Escavador (9) |
| 10 | **21,1** | 15,5 | +36% | 54 | 2,6 | 1,0 | 0,3 | 76 / 7 | 1.254 | 730 / 514 | 8.247 | Rato-Engrenagem (10) |
| 11 | 18,1 | 17,0 | +7% | 60 | 3,3 | 0,5 | 0,5 | 90 / 5 | 1.539 | 499 / 171 | 10.359 | Soldador Cego (11) |
| 12 | 20,7 | 18,5 | +12% | 79 | 3,8 | 0,0 | 0,1 | 38 / 10 | 2.383 | 564 / 269 | 12.627 | Lâmina de Esteira (12) |
| 13 | 23,9 | 20,0 | +19% | 85 | 3,6 | 0,0 | 0,0 | 25 / 13 | 3.051 | 756 / 3.143 | 15.260 | Larva Térmica (13) |
| 14 | 19,8 | 21,5 | -8% | 100 | 5,1 | 0,4 | 0,3 | 99 / 9 | 2.573 | 945 / 0 | 18.231 | Ecoante (14) |
| 15 | 25,2 | 23,0 | +9% | 115 | 4,6 | 0,3 | 0,5 | 113 / 11 | 3.381 | 2.325 / 946 | 21.593 | Guardião de Galeria (15) |
| 16 | 28,8 | 24,5 | +18% | 116 | 4,0 | 0,1 | 0,6 | 129 / 11 | 3.801 | 2.700 / 2.229 | 25.154 | Aranha de Conduto (16) |
| 17 | 32,1 | 26,0 | +23% | 115 | 3,6 | 0,0 | 0,1 | 84 / 16 | 5.136 | 1.562 / 2.569 | 29.114 | Draga Viva (17) |
| 18 | 25,0 | 27,5 | -9% | 118 | 4,7 | 0,0 | 0,0 | 101 / 12 | 4.304 | 372 / 379 | 33.387 | Escória Pressurizada (18) |
| 19 | 26,9 | 29,0 | -7% | 141 | 5,3 | 0,0 | 0,1 | 101 / 17 | 6.161 | 1.449 / 1.298 | 38.030 | Escória Pressurizada (18) |
| 20 | 32,6 | 30,5 | +7% | 125 | 3,8 | 0,0 | 0,0 | 86 / 15 | 7.816 | 2.152 / 3.277 | 43.100 | Salamandra de Cisterna (21) |
| 21 | 33,7 | 32,0 | +5% | 153 | 4,5 | 0,0 | 0,0 | 56 / 23 | 12.030 | 2.562 / 7.545 | 48.343 | Salamandra de Cisterna (21) |
| 22 | 29,0 | 33,5 | -13% | 168 | 5,8 | 0,0 | 0,0 | 142 / 21 | 10.069 | 797 / 0 | 54.078 | Sineiro de Bronze (22) |
| 23 | 34,4 | 35,0 | -2% | 169 | 4,9 | 0,3 | 0,5 | 154 / 24 | 12.600 | 4.514 / 8.931 | 60.250 | Voz Soterrada (23) |
| 24 | 32,0 | 36,5 | -13% | 175 | 5,5 | 0,1 | 0,1 | 209 / 20 | 10.886 | 1.853 / 4.211 | 66.756 | Toupeira de Basalto (24) |

## Economia: ouro ganho × gasto (tônicos e equipamento)

Ganho = moedas saqueadas + vendas ao comerciante (sucata, peças substituídas e de outras classes, a `value × economy.sellFraction`). Gasto = tônicos na loja da cidade e peças comuns no armeiro (`value × economy.gearPriceMult`), sempre com ouro real (`buy`/`sell`). "Fatia" = gasto ÷ ganho.

| Classe | Moedas | Vendas | Gasto em tônicos | Gasto em equipamento | Fatia tônicos / equip. | Saldo no nível 25 | Ganho/h | Tônicos usados (V+M) | Itens vendidos | Idas à loja |
|---|---|---|---|---|---|---|---|---|---|---|
| Andarilha do Vento | 74.594 | 18.980 | 26.010 | 39.064 | 28% / 42% | 28.500 | 14.226 | 1.913 | 843 | 11,5 |
| Tecelão da Brasa | 75.118 | 18.716 | 27.980 | 35.665 | 30% / 38% | 30.190 | 14.242 | 1.905 | 791 | 12,5 |
| Vigia do Espinhal | 75.287 | 20.045 | 26.928 | 36.294 | 28% / 38% | 32.110 | 13.989 | 1.905 | 834 | 10,8 |
| Cantora do Véu | 73.871 | 14.039 | 19.675 | 39.690 | 22% / 45% | 28.545 | 12.101 | 1.368 | 676 | 10,4 |
| Escudeiro do Alvorecer | 73.031 | 19.648 | 27.003 | 40.008 | 29% / 43% | 25.668 | 12.586 | 1.887 | 812 | 12,0 |
| Lanceiro do Fosso | 72.718 | 20.465 | 34.757 | 33.114 | 37% / 36% | 25.311 | 12.342 | 2.195 | 920 | 13,4 |
| Quebraferro | 72.566 | 23.025 | 40.015 | 31.621 | 42% / 33% | 23.955 | 11.932 | 2.416 | 946 | 14,9 |
| Bastião de Bronze | 71.579 | 18.118 | 24.949 | 36.274 | 28% / 40% | 28.473 | 11.071 | 1.942 | 751 | 13,5 |

Por faixa de nível (média das classes): ouro ganho e gasto por hora, a fatia do ganho que vai para tônicos e para equipamento, e tônicos bebidos por hora.

| Níveis | Ganho/h | Tônicos/h (ouro) | Equipamento/h (ouro) | Fatia tônicos / equip. | Tônicos bebidos/h | Classe que mais gasta em tônicos (fatia) |
|---|---|---|---|---|---|---|
| 1–4 | 1.181 | 178 | 116 | 15% / 10% | 108 | Bastião de Bronze (19%) |
| 5–8 | 2.552 | 1.057 | 638 | 42% / 25% | 173 | Tecelão da Brasa (49%) |
| 9–12 | 5.618 | 1.466 | 1.170 | 27% / 21% | 215 | Quebraferro (36%) |
| 13–16 | 9.955 | 4.655 | 4.056 | 48% / 41% | 294 | Quebraferro (78%) |
| 17–20 | 14.031 | 3.369 | 5.194 | 24% / 37% | 245 | Quebraferro (35%) |
| 21–24 | 22.448 | 6.521 | 9.654 | 29% / 43% | 347 | Quebraferro (36%) |

- O ouro ganho por hora cresce de ~1.181/h (níveis 1–4) para ~22.448/h (21–24); o gasto com tônicos acompanha o dano recebido, não o nível: classes de distância que matam antes do contato compram pouco.
- Preço dos tônicos = 2 × valor (Pequeno de Vida 8, Médio de Vida 24, Pequeno de Mana 10, Médio de Mana 30); peças do armeiro = 2,5 × valor; venda ao comerciante = 0,50 × valor.

## Efeito da prova de classe (habilidade do nível 10)

A rodada principal faz a prova de classe no nível 10 (premissas). Para medir também a caça pura, sem nenhuma missão, as mesmas sementes foram simuladas **sem a prova**: sem a habilidade marcante do nível 10 e sem o tempo da viagem e da luta na arena. Média das classes: **7,28 h com prova** (-5% da meta) e **7,09 h sem prova** (-8%).

| Classe | Habilidade do nível 10 | Horas com prova | Horas sem prova | Diferença | Min nos níveis 10–24 (com / sem) | Mortes (com / sem) |
|---|---|---|---|---|---|---|
| Tecelão da Brasa | Círculo de Fuligem | 6,59 | 6,97 | +6% | 317 / 340 | 4,6 / 6,8 |
| Vigia do Espinhal | Chuva de Espinhos | 6,81 | 6,78 | -0% | 344 / 343 | 4,3 / 4,9 |
| Andarilha do Vento | Vento a Favor | 6,58 | 6,52 | -1% | 330 / 327 | 4,4 / 4,9 |
| Cantora do Véu | Selo do Véu | 7,26 | 7,11 | -2% | 365 / 355 | 3,3 / 3,3 |
| Lanceiro do Fosso | Avanço do Fosso | 7,55 | 7,33 | -3% | 366 / 353 | 4,6 / 7,1 |
| Escudeiro do Alvorecer | Juramento | 7,36 | 7,07 | -4% | 369 / 352 | 2,8 / 2,3 |
| Quebraferro | Ruptura | 8,01 | 7,55 | -6% | 402 / 374 | 6,6 / 7,9 |
| Bastião de Bronze | Reforço de Campo | 8,10 | 7,37 | -9% | 403 / 359 | 3,3 / 2,6 |

| Nível | Meta (min) | Média com prova | Média sem prova |
|---|---|---|---|
| 10 | 15,5 | 18,9 | 17,2 |
| 11 | 17,0 | 14,0 | 12,9 |
| 12 | 18,5 | 15,7 | 14,8 |
| 13 | 20,0 | 20,5 | 19,8 |
| 14 | 21,5 | 19,0 | 18,1 |
| 15 | 23,0 | 21,1 | 20,3 |
| 16 | 24,5 | 23,5 | 23,4 |
| 17 | 26,0 | 27,2 | 25,9 |
| 18 | 27,5 | 21,3 | 20,8 |
| 19 | 29,0 | 25,7 | 24,2 |
| 20 | 30,5 | 28,1 | 28,3 |
| 21 | 32,0 | 29,0 | 29,1 |
| 22 | 33,5 | 29,5 | 27,1 |
| 23 | 35,0 | 33,3 | 34,5 |
| 24 | 36,5 | 35,1 | 34,1 |

Prova: 64 de 64 execuções venceram (1,0 tentativa(s) por execução em média; 47 s de luta na arena). A diferença de tempo inclui a ida à cidade da classe e a volta (2 × as trocas de mapa até lá). Com a habilidade extra o bot gasta mana em mais uma habilidade; ele só usa reforços de defesa caros, escudos e áreas em volta de si quando a luta pede (vários atacantes ou vida baixa), e nunca usa área que acorde monstro parado.

## Equipamento

Peças comuns do kit da faixa (arma + mão secundária + 4 de armadura) compradas no armeiro com ouro, e quantos minutos de jogo depois de chegar ao nível da faixa o kit ficou completo (equipado ou na bolsa à espera de requisito). "Já tinha" conta peças da faixa que o bot já possuía ao chegar (saque ou compra adiantada).

| Classe | Peças compradas | Já tinha ao chegar | Melhorias do chão | Kit 5: atraso (min) | Kit 9: atraso (min) | Kit 13: atraso (min) | Kit 17: atraso (min) | Kit 21: atraso (min) | Exemplos do chão |
|---|---|---|---|---|---|---|---|---|---|
| Andarilha do Vento | 41,8 | 6,4 | 5,4 | 22 | 26 | 3 | 3 | 4 | `ring_t5`, `light_boots_t17`, `light_shield_t17`, `ring_t17`, `ring_t25`, `amulet_t13`, `amulet_t17`, `ring_t21` |
| Tecelão da Brasa | 41,0 | 6,4 | 5,3 | 25 | 31 | 5 | 5 | 0 | `robe_sandals_t5`, `robe_gloves_t9`, `ring_t9`, `ring_t13`, `robe_gloves_t21`, `ring_t21`, `robe_circlet_t1`, `amulet_second_toll` |
| Vigia do Espinhal | 41,3 | 8,4 | 6,3 | 19 | 20 | 4 | 3 | 3 | `ring_t5`, `light_hood_t5`, `light_gloves_t17`, `amulet_t17`, `light_armor_t25`, `light_boots_t21`, `quiver_t25`, `quiver_t9` |
| Cantora do Véu | 43,6 | 4,3 | 6,5 | 21 | 22 | 3 | 6 | 3 | `amulet_t9`, `scepter_t17`, `robe_circlet_t21`, `amulet_t21`, `focus_t21`, `ring_t21`, `robe_gloves_t25`, `amulet_t5` |
| Escudeiro do Alvorecer | 41,8 | 5,8 | 5,1 | 31 | 30 | 3 | 7 | 4 | `heavy_armor_t5`, `ring_t5`, `heavy_helm_t21`, `amulet_t17`, `shield_t25`, `amulet_t9`, `ring_t17`, `heavy_gloves_t9` |
| Lanceiro do Fosso | 35,5 | 3,1 | 4,3 | 38 | 27 | 3 | 11 | 5 | `amulet_t1`, `ring_t1`, `ring_t9`, `heavy_boots_t9`, `heavy_boots_t17`, `ring_t21`, `amulet_t21`, `amulet_t25` |
| Quebraferro | 34,9 | 4,3 | 4,6 | 28 | 25 | 3 | 13 | 3 | `heavy_armor_t5`, `axe_1h_t17`, `ring_t17`, `amulet_t25`, `ring_t1`, `amulet_t5`, `amulet_t13`, `heavy_gloves_t17` |
| Bastião de Bronze | 39,6 | 6,3 | 4,3 | 37 | 41 | 7 | 19 | 6 | `amulet_t13`, `ring_t13`, `ring_t21`, `amulet_t21`, `ring_t25`, `amulet_t5`, `amulet_t17`, `shield_t25` |

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

1. **Equilíbrio entre classes na caça solo:** Andarilha do Vento chega ao nível 25 em 6,58 h e Bastião de Bronze em 8,10 h (1,2×). Todas as classes ficam a até ±25% da meta total (de -15% a +5%).
2. **Dano por classe:** Tecelão da Brasa 1.820/min (básico 39%, Faísca de Vidro 28%; recebe 404/min); Andarilha do Vento 1.795/min (básico 89%, Arremesso de Retorno 7%; recebe 554/min); Vigia do Espinhal 1.760/min (básico 85%, Flecha de Passagem 6%; recebe 547/min); Cantora do Véu 1.664/min (básico 54%, Nota Clara 46%; recebe 759/min); Lanceiro do Fosso 1.609/min (básico 77%, Estocada Longa 13%; recebe 600/min); Escudeiro do Alvorecer 1.596/min (básico 75%, Corte Solar 17%; recebe 546/min); Quebraferro 1.505/min (básico 80%, Talho Profundo 12%; recebe 639/min); Bastião de Bronze 1.486/min (básico 83%, Pulso de Atração 9%; recebe 500/min). Média: 1.654 de dano causado por minuto.
3. **Ataque básico ainda é quase todo o dano de:** Bastião de Bronze (83%), Vigia do Espinhal (85%), Andarilha do Vento (89%).
4. **Cantora do Véu antes do nível 15:** -4% da meta somando os níveis 1–14; é a classe mais lenta nos níveis 2, 3, 14. Nota Clara (nível 5) faz 46% do dano da rodada inteira; as curas somam 228 de vida por minuto.
5. **Curva de XP:** todos os níveis ficam a até ±25% da meta na média das classes (maior desvio: nível 18, -23%). O total 1→25 fica em -5% da meta. Ritmo médio: 10,1 abates/min no nível 1, 4,8 na média dos níveis.
6. **Onde se morre:** níveis com mais mortes: 10 (0,83 por classe), 24 (0,83 por classe), 9 (0,74 por classe), 11 (0,30 por classe). Monstros que mais derrubam (mortes por execução, somando as classes; um monstro conta em toda morte em que estava batendo): Autômato Escavador (nv 9, agressivo) 7,0, Rato-Engrenagem (nv 10, agressivo) 5,6, Toupeira de Basalto (nv 24, agressivo) 4,9, Sineiro de Bronze (nv 22, agressivo) 3,5, Voz Soterrada (nv 23, agressivo) 3,1. Mortes por classe (média por execução): Andarilha do Vento 4,4, Tecelão da Brasa 4,6, Vigia do Espinhal 4,3, Cantora do Véu 3,3, Escudeiro do Alvorecer 2,8, Lanceiro do Fosso 4,6, Quebraferro 6,6, Bastião de Bronze 3,3 — 4,2 em média. Quase toda queda é numa briga com vários monstros ao mesmo tempo (de 3,9 a 5,0 atacantes, em média, nos 10 s antes de cair; 89% a 100% das mortes com 3 ou mais). Todas as classes entram em brigas com 4 ou mais monstros num ritmo parecido (4,5 a 7,0 por hora: assistência dos iguais a até 8 m, agressão por proximidade e monstros que reaparecem perto); o que muda é quanto cada uma aguenta: mortes por briga dessas de 0,05 (Escudeiro do Alvorecer) a 0,14 (Tecelão da Brasa). Do nível 9 em diante, 40% a 100% das mortes acontecem já sem tônico médio na bolsa (o bot só compra o médio quando o ouro paga 40 e segue caçando com os pequenos quando os médios acabam).
7. **Mecânicas dos monstros:** cada execução vê em média 801 golpes avisados; o bot estava dentro de 769, saiu 779 vezes e esperou fora (sem entrar para atacar) 290 vezes. O que ainda acerta — áreas em que a reação de 0,6 s não bastou e as mecânicas sem aviso — soma de 0,6% a 1,5% do dano recebido; mais dano: Eco (Ecoante, 2.413 por execução), Explosão de Escória (Escória Pressurizada, 107 por execução), Arrasto (Draga Viva, 16 por execução).
8. **Economia:** do ouro ganho (moedas + vendas), os tônicos levam de 22% a 42% (mais: Quebraferro) e o equipamento do armeiro de 33% a 45%; juntos, 66% a 75%. As vendas ao comerciante são 21% do ganho. Saldo ao chegar ao nível 25: 23.955 a 32.110 de ouro (inclui o que sobra para o kit da faixa 25, que o bot só compra adiantado com ouro de sobra).
9. **Equipamento comprado no armeiro:** 39,9 peças por classe em média; o kit comum fica completo, em média, 27 min depois do nível 5, 28 min depois do nível 9, 4 min depois do nível 13, 8 min depois do nível 17, 3 min depois do nível 21 (o atraso é o tempo de juntar o ouro e ir à cidade). Pelo saque chegam 5,2 melhorias por classe.
10. **Conjuração e recarga global:** Vigia do Espinhal conjurou 90 vezes (89 concluídas, 1 interrompidas); Tecelão da Brasa conjurou 171 vezes (170 concluídas, 1 interrompidas). O bot só começa a conjurar parado e não age durante a conjuração; com a recarga global de 1,0 s ele não tenta outra habilidade antes do fim dela.

## Modo acelerado e desempenho da ferramenta

- Laço de `server.step(100)` (100 ms de jogo por chamada) num GameServer sem `start()`: banco SQLite em memória (`--banco-arquivo` usa um arquivo temporário), modo dev, sessões falsas e pedidos síncronos por `server.onMessage`. 466 h de jogo simuladas em 13,3 min de CPU (2.106× o tempo real por linha de execução); 3 linhas de execução (`worker_threads`) em paralelo, 9,1 min de relógio no total.
- Temporizadores do jogo usam `zone.now` (soma dos dt): recargas, conjurações, efeitos, regeneração, tônicos, ataques e reaparecimento funcionam acelerados sem ajuste. `Date.now()` aparece em prazos de relógio de parede (validade do saque de 30 min, dia da elite diária, carimbos do banco, convites e calabouço); dentro da simulação ele segue o tempo simulado, para esses prazos correrem no ritmo do jogo.
- Zonas abertas sem jogador param 30 s depois que o último jogador sai e, quando alguém entra, o relógio da zona é adiantado até o tempo global (o valor que teria sem parar), então monstros mortos reaparecem e recargas levadas entre zonas continuam valendo; instâncias não são tocadas. 87% dos ticks de zona foram pulados. Um passo com só a zona ativa custa ~20–40 µs.
- Snapshots: o bot pede `{ delta: true }` no login. Se o servidor manda diferenças, elas são mescladas como em `mergeSnap` (test/helpers/client.js); se manda o snapshot completo, só o último é decodificado, quando o bot olha o mundo. Nesta rodada o servidor mandou diferenças. A sessão falsa nasce por `server.onConnection` (com um ws falso) e a simulação desliga o limite de comandos por conexão (`rateLimit`), que é medido em tempo real. Mensagens `hit`/`heal` alimentam a contabilidade de dano e `cast_end` encerra a conjuração do bot; as de efeito visual são descartadas sem decodificar.
