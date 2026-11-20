# Checklist do dono antes do teste público

O código, os testes e a implantação estão prontos no repositório. O que está aqui **não dá para fazer por
código**: depende de contas, contratos, dados pessoais ou decisões de produto do responsável pelo projeto.
Siga na ordem; cada item diz onde fica o passo técnico detalhado.

## 1. Publicar o código e gerar os pacotes

- [ ] Mesclar o PR no ramo padrão (`main`). Hoje o `main` só tem o commit inicial, e o disparo manual da
      Release só aparece depois disso.
- [ ] Rodar a **Release** à mão uma vez (Actions → Release → Run workflow) e abrir os pacotes de Windows,
      macOS e Linux em máquinas de verdade: o jogo abre, conecta e mostra a versão certa.
- [ ] Só então criar a tag da versão do teste (ex.: `v0.4.0-teste.1`). Passo a passo: [08-operacao §8.8,
      "Releases"](08-operacao.md#releases-releaseyml).

## 2. Máquina, domínio e endereço do jogo

- [ ] Uma máquina Linux com IP público, Docker 25+ (ou systemd) e as portas 80 e 443 abertas. Medido: 100
      jogadores numa zona usam ~7% de um núcleo e 144 MB; 1–2 vCPU e 2 GB sobram. De preferência perto dos
      testadores.
- [ ] Um domínio com registro A/AAAA apontando para ela.
- [ ] `deploy/.env` com `DOMINIO`, `CINZAS_TOKEN_SECRET` (`openssl rand -hex 32`) e `CINZAS_EMAIL=smtp` — o
      compose não sobe sem os três, e zona e contas recusam segredo curto ou de exemplo. Descomente o e-mail
      de aviso do certificado no `deploy/Caddyfile`.
- [ ] Variável do repositório **`SERVIDOR_PADRAO=wss://seu-dominio`** (Settings → Secrets and variables →
      Actions → Variables): sem ela, os pacotes abrem apontando para `ws://127.0.0.1:7777`.
- [ ] Primeira conta de administrador: criar e confirmar a conta pelo cliente e dar o papel `admin`
      ([08-operacao §8.8, "Antes de abrir o teste"](08-operacao.md#antes-de-abrir-o-teste)).

## 3. E-mail (sem ele ninguém entra)

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

- [ ] Escolher o canal dos alertas (e-mail, Telegram ou Discord) e preencher as credenciais no
      `deploy/.env` para o Alertmanager do perfil `monitoramento` ([08-operacao §8.3](08-operacao.md#83-métricas-e-saúde)).
- [ ] Um monitor externo de disponibilidade apontando para `https://seu-dominio/contas/saude` (se a máquina
      cair, o alerta interno cai junto).
- [ ] Quem da equipe responde a denúncias e `/bug` durante o teste (os mestres on-line recebem o aviso).

## 6. Backups fora da máquina

- [ ] Um destino fora da máquina (armazenamento de objetos ou outro servidor) e as credenciais dele; a
      retenção precisa caber nos 14 dias da política de privacidade.
- [ ] Um **ensaio de restauração** antes de abrir: restaurar a cópia mais recente numa máquina de teste e
      entrar com um personagem ([08-operacao §8.8, "Docker e Compose"](08-operacao.md#docker-e-compose)).

## 7. Assinatura dos executáveis (opcional, mas reduz desconfiança)

- [ ] **Windows**: certificado de assinatura (desde junho de 2023 ficam em token ou HSM: na prática, um serviço
      de assinatura em nuvem). O passo da Release hoje usa `.pfx` e precisa ser trocado pela ferramenta do
      provedor escolhido.
- [ ] **macOS**: conta paga no Apple Developer Program (Developer ID e notarização; 5 segredos no GitHub).
- [ ] Sem assinatura, avise os testadores sobre o SmartScreen e o Gatekeeper (o GUIA explica como passar).

## 8. Decisões de produto

- [ ] **Teste aberto ou por convite?** O repositório é público e a Release grava o servidor no cliente: quem
      achar o projeto entra. Teto de jogadores simultâneos (`CINZAS_MAX_PLAYERS`; a carga foi medida até 100
      numa zona).
- [ ] **Redistribuir atributos**: continua grátis durante o teste (D155) ou passa a custar um item (D22)?
- [ ] **Poderes de mestre voluntário**: hoje o papel `gm` modera e só `admin` cria ouro, itens e níveis
      (D138). Mudar isso é uma linha em `server/src/server.js`.
- [ ] **Arte definitiva** (D5): os monstros são montados por código e os personagens usam dois corpos VRM de
      exemplo. É investimento, não bloqueia o teste.

## Para acompanhar durante o teste

`npm run telemetria -- --db <banco>` (D171) mostra tempo por nível, onde se morre, onde os personagens param,
como vai o calabouço, quais missões são largadas e para onde vai o ouro. Pontos que já merecem olhar:
o Quebraferro era a classe que mais morria na simulação; no Ratos-Engrenagem da Oficina Soterrada pode faltar
alvo para a missão de 20 abates com muita gente; por classe, alguns níveis ficam fora de ±25% da meta embora
a média esteja dentro (`docs/relatorio-progressao.md`); e o desempenho do cliente nunca foi medido num
computador modesto (há o modo leve nas opções).
