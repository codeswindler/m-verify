import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Home,
  Loader2,
  Lock,
  LogOut,
  Minus,
  ReceiptText,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  UserPlus,
  Users,
  WalletCards,
  XCircle
} from "lucide-react";
import type { AuthResponse, PaymentSummary, VerificationResponse, VerificationStatus } from "@m-verify/shared";
import {
  api,
  API_BASE_URL,
  loadTransactionArchive,
  type BusinessDashboard,
  type MobileStaffUser
} from "./api";
import { MVerifyMark } from "./Brand";
import {
  amount,
  dateKey,
  dateLabel,
  dateTime,
  datesForPreset,
  inputDate,
  money,
  monthTitle,
  paymentName,
  type DatePreset
} from "./format";
import { clearSession, getDeviceId, loadSession, saveSession } from "./storage";

type ApiStatus = "idle" | "loading" | "ready" | "error";
type AppTab = "verify" | "home" | "insights" | "summary" | "staff" | "sales";
type StaffRole = "manager" | "waiter";
type DateMode = "payment" | "verified";

type DailyPoint = {
  key: string;
  total: number;
  count: number;
  verified: number;
};

type Analytics = {
  filteredPayments: PaymentSummary[];
  total: number;
  count: number;
  verified: number;
  unverified: number;
  average: number;
  verificationRate: number;
  todayTotal: number;
  monthTotal: number;
  daily: DailyPoint[];
  staffRows: Array<{ name: string; count: number; amount: number }>;
  channelRows: Array<{ name: string; count: number; amount: number }>;
};

type TrendSummary = {
  direction: "up" | "down" | "flat";
  percent: number;
  previousTotal: number;
};

const datePresetOptions: Array<{ value: DatePreset; label: string }> = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "all", label: "All" }
];

function defaultTab(auth: AuthResponse | null): AppTab {
  if (!auth) return "verify";
  return auth.user.role === "manager" ? "home" : "verify";
}

function addDays(key: string, days: number) {
  const date = new Date(`${key}T00:00:00`);
  date.setDate(date.getDate() + days);
  return inputDate(date);
}

function buildDayKeys(payments: PaymentSummary[], preset: DatePreset) {
  if (preset === "all") {
    const unique = [...new Set(payments.map((payment) => dateKey(payment.paymentTime)).filter(Boolean))].sort();
    return unique.slice(-14);
  }

  const range = datesForPreset(preset);
  const keys: string[] = [];
  let cursor = range.from;
  while (cursor <= range.to) {
    keys.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return keys;
}

function incrementMapRow(map: Map<string, { count: number; amount: number }>, key: string, payment: PaymentSummary) {
  const current = map.get(key) ?? { count: 0, amount: 0 };
  current.count += 1;
  current.amount += amount(payment);
  map.set(key, current);
}

function paymentDateKey(payment: PaymentSummary, mode: DateMode) {
  return dateKey(mode === "verified" ? payment.verifiedAt ?? payment.paymentTime : payment.paymentTime);
}

function paymentInPresetByMode(payment: PaymentSummary, preset: DatePreset, mode: DateMode) {
  if (preset === "all") return true;
  const key = paymentDateKey(payment, mode);
  if (!key) return false;
  const range = datesForPreset(preset);
  return key >= range.from && key <= range.to;
}

function currentMonthRange() {
  const today = new Date();
  return {
    from: inputDate(new Date(today.getFullYear(), today.getMonth(), 1)),
    to: inputDate(today)
  };
}

function buildAnalytics(payments: PaymentSummary[], preset: DatePreset, mode: DateMode = "payment"): Analytics {
  const filteredPayments = payments.filter((payment) => paymentInPresetByMode(payment, preset, mode));
  const dailyMap = new Map<string, DailyPoint>();
  const staffMap = new Map<string, { count: number; amount: number }>();
  const channelMap = new Map<string, { count: number; amount: number }>();
  let total = 0;
  let verified = 0;

  const dayKeyPayments = mode === "payment" ? payments : payments.map((payment) => ({ ...payment, paymentTime: payment.verifiedAt ?? payment.paymentTime }));
  for (const key of buildDayKeys(dayKeyPayments, preset)) {
    dailyMap.set(key, { key, total: 0, count: 0, verified: 0 });
  }

  for (const payment of filteredPayments) {
    const value = amount(payment);
    const key = paymentDateKey(payment, mode);
    total += value;
    if (payment.verifiedStatus) verified += 1;

    if (key) {
      const point = dailyMap.get(key) ?? { key, total: 0, count: 0, verified: 0 };
      point.total += value;
      point.count += 1;
      if (payment.verifiedStatus) point.verified += 1;
      dailyMap.set(key, point);
    }

    if (payment.verifiedBy?.fullName || payment.verifiedBy?.username) {
      incrementMapRow(staffMap, payment.verifiedBy.fullName || payment.verifiedBy.username, payment);
    }
    incrementMapRow(channelMap, payment.paymentChannel || "M-Pesa", payment);
  }

  const today = inputDate(new Date());
  const monthRange = currentMonthRange();
  const todayTotal = payments
    .filter((payment) => paymentDateKey(payment, mode) === today)
    .reduce((sum, payment) => sum + amount(payment), 0);
  const monthTotal = payments
    .filter((payment) => {
      const key = paymentDateKey(payment, mode);
      return key >= monthRange.from && key <= monthRange.to;
    })
    .reduce((sum, payment) => sum + amount(payment), 0);

  const toRows = (map: Map<string, { count: number; amount: number }>) =>
    [...map.entries()]
      .map(([name, value]) => ({ name, count: value.count, amount: value.amount }))
      .sort((left, right) => right.amount - left.amount || right.count - left.count);

  return {
    filteredPayments,
    total,
    count: filteredPayments.length,
    verified,
    unverified: filteredPayments.length - verified,
    average: filteredPayments.length ? total / filteredPayments.length : 0,
    verificationRate: filteredPayments.length ? Math.round((verified / filteredPayments.length) * 100) : 0,
    todayTotal,
    monthTotal,
    daily: [...dailyMap.values()].sort((left, right) => left.key.localeCompare(right.key)),
    staffRows: toRows(staffMap),
    channelRows: toRows(channelMap)
  };
}

function presetLabel(preset: DatePreset) {
  return datePresetOptions.find((option) => option.value === preset)?.label ?? "Selected period";
}

function totalForRange(payments: PaymentSummary[], from: string, to: string, mode: DateMode) {
  return payments
    .filter((payment) => {
      const key = paymentDateKey(payment, mode);
      return key >= from && key <= to;
    })
    .reduce((sum, payment) => sum + amount(payment), 0);
}

function buildTrendSummary(payments: PaymentSummary[], preset: DatePreset, currentTotal: number, mode: DateMode): TrendSummary {
  if (preset === "all") {
    return { direction: "flat", percent: 0, previousTotal: 0 };
  }

  const range = datesForPreset(preset);
  const fromDate = new Date(`${range.from}T00:00:00`);
  const toDate = new Date(`${range.to}T00:00:00`);
  const spanDays = Math.max(1, Math.round((toDate.getTime() - fromDate.getTime()) / 86_400_000) + 1);
  const previousTo = addDays(range.from, -1);
  const previousFrom = addDays(previousTo, -(spanDays - 1));
  const previousTotal = totalForRange(payments, previousFrom, previousTo, mode);
  const diff = currentTotal - previousTotal;
  const percent = previousTotal > 0 ? Math.round((Math.abs(diff) / previousTotal) * 100) : currentTotal > 0 ? 100 : 0;

  return {
    direction: diff > 0 ? "up" : diff < 0 ? "down" : "flat",
    percent,
    previousTotal
  };
}

function revenueTone(total: number, max: number) {
  const ratio = max > 0 ? total / max : 0;
  if (ratio >= 0.78) return "peak";
  if (ratio >= 0.36) return "good";
  return "critical";
}

function resultTone(result?: VerificationStatus) {
  return result ? result.toLowerCase().replace(/_/g, "-") : "";
}

function LoadingScreen() {
  return (
    <main className="loading-screen">
      <MVerifyMark size={48} />
      <Loader2 className="spin" size={24} />
      <span>Opening M-Verify</span>
    </main>
  );
}

function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-banner">
      <AlertTriangle size={17} />
      <span>{message}</span>
      {onRetry ? (
        <button type="button" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>;
}

function LoginScreen({ onLogin }: { onLogin: (auth: AuthResponse) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<ApiStatus>("idle");
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setStatus("loading");
    try {
      const auth = await api.login({
        username: username.trim(),
        password,
        deviceId: getDeviceId(),
        deviceName: "M-Verify Mobile"
      });
      await saveSession(auth);
      onLogin(auth);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Login failed");
    } finally {
      setStatus("idle");
    }
  }

  return (
    <main className="auth-screen">
      <section className="auth-card">
        <div className="auth-brand">
          <MVerifyMark />
          <p className="eyebrow">M-Pesa verification</p>
          <h1>M-Verify</h1>
          <p>Waiter and business admin access.</p>
        </div>

        <form className="auth-form" onSubmit={submit}>
          <label>
            <span>Username</span>
            <input
              autoComplete="username"
              placeholder="waiter or admin username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>
          <label>
            <span>Password</span>
            <input
              autoComplete="current-password"
              placeholder="your password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error ? (
            <div className="inline-error">
              <AlertTriangle size={16} />
              <span>{error}</span>
            </div>
          ) : null}
          <button className="primary-button" disabled={!username.trim() || !password || status === "loading"} type="submit">
            {status === "loading" ? <Loader2 className="spin" size={18} /> : <Lock size={18} />}
            {status === "loading" ? "Signing in" : "Sign in securely"}
          </button>
        </form>

        <p className="api-note">{API_BASE_URL}</p>
      </section>
    </main>
  );
}

function TopBar({
  auth,
  title,
  status,
  onRefresh,
  onLogout
}: {
  auth: AuthResponse;
  title: string;
  status?: ApiStatus;
  onRefresh?: () => void;
  onLogout: () => void;
}) {
  return (
    <header className="top-bar">
      <div className="top-title">
        <p className="eyebrow">{auth.user.tenantName || "M-Verify"}</p>
        <h1>{title}</h1>
      </div>
      <div className="top-actions">
        {onRefresh ? (
          <button aria-label="Refresh" className="icon-button" disabled={status === "loading"} onClick={onRefresh} type="button">
            <RefreshCw className={status === "loading" ? "spin" : ""} size={20} />
          </button>
        ) : null}
        <button aria-label="Log out" className="icon-button" onClick={onLogout} type="button">
          <LogOut size={20} />
        </button>
      </div>
    </header>
  );
}

function BottomNav({ tab, role, onChange }: { tab: AppTab; role: StaffRole; onChange: (tab: AppTab) => void }) {
  const managerItems: Array<{ tab: AppTab; label: string; icon: typeof Home }> = [
    { tab: "home", label: "Home", icon: Home },
    { tab: "verify", label: "Verify", icon: ShieldCheck },
    { tab: "insights", label: "Insights", icon: BarChart3 },
    { tab: "summary", label: "Summary", icon: CalendarDays },
    { tab: "staff", label: "Staff", icon: Users }
  ];
  const waiterItems: Array<{ tab: AppTab; label: string; icon: typeof Home }> = [
    { tab: "verify", label: "Verify", icon: ShieldCheck },
    { tab: "sales", label: "Sales", icon: ReceiptText }
  ];
  const items = role === "manager" ? managerItems : waiterItems;

  return (
    <nav className={`bottom-nav ${role}`}>
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button className={tab === item.tab ? "active" : ""} key={item.tab} onClick={() => onChange(item.tab)} type="button">
            <Icon size={21} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function PaymentCard({ payment, compact = false }: { payment: PaymentSummary; compact?: boolean }) {
  return (
    <article className={compact ? "payment-card compact" : "payment-card"}>
      <div className="payment-symbol">
        {payment.verifiedStatus ? <CheckCircle2 size={18} /> : <ReceiptText size={18} />}
      </div>
      <div className="payment-main">
        <div className="payment-title">
          <strong>{paymentName(payment)}</strong>
          <strong>{money(payment.amount)}</strong>
        </div>
        <div className="payment-meta">
          <span>{payment.transactionCode}</span>
          <span>{payment.reference || "No reference"}</span>
          <span>{dateTime(payment.paymentTime)}</span>
        </div>
      </div>
      <span className={payment.verifiedStatus ? "status-pill verified" : "status-pill pending"}>
        {payment.verifiedStatus ? "Verified" : "Open"}
      </span>
    </article>
  );
}

function PaymentList({ items, emptyText, compact = false }: { items: PaymentSummary[]; emptyText: string; compact?: boolean }) {
  if (!items.length) return <EmptyState text={emptyText} />;
  return (
    <div className="payment-list">
      {items.map((payment) => (
        <PaymentCard compact={compact} key={payment.id} payment={payment} />
      ))}
    </div>
  );
}

function VerifiedSaleCard({ payment }: { payment: PaymentSummary }) {
  return (
    <article className="payment-card compact">
      <div className="payment-symbol">
        <CheckCircle2 size={18} />
      </div>
      <div className="payment-main">
        <div className="payment-title">
          <strong>{paymentName(payment)}</strong>
          <strong>{money(payment.amount)}</strong>
        </div>
        <div className="payment-meta">
          <span>{payment.transactionCode}</span>
          <span>Verified {dateTime(payment.verifiedAt ?? payment.paymentTime)}</span>
        </div>
      </div>
      <span className="status-pill verified">Sold</span>
    </article>
  );
}

function VerifiedSalesList({ items, emptyText }: { items: PaymentSummary[]; emptyText: string }) {
  if (!items.length) return <EmptyState text={emptyText} />;
  return (
    <div className="payment-list">
      {items.map((payment) => (
        <VerifiedSaleCard key={payment.id} payment={payment} />
      ))}
    </div>
  );
}

function VerifyScreen({
  token,
  onVerified
}: {
  token: string;
  onVerified?: (payment: PaymentSummary) => void;
}) {
  const [query, setQuery] = useState("");
  const [payments, setPayments] = useState<PaymentSummary[]>([]);
  const [selectedPayment, setSelectedPayment] = useState<PaymentSummary | null>(null);
  const [result, setResult] = useState<VerificationResponse | null>(null);
  const [error, setError] = useState("");
  const [searching, setSearching] = useState(false);
  const [verifying, setVerifying] = useState(false);

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
        const response = await api.searchVerificationPayments(token, new URLSearchParams({ q: trimmed, limit: "20" }));
        if (!cancelled) {
          setPayments(response.data);
          setError("");
        }
      } catch (searchError) {
        if (!cancelled) {
          setPayments([]);
          setError(searchError instanceof Error ? searchError.message : "Payment search failed");
        }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 240);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, token]);

  async function verifySelected() {
    if (!selectedPayment) return;
    setVerifying(true);
    setError("");
    setResult(null);
    try {
      const response = await api.verifyPayment(token, { paymentId: selectedPayment.id });
      setResult(response);
      if (response.payment) {
        setSelectedPayment(response.payment);
        setPayments((current) => current.map((payment) => (payment.id === response.payment!.id ? response.payment! : payment)));
        onVerified?.(response.payment);
      }
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : "Verification failed");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <section className="screen-stack verify-screen">
      <div className="verify-hero">
        <div>
          <p className="eyebrow">Payment check</p>
          <h2>Find the receipt, confirm once.</h2>
        </div>
        <ShieldCheck size={34} />
      </div>

      <label className="search-field">
        <span>Search received payments</span>
        <div>
          <Search size={18} />
          <input
            placeholder="M-Pesa code, amount, customer, or reference"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </label>

      <div className="search-results">
        {!query.trim() ? <EmptyState text="Start typing to find a received M-Pesa payment." /> : null}
        {query.trim() && searching ? <EmptyState text="Searching payments..." /> : null}
        {query.trim() && !searching && !payments.length ? <EmptyState text="No received payments found." /> : null}
        {payments.map((payment) => (
          <button
            className={selectedPayment?.id === payment.id ? "payment-option selected" : "payment-option"}
            key={payment.id}
            onClick={() => {
              setSelectedPayment(payment);
              setResult(null);
            }}
            type="button"
          >
            <span className="option-main">
              <strong>{paymentName(payment)}</strong>
              <small>{payment.transactionCode} - {payment.reference || "No reference"}</small>
            </span>
            <span className="option-side">
              <strong>{money(payment.amount)}</strong>
              <small>{payment.verifiedStatus ? "Verified" : dateTime(payment.paymentTime)}</small>
            </span>
          </button>
        ))}
      </div>

      {selectedPayment ? (
        <section className="selected-payment">
          <div className="section-heading compact">
            <div>
              <p className="eyebrow">Selected receipt</p>
              <h2>{paymentName(selectedPayment)}</h2>
            </div>
            <span className={selectedPayment.verifiedStatus ? "status-pill verified" : "status-pill pending"}>
              {selectedPayment.verifiedStatus ? "Verified" : "Ready"}
            </span>
          </div>
          <dl className="detail-grid">
            <div>
              <dt>Amount</dt>
              <dd>{money(selectedPayment.amount)}</dd>
            </div>
            <div>
              <dt>Code</dt>
              <dd>{selectedPayment.transactionCode}</dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>{selectedPayment.phoneNumber}</dd>
            </div>
            <div>
              <dt>Received</dt>
              <dd>{dateTime(selectedPayment.paymentTime)}</dd>
            </div>
          </dl>
        </section>
      ) : null}

      <button
        className="primary-button verify-button"
        disabled={!selectedPayment || selectedPayment.verifiedStatus || verifying}
        onClick={() => void verifySelected()}
        type="button"
      >
        {verifying ? <Loader2 className="spin" size={19} /> : <ShieldCheck size={19} />}
        {verifying ? "Verifying" : selectedPayment?.verifiedStatus ? "Already verified" : "Verify selected payment"}
      </button>

      {error ? (
        <div className="inline-error">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      ) : null}

      {result ? (
        <section className={`result-card result-${resultTone(result.result)}`}>
          {result.result === "VERIFIED" || result.result === "ALREADY_VERIFIED" ? <CheckCircle2 size={22} /> : <XCircle size={22} />}
          <div>
            <strong>{result.result.replace(/_/g, " ")}</strong>
            <span>{result.message}</span>
          </div>
        </section>
      ) : null}
    </section>
  );
}

function HomeScreen({
  dashboard,
  analytics,
  status,
  error,
  onRefresh,
  onTabChange
}: {
  dashboard: BusinessDashboard | null;
  analytics: Analytics;
  status: ApiStatus;
  error: string;
  onRefresh: () => void;
  onTabChange: (tab: AppTab) => void;
}) {
  const recentPayments = dashboard?.recentPayments.length ? dashboard.recentPayments : analytics.filteredPayments.slice(0, 5);
  const todayCollections = Number(dashboard?.kpis.todayPaymentVolume ?? analytics.todayTotal);
  const monthCollections = Number(dashboard?.kpis.monthPaymentVolume ?? analytics.monthTotal);

  return (
    <section className="screen-stack">
      {error ? <ErrorBanner message={error} onRetry={onRefresh} /> : null}
      <section className="hero-card">
        <div className="hero-heading">
          <p className="eyebrow">Business volume</p>
          <span className="count-badge">{dashboard?.kpis.paidTransactions ?? analytics.count} payments</span>
        </div>
        <h2>{money(dashboard?.kpis.totalPaymentVolume ?? analytics.total)}</h2>
        <p>{status === "loading" ? "Refreshing latest business activity" : `${money(todayCollections)} collected today`}</p>
      </section>

      <div className="collection-grid">
        <article className="collection-card">
          <span className="collection-icon">
            <CalendarDays size={20} />
          </span>
          <div>
            <span>Today collections</span>
            <strong>{money(todayCollections)}</strong>
            <small>{inputDate(new Date())}</small>
          </div>
        </article>
        <article className="collection-card peak">
          <span className="collection-icon">
            <WalletCards size={20} />
          </span>
          <div>
            <span>This month</span>
            <strong>{money(monthCollections)}</strong>
            <small>{monthTitle(new Date())}</small>
          </div>
        </article>
      </div>

      <div className="quick-actions">
        <button type="button" onClick={() => onTabChange("verify")}>
          <ShieldCheck size={19} />
          <span>Verify now</span>
        </button>
        <button type="button" onClick={() => onTabChange("summary")}>
          <CalendarDays size={19} />
          <span>Open summary</span>
        </button>
        <button type="button" onClick={() => onTabChange("insights")}>
          <BarChart3 size={19} />
          <span>View insights</span>
        </button>
      </div>

      <section className="section-card">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">Latest activity</p>
            <h2>Recent payments</h2>
          </div>
          <ReceiptText size={20} />
        </div>
        <PaymentList compact emptyText="No payments received yet." items={recentPayments} />
      </section>
    </section>
  );
}

function BarTrend({ points }: { points: DailyPoint[] }) {
  const max = Math.max(1, ...points.map((point) => point.total));

  if (!points.length) {
    return <EmptyState text="No chart data for this period." />;
  }

  return (
    <div className="bar-trend">
      {points.map((point) => {
        const height = Math.max(8, Math.round((point.total / max) * 126));
        const tone = revenueTone(point.total, max);
        return (
          <div className="bar-column" key={point.key}>
            <span>{money(point.total, true)}</span>
            <div className="bar-track">
              <div className={`bar-fill ${tone}`} style={{ height }} />
            </div>
            <small>{new Date(`${point.key}T00:00:00`).toLocaleDateString("en-KE", { weekday: "short" })}</small>
          </div>
        );
      })}
    </div>
  );
}

function InsightsScreen({ payments }: { payments: PaymentSummary[] }) {
  const [preset, setPreset] = useState<DatePreset>("30d");
  const analytics = useMemo(() => buildAnalytics(payments, preset), [payments, preset]);
  const trend = useMemo(() => buildTrendSummary(payments, preset, analytics.total, "payment"), [analytics.total, payments, preset]);
  const TrendIcon = trend.direction === "up" ? ArrowUpRight : trend.direction === "down" ? ArrowDownRight : Minus;

  return (
    <section className="screen-stack">
      <section className="section-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Analytics</p>
            <h2>Payment performance</h2>
          </div>
          <SlidersHorizontal size={20} />
        </div>
        <div className="segmented">
          {datePresetOptions.map((option) => (
            <button className={preset === option.value ? "active" : ""} key={option.value} onClick={() => setPreset(option.value)} type="button">
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section className="insight-total-card">
        <div>
          <p className="eyebrow">{presetLabel(preset)} received</p>
          <strong>{money(analytics.total)}</strong>
          <span>{analytics.count} payments in this filter</span>
        </div>
        <span className={`trend-pill ${trend.direction}`}>
          <TrendIcon size={18} />
          {trend.direction === "flat" ? "0%" : `${trend.percent}%`}
        </span>
      </section>

      <section className="section-card">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">Revenue trend</p>
            <h2>Daily received</h2>
            <p>Compared with {money(trend.previousTotal, true)} in the previous period</p>
          </div>
          <BarChart3 size={20} />
        </div>
        <BarTrend points={analytics.daily} />
      </section>

      <section className="section-card">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">Team</p>
            <h2>Verification activity</h2>
          </div>
          <Users size={20} />
        </div>
        {analytics.staffRows.length ? (
          <div className="metric-list">
            {analytics.staffRows.slice(0, 5).map((row) => (
              <article key={row.name}>
                <span>{row.name}</span>
                <strong>{row.count} checks</strong>
                <small>{money(row.amount, true)}</small>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState text="No verified payments in this period." />
        )}
      </section>

      <section className="section-card">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">Channels</p>
            <h2>Payment mix</h2>
          </div>
          <ReceiptText size={20} />
        </div>
        {analytics.channelRows.length ? (
          <div className="metric-list">
            {analytics.channelRows.map((row) => (
              <article key={row.name}>
                <span>{row.name}</span>
                <strong>{money(row.amount, true)}</strong>
                <small>{row.count} payments</small>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState text="No channel data yet." />
        )}
      </section>
    </section>
  );
}

function SummaryScreen({ payments }: { payments: PaymentSummary[] }) {
  const [anchor, setAnchor] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => inputDate(new Date()));
  const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const calendarStart = new Date(monthStart);
  calendarStart.setDate(calendarStart.getDate() - ((calendarStart.getDay() + 6) % 7));

  const totalsByDate = useMemo(() => {
    const map = new Map<string, DailyPoint>();
    for (const payment of payments) {
      const key = dateKey(payment.paymentTime);
      if (!key) continue;
      const current = map.get(key) ?? { key, total: 0, count: 0, verified: 0 };
      current.total += amount(payment);
      current.count += 1;
      if (payment.verifiedStatus) current.verified += 1;
      map.set(key, current);
    }
    return map;
  }, [payments]);

  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(calendarStart);
    date.setDate(date.getDate() + index);
    const key = inputDate(date);
    return {
      key,
      day: date.getDate(),
      currentMonth: date.getMonth() === anchor.getMonth(),
      total: totalsByDate.get(key)
    };
  });

  const maxTotal = Math.max(1, ...days.map((day) => day.total?.total ?? 0));
  const selectedPayments = payments.filter((payment) => dateKey(payment.paymentTime) === selectedDate);
  const selectedPoint = totalsByDate.get(selectedDate);

  function moveMonth(offset: number) {
    setAnchor((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  }

  return (
    <section className="screen-stack">
      <section className="section-card">
        <div className="calendar-head">
          <button aria-label="Previous month" className="icon-button" onClick={() => moveMonth(-1)} type="button">
            <ChevronLeft size={20} />
          </button>
          <div>
            <p className="eyebrow">Sales summary</p>
            <h2>{monthTitle(anchor)}</h2>
          </div>
          <button aria-label="Next month" className="icon-button" onClick={() => moveMonth(1)} type="button">
            <ChevronRight size={20} />
          </button>
        </div>

        <div className="calendar-weekdays">
          {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        <div className="calendar-grid">
          {days.map((day) => {
            const heat = Math.min(1, (day.total?.total ?? 0) / maxTotal);
            return (
              <button
                className={[
                  "calendar-day",
                  day.currentMonth ? "" : "outside",
                  day.total ? "has-payments" : "",
                  selectedDate === day.key ? "selected" : ""
                ].filter(Boolean).join(" ")}
                key={day.key}
                onClick={() => setSelectedDate(day.key)}
                style={{ "--heat": heat.toFixed(2) } as CSSProperties}
                type="button"
              >
                <strong>{day.day}</strong>
                {day.total ? (
                  <>
                    <span>{money(day.total.total, true)}</span>
                    <small>{day.total.count} tx</small>
                  </>
                ) : null}
              </button>
            );
          })}
        </div>
      </section>

      <section className="section-card">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">{dateLabel(selectedDate)}</p>
            <h2>{selectedPoint ? money(selectedPoint.total) : "No payments"}</h2>
          </div>
          <span className="count-badge">{selectedPoint?.count ?? 0} payments</span>
        </div>
        <PaymentList compact emptyText="No payments on this date." items={selectedPayments} />
      </section>
    </section>
  );
}

function StaffSalesScreen({
  payments,
  status,
  error,
  onRefresh
}: {
  payments: PaymentSummary[];
  status: ApiStatus;
  error: string;
  onRefresh: () => void;
}) {
  const [preset, setPreset] = useState<DatePreset>("today");
  const analytics = useMemo(() => buildAnalytics(payments, preset, "verified"), [payments, preset]);
  const trend = useMemo(() => buildTrendSummary(payments, preset, analytics.total, "verified"), [analytics.total, payments, preset]);
  const TrendIcon = trend.direction === "up" ? ArrowUpRight : trend.direction === "down" ? ArrowDownRight : Minus;

  return (
    <section className="screen-stack">
      {error ? <ErrorBanner message={error} onRetry={onRefresh} /> : null}

      <section className="section-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">My sales</p>
            <h2>Verified reconciliation</h2>
          </div>
          {status === "loading" ? <Loader2 className="spin" size={20} /> : <ReceiptText size={20} />}
        </div>
        <div className="segmented">
          {datePresetOptions.map((option) => (
            <button className={preset === option.value ? "active" : ""} key={option.value} onClick={() => setPreset(option.value)} type="button">
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section className="insight-total-card">
        <div>
          <p className="eyebrow">{presetLabel(preset)} verified sales</p>
          <strong>{money(analytics.total)}</strong>
          <span>{analytics.count} receipts reconciled</span>
        </div>
        <span className={`trend-pill ${trend.direction}`}>
          <TrendIcon size={18} />
          {trend.direction === "flat" ? "0%" : `${trend.percent}%`}
        </span>
      </section>

      <div className="collection-grid">
        <article className="collection-card">
          <span className="collection-icon">
            <CalendarDays size={20} />
          </span>
          <div>
            <span>Today sold</span>
            <strong>{money(analytics.todayTotal)}</strong>
            <small>{inputDate(new Date())}</small>
          </div>
        </article>
        <article className="collection-card peak">
          <span className="collection-icon">
            <WalletCards size={20} />
          </span>
          <div>
            <span>This month</span>
            <strong>{money(analytics.monthTotal)}</strong>
            <small>{monthTitle(new Date())}</small>
          </div>
        </article>
      </div>

      <section className="section-card">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">Receipts</p>
            <h2>Verified by me</h2>
          </div>
          <span className="count-badge">{analytics.count} sales</span>
        </div>
        <VerifiedSalesList emptyText="No verified sales in this filter." items={analytics.filteredPayments} />
      </section>
    </section>
  );
}

function StaffScreen({
  token,
  currentUserId,
  users,
  status,
  error,
  onRefresh
}: {
  token: string;
  currentUserId: number;
  users: MobileStaffUser[];
  status: ApiStatus;
  error: string;
  onRefresh: () => Promise<void> | void;
}) {
  const [form, setForm] = useState({ username: "", fullName: "", password: "", role: "waiter" as StaffRole });
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);

  async function createStaff(event: FormEvent) {
    event.preventDefault();
    setActionMessage("");
    setActionError("");
    setSaving(true);
    try {
      await api.createUser(token, form);
      setForm({ username: "", fullName: "", password: "", role: "waiter" });
      setActionMessage("Staff user created.");
      await onRefresh();
    } catch (createError) {
      setActionError(createError instanceof Error ? createError.message : "Could not create staff user");
    } finally {
      setSaving(false);
    }
  }

  async function toggleUser(user: MobileStaffUser) {
    setActionMessage("");
    setActionError("");
    if (user.id === currentUserId) {
      setActionError("You cannot disable your own account from staff access.");
      return;
    }
    try {
      await api.updateUser(token, user.id, { disabled: !user.disabled });
      setActionMessage(`${user.username} updated.`);
      await onRefresh();
    } catch (toggleError) {
      setActionError(toggleError instanceof Error ? toggleError.message : "Could not update user");
    }
  }

  async function resetPassword(user: MobileStaffUser) {
    const password = window.prompt(`New password for ${user.username}`);
    if (!password) return;
    setActionMessage("");
    setActionError("");
    try {
      await api.updateUser(token, user.id, { password });
      setActionMessage(`${user.username} password updated.`);
    } catch (resetError) {
      setActionError(resetError instanceof Error ? resetError.message : "Could not reset password");
    }
  }

  const staffUsers = users.filter((user) => user.role !== "admin");

  return (
    <section className="screen-stack">
      <section className="section-card">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">Access</p>
            <h2>Add staff</h2>
          </div>
          <UserPlus size={20} />
        </div>
        <form className="staff-form" onSubmit={createStaff}>
          <input placeholder="Username" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} />
          <input placeholder="Full name" value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} />
          <div className="form-grid">
            <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as StaffRole })}>
              <option value="waiter">Waiter</option>
              <option value="manager">Business admin</option>
            </select>
            <input placeholder="Temporary password" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
          </div>
          <button className="primary-button" disabled={saving || !form.username || !form.fullName || !form.password} type="submit">
            {saving ? <Loader2 className="spin" size={18} /> : <UserPlus size={18} />}
            {saving ? "Creating" : "Create staff"}
          </button>
        </form>
      </section>

      {actionMessage ? <div className="success-note">{actionMessage}</div> : null}
      {actionError ? (
        <div className="inline-error">
          <AlertTriangle size={16} />
          <span>{actionError}</span>
        </div>
      ) : null}
      {error ? <ErrorBanner message={error} onRetry={() => void onRefresh()} /> : null}

      <section className="section-card">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">Team</p>
            <h2>Staff users</h2>
          </div>
          {status === "loading" ? <Loader2 className="spin" size={20} /> : <Users size={20} />}
        </div>
        {staffUsers.length ? (
          <div className="staff-list">
            {staffUsers.map((user) => (
              <article key={user.id}>
                <div>
                  <strong>{user.fullName}</strong>
                  <span>{user.role === "manager" ? "Business admin" : "Waiter"} - {user.disabled ? "disabled" : "active"}</span>
                </div>
                <div className="row-actions">
                  <button type="button" onClick={() => void resetPassword(user)}>
                    Password
                  </button>
                  <button type="button" onClick={() => void toggleUser(user)}>
                    {user.disabled ? "Enable" : "Disable"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState text="No staff users yet." />
        )}
      </section>
    </section>
  );
}

function AdminNotice({ auth, onLogout }: { auth: AuthResponse; onLogout: () => void }) {
  return (
    <main className="app-shell single-screen">
      <TopBar auth={auth} title="Platform admin" onLogout={onLogout} />
      <section className="screen-stack">
        <section className="section-card admin-notice">
          <MVerifyMark size={54} />
          <h2>Use the web admin portal</h2>
          <p>Platform admins manage businesses, commissions, M-Pesa credentials, and system users from the full admin dashboard.</p>
        </section>
      </section>
    </main>
  );
}

export function App() {
  const [booting, setBooting] = useState(true);
  const [auth, setAuth] = useState<AuthResponse | null>(null);
  const [tab, setTab] = useState<AppTab>("verify");
  const [dashboard, setDashboard] = useState<BusinessDashboard | null>(null);
  const [payments, setPayments] = useState<PaymentSummary[]>([]);
  const [dataStatus, setDataStatus] = useState<ApiStatus>("idle");
  const [dataError, setDataError] = useState("");
  const [users, setUsers] = useState<MobileStaffUser[]>([]);
  const [usersStatus, setUsersStatus] = useState<ApiStatus>("idle");
  const [usersError, setUsersError] = useState("");
  const [salesPayments, setSalesPayments] = useState<PaymentSummary[]>([]);
  const [salesStatus, setSalesStatus] = useState<ApiStatus>("idle");
  const [salesError, setSalesError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      const session = await loadSession();
      if (cancelled) return;
      setAuth(session);
      setTab(defaultTab(session));
      setBooting(false);
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshManagerData = useCallback(async () => {
    if (!auth || auth.user.role !== "manager") return;
    setDataStatus("loading");
    setDataError("");
    try {
      const [nextDashboard, nextPayments] = await Promise.all([
        api.businessDashboard(auth.accessToken),
        loadTransactionArchive(auth.accessToken)
      ]);
      setDashboard(nextDashboard);
      setPayments(nextPayments);
      setDataStatus("ready");
    } catch (error) {
      setDataError(error instanceof Error ? error.message : "Could not load business data");
      setDataStatus("error");
    }
  }, [auth]);

  const refreshUsers = useCallback(async () => {
    if (!auth || auth.user.role !== "manager") return;
    setUsersStatus("loading");
    setUsersError("");
    try {
      const response = await api.listUsers(auth.accessToken);
      setUsers(response.data);
      setUsersStatus("ready");
    } catch (error) {
      setUsersError(error instanceof Error ? error.message : "Could not load staff");
      setUsersStatus("error");
    }
  }, [auth]);

  const refreshWaiterSales = useCallback(async () => {
    if (!auth || auth.user.role !== "waiter") return;
    setSalesStatus("loading");
    setSalesError("");
    try {
      const nextPayments = await loadTransactionArchive(auth.accessToken);
      setSalesPayments(nextPayments);
      setSalesStatus("ready");
    } catch (error) {
      setSalesError(error instanceof Error ? error.message : "Could not load verified sales");
      setSalesStatus("error");
    }
  }, [auth]);

  useEffect(() => {
    if (auth?.user.role === "manager") {
      void refreshManagerData();
    }
  }, [auth?.accessToken, auth?.user.role, refreshManagerData]);

  useEffect(() => {
    if (auth?.user.role === "manager" && tab === "staff" && usersStatus === "idle") {
      void refreshUsers();
    }
  }, [auth?.user.role, refreshUsers, tab, usersStatus]);

  useEffect(() => {
    if (auth?.user.role === "waiter" && tab === "sales" && salesStatus === "idle") {
      void refreshWaiterSales();
    }
  }, [auth?.user.role, refreshWaiterSales, salesStatus, tab]);

  function handleLogin(nextAuth: AuthResponse) {
    setAuth(nextAuth);
    setTab(defaultTab(nextAuth));
  }

  async function logout() {
    const current = auth;
    setAuth(null);
    setDashboard(null);
    setPayments([]);
    setUsers([]);
    setSalesPayments([]);
    setTab("verify");
    await clearSession();
    if (current) {
      void api.logout(current.accessToken, current.refreshToken);
    }
  }

  function updateVerifiedPayment(payment: PaymentSummary) {
    setPayments((current) => {
      const exists = current.some((item) => item.id === payment.id);
      if (!exists) return [payment, ...current];
      return current.map((item) => (item.id === payment.id ? payment : item));
    });
    setDashboard((current) => {
      if (!current) return current;
      return {
        ...current,
        recentPayments: current.recentPayments.map((item) => (item.id === payment.id ? payment : item)),
        kpis: current.kpis
      };
    });
  }

  function updateWaiterSale(payment: PaymentSummary) {
    setSalesPayments((current) => {
      const exists = current.some((item) => item.id === payment.id);
      if (!exists) return [payment, ...current];
      return current.map((item) => (item.id === payment.id ? payment : item));
    });
  }

  if (booting) return <LoadingScreen />;
  if (!auth) return <LoginScreen onLogin={handleLogin} />;
  if (auth.user.role === "admin") return <AdminNotice auth={auth} onLogout={() => void logout()} />;

  const isManager = auth.user.role === "manager";
  const isWaiter = auth.user.role === "waiter";
  const analytics = buildAnalytics(payments, "30d");
  const title =
    tab === "home" ? "Business home" :
    tab === "insights" ? "Insights" :
    tab === "summary" ? "Summary" :
    tab === "staff" ? "Staff access" :
    tab === "sales" ? "My sales" :
    "Verify payment";

  return (
    <>
      <main className="app-shell">
        <TopBar
          auth={auth}
          title={title}
          status={isManager ? dataStatus : isWaiter ? salesStatus : undefined}
          onRefresh={isManager ? () => void refreshManagerData() : isWaiter ? () => void refreshWaiterSales() : undefined}
          onLogout={() => void logout()}
        />

        {isManager && tab === "home" ? (
          <HomeScreen
            analytics={analytics}
            dashboard={dashboard}
            error={dataError}
            onRefresh={() => void refreshManagerData()}
            onTabChange={setTab}
            status={dataStatus}
          />
        ) : null}

        {tab === "verify" ? (
          <VerifyScreen token={auth.accessToken} onVerified={isManager ? updateVerifiedPayment : isWaiter ? updateWaiterSale : undefined} />
        ) : null}
        {isManager && tab === "insights" ? <InsightsScreen payments={payments} /> : null}
        {isManager && tab === "summary" ? <SummaryScreen payments={payments} /> : null}
        {isManager && tab === "staff" ? (
          <StaffScreen
            currentUserId={auth.user.id}
            error={usersError}
            onRefresh={refreshUsers}
            status={usersStatus}
            token={auth.accessToken}
            users={users}
          />
        ) : null}
        {isWaiter && tab === "sales" ? (
          <StaffSalesScreen
            error={salesError}
            onRefresh={() => void refreshWaiterSales()}
            payments={salesPayments}
            status={salesStatus}
          />
        ) : null}
      </main>

      {isManager || isWaiter ? <BottomNav onChange={setTab} role={auth.user.role as StaffRole} tab={tab} /> : null}
    </>
  );
}
