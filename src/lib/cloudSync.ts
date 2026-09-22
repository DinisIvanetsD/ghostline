/** Optional Supabase PostgREST adapter. Local-first app flows do not depend on it. */
export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

export interface CloudWorkspace<T = unknown> {
  userId: string;
  data: T;
  updatedAt: string;
}

export interface WorkspaceCloudSync<T = unknown> {
  configured: boolean;
  pull(accessToken: string, userId: string): Promise<CloudWorkspace<T> | null>;
  push(accessToken: string, userId: string, data: T): Promise<void>;
}

/** Preserve records created on a device before its first cloud sign-in. */
export function mergeWorkspaceRecords<T extends {
  profile: unknown;
  bikes: Array<{ id: string }>;
  trails: Array<{ id: string }>;
  runs: Array<{ id: string }>;
  demo?: boolean;
}>(local: T, remote: T): T {
  const merge = <R extends { id: string }>(left: R[], right: R[]) => {
    const records = new Map(left.map((record) => [record.id, record]));
    right.forEach((record) => records.set(record.id, record));
    return [...records.values()];
  };
  return {
    ...remote,
    profile: remote.demo ? local.profile : remote.profile,
    bikes: merge(local.bikes, remote.bikes),
    trails: merge(local.trails, remote.trails),
    runs: merge(local.runs, remote.runs),
    demo: false,
  };
}

function environmentConfig(): SupabaseConfig | null {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") return null;
    return { url: parsed.origin, anonKey };
  } catch {
    return null;
  }
}

export function isSupabaseConfigured(config: SupabaseConfig | null = environmentConfig()): boolean {
  return Boolean(config?.url && config.anonKey);
}

/**
 * Uses Supabase's REST endpoint directly to keep this scaffold dependency-free.
 * Supply a Supabase user access token; the local demo/account session is not a
 * Supabase credential and cannot call these methods.
 */
export function createWorkspaceCloudSync<T = unknown>(
  config: SupabaseConfig | null = environmentConfig(),
): WorkspaceCloudSync<T> {
  const configured = isSupabaseConfigured(config);
  const endpoint = config ? `${config.url.replace(/\/$/, "")}/rest/v1/ghostline_workspaces` : "";

  const request = async (accessToken: string, path: string, init: RequestInit): Promise<Response> => {
    if (!configured || !config) throw new Error("Cloud sync is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
    if (!accessToken.trim()) throw new Error("A Supabase user access token is required for cloud sync.");
    const response = await fetch(`${endpoint}${path}`, {
      ...init,
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
    if (!response.ok) throw new Error(`Cloud sync failed (${response.status}).`);
    return response;
  };

  return {
    configured,
    async pull(accessToken, userId) {
      if (!userId.trim()) throw new Error("A user ID is required for cloud sync.");
      const query = new URLSearchParams({ select: "user_id,workspace,updated_at", user_id: `eq.${userId}`, limit: "1" });
      const response = await request(accessToken, `?${query}`, { method: "GET", headers: { Accept: "application/json" } });
      const rows = await response.json() as Array<{ user_id: string; workspace: T; updated_at: string }>;
      const row = rows[0];
      return row ? { userId: row.user_id, data: row.workspace, updatedAt: row.updated_at } : null;
    },
    async push(accessToken, userId, data) {
      if (!userId.trim()) throw new Error("A user ID is required for cloud sync.");
      await request(accessToken, "?on_conflict=user_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ user_id: userId, workspace: data, updated_at: new Date().toISOString() }),
      });
    },
  };
}
