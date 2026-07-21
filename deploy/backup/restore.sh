#!/bin/bash
# TASK-049 (AC-141, NFR-008): the documented, rehearsed restore procedure. Downloads a named dump
# from off-host storage, restores it onto the target database (clean or not — --clean --if-exists
# drops existing objects first, so this is safe to re-run), then proves the result with a real
# query. See DEPLOYMENT.md "Backups & restore" for the full runbook and RTO walkthrough.
#
# Usage: docker compose exec backup restore.sh <dump-filename>
#        (list available dumps first: docker compose exec backup rclone lsf "$BACKUP_S3_REMOTE")
set -euo pipefail

: "${DB_HOST:?}" "${DB_PORT:?}" "${DB_USERNAME:?}" "${DB_PASSWORD:?}" "${DB_NAME:?}"
: "${BACKUP_S3_REMOTE:?}"

DUMP_NAME="${1:?Usage: restore.sh <dump-filename>}"
LOCAL="/tmp/${DUMP_NAME}"

echo "[restore] downloading ${DUMP_NAME}"
rclone copyto "${BACKUP_S3_REMOTE}/${DUMP_NAME}" "$LOCAL"

echo "[restore] restoring into ${DB_NAME}@${DB_HOST} (this may take a while)"
PGPASSWORD="$DB_PASSWORD" pg_restore -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d "$DB_NAME" \
  --clean --if-exists --no-owner --no-privileges "$LOCAL"

rm -f "$LOCAL"

echo "[restore] verifying: migrations table is present and non-empty"
COUNT="$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d "$DB_NAME" -Atc 'SELECT count(*) FROM migrations;')"
if [ "$COUNT" -lt 1 ]; then
  echo "[restore] verification FAILED — migrations table is empty, restore did not apply the schema"
  exit 1
fi

echo "[restore] verification OK — ${COUNT} migration(s) applied, database is operational"
