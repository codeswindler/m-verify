import "dotenv/config";

function toNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a number`);
  }
  return value;
}

function toBoolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (!raw) return fallback;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

function splitCsv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

const nodeEnv = process.env.NODE_ENV ?? "development";
const jwtSecret = process.env.JWT_SECRET ?? "development-only-change-me";

if (nodeEnv === "production" && jwtSecret === "development-only-change-me") {
  throw new Error("JWT_SECRET must be set in production");
}

export const config = {
  nodeEnv,
  isProduction: nodeEnv === "production",
  port: toNumber("API_PORT", 4000),
  publicApiBaseUrl: process.env.PUBLIC_API_BASE_URL ?? `http://localhost:${toNumber("API_PORT", 4000)}`,
  trustProxy: toBoolean("TRUST_PROXY", false),
  corsOrigins: splitCsv(process.env.CORS_ORIGINS),
  db: {
    host: process.env.MYSQL_HOST ?? "127.0.0.1",
    port: toNumber("MYSQL_PORT", 3306),
    database: process.env.MYSQL_DATABASE ?? "m_verify",
    user: process.env.MYSQL_USER ?? "m_verify",
    password: process.env.MYSQL_PASSWORD ?? "m_verify_password",
    connectionLimit: toNumber("MYSQL_CONNECTION_LIMIT", 10)
  },
  security: {
    jwtSecret,
    jwtAccessTokenMinutes: toNumber("JWT_ACCESS_TOKEN_MINUTES", 15),
    refreshTokenDays: toNumber("REFRESH_TOKEN_DAYS", 14),
    bcryptRounds: toNumber("BCRYPT_ROUNDS", 12),
    credentialEncryptionKey: process.env.CREDENTIAL_ENCRYPTION_KEY ?? jwtSecret
  },
  daraja: {
    callbackSecret: process.env.DARAJA_CALLBACK_SECRET ?? "",
    ipAllowlist: splitCsv(process.env.DARAJA_IP_ALLOWLIST)
  },
  rateLimit: {
    windowMs: toNumber("RATE_LIMIT_WINDOW_MS", 60_000),
    max: toNumber("RATE_LIMIT_MAX", 120),
    loginMax: toNumber("LOGIN_RATE_LIMIT_MAX", 10),
    verifyMax: toNumber("VERIFY_RATE_LIMIT_MAX", 60)
  },
  desktop: {
    latestVersion: process.env.DESKTOP_LATEST_VERSION ?? "0.1.0",
    downloadUrl: process.env.DESKTOP_DOWNLOAD_URL ?? "",
    updaterUrl: process.env.DESKTOP_UPDATER_URL ?? "",
    updaterSignature: process.env.DESKTOP_UPDATER_SIGNATURE ?? "",
    updaterPubDate: process.env.DESKTOP_UPDATER_PUB_DATE ?? "",
    releaseNotes: process.env.DESKTOP_RELEASE_NOTES ?? "Download the latest M-Verify desktop installer.",
    mandatoryUpdate: toBoolean("DESKTOP_MANDATORY_UPDATE", false)
  },
  seed: {
    adminUsername: process.env.SEED_ADMIN_USERNAME ?? "admin",
    adminPassword: process.env.SEED_ADMIN_PASSWORD ?? "admin123",
    adminFullName: process.env.SEED_ADMIN_FULL_NAME ?? "M-Verify Admin",
    resetAdminPassword: toBoolean("SEED_ADMIN_RESET_PASSWORD", false),
    demoData: toBoolean("SEED_DEMO_DATA", false)
  }
} as const;
