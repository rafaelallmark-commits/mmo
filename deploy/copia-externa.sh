#!/bin/sh
# Cópia das cópias de segurança para fora da máquina: serviço "copia-externa" do deploy/docker-compose.yml
# (perfil "copia-externa", desligado por padrão), na imagem rclone/rclone. Um disco perdido leva o banco e os
# backups juntos; com isto, as cópias de /data/backups (SQLite e PostgreSQL) vão de hora em hora para um
# armazenamento compatível com S3.
#
# "rclone sync" espelha a pasta: o que a rotação apaga aqui some lá também, então o destino segue os 14 dias
# da política de privacidade — desde que o balde não guarde versões antigas dos arquivos apagados (veja
# docs/08-operacao.md §8.8: no Backblaze B2, "Keep only the last version"; no S3, versionamento desligado ou
# regra de ciclo de vida). Os arquivos vão cifrados com COPIA_SENHA_CIFRA (rclone crypt, nomes inclusive): o
# provedor não lê e-mails nem personagens. Guarde essa senha fora da máquina: sem ela, a cópia não volta. Sem a
# senha o serviço não sobe, a menos que COPIA_SEM_CIFRA=sim diga que é de propósito (D148).
#
#   sh copia-externa.sh                fica rodando: uma cópia agora e outra a cada COPIA_A_CADA segundos
#   sh copia-externa.sh --uma-vez      uma cópia e sai
#   sh copia-externa.sh listar         lista as cópias que estão no destino
#   sh copia-externa.sh baixar ARQUIVO escreve a cópia ARQUIVO (já decifrada) na saída padrão:
#     docker compose run --rm -T copia-externa baixar cinzas-AAAA-MM-DDTHH-MM-SS.db > cinzas-AAAA-MM-DDTHH-MM-SS.db
#
# Ambiente: COPIA_DESTINO (balde/pasta no remoto "externo", que o compose define com as variáveis
# RCLONE_CONFIG_EXTERNO_*), COPIA_A_CADA (3600), COPIA_SENHA_CIFRA (ou COPIA_SEM_CIFRA=sim), COPIA_ORIGEM
# (/dados/backups), COPIA_METRICA (arquivo .prom do node-exporter; vazio = sem métrica).
set -u
DESTINO=${COPIA_DESTINO:-}
A_CADA=${COPIA_A_CADA:-3600}
ORIGEM=${COPIA_ORIGEM:-/dados/backups}
METRICA=${COPIA_METRICA:-}

log() { printf '%s copia-externa: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }

if [ -z "$DESTINO" ]; then
  log "defina COPIA_DESTINO (balde/pasta, ex.: cinzas-backups/teste) e as COPIA_S3_* no deploy/.env (docs/08-operacao.md §8.8)"
  exit 2
fi
case "$A_CADA" in '' | *[!0-9]* | 0) log "COPIA_A_CADA precisa ser um número de segundos (veio \"$A_CADA\")"; exit 2 ;; esac

ALVO="externo:$DESTINO"
if [ -n "${COPIA_SENHA_CIFRA:-}" ]; then
  # remoto "cifrado" por cima do "externo": o rclone cifra antes de mandar e decifra ao baixar
  RCLONE_CONFIG_CIFRADO_TYPE=crypt
  RCLONE_CONFIG_CIFRADO_REMOTE="externo:$DESTINO"
  RCLONE_CONFIG_CIFRADO_PASSWORD=$(printf '%s' "$COPIA_SENHA_CIFRA" | rclone obscure -) || { log "rclone obscure falhou"; exit 2; }
  export RCLONE_CONFIG_CIFRADO_TYPE RCLONE_CONFIG_CIFRADO_REMOTE RCLONE_CONFIG_CIFRADO_PASSWORD
  ALVO="cifrado:"
elif [ "${COPIA_SEM_CIFRA:-}" != sim ]; then
  log "defina COPIA_SENHA_CIFRA (openssl rand -hex 24; guarde fora da máquina) no deploy/.env: as cópias têm e-mails e resumos de senha. Para mandar sem cifra, sabendo que o provedor lê os dados, COPIA_SEM_CIFRA=sim"
  exit 2
fi

case "${1:-}" in
  listar) exec rclone lsl "$ALVO" ;;
  baixar)
    [ -n "${2:-}" ] || { log "uso: baixar ARQUIVO (veja os nomes com: listar)"; exit 2; }
    case "$ALVO" in
      *:) exec rclone cat "$ALVO$2" ;; # raiz do remoto cifrado
      *) exec rclone cat "$ALVO/$2" ;;
    esac
    ;;
esac

grava_metrica() { # sucesso falha
  [ -n "$METRICA" ] || return 0
  tmp="$METRICA.$$.tmp"
  if printf '# HELP %s %s\n# TYPE %s gauge\n%s %s\n# HELP %s %s\n# TYPE %s gauge\n%s %s\n' \
    cinzas_offsite_copy_last_success_timestamp_seconds 'Hora (Unix, em segundos) da última cópia para fora da máquina que terminou bem; 0 = nenhuma.' \
    cinzas_offsite_copy_last_success_timestamp_seconds cinzas_offsite_copy_last_success_timestamp_seconds "$1" \
    cinzas_offsite_copy_last_failure_timestamp_seconds 'Hora (Unix, em segundos) da última cópia para fora da máquina que falhou; 0 = nenhuma.' \
    cinzas_offsite_copy_last_failure_timestamp_seconds cinzas_offsite_copy_last_failure_timestamp_seconds "$2" \
    > "$tmp" 2>/dev/null && chmod 0644 "$tmp" && mv -f "$tmp" "$METRICA"; then
    return 0
  fi
  rm -f "$tmp"
  log "aviso: não deu para gravar a métrica em $METRICA"
}

# Valor de uma métrica na gravação anterior (0 sem arquivo ou sem a linha): reiniciar o contêiner e falhar logo na
# primeira tentativa não apaga a hora do último sucesso (o alerta CopiaExternaAtrasada dispararia na hora).
anterior() {
  v=''
  if [ -n "$METRICA" ] && [ -r "$METRICA" ]; then
    v=$(sed -n "s/^$1 \([0-9][0-9]*\)\$/\1/p" "$METRICA" | head -n 1)
  fi
  printf '%s\n' "${v:-0}"
}

# Só as cópias com o nome que os backups dão (<banco>-AAAA-MM-DDTHH-MM-SS.db do SQLite e .dump do PostgreSQL), as
# mesmas que a rotação de 14 dias apaga: o .parcial de um backup em andamento e qualquer outro arquivo da pasta (a
# cópia trazida para um ensaio de restauração, um .db guardado à mão) não saem da máquina — lá ficariam para sempre.
PADRAO='*-[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]-[0-9][0-9]-[0-9][0-9].{db,dump}'

ultimo_sucesso=$(anterior cinzas_offsite_copy_last_success_timestamp_seconds)
ultima_falha=$(anterior cinzas_offsite_copy_last_failure_timestamp_seconds)
uma_copia() {
  if rclone sync "$ORIGEM" "$ALVO" --include "$PADRAO" --stats 0 -v; then
    ultimo_sucesso=$(date -u +%s)
    log "cópia em $ALVO em dia ($(ls -1 "$ORIGEM" 2>/dev/null | grep -cE -- '-[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}-[0-9]{2}-[0-9]{2}\.(db|dump)$') cópias na origem)"
    grava_metrica "$ultimo_sucesso" "$ultima_falha"
    return 0
  fi
  ultima_falha=$(date -u +%s)
  log "a cópia para $ALVO falhou (acima); tento de novo em $A_CADA s"
  grava_metrica "$ultimo_sucesso" "$ultima_falha"
  return 1
}

if [ "${1:-}" = "--uma-vez" ]; then
  uma_copia
  exit $?
fi

[ -n "${COPIA_SENHA_CIFRA:-}" ] || log "aviso: COPIA_SEM_CIFRA=sim: as cópias vão sem cifra (e-mails e resumos de senha legíveis no provedor)"
dorme=''
trap '[ -n "$dorme" ] && kill "$dorme" 2>/dev/null; log "encerrando."; exit 0' TERM INT
log "cópia de $ORIGEM para $ALVO a cada $A_CADA s"
while :; do
  uma_copia || true
  # em segundo plano, sem a saída do script: o TERM interrompe a espera na hora
  sleep "$A_CADA" < /dev/null > /dev/null 2>&1 &
  dorme=$!
  wait "$dorme"
  dorme=''
done
