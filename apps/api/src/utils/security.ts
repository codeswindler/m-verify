import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { config } from "../config.js";
import type { AuthContext } from "../types.js";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, config.security.bcryptRounds);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function createRefreshToken(): string {
  return crypto.randomBytes(48).toString("base64url");
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function credentialKey(): Buffer {
  return crypto.createHash("sha256").update(config.security.credentialEncryptionKey).digest();
}

export function encryptCredential(value: string | undefined | null): string | null {
  if (!value) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", credentialKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

export function decryptCredential(value: string | null | undefined): string | null {
  if (!value) return null;
  const [version, ivText, tagText, encryptedText] = value.split(":");
  if (version !== "v1" || !ivText || !tagText || !encryptedText) return null;
  const decipher = crypto.createDecipheriv("aes-256-gcm", credentialKey(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

export function maskSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.length <= 8) return "****";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export function hashCallbackSecret(secret: string): string {
  return crypto.createHash("sha256").update(secret).digest("hex");
}

export function verifyCallbackSecret(secret: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashCallbackSecret(secret), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

export function refreshExpiryDate(): Date {
  const date = new Date();
  date.setDate(date.getDate() + config.security.refreshTokenDays);
  return date;
}

export function signAccessToken(auth: AuthContext): { accessToken: string; expiresIn: number } {
  const expiresIn = config.security.jwtAccessTokenMinutes * 60;
  const accessToken = jwt.sign(
    {
      role: auth.user.role,
      username: auth.user.username,
      tenantId: auth.user.tenantId,
      sessionId: auth.sessionId
    },
    config.security.jwtSecret,
    {
      subject: String(auth.user.id),
      expiresIn
    }
  );
  return { accessToken, expiresIn };
}

export function verifyAccessToken(token: string): JwtPayload & { sessionId?: number } {
  const payload = jwt.verify(token, config.security.jwtSecret);
  if (typeof payload === "string") {
    throw new Error("Invalid token payload");
  }
  return payload as JwtPayload & { sessionId?: number };
}

export function isAllowedCallbackIp(ip: string): boolean {
  if (config.daraja.ipAllowlist.length === 0) return true;
  const normalized = ip.replace(/^::ffff:/, "");
  return config.daraja.ipAllowlist.includes(normalized);
}
