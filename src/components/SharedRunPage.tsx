import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CircleAlert, Ghost, Mountain, Timer } from "lucide-react";
import { analyze, formatDelta, formatTime, sectorTimes, splitLeadIn } from "../lib/analysis";
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
        if (!result) setError("Este link privado expirou ou não é válido.");
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Não foi possível abrir esta run partilhada.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  const current = useMemo(() => share ? analyze(splitLeadIn(share.run, share.trail).course.points) : null, [share]);
  const ghost = useMemo(() => share?.ghost ? analyze(splitLeadIn(share.ghost, share.trail).course.points) : current, [share, current]);
  const runSplits = useMemo(() => share ? sectorTimes(share.run, share.trail) : [], [share]);
  const ghostSplits = useMemo(() => share?.ghost ? sectorTimes(share.ghost, share.trail) : [], [share]);
  const appUrl = new URL(import.meta.env.BASE_URL ?? "/", window.location.origin).toString();

  return (
    <main className="shared-run-shell">
      <header className="shared-run-header">
        <a className="wordmark" href={appUrl} aria-label="Abrir GHOSTLINE">
          <svg viewBox="0 0 30 30" aria-hidden="true"><path d="M5 24V11L15 4l10 7v13l-5-4-5 4-5-4z" /><path d="M11 12v4m8-4v4" /></svg>
          GHOSTLINE<span className="brand-period">.</span>
        </a>
        <span className="shared-run-label"><Ghost size={14} /> LINK PRIVADO DE RUN</span>
      </header>
      {loading ? (
        <section className="panel shared-run-message" role="status">A abrir a run…</section>
      ) : error || !share || !current || !ghost ? (
        <section className="panel shared-run-message" role="alert">
          <CircleAlert size={22} />
          <strong>{error || "Não foi possível mostrar esta run."}</strong>
          <span>Pede um link novo ao rider ou volta ao teu espaço.</span>
          <a className="button secondary" href={appUrl}><ArrowLeft size={15} /> Abrir GHOSTLINE</a>
        </section>
      ) : (
        <>
          <section className="shared-run-title">
            <div>
              <span className="eyebrow"><Mountain size={13} /> {share.trail.location || "SESSÃO NA PISTA"}</span>
              <h1>{share.trail.name}</h1>
              <p>{share.run.name} · {share.riderName} · {share.run.date}</p>
            </div>
            <div className="shared-run-clock">
              <span><Timer size={15} /> TEMPO DA RUN</span>
              <strong>{formatTime(current.duration)}</strong>
              {share.ghost && <small>{formatDelta(current.duration - ghost.duration)} vs Ghost</small>}
            </div>
          </section>

          <section className="shared-run-map panel" aria-label="Mapa e setores da run partilhada">
            <TrailMap
              trail={share.trail}
              current={current}
              ghost={ghost}
              progress={progress}
              sector={sector}
              onProgress={setProgress}
            />
            <div className="shared-run-stats">
              <div><span>Distância</span><strong>{(current.distance / 1000).toFixed(2)} <small>km</small></strong></div>
              <div><span>Média</span><strong>{current.avgSpeed.toFixed(1)} <small>km/h</small></strong></div>
              <div><span>Velocidade máx.</span><strong>{current.maxSpeed.toFixed(1)} <small>km/h</small></strong></div>
              <div><span>Descida</span><strong>{Math.round(current.descent)} <small>m</small></strong></div>
            </div>
          </section>

          <section className="panel shared-run-sectors">
            <div className="section-heading"><h2>Tempos por setor</h2><span className="muted">{share.ghost ? "vs Ghost" : "Run partilhada"}</span></div>
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
            <p className="shared-run-privacy">Quem tiver este link pode ver o traçado GPS. Expira a {new Date(share.expiresAt).toLocaleDateString("pt-PT")}.</p>
          </section>
        </>
      )}
      <footer className="shared-run-footer"><a href={appUrl}>GHOSTLINE<span className="accent">.</span></a><span>Chase yourself.</span></footer>
    </main>
  );
}
