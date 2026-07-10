import { useEffect, useState } from "react";
import {
  BarChart3,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  LogOut,
  Minus,
  Pin,
  PinOff,
  ReceiptText,
  RefreshCw,
  Search,
  ShieldCheck,
  UserPlus,
  Users
} from "lucide-react";
import type { AuthResponse, PaymentSummary, VerificationResponse, VerificationStatus } from "@m-verify/shared";
import {
  api,
  API_BASE_URL,
  type BusinessDashboard,
  type DesktopUpdateInfo,
  type DesktopUser
} from "./api";
import {
  enableAutostartOnce,
  getCurrentAppVersion,
  hideWindow,
  openExternalUrl,
  restoreWindowState,
  saveCurrentWindowState,
  setAlwaysOnTop,
  startWindowDrag
} from "./tauri";

const authKey = "mverify_desktop_auth";
const deviceKey = "mverify_desktop_device_id";
const portalUrl = API_BASE_URL.replace(/\/api\/?$/, "");

type UpdatePromptState = {
  currentVersion: string;
  latest: DesktopUpdateInfo;
};

type DesktopTab = "dashboard" | "verify" | "payments" | "staff";

function getDeviceId(): string {
  const existing = localStorage.getItem(deviceKey);
  if (existing) return existing;
  const next = crypto.randomUUID();
  localStorage.setItem(deviceKey, next);
  return next;
}

function resultTone(result?: VerificationStatus): string {
  if (!result) return "";
  return result.toLowerCase().replace(/_/g, "-");
}

function formatAmount(value: string | number): string {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount)) return "0";
  return amount.toLocaleString("en-KE", { maximumFractionDigits: 2 });
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function compareVersions(left: string, right: string): number {
  const leftParts = left.split(".").map((part) => Number(part.replace(/\D+.*/, "")) || 0);
  const rightParts = right.split(".").map((part) => Number(part.replace(/\D+.*/, "")) || 0);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function handleTitlebarPointerDown(event: React.PointerEvent<HTMLDivElement>): void {
  if (event.button !== 0) return;
  const target = event.target as HTMLElement;
  if (target.closest("button")) return;
  void startWindowDrag();
}

function UpdateBanner({ update }: { update: UpdatePromptState | null }) {
  if (!update) return null;
  return (
    <div className="update-banner">
      <div>
        <strong>Update available</strong>
        <span>Version {update.latest.latestVersion} is ready. You have {update.currentVersion}.</span>
      </div>
      <button type="button" onClick={() => void openExternalUrl(update.latest.downloadUrl)}>
        Download
      </button>
    </div>
  );
}

function Titlebar({
  auth,
  alwaysTop,
  onToggleTop,
  onLogout
}: {
  auth: AuthResponse | null;
  alwaysTop: boolean;
  onToggleTop: () => void;
  onLogout?: () => void;
}) {
  return (
    <div className="titlebar" data-tauri-drag-region onPointerDown={handleTitlebarPointerDown}>
      <div className="title-brand" data-tauri-drag-region>
        <ShieldCheck size={19} />
        <span data-tauri-drag-region>M-Verify</span>
      </div>
      <div className="window-actions">
        {auth && (
          <button type="button" className="icon-button" onClick={onToggleTop} title="Toggle always on top">
            {alwaysTop ? <Pin size={15} /> : <PinOff size={15} />}
          </button>
        )}
        <button type="button" className="icon-button" onClick={() => void hideWindow()} title="Minimize to tray">
          <Minus size={16} />
        </button>
        {auth && onLogout && (
          <button type="button" className="icon-button" onClick={onLogout} title="Sign out">
            <LogOut size={15} />
          </button>
        )}
      </div>
    </div>
  );
}

function Login({ onLogin, update }: { onLogin: (auth: AuthResponse) => void; update: UpdatePromptState | null }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
        deviceName: "M-Verify Windows Desktop"
      });
      await enableAutostartOnce();
      onLogin(auth);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="screen login-screen" onSubmit={submit}>
      <Titlebar auth={null} alwaysTop onToggleTop={() => undefined} />
      <section className="content">
        <UpdateBanner update={update} />
        <div className="login-mark">
          <ShieldCheck size={42} />
          <h1>Staff login</h1>
          <p>{API_BASE_URL}</p>
        </div>

        <label>
          Username
          <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
        </label>
        <label>
          Password
          <div className="password-field">
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
            />
            <button type="button" onClick={() => setShowPassword((value) => !value)} title="Toggle password visibility">
              {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </label>
        {error && <div className="error">{error}</div>}
        <button className="primary" disabled={loading || !username || !password}>
          {loading && <Loader2 className="spin" size={16} />}
          {loading ? "Signing in" : "Sign in"}
        </button>
      </section>
    </form>
  );
}

function VerifyView({ auth }: { auth: AuthResponse }) {
  const [query, setQuery] = useState("");
  const [payments, setPayments] = useState<PaymentSummary[]>([]);
  const [selectedPayment, setSelectedPayment] = useState<PaymentSummary | null>(null);
  const [result, setResult] = useState<VerificationResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);

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
        const params = new URLSearchParams({ q: trimmed, limit: "12" });
        const response = await api.searchVerificationPayments(auth.accessToken, params);
        if (!cancelled) {
          setPayments(response.data);
          setError("");
        }
      } catch (err) {
        if (!cancelled) {
          setPayments([]);
          setError(err instanceof Error ? err.message : "Payment search failed");
        }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [auth.accessToken, query]);

  async function verifySelected() {
    if (!selectedPayment) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const response = await api.verifyPayment(auth.accessToken, {
        paymentId: selectedPayment.id
      });
      setResult(response);
      if (response.payment) {
        setSelectedPayment(response.payment);
        setPayments((current) => current.map((payment) => payment.id === response.payment!.id ? response.payment! : payment));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="view-stack">
      <label>
        Search received payments
        <div className="search-input">
          <Search size={15} />
          <input
            placeholder="M-Pesa code, amount, or customer name"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </label>

      <div className="payment-search-list">
        {!query.trim() && <div className="empty-state">Start typing to find a received payment.</div>}
        {query.trim() && searching && <div className="empty-state">Searching payments...</div>}
        {query.trim() && !searching && !payments.length && <div className="empty-state">No received payments found.</div>}
        {payments.map((payment) => (
          <button
            type="button"
            className={`payment-option ${selectedPayment?.id === payment.id ? "selected" : ""}`}
            key={payment.id}
            onClick={() => {
              setSelectedPayment(payment);
              setResult(null);
            }}
          >
            <div>
              <strong>{payment.customerName || "M-Pesa customer"}</strong>
              <span>{payment.transactionCode} - {payment.reference ?? "No reference"}</span>
            </div>
            <div className="payment-option-right">
              <strong>KES {formatAmount(payment.amount)}</strong>
              <span>{payment.verifiedStatus ? "Verified" : formatDate(payment.paymentTime)}</span>
            </div>
          </button>
        ))}
      </div>

      {selectedPayment && (
        <div className="selected-payment">
          <div className="selected-payment-head">
            <strong>Selected payment</strong>
            <span>{selectedPayment.verifiedStatus ? "Already verified" : "Ready to verify"}</span>
          </div>
          <dl>
            <div>
              <dt>Customer</dt>
              <dd>{selectedPayment.customerName ?? "M-Pesa customer"}</dd>
            </div>
            <div>
              <dt>Code</dt>
              <dd>{selectedPayment.transactionCode}</dd>
            </div>
            <div>
              <dt>Amount</dt>
              <dd>KES {formatAmount(selectedPayment.amount)}</dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>{selectedPayment.phoneNumber}</dd>
            </div>
            <div>
              <dt>Reference</dt>
              <dd>{selectedPayment.reference ?? "-"}</dd>
            </div>
            <div>
              <dt>Received</dt>
              <dd>{formatDate(selectedPayment.paymentTime)}</dd>
            </div>
          </dl>
        </div>
      )}

      <button
        className="primary verify-button"
        type="button"
        onClick={() => void verifySelected()}
        disabled={loading || !selectedPayment || selectedPayment.verifiedStatus}
      >
        {loading && <Loader2 className="spin" size={16} />}
        {loading ? "Verifying" : selectedPayment?.verifiedStatus ? "Already verified" : "Verify selected payment"}
      </button>

      {error && <div className="error">{error}</div>}
      {result && (
        <div className={`result result-${resultTone(result.result)}`}>
          <strong>{result.result}</strong>
          <span>{result.message}</span>
          {result.payment && (
            <dl>
              <div>
                <dt>Code</dt>
                <dd>{result.payment.transactionCode}</dd>
              </div>
              <div>
                <dt>Amount</dt>
                <dd>KES {result.payment.amount}</dd>
              </div>
              <div>
                <dt>Phone</dt>
                <dd>{result.payment.phoneNumber}</dd>
              </div>
            </dl>
          )}
        </div>
      )}
    </section>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="kpi-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PaymentRow({ payment }: { payment: PaymentSummary }) {
  return (
    <div className="list-row">
      <div>
        <strong>KES {formatAmount(payment.amount)}</strong>
        <span>{payment.customerName || payment.reference || payment.transactionCode}</span>
      </div>
      <div className="list-row-right">
        <span>{payment.verifiedStatus ? "Verified" : "Received"}</span>
        <small>{formatDate(payment.paymentTime)}</small>
      </div>
    </div>
  );
}

function DashboardView({ token }: { token: string }) {
  const [dashboard, setDashboard] = useState<BusinessDashboard | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      setDashboard(await api.businessDashboard(token));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dashboard failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <section className="view-stack">
      <div className="view-heading">
        <div>
          <h2>Dashboard</h2>
          <p>Business activity</p>
        </div>
        <button type="button" className="small-button" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={13} />
        </button>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="kpi-grid">
        <KpiCard label="Payments" value={String(dashboard?.kpis.paidTransactions ?? 0)} />
        <KpiCard label="Volume" value={`KES ${formatAmount(dashboard?.kpis.totalPaymentVolume ?? 0)}`} />
        <KpiCard label="Today" value={`KES ${formatAmount(dashboard?.kpis.todayPaymentVolume ?? 0)}`} />
        <KpiCard label="Staff" value={String(dashboard?.kpis.activeStaffUsers ?? 0)} />
      </div>
      <div className="panel-list">
        <h3>Recent payments</h3>
        {dashboard?.recentPayments.length ? (
          dashboard.recentPayments.map((payment) => <PaymentRow key={payment.id} payment={payment} />)
        ) : (
          <div className="empty-state">No payments received yet.</div>
        )}
      </div>
    </section>
  );
}

function PaymentsView({ token }: { token: string }) {
  const [payments, setPayments] = useState<PaymentSummary[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: "1", limit: "25" });
      if (search.trim()) params.set("search", search.trim());
      const result = await api.listTransactions(token, params);
      setPayments(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payments failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <section className="view-stack">
      <div className="search-row">
        <input placeholder="Search code, phone, reference" value={search} onChange={(event) => setSearch(event.target.value)} />
        <button type="button" className="small-button" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={13} />
        </button>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="panel-list">
        {payments.length ? payments.map((payment) => <PaymentRow key={payment.id} payment={payment} />) : <div className="empty-state">No payments found.</div>}
      </div>
    </section>
  );
}

function StaffView({ token }: { token: string }) {
  const [users, setUsers] = useState<DesktopUser[]>([]);
  const [form, setForm] = useState({ username: "", fullName: "", password: "", role: "waiter" as "manager" | "waiter" });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const result = await api.listUsers(token);
      setUsers(result.data.filter((user) => user.role !== "admin"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Staff failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createStaff(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      await api.createUser(token, form);
      setForm({ username: "", fullName: "", password: "", role: "waiter" });
      setMessage("Staff user created.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create staff");
    }
  }

  async function toggleUser(user: DesktopUser) {
    setError("");
    setMessage("");
    try {
      await api.updateUser(token, user.id, { disabled: !user.disabled });
      setMessage(`${user.username} updated.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update staff");
    }
  }

  async function resetPassword(user: DesktopUser) {
    const password = window.prompt(`New password for ${user.username}`);
    if (!password) return;
    setError("");
    setMessage("");
    try {
      await api.updateUser(token, user.id, { password });
      setMessage(`${user.username} password updated.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset password");
    }
  }

  return (
    <section className="view-stack">
      <form className="staff-form" onSubmit={createStaff}>
        <input placeholder="Username" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} />
        <input placeholder="Full name" value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} />
        <div className="two-col">
          <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as "manager" | "waiter" })}>
            <option value="waiter">Waiter</option>
            <option value="manager">Business Admin</option>
          </select>
          <input placeholder="Password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
        </div>
        <button className="primary" disabled={!form.username || !form.fullName || !form.password}>
          <UserPlus size={15} />
          Add staff
        </button>
      </form>
      {message && <div className="success">{message}</div>}
      {error && <div className="error">{error}</div>}
      <div className="panel-list">
        {users.length ? (
          users.map((user) => (
            <div className="list-row" key={user.id}>
              <div>
                <strong>{user.fullName}</strong>
                <span>{user.role === "manager" ? "business admin" : "waiter"} - {user.disabled ? "disabled" : "active"}</span>
              </div>
              <div className="row-actions">
                <button type="button" onClick={() => void resetPassword(user)}>Pw</button>
                <button type="button" onClick={() => void toggleUser(user)} disabled={loading}>{user.disabled ? "Enable" : "Disable"}</button>
              </div>
            </div>
          ))
        ) : (
          <div className="empty-state">No staff users yet.</div>
        )}
      </div>
    </section>
  );
}

function PlatformAdminView() {
  return (
    <section className="content">
      <div className="admin-notice">
        <ShieldCheck size={42} />
        <h1>Platform admin</h1>
        <p>Use the web portal to manage businesses, platform users, commissions, and M-Pesa credentials.</p>
        <button type="button" className="primary" onClick={() => void openExternalUrl(portalUrl)}>
          <ExternalLink size={15} />
          Open web admin
        </button>
      </div>
    </section>
  );
}

function LoggedInApp({ auth, update, onLogout }: { auth: AuthResponse; update: UpdatePromptState | null; onLogout: () => void }) {
  const [alwaysTop, setAlwaysTopState] = useState(true);
  const [tab, setTab] = useState<DesktopTab>(auth.user.role === "manager" ? "dashboard" : "verify");

  async function toggleAlwaysTop() {
    const next = !alwaysTop;
    setAlwaysTopState(next);
    await setAlwaysOnTop(next);
  }

  async function logout() {
    await api.logout(auth.accessToken, auth.refreshToken);
    onLogout();
  }

  if (auth.user.role === "admin") {
    return (
      <main className="screen">
        <Titlebar auth={auth} alwaysTop={alwaysTop} onToggleTop={() => void toggleAlwaysTop()} onLogout={() => void logout()} />
        <PlatformAdminView />
      </main>
    );
  }

  const isManager = auth.user.role === "manager";

  return (
    <main className="screen">
      <Titlebar auth={auth} alwaysTop={alwaysTop} onToggleTop={() => void toggleAlwaysTop()} onLogout={() => void logout()} />
      <section className="content verifier-content">
        <UpdateBanner update={update} />
        <div className="operator-row">
          <div>
            <strong>{auth.user.tenantName ?? auth.user.fullName}</strong>
            <span>{auth.user.role === "manager" ? "business admin" : "waiter"}</span>
          </div>
          <CheckCircle2 size={18} />
        </div>
        {isManager && (
          <nav className="role-tabs">
            <button className={tab === "dashboard" ? "active" : ""} onClick={() => setTab("dashboard")} type="button"><BarChart3 size={13} /> Dashboard</button>
            <button className={tab === "verify" ? "active" : ""} onClick={() => setTab("verify")} type="button"><ShieldCheck size={13} /> Verify</button>
            <button className={tab === "payments" ? "active" : ""} onClick={() => setTab("payments")} type="button"><ReceiptText size={13} /> Payments</button>
            <button className={tab === "staff" ? "active" : ""} onClick={() => setTab("staff")} type="button"><Users size={13} /> Staff</button>
          </nav>
        )}
        {tab === "dashboard" && isManager && <DashboardView token={auth.accessToken} />}
        {tab === "verify" && <VerifyView auth={auth} />}
        {tab === "payments" && isManager && <PaymentsView token={auth.accessToken} />}
        {tab === "staff" && isManager && <StaffView token={auth.accessToken} />}
      </section>
    </main>
  );
}

export function App() {
  const [auth, setAuth] = useState<AuthResponse | null>(() => {
    const raw = localStorage.getItem(authKey);
    return raw ? (JSON.parse(raw) as AuthResponse) : null;
  });
  const [update, setUpdate] = useState<UpdatePromptState | null>(null);

  useEffect(() => {
    void enableAutostartOnce();
    void restoreWindowState();
    window.addEventListener("beforeunload", () => {
      void saveCurrentWindowState();
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function checkForUpdate() {
      try {
        const [currentVersion, latest] = await Promise.all([getCurrentAppVersion(), api.latestDesktopUpdate()]);
        if (!cancelled && compareVersions(latest.latestVersion, currentVersion) > 0) {
          setUpdate({ currentVersion, latest });
        }
      } catch {
        // Update checks should never block payment verification.
      }
    }
    void checkForUpdate();
    return () => {
      cancelled = true;
    };
  }, []);

  function saveAuth(next: AuthResponse) {
    localStorage.setItem(authKey, JSON.stringify(next));
    setAuth(next);
  }

  function logout() {
    localStorage.removeItem(authKey);
    setAuth(null);
  }

  return auth ? <LoggedInApp auth={auth} onLogout={logout} update={update} /> : <Login onLogin={saveAuth} update={update} />;
}
