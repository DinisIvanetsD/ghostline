import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  Bike,
  Check,
  ChevronDown,
  Download,
  Flag,
  Ghost,
  History,
  Map,
  Mountain,
  Plus,
  Play,
  Pause,
  Settings,
  Target,
  Timer,
  Trophy,
  X,
} from "lucide-react";
import type { AppData, Run } from "./types";
import {
  analyze,
  formatDelta,
  formatTime,
  personalBest,
  sectorTimes,
  theoreticalBest,
  timeAt,
} from "./lib/analysis";
import {
  loadData,
  saveData,
  downloadData,
  parseBackup,
  readStorageWarning,
} from "./lib/storage";
import { downloadGPX } from "./lib/export";
import { TrailMap } from "./components/TrailMap";
import { TelemetryChart, Progression } from "./components/Charts";
import {
  Garage,
  ProfileSettings,
  TrailManager,
  ImportRun,
} from "./components/Management";

type Page = "analysis" | "history" | "trails" | "garage" | "profile" | "import";
const nav = [
  { id: "analysis", label: "Run analysis", icon: Activity },
  { id: "history", label: "Run history", icon: History },
  { id: "trails", label: "Trails", icon: Map },
  { id: "garage", label: "Bike garage", icon: Bike },
] as const;
export default function App() {
  const [data, setData] = useState<AppData>(loadData),
    [page, setPage] = useState<Page>("analysis"),
    [trailId, setTrailId] = useState(data.trails[0]?.id ?? ""),
    [runId, setRunId] = useState(""),
    [compareId, setCompareId] = useState("pb"),
    [progress, setProgress] = useState(0.43),
    [sector, setSector] = useState<number | null>(null),
    [notice, setNotice] = useState(readStorageWarning),
    [historyQuery, setHistoryQuery] = useState("");
  const [playing, setPlaying] = useState(false);
  const backupInput = useRef<HTMLInputElement>(null);
  const replayPosition = useRef(progress);
  useEffect(() => {
    replayPosition.current = progress;
  }, [progress]);
  const inspectProgress = useCallback((value: number) => {
    setPlaying(false);
    setProgress(value);
  }, []);
  const trail = data.trails.find((t) => t.id === trailId) ?? data.trails[0];
  const runs = useMemo(
    () =>
      data.runs
        .filter((r) => r.trailId === trail?.id)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [data.runs, trail],
  );
  const durations = useMemo(
    () =>
      new globalThis.Map(runs.map((r) => [r.id, analyze(r.points).duration])),
    [runs],
  );
  const run = runs.find((r) => r.id === runId) ?? runs[0];
  const pb = useMemo(
    () => personalBest(data.runs, trail?.id ?? ""),
    [data.runs, trail],
  );
  const compare =
    compareId === "pb" ? pb : (runs.find((r) => r.id === compareId) ?? pb);
  const current = useMemo(() => (run ? analyze(run.points) : null), [run]);
  const ghost = useMemo(
    () => (compare ? analyze(compare.points) : null),
    [compare],
  );
  useEffect(() => {
    if (!playing || !current) return;
    let elapsed = timeAt(current, replayPosition.current);
    const interval = window.setInterval(() => {
      elapsed = Math.min(current.duration, elapsed + 0.2);
      setProgress(() => {
        const index = current.samples.findIndex((p) => p.time >= elapsed);
        if (index <= 0) return index === 0 ? 0 : 1;
        const a = current.samples[index - 1],
          b = current.samples[index];
        return (
          a.fraction +
          ((b.fraction - a.fraction) * (elapsed - a.time)) / (b.time - a.time)
        );
      });
      if (elapsed >= current.duration) setPlaying(false);
    }, 50);
    return () => clearInterval(interval);
  }, [playing, current]);
  const splits = useMemo(
    () => (run && trail ? sectorTimes(run, trail) : []),
    [run, trail],
  );
  const ghostSplits = useMemo(
    () => (compare && trail ? sectorTimes(compare, trail) : []),
    [compare, trail],
  );
  const theory = useMemo(
    () => (trail ? theoreticalBest(runs, trail) : null),
    [runs, trail],
  );
  const boundaries = trail ? [0, ...trail.boundaries, 1] : [0, 1];
  const deltas = splits.map((s, i) => s - ghostSplits[i]);
  const worst = deltas.length ? deltas.indexOf(Math.max(...deltas)) : 0;
  const update = (next: AppData) => {
    try {
      saveData(next);
      setData(next);
      setNotice("Changes saved on this device.");
      return true;
    } catch (error) {
      setNotice(
        error instanceof Error && error.message.startsWith("Invalid GHOSTLINE")
          ? error.message
          : "Device storage is full or unavailable. Export a backup and free space before saving.",
      );
      return false;
    }
  };
  const selectTrail = (id: string) => {
    setTrailId(id);
    setRunId("");
    setCompareId("pb");
    setSector(null);
    setPlaying(false);
  };
  const selectRun = (r: Run) => {
    selectTrail(r.trailId);
    setRunId(r.id);
    setPage("analysis");
  };
  const deleteRun = (r: Run) => {
    if (
      window.confirm(
        `Delete ${r.name}? Personal and sector bests will be recalculated.`,
      )
    )
      update({
        ...data,
        demo: false,
        runs: data.runs.filter((x) => x.id !== r.id),
      });
  };
  const names: Record<Page, string> = {
    analysis: "Run analysis",
    history: "Run history",
    trails: "Your trails",
    garage: "Bike garage",
    profile: "Rider profile",
    import: "Import a run",
  };
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          href="#analysis"
          className="wordmark"
          onClick={() => setPage("analysis")}
          aria-label="GHOSTLINE home"
        >
          <svg viewBox="0 0 30 30" aria-hidden="true">
            <path d="M5 24V11L15 4l10 7v13l-5-4-5 4-5-4z" />
            <path d="M11 12v4m8-4v4" />
          </svg>
          GHOSTLINE<span className="brand-period">.</span>
        </a>
        <p className="brand-tagline">Chase yourself.</p>
        <div className="nav-caption">THE WORKSPACE</div>
        <nav aria-label="Main navigation">
          {nav.map((n) => (
            <button
              key={n.id}
              className={page === n.id ? "nav-item active" : "nav-item"}
              onClick={() => setPage(n.id)}
            >
              <n.icon size={19} />
              <span>{n.label}</span>
              {n.id === "analysis" && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="ride-loop">
            <Mountain size={31} />
            <p>
              {data.trails.length === 1
                ? "One trail."
                : `${data.trails.length} trails.`}
              <br />A faster you.
            </p>
            <span>RIDE. REVIEW. REPEAT.</span>
          </div>
          <button
            className={
              page === "profile" ? "profile-link active" : "profile-link"
            }
            onClick={() => setPage("profile")}
          >
            <span className="avatar">
              {data.profile.name
                .split(" ")
                .map((s) => s[0])
                .slice(0, 2)
                .join("")}
            </span>
            <span>
              <strong>{data.profile.name}</strong>
              <small>{data.demo ? "Demo rider" : "Local rider"}</small>
            </span>
            <Settings size={16} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span> <strong>{names[page]}</strong>
          </div>
          <div className="top-actions">
            <span className="device-state">
              <i />
              On-device workspace
            </span>
            <button
              className="button primary"
              onClick={() => setPage("import")}
            >
              <Plus size={16} />
              Import run
            </button>
          </div>
        </header>
        <main>
          {notice && (
            <div className="notice" role="status">
              <Check size={16} />
              {notice}
              <button
                aria-label="Dismiss notification"
                onClick={() => setNotice("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {(page === "analysis" || page === "history") && (
            <>
              <div className="page-heading">
                <div>
                  <h1>
                    {page === "analysis"
                      ? "Find your missing seconds."
                      : "Progress is a pattern."}
                  </h1>
                  <p>
                    {page === "analysis"
                      ? "Your last run. Your fastest self. The time in between."
                      : "Every attempt, every improvement. All in one place."}
                  </p>
                </div>
                {run?.synthetic && (
                  <span className="demo-label">
                    DEMO SESSION <i />
                  </span>
                )}
              </div>
              <div className="trail-toolbar">
                <div className="trail-identity">
                  <span className="trail-symbol">
                    <Mountain size={23} />
                  </span>
                  <div>
                    <label className="trail-select">
                      <select
                        aria-label="Selected trail"
                        value={trail?.id ?? ""}
                        onChange={(e) => selectTrail(e.target.value)}
                      >
                        {data.trails.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={18} />
                    </label>
                    <span className="trail-location">
                      {trail?.location ?? "Create your first trail"}{" "}
                      <span>•</span> {trail?.difficulty} <span>•</span>{" "}
                      {runs.length} runs
                    </span>
                  </div>
                </div>
                <button
                  className="button secondary compact"
                  onClick={() => setPage("trails")}
                >
                  Manage sectors <ArrowRight size={15} />
                </button>
              </div>
            </>
          )}
          {page === "analysis" &&
            (!run ||
            !current ||
            !ghost ||
            !trail ||
            !compare ||
            !pb ||
            !theory ? (
              <section className="panel empty-state">
                <Ghost size={40} />
                <h2>Your Ghost starts with one run.</h2>
                <p>
                  Create a trail and import a timestamped GPX to start finding
                  time.
                </p>
                <button
                  className="button primary"
                  onClick={() => setPage("import")}
                >
                  Import your first run
                </button>
              </section>
            ) : (
              <>
                <div className="comparison-toolbar">
                  <label className="run-picker">
                    <span>
                      <i className="dot current" />
                      CURRENT RUN
                    </span>
                    <select
                      aria-label="Current run"
                      value={run.id}
                      onChange={(e) => {
                        setRunId(e.target.value);
                        setSector(null);
                        setPlaying(false);
                      }}
                    >
                      {runs.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} · {formatTime(durations.get(r.id) ?? 0)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span className="versus">VS</span>
                  <label className="run-picker">
                    <span>
                      <Ghost size={14} />
                      REFERENCE RUN
                    </span>
                    <select
                      aria-label="Reference run"
                      value={compareId}
                      onChange={(e) => setCompareId(e.target.value)}
                    >
                      <option value="pb">Your Ghost · Personal best</option>
                      {runs.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} · {formatTime(durations.get(r.id) ?? 0)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span className="session-date">
                    {new Date(run.date).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </span>
                </div>
                <div className="analysis-grid">
                  <div className="map-column">
                    <TrailMap
                      trail={trail}
                      current={current}
                      ghost={ghost}
                      progress={progress}
                      sector={sector}
                      onProgress={inspectProgress}
                    />
                    <div className="telemetry-stats">
                      <div>
                        <span>Distance</span>
                        <strong>
                          {(current.distance / 1000).toFixed(2)}
                          <small>km</small>
                        </strong>
                      </div>
                      <div>
                        <span>Avg. speed</span>
                        <strong>
                          {current.avgSpeed.toFixed(1)}
                          <small>km/h</small>
                        </strong>
                      </div>
                      <div>
                        <span>Top speed</span>
                        <strong>
                          {current.maxSpeed.toFixed(1)}
                          <small>km/h</small>
                        </strong>
                      </div>
                      <div>
                        <span>Descent</span>
                        <strong>
                          {Math.round(current.descent)}
                          <small>m</small>
                        </strong>
                      </div>
                    </div>
                  </div>
                  <div className="timing-column">
                    <section className="timing-panel">
                      <div className="timing-title">
                        <h2>Against the Ghost</h2>
                        <Ghost size={20} />
                      </div>
                      <div className="run-time">
                        {formatTime(current.duration)}
                      </div>
                      <div className="time-comparison">
                        <span
                          className={
                            current.duration - ghost.duration > 0.005
                              ? "lost"
                              : "gained"
                          }
                        >
                          {formatDelta(current.duration - ghost.duration)}
                          <small>
                            {" "}
                            to{" "}
                            {compareId === "pb" ? "personal best" : "reference"}
                          </small>
                        </span>
                        {run.id === pb.id && (
                          <span className="pb-badge">
                            <Trophy size={12} />
                            PB
                          </span>
                        )}
                      </div>
                      <div className="reference-time">
                        <span>
                          <Flag size={14} />
                          {compareId === "pb" ? "PERSONAL BEST" : "REFERENCE"}
                        </span>
                        <strong>{formatTime(ghost.duration)}</strong>
                      </div>
                    </section>
                    <section className="sector-panel">
                      <div className="section-heading">
                        <h2>Sector breakdown</h2>
                        <span className="muted">Δ seconds</span>
                      </div>
                      <div className="sector-rows">
                        {splits.map((s, i) => (
                          <button
                            key={i}
                            className={`sector-row ${sector === i ? "selected" : ""}`}
                            onClick={() => {
                              setSector(sector === i ? null : i);
                              inspectProgress(
                                (boundaries[i] + boundaries[i + 1]) / 2,
                              );
                            }}
                          >
                            <span className="sector-index">S{i + 1}</span>
                            <span className="sector-name">
                              {trail.sectorNames[i] ?? `Sector ${i + 1}`}
                              <span className="delta-track">
                                <i
                                  className={
                                    deltas[i] > 0.005
                                      ? "lost-bar"
                                      : "gained-bar"
                                  }
                                  style={{
                                    width: `${Math.max(3, (Math.abs(deltas[i]) / Math.max(0.1, ...deltas.map(Math.abs))) * 100)}%`,
                                  }}
                                />
                              </span>
                            </span>
                            <span className="sector-time">{formatTime(s)}</span>
                            <strong
                              className={deltas[i] > 0.005 ? "lost" : "gained"}
                            >
                              {formatDelta(deltas[i])}
                            </strong>
                          </button>
                        ))}
                      </div>
                      <div className="sector-footnote">
                        Select a sector to inspect it on the map.
                      </div>
                    </section>
                    <section className="theory-panel">
                      <div>
                        <span>
                          <Target size={15} />
                          THEORETICAL BEST
                        </span>
                        <strong>{formatTime(theory.total)}</strong>
                      </div>
                      <p>
                        Your fastest sectors. One possible run.
                        <br />
                        <b>
                          {Math.max(0, current.duration - theory.total).toFixed(
                            2,
                          )}
                          s
                        </b>{" "}
                        waiting to be found.
                      </p>
                    </section>
                  </div>
                </div>
                <div className="insight-strip">
                  <span className="insight-icon">
                    <ArrowDownRight size={22} />
                  </span>
                  <div>
                    <strong>
                      {Math.max(...deltas) > 0.01
                        ? `${trail.sectorNames[worst] ?? `Sector ${worst + 1}`} is where to look.`
                        : run.id === pb.id
                          ? "This is the run to chase."
                          : "You matched your reference."}
                    </strong>
                    <p>
                      {Math.max(...deltas) > 0.01
                        ? `You lost ${deltas[worst].toFixed(2)}s in sector ${worst + 1} against this reference. Inspect speed through this section before your next run.`
                        : `Your theoretical best is ${formatTime(theory.total)}. Compare individual sectors to see what is still possible.`}
                    </p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => {
                      setSector(worst);
                      inspectProgress(
                        (boundaries[worst] + boundaries[worst + 1]) / 2,
                      );
                    }}
                  >
                    Inspect sector <ArrowRight size={16} />
                  </button>
                </div>
                <div className="replay-toolbar">
                  <span>Two riders. One clock.</span>
                  <button
                    className="text-button"
                    onClick={() => {
                      if (progress >= 1) setProgress(0);
                      setPlaying(!playing || progress >= 1);
                    }}
                  >
                    {playing && progress < 1 ? (
                      <Pause size={15} />
                    ) : (
                      <Play size={15} />
                    )}{" "}
                    {playing && progress < 1
                      ? "Pause replay"
                      : "Replay run · 4×"}
                  </button>
                </div>
                <TelemetryChart
                  current={current}
                  ghost={ghost}
                  trail={trail}
                  progress={progress}
                  onProgress={inspectProgress}
                />
                <div className="analysis-footer">
                  <span>
                    <Timer size={14} />
                    Comparisons aligned by normalized GPS distance. GPS accuracy
                    affects sector precision.
                  </span>
                  <button
                    className="text-button"
                    onClick={() => setPage("history")}
                  >
                    View all {runs.length} runs <ArrowRight size={15} />
                  </button>
                </div>
              </>
            ))}
          {page === "history" && (
            <>
              <Progression runs={runs} onSelect={selectRun} />
              <section className="panel history-panel">
                <div className="section-heading">
                  <h2>The run log</h2>
                  <input
                    aria-label="Search runs"
                    placeholder="Search runs…"
                    value={historyQuery}
                    onChange={(e) => setHistoryQuery(e.target.value)}
                  />
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Run</th>
                        <th>Date</th>
                        <th>Bike</th>
                        <th>Time</th>
                        <th>To Ghost</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {runs
                        .filter((r) =>
                          r.name
                            .toLowerCase()
                            .includes(historyQuery.toLowerCase()),
                        )
                        .map((r) => {
                          const t = analyze(r.points);
                          const delta =
                            t.duration - (pb ? analyze(pb.points).duration : 0);
                          return (
                            <tr key={r.id}>
                              <td>
                                <strong>{r.name}</strong>
                                {r.id === pb?.id && (
                                  <span className="pb-badge">
                                    <Trophy size={12} />
                                    PB
                                  </span>
                                )}
                              </td>
                              <td>
                                {new Date(r.date).toLocaleDateString("en-GB", {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                })}
                              </td>
                              <td>
                                {data.bikes.find((b) => b.id === r.bikeId)
                                  ?.name ?? "Unassigned"}
                              </td>
                              <td className="mono">{formatTime(t.duration)}</td>
                              <td
                                className={`mono ${delta > 0.005 ? "lost" : "gained"}`}
                              >
                                {formatDelta(delta)}
                              </td>
                              <td>
                                <button
                                  className="text-button"
                                  onClick={() => selectRun(r)}
                                >
                                  Analyze <ArrowRight size={14} />
                                </button>
                                <button
                                  className="delete-button"
                                  aria-label={`Delete ${r.name}`}
                                  onClick={() => deleteRun(r)}
                                >
                                  <X size={15} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                  {!runs.filter((r) =>
                    r.name.toLowerCase().includes(historyQuery.toLowerCase()),
                  ).length && (
                    <p className="empty-state">
                      No runs found. Try another search or import a run.
                    </p>
                  )}
                </div>
              </section>
              {theory && runs.length > 0 && (
                <section className="panel best-sectors">
                  <div className="section-heading">
                    <h2>Your ultimate run, assembled.</h2>
                    <span className="mono accent">
                      {formatTime(theory.total)}
                    </span>
                  </div>
                  <div className="best-sector-grid">
                    {theory.sectors.map((s, i) => (
                      <div key={i}>
                        <span>
                          S{i + 1} · {trail?.sectorNames[i]}
                        </span>
                        <strong>
                          {Number.isFinite(s.time) ? formatTime(s.time) : "—"}
                        </strong>
                        <button
                          className="text-button"
                          onClick={() => {
                            const source = runs.find((r) => r.id === s.runId);
                            if (source) selectRun(source);
                          }}
                        >
                          {runs.find((r) => r.id === s.runId)?.name ??
                            "No run yet"}{" "}
                          <ArrowRight size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
          {page === "garage" && <Garage data={data} onChange={update} />}
          {page === "trails" && (
            <TrailManager
              data={data}
              onChange={update}
              onSelect={(id) => {
                selectTrail(id);
                setPage("analysis");
              }}
            />
          )}
          {page === "profile" && (
            <>
              <ProfileSettings
                key={JSON.stringify(data.profile)}
                data={data}
                onChange={update}
              />
              <section className="panel data-panel">
                <h2>Your data stays yours.</h2>
                <p>
                  Profiles, bikes, trails and runs are stored in this browser.
                  Export a backup before clearing browser data.
                </p>
                <div className="form-actions">
                  <button
                    className="button secondary"
                    onClick={() => downloadData(data)}
                  >
                    <Download size={16} />
                    Export all data
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => backupInput.current?.click()}
                  >
                    Restore backup
                  </button>
                </div>
                <input
                  hidden
                  type="file"
                  accept=".json,application/json"
                  ref={backupInput}
                  onChange={async (e) => {
                    const input = e.currentTarget;
                    const file = input.files?.[0];
                    if (!file) return;
                    try {
                      if (file.size > 25 * 1024 * 1024)
                        throw new Error("Backup must be smaller than 25 MB.");
                      const restored = parseBackup(await file.text());
                      if (
                        window.confirm(
                          "Replace this device workspace with the backup? Export your current data first if you need to keep it.",
                        )
                      ) {
                        if (update(restored)) {
                          selectTrail(restored.trails[0]?.id ?? "");
                          setNotice("Backup restored on this device.");
                        }
                      }
                    } catch (error) {
                      setNotice(
                        error instanceof Error
                          ? error.message
                          : "Could not restore this backup.",
                      );
                    }
                    input.value = "";
                  }}
                />
              </section>
            </>
          )}
          {page === "import" && (
            <>
              <div className="import-guide">
                <div>
                  <h1>Your next Ghost starts here.</h1>
                  <p>One complete descent per file. No pauses, no lift ride.</p>
                </div>
                {data.runs.some((r) => r.synthetic) && (
                  <button
                    className="button secondary"
                    onClick={() =>
                      downloadGPX(data.runs.find((r) => r.synthetic)!)
                    }
                  >
                    <Download size={16} />
                    Try a sample GPX
                  </button>
                )}
              </div>
              <ImportRun
                data={data}
                onChange={update}
                onImported={(tid, rid) => {
                  selectTrail(tid);
                  setRunId(rid);
                  setPage("analysis");
                }}
              />
            </>
          )}
          <footer className="app-footer">
            <span>
              GHOSTLINE<span className="accent">.</span>{" "}
              <span>Chase yourself.</span>
            </span>
            <span>
              {data.runs.some((r) => r.synthetic)
                ? "Includes synthetic demo GPS · Braga, Portugal"
                : "Local workspace"}{" "}
              <span className="footer-divider">/</span> RIDE → ANALYZE → SEND
              AGAIN
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
