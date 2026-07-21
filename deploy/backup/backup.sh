#!/bin/bash
# TASK-049 (AC-141, NFR-008): one daily backup cycle — dump, upload off-host, prune by retention.
# Invoked by cron (see entrypoint.sh) or manually: `docker compose exec backup backup.sh`.
set -euo pipefail

: "${DB_HOST:?}" "${DB_PORT:?}" "${DB_USERNAME:?}" "${DB_PASSWORD:?}" "${DB_NAME:?}"
: "${BACKUP_S3_REMOTE:?}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DUMP_FILE="/tmp/fms-backup-${STAMP}.dump"

echo "[backup] $(date -u -Iseconds) dumping ${DB_NAME}@${DB_HOST} -> ${DUMP_FILE}"
# -Fc (custom format): compressed, includes full schema + data, restorable with pg_restore onto a
# genuinely clean (unmigrated) database — no separate schema-only step needed.
PGPASSWORD="$DB_PASSWORD" pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d "$DB_NAME" -Fc -f "$DUMP_FILE"

echo "[backup] uploading to ${BACKUP_S3_REMOTE}/$(basename "$DUMP_FILE")"
rclone copyto "$DUMP_FILE" "${BACKUP_S3_REMOTE}/$(basename "$DUMP_FILE")"

rm -f "$DUMP_FILE"

echo "[backup] pruning dumps older than ${RETENTION_DAYS}d off-host"
rclone delete "$BACKUP_S3_REMOTE" --min-age "${RETENTION_DAYS}d"

echo "[backup] $(date -u -Iseconds) done"
