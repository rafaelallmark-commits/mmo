# 8. Execução e operação

Como subir, observar, salvar e testar o servidor de CINZAS DO MERIDIANO. Os números de referência vêm
do Marco 4 ([relatorio-carga.md](relatorio-carga.md), [relatorio-cenarios.md](relatorio-cenarios.md)).

## 8.1 Requisitos

- **Servidor**: Node.js ≥ 22.13 (usa `node:sqlite`), sem outros serviços. Uma dependência (`ws`).
- **Cliente**: Godot 4.3 (renderizador Compatibility). Roda pelo editor ou exportado.
- **Implantação** (teste público, §8.8): Docker 25+ com Compose, ou systemd; um domínio com DNS para o TLS.

## 8.2 Subir o servidor

```bash
cd server && npm install && npm start -- --port 7777 --db cinzas.db --metrics-port 9100
```

| Opção | Padrão | Para quê |
|---|---|---|
| `--port` (ou `PORT`) | 7777 | Porta do WebSocket do jogo. |
| `--host` | 0.0.0.0 | Interface de escuta. |
| `--db` (ou `CINZAS_DB`) | cinzas.db | Arquivo SQLite (modo WAL). Migrações rodam sozinhas ao subir. |
| `--metrics-port` (ou `CINZAS_METRICS_PORT`) | desligado | HTTP de métricas e saúde. |
| `--metrics-host` | 127.0.0.1 | Interface do HTTP de métricas (deixe local ou atrás do proxy). |
| `--dev` | desligado | Comandos de mestre (`/gm`) liberados para todos. Só em desenvolvimento. |
| `--xp-rate`, `--time-scale` | 1 | Evento de XP; relógio acelerado (testes). |
| `--seed` | relógio | Semente do RNG (reprodutibilidade). |
| `--lag-ms`, `--jitter-ms` | 0 | Atraso artificial por sentido (metade de cada lado), mantendo a ordem das mensagens. Para testar tolerância. |

`SIGINT`/`SIGTERM` salvam todos os personagens e fecham o banco antes de sair.

O cliente conecta com `--server=ws://host:porta` (ex.: `godot --path client -- --server=ws://127.0.0.1:7777`).

## 8.3 Métricas e saúde

Com `--metrics-port`, o servidor expõe:

- `GET /metrics` — texto do Prometheus (`cinzas_players_online`, `cinzas_tick_ms_p50|p95|p99|max`,
  `cinzas_slow_ticks_total`, `cinzas_bytes_out_per_s`, `cinzas_msgs_in_per_s`, `cinzas_cpu_pct`, `cinzas_rss_mb`, …).
- `GET /metrics.json` — o mesmo em JSON (janela dos últimos 6000 ticks = 10 min).
- `GET /health` — `200 {"ok":true}` enquanto o servidor responde.
- `POST /metrics/reset` — zera a janela (usado pelo teste de carga depois do aquecimento).

Alertas sugeridos: `tick_ms_p99 > 30` por 5 min; `slow_ticks_total` subindo; `/health` falhando 3 vezes;
`rss_mb` crescendo sem parar (vazamento).

Referência medida (100 clientes juntos no mesmo mapa, 10 Hz): tick p50 4,8 ms, p99 10,2 ms, máximo 22 ms,
nenhum acima de 50 ms; CPU do processo ~7% de um núcleo; 144 MB de memória.

## 8.4 Rede

- Snapshots a 10 Hz. Clientes atuais pedem **snapshots por diferença e interesse** no login: só o que está a
  até 70 m, cada entidade completa ao aparecer e depois só os grupos de campos que mudaram; a posição só vai
  quando a previsão por velocidade do cliente erraria mais de 10 cm. Clientes antigos recebem o completo.
- Banda medida por cliente com 100 jogadores juntos: **~9 KB/s** (snapshot completo: ~195 KB/s).
- O cliente mostra o **ping** no canto inferior direito (verde < 80 ms, âmbar < 150 ms, vermelho acima).
  Com 150 ms de atraso artificial o movimento continua sem saltos (passeio `--sceneshots`).

## 8.5 Banco de dados

- SQLite em modo WAL; cada operação que mexe em inventário, ouro, XP ou saque roda numa transação.
- **Migrações versionadas** (`server/src/store.js`, tabela `schema_version`): rodam em ordem, uma vez, numa
  transação cada. Bancos anteriores ao controle de versão são reconhecidos e atualizados.
- **Backup a quente**: `npm run backup -- --db cinzas.db --para backups --manter 14` (VACUUM INTO: foto
  consistente com o jogo rodando, confere a integridade e mantém só as 14 mais recentes). Agende de hora em hora.
- **Restaurar**: pare o servidor, troque o arquivo `.db` pela cópia (apague `-wal` e `-shm` antigos) e suba.

## 8.6 Testes e medições

| Comando (em `server/`) | O que faz | Tempo |
|---|---|---|
| `npm test` | Todas as suítes (aceitação M1–M3, snapshots, migrações, regras). | ~2 min |
| `npm run cenarios` | Cenários críticos + carga (100 clientes, 60 s) + carga com 150 ms; escreve `docs/relatorio-cenarios.md`. `-- --rapido` encurta a carga. | ~7 min |
| `npm run carga -- --clientes 100 --duracao 60 --md ../docs/relatorio-carga.md` | Só o teste de carga (sobe um servidor próprio; `--url`/`--metricas` para usar um existente; `--completo` para comparar com snapshots completos). | ~1,5 min |
| `npm run telemetria -- --db cinzas.db` | Tempo jogado por nível no banco real contra as metas (±25%). | segundos |
| `npm run simular-progressao` | Simulação acelerada da caça solo do nível 1 ao 20 para as 8 classes; escreve `docs/relatorio-progressao.md`. | ~20 min |
| `npm run validate-data` | Valida os JSON de `data/`. | segundos |

## 8.7 Solução de problemas

- **Cliente não conecta**: confira a porta e `--host`; `curl http://127.0.0.1:9100/health`.
- **Ticks lentos**: veja `cinzas_tick_ms_p99` e o número de jogadores/zonas; zonas sem jogadores continuam
  simulando monstros.
- **Banco travado** (`database is locked`): só um processo de servidor pode usar o arquivo.
- **Godot headless** imprime `Parameter "m" is null` e `SHADER ERROR: Global uniform '...' does not exist`
  (renderizador dummy, sem uniformes globais): inofensivos. O CI só falha com `SCRIPT ERROR` ou `Parse Error`.

## 8.8 Implantação (teste público)

Arquivos: `.github/workflows/ci.yml` e `release.yml`, `client/export_presets.cfg`, `.dockerignore` e a pasta
`deploy/` (`Dockerfile`, `docker-compose.yml`, `Caddyfile`, `cinzas.service`, `backup.service`, `backup.timer`).

### Integração contínua (`ci.yml`)

Roda em todo push e pull request (e à mão, em *Actions → CI → Run workflow*).

| Job | O que faz | Falha quando |
|---|---|---|
| `servidor` | Node 22 (cache do npm), `npm ci`, `npm run validate-data`, `npm test` (~3 min). | Dado inválido ou teste quebrado. |
| `cliente` | Baixa o Godot 4.3 oficial (SHA-512 conferido, guardado em cache) e roda `--headless --import` em `client/`. | A saída tem `SCRIPT ERROR` ou `Parse Error` (o Godot sai com código 0 mesmo assim; o registro fica como artefato). |
| `docker` | `docker build -f deploy/Dockerfile .` (sem publicar) e um teste rápido do contêiner: saúde, usuário sem privilégios, `hello` no WebSocket, backup e parada graciosa. | A imagem não constrói ou o contêiner não passa no teste. |

### Releases (`release.yml`)

Publicar uma versão: `git tag v0.4.0 && git push origin v0.4.0`. Tags com hífen (`v0.4.0-teste.1`) viram
*pre-release*. O fluxo:

1. **testes**: os mesmos do CI; se falharem, nada é publicado.
2. **exportar** (Ubuntu 24.04): baixa o Godot 4.3 e o `.tpz` de modelos de exportação (1 GB, SHA-512 conferido),
   extrai só os de desktop (~240 MB, em cache), grava a versão da tag (`X.Y.Z`) em `config/version` (vai para o
   `Info.plist` e para o recurso de versão do `.exe`), importa o projeto e exporta os presets `Linux`,
   `Windows Desktop` e `macOS`. Assina o `.exe` se houver os segredos do Windows.
3. **macos** (runner macOS, só com os 5 segredos da Apple): assina de novo o `.app` com Developer ID, runtime
   endurecido e carimbo de tempo, notariza, grampeia o ticket e confere com o Gatekeeper (`spctl`).
4. **publicar**: cria a release da tag com `CinzasDoMeridiano-<versão>-linux-x86_64.tar.gz`,
   `…-windows-x86_64.zip`, `…-macos-universal.zip`, `SHA256SUMS.txt` e notas que dizem o que está assinado.
5. **imagem**: publica `ghcr.io/<dono>/cinzas-servidor:<versão>` (e `<maior>.<menor>`; `latest` só em versão
   final). O pacote nasce privado no ghcr.io: torne-o público nas configurações do pacote ou faça `docker login ghcr.io`.

Disparado à mão (*Run workflow*), o release só exporta e guarda os pacotes como artefatos da execução. O cache do
GitHub é por ref, mas as tags enxergam o do ramo padrão: uma execução manual no `main` deixa o Godot e os modelos
prontos para as próximas tags.

**Segredos de assinatura** (*Settings → Secrets and variables → Actions*, ou `gh secret set NOME < arquivo`):

| Segredo | Conteúdo |
|---|---|
| `WINDOWS_CERT_PFX_BASE64` | Certificado de assinatura de código (`.pfx`) em base64: `base64 -w0 cert.pfx` |
| `WINDOWS_CERT_PASSWORD` | Senha do `.pfx` |
| `APPLE_CERT_P12_BASE64` | Certificado **Developer ID Application** (com a chave) exportado do Keychain como `.p12`, em base64 |
| `APPLE_CERT_PASSWORD` | Senha do `.p12` |
| `APPLE_ID` | Apple ID da conta do Apple Developer Program |
| `APPLE_TEAM_ID` | Team ID (10 caracteres, em developer.apple.com → Membership) |
| `APPLE_APP_PASSWORD` | Senha de app do Apple ID (account.apple.com → Iniciar sessão e segurança → Senhas de app) |

- **Sem os segredos** as versões saem assim mesmo, sem assinatura, com aviso no resumo da execução e nas notas da
  release: o Windows mostra o SmartScreen (*Mais informações → Executar assim mesmo*); no macOS o app tem só a
  assinatura ad-hoc do Godot (necessária no Apple Silicon) e o Gatekeeper pede *botão direito → Abrir* ou
  `xattr -dr com.apple.quarantine "Cinzas do Meridiano.app"`. Segredos incompletos contam como ausentes (com aviso).
- **Com os segredos**, se a assinatura ou a notarização falhar a release **não** é publicada (melhor do que
  publicar sem assinatura por engano); rode o job de novo.
- **Windows**: `osslsigncode` no runner Linux, SHA-256 e carimbo de tempo RFC 3161 (DigiCert; se falhar, Sectigo e
  GlobalSign: o osslsigncode 2.8 do Ubuntu cai quando o servidor de carimbo responde com erro). Certificados de
  assinatura de código emitidos desde junho de 2023 precisam ficar em token/HSM, então um `.pfx` só existe para
  certificados antigos ou de teste; com assinatura em nuvem (Azure Trusted Signing, SSL.com eSigner, DigiCert
  KeyLocker) troque esse passo pela ferramenta do provedor. O nome e a versão nas propriedades do `.exe` vêm do
  `rcedit`, que o Godot 4.3 roda pelo Wine; o passo é opcional: se falhar, o `.exe` fica com os dados do Godot e
  o job avisa.
- **macOS**: notarizar com Apple ID e senha de app exige o `xcrun notarytool` do Xcode (o `rcodesign` só notariza
  com chave de API do App Store Connect), por isso a exportação é no Linux e a assinatura num runner macOS. O app
  não precisa de *entitlements* (só GDScript, sem JIT nem bibliotecas externas).

**Presets** (`client/export_presets.cfg`, versionado): formato do Godot 4.3, com os campos de assinatura vazios.
No 4.3 as opções secretas ficam em `client/.godot/export_credentials.cfg` (fora do git) e o CI assina depois da
exportação: nunca ponha certificados ou senhas no preset. Linux e Windows saem como um executável só (PCK
embutido); no macOS o `.pck` fica dentro do `.app` (`Contents/Resources`), como a assinatura exige. O preset macOS
é universal (Intel e Apple Silicon), e o Godot recusa exportar assim sem `import_etc2_astc=true` no `project.godot`
(já ligado). Exportar localmente (precisa dos modelos do 4.3: *Editor → Gerenciar Modelos de Exportação*, ou o
`.tpz` extraído em `~/.local/share/godot/export_templates/4.3.stable/`):

```bash
cd client
godot --headless --path . --import
mkdir -p build/linux && touch build/.gdignore
godot --headless --path . --export-release "Linux" build/linux/CinzasDoMeridiano.x86_64
```

O executável exportado passa no `--autotest` contra um servidor local
(`./build/linux/CinzasDoMeridiano.x86_64 --headless -- --autotest --server=ws://127.0.0.1:7777`).

### Docker e Compose

A imagem (`deploy/Dockerfile`, base `node:22-bookworm-slim`) roda como `cinzas` (uid 10001), com o código só para
leitura e o banco no volume `/data`; expõe 7777 (jogo) e 9100 (métricas e `/health`, usado pelo `HEALTHCHECK`).
O `docker-compose.yml` sobe o servidor e o proxy TLS:

```bash
cd deploy
echo "DOMINIO=jogo.exemplo.com.br" > .env     # fora do git
docker compose up -d --build
docker compose ps                             # servidor (healthy) e proxy
curl http://127.0.0.1:9100/health             # métricas e saúde: só nesta máquina
docker compose logs -f servidor
```

- **Atualizar**: baixe a versão nova do repositório e rode `docker compose up -d --build`. Parar ou recriar o
  contêiner manda SIGTERM e dá 45 s (`stop_grace_period`) para o servidor salvar todos os personagens.
- **Imagem publicada**: troque `build:` por `image: ghcr.io/<dono>/cinzas-servidor:<versão>` no serviço `servidor`.
- **Backup**: `docker compose exec servidor npm run backup -- --db /data/cinzas.db --para /data/backups`.
  Para agendar no cron do host, entre na pasta `deploy/` do repositório (aqui em `/opt/cinzas`) e use `-T`
  (sem terminal):
  `0 * * * * cd /opt/cinzas/deploy && docker compose exec -T servidor npm run --silent backup -- --db /data/cinzas.db --para /data/backups`.
  Copie para fora da máquina: `docker compose cp servidor:/data/backups ./backups`.
- **Restaurar**: troque o banco **dentro do volume e como o usuário da imagem** (`docker compose run` usa o
  usuário `cinzas`). Não use `docker compose cp` para pôr o banco no lugar: o arquivo entraria como root e o
  servidor não conseguiria gravar nele.

  ```bash
  docker compose stop servidor
  docker compose run --rm --no-deps servidor ls /data/backups        # escolha a cópia
  docker compose run --rm --no-deps servidor sh -c 'cp /data/backups/cinzas-AAAA-MM-DDTHH-MM-SS.db /data/cinzas.db && rm -f /data/cinzas.db-wal /data/cinzas.db-shm'
  docker compose start servidor
  ```

  Uma cópia que está fora da máquina entra no volume assim (depois use `/data/backups/restaurar.db` no `cp` acima):
  `docker compose run --rm -T --no-deps servidor sh -c 'cat > /data/backups/restaurar.db' < cinzas-AAAA-MM-DDTHH-MM-SS.db`.
- **Serviço de contas** (`contas`): mesma imagem, mesmo volume e mesmo banco; o Caddy repassa
  `https://DOMINIO/contas/*` para ele (o cliente usa essa base quando o servidor é `wss://`). O servidor de zona sobe com
  `CINZAS_AUTH=token`: cadastro e senha só pelo serviço de contas. `deploy/.env` precisa de `CINZAS_TOKEN_SECRET`
  (`openssl rand -hex 32`; o compose não sobe sem ele) e, para enviar e-mail de verdade, `CINZAS_EMAIL=smtp` e os
  `CINZAS_SMTP_*` (modelo no cabeçalho do `docker-compose.yml`). Sem SMTP, os e-mails ficam em `/data/emails`.

### TLS pelo proxy

- O Caddy (`deploy/Caddyfile`) obtém e renova sozinho o certificado do domínio em `DOMINIO` (Let's Encrypt):
  o DNS precisa apontar para a máquina e as portas 80 e 443 precisam estar abertas. O volume `caddy_dados` guarda
  os certificados; não o apague (há limite de emissões).
- Os jogadores conectam em `wss://jogo.exemplo.com.br` (campo **Servidor** da tela de entrada, ou
  `CinzasDoMeridiano.x86_64 -- --server=wss://jogo.exemplo.com.br`). O Godot confere o certificado com a lista de
  autoridades que vem com ele. O campo ainda começa com `ws://127.0.0.1:7777`.
- O proxy só conhece a porta 7777, que só fala WebSocket (qualquer outra requisição recebe 426): métricas e saúde
  não passam por ele. Recarregar o Caddy não derruba quem está jogando (`stream_close_delay`).
- Sem Docker, use o mesmo Caddyfile num Caddy instalado na máquina, trocando `servidor:7777` por `127.0.0.1:7777`
  e `contas:7780` por `127.0.0.1:7780` (os dois serviços escutam só em `127.0.0.1`).
- **Servidor padrão do cliente**: com a variável do repositório `SERVIDOR_PADRAO` (*Settings → Secrets and variables →
  Actions → Variables*, ex.: `wss://jogo.exemplo.com.br`), a release grava `cinzas/servidor_padrao` no projeto e o campo
  **Servidor** já vem preenchido nos pacotes publicados.

### systemd (sem Docker)

```bash
sudo useradd --system --home-dir /var/lib/cinzas --shell /usr/sbin/nologin cinzas
# repositório (ou só server/ e data/) em /opt/cinzas
cd /opt/cinzas/server && sudo npm ci --omit=dev
sudo install -d -m 0750 /etc/cinzas
sudo install -m 0600 /opt/cinzas/deploy/cinzas.env.exemplo /etc/cinzas/cinzas.env   # edite: segredo, SMTP
sudo cp /opt/cinzas/deploy/{cinzas.service,cinzas-contas.service,backup.service,backup.timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now cinzas.service cinzas-contas.service backup.timer
systemctl status cinzas; journalctl -u cinzas -f; systemctl list-timers backup.timer
```

- `cinzas.service` usa as mesmas opções da imagem, mas o jogo (`--host 127.0.0.1`) e as métricas escutam só em
  `127.0.0.1` (no contêiner o `0.0.0.0` é o da rede interna dele). Assim a porta 7777, sem TLS e com conta e senha
  passando no WebSocket, não fica aberta na internet: os jogadores entram pelo Caddy da máquina (`wss://`). Só para
  um teste em rede local sem TLS troque por `--host 0.0.0.0`. O `node` esperado é `/usr/bin/node` (pacotes do
  NodeSource); ajuste o `ExecStart` se `command -v node` disser outro caminho.
- `Restart=always`; parar manda SIGTERM com 45 s de prazo (`TimeoutStopSec`).
- `/etc/cinzas/cinzas.env` (só do root, modelo em `deploy/cinzas.env.exemplo`) leva `CINZAS_AUTH=token`, o
  `CINZAS_TOKEN_SECRET` e o SMTP; `cinzas.service` e `cinzas-contas.service` leem o mesmo arquivo.
- Endurecimento: `ProtectSystem=strict` com só `/var/lib/cinzas` gravável, sem *capabilities*, filtro de chamadas
  de sistema, `/home` e dispositivos inacessíveis (`systemd-analyze security cinzas`: 1,5, "OK"). Sem
  `MemoryDenyWriteExecute`, que quebra o JIT do V8.
- `backup.timer` roda `npm run backup -- --db /var/lib/cinzas/cinzas.db --para /var/lib/cinzas/backups` de hora em
  hora (mantém as 14 mais recentes; `--manter N` para mais). Leve cópias para fora da máquina (rsync, rclone): um
  disco perdido leva o banco e os backups juntos.
- **Restaurar** (como o usuário `cinzas`, para o arquivo continuar dele):
  `sudo systemctl stop cinzas`, depois
  `sudo -u cinzas cp /var/lib/cinzas/backups/cinzas-AAAA-MM-DDTHH-MM-SS.db /var/lib/cinzas/cinzas.db`,
  `sudo -u cinzas rm -f /var/lib/cinzas/cinzas.db-wal /var/lib/cinzas/cinzas.db-shm` e `sudo systemctl start cinzas`.

### Antes de abrir o teste

- DNS e portas 80/443 prontos; `DOMINIO`, `CINZAS_TOKEN_SECRET` e SMTP em `deploy/.env` (ou `/etc/cinzas/cinzas.env`);
  servidor **sem** `--dev`; uma conta com papel `admin` para a equipe (`npm run conta -- --conta nome --papel admin`).
- Responsável e contato preenchidos em `docs/TERMOS.md` e `docs/PRIVACIDADE.md` (e revisados por assessoria jurídica).
- Criar conta pelo cliente publicado: o e-mail com o código chega, a confirmação funciona e o login por token entra.
- `docker compose ps` saudável; de outra máquina, `curl http://IP:9100/health` **não** pode responder (nem
  `curl http://IP:7777/`, que só o proxy alcança).
- Backup agendado e uma restauração testada.
- Release publicada; se saiu sem assinatura, avise os jogadores sobre o SmartScreen e o Gatekeeper.

## 8.9 Contas, segurança e privacidade (teste público)

**Serviço de contas** (processo separado, mesmo banco): `npm run contas -- --port 7780 --db cinzas.db
--token-secret "$CINZAS_TOKEN_SECRET" --email smtp --smtp-host smtp.exemplo.com --smtp-user ... --smtp-pass ...
--smtp-from "Cinzas <nao-responda@exemplo.com>"`. Rotas: criar conta (e-mail com código de 6 dígitos),
confirmar, reenviar código, sessão (token de 5 min, uso único), esqueci/redefinir senha, exportar dados
(portabilidade) e excluir conta. `--email arquivo --email-dir emails` grava os e-mails em vez de enviar.

**Servidor de zona no teste público**:

```bash
npm start -- --auth token --token-secret "$CINZAS_TOKEN_SECRET" --tls-cert cert.pem --tls-key key.pem \
  --max-conn-per-ip 8 --trust-proxy --log-format json --shutdown-grace 30 --audit-days 90
```

| Opção | Efeito |
|---|---|
| `--auth token\|password\|both` | `token`: só entra com token do serviço de contas (cadastro e senha direto no servidor de zona ficam desligados). `both` (padrão) aceita os dois. |
| `--token-secret` | Segredo compartilhado com o serviço de contas (HMAC-SHA256). |
| `--tls-cert`, `--tls-key` | `wss://` direto. Alternativa: terminar o TLS no proxy (veja a seção de implantação). |
| `--rate-limit 20 --rate-burst 40` | Comandos por segundo por conexão (balde de fichas). Acima disso o pedido volta com `rate_limited`; quem insiste por 10 s é desconectado (auditado). Chat: 6 mensagens a cada 5 s. |
| `--max-conn-per-ip` | Conexões simultâneas por endereço (0 = sem limite). Com `--trust-proxy` o endereço vem de `X-Forwarded-For`. |
| `--log-format json` | Uma linha JSON por evento (para coletores de log). |
| `--shutdown-grace 30` | No `SIGTERM`: avisa os jogadores ("o servidor vai reiniciar em 30 s"), recusa novos logins, salva e sai. `Ctrl+C` sai na hora (salvando). |
| `--audit-days 90` | Retenção da auditoria; códigos vencidos também são apagados (de hora em hora). |

**Auditoria** (`audit_log`): entradas e falhas (com IP), comandos de mestre, saque, compras, refino,
recompensas de missão, criação/confirmação/exclusão de conta, troca de senha, expulsões. Consulta:
`npm run conta -- --db cinzas.db --auditoria --tipo gm --n 50`.

**Mestres**: comandos `/gm` só para contas com papel `gm` ou `admin` (ou com `--dev`, em desenvolvimento):
`npm run conta -- --db cinzas.db --conta nome --papel gm`. Todo comando de mestre fica na auditoria.

**Moderação** (no chat do jogo, contas da equipe):

| Comando | Efeito |
|---|---|
| `/gm expulsar Nome motivo` | Desconecta o jogador. |
| `/gm silenciar Nome minutos motivo` · `/gm liberar Nome` | Silencia a conta (todos os canais) / retira. |
| `/gm suspender Nome horas motivo` · `/gm desbloquear Nome` | Suspende a conta (derruba e recusa o login, também no serviço de contas). Mestre: até 72 h; acima disso ou `perm` (sem data), só `admin`. Motivo obrigatório. |
| `/gm onde Nome` · `/gm anunciar texto` | Mapa e posição do jogador / aviso para todos os conectados. |

Jogadores denunciam com `/denunciar Nome motivo` (5 por hora); a denúncia grava as últimas falas do denunciado.
Pela ferramenta, fora do jogo: `npm run conta -- --db cinzas.db --personagem Nome --suspender --horas 24 --motivo "..."`
(ou `--permanente`, `--retirar-suspensao`, `--silenciar --minutos 60`, `--retirar-silencio`) e
`npm run conta -- --db cinzas.db --denuncias --n 50`. O servidor confere o banco a cada minuto: uma suspensão feita pela
ferramenta derruba quem estiver on-line em até 60 s.

**Anti-trapaça (o que o servidor já impede)**: o cliente só pede destinos, alvos e habilidades — posição, velocidade,
alcance, recarga, mana, chance, dano e saque são calculados no servidor; teleporte e "speed hack" não têm efeito. Itens,
ouro e XP só mudam em transações (troca entre jogadores inclusive); pedidos repetidos com o mesmo `rid` não duplicam.
Inundação de comandos e de chat é limitada e auditada.

**Versões**: o `hello` traz `protocol` (3), `version` do servidor e `dataVersion` (hash dos dados); o cliente
recusa servidor de protocolo diferente com uma mensagem clara.

**Termos de uso**: [TERMOS.md](TERMOS.md) (regras de convivência e de jogo limpo que a moderação aplica). O cadastro
pelo serviço de contas exige `aceite: true` (13 anos ou mais e aceite dos termos e da política) e grava a versão aceita
na auditoria; `GET /termos` e `GET /privacidade` servem os textos (o cliente abre no navegador; `--docs-dir` aponta a
pasta, padrão `docs/` do repositório).

**Privacidade**: política em [PRIVACIDADE.md](PRIVACIDADE.md). Exclusão de conta pelo jogo (tela de
personagens) ou pelo serviço de contas apaga e-mail, senha, itens e missões na hora e anonimiza os nomes.

