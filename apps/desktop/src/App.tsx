import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Eye, EyeOff, Loader2, LogOut, Minus, Pin, PinOff, ShieldCheck } from "lucide-react";
import type { AuthResponse, VerificationResponse, VerificationStatus } from "@m-verify/shared";
import { api, API_BASE_URL } from "./api";
import { enableAutostartOnce, hideWindow, restoreWindowState, saveCurrentWindowState, setAlwaysOnTop } from "./tauri";

const authKey = "mverify_desktop_auth";
const deviceKey = "mverify_desktop_device_id";

type VerifyForm = {
  phoneNumber: string;
  transactionCode: string;
  amount: string;
  reference: string;
};

const initialForm: VerifyForm = {
  phoneNumber: "",
  transactionCode: "",
  amount: "",
  reference: ""
};

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

function Login({ onLogin }: { onLogin: (auth: AuthResponse) => void }) {
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
      <div className="titlebar" data-tauri-drag-region>
        <div className="title-brand" data-tauri-drag-region>
          <ShieldCheck size={20} />
          <span data-tauri-drag-region>M-Verify</span>
        </div>
        <button type="button" className="icon-button" onClick={() => void hideWindow()} title="Minimize to tray">
          <Minus size={16} />
        </button>
      </div>

      <section className="content">
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

function Verifier({ auth, onLogout }: { auth: AuthResponse; onLogout: () => void }) {
  const [form, setForm] = useState<VerifyForm>(initialForm);
  const [result, setResult] = useState<VerificationResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [alwaysTop, setAlwaysTop] = useState(true);

  const canSubmit = useMemo(
    () => {
      const hasIdentifier = Boolean(form.phoneNumber.trim() || form.transactionCode.trim() || form.reference.trim());
      const amountIsValid = !form.amount.trim() || Number(form.amount) > 0;
      return hasIdentifier && amountIsValid;
    },
    [form]
  );

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const amount = form.amount.trim();
      const response = await api.verifyPayment(auth.accessToken, {
        phoneNumber: form.phoneNumber || undefined,
        transactionCode: form.transactionCode || undefined,
        amount: amount ? Number(amount) : undefined,
        reference: form.reference || undefined
      });
      setResult(response);
      if (response.result === "VERIFIED") {
        setForm(initialForm);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  }

  async function toggleAlwaysTop() {
    const next = !alwaysTop;
    setAlwaysTop(next);
    await setAlwaysOnTop(next);
  }

  async function logout() {
    await api.logout(auth.accessToken, auth.refreshToken);
    onLogout();
  }

  return (
    <form className="screen" onSubmit={verify}>
      <div className="titlebar" data-tauri-drag-region>
        <div className="title-brand" data-tauri-drag-region>
          <ShieldCheck size={19} />
          <span data-tauri-drag-region>M-Verify</span>
        </div>
        <div className="window-actions">
          <button type="button" className="icon-button" onClick={() => void toggleAlwaysTop()} title="Toggle always on top">
            {alwaysTop ? <Pin size={15} /> : <PinOff size={15} />}
          </button>
          <button type="button" className="icon-button" onClick={() => void hideWindow()} title="Minimize to tray">
            <Minus size={16} />
          </button>
          <button type="button" className="icon-button" onClick={() => void logout()} title="Sign out">
            <LogOut size={15} />
          </button>
        </div>
      </div>

      <section className="content verifier-content">
        <div className="operator-row">
          <div>
            <strong>{auth.user.fullName}</strong>
            <span>{auth.user.role}</span>
          </div>
          <CheckCircle2 size={18} />
        </div>

        <label>
          Phone number
          <input
            placeholder="Optional for paybill"
            value={form.phoneNumber}
            onChange={(event) => setForm({ ...form, phoneNumber: event.target.value })}
            inputMode="tel"
          />
        </label>
        <label>
          M-Pesa code
          <input
            placeholder="RBA123ABC1"
            value={form.transactionCode}
            onChange={(event) => setForm({ ...form, transactionCode: event.target.value.toUpperCase() })}
            className="mono"
          />
        </label>
        <div className="two-col">
          <label>
            Expected amount
            <input
              placeholder="Optional"
              value={form.amount}
              onChange={(event) => setForm({ ...form, amount: event.target.value })}
              inputMode="decimal"
            />
          </label>
          <label>
            Reference
            <input
              placeholder="Bill ref"
              value={form.reference}
              onChange={(event) => setForm({ ...form, reference: event.target.value })}
            />
          </label>
        </div>

        <button className="primary verify-button" disabled={loading || !canSubmit}>
          {loading && <Loader2 className="spin" size={16} />}
          {loading ? "Checking" : "Verify payment"}
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
    </form>
  );
}

export function App() {
  const [auth, setAuth] = useState<AuthResponse | null>(() => {
    const raw = localStorage.getItem(authKey);
    return raw ? (JSON.parse(raw) as AuthResponse) : null;
  });

  useEffect(() => {
    void enableAutostartOnce();
    void restoreWindowState();
    window.addEventListener("beforeunload", () => {
      void saveCurrentWindowState();
    });
  }, []);

  function saveAuth(next: AuthResponse) {
    localStorage.setItem(authKey, JSON.stringify(next));
    setAuth(next);
  }

  function logout() {
    localStorage.removeItem(authKey);
    setAuth(null);
  }

  return auth ? <Verifier auth={auth} onLogout={logout} /> : <Login onLogin={saveAuth} />;
}
