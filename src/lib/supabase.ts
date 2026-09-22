import type { Session, SupabaseClient } from "@supabase/supabase-js";
import type { AuthSession } from "./auth";

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
const validConfig = (() => {
  if (!url || !anonKey) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.hostname === "localhost";
  } catch {
    return false;
  }
})();

export const supabaseConfigured = validConfig && Boolean(url && anonKey);
let clientPromise: Promise<SupabaseClient | null> | null = null;

/** Keep the cloud SDK out of the local-first app bundle until a cloud action is used. */
export function getSupabaseClient(): Promise<SupabaseClient | null> {
  if (!supabaseConfigured || !url || !anonKey) return Promise.resolve(null);
  clientPromise ??= import("@supabase/supabase-js").then(({ createClient }) =>
    createClient(url, anonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    }),
  );
  return clientPromise;
}

export function cloudSession(session: Session): AuthSession {
  return {
    userId: session.user.id,
    name: String(session.user.user_metadata?.name ?? session.user.user_metadata?.full_name ?? session.user.email?.split("@")[0] ?? "Rider"),
    email: session.user.email ?? "",
    provider: "supabase",
  };
}

export function cloudRedirectUrl(): string {
  const base = import.meta.env.BASE_URL ?? "/";
  return new URL(base, window.location.origin).toString();
}
