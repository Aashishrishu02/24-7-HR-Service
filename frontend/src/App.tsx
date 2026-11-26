
import { useState } from "react";
import type { FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ShieldCheck,
  LockKeyhole,
  Mail,
  Eye,
  EyeOff,
  Server,
  CheckCircle2,
  Loader2,
} from "lucide-react";

import api from "./api";
import Dashboard from "./Dashboard";
import Home from "./Home";
import AdminPanel from "./AdminPanel";
import BuyLinuxIP from "./BuyLinuxIP";

type Screen = "login" | "register" | "verify" | "forgot" | "reset";

function App() {
  const pathname = window.location.pathname.replace(/\/+$/, "") || "/";
  const isVpsDetailRoute = /^\/my-vps\/[^/]+$/.test(pathname);

  if (pathname === "/admin" || pathname === "/admin/login") {
    return <AdminPanel />;
  }

  const token = typeof window !== "undefined" ? sessionStorage.getItem("indiccloud_token") : null;

  // Unauthenticated visitors to /dedicated-ip can view the dedicated IP catalogue directly
  if (pathname === "/dedicated-ip" && !token) {
    return <BuyLinuxIP embedded={false} />;
  }

  if (
    pathname === "/dashboard" ||
    pathname === "/wallet" ||
    pathname === "/orders" ||
    pathname === "/servers" ||
    pathname === "/my-vps" ||
    isVpsDetailRoute ||
    pathname === "/windows-vps" ||
    pathname === "/linux-vps" ||
    pathname === "/dedicated-ip" ||
    pathname === "/support" ||
    pathname === "/checkout" ||
    pathname === "/buy-vps"
  ) {
    return <Dashboard />;
  }

  if (pathname === "/login" || pathname === "/register") {
    return <AuthApp />;
  }

  return <Home />;
}

function AuthApp() {
  const [screen, setScreen] = useState<Screen>(window.location.pathname === "/register" ? "register" : "login");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
    otp: "",
  });

  const update = (field: string, value: string) => {
    setForm((previous) => ({ ...previous, [field]: value }));
  };

  const resetMessages = () => {
    setError("");
    setMessage("");
  };

  const login = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    resetMessages();
    setLoading(true);

    try {
      const response = await api.post("/login", {
        email: form.email,
        password: form.password,
      });

      if (!response.data?.token) {
        throw new Error("Login response did not contain an authentication token.");
      }

      sessionStorage.setItem(
        "indiccloud_token",
        response.data.token
      );

      const params = new URLSearchParams(window.location.search);
      const planId = params.get("planId");
      const redirect = params.get("redirect");
      if (planId) {
        window.location.href = `/checkout?planId=${planId}`;
      } else if (redirect) {
        window.location.href = redirect;
      } else {
        window.location.href = "/dashboard";
      }
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
          err.message ||
          "Unable to login. Please check your credentials."
      );
    } finally {
      setLoading(false);
    }
  };

  const register = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    resetMessages();

    if (form.password !== form.confirmPassword) {
      setError("Password and confirm password do not match.");
      return;
    }

    if (
      form.password.length < 8 ||
      form.password.length > 72 ||
      !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).*$/.test(form.password)
    ) {
      setError("Password must be 8-72 characters and contain uppercase, lowercase and a number.");
      return;
    }

    setLoading(true);

    try {
      const validation = await api.post("/register/validate", {
        email: form.email,
      });

      if (validation.data.emailTaken) {
        setError("This email is already registered.");
        return;
      }

      await api.post("/register/initiate-verification", {
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        password: form.password,
        confirmPassword: form.confirmPassword,
      });

      setScreen("verify");
      setMessage("Verification OTP has been sent to your email.");
    } catch (err: any) {
      setError(
        err.response?.data?.message || "Registration failed."
      );
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    resetMessages();
    setLoading(true);

    try {
      await api.post("/register/complete-registration", {
        email: form.email,
        otp: form.otp,
      });

      setScreen("login");
      setMessage("Email verified successfully! You can now log in using the password you created.");
      update("confirmPassword", "");
      update("otp", "");
    } catch (err: any) {
      setError(
        err.response?.data?.message || "Invalid or expired OTP."
      );
    } finally {
      setLoading(false);
    }
  };

  const resendOtp = async () => {
    resetMessages();
    setLoading(true);

    try {
      await api.post("/register/resend-otp", {
        email: form.email,
      });

      setMessage("A new verification OTP has been sent.");
    } catch (err: any) {
      setError(
        err.response?.data?.message || "Unable to resend OTP."
      );
    } finally {
      setLoading(false);
    }
  };

  const requestPasswordOtp = async (e?: FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    resetMessages();
    setLoading(true);

    try {
      await api.post("/password/forgot", {
        email: form.email,
      });

      setScreen("reset");
      update("otp", "");
      setMessage("If an account exists, a password reset OTP has been sent to your email.");
    } catch (err: any) {
      setError(
        err.response?.data?.message || "Unable to request password reset."
      );
    } finally {
      setLoading(false);
    }
  };

  const verifyPasswordOtp = async (e?: FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    resetMessages();
    setLoading(true);

    try {
      await api.post("/password/verify-otp", {
        email: form.email,
        otp: form.otp,
      });

      setMessage("OTP verified. Enter your new password below.");
    } catch (err: any) {
      setError(
        err.response?.data?.message || "Invalid or expired OTP."
      );
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    resetMessages();

    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      await api.post("/password/reset", {
        email: form.email,
        otp: form.otp,
        newPassword: form.password,
        confirmPassword: form.confirmPassword,
      });

      setScreen("login");
      update("password", "");
      update("confirmPassword", "");
      update("otp", "");
      setMessage("Password reset successfully. Please login with your new password.");
    } catch (err: any) {
      setError(
        err.response?.data?.message || "Unable to reset password."
      );
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    "w-full rounded-lg border border-[#332f2a] bg-[#171717] px-4 py-3.5 text-sm text-[#F1E9DA] outline-none transition placeholder:text-[#F1E9DA]/30 focus:border-[#C6A66B] focus:ring-1 focus:ring-[#C6A66B]/30";

  const labelClass =
    "mb-2 block font-mono text-[10px] font-bold uppercase tracking-wider text-[#C6A66B]";

  const primaryButton =
    "flex w-full items-center justify-center gap-2 rounded-lg bg-[#C6A66B] px-5 py-3.5 text-xs font-bold uppercase tracking-wider text-[#171717] transition hover:bg-[#d8ba82] disabled:cursor-not-allowed disabled:opacity-60 shadow-lg shadow-[#C6A66B]/15";

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#171717] px-4 py-10 font-sans text-[#F1E9DA]">
      <div className="pointer-events-none absolute -left-40 top-0 h-96 w-96 rounded-full bg-[#C6A66B]/5 blur-[120px]" />
      <div className="pointer-events-none absolute -right-40 bottom-0 h-96 w-96 rounded-full bg-[#C6A66B]/5 blur-[120px]" />

      <div className="relative z-10 w-full max-w-[470px]">
        <div className="mb-7 flex items-center justify-between">
          <a href="/" className="font-serif text-xl font-bold tracking-tight text-[#F1E9DA]">
            24/7 <span className="text-[#C6A66B]">CLOUD</span>
          </a>

          <span className="flex items-center gap-1.5 rounded-full border border-[#C6A66B]/30 bg-[#292521] px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[#C6A66B]">
            <ShieldCheck size={13} />
            Secure Enterprise
          </span>
        </div>

        <div className="rounded-2xl border border-[#332f2a] bg-[#201d1a] p-6 shadow-2xl shadow-black/80 sm:p-9">
          <div className="mb-7 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[#C6A66B]/30 bg-[#171717] text-[#C6A66B]">
              {screen === "verify" || screen === "forgot" || screen === "reset" ? (
                <Mail size={22} />
              ) : (
                <Server size={22} />
              )}
            </div>

            <div>
              <p className="font-mono text-[9px] font-bold uppercase tracking-[2px] text-[#C6A66B]">
                Sovereign Infrastructure
              </p>

              <h1 className="mt-1 font-serif text-2xl font-bold text-[#F1E9DA]">
                {screen === "login" && "Console Access"}
                {screen === "register" && "Create Account"}
                {screen === "verify" && "Email Verification"}
                {screen === "forgot" && "Forgot Password"}
                {screen === "reset" && "Reset Password"}
              </h1>
            </div>
          </div>

          {screen === "login" && (
            <>
              <div className="mb-7 grid grid-cols-2 rounded-lg border border-[#332f2a] bg-[#171717] p-1 font-mono text-xs">
                <button
                  type="button"
                  className="rounded bg-[#C6A66B] py-2 text-xs font-bold uppercase tracking-wider text-[#171717]"
                >
                  Sign In
                </button>

                <button
                  type="button"
                  onClick={() => {
                    resetMessages();
                    setScreen("register");
                  }}
                  className="rounded py-2 text-xs font-bold uppercase tracking-wider text-[#F1E9DA]/60 transition hover:text-[#F1E9DA]"
                >
                  Register
                </button>
              </div>

              <form onSubmit={login} className="space-y-5">
                <div>
                  <label className={labelClass}>Work Email</label>

                  <div className="relative">
                    <Mail
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#F1E9DA]/40"
                      size={17}
                    />

                    <input
                      className={`${inputClass} pl-11`}
                      type="email"
                      placeholder="you@company.com"
                      value={form.email}
                      onChange={(e) => update("email", e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex justify-between">
                    <label className={labelClass}>Password</label>

                    <button
                      type="button"
                      onClick={() => {
                        resetMessages();
                        update("otp", "");
                        update("password", "");
                        update("confirmPassword", "");
                        setScreen("forgot");
                      }}
                      className="text-xs text-[#C6A66B] hover:underline"
                    >
                      Forgot Password?
                    </button>
                  </div>

                  <div className="relative">
                    <LockKeyhole
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#F1E9DA]/40"
                      size={17}
                    />

                    <input
                      className={`${inputClass} pl-11 pr-12`}
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      value={form.password}
                      onChange={(e) => update("password", e.target.value)}
                      required
                    />

                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#F1E9DA]/40 hover:text-[#F1E9DA]"
                    >
                      {showPassword ? (
                        <EyeOff size={18} />
                      ) : (
                        <Eye size={18} />
                      )}
                    </button>
                  </div>
                </div>

                {error && (
                  <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                    {error}
                  </p>
                )}

                {message && (
                  <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-400">
                    {message}
                  </p>
                )}

                <button className={primaryButton} disabled={loading}>
                  {loading ? (
                    <Loader2 className="animate-spin" size={18} />
                  ) : (
                    "Authenticate Session"
                  )}
                  {!loading && <ArrowRight size={17} />}
                </button>
              </form>
            </>
          )}

          {screen === "forgot" && (
            <>
              <button
                type="button"
                onClick={() => {
                  resetMessages();
                  setScreen("login");
                }}
                className="mb-6 flex items-center gap-2 text-xs text-slate-400 hover:text-white"
              >
                <ArrowLeft size={15} /> Back to Login
              </button>

              <p className="mb-6 text-sm leading-6 text-slate-400">
                Enter your registered email address. We will send you a password reset OTP.
              </p>

              <form onSubmit={requestPasswordOtp} className="space-y-5">
                <div>
                  <label className={labelClass}>Work Email</label>
                  <input
                    className={inputClass}
                    type="email"
                    placeholder="you@company.com"
                    value={form.email}
                    onChange={(e) => update("email", e.target.value)}
                    required
                  />
                </div>

                {error && (
                  <p className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400">
                    {error}
                  </p>
                )}

                {message && (
                  <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-400">
                    {message}
                  </p>
                )}

                <button className={primaryButton} disabled={loading}>
                  {loading ? (
                    <Loader2 className="animate-spin" size={18} />
                  ) : (
                    "Send Reset OTP"
                  )}
                  {!loading && <ArrowRight size={17} />}
                </button>
              </form>
            </>
          )}

          {screen === "reset" && (
            <>
              <button
                type="button"
                onClick={() => {
                  resetMessages();
                  setScreen("forgot");
                }}
                className="mb-6 flex items-center gap-2 text-xs text-slate-400 hover:text-white"
              >
                <ArrowLeft size={15} /> Back
              </button>

              <p className="mb-6 text-sm leading-6 text-slate-400">
                Enter the OTP sent to{" "}
                <span className="font-semibold text-white">{form.email}</span>,
                then choose your new password.
              </p>

              <form onSubmit={resetPassword} className="space-y-5">
                <div>
                  <label className={labelClass}>Password Reset OTP</label>
                  <input
                    className={`${inputClass} text-center text-2xl font-bold tracking-[12px]`}
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="••••••"
                    value={form.otp}
                    onChange={(e) =>
                      update("otp", e.target.value.replace(/\D/g, ""))
                    }
                    required
                  />
                </div>

                <div>
                  <label className={labelClass}>New Password</label>
                  <input
                    className={inputClass}
                    type="password"
                    placeholder="Enter new password"
                    value={form.password}
                    onChange={(e) => update("password", e.target.value)}
                    required
                    minLength={8}
                  />
                </div>

                <div>
                  <label className={labelClass}>Confirm New Password</label>
                  <input
                    className={inputClass}
                    type="password"
                    placeholder="Confirm new password"
                    value={form.confirmPassword}
                    onChange={(e) => update("confirmPassword", e.target.value)}
                    required
                    minLength={8}
                  />
                </div>

                {error && (
                  <p className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400">
                    {error}
                  </p>
                )}

                {message && (
                  <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-400">
                    {message}
                  </p>
                )}

                <button className={primaryButton} disabled={loading}>
                  {loading ? (
                    <Loader2 className="animate-spin" size={18} />
                  ) : (
                    "Reset Password"
                  )}
                  {!loading && <CheckCircle2 size={17} />}
                </button>

                <button
                  type="button"
                  onClick={() => void verifyPasswordOtp()}
                  disabled={loading || form.otp.length !== 6}
                  className="w-full text-center text-xs font-semibold text-[#C6A66B] hover:text-[#d8ba82] disabled:opacity-50"
                >
                  Verify OTP
                </button>

                <button
                  type="button"
                  onClick={() => void requestPasswordOtp()}
                  disabled={loading}
                  className="w-full text-center text-xs font-semibold text-slate-400 hover:text-white disabled:opacity-50"
                >
                  Resend OTP
                </button>
              </form>
            </>
          )}

          {screen === "register" && (
            <>
              <button
                type="button"
                onClick={() => {
                  resetMessages();
                  setScreen("login");
                }}
                className="mb-6 flex items-center gap-2 text-xs text-slate-400 hover:text-white"
              >
                <ArrowLeft size={15} /> Back to Login
              </button>

              <form onSubmit={register} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>First Name</label>
                    <input
                      className={inputClass}
                      placeholder="First name"
                      value={form.firstName}
                      onChange={(e) => update("firstName", e.target.value)}
                      required
                    />
                  </div>

                  <div>
                    <label className={labelClass}>Last Name</label>
                    <input
                      className={inputClass}
                      placeholder="Last name"
                      value={form.lastName}
                      onChange={(e) => update("lastName", e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className={labelClass}>Work Email</label>
                  <input
                    className={inputClass}
                    type="email"
                    placeholder="you@company.com"
                    value={form.email}
                    onChange={(e) => update("email", e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className={labelClass}>Create Password</label>
                  <input
                    className={inputClass}
                    type="password"
                    placeholder="At least 8 characters"
                    value={form.password}
                    onChange={(e) => update("password", e.target.value)}
                    required
                    minLength={8}
                    maxLength={72}
                    pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*\d).*"
                    title="Include uppercase, lowercase and a number"
                  />
                </div>

                <div>
                  <label className={labelClass}>Confirm Password</label>
                  <input
                    className={inputClass}
                    type="password"
                    placeholder="Re-enter your password"
                    value={form.confirmPassword}
                    onChange={(e) => update("confirmPassword", e.target.value)}
                    required
                    minLength={8}
                    maxLength={72}
                  />
                </div>

                {error && (
                  <p className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400">
                    {error}
                  </p>
                )}

                {message && (
                  <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-400">
                    {message}
                  </p>
                )}

                <button className={primaryButton} disabled={loading}>
                  {loading ? (
                    <Loader2 className="animate-spin" size={18} />
                  ) : (
                    "Create Account & Verify Email"
                  )}
                  {!loading && <ArrowRight size={17} />}
                </button>
              </form>
            </>
          )}

          {screen === "verify" && (
            <>
              <button
                type="button"
                onClick={() => {
                  resetMessages();
                  setScreen("register");
                }}
                className="mb-6 flex items-center gap-2 text-xs text-slate-400 hover:text-white"
              >
                <ArrowLeft size={15} /> Back to Registration
              </button>

              <p className="mb-6 text-sm leading-6 text-slate-400">
                Enter the verification code sent to{" "}
                <span className="font-semibold text-white">
                  {form.email}
                </span>.
              </p>

              <form onSubmit={verifyOtp} className="space-y-5">
                <div>
                  <label className={labelClass}>One-Time Password</label>

                  <input
                    className={`${inputClass} text-center text-2xl font-bold tracking-[12px]`}
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="••••••"
                    value={form.otp}
                    onChange={(e) =>
                      update("otp", e.target.value.replace(/\D/g, ""))
                    }
                    required
                  />
                </div>

                {error && (
                  <p className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400">
                    {error}
                  </p>
                )}

                {message && (
                  <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-400">
                    {message}
                  </p>
                )}

                <button className={primaryButton} disabled={loading}>
                  {loading ? (
                    <Loader2 className="animate-spin" size={18} />
                  ) : (
                    "Verify Email"
                  )}
                  {!loading && <CheckCircle2 size={17} />}
                </button>

                <button
                  type="button"
                  onClick={resendOtp}
                  disabled={loading}
                  className="w-full text-center text-xs font-semibold text-[#C6A66B] hover:text-[#d8ba82] disabled:opacity-50"
                >
                  Resend OTP
                </button>
              </form>
            </>
          )}

          <div className="mt-7 flex items-start gap-3 rounded-lg border border-emerald-500/15 bg-emerald-500/5 p-4">
            <ShieldCheck
              className="mt-0.5 shrink-0 text-emerald-400"
              size={18}
            />

            <p className="text-[11px] leading-5 text-slate-400">
              Your account authentication is handled by 24/7
              backend. Never share your password or verification code.
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-center gap-6 text-[10px] text-slate-500">
          <span>Terms of Service</span>
          <span>Privacy Policy</span>
          <span>Secure Infrastructure</span>
        </div>

        <p className="mt-4 text-center text-[10px] tracking-wider text-slate-600">
          © {new Date().getFullYear()} 24/7
        </p>
      </div>
    </div>
  );
}

export default App;
