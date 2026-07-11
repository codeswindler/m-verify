import type {
  AuthResponse,
  PaginatedResponse,
  PaymentSummary,
  SafeUser,
  VerificationResponse
} from "@m-verify/shared";

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ??
  (import.meta.env.DEV ? "http://localhost:4000" : "https://m-verify.theleasemaster.com/api");

export type BusinessDashboard = {
  kpis: {
    commissionRatePct: string;
    paidTransactions: number;
    totalPaymentVolume: string;
    todayPaymentVolume: string;
    monthPaymentVolume: string;
    verifiedTransactions: number;
    staffUsers: number;
    activeStaffUsers: number;
  };
  recentPayments: PaymentSummary[];
};

export type MobileStaffUser = SafeUser & {
  lastLoginAt?: string | null;
  createdAt?: string;
};

type RequestOptions = {
  method?: string;
  token?: string | null;
  body?: unknown;
};

async function parseError(response: Response): Promise<Error> {
  try {
    const payload = (await response.json()) as { message?: string; error?: string };
    return new Error(payload.message ?? payload.error ?? `Request failed with ${response.status}`);
  } catch {
    return new Error(`Request failed with ${response.status}`);
  }
}

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
    throw new Error("Cannot reach M-Verify. Check your connection and API URL.");
  }

  if (!response.ok) {
    throw await parseError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const api = {
  login(payload: { username: string; password: string; deviceId: string; deviceName?: string }) {
    return request<AuthResponse>("/auth/login", { method: "POST", body: payload });
  },
  refresh(payload: { refreshToken: string; deviceId: string }) {
    return request<AuthResponse>("/auth/refresh", { method: "POST", body: payload });
  },
  logout(token: string, refreshToken?: string) {
    return fetch(`${API_BASE_URL}/auth/logout`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ refreshToken })
    }).catch(() => undefined);
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
  verifyPayment(
    token: string,
    payload: { paymentId?: number; phoneNumber?: string; transactionCode?: string; amount?: number; reference?: string }
  ) {
    return request<VerificationResponse>("/verify-payment", { method: "POST", token, body: payload });
  },
  listUsers(token: string) {
    return request<{ data: MobileStaffUser[] }>("/users", { token });
  },
  createUser(token: string, payload: { username: string; fullName: string; role: "manager" | "waiter"; password: string }) {
    return request<SafeUser>("/users", { method: "POST", token, body: payload });
  },
  updateUser(token: string, id: number, payload: { disabled?: boolean; password?: string; role?: "manager" | "waiter" }) {
    return request<SafeUser>(`/users/${id}`, { method: "PATCH", token, body: payload });
  }
};

export async function loadTransactionArchive(token: string, maxRows = 500) {
  const rows: PaymentSummary[] = [];
  let page = 1;
  let total = Number.POSITIVE_INFINITY;

  while (rows.length < Math.min(total, maxRows)) {
    const params = new URLSearchParams({ page: String(page), limit: "100" });
    const result = await api.listTransactions(token, params);
    rows.push(...result.data);
    total = result.total;

    if (result.data.length === 0 || rows.length >= result.total) {
      break;
    }
    page += 1;
  }

  return rows;
}
