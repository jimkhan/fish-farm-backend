#!/bin/bash
# TASK-049: one-time container setup — write rclone's S3-compatible remote config from env vars
# (no secrets baked into the image or checked into git, per CLAUDE.md #5), schedule the nightly
# backup via cron, then run crond in the foreground as PID 1.
set -euo pipefail

: "${BACKUP_S3_REMOTE:?}" "${BACKUP_S3_ACCESS_KEY_ID:?}" "${BACKUP_S3_SECRET_ACCESS_KEY:?}"

mkdir -p /root/.config/rclone
cat > /root/.config/rclone/rclone.conf <<EOF
[s3]
type = s3
provider = ${BACKUP_S3_PROVIDER:-Other}
access_key_id = ${BACKUP_S3_ACCESS_KEY_ID}
secret_access_key = ${BACKUP_S3_SECRET_ACCESS_KEY}
endpoint = ${BACKUP_S3_ENDPOINT:-}
region = ${BACKUP_S3_REGION:-}
EOF
chmod 600 /root/.config/rclone/rclone.conf

# busybox crond runs jobs with a near-empty environment, so persist the vars backup.sh/restore.sh
# need to a file the cron job sources explicitly.
env | grep -E '^(DB_|BACKUP_)' > /etc/backup.env
chmod 600 /etc/backup.env

SCHEDULE="${BACKUP_CRON_SCHEDULE:-0 2 * * *}"
echo "${SCHEDULE} . /etc/backup.env; /usr/local/bin/backup.sh >>/proc/1/fd/1 2>>/proc/1/fd/2" > /etc/crontabs/root

echo "[entrypoint] backup service ready — schedule: '${SCHEDULE}', remote: ${BACKUP_S3_REMOTE}"
exec crond -f -l 2
