import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles.css";

class MobileErrorBoundary extends React.Component<React.PropsWithChildren, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    console.error("M-Verify mobile render failed", error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="mobile-recovery-screen">
        <section>
          <strong>M-Verify could not open</strong>
          <p>Clear the saved session and reopen the app. Your payment records remain safe on the server.</p>
          <button type="button" onClick={() => {
            localStorage.removeItem("mverify_mobile_auth");
            window.location.reload();
          }}>Recover app</button>
        </section>
      </main>
    );
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MobileErrorBoundary><App /></MobileErrorBoundary>
  </React.StrictMode>
);
