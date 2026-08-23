"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

type AuthCtx = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
  openAuthModal: (defaultTab?: "signin" | "signup") => void;
  closeAuthModal: () => void;
  authModalOpen: boolean;
  authModalTab: "signin" | "signup";
};

const Ctx = createContext<AuthCtx>({
  user: null, session: null, loading: true,
  signOut: async () => {}, openAuthModal: () => {}, closeAuthModal: () => {},
  authModalOpen: false, authModalTab: "signin",
});

export function useAuth() { return useContext(Ctx); }

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalTab, setAuthModalTab] = useState<"signin" | "signup">("signin");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session); setUser(data.session?.user ?? null); setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess); setUser(sess?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null); setSession(null);
  }, []);

  const openAuthModal = useCallback((tab: "signin" | "signup" = "signin") => {
    setAuthModalTab(tab); setAuthModalOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => setAuthModalOpen(false), []);

  return (
    <Ctx.Provider value={{ user, session, loading, signOut, openAuthModal, closeAuthModal, authModalOpen, authModalTab }}>
      {children}
    </Ctx.Provider>
  );
}
