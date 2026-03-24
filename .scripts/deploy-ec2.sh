#!/bin/bash

set -euo pipefail

APP_PORT="${PORT:-4953}"
APP_IMAGE_VALUE="${APP_IMAGE:-}"

if [ -z "$APP_IMAGE_VALUE" ]; then
  echo "APP_IMAGE is required"
  exit 1
fi

if docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD="docker-compose"
else
  echo "Docker Compose is not installed"
  exit 1
fi

echo "Using compose command: $COMPOSE_CMD"
echo "Deploying image: $APP_IMAGE_VALUE"

mkdir -p .deploy-backups
BACKUP_FILE=".deploy-backups/compose-$(date +%Y%m%d-%H%M%S).yml"
$COMPOSE_CMD config > "$BACKUP_FILE" || true

echo "Pulling latest application image..."
$COMPOSE_CMD pull app

echo "Ensuring MongoDB and Redis are running..."
$COMPOSE_CMD up -d mongodb redis

echo "Recreating application container..."
$COMPOSE_CMD up -d --no-deps app

echo "Waiting for health endpoint..."
for attempt in $(seq 1 30); do
  if curl -fsS "http://localhost:${APP_PORT}/health" >/dev/null 2>&1; then
    echo "Application is healthy"
    exit 0
  fi

  if [ "$attempt" -eq 30 ]; then
    echo "Application failed health check"
    $COMPOSE_CMD logs app --tail=100 || true
    exit 1
  fi

  echo "Waiting... (${attempt}/30)"
  sleep 2
done
