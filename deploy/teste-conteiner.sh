#!/usr/bin/env bash
# Teste rápido de uma imagem do servidor: o mesmo no CI (ci.yml, job docker) e na release antes de publicar a
# imagem (release.yml, job imagem). Ver docs/08-operacao.md §8.8. Confere a saúde, o usuário sem privilégios,
# o "hello" do WebSocket com a versão esperada, o backup a quente e a parada graciosa (SIGTERM, código 0).
#
# Uso, na raiz do repositório:
#   deploy/teste-conteiner.sh <imagem> [versão esperada no hello]
# Sem a versão, o hello tem que trazer a do package.json da imagem (imagem construída sem CINZAS_VERSION).
# A porta de métricas publicada no 127.0.0.1 é a 9100 (CINZAS_TESTE_PORTA para outra). O registro do servidor
# fica em servidor-docker.log, na pasta atual.
set -euo pipefail

imagem=${1:?uso: deploy/teste-conteiner.sh <imagem> [versão esperada no hello]}
esperada=${2:-}
porta=${CINZAS_TESTE_PORTA:-9100}
nome="cinzas-teste-$$"

falha() {
  echo "::error title=Imagem do servidor::$1"
  exit 1
}
trap 'docker rm -f "$nome" > /dev/null 2>&1 || true' EXIT

docker run -d --name "$nome" -p "127.0.0.1:${porta}:9100" "$imagem" > /dev/null
estado=starting
for _ in $(seq 1 45); do
  estado=$(docker inspect -f '{{.State.Health.Status}}' "$nome")
  [ "$estado" = healthy ] && break
  sleep 2
done
if [ "$estado" != healthy ]; then
  docker logs "$nome" || true
  falha "o contêiner não ficou saudável (estado: $estado)"
fi
curl -fsS --noproxy '*' "http://127.0.0.1:${porta}/health"; echo

uid=$(docker exec "$nome" id -u)
[ "$uid" != 0 ] || falha "o servidor está rodando como root"
echo "usuário do serviço: uid $uid"

# versão que o hello tem que trazer: a da release (CINZAS_VERSION) ou, sem ela, a do package.json da imagem
if [ -z "$esperada" ]; then
  esperada=$(docker exec "$nome" node -p 'require("./package.json").version')
fi
# o WebSocket do jogo responde com "hello" (cliente WebSocket nativo do Node 22, dentro do contêiner)
docker exec -e ESPERADA="$esperada" "$nome" node -e '
  const ws = new WebSocket("ws://127.0.0.1:7777");
  const fim = (ok, msg) => { console.log(msg); process.exit(ok ? 0 : 1); };
  setTimeout(() => fim(false, "sem resposta do WebSocket"), 5000);
  ws.onerror = () => fim(false, "erro no WebSocket");
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.t !== "hello") return fim(false, "a primeira mensagem não é o hello: " + e.data);
    const ok = m.version === process.env.ESPERADA;
    fim(ok, "WebSocket: " + e.data + (ok ? "" : " (versão esperada: " + process.env.ESPERADA + ")"));
  };' || falha "o WebSocket não respondeu com o hello da versão $esperada"

# backup a quente dentro do contêiner (mesmo comando do guia de operação)
docker exec "$nome" npm run --silent backup -- --db /data/cinzas.db --para /data/backups

# parada graciosa: SIGTERM, o servidor salva e sai com código 0
docker stop -t 45 "$nome" > /dev/null
docker logs "$nome" > servidor-docker.log 2>&1
cat servidor-docker.log
grep -q "salvando e encerrando" servidor-docker.log || falha "o servidor não encerrou de forma graciosa"
codigo=$(docker inspect -f '{{.State.ExitCode}}' "$nome")
[ "$codigo" = 0 ] || falha "o servidor saiu com código $codigo"
grep -qF "CINZAS DO MERIDIANO ${esperada} — servidor ouvindo" servidor-docker.log \
  || falha "o registro de início não mostra a versão $esperada"
echo "Teste do contêiner: ok (versão $esperada)"
