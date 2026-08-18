import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2, Mail } from "lucide-react";
import HawkIcon from "@/components/HawkIcon";
import { getAuthCallbackUrl, supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";

const safeNext = (value) =>
  typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/dashboard";

export default function CheckEmail() {
  const [params] = useSearchParams();
  const email = params.get("email") || "";
  const next = useMemo(() => safeNext(params.get("next")), [params]);
  const { isAuthenticated } = useAuth();
  const [resending, setResending] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const checkForSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) window.location.replace(next);
    };
    const onFocus = () => checkForSession();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [next]);

  if (isAuthenticated) return <Navigate to={next} replace />;

  const resend = async () => {
    if (!email) return;
    setResending(true);
    setNotice("");
    setError("");
    try {
      const emailRedirectTo = getAuthCallbackUrl(next);
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo },
      });
      if (resendError) throw resendError;
      setNotice("Confirmation email resent. Check your inbox and spam folder.");
    } catch (resendError) {
      setError(resendError.message || "Unable to resend the confirmation email.");
    } finally {
      setResending(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#050505] text-white flex items-center justify-center p-6">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-[#111114] p-8 text-center shadow-2xl">
        <div className="flex justify-center mb-5"><HawkIcon size={50} /></div>
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[#00A3FF]/15">
          <Mail className="h-7 w-7 text-[#00A3FF]" />
        </div>
        <h1 className="font-heading text-2xl font-bold">Check your email</h1>
        <p className="mt-3 text-sm leading-relaxed text-white/55">
          We created your SiteHawk account and sent a confirmation link
          {email ? <> to <strong className="text-white">{email}</strong></> : null}.
          Open that link to activate your account and continue.
        </p>

        <div className="mt-6 rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-left text-xs text-amber-100">
          Email confirmation is required before SiteHawk can open the dashboard.
        </div>

        {notice && (
          <p className="mt-4 flex items-center justify-center gap-2 text-sm text-emerald-300">
            <CheckCircle2 size={16} /> {notice}
          </p>
        )}
        {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}

        <button
          type="button"
          onClick={resend}
          disabled={!email || resending}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#00A3FF] px-4 py-3 font-bold hover:bg-[#0089d8] disabled:opacity-50"
        >
          {resending && <Loader2 size={17} className="animate-spin" />}
          Resend confirmation email
        </button>

        <Link
          to={`/login?next=${encodeURIComponent(next)}`}
          className="mt-3 block rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-white/65 hover:text-white"
        >
          I already confirmed — sign in
        </Link>
      </section>
    </main>
  );
}
