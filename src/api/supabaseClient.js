import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL = "https://vkiwvctpxhbsoeagivnl.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_qlmz0RMO8qXUrWi1i6bpaQ_9tcqSzFZ";
export const SITEHAWK_AUTH_ORIGIN = "https://site-hawk-pro.com";

export const getAuthCallbackUrl = (next = "/dashboard") => {
  const safeNext =
    typeof next === "string" && next.startsWith("/") && !next.startsWith("//")
      ? next
      : "/dashboard";
  return `${SITEHAWK_AUTH_ORIGIN}/auth/callback?next=${encodeURIComponent(safeNext)}`;
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: "pkce",
    storageKey: "sitehawk-supabase-auth",
  },
});
