# Créditos

## Modelos de personagem (VRM)

Os personagens jogáveis e os NPCs usam dois modelos VRM de exemplo publicados pelo VRM Consortium no repositório oficial da especificação VRM (`vrm-c/vrm-specification`, pasta `samples/`). Os arquivos foram renomeados de `.vrm` para `.glb` (o VRM é um glTF binário) e ficam em `client/assets/characters/`.

| Arquivo no projeto | Modelo original | Autor / direitos | Licença |
|---|---|---|---|
| `seed_san.glb` | **Seed-san** | **Seed-san model by VirtualCast, Inc.** | VRM Public License 1.0 — crédito obrigatório |
| `pixiv_sample.glb` | VRM1_Constraint_Twist_Sample | (c) 2022 pixiv Inc. | VRM Public License 1.0 — crédito dispensado (mantido por cortesia) |

Permissões conferidas nos metadados gravados em cada arquivo (`VRMC_vrm.meta`): uso como avatar por qualquer pessoa (`avatarPermission: everyone`), uso comercial inclusive por empresas (`commercialUsage: corporation`), redistribuição permitida (`allowRedistribution: true`), modificação e redistribuição de versões modificadas permitidas (`modification: allowModificationRedistribution`) e uso em conteúdo com violência permitido (`allowExcessivelyViolentUsage: true`). Licença: <https://vrm.dev/licenses/1.0/>.

Modificações feitas pelo jogo, em tempo de execução: troca de materiais por cel shading próprio, recolorização de cabelo, olhos e roupa, ocultação do braço robótico e da mochila do Seed-san, animação procedural do esqueleto e peças de equipamento presas aos ossos.

O crédito do Seed-san aparece na tela de título do jogo.

## Som e música

Todos os efeitos sonoros e toda a música do jogo são **originais**: nada foi gravado, baixado ou tirado de bancos de sons. Cada arquivo de `client/audio/` — efeitos em `sfx/`; notas de sino e de flauta, bordões e percussão do sequenciador em `music/` — é sintetizado do zero por `tools/audio/gerar_sons.py` (Python 3 + numpy, semente fixa por som: duas execuções geram arquivos idênticos byte a byte). As técnicas são todas de síntese: parciais inarmônicas com decaimento exponencial para sinos e metais, ruído filtrado para passos e golpes no ar, corda de Karplus-Strong para o arco, pulso glotal com formantes para grunhidos e uma reverberação curta por convolução com resposta sintética. A música é montada durante o jogo por `client/scripts/audio.gd`, que só sequencia essas notas pré-gravadas.

Para regerar os sons: `python3 tools/audio/gerar_sons.py` (depois abra o projeto no Godot ou rode `godot --headless --path client --import`).

## Ferramentas

- Godot Engine 4.3 (MIT).
- Node.js e o pacote `ws` (MIT).
