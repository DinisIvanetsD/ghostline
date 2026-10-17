import type { Run, Trail } from "../types";
import { courseDuration, sectorTimes } from "./analysis";
import { getSupabaseClient } from "./supabase";

/** Trails every rider shares; custom trails have per-rider ids and stay private. */
export const LEADERBOARD_TRAILS = ["mundial", "free-ride", "secret-spot"] as const;

export interface LeaderboardEntry {
  userId: string;
  riderName: string;
  bestSeconds: number;
  sectors: number[];
  runDate: string;
}

export const hasLeaderboard = (trail?: Trail) =>
  Boolean(trail && (LEADERBOARD_TRAILS as readonly string[]).includes(trail.id));

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Build the public row for a run. Only name, times and date leave the device. */
export function leaderboardRow(trail: Trail, run: Run, riderName: string) {
  if (!hasLeaderboard(trail)) throw new Error("Esta pista não tem classificação partilhada.");
  if (run.synthetic) throw new Error("As runs de demonstração não podem ser publicadas.");
  const name = riderName.trim().slice(0, 40);
  if (!name) throw new Error("Escreve primeiro o teu nome no perfil.");
  const best = round2(courseDuration(run, trail));
  if (!(best >= 10 && best <= 3600)) throw new Error("Este tempo está fora dos limites da classificação.");
  return {
    trail_key: trail.id,
    rider_name: name,
    best_seconds: best,
    sectors: sectorTimes(run, trail).slice(0, 12).map(round2),
    run_date: run.date,
  };
}

export function parseLeaderboard(rows: unknown): LeaderboardEntry[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter(
      (row): row is Record<string, unknown> =>
        Boolean(row) &&
        typeof row === "object" &&
        typeof (row as Record<string, unknown>).user_id === "string" &&
        typeof (row as Record<string, unknown>).rider_name === "string" &&
        Number.isFinite(Number((row as Record<string, unknown>).best_seconds)),
    )
    .map((row) => ({
      userId: row.user_id as string,
      riderName: row.rider_name as string,
      bestSeconds: Number(row.best_seconds),
      sectors: Array.isArray(row.sectors) ? row.sectors.map(Number).filter(Number.isFinite) : [],
      runDate: typeof row.run_date === "string" ? row.run_date : "",
    }))
    .sort((a, b) => a.bestSeconds - b.bestSeconds);
}

async function signedInClient() {
  const client = await getSupabaseClient();
  if (!client) throw new Error("A classificação precisa de uma conta na nuvem configurada.");
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  if (!data.session) throw new Error("Entra outra vez para usar a classificação.");
  return { client, userId: data.session.user.id };
}

export async function loadLeaderboard(trailKey: string): Promise<LeaderboardEntry[]> {
  const { client } = await signedInClient();
  const { data, error } = await client
    .from("ghostline_leaderboard")
    .select("user_id, rider_name, best_seconds, sectors, run_date")
    .eq("trail_key", trailKey)
    .order("best_seconds", { ascending: true })
    .limit(50);
  if (error) throw error;
  return parseLeaderboard(data);
}

export async function publishToLeaderboard(trail: Trail, run: Run, riderName: string): Promise<void> {
  const row = leaderboardRow(trail, run, riderName);
  const { client, userId } = await signedInClient();
  const { error } = await client
    .from("ghostline_leaderboard")
    .upsert({ ...row, user_id: userId, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export async function withdrawFromLeaderboard(trailKey: string): Promise<void> {
  const { client, userId } = await signedInClient();
  const { error } = await client
    .from("ghostline_leaderboard")
    .delete()
    .eq("user_id", userId)
    .eq("trail_key", trailKey);
  if (error) throw error;
}
