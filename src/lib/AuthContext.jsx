import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { getAuthCallbackUrl, supabase } from "@/api/supabaseClient";
import { referral } from "@/functions/referral";
import { subscriberCrmSync } from "@/functions/subscriberCrmSync";

const AuthContext = createContext(null);

const safeReturnTo = (value) =>
  typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/dashboard";

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [supabaseUser, setSupabaseUser] = useState(null);
  const [session, setSession] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState(null);
  const mounted = useRef(true);

  const finishBase44Session = useCallback(async (nextSession) => {
    if (!nextSession) {
      if (!mounted.current) return;
      setUser(null);
      setSupabaseUser(null);
      setSession(null);
      setIsAuthenticated(false);
      setAuthError(null);
      return null;
    }

    try {
      const currentUser = await base44.auth.me();
      if (!mounted.current) return currentUser;
      setUser(currentUser);
      setSupabaseUser(nextSession.user);
      setSession(nextSession);
      setIsAuthenticated(true);
      setAuthError(null);

      const refCode = localStorage.getItem("sitehawk_ref_code");
      if (refCode) {
        referral({ action: "register_referral", referral_code: refCode }).catch(() => {});
        localStorage.removeItem("sitehawk_ref_code");
      }

      subscriberCrmSync({}).catch(() => {});
      try {
        const lastStamp = Number(localStorage.getItem("sh_last_active_stamp") || 0);
        if (Date.now() - lastStamp > 6 * 60 * 60 * 1000) {
          base44.auth.updateMe({ last_active_at: new Date().toISOString() }).catch(() => {});
          localStorage.setItem("sh_last_active_stamp", String(Date.now()));
        }
      } catch {
        // Storage is optional.
      }
      return currentUser;
    } catch (error) {
      if (!mounted.current) return null;
      setUser(null);
      setSupabaseUser(nextSession.user);
      setSession(nextSession);
      setIsAuthenticated(false);
      setAuthError({
        type: "base44_session_required",
        message: "Your SiteHawk data session expired. Sign in again to reconnect it.",
      });
      return null;
    }
  }, []);

  const checkUserAuth = useCallback(async () => {
    setIsLoadingAuth(true);
    setAuthError(null);
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      await finishBase44Session(data.session);
    } catch (error) {
      setAuthError({ type: "auth_required", message: error.message || "Authentication required" });
      setIsAuthenticated(false);
    } finally {
      if (mounted.current) {
        setAuthChecked(true);
        setIsLoadingAuth(false);
      }
    }
  }, [finishBase44Session]);

  useEffect(() => {
    mounted.current = true;
    checkUserAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === "SIGNED_OUT") {
        setSession(null);
        setSupabaseUser(null);
        setUser(null);
        setIsAuthenticated(false);
        setAuthError(null);
        setAuthChecked(true);
        setIsLoadingAuth(false);
        return;
      }

      if (nextSession && ["INITIAL_SESSION", "SIGNED_IN", "TOKEN_REFRESHED", "USER_UPDATED"].includes(event)) {
        setTimeout(() => {
          finishBase44Session(nextSession).finally(() => {
            if (mounted.current) {
              setAuthChecked(true);
              setIsLoadingAuth(false);
            }
          });
        }, 0);
      }
    });

    return () => {
      mounted.current = false;
      subscription.unsubscribe();
    };
  }, [checkUserAuth, finishBase44Session]);

  const signIn = async ({ email, password }) => {
    setIsLoadingAuth(true);
    setAuthError(null);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      try {
        await base44.auth.loginViaEmailPassword(email, password);
      } catch (bridgeError) {
        await supabase.auth.signOut({ scope: "local" });
        throw new Error(
          bridgeError?.message ||
          "Supabase accepted the login, but SiteHawk could not open its data session."
        );
      }

      await finishBase44Session(data.session);
      return data;
    } catch (error) {
      setAuthError({ type: "sign_in_failed", message: error.message || "Unable to sign in" });
      throw error;
    } finally {
      setAuthChecked(true);
      setIsLoadingAuth(false);
    }
  };

  const signUp = async ({ email, password }) => {
    setIsLoadingAuth(true);
    setAuthError(null);
    try {
      const emailRedirectTo = getAuthCallbackUrl(
        safeReturnTo(sessionStorage.getItem("sitehawk:returnTo"))
      );
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo },
      });
      if (error) throw error;

      try {
        await base44.auth.register({ email, password });
      } catch (registrationError) {
        try {
          await base44.auth.loginViaEmailPassword(email, password);
        } catch {
          if (data.session) await supabase.auth.signOut({ scope: "local" });
          throw new Error(
            registrationError?.message ||
            "Your Supabase account was created, but SiteHawk could not create its data account."
          );
        }
      }

      if (data.session) await finishBase44Session(data.session);
      return data;
    } catch (error) {
      setAuthError({ type: "sign_up_failed", message: error.message || "Unable to create account" });
      throw error;
    } finally {
      setAuthChecked(true);
      setIsLoadingAuth(false);
    }
  };

  const logout = async (shouldRedirect = true) => {
    setIsLoadingAuth(true);
    try {
      await Promise.allSettled([
        supabase.auth.signOut({ scope: "local" }),
        Promise.resolve(base44.auth.logout()),
      ]);
    } finally {
      setUser(null);
      setSupabaseUser(null);
      setSession(null);
      setIsAuthenticated(false);
      setAuthChecked(true);
      setIsLoadingAuth(false);
      if (shouldRedirect) window.location.assign("/login");
    }
  };

  const navigateToLogin = (returnTo = window.location.pathname + window.location.search) => {
    const safePath = safeReturnTo(returnTo);
    sessionStorage.setItem("sitehawk:returnTo", safePath);
    window.location.assign(`/login?next=${encodeURIComponent(safePath)}`);
  };

  return (
    <AuthContext.Provider value={{
      user,
      supabaseUser,
      session,
      isAuthenticated,
      isLoadingAuth,
      isLoadingPublicSettings: false,
      authChecked,
      authError,
      appPublicSettings: null,
      signIn,
      signUp,
      logout,
      navigateToLogin,
      checkAppState: checkUserAuth,
      checkUserAuth,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
};
