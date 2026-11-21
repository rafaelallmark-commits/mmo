# Guia do jogador e do testador — Cinzas do Meridiano (teste público)

Bem-vindo a Várdia. Este guia cobre o que você precisa para baixar o jogo, abri-lo no seu sistema, relatar
problemas e começar a jogar; as regras completas estão nos [Termos de uso](TERMOS.md) e o que guardamos dos seus
dados está na [Política de privacidade](PRIVACIDADE.md). Avisos da equipe (manutenções, versões novas, mudanças
nos termos) saem no jogo e na página do teste (`https://[domínio do teste]/`).

> É um **teste**: pode haver erros, quedas e reinícios avisados no jogo, e o progresso pode ser apagado ao
> fim do teste. Encontrou um problema? Digite **`/bug o que aconteceu`** no chat (ou *Reportar um problema* no
> menu do Esc): o relato vai com o mapa, a posição e as versões. Quem reporta falhas de boa-fé não é punido.

## 1. Baixar, instalar e abrir

**Onde baixar**: na página de **Releases** do projeto, <https://github.com/rafaelallmark-commits/mmo/releases>
(a página do teste tem o mesmo link). Pegue a versão mais nova (as de teste aparecem como *Pre-release*) e o
pacote do seu sistema:

| Sistema | Pacote |
|---|---|
| Windows 10 ou 11, 64 bits | `CinzasDoMeridiano-<versão>-windows-x86_64.zip` |
| macOS 10.12 ou mais novo (Intel e Apple Silicon) | `CinzasDoMeridiano-<versão>-macos-universal.zip` |
| Linux, 64 bits (x86_64) | `CinzasDoMeridiano-<versão>-linux-x86_64.tar.gz` |

O arquivo `SHA256SUMS.txt` da mesma página confere se o download chegou inteiro (`sha256sum -c SHA256SUMS.txt`).
Cada pacote traz também este guia, os termos, a política de privacidade e as licenças de terceiros em texto
(`GUIA.txt`, `TERMOS.txt`, `PRIVACIDADE.txt`, `LICENCAS-TERCEIROS.txt`).

**Requisitos**: computador de 64 bits; placa de vídeo com **OpenGL 3.3** e o driver atualizado (o jogo usa o
renderizador *Compatibility* do Godot, o mais leve); cerca de 200 MB livres em disco; conexão com a internet (o
jogo é online).

**Windows**

1. Clique com o botão direito no `.zip` → *Extrair tudo…* (não abra o jogo de dentro do `.zip`).
2. Na pasta extraída, abra `CinzasDoMeridiano.exe`.
3. Se aparecer **"O Windows protegeu o computador"** (SmartScreen, enquanto o executável não tiver assinatura
   digital), clique em **Mais informações** e depois em **Executar assim mesmo**. As notas de cada versão dizem
   se ela saiu assinada.

**macOS**

1. Dê dois cliques no `.zip`: sai uma pasta com **Cinzas do Meridiano.app** e os textos. Arraste o app para
   *Aplicativos* (recomendado).
2. Abra o app. Se a versão saiu **sem notarização** (as notas da versão dizem), o Gatekeeper bloqueia na
   primeira vez avisando que não pode verificar o app:
   - **macOS 15 (Sequoia) ou mais novo**: feche o aviso, abra **Ajustes do Sistema → Privacidade e Segurança**,
     desça até **Segurança**, clique em **Abrir Mesmo Assim** ao lado do aviso sobre o Cinzas do Meridiano,
     confirme com a senha do Mac e, no próximo aviso, em **Abrir Mesmo Assim** de novo.
   - **macOS 14 ou anterior**: clique no app com o botão direito (ou Control + clique) → **Abrir** → **Abrir**.
   - **Pelo Terminal**, em qualquer versão: `xattr -dr com.apple.quarantine "/Applications/Cinzas do Meridiano.app"`
     (se o app estiver em outra pasta, troque o caminho; dá para arrastar o app para a janela do Terminal).
3. Isso só é preciso na primeira vez de cada versão.

**Linux**

1. Extraia: `tar -xzf CinzasDoMeridiano-<versão>-linux-x86_64.tar.gz` e entre na pasta criada.
2. Abra: `./CinzasDoMeridiano.x86_64`. Se aparecer **"Permissão negada"** (alguns programas de extração tiram
   a permissão de execução), rode `chmod +x CinzasDoMeridiano.x86_64` e abra de novo; no gerenciador de
   arquivos, é *Propriedades → Permissões → Permitir executar como programa*.

**Versão nova**: quando o servidor for atualizado para uma versão que a sua não entende, a tela de entrada
avisa **"Versão incompatível"** e mostra onde baixar a nova (com um botão que abre a página). Baixe e substitua a
pasta antiga; as opções, o último servidor usado e o registro do jogo ficam guardados fora dela.

## 2. Relatar um problema

- **No jogo**: digite **`/bug o que aconteceu`** no chat, ou **Esc → Reportar um problema** (o chat abre com
  `/bug ` pronto). O relato vai com o mapa, a posição, o horário e as **versões** do jogo e do servidor — a do
  jogo também aparece no rodapé da tela de título (ex.: "versão 0.4.0-teste.2 · protocolo 3"). Até 10 relatos
  por hora.
- **Quando o jogo nem abre** (ou fecha sozinho): mande para a equipe ([e-mail da equipe]) o **registro do jogo**,
  o arquivo `godot.log`, junto com o seu sistema e a versão baixada. Ele fica em:

  | Sistema | Pasta do registro |
  |---|---|
  | Windows | `%APPDATA%\Godot\app_userdata\Cinzas do Meridiano\logs\` — cole esse caminho na barra de endereço do Explorador de Arquivos (ou em Win + R) |
  | macOS | `~/Library/Application Support/Godot/app_userdata/Cinzas do Meridiano/logs/` — no Finder, *Ir → Ir para a Pasta…* (Shift + Cmd + G) e cole o caminho |
  | Linux | `~/.local/share/godot/app_userdata/Cinzas do Meridiano/logs/` |

  O `godot.log` é sempre o da última vez que o jogo abriu; as anteriores ficam ao lado com a data e a hora no
  nome (ex.: `godot2026-11-21T20.15.30.log`, até cinco arquivos). Se você abriu o jogo de novo depois do problema,
  mande também o mais recente desses. O registro não tem a sua senha.

## 3. Entrar

1. Abra o jogo. O campo **Servidor** já vem com o endereço do teste (e, depois, com o último servidor que você
   usou para entrar).
2. **Criar conta**: escolha um nome de conta, seu e-mail e uma senha (8 caracteres ou mais), marque a caixa de
   idade (13 anos ou mais) e de aceite dos termos e toque em *Criar e receber o código*.
3. Digite o **código de 6 dígitos** que chega por e-mail (vale 30 minutos).
4. Entre com conta e senha. Esqueceu a senha? *Esqueci a senha* manda um código para o e-mail.
5. Crie o personagem: escolha a **origem** (Âmbar ou Nácar), a **classe** e o nome (3 a 16 letras, números,
   `_` ou `-`, **sem espaços** e sem palavras da equipe, como GM, Admin, Moderador, Suporte ou Mestre — nem no
   começo nem no fim do nome).

**Fechou o jogo antes de confirmar?** Na tela Entrar, toque em *Confirmar e-mail* e digite a conta e o código. Se
você tentar entrar sem ter confirmado, o jogo abre essa mesma tela, já com a conta preenchida. Conta que não é
confirmada em **7 dias** é apagada (o nome e o e-mail ficam livres para um cadastro novo).

**O e-mail não chegou?** Procure no lixo eletrônico (e em "Promoções", no Gmail) e use *Reenviar código* na tela do
código: sai um código novo e o anterior deixa de valer. Para evitar abuso, mandamos no máximo **um e-mail por
minuto e 10 por dia** para cada conta e cada endereço — se o jogo pedir para esperar, espere o tempo indicado.
*Esqueci a senha* também confirma a conta: o código da troca de senha prova que o e-mail é seu. Errou o código
muitas vezes (20 em 24 horas, somando confirmação e troca de senha)? Por segurança, novas tentativas ficam
bloqueadas até completar 24 horas.

**Termos novos.** Se os Termos de Uso ou a Política de Privacidade mudarem, no login seguinte o jogo mostra a tela
*Termos atualizados*, com os links para ler os textos: marque a caixa e toque em *Aceitar e entrar*. Se não quiser
aceitar, na mesma tela dá para baixar seus dados ou excluir a conta.

A tela de título também tem **Créditos e licenças**: quem fez o quê, os modelos de personagem e as licenças do
motor Godot e dos componentes que vêm com ele.

## 3.1 Os primeiros 5 minutos: «Três do Outro Lado»

Todo personagem começa no **Posto da Ponte**, na ponta oeste da Estrada Velha. Clique em **Mara Quintela** e aceite
**Três do Outro Lado**: Bento, Ligia e o menino Caio ficaram do outro lado e você vai buscá-los. Uma **dica na tela**,
acima da barra de atalhos, mostra o passo atual (de 1 a 7) e muda sozinha quando você o cumpre:

1. andar até Bento (clique no chão perto dele);
2. atacar um Rato de Sulco (clique nele);
3. usar a habilidade da **tecla 1**;
4. Ligia está ferida: beba um Tônico de Vida (**tecla 7**) perto dela;
5. coletar o saque que o rato derrubou (clique nele no chão);
6. libertar Caio: dois bichos aparecem e batem no menino — derrote os dois (à distância, mantenha distância; corpo a
   corpo, fique entre eles e o Caio);
7. no **segundo toque do sino**, uma faixa vermelha acende embaixo de você: saia dela **para o lado** antes que estoure
   (é o mesmo aviso que o piso do calabouço dá).

Quem você soltou anda atrás de você; se ficar para trás, espera onde está — volte para buscar. Entre no círculo do
posto com os três e fale com Mara: 60 XP, 3 tônicos e o **Mapa da Estrada Velha** (tecla **M**).

Quem é de **Vau de Nácar** atravessa a Estrada Velha para falar com o mestre da classe (missão 1.3): pela estrada,
nenhum bicho agressivo alcança você.

## 4. As oito classes

| Origem | Classe | Papel | Armas |
|---|---|---|---|
| Âmbar | **Quebraferro** | golpes fortes corpo a corpo | machado de uma ou duas mãos |
| Âmbar | **Bastião de Bronze** | defesa, controle e proteção do grupo | martelo ou garras, escudo |
| Âmbar | **Lanceiro do Fosso** | dano explosivo e ataques em linha | lança de duas mãos |
| Âmbar | **Vigia do Espinhal** | dano à distância, precisão, vários alvos | arco e aljava |
| Nácar | **Escudeiro do Alvorecer** | dano com reforço sagrado e auxílio próximo | espada de uma ou duas mãos, escudo |
| Nácar | **Andarilha do Vento** | dano à distância, mobilidade, reforço do grupo | azagaias, escudo leve |
| Nácar | **Cantora do Véu** | cura, proteção e dano sagrado | varinha, cetro ou cajado |
| Nácar | **Tecelão da Brasa** | magia elemental em área e controle | varinha ou cajado |

Cada classe tem seis habilidades: as dos níveis 1 e 5, a do nível 10 (liberada pela **prova de classe** com o
mestre da sua classe, na sua cidade), as dos níveis 15 e 20 e a do nível 25, o teto de nível. A Cantora do Véu ganha
a **Nota Clara** (dano sagrado à distância) no nível 5 e a **Luz Compartilhada** (cura do grupo) no nível 15.

O **escudo** (Bastião e Escudeiro) tem chance de **bloqueio** contra golpes de monstro, de 8% a 21% conforme a peça
(a dica do escudo mostra a chance): o golpe bloqueado não causa dano e aparece como "Bloqueio".

## 5. Controles

| Ação | Como |
|---|---|
| Andar | clique no chão |
| Atacar | clique no monstro (o personagem vai até ele e ataca sozinho) |
| Falar com NPC, usar objeto, atravessar portal, coletar saque | clique neles |
| Habilidades | **1–6** (a barra mostra a recarga; depois de cada habilidade há 1 s de recarga global) |
| Tônicos | **7** vida, **8** mana (o mais forte que você pode usar) |
| Câmera | **Q/E** ou botão direito arrastando giram; a roda aproxima |
| Mapa | **M** — o mapa de onde você está (estradas, portais com o destino, NPCs, posto de guarda, você e o grupo); precisa do Mapa da Estrada Velha, recompensa do tutorial, e vale em todos os mapas |
| Painéis | **I** bolsa, **C** ficha (atributos e habilidades), **J** missões, **L** clã, **M** mapa, **Enter** chat, **Esc** fecha |

Habilidades com **tempo de conjuração** mostram a barra "Conjurando…": fique parado até o fim — andar, atacar
ou usar um item interrompe (sem gastar mana).

**Computador modesto?** Em *Opções → Gráficos*: **Modo leve** (sem sombras, resolução 3D menor e só os personagens
próximos animados), **Sombras**, **Tela cheia** e limite de **quadros por segundo** (30, 60 ou sem limite).

## 6. Subir de nível e se equipar

- Cace monstros da sua faixa (o nível aparece sobre eles) e siga as **missões** do diário (**J**): elas contam a
  história e dão XP, ouro e tônicos. As **secundárias** apontam bons lugares de caça em cada faixa e dão itens
  (luvas, anéis, Pó de Refino). O **quadro de missões** da praça de cada cidade mostra tudo o que você pode
  aceitar agora, no mundo inteiro, com o nível, com quem falar e em que mapa.
- **Materiais de missão** (carapaças, couros, fios...) só caem enquanto a missão está aceita e saem da bolsa na
  entrega; não dá para vender, trocar nem guardar no depósito.
- **Diárias** (Recibo do Capataz, Bomba-Mestra, Supervisor de Turno, Mãe do Eco, Brasa para a Forja): dá para
  fazer uma vez por dia; voltam à **00:00 UTC** (21:00 em Brasília) — o diário e o quadro mostram quanto falta.
- **Títulos**: algumas missões e respostas dão um título, mostrado acima do nome. Na ficha (**C**) você escolhe qual
  aparece, ou nenhum.
- A cada nível você ganha **pontos de atributo** e **de habilidade**: distribua na ficha (**C**). Os itens exigem
  nível, classe e atributos — a dica do item mostra o que falta.
- **Equipamento**: o **armeiro** de cada cidade (Amaro em Pedrâmbar, Inês no Vau de Nácar) vende as peças comuns
  da sua faixa e da próxima; peças melhores caem dos monstros, das elites e dos chefes.
- **Ferreiro**: refina peças até **+6**. Até +3, a falha só gasta ouro e material; dali em diante a falha derruba
  um grau, a menos que você use um **Selo de Proteção** (só é gasto quando segura uma falha). O Pó de Refino se
  compra com ele ou se ganha nas missões dos ferreiros, que aceitam a Brasa Cristalizada e a Sucata de Condutor
  que sobram da caça.
- **Vender e descartar**: na bolsa (**I**), botão direito no item. Qualquer comerciante compra pela metade do valor.
- **Depósito**: guarda-volumes compartilhado entre os personagens da sua conta.
- Caiu? Volte ao posto de guarda do mapa. Se sair do jogo no meio de uma instância, você volta à porta dela.

### Monstros com truques

Clique num monstro: o quadro do alvo, no alto da tela, diz numa linha o que ele faz. Muitos têm um truque:

- **Chão vermelho = saia.** Antes de um golpe de área o monstro para, recua e treme, um sino toca e o chão marca a
  área (círculo, cone ou linha) — 1,5 a 2 s, tempo de clicar para fora. Quem sai não leva nada. Atordoar o monstro
  nesse meio-tempo cancela o golpe. Sapos-Bomba e Escórias explodem **depois de morrer**: afaste-se do corpo.
- **Efeitos negativos** (Desorientado, Atolado, Sanguessuga, Selado, Atordoado) aparecem sob as suas barras com o
  tempo que falta e duram poucos segundos; a **Alvorada** do Escudeiro tira um por vez. Vitalidade encurta o
  atordoamento.
- **Elites** chamam ajuda ou mudam de comportamento: o Supervisor de Turno chama ratos a cada 30% de vida, a Mãe do
  Eco gera Ecoantes, a Bomba-Mestra alterna pressão alta e baixa (bata forte na baixa). A lista completa está em
  `docs/06-mundo-e-mapas.md`.

## 7. Mapas

Pedrâmbar e Vau de Nácar (cidades) → **A Estrada Velha** (níveis 1–5) → **Brejo das Bombas** (5–9) →
**Oficina Soterrada** (9–12) → **Galerias do Eco** (12–16) → **Canais da Eclusa** (16–20), com o calabouço
**A Última Eclusa** (2 a 5 jogadores) → no nível 20, o **Poço de Inspeção** dos Canais desce para **A Cava Primeira**
(20–25). Os portais mostram o nível mínimo.

## 8. Junto com os outros

- **Grupo** (até 5): `/convidar Nome` ou clique no jogador → *Grupo* (um convite a cada 10 s). Quem está perto
  divide o XP, mesmo sem bater.
- **Chat**: `/g` grupo · `/s Nome` sussurro · `/c` clã · sem prefixo, o mapa. Nome antigo com espaço vai entre
  aspas: `/s "Ana Maria" oi`.
- **Troca**: clique no jogador → *Trocar* (ou `/troca Nome`). Os dois montam a oferta, **travam** e **confirmam**;
  qualquer mudança destrava os dois — confira a oferta antes de confirmar.
- **Clã**: nível 10 e 500 de ouro para fundar (**L**). A sigla aparece antes do nome dos membros (nome e sigla
  também não podem imitar a equipe: siglas como GM, ADM, MOD, DEV, STAF e EQP são recusadas).
- **Duelo**: clique no jogador → *Duelar* (ou `/duelo Nome`). Ninguém morre: quem chegaria a 0 fica com 1 de vida
  e perde; afastar-se demais é desistência. Fora de duelo, jogadores não se atacam.
- **Levantar quem caiu**: clique no jogador caído → *Levantar (5 s)*. Qualquer um levanta (não precisa ser do
  grupo): chegue a até 3 m, fique 5 s sem lutar antes e 5 s parado canalizando; quem levanta volta com 20% da vida,
  onde caiu. Andar, agir ou ser atingido interrompe. Quem caiu e não foi levantado volta sozinho ao posto do mapa em
  5 minutos (ou na hora, pelo botão).
- **Painel do grupo**: vida, mana, distância e quem está caído; o líder (★) expulsa pelo botão ao lado do nome. Se o
  líder sair do jogo, a liderança passa a quem estiver on-line.

## 9. Convivência

Respeito no chat e nos nomes; nada de robôs, programas que jogam sozinhos, exploração de falhas ou venda de itens e
contas por dinheiro. Use **`/denunciar Nome motivo`** para avisar a equipe (vão junto as últimas falas do
denunciado que você viu: as do mapa e o que ele disse a você, no grupo ou no clã; quem da equipe está no jogo recebe
um aviso na hora). A equipe pode silenciar, desconectar ou suspender contas, trocar nomes ofensivos e retirar itens
obtidos de forma irregular — veja os [Termos de uso](TERMOS.md).

- **A equipe tem a marca [Equipe]** (em azul) antes do nome, sobre o personagem e no chat. Ninguém mais consegue
  ter essa marca: desconfie de quem diz ser da equipe sem ela.
- **Ignorar alguém**: **`/ignorar Nome`** (ou clique no jogador → *Ignorar*). Você deixa de ver os sussurros e as
  falas dele no mapa, no grupo e no clã, e os convites dele (grupo, clã, troca e duelo) não chegam até você; ele
  não fica sabendo. **`/designorar Nome`** desfaz e **`/ignorados`** mostra a lista (até 100 nomes, guardada no seu
  personagem). A equipe não pode ser ignorada.

## 10. Seus dados

Na tela de personagens:

- **Baixar meus dados**: digite a senha e toque em *Baixar*. O jogo grava um arquivo JSON com tudo o que guardamos
  da sua conta (e-mail, aceite dos termos, personagens, itens, missões, clãs, listas de ignorados e registros de
  segurança) na pasta de dados do jogo e mostra o caminho; *Abrir a pasta* mostra o arquivo e *Salvar uma cópia em
  outro lugar...* deixa escolher onde guardar outra cópia.
- **Excluir personagem**: digite o nome dele e a senha da conta. Os itens, o ouro e as missões dele somem, ele sai do
  clã e o nome fica livre; o que ele guardou no depósito continua com a conta.
- **Excluir conta**: apaga a conta, os personagens, os itens e o e-mail. Não dá para desfazer.

Depois de 5 senhas erradas, espere 10 minutos para tentar de novo. Detalhes na [Política de privacidade](PRIVACIDADE.md).
