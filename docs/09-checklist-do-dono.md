# Checklist do dono antes do teste público

O código, os testes e a implantação estão prontos no repositório. O que está aqui **não dá para fazer por
código**: depende de contas, contratos, dados pessoais ou decisões de produto do responsável pelo projeto.
Siga na ordem; cada item diz onde fica o passo técnico detalhado.

## 1. Publicar o código e gerar os pacotes

- [ ] Mesclar o PR no ramo padrão (`main`). Hoje o `main` só tem o commit inicial, e o disparo manual da
      Release só aparece depois disso.
- [ ] Rodar a **Release** à mão uma vez (Actions → Release → Run workflow) e abrir os pacotes de Windows,
      macOS e Linux em máquinas de verdade: o jogo abre, conecta e mostra a versão certa no rodapé do título
      (a Release roda o CI inteiro antes — testes no SQLite e no PostgreSQL, autotest do cliente e teste do
      contêiner — e só publica com tudo verde, D152). Confira também o ícone nas propriedades do `.exe`: não
      deu para conferir o `rcedit` fora do GitHub.
- [ ] Só então criar a tag da versão do teste (ex.: `v0.4.0-teste.1`). Passo a passo: [08-operacao §8.8,
      "Releases"](08-operacao.md#releases-releaseyml).

## 2. Máquina, domínio e endereço do jogo

O passo a passo, de um VPS Ubuntu 24.04 limpo até o jogo no ar (Docker, firewall, DNS, `.env`, e-mail, teste de
fumaça, administrador, backups e problemas comuns), está em **[10-subir-no-vps.md](10-subir-no-vps.md)**.

- [ ] Uma máquina Linux com IP público, Docker 25+ (ou systemd) e as portas 80 e 443 abertas. Medido: 100
      jogadores numa zona usam ~7% de um núcleo e 144 MB; 1–2 vCPU e 2 GB sobram. De preferência perto dos
      testadores.
- [ ] Um domínio com registro A/AAAA apontando para ela.
- [ ] `deploy/.env` com `DOMINIO`, `CINZAS_TOKEN_SECRET` (`openssl rand -hex 32`) e `CINZAS_EMAIL=smtp` — o
      compose não sobe sem os três, e zona e contas recusam segredo curto ou de exemplo. Descomente o e-mail
      de aviso do certificado no `deploy/Caddyfile`.
- [ ] Variável do repositório **`SERVIDOR_PADRAO=wss://seu-dominio`** (Settings → Secrets and variables →
      Actions → Variables) **antes da tag**: sem ela, os pacotes abrem apontando para `ws://127.0.0.1:7777`.
      `PAGINA_DOWNLOAD` só se a página de download não for a do jogo (`https://seu-dominio/`, D150).
- [ ] Página do jogo (`deploy/site/index.html`, servida pelo Caddy em `https://seu-dominio/`) e guia
      (`docs/GUIA.md`, em `/guia`): trocar o marcador **`[e-mail da equipe]`** pelo contato real e manter a
      seção *Avisos* em dia — os Termos e a Política dizem que mudanças são avisadas ali.
- [ ] Primeira conta de administrador: criar e confirmar a conta pelo cliente e dar o papel `admin`
      ([10, passo 10](10-subir-no-vps.md#10-a-conta-de-administrador); [08-operacao §8.8](08-operacao.md#primeira-conta-de-administrador)).
- [ ] **Teste de fumaça** no VPS passando, também depois de `docker compose restart`, com a conta de teste apagada
      no fim ([10, passo 9](10-subir-no-vps.md#9-conferir)).

## 3. E-mail (sem ele ninguém entra)

Para começar já, o Gmail com senha de app serve (variáveis exatas no [10, passo 7](10-subir-no-vps.md#7-e-mail-sem-ele-ninguém-entra));
para o teste aberto, um provedor transacional:

- [ ] Contratar um provedor de e-mail transacional e verificar o domínio do remetente.
- [ ] Publicar **SPF**, **DKIM** e **DMARC** no DNS (o provedor mostra os registros).
- [ ] Preencher `CINZAS_SMTP_HOST/PORT/USER/PASS/FROM` (porta 465 = TLS direto; 587 = STARTTLS obrigatório).
- [ ] Mandar um código para um endereço do Gmail e um do Outlook e conferir que chega na caixa de entrada.

## 4. Termos de uso e política de privacidade

- [ ] Preencher em `docs/TERMOS.md` e `docs/PRIVACIDADE.md` o **responsável** (nome ou razão social e CPF/CNPJ),
      o **e-mail de contato** (que também serve para contestar punições e para quem nem consegue abrir o
      jogo) e o **encarregado de dados**.
- [ ] Revisão jurídica, em especial: idade mínima de 13 anos só por autodeclaração e "autorização dos
      responsáveis" sem mecanismo (LGPD art. 14 e ECA Digital, Lei 15.211/2025); foro; provedores fora do
      Brasil (transferência internacional) se hospedagem ou e-mail ficarem fora.
- [ ] Depois de mudar os textos: subir `TERMS_VERSION` em `server/src/contas.js` (quem já tem conta aceita de
      novo ao entrar) e reconstruir a imagem, que leva os textos dentro.

## 5. Alguém precisa ser avisado

- [ ] Escolher o canal dos alertas (e-mail, Telegram ou Discord) e preencher as variáveis `ALERTA_*` no
      `deploy/.env` (`ALERTA_SMTP_*` e `ALERTA_EMAIL_PARA`, `ALERTA_TELEGRAM_TOKEN`/`_CHAT` ou
      `ALERTA_DISCORD_WEBHOOK`) para o Alertmanager do perfil `monitoramento`; subir com
      `docker compose --profile monitoramento up -d` e mandar o **alerta de teste** do guia
      ([08-operacao §8.3, "Alertas que chegam a alguém"](08-operacao.md#alertas-que-chegam-a-alguém)).
- [ ] Um monitor externo de disponibilidade (UptimeRobot, Better Stack, Healthchecks.io ou um Uptime Kuma em
      outra máquina) apontando para `https://seu-dominio/contas/saude`, esperando `200`: se a máquina cair, o
      alerta interno cai junto.
- [ ] Quem da equipe responde a denúncias e `/bug` durante o teste (os mestres on-line recebem o aviso).

## 6. Backups fora da máquina

O backup de hora em hora já roda sozinho no Compose (serviço `backup`, ou `backup-banco` com o PostgreSQL),
guardando as cópias dos últimos 14 dias na própria máquina (D148). Falta o que depende de conta:

- [ ] Um armazenamento compatível com S3 (Backblaze B2, Cloudflare R2, Wasabi, AWS...) com um balde só para
      isso, **sem versões antigas** guardadas pelo provedor (senão as cópias passam dos 14 dias da política
      de privacidade), e as variáveis `COPIA_DESTINO`, `COPIA_S3_*` e `COPIA_SENHA_CIFRA` no `deploy/.env`
      com o perfil `copia-externa` ([08-operacao §8.8, "Backups e cópia fora da máquina"](08-operacao.md#backups-e-cópia-fora-da-máquina)).
      Guarde a senha da cifra **fora** da máquina: sem ela, a cópia externa não serve para nada.
- [ ] Citar o provedor da cópia externa na Política de Privacidade (é um operador de dados).
- [ ] Um **ensaio de restauração** antes de abrir, seguindo o passo a passo
      ([08-operacao §8.8, "Ensaio de restauração"](08-operacao.md#ensaio-de-restauração)).

## 7. Assinatura dos executáveis (opcional, mas reduz desconfiança)

- [ ] **Windows**: certificado de assinatura (desde junho de 2023 ficam em token ou HSM: na prática, um serviço
      de assinatura em nuvem). O passo da Release hoje usa `.pfx` e precisa ser trocado pela ferramenta do
      provedor escolhido.
- [ ] **macOS**: conta paga no Apple Developer Program (Developer ID e notarização; 5 segredos no GitHub).
- [ ] Sem assinatura, avise os testadores sobre o SmartScreen, o Controle Inteligente de Aplicativos do Windows 11
      (que bloqueia sem opção de abrir mesmo assim) e o Gatekeeper (o GUIA explica o que fazer em cada um).

## 8. Decisões de produto

- [ ] **Teste aberto ou por convite?** O repositório é público e a Release grava o servidor no cliente: quem
      achar o projeto entra.
- [ ] **Teto de jogadores simultâneos**: `CINZAS_MAX_PLAYERS` vem com 200 no Compose (D149; a carga foi medida
      até 100 numa zona, com folga). Cheio, quem tenta entrar vê "Servidor cheio"; mestres e administradores
      entram sempre.
- [ ] **Redistribuir atributos**: continua grátis durante o teste (D155) ou passa a custar um item (D22)?
- [ ] **Poderes de mestre voluntário**: hoje o papel `gm` modera e só `admin` cria ouro, itens e níveis
      (D138). Mudar isso é uma linha em `server/src/server.js`.
- [ ] **Confirmação de conta travada de propósito**: quem souber o nome de uma conta ainda não confirmada pode gastar as
      20 tentativas de código dela em 24 h (D142). Se um testador reclamar, `npm run conta -- --conta nome
      --liberar-limites` destrava na hora; decida se o limite deve passar a contar só por endereço de IP.
- [ ] **Conta suspensa e os próprios dados**: a conta suspensa não chega à tela de personagens, então não baixa nem
      exclui os dados pelo jogo; continua podendo pelo serviço de contas (`POST /contas/dados` e `/contas/excluir`) e
      pelo contato da equipe. Confirme na revisão jurídica se isso basta (LGPD).
- [ ] **Arte definitiva** (D5): os monstros são montados por código e os personagens usam dois corpos VRM de
      exemplo. É investimento, não bloqueia o teste.

## Para acompanhar durante o teste

`npm run telemetria -- --db <banco>` (D171) mostra tempo por nível, onde se morre, onde os personagens param,
como vai o calabouço, quais missões são largadas e para onde vai o ouro. Pontos que já merecem olhar:
o Quebraferro era a classe que mais morria na simulação; no Ratos-Engrenagem da Oficina Soterrada pode faltar
alvo para a missão de 20 abates com muita gente; por classe, alguns níveis ficam fora de ±25% da meta embora
a média esteja dentro (`docs/relatorio-progressao.md`); e o desempenho do cliente nunca foi medido num
computador modesto (há o modo leve nas opções).
