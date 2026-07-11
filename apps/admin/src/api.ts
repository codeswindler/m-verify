import type {
  AuthResponse,
  MpesaCredentialSummary,
  PaginatedResponse,
  PaymentLookupResponse,
  PaymentSummary,
  SafeUser,
  TenantSummary,
  VerificationResponse
} from "@m-verify/shared";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

export type VerificationLog = {
  id: number;
  tenantId: number | null;
  tenantName: string | null;
  paymentId: number | null;
  username: string | null;
  role: string | null;
  submittedPhoneNumber: string;
  submittedTransactionCode: string;
  submittedAmount: string;
  submittedReference: string | null;
  result: string;
  ipAddress: string | null;
  userAgent: string | null;
  notes: string | null;
  createdAt: string;
};

export type AdminUser = SafeUser & {
  lastLoginAt: string | null;
  createdAt: string;
};

export type CreateUserPayload = {
  username: string;
  fullName: string;
  role: "admin" | "manager" | "waiter";
  password: string;
  tenantId?: number;
};

export type CreateTenantPayload = {
  name: string;
  slug?: string;
  commissionRatePct?: number;
  contactEmail?: string;
  contactPhone?: string;
};

export type UpdateTenantPayload = Partial<CreateTenantPayload> & {
  status?: "active" | "disabled";
};

export type UpsertMpesaCredentialPayload = {
  environment: "sandbox" | "production";
  paymentMethod: "paybill" | "till";
  businessShortCode: string;
  tillNumber?: string;
  consumerKey?: string;
  consumerSecret?: string;
  passkey?: string;
  active: boolean;
};

export type PlatformDashboard = {
  kpis: {
    businesses: number;
    activeBusinesses: number;
    paidTransactions: number;
    totalPaymentVolume: string;
    platformRevenue: string;
    todayPaymentVolume: string;
    todayPlatformRevenue: string;
  };
  breakdown: Array<{
    businessId: number;
    businessName: string;
    slug: string;
    status: "active" | "disabled";
    commissionRatePct: string;
    transactionCount: number;
    totalPaymentVolume: string;
    platformRevenue: string;
    lastPaymentAt: string | null;
  }>;
};

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

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const api = {
  login(payload: { username: string; password: string; deviceId: string; deviceName?: string }) {
    return request<AuthResponse>("/auth/login", { method: "POST", body: payload });
  },
  listTransactions(token: string, params: URLSearchParams) {
    return request<PaginatedResponse<PaymentSummary>>(`/transactions?${params.toString()}`, { token });
  },
  listLogs(token: string, params: URLSearchParams) {
    return request<PaginatedResponse<VerificationLog>>(`/verification-logs?${params.toString()}`, { token });
  },
  listUsers(token: string) {
    return request<{ data: AdminUser[] }>("/users", { token });
  },
  createUser(token: string, payload: CreateUserPayload) {
    return request<SafeUser>("/users", { method: "POST", token, body: payload });
  },
  updateUser(token: string, id: number, payload: Partial<CreateUserPayload> & { disabled?: boolean }) {
    return request<SafeUser>(`/users/${id}`, { method: "PATCH", token, body: payload });
  },
  lookupPayment(token: string, payload: { phoneNumber?: string; transactionCode?: string; amount?: number; reference?: string }) {
    return request<PaymentLookupResponse>("/verify-payment/lookup", { method: "POST", token, body: payload });
  },
  searchVerificationPayments(token: string, params: URLSearchParams) {
    return request<{ data: PaymentSummary[] }>(`/verify-payment/search?${params.toString()}`, { token });
  },
  verifyPayment(token: string, payload: { paymentId?: number; phoneNumber?: string; transactionCode?: string; amount?: number; reference?: string }) {
    return request<VerificationResponse>("/verify-payment", { method: "POST", token, body: payload });
  },
  platformDashboard(token: string) {
    return request<PlatformDashboard>("/platform/dashboard", { token });
  },
  listTenants(token: string) {
    return request<{ data: TenantSummary[] }>("/tenants", { token });
  },
  createTenant(token: string, payload: CreateTenantPayload) {
    return request<TenantSummary>("/tenants", { method: "POST", token, body: payload });
  },
  updateTenant(token: string, id: number, payload: UpdateTenantPayload) {
    return request<TenantSummary>(`/tenants/${id}`, { method: "PATCH", token, body: payload });
  },
  getMpesaSettings(token: string, tenantId: number) {
    return request<{
      data: MpesaCredentialSummary | null;
      callbackUrls: Pick<MpesaCredentialSummary, "validationUrl" | "confirmationUrl">;
    }>(`/tenants/${tenantId}/mpesa`, { token });
  },
  saveMpesaSettings(token: string, tenantId: number, payload: UpsertMpesaCredentialPayload) {
    return request<MpesaCredentialSummary>(`/tenants/${tenantId}/mpesa`, { method: "PUT", token, body: payload });
  },
  registerMpesaCallbacks(token: string, tenantId: number) {
    return request<{
      message: string;
      daraja: Record<string, unknown>;
      callbackUrls: Pick<MpesaCredentialSummary, "validationUrl" | "confirmationUrl">;
    }>(`/tenants/${tenantId}/mpesa/register-callbacks`, { method: "POST", token });
  }
};

export function downloadCsv(token: string, path: string): void {
  const url = new URL(`${API_BASE_URL}${path}`);
  fetch(url, { headers: { authorization: `Bearer ${token}` } })
    .then((response) => {
      if (!response.ok) throw new Error(`Export failed with ${response.status}`);
      return response.blob();
    })
    .then((blob) => {
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = path.includes("verification-logs") ? "verification-logs.csv" : "transactions.csv";
      link.click();
      URL.revokeObjectURL(link.href);
    })
    .catch((error: unknown) => {
      window.alert(error instanceof Error ? error.message : "CSV export failed");
    });
}
