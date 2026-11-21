# syntax=docker/dockerfile:1
# Imagem do servidor de zona de CINZAS DO MERIDIANO (teste público) — a mesma imagem roda o serviço de
# contas (src/contas-main.js; ver o docker-compose.yml). Construa na raiz do repositório:
#   docker build -f deploy/Dockerfile -t cinzas-servidor .
#   docker run -d --name cinzas -p 7777:7777 -p 127.0.0.1:9100:9100 -v cinzas-dados:/data \
#     --stop-timeout 45 cinzas-servidor
# O banco SQLite fica no volume /data (CINZAS_DB; com postgres://... o banco é o PostgreSQL, §8.11). A
# porta 9100 (métricas e saúde) nunca deve ir para a internet: no docker-compose.yml ela só é publicada
# no 127.0.0.1 do host. Ver docs/08-operacao.md §8.8.
FROM node:22-bookworm-slim

LABEL org.opencontainers.image.title="cinzas-servidor" \
      org.opencontainers.image.description="Servidor de zona de CINZAS DO MERIDIANO"

# CINZAS_DB: arquivo SQLite no volume (padrão) ou postgres://... (zona, contas e ferramentas leem daqui)
ENV NODE_ENV=production \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    CINZAS_DB=/data/cinzas.db

WORKDIR /opt/cinzas

# Dependências primeiro: esta camada só é refeita quando package.json/package-lock.json mudam.
COPY server/package.json server/package-lock.json server/
RUN cd server && npm ci --omit=dev --no-audit --no-fund && rm -rf /root/.npm

# Dados do jogo (o servidor lê ../../data a partir de server/src) e o código do servidor.
# O .dockerignore da raiz deixa de fora node_modules, testes, bancos e o resto do repositório.
COPY data/ data/
COPY server/ server/
# Termos de uso e política de privacidade: o serviço de contas os serve em GET /termos e /privacidade.
COPY docs/TERMOS.md docs/PRIVACIDADE.md docs/

# Usuário sem privilégios (uid/gid 10001). O código fica do root (só leitura para o serviço);
# o único lugar gravável é /data. Para montar uma pasta do host em /data: chown 10001:10001 nela.
RUN groupadd --gid 10001 cinzas \
 && useradd --uid 10001 --gid cinzas --create-home --home-dir /home/cinzas --shell /usr/sbin/nologin cinzas \
 && mkdir -p /data \
 && chown cinzas:cinzas /data
VOLUME /data
USER cinzas
WORKDIR /opt/cinzas/server

# 7777: WebSocket do jogo (atrás do proxy TLS). 9100: métricas Prometheus e /health (só rede interna).
EXPOSE 7777 9100

# Versão da implantação (hello, log de início e /bug): a release passa a tag sem o "v", com o sufixo
# (--build-arg CINZAS_VERSION=0.4.0-teste.2). Vazia, o servidor usa a do package.json. Fica no fim para uma
# versão nova não refazer as camadas das dependências.
ARG CINZAS_VERSION=
ENV CINZAS_VERSION=${CINZAS_VERSION}

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --start-interval=2s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:9100/health',{signal:AbortSignal.timeout(4000)}).then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]

# SIGTERM: o servidor salva todos os personagens e fecha o banco antes de sair (dê ~45 s de prazo).
STOPSIGNAL SIGTERM
CMD ["node", "--disable-warning=ExperimentalWarning", "src/main.js", "--port", "7777", "--metrics-port", "9100", "--metrics-host", "0.0.0.0"]
