import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  Bike,
  Check,
  Clapperboard,
  ChevronDown,
  CircleAlert,
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
  Share2,
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
  validateData,
} from "./lib/storage";
import { downloadGPX } from "./lib/export";
import { progressionInsights } from "./lib/progressionInsights";
import { cleanTrack, MAX_BELIEVABLE_SPEED_KMH } from "./lib/gpsQuality";
import { TrailMap } from "./components/TrailMap";
import { TelemetryChart, Progression } from "./components/Charts";
import { AuthScreen } from "./components/AuthScreen";
import { getSession, signOut, type AuthSession } from "./lib/auth";
import { createWorkspaceCloudSync, mergeWorkspaceRecords } from "./lib/cloudSync";
import { getSupabaseClient, supabaseConfigured } from "./lib/supabase";
import { createPrivateRunShare } from "./lib/runSharing";
import { SharedRunPage } from "./components/SharedRunPage";

const Garage = lazy(() => import("./components/Management").then((module) => ({ default: module.Garage })));
const ProfileSettings = lazy(() => import("./components/Management").then((module) => ({ default: module.ProfileSettings })));
const TrailManager = lazy(() => import("./components/Management").then((module) => ({ default: module.TrailManager })));
const ImportRun = lazy(() => import("./components/Management").then((module) => ({ default: module.ImportRun })));
const VideoLab = lazy(() => import("./components/VideoLab").then((module) => ({ default: module.VideoLab })));
const pageLoading = <div className="panel page-loading" role="status">Opening rider tools…</div>;

type Page =
  | "analysis"
  | "history"
  | "trails"
  | "garage"
  | "profile"
  | "import"
  | "video";

function readSharedRunToken(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.hash.slice(1)).get("share") ?? "";
}

const nav = [
  { id: "analysis", label: "Run analysis", icon: Activity },
  { id: "history", label: "Run history", icon: History },
  { id: "video", label: "Video lab", icon: Clapperboard },
  { id: "trails", label: "Trails", icon: Map },
  { id: "garage", label: "Bike garage", icon: Bike },
] as const;
export default function App() {
  const requiresAuth = import.meta.env.PROD || supabaseConfigured;
  const cloudSync = useMemo(() => createWorkspaceCloudSync<AppData>(), []);
  const cloudWriteQueue = useRef<Promise<void>>(Promise.resolve());
  const [session, setSession] = useState<AuthSession | null>(() =>
    supabaseConfigured ? null : getSession(),
  );
  const [data, setData] = useState<AppData>(() => loadData(getSession()?.userId)),
    [page, setPage] = useState<Page>("analysis"),
    [trailId, setTrailId] = useState(data.trails[0]?.id ?? ""),
    [runId, setRunId] = useState(""),
    [compareId, setCompareId] = useState("pb"),
    [progress, setProgress] = useState(0.43),
    [sector, setSector] = useState<number | null>(null),
    [notice, setNotice] = useState(readStorageWarning),
    [historyQuery, setHistoryQuery] = useState("");
  const [playing, setPlaying] = useState(false);
  const [sharedToken, setSharedToken] = useState(readSharedRunToken);
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const backupInput = useRef<HTMLInputElement>(null);
  const replayPosition = useRef(progress);
  useEffect(() => {
    replayPosition.current = progress;
  }, [progress]);
  useEffect(() => {
    const updateConnection = () => setOnline(navigator.onLine);
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    return () => {
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
    };
  }, []);
  useEffect(() => {
    const updateShareRoute = () => setSharedToken(readSharedRunToken());
    window.addEventListener("hashchange", updateShareRoute);
    return () => window.removeEventListener("hashchange", updateShareRoute);
  }, []);
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
  const runQuality = useMemo(
    () => (run ? cleanTrack(run.points) : null),
    [run],
  );
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
  const progression = useMemo(
    () => progressionInsights(runs, { trail, recentWindow: 5 }),
    [runs, trail],
  );
  const historyRuns = useMemo(
    () => runs.filter((item) => item.name.toLowerCase().includes(historyQuery.toLowerCase())),
    [runs, historyQuery],
  );
  const boundaries = trail ? [0, ...trail.boundaries, 1] : [0, 1];
  const deltas = splits.map((s, i) => s - ghostSplits[i]);
  const worst = deltas.length ? deltas.indexOf(Math.max(...deltas)) : 0;
  const update = (next: AppData) => {
    try {
      saveData(next, session?.userId);
      setData(next);
      if (session?.provider === "supabase" && supabaseConfigured) {
        setNotice("Saved on this device · syncing to your account…");
        cloudWriteQueue.current = cloudWriteQueue.current
          .catch(() => undefined)
          .then(async () => {
            const client = await getSupabaseClient();
            if (!client) throw new Error("Cloud sync is not configured.");
            const { data: auth } = await client.auth.getSession();
            if (!auth.session) throw new Error("Your cloud session expired. Sign in again to sync.");
            await cloudSync.push(auth.session.access_token, session.userId, next);
            setNotice("Saved on this device and synced to your account.");
          })
          .catch((error: unknown) => {
            setNotice(error instanceof Error ? `Saved on this device · cloud sync failed: ${error.message}` : "Saved on this device · cloud sync failed.");
          });
      } else {
        setNotice("Changes saved on this device.");
      }
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
  const authenticate = useCallback(async (nextSession: AuthSession) => {
    let local = loadData(nextSession.userId);
    if (local.demo) {
      const previousDeviceWorkspace = loadData();
      if (!previousDeviceWorkspace.demo) local = previousDeviceWorkspace;
    }
    let nextData = local.demo
      ? { ...local, demo: false, profile: { ...local.profile, name: nextSession.name, email: nextSession.email } }
      : { ...local, demo: false, profile: { ...local.profile, name: nextSession.name || local.profile.name, email: nextSession.email || local.profile.email } };
    let cloudWarning = "";
    try {
      if (nextSession.provider === "supabase" && supabaseConfigured) {
        const client = await getSupabaseClient();
        if (!client) throw new Error("Cloud sync is not configured.");
        const { data: auth } = await client.auth.getSession();
        if (!auth.session) throw new Error("The account session is no longer available.");
        const remote = await cloudSync.pull(auth.session.access_token, nextSession.userId);
        if (remote) {
          const checked = validateData(remote.data);
          nextData = mergeWorkspaceRecords(nextData, checked);
        }
        await cloudSync.push(auth.session.access_token, nextSession.userId, nextData);
      }
    } catch (error) {
      cloudWarning = error instanceof Error ? `Signed in; cloud sync needs attention: ${error.message}` : "Signed in; cloud sync needs attention.";
    }
    try {
      saveData(nextData, nextSession.userId);
      setData(nextData);
      setSession(nextSession);
      setPage("analysis");
      setNotice(cloudWarning || (nextSession.provider === "supabase" ? "Your workspace is synced with your account." : "Your local rider workspace is ready."));
    } catch {
      setNotice("Could not open your rider workspace on this device.");
    }
  }, [cloudSync]);
  const logout = async () => {
    try {
      if (session?.provider === "supabase" && supabaseConfigured) {
        const client = await getSupabaseClient();
        if (!client) throw new Error("Cloud sync is not configured.");
        const { error } = await client.auth.signOut();
        if (error) throw error;
      }
    } catch (error) {
      setNotice(error instanceof Error ? `Could not finish cloud sign-out: ${error.message}` : "Could not finish cloud sign-out.");
    } finally {
      signOut();
      setSession(null);
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
  const shareRun = async (r: Run) => {
    if (session?.provider !== "supabase") {
      setNotice("Sign in with a configured cloud account to create a private run link.");
      return;
    }
    const sharedTrail = data.trails.find((item) => item.id === r.trailId);
    if (!sharedTrail) return setNotice("Could not find the trail for this run.");
    if (!window.confirm("Anyone with this unlisted link can view the GPS trace. The link expires in 7 days. Create it?")) return;
    try {
      const best = personalBest(data.runs, r.trailId);
      const ghostRun = best && best.id !== r.id ? best : null;
      const url = await createPrivateRunShare(data.profile.name, sharedTrail, r, ghostRun);
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url);
      else window.prompt("Copy this private run link", url);
      setNotice("Private run link copied. It expires in 7 days.");
    } catch (error) {
      setNotice(error instanceof Error ? `Could not create the private link: ${error.message}` : "Could not create the private link.");
    }
  };
  const names: Record<Page, string> = {
    analysis: "Run analysis",
    history: "Run history",
    trails: "Your trails",
    garage: "Bike garage",
    profile: "Rider profile",
    import: "Import a run",
    video: "Video lab",
  };
  if (sharedToken) return <SharedRunPage token={sharedToken} />;
  if (requiresAuth && !session) {
    return <AuthScreen onAuthenticated={authenticate} />;
  }
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
              <small>{session ? "Signed-in rider" : data.demo ? "Demo rider" : "Local rider"}</small>
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
            <span className={`device-state ${online ? "" : "offline"}`} role="status">
              <i />
              {!online
                ? "Offline · changes stay on this device"
                : session?.provider === "supabase"
                  ? "Cloud account · synced workspace"
                  : "On-device workspace"}
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
                {data.demo && run?.synthetic && (
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
                          {current.maxSpeed > MAX_BELIEVABLE_SPEED_KMH
                            ? "—"
                            : current.maxSpeed.toFixed(1)}
                          <small>
                            {current.maxSpeed > MAX_BELIEVABLE_SPEED_KMH
                              ? "GPS review"
                              : "km/h"}
                          </small>
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
                  {runQuality && runQuality.confidence !== "good" && (
                    <span className={`gps-quality-flag ${runQuality.confidence}`}>
                      <CircleAlert size={14} />
                      GPS {runQuality.confidence === "poor" ? "needs review" : "cleaned"}
                      {runQuality.removedPoints.length
                        ? ` · ${runQuality.removedPoints.length} spike${runQuality.removedPoints.length === 1 ? "" : "s"} removed`
                        : ""}
                    </span>
                  )}
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
              <section className="progression-snapshot" aria-label="Progress snapshot">
                <div className="progression-snapshot-item">
                  <span>Latest vs Ghost</span>
                  <strong
                    className={
                      progression.latestDeltaToPersonalBest !== null &&
                      progression.latestDeltaToPersonalBest > 0.005
                        ? "lost mono"
                        : "gained mono"
                    }
                  >
                    {progression.latestDeltaToPersonalBest === null
                      ? "—"
                      : formatDelta(progression.latestDeltaToPersonalBest)}
                  </strong>
                  <small>
                    {progression.latestRunId === progression.personalBestRunId
                      ? "Latest run is your PB"
                      : "Against this trail's personal best"}
                  </small>
                </div>
                <div className="progression-snapshot-item">
                  <span>Recent average</span>
                  <strong className="mono">
                    {progression.recentAverageDuration === null
                      ? "—"
                      : formatTime(progression.recentAverageDuration)}
                  </strong>
                  <small>Last five attempts on this trail</small>
                </div>
                <div className="progression-snapshot-item">
                  <span>Consistency</span>
                  <strong className="mono">
                    {progression.consistencySpread === null
                      ? "—"
                      : `${progression.consistencySpread.toFixed(2)}s`}
                  </strong>
                  <small>Fastest to slowest in recent window</small>
                </div>
              </section>
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
                      {historyRuns.map((r) => {
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
                                <span className="history-bike-cell">
                                  {data.bikes.find((b) => b.id === r.bikeId)
                                    ?.name ?? "Unassigned"}
                                  {r.bikeSetupSnapshot &&
                                    [
                                      r.bikeSetupSnapshot.suspensionSetup,
                                      r.bikeSetupSnapshot.sag,
                                      r.bikeSetupSnapshot.rebound,
                                      r.bikeSetupSnapshot.pressure,
                                      r.bikeSetupSnapshot.tyres,
                                      r.bikeSetupSnapshot.wheels,
                                    ].some(Boolean) && (
                                      <small>
                                        {[r.bikeSetupSnapshot.suspensionSetup, r.bikeSetupSnapshot.sag, r.bikeSetupSnapshot.rebound, r.bikeSetupSnapshot.pressure, r.bikeSetupSnapshot.tyres, r.bikeSetupSnapshot.wheels]
                                          .filter(Boolean)
                                          .join(" · ")}
                                      </small>
                                    )}
                                </span>
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
                                  className="text-button run-share-button"
                                  type="button"
                                  disabled={session?.provider !== "supabase"}
                                  title={session?.provider === "supabase" ? "Create an unlisted 7-day run link" : "Configure cloud accounts to share run links"}
                                  onClick={() => void shareRun(r)}
                                >
                                  <Share2 size={13} /> Share
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
                  {!historyRuns.length && (
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
          {page === "garage" && <Suspense fallback={pageLoading}><Garage data={data} onChange={update} /></Suspense>}
          {page === "trails" && (
            <Suspense fallback={pageLoading}>
              <TrailManager
                data={data}
                onChange={update}
                onSelect={(id) => {
                  selectTrail(id);
                  setPage("analysis");
                }}
              />
            </Suspense>
          )}
          {page === "profile" && (
            <Suspense fallback={pageLoading}>
              <>
              <ProfileSettings
                key={JSON.stringify(data.profile)}
                data={data}
                onChange={update}
                onSignOut={session ? logout : undefined}
                cloudSyncEnabled={session?.provider === "supabase"}
              />
              <section className="panel data-panel">
                <h2>Your data stays yours.</h2>
                <p>
                  {session?.provider === "supabase"
                    ? "Profiles, bikes, trails and runs sync to your private account. Video clips can be uploaded separately from Video lab."
                    : "Profiles, bikes, trails and runs are stored in this browser. Export a backup before clearing browser data."}
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
            </Suspense>
          )}
          {page === "import" && (
            <Suspense fallback={pageLoading}>
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
            </Suspense>
          )}
          {page === "video" && <Suspense fallback={pageLoading}><VideoLab data={data} userId={session?.userId} cloudUserId={session?.provider === "supabase" ? session.userId : undefined} /></Suspense>}
          <footer className="app-footer">
            <span>
              GHOSTLINE<span className="accent">.</span>{" "}
              <span>Chase yourself.</span>
            </span>
            <span>
              {data.demo && data.runs.some((r) => r.synthetic)
                ? "Includes synthetic demo GPS · Santa Marta das Cortiças"
                : session
                  ? session.provider === "supabase" ? "Private cloud workspace · video library available" : "Local account · saved on this device"
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
