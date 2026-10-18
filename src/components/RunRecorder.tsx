import { useEffect, useRef, useState } from "react";
import { Circle, Square } from "lucide-react";
import type { Point } from "../types";
import { formatTime } from "../lib/analysis";
import { acceptFix, clearRecording, loadRecording, saveRecording } from "../lib/recorder";

interface Props {
  /** Storage scope of the signed-in rider or guest. */
  scope: string;
  disabled: boolean;
  /** Receives the finished recording; throws to report a problem. */
  onFinish: (points: Point[], label: string) => void;
}

const metersBetween = (a: Point, b: Point) => {
  const rad = Math.PI / 180;
  return Math.hypot(
    (b.lon - a.lon) * rad * 6_371_000 * Math.cos(((a.lat + b.lat) * rad) / 2),
    (b.lat - a.lat) * rad * 6_371_000,
  );
};

/** Record a descent with the phone's GPS, straight into the import flow. */
export function RunRecorder({ scope, disabled, onFinish }: Props) {
  const [points, setPoints] = useState<Point[]>([]);
  const [recording, setRecording] = useState(false);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [recovered, setRecovered] = useState<Point[]>(() => loadRecording(scope));
  const watchId = useRef<number | null>(null);
  const wakeLock = useRef<WakeLockSentinel | null>(null);
  const supported = typeof navigator !== "undefined" && "geolocation" in navigator;

  const releaseWakeLock = () => {
    void wakeLock.current?.release().catch(() => undefined);
    wakeLock.current = null;
  };
  const requestWakeLock = async () => {
    try {
      wakeLock.current = (await navigator.wakeLock?.request("screen")) ?? null;
    } catch {
      // Not every browser allows it; the rider is told to keep the screen on.
    }
  };

  useEffect(() => {
    if (!recording) return;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    // The screen lock is dropped when the tab is hidden; take it back on return.
    const onVisible = () => {
      if (document.visibilityState === "visible") void requestWakeLock();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [recording]);

  useEffect(
    () => () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
      releaseWakeLock();
    },
    [],
  );

  const start = () => {
    setError("");
    setPoints([]);
    clearRecording(scope);
    setRecovered([]);
    void requestWakeLock();
    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        setAccuracy(position.coords.accuracy);
        setPoints((current) => {
          const point = acceptFix(
            {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              altitude: position.coords.altitude,
              accuracy: position.coords.accuracy,
              timestamp: position.timestamp,
            },
            current.at(-1),
          );
          if (!point) return current;
          const next = [...current, point];
          saveRecording(scope, next);
          return next;
        });
      },
      (failure) =>
        setError(
          failure.code === failure.PERMISSION_DENIED
            ? "Sem permissão para usar a localização. Autoriza-a nas definições do browser."
            : "O GPS não respondeu. Vai para céu aberto e tenta outra vez.",
        ),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
    );
    setRecording(true);
  };

  const finish = (track: Point[]) => {
    try {
      const label = `Gravação ${new Date(track[0]?.time ?? Date.now()).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`;
      // The stored copy stays until the run is saved, so a reload while
      // reviewing does not lose the descent.
      onFinish(track, label);
      setRecovered([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível usar esta gravação.");
    }
  };

  const stop = () => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    releaseWakeLock();
    setRecording(false);
    if (points.length < 2) return setError("A gravação tem poucos pontos de GPS. Tenta outra vez.");
    finish(points);
  };

  if (!supported) return null;
  const distance = points.reduce((sum, p, i) => (i ? sum + metersBetween(points[i - 1], p) : 0), 0);
  const elapsed = points.length ? Math.max(0, (now - points[0].time) / 1000) : 0;
  return (
    <div className="run-recorder">
      <div className="run-recorder-head">
        <strong>Gravar com o telemóvel</strong>
        {recording ? (
          <button className="button primary compact recording" onClick={stop}>
            <Square size={14} /> Parar e rever
          </button>
        ) : (
          <button className="button secondary compact" disabled={disabled} onClick={start}>
            <Circle size={14} /> Começar a gravar
          </button>
        )}
      </div>
      {recording ? (
        <div className="run-recorder-live" role="status" aria-live="polite">
          <span><b className="mono">{formatTime(elapsed)}</b>tempo</span>
          <span><b className="mono">{(distance / 1000).toFixed(2)}</b>km</span>
          <span><b className="mono">{points.length}</b>pontos</span>
          <span>
            <b className={`mono ${accuracy !== null && accuracy > 30 ? "lost" : ""}`}>
              {accuracy === null ? "—" : `±${Math.round(accuracy)} m`}
            </b>
            GPS
          </span>
        </div>
      ) : (
        <small className="muted">
          Começa na partida, para na chegada. O ecrã tem de ficar ligado.
        </small>
      )}
      {!recording && recovered.length > 1 && (
        <p className="import-trail-note" role="status">
          Há uma gravação interrompida com {recovered.length} pontos.
          <button className="text-button" onClick={() => finish(recovered)}>Recuperar</button>
          <button className="text-button" onClick={() => { clearRecording(scope); setRecovered([]); }}>Descartar</button>
        </p>
      )}
      {error && <p className="import-quality-note poor" role="alert">{error}</p>}
    </div>
  );
}
