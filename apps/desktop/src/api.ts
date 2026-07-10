import type { AuthResponse, PaginatedResponse, PaymentSummary, SafeUser, VerificationResponse } from "@m-verify/shared";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

export type DesktopUpdateInfo = {
  latestVersion: string;
  downloadUrl: string;
  releaseNotes?: string;
  mandatory?: boolean;
};

export type BusinessDashboard = {
  kpis: {
    paidTransactions: number;
    totalPaymentVolume: string;
    todayPaymentVolume: string;
    verifiedTransactions: number;
    staffUsers: number;
    activeStaffUsers: number;
  };
  recentPayments: PaymentSummary[];
};

export type DesktopUser = SafeUser & {
  lastLoginAt?: string | null;
  createdAt?: string;
};

type RequestOptions = {
  method?: string;
  token?: string | null;
  body?: unknown;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? "GET",
      headers: {
        "content-type": "application/json",
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {})
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
  } catch {
    throw new Error("Cannot reach M-Verify API. Check internet, server SSL, and API access.");
  }

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
  latestDesktopUpdate() {
    return request<DesktopUpdateInfo>("/desktop/latest");
  },
  login(payload: { username: string; password: string; deviceId: string; deviceName?: string }) {
    return request<AuthResponse>("/auth/login", { method: "POST", body: payload });
  },
  businessDashboard(token: string) {
    return request<BusinessDashboard>("/business/dashboard", { token });
  },
  listTransactions(token: string, params: URLSearchParams) {
    return request<PaginatedResponse<PaymentSummary>>(`/transactions?${params.toString()}`, { token });
  },
  searchVerificationPayments(token: string, params: URLSearchParams) {
    return request<{ data: PaymentSummary[] }>(`/verify-payment/search?${params.toString()}`, { token });
  },
  listUsers(token: string) {
    return request<{ data: DesktopUser[] }>("/users", { token });
  },
  createUser(token: string, payload: { username: string; fullName: string; role: "manager" | "waiter"; password: string }) {
    return request<SafeUser>("/users", { method: "POST", token, body: payload });
  },
  updateUser(token: string, id: number, payload: { disabled?: boolean; password?: string }) {
    return request<SafeUser>(`/users/${id}`, { method: "PATCH", token, body: payload });
  },
  verifyPayment(
    token: string,
    payload: { paymentId?: number; phoneNumber?: string; transactionCode?: string; amount?: number; reference?: string }
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
