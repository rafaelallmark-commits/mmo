<!-- Arquivo gerado por `npm run gen-docs` (server/tools/gen-docs.js) a partir de /data. Edite os dados, não este arquivo. -->


# 4. Níveis, XP, equipamento e fórmulas

## 4.1 Pontos de atributo

Atributos permanentes = iniciais da classe + pontos distribuídos. São os únicos que contam para requisitos: bônus de itens, tônicos e efeitos temporários nunca liberam um item. A partir do nível 2 o personagem ganha 5 pontos por nível.

| Nível | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Pontos totais | 0 | 5 | 10 | 15 | 20 | 25 | 30 | 35 | 40 | 45 | 50 | 55 | 60 | 65 | 70 | 75 | 80 | 85 | 90 | 95 |

## 4.2 Tabela de XP acumulada (níveis 1–20)

Calibração: 3 abates por minuto de caça ativa solo contra monstros do mesmo nível (inclui deslocamento e pausas curtas). Os tempos são **metas de teste** para o Marco 4 medir e ajustar, não promessas. Missões principais somam cerca de 30% do XP de cada capítulo, então quem faz caça + missões chega ao nível 20 em cerca de 70% do tempo de quem só caça.

| Nível | XP acumulada | XP para o próximo | Monstro típico do nível (XP) | Abates solo | Meta só caça | Meta caça + missões | Acumulado só caça |
|---|---|---|---|---|---|---|---|
| 1 | 0 | 80 | Rato de Sulco (14) | 6 | 2 min | 1,4 min | 0 h |
| 2 | 80 | 250 | Besouro-Brasa (24) | 11 | 3,5 min | 2,4 min | 0,1 h |
| 3 | 330 | 570 | Cão de Ferrugem (38) | 15 | 5 min | 3,5 min | 0,2 h |
| 4 | 900 | 1.030 | Lagarto de Lastro (53) | 20 | 6,5 min | 4,6 min | 0,3 h |
| 5 | 1.930 | 1.680 | Javali de Cinza (70) | 24 | 8 min | 5,6 min | 0,4 h |
| 6 | 3.610 | 2.540 | Enguia de Lodo (89) | 29 | 9,5 min | 6,7 min | 0,6 h |
| 7 | 6.150 | 3.600 | Válvula Errante (109) | 34 | 11 min | 7,7 min | 0,8 h |
| 8 | 9.750 | 4.880 | Garça de Ferrugem (130) | 38 | 12,5 min | 8,8 min | 1 h |
| 9 | 14.630 | 6.430 | Sanguessuga Fervente (153) | 43 | 14 min | 9,8 min | 1,2 h |
| 10 | 21.060 | 8.230 | Rato-Engrenagem (177) | 47 | 15,5 min | 10,9 min | 1,5 h |
| 11 | 29.290 | 10.300 | Soldador Cego (202) | 51 | 17 min | 11,9 min | 1,7 h |
| 12 | 39.590 | 12.650 | Lâmina de Esteira (228) | 56 | 18,5 min | 13 min | 2,1 h |
| 13 | 52.240 | 15.300 | Larva Térmica (255) | 60 | 20 min | 14 min | 2,4 h |
| 14 | 67.540 | 18.250 | Ecoante (283) | 65 | 21,5 min | 15,1 min | 2,7 h |
| 15 | 85.790 | 21.530 | Guardião de Galeria (312) | 70 | 23 min | 16,1 min | 3,1 h |
| 16 | 107.320 | 25.140 | Aranha de Conduto (342) | 74 | 24,5 min | 17,2 min | 3,5 h |
| 17 | 132.460 | 29.090 | Draga Viva (373) | 78 | 26 min | 18,2 min | 4 h |
| 18 | 161.550 | 33.410 | Escória Pressurizada (405) | 83 | 27,5 min | 19,3 min | 4,4 h |
| 19 | 194.960 | 38.020 | Escória Pressurizada (405) | 94 | 29 min | 20,3 min | 4,9 h |
| 20 | 232.980 | — | — | — | — | — | — |

## 4.3 XP por monstro

XP base = round(8 + 6 × nível^1,45). Elite ×4, chefe ×20. O XP recebido é multiplicado pela diferença de nível (monstro − jogador): monstros acima do nível dão mais (e batem mais forte); muito abaixo, quase nada.

| Diferença (monstro − jogador) | -6 | -5 | -4 | -3 | -2 | -1 | 0 | +1 | +2 | +3 | +4 | +5 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Multiplicador | 0,1 | 0,3 | 0,5 | 0,7 | 0,9 | 1 | 1 | 1,1 | 1,2 | 1,3 | 1,4 | 1,4 |

Fora da tabela vale o extremo (−6 ou menos: ×0,1; +5 ou mais: ×1,4).

| Monstro | Área | Nível | Tipo | Comportamento | Vida | Dano | Defesa | XP base | XP p/ jogador 2 níveis acima |
|---|---|---|---|---|---|---|---|---|---|
| Rato de Sulco | A Estrada Velha | 1 | normal | passivo | 45 | 2–4 | 2 | 14 | 12 |
| Besouro-Brasa | A Estrada Velha | 2 | normal | passivo | 63 | 4–6 | 5 | 24 | 20 |
| Cão de Ferrugem | A Estrada Velha | 3 | normal | agressivo (8 m) | 81 | 5–7 | 8 | 38 | 32 |
| Lagarto de Lastro | A Estrada Velha | 4 | normal | passivo | 99 | 7–9 | 11 | 53 | 45 |
| Javali de Cinza | A Estrada Velha | 5 | normal | agressivo (8 m) | 117 | 8–10 | 14 | 70 | 60 |
| Capataz Rachado | A Estrada Velha | 4 | elite | agressivo (10 m) | 396 | 11–14 | 14 | 212 | 180 |
| Sapo-Bomba | Brejo das Bombas | 5 | normal | passivo | 117 | 8–10 | 14 | 70 | 60 |
| Enguia de Lodo | Brejo das Bombas | 6 | normal | agressivo (8 m) | 135 | 10–12 | 17 | 89 | 76 |
| Válvula Errante | Brejo das Bombas | 7 | normal | agressivo (8 m) | 153 | 12–14 | 20 | 109 | 93 |
| Garça de Ferrugem | Brejo das Bombas | 8 | normal | passivo | 171 | 13–15 | 23 | 130 | 111 |
| Sanguessuga Fervente | Brejo das Bombas | 9 | normal | agressivo (8 m) | 189 | 15–17 | 26 | 153 | 130 |
| Bomba-Mestra Desregulada | Brejo das Bombas | 8 | elite | agressivo (10 m) | 684 | 20–23 | 30 | 520 | 442 |
| Autômato Escavador | Oficina Soterrada | 9 | normal | agressivo (8 m) | 189 | 15–17 | 26 | 153 | 130 |
| Rato-Engrenagem | Oficina Soterrada | 10 | normal | agressivo (8 m) | 207 | 16–18 | 29 | 177 | 150 |
| Soldador Cego | Oficina Soterrada | 11 | normal | agressivo (8 m) | 225 | 18–20 | 32 | 202 | 172 |
| Lâmina de Esteira | Oficina Soterrada | 12 | normal | passivo | 243 | 20–22 | 35 | 228 | 194 |
| Supervisor de Turno | Oficina Soterrada | 11 | elite | agressivo (10 m) | 900 | 27–30 | 42 | 808 | 687 |
| Morcego de Eco | Galerias do Eco | 12 | normal | agressivo (8 m) | 243 | 20–22 | 35 | 228 | 194 |
| Larva Térmica | Galerias do Eco | 13 | normal | passivo | 261 | 21–23 | 38 | 255 | 217 |
| Ecoante | Galerias do Eco | 14 | normal | agressivo (8 m) | 279 | 23–25 | 41 | 283 | 241 |
| Guardião de Galeria | Galerias do Eco | 15 | normal | agressivo (8 m) | 297 | 24–26 | 44 | 312 | 265 |
| Aranha de Conduto | Galerias do Eco | 16 | normal | agressivo (8 m) | 315 | 26–28 | 47 | 342 | 291 |
| Mãe do Eco | Galerias do Eco | 15 | elite | agressivo (10 m) | 1188 | 36–39 | 57 | 1248 | 1061 |
| Vigia de Comporta | Canais da Eclusa | 16 | normal | agressivo (8 m) | 315 | 26–28 | 47 | 342 | 291 |
| Draga Viva | Canais da Eclusa | 17 | normal | agressivo (8 m) | 333 | 28–30 | 50 | 373 | 317 |
| Escória Pressurizada | Canais da Eclusa | 18 | normal | agressivo (8 m) | 351 | 29–31 | 53 | 405 | 344 |
| Fragmento do Custódio | Canais da Eclusa | 19 | elite | agressivo (10 m) | 1476 | 47–50 | 73 | 1748 | 1486 |
| O Custódio da Eclusa | A Última Eclusa (calabouço) | 20 | chefe | agressivo (10 m) | 9675 | 64–68 | 89 | 9400 | 7990 |

### Exemplo solo

Quebraferro nível 3 caçando **Cão de Ferrugem** (nível 3, 38 XP). Para o nível 4 faltam 570 XP → 15 abates. A 3 abates/min: **5 min**. Os cães andam em matilha (quem é atingido chama os vizinhos a 8 m), então o solo precisa puxar um por vez pela borda do grupo.

### Exemplo em grupo

Quebraferro e Tecelão, ambos nível 7, caçando **Válvula Errante** (nível 7, 109 XP) no Brejo das Bombas. Com participação igual (50% / 50%) e bônus de cooperação de 10% por participante extra, cada um recebe 60 XP por abate. Em dupla matam ~5,7 por minuto (o dobro do solo menos 5% de coordenação): **342 XP/min para cada um** contra 327 XP/min solo — um pouco mais rápido, com menos tônicos gastos e acesso a pontos com 4–6 monstros juntos que um solo não aguenta. Para o nível 8 (3.600 XP) cada um leva cerca de 10,5 min. Se a divisão for 55% / 45%, quem causa menos dano recebe 54 por abate (308 XP/min, abaixo do solo): é por isso que, no M2, cura, proteção e controle contam como participação.

No M2, a participação também conta cura (×0,8), dano absorvido em proteção (×0,6) e controle (6 pontos por segundo de controle), para que Bastião e Cantora recebam XP justo sem causar dano. Só recebe quem está a até 40 m do monstro na morte.


## 4.4 Equipamento por faixa

Faixas nos níveis 1, 5, 9, 13 e 17, com recompensas únicas no 20. Todo item tem nível mínimo explícito. O comum de cada faixa sustenta a evolução; incomum, raro e único têm destaque visual crescente (cinza claro, verde, azul, laranja). "Duas mãos" ocupa também a mão secundária até ser desequipada. Itens podem ser carregados e guardados antes do nível.


### Faixa 1

| Arma | Família | Empunhadura | Dano | Intervalo | Alcance | Poder mág. | Requisitos | Classes | Raridade |
|---|---|---|---|---|---|---|---|---|---|
| Machado de Lasca | Machado (1 mão) | uma mão | 4–8 fís. | 1,1 s | 2.5 m | — | nv 1; For 14, Tal 9 | Quebraferro | comum |
| Machado de Lenhador | Machado (2 mãos) | duas mãos | 6–12 fís. | 1,5 s | 2.5 m | — | nv 1; For 16, Tal 7 | Quebraferro | comum |
| Garra de Arame | Garra mecânica | uma mão | 3–7 fís. | 1 s | 2.5 m | — | nv 1; For 12, Tal 12 | Bastião de Bronze | comum |
| Martelo de Rebitar | Martelo (1 mão) | uma mão | 4–8 fís. | 1,2 s | 2.5 m | — | nv 1; For 14, Tal 9 | Bastião de Bronze | comum |
| Lança de Freixo | Lança/pique (2 mãos) | duas mãos | 5–11 fís. | 1,3 s | 3.5 m | — | nv 1; For 14, Tal 9 | Lanceiro do Fosso | comum |
| Arco de Vime | Arco | uma mão | 4–8 fís. | 1,2 s | 18 m | — | nv 1; Agi 14, Tal 9 | Vigia do Espinhal | comum |
| Espada de Guarda | Espada (1 mão) | uma mão | 4–8 fís. | 1 s | 2.5 m | — | nv 1; For 14, Esp 9 | Escudeiro do Alvorecer | comum |
| Montante de Guarda | Espada (2 mãos) | duas mãos | 6–12 fís. | 1,4 s | 2.5 m | — | nv 1; For 15, Esp 9 | Escudeiro do Alvorecer | comum |
| Azagaia de Junco | Azagaia arremessável (1 mão) | uma mão | 4–8 fís. | 1,1 s | 14 m | — | nv 1; Agi 14, Tal 9 | Andarilha do Vento | comum |
| Varinha de Vidro Bruto | Varinha | uma mão | 3–6 mág. | 1,2 s | 16 m | 4 | nv 1; Esp 15, Tal 9 | Cantora do Véu, Tecelão da Brasa | comum |
| Cetro de Latão | Cetro | uma mão | 3–7 mág. | 1,3 s | 14 m | 4 | nv 1; Esp 15, Tal 9 | Cantora do Véu | comum |
| Cajado de Aprendiz | Cajado (2 mãos) | duas mãos | 5–9 mág. | 1,5 s | 18 m | 7 | nv 1; Esp 15, Tal 9 | Cantora do Véu, Tecelão da Brasa | comum |

| Item | Família | Espaço | Defesa | Outros | Requisitos | Classes |
|---|---|---|---|---|---|---|
| Couraça de Ferro Batido | Armadura pesada | Corpo | 6 | res. mág. 1 | nv 1; For 12 | Quebraferro, Bastião de Bronze, Lanceiro do Fosso, Escudeiro do Alvorecer |
| Elmo de Ferro Batido | Elmo pesado | Cabeça | 2 | — | nv 1; For 10 | Quebraferro, Bastião de Bronze, Lanceiro do Fosso, Escudeiro do Alvorecer |
| Manoplas de Ferro Batido | Manoplas pesadas | Mãos | 2 | — | nv 1; For 9 | Quebraferro, Bastião de Bronze, Lanceiro do Fosso, Escudeiro do Alvorecer |
| Grevas de Ferro Batido | Grevas pesadas | Pés | 2 | — | nv 1; For 9 | Quebraferro, Bastião de Bronze, Lanceiro do Fosso, Escudeiro do Alvorecer |
| Gibão de Couro Cru | Armadura leve | Corpo | 4 | evasão +3, res. mág. 2 | nv 1; Agi 12, Tal 8 | Vigia do Espinhal, Andarilha do Vento |
| Capuz de Couro Cru | Capuz leve | Cabeça | 2 | evasão +1, res. mág. 1 | nv 1; Agi 10, Tal 6 | Vigia do Espinhal, Andarilha do Vento |
| Luvas de Couro Cru | Luvas leves | Mãos | 1 | evasão +1 | nv 1; Agi 9, Tal 5 | Vigia do Espinhal, Andarilha do Vento |
| Botas de Couro Cru | Botas leves | Pés | 1 | evasão +1 | nv 1; Agi 9, Tal 5 | Vigia do Espinhal, Andarilha do Vento |
| Veste de Linho | Veste mágica | Corpo | 3 | res. mág. 4 | nv 1; Esp 12 | Cantora do Véu, Tecelão da Brasa |
| Diadema de Linho | Diadema mágico | Cabeça | 1 | res. mág. 1 | nv 1; Esp 11 | Cantora do Véu, Tecelão da Brasa |
| Mitenes de Linho | Mitenes mágicas | Mãos | 1 | res. mág. 1 | nv 1; Esp 10 | Cantora do Véu, Tecelão da Brasa |
| Sandálias de Linho | Sandálias mágicas | Pés | 1 | res. mág. 1 | nv 1; Esp 10 | Cantora do Véu, Tecelão da Brasa |
| Escudo de Ferro Batido | Escudo | Mão secundária | 4 | bloqueio 8% | nv 1; For 12 | Bastião de Bronze, Escudeiro do Alvorecer |
| Broquel de Couro Cru | Escudo leve | Mão secundária | 2 | evasão +2 | nv 1; Agi 12 | Andarilha do Vento |
| Foco de Vidro Bruto | Foco | Mão secundária | — | res. mág. 3, poder mág. 3 | nv 1; Esp 13 | Cantora do Véu, Tecelão da Brasa |
| Aljava de Couro Cru | Aljava | Mão secundária | — | precisão +3 | nv 1; Agi 12 | Vigia do Espinhal |
| Anel de Arame | Anel | Anel | — | +1 Vit | nv 1; — | todas |
| Amuleto de Sino Pequeno | Amuleto | Amuleto | — | res. mág. 2, mana +5 | nv 1; — | todas |

### Faixa 5

| Arma | Família | Empunhadura | Dano | Intervalo | Alcance | Poder mág. | Requisitos | Classes | Raridade |
|---|---|---|---|---|---|---|---|---|---|
| Machado de Pedreira | Machado (1 mão) | uma mão | 9–15 fís. | 1,1 s | 2.5 m | — | nv 5; For 22, Tal 14 | Quebraferro | comum |
| Machado Duplo da Ponte | Machado (2 mãos) | duas mãos | 14–23 fís. | 1,5 s | 2.5 m | — | nv 5; For 24, Tal 12 | Quebraferro | comum |
| Garra de Manivela | Garra mecânica | uma mão | 8–13 fís. | 1 s | 2.5 m | — | nv 5; For 18, Tal 18 | Bastião de Bronze | comum |
| Martelo de Ferreiro da Ponte | Martelo (1 mão) | uma mão | 9–14 fís. | 1,2 s | 2.5 m | — | nv 5; For 22, Tal 14 | Bastião de Bronze | comum |
| Lança do Fosso | Lança/pique (2 mãos) | duas mãos | 12–20 fís. | 1,3 s | 3.5 m | — | nv 5; For 22, Tal 14 | Lanceiro do Fosso | comum |
| Arco de Teixo do Espinhal | Arco | uma mão | 9–15 fís. | 1,2 s | 18 m | — | nv 5; Agi 22, Tal 13 | Vigia do Espinhal | comum |
| Espada da Ponte | Espada (1 mão) | uma mão | 9–15 fís. | 1 s | 2.5 m | — | nv 5; For 22, Esp 12 | Escudeiro do Alvorecer | comum |
| Montante da Ponte | Espada (2 mãos) | duas mãos | 13–22 fís. | 1,4 s | 2.5 m | — | nv 5; For 24, Esp 12 | Escudeiro do Alvorecer | comum |
| Azagaia de Vau | Azagaia arremessável (1 mão) | uma mão | 9–16 fís. | 1,1 s | 14 m | — | nv 5; Agi 22, Tal 14 | Andarilha do Vento | comum |
| Varinha de Vidro Fosco | Varinha | uma mão | 6–10 mág. | 1,2 s | 16 m | 10 | nv 5; Esp 25, Tal 14 | Cantora do Véu, Tecelão da Brasa | comum |
| Cetro do Vau | Cetro | uma mão | 7–11 mág. | 1,3 s | 14 m | 9 | nv 5; Esp 25, Tal 14 | Cantora do Véu | comum |
| Cajado de Fuligem | Cajado (2 mãos) | duas mãos | 9–15 mág. | 1,5 s | 18 m | 17 | nv 5; Esp 25, Tal 14 | Cantora do Véu, Tecelão da Brasa | comum |

| Item | Família | Espaço | Defesa | Outros | Requisitos | Classes |
|---|---|---|---|---|---|---|
| Couraça de Bronze de Eclusa | Armadura pesada | Corpo | 13 | res. mág. 2 | nv 5; For 20 | Quebraferro, Bastião de Bronze, Lanceiro do Fosso, Escudeiro do Alvorecer |
| Elmo de Bronze de Eclusa | Elmo pesado | Cabeça | 5 | res. mág. 1 | nv 5; For 18 | Quebraferro, Bastião de Bronze, Lanceiro do Fosso, Escudeiro do Alvorecer |
| Manoplas de Bronze de Eclusa | Manoplas pesadas | Mãos | 4 | res. mág. 1 | nv 5; For 17 | Quebraferro, Bastião de Bronze, Lanceiro do Fosso, Escudeiro do Alvorecer |
| Grevas de Bronze de Eclusa | Grevas pesadas | Pés | 4 | res. mág. 1 | nv 5; For 17 | Quebraferro, Bastião de Bronze, Lanceiro do Fosso, Escudeiro do Alvorecer |
| Gibão de Couro de Brejo | Armadura leve | Corpo | 9 | evasão +6, res. mág. 4 | nv 5; Agi 20, Tal 12 | Vigia do Espinhal, Andarilha do Vento |
| Capuz de Couro de Brejo | Capuz leve | Cabeça | 4 | evasão +2, res. mág. 1 | nv 5; Agi 18, Tal 10 | Vigia do Espinhal, Andarilha do Vento |
| Luvas de Couro de Brejo | Luvas leves | Mãos | 3 | evasão +2, res. mág. 1 | nv 5; Agi 17, Tal 9 | Vigia do Espinhal, Andarilha do Vento |
| Botas de Couro de Brejo | Botas leves | Pés | 3 | evasão +2, res. mág. 1 | nv 5; Agi 17, Tal 9 | Vigia do Espinhal, Andarilha do Vento |
| Veste de Lã de Fuligem | Veste mágica | Corpo | 6 | res. mág. 8 | nv 5; Esp 22 | Cantora do Véu, Tecelão da Brasa |
| Diadema de Lã de Fuligem | Diadema mágico | Cabeça | 2 | res. mág. 3 | nv 5; Esp 20 | Cantora do Véu, Tecelão da Brasa |
| Mitenes de Lã de Fuligem | Mitenes mágicas | Mãos | 2 | res. mág. 3 | nv 5; Esp 19 | Cantora do Véu, Tecelão da Brasa |
| Sandálias de Lã de Fuligem | Sandálias mágicas | Pés | 2 | res. mág. 3 | nv 5; Esp 19 | Cantora do Véu, Tecelão da Brasa |
| Escudo de Bronze de Eclusa | Escudo | Mão secundária | 8 | bloqueio 10% | nv 5; For 20 | Bastião de Bronze, Escudeiro do Alvorecer |
| Broquel de Couro de Brejo | Escudo leve | Mão secundária | 5 | evasão +4 | nv 5; Agi 20 | Andarilha do Vento |
| Foco de Lente de Bomba | Foco | Mão secundária | — | res. mág. 7, poder mág. 6 | nv 5; Esp 22 | Cantora do Véu, Tecelão da Brasa |
| Aljava de Couro de Brejo | Aljava | Mão secundária | — | precisão +6 | nv 5; Agi 20 | Vigia do Espinhal |
| Anel de Bronze | Anel | Anel | — | +2 Vit | nv 5; — | todas |
| Amuleto de Bronze | Amuleto | Amuleto | — | res. mág. 4, mana +10 | nv 5; — | todas |

### Faixa 9

| Arma | Família | Empunhadura | Dano | Intervalo | Alcance | Poder mág. | Requisitos | Classes | Raridade |
|---|---|---|---|---|---|---|---|---|---|
| Machado de Rebite | Machado (1 mão) | uma mão | 15–23 fís. | 1,1 s | 2.5 m | — | nv 9; For 30, Tal 20 | Quebraferro | comum |
| Cutelo de Comporta | Machado (2 mãos) | duas mãos | 23–35 fís. | 1,5 s | 2.5 m | — | nv 9; For 32, Tal 18 | Quebraferro | comum |
| Garra de Pistão | Garra mecânica | uma mão | 13–20 fís. | 1 s | 2.5 m | — | nv 9; For 25, Tal 25 | Bastião de Bronze | comum |
| Martelo de Válvula | Martelo (1 mão) | uma mão | 14–22 fís. | 1,2 s | 2.5 m | — | nv 9; For 30, Tal 20 | Bastião de Bronze | comum |
| Pique de Ferro Frio | Lança/pique (2 mãos) | duas mãos | 20–31 fís. | 1,3 s | 3.5 m | — | nv 9; For 30, Tal 20 | Lanceiro do Fosso | comum |
| Arco de Freixo Negro | Arco | uma mão | 15–23 fís. | 1,2 s | 18 m | — | nv 9; Agi 30, Tal 18 | Vigia do Espinhal | comum |
| Espada do Alvorecer Pálido | Espada (1 mão) | uma mão | 15–23 fís. | 1 s | 2.5 m | — | nv 9; For 30, Esp 16 | Escudeiro do Alvorecer | comum |
| Montante da Aurora | Espada (2 mãos) | duas mãos | 22–33 fís. | 1,4 s | 2.5 m | — | nv 9; For 32, Esp 16 | Escudeiro do Alvorecer | comum |
| Azagaia de Brejo | Azagaia arremessável (1 mão) | uma mão | 16–24 fís. | 1,1 s | 14 m | — | nv 9; Agi 30, Tal 19 | Andarilha do Vento | comum |
| Varinha de Cobre Torcido | Varinha | uma mão | 9–15 mág. | 1,2 s | 16 m | 17 | nv 9; Esp 31, Tal 17 | Cantora do Véu, Tecelão da Brasa | comum |
| Cetro do Brejo Claro | Cetro | uma mão | 10–17 mág. | 1,3 s | 14 m | 15 | nv 9; Esp 31, Tal 17 | Cantora do Véu | comum |
| Cajado de Bomba Antiga | Cajado (2 mãos) | duas mãos | 14–23 mág. | 1,5 s | 18 m | 29 | nv 9; Esp 31, Tal 17 | Cantora do Véu, Tecelão da Brasa | comum |

| Item | Família | Espaço | Defesa | Outros | Requisitos | Classes |
|---|---|---|---|---|---|---|
| Couraça de Ferro Frio | Armadura pesada | Corpo | 21 | res. mág. 3 | nv 9; For 28 | Quebraferro, Bastião de Bronze, Lanceiro do Fosso, Escudeiro do Alvorecer |
| Elmo de Ferro Frio | Elmo pesado | Cabeça | 8 | res. mág. 1 | nv 9; For 26 | Quebraferro, Bastião de Bronze, Lanceiro do Fosso, Escudeiro do Alvorecer |
| Manoplas de Ferro Frio | Manoplas pesadas | Mãos | 6 | res. mág. 1 | nv 9; For 25 | Quebraferro, Bastião de Bronze, Lanceiro do Fosso, Escudeiro do Alvorecer |
| Grevas de Ferro Frio | Grevas pesadas | Pés | 6 | res. mág. 1 | nv 9; For 25 | Quebraferro, Bastião de Bronze, Lanceiro do Fosso, Escudeiro do Alvorecer |
| Gibão de Couro Rebitado | Armadura leve | Corpo | 15 | evasão +9, res. mág. 6 | nv 9; Agi 27, Tal 16 | Vigia do Espinhal, Andarilha do Vento |
| Capuz de Couro Rebitado | Capuz leve | Cabeça | 6 | evasão +4, res. mág. 2 | nv 9; Agi 25, Tal 14 | Vigia do Espinhal, Andarilha do Vento |
| Luvas de Couro Rebitado | Luvas leves | Mãos | 4 | evasão +3, res. mág. 2 | nv 9; Agi 24, Tal 13 | Vigia do Espinhal, Andarilha do Vento |
| Botas de Couro Rebitado | Botas leves | Pés | 4 | evasão +3, res. mág. 2 | nv 9; Agi 24, Tal 13 | Vigia do Espinhal, Andarilha do Vento |
| Veste de Tecido de Bomba | Veste mágica | Corpo | 9 | res. mág. 13 | nv 9; Esp 29 | Cantora do Véu, Tecelão da Brasa |
| Diadema de Tecido de Bomba | Diadema mágico | Cabeça | 4 | res. mág. 5 | nv 9; Esp 27 | Cantora do Véu, Tecelão da Brasa |
| Mitenes de Tecido de Bomba | Mitenes mágicas | Mãos | 3 | res. mág. 4 | nv 9; Esp 26 | Cantora do Véu, Tecelão da Brasa |
| Sandálias de Tecido de Bomba | Sandálias mágicas | Pés | 3 | res. mág. 4 | nv 9; Esp 26 | Cantora do Véu, Tecelão da Brasa |
| Escudo de Ferro Frio | Escudo | Mão secundária | 13 | bloqueio 12% | nv 9; For 28 | Bastião de Bronze, Escudeiro do Alvorecer |
| Broquel de Couro Rebitado | Escudo leve | Mão secundária | 7 | evasão +6 | nv 9; Agi 27 | Andarilha do Vento |
| Foco de Âmbar Fundido | Foco | Mão secundária | — | res. mág. 11, poder mág. 10 | nv 9; Esp 29 | Cantora do Véu, Tecelão da Brasa |
| Aljava de Couro Rebitado | Aljava | Mão secundária | — | precisão +9 | nv 9; Agi 27 | Vigia do Espinhal |
| Anel de Ferro Frio | Anel | Anel | — | +3 Vit | nv 9; — | todas |
| Amuleto de Válvula | Amuleto | Amuleto | — | res. mág. 6, mana +16 | nv 9; — | todas |

### Faixa 13

| Arma | Família | Empunhadura | Dano | Intervalo | Alcance | Poder mág. | Requisitos | Classes | Raridade |
|---|---|---|---|---|---|---|---|---|---|
| Machado da Galeria | Machado (1 mão) | uma mão | 21–31 fís. | 1,1 s | 2.5 m | — | nv 13; For 36, Tal 22 | Quebraferro | comum |
| Fendedor do Eco | Machado (2 mãos) | duas mãos | 32–47 fís. | 1,5 s | 2.5 m | — | nv 13; For 38, Tal 20 | Quebraferro | comum |
| Garra de Engrenagem Surda | Garra mecânica | uma mão | 18–26 fís. | 1 s | 2.5 m | — | nv 13; For 29, Tal 29 | Bastião de Bronze | comum |
| Martelo de Galeria | Martelo (1 mão) | uma mão | 20–29 fís. | 1,2 s | 2.5 m | — | nv 13; For 36, Tal 22 | Bastião de Bronze | comum |
| Pique da Galeria | Lança/pique (2 mãos) | duas mãos | 28–42 fís. | 1,3 s | 3.5 m | — | nv 13; For 36, Tal 22 | Lanceiro do Fosso | comum |
| Arco de Eco Tenso | Arco | uma mão | 21–31 fís. | 1,2 s | 18 m | — | nv 13; Agi 36, Tal 22 | Vigia do Espinhal | comum |
| Espada da Vigília | Espada (1 mão) | uma mão | 21–31 fís. | 1 s | 2.5 m | — | nv 13; For 35, Esp 20 | Escudeiro do Alvorecer | comum |
| Montante da Vigília | Espada (2 mãos) | duas mãos | 30–45 fís. | 1,4 s | 2.5 m | — | nv 13; For 37, Esp 20 | Escudeiro do Alvorecer | comum |
| Azagaia da Correnteza | Azagaia arremessável (1 mão) | uma mão | 22–33 fís. | 1,1 s | 14 m | — | nv 13; Agi 35, Tal 24 | Andarilha do Vento | comum |
| Varinha do Eco | Varinha | uma mão | 13–20 mág. | 1,2 s | 16 m | 25 | nv 13; Esp 38, Tal 20 | Cantora do Véu, Tecelão da Brasa | comum |
| Cetro da Galeria | Cetro | uma mão | 14–22 mág. | 1,3 s | 14 m | 23 | nv 13; Esp 38, Tal 20 | Cantora do Véu | comum |
| Cajado do Eco | Cajado (2 mãos) | duas mãos | 20–30 mág. | 1,5 s | 18 m | 43 | nv 13; Esp 38, Tal 20 | Cantora do Véu, Tecelão da Brasa | comum |

| Item | Família | Espaço | Defesa | Outros | Requisitos | Classes |
|---|---|---|---|---|---|---|
| Couraça de Aço da Vigília | Armadura pesada | Corpo | 30 | res. mág. 5 | nv 13; For 34 | Quebraferro, Bastião de Bronze, Lanceiro do Fosso, Escudeiro do Alvorecer |
| Elmo de Aço da Vigília | Elmo pesado | Cabeça | 12 | res. mág. 2 | nv 13; For 32 | Quebraferro, Bastião de Bronze, Lanceiro do Fosso, Escudeiro do Alvorecer |
| Manoplas de Aço da Vigília | Manoplas pesadas | Mãos | 9 | res. mág. 1 | nv 13; For 31 | Quebraferro, Bastião de Bronze, Lanceiro do Fosso, Escudeiro do Alvorecer |
| Grevas de Aço da Vigília | Grevas pesadas | Pés | 9 | res. mág. 1 | nv 13; For 31 | Quebraferro, Bastião de Bronze, Lanceiro do Fosso, Escudeiro do Alvorecer |
| Gibão de Escama de Eco | Armadura leve | Corpo | 21 | evasão +12, res. mág. 8 | nv 13; Agi 33, Tal 20 | Vigia do Espinhal, Andarilha do Vento |
| Capuz de Escama de Eco | Capuz leve | Cabeça | 8 | evasão +5, res. mág. 3 | nv 13; Agi 31, Tal 18 | Vigia do Espinhal, Andarilha do Vento |
| Luvas de Escama de Eco | Luvas leves | Mãos | 6 | evasão +4, res. mág. 2 | nv 13; Agi 30, Tal 17 | Vigia do Espinhal, Andarilha do Vento |
| Botas de Escama de Eco | Botas leves | Pés | 6 | evasão +4, res. mág. 2 | nv 13; Agi 30, Tal 17 | Vigia do Espinhal, Andarilha do Vento |
| Veste de Seda do Eco | Veste mágica | Corpo | 14 | res. mág. 19 | nv 13; Esp 36 | Cantora do Véu, Tecelão da Brasa |
| Diadema de Seda do Eco | Diadema mágico | Cabeça | 5 | res. mág. 8 | nv 13; Esp 34 | Cantora do Véu, Tecelão da Brasa |
| Mitenes de Seda do Eco | Mitenes mágicas | Mãos | 4 | res. mág. 6 | nv 13; Esp 33 | Cantora do Véu, Tecelão da Brasa |
| Sandálias de Seda do Eco | Sandálias mágicas | Pés | 4 | res. mág. 6 | nv 13; Esp 33 | Cantora do Véu, Tecelão da Brasa |
| Escudo de Aço da Vigília | Escudo | Mão secundária | 18 | bloqueio 14% | nv 13; For 34 | Bastião de Bronze, Escudeiro do Alvorecer |
| Broquel de Escama de Eco | Escudo leve | Mão secundária | 11 | evasão +8 | nv 13; Agi 33 | Andarilha do Vento |
| Foco do Eco Preso | Foco | Mão secundária | — | res. mág. 16, poder mág. 14 | nv 13; Esp 36 | Cantora do Véu, Tecelão da Brasa |
| Aljava de Escama de Eco | Aljava | Mão secundária | — | precisão +12 | nv 13; Agi 33 | Vigia do Espinhal |
| Anel de Eco | Anel | Anel | — | +4 Vit | nv 13; — | todas |
| Amuleto do Eco | Amuleto | Amuleto | — | res. mág. 9, mana +24 | nv 13; — | todas |

### Faixa 17

| Arma | Família | Empunhadura | Dano | Intervalo | Alcance | Poder mág. | Requisitos | Classes | Raridade |
|---|---|---|---|---|---|---|---|---|---|
| Machado de Brasa Fria | Machado (1 mão) | uma mão | 28–40 fís. | 1,1 s | 2.5 m | — | nv 17; For 44, Tal 26 | Quebraferro | comum |
| Machado de Liga Rubra | Machado (2 mãos) | duas mãos | 42–60 fís. | 1,5 s | 2.5 m | — | nv 17; For 46, Tal 24 | Quebraferro | comum |
| Garra de Liga Rubra | Garra mecânica | uma mão | 24–34 fís. | 1 s | 2.5 m | — | nv 17; For 35, Tal 35 | Bastião de Bronze | comum |
| Martelo de Liga Rubra | Martelo (1 mão) | uma mão | 27–38 fís. | 1,2 s | 2.5 m | — | nv 17; For 44, Tal 26 | Bastião de Bronze | comum |
| Pique de Liga Rubra | Lança/pique (2 mãos) | duas mãos | 38–54 fís. | 1,3 s | 3.5 m | — | nv 17; For 44, Tal 26 | Lanceiro do Fosso | comum |
| Arco de Liga Rubra | Arco | uma mão | 28–40 fís. | 1,2 s | 18 m | — | nv 17; Agi 44, Tal 25 | Vigia do Espinhal | comum |
| Espada de Liga Rubra | Espada (1 mão) | uma mão | 28–40 fís. | 1 s | 2.5 m | — | nv 17; For 44, Esp 24 | Escudeiro do Alvorecer | comum |
| Montante de Liga Rubra | Espada (2 mãos) | duas mãos | 41–58 fís. | 1,4 s | 2.5 m | — | nv 17; For 46, Esp 24 | Escudeiro do Alvorecer | comum |
| Azagaia de Liga Rubra | Azagaia arremessável (1 mão) | uma mão | 29–42 fís. | 1,1 s | 14 m | — | nv 17; Agi 44, Tal 26 | Andarilha do Vento | comum |
| Varinha de Liga Rubra | Varinha | uma mão | 17–26 mág. | 1,2 s | 16 m | 34 | nv 17; Esp 45, Tal 24 | Cantora do Véu, Tecelão da Brasa | comum |
| Cetro do Sino Mudo | Cetro | uma mão | 19–29 mág. | 1,3 s | 14 m | 31 | nv 17; Esp 45, Tal 24 | Cantora do Véu | raro |
| Cajado de Liga Rubra | Cajado (2 mãos) | duas mãos | 26–39 mág. | 1,5 s | 18 m | 58 | nv 17; Esp 45, Tal 24 | Cantora do Véu, Tecelão da Brasa | comum |

| Item | Família | Espaço | Defesa | Outros | Requisitos | Classes |
|---|---|---|---|---|---|---|
| Couraça de Liga Rubra | Armadura pesada | Corpo | 40 | res. mág. 6 | nv 17; For 42 | Quebraferro, Bastião de Bronze, Lanceiro do Fosso, Escudeiro do Alvorecer |
| Elmo de Liga Rubra | Elmo pesado | Cabeça | 16 | res. mág. 3 | nv 17; For 40 | Quebraferro, Bastião de Bronze, Lanceiro do Fosso, Escudeiro do Alvorecer |
| Manoplas de Liga Rubra | Manoplas pesadas | Mãos | 12 | res. mág. 2 | nv 17; For 39 | Quebraferro, Bastião de Bronze, Lanceiro do Fosso, Escudeiro do Alvorecer |
| Grevas de Liga Rubra | Grevas pesadas | Pés | 12 | res. mág. 2 | nv 17; For 39 | Quebraferro, Bastião de Bronze, Lanceiro do Fosso, Escudeiro do Alvorecer |
| Gibão de Couro de Liga Rubra | Armadura leve | Corpo | 28 | evasão +15, res. mág. 11 | nv 17; Agi 41, Tal 24 | Vigia do Espinhal, Andarilha do Vento |
| Capuz de Couro de Liga Rubra | Capuz leve | Cabeça | 11 | evasão +6, res. mág. 4 | nv 17; Agi 39, Tal 22 | Vigia do Espinhal, Andarilha do Vento |
| Luvas de Couro de Liga Rubra | Luvas leves | Mãos | 8 | evasão +5, res. mág. 3 | nv 17; Agi 38, Tal 21 | Vigia do Espinhal, Andarilha do Vento |
| Botas de Couro de Liga Rubra | Botas leves | Pés | 8 | evasão +5, res. mág. 3 | nv 17; Agi 38, Tal 21 | Vigia do Espinhal, Andarilha do Vento |
| Veste de Brocado Rubro | Veste mágica | Corpo | 18 | res. mág. 25 | nv 17; Esp 43 | Cantora do Véu, Tecelão da Brasa |
| Diadema de Brocado Rubro | Diadema mágico | Cabeça | 7 | res. mág. 10 | nv 17; Esp 41 | Cantora do Véu, Tecelão da Brasa |
| Mitenes de Brocado Rubro | Mitenes mágicas | Mãos | 5 | res. mág. 8 | nv 17; Esp 40 | Cantora do Véu, Tecelão da Brasa |
| Sandálias de Brocado Rubro | Sandálias mágicas | Pés | 5 | res. mág. 8 | nv 17; Esp 40 | Cantora do Véu, Tecelão da Brasa |
| Escudo de Liga Rubra | Escudo | Mão secundária | 24 | bloqueio 16% | nv 17; For 42 | Bastião de Bronze, Escudeiro do Alvorecer |
| Broquel de Couro de Liga Rubra | Escudo leve | Mão secundária | 14 | evasão +10 | nv 17; Agi 41 | Andarilha do Vento |
| Foco Rubro | Foco | Mão secundária | — | res. mág. 21, poder mág. 19 | nv 17; Esp 43 | Cantora do Véu, Tecelão da Brasa |
| Aljava de Couro de Liga Rubra | Aljava | Mão secundária | — | precisão +15 | nv 17; Agi 41 | Vigia do Espinhal |
| Anel de Liga Rubra | Anel | Anel | — | +5 Vit | nv 17; — | todas |
| Amuleto Rubro | Amuleto | Amuleto | — | res. mág. 12, mana +32 | nv 17; — | todas |

### Faixa 20 — recompensas especiais (chefe da Eclusa e prova final)

| Arma | Família | Empunhadura | Dano | Intervalo | Alcance | Poder mág. | Requisitos | Classes | Raridade |
|---|---|---|---|---|---|---|---|---|---|
| Machado do Meridiano Partido | Machado (1 mão) | uma mão | 36–50 fís. | 1,1 s | 2.5 m | — | nv 20; For 50, Tal 28 | Quebraferro | único |
| Grande Machado da Última Eclusa | Machado (2 mãos) | duas mãos | 54–75 fís. | 1,5 s | 2.5 m | — | nv 20; For 52, Tal 26 | Quebraferro | único |
| Garra do Custódio | Garra mecânica | uma mão | 31–43 fís. | 1 s | 2.5 m | — | nv 20; For 39, Tal 39 | Bastião de Bronze | único |
| Martelo da Comporta Selada | Martelo (1 mão) | uma mão | 34–48 fís. | 1,2 s | 2.5 m | — | nv 20; For 50, Tal 28 | Bastião de Bronze | único |
| Pique da Câmara Fechada | Lança/pique (2 mãos) | duas mãos | 49–68 fís. | 1,3 s | 3.5 m | — | nv 20; For 50, Tal 28 | Lanceiro do Fosso | único |
| Arco do Último Sinal | Arco | uma mão | 36–50 fís. | 1,2 s | 18 m | — | nv 20; Agi 50, Tal 28 | Vigia do Espinhal | único |
| Espada do Meio-Dia Eterno | Espada (1 mão) | uma mão | 36–50 fís. | 1 s | 2.5 m | — | nv 20; For 50, Esp 28 | Escudeiro do Alvorecer | único |
| Montante do Juramento Antigo | Espada (2 mãos) | duas mãos | 52–73 fís. | 1,4 s | 2.5 m | — | nv 20; For 52, Esp 28 | Escudeiro do Alvorecer | único |
| Azagaia do Vento Contrário | Azagaia arremessável (1 mão) | uma mão | 38–53 fís. | 1,1 s | 14 m | — | nv 20; Agi 50, Tal 28 | Andarilha do Vento | único |
| Varinha da Faísca Primeira | Varinha | uma mão | 22–32 mág. | 1,2 s | 16 m | 46 | nv 20; Esp 55, Tal 28 | Cantora do Véu, Tecelão da Brasa | único |
| Cetro da Resposta | Cetro | uma mão | 24–35 mág. | 1,3 s | 14 m | 41 | nv 20; Esp 55, Tal 28 | Cantora do Véu | único |
| Cajado da Câmara Rubra | Cajado (2 mãos) | duas mãos | 33–48 mág. | 1,5 s | 18 m | 78 | nv 20; Esp 55, Tal 28 | Tecelão da Brasa | único |

| Item | Família | Espaço | Defesa | Outros | Requisitos | Classes |
|---|---|---|---|---|---|---|
| Couraça de Meridiano | Armadura pesada | Corpo | 52 | res. mág. 8 | nv 20; For 48 | Quebraferro, Bastião de Bronze, Lanceiro do Fosso, Escudeiro do Alvorecer |
| Elmo de Meridiano | Elmo pesado | Cabeça | 21 | res. mág. 3 | nv 20; For 46 | Quebraferro, Bastião de Bronze, Lanceiro do Fosso, Escudeiro do Alvorecer |
| Manoplas de Meridiano | Manoplas pesadas | Mãos | 16 | res. mág. 3 | nv 20; For 45 | Quebraferro, Bastião de Bronze, Lanceiro do Fosso, Escudeiro do Alvorecer |
| Grevas de Meridiano | Grevas pesadas | Pés | 16 | res. mág. 3 | nv 20; For 45 | Quebraferro, Bastião de Bronze, Lanceiro do Fosso, Escudeiro do Alvorecer |
| Gibão de Couro do Vento Antigo | Armadura leve | Corpo | 36 | evasão +20, res. mág. 14 | nv 20; Agi 47, Tal 26 | Vigia do Espinhal, Andarilha do Vento |
| Capuz de Couro do Vento Antigo | Capuz leve | Cabeça | 15 | evasão +8, res. mág. 6 | nv 20; Agi 45, Tal 24 | Vigia do Espinhal, Andarilha do Vento |
| Luvas de Couro do Vento Antigo | Luvas leves | Mãos | 11 | evasão +6, res. mág. 4 | nv 20; Agi 44, Tal 23 | Vigia do Espinhal, Andarilha do Vento |
| Botas de Couro do Vento Antigo | Botas leves | Pés | 11 | evasão +6, res. mág. 4 | nv 20; Agi 44, Tal 23 | Vigia do Espinhal, Andarilha do Vento |
| Veste de Tecido do Meridiano | Veste mágica | Corpo | 23 | res. mág. 34 | nv 20; Esp 52 | Cantora do Véu, Tecelão da Brasa |
| Diadema de Tecido do Meridiano | Diadema mágico | Cabeça | 9 | res. mág. 13 | nv 20; Esp 50 | Cantora do Véu, Tecelão da Brasa |
| Mitenes de Tecido do Meridiano | Mitenes mágicas | Mãos | 7 | res. mág. 10 | nv 20; Esp 49 | Cantora do Véu, Tecelão da Brasa |
| Sandálias de Tecido do Meridiano | Sandálias mágicas | Pés | 7 | res. mág. 10 | nv 20; Esp 49 | Cantora do Véu, Tecelão da Brasa |
| Escudo de Meridiano | Escudo | Mão secundária | 31 | bloqueio 20% | nv 20; For 48 | Bastião de Bronze, Escudeiro do Alvorecer |
| Broquel de Couro do Vento Antigo | Escudo leve | Mão secundária | 18 | evasão +13 | nv 20; Agi 47 | Andarilha do Vento |
| Foco da Resposta | Foco | Mão secundária | — | res. mág. 28, poder mág. 26 | nv 20; Esp 52 | Cantora do Véu, Tecelão da Brasa |
| Aljava de Couro do Vento Antigo | Aljava | Mão secundária | — | precisão +20 | nv 20; Agi 47 | Vigia do Espinhal |
| Anel do Meridiano | Anel | Anel | — | +7 Vit | nv 20; — | todas |
| Amuleto da Resposta | Amuleto | Amuleto | — | res. mág. 16, mana +45 | nv 20; — | todas |

### Itens nomeados de outras raridades (exemplos)

| Item | Raridade | Nível | Requisitos | Efeito |
|---|---|---|---|---|
| Anel do Sulco | incomum | 3 | — | +2 For +1 Vit; O bônus de Força não conta para requisitos. |
| Amuleto do Segundo Toque | raro | 5 | — | +3 Esp |
| Machado de Pedreira Lascado | incomum | 5 | For 23, Tal 15 | dano 10–17 |

### O catálogo de exemplo da especificação

Os oito itens pedidos estão no catálogo com os requisitos originais: Machado de Pedreira (nv5, For 22 Tal 14), Garra de Manivela (nv5, For 18 Tal 18), Pique de Ferro Frio (nv9, For 30 Tal 20, duas mãos), Arco de Freixo Negro (nv9, Agi 30 Tal 18), Espada da Vigília (nv13, For 35 Esp 20), Azagaia da Correnteza (nv13, Agi 35 Tal 24), Cetro do Sino Mudo (nv17, Esp 45 Tal 24, raro, só Cantora) e Cajado da Câmara Rubra (nv20, Esp 55 Tal 28, duas mãos, único, exceção só do Tecelão). A verificação abaixo mostra que **todos cabem** nos pontos disponíveis, inclusive somados às armaduras e à mão secundária da mesma faixa — não foi preciso rebalancear os números. O que foi ajustado: as curvas das demais famílias foram construídas em torno deles (ver docs/DECISOES.md).


## 4.5 Verificação: cada conjunto de faixa cabe nos pontos da classe

Conjunto = arma da família + mão secundária da classe (se a arma for de uma mão) + 4 peças de armadura do peso da classe, todos da mesma faixa, usados ao mesmo tempo. "Gasta" = soma, por atributo, de quanto o maior requisito passa do valor inicial da classe. A folga é o que sobra para Vitalidade e para a identidade da build.

| Classe / família | nv 1 | nv 5 | nv 9 | nv 13 | nv 17 | nv 20 |
|---|---|---|---|---|---|---|
| Quebraferro / Machado (1 mão) | 0/0 | 8/20 | 22/40 | 30/60 | 42/80 | 50/95 |
| Quebraferro / Machado (2 mãos) | 0/0 | 8/20 | 22/40 | 30/60 | 42/80 | 50/95 |
| Bastião de Bronze / Garra mecânica | 0/0 | 10/20 | 25/40 | 35/60 | 49/80 | 59/95 |
| Bastião de Bronze / Martelo (1 mão) | 0/0 | 8/20 | 22/40 | 30/60 | 42/80 | 50/95 |
| Lanceiro do Fosso / Lança/pique (2 mãos) | 0/0 | 7/20 | 21/40 | 29/60 | 41/80 | 49/95 |
| Vigia do Espinhal / Arco | 0/0 | 4/20 | 17/40 | 27/60 | 38/80 | 47/95 |
| Escudeiro do Alvorecer / Espada (1 mão) | 0/0 | 8/20 | 20/40 | 29/60 | 42/80 | 52/95 |
| Escudeiro do Alvorecer / Espada (2 mãos) | 0/0 | 10/20 | 22/40 | 31/60 | 44/80 | 54/95 |
| Andarilha do Vento / Azagaia arremessável (1 mão) | 0/0 | 7/20 | 20/40 | 30/60 | 41/80 | 49/95 |
| Cantora do Véu / Varinha | 0/0 | 8/20 | 17/40 | 27/60 | 38/80 | 52/95 |
| Cantora do Véu / Cetro | 0/0 | 8/20 | 17/40 | 27/60 | 38/80 | 52/95 |
| Cantora do Véu / Cajado (2 mãos) | 0/0 | 8/20 | 17/40 | 27/60 | 38/80 | 33/95 |
| Tecelão da Brasa / Varinha | 0/0 | 7/20 | 16/40 | 26/60 | 37/80 | 51/95 |
| Tecelão da Brasa / Cajado (2 mãos) | 0/0 | 7/20 | 16/40 | 26/60 | 37/80 | 51/95 |

Formato: pontos que o conjunto exige / pontos disponíveis no nível. Nenhuma célula excede o disponível (✗ marcaria falha; o validador `npm run validate-data` e o teste `data.test.js` quebram se isso acontecer).


## 4.6 Exemplos de evolução passo a passo


### Quebraferro de machado de uma mão (exemplo físico)

Começa com Força 17, Espírito 5, Talento 11, Agilidade 10, Vitalidade 17. Cada linha distribui exatamente os 5 pontos do nível; a coluna "Conjunto da faixa" confere, no nível em que a faixa abre, todos os requisitos com os pontos realmente gastos até ali.

| Nível | Distribuição | For | Esp | Tal | Agi | Vit | Gastos / disponíveis | Conjunto da faixa |
|---|---|---|---|---|---|---|---|---|
| 1 | — | 17 | 5 | 11 | 10 | 17 | 0/0 | ✔ Machado de Lasca (For 14, Tal 9)<br>✔ Couraça de Ferro Batido (For 12)<br>✔ Elmo de Ferro Batido (For 10)<br>✔ Manoplas de Ferro Batido (For 9)<br>✔ Grevas de Ferro Batido (For 9) |
| 2 | +3 For, +2 Tal | 20 | 5 | 13 | 10 | 17 | 5/5 |  |
| 3 | +2 For, +1 Tal, +2 Vit | 22 | 5 | 14 | 10 | 19 | 10/10 |  |
| 4 | +5 Vit | 22 | 5 | 14 | 10 | 24 | 15/15 |  |
| 5 | +3 For, +2 Tal | 25 | 5 | 16 | 10 | 24 | 20/20 | ✔ Machado de Pedreira (For 22, Tal 14)<br>✔ Couraça de Bronze de Eclusa (For 20)<br>✔ Elmo de Bronze de Eclusa (For 18)<br>✔ Manoplas de Bronze de Eclusa (For 17)<br>✔ Grevas de Bronze de Eclusa (For 17) |
| 6 | +3 For, +2 Tal | 28 | 5 | 18 | 10 | 24 | 25/25 |  |
| 7 | +2 For, +2 Tal, +1 Vit | 30 | 5 | 20 | 10 | 25 | 30/30 |  |
| 8 | +3 Vit, +2 Agi | 30 | 5 | 20 | 12 | 28 | 35/35 |  |
| 9 | +3 For, +2 Vit | 33 | 5 | 20 | 12 | 30 | 40/40 | ✔ Machado de Rebite (For 30, Tal 20)<br>✔ Couraça de Ferro Frio (For 28)<br>✔ Elmo de Ferro Frio (For 26)<br>✔ Manoplas de Ferro Frio (For 25)<br>✔ Grevas de Ferro Frio (For 25) |
| 10 | +3 For, +2 Tal | 36 | 5 | 22 | 12 | 30 | 45/45 |  |
| 11 | +5 Vit | 36 | 5 | 22 | 12 | 35 | 50/50 |  |
| 12 | +3 Vit, +2 Agi | 36 | 5 | 22 | 14 | 38 | 55/55 |  |
| 13 | +3 For, +2 Tal | 39 | 5 | 24 | 14 | 38 | 60/60 | ✔ Machado da Galeria (For 36, Tal 22)<br>✔ Couraça de Aço da Vigília (For 34)<br>✔ Elmo de Aço da Vigília (For 32)<br>✔ Manoplas de Aço da Vigília (For 31)<br>✔ Grevas de Aço da Vigília (For 31) |
| 14 | +3 For, +2 Tal | 42 | 5 | 26 | 14 | 38 | 65/65 |  |
| 15 | +2 For, +3 Vit | 44 | 5 | 26 | 14 | 41 | 70/70 |  |
| 16 | +5 Vit | 44 | 5 | 26 | 14 | 46 | 75/75 |  |
| 17 | +3 For, +2 Tal | 47 | 5 | 28 | 14 | 46 | 80/80 | ✔ Machado de Brasa Fria (For 44, Tal 26)<br>✔ Couraça de Liga Rubra (For 42)<br>✔ Elmo de Liga Rubra (For 40)<br>✔ Manoplas de Liga Rubra (For 39)<br>✔ Grevas de Liga Rubra (For 39) |
| 18 | +3 For, +2 Vit | 50 | 5 | 28 | 14 | 48 | 85/85 |  |
| 19 | +5 Vit | 50 | 5 | 28 | 14 | 53 | 90/90 |  |
| 20 | +3 Agi, +2 Vit | 50 | 5 | 28 | 17 | 55 | 95/95 | ✔ Machado do Meridiano Partido (For 50, Tal 28)<br>✔ Couraça de Meridiano (For 48)<br>✔ Elmo de Meridiano (For 46)<br>✔ Manoplas de Meridiano (For 45)<br>✔ Grevas de Meridiano (For 45) |

### Tecelão da Brasa de varinha e foco (exemplo mágico)

Começa com Força 7, Espírito 20, Talento 12, Agilidade 9, Vitalidade 12. Cada linha distribui exatamente os 5 pontos do nível; a coluna "Conjunto da faixa" confere, no nível em que a faixa abre, todos os requisitos com os pontos realmente gastos até ali.

| Nível | Distribuição | For | Esp | Tal | Agi | Vit | Gastos / disponíveis | Conjunto da faixa |
|---|---|---|---|---|---|---|---|---|
| 1 | — | 7 | 20 | 12 | 9 | 12 | 0/0 | ✔ Varinha de Vidro Bruto (Esp 15, Tal 9)<br>✔ Foco de Vidro Bruto (Esp 13)<br>✔ Veste de Linho (Esp 12)<br>✔ Diadema de Linho (Esp 11)<br>✔ Mitenes de Linho (Esp 10)<br>✔ Sandálias de Linho (Esp 10) |
| 2 | +3 Esp, +2 Tal | 7 | 23 | 14 | 9 | 12 | 5/5 |  |
| 3 | +2 Esp, +3 Vit | 7 | 25 | 14 | 9 | 15 | 10/10 |  |
| 4 | +3 Vit, +1 Tal, +1 Agi | 7 | 25 | 15 | 10 | 18 | 15/15 |  |
| 5 | +3 Esp, +2 Tal | 7 | 28 | 17 | 10 | 18 | 20/20 | ✔ Varinha de Vidro Fosco (Esp 25, Tal 14)<br>✔ Foco de Lente de Bomba (Esp 22)<br>✔ Veste de Lã de Fuligem (Esp 22)<br>✔ Diadema de Lã de Fuligem (Esp 20)<br>✔ Mitenes de Lã de Fuligem (Esp 19)<br>✔ Sandálias de Lã de Fuligem (Esp 19) |
| 6 | +3 Esp, +2 Vit | 7 | 31 | 17 | 10 | 20 | 25/25 |  |
| 7 | +5 Vit | 7 | 31 | 17 | 10 | 25 | 30/30 |  |
| 8 | +3 Esp, +2 Tal | 7 | 34 | 19 | 10 | 25 | 35/35 |  |
| 9 | +4 Esp, +1 Tal | 7 | 38 | 20 | 10 | 25 | 40/40 | ✔ Varinha de Cobre Torcido (Esp 31, Tal 17)<br>✔ Foco de Âmbar Fundido (Esp 29)<br>✔ Veste de Tecido de Bomba (Esp 29)<br>✔ Diadema de Tecido de Bomba (Esp 27)<br>✔ Mitenes de Tecido de Bomba (Esp 26)<br>✔ Sandálias de Tecido de Bomba (Esp 26) |
| 10 | +5 Vit | 7 | 38 | 20 | 10 | 30 | 45/45 |  |
| 11 | +3 Esp, +2 Tal | 7 | 41 | 22 | 10 | 30 | 50/50 |  |
| 12 | +4 Esp, +1 Tal | 7 | 45 | 23 | 10 | 30 | 55/55 |  |
| 13 | +1 Tal, +4 Vit | 7 | 45 | 24 | 10 | 34 | 60/60 | ✔ Varinha do Eco (Esp 38, Tal 20)<br>✔ Foco do Eco Preso (Esp 36)<br>✔ Veste de Seda do Eco (Esp 36)<br>✔ Diadema de Seda do Eco (Esp 34)<br>✔ Mitenes de Seda do Eco (Esp 33)<br>✔ Sandálias de Seda do Eco (Esp 33) |
| 14 | +5 Vit | 7 | 45 | 24 | 10 | 39 | 65/65 |  |
| 15 | +5 Esp | 7 | 50 | 24 | 10 | 39 | 70/70 |  |
| 16 | +3 Esp, +2 Tal | 7 | 53 | 26 | 10 | 39 | 75/75 |  |
| 17 | +2 Esp, +2 Tal, +1 Vit | 7 | 55 | 28 | 10 | 40 | 80/80 | ✔ Varinha de Liga Rubra (Esp 45, Tal 24)<br>✔ Foco Rubro (Esp 43)<br>✔ Veste de Brocado Rubro (Esp 43)<br>✔ Diadema de Brocado Rubro (Esp 41)<br>✔ Mitenes de Brocado Rubro (Esp 40)<br>✔ Sandálias de Brocado Rubro (Esp 40) |
| 18 | +5 Vit | 7 | 55 | 28 | 10 | 45 | 85/85 |  |
| 19 | +3 Vit, +2 Agi | 7 | 55 | 28 | 12 | 48 | 90/90 |  |
| 20 | +5 Vit | 7 | 55 | 28 | 12 | 53 | 95/95 | ✔ Cajado da Câmara Rubra (Esp 55, Tal 28)<br>✔ Veste de Tecido do Meridiano (Esp 52)<br>✔ Diadema de Tecido do Meridiano (Esp 50)<br>✔ Mitenes de Tecido do Meridiano (Esp 49)<br>✔ Sandálias de Tecido do Meridiano (Esp 49) |

## 4.7 Fórmulas de combate (dados em data/formulas.json)

- **Dano físico bruto** = rolagem(dano mín..máx da arma) + ⌊Σ atributo × coeficiente da família⌋. Ex.: machados For×0,30 + Tal×0,10 (duas mãos: For×0,35), lanças For×0,30 + Tal×0,15, arcos e azagaias Agi×0,30 + Tal×0,10, espadas For×0,30 + Esp×0,10, garras For×0,25 + Tal×0,15.
- **Habilidade física** = ⌊bruto × (pct + pctPorGrau × (grau − 1)) / 100⌋; efeitos de reforço (ex.: Ímpeto) multiplicam depois.
- **Dano mágico bruto (magia)** = fixo + fixoPorGrau × (grau − 1) + ⌊Espírito × coefEsp⌋ + poder mágico (arma + foco). **Ataque básico mágico** = rolagem da arma + ⌊Espírito × 0.2⌋.
- **Crítico**: chance física = crítico da arma (+ aljava) + Talento × 0.15 + Agilidade × 0.1 − 2 por nível que o alvo tiver acima, teto 40%; dano ×1,6. Mágica = 3 + Espírito × 0.05 + Talento × 0.1; dano ×1,5.
- **Defesa** = Σ defesa dos itens × (1 + 10% por refino) + ⌊Vitalidade × 0.3⌋ + nível. **Resistência mágica** = Σ itens + ⌊Espírito × 0.3⌋ + ⌊Vitalidade × 0.2⌋.
- **Mitigação** (vale para defesa e resistência): final = round(bruto × K / (K + defesa)), K = 40 + 8 × nível do atacante; mínimo 1. Defesa nunca zera o dano e perde força contra atacantes de nível alto.
- **Precisão física** = Talento × 1 + Agilidade × 0,5 (corpo a corpo) ou Agilidade × 1 + Talento × 0,5 (distância) + nível × 2 + precisão da arma/aljava. **Evasão** = ⌊Agilidade × 0.5⌋ + nível + evasão dos itens.
- **Chance de acerto físico** = clamp(80 + (precisão − evasão) × 0.4 + (nívelAtacante − nívelAlvo) × 2, 10, 98)%. **Magia** não usa evasão: clamp(100 + 4 × (nívelAtacante − nívelAlvo), 60, 100)%.
- **Vida** = vidaBase da classe + Vitalidade × vidaPorVit + (nível − 1) × vidaPorNível. **Mana** = manaBase + Espírito × manaPorEsp + (nível − 1) × manaPorNível.

### Exemplo 1 — ataque básico físico

Quebraferro nível 5 (For 22, Tal 14, Agi 10, Vit 29) com **Machado de Pedreira** (9–15) contra **Javali de Cinza** (nível 5, defesa 14, evasão 17). Rolagens fixas para o exemplo: acerto 0,30; dano 0,50; crítico 0,95.

1. Precisão = Tal 14 × 1 + Agi 10 × 0,5 + nível 5 × 2 = **29**.
2. Acerto = 80 + (29 − 17) × 0,4 + (5 − 5) × 2 = **84,8%**. Rolagem 30 < 84,8 → acerta.
3. Rolagem da arma: 9 + ⌊0,50 × 7⌋ = **12**. Parte de atributos: ⌊22 × 0,30 + 14 × 0,10⌋ = **8**. Bruto = **20**.
4. Crítico = arma 5 + Tal 14 × 0,15 + Agi 10 × 0,1 = **8,1%**; rolagem 95 → sem crítico.
5. K = 40 + 8 × 5 = **80**. Final = round(20 × 80 / (80 + 14)) = **17**.

### Exemplo 2 — habilidade física (Talho Profundo, grau 2) com crítico

Mesmo atacante e alvo. Rolagens: acerto 0,30; dano 0,50; crítico 0,02.

1. Acerto 84,8% (igual ao exemplo 1) → acerta.
2. Bruto da arma = 12 + 8 = 20. Percentual do grau 2 = 150 + 12 × 1 = **162%** → ⌊20 × 162 / 100⌋ = **32**.
3. Crítico 8,1%; rolagem 2 → **crítico**: ⌊32 × 1,6⌋ = **51**.
4. Final = round(51 × 80 / (80 + 14)) = **43**.
5. Sangramento do grau 2: 4 + 2 × 1 = **6 por segundo durante 3 s** (18 no total, sem mitigação), creditado ao Quebraferro para XP e saque.

### Exemplo 3 — magia (Faísca de Vidro, grau 2)

Tecelão da Brasa nível 5 (Esp 25, Tal 14) com **Varinha de Vidro Fosco** (poder mágico 10) e **Foco de Lente de Bomba** (poder mágico 6) contra o mesmo Javali de Cinza (resistência mágica 9). Rolagens: acerto 0,40; crítico 0,90.

1. Magia não usa evasão: acerto = clamp(100 + 4 × (5 − 5), 60, 100) = **100%** → acerta.
2. Fixo do grau 2 = 14 + 7 × 1 = **21**. Espírito: ⌊25 × 0,9⌋ = **22**. Poder mágico (arma + foco) = **16**. Bruto = **59**.
3. Crítico mágico = 3 + 25 × 0,05 + 14 × 0,1 = **5,7%**; rolagem 90 → sem crítico.
4. Final = round(59 × 80 / (80 + 9)) = **53** (custa 9 de mana; recarga 2 s).

### Exemplo 4 — defesa e precisão do lado do monstro

O Javali de Cinza (precisão 44, dano 8–10) ataca o Quebraferro do exemplo 1 (Couraça de Bronze de Eclusa 13 + Elmo de Ferro Batido 2, Vit 29).

1. Defesa = ⌊13 + 2⌋ + ⌊29 × 0,3⌋ + 5 = **28**. Evasão = ⌊10 × 0,5⌋ + 5 = **10**.
2. Acerto = 80 + (44 − 10) × 0,4 = **93,6%**; rolagem 30 → acerta.
3. Rolagem de dano = **9**; crítico de monstro fixo em 5% (rolagem 99 → não).
4. K = 40 + 8 × 5 = 80. Final = round(9 × 80 / (80 + 28)) = **7** de 183 de vida.

Os mesmos números saem de `server/src/rules.js`; o teste `rules.test.js` fixa rolagens e confere os resultados. Crítico físico do exemplo: 84,8% de acerto e 8,1% de crítico por golpe.
