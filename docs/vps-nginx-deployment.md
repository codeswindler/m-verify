# M-Verify VPS Deployment Behind Existing Nginx

This deployment is for `m-verify.theleasemaster.com` on a server where Nginx already owns public ports `80` and `443`.

Use:

- `/var/www/m-verify` for the app source
- Docker Compose for M-Verify containers
- Existing host Nginx for public HTTP/HTTPS
- API bound to `127.0.0.1:4400`
- Admin UI bound to `127.0.0.1:8085`
- API public path `https://m-verify.theleasemaster.com/api`
- Admin public path `https://m-verify.theleasemaster.com`

## Server Findings

The VPS check showed:

- Ubuntu 24.04.3 with enough disk and RAM
- Nginx is active and already listening on `80` and `443`
- `8080` is already used by PHP
- `127.0.0.1:3306` is already used by MariaDB
- Docker is not installed
- Certbot is installed
- `m-verify.theleasemaster.com` resolves to the VPS

So do not run the Caddy compose file on this server. Use `docker-compose.nginx.yml`.

## 1. Install Docker

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
```

Allow the current user to run Docker without `sudo` after next login:

```bash
sudo usermod -aG docker "$USER"
newgrp docker
```

Verify:

```bash
docker --version
docker compose version
```

## 2. Clone To `/var/www/m-verify`

```bash
sudo mkdir -p /var/www/m-verify
sudo chown -R "$USER":"$USER" /var/www/m-verify
git clone https://github.com/codeswindler/m-verify.git /var/www/m-verify
cd /var/www/m-verify
```

## 3. Configure Environment

```bash
cp .env.nginx.example .env.production
nano .env.production
```

Replace every `replace-with...` value. Generate secrets with:

```bash
openssl rand -base64 48
```

Keep these values:

```text
PUBLIC_API_BASE_URL=https://m-verify.theleasemaster.com/api
VITE_API_BASE_URL=https://m-verify.theleasemaster.com/api
CORS_ORIGINS=https://m-verify.theleasemaster.com,tauri://localhost
API_HOST_PORT=4400
ADMIN_HOST_PORT=8085
```

## 4. Start M-Verify Containers

```bash
docker compose --env-file .env.production -f docker-compose.nginx.yml up -d --build
docker compose --env-file .env.production -f docker-compose.nginx.yml ps
```

Check local services:

```bash
curl -i http://127.0.0.1:4400/health
curl -I http://127.0.0.1:8085
```

## 5. Add Nginx Site

```bash
sudo cp /var/www/m-verify/deploy/nginx/m-verify.theleasemaster.com.conf /etc/nginx/sites-available/m-verify.theleasemaster.com
sudo ln -s /etc/nginx/sites-available/m-verify.theleasemaster.com /etc/nginx/sites-enabled/m-verify.theleasemaster.com
sudo nginx -t
sudo systemctl reload nginx
```

Check HTTP:

```bash
curl -I http://m-verify.theleasemaster.com
curl -i http://m-verify.theleasemaster.com/api/health
```

## 6. Enable HTTPS

```bash
sudo certbot --nginx -d m-verify.theleasemaster.com --redirect
sudo nginx -t
sudo systemctl reload nginx
```

Check HTTPS:

```bash
curl -I https://m-verify.theleasemaster.com
curl -i https://m-verify.theleasemaster.com/api/health
```

## 6.1. Publish The Windows Installer

Build the installer on a Windows machine:

```powershell
$env:VITE_API_BASE_URL="https://m-verify.theleasemaster.com/api"
pnpm --filter @m-verify/desktop tauri:build
```

Upload the generated installer to the VPS:

```powershell
scp apps/desktop/src-tauri/target/release/bundle/nsis/M-Verify_0.1.0_x64-setup.exe wilson@157.173.114.45:/var/www/m-verify/downloads/M-Verify-Setup.exe
```

The portal download button points to:

```text
https://m-verify.theleasemaster.com/downloads/M-Verify-Setup.exe
```

## 7. Seed Platform Admin

```bash
cd /var/www/m-verify
docker compose --env-file .env.production -f docker-compose.nginx.yml exec api node apps/api/dist/scripts/seed.js
```

The seed command creates or re-enables the platform admin from:

```text
SEED_ADMIN_USERNAME
SEED_ADMIN_PASSWORD
SEED_ADMIN_FULL_NAME
SEED_ADMIN_RESET_PASSWORD
SEED_DEMO_DATA
```

Production defaults skip demo payments. Re-running seed with the same username updates the admin full name/role and re-enables the account, but it does not change the password unless `SEED_ADMIN_RESET_PASSWORD=true`. Changing the username creates another admin account and leaves the old one in place.

If you edit `.env.production`, recreate the API container before running seed so the container sees the new env:

```bash
docker compose --env-file .env.production -f docker-compose.nginx.yml up -d api
```

Then sign in at:

```text
https://m-verify.theleasemaster.com
```

## 8. Daraja Callback URLs

Business callback URLs will use the `/api` path:

```text
https://m-verify.theleasemaster.com/api/mpesa/<business-slug>/c2b/validation
https://m-verify.theleasemaster.com/api/mpesa/<business-slug>/c2b/confirmation
```

## 9. Update Deployment

```bash
cd /var/www/m-verify
git pull
docker compose --env-file .env.production -f docker-compose.nginx.yml up -d --build
```

## 10. Rollback/Stop

```bash
cd /var/www/m-verify
docker compose --env-file .env.production -f docker-compose.nginx.yml down
sudo rm -f /etc/nginx/sites-enabled/m-verify.theleasemaster.com
sudo nginx -t
sudo systemctl reload nginx
```
