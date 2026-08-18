import { useMemo, useState } from "react";
import { Link, Navigate, useLocation, useSearchParams } from "react-router-dom";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import HawkIcon from "@/components/HawkIcon";
import { useAuth } from "@/lib/AuthContext";

const safeNext = (value) =>
  typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/dashboard";

export default function Login() {
  const location = useLocation();
  const [params] = useSearchParams();
  const next = useMemo(
    () => safeNext(params.get("next") || location.state?.from || "/dashboard"),
    [location.state, params]
  );
  const [mode, setMode] = useState(params.get("mode") === "signup" ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState("");
  const { signIn, signUp, isAuthenticated, isLoadingAuth } = useAuth();

  if (isAuthenticated) return <Navigate to={next} replace />;

  const submit = async (event) => {
    event.preventDefault();
    setFormError("");
    sessionStorage.setItem("sitehawk:returnTo", next);
    try {
      if (mode === "signin") {
        await signIn({ email: email.trim(), password });
        window.location.assign(next);
      } else {
        const data = await signUp({ email: email.trim(), password });
        if (data.session) {
          window.location.assign(next);
        } else {
          const query = new URLSearchParams({ email: email.trim(), next });
          window.location.assign(`/auth/check-email?${query.toString()}`);
        }
      }
    } catch (error) {
      setFormError(error.message || "Authentication failed. Please try again.");
    }
  };

  return (
    <main className="min-h-screen bg-[#050505] text-white flex items-center justify-center p-6">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-[#111114] p-7 shadow-2xl">
        <Link to="/" className="flex items-center justify-center gap-3 mb-7">
          <HawkIcon size={46} />
          <div>
            <div className="font-heading font-bold text-xl">SiteHawk</div>
            <div className="text-[10px] tracking-widest uppercase text-[#00A3FF]">Secure access</div>
          </div>
        </Link>

        <div className="grid grid-cols-2 rounded-xl bg-white/5 p-1 mb-6">
          {[
            ["signin", "Sign In"],
            ["signup", "Create Account"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => { setMode(value); setFormError(""); }}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                mode === value ? "bg-[#00A3FF] text-white" : "text-white/55 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-4">
          <label className="block">
            <span className="block text-xs font-semibold text-white/60 mb-2">Email</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 outline-none focus:border-[#00A3FF]"
              placeholder="you@company.com"
            />
          </label>

          <label className="block">
            <span className="block text-xs font-semibold text-white/60 mb-2">Password</span>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                required
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 pr-12 outline-none focus:border-[#00A3FF]"
                placeholder="At least 8 characters"
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/45 hover:text-white"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>

          {formError && (
            <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
              {formError}
            </p>
          )}

          <button
            type="submit"
            disabled={isLoadingAuth}
            className="w-full rounded-xl bg-[#00A3FF] px-4 py-3 font-bold text-white hover:bg-[#0089d8] disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {isLoadingAuth && <Loader2 size={18} className="animate-spin" />}
            {mode === "signin" ? "Sign In" : "Create Account"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-white/35">
          Authentication is protected by Supabase. SiteHawk data permissions remain enforced separately.
        </p>
      </section>
    </main>
  );
}
