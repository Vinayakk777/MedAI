import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY env vars");
}

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    storageKey: "medai-auth",
  },
});

export type AuthUser = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  imageUrl: string | null;
  fullName: string | null;
  emailAddresses: Array<{ emailAddress: string }>;
};

export function mapUser(user: any): AuthUser | null {
  if (!user) return null;
  const userMeta = user.user_metadata ?? {};
  return {
    id: user.id,
    email: user.email ?? null,
    firstName: userMeta.first_name ?? null,
    lastName: userMeta.last_name ?? null,
    imageUrl: userMeta.avatar_url ?? null,
    fullName: userMeta.full_name ?? (userMeta.first_name && userMeta.last_name ? `${userMeta.first_name} ${userMeta.last_name}` : null),
    emailAddresses: user.email ? [{ emailAddress: user.email }] : [],
  };
}

const supabaseAuthContext = createContext({
  user: null as AuthUser | null,
  setUser: (u: AuthUser | null) => {},
  loading: true,
  fetchUser: async () => {},
  signOut: async () => {},
  supabase: null as any,
});

export function useAuth() {
  const ctx = useContext(supabaseAuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    setUser(mapUser(data.user));
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(mapUser(data.session?.user ?? null));
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(mapUser(session?.user ?? null));
      setLoading(false);
    });
    return () => {
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  return (
    <supabaseAuthContext.Provider value={{ user, setUser, loading, fetchUser, signOut, supabase }}>
      {children}
    </supabaseAuthContext.Provider>
  );
}
