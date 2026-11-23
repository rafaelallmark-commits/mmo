# Créditos

## Modelos de personagem (VRM)

Os personagens jogáveis e os NPCs usam dois modelos VRM de exemplo publicados pelo VRM Consortium no repositório oficial da especificação VRM (`vrm-c/vrm-specification`, pasta `samples/`). Os arquivos foram renomeados de `.vrm` para `.glb` (o VRM é um glTF binário) e ficam em `client/assets/characters/`.

| Arquivo no projeto | Modelo original | Autor / direitos | Licença |
|---|---|---|---|
| `seed_san.glb` | **Seed-san** | **Seed-san model by VirtualCast, Inc.** | VRM Public License 1.0 — crédito obrigatório |
| `pixiv_sample.glb` | VRM1_Constraint_Twist_Sample | (c) 2022 pixiv Inc. | VRM Public License 1.0 — crédito dispensado (mantido por cortesia) |

Permissões conferidas nos metadados gravados em cada arquivo (`VRMC_vrm.meta`): uso como avatar por qualquer pessoa (`avatarPermission: everyone`), uso comercial inclusive por empresas (`commercialUsage: corporation`), redistribuição permitida (`allowRedistribution: true`), modificação e redistribuição de versões modificadas permitidas (`modification: allowModificationRedistribution`) e uso em conteúdo com violência permitido (`allowExcessivelyViolentUsage: true`). Licença: <https://vrm.dev/licenses/1.0/>.

Modificações feitas pelo jogo, em tempo de execução: troca de materiais por cel shading próprio, recolorização de cabelo, olhos e roupa, ocultação do braço robótico e da mochila do Seed-san, animação procedural do esqueleto e peças de equipamento presas aos ossos.

O crédito do Seed-san aparece no rodapé da tela de título, na tela **Créditos e licenças** e no `LICENCAS-TERCEIROS.txt` de cada pacote.

## Ícone

O ícone do jogo é **original**, desenhado para o Cinzas do Meridiano: o sino de bronze que volta a tocar debaixo da terra, rachado de alto a baixo pelo **sulco vermelho** que se abre entre as pedras na abertura, brilhando como brasa, sobre fundo de fuligem com cinzas no ar. A fonte é o vetor `client/assets/icon/icon.svg`; `tools/icone/gerar_icone.gd` desenha com o rasterizador SVG do próprio Godot as versões usadas pelo jogo e pelos pacotes:

| Arquivo | Uso |
|---|---|
| `client/assets/icon/icon_256.png` | ícone do projeto (`config/icon`): janela e barra de tarefas, inclusive no Linux |
| `client/assets/icon/icon_1024.png` | ícone do `.app` do macOS (o Godot monta o `.icns` de 16 a 1024 px) |
| `client/assets/icon/icon.ico` | ícone do `.exe` do Windows (16, 32, 48, 64, 128 e 256 px; gravado pelo `rcedit` na exportação) |
| `deploy/site/icone.png` | ícone da página do jogo |

Para regerar depois de mudar o SVG, na raiz do repositório: `godot --headless --path client --script "$PWD/tools/icone/gerar_icone.gd"`.

## Motor e componentes de terceiros

O cliente é feito com o **Godot Engine 4.3** (licença MIT/Expat), que traz bibliotecas de terceiros: FreeType, HarfBuzz, ICU, ENet, Mbed TLS, zlib, libpng, ThorVG e outras, cada uma com os seus direitos e a sua licença (MIT, BSD, Apache 2.0, FTL, MPL 2.0, OFL, zlib, entre outras). A lista completa e os textos das licenças vêm do próprio motor (`Engine.get_license_text`, `get_copyright_info` e `get_license_info`) e acompanham **cada cópia distribuída** do jogo (D151):

- na tela **Créditos e licenças** do menu inicial (abas Créditos, Godot Engine, Terceiros e Licenças);
- no arquivo **`LICENCAS-TERCEIROS.txt`** dentro de cada pacote da release, gravado pelo próprio executável exportado (`--licenses=arquivo`) com o mesmo texto da tela.

A frase que a licença do FreeType pede na documentação de quem o distribui está nos dois lugares: *Portions of this software are copyright © The FreeType Project (www.freetype.org). All rights reserved.*

O cliente leva também a lista de autoridades certificadoras da Mozilla (`client/certs/ca-certificates.crt`, Mozilla Contributors, **MPL 2.0**; a mesma "CA certificates" que o Godot lista em Terceiros, numa versão mais nova), com que ele confere o certificado do servidor (D177). A tela de créditos cita a lista e o texto da MPL 2.0 está em Licenças.

Os pacotes trazem também o guia (`GUIA.txt`), os termos (`TERMOS.txt`) e a política de privacidade (`PRIVACIDADE.txt`).

A imagem Docker do servidor leva o Node.js (licença MIT, com as licenças dos componentes dele) e os pacotes npm `ws` e `pg` com as suas dependências (MIT e ISC); o texto da licença de cada pacote vai junto, em `node_modules/<pacote>/LICENSE` dentro da imagem.

## Som e música

Todos os efeitos sonoros e toda a música do jogo são **originais**: nada foi gravado, baixado ou tirado de bancos de sons. Cada arquivo de `client/audio/` — efeitos em `sfx/`; notas de sino e de flauta, bordões e percussão do sequenciador em `music/` — é sintetizado do zero por `tools/audio/gerar_sons.py` (Python 3 + numpy, semente fixa por som: duas execuções geram arquivos idênticos byte a byte). As técnicas são todas de síntese: parciais inarmônicas com decaimento exponencial para sinos e metais, ruído filtrado para passos e golpes no ar, corda de Karplus-Strong para o arco, pulso glotal com formantes para grunhidos e uma reverberação curta por convolução com resposta sintética. A música é montada durante o jogo por `client/scripts/audio.gd`, que só sequencia essas notas pré-gravadas.

Para regerar os sons: `python3 tools/audio/gerar_sons.py` (depois abra o projeto no Godot ou rode `godot --headless --path client --import`).

## Ferramentas

- Godot Engine 4.3 (MIT): cliente, exportação e o rasterizador do ícone.
- Node.js e os pacotes `ws` e `pg` (MIT): servidor.
- Caddy (Apache 2.0): proxy TLS e página do jogo na implantação.
