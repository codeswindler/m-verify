# M-Verify Live Deployment

This is the production path for a central hosted M-Verify service:

- API: `https://api.your-domain.com`
- Admin panel: `https://admin.your-domain.com`
- Desktop installer: built with `VITE_API_BASE_URL=https://api.your-domain.com`
- Daraja C2B callbacks: pointed to the public API domain

## 1. Prepare A Server

Use an Ubuntu VPS with at least:

- 2 vCPU
- 2 GB RAM
- 30 GB SSD
- Docker and Docker Compose plugin
- Public ports `80` and `443` open

Point DNS records to the server:

```text
api.your-domain.com    A    <server-ip>
admin.your-domain.com  A    <server-ip>
```

## 2. Configure Production Environment

On the server:

```bash
git clone https://github.com/codeswindler/m-verify.git m-verify
cd m-verify
cp .env.production.example .env.production
nano .env.production
```

Set real values for:

- `API_DOMAIN`
- `ADMIN_DOMAIN`
- `ACME_EMAIL`
- `PUBLIC_API_BASE_URL`
- `VITE_API_BASE_URL`
- `CORS_ORIGINS`
- `MYSQL_PASSWORD`
- `MYSQL_ROOT_PASSWORD`
- `JWT_SECRET`
- `CREDENTIAL_ENCRYPTION_KEY`
- `DARAJA_CALLBACK_SECRET`
- `SEED_ADMIN_PASSWORD`

Generate secrets with:

```bash
openssl rand -base64 48
```

## 3. Start The Live Stack

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

Check status:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
curl https://api.your-domain.com/health
```

The Caddy container automatically requests and renews HTTPS certificates.

## 4. Create The First Platform Admin

Run the seed after the API is healthy:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml exec api node apps/api/dist/scripts/seed.js
```

Then sign in at:

```text
https://admin.your-domain.com
```

## 5. Configure Businesses And Daraja

In the admin panel:

1. Create a business.
2. Set its commission.
3. Save its M-Pesa shortcode and Daraja credentials.
4. Copy the generated C2B callback URLs.

Use these Safaricom Daraja callback URLs:

```text
https://api.your-domain.com/mpesa/<business-slug>/c2b/validation
https://api.your-domain.com/mpesa/<business-slug>/c2b/confirmation
```

If the callback gateway can add headers, send:

```text
X-M-Verify-Callback-Secret: <business-or-global-callback-secret>
```

## 6. Build The Live Windows App

On a Windows build machine:

```powershell
$env:VITE_API_BASE_URL="https://api.your-domain.com"
pnpm install
pnpm --filter @m-verify/desktop tauri:build
```

The installer is created at:

```text
apps/desktop/src-tauri/target/release/bundle/nsis/
```

Install that `.exe` on cashier or waiter machines. The app registers Windows startup after launch and uses the hosted API.

## 7. Update A Live Deployment

```bash
git pull
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

For schema changes:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml exec api node apps/api/dist/scripts/migrate.js
```

## 8. Backups

For a production MVP, use a managed MySQL database when possible. If using the bundled MySQL container, back up daily:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml exec mysql \
  mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" m_verify > m_verify_backup.sql
```

Store backups off the server.
