#!/bin/sh
# Backup do PostgreSQL de CINZAS DO MERIDIANO de hora em hora: serviço "backup-banco" do
# deploy/docker-compose.yml (perfil "postgres"), na imagem postgres:17 — o pg_dump da mesma versão do servidor.
#
# Cada rodada: pg_dump -Fc (foto consistente de uma transação, com o jogo rodando) num arquivo .parcial,
# conferência com pg_restore --list e só então o nome final <banco>-AAAA-MM-DDTHH-MM-SS.dump (o mesmo nome do
# npm run backup). A rotação também é a mesma (D148): ficam as BACKUP_MANTER cópias mais recentes e a mais nova
# de cada dia (UTC), e nenhuma com mais de BACKUP_DIAS dias — a política de privacidade promete cópias
# substituídas em até 14 dias. A métrica do último backup vai para o coletor textfile do node-exporter
# (alertas de backup atrasado ou com falha: monitoramento/alertas.yml). Uma falha não apaga cópia nenhuma.
#
#   sh backup-postgres.sh            fica rodando: o próximo backup sai quando a cópia mais nova completa
#                                    BACKUP_A_CADA segundos (na hora, se não houver nenhuma recente)
#   sh backup-postgres.sh --uma-vez  um backup e a rotação, e sai (0 = conferido; 1 = falhou)
#
# Ambiente: PGHOST, PGPORT, PGUSER, PGDATABASE (a conexão, como no psql); BACKUP_SENHA_ARQUIVO (arquivo com a
# senha, o segredo senha_banco do compose; vazio = sem senha); BACKUP_DIR (/data/backups); BACKUP_MANTER (14);
# BACKUP_DIARIAS (1 = guarda também a mais nova de cada dia; 0 = só as BACKUP_MANTER); BACKUP_DIAS (14);
# BACKUP_A_CADA (3600 s); BACKUP_METRICA (arquivo .prom; vazio = sem métrica); BACKUP_ESQUEMA (só este esquema).
set -u

DIR=${BACKUP_DIR:-/data/backups}
MANTER=${BACKUP_MANTER:-14}
DIARIAS=${BACKUP_DIARIAS:-1}
DIAS=${BACKUP_DIAS:-14}
A_CADA=${BACKUP_A_CADA:-3600}
METRICA=${BACKUP_METRICA:-}
ESQUEMA=${BACKUP_ESQUEMA:-}
BANCO=${PGDATABASE:-cinzas}
PREFIXO=$(printf '%s' "$BANCO${ESQUEMA:+-$ESQUEMA}" | tr -c 'A-Za-z0-9_.-' '_')
PREFIXO_RE=$(printf '%s' "$PREFIXO" | sed 's/\./\\./g')

log() { printf '%s backup-banco: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
erro() { log "$*" >&2; }

for par in "BACKUP_MANTER=$MANTER" "BACKUP_DIAS=$DIAS" "BACKUP_A_CADA=$A_CADA"; do
  case "${par#*=}" in
    '' | *[!0-9]* | 0) erro "${par%%=*} precisa ser um número inteiro de 1 para cima (veio \"${par#*=}\")"; exit 2 ;;
  esac
done
case "$DIARIAS" in 0 | 1) ;; *) erro "BACKUP_DIARIAS precisa ser 0 ou 1 (veio \"$DIARIAS\")"; exit 2 ;; esac

if [ -n "${BACKUP_SENHA_ARQUIVO:-}" ]; then
  if [ ! -r "$BACKUP_SENHA_ARQUIVO" ]; then erro "não deu para ler a senha em $BACKUP_SENHA_ARQUIVO"; exit 2; fi
  PGPASSWORD=$(cat "$BACKUP_SENHA_ARQUIVO") # o arquivo inteiro sem as quebras de linha do fim, como a zona lê
  export PGPASSWORD
fi

# Cópias deste banco na pasta, da mais nova para a mais velha (só os nomes que o backup dá).
copias() {
  ls -1 "$DIR" 2>/dev/null | grep -E "^$PREFIXO_RE-[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}-[0-9]{2}-[0-9]{2}\.dump\$" | sort -r
}

# Hora (Unix) de uma cópia, tirada do nome (AAAA-MM-DDTHH-MM-SS, em UTC).
quando() {
  q=${1#"$PREFIXO"-}
  q=${q%.dump}
  date -u -d "${q%%T*} $(printf '%s' "${q#*T}" | tr - :)" +%s 2>/dev/null
}

# Valor de uma métrica na gravação anterior (0 sem arquivo ou sem a linha): uma falha mantém o último sucesso.
anterior() {
  v=''
  if [ -n "$METRICA" ] && [ -r "$METRICA" ]; then
    v=$(sed -n "s/^$1{[^}]*} \([0-9.e+-]*\)\$/\1/p" "$METRICA" | head -n 1)
  fi
  printf '%s\n' "${v:-0}"
}

linha() { printf '# HELP %s %s\n# TYPE %s gauge\n%s{db="postgres"} %s\n' "$1" "$2" "$1" "$1" "$3"; }

# Grava a métrica (os mesmos nomes e textos do tools/backup.mjs): sucesso falha tamanho duração cópias mais_velha.
# Arquivo temporário + mv: o coletor nunca lê um arquivo pela metade.
grava_metrica() {
  [ -n "$METRICA" ] || return 0
  mkdir -p "$(dirname "$METRICA")" 2>/dev/null
  tmp="$METRICA.$$.tmp"
  if {
    linha cinzas_backup_last_success_timestamp_seconds 'Hora (Unix, em segundos) do último backup conferido; 0 = nenhum ainda.' "$1"
    linha cinzas_backup_last_failure_timestamp_seconds 'Hora (Unix, em segundos) da última falha de backup; 0 = nenhuma.' "$2"
    linha cinzas_backup_last_size_bytes 'Tamanho do último backup conferido, em bytes.' "$3"
    linha cinzas_backup_last_duration_seconds 'Duração do último backup conferido, em segundos.' "$4"
    linha cinzas_backup_copies 'Cópias guardadas na pasta de backups depois da última rotação.' "$5"
    linha cinzas_backup_oldest_copy_timestamp_seconds 'Hora (Unix, em segundos) da cópia mais velha guardada; 0 = nenhuma.' "$6"
  } > "$tmp" 2>/dev/null && chmod 0644 "$tmp" && mv -f "$tmp" "$METRICA"; then
    return 0
  fi
  rm -f "$tmp"
  erro "aviso: não deu para gravar a métrica do backup em $METRICA"
}

# Rotação: ficam as MANTER mais recentes e (com DIARIAS=1) a mais nova de cada dia; nada com mais de DIAS dias.
# Deixa em GUARDADAS e MAIS_VELHA o que sobrou. Sobras de rodadas interrompidas (.parcial) com mais de 1 h saem.
rotacao() {
  limite=$(($(date -u +%s) - DIAS * 86400))
  n=0
  dias=' '
  GUARDADAS=0
  MAIS_VELHA=0
  for f in $(copias); do
    t=$(quando "$f") || continue
    n=$((n + 1))
    fica=0
    [ "$n" -le "$MANTER" ] && fica=1
    dia=${f#"$PREFIXO"-}
    dia=${dia%%T*}
    if [ "$DIARIAS" = 1 ]; then
      case "$dias" in *" $dia "*) ;; *) dias="$dias$dia "; fica=1 ;; esac
    fi
    [ "$t" -lt "$limite" ] && fica=0
    if [ "$fica" = 1 ]; then
      GUARDADAS=$((GUARDADAS + 1))
      MAIS_VELHA=$t
    else
      rm -f "$DIR/$f"
    fi
  done
  find "$DIR" -maxdepth 1 -name "$PREFIXO-*.dump.parcial" -mmin +60 -exec rm -f {} + 2>/dev/null
  return 0
}

falhou() {
  erro "backup falhou: $*"
  grava_metrica "$(anterior cinzas_backup_last_success_timestamp_seconds)" "$(date -u +%s)" \
    "$(anterior cinzas_backup_last_size_bytes)" "$(anterior cinzas_backup_last_duration_seconds)" \
    "$(anterior cinzas_backup_copies)" "$(anterior cinzas_backup_oldest_copy_timestamp_seconds)"
  return 1
}

uma_rodada() {
  inicio=$(date -u +%s)
  saida="$DIR/$PREFIXO-$(date -u +%Y-%m-%dT%H-%M-%S).dump"
  parcial="$saida.parcial"
  mkdir -p "$DIR" || { falhou "não deu para criar a pasta $DIR"; return 1; }
  # ${ESQUEMA:+...} sem aspas de propósito: sem esquema, nenhum argumento. umask 077: a cópia (e-mails, resumos de
  # senha) fica só do dono; rodando por "docker compose exec" a máscara herdada é 000 e o arquivo saía 0666.
  # shellcheck disable=SC2086
  if ! (umask 077 && pg_dump --format=custom --file "$parcial" ${ESQUEMA:+--schema "$ESQUEMA"}); then
    rm -f "$parcial"
    falhou "pg_dump do banco $BANCO (${PGHOST:-local}) não terminou (acima); nenhuma cópia antiga foi apagada"
    return 1
  fi
  if ! lista=$(pg_restore --list "$parcial"); then
    rm -f "$parcial"
    falhou "a cópia saiu ilegível para o pg_restore; nenhuma cópia antiga foi apagada"
    return 1
  fi
  tabelas=$(printf '%s\n' "$lista" | grep -c ' TABLE DATA ' || true)
  mv -f "$parcial" "$saida" || { rm -f "$parcial"; falhou "não deu para dar o nome final a $saida"; return 1; }
  tamanho=$(wc -c < "$saida" | tr -d ' ')
  rotacao
  fim=$(date -u +%s)
  log "backup: $saida ($tamanho bytes, pg_dump -Fc de $BANCO${ESQUEMA:+ esquema $ESQUEMA}, $tabelas tabelas com dados, conferido com pg_restore --list, $((fim - inicio)) s); $GUARDADAS cópias guardadas"
  grava_metrica "$fim" "$(anterior cinzas_backup_last_failure_timestamp_seconds)" "$tamanho" "$((fim - inicio))" "$GUARDADAS" "$MAIS_VELHA"
  return 0
}

if [ "${1:-}" = "--uma-vez" ]; then
  uma_rodada
  exit $?
fi

dorme=''
trap '[ -n "$dorme" ] && kill "$dorme" 2>/dev/null; log "encerrando."; exit 0' TERM INT

# métrica semeada com as cópias que já estão na pasta (volume novo ou arquivo apagado)
mais_nova=$(copias | head -n 1)
espera=0
if [ -n "$mais_nova" ]; then
  t=$(quando "$mais_nova") || t=0
  espera=$((t + A_CADA - $(date -u +%s)))
  [ "$espera" -lt 0 ] && espera=0
  if [ "$(anterior cinzas_backup_last_success_timestamp_seconds)" = 0 ]; then
    grava_metrica "$t" 0 "$(wc -c < "$DIR/$mais_nova" | tr -d ' ')" 0 "$(copias | wc -l | tr -d ' ')" "$(quando "$(copias | tail -n 1)")"
  fi
fi
quando_proximo='primeiro agora'
[ "$espera" -gt 0 ] && quando_proximo="próximo em $(((espera + 59) / 60)) min (cópia mais nova: $mais_nova)"
log "backup agendado: banco $BANCO${ESQUEMA:+ esquema $ESQUEMA} em ${PGHOST:-local} a cada $A_CADA s para $DIR (mantém $MANTER$([ "$DIARIAS" = 1 ] && printf ' e a mais nova de cada dia'), nada com mais de $DIAS dias)${METRICA:+; métrica em $METRICA}; $quando_proximo"

while :; do
  if [ "$espera" -gt 0 ]; then
    # em segundo plano, sem a saída do script: o TERM interrompe a espera na hora
    sleep "$espera" < /dev/null > /dev/null 2>&1 &
    dorme=$!
    wait "$dorme"
    dorme=''
  fi
  inicio_rodada=$(date -u +%s)
  uma_rodada || true
  espera=$((inicio_rodada + A_CADA - $(date -u +%s)))
  [ "$espera" -lt 1 ] && espera=1
done
