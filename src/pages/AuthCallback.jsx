import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import HawkIcon from "@/components/HawkIcon";
import { supabase } from "@/api/supabaseClient";

const safeNext = (value) =>
  typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/dashboard";

export default function AuthCallback() {
  const [params] = useSearchParams();
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;
    const finish = async () => {
      try {
        const next = safeNext(params.get("next") || sessionStorage.getItem("sitehawk:returnTo"));
        const code = params.get("code");
        const { data: current, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!current.session && code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }
        sessionStorage.removeItem("sitehawk:returnTo");
        window.location.replace(next);
      } catch (error) {
        if (active) setErrorMessage(error.message || "The sign-in link could not be completed.");
      }
    };
    finish();
    return () => { active = false; };
  }, [params]);

  return (
    <main className="min-h-screen bg-[#050505] text-white flex items-center justify-center p-6">
      <div className="text-center space-y-4">
        <HawkIcon size={52} />
        {errorMessage ? (
          <>
            <h1 className="font-heading font-bold text-xl">Unable to finish signing in</h1>
            <p className="text-sm text-red-300">{errorMessage}</p>
            <a href="/login" className="inline-block rounded-xl bg-[#00A3FF] px-5 py-3 font-semibold">Return to sign in</a>
          </>
        ) : (
          <>
            <div className="mx-auto h-7 w-7 rounded-full border-2 border-white/20 border-t-[#00A3FF] animate-spin" />
            <p className="text-sm text-white/60">Finishing your secure SiteHawk session…</p>
          </>
        )}
      </div>
    </main>
  );
}
