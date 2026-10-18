import type { Point } from "../types";
import { cloudRedirectUrl, getSupabaseClient, supabaseConfigured } from "./supabase";

const clientId = import.meta.env.VITE_STRAVA_CLIENT_ID?.trim();
const STATE_KEY = "ghostline.strava.state";

/** Strava import needs cloud accounts (the token exchange runs in an Edge Function). */
export const stravaConfigured = supabaseConfigured && Boolean(clientId && /^\d+$/.test(clientId));

export interface StravaActivity {
  id: number;
  name: string;
  startDate: string;
  distance: number;
  elapsedTime: number;
  sportType: string;
}
export interface StravaStreams {
  name: string;
  startDate: string;
  latlng: unknown;
  time: unknown;
  altitude: unknown;
}

const redirectUri = () => {
  const url = new URL(cloudRedirectUrl());
  url.searchParams.set("strava", "connect");
  return url.toString();
};

/** Send the rider to Strava's consent page; read-only access to their activities. */
export function beginStravaConnect(): void {
  if (!stravaConfigured || !clientId) throw new Error("A importação do Strava não está configurada.");
  const state = crypto.randomUUID();
  sessionStorage.setItem(STATE_KEY, state);
  const url = new URL("https://www.strava.com/oauth/authorize");
  url.search = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri(),
    approval_prompt: "auto",
    scope: "activity:read_all",
    state,
  }).toString();
  window.location.assign(url.toString());
}

/**
 * Read Strava's redirect back to the app. Returns the authorization code when
 * the state matches the one this tab created, and always cleans the URL.
 */
export function readStravaCallback(): { code?: string; error?: string } | null {
  const params = new URLSearchParams(window.location.search);
  if (params.get("strava") !== "connect") return null;
  const expected = sessionStorage.getItem(STATE_KEY);
  sessionStorage.removeItem(STATE_KEY);
  const clean = new URL(window.location.href);
  ["strava", "code", "state", "scope", "error"].forEach((key) => clean.searchParams.delete(key));
  window.history.replaceState(null, "", clean.toString());
  if (params.get("error")) return { error: "O acesso ao Strava não foi autorizado." };
  if (!expected || params.get("state") !== expected) return { error: "Não foi possível verificar a ligação ao Strava. Tenta outra vez." };
  if (!(params.get("scope") ?? "").split(",").some((scope) => scope.startsWith("activity:read")))
    return { error: "O GHOSTLINE precisa de permissão para ler as tuas atividades." };
  const code = params.get("code") ?? "";
  return code ? { code } : { error: "O Strava não devolveu um código de autorização." };
}

async function call<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const client = await getSupabaseClient();
  if (!client) throw new Error("A importação do Strava precisa de uma conta na nuvem configurada.");
  const { data, error } = await client.functions.invoke("strava", { body: { action, ...payload } });
  if (error) {
    const context = (error as { context?: Response }).context;
    const detail = context ? await context.json().catch(() => null) : null;
    throw new Error(detail?.error ?? error.message);
  }
  return data as T;
}

export const stravaStatus = () => call<{ connected: boolean }>("status");
export const finishStravaConnect = (code: string) => call<{ connected: boolean }>("exchange", { code });
export const disconnectStrava = () => call<{ connected: boolean }>("disconnect");
export const listStravaActivities = () => call<StravaActivity[]>("activities");
export const loadStravaStreams = (activityId: number) => call<StravaStreams>("streams", { activityId });

/** Convert Strava latlng/time/altitude streams into timestamped track points. */
export function streamsToPoints(streams: StravaStreams): Point[] {
  const start = Date.parse(streams.startDate);
  const { latlng, time, altitude } = streams;
  if (!Number.isFinite(start) || !Array.isArray(latlng) || !Array.isArray(time) || latlng.length !== time.length)
    throw new Error("Esta atividade do Strava não tem traçado GPS.");
  if (latlng.length < 2) throw new Error("Esta atividade do Strava não tem traçado GPS.");
  if (latlng.length > 25000) throw new Error("Esta atividade do Strava é demasiado longa para importar.");
  const elevations = Array.isArray(altitude) && altitude.length === latlng.length ? altitude : null;
  const points: Point[] = [];
  latlng.forEach((pair, index) => {
    const [lat, lon] = Array.isArray(pair) ? pair : [];
    const offset = time[index];
    if (
      typeof lat !== "number" || typeof lon !== "number" || typeof offset !== "number" ||
      Math.abs(lat) > 90 || Math.abs(lon) > 180 || !Number.isFinite(offset)
    )
      throw new Error("Esta atividade do Strava tem pontos GPS inválidos.");
    const at = start + offset * 1000;
    const previous = points.at(-1)?.time;
    // Same rule as the GPX and FIT parsers: keep the first sample of a
    // repeated second, refuse a clock that runs backwards.
    if (previous !== undefined && at === previous) return;
    if (previous !== undefined && at < previous)
      throw new Error("Esta atividade do Strava tem tempos fora de ordem.");
    const ele = elevations ? Number(elevations[index]) : 0;
    points.push({ lat, lon, ele: Number.isFinite(ele) ? ele : 0, time: at });
  });
  if (points.length < 2) throw new Error("Esta atividade do Strava não tem traçado GPS.");
  return points;
}
