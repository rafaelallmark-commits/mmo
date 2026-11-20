<!-- Arquivo gerado por `npm run gen-docs` (server/tools/gen-docs.js) a partir de /data. Edite os dados, não este arquivo. -->


# 3. Origens e classes

Cada classe define atributos iniciais (soma 60), famílias de arma, mão secundária e peso de armadura. Ganha **5 pontos de atributo** e **1 ponto de habilidade** por nível a partir do 2. Habilidades destravam nos níveis 1, 5, 10 (prova de classe, habilidade marcante), 15 (complementar), 20 (avançada) e 25 (a da Cava Primeira, pós-v1); desbloquear dá o grau 1 de graça, cada grau extra custa 1 ponto, até 5 graus, com teto por faixa de nível:

| A partir do nível | Grau máximo |
|---|---|
| 1 | 2 |
| 5 | 3 |
| 10 | 4 |
| 15 | 5 |

Até o nível 20 são 19 pontos de habilidade para 20 graus extras possíveis: ninguém maximiza tudo e a escolha de graus é parte da build. A habilidade do nível 25 soma mais 4 graus e cada nível acima do 20 dá mais um ponto: no teto (nível 25) os 24 pontos cobrem os 24 graus, então a build só se completa no fim da campanha.

Valores por grau seguem a regra "base + porGrau × (grau − 1)". Custos em mana também sobem por grau. "Arma" no alcance significa o alcance da arma equipada (corpo a corpo 2,5 m; lança 3,5 m; azagaia 14 m; arco 18 m; varinha 16 m; cetro 14 m; cajado 18 m).

Diferenças que o design preserva: **lança** (Lanceiro) é corpo a corpo de alcance longo e ataques em linha, **azagaia** (Andarilha) é arremessada a distância; **machado** (Quebraferro) é dano alto sem escudo, **garra/martelo** (Bastião) são armas mecânicas de defesa (somam defesa) com escudo; a **Cantora** protege e cura, o **Tecelão** causa dano em área e controla.


## Origem Âmbar — cidade de Pedrâmbar

Cidade de pedra, madeira e rotas de superfície.


### Quebraferro (jogável no Marco 1)

**Papel:** Dano físico corpo a corpo com golpes fortes.

- **Armas:** Machado (1 mão), Machado (2 mãos)
- **Mão secundária:** nenhuma (armas de uma mão sem escudo, ou duas mãos)
- **Armadura:** pesada (Força)
- **Atributos iniciais:** Força 17 · Espírito 5 · Talento 11 · Agilidade 10 · Vitalidade 17
- **Nível 1 com o kit inicial:** vida 111, mana 20, defesa 12, precisão 18, crítico 7,7%
- **Kit inicial (tutorial adapta à classe):** equipado Machado de Lasca, Couraça de Ferro Batido; na bolsa Machado de Lenhador, Tônico de Vida Pequeno ×5

| Habilidade | Nível | Mana | Recarga | Alcance | Efeito | Valor principal nos graus 1–5 | Marco |
|---|---|---|---|---|---|---|---|
| **Talho Profundo** | 1 | 6 (+1/grau) | 4 s | arma | Golpe pesado que abre a guarda: 150% do dano da arma (+12% por grau) e sangramento de 4 (+2 por grau) por segundo durante 3 s. | 150% / 162% / 174% / 186% / 198% | M1 |
| **Ímpeto** | 5 | 12 (+2/grau) | 25 s | si | Por 10 s: +15% de dano físico (+5% por grau) e +10% de velocidade de ataque. | 15% / 20% / 25% / 30% / 35% | M1 |
| **Ruptura** | 10 | 20 (+3/grau) | 12 s | 4 m | Golpe em cone à frente (4 m): 220% (+20% por grau); reduz a defesa dos atingidos em 20% por 6 s. Habilidade marcante da prova de classe. | 220% / 240% / 260% / 280% / 300% | M2 |
| **Couraça de Brita** | 15 | 18 (+2/grau) | 30 s | si | Absorve dano igual a 10% da vida máxima (+3% por grau) por 8 s e fica imune a atordoamento. | 10% / 13% / 16% / 19% / 22% | M3 |
| **Fenda Sísmica** | 20 | 32 (+4/grau) | 20 s | 8 m | Racha o chão em linha (8 m): 300% (+25% por grau); derruba monstros normais por 1,5 s. | 300% / 325% / 350% / 375% / 400% | M3 |
| **Talho Sem Fundo** | 25 | 34 (+4/grau) | 18 s | arma | Golpe que chega ao fundo da couraça: 360% do dano da arma (+30% por grau), sangramento de 12 (+4 por grau) por segundo durante 4 s e defesa do alvo −25% por 8 s. | 360% / 390% / 420% / 450% / 480% | Pós-v1 |

### Bastião de Bronze (jogável no M2)

**Papel:** Defesa física, controle e proteção do grupo.

- **Armas:** Garra mecânica, Martelo (1 mão)
- **Mão secundária:** Escudo
- **Armadura:** pesada (Força)
- **Atributos iniciais:** Força 16 · Espírito 6 · Talento 12 · Agilidade 8 · Vitalidade 18
- **Nível 1 com o kit inicial:** vida 128, mana 23, defesa 17, precisão 18, crítico 5,6%
- **Kit inicial (tutorial adapta à classe):** equipado Martelo de Rebitar, Escudo de Ferro Batido, Couraça de Ferro Batido; na bolsa Garra de Arame, Tônico de Vida Pequeno ×5

| Habilidade | Nível | Mana | Recarga | Alcance | Efeito | Valor principal nos graus 1–5 | Marco |
|---|---|---|---|---|---|---|---|
| **Placa Dinâmica** | 1 | 8 (+1/grau) | 18 s | si | Placas se reorganizam: +30% de defesa (+8% por grau) por 12 s. | 30% / 38% / 46% / 54% / 62% | M2 |
| **Pulso de Atração** | 5 | 14 (+2/grau) | 14 s | 7 m | Puxa até 3 monstros num raio de 7 m (+1 a cada 2 graus), causa 60% do dano da arma e gera ameaça triplicada. | 60% / 60% / 60% / 60% / 60% | M2 |
| **Reforço de Campo** | 10 | 24 (+3/grau) | 35 s | 8 m | Aliados a até 8 m: +15% de defesa (+4% por grau); 20% do dano que sofrem é redirecionado ao Bastião por 10 s. | 15% / 19% / 23% / 27% / 31% | M2 |
| **Engrenagem Travada** | 15 | 16 (+2/grau) | 15 s | arma | Golpe de garra que trava o alvo: 120% e atordoamento de 1,5 s (+0,25 s por grau). | 120% / 120% / 120% / 120% / 120% | M3 |
| **Bastilha Viva** | 20 | 30 (+3/grau) | 45 s | 8 m | Provoca todos os monstros a até 8 m e reduz o dano recebido em 30% (+3% por grau) por 8 s. | 30% / 33% / 36% / 39% / 42% | M3 |
| **Toque de Bronze** | 25 | 30 (+3/grau) | 24 s | 4 m | Bate a arma no chão como um badalo: 160% (+12% por grau) em todos a até 4 m e atordoamento de 1,5 s (+0,25 s por grau). Não atordoa chefes. | 160% / 172% / 184% / 196% / 208% | Pós-v1 |

### Lanceiro do Fosso (jogável no M2)

**Papel:** Dano físico explosivo, alcance corpo a corpo e ataques em linha.

- **Armas:** Lança/pique (2 mãos)
- **Mão secundária:** nenhuma (armas de uma mão sem escudo, ou duas mãos)
- **Armadura:** pesada (Força)
- **Atributos iniciais:** Força 16 · Espírito 5 · Talento 13 · Agilidade 11 · Vitalidade 15
- **Nível 1 com o kit inicial:** vida 103, mana 20, defesa 11, precisão 20, crítico 10%
- **Kit inicial (tutorial adapta à classe):** equipado Lança de Freixo, Couraça de Ferro Batido; na bolsa Tônico de Vida Pequeno ×5

| Habilidade | Nível | Mana | Recarga | Alcance | Efeito | Valor principal nos graus 1–5 | Marco |
|---|---|---|---|---|---|---|---|
| **Estocada Longa** | 1 | 7 (+1/grau) | 5 s | 5 m | Estocada de 5 m: 160% (+12% por grau), atravessa até 2 alvos em linha. | 160% / 172% / 184% / 196% / 208% | M2 |
| **Linha Partida** | 5 | 14 (+2/grau) | 10 s | 7 m | Varredura em linha de 7 m: 130% (+10% por grau) em todos na linha e empurra levemente. | 130% / 140% / 150% / 160% / 170% | M2 |
| **Avanço do Fosso** | 10 | 22 (+3/grau) | 15 s | 10 m | Investida de até 10 m: 250% (+20% por grau) no alvo e 100% nos adjacentes. Habilidade marcante. | 250% / 270% / 290% / 310% / 330% | M2 |
| **Haste Firme** | 15 | 18 (+2/grau) | 30 s | si | Por 10 s, ataques básicos atingem 2 alvos em linha e ganham +10% de crítico (+2% por grau). | 10% / 12% / 14% / 16% / 18% | M3 |
| **Muralha de Piques** | 20 | 34 (+4/grau) | 22 s | 6 m | Três estocadas em leque (6 m), 140% cada (+10% por grau). | 140% / 150% / 160% / 170% / 180% | M3 |
| **Roda do Fosso** | 25 | 32 (+4/grau) | 18 s | 4.5 m | Gira a lança em volta de si (4,5 m): 220% (+18% por grau) em todos os atingidos, que são empurrados 2 m. | 220% / 238% / 256% / 274% / 292% | Pós-v1 |

### Vigia do Espinhal (jogável no M2)

**Papel:** Dano físico à distância, precisão e vários alvos.

- **Armas:** Arco
- **Mão secundária:** Aljava
- **Armadura:** leve (Agilidade e Talento)
- **Atributos iniciais:** Força 9 · Espírito 7 · Talento 13 · Agilidade 18 · Vitalidade 13
- **Nível 1 com o kit inicial:** vida 84, mana 27, defesa 8, precisão 29, crítico 11,8%
- **Kit inicial (tutorial adapta à classe):** equipado Arco de Vime, Aljava de Couro Cru, Gibão de Couro Cru; na bolsa Tônico de Vida Pequeno ×5

| Habilidade | Nível | Mana | Recarga | Alcance | Efeito | Valor principal nos graus 1–5 | Marco |
|---|---|---|---|---|---|---|---|
| **Marca da Trilha** | 1 | 6 (+1/grau) | 8 s | 20 m | Marca o alvo por 12 s: recebe +10% de dano físico de todas as fontes (+3% por grau) e perde 10 de evasão. | 10% / 13% / 16% / 19% / 22% | M2 |
| **Flecha de Passagem** | 5 | 12 (+2/grau) | 8 s | 20 m | Flecha que perfura em linha (20 m): 140% (+12% por grau) em todos. | 140% / 152% / 164% / 176% / 188% | M2 |
| **Chuva de Espinhos** | 10 | 26 (+3/grau) | 16 s | 18 m | Área de 5 m a até 18 m: 5 pulsos de 50% (+5% por grau) em 2,5 s. Habilidade marcante. | 50% / 55% / 60% / 65% / 70% | M2 |
| **Passo de Recuo** | 15 | 12 (+1/grau) | 18 s | si | Salta 6 m para trás e ganha +20 de evasão (+4 por grau) por 5 s. | 20 / 24 / 28 / 32 / 36 | M3 |
| **Tiro do Espinhal** | 20 | 30 (+3/grau) | 20 s | 24 m | Disparo carregado (1 s): 400% (+30% por grau); crítico garantido contra alvo com Marca da Trilha. | 400% / 430% / 460% / 490% / 520% | M3 |
| **Flecha do Sino** | 25 | 28 (+3/grau) | 14 s | 20 m | Flecha que ressoa como um sino: 220% (+18% por grau) no alvo e ricocheteia em até 3 inimigos a até 6 m dele. | 220% / 238% / 256% / 274% / 292% | Pós-v1 |

## Origem Nacre — cidade de Vau de Nácar

Cidade de condutores que atravessam montanhas e rios.


### Escudeiro do Alvorecer (jogável no M2)

**Papel:** Dano físico com reforço sagrado, defesa e auxílio aos aliados próximos.

- **Armas:** Espada (1 mão), Espada (2 mãos)
- **Mão secundária:** Escudo
- **Armadura:** pesada (Força)
- **Atributos iniciais:** Força 15 · Espírito 11 · Talento 9 · Agilidade 9 · Vitalidade 16
- **Nível 1 com o kit inicial:** vida 110, mana 38, defesa 15, precisão 15, crítico 7,3%
- **Kit inicial (tutorial adapta à classe):** equipado Espada de Guarda, Escudo de Ferro Batido, Couraça de Ferro Batido; na bolsa Montante de Guarda, Tônico de Vida Pequeno ×5

| Habilidade | Nível | Mana | Recarga | Alcance | Efeito | Valor principal nos graus 1–5 | Marco |
|---|---|---|---|---|---|---|---|
| **Corte Solar** | 1 | 7 (+1/grau) | 5 s | arma | Corte reforçado: 140% (+10% por grau) mais 6 de dano sagrado (+3 por grau). | 140% / 150% / 160% / 170% / 180% | M2 |
| **Guarda da Aurora** | 5 | 16 (+2/grau) | 30 s | 6 m | Aliados a até 6 m (inclusive o Escudeiro): +12% de defesa (+3% por grau) e regeneram 1% da vida por segundo durante 10 s. | 12% / 15% / 18% / 21% / 24% | M2 |
| **Juramento** | 10 | 20 (+2/grau) | 25 s | 10 m | Escolhe um aliado: 30% (+4% por grau) do dano que ele sofre vai para o Escudeiro, que ganha +15% de defesa por 12 s. Habilidade marcante. | — / — / — / — / — | M2 |
| **Lâmina do Meio-Dia** | 15 | 22 (+2/grau) | 14 s | 3 m | Giro em área de 3 m: 180% (+15% por grau) mais 12 de dano sagrado (+4 por grau). | 180% / 195% / 210% / 225% / 240% | M3 |
| **Alvorada** | 20 | 36 (+3/grau) | 60 s | 8 m | Aliados a até 8 m recuperam 15% da vida máxima (+2% por grau) e perdem um efeito negativo. | 15% / 17% / 19% / 21% / 23% | M3 |
| **Sentença da Aurora** | 25 | 30 (+3/grau) | 16 s | arma | Golpe de sentença: 300% (+25% por grau) mais 30 de dano sagrado (+8 por grau) e atordoamento de 1,5 s (+0,2 s por grau). Não atordoa chefes. | 300% / 325% / 350% / 375% / 400% | Pós-v1 |

### Andarilha do Vento (jogável no M2)

**Papel:** Dano físico à distância, mobilidade e fortalecimento ofensivo do grupo.

- **Armas:** Azagaia arremessável (1 mão)
- **Mão secundária:** Escudo leve
- **Armadura:** leve (Agilidade e Talento)
- **Atributos iniciais:** Força 10 · Espírito 8 · Talento 12 · Agilidade 17 · Vitalidade 13
- **Nível 1 com o kit inicial:** vida 87, mana 29, defesa 10, precisão 25, crítico 9,5%
- **Kit inicial (tutorial adapta à classe):** equipado Azagaia de Junco, Broquel de Couro Cru, Gibão de Couro Cru; na bolsa Tônico de Vida Pequeno ×5

| Habilidade | Nível | Mana | Recarga | Alcance | Efeito | Valor principal nos graus 1–5 | Marco |
|---|---|---|---|---|---|---|---|
| **Arremesso de Retorno** | 1 | 6 (+1/grau) | 5 s | 14 m | A azagaia vai e volta: 130% (+10% por grau) no alvo e num segundo inimigo no retorno. | 130% / 140% / 150% / 160% / 170% | M2 |
| **Passo Lateral** | 5 | 8 (+1/grau) | 10 s | si | Desliza 5 m para o lado; o próximo ataque causa +40% (+8% por grau). | 40% / 48% / 56% / 64% / 72% | M2 |
| **Vento a Favor** | 10 | 24 (+3/grau) | 40 s | 10 m | Grupo a até 10 m: +10% de dano físico (+2,5% por grau) e +8% de velocidade por 15 s. Habilidade marcante. | 10% / 12.5% / 15% / 17.5% / 20% | M2 |
| **Rajada Cortante** | 15 | 18 (+2/grau) | 12 s | 12 m | Arremessa 3 azagaias em leque (12 m), 90% cada (+8% por grau). | 90% / 98% / 106% / 114% / 122% | M3 |
| **Olho do Furacão** | 20 | 34 (+3/grau) | 30 s | 4 m | Gira por 4 s: 4 pulsos de 80% (+6% por grau) num raio de 4 m e +30 de evasão. | 80% / 86% / 92% / 98% / 104% | M3 |
| **Redemoinho de Cinzas** | 25 | 32 (+3/grau) | 20 s | 16 m | Lança um redemoinho a até 16 m: área de 4 m com 5 pulsos de 60% (+5% por grau) em 3 s; quem fica dentro anda 35% mais devagar. | 60% / 65% / 70% / 75% / 80% | Pós-v1 |

### Cantora do Véu (jogável no M2)

**Papel:** Cura, proteção e dano sagrado à distância.

- **Armas:** Varinha, Cetro, Cajado (2 mãos)
- **Mão secundária:** Foco
- **Armadura:** vestes mágicas (Espírito)
- **Atributos iniciais:** Força 7 · Espírito 19 · Talento 12 · Agilidade 9 · Vitalidade 13
- **Nível 1 com o kit inicial:** vida 79, mana 66, defesa 7, precisão 18, crítico 5,7%
- **Kit inicial (tutorial adapta à classe):** equipado Cetro de Latão, Foco de Vidro Bruto, Veste de Linho; na bolsa Cajado de Aprendiz, Tônico de Vida Pequeno ×5

| Habilidade | Nível | Mana | Recarga | Alcance | Efeito | Valor principal nos graus 1–5 | Marco |
|---|---|---|---|---|---|---|---|
| **Canto de Amparo** | 1 | 10 (+2/grau) | 3 s | 16 m | Cura um aliado (ou a si) em 20 (+10 por grau) + 60% do Espírito. | 20 / 30 / 40 / 50 / 60 | M2 |
| **Luz Compartilhada** | 5 | 22 (+3/grau) | 10 s | 8 m | Cura todos os aliados a até 8 m em 12 (+6 por grau) + 35% do Espírito. | 12 / 18 / 24 / 30 / 36 | M2 |
| **Selo do Véu** | 10 | 20 (+2/grau) | 12 s | 16 m | Escudo que absorve 30 (+15 por grau) + 80% do Espírito por 10 s; ao se romper, afasta inimigos próximos. Habilidade marcante. | 30 / 45 / 60 / 75 / 90 | M2 |
| **Nota Clara** | 15 | 12 (+1/grau) | 4 s | 16 m | Dano sagrado de 25 (+10 por grau) + 70% do Espírito; +50% contra máquinas. | 25 / 35 / 45 / 55 / 65 | M3 |
| **Coro do Recomeço** | 20 | 40 (+3/grau) | 90 s | 12 m | Levanta um aliado caído com 30% da vida (+5% por grau). Conjuração de 2 s. | 30% / 35% / 40% / 45% / 50% | M3 |
| **Canto de Vigília** | 25 | 38 (+3/grau) | 40 s | 10 m | Grupo a até 10 m (inclusive a Cantora): regenera 2% da vida máxima por segundo (+0,5% por grau) e ganha +10% de defesa durante 10 s. | 10% / 10% / 10% / 10% / 10% | Pós-v1 |

### Tecelão da Brasa (jogável no Marco 1)

**Papel:** Magia elemental, dano em área e controle de grupos de monstros.

- **Armas:** Varinha, Cajado (2 mãos)
- **Mão secundária:** Foco
- **Armadura:** vestes mágicas (Espírito)
- **Atributos iniciais:** Força 7 · Espírito 20 · Talento 12 · Agilidade 9 · Vitalidade 12
- **Nível 1 com o kit inicial:** vida 74, mana 68, defesa 7, precisão 18, crítico 5,7%
- **Kit inicial (tutorial adapta à classe):** equipado Varinha de Vidro Bruto, Foco de Vidro Bruto, Veste de Linho; na bolsa Cajado de Aprendiz, Tônico de Vida Pequeno ×5

| Habilidade | Nível | Mana | Recarga | Alcance | Efeito | Valor principal nos graus 1–5 | Marco |
|---|---|---|---|---|---|---|---|
| **Faísca de Vidro** | 1 | 8 (+1/grau) | 2 s | 16 m | Estilhaço incandescente: dano de fogo de 14 (+7 por grau) + 90% do Espírito + poder mágico da arma. | 14 / 21 / 28 / 35 / 42 | M1 |
| **Chão em Brasa** | 5 | 20 (+2/grau) | 12 s | 16 m | Incendeia uma área de 4 m a até 16 m: 4 pulsos de 8 (+4 por grau) + 25% do Espírito em 4 s; reduz a velocidade em 30%. | 8 / 12 / 16 / 20 / 24 | M1 |
| **Círculo de Fuligem** | 10 | 26 (+3/grau) | 20 s | 5 m | Anel de fuligem de 5 m ao redor: enraíza por 2 s (+0,3 s por grau) e causa 30 (+12 por grau) + 60% do Espírito. Habilidade marcante. | 30 / 42 / 54 / 66 / 78 | M2 |
| **Véu de Calor** | 15 | 18 (+2/grau) | 25 s | si | Escudo próprio que absorve 25 (+12 por grau) + 60% do Espírito por 8 s; atacantes corpo a corpo sofrem 5 de queimadura. | 25 / 37 / 49 / 61 / 73 | M3 |
| **Coração da Fornalha** | 20 | 45 (+4/grau) | 35 s | 18 m | Marca uma área de 6 m que explode após 3 s: 90 (+30 por grau) + 200% do Espírito. A marcação é visível para todos. | 90 / 120 / 150 / 180 / 210 | M3 |
| **Fio Incandescente** | 25 | 36 (+3/grau) | 12 s | 18 m | O Tecelão estica um fio de brasa até o alvo: dano de fogo de 110 (+32 por grau) + 150% do Espírito + poder mágico da arma, e queimadura de 20 (+6 por grau) por segundo durante 4 s. | 110 / 142 / 174 / 206 / 238 | Pós-v1 |

Ataque básico: todas as classes têm, sem custo, com o intervalo e o alcance da arma. Armas mágicas causam dano mágico no ataque básico (rolagem da arma + 20% do Espírito).
