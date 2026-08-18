import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL = "https://vkiwvctpxhbsoeagivnl.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_qlmz0RMO8qXUrWi1i6bpaQ_9tcqSzFZ";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: "pkce",
    storageKey: "sitehawk-supabase-auth",
  },
});
