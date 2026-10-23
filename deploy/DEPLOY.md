# Deploy em VPS (nginx + systemd)

Alvo: `https://indicacao.barbeariavip.com.br`, no mesmo servidor do ERP, ao lado de outros sites servidos pelo nginx. O app roda como processo Node na porta local 3100; o nginx faz o proxy e o TLS.

## Pré-requisitos no servidor

| Item | Como verificar | Observação |
|---|---|---|
| Node.js 22 LTS | `node -v` | Se não houver: NodeSource ou `nvm` para o usuário do serviço |
| PostgreSQL 14+ | `psql --version` | Pode ser o Postgres do ERP (se for Postgres) ou uma instância nova. Alternativa: Docker `postgres:16` |
| nginx com `sites-enabled` | `nginx -v` | Já existe |
| certbot | `certbot --version` | Para o certificado Let's Encrypt |
| Usuário de serviço | `id bvip` | `useradd -r -m -s /bin/bash bvip` |
| Registro DNS A | `dig +short indicacao.barbeariavip.com.br` | Apontando para o IP do VPS |
| Porta 3100 livre | `ss -ltnp \| grep 3100` | Trocar em `deploy/*.service`, `nginx.conf` e `crontab.txt` se ocupada |

## Passo a passo (primeira vez)

```bash
# 1. código
sudo mkdir -p /var/www/barbearia-vip-landing && sudo chown bvip:bvip /var/www/barbearia-vip-landing
sudo -u bvip git clone https://github.com/joaorafaelvaz/barbearia-vip-landing /var/www/barbearia-vip-landing
cd /var/www/barbearia-vip-landing

# 2. banco
sudo -u postgres psql -c "CREATE USER bvip_landing WITH PASSWORD '<senha-forte>';" \
                      -c "CREATE DATABASE barbearia_vip_landing OWNER bvip_landing;"

# 3. variáveis (.env de produção; NUNCA commitar)
sudo -u bvip cp .env.example .env && sudo -u bvip nano .env
#   DATABASE_URL=postgresql://bvip_landing:<senha>@localhost:5432/barbearia_vip_landing
#   NEXT_PUBLIC_SITE_URL=https://indicacao.barbeariavip.com.br
#   BARBEARIA_VIP_CLIENT=http            BARBEARIA_VIP_API_URL=https://franquiabv.com.br
#   BARBEARIA_VIP_AUTH_SCHEME=none       (trocar quando a autenticação da API for lançada)
#   NEXT_PUBLIC_RECAPTCHA_SITE_KEY=...   RECAPTCHA_SECRET_KEY=...   RECAPTCHA_MIN_SCORE=0.5
#   IP_HASH_SALT, PIN_SALT, ADMIN_TOKEN, CRON_SECRET: gerar cada um com `openssl rand -hex 32`
#   remover DATABASE_URL_TEST e SEED_UNIT_PIN

# 4. primeiro build
sudo -u bvip bash -c 'npm ci && npx prisma migrate deploy && npm run build && cp -r public .next/standalone/public && cp -r .next/static .next/standalone/.next/static'

# 5. unidades e influencers
sudo -u bvip npm run unit:import -- docs/data/unidades.csv      # gera ../unidades-pins-<data>.csv: entregar às recepções e APAGAR
sudo -u bvip npm run influencer:add -- --slug <slug> --name "<nome>" --handle @<handle> --platform instagram

# 6. serviço
sudo cp deploy/barbearia-vip-landing.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now barbearia-vip-landing
curl -I http://127.0.0.1:3100/

# 7. nginx + TLS
sudo cp deploy/nginx.conf /etc/nginx/sites-available/indicacao.barbeariavip.com.br
sudo ln -s /etc/nginx/sites-available/indicacao.barbeariavip.com.br /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d indicacao.barbeariavip.com.br

# 8. cron de reprocessamento
sudo -u bvip crontab -e   # colar a linha de deploy/crontab.txt com o CRON_SECRET real

# 9. sudo sem senha só para reiniciar o serviço (usado pelo deploy.sh)
echo 'bvip ALL=(root) NOPASSWD: /bin/systemctl restart barbearia-vip-landing, /bin/journalctl -u barbearia-vip-landing *' | sudo tee /etc/sudoers.d/bvip-landing
```

## Atualizações

```bash
cd /var/www/barbearia-vip-landing && sudo -u bvip ./deploy/deploy.sh
```

## Checagens pós-deploy

- `https://indicacao.barbeariavip.com.br/` carrega; `/i/<slug>` redireciona com cookie; `/balcao/<slug>` aceita o PIN.
- `curl -H "Authorization: Bearer $CRON_SECRET" https://indicacao.barbeariavip.com.br/api/cron/sync-leads` devolve `{"ok":true,...}`.
- Compartilhar a URL no WhatsApp mostra a `og-image.png`.
- `sudo journalctl -u barbearia-vip-landing -f` sem erros de `recaptcha`, `prisma` ou `autenticação` da API.

## Observações

- Rate limit e bloqueio de PIN ficam em memória do processo: funciona porque há uma única instância. Não rodar em cluster/PM2 com várias cópias sem trocar por armazenamento compartilhado.
- O nginx define `X-Forwarded-For` com o IP real; o app depende disso para o hash de IP e para o rate limit.
- Backup: `pg_dump barbearia_vip_landing` diário (leads e vouchers vivem só aqui).
