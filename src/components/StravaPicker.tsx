import { useEffect, useState } from "react";
import { Link2, Unlink } from "lucide-react";
import { formatTime } from "../lib/analysis";
import {
  beginStravaConnect,
  disconnectStrava,
  listStravaActivities,
  stravaConfigured,
  stravaStatus,
  type StravaActivity,
} from "../lib/strava";

interface Props {
  cloud: boolean;
  disabled: boolean;
  onPick: (activity: StravaActivity) => void;
}

/** Import a ride straight from Strava instead of exporting a GPX file. */
export function StravaPicker({ cloud, disabled, onPick }: Props) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [activities, setActivities] = useState<StravaActivity[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const available = stravaConfigured && cloud;
  useEffect(() => {
    if (!available) return;
    let active = true;
    stravaStatus()
      .then((status) => active && setConnected(status.connected))
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "O Strava está indisponível.");
      });
    return () => {
      active = false;
    };
  }, [available]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "O Strava não respondeu.");
    } finally {
      setBusy(false);
    }
  };
  if (!stravaConfigured) return null;
  return (
    <div className="strava-picker">
      <div className="strava-picker-head">
        <strong>Strava</strong>
        {!cloud ? (
          <span className="muted">Entra com uma conta na nuvem para importar do Strava.</span>
        ) : connected === false ? (
          <button className="button secondary compact" disabled={busy} onClick={() => void run(async () => beginStravaConnect())}>
            <Link2 size={14} /> Ligar Strava
          </button>
        ) : connected ? (
          <span className="row-actions">
            <button
              className="button secondary compact"
              disabled={busy || disabled}
              onClick={() => void run(async () => setActivities(await listStravaActivities()))}
            >
              {activities ? "Atualizar atividades" : "Ver atividades recentes"}
            </button>
            <button
              className="button secondary compact"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await disconnectStrava();
                  setConnected(false);
                  setActivities(null);
                })
              }
            >
              <Unlink size={14} /> Desligar
            </button>
          </span>
        ) : (
          <span className="muted" role="status">A verificar ligação…</span>
        )}
      </div>
      {error && <p className="import-quality-note poor" role="alert">{error}</p>}
      {activities && (
        <ul className="strava-activities">
          {activities.length === 0 && <li className="muted">Não há atividades com GPS no teu Strava recente.</li>}
          {activities.map((activity) => (
            <li key={activity.id}>
              <button type="button" disabled={disabled} onClick={() => onPick(activity)}>
                <span>
                  {activity.name}
                  <small className="muted">
                    {new Date(activity.startDate).toLocaleDateString("pt-PT", { day: "numeric", month: "short" })} ·{" "}
                    {activity.sportType}
                  </small>
                </span>
                <span className="mono">
                  {(activity.distance / 1000).toFixed(2)} km · {formatTime(activity.elapsedTime)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
