# M-Verify

M-Verify is a standalone payment verification tool for clubs, restaurants, and businesses. Staff use a compact Windows Tauri desktop window to verify M-Pesa payments against server-side payment data, instead of trusting screenshots or verbal claims.

## What Is Included

- Tauri v2 Windows desktop app in `apps/desktop`
- Capacitor Android mobile app in `apps/mobile`
- Node.js/Express API in `apps/api`
- React admin panel in `apps/admin`
- Shared TypeScript contracts in `packages/shared`
- MySQL schema and demo seed data in `database`
- Docker Compose for hosted-style local deployment
- Sample API requests in `docs/sample-requests.http`
- Tenant and M-Pesa credential management for multi-business deployments

## Prerequisites

- Node.js 22+ and pnpm
- Docker Desktop for the easiest MySQL/API/admin setup
- For Windows `.exe` builds: Rust/Cargo, Microsoft C++ Build Tools, and WebView2 Runtime
- For Android `.apk` builds: Android Studio or Android SDK/JDK with Gradle support

Tauri references:
- [Prerequisites](https://v2.tauri.app/start/prerequisites/)
- [Windows installer](https://v2.tauri.app/distribute/windows-installer/)
- [System tray](https://v2.tauri.app/learn/system-tray/)
- [Autostart](https://v2.tauri.app/plugin/autostart/)
- [Single instance](https://v2.tauri.app/plugin/single-instance/)
- [Window state](https://v2.tauri.app/plugin/window-state/)
- [Updater](https://v2.tauri.app/plugin/updater/)

## Local Setup

```powershell
pnpm install
Copy-Item .env.example .env
```

Start MySQL, API, and admin panel with Docker:

```powershell
docker compose up -d --build
```

Seed the first admin through the API container. Local `.env.example` enables demo payments with `SEED_DEMO_DATA=true`; production examples disable demo payments.

```powershell
docker compose exec -T api node apps/api/dist/scripts/seed.js
```

Seed admin environment behavior:

- `SEED_ADMIN_USERNAME` creates that admin when the seed script runs.
- Re-running seed with the same username re-enables the admin and updates the full name/role.
- Re-running seed does not reset the password unless `SEED_ADMIN_RESET_PASSWORD=true`.
- Changing the username and re-running seed creates another admin; it does not delete the old one.
- Env changes require recreating the API container before `docker compose exec api ... seed.js` sees them.

If you are running MySQL directly on the host instead of Docker, use:

```powershell
pnpm db:seed
```

Default seed login:

- Username: `admin`
- Password: `admin123`

## Development Commands

```powershell
pnpm dev:api
pnpm dev:admin
pnpm dev:mobile
pnpm dev:desktop
pnpm build
pnpm test
```

Admin panel:

- Local Vite dev: `http://localhost:5173`
- Docker build: `http://localhost:8080`

Mobile app:

- Local Vite dev: `http://localhost:5174`
- Preview build: `pnpm --filter @m-verify/mobile preview`
- Android debug APK: `pnpm --filter @m-verify/mobile android:debug`

API:

- `http://localhost:4000`

For a phone-installed APK, build with `VITE_API_BASE_URL` set to a public HTTPS API URL or a LAN URL the phone can reach. `http://localhost:4000` works only when the app runs on the same machine as the API.

## Live Deployment

Use the production compose file when deploying a hosted central service:

```bash
git clone https://github.com/codeswindler/m-verify.git m-verify
cd m-verify
cp .env.production.example .env.production
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

The live stack runs MySQL, the API, the admin panel, and a Caddy HTTPS reverse proxy. See `docs/deployment.md` for DNS, HTTPS, Daraja callback, admin seeding, backup, and Windows installer steps.

For the `m-verify.theleasemaster.com` VPS where Nginx is already serving other apps, use `docker-compose.nginx.yml` instead. See `docs/vps-nginx-deployment.md`.

## Windows Installer

Install the Tauri Windows prerequisites first, then run:

```powershell
pnpm install
$env:TAURI_SIGNING_PRIVATE_KEY_PATH="$env:USERPROFILE\.tauri\m-verify.key"
pnpm --filter @m-verify/desktop tauri:build
```

Generate the updater signing key once with:

```powershell
pnpm --dir apps/desktop exec tauri signer generate --ci -w "$env:USERPROFILE\.tauri\m-verify.key"
```

Keep the private key backed up securely. The NSIS `.exe` installer and its `.sig` updater signature are produced under:

```text
apps/desktop/src-tauri/target/release/bundle/nsis/
```

Apps before `0.1.4` need one manual installer update because they do not contain the updater plugin. After that bootstrap release, signed updates can be installed in-app.

## Verification Rules

The verifier searches received payments by M-Pesa transaction code, amount, or customer name. Staff must select a received payment before the app can formally verify it. Daraja confirmations create received payments only, so there is no pending payment state in the verifier. The API locks the selected payment row, logs every attempt, and returns one of:

- `VERIFIED`
- `NOT_FOUND`
- `AMOUNT_MISMATCH`
- `ALREADY_VERIFIED`
- `ERROR`

## Daraja C2B

Platform admins can create businesses in the admin panel and save each business's M-Pesa payment method, shortcode, Daraja credentials, and active status. Choose **Paybill** when the business receives payments through a paybill number. Choose **Till number** when the business receives Buy Goods payments; enter the store/head-office shortcode used by Daraja, and optionally store the customer-facing till number if Safaricom/bank onboarding issued both.

For business-specific callbacks, configure Safaricom Daraja C2B validation and confirmation URLs to the generated business URLs:

- `POST /mpesa/{tenantSlug}/c2b/validation`
- `POST /mpesa/{tenantSlug}/c2b/confirmation`

The legacy default callbacks still work for single-business setups:

- `POST /mpesa/c2b/validation`
- `POST /mpesa/c2b/confirmation`

The admin M-Pesa panel includes a **Register callbacks** shortcut that uses the saved Daraja consumer key and consumer secret to register the generated URLs with Safaricom.

For production, set `PUBLIC_API_BASE_URL` to the public HTTPS API URL so generated tenant callback URLs are correct, and set `CREDENTIAL_ENCRYPTION_KEY` to a long random secret before saving Daraja credentials.
