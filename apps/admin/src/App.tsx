import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  KeyRound,
  Loader2,
  LogOut,
  ReceiptText,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  UserPlus,
  Users as UsersIcon,
  WalletCards,
  X,
  XCircle
} from "lucide-react";
import type {
  AuthResponse,
  MpesaCredentialSummary,
  PaginatedResponse,
  PaymentSummary,
  StkPromptResponse,
  TenantSummary,
  UserModule,
  UserPermissions,
  VerificationResponse
} from "@m-verify/shared";
import { accessTokenRefreshDelay, defaultPermissionsForRole, withAccessTokenExpiry } from "@m-verify/shared";
import {
  api,
  downloadCsv,
  isAuthenticationError,
  type AdminUser,
  type BusinessDashboard,
  type CreateTenantPayload,
  type CreateUserPayload,
  type PlatformDashboard,
  type UpdateTenantPayload,
  type UpsertMpesaCredentialPayload
} from "./api";
import { MVerifyIcon, MVerifyLogo } from "./Logo";

type Tab = "platform-dashboard" | "businesses" | "platform-users" | "business-dashboard" | "verify" | "transactions" | "staff";
const tokenKey = "mverify_admin_auth";
const desktopDownloadUrl = import.meta.env.VITE_DESKTOP_DOWNLOAD_URL ?? "/downloads/M-Verify-Setup.exe";
type ToastTone = "success" | "error" | "info";
type Notify = (title: string, message?: string, tone?: ToastTone) => void;
const permissionLabels: Array<{ key: UserModule; label: string }> = [
  { key: "dashboard", label: "Dashboard" },
  { key: "verify", label: "Verify" },
  { key: "transactions", label: "Transactions" },
  { key: "staff", label: "Staff" },
  { key: "sales", label: "My sales" }
];

function getDeviceId(): string {
  const key = "mverify_admin_device_id";
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const next = crypto.randomUUID();
  localStorage.setItem(key, next);
  return next;
}

function defaultTab(auth: AuthResponse | null): Tab {
  if (!auth) return "verify";
  if (auth.user.role === "admin") return "platform-dashboard";
  if (auth.user.permissions.dashboard) return "business-dashboard";
  if (auth.user.permissions.verify) return "verify";
  if (auth.user.permissions.transactions) return "transactions";
  if (auth.user.permissions.staff) return "staff";
  return "verify";
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Nairobi" }).format(new Date(value));
}

function formatAmount(value: string | number): string {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount)) return "0";
  return amount.toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function initials(name: string): string {
  return name.split(" ").slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

function StatusBadge({ value }: { value: string }) {
  return <span className={`status status-${value.toLowerCase().replace(/_/g, "-")}`}>{value.replace(/_/g, " ")}</span>;
}

function WindowsMark() {
  return <span className="windows-mark" aria-hidden="true"><i /><i /><i /><i /></span>;
}

function LoginView({ onLogin }: { onLogin: (auth: AuthResponse) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const auth = await api.login({
        username,
        password,
        deviceId: getDeviceId(),
        deviceName: navigator.userAgent.slice(0, 80)
      });
      onLogin(auth);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-shell">
      <div className="login-brand">
        <div className="login-brand-inner">
          <span className="login-brand-tag">M-Pesa Verification System</span>
          <MVerifyLogo height={54} />
          <div>
            <h2 className="login-brand-headline">Instant payment<br />verification for <span>your business</span></h2>
            <p className="login-brand-sub" style={{ marginTop: 12 }}>
              Verify M-Pesa transactions against live data in seconds.
            </p>
          </div>
          <div className="login-brand-features">
            {["Live transaction lookup", "Staff access control", "Business revenue tracking"].map((text) => (
              <div className="login-brand-feature" key={text}>
                <span className="login-brand-feature-dot">✓</span>
                {text}
              </div>
            ))}
          </div>
          <p className="login-brand-footer">© {new Date().getFullYear()} M-Verify · v0.1.0</p>
        </div>
      </div>
      <div className="login-form-side">
        <form className="login-form-card" onSubmit={submit}>
          <div className="login-form-header">
            <h2>Welcome back</h2>
            <p>Sign in to continue</p>
          </div>
          <div className="login-fields">
            <label>Username<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" /></label>
            <label>Password<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" /></label>
          </div>
          {error && <div className="error">{error}</div>}
          <button className="primary login-sign-btn" disabled={loading}>{loading ? "Signing in..." : "Sign in"}</button>
          <a className="desktop-download-link" href={desktopDownloadUrl} download>
            <WindowsMark />
            Download Windows App
          </a>
        </form>
      </div>
    </main>
  );
}

type ToastItem =
  | { id: string; kind: "payment"; tx: PaymentSummary; exiting: boolean }
  | { id: string; kind: "notice"; title: string; message?: string; tone: ToastTone; exiting: boolean };
const toastDurationMs = 5200;

function useTransactionPoller(token: string | null, enabled: boolean, onNew: (tx: PaymentSummary) => void) {
  const lastMaxId = useRef<number | null>(null);
  const onNewRef = useRef(onNew);
  useEffect(() => { onNewRef.current = onNew; });

  useEffect(() => {
    if (!token || !enabled) {
      lastMaxId.current = null;
      return;
    }
    const accessToken = token;
    let cancelled = false;
    async function poll() {
      if (cancelled) return;
      try {
        const result = await api.listTransactions(accessToken, new URLSearchParams({ page: "1", limit: "10" }));
        const rows = result.data;
        if (!rows.length) return;
        const maxId = Math.max(...rows.map((row) => row.id));
        if (lastMaxId.current === null) {
          lastMaxId.current = maxId;
          return;
        }
        const fresh = rows.filter((row) => row.id > lastMaxId.current!).slice(0, 3);
        if (fresh.length) {
          lastMaxId.current = Math.max(...fresh.map((row) => row.id));
          fresh.reverse().forEach((tx) => onNewRef.current(tx));
        }
      } catch {
        // Ignore polling noise; visible screens show their own request errors.
      }
    }
    poll();
    const timer = setInterval(poll, 7000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [token, enabled]);
}

function ToastContainer({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: string) => void }) {
  if (!toasts.length) return null;
  return (
    <div className="toast-container" aria-label="Notifications">
      {toasts.map((item) => (
        <div
          key={item.id}
          role="alert"
          className={`toast-card toast-${item.kind}${item.kind === "notice" ? ` toast-${item.tone}` : ""}${item.exiting ? " toast-exiting" : ""}`}
          style={{ "--toast-duration": `${toastDurationMs}ms` } as React.CSSProperties}
        >
          {item.kind === "payment" ? (
            <>
              <div className="toast-header">
                <div className="toast-icon"><ReceiptText size={15} /></div>
                <span className="toast-label">New M-Pesa Payment</span>
              </div>
              <div className="toast-body">
                <div className="toast-phone">{item.tx.phoneNumber}</div>
                <div className="toast-amount">KES {formatAmount(item.tx.amount)}</div>
                <div className="toast-code">{item.tx.reference ?? item.tx.transactionCode}</div>
              </div>
            </>
          ) : (
            <>
              <div className="toast-header">
                <div className="toast-icon"><CheckCircle2 size={15} /></div>
                <span className="toast-label">{item.tone}</span>
              </div>
              <div className="toast-notice-body">
                <strong>{item.title}</strong>
                {item.message && <span>{item.message}</span>}
              </div>
            </>
          )}
          <button className="toast-close" onClick={() => onDismiss(item.id)} aria-label="Dismiss notification"><X size={13} /></button>
          <div className="toast-progress"><div className="toast-progress-bar" /></div>
        </div>
      ))}
    </div>
  );
}

function KpiCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="kpi-card">
      <div className="kpi-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PlatformDashboardView({ token }: { token: string }) {
  const [dashboard, setDashboard] = useState<PlatformDashboard | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      setDashboard(await api.platformDashboard(token));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  return (
    <>
      <div className="section-header">
        <h2>Platform Dashboard</h2>
        <button onClick={load} disabled={loading}><RefreshCw size={14} /> Refresh</button>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="kpi-grid">
        <KpiCard label="Businesses" value={String(dashboard?.kpis.businesses ?? 0)} icon={<Building2 size={18} />} />
        <KpiCard label="Active Businesses" value={String(dashboard?.kpis.activeBusinesses ?? 0)} icon={<ShieldCheck size={18} />} />
        <KpiCard label="Platform Revenue" value={`KES ${formatAmount(dashboard?.kpis.platformRevenue ?? 0)}`} icon={<WalletCards size={18} />} />
        <KpiCard label="Today Earned" value={`KES ${formatAmount(dashboard?.kpis.todayPlatformRevenue ?? 0)}`} icon={<CheckCircle2 size={18} />} />
      </div>
      <section className="panel">
        <div className="section-header compact">
          <h2>Revenue Breakdown</h2>
          <span className="section-badge">commission</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Business</th><th>Commission</th><th>Transactions</th><th>Payment Volume</th><th>Earned</th><th>Last Payment</th></tr>
            </thead>
            <tbody>
              {!dashboard?.breakdown.length ? (
                <EmptyRow label="No businesses yet" />
              ) : dashboard.breakdown.map((row) => (
                <tr key={row.businessId}>
                  <td><strong>{row.businessName}</strong><span className="subtext">{row.slug}</span></td>
                  <td>{row.commissionRatePct}%</td>
                  <td>{row.transactionCount.toLocaleString()}</td>
                  <td>KES {formatAmount(row.totalPaymentVolume)}</td>
                  <td className="cell-amount">KES {formatAmount(row.platformRevenue)}</td>
                  <td className="cell-muted">{formatDate(row.lastPaymentAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function BusinessDashboardView({ token }: { token: string }) {
  const [dashboard, setDashboard] = useState<BusinessDashboard | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      setDashboard(await api.businessDashboard(token));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  return (
    <>
      <div className="section-header dashboard-heading">
        <div>
          <h2>Business Dashboard</h2>
          <p className="subtext">Business activity overview</p>
        </div>
        <button onClick={load} disabled={loading}><RefreshCw size={14} /> Refresh</button>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="kpi-grid dashboard-kpis">
        <KpiCard label="Today" value={`KES ${formatAmount(dashboard?.kpis.todayPaymentVolume ?? 0)}`} icon={<CheckCircle2 size={18} />} />
        <KpiCard label="This Month" value={`KES ${formatAmount(dashboard?.kpis.monthPaymentVolume ?? 0)}`} icon={<WalletCards size={18} />} />
        <KpiCard label="Staff" value={String(dashboard?.kpis.staffUsers ?? 0)} icon={<UsersIcon size={18} />} />
      </div>
      <section className="panel">
        <div className="section-header compact">
          <h2>Recent Payments</h2>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Customer</th><th>Reference</th><th>Code</th><th>Amount Paid</th><th>Received</th><th>Verified</th></tr></thead>
            <tbody>
              {!dashboard?.recentPayments.length ? <EmptyRow label="No payments received yet" /> : dashboard.recentPayments.map((payment) => (
                <tr key={payment.id}>
                  <td><strong>{payment.customerName ?? payment.phoneNumber}</strong><span className="subtext">{payment.customerName ? payment.phoneNumber : "M-Pesa payer"}</span></td>
                  <td>{payment.reference ?? "-"}</td>
                  <td><span className="mono">{payment.transactionCode}</span></td>
                  <td className="cell-amount">KES {formatAmount(payment.amount)}</td>
                  <td className="cell-muted">{formatDate(payment.paymentTime)}</td>
                  <td><span className={payment.verifiedStatus ? "cell-success" : "cell-muted-s"}>{payment.verifiedStatus ? "Yes" : "No"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function emptyMpesaForm(): UpsertMpesaCredentialPayload {
  return {
    environment: "production",
    paymentMethod: "paybill",
    businessShortCode: "",
    tillNumber: "",
    consumerKey: "",
    consumerSecret: "",
    passkey: "",
    active: true
  };
}

function emptyBusinessForm(): CreateTenantPayload {
  return {
    name: "",
    slug: "",
    commissionRatePct: 0,
    contactEmail: "",
    contactPhone: ""
  };
}

function businessToForm(business: TenantSummary): UpdateTenantPayload {
  return {
    name: business.name,
    slug: business.slug,
    commissionRatePct: Number(business.commissionRatePct),
    contactEmail: business.contactEmail ?? "",
    contactPhone: business.contactPhone ?? "",
    status: business.status
  };
}

function cleanBusinessPayload(form: CreateTenantPayload | UpdateTenantPayload): CreateTenantPayload | UpdateTenantPayload {
  return {
    ...form,
    slug: form.slug?.trim() || undefined,
    commissionRatePct: Number(form.commissionRatePct ?? 0),
    contactEmail: form.contactEmail?.trim() ?? "",
    contactPhone: form.contactPhone?.trim() ?? ""
  };
}

type BusinessPanel = "edit" | "staff" | "mpesa";

function BusinessesView({ token, notify }: { token: string; notify: Notify }) {
  const [businesses, setBusinesses] = useState<TenantSummary[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState<number | null>(null);
  const [activePanel, setActivePanel] = useState<BusinessPanel>("edit");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [businessForm, setBusinessForm] = useState<CreateTenantPayload>(() => emptyBusinessForm());
  const [editForm, setEditForm] = useState<UpdateTenantPayload>(() => emptyBusinessForm());
  const [staffForm, setStaffForm] = useState<CreateUserPayload>({
    username: "",
    fullName: "",
    role: "waiter",
    password: "",
    permissions: defaultPermissionsForRole("waiter")
  });
  const [mpesaForm, setMpesaForm] = useState<UpsertMpesaCredentialPayload>(() => emptyMpesaForm());
  const [mpesaSettings, setMpesaSettings] = useState<MpesaCredentialSummary | null>(null);
  const [callbackUrls, setCallbackUrls] = useState({ validationUrl: "", confirmationUrl: "" });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const selectedBusiness = businesses.find((business) => business.id === selectedBusinessId) ?? null;
  const businessUsers = users.filter((user) => user.tenantId === selectedBusinessId && user.role !== "admin");

  async function loadBusinesses(nextSelectedId?: number | null) {
    setError("");
    const [businessResult, userResult] = await Promise.all([api.listTenants(token), api.listUsers(token)]);
    setBusinesses(businessResult.data);
    setUsers(userResult.data);
    if (nextSelectedId !== undefined) {
      setSelectedBusinessId(nextSelectedId);
    } else if (selectedBusinessId && !businessResult.data.some((business) => business.id === selectedBusinessId)) {
      setSelectedBusinessId(null);
    }
  }

  async function loadMpesaSettings(businessId: number) {
    const result = await api.getMpesaSettings(token, businessId);
    setMpesaSettings(result.data);
    setCallbackUrls(result.callbackUrls);
    setMpesaForm({
      environment: result.data?.environment ?? "production",
      paymentMethod: result.data?.paymentMethod ?? "paybill",
      businessShortCode: result.data?.businessShortCode ?? "",
      tillNumber: result.data?.tillNumber ?? "",
      consumerKey: "",
      consumerSecret: "",
      passkey: "",
      active: result.data?.active ?? true
    });
  }

  useEffect(() => { void loadBusinesses(); }, []);
  useEffect(() => {
    if (selectedBusinessId) void loadMpesaSettings(selectedBusinessId);
  }, [selectedBusinessId]);
  useEffect(() => {
    if (selectedBusiness) setEditForm(businessToForm(selectedBusiness));
  }, [selectedBusinessId, selectedBusiness?.updatedAt]);

  function openBusiness(business: TenantSummary, panel: BusinessPanel) {
    setSelectedBusinessId(business.id);
    setActivePanel(panel);
    setEditForm(businessToForm(business));
    setMessage("");
    setError("");
  }

  async function createBusiness(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const business = await api.createTenant(token, cleanBusinessPayload(businessForm) as CreateTenantPayload);
      setBusinessForm(emptyBusinessForm());
      setShowCreateForm(false);
      setActivePanel("edit");
      setMessage("Business created.");
      notify("Business created", `${business.name} is ready for setup.`);
      await loadBusinesses(business.id);
    } catch (err) {
      const messageText = err instanceof Error ? err.message : "Could not create business";
      setError(messageText);
      notify("Business was not created", messageText, "error");
    } finally {
      setLoading(false);
    }
  }

  async function saveBusiness(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedBusiness) return;
    setLoading(true);
    setError("");
    setMessage("");
    try {
      await api.updateTenant(token, selectedBusiness.id, cleanBusinessPayload(editForm) as UpdateTenantPayload);
      setMessage("Business updated.");
      notify("Business updated", selectedBusiness.name);
      await loadBusinesses(selectedBusiness.id);
    } catch (err) {
      const messageText = err instanceof Error ? err.message : "Could not update business";
      setError(messageText);
      notify("Business update failed", messageText, "error");
    } finally {
      setLoading(false);
    }
  }

  async function toggleBusiness(business: TenantSummary) {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      await api.updateTenant(token, business.id, { status: business.status === "active" ? "disabled" : "active" });
      setMessage("Business updated.");
      notify("Business updated", `${business.name} is now ${business.status === "active" ? "disabled" : "active"}.`);
      await loadBusinesses(business.id);
    } catch (err) {
      const messageText = err instanceof Error ? err.message : "Could not update business";
      setError(messageText);
      notify("Business update failed", messageText, "error");
    } finally {
      setLoading(false);
    }
  }

  async function saveMpesa(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedBusinessId) return;
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const saved = await api.saveMpesaSettings(token, selectedBusinessId, mpesaForm);
      setMpesaSettings(saved);
      setCallbackUrls({ validationUrl: saved.validationUrl, confirmationUrl: saved.confirmationUrl });
      setMpesaForm((current) => ({ ...current, consumerKey: "", consumerSecret: "", passkey: "" }));
      setMessage("M-Pesa settings saved.");
      notify("M-Pesa settings saved", "Callback URLs and credentials are ready.");
    } catch (err) {
      const messageText = err instanceof Error ? err.message : "Could not save M-Pesa settings";
      setError(messageText);
      notify("M-Pesa settings failed", messageText, "error");
    } finally {
      setLoading(false);
    }
  }

  function updateMpesaPaymentMethod(paymentMethod: UpsertMpesaCredentialPayload["paymentMethod"]) {
    setMpesaForm((current) => ({
      ...current,
      paymentMethod,
      tillNumber: paymentMethod === "till" ? current.tillNumber : ""
    }));
  }

  async function registerMpesaCallbacks() {
    if (!selectedBusinessId) return;
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const result = await api.registerMpesaCallbacks(token, selectedBusinessId);
      setCallbackUrls(result.callbackUrls);
      setMessage(result.message);
      notify("Callbacks registered", result.message);
    } catch (err) {
      const messageText = err instanceof Error ? err.message : "Could not register Daraja callbacks";
      setError(messageText);
      notify("Callback registration failed", messageText, "error");
    } finally {
      setLoading(false);
    }
  }

  async function createBusinessUser(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedBusiness) return;
    setLoading(true);
    setError("");
    setMessage("");
    try {
      await api.createUser(token, { ...staffForm, tenantId: selectedBusiness.id });
      setStaffForm({ username: "", fullName: "", role: "waiter", password: "", permissions: defaultPermissionsForRole("waiter") });
      setMessage("Business user created.");
      notify("Business user created", staffForm.username);
      await loadBusinesses(selectedBusiness.id);
    } catch (err) {
      const messageText = err instanceof Error ? err.message : "Could not create business user";
      setError(messageText);
      notify("User creation failed", messageText, "error");
    } finally {
      setLoading(false);
    }
  }

  async function toggleBusinessUser(user: AdminUser) {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      await api.updateUser(token, user.id, { disabled: !user.disabled });
      setMessage("Business user updated.");
      notify("Business user updated", `${user.username} is now ${user.disabled ? "active" : "disabled"}.`);
      await loadBusinesses(selectedBusinessId);
    } catch (err) {
      const messageText = err instanceof Error ? err.message : "Could not update business user";
      setError(messageText);
      notify("User update failed", messageText, "error");
    } finally {
      setLoading(false);
    }
  }

  async function resetBusinessUserPassword(user: AdminUser) {
    const password = window.prompt(`New password for ${user.username}`);
    if (!password) return;
    setLoading(true);
    setError("");
    setMessage("");
    try {
      await api.updateUser(token, user.id, { password });
      setMessage("Password reset.");
      notify("Password reset", user.username);
    } catch (err) {
      const messageText = err instanceof Error ? err.message : "Could not reset password";
      setError(messageText);
      notify("Password reset failed", messageText, "error");
    } finally {
      setLoading(false);
    }
  }

  async function toggleBusinessUserPermission(user: AdminUser, module: UserModule) {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const permissions: Partial<UserPermissions> = { [module]: !user.permissions[module] };
      await api.updateUser(token, user.id, { permissions });
      setMessage("Business user permissions updated.");
      notify("Permissions updated", `${user.username} can${permissions[module] ? "" : " no longer"} access ${permissionLabels.find((item) => item.key === module)?.label ?? module}.`);
      await loadBusinesses(selectedBusinessId);
    } catch (err) {
      const messageText = err instanceof Error ? err.message : "Could not update permissions";
      setError(messageText);
      notify("Permission update failed", messageText, "error");
    } finally {
      setLoading(false);
    }
  }

  async function copyUrl(value: string) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setMessage("Callback URL copied.");
      notify("Callback URL copied", "Paste it into Daraja C2B settings.");
    } catch {
      window.prompt("Copy callback URL", value);
      notify("Copy URL manually", "Clipboard access was blocked.", "info");
    }
  }

  return (
    <>
      <div className="section-header">
        <h2>Businesses</h2>
        <button className="primary" onClick={() => setShowCreateForm((value) => !value)}><Building2 size={14} /> Create new business</button>
      </div>
      <section className="panel tenant-panel">
        {(error || message) && <div className={error ? "error" : "notice"}>{error || message}</div>}
        {showCreateForm && (
          <form className="user-form create-business-form" onSubmit={createBusiness}>
            <h2><Building2 size={16} /> Create business</h2>
            <div className="form-grid two">
              <label>Name<input value={businessForm.name} onChange={(event) => setBusinessForm({ ...businessForm, name: event.target.value })} /></label>
              <label>Slug<input value={businessForm.slug ?? ""} onChange={(event) => setBusinessForm({ ...businessForm, slug: event.target.value })} /></label>
              <label>Commission %<input type="number" min="0" max="100" step="0.01" value={businessForm.commissionRatePct ?? 0} onChange={(event) => setBusinessForm({ ...businessForm, commissionRatePct: Number(event.target.value) })} /></label>
              <label>Email<input value={businessForm.contactEmail ?? ""} onChange={(event) => setBusinessForm({ ...businessForm, contactEmail: event.target.value })} /></label>
              <label>Phone<input value={businessForm.contactPhone ?? ""} onChange={(event) => setBusinessForm({ ...businessForm, contactPhone: event.target.value })} /></label>
            </div>
            <div className="actions"><button className="primary" disabled={loading}>Create business</button><button type="button" onClick={() => setShowCreateForm(false)}>Cancel</button></div>
          </form>
        )}
        <div className="business-grid">
          {businesses.map((business) => {
            const userCount = users.filter((user) => user.tenantId === business.id && user.role !== "admin").length;
            return (
              <article key={business.id} className={`business-card ${business.id === selectedBusinessId ? "active" : ""}`}>
                <div className="business-card-head">
                  <div><h3>{business.name}</h3><p>{business.slug}</p></div>
                  <StatusBadge value={business.status} />
                </div>
                <div className="business-card-meta">
                  <span>{business.commissionRatePct}% commission</span>
                  <span>{userCount} business users</span>
                  <span>{business.contactPhone || business.contactEmail || "No contact"}</span>
                </div>
                <div className="actions">
                  <button type="button" onClick={() => openBusiness(business, "edit")}>Edit</button>
                  <button type="button" onClick={() => openBusiness(business, "staff")}><UsersIcon size={13} /> Staff</button>
                  <button type="button" onClick={() => openBusiness(business, "mpesa")}><KeyRound size={13} /> M-Pesa</button>
                  <button type="button" onClick={() => void toggleBusiness(business)} disabled={loading}>{business.status === "active" ? "Disable" : "Enable"}</button>
                </div>
              </article>
            );
          })}
        </div>
        {selectedBusiness ? (
          <div className="business-detail">
            <div className="tenant-heading">
              <div><h3>{selectedBusiness.name}</h3><p>{activePanel === "edit" ? "Business details" : activePanel === "staff" ? "Business users" : "M-Pesa callbacks and credentials"}</p></div>
              <div className="segmented-actions">
                <button type="button" className={activePanel === "edit" ? "active" : ""} onClick={() => setActivePanel("edit")}>Details</button>
                <button type="button" className={activePanel === "staff" ? "active" : ""} onClick={() => setActivePanel("staff")}>Staff</button>
                <button type="button" className={activePanel === "mpesa" ? "active" : ""} onClick={() => setActivePanel("mpesa")}>M-Pesa</button>
              </div>
            </div>

            {activePanel === "edit" && (
              <form className="mpesa-form" onSubmit={saveBusiness}>
                <div className="form-grid two">
                  <label>Name<input value={editForm.name ?? ""} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} /></label>
                  <label>Slug<input value={editForm.slug ?? ""} onChange={(event) => setEditForm({ ...editForm, slug: event.target.value })} /></label>
                  <label>Commission %<input type="number" min="0" max="100" step="0.01" value={editForm.commissionRatePct ?? 0} onChange={(event) => setEditForm({ ...editForm, commissionRatePct: Number(event.target.value) })} /></label>
                  <label>Status<select value={editForm.status ?? "active"} onChange={(event) => setEditForm({ ...editForm, status: event.target.value as TenantSummary["status"] })}><option value="active">Active</option><option value="disabled">Disabled</option></select></label>
                  <label>Email<input value={editForm.contactEmail ?? ""} onChange={(event) => setEditForm({ ...editForm, contactEmail: event.target.value })} /></label>
                  <label>Phone<input value={editForm.contactPhone ?? ""} onChange={(event) => setEditForm({ ...editForm, contactPhone: event.target.value })} /></label>
                </div>
                <button className="primary" disabled={loading}><Save size={14} /> Save business</button>
              </form>
            )}

            {activePanel === "staff" && (
              <div className="business-staff">
                <form className="user-form" onSubmit={createBusinessUser}>
                  <h2><UserPlus size={16} /> Add business user</h2>
                  <div className="form-grid two">
                    <label>Username<input value={staffForm.username} onChange={(event) => setStaffForm({ ...staffForm, username: event.target.value })} /></label>
                    <label>Full name<input value={staffForm.fullName} onChange={(event) => setStaffForm({ ...staffForm, fullName: event.target.value })} /></label>
                    <label>Role<select value={staffForm.role} onChange={(event) => {
                      const role = event.target.value as CreateUserPayload["role"];
                      setStaffForm({ ...staffForm, role, permissions: defaultPermissionsForRole(role) });
                    }}><option value="waiter">Waiter</option><option value="manager">Business Admin</option></select></label>
                    <label>Temporary password<input type="password" value={staffForm.password} onChange={(event) => setStaffForm({ ...staffForm, password: event.target.value })} /></label>
                  </div>
                  <div className="permission-grid">
                    {permissionLabels.map((permission) => (
                      <label key={permission.key} className="permission-toggle">
                        <input
                          type="checkbox"
                          checked={Boolean(staffForm.permissions?.[permission.key])}
                          onChange={(event) => setStaffForm({
                            ...staffForm,
                            permissions: { ...(staffForm.permissions ?? {}), [permission.key]: event.target.checked }
                          })}
                        />
                        <span>{permission.label}</span>
                      </label>
                    ))}
                  </div>
                  <button className="primary" disabled={loading}>Create business user</button>
                </form>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>User</th><th>Role</th><th>Modules</th><th>Status</th><th>Last login</th><th>Actions</th></tr></thead>
                    <tbody>
                      {!businessUsers.length ? <EmptyRow label="No business users yet" /> : businessUsers.map((user) => (
                        <tr key={user.id}>
                          <td><strong>{user.username}</strong><span className="subtext">{user.fullName}</span></td>
                          <td><span className="status">{user.role === "manager" ? "business admin" : user.role}</span></td>
                          <td>
                            <div className="permission-pills">
                              {permissionLabels.map((permission) => (
                                <button
                                  key={permission.key}
                                  type="button"
                                  className={user.permissions[permission.key] ? "active" : ""}
                                  onClick={() => void toggleBusinessUserPermission(user, permission.key)}
                                >
                                  {permission.label}
                                </button>
                              ))}
                            </div>
                          </td>
                          <td><span className={`status ${user.disabled ? "status-failed" : "status-verified"}`}>{user.disabled ? "Disabled" : "Active"}</span></td>
                          <td className="cell-muted">{formatDate(user.lastLoginAt)}</td>
                          <td className="actions"><button onClick={() => void toggleBusinessUser(user)}>{user.disabled ? "Enable" : "Disable"}</button><button onClick={() => void resetBusinessUserPassword(user)}>Reset pw</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activePanel === "mpesa" && (
              <>
                <div className="callback-grid">
                  <label>Validation callback
                    <div className="copy-field"><input readOnly value={callbackUrls.validationUrl} /><button type="button" onClick={() => void copyUrl(callbackUrls.validationUrl)} disabled={!callbackUrls.validationUrl} title="Copy validation callback URL"><Copy size={14} /> Copy</button></div>
                  </label>
                  <label>Confirmation callback
                    <div className="copy-field"><input readOnly value={callbackUrls.confirmationUrl} /><button type="button" onClick={() => void copyUrl(callbackUrls.confirmationUrl)} disabled={!callbackUrls.confirmationUrl} title="Copy confirmation callback URL"><Copy size={14} /> Copy</button></div>
                  </label>
                  <div className="callback-actions">
                    <button type="button" onClick={() => void registerMpesaCallbacks()} disabled={loading || !mpesaSettings?.consumerKeyMasked || !mpesaSettings?.hasConsumerSecret} title="Register these URLs with Safaricom Daraja"><KeyRound size={14} /> Register callbacks</button>
                    <span>Save Daraja credentials first. Safaricom will send callbacks directly to these URLs.</span>
                  </div>
                </div>
                <form className="mpesa-form" onSubmit={saveMpesa}>
                  <h3><KeyRound size={16} /> M-Pesa credentials</h3>
                  <div className="form-grid two">
                    <label>Environment<select value={mpesaForm.environment} onChange={(event) => setMpesaForm({ ...mpesaForm, environment: event.target.value as UpsertMpesaCredentialPayload["environment"] })}><option value="production">Production</option><option value="sandbox">Sandbox</option></select></label>
                    <label>Payment method<select value={mpesaForm.paymentMethod} onChange={(event) => updateMpesaPaymentMethod(event.target.value as UpsertMpesaCredentialPayload["paymentMethod"])}><option value="paybill">Paybill</option><option value="till">Till number</option></select></label>
                    <label>{mpesaForm.paymentMethod === "paybill" ? "Paybill number" : "Store number / shortcode"}<input value={mpesaForm.businessShortCode} onChange={(event) => setMpesaForm({ ...mpesaForm, businessShortCode: event.target.value })} placeholder={mpesaForm.paymentMethod === "paybill" ? "Example: 4049311" : "Store or head-office shortcode"} /><span className="field-note">{mpesaForm.paymentMethod === "paybill" ? "The Paybill used to receive C2B payment notifications." : "Use the store or shortcode Daraja expects for callback registration."}</span></label>
                    {mpesaForm.paymentMethod === "till" && (
                      <label>Till number<input value={mpesaForm.tillNumber ?? ""} onChange={(event) => setMpesaForm({ ...mpesaForm, tillNumber: event.target.value })} placeholder="Optional customer-facing till number" /><span className="field-note">If you only have one Till identifier, put it in Store number / shortcode and leave this blank.</span></label>
                    )}
                    <label>Consumer key<input value={mpesaForm.consumerKey ?? ""} onChange={(event) => setMpesaForm({ ...mpesaForm, consumerKey: event.target.value })} placeholder={mpesaSettings?.consumerKeyMasked ?? ""} /></label>
                    <label>Consumer secret<input type="password" value={mpesaForm.consumerSecret ?? ""} onChange={(event) => setMpesaForm({ ...mpesaForm, consumerSecret: event.target.value })} placeholder={mpesaSettings?.hasConsumerSecret ? "Configured" : ""} /></label>
                    <label>Passkey<input type="password" value={mpesaForm.passkey ?? ""} onChange={(event) => setMpesaForm({ ...mpesaForm, passkey: event.target.value })} placeholder={mpesaSettings?.hasPasskey ? "Configured" : ""} /></label>
                    <label className="check-row"><input type="checkbox" checked={mpesaForm.active} onChange={(event) => setMpesaForm({ ...mpesaForm, active: event.target.checked })} /><span>Callbacks active</span></label>
                  </div>
                  <button className="primary" disabled={loading}><Save size={14} /> Save M-Pesa settings</button>
                </form>
              </>
            )}
          </div>
        ) : <div className="empty-state"><p>Select a business card to edit details, staff, or M-Pesa settings.</p></div>}
      </section>
    </>
  );
}

function EmptyRow({ label }: { label: string }) {
  return <tr><td colSpan={99}><div className="empty-state"><p>{label}</p></div></td></tr>;
}

function PaymentDetailModal({ payment, onClose }: { payment: PaymentSummary; onClose: () => void }) {
  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="payment-detail-title">
        <div className="modal-header">
          <div>
            <span className="section-badge">Payment</span>
            <h2 id="payment-detail-title">{payment.reference ?? payment.transactionCode}</h2>
            <p>{payment.customerName ?? "M-Pesa payer"}</p>
          </div>
          <button className="icon-only" type="button" onClick={onClose} aria-label="Close payment details"><X size={16} /></button>
        </div>

        <div className="modal-kpi-row">
          <div><span>Amount received</span><strong>KES {formatAmount(payment.amount)}</strong></div>
          <div><span>Status</span><StatusBadge value={payment.status} /></div>
          <div><span>Formal verification</span><strong>{payment.verifiedStatus ? "Verified" : "Not verified"}</strong></div>
        </div>

        <dl className="payment-details modal-details">
          <div><dt>Customer</dt><dd>{payment.customerName ?? "M-Pesa payer"}</dd></div>
          <div><dt>Phone / payer ID</dt><dd>{payment.phoneNumber}</dd></div>
          <div><dt>Reference</dt><dd>{payment.reference ?? "-"}</dd></div>
          <div><dt>M-Pesa code</dt><dd className="mono-value">{payment.transactionCode}</dd></div>
          <div><dt>Channel</dt><dd>{payment.paymentChannel}</dd></div>
          <div><dt>Received at</dt><dd>{formatDate(payment.paymentTime)}</dd></div>
          <div><dt>Verified by</dt><dd>{payment.verifiedBy?.username ?? "-"}</dd></div>
          <div><dt>Verified at</dt><dd>{formatDate(payment.verifiedAt)}</dd></div>
        </dl>

        <div className="modal-footer">
          <button type="button" onClick={onClose}>Close</button>
        </div>
      </section>
    </div>
  );
}

function TransactionsView({ token, notify }: { token: string; notify: Notify }) {
  const [search, setSearch] = useState("");
  const [result, setResult] = useState<PaginatedResponse<PaymentSummary> | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<PaymentSummary | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const params = useMemo(() => {
    const query = new URLSearchParams({ page: "1", limit: "25" });
    if (search) query.set("search", search);
    return query;
  }, [search]);

  async function load(showNotice = false) {
    setLoading(true);
    setError("");
    try {
      setResult(await api.listTransactions(token, params));
      if (showNotice) notify("Transactions refreshed", "Latest received payments loaded.");
    } catch (err) {
      const messageText = err instanceof Error ? err.message : "Could not load transactions";
      setError(messageText);
      notify("Transactions failed", messageText, "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [params.toString()]);
  const rows = result?.data ?? [];

  return (
    <>
      <div className="section-header">
        <h2>Transactions</h2>
        {result && <span className="section-badge">{result.total.toLocaleString()} records</span>}
      </div>
      <section className="panel">
        <div className="toolbar">
          <div className="searchbox"><Search size={15} /><input placeholder="Search name, reference, code, or phone" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
          <button onClick={() => void load(true)} disabled={loading}><RefreshCw size={14} /> Refresh</button>
          <button onClick={() => { downloadCsv(token, `/transactions/export.csv?${params.toString()}`); notify("CSV export started", "Your transactions report is downloading.", "info"); }}><Download size={14} /> Export CSV</button>
        </div>
        {error && <div className="error">{error}</div>}
        <div className="table-wrap">
          <table>
            <thead><tr><th>Customer</th><th>Reference</th><th>Transaction Code</th><th>Amount</th><th>Received</th><th>Verified</th><th>Payment Time</th><th>Verified By</th><th>Actions</th></tr></thead>
            <tbody>
              {!rows.length ? <EmptyRow label="No transactions found" /> : rows.map((payment) => (
                <tr key={payment.id}>
                  <td><strong>{payment.customerName ?? payment.phoneNumber}</strong><span className="subtext">{payment.customerName ? payment.phoneNumber : "M-Pesa payer"}</span></td>
                  <td>{payment.reference ?? "-"}</td>
                  <td><span className="mono">{payment.transactionCode}</span></td>
                  <td className="cell-amount">KES {formatAmount(payment.amount)}</td>
                  <td><StatusBadge value="PAID" /></td>
                  <td><span className={payment.verifiedStatus ? "cell-success" : "cell-muted-s"}>{payment.verifiedStatus ? "Yes" : "No"}</span></td>
                  <td className="cell-muted">{formatDate(payment.paymentTime)}</td>
                  <td className="cell-muted">{payment.verifiedBy?.username ?? "-"}</td>
                  <td className="actions"><button type="button" onClick={() => setSelectedPayment(payment)}><Eye size={13} /> View</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {selectedPayment && <PaymentDetailModal payment={selectedPayment} onClose={() => setSelectedPayment(null)} />}
    </>
  );
}

function VerifyView({ token, notify }: { token: string; notify: Notify }) {
  const [query, setQuery] = useState("");
  const [payments, setPayments] = useState<PaymentSummary[]>([]);
  const [selectedPayment, setSelectedPayment] = useState<PaymentSummary | null>(null);
  const [result, setResult] = useState<VerificationResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [showStk, setShowStk] = useState(false);
  const [stkPhone, setStkPhone] = useState("");
  const [stkAmount, setStkAmount] = useState("");
  const [stkReference, setStkReference] = useState("");
  const [stkPrompt, setStkPrompt] = useState<StkPromptResponse | null>(null);
  const [stkLoading, setStkLoading] = useState(false);
  const [stkFlowError, setStkFlowError] = useState("");

  useEffect(() => {
    const trimmed = query.trim();
    setResult(null);
    setSelectedPayment(null);
    if (!trimmed) {
      setPayments([]);
      setError("");
      setSearching(false);
      return;
    }

    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: trimmed, limit: "20" });
        const searchResult = await api.searchVerificationPayments(token, params);
        if (!cancelled) {
          setPayments(searchResult.data);
          setError("");
        }
      } catch (err) {
        if (!cancelled) {
          const messageText = err instanceof Error ? err.message : "Payment search failed";
          setPayments([]);
          setError(messageText);
          notify("Payment search failed", messageText, "error");
        }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [token, query, notify]);

  async function verifySelectedPayment() {
    if (!selectedPayment) return;
    setError("");
    setResult(null);
    setLoading(true);
    try {
      const verification = await api.verifyPayment(token, { paymentId: selectedPayment.id });
      setResult(verification);
      notify(
        verification.result === "VERIFIED" ? "Payment verified" : verification.result.replace(/_/g, " "),
        verification.message,
        verification.result === "VERIFIED" ? "success" : verification.result === "ALREADY_VERIFIED" ? "info" : "error"
      );
      if (verification.payment) {
        setSelectedPayment(verification.payment);
        setPayments((current) => current.map((payment) => payment.id === verification.payment!.id ? verification.payment! : payment));
      }
    } catch (err) {
      const messageText = err instanceof Error ? err.message : "Verification failed";
      setError(messageText);
      notify("Verification failed", messageText, "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!stkPrompt || !["REQUESTED", "PENDING"].includes(stkPrompt.status)) return;
    const timer = window.setInterval(async () => {
      try {
        const prompt = await api.getStkPrompt(token, stkPrompt.id);
        setStkFlowError("");
        setStkPrompt(prompt);
        if (prompt.payment) {
          setSelectedPayment(prompt.payment);
          setPayments([prompt.payment]);
          setQuery("");
          setResult(null);
          notify("STK payment received", "Confirm the payment in the open STK window.", "success");
        }
      } catch (err) {
        const messageText = err instanceof Error ? err.message : "Could not check STK prompt";
        setStkFlowError(`${messageText} Retrying...`);
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [notify, stkPrompt, token]);

  async function sendStkPrompt() {
    const amount = Math.round(Number(stkAmount));
    if (!stkPhone.trim() || !Number.isFinite(amount) || amount <= 0) {
      setError("Enter customer phone and amount for STK prompt.");
      return;
    }
    setError("");
    setStkFlowError("");
    setResult(null);
    setStkPrompt(null);
    setStkLoading(true);
    try {
      const prompt = await api.initiateStkPrompt(token, {
        phoneNumber: stkPhone.trim(),
        amount,
        reference: stkReference.trim() || undefined
      });
      setStkPrompt(prompt);
      notify("STK prompt sent", prompt.message, "info");
    } catch (err) {
      const messageText = err instanceof Error ? err.message : "STK prompt failed";
      setError(messageText);
      setStkFlowError(messageText);
      notify("STK prompt failed", messageText, "error");
    } finally {
      setStkLoading(false);
    }
  }

  function closeStkFlow() {
    setStkPrompt(null);
    setStkFlowError("");
    setStkLoading(false);
    if (result?.result === "VERIFIED" || result?.result === "ALREADY_VERIFIED") setShowStk(false);
  }

  const stkWaiting = stkLoading || stkPrompt?.status === "REQUESTED" || stkPrompt?.status === "PENDING";
  const stkFailed = (!stkPrompt && Boolean(stkFlowError))
    || Boolean(stkPrompt && ["FAILED", "CANCELLED", "TIMED_OUT"].includes(stkPrompt.status));
  const stkPayment = stkPrompt?.payment ?? (stkPrompt?.status === "PAID" ? selectedPayment ?? undefined : undefined);
  const stkVerified = result?.result === "VERIFIED" || result?.result === "ALREADY_VERIFIED";

  return (
    <>
      <div className="section-header">
        <h2>Verify Payment</h2>
        <button type="button" onClick={() => setShowStk((current) => !current)}><ShieldCheck size={14} /> STK prompt</button>
      </div>
      <section className="panel verify-panel">
        {showStk && (
          <div className="stk-panel">
            <div className="form-grid">
              <label>Mobile number<input value={stkPhone} onChange={(event) => setStkPhone(event.target.value)} placeholder="07..." /></label>
              <label>Amount<input value={stkAmount} onChange={(event) => setStkAmount(event.target.value)} inputMode="numeric" min="1" step="1" placeholder="KES" type="number" /></label>
              <label>Reference<input value={stkReference} onChange={(event) => setStkReference(event.target.value)} placeholder="Optional bill/table" /></label>
            </div>
            <button className="primary" type="button" onClick={() => void sendStkPrompt()} disabled={stkLoading}>
              {stkLoading ? "Sending prompt..." : "Send STK prompt"}
            </button>
            {stkPrompt && (
              <div className={`result-card ${stkPrompt.status === "PAID" ? "result-verified" : ["FAILED", "CANCELLED", "TIMED_OUT"].includes(stkPrompt.status) ? "result-error" : "result-pending"}`}>
                <strong>{stkPrompt.status.replace(/_/g, " ")}</strong>
                <p>{stkPrompt.message}</p>
              </div>
            )}
          </div>
        )}
        <div className="verify-search-layout">
          <div className="verify-search-side">
            <label>Search received payments
              <div className="searchbox verify-searchbox">
                <Search size={15} />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="M-Pesa code, amount, or customer name" />
              </div>
            </label>
            <div className="verify-results-list">
              {!query.trim() && <div className="empty-state">Start typing to find a received payment.</div>}
              {query.trim() && searching && <div className="empty-state">Searching payments...</div>}
              {query.trim() && !searching && !payments.length && <div className="empty-state">No received payments found.</div>}
              {payments.map((payment) => (
                <button
                  type="button"
                  key={payment.id}
                  className={`verify-payment-option ${selectedPayment?.id === payment.id ? "selected" : ""}`}
                  onClick={() => {
                    setSelectedPayment(payment);
                    setResult(null);
                  }}
                >
                  <div>
                    <strong>{payment.customerName ?? "M-Pesa customer"}</strong>
                    <span>{payment.transactionCode} - {payment.reference ?? "No reference"}</span>
                  </div>
                  <div>
                    <strong>KES {formatAmount(payment.amount)}</strong>
                    <span>{payment.verifiedStatus ? "Verified" : formatDate(payment.paymentTime)}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="verify-selected-side">
            {!selectedPayment ? (
              <div className="empty-state large">Select a payment from the search results before verifying.</div>
            ) : (
              <div className="result-card result-verified">
                <div className="verify-selected-head">
                  <strong>Selected payment</strong>
                  <StatusBadge value={selectedPayment.verifiedStatus ? "ALREADY_VERIFIED" : "PAID"} />
                </div>
                <dl className="payment-details">
                  <div><dt>Customer</dt><dd>{selectedPayment.customerName ?? "M-Pesa customer"}</dd></div>
                  <div><dt>Reference</dt><dd>{selectedPayment.reference ?? "-"}</dd></div>
                  <div><dt>M-Pesa code</dt><dd>{selectedPayment.transactionCode}</dd></div>
                  <div><dt>Amount received</dt><dd>KES {formatAmount(selectedPayment.amount)}</dd></div>
                  <div><dt>Phone</dt><dd>{selectedPayment.phoneNumber}</dd></div>
                  <div><dt>Received at</dt><dd>{formatDate(selectedPayment.paymentTime)}</dd></div>
                  <div><dt>Formal verification</dt><dd>{selectedPayment.verifiedStatus ? `Verified by ${selectedPayment.verifiedBy?.username ?? "staff"}` : "Not yet verified"}</dd></div>
                </dl>
                <button className="primary" type="button" onClick={() => void verifySelectedPayment()} disabled={loading || selectedPayment.verifiedStatus}>
                  {loading ? "Verifying..." : selectedPayment.verifiedStatus ? "Already verified" : "Verify selected payment"}
                </button>
              </div>
            )}
          </div>
        </div>
        {error && <div className="error">{error}</div>}
        {result && (
          <div className={`result-card result-${result.result.toLowerCase().replace(/_/g, "-")}`}>
            <StatusBadge value={result.result} />
            <strong>{result.message}</strong>
            {result.payment && <span>{result.payment.reference ?? result.payment.transactionCode} - KES {formatAmount(result.payment.amount)}</span>}
          </div>
        )}
      </section>

      {(stkLoading || stkPrompt || stkFlowError) && (
        <div className="stk-flow-backdrop" role="dialog" aria-modal="true" aria-label="M-Pesa STK payment status">
          <section className={`stk-flow-dialog ${stkWaiting ? "waiting" : stkFailed ? "failed" : "paid"}`}>
            {stkWaiting ? (
              <>
                <div className="stk-flow-visual" aria-hidden="true"><span className="stk-pulse-ring" /><Loader2 className="spin" size={40} /></div>
                <div className="stk-flow-copy">
                  <span className="stk-flow-kicker">M-Pesa request sent</span>
                  <h2>Waiting for payment</h2>
                  <p>Ask the customer to enter their M-Pesa PIN on the phone.</p>
                </div>
                <div className="stk-flow-summary">
                  <div><span>Mobile</span><strong>{stkPhone}</strong></div>
                  <div><span>Amount</span><strong>KES {formatAmount(Math.round(Number(stkAmount)))}</strong></div>
                </div>
                <div className="stk-flow-progress"><span /></div>
                <small>{stkFlowError || "Checking payment automatically. This window updates as soon as M-Pesa responds."}</small>
              </>
            ) : stkVerified && stkPayment ? (
              <>
                <CheckCircle2 className="stk-flow-status-icon" size={62} />
                <div className="stk-flow-copy"><span className="stk-flow-kicker">Complete</span><h2>Payment verified</h2><p>{result?.message}</p></div>
                <div className="stk-flow-receipt">
                  <div><span>Amount</span><strong>KES {formatAmount(stkPayment.amount)}</strong></div>
                  <div><span>M-Pesa code</span><strong>{stkPayment.transactionCode}</strong></div>
                </div>
                <button className="primary" type="button" onClick={closeStkFlow}>Done</button>
              </>
            ) : stkPayment ? (
              <>
                <CheckCircle2 className="stk-flow-status-icon" size={62} />
                <div className="stk-flow-copy"><span className="stk-flow-kicker">Payment received</span><h2>KES {formatAmount(stkPayment.amount)} paid</h2><p>Confirm this receipt here to complete the waiter check.</p></div>
                {error && <div className="stk-flow-inline-error">{error}</div>}
                <div className="stk-flow-receipt">
                  <div><span>Customer</span><strong>{stkPayment.customerName ?? "M-Pesa customer"}</strong></div>
                  <div><span>M-Pesa code</span><strong>{stkPayment.transactionCode}</strong></div>
                  <div><span>Reference</span><strong>{stkPayment.reference ?? "-"}</strong></div>
                  <div><span>Received</span><strong>{formatDate(stkPayment.paymentTime)}</strong></div>
                </div>
                <button className="primary" type="button" onClick={() => void verifySelectedPayment()} disabled={loading || stkPayment.verifiedStatus}>
                  {loading && <Loader2 className="spin" size={17} />}
                  {loading ? "Verifying payment" : stkPayment.verifiedStatus ? "Already verified" : "Verify this payment"}
                </button>
                {!loading && <button type="button" onClick={closeStkFlow}>{stkPayment.verifiedStatus ? "Close" : "Not now"}</button>}
              </>
            ) : (
              <>
                <XCircle className="stk-flow-status-icon" size={62} />
                <div className="stk-flow-copy">
                  <span className="stk-flow-kicker">Request ended</span>
                  <h2>{stkPrompt?.status === "CANCELLED" ? "Customer cancelled" : stkPrompt?.status === "TIMED_OUT" ? "Request timed out" : "Payment not completed"}</h2>
                  <p>{stkPrompt?.message || stkFlowError}</p>
                </div>
                <button className="primary" type="button" onClick={closeStkFlow}>Try again</button>
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}

function UsersView({ auth, notify }: { auth: AuthResponse; notify: Notify }) {
  const token = auth.accessToken;
  const isPlatform = auth.user.role === "admin";
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState<CreateUserPayload>({
    username: "",
    fullName: "",
    role: isPlatform ? "admin" : "waiter",
    password: "",
    tenantId: auth.user.tenantId ?? undefined,
    permissions: defaultPermissionsForRole(isPlatform ? "admin" : "waiter")
  });
  const visibleUsers = isPlatform ? users.filter((user) => user.role === "admin") : users.filter((user) => user.role !== "admin");

  async function load() {
    setError("");
    try {
      const userResult = await api.listUsers(token);
      setUsers(userResult.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load users");
    }
  }

  useEffect(() => { void load(); }, []);

  async function createUser(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await api.createUser(token, isPlatform ? { ...form, role: "admin", tenantId: undefined } : { ...form, tenantId: auth.user.tenantId ?? undefined });
      notify(isPlatform ? "Admin user created" : "Staff user created", form.username);
      setForm({
        username: "",
        fullName: "",
        role: isPlatform ? "admin" : "waiter",
        password: "",
        tenantId: auth.user.tenantId ?? undefined,
        permissions: defaultPermissionsForRole(isPlatform ? "admin" : "waiter")
      });
      await load();
    } catch (err) {
      const messageText = err instanceof Error ? err.message : "Could not create user";
      setError(messageText);
      notify("User creation failed", messageText, "error");
    }
  }

  async function toggleDisabled(user: AdminUser) {
    if (user.id === auth.user.id) {
      const messageText = "You cannot disable your own account.";
      setError(messageText);
      notify("User update blocked", messageText, "error");
      return;
    }
    try {
      await api.updateUser(token, user.id, { disabled: !user.disabled });
      notify("User updated", `${user.username} is now ${user.disabled ? "active" : "disabled"}.`);
      await load();
    } catch (err) {
      const messageText = err instanceof Error ? err.message : "Could not update user";
      setError(messageText);
      notify("User update failed", messageText, "error");
    }
  }

  async function resetPassword(user: AdminUser) {
    const password = window.prompt(`New password for ${user.username}`);
    if (!password) return;
    try {
      await api.updateUser(token, user.id, { password });
      notify("Password reset", user.username);
      await load();
    } catch (err) {
      const messageText = err instanceof Error ? err.message : "Could not reset password";
      setError(messageText);
      notify("Password reset failed", messageText, "error");
    }
  }

  async function togglePermission(user: AdminUser, module: UserModule) {
    try {
      const permissions: Partial<UserPermissions> = { [module]: !user.permissions[module] };
      await api.updateUser(token, user.id, { permissions });
      notify("Permissions updated", `${user.username} can${permissions[module] ? "" : " no longer"} access ${permissionLabels.find((item) => item.key === module)?.label ?? module}.`);
      await load();
    } catch (err) {
      const messageText = err instanceof Error ? err.message : "Could not update permissions";
      setError(messageText);
      notify("Permission update failed", messageText, "error");
    }
  }

  return (
    <>
      <div className="section-header">
        <h2>{isPlatform ? "Admin Users" : "Staff Access"}</h2>
        <span className="section-badge">{visibleUsers.length} users</span>
      </div>
      <section className="panel split-panel">
        <form className="user-form" onSubmit={createUser}>
          <h2><UserPlus size={16} /> {isPlatform ? "Add admin user" : "Add staff user"}</h2>
          {error && <div className="error">{error}</div>}
          <label>Username<input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} /></label>
          <label>Full name<input value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} /></label>
          {isPlatform ? (
            <label>Role<input value="Platform Admin" disabled /></label>
          ) : (
            <label>Role<select value={form.role} onChange={(event) => {
              const role = event.target.value as CreateUserPayload["role"];
              setForm({ ...form, role, permissions: defaultPermissionsForRole(role) });
            }}>
              <option value="waiter">Waiter</option>
              <option value="manager">Business Admin</option>
            </select></label>
          )}
          <label>Temporary password<input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>
          {!isPlatform && (
            <div className="permission-grid">
              {permissionLabels.map((permission) => (
                <label key={permission.key} className="permission-toggle">
                  <input
                    type="checkbox"
                    checked={Boolean(form.permissions?.[permission.key])}
                    onChange={(event) => setForm({ ...form, permissions: { ...(form.permissions ?? {}), [permission.key]: event.target.checked } })}
                  />
                  <span>{permission.label}</span>
                </label>
              ))}
            </div>
          )}
          <button className="primary">{isPlatform ? "Create admin" : "Create staff user"}</button>
        </form>
        <div className="table-wrap">
          <table>
            <thead><tr><th>User</th><th>Role</th>{!isPlatform && <th>Modules</th>}<th>Status</th><th>Last login</th><th>Actions</th></tr></thead>
            <tbody>
              {!visibleUsers.length ? <EmptyRow label="No users found" /> : visibleUsers.map((user) => (
                <tr key={user.id}>
                  <td><strong>{user.username}</strong><span className="subtext">{user.fullName}</span></td>
                  <td><span className="status">{user.role === "admin" ? "platform admin" : user.role === "manager" ? "business admin" : user.role}</span></td>
                  {!isPlatform && (
                    <td>
                      <div className="permission-pills">
                        {permissionLabels.map((permission) => (
                          <button
                            key={permission.key}
                            type="button"
                            className={user.permissions[permission.key] ? "active" : ""}
                            disabled={user.id === auth.user.id}
                            onClick={() => void togglePermission(user, permission.key)}
                          >
                            {permission.label}
                          </button>
                        ))}
                      </div>
                    </td>
                  )}
                  <td><span className={`status ${user.disabled ? "status-failed" : "status-verified"}`}>{user.disabled ? "Disabled" : "Active"}</span></td>
                  <td className="cell-muted">{formatDate(user.lastLoginAt)}</td>
                  <td className="actions"><button onClick={() => void toggleDisabled(user)}>{user.disabled ? "Enable" : "Disable"}</button><button onClick={() => void resetPassword(user)}>Reset pw</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

export function App() {
  const [auth, setAuth] = useState<AuthResponse | null>(() => {
    const raw = localStorage.getItem(tokenKey);
    return raw ? (JSON.parse(raw) as AuthResponse) : null;
  });
  const [tab, setTab] = useState<Tab>(() => defaultTab(auth));
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [authReady, setAuthReady] = useState(false);

  function saveAuth(next: AuthResponse) {
    const stored = withAccessTokenExpiry(next);
    localStorage.setItem(tokenKey, JSON.stringify(stored));
    setAuth(stored);
    setAuthReady(true);
    setTab(defaultTab(stored));
  }

  function logout() {
    const current = auth;
    localStorage.removeItem(tokenKey);
    setAuth(null);
    setAuthReady(true);
    setTab("verify");
    if (current) void api.logout(current.accessToken, current.refreshToken);
  }

  useEffect(() => {
    if (!auth) {
      setAuthReady(true);
      return;
    }

    let cancelled = false;
    let timer: number | undefined;

    const clearStoredAuth = () => {
      localStorage.removeItem(tokenKey);
      setAuth(null);
      setAuthReady(true);
      setTab("verify");
    };

    const refreshSession = async () => {
      try {
        const next = withAccessTokenExpiry(await api.refresh({ refreshToken: auth.refreshToken, deviceId: getDeviceId() }));
        if (cancelled) return;
        localStorage.setItem(tokenKey, JSON.stringify(next));
        setAuth(next);
        setAuthReady(true);
      } catch (error) {
        if (cancelled) return;
        if (isAuthenticationError(error)) {
          clearStoredAuth();
          return;
        }
        setAuthReady(Boolean(auth.accessTokenExpiresAt && auth.accessTokenExpiresAt > Date.now()));
        timer = window.setTimeout(() => void refreshSession(), 30_000);
      }
    };

    const delay = accessTokenRefreshDelay(auth);
    if (delay === 0) {
      setAuthReady(false);
      void refreshSession();
    } else {
      setAuthReady(true);
      timer = window.setTimeout(() => void refreshSession(), delay);
    }

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [auth?.accessToken, auth?.refreshToken, auth?.accessTokenExpiresAt]);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.map((item) => item.id === id ? { ...item, exiting: true } : item));
    setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), 350);
  }, []);

  const addPaymentToast = useCallback((tx: PaymentSummary) => {
    const id = `${tx.id}-${Date.now()}`;
    const nextToast: ToastItem = { id, kind: "payment", tx, exiting: false };
    setToasts((current) => [nextToast, ...current].slice(0, 5));
    window.setTimeout(() => dismissToast(id), toastDurationMs);
  }, [dismissToast]);

  const notify = useCallback<Notify>((title, message, tone = "success") => {
    const id = `notice-${crypto.randomUUID()}`;
    const nextToast: ToastItem = { id, kind: "notice", title, message, tone, exiting: false };
    setToasts((current) => [nextToast, ...current].slice(0, 5));
    window.setTimeout(() => dismissToast(id), toastDurationMs);
  }, [dismissToast]);

  useTransactionPoller(authReady ? auth?.accessToken ?? null : null, authReady && auth?.user.role === "manager", addPaymentToast);

  if (!authReady) return <main className="session-restoring"><RefreshCw className="spin" size={30} /><strong>Restoring session</strong><span>Connecting securely...</span></main>;
  if (!auth) return <LoginView onLogin={saveAuth} />;
  const isPlatform = auth.user.role === "admin";
  const title = isPlatform ? "M-Verify Platform" : auth.user.tenantName ?? "Business Portal";

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <MVerifyIcon size={34} />
          <div className="brand-lockup-text"><h1>{title}</h1><p>{auth.user.fullName} - {auth.user.role === "manager" ? "business admin" : auth.user.role}</p></div>
        </div>
        <nav className="topnav">
          {isPlatform ? (
            <>
              <button className={tab === "platform-dashboard" ? "active" : ""} onClick={() => setTab("platform-dashboard")}>Dashboard</button>
              <button className={tab === "businesses" ? "active" : ""} onClick={() => setTab("businesses")}>Businesses</button>
              <button className={tab === "platform-users" ? "active" : ""} onClick={() => setTab("platform-users")}>Admin Users</button>
            </>
          ) : (
            <>
              {auth.user.permissions.dashboard && <button className={tab === "business-dashboard" ? "active" : ""} onClick={() => setTab("business-dashboard")}>Dashboard</button>}
              {auth.user.permissions.verify && <button className={tab === "verify" ? "active" : ""} onClick={() => setTab("verify")}>Verify</button>}
              {auth.user.role === "manager" && auth.user.permissions.transactions && <button className={tab === "transactions" ? "active" : ""} onClick={() => setTab("transactions")}>Transactions</button>}
              {auth.user.role === "manager" && auth.user.permissions.staff && <button className={tab === "staff" ? "active" : ""} onClick={() => setTab("staff")}>Staff</button>}
            </>
          )}
        </nav>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <a className="topbar-download" href={desktopDownloadUrl} download>
            <WindowsMark />
            Windows App
          </a>
          <div className="user-avatar" title={auth.user.fullName}>{initials(auth.user.fullName)}</div>
          <button className="signout-btn" onClick={logout}><LogOut size={13} /> Sign out</button>
        </div>
      </header>
      <div className="content-area">
        {tab === "platform-dashboard" && <PlatformDashboardView token={auth.accessToken} />}
        {tab === "businesses" && <BusinessesView token={auth.accessToken} notify={notify} />}
        {tab === "platform-users" && <UsersView auth={auth} notify={notify} />}
        {tab === "business-dashboard" && <BusinessDashboardView token={auth.accessToken} />}
        {tab === "verify" && <VerifyView token={auth.accessToken} notify={notify} />}
        {tab === "transactions" && <TransactionsView token={auth.accessToken} notify={notify} />}
        {tab === "staff" && <UsersView auth={auth} notify={notify} />}
      </div>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </main>
  );
}
