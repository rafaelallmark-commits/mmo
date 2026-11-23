# 8. Execução e operação

Como subir, observar, salvar e testar o servidor de CINZAS DO MERIDIANO. Os números de referência vêm
do Marco 4 ([relatorio-carga.md](relatorio-carga.md), [relatorio-cenarios.md](relatorio-cenarios.md)).

## 8.1 Requisitos

- **Servidor**: Node.js ≥ 22.13. Em desenvolvimento, nada mais (SQLite embutido, `node:sqlite`); em produção,
  **PostgreSQL** central (testado no 16; §8.11). Dependências: `ws` e `pg` (só carregado com PostgreSQL).
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
| `--db` (ou `CINZAS_DB`) | cinzas.db | Arquivo SQLite (desenvolvimento, modo WAL) ou `postgres://...` (produção, §8.11). Migrações rodam sozinhas ao subir. |
| `--metrics-port` (ou `CINZAS_METRICS_PORT`) | desligado | HTTP de métricas e saúde. |
| `--metrics-host` | 127.0.0.1 | Interface do HTTP de métricas (deixe local ou atrás do proxy). |
| `--dev` | desligado | Comandos de mestre (`/gm`) liberados para todos. Só em desenvolvimento. |
| `--xp-rate`, `--time-scale` | 1 | Evento de XP; relógio acelerado (testes). |
| `--seed` | relógio | Semente do RNG (reprodutibilidade). |
| `--lag-ms`, `--jitter-ms` | 0 | Atraso artificial por sentido (metade de cada lado), mantendo a ordem das mensagens. Para testar tolerância. |

`SIGINT`/`SIGTERM` salvam todos os personagens e fecham o banco antes de sair.

O cliente conecta com `--server=ws://host:porta` (ex.: `godot --path client -- --server=ws://127.0.0.1:7777`).

## 8.3 Métricas, saúde e alertas

Com `--metrics-port`, o servidor expõe, **só para endereços internos** (loopback e redes privadas, como a rede do
Docker Compose; pedido de outro endereço, ou repassado por um proxy com `X-Forwarded-For`, recebe 403):

- `GET /metrics` — texto do Prometheus (tabela abaixo).
- `GET /metrics.json` — o mesmo em JSON, com os contadores e as médias por segundo da janela atual (o teste de carga
  usa as médias).
- `GET /health` — `200 {"ok":true,...}` enquanto o laço do jogo anda; **503** (`"erro": "laço do jogo parado: ..."`)
  quando o último tick foi há mais de 5 s. O `HEALTHCHECK` da imagem usa esta rota: com o laço parado o Docker marca o
  contêiner como *unhealthy* (com o processo inteiro travado nem o `/health` responde, e o resultado é o mesmo). O
  Compose não reinicia sozinho um contêiner *unhealthy*: o alerta `LacoDoJogoParado` avisa e
  `docker compose restart servidor` resolve.
- `POST /metrics/reset` — recomeça a janela do JSON e dos percentis (teste de carga, depois do aquecimento); os
  contadores não mudam.

Tudo o que se acumula é **contador** (`_total`, desde a subida do processo; volta a zero quando ele reinicia, como o
Prometheus espera): taxa e porcentagem saem no Prometheus com `rate()` e `increase()`. Antes eram médias desde a subida
(`cinzas_cpu_pct`, `cinzas_*_per_s`, `cinzas_db_wait_ms_per_s`), que viravam linha reta depois de horas no ar e
escondiam o pico de agora (D147). Os percentis do tick continuam na janela dos últimos 6000 ticks (10 min).

| Métrica do servidor de zona (porta 9100) | Tipo | O que é | Como ler |
|---|---|---|---|
| `cinzas_players_online` · `cinzas_sessions` · `cinzas_zones` | medidor | Personagens no mundo, conexões abertas, zonas e instâncias ativas | valor |
| `cinzas_max_players` | medidor | Teto de jogadores (`--max-players`; 0 = sem limite) | valor |
| `cinzas_server_full_total` | contador | Entradas recusadas com o servidor cheio | `increase(…[1h])` |
| `cinzas_tick_ms_p50` · `_p95` · `_p99` · `_max` · `_mean` | medidor | Duração do tick nos últimos 6000 ticks (10 min), em ms | valor |
| `cinzas_last_tick_age_seconds` | medidor | Segundos desde o fim do último tick (acima de 5: laço parado, `/health` 503) | valor |
| `cinzas_ticks_total` · `cinzas_slow_ticks_total` | contador | Ticks simulados; ticks acima de 50 ms | `increase(cinzas_slow_ticks_total[10m])` |
| `cinzas_cpu_seconds_total` | contador | Segundos de CPU do processo (usuário + sistema) | `rate(…[5m])` = fração de um núcleo (0,07 = 7%) |
| `cinzas_msgs_in_total` · `cinzas_msgs_out_total` | contador | Mensagens recebidas dos clientes e enviadas a eles | `rate(…[5m])` = mensagens/s |
| `cinzas_bytes_in_total` · `cinzas_bytes_out_total` · `cinzas_snapshot_bytes_out_total` | contador | Bytes recebidos, enviados e, dos enviados, os de snapshots | `rate(…[5m])` = bytes/s |
| `cinzas_rss_mb` · `cinzas_heap_mb` · `cinzas_uptime_s` | medidor | Memória residente, heap do JavaScript, tempo no ar | valor |
| `cinzas_db_calls_total` · `cinzas_db_wait_seconds_total` | contador | Só PostgreSQL: chamadas pela ponte síncrona; tempo com o laço parado esperando o banco | `rate(cinzas_db_wait_seconds_total[5m])` = fração do tempo parada |
| `cinzas_db_call_ms_p50` · `_p99` · `_max` | medidor | Só PostgreSQL: duração de uma chamada, nas últimas 8192 | valor |

O **serviço de contas** tem as próprias métricas, numa porta à parte que o proxy não conhece
(`npm run contas -- --metrics-port 9101`, ou `CINZAS_CONTAS_METRICS_PORT`; escuta em `--metrics-host`, padrão
`127.0.0.1`) e com a mesma regra de endereço interno: no Compose, `contas:9101` na rede interna e `127.0.0.1:9101`
na máquina. A porta do serviço (a que o Caddy repassa) continua sem `/metrics`.

| Métrica do serviço de contas (porta 9101) | Tipo | O que é |
|---|---|---|
| `cinzas_accounts_requests_total{route,status}` | contador | Pedidos por rota e código de resposta HTTP (caminho desconhecido conta como `route="outra"`) |
| `cinzas_accounts_signups_total` | contador | Contas criadas (cadastro aceito) |
| `cinzas_accounts_emails_sent_total` · `cinzas_accounts_email_failures_total` | contador | E-mails entregues ao servidor de envio; envios que falharam (servidor fora, recusa, certificado) |
| `cinzas_accounts_cpu_seconds_total` · `cinzas_accounts_rss_mb` · `cinzas_accounts_uptime_s` | contador, medidores | CPU, memória e tempo no ar do processo |

Os **backups** (§8.8) gravam a própria métrica num arquivo que o node-exporter lê (coletor *textfile*):

| Métrica do backup (`db="sqlite"` ou `db="postgres"`) | O que é |
|---|---|
| `cinzas_backup_last_success_timestamp_seconds` · `cinzas_backup_last_failure_timestamp_seconds` | Hora (Unix) do último backup conferido e da última falha |
| `cinzas_backup_last_size_bytes` · `cinzas_backup_last_duration_seconds` | Tamanho e duração do último backup conferido |
| `cinzas_backup_copies` · `cinzas_backup_oldest_copy_timestamp_seconds` | Cópias guardadas depois da rotação e a hora da mais velha |
| `cinzas_offsite_copy_last_success_timestamp_seconds` · `…_last_failure_timestamp_seconds` | Cópia para fora da máquina (perfil `copia-externa`) |

**Painel e alertas**: `docker compose --profile monitoramento up -d` (em `deploy/`) sobe o Prometheus (coleta a cada
15 s a zona, as contas e o node-exporter; retenção de 15 dias; alertas de `deploy/monitoramento/alertas.yml`), o
**Alertmanager**, o **node-exporter** (disco, memória e CPU da máquina, montada só para leitura, e a métrica dos
backups) e o Grafana com o painel "Cinzas do Meridiano — servidor de zona" (jogadores e teto, duração do tick com as
linhas de 30 e 50 ms, ticks lentos, banda, mensagens, CPU, memória, espera pelo banco, serviço de contas, idade do
último backup e disco livre) em `http://127.0.0.1:3000`. Tudo só nesta máquina; de fora,
`ssh -L 3000:127.0.0.1:3000 -L 9090:127.0.0.1:9090 -L 9093:127.0.0.1:9093 servidor` (Grafana, Prometheus, Alertmanager).
Senha do admin do Grafana em `GRAFANA_SENHA` no `deploy/.env`.

| Alerta | Dispara quando | Gravidade |
|---|---|---|
| `ServidorForaDoAr` | a zona não responde às métricas por 1 min | crítica |
| `LacoDoJogoParado` | `cinzas_last_tick_age_seconds > 5` por 30 s (contêiner *unhealthy*) | crítica |
| `TickLento` · `TicksAcimaDe50ms` | p99 do tick acima de 30 ms por 5 min · mais de 5 ticks acima de 50 ms em 10 min | aviso |
| `CPUAlta` | `rate(cinzas_cpu_seconds_total[5m]) > 0.8` por 10 min (o laço do jogo usa um núcleo só) | aviso |
| `MemoriaCrescendo` | memória acima de 600 MB e subindo sem parar por 30 min | aviso |
| `ServidorCheio` | alguma entrada recusada pelo teto de jogadores nos últimos 15 min | aviso |
| `BancoLento` | só PostgreSQL: mais de 50 ms por segundo esperando o banco, ou chamada p99 acima de 5 ms, por 5 min | aviso |
| `ServicoDeContasForaDoAr` | o serviço de contas não responde às métricas por 2 min | crítica |
| `FalhaNoEnvioDeEmail` | algum envio de e-mail falhou nos últimos 15 min (códigos não chegam) | aviso |
| `DiscoQuaseCheio` | menos de 10% livre num disco da máquina por 5 min | crítica |
| `BackupAtrasado` | o último backup conferido tem mais de 2 h | crítica |
| `BackupFalhou` · `SemMetricaDeBackup` | a última tentativa falhou · nenhum serviço de backup gravou a métrica há 30 min | aviso · crítica |
| `CopiaMaisVelhaQue14Dias` | sobrou cópia com mais de 14 dias (a política de privacidade promete menos) | aviso |
| `CopiaExternaAtrasada` | a cópia para fora da máquina não termina bem há 3 h (só com o perfil `copia-externa`) | aviso |
| `MonitorDaMaquinaForaDoAr` · `MetricaDeBackupIlegivel` | o node-exporter não responde por 5 min · não consegue ler um arquivo `.prom` do volume `metricas` (sem isso, nada de alerta de disco e de backup) | aviso |

### Alertas que chegam a alguém

O Alertmanager agrupa os alertas, manda um aviso quando disparam e outro quando resolvem, e lembra os que continuam
ativos (a cada 1 h os críticos, a cada 4 h os avisos). O canal sai das variáveis `ALERTA_*` no `deploy/.env`, que fica
fora do git: `deploy/monitoramento/alertmanager.yml` é só um modelo com os três receptores prontos, e cada um entra
quando as variáveis dele estão preenchidas (D147). Sem nenhuma, o Alertmanager sobe igual e os alertas ficam só nas
páginas. Ligue um ou mais canais:

- **E-mail (SMTP)** — pode ser o mesmo provedor do e-mail do jogo (§8.9):
  ```
  ALERTA_EMAIL_PARA=equipe@exemplo.com.br                  # um ou mais, separados por vírgula
  ALERTA_SMTP_SERVIDOR=smtp.exemplo.com.br:587             # host:porta (587 = STARTTLS; 465 = TLS direto)
  ALERTA_SMTP_DE=Alertas Cinzas <alertas@exemplo.com.br>
  ALERTA_SMTP_USUARIO=...                                  # se o servidor pedir login
  ALERTA_SMTP_SENHA=...
  ```
  A porta decide o TLS: na 587 o Alertmanager exige STARTTLS antes do login; na 465 a conexão já nasce cifrada (com o
  certificado conferido) e a entrada desliga o `require_tls`, que nessa porta faria o Alertmanager recusar todo envio
  (o servidor não anuncia STARTTLS numa conexão que já é TLS).
- **Telegram** — no Telegram, fale com o **@BotFather**, mande `/newbot` e guarde o token. Ponha o robô no grupo da
  equipe (ou mande qualquer mensagem para ele), abra `https://api.telegram.org/bot<TOKEN>/getUpdates` no navegador e
  copie o `chat.id` (o de grupo começa com `-`):
  ```
  ALERTA_TELEGRAM_TOKEN=123456789:AA...
  ALERTA_TELEGRAM_CHAT=-1001234567890
  ```
- **Discord** — no canal da equipe: *Editar canal → Integrações → Webhooks → Novo webhook → Copiar URL do webhook*:
  ```
  ALERTA_DISCORD_WEBHOOK=https://discord.com/api/webhooks/...
  ```

Depois, `docker compose --profile monitoramento up -d alertmanager` (recria o serviço com as variáveis novas) e
`docker compose logs alertmanager`: a configuração montada passa pelo `amtool check-config` antes de subir, e uma
variável que faltou aparece no registro (ex.: `a variável ALERTA_TELEGRAM_CHAT está vazia`). Valor com `$` no `.env`
(senha, token) vai entre aspas simples, senão o Compose tenta trocá-lo por uma variável. Para conferir o canal, mande
um alerta de teste (chega em ~30 s; o "resolvido" vem uns 5 min depois):

```bash
docker compose exec alertmanager amtool --alertmanager.url=http://127.0.0.1:9093 \
  alert add Teste gravidade=aviso --annotation=resumo="Teste do canal de alertas"
```

**Monitor externo de disponibilidade** (recomendado antes de abrir o teste): o Prometheus e o Alertmanager rodam na
mesma máquina do jogo; se ela, a rede ou o Docker caírem, ninguém é avisado por eles. Cadastre um monitor externo —
um serviço como UptimeRobot, Better Stack ou Healthchecks.io, ou um Uptime Kuma em **outra** máquina — que consulte
`https://DOMINIO/contas/saude` a cada 1 a 5 minutos, espere `200` com `{"ok":true}` e avise por e-mail ou Telegram.
O mesmo teste pega DNS errado, certificado vencido e proxy fora do ar. Um segundo monitor em `https://DOMINIO/`
aceitando o código `426` (o jogo só fala WebSocket) confere o caminho até a zona. A escolha do serviço e a conta
ficam com o dono do projeto.

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

Esta seção é o SQLite (desenvolvimento). Em produção o banco é o PostgreSQL central: §8.11.

- SQLite em modo WAL; cada operação que mexe em inventário, ouro, XP ou saque roda numa transação.
- **Migrações versionadas** (`server/src/store.js`, tabela `schema_version`): rodam em ordem, uma vez, numa
  transação cada. Bancos anteriores ao controle de versão são reconhecidos e atualizados.
- **Backup a quente**: `npm run backup -- --db cinzas.db --para backups --manter 14 --diarias` (VACUUM INTO: foto
  consistente com o jogo rodando; confere a integridade; ficam as 14 mais recentes e a mais nova de cada dia, nenhuma
  com mais de 14 dias — `--dias`, padrão 14, é o prazo da política de privacidade; D148). Agende de hora em hora; no
  Docker Compose o serviço `backup` já faz isso (§8.8). `--metrica arquivo.prom` grava a hora do último backup para o
  node-exporter; `--a-cada 3600` deixa o processo rodando e copiando de hora em hora.
- **Restaurar**: pare o servidor, troque o arquivo `.db` pela cópia (apague `-wal` e `-shm` antigos) e suba. O ensaio
  completo, para fazer antes de abrir o teste e de tempos em tempos, está em §8.8 ("Ensaio de restauração").

## 8.6 Testes e medições

| Comando (em `server/`) | O que faz | Tempo |
|---|---|---|
| `npm test` | Todas as suítes (aceitação M1–M3, snapshots, migrações, regras) no SQLite. | ~3 min |
| `npm run test:pg` | A mesma suíte no PostgreSQL: sobe um servidor temporário, um esquema por banco de teste, apaga no fim (§8.11). | ~3,5 min |
| `npm run cenarios` | Cenários críticos + carga (100 clientes, 60 s) + carga com 150 ms; escreve `docs/relatorio-cenarios.md`. `-- --rapido` encurta a carga. | ~7 min |
| `npm run carga -- --clientes 100 --duracao 60 --md ../docs/relatorio-carga.md` | Só o teste de carga (sobe um servidor próprio; `--url`/`--metricas` para usar um existente; `--completo` para comparar com snapshots completos). | ~1,5 min |
| `npm run telemetria -- --db cinzas.db` | Tempo jogado por nível no banco real contra as metas (±25%). | segundos |
| `npm run simular-progressao` | Simulação acelerada da caça solo do nível 1 ao teto (25) para as 8 classes; escreve `docs/relatorio-progressao.md` (a versão no git é essa rodada completa, do 1 ao 25, com 8 sementes fixas). | ~13 min |
| `npm run validate-data` | Valida os JSON de `data/`. | segundos |
| `npm run medir-caminhos` | Busca de caminho em todos os mapas: casos de canto a canto nas Galerias, na Cava e nos Canais e 3.000 pedidos sorteados (`--nav` mede outra implementação, `--comparar` compara os caminhos). Antes/depois em [relatorio-carga.md](relatorio-carga.md#busca-de-caminho-antes-e-depois-2026-11-21): pior pedido de 52–77 ms para ~1 ms. | ~10 s |

## 8.7 Solução de problemas

- **Cliente não conecta**: confira a porta e `--host`; `curl http://127.0.0.1:9100/health`.
- **"Servidor cheio (N jogadores)"**: o teto de `--max-players` (`CINZAS_MAX_PLAYERS`; 200 no Compose) foi atingido.
  Contas `gm` e `admin` entram assim mesmo; quem já está no mundo reconecta. Para subir o teto, mude a variável no
  `deploy/.env` e recrie o serviço (`docker compose up -d servidor`), olhando antes `cinzas_tick_ms_p99` e
  `rate(cinzas_cpu_seconds_total[5m])` no painel.
- **Contêiner `unhealthy`** (`docker compose ps`): `curl http://127.0.0.1:9100/health` diz por quê (`laço do jogo
  parado: último tick há N s`); sem resposta, o processo inteiro travou. `docker compose logs servidor` e
  `docker compose restart servidor` (os personagens voltam do último salvamento, a cada 10 s).
- **Ticks lentos**: veja `cinzas_tick_ms_p99` e o número de jogadores/zonas; zonas sem jogadores continuam
  simulando monstros.
- **Alertas não chegam**: `docker compose logs alertmanager` (variável faltando ou recusada pelo `amtool`), a página
  `http://127.0.0.1:9093` (o alerta chegou ao Alertmanager?) e `http://127.0.0.1:9090/alerts` (disparou no Prometheus?);
  mande um alerta de teste (§8.3).
- **Banco travado** (`database is locked`): o arquivo aceita vários processos do jogo ao mesmo tempo (serviço de
  contas e, em várias zonas, cada zona — §8.10), mas não um segundo servidor de um processo só nem uma cópia aberta
  por outra ferramenta que segure a trava por mais de 3 s.
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
| `servidor-postgres` | A mesma suíte no PostgreSQL 17: contêiner de serviço do job (`postgres:17`, só em localhost) e `npm test` com `CINZAS_TEST_PG` apontando para ele, um esquema isolado por banco de teste (§8.11). | Teste quebrado no PostgreSQL (SQL que diverge do SQLite, migração que falta num dos bancos). |
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
O `docker-compose.yml` sobe o servidor, o serviço de contas, o proxy TLS e o backup de hora em hora (perfis opcionais:
`postgres`, `monitoramento` e `copia-externa`):

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
- **Imagem publicada**: ponha `CINZAS_IMAGEM=ghcr.io/<dono>/cinzas-servidor:<versão>` no `deploy/.env` e rode
  `docker compose pull servidor contas && docker compose up -d --no-build`. A variável vale para a zona **e** para as
  contas: as duas leem e migram o mesmo banco, então nunca rodam versões diferentes.
- **Teto de jogadores**: 200 personagens no mundo ao mesmo tempo (`CINZAS_MAX_PLAYERS`, padrão do Compose; decisão
  do dono do projeto para o teste público, D149). Com o servidor cheio, a entrada responde "Servidor cheio (200
  jogadores). Tente de novo em alguns minutos."; contas `gm` e `admin` entram sempre e não ocupam vaga; quem já está no
  mundo reconecta. `CINZAS_MAX_PLAYERS=0` no `.env` tira o teto.
- **Backup**: automático, de hora em hora, pelo serviço `backup` (abaixo, "Backups e cópia fora da máquina"). Um backup
  na hora, além do agendado: `docker compose exec servidor npm run backup -- --db /data/cinzas.db --para /data/backups --manter 14 --diarias`.
- **Restaurar**: troque o banco **dentro do volume e como o usuário da imagem** (`docker compose run` usa o
  usuário `cinzas`). Não use `docker compose cp` para pôr o banco no lugar: o arquivo entraria como root e o
  servidor não conseguiria gravar nele.

  ```bash
  docker compose stop servidor contas backup     # todos que abrem o banco (o backup não copia no meio da troca)
  docker compose run --rm --no-deps servidor ls /data/backups        # escolha a cópia
  docker compose run --rm --no-deps servidor sh -c 'cp /data/backups/cinzas-AAAA-MM-DDTHH-MM-SS.db /data/cinzas.db && rm -f /data/cinzas.db-wal /data/cinzas.db-shm'
  docker compose start servidor contas backup
  ```

  Uma cópia que está fora da máquina entra no volume assim (depois use `/data/backups/restaurar.db` no `cp` acima):
  `docker compose run --rm -T --no-deps servidor sh -c 'cat > /data/backups/restaurar.db' < cinzas-AAAA-MM-DDTHH-MM-SS.db`.
  Depois da troca, apague-a (`docker compose run --rm --no-deps servidor rm /data/backups/restaurar.db`): fora do
  padrão de nomes dos backups, ela não entra na rotação de 14 dias nem na cópia para fora da máquina e ficaria ali
  para sempre, com os dados de quem já excluiu a conta.
- **Serviço de contas** (`contas`): mesma imagem, mesmo volume e mesmo banco; o Caddy repassa
  `https://DOMINIO/contas/*` para ele (o cliente usa essa base quando o servidor é `wss://`). O servidor de zona sobe com
  `CINZAS_AUTH=token`: cadastro e senha só pelo serviço de contas. `deploy/.env` precisa de `DOMINIO`,
  `CINZAS_TOKEN_SECRET` (`openssl rand -hex 32`) e `CINZAS_EMAIL`: o compose não sobe sem os três. Zona e contas
  recusam um segredo com menos de 32 caracteres ou o valor de exemplo do repositório (D139). Para enviar e-mail de
  verdade, `CINZAS_EMAIL=smtp` e os `CINZAS_SMTP_*` (modelo no cabeçalho do `docker-compose.yml`); as contas recusam
  subir sem `CINZAS_SMTP_HOST` ou sem `CINZAS_SMTP_FROM`. `CINZAS_EMAIL=arquivo` (códigos em `/data/emails`, ninguém
  recebe nada) só serve para um ensaio, e o serviço avisa isso no registro ao subir.
- **PostgreSQL** (perfil `postgres`, opcional): o serviço `banco` (`postgres:17`, só na rede interna, dados no volume
  `banco`) e `CINZAS_DB=postgres://cinzas@banco:5432/cinzas` na zona e nas contas; a senha fica em
  `deploy/segredos/senha_banco.txt` (fora do git) e chega aos três como segredo do compose. Sem o perfil nada muda
  (SQLite no volume `dados`). Como ligar, backup, restauração e como levar um banco SQLite que já existe para o
  PostgreSQL: [§8.11, "No Docker Compose"](#811-postgresql). No PostgreSQL o backup é o serviço `backup-banco` (o
  `pg_dump` da imagem `postgres:17`; a imagem do jogo não traz o `pg_dump`), que sobe junto com o perfil; o serviço
  `backup` do SQLite fica parado sozinho. Se você agendou um backup no cron do host em versões anteriores, tire a
  linha: ela continuaria copiando o `/data/cinzas.db`, que ninguém mais usa (o backup avisa no erro padrão quando o
  `CINZAS_DB` do contêiner é o PostgreSQL).

### Backups e cópia fora da máquina

Sem configurar nada, o serviço **`backup`** do Compose faz o backup do SQLite de hora em hora: é o `npm run backup`
(`tools/backup.mjs`) rodando sem parar, com VACUUM INTO (foto consistente com o jogo no ar) e `integrity_check` antes
de dar o nome final à cópia. Com o perfil `postgres`, quem faz é o **`backup-banco`** (`deploy/backup-postgres.sh` na
imagem `postgres:17`: `pg_dump -Fc` conferido com `pg_restore --list`), e o `backup` fica parado. Os dois (D148):

- gravam em `/data/backups` (volume `dados`): `cinzas-AAAA-MM-DDTHH-MM-SS.db` (SQLite) ou `.dump` (PostgreSQL);
- guardam as **14 cópias mais recentes e a mais nova de cada dia**, e apagam qualquer uma com **mais de 14 dias** —
  o prazo da política de privacidade para uma conta excluída sumir das cópias. São no máximo umas 27 cópias: veja o
  tamanho de uma (`docker compose exec servidor ls -l /data/backups`) e confira que cabem no disco com folga;
- não copiam de novo ao reiniciar: o próximo backup sai quando a cópia mais nova completa 1 h (na hora, se não houver
  nenhuma recente);
- uma falha (disco cheio, banco fora do ar) fica no registro (`docker compose logs backup` ou `backup-banco`) e não
  apaga cópia nenhuma; o serviço tenta de novo na hora seguinte;
- gravam a métrica do último backup no volume `metricas`, que o node-exporter do perfil `monitoramento` lê: os
  alertas `BackupAtrasado` (mais de 2 h sem backup conferido), `BackupFalhou` e `CopiaMaisVelhaQue14Dias` (§8.3).

**Cópia fora da máquina** (opcional, desligada por padrão): um disco perdido leva o banco e os backups juntos. O perfil
`copia-externa` sobe o serviço `copia-externa` (`rclone/rclone`, `deploy/copia-externa.sh`), que de hora em hora faz
`rclone sync` de `/data/backups` para um armazenamento compatível com S3 (Backblaze B2, Cloudflare R2, Wasabi, AWS S3,
MinIO...). O **sync espelha** a pasta: o que a rotação apaga aqui some lá também, então o destino também fica nos 14
dias. Só vão as cópias com o nome que os backups dão (`<banco>-AAAA-MM-DDTHH-MM-SS.db` ou `.dump`, as mesmas que a
rotação apaga): o `.parcial` de um backup em andamento, a cópia trazida para um ensaio de restauração e qualquer outro
arquivo da pasta ficam na máquina. Crie o balde e uma chave de acesso só para ele no provedor e ponha no `deploy/.env`:

```bash
COMPOSE_PROFILES=copia-externa                        # junte com os outros perfis: postgres,monitoramento,copia-externa
COPIA_DESTINO=cinzas-backups/teste-publico            # balde/pasta
COPIA_S3_PROVEDOR=Other                               # ou AWS, Cloudflare, Wasabi, Minio... (nomes do rclone)
COPIA_S3_ENDPOINT=https://s3.us-west-004.backblazeb2.com   # vazio na AWS
COPIA_S3_REGIAO=us-west-004
COPIA_S3_CHAVE=...                                    # id da chave de acesso
COPIA_S3_SEGREDO=...                                  # segredo da chave (entre aspas simples se tiver $)
COPIA_SENHA_CIFRA=...                                 # openssl rand -hex 24: cifra os arquivos (e os nomes) antes de mandar
```

- Com `COPIA_SENHA_CIFRA`, o rclone cifra as cópias antes de mandar: o provedor não lê e-mails nem resumos de senha.
  **Guarde essa senha fora da máquina** (gerenciador de senhas da equipe): sem ela as cópias não voltam. Sem a senha o
  serviço não sobe; mandar sem cifra exige dizer que é de propósito (`COPIA_SEM_CIFRA=sim`), e aí a política de
  privacidade, que fala em cópias cifradas, precisa mudar junto.
- **Versões antigas no provedor**: desligue o versionamento do balde ou ponha uma regra de ciclo de vida que apague
  versões antigas em até 1 dia (no Backblaze B2, *Lifecycle Settings → Keep only the last version*). Sem isso o arquivo
  apagado pelo sync fica guardado como versão antiga e passa dos 14 dias da política de privacidade.
- O provedor passa a guardar dados pessoais (cifrados): a política de privacidade já prevê esse operador na seção
  "Compartilhamento"; ao ligar a cópia, ponha o nome do provedor lá.
- `docker compose logs copia-externa` mostra cada sincronização; o alerta `CopiaExternaAtrasada` avisa se nenhuma
  termina bem em 3 h. Listar o que está lá: `docker compose run --rm copia-externa listar`. Trazer uma cópia de volta
  (já decifrada): `docker compose run --rm -T copia-externa baixar cinzas-AAAA-MM-DDTHH-MM-SS.db > cinzas-AAAA-MM-DDTHH-MM-SS.db`
  e depois o passo "Uma cópia que está fora da máquina entra no volume assim" acima.

### Ensaio de restauração

Um backup só vale se volta. Faça este ensaio antes de abrir o teste e depois de cada mudança de versão ou de banco,
**sem tocar no banco do jogo**. O teste automático `server/test/backup.test.js` faz o mesmo a cada `npm test` (cria
um banco com personagens, roda o `tools/backup.mjs`, restaura a cópia e confere tudo pelo `Store`) e, no
`npm run test:pg`, também pelo `pg_dump`/`pg_restore` e pelo `deploy/backup-postgres.sh`; o ensaio confere o que só a
máquina de verdade tem: o volume, as permissões e as cópias reais.

1. **Escolha a cópia**: `docker compose run --rm --no-deps servidor ls -l /data/backups`.
2. **SQLite** — abra a cópia só para leitura, confira a integridade e conte o que importa; rode o mesmo comando com
   `/data/cinzas.db` no lugar da cópia para comparar com o banco do jogo:
   ```bash
   docker compose run --rm --no-deps servidor node --disable-warning=ExperimentalWarning -e '
     const db = new (require("node:sqlite").DatabaseSync)(process.argv[1], { readOnly: true });
     console.log("integridade:", db.prepare("PRAGMA integrity_check").get().integrity_check);
     for (const t of ["accounts", "characters", "item_instances", "quest_progress", "audit_log"])
       console.log(t, db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n);
     console.log("último salvamento:", new Date(db.prepare("SELECT MAX(updated_at) AS t FROM characters").get().t).toISOString());
   ' /data/backups/cinzas-AAAA-MM-DDTHH-MM-SS.db
   ```
   Espere `integridade: ok`, contagens perto das do jogo e o último salvamento perto da hora da cópia.
3. **PostgreSQL** — restaure num banco novo (`ensaio`) no próprio servidor, confira e apague (o contêiner
   `backup-banco` já tem a conexão e o volume com as cópias):
   ```bash
   docker compose exec backup-banco sh -c 'export PGPASSWORD="$(cat /run/secrets/senha_banco)"
     createdb ensaio && pg_restore --no-owner -d ensaio /data/backups/cinzas-AAAA-MM-DDTHH-MM-SS.dump &&
     psql -d ensaio -c "SELECT COUNT(*) AS contas FROM accounts" -c "SELECT COUNT(*) AS personagens FROM characters" \
       -c "SELECT to_timestamp(MAX(updated_at) / 1000) AS ultimo_salvamento FROM characters"
     dropdb ensaio'
   ```
   Para comparar com o banco do jogo, rode o `psql` com `-d cinzas`.
4. **Cópia de fora** (perfil `copia-externa`): traga uma cópia com `baixar` (seção anterior), ponha no volume com o
   `cat > /data/backups/restaurar.db` (ou `restaurar.dump`) de "Restaurar" e repita o passo 2 ou 3 com ela — é o
   caminho de um desastre de verdade, com a senha da cifra vindo de fora da máquina. No fim, apague-a
   (`docker compose run --rm --no-deps servidor rm /data/backups/restaurar.db`): fora do padrão de nomes dos backups,
   ela não entra na rotação de 14 dias.
5. Anote a data, a cópia usada, as contagens e quanto tempo levou. Para restaurar de verdade, siga "Restaurar" acima
   (SQLite) ou §8.11 (PostgreSQL).

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
  `CINZAS_TOKEN_SECRET`, o SMTP e o teto de jogadores (`CINZAS_MAX_PLAYERS=200`); `cinzas.service` e
  `cinzas-contas.service` leem o mesmo arquivo. As métricas das contas ficam em `127.0.0.1:9101` (§8.3).
- Endurecimento: `ProtectSystem=strict` com só `/var/lib/cinzas` gravável, sem *capabilities*, filtro de chamadas
  de sistema, `/home` e dispositivos inacessíveis (`systemd-analyze security cinzas`: 1,5, "OK"). Sem
  `MemoryDenyWriteExecute`, que quebra o JIT do V8.
- `backup.timer` roda `npm run backup -- --db /var/lib/cinzas/cinzas.db --para /var/lib/cinzas/backups --manter 14
  --diarias` de hora em hora: a mesma rotação do Compose (as 14 mais recentes e a mais nova de cada dia, nada com mais
  de 14 dias). Leve cópias para fora da máquina (o `deploy/copia-externa.sh` roda com o `rclone` da máquina:
  `COPIA_ORIGEM=/var/lib/cinzas/backups`, `COPIA_DESTINO` e as variáveis `RCLONE_CONFIG_EXTERNO_*`): um disco perdido
  leva o banco e os backups juntos. Com um node-exporter na máquina, `--metrica` grava a métrica do backup num arquivo
  `.prom` da pasta do coletor *textfile* dele (o arquivo precisa ficar legível para o usuário do node-exporter). O
  node-exporter escuta por padrão na porta 9100, a mesma das métricas da zona no `cinzas.service`: suba-o em outra
  (`--web.listen-address=127.0.0.1:9102`), senão um dos dois não sobe.
- **Restaurar** (como o usuário `cinzas`, para o arquivo continuar dele):
  `sudo systemctl stop cinzas`, depois
  `sudo -u cinzas cp /var/lib/cinzas/backups/cinzas-AAAA-MM-DDTHH-MM-SS.db /var/lib/cinzas/cinzas.db`,
  `sudo -u cinzas rm -f /var/lib/cinzas/cinzas.db-wal /var/lib/cinzas/cinzas.db-shm` e `sudo systemctl start cinzas`.

### Antes de abrir o teste

- DNS e portas 80/443 prontos; `DOMINIO`, `CINZAS_TOKEN_SECRET` e SMTP em `deploy/.env` (ou `/etc/cinzas/cinzas.env`);
  servidor **sem** `--dev`; uma conta com papel `admin` para a equipe (`npm run conta -- --conta nome --papel admin`).
- Domínio do remetente verificado no provedor de e-mail, com **SPF**, **DKIM** e **DMARC** publicados no DNS (o
  provedor mostra os registros; sem eles os códigos caem no lixo eletrônico ou são recusados). Mande um código para
  um endereço do Gmail e um do Outlook e confira que chega na caixa de entrada.
- Responsável e contato preenchidos em `docs/TERMOS.md` e `docs/PRIVACIDADE.md` (e revisados por assessoria jurídica).
- Criar conta pelo cliente publicado: o e-mail com o código chega, a confirmação funciona e o login por token entra.
- `docker compose ps` saudável; de outra máquina, `curl http://IP:9100/health` **não** pode responder (nem
  `curl http://IP:7777/` nem `curl http://IP:9101/metrics`, que só a máquina alcança).
- Backup rodando (`docker compose logs backup`), o **ensaio de restauração** feito (acima) e a decisão sobre a cópia
  fora da máquina tomada (perfil `copia-externa`, com cifra e sem versões antigas no provedor).
- Monitoramento no ar (`--profile monitoramento`), pelo menos um canal de alerta ligado e conferido com o alerta de
  teste (§8.3), e o **monitor externo** de `https://DOMINIO/contas/saude` cadastrado.
- Teto de jogadores conferido (`CINZAS_MAX_PLAYERS`, 200 por padrão).
- Release publicada; se saiu sem assinatura, avise os jogadores sobre o SmartScreen e o Gatekeeper.

## 8.9 Contas, segurança e privacidade (teste público)

**Serviço de contas** (processo separado, mesmo banco): `npm run contas -- --port 7780 --db cinzas.db
--token-secret "$CINZAS_TOKEN_SECRET" --email smtp --smtp-host smtp.exemplo.com --smtp-user ... --smtp-pass ...
--smtp-from "Cinzas <nao-responda@exemplo.com>"`. Rotas: criar conta (e-mail com código de 6 dígitos),
confirmar, reenviar código, sessão (token de 5 min, uso único), esqueci/redefinir senha, exportar dados
(portabilidade) e excluir conta. `--email arquivo --email-dir emails` grava os e-mails em vez de enviar.

E-mail (D139): cada opção também vem do ambiente (`CINZAS_EMAIL`, `CINZAS_SMTP_HOST`, `_PORT`, `_USER`, `_PASS`,
`_FROM`, `_TLS`, `_HELO`), que é como o Docker e o systemd configuram. A porta decide a criptografia: **465** liga o
TLS direto e **587** exige STARTTLS — se o servidor de e-mail não oferecer STARTTLS, o envio falha em vez de mandar
usuário e senha do SMTP às claras. `CINZAS_SMTP_TLS=direto|starttls|nenhum` força o modo (`nenhum` só para um relé
local de desenvolvimento). O remetente (`CINZAS_SMTP_FROM`) é obrigatório e o domínio dele vai no EHLO e no
Message-ID (ou `CINZAS_SMTP_HELO`). Um erro de certificado do servidor de e-mail vira falha daquele envio (registrada),
sem derrubar o serviço.

**Servidor de zona no teste público**:

```bash
npm start -- --auth token --token-secret "$CINZAS_TOKEN_SECRET" --tls-cert cert.pem --tls-key key.pem \
  --max-conn-per-ip 8 --trust-proxy --log-format json --shutdown-grace 30 --audit-days 90 --max-players 200
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
| `--max-players N` (ou `CINZAS_MAX_PLAYERS`) | Teto de personagens no mundo (0 = sem limite, o padrão; 200 no Docker Compose). Cheio, a entrada responde `server_full` com "Servidor cheio (N jogadores). Tente de novo em alguns minutos."; contas `gm` e `admin` entram sempre e não ocupam vaga, e quem já está no mundo reconecta. Com várias zonas a conta é do mundo inteiro (os personagens das outras zonas entram na soma): use o mesmo valor em todas. Métricas: `cinzas_max_players` e `cinzas_server_full_total`. |

**Auditoria** (`audit_log`): entradas e falhas (com IP), comandos de mestre, saque, compras, refino,
recompensas de missão, criação/confirmação/exclusão de conta, troca de senha, expulsões. Consulta:
`npm run conta -- --db cinzas.db --auditoria --tipo gm --n 50`.

**Mestres** (D138): comandos `/gm` só para contas com papel `gm` ou `admin` (ou com `--dev`, em desenvolvimento):
`npm run conta -- --db cinzas.db --conta nome --papel gm`. O papel `gm` modera (tabela abaixo) e teleporta o próprio
personagem (`teleport`). Os comandos de cenário, que criam ouro, itens, níveis, refino ou progresso de missão
(`give`, `gold`, `xp`, `set_enh`, `quest_progress`, `quest_done`), são só do papel `admin` (ou `--dev`), com teto:
`give` até uma pilha do item e `gold` até 1.000.000 por comando. Todo comando de mestre, inclusive o recusado, fica
na auditoria.

**Moderação** (no chat do jogo, contas da equipe):

| Comando | Efeito |
|---|---|
| `/gm expulsar Nome motivo` | Desconecta o jogador. |
| `/gm silenciar Nome minutos motivo` · `/gm liberar Nome` | Silencia a conta (todos os canais) / retira. |
| `/gm suspender Nome horas motivo` · `/gm desbloquear Nome` | Suspende a conta (derruba e recusa o login, também no serviço de contas). Mestre: até 72 h; acima disso ou `perm` (sem data), só `admin`. Motivo obrigatório. |
| `/gm onde Nome` · `/gm anunciar texto` | Mapa e posição do jogador / aviso para todos os conectados. |

Jogadores denunciam com `/denunciar Nome motivo` (5 por hora); a denúncia grava as últimas falas do denunciado que
o denunciante podia ver (as do mapa e os sussurros, falas de grupo e de clã que chegaram a ele; D123).
Pela ferramenta, fora do jogo: `npm run conta -- --db cinzas.db --personagem Nome --suspender --horas 24 --motivo "..."`
(ou `--permanente`, `--retirar-suspensao`, `--silenciar --minutos 60`, `--retirar-silencio`) e
`npm run conta -- --db cinzas.db --denuncias --n 50`; relatos de problema dos testadores (`/bug texto` no jogo, com mapa,
posição, nível e versões do cliente, do servidor e dos dados): `npm run conta -- --db cinzas.db --bugs --n 50`. O servidor confere o banco a cada minuto: uma suspensão feita pela
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

## 8.10 Múltiplas zonas

Opcional: os mapas abertos se dividem entre processos de zona, coordenados por um **serviço de mundo** interno
(desenho em [05-arquitetura.md](05-arquitetura.md#múltiplas-zonas), decisões D111–D118). Sem `--world`, nada muda.
Todos os processos usam **o mesmo banco** e o **mesmo segredo do mundo**, só por variável de ambiente:

```bash
export CINZAS_WORLD_SECRET="$(openssl rand -hex 32)"   # o mesmo no mundo e em todas as zonas
npm run mundo -- --port 7790 --host 127.0.0.1
npm start -- --port 7777 --db cinzas.db --world ws://127.0.0.1:7790 --zone-id zona-a \
  --maps estrada_velha,pedrambar,vau_de_nacar --public-url wss://jogo.exemplo.com/a
npm start -- --port 7778 --db cinzas.db --world ws://127.0.0.1:7790 --zone-id zona-b \
  --maps brejo_bombas,oficina_soterrada,galerias_eco,canais_eclusa --public-url wss://jogo.exemplo.com/b
```

Para testar na máquina: `npm run multizona -- --zonas 2 --dev` sobe o mundo e as zonas (portas 7777, 7778, …;
`--porta`, `--porta-mundo`, `--db`, `--mapas "a,b;c,d"`; o resto vai para as zonas) e `Ctrl+C` desliga tudo
salvando. O cliente entra por qualquer zona (`--server=ws://127.0.0.1:7777`) e é levado à zona do mapa salvo.

| Onde | Opção | Padrão | Para quê |
|---|---|---|---|
| mundo | `--port` (ou `CINZAS_WORLD_PORT`), `--host` | 7790, 127.0.0.1 | Porta interna das zonas. **Nunca na internet**: só as zonas falam com ela. |
| mundo | `--secret` (ou `CINZAS_WORLD_SECRET`) | — | Segredo do HMAC do hello das zonas e dos tokens de transferência. Prefira a variável (a opção aparece no `ps`). |
| mundo | `--heartbeat-ms`, `--down-after-ms` | 2000, 10000 | Sinal de vida das zonas e silêncio que dá uma zona como fora do ar. |
| zona | `--world` (ou `CINZAS_WORLD`) | desligado | Endereço do mundo; liga o modo de várias zonas. |
| zona | `--world-secret` (ou `CINZAS_WORLD_SECRET`) | — | O mesmo segredo do mundo (obrigatório com `--world`). |
| zona | `--zone-id` (ou `CINZAS_ZONE_ID`) | `zona-<porta>` | Nome da zona no mundo (letras, números, `.`, `_`, `-`). |
| zona | `--maps` (ou `CINZAS_MAPS`) | todos | Mapas abertos desta zona, separados por vírgula. Dois processos não podem pedir o mesmo mapa. |
| zona | `--public-url` (ou `CINZAS_PUBLIC_URL`) | `ws://host:porta` | Endereço que os **clientes** usam para chegar a esta zona (vai no token de transferência). Atrás do Caddy, um caminho ou subdomínio por zona. |

`GET http://127.0.0.1:7790/saude` mostra as zonas (mapas, endereço, jogadores, conectada, silêncio) e o número
de posses e grupos. Cada zona continua com as próprias métricas (`--metrics-port` diferente por processo).

**Quando algo falha**:

- **Zona cai sem avisar**: depois de 10 s sem sinal o mundo libera as posses dela; quem tenta entrar num mapa
  dela recebe "*Mapa* está fora do ar no momento" e os portais para lá recusam com a mesma frase. Ao subir de
  novo (mesmo `--zone-id` e mapas, mesmo banco), ela volta ao registro; o progresso vale até o último salvamento
  (posição a cada 10 s; itens, ouro e XP na hora).
- **Zona perde o mundo** (rede, mundo parado ou o próprio processo travado): com 6 s sem resposta aos sinais
  de vida ela salva e desconecta os jogadores
  ("Conexão com o mundo perdida. Seu progresso foi salvo"); com 8 s para de gravar. Assim nada dela é escrito
  depois de o mundo dar as posses a outra zona. Novas entradas esperam o mundo voltar.
- **Mundo reinicia**: as zonas reconectam sozinhas e dizem quem têm carregado; o mundo refaz as posses e o
  diretório. Nos primeiros 10 s depois de subir, entradas de personagens sem posse esperam as zonas se
  reapresentarem. **Grupos se desfazem** (moram na memória do mundo); clãs não (estão no banco).
- **Desligamento** (`SIGTERM`): a zona avisa o mundo, que para de mandar transferências para ela; depois do
  prazo ela salva, solta as posses e se despede. Os portais para os mapas dela recusam enquanto isso.
- **Transferência que não completa** (token de 30 s vencido, destino caiu no meio): o cliente volta para a lista
  de personagens com o motivo; o personagem já foi gravado pela origem e entra de novo normalmente.
- **Login com o personagem aberto em outra zona**: a outra zona grava e derruba ("Sua conta entrou em outra
  conexão") antes de a nova entrada carregar o personagem; nunca há duas cópias.
- **Moderação** vale em todas as zonas: suspensão e silêncio na chegada por transferência e os comandos de
  mestre (`expulsar`, `suspender`, `silenciar`, `onde`, `anunciar`) alcançam quem está em outra zona.

## 8.11 PostgreSQL

Em produção o banco é um **PostgreSQL central**; o SQLite fica para desenvolvimento e testes locais. A
escolha é pelo valor de `--db` (ou `CINZAS_DB`), no servidor de zona, no serviço de contas e nas ferramentas:
`postgres://...` ou `postgresql://...` → PostgreSQL; qualquer outra coisa → arquivo SQLite. A lógica do jogo
não muda: é o mesmo `Store` síncrono, com as mesmas transações, por uma ponte síncrona até um worker com
conexão dedicada (decisão e custo: D119).

**Preparar** (uma vez, como superusuário do PostgreSQL):

```sql
CREATE ROLE cinzas LOGIN PASSWORD 'troque-esta-senha';
CREATE DATABASE cinzas OWNER cinzas ENCODING 'UTF8' TEMPLATE template0;
```

**Subir** com a URL numa variável de ambiente (na linha de comando a senha apareceria no `ps`):

```bash
export CINZAS_DB='postgres://cinzas:troque-esta-senha@db.interno:5432/cinzas'
npm start -- --metrics-port 9100                               # servidor de zona
npm run contas -- --token-secret "$CINZAS_TOKEN_SECRET"        # serviço de contas, mesmo banco
```

- O log de início mostra o banco em uso, sem a senha (`banco: PostgreSQL cinzas@db.interno:5432/cinzas`).
- **Senha num arquivo**: sem senha na URL, `CINZAS_DB_PASSWORD_FILE=/caminho/senha` faz o servidor, o serviço de
  contas e as ferramentas lerem a senha desse arquivo (o conteúdo inteiro, sem as quebras de linha do fim — o mesmo
  formato do `POSTGRES_PASSWORD_FILE` da imagem oficial; qualquer caractere vale, `%`, `@` e `:` inclusive). É assim
  no Docker Compose (abaixo). Arquivo vazio ou ilegível é erro na hora de subir; com senha no arquivo e banco
  SQLite, o log avisa (faltou `CINZAS_DB`?). Senha **na própria URL** segue a regra das URLs: `%`, `@`, `:` e `/`
  codificados (`%25`, `%40`, `%3A`, `%2F`).
- `?schema=nome` no fim da URL usa um esquema próprio em vez de `public` (criado se faltar). Para um papel de
  menor privilégio, o administrador cria o esquema antes (`CREATE SCHEMA nome AUTHORIZATION cinzas`) e o papel não
  precisa de `CREATE` no banco: esquema que já existe não é criado de novo.
- Os outros parâmetros da URL vão para o driver `pg` (ex.: `sslmode=verify-full` para TLS até o banco). Para
  usar a mesma URL no `pg_dump`/`pg_restore`, fique nos parâmetros que o libpq também entende (`sslmode`, `host`, `port`...).
- Banco na mesma rede do servidor: cada chamada espera a ida e volta (abaixo).

**No Docker Compose** (perfil `postgres` do `deploy/docker-compose.yml`): o serviço `banco` é a imagem oficial
`postgres:17` (UTF-8, locale `C.UTF-8`), sem porta publicada, com dados no volume `banco` e verificação de saúde
(`pg_isready` por TCP); zona e contas esperam o banco ficar saudável antes de subir. Para ligar, em `deploy/`:

```bash
install -d -m 0700 segredos
openssl rand -hex 24 > segredos/senha_banco.txt
sudo chown 10001:10001 segredos/senha_banco.txt && sudo chmod 0600 segredos/senha_banco.txt
cat >> .env <<'FIM'
COMPOSE_PROFILES=postgres
CINZAS_DB=postgres://cinzas@banco:5432/cinzas
CINZAS_DB_SENHA_ARQUIVO=./segredos/senha_banco.txt
FIM
docker compose up -d --build
docker compose logs servidor | grep banco:          # "banco: PostgreSQL cinzas@banco:5432/cinzas"
```

- As três linhas do `.env` andam juntas: `COMPOSE_PROFILES` sobe o `banco`, `CINZAS_DB` aponta zona e contas para
  ele e `CINZAS_DB_SENHA_ARQUIVO` entrega o arquivo como segredo `senha_banco` (em `/run/secrets/senha_banco`, que
  a zona e as contas leem por `CINZAS_DB_PASSWORD_FILE` e o PostgreSQL por `POSTGRES_PASSWORD_FILE`). Sem o perfil o
  segredo é `/dev/null` e nada muda. O arquivo fica com o uid 10001 (o usuário da imagem do jogo) e modo 0600; o
  PostgreSQL o lê como root ao iniciar. A senha só é usada na **primeira** inicialização do volume `banco`: para
  trocá-la depois, `ALTER ROLE cinzas PASSWORD '...'` no banco e o arquivo novo, juntos.
- **Backup**: automático, de hora em hora, pelo serviço `backup-banco`, que sobe junto com o perfil (§8.8, "Backups e
  cópia fora da máquina"): `pg_dump -Fc` conferido com `pg_restore --list` em `/data/backups` (volume `dados`), com a
  rotação de 14 dias e a métrica do último backup. Um dump na hora, fora do agendado:
  `docker compose exec -T banco pg_dump -U cinzas -Fc cinzas > cinzas-$(date +%F-%H%M).dump`. Ensaio de restauração:
  §8.8.
- **Restaurar** (os dumps do `backup-banco` ficam no volume `dados`, que o contêiner dele monta): pare quem usa o
  banco e o próprio backup, para nenhum dump fotografar o banco no meio da troca, e restaure por um contêiner
  avulso do `backup-banco`, que já tem a conexão, a senha e o volume:

  ```bash
  docker compose stop servidor contas backup-banco
  docker compose run --rm --no-deps --entrypoint sh backup-banco -c 'PGPASSWORD="$(cat /run/secrets/senha_banco)" pg_restore -d cinzas --clean --if-exists --no-owner /data/backups/cinzas-AAAA-MM-DDTHH-MM-SS.dump'
  docker compose start servidor contas backup-banco
  ```

  Um dump que está fora da máquina entra no volume como no SQLite (§8.8, "Restaurar"), com o nome
  `/data/backups/restaurar.dump`; apague-o depois da troca.
- **Levar o SQLite que já existe** (volume `dados`) para o PostgreSQL, com a zona parada:
  `docker compose stop servidor contas && docker compose up -d banco`, depois
  `docker compose run --rm --no-deps servidor npm run sqlite-para-pg -- --de /data/cinzas.db` (o destino é o
  `CINZAS_DB` do contêiner; o arquivo SQLite não é alterado) e `docker compose up -d`.

**Com systemd** (`deploy/cinzas.service` e `cinzas-contas.service`): tire o `--db /var/lib/cinzas/cinzas.db` do
`ExecStart` dos dois e ponha em `/etc/cinzas/cinzas.env` o `CINZAS_DB=postgres://...` (com a senha na URL, já que o
arquivo é só do root, ou `CINZAS_DB_PASSWORD_FILE`). O `backup.service` passa a precisar do `pg_dump` da versão do
servidor na máquina e de `--db "$CINZAS_DB"` (tire o `ConditionPathExists`).

**Migrações**: as mesmas versões do SQLite (tabela `schema_version`), aplicadas sozinhas ao subir, cada uma
numa transação; uma trava consultiva por esquema impede que a zona e o serviço de contas, subindo juntos,
apliquem a mesma migração duas vezes. **Toda migração nova precisa ser escrita para os dois bancos**: o passo
em `MIGRATIONS` (`src/store.js`) e o passo com a mesma versão e o mesmo nome em `PG_MIGRATIONS`
(`src/store-pg.js`), além dos métodos do `Store` que mudarem nos dois arquivos. O `npm test` falha se as listas
divergirem; o `npm run test:pg` confere, tabela a tabela e coluna a coluna, que o esquema do PostgreSQL é o do
SQLite, e que um banco importado responde igual nos dois.

| SQLite | PostgreSQL |
|---|---|
| `INTEGER` (ids, tempos em ms, ouro, XP, contadores) | `BIGINT`, lido como número |
| `REAL` (posição, tempo jogado) | `DOUBLE PRECISION` |
| `TEXT` (inclusive os JSON) | `TEXT` |
| `INTEGER PRIMARY KEY AUTOINCREMENT` | `BIGINT GENERATED BY DEFAULT AS IDENTITY` |
| `UNIQUE COLLATE NOCASE` (nomes de conta, personagem e clã, sigla do clã), e-mail `COLLATE NOCASE` | índice único em `nocase(...)`; buscas por `nocase(coluna) = nocase($1)`; ordem por `nocase(coluna) COLLATE "C"`. `nocase()` é uma função do esquema que troca só A-Z por a-z — o mesmo do `NOCASE` do SQLite, que não mexe em letras fora do ASCII, e sem depender do locale do banco (`lower()` dependeria) |
| `INSERT OR IGNORE`, `lastInsertRowid` | `ON CONFLICT DO NOTHING`, `RETURNING id` |
| `BEGIN IMMEDIATE` | `BEGIN` na conexão dedicada; `FOR UPDATE` ao pegar saque e tirar do depósito |
| `busy_timeout = 3000` | `lock_timeout = 3s`; `statement_timeout = 10s` |
| `rowid` implícito de `account_codes` | coluna `rid` (identidade) |

**Backup** (agende de hora em hora, como no SQLite; no Docker Compose o serviço `backup-banco` já faz isso):

```bash
npm run backup -- --db "$CINZAS_DB" --para backups --manter 14 --diarias
```

Roda `pg_dump -Fc` (formato custom: comprimido, foto consistente de uma transação, sem parar o jogo), confere o
arquivo com `pg_restore --list` e faz a mesma rotação do SQLite: as 14 cópias mais recentes e a mais nova de cada dia,
nada com mais de 14 dias (`backups/cinzas-AAAA-MM-DDTHH-MM-SS.dump`). O arquivo é gravado como `.dump.parcial` e só
ganha o nome final depois de conferido: um backup que falha ou é interrompido não apaga outro nem fica parecendo um
backup bom (sobras de execuções mortas, `.parcial` com mais de 1 h, saem na rotação seguinte).
A senha vai por `PGPASSWORD`, não pela linha de comando; com `?schema=` o dump é só daquele esquema. O `pg_dump`
precisa ser da versão do servidor ou mais novo (`--pg-bin` ou `CINZAS_PG_BIN` apontam a pasta dos binários).
Para perder menos de uma hora num desastre, some o arquivamento contínuo de WAL do próprio PostgreSQL
(`pg_basebackup` + `archive_command`, recuperação até um instante) — configuração do banco, fora do jogo.

**Restaurar**:

1. Pare a zona e o serviço de contas.
2. Restaure num banco novo e confira antes de trocar:
   ```bash
   createdb -O cinzas cinzas_restaurado
   pg_restore --no-owner --role=cinzas -d cinzas_restaurado backups/cinzas-2026-11-20T04-00-00.dump
   ```
3. Aponte `CINZAS_DB` para `.../cinzas_restaurado` (ou troque os nomes: `ALTER DATABASE cinzas RENAME TO
   cinzas_antigo; ALTER DATABASE cinzas_restaurado RENAME TO cinzas;`) e suba. Migrações que faltarem rodam sozinhas.

Sobrescrever o próprio banco, com tudo parado: `pg_restore --clean --if-exists --no-owner -d cinzas arquivo.dump`.
Uma tabela só (ex.: auditoria): `pg_restore -t audit_log ...`. As sequências de identidade vêm junto no dump.

**Do SQLite para o PostgreSQL**: `npm run sqlite-para-pg -- --de cinzas.db --para "$CINZAS_DB"` tira uma foto
consistente do arquivo (pode ser com o servidor rodando; o arquivo não é alterado), migra a foto, exige as
tabelas do PostgreSQL vazias, copia tudo numa transação com os mesmos ids (clãs e membros inclusive), acerta as
sequências e confere as contagens. Os nomes valem igual nos dois bancos (`nocase()` = `NOCASE`): o que o SQLite
aceitou, os índices únicos do PostgreSQL aceitam. Fração guardada numa coluna inteira do SQLite (que aceita; ex.
fim de suspensão gravado por versões anteriores ao arredondamento) é arredondada, e a contagem aparece no log.

**Testes**: `npm run test:pg` sobe um PostgreSQL temporário (`initdb` num diretório temporário, só soquete Unix,
sem TCP), roda a suíte inteira com `CINZAS_TEST_PG=<url>` e apaga tudo no fim. Com essa variável, cada banco que
os testes pedirem vira um **esquema isolado**: o mesmo caminho de arquivo dá o mesmo esquema (o teste de
aceitação reinicia o servidor com o mesmo banco; zona e serviço de contas dividem um banco) e `:memory:` dá um
esquema novo, apagado no `close()`. Precisa dos binários do PostgreSQL (`initdb`, `pg_ctl`; `CINZAS_PG_BIN`
aponta a pasta). Como root, o script roda o PostgreSQL como o usuário `postgres` (ou `nobody`, ou
`CINZAS_PG_USER`), porque o `initdb` recusa root. O teste do arquivo SQLite antigo (`store.test.js`) é pulado
no PostgreSQL; o equivalente está em `store-pg.test.js`. `npm run pg-temp -- [--duravel] -- <comando>` sobe um
cluster temporário para outras medições (`{url}` nos argumentos vira a URL; `--duravel` mantém o fsync).

**Custo da ponte síncrona e carga**: cada chamada ao banco para o laço de eventos durante uma ida e volta
(~0,15–0,25 ms com o banco local; um `COMMIT` com fsync, alguns ms). O salvamento periódico vai num lote (um
`UPDATE` para todos os conectados: ~1,6 ms para 100 personagens, contra ~14 ms um a um). Teste de carga com
100 clientes e PostgreSQL local com fsync ligado ([relatorio-carga-postgres.md](relatorio-carga-postgres.md))
(`npm run pg-temp -- --duravel -- node tools/carga.mjs --clientes 100 --duracao 60 --db {url}`):

| | p50 | p95 | p99 | máx | acima de 50 ms |
|---|---|---|---|---|---|
| Tick, PostgreSQL (ms) | 5,1 | 9,5 | 14,5 | 27,3 | 0 de 599 |
| Tick, SQLite, mesma máquina e hora (ms) | 5,4 | 10,2 | 15,5 | 20,1 | 0 de 599 |

Ponte: 5,4 chamadas/s, laço parado 2,7 ms por segundo; por chamada, p50 0,23 ms, p99 4,0 ms, máx 11,9 ms (o
máximo do tick, maior que no SQLite, é um `COMMIT` esperando o fsync no meio de um abate). CPU igual (~7,7% de
um núcleo); memória ~30 MB maior (o worker e o `pg`). Medido de novo depois de comércio, clãs, duelo e moderação
entrarem (mesmo comando, servidor próprio nas portas 7762/7763 com `--url`/`--metricas`): tick p50 4,5, p95 9,9,
p99 13,9, máx 34,8 ms, 0 de 599 acima de 50 ms; ponte 5,5 chamadas/s, 2,0 ms parados por segundo, chamada p99
3,4 ms e máx 4,7 ms. A conferência de suspensões e silêncios (a cada minuto, no tick) busca todas as contas
on-line numa consulta só (`findAccountsByIds`), não uma ida e volta por jogador. Em produção, os contadores
`cinzas_db_calls_total` e `cinzas_db_wait_seconds_total` e os medidores `cinzas_db_call_ms_p50|p99|max` (só com
PostgreSQL) mostram isso: `rate(cinzas_db_wait_seconds_total[5m]) * 1000` é o tempo parado em ms por segundo, no
painel "Espera pelo banco"; o alerta `BancoLento` dispara com mais de 50 ms por segundo ou chamada p99 acima de 5 ms
por 5 min (§8.3).

**Falhas** (conferidas em `store-pg.test.js`):
- Espera de trava acima de 3 s ou comando acima de 10 s viram erro (o pedido falha, o jogo segue). A ponte
  desiste em 15 s, encerra o worker e a conexão e o pedido seguinte começa com worker e conexão novos.
- Conexão caída fora de transação: o comando em andamento falha e os seguintes reconectam sozinhos (até 2 s para
  conectar). Se a reconexão falha — ou depois de um prazo esgotado —, os pedidos falham **na hora** por um recuo
  crescente (0,5 s até 10 s) e então tentam de novo: com o banco fora do ar, o jogo não fica parado o tempo inteiro
  de conexão a cada chamada.
- Dentro de `tx(fn)`, a transação vale numa conexão só: se ela cai ou é trocada no meio, os comandos seguintes da
  mesma transação falham e o `tx()` lança (`08006`) — mesmo que o erro tenha sido engolido dentro de `fn`; um
  comando que falha dentro dela faz o resto falhar e o `COMMIT` virar erro (`25P02`). Nada é gravado pela metade
  e nunca há um desfazer silencioso. A auditoria dentro de transação roda num `SAVEPOINT`: a falha dela não desfaz
  o resto (como no SQLite).
- Worker com defeito que morre no meio de um pedido responde o erro antes de sair (a thread principal não espera o
  prazo); o pedido seguinte troca o worker. `close()` encerra o worker. Um worker que morre **fora** de um pedido
  sem passar por esse caminho (falta de memória, por exemplo) só é percebido pelo prazo da ponte: a chamada
  seguinte espera os 15 s e falha, e a outra (depois do recuo) já sobe worker e conexão novos.
- Migrações: quem sobe junto com outro processo que está migrando espera a trava consultiva o tempo que for
  preciso (sem `lock_timeout` nem `statement_timeout`); o `ALTER TABLE` em si continua com o `lock_timeout`
  normal, para não ficar na fila travando as consultas das zonas antigas.
- Banco fora do ar: o que gravar no meio do tick lança erro e derruba a zona, como um disco cheio no SQLite; o
  supervisor (systemd/Docker) a reinicia e, enquanto o banco não volta, o servidor sai logo ao subir. Perde-se
  no máximo o progresso desde o último salvamento (10 s). Um pedido de jogador que falha no meio (banco, prazo
  da ponte ou defeito) recebe "Erro interno", a transação dele é desfeita no banco e o jogador **sai sem gravar**
  (aviso na tela; auditoria `request_error`): o que a lógica do jogo já tinha mudado na memória antes da falha
  — numa queda no meio de um saque, o ouro já somado — não chega ao banco, e ao entrar de novo ele carrega o que
  está gravado. Vale nos dois bancos (no SQLite a falha é rara: disco cheio).

**Diferenças conhecidas** (o resto é igual, conferido pelos testes nos dois bancos):
- Comando que falha dentro de uma transação (erro engolido pelo código) desfaz a transação inteira no PostgreSQL;
  no SQLite só aquele comando volta e o resto é gravado. O jogo não depende disso (a auditoria, que pode falhar sem
  desfazer o saque, roda num `SAVEPOINT`).
- Saques do mesmo abate (mesmo instante de criação) saem por id no PostgreSQL e na ordem de inserção no SQLite
  (só muda a ordem de exibição).
- Colunas inteiras recusam fração no PostgreSQL (o SQLite guardaria o número com fração): os dados do jogo
  usam só inteiros para ouro, quantidades e XP (o `npm run validate-data`, que também roda no `npm test`,
  recusa fração nesses campos) e o código arredonda vida e mana.
- Atualização com zonas antigas ainda no ar: se uma versão nova migrar o esquema, as zonas antigas preparam de
  novo as consultas sozinhas; mesmo assim, prefira parar tudo, subir a versão nova (migra) e depois o resto.

