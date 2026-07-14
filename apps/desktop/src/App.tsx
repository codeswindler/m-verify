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
  Printer,
  ReceiptText,
  RefreshCw,
  Search,
  Scaling,
  ShieldCheck,
  UserPlus,
  Users,
  XCircle
} from "lucide-react";
import { accessTokenRefreshDelay, buildPaymentReceiptMarkup, paymentReceiptStyles, withAccessTokenExpiry } from "@m-verify/shared";
import type { AuthResponse, PaymentReceipt, PaymentSummary, StkPromptResponse, VerificationResponse, VerificationStatus } from "@m-verify/shared";
import {
  api,
  API_BASE_URL,
  isAuthenticationError,
  type BusinessDashboard,
  type DesktopUser
} from "./api";
import {
  checkNativeUpdate,
  enableAutostartOnce,
  getCurrentAppVersion,
  hideWindow,
  installNativeUpdate,
  openExternalUrl,
  restoreWindowState,
  saveCurrentWindowState,
  setAlwaysOnTop,
  startWindowResize,
  type NativeUpdateInfo,
  type UpdateInstallProgress
} from "./tauri";

const authKey = "mverify_desktop_auth";
const deviceKey = "mverify_desktop_device_id";
const portalUrl = API_BASE_URL.replace(/\/api\/?$/, "");

type UpdatePromptState = {
  currentVersion: string;
  latestVersion: string;
  notes?: string;
  manualDownloadUrl?: string;
  native?: NativeUpdateInfo;
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
  return new Intl.DateTimeFormat("en-KE", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" }).format(new Date(value));
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

function formatUpdateProgress(progress: UpdateInstallProgress | null): string {
  if (!progress) return "";
  if (progress.status === "finished") return "Installing update";
  if (progress.total && progress.downloaded !== undefined) {
    const percent = Math.min(100, Math.round((progress.downloaded / progress.total) * 100));
    return `Downloading ${percent}%`;
  }
  return progress.status === "started" ? "Starting download" : "Downloading update";
}

function UpdateBanner({ update }: { update: UpdatePromptState | null }) {
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState("");
  const [progress, setProgress] = useState<UpdateInstallProgress | null>(null);

  if (!update) return null;

  async function installUpdate() {
    setInstallError("");
    if (!update) return;
    if (!update.native) {
      if (update.manualDownloadUrl) await openExternalUrl(update.manualDownloadUrl);
      return;
    }

    setInstalling(true);
    try {
      await installNativeUpdate(update.native, setProgress);
    } catch (err) {
      setInstalling(false);
      if (update.manualDownloadUrl) {
        setInstallError("Automatic install failed. Opening the installer download.");
        await openExternalUrl(update.manualDownloadUrl);
        return;
      }
      setInstallError(err instanceof Error ? err.message : "Update installation failed");
    }
  }

  return (
    <div className="update-banner">
      <div>
        <strong>Update available</strong>
        <span>
          Version {update.latestVersion} is ready. You have {update.currentVersion}.
          {installing ? ` ${formatUpdateProgress(progress)}...` : ""}
        </span>
        {installError && <em>{installError}</em>}
      </div>
      <button type="button" onClick={() => void installUpdate()} disabled={installing}>
        {installing ? "Updating" : update.native ? "Install" : "Download"}
      </button>
    </div>
  );
}

function UpdateDialog({ update, onDismiss }: { update: UpdatePromptState; onDismiss: () => void }) {
  return (
    <div className="update-dialog-backdrop" role="dialog" aria-modal="true" aria-label="Update available">
      <div className="update-dialog">
        <UpdateBanner update={update} />
        <button type="button" className="small-button" onClick={onDismiss}>
          Later
        </button>
      </div>
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
    <div className="titlebar" data-tauri-drag-region>
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

function ResizeGrip() {
  return (
    <button
      type="button"
      className="resize-grip"
      title="Resize window"
      aria-label="Resize window"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        void startWindowResize();
      }}
    >
      <Scaling size={13} />
    </button>
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

function PaymentReceiptDialog({ payment, token, onClose }: { payment: PaymentSummary; token: string; onClose: () => void }) {
  const [receipt, setReceipt] = useState<PaymentReceipt | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void api.getPaymentReceipt(token, payment.id)
      .then((next) => {
        if (!cancelled) setReceipt(next);
      })
      .catch((receiptError) => {
        if (!cancelled) setError(receiptError instanceof Error ? receiptError.message : "Could not load receipt");
      });
    return () => { cancelled = true; };
  }, [payment.id, token]);

  return (
    <div className="receipt-dialog-backdrop" role="dialog" aria-modal="true" aria-label="Verified payment receipt">
      <section className="receipt-dialog">
        <style>{paymentReceiptStyles}</style>
        <div className="receipt-dialog-header">
          <div><span>Verified payment</span><strong>Receipt</strong></div>
          <button className="small-button" type="button" onClick={onClose} aria-label="Close receipt"><XCircle size={16} /></button>
        </div>
        <div className="receipt-preview">
          {!receipt && !error && <div className="empty-state">Preparing receipt...</div>}
          {error && <div className="error">{error}</div>}
          {receipt && <div className="receipt-print-target" dangerouslySetInnerHTML={{ __html: buildPaymentReceiptMarkup(receipt) }} />}
        </div>
        <div className="receipt-dialog-actions">
          <button className="small-button" type="button" onClick={onClose}>Close</button>
          <button className="primary" type="button" onClick={() => window.print()} disabled={!receipt}><Printer size={15} /> Print</button>
        </div>
      </section>
    </div>
  );
}

function VerifyView({ auth }: { auth: AuthResponse }) {
  const [query, setQuery] = useState("");
  const [payments, setPayments] = useState<PaymentSummary[]>([]);
  const [selectedPayment, setSelectedPayment] = useState<PaymentSummary | null>(null);
  const [receiptPayment, setReceiptPayment] = useState<PaymentSummary | null>(null);
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

  useEffect(() => {
    const promptId = stkPrompt && ["REQUESTED", "PENDING"].includes(stkPrompt.status) ? stkPrompt.id : null;
    if (!promptId) return;

    let cancelled = false;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const next = await api.getStkPrompt(auth.accessToken, promptId);
        if (cancelled) return;
        setStkFlowError("");
        setStkPrompt(next);
        if (next.payment) {
          setSelectedPayment(next.payment);
          setPayments([next.payment]);
          setQuery("");
          setResult(null);
        }
      } catch (err) {
        if (cancelled) return;
        setStkFlowError(err instanceof Error ? `${err.message} Retrying...` : "Connection interrupted. Retrying...");
      } finally {
        if (!cancelled) timer = window.setTimeout(() => void poll(), 3000);
      }
    };

    timer = window.setTimeout(() => void poll(), 3000);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [auth.accessToken, stkPrompt?.id, stkPrompt?.status]);

  async function sendStkPrompt() {
    const amount = Math.round(Number(stkAmount));
    if (!stkPhone.trim() || !Number.isFinite(amount) || amount <= 0) {
      setError("Enter customer phone and amount for STK prompt.");
      return;
    }
    setStkLoading(true);
    setError("");
    setStkFlowError("");
    setResult(null);
    setStkPrompt(null);
    try {
      const response = await api.initiateStkPrompt(auth.accessToken, {
        phoneNumber: stkPhone.trim(),
        amount,
        reference: stkReference.trim() || undefined
      });
      setStkPrompt(response);
    } catch (err) {
      const message = err instanceof Error ? err.message : "STK prompt failed";
      setError(message);
      setStkFlowError(message);
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
    <section className="view-stack">
      <div className="verify-actions">
        <button className={showStk ? "small-button active" : "small-button"} type="button" onClick={() => setShowStk((value) => !value)}>
          STK prompt
        </button>
      </div>

      {showStk && (
        <div className="stk-panel">
          <div className="two-col">
            <label>
              Mobile number
              <input value={stkPhone} onChange={(event) => setStkPhone(event.target.value)} placeholder="07..." />
            </label>
            <label>
              Amount
              <input value={stkAmount} onChange={(event) => setStkAmount(event.target.value)} inputMode="numeric" min="1" step="1" placeholder="KES" type="number" />
            </label>
          </div>
          <label>
            Reference
            <input value={stkReference} onChange={(event) => setStkReference(event.target.value)} placeholder="Optional bill/table" />
          </label>
          <button className="primary" type="button" onClick={() => void sendStkPrompt()} disabled={stkLoading}>
            {stkLoading ? "Sending prompt" : "Send STK prompt"}
          </button>
          {stkPrompt && (
            <div className={`result result-${stkPrompt.status === "PAID" ? "verified" : ["FAILED", "CANCELLED", "TIMED_OUT"].includes(stkPrompt.status) ? "error" : "pending"}`}>
              <strong>{stkPrompt.status.replace(/_/g, " ")}</strong>
              <span>{stkPrompt.message}</span>
              {stkPrompt.payment && <span>Select “Verify selected payment” to complete the waiter check.</span>}
            </div>
          )}
        </div>
      )}

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
      {selectedPayment?.verifiedStatus && (
        <button className="small-button receipt-action" type="button" onClick={() => setReceiptPayment(selectedPayment)}>
          <Printer size={15} /> Print receipt
        </button>
      )}

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
          {result.payment?.verifiedStatus && (
            <button className="small-button receipt-action" type="button" onClick={() => setReceiptPayment(result.payment!)}>
              <Printer size={15} /> Print receipt
            </button>
          )}
        </div>
      )}

      {(stkLoading || stkPrompt || stkFlowError) && (
        <div className="stk-flow-backdrop" role="dialog" aria-modal="true" aria-label="M-Pesa STK payment status">
          <section className={`stk-flow-dialog ${stkWaiting ? "waiting" : stkFailed ? "failed" : "paid"}`}>
            {stkWaiting ? (
              <>
                <div className="stk-flow-visual" aria-hidden="true">
                  <span className="stk-pulse-ring" />
                  <Loader2 className="spin" size={34} />
                </div>
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
                <small>{stkFlowError || "Checking payment automatically. This closes when M-Pesa responds."}</small>
              </>
            ) : stkVerified && stkPayment ? (
              <>
                <CheckCircle2 className="stk-flow-status-icon" size={52} />
                <div className="stk-flow-copy">
                  <span className="stk-flow-kicker">Complete</span>
                  <h2>Payment verified</h2>
                  <p>{result?.message}</p>
                </div>
                <div className="stk-flow-receipt">
                  <div><span>Amount</span><strong>KES {formatAmount(stkPayment.amount)}</strong></div>
                  <div><span>M-Pesa code</span><strong>{stkPayment.transactionCode}</strong></div>
                </div>
                <button className="primary" type="button" onClick={() => setReceiptPayment(stkPayment)}><Printer size={15} /> Print receipt</button>
                <button className="primary" type="button" onClick={closeStkFlow}>Done</button>
              </>
            ) : stkPayment ? (
              <>
                <CheckCircle2 className="stk-flow-status-icon" size={52} />
                <div className="stk-flow-copy">
                  <span className="stk-flow-kicker">Payment received</span>
                  <h2>KES {formatAmount(stkPayment.amount)} paid</h2>
                  <p>Confirm this receipt now. There is no need to scroll.</p>
                </div>
                {error && <div className="stk-flow-inline-error">{error}</div>}
                <div className="stk-flow-receipt">
                  <div><span>Customer</span><strong>{stkPayment.customerName ?? "M-Pesa customer"}</strong></div>
                  <div><span>M-Pesa code</span><strong>{stkPayment.transactionCode}</strong></div>
                  <div><span>Reference</span><strong>{stkPayment.reference ?? "-"}</strong></div>
                  <div><span>Received</span><strong>{formatDate(stkPayment.paymentTime)}</strong></div>
                </div>
                <button className="primary" type="button" onClick={() => void verifySelected()} disabled={loading || stkPayment.verifiedStatus}>
                  {loading && <Loader2 className="spin" size={16} />}
                  {loading ? "Verifying payment" : stkPayment.verifiedStatus ? "Already verified" : "Verify this payment"}
                </button>
                {!loading && <button className="small-button" type="button" onClick={closeStkFlow}>{stkPayment.verifiedStatus ? "Close" : "Not now"}</button>}
              </>
            ) : (
              <>
                <XCircle className="stk-flow-status-icon" size={52} />
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
      {receiptPayment && <PaymentReceiptDialog payment={receiptPayment} token={auth.accessToken} onClose={() => setReceiptPayment(null)} />}
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

function PaymentRow({ payment, onReceipt }: { payment: PaymentSummary; onReceipt?: (payment: PaymentSummary) => void }) {
  return (
    <div className="list-row">
      <div>
        <strong>KES {formatAmount(payment.amount)}</strong>
        <span>{payment.customerName || payment.reference || payment.transactionCode}</span>
      </div>
      <div className="list-row-right">
        <span>{payment.verifiedStatus ? "Verified" : "Received"}</span>
        <small>{formatDate(payment.paymentTime)}</small>
        {payment.verifiedStatus && onReceipt && (
          <button className="receipt-row-button" type="button" onClick={() => onReceipt(payment)} title="Print receipt">
            <Printer size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

function DashboardView({ token }: { token: string }) {
  const [dashboard, setDashboard] = useState<BusinessDashboard | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function load(background = false) {
    if (!background) setLoading(true);
    try {
      setDashboard(await api.businessDashboard(token));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dashboard failed");
    } finally {
      if (!background) setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const refresh = () => {
      if (!document.hidden) void load(true);
    };
    const timer = window.setInterval(refresh, 7000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [token]);

  return (
    <section className="view-stack">
      <div className="view-heading">
        <div>
          <h2>Dashboard</h2>
          <p>Business activity overview</p>
        </div>
        <button type="button" className="small-button" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={13} />
        </button>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="kpi-grid">
        <KpiCard label="Today" value={`KES ${formatAmount(dashboard?.kpis.todayPaymentVolume ?? 0)}`} />
        <KpiCard label="This Month" value={`KES ${formatAmount(dashboard?.kpis.monthPaymentVolume ?? 0)}`} />
        <KpiCard label="Staff" value={String(dashboard?.kpis.staffUsers ?? 0)} />
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
  const [receiptPayment, setReceiptPayment] = useState<PaymentSummary | null>(null);

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
        {payments.length ? payments.map((payment) => <PaymentRow key={payment.id} payment={payment} onReceipt={setReceiptPayment} />) : <div className="empty-state">No payments found.</div>}
      </div>
      {receiptPayment && <PaymentReceiptDialog payment={receiptPayment} token={token} onClose={() => setReceiptPayment(null)} />}
    </section>
  );
}

function StaffView({ token }: { token: string }) {
  const [users, setUsers] = useState<DesktopUser[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
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
      setShowCreateForm(false);
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
      <div className="view-heading">
        <div><h2>Staff</h2><p>Manage business access</p></div>
        <button type="button" className="small-button" onClick={() => setShowCreateForm((value) => !value)}>
          {showCreateForm ? <XCircle size={14} /> : <UserPlus size={14} />}
          {showCreateForm ? "Close" : "Add staff"}
        </button>
      </div>
      {showCreateForm && <form className="staff-form" onSubmit={createStaff}>
        <input placeholder="Username" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} />
        <input placeholder="Full name" value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} />
        <div className="two-col">
          <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as "manager" | "waiter" })}>
            <option value="waiter">Waiter</option>
            <option value="manager">Business Admin</option>
          </select>
          <input placeholder="Password" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
        </div>
        <button className="primary" disabled={!form.username || !form.fullName || !form.password}>
          <UserPlus size={15} />
          Add staff
        </button>
        <button type="button" onClick={() => setShowCreateForm(false)}>Cancel</button>
      </form>}
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
        <section className="content">
          <UpdateBanner update={update} />
          <PlatformAdminView />
        </section>
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
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [authReady, setAuthReady] = useState(false);

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
        const [currentVersion, latest, nativeUpdate] = await Promise.all([
          getCurrentAppVersion(),
          api.latestDesktopUpdate(),
          checkNativeUpdate()
        ]);

        if (!cancelled && nativeUpdate) {
          setUpdate({
            currentVersion: nativeUpdate.currentVersion,
            latestVersion: nativeUpdate.version,
            notes: nativeUpdate.notes,
            manualDownloadUrl: latest.downloadUrl,
            native: nativeUpdate
          });
          return;
        }

        if (!cancelled && compareVersions(latest.latestVersion, currentVersion) > 0) {
          setUpdate({
            currentVersion,
            latestVersion: latest.latestVersion,
            notes: latest.releaseNotes,
            manualDownloadUrl: latest.downloadUrl
          });
        }
      } catch {
        // Update checks should never block payment verification.
      }
    }
    void checkForUpdate();
    const onFocus = () => void checkForUpdate();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    const timer = window.setInterval(checkForUpdate, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (auth && update) {
      setShowUpdateDialog(true);
    }
  }, [auth, update?.latestVersion]);

  useEffect(() => {
    if (!auth) {
      setAuthReady(true);
      return;
    }

    let cancelled = false;
    let timer: number | undefined;

    const clearStoredAuth = () => {
      localStorage.removeItem(authKey);
      setAuth(null);
      setAuthReady(true);
    };

    const refreshSession = async () => {
      try {
        const next = withAccessTokenExpiry(await api.refresh({ refreshToken: auth.refreshToken, deviceId: getDeviceId() }));
        if (cancelled) return;
        localStorage.setItem(authKey, JSON.stringify(next));
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

  function saveAuth(next: AuthResponse) {
    const stored = withAccessTokenExpiry(next);
    localStorage.setItem(authKey, JSON.stringify(stored));
    setAuth(stored);
    setAuthReady(true);
  }

  function logout() {
    localStorage.removeItem(authKey);
    setAuth(null);
  }

  return (
    <>
      {!authReady ? (
        <main className="session-restoring"><Loader2 className="spin" size={28} /><strong>Restoring session</strong><span>Connecting securely...</span></main>
      ) : auth ? <LoggedInApp auth={auth} onLogout={logout} update={update} /> : <Login onLogin={saveAuth} update={update} />}
      {auth && update && showUpdateDialog ? <UpdateDialog update={update} onDismiss={() => setShowUpdateDialog(false)} /> : null}
      <ResizeGrip />
    </>
  );
}
