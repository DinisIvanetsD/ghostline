import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CircleAlert, Ghost, Mountain, Timer } from "lucide-react";
import { analyze, formatDelta, formatTime, sectorTimes } from "../lib/analysis";
import { loadPrivateRunShare, type SharedRunSnapshot } from "../lib/runSharing";
import { TrailMap } from "./TrailMap";

export function SharedRunPage({ token }: { token: string }) {
  const [share, setShare] = useState<SharedRunSnapshot | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0.45);
  const [sector, setSector] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    void loadPrivateRunShare(token)
      .then((result) => {
        if (!active) return;
        setShare(result);
        if (!result) setError("This private run link has expired or is not valid.");
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "This shared run could not be opened.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  const current = useMemo(() => share ? analyze(share.run.points) : null, [share]);
  const ghost = useMemo(() => share?.ghost ? analyze(share.ghost.points) : current, [share, current]);
  const runSplits = useMemo(() => share ? sectorTimes(share.run, share.trail) : [], [share]);
  const ghostSplits = useMemo(() => share?.ghost ? sectorTimes(share.ghost, share.trail) : [], [share]);
  const appUrl = new URL(import.meta.env.BASE_URL ?? "/", window.location.origin).toString();

  return (
    <main className="shared-run-shell">
      <header className="shared-run-header">
        <a className="wordmark" href={appUrl} aria-label="Open GHOSTLINE">
          <svg viewBox="0 0 30 30" aria-hidden="true"><path d="M5 24V11L15 4l10 7v13l-5-4-5 4-5-4z" /><path d="M11 12v4m8-4v4" /></svg>
          GHOSTLINE<span className="brand-period">.</span>
        </a>
        <span className="shared-run-label"><Ghost size={14} /> PRIVATE RUN LINK</span>
      </header>
      {loading ? (
        <section className="panel shared-run-message" role="status">Opening the ride…</section>
      ) : error || !share || !current || !ghost ? (
        <section className="panel shared-run-message" role="alert">
          <CircleAlert size={22} />
          <strong>{error || "This run could not be shown."}</strong>
          <span>Ask the rider for a fresh link, or return to your own workspace.</span>
          <a className="button secondary" href={appUrl}><ArrowLeft size={15} /> Open GHOSTLINE</a>
        </section>
      ) : (
        <>
          <section className="shared-run-title">
            <div>
              <span className="eyebrow"><Mountain size={13} /> {share.trail.location || "TRAIL SESSION"}</span>
              <h1>{share.trail.name}</h1>
              <p>{share.run.name} · {share.riderName} · {share.run.date}</p>
            </div>
            <div className="shared-run-clock">
              <span><Timer size={15} /> RUN TIME</span>
              <strong>{formatTime(current.duration)}</strong>
              {share.ghost && <small>{formatDelta(current.duration - ghost.duration)} vs Ghost</small>}
            </div>
          </section>

          <section className="shared-run-map panel" aria-label="Shared run map and sectors">
            <TrailMap
              trail={share.trail}
              current={current}
              ghost={ghost}
              progress={progress}
              sector={sector}
              onProgress={setProgress}
            />
            <div className="shared-run-stats">
              <div><span>Distance</span><strong>{(current.distance / 1000).toFixed(2)} <small>km</small></strong></div>
              <div><span>Average</span><strong>{current.avgSpeed.toFixed(1)} <small>km/h</small></strong></div>
              <div><span>Top speed</span><strong>{current.maxSpeed.toFixed(1)} <small>km/h</small></strong></div>
              <div><span>Descent</span><strong>{Math.round(current.descent)} <small>m</small></strong></div>
            </div>
          </section>

          <section className="panel shared-run-sectors">
            <div className="section-heading"><h2>Sector breakdown</h2><span className="muted">{share.ghost ? "vs Ghost" : "Shared run"}</span></div>
            {runSplits.map((time, index) => {
              const delta = time - (ghostSplits[index] ?? time);
              return (
                <button className={`shared-sector-row ${sector === index ? "selected" : ""}`} key={index} onClick={() => setSector(sector === index ? null : index)}>
                  <span>S{index + 1}</span>
                  <strong>{share.trail.sectorNames[index]}</strong>
                  <span className="mono">{formatTime(time)}</span>
                  <span className={`mono ${share.ghost ? delta > 0.005 ? "lost" : "gained" : "muted"}`}>{share.ghost ? formatDelta(delta) : "—"}</span>
                </button>
              );
            })}
            <p className="shared-run-privacy">Anyone with this unlisted link can view the GPS trace. It expires {new Date(share.expiresAt).toLocaleDateString("en-GB")}.</p>
          </section>
        </>
      )}
      <footer className="shared-run-footer"><a href={appUrl}>GHOSTLINE<span className="accent">.</span></a><span>Chase yourself.</span></footer>
    </main>
  );
}
