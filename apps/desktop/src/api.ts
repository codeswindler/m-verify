import type { AuthResponse, VerificationResponse } from "@m-verify/shared";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

type RequestOptions = {
  method?: string;
  token?: string | null;
  body?: unknown;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "content-type": "application/json",
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {})
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });

  if (!response.ok) {
    let message = `Request failed with ${response.status}`;
    try {
      const payload = (await response.json()) as { message?: string };
      message = payload.message ?? message;
    } catch {
      // Keep the status-based message when the body is not JSON.
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export const api = {
  login(payload: { username: string; password: string; deviceId: string; deviceName?: string }) {
    return request<AuthResponse>("/auth/login", { method: "POST", body: payload });
  },
  verifyPayment(
    token: string,
    payload: { phoneNumber?: string; transactionCode?: string; amount?: number; reference?: string }
  ) {
    return request<VerificationResponse>("/verify-payment", { method: "POST", token, body: payload });
  },
  logout(token: string, refreshToken: string) {
    return fetch(`${API_BASE_URL}/auth/logout`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ refreshToken })
    }).catch(() => undefined);
  }
};
