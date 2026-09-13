#!/usr/bin/env bash
#
# Publica a API na Oracle. Roda NA VPS. O chamador grava o script em arquivo
# antes de executar — nunca `bash -s` com o script vindo por stdin:
#
#   ssh vps "cat > /tmp/pub.sh && bash /tmp/pub.sh <TAG>" < publicar-na-oracle.sh
#
# Vindo por stdin, o primeiro comando que lê stdin (`docker compose run`)
# engole o resto do script, e o bash encerra em EOF com status 0: a
# publicação para no meio se dizendo bem-sucedida.
#
# O código da release já precisa ter sido enviado para
# /opt/pixelvault/releases/<TAG> antes desta chamada.
#
# A VPS é compartilhada com outros produtos em produção: todo comando aqui é
# escopado em `pixelvault`. Nada de `docker system prune`, nada de `down -v`
# — o `-v` levaria junto o volume do PostgreSQL.
set -euo pipefail

TAG="${1:?Falta a TAG da release}"
RAIZ=/opt/pixelvault
REL="$RAIZ/releases/$TAG"
[ -d "$REL" ] || {
  echo "Release $TAG não foi enviada para $REL" >&2
  exit 1
}

ANTERIOR="$(readlink -f "$RAIZ/current" 2>/dev/null || true)"
echo "release anterior: ${ANTERIOR:-nenhuma}"
echo "release nova:     $REL"

compor() {
  docker compose --env-file "$RAIZ/.env" -f deploy/compose.yml "$@"
}

# Dez tentativas em 30s: o container já subiu com `--wait`, isto aqui é a
# segunda opinião pela porta publicada, que é por onde o Nginx fala.
saudavel() {
  for _ in $(seq 1 10); do
    if curl -fsS -m 5 -o /dev/null http://127.0.0.1:3400/health; then return 0; fi
    sleep 3
  done
  return 1
}

voltar_atras() {
  echo "::error::Publicação falhou. Voltando para ${ANTERIOR:-nenhuma release anterior}."
  if [ -n "${ANTERIOR:-}" ] && [ -d "$ANTERIOR" ]; then
    cd "$ANTERIOR"
    PIXELVAULT_RELEASE="$(basename "$ANTERIOR")" compor up -d --wait api
    echo "rollback concluído em $(basename "$ANTERIOR")"
  fi
  exit 1
}

cd "$REL"
export PIXELVAULT_RELEASE="$TAG"

echo "--- construindo a imagem ARM64 ---"
docker build -f deploy/Dockerfile.api -t "pixelvault-api:$TAG" .

# Antes de qualquer migration, sempre. É o que permite voltar atrás de um
# schema que já mudou — o rollback de container não desfaz ALTER TABLE.
echo "--- backup do PostgreSQL ---"
mkdir -p "$RAIZ/backups"
BACKUP="$RAIZ/backups/pixelvault-$(date +%Y%m%d-%H%M%S)-pre-$TAG.sql.gz"
docker exec pixelvault-postgres-1 pg_dump -U pixelvault -d pixelvault | gzip >"$BACKUP"
gzip -t "$BACKUP"
ls -lh "$BACKUP"

# Sem rollback aqui de propósito: se a migration falhar, a API antiga continua
# no ar e o banco fica no último estado bom. Trocar o container por cima disso
# só transformaria um problema em dois.
echo "--- migrations ---"
# -T e </dev/null para o compose não disputar stdin com ninguém.
compor run --rm -T api pnpm --filter @pixelvault/database db:deploy </dev/null

echo "--- subindo a API ---"
if compor up -d --wait api && saudavel; then
  ln -sfn "$REL" "$RAIZ/current"
  echo "publicado: $TAG"
else
  voltar_atras
fi

# Faxina escopada. `|| true` porque disco cheio no futuro não é motivo para
# reprovar uma publicação que já deu certo.
echo "--- limpeza ---"
{
  find "$RAIZ/releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' |
    sort -rn | tail -n +6 | cut -d' ' -f2- | xargs -r rm -rf
  find "$RAIZ/backups" -name '*.sql.gz' -printf '%T@ %p\n' |
    sort -rn | tail -n +11 | cut -d' ' -f2- | xargs -r rm -f
  docker images --filter 'reference=pixelvault-api' --format '{{.CreatedAt}}\t{{.Repository}}:{{.Tag}}' |
    sort -r | tail -n +4 | cut -f2 | xargs -r docker rmi
} || true

docker ps --filter name=pixelvault --format '{{.Names}} | {{.Image}} | {{.Status}}'

# Último marcador: se a publicação morrer no meio, a ausência desta linha
# denuncia — foi assim que o bug do stdin apareceu.
echo "PUBLICACAO-CONCLUIDA $TAG"
