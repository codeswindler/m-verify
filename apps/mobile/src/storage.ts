import { withAccessTokenExpiry, type AuthResponse } from "@m-verify/shared";

const sessionKey = "mverify_mobile_auth";
const deviceKey = "mverify_mobile_device_id";

function randomId() {
  if ("randomUUID" in crypto) {
    return crypto.randomUUID();
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
  return raw ? (JSON.parse(raw) as AuthResponse) : null;
}

export async function saveSession(auth: AuthResponse) {
  const stored = withAccessTokenExpiry(auth);
  localStorage.setItem(sessionKey, JSON.stringify(stored));
  return stored;
}

export async function clearSession() {
  localStorage.removeItem(sessionKey);
}
