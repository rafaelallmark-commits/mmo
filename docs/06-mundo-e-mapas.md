# 6. Cidades, áreas de caça, combate e interface

Complementa os itens 2 e 5. Os números de monstros (vida, dano, XP, agressão, perseguição, reaparecimento) estão em `data/monsters.json`; a tabela completa está em `04-progressao-e-formulas.md`.

## Regras gerais de monstros

| Regra | Valor (editável) | Efeito |
|---|---|---|
| Agressão | passivos: só reagem; agressivos: raio de 8 m (elite 10 m) | O jogador escolhe quando lutar com passivos; agressivos punem quem atravessa distraído. |
| Matilha | mesma espécie a até 8 m entra na luta quando uma é atingida | Cães de Ferrugem, Ratos-Engrenagem, Morcegos de Eco: puxar pela borda. |
| Perseguição (coleira) | 25 m da posição de origem | Ao passar disso o monstro volta, recupera a vida e esquece a ameaça. Impede arrastar monstros até a cidade. |
| Zona segura | raio de 12 m no posto de guarda | Monstros não iniciam agressão contra quem está dentro; não impede o jogador de lutar. |
| Ameaça | dano causado (×3 com Pulso de Atração, M2) | O monstro persegue quem gerou mais ameaça; Bastião e Escudeiro têm ferramentas para segurar. |
| Reaparecimento | normal 20 s, elite 120 s, chefe só por instância | Pontos de caça se mantêm vivos com 2–5 jogadores. |
| Saque | individual por participante (≥ 5% de participação) | Ninguém disputa saque; cada um vê só o seu. |

## Mecânicas dos monstros

Vinte espécies têm uma mecânica própria (campo `mechanic` de `data/monsters.json`, aplicada em `server/src/mechanics.js`; os números exatos estão na tabela "Mecânicas dos monstros" de [docs/04](04-progressao-e-formulas.md), gerada dos dados). Regras comuns:

- **Golpe de área sempre avisado.** O monstro para, recua, treme e vira para onde vai golpear; o chão marca a área em vermelho — círculo em volta dele, círculo onde o alvo está, cone à frente ou linha — e um sino toca no lugar dele. Quando a marcação enche, o golpe acerta quem ficou dentro (com 0,3 m de folga do corpo na borda); quem saiu não leva nada. O aviso dura 1,5 s nas linhas, no cone e nos círculos de até 4 m, 1,75 s no vapor da Bomba-Mestra, na Escória e no fio sob os pés, e 2 s nos círculos de 5 a 6 m e no Martelo do Capataz (o primeiro elite); nunca menos de 1,2 s (o `validate-data` recusa): tempo de perceber (~0,7 s), clicar e dar os passos para fora. Atordoar o monstro durante o aviso cancela o golpe e a marcação some; o mesmo vale quando ele morre ou sai da luta no meio do aviso. Enraizado (Círculo de Fuligem) durante o aviso, quem corre pela linha — Javali e Lâmina — fica no lugar: a corrida só pega quem está colado na frente dele. As marcações acompanham o relevo do chão, sem sumir numa elevação.
- **Efeitos negativos são curtos** (3 a 4 s): aparecem sob as barras de vida e mana com o tempo que falta e como uma marca no personagem, e a **Alvorada** tira um por vez (o atordoamento primeiro, depois o que dura mais). **Controle** de monstro — o atordoamento (Fio Condutor, Descarga do Fragmento, linhas do Custódio) e o Selo — passa pela resistência a controle da Vitalidade (até 50% mais curto) e não pega em quem está imune a controle (Égide Firme), que também não é puxado. Lentidão (Desorientado, Atolado) e a drenagem de mana valem o tempo inteiro.
- **Reforços** (Ratos-Engrenagem do Supervisor, Ecoantes da Mãe do Eco) dão XP, não deixam saque e somem quando quem os chamou cai ou volta para casa.
- O **quadro do alvo** mostra a descrição do monstro numa linha — é ali que se descobre o que cada um faz.

| Monstro | Mecânica | Como jogar |
|---|---|---|
| Besouro-Brasa (2), Salamandra de Cisterna (21) | **Ninho** / **Margem**: passivos que mordem quem chega a 2,5 m | Contorne o bando e puxe um de cada vez. |
| Lagarto de Lastro (4) | golpes lentos e pesados (um a cada 2,6 s, mesmo dano por segundo) | Pancadas maiores: beba antes de a vida ficar baixa. |
| Capataz Rachado (4, elite) | **Martelo de Turno**: círculo de 3,5 m em volta dele, aviso de 2 s | O primeiro elite ensina a sair do vermelho. |
| Javali de Cinza (5) | **Investida** em linha contra quem está a 4–12 m, já ao entrar em combate | Um passo de lado: ele passa direto e fica longe. |
| Sapo-Bomba (5), Escória Pressurizada (18) | **Estouro de Vapor** / **Explosão de Escória**: explodem ao morrer (3,5 e 4 m) | Depois do golpe final, afaste-se do corpo. |
| Bomba-Mestra Desregulada (8, elite) | **Pressão Alternada**: alta por 8 s (+30% de dano), vapor de 4,5 m na virada e baixa por 6 s (−50% de defesa e resistência) | Segure na alta, saia do vapor e gaste tudo na baixa (o quadro do alvo mostra a pressão). |
| Sanguessuga Fervente (9) | **Sanguessuga**: cada mordida gruda e drena 3% da mana por segundo por 3 s | Mate rápido ou de longe; a Alvorada tira. |
| Rato-Engrenagem (10) | **Enxame**: +20% de dano por rato lutando a até 6 m (até +40%) | Puxe um por vez pela borda do bando. |
| Soldador Cego (11) | **Cone de Faíscas**: 6 m e 70° à frente | Fique ao lado ou atrás dele. |
| Supervisor de Turno (11, elite) | **Chamado de Turno**: dois Ratos-Engrenagem a cada 30% de vida perdida (até seis vivos) | Junte o dano perto dos limiares; o grupo segura os ratos. |
| Lâmina de Esteira (12) | **Corrida no Trilho**: persegue, passeia e volta para casa só nos eixos do mapa e dispara 10 m pelo trilho, através de quem está na frente | Saia do trilho de lado; atrás dele não há perigo. |
| Morcego de Eco (12) | **Grito Desorientador**: 4 m em volta dele, −25% de acerto e de velocidade por 4 s | Afaste-se quando ele recuar para gritar. |
| Ecoante (14) | **Eco**: a cada três golpes, devolve 60% do último golpe que levou a quem o deu | Não termine com o golpe mais forte; em grupo, quem bateu por último leva o eco. |
| Mãe do Eco (15, elite) | **Grito da Mãe**: 6 m em volta dela; cada grito gera um Ecoante (até três) | Saia do círculo; atordoá-la no aviso impede o Ecoante de nascer. |
| Aranha de Conduto (16) | **Fio Condutor**: cai sob a vítima e atordoa 1 s | Saia do círculo sob os pés. |
| Draga Viva (17) | **Arrasto**: 5 m em volta dela; puxa até ela e atola (−40% de velocidade por 3 s) | Saia do círculo (perto dela não há o que puxar, mas o golpe e o atoleiro pegam). |
| Fragmento do Custódio (19, elite) | **Descarga do Fragmento**: linha de 14 m que atordoa 1 s; patrulha até 10 m de casa | Não fique na frente dele. |
| Toupeira de Basalto (24) | **Garras de Pedra**: os golpes ignoram 25% da defesa | A armadura vale menos: tônicos à mão. |
| Selador da Porta Funda (24, elite) | **Selo**: 6 m em volta dele, 3 s sem habilidades | Quem cura fica fora do selo. |

Os demais monstros só perseguem e golpeiam; a matilha (acima) vale para todos os agressivos — é o "chama os vizinhos quando ferido" do Cão de Ferrugem. O Custódio da Eclusa tem o encontro próprio do calabouço (docs/02 §5.3).

## As duas cidades

Ambas têm os mesmos serviços para que nenhuma origem fique em desvantagem: **mestre(s) de classe**, **ferreiro** (refino até +6, Selo de Proteção), **armeiro** (peças comuns da faixa atual e da próxima, para a sua classe), **comerciante de tônicos** (qualquer comerciante compra itens da bolsa pela metade do valor), **depósito** (guarda-volumes compartilhado pelos personagens da conta, M3), **posto de guarda** (ponto de retorno) e **saída para a Estrada Velha**.

### Pedrâmbar (Âmbar) — oeste

Cidade de pedra cortada e vigas escuras, construída em terraços ao redor de uma antiga estação de superfície. Ruas largas para carroças.

- **Praça das Balanças** (centro): depósito e **quadro de missões** (35, 24), ao lado da balança de bronze.
- **Pátio dos Mestres**: Mestre Tarrasco (Quebraferro), Mestra Ione do Bronze (Bastião), Sargento Bel do Fosso (Lanceiro), Vigia-Mor Cássia (Vigia).
- **Forja do Gusmão**: ferreiro (e as missões de materiais, as mesmas da Tiela); ao lado, **Amaro**, o armeiro.
- **Botica da Dona Resina**: tônicos e a missão Ninho Morno.
- **Portão Leste** → Estrada Velha (o Posto da Ponte fica logo depois do portão, a 13 m).

### Vau de Nácar (Nacre) — leste

Cidade sobre pontes e plataformas acima de um rio, atravessada por condutores de nácar que brilham fracos à noite.

- **Plataforma do Relógio** (centro): depósito e **quadro de missões** (25, 35), ao lado da torre do relógio.
- **Claustro dos Mestres**: Dama Aurélia (Escudeiro), Sina (Andarilha), Mãe Nívea (Cantora), Mestre Otan Cinzeiro (Tecelão).
- **Oficina de Tiela Martelo-Fino**: ferreira (e as missões de materiais, as mesmas do Gusmão); ao lado, **Inês**, a armeira.
- **Boticário Lume**: tônicos e a missão Sapos de Vapor.
- **Ponte Oeste** → Estrada Velha (o Posto da Ponte fica na outra ponta da estrada, a 133 m, uns 30 s a pé pela estrada segura).

### Quadro de missões

Clicar no quadro da praça abre a lista de tudo o que o personagem pode aceitar agora **no mundo inteiro**: título, nível, se é principal, secundária ou diária, com quem falar e em que mapa (para NPCs que aparecem em vários mapas, como Joca, Mara e Ilda, o da faixa da missão) e onde se caça quando é outro mapa. Embaixo, as diárias já feitas hoje e em quanto tempo voltam (00:00 UTC).

### Ferreiro (M3, refino até +6 no pós-v1)

Refino de +0 a +6 (números em `data/formulas.json`, `enhance`). Cada grau soma **+8% no dano da arma** e **+10% na defesa e no poder mágico** da peça. A janela mostra **custo explícito** (ouro + material), **chance visível** e **prévia do efeito** antes de confirmar. Ouro e material são gastos sempre. Até +3, a falha mantém o grau; a partir de +3 → +4 a falha **derruba um grau**, a menos que se use um **Selo de Proteção** (vendido pelo ferreiro e raro em elites e chefes), que só é gasto quando segura uma falha.

| Grau | Chance | Ouro (N = nível do item) | Material |
|---|---|---|---|
| +1 | 90% | 12 × 1 × N | Pó de Refino ×1 |
| +2 | 70% | 12 × 2 × N | Pó de Refino ×2 |
| +3 | 45% | 12 × 3 × N | Pó de Refino ×3 |
| +4 | 30% | 12 × 4 × N | Pó de Refino Superior ×2 (falha cai para +3) |
| +5 | 20% | 12 × 5 × N | Pó de Refino Superior ×3 (falha cai para +4) |
| +6 | 12% | 12 × 6 × N | Pó de Refino Superior ×4 (falha cai para +5) |

O ferreiro vende o Pó de Refino e o Selo de Proteção; o Pó de Refino Superior só vem de elites, do Custódio e da Cava Primeira (D108). A Sucata de Condutor e a Brasa Cristalizada não entram no refino: viram Pó de Refino nas missões dos ferreiros (Pêlo de Cinza, Seda Condutora e a diária Brasa para a Forja).

## As áreas de caça

Cinco áreas na versão 1 e, no pós-v1, a sexta (A Cava Primeira, níveis 20–25).

| Área | Níveis | Famílias | Caça solo | Caça em grupo | Rota de retorno | Motivo para voltar |
|---|---|---|---|---|---|---|
| **A Estrada Velha** | 1–5 | bestas (ratos, besouros, cães, lagartos, javalis) e uma máquina elite | Campo do Sulco, Encosta Morna, Leito Seco | Curva dos Cães (matilha), Capataz Rachado | Posto da Ponte na ponta oeste, junto ao portão de Pedrâmbar; Vau de Nácar na ponta leste, pela estrada segura | Capataz Rachado (arma de nível 5 da classe), Sucata de Condutor, família Bronze de Eclusa |
| **Brejo das Bombas** | 5–9 | bestas aquáticas, máquinas de pressão | Lagoa das Bombas, Margem Alta | Poço das Sanguessugas, Canal Raso, Bomba-Mestra | Acampamento da Comporta (posto) | Brasa Cristalizada, elite Bomba-Mestra, família Ferro Frio |
| **Oficina Soterrada** | 9–12 | máquinas de trabalho | Galeria dos Escavadores | Arquivo (enxames), Sala do Supervisor | Boca da Oficina (posto) | Pó de Refino, Supervisor de Turno, família Aço da Vigília |
| **Galerias do Eco** | 12–16 | espíritos sonoros, bestas térmicas, guardiões | Ninhos Térmicos | Salão dos Sinos (Ecoantes), Ponte dos Fios, Mãe do Eco | Estação Sonhada (posto) | Seda condutora para refino, Mãe do Eco, família Liga Rubra |
| **Canais da Eclusa** | 16–20 | máquinas da Eclusa, escória de vapor | Comporta Norte | Bacia de Vapor, Canal Lamacento, Fragmentos do Custódio | Comporta Norte (posto) | Chave de Comporta, calabouço da Última Eclusa, itens únicos de nível 20 |
| **A Cava Primeira** (pós-v1) | 20–25 | bestas do calor fundo, máquinas dos fundadores, vozes presas no metal | Margem da Cisterna (Salamandras, passivas) | Salão das Placas (Sineiros em bando), Poço Quente (Toupeiras), Selador da Porta Funda | Posto de Escuta (posto) | Faixa 21 em toda a Cava, chance de faixa 25, Selador (elite diária), capítulo 6 |

### Lugares que as missões mudam

- **Brejo das Bombas — Válvula principal** (109, 56), ao lado do Joca na frente da Casa das Bombas: com "O Teste de Pressão" (2.2) ativa, começa a defesa. O Joca da defesa (900 de vida, com o nome e a vida em cima) toma o lugar do NPC parado; por 3 minutos, uma onda a cada 30 s (Válvulas Errantes e Enguias de Lodo) sai do lado do canal, (96, 64) e (100, 70), e mira nele até alguém chamar a atenção. Se ele cair, ou o grupo inteiro cair, as ondas somem e ele tenta de novo 30 s depois; um cronômetro no alto da tela mostra o tempo que falta. Uma defesa por jogador ou grupo, como a escolta da carroça.
- **Oficina Soterrada — Trilhos da Esteira** (x 108–140, z 126–154): com "Esteira Desgovernada" ativa, a esteira varre faixas do chão a cada 7 s, com aviso de 2 s (as mesmas faixas acesas do Custódio, em cinco padrões que se repetem); quem estiver numa faixa varrida perde 12% da vida e a contagem de abates seguidos da missão volta a zero. A esteira é só de quem está com a missão: só essas pessoas veem o aviso e são varridas, e quem caça as Lâminas sem ela não é afetado. Sem ninguém com a missão na área, a esteira fica parada.

### A Estrada Velha (implementada no M1)

Mapa de 160 × 100 m. Coordenadas em `data/maps.json`. O mapa fica mais perigoso de oeste para leste, e por isso o **Posto da Ponte**, onde todo personagem nasce, fica na ponta oeste, a 17 m do portão de Pedrâmbar e a 137 m da ponte de Vau de Nácar: quem tem nível 1 começa ao lado dos ratos de nível 1, longe dos bandos de nível 3 a 5.

```
 z=0 ┌──────────────────────────────────────────────────────────────┐
     │           Besouros-Brasa (52,14) ▓ Leito seco do rio         │
     │           (ninho, Encosta Morna) ▓ (bloqueado)               │
     │                                          Lagartos de Lastro  │
     │                     • Caio (54,38)       (104,36)            │
     │            • Bento (36,44)  ▓▓ Ruínas da                     │
z=50 │◄ ◎ Posto da Ponte (20,50)  ▓▓ Estação Norte    Vau de Nácar ►│
     │══════════════ Ratos de Sulco (44,50) ═══ estrada velha ══════│
     │           • Ligia (34,54)       ╲ trilha dos      ╲ trilha   │
     │             ╲ Capataz Rachado    ╲ Cães            ╲ do Brejo│
     │               (44,72) [elite]   Cães de Ferrugem  Javalis    │
     │                                 (92,84) [matilha] de Cinza   │
     │                                                   (142,84)   │
     │                                                 ◆ Brejo, nv 5│
z=100└──────────────────────────────────────────────────────────────┘
     x=0                                                        x=160
```

| Lugar | Coordenadas | O que tem |
|---|---|---|
| **Posto da Ponte** | (20, 50), zona segura de 12 m | Ponto de retorno; Teodoro, Mara e a Sentinela Ruy; Portão de Pedrâmbar em (3, 50) |
| **Campo do Sulco** | (44, 50), na estrada | Ratos de Sulco, nível 1, passivos (6) |
| **Encosta Morna** | (52, 14), junto ao leito seco | Besouros-Brasa, nível 2, passivos que mordem quem pisa no ninho (a 2,5 m) (5) |
| **Curva do Capataz** | (44, 72), no fim da trilha que sai do posto para o sul | Capataz Rachado, elite de nível 4, agressivo a 10 m |
| **Ruínas da Estação Norte** | (70–76, 40–56), bloqueadas | A estrada contorna as ruínas pelo sul (ou pelo norte) |
| **Leito Seco** | (104, 36) | Lagartos de Lastro, nível 4, passivos (4) |
| **Curva dos Cães** | (92, 84), no fim da trilha que sai da estrada em (84, 52) | Cães de Ferrugem, nível 3, agressivos a 8 m, em matilha (5) |
| **Campo de Cinza** | (142, 84), na trilha do Brejo | Javalis de Cinza, nível 5, agressivos a 8 m (4): guardam a Trilha do Brejo (portal de nível 5 em (150, 92)) |
| **Ponte de Vau de Nácar** | (157, 50) | Portal para Vau de Nácar |

- **Estrada segura** (D164, D172): nenhum bando agressivo — nem o ninho dos besouros, cujo território conta como agressão de perto — alcança a estrada entre o posto e a ponte de Vau de Nácar, com o desvio das ruínas — o centro do bando + o raio + o passeio (até 5 m) + a agressão fica a mais de 2 m do caminho. Quem é de Nácar atravessa no nível 2 para a missão 1.3 sem ser atacado (conferido em `server/test/estrada.test.js`, andando com a zona rodando, e pelo `npm run validate-data`, com as faixas `safeCorridor` do mapa).
- **Solo**: ratos perto do posto (passivos, nível 1), besouros na Encosta Morna (nível 2: passivos, mas mordem quem pisa no ninho — puxe um de cada vez), lagartos no leito seco (lentos, nível 4).
- **Grupo**: Curva dos Cães (agressivos, chamam os vizinhos), Capataz Rachado (elite de nível 4: dois jogadores de nível 1–2 vencem com tônicos; um jogador de nível 5 vence sozinho).
- **Tutorial**: Bento (36, 44), Ligia (34, 54) e Caio (54, 38, ao pé da Encosta Morna) esperam resgate perto do posto, todos longe do Capataz, dos bandos agressivos e do ninho dos besouros: quem vai buscá-los no nível 1 não é atacado por nada além dos dois bichos de Caio (ver `02-campanha.md`; `npm run validate-data` confere).
- **Retorno**: o Posto da Ponte é o ponto de retorno ao cair e a zona segura do mapa.

### A Cava Primeira (pós-v1, níveis 20–25)

Obras mais velhas que a Companhia e que as duas cidades: escadas talhadas, salões de placas de bronze, tubos de voz nas paredes e uma cisterna que o calor do fundo deixou morna. Entrada pelo **Poço de Inspeção** (90, 176) dos Canais da Eclusa, ao lado da porta da Última Eclusa — nível 20 exigido ("Nível 20 exigido para A Cava Primeira. Seu nível atual é 19."). Mapa de 220 × 160 m (o mesmo porte das Galerias do Eco), cenário gerado com semente fixa (`npm run gen-scenery -- --mapa cava_primeira`: 300 peças, 141 com colisão, 5 estradas).

```
 z=0 ┌──────────────────────────────────────────────────────────────────┐
     │ tubos de voz ·                                 ░                 │
     │   Salão das Placas         Vozes Soterradas    ░ Fenda           │
     │   Sineiros (64,34)         (124,32) [galeria]  ░ Funda    · selo │
     │                 ▓▓ Ruínas do                   ░         (204,60)│
     │                 ▓▓ Primeiro Posto              ░                 │
 z=80│◎ Posto de Escuta ══════ galeria principal ═════════════════ ◆ ▓▓▓│ Porta
     │ (22,80)       · máquina do posto (106,66)      ░  Selador     ▓▓▓│ Funda
     │      Salamandras (62,102)                      ░ · selo  · tubo  │
     │ ≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈        Toupeiras (118,130)     ░  Toupeiras      │
     │ ≈ Cisterna Funda ≈                             ░  (184,122)      │
z=160└──────────────────────────────────────────────────────────────────┘
     x=0                                                             x=220
```

| Lugar | Coordenadas | O que tem |
|---|---|---|
| **Posto de Escuta** | (22, 80), zona segura de 12 m | Ponto de retorno; Mara, Ilda e Joca; Poço de Inspeção de volta aos Canais em (4, 80) |
| **Margem da Cisterna** | (62, 102) | Salamandras de Cisterna, nível 21, **passivas** (8): caça solo sem susto; a Cisterna Funda (água, bloqueada) fica ao sul |
| **Salão das Placas** | (64, 34) | Sineiros de Bronze, nível 22, agressivos e em bando (7); três tubos de voz nas bordas do salão (capítulo 6.2) |
| **Ruínas do Primeiro Posto** | (100–112, 50–62) | Máquina do posto antigo em (106, 66) (capítulo 6.3) |
| **Galeria Norte** | (124, 32) | Vozes Soterradas, nível 23, agressivas (6) |
| **Fenda Funda** | x 150–158 | Leito seco bloqueado de ponta a ponta; só a galeria principal atravessa (z 64–94) |
| **Poço Quente** e sul das ruínas | (184, 122) e (118, 130) | Toupeiras de Basalto, nível 24, agressivas (6 + 5): ponto de grupo |
| **Porta Funda** | ruínas em x 212–220, z 70–90 | Selador da Porta Funda (elite 24, diária) em (202, 80); três selos e o tubo de resposta (capítulo 6.4 e 6.5) |

- **Solo**: Salamandras (passivas, mas mordem quem pisa na margem). As Vozes são agressivas e, como toda espécie
  agressiva, chamam as iguais paradas a até 8 m quando uma é atingida: puxe pela borda da galeria. Os Sineiros chamam
  o bando inteiro quando um é atingido.
- **Grupo**: Toupeiras no Poço Quente e o Selador (elite diária: XP em dobro e saque extra no primeiro abate do dia, como a Mãe do Eco e o Fragmento do Custódio). Os selos e o tubo de resposta ficam a ~15–20 m do Selador, fora do raio de agressão de 10 m.
- **Saque**: todos os monstros normais rolam a faixa 21 (4%), a 25 (0,4%) e Pó de Refino Superior (2%, os únicos monstros normais com ele); o Selador, a 21 (60%), a 25 (12%), Pó de Refino Superior ×2–4 e Selo de Proteção (10%) — material para o refino +4..+6 de quem já está no teto. Os Canais da Eclusa e o Fragmento do Custódio passaram a ter chance pequena de faixa 21 (0,4% e 10%), seguindo o padrão de "próxima faixa" das outras áreas.
- **Visual**: famílias de monstro já existentes (bestas, máquinas, espíritos) com cores próprias; céu e névoa ocre-avermelhados, chão de terra aquecida, pouca vegetação e brasas subindo no ar (`client/scripts/scenery.gd`).

![A Cava Primeira](img/23_cava.png)

### Arena da Prova (instância solo, nível 10)

Pátio de areia de 36 × 36 m cercado de muros, com braseiros nos cantos. Cada tentativa da prova de classe (missão 3.3) abre uma cópia só do jogador, montada pela regra da classe (`server/src/trial.js`; números em `data/maps.json`, `arena_prova.trial`). A habilidade do nível 10 fica emprestada no grau 1; as peças da arena não dão XP nem saque.

| Classe | Prova | O que há na arena |
|---|---|---|
| Quebraferro | Pilares Blindados (90 s) | 3 pilares de pedra com placas rebitadas, perto o bastante para dois caberem no cone da Ruptura; pedras caem do teto com aviso |
| Bastião | O Aprendiz no Centro (60 s) | o aprendiz Brás no meio; 6 construtos em duas levas; uma investida avisada |
| Lanceiro | Duas Filas de Bonecos (120 s) | dois fossos de lado a lado da arena (só o Avanço do Fosso cruza) e uma fila de 4 bonecos depois de cada um |
| Vigia | Alvos em Movimento (90 s) | o posto de tiro (faixa marcada perto da entrada; fora dele o tiro não vale e o painel avisa) e 4 filas de 8 alvos em trilhos no fundo |
| Escudeiro | A Travessia do Peregrino (150 s) | o peregrino Odilon, a rota pontilhada até o portão do fundo e três marcos de emboscada (construtos, atiradores e a Sentinela); ele espera parado enquanto a emboscada estiver de pé |
| Andarilha | Percurso do Vento (120 s) | 4 sinos numerados (o aceso acende) e até 3 perseguidores |
| Cantora | Vigília dos Aprendizes (70 s) | os aprendizes Lia, Duarte e Cora; fuligem contínua e jatos de vapor avisados |
| Tecelão | Três Ondas de Fagulhas (150 s) | a linha de contenção perto da entrada; ondas de 6, 7 e 8 fagulhas (as duas últimas com um construto) |

## Morte e resgate

- Ao cair, o personagem fica no chão. Opções: **voltar ao posto de guarda** do mapa (aparece com 50% de vida e mana) ou esperar **resgate por aliado**: qualquer jogador a até 3 m levanta um caído canalizando 5 s fora de combate, com 20% de vida (`revive_ally`; D154), e o Coro do Recomeço da Cantora (nível 20) levanta à distância. Sem resgate, o caído volta sozinho ao posto em 5 min (`death.corpseTimeoutMs`). Não há perda de XP; o custo é tempo e deslocamento.
- **Queda de conexão durante a morte**: o servidor grava o estado "caído" imediatamente. Ao reconectar, o personagem reaparece no posto de guarda com 50% de vida (implementado no M1 em `Zone.addPlayer` e coberto pelo teste `server/test/death.test.js`).

## Combate legível

- Câmera elevada com zoom (roda do mouse) e rotação (Q/E ou botão direito arrastando).
- Clique no chão para andar; clique no monstro para selecionar e atacar (o servidor aproxima até o alcance da arma e ataca no intervalo dela).
- Barra de atalhos: 1 a 6 para habilidades, 7 e 8 para tônicos (vida e mana). Habilidade com alvo fora do alcance: o cliente aproxima primeiro; o servidor revalida o alcance.
- Números de dano flutuantes (branco: seu dano; laranja: mágico; amarelo com "!": crítico; vermelho: dano recebido; "errou").
- Anel de seleção amarelo sob o alvo; quadro do alvo com nome, nível, tipo (elite/chefe), vida e a descrição do monstro numa linha (o texto inteiro na dica do mouse).
- Áreas de efeito desenhadas no chão durante toda a duração; perigos de chefe e golpes de área dos monstros sempre com aviso visual + sonoro antes do dano (círculo, cone ou linha vermelha que enche; o monstro recua e treme); explosão, puxão, drenagem de mana e eco com efeito próprio.
- Efeitos negativos no próprio personagem (Atordoado, Desorientado, Atolado, Sanguessuga, Selado) sob as barras de vida e mana, com o tempo que falta, e como marca sobre o personagem (visível também nos outros).
- Legibilidade com muitos monstros: nomes e vida só como rótulo curto; cores por família; o próprio personagem com contorno da cor da classe (Quebraferro laranja-brasa, Bastião bronze, Lanceiro azul-aço, Vigia verde, Escudeiro dourado, Andarilha turquesa, Cantora lavanda, Tecelão vermelho), que engrossa com a distância para continuar visível com a câmera afastada (`client/shaders/outline_self.gdshader`); os outros jogadores, NPCs e monstros seguem com o contorno escuro e fino.
- Objetos de missão com modelo próprio, parados no chão, de frente para a câmera inicial e com um losango pequeno flutuando em cima (dá para usar): marcos de rota, páginas do registro, caixas de fusíveis, cofre de ordens, medidores de pressão, pontos de medição térmica, válvulas (a principal, da defesa, maior), tubos de voz, a máquina do posto antigo, selos da Porta Funda, a carroça parada da escolta, o quadro de missões das cidades e as pessoas a resgatar no tutorial. O cliente escolhe o modelo pelo `kind` ou pelo prefixo do id (`client/scripts/art.gd`, `quest_object`); objeto que não casa com nenhum continua com o cubo de antes.
- Prova de classe: painel à esquerda, abaixo da vida e da mana, com objetivo, tempo, progresso e o aviso da vez (investida, jato de vapor, emboscada, fora do posto, a dica do cone da Ruptura); golpe que a peça recusa aparece como texto ("blindado", "apagado", "fora do posto"); aprendizes e peregrino com o nome e a vida em verde, clicáveis para curas e escudos.

## Interface (telas)

| Tela | Conteúdo | Estado |
|---|---|---|
| Login | servidor, conta, senha, criar conta | M1 |
| Seleção e criação de personagem | lista; nome + classe (com origem e papel) | M1 (2 classes), M2 (8) |
| Ficha (C) | atributos permanentes e com itens, pontos livres com "+", confirmar/desfazer, redistribuir; estatísticas derivadas; habilidades com graus; título mostrado acima do nome (entre os ganhos) | M1 |
| Barra de habilidades | 6 habilidades (teclas 1–6) + 2 tônicos (7–8), com custo, recarga e nível de desbloqueio | M1 (2 + 2), pós-v1 (6 + 2) |
| Inventário e equipamentos (I) | espaços equipados, bolsa 30, caixa de recuperação; descrição com dano/defesa, raridade, nível, classe, atributos, empunhadura e espaço, requisitos pendentes em vermelho e comparação com o equipado | M1 |
| Chat | canal local da zona | M1 |
| Aviso de desconexão | motivo + "Reconectar" (refaz login e volta ao mesmo personagem) | M1 |
| Diário de missões | missões ativas, objetivo, progresso; disponíveis (diárias marcadas); diárias feitas hoje e quando voltam | M2 |
| Quadro de missões | clique no quadro da praça: o que dá para aceitar no mundo inteiro, com nível, NPC e mapa | M3 |
| Painel de grupo | membros, vida, mana, distância | M2 |
| Ferreiro | custo, chance, prévia | M3 |
| Dica do tutorial | passo atual de «Três do Outro Lado» acima da barra de atalhos ("Passo 3 de 7"), com a dica da classe; antes de aceitar, diz para falar com Mara | Auditoria (D165) |
| Mapa (M) | o mapa de onde você está visto de cima: estradas, áreas bloqueadas, portais com o destino e o nível, NPCs com nome, posto de guarda, você e o grupo; exige o Mapa da Estrada Velha na bolsa (sem ele: "Você ainda não tem um mapa.") | Auditoria (D166) |
