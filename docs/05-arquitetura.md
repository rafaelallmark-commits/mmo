# 5. Estrutura técnica e marcos

## Visão geral

```
┌──────────────────────┐   WebSocket (JSON, 1 msg/quadro)   ┌───────────────────────────────┐
│ Cliente Godot 4      │ ─────── pedidos { t, rid, ... } ──► │ Servidor de zona (Node.js 22+) │
│ (client/)            │ ◄── respostas { t:"res", rid } ──── │ (server/)                      │
│ - interpolação e     │ ◄── eventos e snapshots 10 Hz ───── │ - laço de simulação 10 Hz      │
│   previsão           │                                     │ - navegação (A*, nav.js)       │
│ - interface          │                                     │ - regras puras (rules.js)      │
│ - nunca decide       │                                     │ - validação de equipamento     │
└──────────────────────┘                                     │ - persistência SQLite          │
                                                             └──────────────┬────────────────┘
                                                                            │ lê
                                                             ┌──────────────▼────────────────┐
                                                             │ data/*.json (dados editáveis) │
                                                             └───────────────────────────────┘
```

**Por que assim (escolha de protótipo, ver DECISOES.md):**

- **Godot 4** no cliente: aberto, leve, roda em macOS/Windows/Linux, exporta executável, tem WebSocket nativo e um modo headless que usamos para testar o cliente automaticamente.
- **Servidor autoritativo de zona em Node.js** (JavaScript, módulos ES): roda e testa sem instalação pesada (`node:test`, `node:sqlite` embutidos; uma dependência, `ws`), ciclo rápido de iteração, JSON nativo — o mesmo formato dos arquivos de dados e do protocolo. Um processo = uma zona.
- **SQLite** (arquivo único, transações ACID) em vez de JSON solto: saque idempotente e trocas de equipamento precisam de atomicidade.

## O que o servidor controla

Movimento válido (destino dentro do mapa e fora de áreas bloqueadas e de peças de cenário com colisão; caminho por A*, velocidade, aceleração e frenagem aplicadas pelo servidor; o cliente nunca envia posição), alcance (ataques e habilidades revalidados com tolerância de 0,75 m), dano (todas as rolagens no servidor), recargas, mana, inventário, ouro, XP, saque, equipamento, pontos de atributo e habilidade, morte e retorno. Missões (M2) seguem o mesmo princípio: o servidor conta abates, interações e entregas.

## Estrutura de arquivos

```
mmo/
├── README.md                      como rodar servidor, dois clientes, testes e cenários
├── .github/workflows/
│   ├── ci.yml                     a cada push/PR: dados + testes, importação do cliente, build da imagem
│   └── release.yml                a cada tag v*: exporta e assina o cliente, publica a release e a imagem
├── deploy/                        implantação do teste público (docs/08 §8.8)
│   ├── Dockerfile                 imagem do servidor (node:22-bookworm-slim, usuário sem privilégios)
│   ├── docker-compose.yml         servidor + proxy TLS (Caddy); "contas" e "banco" reservados
│   ├── Caddyfile                  wss://domínio -> servidor:7777 (métricas não passam)
│   ├── cinzas.service             systemd sem Docker (endurecido)
│   └── backup.service/.timer      backup a quente de hora em hora
├── .dockerignore                  contexto da imagem: só server/ e data/
├── data/                          dados do jogo (fonte de verdade, editáveis)
│   ├── classes.json               atributos, classes, origens, kits iniciais
│   ├── skills.json                40 habilidades + regras de graus
│   ├── items.json                 190 definições de item (raridades, espaços, famílias)
│   ├── monsters.json              28 monstros (5 áreas + chefe)
│   ├── loot_tables.json           tabelas de saque (normal, elite, chefe, por classe)
│   ├── maps.json                  mapas (+ estradas, peças com colisão e casas geradas por gen-scenery)
│   ├── xp_table.json              XP acumulada 1–20 e metas de tempo
│   ├── formulas.json              constantes de dano, defesa, precisão, crítico, XP
│   └── example_builds.json        builds usadas nos exemplos e validadas
├── server/
│   ├── package.json               scripts: start, dev, test, validate-data, gen-docs, create-character
│   ├── src/
│   │   ├── main.js                entrada (argumentos --port --db --dev ...)
│   │   ├── server.js              WebSocket, sessões, autenticação, roteamento, idempotência por rid
│   │   ├── zone.js                simulação da zona: jogadores, monstros (IA), combate, XP, saque
│   │   ├── nav.js                 grade de ocupação, A* + suavização, seguidor com aceleração/frenagem
│   │   ├── skills.js              execução das 40 habilidades (formas e efeitos)
│   │   ├── quests.js              motor de missões (falar, matar, coletar, interagir, entrar no mapa...)
│   │   ├── smith.js               ferreiro: custo, chance, prévia e rolagem do refino
│   │   ├── dungeon.js             A Última Eclusa: o Custódio em três fases, avisos, comportas
│   │   ├── rules.js               regras puras: atributos, estatísticas, dano, acerto, crítico, XP
│   │   ├── equipment.js           validação de nível/classe/atributos/espaço/empunhadura
│   │   ├── store.js               SQLite: contas, personagens, instâncias de item, saques, missões
│   │   ├── data.js                carrega /data
│   │   └── rng.js                 RNG determinístico (testes reproduzíveis)
│   ├── test/
│   │   ├── acceptance.test.js     Marco 1 de ponta a ponta com 2 clientes simulados
│   │   ├── rules.test.js          fórmulas com rolagens fixas
│   │   ├── equipment.test.js      todas as recusas e trocas de equipamento
│   │   ├── data.test.js           coerência dos dados e alcançabilidade dos requisitos
│   │   ├── death.test.js          queda de conexão durante a morte
│   │   ├── nav.test.js            caminhos, desvios, destinos inalcançáveis, aceleração e mapas reais
│   │   ├── skills.test.js         as 40 habilidades numa zona real
│   │   ├── m2.test.js             aceitação do Marco 2 (grupo de 5, prova de classe, missões)
│   │   ├── m3.test.js             aceitação do Marco 3 (refino, depósito, elite diária, Custódio com bots)
│   │   └── helpers/client.js      cliente simulado (mesmo protocolo do Godot)
│   └── tools/
│       ├── validate-data.js       validador (também usado nos testes)
│       ├── gen-docs.js            gera docs/03 e docs/04 a partir dos dados
│       ├── gen-scenery.js         gera estradas, peças e casas de cada mapa (semente fixa)
│       ├── partner.mjs            parceiro simulado para ver o calabouço no cliente
│       └── create-character.js    cria contas/personagens de teste no banco
├── tools/poses/                   modelo do braço e gerador da tabela WPOSES (poses guiadas pela arma)
├── client/                        projeto Godot 4.3
│   ├── project.godot              autoload Net; cena principal
│   ├── export_presets.cfg         presets "Linux", "Windows Desktop" e "macOS" (saída em build/)
│   ├── scenes/main.tscn
│   ├── shaders/                   cel shading, contorno, terreno, grama, folhagem, água, céu, "vazado"
│   └── scripts/
│       ├── net.gd                 WebSocketPeer, pedidos com rid e callbacks
│       ├── main.gd                fluxo login → personagens → mundo; estado recebido
│       ├── world.gd               mundo 3D, câmera suave, entidades interpoladas/previstas, clique
│       ├── motion.gd              relógio da zona, interpolação de Hermite, previsão do próprio personagem
│       ├── scenery.gd             cenário: terreno, grama, peças (MultiMesh), estruturas, céu, partículas
│       ├── terrain.gd             relevo visual, estradas, lagoas/leito escavados, cordilheira
│       ├── vrm_character.gd       personagens VRM: materiais, animação no esqueleto, expressões
│       ├── art.gd / gear.gd / rig.gd  monstros e NPCs procedurais, equipamento, animação dos monstros
│       ├── vfx.gd                 efeitos de combate: cortes, projéteis, áreas, curas, escudos, avisos
│       ├── hud.gd                 interface em jogo (barras, atalhos, inventário, ficha, chat, avisos)
│       ├── item_text.gd           descrição de itens com requisitos em vermelho e comparação
│       ├── ui_theme.gd            paleta
│       └── autotest.gd            modos --autotest (headless), --navshots e --sceneshots (capturas)
└── docs/                          este conjunto de documentos
```

## Modelo de dados (definição × instância)

| Entidade | Onde | Campos principais |
|---|---|---|
| Classe | `data/classes.json` | atributos iniciais, famílias de arma, mão secundária, peso de armadura, vida/mana, habilidades, kit |
| Habilidade | `data/skills.json` | classe, nível de desbloqueio, alvo, mana(+/grau), recarga, alcance, efeito parametrizado |
| Definição de item | `data/items.json` | id, família, espaço, empunhadura, nível, raridade, classes, requisitos, dano/defesa/etc. |
| **Instância de item** | SQLite `item_instances` | **UUID único**, personagem, `def_id`, quantidade, refino, localização (`bag`/`equip`/`recovery`/`storage`), espaço, origem (`kit`, `loot:<id>`, `gm`) |
| Monstro | `data/monsters.json` | nível, família, tipo, vida, dano, defesa, agressão, coleira, reaparecimento, XP, tabela de saque |
| Mapa | `data/maps.json` | tamanho, posto de guarda, áreas bloqueadas, pontos de surgimento |
| Personagem | SQLite `characters` | conta, nome, classe, nível, XP, pontos distribuídos (JSON), pontos livres, graus de habilidade (JSON), vida, mana, ouro, mapa, posição, caído |
| Saque | SQLite `loot_drops` | UUID, dono, definição ou ouro, posição, abate de origem, validade, **reivindicado em / instância criada** |
| Missão | SQLite `quest_progress` (tabela criada no M1, usada no M2) | personagem, missão, estado, progresso (JSON) |
| Grupo (M2) | memória do servidor de zona | líder, membros (até 5), regra de saque individual, raio de XP |

Um índice único `(char_id, slot) WHERE loc='equip'` garante no banco que dois itens nunca ocupem o mesmo espaço.

## Protocolo (v1)

Todo pedido do cliente leva `rid` (texto único por pedido). A resposta é `{ t:"res", rid, req, ok, ... }`; em recusa, `code` (máquina) e `reason` (texto em português, com valor atual e exigido). Respostas com mudança de estado trazem `char` (ficha completa) para o cliente substituir o que tem.

| Pedido | Campos | Resposta / efeito |
|---|---|---|
| `register` | account, password | cria conta (senha com scrypt + sal) |
| `login` | account, password | envia `defs` (dados do jogo), devolve personagens e classes criáveis; derruba sessão antiga da mesma conta |
| `list_chars`, `create_char` | name, classId | personagem com kit inicial (M1: Quebraferro e Tecelão) |
| `enter` | charId | ficha, snapshot, saques não reivindicados do personagem |
| `move` | x, z | calcula o caminho (A*); devolve `dest` (ponto livre mais próximo) e `path` ([[x,z],…]) para o cliente prever o movimento; recusa destino bloqueado ou inalcançável |
| `attack` | target | define alvo; servidor aproxima e ataca |
| `stop` | — | para |
| `cast` | skill, target ou x/z | valida grau, recarga, mana, alcance; aplica efeito |
| `use_item` | instance | consumível (recarga compartilhada de tônicos 3 s) |
| `pickup` | loot | **idempotente** (ver abaixo) |
| `equip` | instance | valida e equipa; devolve `slot`, `displaced` |
| `unequip` | slot | guarda na bolsa |
| `allocate` | points {str,spi,tal,agi,vit} | distribui pontos livres |
| `reset_attrs` | — | redistribuição (grátis no M1); equipamento inválido vai para a bolsa ou caixa de recuperação |
| `claim_recovery` | instance | caixa de recuperação → bolsa |
| `learn_skill` | skill | grau extra (teto por nível) |
| `respawn` | — | volta ao posto de guarda |
| `chat` | text | canal da zona |
| `char` | — | ficha atual |
| `talk`, `interact`, `buy`, `quests`, `quest_accept`, `quest_turnin` | npc / object / item | NPCs, objetos de missão, loja e diário |
| `trial_start` | npc | prova de classe (instância solo) |
| `party_invite`, `party_accept`, `party_decline`, `party_leave`, `party_kick` | name / from | grupos de até 5 |
| `enhance_quote`, `enhance` | npc (ferreiro), instance | custo, chance e prévia; refino com RNG semeado (falha mantém o grau e gasta ouro e materiais) |
| `storage_list`, `storage_put`, `storage_take` | npc (guarda-volumes), instance | depósito compartilhado pela conta |
| `interact` na Porta da Última Eclusa (ou `dungeon_enter`) | object | abre/entra na instância do grupo (2–5, Chave de Comporta, nível 16) |
| `gm` | cmd (give, teleport, xp, gold, quest_done) | só com servidor `--dev` |

Eventos do servidor: `hello`, `defs`, `snap` (10 Hz: `now` = relógio da zona em ms; por entidade id, tipo, posição, velocidade `vx`/`vz`, vida, alvo), `hit` (origem, destino, dano, crítico, errou, habilidade), `death`, `spawn`, `loot` (só para o dono), `xp`, `level_up`, `char`, `buff`, `ground`, `cast`, `player_dead`, `respawn`, `joined`, `left`, `chat`, `kicked`, `cast` (habilidade usada, para os efeitos), `shield`, `quest_update`, `party`, `trial`, `boss` (fase, vida, proteção, válvula, comportas) e `warn` (aviso de perigo: círculo ou linha, duração).

## Movimento no cliente

O servidor decide; o cliente só desenha bem (`client/scripts/motion.gd`, docs/07 §7.6):

- **Relógio da zona**: cada snapshot traz `now`. O cliente mede a escala de tempo do servidor (`--time-scale`) e desenha o mundo 150 ms no passado, sempre entre dois snapshots.
- **Interpolação de Hermite** com as velocidades do snapshot: curvas e frenagens saem redondas; teleporte (mais de 8 m entre amostras) não desliza pelo mapa.
- **Previsão do próprio personagem**: a resposta do `move` traz o caminho; o personagem sai andando na hora com a mesma aceleração/frenagem do servidor (`stats.moveSpeed`, `accel`, `decel` na ficha). Se o servidor divergir (bloqueio, ataque, morte), a previsão para e o erro some em ~0,1 s, sem salto.
- O movimento usa o relógio real do sistema, não o `delta` do quadro (ver DECISOES D49).

## Saque individual e idempotência

1. Na morte do monstro, numa **única transação**: XP de cada participante elegível é gravado e cada um rola a tabela de saque separadamente; cada peça vira uma linha em `loot_drops` com UUID e dono. O evento `loot` vai só para o dono.
2. `pickup` roda em transação: se o saque já foi reivindicado **por esse dono**, responde `ok` com `alreadyClaimed: true` e **o mesmo `instanceId`** — não cria nada. Se não, valida dono, validade (30 min), distância (6 m) e espaço na bolsa, cria a instância (UUID novo) ou soma ao monte (tônicos, materiais), marca o saque como reivindicado com o id da instância e só então confirma.
3. Além disso, o servidor guarda as últimas 128 respostas por personagem indexadas por `rid`: o mesmo pedido repetido (reenvio após queda de conexão) recebe a mesma resposta com `duplicate: true`, sem reexecutar.
4. Saques não reivindicados sobrevivem a reconexões e reinícios (estão no banco) e são reenviados no `enter`.

O teste de aceitação envia o mesmo pedido de coleta 4 vezes (2 simultâneos, 2 com o mesmo `rid`), reconecta e pede de novo: sempre 1 instância.

## Reconexão

- Queda detectada pelo servidor (socket fechado): personagem salvo e removido da zona; monstros esquecem a ameaça dele.
- Queda não detectada (socket "pendurado"): ao fazer login de novo, a sessão antiga da conta é derrubada (`kicked`) e salva antes de a nova carregar o personagem — nunca há duas cópias do personagem em memória.
- O cliente mostra "Conexão perdida" com o botão **Reconectar**, que refaz o login e volta ao mesmo personagem.
- Estado gravado imediatamente a cada mudança importante (XP, nível, pontos, inventário, equipamento, ouro, morte); posição e vida a cada 10 s e ao sair.
- Caiu morto? O estado "caído" é gravado na hora; ao voltar, reaparece no posto de guarda com 50% de vida.

## Operações simultâneas no inventário

- Cada personagem pertence a exatamente **um** servidor de zona, que processa as mensagens em um único laço: duas operações do mesmo personagem nunca rodam intercaladas.
- Cada operação que mexe em inventário roda numa transação SQLite (`BEGIN IMMEDIATE`) e só altera a memória depois de validar; trocas (equipar uma arma de duas mãos que desloca a mão secundária) gravam todas as instâncias alteradas juntas.
- Pedidos repetidos são neutralizados pelo cache de `rid` e pela idempotência do saque.
- Futuro (comércio, depósito compartilhado entre personagens da mesma conta): operações que envolvem dois donos usarão uma transação única no banco central com verificação de versão por instância (`version` incrementada a cada movimento), para que dois servidores não movam a mesma peça.

## Testes automatizados

- `npm test` roda unitários (regras, equipamento, dados) e o **teste de aceitação do Marco 1** (servidor real em porta aleatória + banco temporário + dois clientes WebSocket simulados). O teste acelera o relógio do jogo (4×) e, só na fase de "caçar até o nível 5", liga uma taxa de XP de evento (15×) pelo próprio objeto do servidor, para caber em ~25 s; regras e fórmulas são as mesmas.
- O cliente Godot tem o modo `--autotest`, usado em headless para importar o projeto, conectar, criar personagem, entrar, andar, atacar e coletar.

---

## Marcos e critérios de aceitação

### Marco 1 — Núcleo jogável (concluído nesta entrega)

Escopo: um servidor de zona local, um mapa (Estrada Velha), Quebraferro e Tecelão da Brasa, equipamento de nível 1 e um item de nível 5 encontrado antes de poder ser usado, persistência simples.

Critérios (todos cobertos por `server/test/acceptance.test.js`, exceto onde indicado):

1. Dois clientes entram no mesmo mapa e cada um vê o outro no snapshot; o movimento de um aparece no snapshot do outro; destino bloqueado é recusado.
2. Os dois lutam contra monstros, ganham XP (dividido por participação) e recebem saque individual: cada um vê só o seu; tentar coletar o saque do outro → "Este saque não pertence a você."
3. Cada peça de saque tem UUID único; coleta repetida (simultânea, mesmo `rid`, após reconexão) entrega uma única vez.
4. Tentar equipar a arma de nível 5 cedo → "Nível 5 exigido. Seu nível atual é 2."
5. Ao chegar ao nível 5 sem distribuir pontos → "Força 22 exigida. Sua Força atual é 17." e "Talento 14 exigido. Seu Talento atual é 11."; distribuir além do disponível é recusado; após distribuir, equipa.
6. O servidor valida classe ("Classe exigida: Cantora do Véu ou Tecelão da Brasa. Sua classe é Quebraferro."), espaço ("Este item não pode ser equipado."), empunhadura (arma de duas mãos libera a mão secundária; foco recusado enquanto ela estiver equipada) e atributos permanentes (bônus de anel não libera requisito — teste unitário).
7. Redistribuir atributos devolve à bolsa o equipamento que deixou de atender (ou à caixa de recuperação se a bolsa estiver cheia — teste unitário).
8. Desconectar e reconectar mantém o equipamento; reiniciar o servidor com o mesmo banco também.
9. Cliente Godot importa sem erros e completa o `--autotest` contra o servidor (verificado manualmente nesta entrega com Godot 4.3 headless; ver README).

### Marco 2 — Oito classes e grupos (concluído)

- As 8 classes criáveis, com habilidades de nível 1, 5 e 10 implementadas (efeitos `cone_strike`, `line_strike`, `pull`, `party_buff`, `heal`, `shield_ally`, `aoe_spell`, `debuff`, `charge`, `dash`, `guard_ally`).
- Mestres de classe nas duas cidades; prova de classe do nível 10 em instância solo, com recompensa concedida uma vez mesmo com queda.
- Cinco atributos com efeito completo (Vitalidade em resistência a controle).
- Grupos de até 5: convite, saída, líder, painel; XP por participação incluindo cura, proteção e controle; saque individual.
- Chat por canais (zona, grupo, sussurro).
- Mapas: Estrada Velha, Brejo das Bombas, Oficina Soterrada, as duas cidades. Missões dos capítulos 1–3 com diário.
- Equipamento até o nível 10 com armas de cada família (faixas 1, 5, 9).
- **Aceitação**: teste automatizado com 5 clientes simulados (um de cada papel) formando grupo e caçando no Poço das Sanguessugas: o Bastião mantém a ameaça de ≥ 3 monstros; a Cantora reduz o consumo de tônicos do grupo em ≥ 40% contra o mesmo grupo sem ela; cada membro recebe XP > 0 mesmo sem causar dano; cada classe equipa uma arma de faixa 9 da sua família apenas após cumprir os requisitos; a prova de classe concede a habilidade uma única vez com reconexão no meio.

### Marco 3 — Níveis 11–20, campanha e calabouço (concluído)

- Níveis 11–20, habilidades de nível 15 e 20, faixas 13, 17 e recompensas de 20.
- Galerias do Eco e Canais da Eclusa; capítulos 4 e 5; missões secundárias.
- Ferreiro +1 a +3 com custo, chance e prévia.
- Pontos de caça em grupo com elites diárias.
- Calabouço da Última Eclusa: instância por grupo, Custódio com as três fases e avisos (animação, som, marcação), vida escalada pelo tamanho do grupo; reconexão dentro da instância.
- Depósito por conta.
- **Aceitação**: teste com 3 composições diferentes de grupo simulado (com tanque e curadora; sem tanque; 2 jogadores) vencendo o Custódio com bots que reagem aos avisos; recompensa única de nível 20 entregue uma vez por participante; refino com chance controlada por RNG semeado confere taxas em 10.000 tentativas; na falha, grau mantido e materiais consumidos.

### Marco 4 — Testes de carga, ajuste e documentação (em andamento)

Feito até aqui: métricas do servidor e HTTP de métricas, snapshots por diferença e interesse, teste de carga com 100 clientes ([relatorio-carga.md](relatorio-carga.md): nenhum tick acima de 50 ms; ~9 KB/s por cliente), atraso artificial e indicador de ping, telemetria de nível, migrações versionadas, backup a quente, cenários críticos reproduzíveis ([relatorio-cenarios.md](relatorio-cenarios.md)) e o guia de operação ([08-operacao.md](08-operacao.md)), com CI, exportação do cliente e implantação do teste público (§8.8).


- Testes com múltiplos clientes (meta: 100 clientes simulados numa zona, 10 Hz) medindo tempo de tick, latência de ida e volta (ping) e uso de banda por cliente.
- Medição de latência no cliente (indicador na interface) e tolerância a 150 ms.
- Revisão da progressão com telemetria de tempo por nível contra as metas da tabela de XP; ajuste de economia (ouro de entrada/saída, preço de tônicos e refino).
- Documentação de execução, operação e cenários críticos atualizada.
- **Aceitação**: relatório com p50/p95/p99 de tick e de latência; nenhum tick > 50 ms com 100 clientes; tempo médio por nível dentro de ±25% da meta; script de cenários críticos reproduzível.

---

## O que muda para um teste público

| Área | Protótipo (M1) | Teste público |
|---|---|---|
| Transporte | `ws://` sem criptografia | `wss://` (TLS) atrás de proxy reverso; limite de tamanho e de taxa por conexão |
| Autenticação | conta + senha no servidor de zona | serviço de contas separado (e-mail verificado, recuperação de senha), token de sessão de curta duração apresentado ao servidor de zona |
| Persistência | SQLite local por processo | PostgreSQL central com backups e migrações versionadas; SQLite só em desenvolvimento |
| Anti-trapaça | servidor já autoritativo | + limite de comandos por segundo, detecção de velocidade/posição anômalas nos registros, auditoria de saque e ouro |
| Comandos de mestre | `--dev` liga para todos | papéis de conta; registro de cada comando |
| Operação | um processo no terminal | serviço gerenciado (reinício automático, logs estruturados, métricas, alertas), desligamento gracioso com aviso aos jogadores |
| Cliente | rodado pelo editor | executáveis exportados e assinados (macOS notarizado), verificação de versão do protocolo no `hello` |
| Dados | lidos do disco no início | versionados; mudanças de balanceamento publicadas com o servidor; validador roda no CI |
| Privacidade | — | política de privacidade, exclusão de conta, retenção de logs |

Já preparado ([08-operacao.md §8.8](08-operacao.md)): `wss://` atrás de um proxy Caddy com certificado automático,
serviço gerenciado (Docker com verificação de saúde e reinício, ou systemd endurecido) com desligamento gracioso,
backup de hora em hora, CI com o validador de dados e os testes, e executáveis exportados para Linux, Windows e macOS,
assinados e notarizados quando houver certificados. Continua pendente: serviço de contas e PostgreSQL (com lugar
reservado no compose), limites de taxa por conexão, papéis de mestre e privacidade.

## O que muda para múltiplas zonas

- **Um processo por zona** (mapa), cada um dono dos personagens que estão nele. Um **serviço de mundo** (diretório) sabe qual zona hospeda cada personagem e encaminha o cliente.
- **Troca de zona** = transferência de posse: a zona de origem grava o personagem e libera a posse no banco central (`characters.zone_owner`, com versão); a zona de destino só carrega depois de adquirir a posse. O cliente recebe o endereço da nova zona e um token de transferência de uso único.
- **Instâncias** (calabouço, provas de classe) são zonas efêmeras criadas sob demanda pelo serviço de mundo para um grupo.
- **Grupos e chat** entre zonas passam por um serviço de mensagens (ex.: Redis pub/sub ou NATS); a regra de XP por proximidade continua local à zona.
- **Saque e inventário** continuam com transações no banco central; com posse única por personagem, não há escrita concorrente de duas zonas no mesmo inventário.
- **Interesse por área**: snapshots passam a ser filtrados por raio (hoje a zona inteira é enviada, o que basta para um mapa de 160 × 100 m).
