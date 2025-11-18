#!/usr/bin/env bash
set -euo pipefail

cd /home/ec2-user/deploy/cineverse || { echo "Cannot cd to /home/ec2-user/deploy/cineverse"; exit 1; }

echo "=== Docker check ==="
if command -v docker >/dev/null 2>&1; then
  echo "Docker already installed: $(docker --version 2>/dev/null || true)"
else
  echo "Installing Docker (yum)..."
  sudo yum update -y
  sudo yum install -y docker
fi

sudo systemctl enable --now docker || sudo service docker start || true
sleep 2

echo "=== Docker version ==="
docker --version || true

echo "=== Compose plugin check ==="
if ! docker compose version >/dev/null 2>&1; then
  echo "Installing docker compose plugin"
  sudo mkdir -p /usr/local/libexec/docker/cli-plugins
  sudo curl -fSL "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" \
    -o /usr/local/libexec/docker/cli-plugins/docker-compose
  sudo chmod +x /usr/local/libexec/docker/cli-plugins/docker-compose
  sudo ln -sf /usr/local/libexec/docker/cli-plugins/docker-compose /usr/local/bin/docker-compose || true
fi

docker compose version || docker-compose --version || true

echo "=== Pulling images (best-effort) ==="
docker pull pihu27/finalproject-backend:latest || true
docker pull pihu27/finalproject-frontend:latest || true
docker pull pihu27/cineverse-backend:latest || true
docker pull pihu27/cineverse-frontend:latest || true

echo "=== Starting docker compose ==="
sudo docker compose -f docker-compose.yml up -d --remove-orphans

sleep 6

echo "=== docker ps ==="
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"

echo "=== docker compose ps ==="
sudo docker compose -f docker-compose.yml ps || true

echo "=== backend logs (tail200) ==="
sudo docker compose -f docker-compose.yml logs --tail=200 backend || true

echo "=== frontend logs (tail200) ==="
sudo docker compose -f docker-compose.yml logs --tail=200 frontend || true

# Postgres readiness
PG=$(docker ps --filter "ancestor=postgres:15-alpine" --format '{{.Names}}' | head -n1)
if [ -n "$PG" ]; then
  echo "=== pg_isready for $PG ==="
  docker exec -u postgres "$PG" pg_isready -U postgres || true
else
  echo "No postgres container found by image filter."
fi

echo "=== backend HTTP health ==="
curl -sS --max-time 5 http://localhost:8001/health || curl -sS --max-time 5 http://localhost:8001/ || echo "no health response"

echo "=== DEPLOY SCRIPT FINISHED ==="
