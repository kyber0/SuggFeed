"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

type AuthCtx = {
  user: User | null;
  session: Session | null;
  role: string | null;
  isStaff: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
  openAuthModal: (defaultTab?: "signin" | "signup" | "forgot" | "reset") => void;
  closeAuthModal: () => void;
  authModalOpen: boolean;
  authModalTab: "signin" | "signup" | "forgot" | "reset";
};

const Ctx = createContext<AuthCtx>({
  user: null, session: null, role: null, isStaff: false, loading: true,
  signOut: async () => {}, openAuthModal: () => {}, closeAuthModal: () => {},
  authModalOpen: false, authModalTab: "signin",
});

export function useAuth() { return useContext(Ctx); }

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [isStaff, setIsStaff] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalTab, setAuthModalTab] = useState<"signin" | "signup" | "forgot" | "reset">("signin");

  const syncRole = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setRole(null);
      setIsStaff(false);
      return;
    }
    try {
      const { data } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle();
      const userRole = data?.role ?? "student";
      setRole(userRole);
      setIsStaff(userRole === "moderator" || userRole === "admin");
    } catch {
      setRole(null);
      setIsStaff(false);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user?.id) {
        syncRole(data.session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user?.id) {
        syncRole(sess.user.id);
      } else {
        setRole(null);
        setIsStaff(false);
      }

      // When Supabase delivers a password-recovery token, open the reset modal
      if (event === "PASSWORD_RECOVERY") {
        setAuthModalTab("reset");
        setAuthModalOpen(true);
      }
    });
    return () => subscription.unsubscribe();
  }, [syncRole]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setRole(null);
    setIsStaff(false);
  }, []);

  const openAuthModal = useCallback((tab: "signin" | "signup" | "forgot" | "reset" = "signin") => {
    setAuthModalTab(tab);
    setAuthModalOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => setAuthModalOpen(false), []);

  return (
    <Ctx.Provider value={{ user, session, role, isStaff, loading, signOut, openAuthModal, closeAuthModal, authModalOpen, authModalTab }}>
      {children}
    </Ctx.Provider>
  );
}
