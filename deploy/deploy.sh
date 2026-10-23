#!/usr/bin/env bash
# Deploy no VPS (rodar como o usuário dono da pasta, ex.: bvip):
#   cd /var/www/barbearia-vip-landing && ./deploy/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

BRANCH="${BRANCH:-main}"
echo "==> git pull origin $BRANCH"
git fetch origin "$BRANCH"
git checkout -q "$BRANCH"
git reset -q --hard "origin/$BRANCH"

echo "==> npm ci"
npm ci --no-audit --no-fund

echo "==> prisma migrate deploy"
npx prisma migrate deploy

echo "==> next build (standalone)"
npm run build

echo "==> copiando assets para .next/standalone"
rm -r -f .next/standalone/public .next/standalone/.next/static
cp -r public .next/standalone/public
cp -r .next/static .next/standalone/.next/static

echo "==> reiniciando serviço"
sudo systemctl restart barbearia-vip-landing
sleep 2
curl -fsS -o /dev/null -w "health: %{http_code}\n" http://127.0.0.1:3100/ || { echo "app não respondeu"; sudo journalctl -u barbearia-vip-landing -n 50 --no-pager; exit 1; }
echo "==> ok"
