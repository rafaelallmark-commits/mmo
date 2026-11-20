# 8. Execução e operação

Como subir, observar, salvar e testar o servidor de CINZAS DO MERIDIANO. Os números de referência vêm
do Marco 4 ([relatorio-carga.md](relatorio-carga.md), [relatorio-cenarios.md](relatorio-cenarios.md)).

## 8.1 Requisitos

- **Servidor**: Node.js ≥ 22.13. Em desenvolvimento, nada mais (SQLite embutido, `node:sqlite`); em produção,
  **PostgreSQL** central (testado no 16; §8.10). Dependências: `ws` e `pg` (só carregado com PostgreSQL).
- **Cliente**: Godot 4.3 (renderizador Compatibility). Roda pelo editor ou exportado.

## 8.2 Subir o servidor

```bash
cd server && npm install && npm start -- --port 7777 --db cinzas.db --metrics-port 9100
```

| Opção | Padrão | Para quê |
|---|---|---|
| `--port` (ou `PORT`) | 7777 | Porta do WebSocket do jogo. |
| `--host` | 0.0.0.0 | Interface de escuta. |
| `--db` (ou `CINZAS_DB`) | cinzas.db | Arquivo SQLite (desenvolvimento, modo WAL) ou `postgres://...` (produção, §8.10). Migrações rodam sozinhas ao subir. |
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

Esta seção é o SQLite (desenvolvimento). Em produção o banco é o PostgreSQL central: §8.10.

- SQLite em modo WAL; cada operação que mexe em inventário, ouro, XP ou saque roda numa transação.
- **Migrações versionadas** (`server/src/store.js`, tabela `schema_version`): rodam em ordem, uma vez, numa
  transação cada. Bancos anteriores ao controle de versão são reconhecidos e atualizados.
- **Backup a quente**: `npm run backup -- --db cinzas.db --para backups --manter 14` (VACUUM INTO: foto
  consistente com o jogo rodando, confere a integridade e mantém só as 14 mais recentes). Agende de hora em hora.
- **Restaurar**: pare o servidor, troque o arquivo `.db` pela cópia (apague `-wal` e `-shm` antigos) e suba.

## 8.6 Testes e medições

| Comando (em `server/`) | O que faz | Tempo |
|---|---|---|
| `npm test` | Todas as suítes (aceitação M1–M3, snapshots, migrações, regras) no SQLite. | ~3 min |
| `npm run test:pg` | A mesma suíte no PostgreSQL: sobe um servidor temporário, um esquema por banco de teste, apaga no fim (§8.10). | ~3,5 min |
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
- **Godot headless** imprime `Parameter "m" is null` (renderizador dummy): inofensivo.

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

**Versões**: o `hello` traz `protocol` (3), `version` do servidor e `dataVersion` (hash dos dados); o cliente
recusa servidor de protocolo diferente com uma mensagem clara.

**Privacidade**: política em [PRIVACIDADE.md](PRIVACIDADE.md). Exclusão de conta pelo jogo (tela de
personagens) ou pelo serviço de contas apaga e-mail, senha, itens e missões na hora e anonimiza os nomes.

## 8.10 PostgreSQL

Em produção o banco é um **PostgreSQL central**; o SQLite fica para desenvolvimento e testes locais. A
escolha é pelo valor de `--db` (ou `CINZAS_DB`), no servidor de zona, no serviço de contas e nas ferramentas:
`postgres://...` ou `postgresql://...` → PostgreSQL; qualquer outra coisa → arquivo SQLite. A lógica do jogo
não muda: é o mesmo `Store` síncrono, com as mesmas transações, por uma ponte síncrona até um worker com
conexão dedicada (decisão e custo: D80).

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
- `?schema=nome` no fim da URL usa um esquema próprio em vez de `public` (criado se faltar).
- Os outros parâmetros da URL vão para o driver `pg` (ex.: `sslmode=verify-full` para TLS até o banco). Para
  usar a mesma URL no `pg_dump`/`pg_restore`, fique nos parâmetros que o libpq também entende (`sslmode`, `host`, `port`...).
- Banco na mesma rede do servidor: cada chamada espera a ida e volta (abaixo).

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
| `UNIQUE COLLATE NOCASE` (nomes), e-mail `COLLATE NOCASE` | índice único em `lower(...)`; buscas por `lower(coluna) = lower($1)` |
| `INSERT OR IGNORE`, `lastInsertRowid` | `ON CONFLICT DO NOTHING`, `RETURNING id` |
| `BEGIN IMMEDIATE` | `BEGIN` na conexão dedicada; `FOR UPDATE` ao pegar saque e tirar do depósito |
| `busy_timeout = 3000` | `lock_timeout = 3s`; `statement_timeout = 10s` |
| `rowid` implícito de `account_codes` | coluna `rid` (identidade) |

**Backup** (agende de hora em hora, como no SQLite):

```bash
npm run backup -- --db "$CINZAS_DB" --para backups --manter 14
```

Roda `pg_dump -Fc` (formato custom: comprimido, foto consistente de uma transação, sem parar o jogo), confere o
arquivo com `pg_restore --list` e mantém só as 14 cópias mais recentes (`backups/cinzas-AAAA-MM-DDTHH-MM-SS.dump`).
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
tabelas do PostgreSQL vazias, copia tudo numa transação com os mesmos ids, acerta as sequências e confere as
contagens. Nomes que só diferem em maiúsculas fora do ASCII (abaixo) fazem a importação falhar sem copiar nada.

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
um núcleo); memória ~30 MB maior (o worker e o `pg`). As
métricas `cinzas_db_calls_per_s`, `cinzas_db_wait_ms_per_s` e `cinzas_db_call_ms_p50|p99|max` (só com
PostgreSQL) mostram isso em produção; alerta sugerido: `db_call_ms_p99 > 5` ou `db_wait_ms_per_s > 50` por 5 min.

**Falhas**:
- Espera de trava acima de 3 s ou comando acima de 10 s viram erro (o pedido falha, o jogo segue). A ponte
  desiste em 15 s e troca worker e conexão; a transação em andamento morre com a conexão antiga.
- Conexão caída fora de transação: o comando em andamento falha e os seguintes reconectam sozinhos. Dentro de
  uma transação, ela falha inteira (nada é gravado pela metade) e o `COMMIT` vira erro — nunca um desfazer
  silencioso.
- Banco fora do ar: o que gravar no meio do tick lança erro e derruba a zona, como um disco cheio no SQLite; o
  supervisor (systemd/Docker) a reinicia e, enquanto o banco não volta, o servidor sai logo ao subir. Perde-se
  no máximo o progresso desde o último salvamento (10 s); saque, compras e missões são transações inteiras.

**Diferenças conhecidas** (o resto é igual, conferido pelos testes nos dois bancos):
- `lower()` segue o `LC_CTYPE` do banco: num locale UTF-8, "Élan" e "élan" são o mesmo nome; o `NOCASE` do
  SQLite só ignora maiúsculas no ASCII.
- Saques do mesmo abate (mesmo instante de criação) saem por id no PostgreSQL e na ordem de inserção no SQLite
  (só muda a ordem de exibição).
- Colunas inteiras recusam fração no PostgreSQL (o SQLite guardaria o número com fração): os dados do jogo
  usam só inteiros para ouro, quantidades e XP (o `npm run validate-data`, que também roda no `npm test`,
  recusa fração nesses campos) e o código arredonda vida e mana.
- Atualização com zonas antigas ainda no ar: se uma versão nova migrar o esquema, as zonas antigas preparam de
  novo as consultas sozinhas; mesmo assim, prefira parar tudo, subir a versão nova (migra) e depois o resto.

