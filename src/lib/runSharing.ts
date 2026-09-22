import type { Run, Trail, Point } from "../types";
import { analyze } from "./analysis";
import { getSupabaseClient } from "./supabase";

export interface SharedRunSnapshot {
  riderName: string;
  trail: Trail;
  run: Run;
  ghost: Run | null;
  expiresAt: string;
}

function thinTrack(points: Point[], maxPoints = 3500): Point[] {
  if (points.length <= maxPoints) return points;
  const step = (points.length - 1) / (maxPoints - 1);
  return Array.from({ length: maxPoints }, (_, index) => points[Math.round(index * step)]);
}

function shareCopy(run: Run | null): Run | null {
  if (!run) return null;
  return { ...run, points: thinTrack(run.points), notes: "", bikeSetupSnapshot: undefined, synthetic: undefined };
}

export function createShareToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function hashShareToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createPrivateRunShare(
  riderName: string,
  trail: Trail,
  run: Run,
  ghost: Run | null,
): Promise<string> {
  const client = await getSupabaseClient();
  if (!client) throw new Error("Private run links need a configured cloud account.");
  const { data: auth, error: authError } = await client.auth.getSession();
  if (authError) throw authError;
  if (!auth.session) throw new Error("Sign in again before sharing a run.");
  const token = createShareToken();
  const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const snapshot: SharedRunSnapshot = {
    riderName: riderName.slice(0, 80),
    trail: { ...trail, points: thinTrack(trail.points) },
    run: shareCopy(run)!,
    ghost: shareCopy(ghost),
    expiresAt,
  };
  const { error } = await client.from("ghostline_shared_runs").insert({
    owner_id: auth.session.user.id,
    token_hash: await hashShareToken(token),
    snapshot,
    expires_at: expiresAt,
  });
  if (error) throw error;
  const base = new URL(import.meta.env.BASE_URL ?? "/", window.location.origin);
  base.hash = `share=${token}`;
  return base.toString();
}

function isPoint(value: unknown): value is Point {
  if (!value || typeof value !== "object") return false;
  const point = value as Partial<Point>;
  return Number.isFinite(point.lat) && Number.isFinite(point.lon) && Number.isFinite(point.ele) && Number.isFinite(point.time)
    && point.lat! >= -90 && point.lat! <= 90 && point.lon! >= -180 && point.lon! <= 180;
}

function isTrack(value: unknown): value is Point[] {
  return Array.isArray(value) && value.length >= 2 && value.length <= 3500 && value.every(isPoint);
}

export function validateSharedRun(value: unknown): SharedRunSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const snapshot = value as Partial<SharedRunSnapshot>;
  const trail = snapshot.trail;
  const run = snapshot.run;
  if (typeof snapshot.riderName !== "string" || !trail || !run || !isTrack(run.points) || !Array.isArray(trail.points) || trail.points.length > 3500 || !trail.points.every(isPoint)) return null;
  if (!Array.isArray(trail.boundaries) || trail.boundaries.some((value, index) => !Number.isFinite(value) || value <= 0 || value >= 1 || (index > 0 && value <= trail.boundaries[index - 1])) || !Array.isArray(trail.sectorNames) || trail.sectorNames.length !== trail.boundaries.length + 1 || trail.sectorNames.some((name) => typeof name !== "string")) return null;
  try {
    analyze(run.points);
    if (snapshot.ghost) {
      if (!isTrack(snapshot.ghost.points)) return null;
      analyze(snapshot.ghost.points);
    }
  } catch {
    return null;
  }
  return snapshot as SharedRunSnapshot;
}

export async function loadPrivateRunShare(token: string): Promise<SharedRunSnapshot | null> {
  if (!/^[A-Za-z0-9_-]{40,50}$/.test(token)) return null;
  const client = await getSupabaseClient();
  if (!client) return null;
  const { data, error } = await client.rpc("get_ghostline_shared_run", { share_token: token });
  if (error) throw error;
  return validateSharedRun(data);
}
