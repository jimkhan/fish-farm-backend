# TASK-049 (MOD-01, AC-141, NFR-008): a dedicated backup service, isolated from the app tier —
# same "own deployable unit" philosophy as media-server (ADR-012). Built on postgres:15-alpine so
# pg_dump/pg_restore always match the server version exactly; rclone provides the off-host copy to
# any S3-compatible bucket (AWS S3, DigitalOcean Spaces, Backblaze B2, self-hosted MinIO, ...)
# through one endpoint/provider config, no cloud-specific SDK baked in.
FROM postgres:15-alpine

RUN apk add --no-cache rclone bash

COPY backup.sh restore.sh entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/restore.sh /usr/local/bin/entrypoint.sh

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
