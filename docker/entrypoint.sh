#!/bin/sh
# TASK-048: waits for Postgres, runs migrations (never `synchronize`, per CLAUDE.md invariant #4
# and the module doc's own technical note), then starts the built app. One entrypoint for the
# `api` compose service — no separate migration-runner container.
set -e

echo "[entrypoint] waiting for postgres at ${DB_HOST}:${DB_PORT}..."
until node -e "
const net = require('net');
const socket = net.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT) });
socket.on('connect', () => { socket.end(); process.exit(0); });
socket.on('error', () => process.exit(1));
"; do
  sleep 1
done
echo "[entrypoint] postgres is reachable."

echo "[entrypoint] running migrations..."
npm run migration:run

echo "[entrypoint] starting api..."
exec node dist/main.js
