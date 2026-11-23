# 10. Subir no VPS: do zero ao jogo no ar

Guia linear para pôr o teste público num VPS **Ubuntu 24.04 limpo**: Docker, firewall, domínio, e-mail, contas,
jogo, administrador, backups e o que fazer quando algo dá errado. O detalhe de cada peça está em
[08-operacao.md](08-operacao.md) (§8.8 implantação, §8.9 contas) e o que só o dono pode decidir, em
[09-checklist-do-dono.md](09-checklist-do-dono.md).

> **Como este guia foi conferido** (ensaio de 2026-11-23): cada comando abaixo rodou num ensaio da mesma
> implantação — Docker Compose do repositório, Caddy na frente, um SMTP de mentira com STARTTLS e senha (o mesmo
> caminho do Gmail na porta 587), o teste de fumaça do passo 9 e o cliente Godot de verdade pelo proxy. Os
> comandos de instalação e de firewall (passos 2 e 3) rodaram num contêiner `ubuntu:24.04` limpo (o `hello-world`,
> no Docker da máquina do ensaio). O que **não dá para
> testar fora do VPS** está marcado com **[não testado aqui]**: DNS de verdade, o certificado do Let's Encrypt,
> o envio de e-mail por um provedor real e a Release no GitHub. O ensaio usou `localhost` com a CA interna do
> Caddy no lugar do domínio.

No fim você terá: `https://SEU-DOMINIO/` com a página do jogo, o serviço de contas em `https://SEU-DOMINIO/contas`
(cadastro com e-mail, código de confirmação, login por token), o jogo em `wss://SEU-DOMINIO`, personagens, itens,
ouro e missões gravados no volume `dados` (SQLite) e um backup conferido de hora em hora.

## 1. A máquina

- **1 a 2 vCPU, 2 GB de memória, 20 GB de disco** bastam: 100 jogadores juntos numa zona usaram ~7% de um núcleo
  e 144 MB (§8.3); o resto da memória fica para o Docker, o Caddy, o serviço de contas e o backup.
- **Ubuntu 24.04 LTS**, IP público fixo, acesso SSH com `sudo` (ou como `root`). De preferência numa região perto
  dos testadores.
- Portas que precisam chegar à máquina: **22** (SSH), **80** (certificado e redirecionamento) e **443** (jogo,
  contas e página). Nada mais.

Entre na máquina **[não testado aqui]**: `ssh usuario@IP-DO-VPS`.

## 2. Instalar o Docker (comandos oficiais)

Os do site do Docker (*Install Docker Engine on Ubuntu*, repositório `apt`):

```bash
sudo apt update
sudo apt install -y ca-certificates curl git openssl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
sudo tee /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Signed-By: /etc/apt/keyrings/docker.asc
EOF
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo docker run --rm hello-world        # "Hello from Docker!"
docker compose version                   # Docker Compose version v5...
```

Os comandos deste guia usam `sudo docker ...`. Para não digitar `sudo`: `sudo usermod -aG docker $USER` e entre de
novo no SSH (quem está no grupo `docker` tem, na prática, acesso de administrador à máquina).

## 3. Firewall

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable  # sem a 22 liberada antes, o SSH cairia aqui
sudo ufw status verbose  # 22, 80 e 443 em ALLOW IN; o resto em deny (incoming)
```

- Se o provedor tem um **firewall no painel** (grupo de segurança), libere lá também 22, 80 e 443 **[não testado
  aqui]**.
- O Docker abre sozinho as portas que um contêiner publica, por fora do `ufw`. Por isso o compose só publica
  **80 e 443** para a internet; as métricas (9100 e 9101) ficam só em `127.0.0.1` e o jogo (7777) e as contas
  (7780) só na rede interna do compose. Não descomente o `7777:7777` do `docker-compose.yml`.

## 4. DNS

No painel do seu domínio, crie um **registro A**: `jogo.seudominio.com.br` → IP do VPS (e um **AAAA** com o IPv6,
se a máquina tiver) **[não testado aqui]**. Pode levar de minutos a horas para valer. Confira de qualquer lugar:

```bash
getent hosts jogo.seudominio.com.br     # tem que mostrar o IP do VPS
```

Sem isso o Caddy não consegue o certificado do Let's Encrypt (ele tenta de novo sozinho; não precisa reiniciar).

## 5. Baixar o jogo

```bash
cd ~
git clone https://github.com/rafaelallmark-commits/mmo.git
cd mmo
```

O ramo `main` precisa ter o código: mescle o PR antes (passo 1 do [09](09-checklist-do-dono.md)). Enquanto não
mesclar, clone o ramo de trabalho: `git clone -b NOME-DO-RAMO https://github.com/rafaelallmark-commits/mmo.git`.
Repositório privado: o `git clone` pede usuário e um *token* do GitHub no lugar da senha **[não testado aqui]**.

## 6. O arquivo `deploy/.env`

Tudo o que é desta máquina (domínio, segredo, e-mail) fica em `deploy/.env`, **fora do git** (está no
`.gitignore`; nunca o publique). Crie com os valores do passo 7 (o exemplo é o do Gmail):

```bash
cd ~/mmo/deploy
cat > .env <<'FIM'
DOMINIO=jogo.seudominio.com.br
CINZAS_EMAIL=smtp
CINZAS_SMTP_HOST=smtp.gmail.com
CINZAS_SMTP_PORT=587
CINZAS_SMTP_USER=seu.endereco@gmail.com
CINZAS_SMTP_PASS=abcdefghijklmnop
CINZAS_SMTP_FROM=Cinzas do Meridiano <seu.endereco@gmail.com>
CINZAS_VERSION=0.4.0-teste.1
FIM
echo "CINZAS_TOKEN_SECRET=$(openssl rand -hex 32)" >> .env
chmod 600 .env
sudo docker compose config --quiet && echo "configuração ok"
```

| Variável | O que é |
|---|---|
| `DOMINIO` | O nome do registro A do passo 4, sem `https://`. O Caddy pede o certificado para ele. |
| `CINZAS_TOKEN_SECRET` | Segredo que a zona e o serviço de contas dividem para assinar e conferir o token de login. A linha do `openssl rand -hex 32` gera um de 64 caracteres. Os dois serviços **recusam subir** com menos de 32 caracteres ou com o valor de exemplo. Trocá-lo só derruba logins em andamento. |
| `CINZAS_EMAIL` | `smtp` no teste público. (`arquivo` grava os e-mails em `/data/emails` e ninguém os recebe: só para ensaio.) |
| `CINZAS_SMTP_HOST`, `CINZAS_SMTP_PORT` | Servidor de envio do provedor. **587** = STARTTLS obrigatório (sem ele o envio falha em vez de mandar a senha às claras); **465** = TLS direto. |
| `CINZAS_SMTP_USER`, `CINZAS_SMTP_PASS` | Login do SMTP. Valor com `$`, `#` ou aspas vai entre aspas simples: `CINZAS_SMTP_PASS='a$b#c'`. |
| `CINZAS_SMTP_FROM` | Remetente que o jogador vê: `Nome <endereco@dominio>`. O domínio dele vai no EHLO; precisa ser um endereço que o provedor deixa você usar. |
| `CINZAS_VERSION` | A versão do servidor: a tag da Release do cliente (passo 11) **sem o `v`** (`v0.4.0-teste.1` → `0.4.0-teste.1`). Entra na imagem no `up --build` e aparece no `hello`, no registro de início e em cada `/bug`; sem a linha, o servidor diz `0.1.0` (a do `package.json`) e os relatos não dizem com que versão aconteceram. Só letras, números, `.`, `+`, `_` e `-`: um espaço ou aspas fazem o servidor recusar subir (o `--wait` mostra). |

Opcionais (o padrão serve): `CINZAS_MAX_PLAYERS` (teto de jogadores, 200), `CINZAS_SMTP_TLS`
(`direto`/`starttls`, força o modo), `CINZAS_SMTP_CA_ARQUIVO` (só para um servidor de e-mail próprio com
certificado de uma CA privada: as autoridades do arquivo se somam às públicas, a verificação nunca é desligada;
Gmail e provedores comerciais não precisam). `sudo docker compose config --quiet` acusa variável obrigatória que
faltou (`required variable CINZAS_TOKEN_SECRET is missing a value`).

## 7. E-mail (sem ele ninguém entra)

O cadastro manda um código de 6 dígitos; sem e-mail funcionando, nenhuma conta nova entra. Duas opções:

**Rápida — Gmail com senha de app** (boa para começar e para poucos testadores) **[não testado aqui com o Gmail
de verdade; o caminho STARTTLS + AUTH LOGIN na 587 foi testado com o SMTP de mentira]**:

1. Na conta Google que vai mandar os e-mails, ligue a **verificação em duas etapas**.
2. Em <https://myaccount.google.com/apppasswords>, crie uma senha de app (nome: Cinzas). Ela aparece em 4 grupos
   de 4 letras: use as 16 letras **sem espaços** em `CINZAS_SMTP_PASS`.
3. As variáveis são exatamente as do passo 6: `CINZAS_SMTP_HOST=smtp.gmail.com`, `CINZAS_SMTP_PORT=587`,
   `CINZAS_SMTP_USER` e o endereço de `CINZAS_SMTP_FROM` iguais ao seu Gmail (com outro remetente o Gmail troca o
   "De" pelo seu endereço).
4. Limites: uma conta gratuita manda algumas centenas de e-mails por dia; passou disso, os códigos param de sair
   até o dia seguinte.

**Recomendada — provedor de e-mail transacional** (Brevo, Amazon SES, Mailgun, Postmark, Resend...) **[não testado
aqui]**: cadastre e **verifique o domínio** no provedor e publique no DNS os registros que ele mostrar — **SPF**
(TXT na raiz), **DKIM** (TXT ou CNAME) e **DMARC** (TXT em `_dmarc`, por exemplo
`v=DMARC1; p=none; rua=mailto:voce@seudominio.com.br`). Sem os três os códigos caem no lixo eletrônico ou são
recusados. No `.env`: `CINZAS_SMTP_HOST` e a porta do provedor (587), o login e a chave SMTP dele em
`CINZAS_SMTP_USER`/`CINZAS_SMTP_PASS` e um remetente do domínio verificado (`Cinzas do Meridiano
<nao-responda@seudominio.com.br>`). Mande um código para um Gmail e um Outlook e confira que chega na caixa de
entrada.

**Porta bloqueada**: alguns provedores de VPS bloqueiam as portas de envio de e-mail em contas novas. Depois de
subir (passo 8), teste de dentro do contêiner das contas:

```bash
sudo docker compose exec contas node -e "require('net').connect(587,'smtp.gmail.com').setTimeout(5000,function(){console.log('sem resposta em 5 s: porta bloqueada no caminho');this.destroy()}).on('connect',function(){console.log('porta aberta');this.end()}).on('error',e=>console.log('falhou:',e.message))"
```

`porta aberta` é o esperado. Outra resposta: peça ao provedor do VPS para liberar a porta ou use a porta
alternativa do provedor de e-mail (muitos atendem também na 2525, com STARTTLS).

## 8. Subir

```bash
cd ~/mmo/deploy
sudo docker compose up -d --build --wait
sudo docker compose ps
```

A primeira vez constrói a imagem do servidor (alguns minutos). O `--wait` espera todos ficarem prontos e avisa se
algum não ficou. Os serviços sobem de novo sozinhos se o processo cair (`restart: unless-stopped`; conferido com
`kill -9` no ensaio) e depois de reiniciar o VPS, com o serviço do Docker ligado no boot pelo pacote
**[reinício do VPS não testado aqui]**. No `docker compose ps`, a coluna STATUS tem que mostrar **(healthy)** para `servidor`, `contas` e
`backup`, e `Up` para `proxy`. Nos registros (`sudo docker compose logs contas`), a linha que começa com
`e-mail: SMTP smtp.gmail.com:587 (STARTTLS obrigatório, com usuário e senha)` confirma a configuração do e-mail
(sem mostrar a senha).

## 9. Conferir

```bash
curl https://jogo.seudominio.com.br/contas/saude    # {"ok":true}; erro de certificado aqui = passo 14
curl http://127.0.0.1:9100/health                   # {"ok":true,...}: só de dentro da máquina
echo | openssl s_client -connect jogo.seudominio.com.br:443 -servername jogo.seudominio.com.br 2>/dev/null | openssl x509 -noout -issuer -enddate
```

O último mostra quem emitiu o certificado e até quando vale: no VPS, `issuer=C = US, O = Let's Encrypt, ...`
**[não testado aqui: o ensaio mostrou a CA interna do Caddy]**; o Caddy renova sozinho.

**Teste de fumaça** (`server/tools/fumaca-deploy.mjs`): joga pelo mesmo caminho dos jogadores, através do proxy —
página do jogo, métricas fora do alcance da internet, cadastro com o seu e-mail, código, sessão, zona, personagem,
andar, derrotar um Rato de Sulco, coletar o saque, ganhar ouro, equipar, aceitar uma missão, sair — e confere,
numa conexão nova, que o personagem voltou igual. Rode de dentro do contêiner do servidor (o arquivo do
`--estado` fica no volume de dados e sobrevive aos reinícios):

```bash
sudo docker compose exec servidor node tools/fumaca-deploy.mjs --url https://jogo.seudominio.com.br --email voce+fumaca1@gmail.com --estado /data/fumaca.json
```

Ele cria uma conta `fumaca_...`, para no passo do código e pergunta: digite o código que chegar no e-mail. Cada
passo sai como `[fumaça] ok N. ...`; a primeira falha sai como `[fumaça] FALHOU N. ...` com o motivo e onde olhar
(código de saída 1). O fim esperado é `[fumaça] TUDO CERTO`. O `+fumaca1` no endereço chega na mesma caixa do Gmail
e conta como outro endereço para o limite de 10 e-mails por dia.

Depois, o personagem tem que sobreviver a um reinício; a última conferência apaga a conta de teste e o arquivo:

```bash
sudo docker compose restart
sudo docker compose up -d --wait
sudo docker compose exec servidor node tools/fumaca-deploy.mjs --conferir /data/fumaca.json
sudo docker compose exec servidor node tools/fumaca-deploy.mjs --conferir /data/fumaca.json --excluir
```

O `restart` leva uns 35 s: o servidor avisa quem está jogando e espera 30 s antes de gravar e sair. Teste também
de um computador seu: o cliente com `wss://jogo.seudominio.com.br` no campo **Servidor**, *Criar conta*, código,
entrar, criar personagem.

## 10. A conta de administrador

1. Pelo cliente, como um jogador: *Criar conta*, digite o código do e-mail, entre e crie o personagem da equipe
   (nomes com GM, Admin e parecidos são recusados: a marca **[Equipe]** é que identifica a equipe no jogo).
2. Dê o papel (o nome da **conta**, não o do personagem):

   ```bash
   sudo docker compose exec servidor npm run conta -- --db /data/cinzas.db --conta SUA_CONTA --papel admin
   ```

3. Em até 60 s o jogo mostra "Seu papel na equipe mudou: agora você é administrador." e o personagem ganha
   **[Equipe]**, sem sair. Confira com `/gm onde SeuPersonagem` no chat; um jogador comum recebe "Comandos de
   mestre desativados.". A troca fica na auditoria:
   `sudo docker compose exec servidor npm run conta -- --db /data/cinzas.db --auditoria --tipo role_set --n 5`.

## 11. Distribuir o cliente

- **Release do GitHub** **[não testado aqui]**: em *Settings → Secrets and variables → Actions → Variables* do
  repositório, crie `SERVIDOR_PADRAO` = `wss://jogo.seudominio.com.br` **antes** da tag; depois
  `git tag v0.4.0-teste.1 && git push origin v0.4.0-teste.1`. A Release roda todos os testes e publica os pacotes
  de Windows, macOS e Linux com o campo **Servidor** já preenchido ([08 §8.8, "Releases"](08-operacao.md#releases-releaseyml)).
- **Sem Release nova**: o jogador digita `wss://jogo.seudominio.com.br` no campo **Servidor** da tela *Entrar*; o
  cliente lembra o endereço e usa `https://jogo.seudominio.com.br/contas` para as contas.
- A página `https://jogo.seudominio.com.br/` tem o link de download, o guia e os termos; troque o marcador
  `[e-mail da equipe]` (em `deploy/site/index.html` e `docs/GUIA.md`) pelo contato real.

## 12. Backups e restauração

O serviço `backup` copia o banco **de hora em hora** para `/data/backups`, confere cada cópia e guarda as 14 mais
recentes e a mais nova de cada dia (nada com mais de 14 dias). Ele fica `(healthy)` enquanto houver uma cópia
conferida das últimas 2 h.

```bash
sudo docker compose run --rm --no-deps servidor ls -l /data/backups                           # as cópias
sudo docker compose exec servidor npm run backup -- --db /data/cinzas.db --para /data/backups --manter 14 --diarias   # uma agora
```

**Levar uma cópia para fora da máquina** (um disco perdido leva o banco e os backups juntos):

```bash
sudo docker compose run --rm -T --no-deps servidor cat /data/backups/cinzas-AAAA-MM-DDTHH-MM-SS.db > cinzas-AAAA-MM-DDTHH-MM-SS.db
```

e do seu computador `scp usuario@IP-DO-VPS:cinzas-AAAA-MM-DDTHH-MM-SS.db .` **[não testado aqui]**. A cópia
automática para um balde S3 cifrado é o perfil `copia-externa` ([08 §8.8](08-operacao.md#backups-e-cópia-fora-da-máquina)).

**Restaurar** (volta o jogo inteiro ao momento da cópia; o que aconteceu depois se perde):

```bash
sudo docker compose stop servidor contas backup
sudo docker compose run --rm --no-deps servidor sh -c 'cp /data/backups/cinzas-AAAA-MM-DDTHH-MM-SS.db /data/cinzas.db && rm -f /data/cinzas.db-wal /data/cinzas.db-shm'
sudo docker compose start servidor contas backup
```

Uma cópia trazida de fora entra no volume com
`sudo docker compose run --rm -T --no-deps servidor sh -c 'cat > /data/backups/restaurar.db' < cinzas-AAAA-MM-DDTHH-MM-SS.db`
(use `/data/backups/restaurar.db` no `cp` acima e apague-a depois:
`sudo docker compose run --rm --no-deps servidor rm /data/backups/restaurar.db`). Faça o **ensaio de restauração**
antes de abrir o teste ([08 §8.8](08-operacao.md#ensaio-de-restauração)): no ensaio deste guia, um personagem
mudado depois da cópia voltou exatamente como estava nela.

## 13. Atualizar

```bash
cd ~/mmo
git pull
cd deploy
nano .env        # CINZAS_VERSION = a tag nova sem o "v" (ex.: 0.4.0-teste.2)
sudo docker compose up -d --build --wait
```

Troque o `CINZAS_VERSION` do `.env` a cada versão: é ele que o `hello` e o `/bug` mostram (passo 6). Quem está
jogando recebe o aviso de reinício e volta em seguida, com tudo o que estava gravado. Voltar para uma
versão anterior: `git checkout v0.4.0-teste.1` (a tag que funcionava), `CINZAS_VERSION=0.4.0-teste.1` no `.env` e o
mesmo `up -d --build --wait` **[não testado aqui: ainda não há tags]**. Rode o teste de fumaça (passo 9) depois de cada atualização e, de vez
em quando, `sudo docker image prune -f` para apagar as imagens antigas que os builds deixam.

## 14. Quando algo dá errado

| Sintoma | Comando | O que fazer |
|---|---|---|
| `https://DOMINIO` não abre, ou o navegador acusa certificado | `sudo docker compose logs proxy \| grep -iE "tls\|acme"` | DNS ainda não aponta para o VPS (`getent hosts DOMINIO`) ou a porta 80 está fechada (ufw, firewall do provedor). O Caddy tenta de novo sozinho. Não apague o volume `caddy_dados` (há limite de certificados por semana). |
| `docker compose up` falha com `port is already allocated` ou `address already in use` na 80 ou 443 | `sudo docker compose ps` | Outro servidor web veio instalado no VPS: pare-o (ex.: `sudo systemctl disable --now nginx` ou `apache2`) **[não testado aqui]** e suba de novo. |
| `required variable ... is missing a value` | `sudo docker compose config --quiet` | Falta uma variável no `deploy/.env` (passo 6). |
| `servidor` ou `contas` reiniciando sem parar | `sudo docker compose logs --tail 20 servidor contas` | A mensagem diz o motivo: segredo curto ou de exemplo (`openssl rand -hex 32`), `CINZAS_SMTP_FROM` vazio ou sem domínio, e assim por diante. Corrija o `.env` e `sudo docker compose up -d --wait`. |
| Teste de fumaça: `FALHOU ... o e-mail com o código NÃO saiu`; jogador: "Conta criada, mas o e-mail com o código não saiu agora" | `sudo docker compose logs contas \| grep "falha no envio"` | `SMTP 535` = usuário ou senha recusados (senha de app sem espaços, verificação em duas etapas ligada). `SMTP: tempo esgotado` ou `ECONNREFUSED` = porta bloqueada (teste do passo 7). `certificate`/`altnames` = `CINZAS_SMTP_HOST` errado. A conta já existe: depois de corrigir, o jogador usa *Confirmar e-mail → Reenviar código*. |
| O código chega no lixo eletrônico | — | SPF, DKIM e DMARC do domínio do remetente (provedor transacional, passo 7). |
| Cliente: "Serviço de contas indisponível (https://DOMINIO/contas)" | `sudo docker compose ps contas` e `curl https://DOMINIO/contas/saude` | `contas` fora do ar ou o campo Servidor do cliente com outro endereço. Só num computador, com o resto entrando: antivírus ou rede de empresa que inspeciona HTTPS (o cliente só aceita o certificado verdadeiro, D177; GUIA §3). |
| `servidor` aparece `(unhealthy)` | `curl http://127.0.0.1:9100/health` | `laço do jogo parado`: `sudo docker compose restart servidor` (os personagens voltam do último salvamento, de 10 s em 10 s; itens e ouro são gravados na hora). Se o processo cair sozinho, o Docker o sobe de novo. |
| `backup` aparece `(unhealthy)` | `sudo docker compose logs --tail 20 backup` | Não há cópia conferida há mais de 2 h: disco cheio (`df -h`) ou banco com defeito. |
| Jogador: "Servidor cheio (200 jogadores)" | `curl -s http://127.0.0.1:9100/metrics \| grep cinzas_max_players` | Suba o teto com `CINZAS_MAX_PLAYERS=N` no `.env` e `sudo docker compose up -d --wait servidor`. |
| Precisa ver tudo de uma vez | `sudo docker compose logs --since 10m` | Registros dos últimos 10 minutos de todos os serviços. |

Depois de tudo no ar, siga o resto do [checklist do dono](09-checklist-do-dono.md): alertas (perfil
`monitoramento`, §8.3), monitor externo de `https://DOMINIO/contas/saude`, cópia fora da máquina (perfil
`copia-externa`), termos e política preenchidos.
