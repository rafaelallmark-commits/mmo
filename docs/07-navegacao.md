# 7. Estrutura de navegação

Como o jogador se move entre telas, painéis e mapas. Este documento manda: o cliente (`client/scripts/main.gd`) segue exatamente este fluxo.

## 7.1 Telas (fora do jogo)

```
                ┌──────────────┐
  abrir o jogo →│   TÍTULO     │── Opções ──► [Opções] ──► volta
                │ Jogar · Sair │
                └──────┬───────┘
                       │ Jogar
                ┌──────▼───────┐
                │   ENTRAR     │── Voltar ──► Título
                │ servidor,    │── Criar conta (mesma tela)
                │ conta, senha │
                └──────┬───────┘
                       │ login ok
                ┌──────▼───────────┐
                │  PERSONAGENS     │── Voltar ──► Entrar (desconecta)
                │ lista + prévia 3D│── Criar novo ──► CRIAÇÃO ──► Criar ──┐
                └──────┬───────────┘                    └── Voltar ──────┤
                       │ Jogar                                           │
                ┌──────▼───────┐ ◄───────────────────────────────────────┘ (volta à lista com o novo selecionado)
                │ CARREGANDO   │  nome do mapa + dica
                └──────┬───────┘
                       ▼
                    MUNDO
```

| Tela | Conteúdo | Saídas |
|---|---|---|
| **Título** | logotipo, cena 3D de fundo (ponte ao amanhecer), Jogar, Opções, Sair | Jogar → Entrar; Opções → painel; Sair → fecha |
| **Entrar** | servidor, conta, senha; Entrar, Criar conta, Voltar; erros em vermelho | sucesso → Personagens; Voltar → Título |
| **Personagens** | até 4 cartões (nome, classe, nível, mapa); personagem selecionado em 3D no centro, girando | Jogar → Carregando; Criar novo → Criação; Voltar → Entrar |
| **Criação** | 8 classes em dois grupos (Âmbar / Nacre), papel e armas da classe, prévia 3D muda ao escolher, nome | Criar → Personagens; Voltar → Personagens |
| **Carregando** | nome do mapa, dica de jogo; aparece ao entrar no mundo e em cada troca de mapa | → Mundo |
| **Opções** | sensibilidade da câmera, mostrar nomes, escala da interface; salvo em `user://opcoes.cfg` | Fechar → tela anterior |

## 7.2 Dentro do jogo: camadas

Da mais baixa para a mais alta. Uma camada de cima bloqueia o clique nas de baixo.

| Camada | O que é | Abre / fecha |
|---|---|---|
| 1. Mundo 3D | câmera elevada, personagens, monstros, NPCs, portais | clique: andar, atacar, falar, coletar |
| 2. HUD fixo | vida/mana/XP, barra de atalhos (1–5), alvo, rastreador de missões, painel de grupo, chat | sempre visível |
| 3. Painéis | Inventário (**I**), Ficha (**C**), Missões (**J**) — podem ficar abertos juntos | tecla ou **Esc** |
| 4. Diálogos | NPC (missões, loja, prova de classe), convite de grupo | clique no NPC / **Esc** |
| 5. Menu de pausa | Continuar, Opções, Trocar de personagem, Sair para o título, Sair do jogo | **Esc** sem nada aberto |
| 6. Avisos bloqueantes | Você caiu (voltar ao posto) · Conexão perdida (reconectar) | automático |

**Esc** fecha a camada aberta mais alta; sem nada aberto, abre o menu de pausa. O jogo não pausa (é online): o menu só cobre a tela.

**Trocar de personagem** desconecta e volta direto para Personagens (login refeito automaticamente). **Sair para o título** desconecta e vai ao Título.

## 7.3 Mapa do mundo

```
 Pedrâmbar ═══ A Estrada Velha (1–5) ═══ Vau de Nácar
 (cidade Âmbar)        ║  Posto da Ponte    (cidade Nacre)
                       ║ nível 5
              Brejo das Bombas (5–9)
                       ║ nível 9
              Oficina Soterrada (9–12)
                       ║ nível 12 (M3)
              Galerias do Eco (12–16)
                       ║ nível 16 (M3)
              Canais da Eclusa (16–20) ──► A Última Eclusa (calabouço, 2–5 jogadores)

 Mestres de classe (nas cidades) ──► Arena da Prova (instância solo, nível 10)
```

- Todo mapa tem um **posto de guarda** (zona segura e ponto de retorno ao cair).
- **Portais** ficam nas bordas, com o destino e o nível mínimo escritos acima; atravessar mostra a tela Carregando.
- Quem sai do jogo volta ao mesmo mapa e posição; quem sai dentro de uma instância volta à porta dela.

## 7.4 Controles

| Ação | Mouse / teclado |
|---|---|
| Andar | clique esquerdo no chão |
| Atacar / selecionar | clique no monstro |
| Falar, usar objeto, atravessar portal | clique no NPC, objeto ou anel do portal |
| Selecionar aliado (curas) | clique em outro jogador |
| Câmera | botão direito arrastando ou Q/E gira; roda aproxima |
| Atalhos | 1–3 habilidades, 4–5 tônicos |
| Painéis | I inventário, C ficha, J missões, Enter chat, Esc fechar/menu |

## 7.5 Direção gráfica: 3D estilizado com traço de anime

- **Sombreamento em faixas** (cel shading): luz e sombra em degraus nítidos, com a sombra puxando para um tom frio arroxeado em vez de preto.
- **Contorno** escuro e fino em personagens, monstros, NPCs e objetos (técnica de "casca invertida").
- **Luz de borda** clara no lado oposto à câmera, para destacar silhuetas vistas de cima.
- **Proporções levemente estilizadas**: cabeça maior, olhos grandes e marcados, cabelo em volume colorido por classe; monstros com formas simples e olhos expressivos.
- **Cores**: saturadas, mas dentro da paleta de ferrugem e nácar (céu do amanhecer de violeta para pêssego, chão ocre, verde-oliva); vermelho reservado para perigo e requisitos não atendidos.
- **Cenário**: árvores, pedras e tufos de grama espalhados com semente fixa (o mesmo mapa sempre fica igual), fora da estrada e das áreas de monstros.

Os modelos atuais são montados por código com formas simples já nesse estilo (`client/scripts/art.gd`); a arte definitiva substitui as malhas mantendo os mesmos materiais.
