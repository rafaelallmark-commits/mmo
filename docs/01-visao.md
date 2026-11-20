# 1. Visão do jogo

## Em uma frase

**Cinzas do Meridiano** é um MMORPG de ação PvE para PC, com câmera elevada e movimento por clique, em que voluntários de duas cidades rivais caçam juntos nas estradas e túneis de uma rede subterrânea que voltou a funcionar sozinha — e descobrem que o apagão de dezessete anos atrás foi uma decisão das duas cidades, não um crime de uma delas.

## O que o jogador sente

O momento que o jogo inteiro serve é este:

> Você derruba o Capataz Rachado com um desconhecido da outra cidade. No chão, só para você, aparece um **Machado de Pedreira**. Você passa o mouse: "Nível 5 · Força 22 · Talento 14" — tudo em vermelho. Você tem nível 2. Guarda o machado, abre a ficha, faz as contas de onde vão os próximos pontos, chama o desconhecido para caçar os Javalis de Cinza no fim da estrada. Três níveis depois você volta ao Posto da Ponte, distribui os pontos, e o machado finalmente entra na sua mão. O Brejo das Bombas, que antes parecia perigoso demais, agora é o próximo passo.

Esse ciclo — **achar algo que ainda não posso usar → decidir a build → caçar com outros → voltar e equipar → ir para um lugar mais perigoso** — se repete em cada faixa de equipamento (níveis 1, 5, 9, 13, 17 e 20; no pós-v1, também 21 e 25).

## O laço caçar → subir de nível → equipar

```
     ┌───────────── caçar (mapas compartilhados, solo ou grupo) ─────────────┐
     │                                                                        │
     ▼                                                                        │
  saque individual ──► item acima do nível/atributos ──► planejar pontos      │
     │                     (descrição mostra o que falta em vermelho)         │
     ▼                                                                        │
  XP (participação, proximidade, diferença de nível) ──► subir de nível       │
     │                                                                        │
     ▼                                                                        │
  voltar à cidade / posto ──► distribuir 5 pontos ──► equipar (servidor valida)│
     │                                                                        │
     ▼                                                                        │
  mapa mais perigoso, monstros que dão mais XP, próxima faixa de itens ───────┘
```

- **Caçar**: monstros por família em cada área, com comportamento legível (passivos, agressivos com raio de agressão, matilhas que chamam vizinhos, elites que justificam voltar ao mapa). Grupos se formam naturalmente em pontos de caça porque monstros juntos demais para um solo dão mais XP por minuto em dupla ou trio.
- **Subir de nível**: XP calibrado por tempo de caça ativa (meta em minutos por nível, conferida pela simulação de caça solo; ver [docs/04](04-progressao-e-formulas.md)), com missões principais valendo ~30% do XP de cada capítulo. Quem prefere só caçar também evolui; quem mistura caça e missões evolui ~30% mais rápido.
- **Equipar**: todo item tem nível mínimo, classe e atributos permanentes exigidos. O bônus do item nunca libera o próprio requisito; tônicos e efeitos temporários não contam. A recusa diz exatamente o que falta ("Nível 9 exigido. Seu nível atual é 7.").

## Pilares

1. **Classes ligadas às armas.** A arma define o jeito de lutar: o Quebraferro bate forte com machado e não usa escudo; o Bastião segura monstros com garra mecânica e escudo; o Lanceiro acerta em linha com alcance de lança, a Andarilha arremessa azagaias de longe. A função de cada classe aparece na prática: o Bastião segura os inimigos extras, a Cantora faz o grupo gastar menos tônicos.
2. **Caçar junto é melhor, mas não obrigatório.** Mapas compartilhados, saque individual (ninguém rouba o saque de ninguém), XP dividido por participação com bônus de cooperação. Qualquer origem agrupa com qualquer outra desde a Estrada Velha.
3. **Progressão legível.** Requisitos sempre visíveis, faltas em vermelho, recusas com valor atual e exigido, tabelas de XP e de equipamento publicadas. Nenhuma surpresa escondida.
4. **Uma história que não escolhe culpado.** Âmbar e Nacre cresceram com versões diferentes do apagão. O jogador reúne as duas assinaturas e entende que a decisão foi conjunta — e que religar a rede tem um custo real.
5. **Servidor manda.** Movimento válido, alcance, dano, recargas, inventário, ouro, XP, saque, equipamento e missões são decididos no servidor. O cliente pede; o servidor responde com sim ou com o motivo do não.

## Identidade própria

A inspiração é a *experiência* clássica de MMORPG de ação com câmera elevada (clique para andar, caça em grupo em mapas abertos, equipamento com requisitos). Personagens, classes, habilidades, criaturas, cidades, mapas, interface, arte, música e textos são originais:

- **Mundo**: Várdia, continente erguido sobre o Meridiano — condutores de luz, calor e água. Cidades: **Pedrâmbar** (Âmbar: pedra, madeira, estradas) e **Vau de Nácar** (Nacre: condutores que cruzam rios e montanhas).
- **Direção de arte**: "ferrugem quente". Paleta de fuligem, ocre e cobre, com o vermelho do solo aquecido e o verde-água dos condutores de nácar. Silhuetas grandes e legíveis vistas de cima; monstros por família com formas distintas (bestas arredondadas, máquinas angulosas, espíritos translúcidos). Perigos sempre marcados no chão.
- **Som e música**: sinos subterrâneos como motivo musical (o "primeiro toque" e o "segundo toque" da abertura voltam no calabouço como aviso de perigo). Instrumentos de sopro e metal percutido, sem orquestra épica genérica.
- **Interface**: painéis de couro escurecido com bordas de latão; texto claro; vermelho reservado para requisitos não atendidos e perigo.

## Escopo da versão 1

Níveis 1–20, oito classes, duas cidades, cinco áreas de caça, calabouço da Última Eclusa para 2–5 jogadores, ferreiro até +3. O design de atributos e de XP continua além do 20 (arco maior: os pedidos de socorro anteriores à fundação das cidades). Ficaram para depois da versão 1 e **já são jogáveis no pós-v1**: comércio entre jogadores, clãs, refino +4..+6, duelos (PvP voluntário) e os níveis 21–25 com A Cava Primeira e o capítulo 6, que começa a responder quem mandou os pedidos de socorro (ver `02-campanha.md` e `06-mundo-e-mapas.md`).

O estado atual do código é o **Marco 1** (ver `05-arquitetura.md` e o README).
