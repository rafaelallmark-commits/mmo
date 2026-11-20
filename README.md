# CINZAS DO MERIDIANO

MMORPG 3D de ação PvE para PC, com câmera elevada, movimento por clique, caça em grupo em mapas compartilhados e equipamento que exige nível, classe e atributos. Cliente em **Godot 4**, servidor autoritativo de zona em **Node.js**, dados do jogo em **JSON editável**.

> Estado atual: **Marcos 1 a 4 concluídos e o pós-v1 pronto para o teste público.** As 8 classes com seis habilidades cada (níveis 1, 5, 10, 15, 20 e 25, com recarga global de 1 s e tempo de conjuração), grupos de até 5, chat por canais, campanha dos capítulos 0 a 6 com missões secundárias em todas as faixas (coleta, diárias, a esteira da Oficina) e o quadro de missões nas praças, oito mapas abertos (Estrada Velha, Brejo das Bombas, Oficina Soterrada, Galerias do Eco, Canais da Eclusa, **A Cava Primeira** e as duas cidades), prova de classe, armeiro, ferreiro (+1 a +6, com Selo de Proteção), depósito da conta, elites diárias e o calabouço **A Última Eclusa** (Custódio em três fases para grupos de 2 a 5). Entre jogadores: **troca** com travas e confirmação dupla, **clãs** e **duelos** sem morte. Para o teste público: serviço de contas com e-mail, termos e privacidade (exportação e exclusão de dados), moderação (silêncio, suspensão, denúncias, `/bug`), implantação com Docker e Caddy ou systemd, métricas e alertas, **PostgreSQL** central e, opcional, **várias zonas** coordenadas por um serviço de mundo. Marco 4: 100 clientes numa zona sem nenhum tick acima de 50 ms ([relatório de carga](docs/relatorio-carga.md)) e a progressão simulada do 1 ao 25 dentro de ±25% da meta em todos os níveis ([relatório de progressão](docs/relatorio-progressao.md)). Cliente em **3D estilizado com traço de anime** (personagens VRM, cenário com relevo, efeitos das habilidades, avisos do chefe, som e música originais), com **movimento fluido** (caminhos por A*, previsão do próprio personagem e interpolação dos outros).

| | |
|---|---|
| ![Classes de Âmbar](docs/img/11_classes_ambar.png) | ![Classes de Nacre](docs/img/12_classes_nacre.png) |
| ![Personagens](docs/img/05_personagens.png) | ![Rosto](docs/img/13_rosto.png) |
| ![Título](docs/img/01_titulo.png) | ![Mundo](docs/img/08_mundo_perto.png) |
| ![Posto da Ponte](docs/img/14_estrada_posto.png) | ![Correndo](docs/img/15_corrida.png) |
| ![Pedrâmbar](docs/img/16_pedrambar.png) | ![Brejo das Bombas](docs/img/17_brejo.png) |
| ![Galerias do Eco](docs/img/19_galerias.png) | ![O Custódio da Eclusa](docs/img/20_custodio.png) |
| ![Canais da Eclusa](docs/img/22_canais.png) | ![A Cava Primeira](docs/img/23_cava.png) |

Personagens: modelos VRM de anime — **Seed-san model by VirtualCast, Inc.** e amostra VRM © 2022 pixiv Inc., ambos sob a VRM Public License 1.0 (detalhes em [docs/CREDITOS.md](docs/CREDITOS.md)).

*Capturas reais do cliente (Godot 4.3, renderização por software em Linux), geradas pelos modos `--navshots` e `--sceneshots`. Fluxo de telas em [docs/07-navegacao.md](docs/07-navegacao.md).*

## Documentação

| Documento | Conteúdo |
|---|---|
| [docs/01-visao.md](docs/01-visao.md) | Visão do jogo e o laço caçar → subir de nível → equipar |
| [docs/02-campanha.md](docs/02-campanha.md) | Abertura roteirizada, tutorial, os 6 capítulos com todas as missões principais (o 6º, pós-v1, nos níveis 20–25), encontro com o Custódio, missões secundárias e pontos de caça |
| [docs/03-classes.md](docs/03-classes.md) | Fichas das 8 classes: papel, armas, atributos iniciais, kit, cada habilidade com custo, recarga, alcance, efeito e graus *(gerado dos dados)* |
| [docs/04-progressao-e-formulas.md](docs/04-progressao-e-formulas.md) | Tabela de XP 1–25, XP por monstro, exemplos solo e em grupo, equipamento por faixa (todas as famílias de arma em todas as faixas), verificação de requisitos, dois exemplos de evolução passo a passo, fórmulas com exemplos calculados *(gerado dos dados)* |
| [docs/05-arquitetura.md](docs/05-arquitetura.md) | Estrutura técnica, arquivos, protocolo, saque idempotente, reconexão, concorrência, critérios de aceitação dos 4 marcos, o que muda para teste público e múltiplas zonas |
| [docs/06-mundo-e-mapas.md](docs/06-mundo-e-mapas.md) | Cidades, as áreas de caça (cinco da versão 1 e A Cava Primeira), regras de monstros, morte e resgate, combate legível, telas da interface |
| [docs/07-navegacao.md](docs/07-navegacao.md) | Telas, camadas dentro do jogo, mapa do mundo, controles, direção gráfica e som |
| [docs/08-operacao.md](docs/08-operacao.md) | Execução e operação: opções do servidor, métricas, banco e backup, testes e medições; implantação do teste público (CI, releases assinadas, Docker/Compose, systemd, TLS); várias zonas |
| [docs/relatorio-progressao.md](docs/relatorio-progressao.md) | Marco 4: tempo medido por nível (1→25) de cada classe caçando solo, contra as metas da tabela de XP; economia de tônicos e equipamento, mortes e problemas encontrados *(gerado pela simulação)* |
| [docs/GUIA.md](docs/GUIA.md) | Guia do jogador do teste público: entrar, classes, controles, progressão, equipamento, mapas, grupo, troca, clã, duelo e convivência |
| [docs/TERMOS.md](docs/TERMOS.md) · [docs/PRIVACIDADE.md](docs/PRIVACIDADE.md) | Termos de uso (regras de convivência e jogo limpo) e política de privacidade do teste público (rascunhos) |
| [docs/DECISOES.md](docs/DECISOES.md) | Todas as decisões tomadas por conta própria e o motivo |
| [docs/CREDITOS.md](docs/CREDITOS.md) | Créditos e licenças dos modelos de personagem; som e música originais (síntese por `tools/audio/gerar_sons.py`) |

## Requisitos

- **Espaço livre**: cerca de 1 GB (Node.js ~200 MB, Godot ~150 MB, projeto e dependências < 20 MB).
- **Node.js 22.13 ou mais novo** (recomendado: a versão LTS atual em <https://nodejs.org>, instalador `.pkg` para macOS; ou `brew install node`). Confira com:

```bash
node --version
```

- **Godot 4.3 ou mais novo** (versão padrão, não a .NET), em <https://godotengine.org/download>. No macOS, arraste `Godot.app` para `Aplicativos`.

## 1. Rodar o servidor

```bash
git clone https://github.com/rafaelallmark-commits/mmo.git
```

```bash
cd mmo/server
```

```bash
npm install
```

```bash
npm start
```

O servidor ouve em `ws://0.0.0.0:7777` e grava em `server/cinzas.db`. Para parar: `Ctrl+C` (salva todos os personagens conectados).

O SQLite (`cinzas.db`) é o banco de desenvolvimento. Em produção o banco é um **PostgreSQL central**, com backups (`pg_dump`) e as mesmas migrações versionadas: `CINZAS_DB='postgres://usuario:senha@host:5432/cinzas' npm start` (detalhes em [docs/08-operacao.md §8.11](docs/08-operacao.md#811-postgresql)).

Variações:

```bash
npm run dev
```

liga os comandos de mestre (`--dev`). Argumentos diretos (depois de `--`):

```bash
npm start -- --port 7777 --db outro.db --xp-rate 1 --time-scale 1
```

### Várias zonas (opcional)

Os mapas também podem ser divididos entre vários processos de zona, coordenados por um **serviço de mundo**: cada personagem tem um único dono, quem cruza um portal para um mapa de outra zona é transferido com um token de uso único (o cliente reconecta sozinho), e grupo, clã, sussurro e moderação funcionam entre zonas. Para experimentar na mesma máquina (mundo + 2 zonas no mesmo banco):

```bash
npm run multizona -- --zonas 2 --dev
```

O cliente entra por `ws://127.0.0.1:7777` (Estrada Velha e cidades) e passa para a segunda zona no portal do Brejo. Opções, falhas e implantação em [docs/08-operacao.md §8.10](docs/08-operacao.md#810-múltiplas-zonas); desenho em [docs/05-arquitetura.md](docs/05-arquitetura.md#múltiplas-zonas).

## 2. Rodar dois clientes Godot na mesma máquina

Com o servidor rodando, de dentro da pasta `mmo` (raiz do repositório), abra **dois terminais** e rode em cada um:

```bash
/Applications/Godot.app/Contents/MacOS/Godot --path client
```

(No Linux/Windows, troque pelo caminho do executável do Godot.) Na primeira vez o Godot importa o projeto e cria `client/.godot/`: leva cerca de meio minuto, porque extrai as texturas dos modelos de personagem (≈ 60 MB a mais em disco).

Para já abrir com a conta preenchida:

```bash
/Applications/Godot.app/Contents/MacOS/Godot --path client -- --account=teste1 --password=teste123
```

**Alternativa pelo editor**: abra o Godot, *Importar* → selecione `client/project.godot`. Em *Depurar → Personalizar instâncias de execução…* (*Debug → Customize Run Instances…*), marque *Ativar múltiplas instâncias* e defina **2**. Aperte F5: duas janelas do jogo abrem.

Em cada janela: **Jogar** → servidor `ws://127.0.0.1:7777`, **Criar conta** (ou **Entrar**) → **Criar novo personagem** (escolha a classe; a prévia 3D muda) → **Jogar**. **Esc** fecha painéis ou abre o menu (Opções, Trocar de personagem, Sair para o título).

Controles: clique no chão anda; clique no monstro ataca; clique no NPC conversa (missões, loja, armeiro com as peças da sua faixa, ferreiro, prova de classe); clique no anel de um portal muda de mapa; clique no saque coleta; **1–6** habilidades (com recarga e recarga global na barra; a 6ª é a do nível 25), **7/8** tônicos (o melhor que você pode usar); **J** missões; chat com `/g` (grupo), `/s Nome` (sussurro), `/convidar Nome`, `/sair`; **I** inventário (clique no item equipa/usa; botão direito vende — com loja, ferreiro ou armeiro aberto — ou descarta; passe o mouse para ver a descrição e a comparação); **C** ficha (pontos e habilidades); **Q/E** ou botão direito arrastando giram a câmera; roda do mouse aproxima; **Enter** conversa; **Esc** fecha painéis.

Para jogar em rede local, rode o servidor em uma máquina e use `ws://IP-DA-MÁQUINA:7777` no campo Servidor.

## 3. Criar personagens de teste

Pela interface (tela de personagens) ou pela linha de comando, com o servidor parado ou rodando (o personagem não pode estar conectado). Dentro de `server/`:

```bash
npm run create-character -- --account teste1 --password teste123 --name Brakka --class breaker
```

```bash
npm run create-character -- --account teste2 --password teste123 --name Ilvo --class emberweaver
```

Opções: `--level N` (começa no nível N, com os pontos livres correspondentes), `--give ID_DO_ITEM` (repetível, coloca na bolsa), `--db arquivo.db`. Classes do M1: `breaker` (Quebraferro), `emberweaver` (Tecelão da Brasa). IDs de item estão em `data/items.json` (ex.: `axe_1h_t5` = Machado de Pedreira, `wand_t5` = Varinha de Vidro Fosco).

## 4. Testes automatizados

Dentro de `server/`:

```bash
npm test
```

Roda os testes (no SQLite): unitários (regras, equipamento, navegação, coerência dos dados, as 48 habilidades, o contrato do banco, uma rodada curta da simulação de progressão) e os **testes de aceitação** dos Marcos 1, 2 e 3, do pós-v1 (troca, clãs, refino +4..+6, duelos, níveis 21–25), do teste público (contas, moderação), das missões secundárias (material que só cai com a missão, diária no dia seguinte, recompensa pela armadura, títulos, defesa do Joca vencida e perdida, entrega nas duas cidades, esteira, quadro de missões e a fonte de todo item) e das várias zonas, que sobem um servidor real numa porta aleatória com banco temporário e conectam clientes simulados pelo mesmo protocolo do Godot. `npm run test:pg` roda a mesma suíte no PostgreSQL (sobe um servidor temporário e o apaga no fim; precisa dos binários do PostgreSQL instalados). O do Marco 3 inclui o refino conferido em 10.000 tentativas, o depósito da conta, a elite diária e **três grupos de bots** (5 com tanque e curadora, 3 sem tanque, 2 jogadores) vencendo o Custódio reagindo aos avisos, com uma queda de conexão no meio. Só um deles, com a narração:

```bash
node --test --test-reporter=spec test/m3.test.js
```

Só o do Marco 1:

```bash
npm run test:acceptance
```

Validar os dados depois de editar `data/*.json`, e regenerar as tabelas da documentação:

```bash
npm run validate-data
```

```bash
npm run gen-docs
```

Medir a progressão (Marco 4): um bot por classe caça do nível 1 ao teto (25) num servidor em processo, acelerado (`server.step(100)` em laço, sem rede), e o tempo de cada nível é comparado com as metas de `data/xp_table.json`. A rodada padrão (8 classes × 8 sementes, mais o mesmo lote sem a prova de classe) leva ~13 min com 3 linhas de execução e regrava [docs/relatorio-progressao.md](docs/relatorio-progressao.md); o JSON completo vai para `server/relatorio-progressao.json` (fora do git). O relatório versionado é essa rodada, do 1 ao 25, com o equilíbrio do Marco 4 (decisões a partir de D127 em `docs/DECISOES.md`); as sementes são fixas, então a mesma versão do jogo repete os mesmos números:

```bash
npm run simular-progressao
npm run simular-progressao -- --classes breaker,emberweaver --repeticoes 2 --md /tmp/rel.md
```

Teste automático do **cliente** (headless, contra um servidor rodando), da raiz do repositório:

```bash
/Applications/Godot.app/Contents/MacOS/Godot --headless --path client -- --autotest --server=ws://127.0.0.1:7777 --account=robo --password=robo123 --class=breaker --name=Robo
```

Ele cria a conta/personagem se preciso, entra no mundo pela mesma rotina da interface, anda até (30, 50), ataca um Rato de Sulco, coleta o saque e termina com `[autotest] OK` (código de saída 0). Mensagens `Parameter "m" is null` vêm do renderizador "dummy" do modo headless e são inofensivas. Com servidor `--dev`, `--board` vai depois a Pedrâmbar e abre o quadro de missões da praça pelo clique da interface, e `--defense` aceita "O Teste de Pressão" com Joca, abre a válvula e confere o Joca da defesa no lugar do NPC, o cronômetro e o seletor de título da ficha.

Vitrine com as 8 classes, monstros e NPCs (salva capturas, inclusive closes do rosto):

```bash
/Applications/Godot.app/Contents/MacOS/Godot --path client -- --gallery=/tmp/vitrine
```

Percorrer todas as telas e salvar uma captura de cada (precisa de janela, não use `--headless`):

```bash
/Applications/Godot.app/Contents/MacOS/Godot --path client -- --navshots=/tmp/telas --server=ws://127.0.0.1:7777 --account=vitrine --password=vitrine123 --class=breaker --name=Brakka
```

Tour do cenário: teleporta (comando de mestre — servidor iniciado com `npm run dev`) por pontos de cada mapa, salva visão de jogo, ampla, de perto e uma sequência correndo, e mede a fluidez (velocidade quadro a quadro):

```bash
/Applications/Godot.app/Contents/MacOS/Godot --path client -- --sceneshots=/tmp/cenario --server=ws://127.0.0.1:7777 --account=cena --password=cena123 --class=warden --name=Cena
```

Ver o calabouço no cliente (servidor com `npm run dev`): um parceiro simulado entra no grupo e vai junto até a porta da Última Eclusa. Num terminal, dentro de `server/`:

```bash
node tools/partner.mjs ws://127.0.0.1:7777 Parceira
```

E, em outro terminal, da raiz do repositório:

```bash
/Applications/Godot.app/Contents/MacOS/Godot --path client -- --sceneshots=/tmp/eclusa --dungeon=Parceira --server=ws://127.0.0.1:7777 --account=lider --password=lider123 --class=emberweaver --name=Lider
```

Com `--trial` no lugar de `--dungeon=...`, o mesmo modo faz a prova de classe na arena.

Troca, clã, duelo e ferreiro com risco no cliente (servidor com `npm run dev`): um parceiro simulado aceita a troca (oferecendo 25 de ouro), entra no clã e aceita o duelo. Num terminal, dentro de `server/`:

```bash
node tools/parceiro-social.mjs --url ws://127.0.0.1:7777 --nome Parceira
```

E, em outro terminal, da raiz do repositório:

```bash
/Applications/Godot.app/Contents/MacOS/Godot --path client -- --sceneshots=/tmp/social --social=Parceira --server=ws://127.0.0.1:7777 --account=mercador --password=mercador123 --name=Mercador
```

## 5. Reproduzir os cenários críticos à mão

Prepare (servidor parado ou rodando):

```bash
npm run create-character -- --account cenario1 --password teste123 --name Cedo --class breaker --level 2 --give axe_1h_t5
```

```bash
npm run create-character -- --account cenario2 --password teste123 --name Pronto --class breaker --level 5 --give axe_1h_t5
```

```bash
npm run create-character -- --account cenario3 --password teste123 --name Faisca --class emberweaver --level 5 --give wand_t5
```

| Cenário | Passos | Resultado esperado |
|---|---|---|
| Ver o outro se mover | Entre com duas contas; numa janela clique no chão | A outra janela mostra o personagem andando até o ponto |
| Combate, XP e saque individual | Clique num Rato de Sulco até derrotá-lo | Números de dano, "+XP", saque só na sua tela; clique no saque para coletar |
| Equipar cedo demais | Entre com `cenario1`, **I**, passe o mouse no Machado de Pedreira e clique | Descrição com "Nível mínimo: 5", "Força 22 (você: 17)", "Talento 14 (você: 11)" em vermelho; mensagem **"Nível 5 exigido. Seu nível atual é 2."** |
| Atributos insuficientes → distribuir → equipar | Entre com `cenario2`, **I**, clique no machado | **"Força 22 exigida. Sua Força atual é 17."** Depois **C**, "+" em Força 5× e Talento 3×, **Confirmar pontos**, **I**, clique no machado: equipado |
| Duas mãos | Entre com `cenario3`, **I**, clique no Cajado de Aprendiz | Varinha e foco voltam para a bolsa; clicar no foco: **"A arma de duas mãos ocupa a mão secundária. Desequipe-a antes de usar este item."** |
| Redistribuição invalida equipamento | Com o machado equipado (cenário acima), **C** → **Redistribuir tudo** | "1 item(ns) voltaram para a bolsa"; machado na bolsa |
| Persistência | Equipe o machado, feche a janela, reabra e entre | Machado continua equipado. Também vale parando o servidor (`Ctrl+C`) e rodando `npm start` de novo |
| Reconexão | Com o cliente aberto, pare o servidor | Aviso "Conexão perdida" com **Reconectar**; suba o servidor e clique: volta ao mesmo personagem |
| Saque idempotente | Coberto pelo teste automático (pedidos repetidos e simultâneos só são possíveis pelo protocolo) | `npm run test:acceptance` mostra "4 pedidos do mesmo machado -> 1 instância" |

## Estrutura

```
data/     dados do jogo (classes, habilidades, itens, monstros, saque, mapas, XP, fórmulas)
server/   servidor autoritativo de zona (Node.js) + testes + ferramentas
client/   projeto Godot 4
docs/     design e arquitetura
deploy/   implantação do teste público (Docker, Compose + Caddy, systemd)
.github/  CI (testes, importação do cliente, imagem) e releases (exportação e assinatura)
```

Detalhes em [docs/05-arquitetura.md](docs/05-arquitetura.md).
