# Registro de decisões

Decisões tomadas por conta própria durante a sessão que criou o Marco 1. Cada uma pode ser revista; o motivo está ao lado.

## Tecnologia

| # | Decisão | Motivo |
|---|---|---|
| D1 | **Servidor em Node.js 22+ (JavaScript, módulos ES)**, uma dependência (`ws`). | Roda e testa limpo neste ambiente e no Mac do usuário com um único instalador; `node:test` e `node:sqlite` vêm embutidos; JSON é nativo (dados, protocolo e banco falam o mesmo formato). Python exigiria pip e bibliotecas extras de WebSocket; Go exigiria compilação e uma linguagem a mais para manter. |
| D2 | **SQLite via `node:sqlite`** (arquivo `cinzas.db`), não JSON. | Saque idempotente e trocas de equipamento precisam de transação atômica; um índice único impede dois itens no mesmo espaço. Requer Node ≥ 22.13 (o módulo ainda imprime aviso "experimental", suprimido pelos scripts npm). |
| D3 | **WebSocket com JSON**, uma mensagem por quadro, todo pedido com `rid`. | Godot 4 tem `WebSocketPeer` nativo; JSON é legível nos logs e nos testes. Para o teste público, trocar por binário só se a medição do M4 mostrar necessidade. |
| D4 | **Godot 4.3**, renderizador "Compatibility" (OpenGL 3). | Abre em Macs mais antigos e em máquinas sem Vulkan; o projeto abre em 4.3 ou mais novo. Permitiu renderizar capturas de tela por software neste ambiente. |
| D5 | Interface e mundo do cliente **construídos por código** (GDScript), com uma única cena. | Menos arquivos `.tscn` frágeis para revisar em texto; tudo testável em headless. Arte definitiva entra depois substituindo malhas primitivas. |
| D6 | Cliente recebe **todas as definições do servidor** (`defs`) no login. | O cliente nunca diverge dos dados do servidor; editar `data/*.json` e reiniciar o servidor atualiza os dois. |
| D7 | **Tick de 10 Hz** e snapshot completo da zona a cada tick. | Suficiente para clique-para-mover com interpolação; o mapa do M1 é pequeno. Filtro por interesse fica para o M4/múltiplas zonas. |
| D8 | **Relógio de jogo escalável** (`--time-scale`) e **taxa de XP** (`--xp-rate`) no servidor. | Permite que o teste de aceitação percorra do nível 1 ao 5 em ~25 s sem mudar regras. O teste liga a taxa de XP só na fase de caça até o nível 5 (como um "evento de XP" de operador), e a desliga depois. |
| D9 | **Comandos de mestre** (`gm give/teleport/xp`) só com `--dev`. | Necessários para reproduzir cenários manualmente e para testar a recusa por classe (o jogo não tem troca entre jogadores no M1). Nunca ligados por padrão. |
| D10 | Autenticação simples (conta + senha com scrypt) no próprio servidor de zona. | Suficiente para protótipo local; o teste público usa serviço de contas separado (ver docs/05). |

## Regras de jogo

| # | Decisão | Motivo |
|---|---|---|
| D11 | **Atributos iniciais somam 60** em todas as classes; 5 pontos por nível a partir do 2 (95 no nível 20). | Mesma base para todas; a diferença está na distribuição. |
| D12 | **Curvas de requisito construídas em torno do catálogo da especificação**; os 8 itens pedidos mantêm os números originais. | A verificação (docs/04, seção 4.5) mostrou que todos cabem nos pontos disponíveis, mesmo somados a armadura e mão secundária da faixa. Requisitos de uma faixa consomem cerca de metade dos pontos disponíveis; a outra metade fica para Vitalidade e para a identidade da build — é isso que torna a escolha de pontos interessante. |
| D13 | O **machado de duas mãos** exige +2 de Força e −2 de Talento em relação ao de uma mão, e o **montante** (espada de duas mãos) um pouco mais de Força que a espada; lanças e cajados seguem a curva base da família, o que preserva **Pique de Ferro Frio** e **Cajado da Câmara Rubra** com os números da especificação. | Duas mãos troca a mão secundária por mais dano; o custo extra em Força reflete isso sem alterar o catálogo pedido. |
| D14 | **Machado de duas mãos** e **cajado de aprendiz** vêm na bolsa do kit inicial do Quebraferro e do Tecelão. | O tutorial ensina empunhadura e a escolha entre estilos desde o nível 1; também exercita a validação de duas mãos no M1. |
| D15 | **Capataz Rachado** (elite nível 4) entrega a **primeira arma de nível 5 da classe** a cada participante, 100% das vezes. | Garante a experiência central (achar um item que ainda não se pode usar) no capítulo 1 e torna o teste determinístico. |
| D16 | **Sem perda de XP ao cair.** Retorno ao posto com 50% de vida e mana. | A especificação pede custo em tempo e deslocamento. |
| D17 | **Zona segura** do posto impede só que monstros *iniciem* agressão; não faz monstros desistirem de quem os ataca. | Primeira versão fazia o monstro voltar curado quando o jogador batia de dentro do posto, gerando luta infinita (encontrado pelo teste de aceitação). |
| D18 | **Magia não usa evasão** (acerto só cai contra alvos de nível maior); ataques físicos usam precisão × evasão. | Diferencia o Tecelão/Cantora (dano garantido, limitado por mana e recarga) das classes físicas (consistentes, sem custo). |
| D19 | **Mitigação K/(K+defesa)** com K = 40 + 8 × nível do atacante. | Defesa nunca zera dano e perde força contra atacantes de nível alto: monstros acima do nível são risco real. |
| D20 | **XP dividido por participação** (dano no M1; cura, proteção e controle no M2) + 10% de bônus por participante extra; saque individual para quem tiver ≥ 5%. | Grupos são ligeiramente mais eficientes e muito mais seguros, sem obrigar ninguém a agrupar. |
| D21 | **XP: ~3 abates/min solo; tempo por nível 2 + 1,5 × (nível − 1) minutos**; missões principais ≈ 30% do XP de cada capítulo. | ~4,9 h de caça pura até o nível 20 (≈ 3,4 h com missões) — metas de teste para o M4 medir. |
| D22 | Redistribuição de atributos **grátis no M1** (`reset_attrs`). | Necessária para testar a regra "redistribuição que invalida equipamento". No jogo final custará um item. |
| D23 | Bolsa de **30 espaços**; tônicos e materiais empilham (cada monte é uma instância com UUID; o saque guarda qual instância recebeu). | Mantém "ID único por peça" para equipamento e evita encher a bolsa com tônicos. |
| D24 | Saque não coletado **expira em 30 min** e sobrevive a reconexões e reinícios. | Dá tempo de voltar depois de cair ou desconectar. |
| D25 | Habilidades de níveis 15 e 20 que a especificação não nomeia foram criadas (ex.: Couraça de Brita, Fenda Sísmica, Coração da Fornalha). | A especificação pede "uma complementar" no 15 e "uma avançada" no 20 sem nomeá-las. |
| D26 | **Teto de graus por faixa**: 2 (nível 1), 3 (nível 5), 4 (nível 10), 5 (nível 15); desbloquear dá o grau 1 de graça. | Com 19 pontos e 20 graus extras possíveis até o 20, ninguém maximiza tudo. |
| D27 | Nomes de cidades **Pedrâmbar** (Âmbar) e **Vau de Nácar** (Nacre); empresa operadora **Companhia Meridional de Condução**; NPCs Teodoro, Ruy, Joca, Pina, Olga e mestres de classe. | A especificação não nomeia; nomes em português e coerentes com o tema. |
| D28 | O **Custódio** escala a vida pelo tamanho do grupo (60% para 2, 100% para 5). | Permite vencer com 2–5 jogadores e várias composições, como pedido. |

## Processo

| # | Decisão | Motivo |
|---|---|---|
| D29 | `docs/03-classes.md` e `docs/04-progressao-e-formulas.md` são **gerados** a partir dos dados (`npm run gen-docs`). | Tabelas e exemplos calculados nunca divergem do que o servidor faz. |
| D30 | `data/items.json` foi gerado uma vez por um script descartável e agora é **a fonte de verdade editável**; o validador (`npm run validate-data`) protege a coerência. | Evita um gerador que sobrescreva edições manuais. |
| D31 | Código em inglês; textos de jogo, mensagens de recusa e documentação em português do Brasil. | Pedido do usuário. |
| D32 | **`rid` com prefixo aleatório por execução** no cliente, e o servidor só trata como duplicata um `rid` repetido **do mesmo tipo de pedido**. | Encontrado ao rodar o cliente duas vezes seguidas: a numeração recomeçava em cada execução e o cache de respostas por personagem (que existe para reenvios após queda) devolvia respostas da sessão anterior. |
| D33 | O teste de aceitação garante o nível 2 antes da recusa "Nível 5 exigido. Seu nível atual é 2." caçando Ratos de Sulco se a parte de XP do elite não bastar. | A parte de cada jogador no elite varia com as rolagens; 14 XP por rato nunca leva além do nível 2, então a mensagem testada é sempre a da especificação. |
