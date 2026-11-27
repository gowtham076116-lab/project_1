import { useState, type FormEvent } from "react";
import { useAdminAuth, AUTHORIZED_ADMIN_PRIMARY_EMAIL } from "../contexts/AdminAuthContext";
import { useTheme } from "../contexts/ThemeContext";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Hexagon,
  Lock,
  Mail,
  MailCheck,
  Moon,
  RefreshCw,
  Send,
  ShieldCheck,
  Sun,
  UserCheck,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

type AuthMode = "login" | "register";

export default function AdminLogin() {
  const {
    login,
    register,
    resendVerification,
    checkVerification,
    logout,
    needsEmailVerification,
    unverifiedEmail,
  } = useAdminAuth();
  const { theme, toggleTheme } = useTheme();

  const [mode, setMode] = useState<AuthMode>("login");

  // Form states
  const [name, setName] = useState("");
  const [email, setEmail] = useState(AUTHORIZED_ADMIN_PRIMARY_EMAIL);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [checkingVerification, setCheckingVerification] = useState(false);
  const [resendingVerification, setResendingVerification] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Handle Login Submit
  const handleLoginSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await login(email, password);
    setLoading(false);

    if (!res.success) {
      setError(res.error || "Authentication failed. Check credentials.");
      toast.error(res.error || "Authentication failed.");
    } else {
      toast.success("Welcome back. Administrator session verified.");
    }
  };

  // Handle Registration Submit
  const handleRegisterSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !password) {
      setError("Email and password are required.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters in length.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match. Please re-enter.");
      return;
    }

    setLoading(true);
    const res = await register(email, password, name);
    setLoading(false);

    if (!res.success) {
      setError(res.error || "Registration failed.");
      toast.error(res.error || "Registration failed.");
    } else {
      toast.success("Admin account created! Verification email dispatched.");
    }
  };

  // Check email verification status
  const handleCheckVerification = async () => {
    setCheckingVerification(true);
    const verified = await checkVerification();
    setCheckingVerification(false);

    if (verified) {
      toast.success("Email verified! Welcome to Hive City Control Centre.");
    } else {
      toast.info("Email not verified yet. Please click the link in your inbox and try again.");
    }
  };

  // Resend verification email
  const handleResendEmail = async () => {
    setResendingVerification(true);
    const res = await resendVerification();
    setResendingVerification(false);

    if (res.success) {
      toast.success(res.message || "Verification email resent successfully.");
    } else {
      toast.error(res.error || "Failed to resend verification link.");
    }
  };

  return (
    <div className="admin-login-canvas">
      {/* Top action bar: theme toggle */}
      <header className="login-topbar">
        <div className="login-brand-tag">
          <span className="status-pulse" />
          <span>HIVE // OPERATIONS GATEWAY</span>
        </div>
        <button
          className="icon-button"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
        </button>
      </header>

      <div className="login-card-container">
        <div className="card login-card">
          {/* Header Brand */}
          <div className="login-header">
            <img
              src="/hivecity-full-logo.png"
              alt="HIVE CITY"
              style={{
                height: 76,
                width: "auto",
                maxWidth: 220,
                borderRadius: 14,
                objectFit: "contain",
                background: "#000000",
                padding: "6px 12px",
                margin: "0 auto 12px",
                display: "block",
              }}
            />
            <p className="login-subtitle">
              Administrator Control Centre. Dedicated Firebase authentication for authorized personnel.
            </p>
          </div>

          {/* SCREEN 1: Mandatory Email Verification Gate */}
          {needsEmailVerification ? (
            <div className="email-verification-panel">
              <div className="verification-icon-orbit">
                <MailCheck size={32} />
              </div>

              <h2>Verify Your Administrator Email</h2>
              <p className="verification-text">
                A verification link has been dispatched to:
                <strong className="verification-target-email">{unverifiedEmail || email}</strong>
              </p>
              <div className="verification-security-box">
                <ShieldCheck size={16} />
                <span>
                  For platform governance, administrative access requires verified email ownership before dashboard privileges are unlocked.
                </span>
              </div>

              <div className="verification-action-group">
                <button
                  type="button"
                  className="primary-button full-width-button"
                  onClick={handleCheckVerification}
                  disabled={checkingVerification}
                >
                  <RefreshCw size={15} className={checkingVerification ? "animate-spin" : ""} />
                  {checkingVerification ? "Checking Status..." : "I Have Verified My Email (Continue)"}
                </button>

                <button
                  type="button"
                  className="secondary-button full-width-button"
                  onClick={handleResendEmail}
                  disabled={resendingVerification}
                >
                  <Send size={14} />
                  {resendingVerification ? "Sending..." : "Resend Verification Link"}
                </button>

                <button
                  type="button"
                  className="text-button"
                  style={{ marginTop: 12, display: "inline-flex", justifyContent: "center", width: "100%" }}
                  onClick={logout}
                >
                  Use a different administrator account
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Tab Switcher: Sign In vs. Register Admin */}
              <div className="auth-mode-tabs">
                <button
                  type="button"
                  className={`auth-tab ${mode === "login" ? "active" : ""}`}
                  onClick={() => {
                    setMode("login");
                    setError(null);
                  }}
                >
                  <UserCheck size={14} /> Sign In
                </button>
                <button
                  type="button"
                  className={`auth-tab ${mode === "register" ? "active" : ""}`}
                  onClick={() => {
                    setMode("register");
                    setError(null);
                  }}
                >
                  <ShieldCheck size={14} /> Register Admin
                </button>
              </div>

              {/* Error Banner */}
              {error && (
                <div className="login-error-banner">
                  <AlertCircle size={16} />
                  <span>{error}</span>
                </div>
              )}

              {/* SCREEN 2: Admin Sign In */}
              {mode === "login" ? (
                <form onSubmit={handleLoginSubmit} className="login-form">
                  {/* Preset Helper Pill */}
                  <div className="authorized-preset-bar">
                    <span>AUTHORIZED ADMIN:</span>
                    <button
                      type="button"
                      className="chip on"
                      onClick={() => {
                        setEmail(AUTHORIZED_ADMIN_PRIMARY_EMAIL);
                        setError(null);
                      }}
                      title="Prefill primary admin email"
                    >
                      <CheckCircle2 size={13} /> {AUTHORIZED_ADMIN_PRIMARY_EMAIL}
                    </button>
                  </div>

                  <div className="input-field-group">
                    <label htmlFor="admin-email">Administrator Email</label>
                    <div className="input-with-icon">
                      <Mail size={16} className="input-icon" />
                      <input
                        id="admin-email"
                        type="email"
                        required
                        autoComplete="email"
                        placeholder="hivecity10@gmail.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="input-field-group">
                    <div className="password-header-row">
                      <label htmlFor="admin-password">Passcode</label>
                      <span className="crypto-badge">Firebase Auth</span>
                    </div>
                    <div className="input-with-icon">
                      <Lock size={16} className="input-icon" />
                      <input
                        id="admin-password"
                        type={showPassword ? "text" : "password"}
                        required
                        autoComplete="current-password"
                        placeholder="••••••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        className="password-toggle-btn"
                        onClick={() => setShowPassword((prev) => !prev)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="primary-button login-submit-btn"
                  >
                    {loading ? "Authenticating via Firebase..." : "Sign In as Administrator"}
                  </button>
                </form>
              ) : (
                /* SCREEN 3: Admin Registration */
                <form onSubmit={handleRegisterSubmit} className="login-form">
                  <div className="registration-notice-box">
                    <ShieldCheck size={16} />
                    <span>
                      Registered admins are provisioned with the full-access <strong>ADMIN</strong> role in the dedicated <code>admins</code> collection.
                    </span>
                  </div>

                  <div className="input-field-group">
                    <label htmlFor="reg-name">Administrator Full Name</label>
                    <div className="input-with-icon">
                      <UserRound size={16} className="input-icon" />
                      <input
                        id="reg-name"
                        type="text"
                        required
                        autoComplete="name"
                        placeholder="e.g. Hive City Controller"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="input-field-group">
                    <label htmlFor="reg-email">Administrator Email</label>
                    <div className="input-with-icon">
                      <Mail size={16} className="input-icon" />
                      <input
                        id="reg-email"
                        type="email"
                        required
                        autoComplete="email"
                        placeholder="hivecity10@gmail.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="input-field-group">
                    <label htmlFor="reg-password">Password (Minimum 8 characters)</label>
                    <div className="input-with-icon">
                      <Lock size={16} className="input-icon" />
                      <input
                        id="reg-password"
                        type={showPassword ? "text" : "password"}
                        required
                        autoComplete="new-password"
                        placeholder="••••••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        className="password-toggle-btn"
                        onClick={() => setShowPassword((prev) => !prev)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div className="input-field-group">
                    <label htmlFor="reg-confirm-password">Confirm Password</label>
                    <div className="input-with-icon">
                      <Lock size={16} className="input-icon" />
                      <input
                        id="reg-confirm-password"
                        type={showPassword ? "text" : "password"}
                        required
                        autoComplete="new-password"
                        placeholder="••••••••••••"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="primary-button login-submit-btn"
                  >
                    {loading ? "Registering Administrator..." : "Register Administrator & Send Verification"}
                  </button>
                </form>
              )}

              {/* Security Footer Notice */}
              <div className="login-footer-meta">
                <div className="meta-security-note">
                  <ShieldCheck size={14} />
                  <span>
                    Firebase Auth Engine · Firestore <code>admins</code> collection · Mandatory Email Verification
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
