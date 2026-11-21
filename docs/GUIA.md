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
3. Digite o **código de 6 dígitos** que chega por e-mail (vale 30 minutos; dá para pedir outro).
4. Entre com conta e senha. Esqueceu a senha? *Esqueci a senha* manda um código para o e-mail.
5. Crie o personagem: escolha a **origem** (Âmbar ou Nácar), a **classe** e o nome (3 a 16 letras, números,
   `_` ou `-`, **sem espaços**).

A tela de título também tem **Créditos e licenças**: quem fez o quê, os modelos de personagem e as licenças do
motor Godot e dos componentes que vêm com ele.

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
| Painéis | **I** bolsa, **C** ficha (atributos e habilidades), **J** missões, **L** clã, **Enter** chat, **Esc** fecha |

Habilidades com **tempo de conjuração** mostram a barra "Conjurando…": fique parado até o fim — andar, atacar
ou usar um item interrompe (sem gastar mana).

## 6. Subir de nível e se equipar

- Cace monstros da sua faixa (o nível aparece sobre eles) e siga as **missões** do diário (**J**): elas contam a
  história e dão XP, ouro e tônicos.
- A cada nível você ganha **pontos de atributo** e **de habilidade**: distribua na ficha (**C**). Os itens exigem
  nível, classe e atributos — a dica do item mostra o que falta.
- **Equipamento**: o **armeiro** de cada cidade (Amaro em Pedrâmbar, Inês no Vau de Nácar) vende as peças comuns
  da sua faixa e da próxima; peças melhores caem dos monstros, das elites e dos chefes.
- **Ferreiro**: refina peças até **+6**. Até +3, a falha só gasta ouro e material; dali em diante a falha derruba
  um grau, a menos que você use um **Selo de Proteção** (só é gasto quando segura uma falha).
- **Vender e descartar**: na bolsa (**I**), botão direito no item. Qualquer comerciante compra pela metade do valor.
- **Depósito**: guarda-volumes compartilhado entre os personagens da sua conta.
- Caiu? Volte ao posto de guarda do mapa. Se sair do jogo no meio de uma instância, você volta à porta dela.

## 7. Mapas

Pedrâmbar e Vau de Nácar (cidades) → **A Estrada Velha** (níveis 1–5) → **Brejo das Bombas** (5–9) →
**Oficina Soterrada** (9–12) → **Galerias do Eco** (12–16) → **Canais da Eclusa** (16–20), com o calabouço
**A Última Eclusa** (2 a 5 jogadores) → no nível 20, o **Poço de Inspeção** dos Canais desce para **A Cava Primeira**
(20–25). Os portais mostram o nível mínimo.

## 8. Junto com os outros

- **Grupo** (até 5): `/convidar Nome` ou clique no jogador → *Grupo*. Quem está perto divide o XP, mesmo sem bater.
- **Chat**: `/g` grupo · `/s Nome` sussurro · `/c` clã · sem prefixo, o mapa. Nome antigo com espaço vai entre
  aspas: `/s "Ana Maria" oi`.
- **Troca**: clique no jogador → *Trocar* (ou `/troca Nome`). Os dois montam a oferta, **travam** e **confirmam**;
  qualquer mudança destrava os dois — confira a oferta antes de confirmar.
- **Clã**: nível 10 e 500 de ouro para fundar (**L**). A sigla aparece antes do nome dos membros.
- **Duelo**: clique no jogador → *Duelar* (ou `/duelo Nome`). Ninguém morre: quem chegaria a 0 fica com 1 de vida
  e perde; afastar-se demais é desistência. Fora de duelo, jogadores não se atacam.

## 9. Convivência

Respeito no chat e nos nomes; nada de robôs, programas que jogam sozinhos, exploração de falhas ou venda de itens e
contas por dinheiro. Use **`/denunciar Nome motivo`** para avisar a equipe (vão junto as últimas falas do
denunciado que você viu: as do mapa e o que ele disse a você, no grupo ou no clã). A equipe pode silenciar, desconectar ou suspender contas — veja os [Termos de uso](TERMOS.md).

## 10. Seus dados

Na tela de personagens você pode **excluir a conta**; pelo serviço de contas também dá para **baixar seus dados**.
Detalhes na [Política de privacidade](PRIVACIDADE.md).
