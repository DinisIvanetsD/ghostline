// Strava bridge for GHOSTLINE. The OAuth client secret and rider tokens stay
// here; the browser only receives activity summaries and GPS streams.
// Deploy: supabase functions deploy strava
// Secrets: supabase secrets set STRAVA_CLIENT_ID=... STRAVA_CLIENT_SECRET=...
import { createClient } from "jsr:@supabase/supabase-js@2";

const STRAVA = "https://www.strava.com";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

interface TokenRow {
  user_id: string;
  athlete_id: number;
  access_token: string;
  refresh_token: string;
  expires_at: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const clientId = Deno.env.get("STRAVA_CLIENT_ID");
  const clientSecret = Deno.env.get("STRAVA_CLIENT_SECRET");
  if (!clientId || !clientSecret) return json({ error: "Strava is not configured on the server." }, 501);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth } = await admin.auth.getUser(jwt);
  const user = auth?.user;
  if (!user) return json({ error: "Sign in again to use Strava." }, 401);

  const tokens = admin.from("ghostline_strava_tokens");
  const save = (row: Omit<TokenRow, "user_id">) =>
    tokens.upsert({ ...row, user_id: user.id, updated_at: new Date().toISOString() });
  const exchange = async (params: Record<string, string>) => {
    const response = await fetch(`${STRAVA}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...params }),
    });
    if (!response.ok) throw new Error(`Strava refused the connection (${response.status}).`);
    return await response.json();
  };
  const accessToken = async (): Promise<string> => {
    const { data, error } = await tokens.select("*").eq("user_id", user.id).maybeSingle<TokenRow>();
    if (error) throw error;
    if (!data) throw new Error("Connect Strava first.");
    if (Date.parse(data.expires_at) - Date.now() > 60_000) return data.access_token;
    const fresh = await exchange({ grant_type: "refresh_token", refresh_token: data.refresh_token });
    await save({
      athlete_id: data.athlete_id,
      access_token: fresh.access_token,
      refresh_token: fresh.refresh_token,
      expires_at: new Date(fresh.expires_at * 1000).toISOString(),
    });
    return fresh.access_token;
  };
  const api = async (path: string) => {
    const response = await fetch(`${STRAVA}/api/v3${path}`, {
      headers: { Authorization: `Bearer ${await accessToken()}` },
    });
    if (response.status === 429) throw new Error("Strava rate limit reached. Try again in a few minutes.");
    if (!response.ok) throw new Error(`Strava request failed (${response.status}).`);
    return await response.json();
  };

  try {
    const body = await req.json().catch(() => ({}));
    switch (body.action) {
      case "status": {
        const { data } = await tokens.select("athlete_id").eq("user_id", user.id).maybeSingle();
        return json({ connected: Boolean(data) });
      }
      case "exchange": {
        if (typeof body.code !== "string" || !/^[A-Za-z0-9]{10,80}$/.test(body.code))
          return json({ error: "Invalid Strava authorization code." }, 400);
        const granted = await exchange({ grant_type: "authorization_code", code: body.code });
        const { error } = await save({
          athlete_id: granted.athlete?.id ?? 0,
          access_token: granted.access_token,
          refresh_token: granted.refresh_token,
          expires_at: new Date(granted.expires_at * 1000).toISOString(),
        });
        if (error) throw error;
        return json({ connected: true });
      }
      case "activities": {
        const activities = await api("/athlete/activities?per_page=30");
        return json(
          (activities as Array<Record<string, unknown>>)
            .filter((activity) => activity.start_latlng && (activity.start_latlng as unknown[]).length === 2)
            .map((activity) => ({
              id: activity.id,
              name: activity.name,
              startDate: activity.start_date,
              distance: activity.distance,
              elapsedTime: activity.elapsed_time,
              sportType: activity.sport_type,
            })),
        );
      }
      case "streams": {
        const id = Number(body.activityId);
        if (!Number.isSafeInteger(id) || id <= 0) return json({ error: "Invalid activity." }, 400);
        const activity = await api(`/activities/${id}`);
        const streams = await api(`/activities/${id}/streams?keys=latlng,time,altitude&key_by_type=true`);
        return json({
          name: activity.name,
          startDate: activity.start_date,
          latlng: streams.latlng?.data ?? [],
          time: streams.time?.data ?? [],
          altitude: streams.altitude?.data ?? [],
        });
      }
      case "disconnect": {
        try {
          await fetch(`${STRAVA}/oauth/deauthorize`, {
            method: "POST",
            headers: { Authorization: `Bearer ${await accessToken()}` },
          });
        } catch {
          // Removing our copy of the tokens is what matters to the rider.
        }
        await tokens.delete().eq("user_id", user.id);
        return json({ connected: false });
      }
      default:
        return json({ error: "Unknown action." }, 400);
    }
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Strava request failed." }, 502);
  }
});
