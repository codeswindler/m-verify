import { defaultPermissionsForRole, withAccessTokenExpiry, type AuthResponse, type UserRole } from "@m-verify/shared";

const sessionKey = "mverify_mobile_auth";
const deviceKey = "mverify_mobile_device_id";

function randomId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `mobile-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function getDeviceId() {
  const existing = localStorage.getItem(deviceKey);
  if (existing) return existing;
  const next = randomId();
  localStorage.setItem(deviceKey, next);
  return next;
}

export async function loadSession() {
  const raw = localStorage.getItem(sessionKey);
  if (!raw) return null;

  try {
    const stored = JSON.parse(raw) as Partial<AuthResponse>;
    if (!stored.accessToken || !stored.refreshToken || !stored.user || typeof stored.user !== "object") {
      localStorage.removeItem(sessionKey);
      return null;
    }
    const role = stored.user.role as UserRole;
    if (!(["admin", "manager", "waiter"] as UserRole[]).includes(role)) {
      localStorage.removeItem(sessionKey);
      return null;
    }
    const session = stored as AuthResponse;
    session.user.permissions = {
      ...defaultPermissionsForRole(role),
      ...(session.user.permissions ?? {})
    };
    if (!session.accessTokenExpiresAt) {
      session.accessTokenExpiresAt = Date.now() + Math.max(60, Number(session.expiresIn) || 300) * 1000;
    }
    return session;
  } catch {
    localStorage.removeItem(sessionKey);
    return null;
  }
}

export async function saveSession(auth: AuthResponse) {
  const stored = withAccessTokenExpiry(auth);
  localStorage.setItem(sessionKey, JSON.stringify(stored));
  return stored;
}

export async function clearSession() {
  localStorage.removeItem(sessionKey);
}
