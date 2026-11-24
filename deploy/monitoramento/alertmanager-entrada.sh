#!/bin/sh
# Entrada do Alertmanager (perfil "monitoramento" do deploy/docker-compose.yml). O modelo
# monitoramento/alertmanager.yml não guarda segredo nenhum: ao subir, este script troca cada ${NOME} pelo
# valor da variável NOME (que o compose traz do deploy/.env), deixa de fora os blocos "#@se NOME ... #@fim"
# cuja variável está vazia, confere o resultado com o amtool e sobe o Alertmanager. A configuração montada,
# com as senhas, fica só na memória do contêiner (/tmp em tmpfs).
#
#   ${NOME}      vira texto entre aspas simples do YAML (cada aspa do valor vira ''); variável vazia é erro
#   ${NOME:int}  vira o número como está (o chat_id do Telegram); precisa ser um inteiro
#   #@se NOME    as linhas até o #@fim correspondente só entram com NOME preenchida (pode aninhar)
#
#   sh alertmanager-entrada.sh [opções do alertmanager]   monta, confere e sobe
#   sh alertmanager-entrada.sh --gerar                    só imprime a configuração montada (com as senhas!)
# ALERTA_MODELO e ALERTA_SAIDA trocam o caminho do modelo e da configuração montada (testes).
set -eu
MODELO=${ALERTA_MODELO:-/etc/alertmanager/modelo.yml}
SAIDA=${ALERTA_SAIDA:-/tmp/alertmanager.yml}

# TLS do e-mail pela porta de ALERTA_SMTP_SERVIDOR (o modelo escolhe o bloco pelas duas variáveis abaixo): na 465
# a conexão já nasce cifrada (TLS direto, com o certificado conferido) e o servidor não anuncia STARTTLS, então
# require_tls fica desligado — ligado, o Alertmanager recusa todo envio; nas outras portas (587) o STARTTLS é
# obrigatório antes de autenticar.
case "${ALERTA_SMTP_SERVIDOR:-}" in
  *:465) ALERTA_SMTP_TLS_DIRETO=sim; ALERTA_SMTP_STARTTLS='' ;;
  *) ALERTA_SMTP_TLS_DIRETO=''; ALERTA_SMTP_STARTTLS=sim ;;
esac
export ALERTA_SMTP_TLS_DIRETO ALERTA_SMTP_STARTTLS

PROGRAMA=$(mktemp)
trap 'rm -f "$PROGRAMA"' EXIT

cat > "$PROGRAMA" <<'AWK'
BEGIN { prof = 0; fora = 0; erros = 0 }
function falha(msg) { print "alertmanager: " msg " (linha " NR " de " FILENAME ")" > "/dev/stderr"; erros++ }
{
  linha = $0
  if (linha ~ /^[ \t]*#@se[ \t]+[A-Z0-9_]+[ \t]*$/) {
    nome = linha
    sub(/^[ \t]*#@se[ \t]+/, "", nome)
    sub(/[ \t]*$/, "", nome)
    prof++
    ativo[prof] = (ENVIRON[nome] != "")
    if (!ativo[prof]) fora++
    next
  }
  if (linha ~ /^[ \t]*#@fim[ \t]*$/) {
    if (prof == 0) { falha("#@fim sem #@se"); next }
    if (!ativo[prof]) fora--
    prof--
    next
  }
  if (fora > 0) next
  # comentário: vai como está (os exemplos de ${NOME} do cabeçalho não são trocados)
  if (linha ~ /^[ \t]*#/) { print linha; next }
  saida = ""
  while (match(linha, /[$][{][A-Z0-9_]+(:int)?[}]/)) {
    ref = substr(linha, RSTART + 2, RLENGTH - 3)
    inteiro = sub(/:int$/, "", ref)
    valor = ENVIRON[ref]
    if (valor == "") falha("a variável " ref " está vazia: preencha no deploy/.env")
    else if (index(valor, "\n") > 0) falha("a variável " ref " tem quebra de linha")
    else if (inteiro && valor !~ /^-?[0-9]+$/) falha("a variável " ref " precisa ser um número inteiro")
    if (inteiro) troca = valor
    else { gsub(/'/, "''", valor); troca = "'" valor "'" }
    saida = saida substr(linha, 1, RSTART - 1) troca
    linha = substr(linha, RSTART + RLENGTH)
  }
  print saida linha
}
END {
  if (prof != 0) { print "alertmanager: #@se sem #@fim em " FILENAME > "/dev/stderr"; erros++ }
  if (erros) exit 1
}
AWK

if [ "${1:-}" = "--gerar" ]; then
  awk -f "$PROGRAMA" "$MODELO"
  exit $?
fi

umask 077
if ! awk -f "$PROGRAMA" "$MODELO" > "$SAIDA"; then
  echo "alertmanager: o modelo $MODELO não pôde ser montado (acima); confira as variáveis ALERTA_* no deploy/.env" >&2
  exit 1
fi
if ! amtool check-config "$SAIDA" >&2; then
  echo "alertmanager: a configuração montada não passou no amtool check-config (acima)" >&2
  exit 1
fi
rm -f "$PROGRAMA"
exec /bin/alertmanager --config.file="$SAIDA" --storage.path=/alertmanager "$@"
