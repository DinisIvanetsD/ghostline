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
  LogIn,
  Map,
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
import type { AppData, Run, RunConditions } from "./types";
import {
  analyze,
  courseDuration,
  formatDelta,
  formatTime,
  personalBest,
  sectorTimes,
  splitLeadIn,
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
import { CONDITION_LABELS, CONDITIONS, difficultyLabel } from "./lib/labels";
import { cleanTrack, MAX_BELIEVABLE_SPEED_KMH } from "./lib/gpsQuality";
import { TrailMap } from "./components/TrailMap";
import { TelemetryChart, Progression } from "./components/Charts";
import { AuthScreen } from "./components/AuthScreen";
import { getSession, signOut, type AuthSession } from "./lib/auth";
import { createWorkspaceCloudSync, mergeWorkspaceRecords } from "./lib/cloudSync";
import { getSupabaseClient, supabaseConfigured } from "./lib/supabase";
import { createPrivateRunShare } from "./lib/runSharing";
import { SharedRunPage } from "./components/SharedRunPage";
import { Leaderboard } from "./components/Leaderboard";
import { TrailPoster } from "./components/TrailPoster";
import { finishStravaConnect, readStravaCallback } from "./lib/strava";

const Garage = lazy(() => import("./components/Management").then((module) => ({ default: module.Garage })));
const ProfileSettings = lazy(() => import("./components/Management").then((module) => ({ default: module.ProfileSettings })));
const TrailManager = lazy(() => import("./components/Management").then((module) => ({ default: module.TrailManager })));
const ImportRun = lazy(() => import("./components/Management").then((module) => ({ default: module.ImportRun })));
const VideoLab = lazy(() => import("./components/VideoLab").then((module) => ({ default: module.VideoLab })));
// MapLibre is large; it loads only when the analysis page shows the 3D stage.
const Terrain3D = lazy(() => import("./components/Terrain3D").then((module) => ({ default: module.Terrain3D })));
const pageLoading = <div className="panel page-loading" role="status">A abrir ferramentas…</div>;

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

// A guest browses the demo for this tab only; closing it returns to sign-in.
const GUEST_KEY = "ghostline.guest";
// Guests get their own storage scope so nothing they do is adopted by the
// next account that signs in on this browser (authenticate migrates only the
// legacy unscoped workspace).
const GUEST_SCOPE = "guest";
function readGuest(): boolean {
  try {
    return sessionStorage.getItem(GUEST_KEY) === "1";
  } catch {
    return false;
  }
}
function setGuestMode(on: boolean) {
  try {
    if (on) sessionStorage.setItem(GUEST_KEY, "1");
    else sessionStorage.removeItem(GUEST_KEY);
  } catch {
    // Without sessionStorage the guest choice simply lasts until reload.
  }
}

const nav = [
  { id: "analysis", label: "Análise", icon: Activity },
  { id: "history", label: "Histórico", icon: History },
  { id: "video", label: "Vídeo", icon: Clapperboard },
  { id: "trails", label: "Pistas", icon: Map },
  { id: "garage", label: "Garagem", icon: Bike },
] as const;
export default function App() {
  const [guest, setGuest] = useState(readGuest);
  // Bumped when a Strava connection completes so the picker re-reads its status.
  const [stravaVersion, setStravaVersion] = useState(0);
  const cloudSync = useMemo(() => createWorkspaceCloudSync<AppData>(), []);
  const cloudWriteQueue = useRef<Promise<void>>(Promise.resolve());
  const [session, setSession] = useState<AuthSession | null>(() =>
    supabaseConfigured ? null : getSession(),
  );
  const scope = session?.userId ?? GUEST_SCOPE;
  const [data, setData] = useState<AppData>(() => loadData(getSession()?.userId ?? GUEST_SCOPE)),
    [page, setPage] = useState<Page>("analysis"),
    [trailId, setTrailId] = useState(data.trails[0]?.id ?? ""),
    [runId, setRunId] = useState(""),
    [compareId, setCompareId] = useState("pb"),
    [progress, setProgress] = useState(0.43),
    [sector, setSector] = useState<number | null>(null),
    [notice, setNotice] = useState(readStorageWarning),
    [historyQuery, setHistoryQuery] = useState(""),
    [historyConditions, setHistoryConditions] = useState<RunConditions | "">("");
  const [playing, setPlaying] = useState(false);
  // 2D first: the sector gates read at a glance; 3D is the rider's choice.
  const [mapView, setMapView] = useState<"2d" | "3d">("2d");
  // Rendered twice: beside the run pickers on wide screens, right above the map on phone.
  const mapSwitch = (placement: "wide" | "phone") => (
    <div className={`segmented map-view-switch ${placement}`} role="group" aria-label="Vista do mapa">
      {(
        [
          ["2d", "Mapa 2D"],
          ["3d", "Relevo 3D"],
        ] as const
      ).map(([value, label]) => (
        <button
          key={value}
          type="button"
          className={mapView === value ? "active" : ""}
          aria-pressed={mapView === value}
          onClick={() => setMapView(value)}
        >
          {label}
        </button>
      ))}
    </div>
  );
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
  // Strava sends the rider back with ?strava=connect&code=…; finish the
  // connection once the cloud session is known, then open the import page.
  useEffect(() => {
    if (session?.provider !== "supabase") return;
    const callback = readStravaCallback();
    if (!callback) return;
    setPage("import");
    if (callback.error) return setNotice(callback.error);
    finishStravaConnect(callback.code!)
      .then(() => {
        setStravaVersion((value) => value + 1);
        setNotice("Strava ligado. Escolhe uma atividade recente para importar.");
      })
      .catch((error: unknown) =>
        setNotice(error instanceof Error ? `A ligação ao Strava falhou: ${error.message}` : "A ligação ao Strava falhou."),
      );
  }, [session]);
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
      new globalThis.Map(runs.map((r) => [r.id, courseDuration(r, trail)])),
    [runs, trail],
  );
  const run = runs.find((r) => r.id === runId) ?? runs[0];
  const pb = useMemo(
    () => personalBest(data.runs, trail?.id ?? "", trail),
    [data.runs, trail],
  );
  // Only real rides can be published, so the leaderboard ignores demo runs.
  const realPb = useMemo(
    () => personalBest(data.runs.filter((r) => !r.synthetic), trail?.id ?? "", trail),
    [data.runs, trail],
  );
  // Best run on the same surface: a wet run is chased against a wet Ghost.
  const surfacePb = useMemo(
    () =>
      run?.conditions
        ? personalBest(runs.filter((r) => r.conditions === run.conditions), trail?.id ?? "", trail)
        : undefined,
    [runs, run, trail],
  );
  const compare =
    compareId === "pb"
      ? pb
      : compareId === "pb-surface"
        ? (surfacePb ?? pb)
        : (runs.find((r) => r.id === compareId) ?? pb);
  // Runs dropped in from an alternate start (Bonus Spot) are analyzed from the
  // trail's own start gate; the lead-in is shown separately as sector 0.
  const runSplit = useMemo(() => (run && trail ? splitLeadIn(run, trail) : null), [run, trail]);
  const compareSplit = useMemo(
    () => (compare && trail ? splitLeadIn(compare, trail) : null),
    [compare, trail],
  );
  const current = useMemo(
    () => (runSplit ? analyze(runSplit.course.points) : null),
    [runSplit],
  );
  const runQuality = useMemo(
    () => (run ? cleanTrack(run.points) : null),
    [run],
  );
  const ghost = useMemo(
    () => (compareSplit ? analyze(compareSplit.course.points) : null),
    [compareSplit],
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
    () =>
      runs.filter(
        (item) =>
          item.name.toLowerCase().includes(historyQuery.toLowerCase()) &&
          (!historyConditions || item.conditions === historyConditions),
      ),
    [runs, historyQuery, historyConditions],
  );
  const boundaries = trail ? [0, ...trail.boundaries, 1] : [0, 1];
  const deltas = splits.map((s, i) => s - ghostSplits[i]);
  const worst = deltas.length ? deltas.indexOf(Math.max(...deltas)) : 0;
  const update = (next: AppData) => {
    try {
      saveData(next, scope);
      setData(next);
      if (session?.provider === "supabase" && supabaseConfigured) {
        setNotice("Guardado neste dispositivo · a sincronizar com a tua conta…");
        cloudWriteQueue.current = cloudWriteQueue.current
          .catch(() => undefined)
          .then(async () => {
            const client = await getSupabaseClient();
            if (!client) throw new Error("A sincronização na nuvem não está configurada.");
            const { data: auth } = await client.auth.getSession();
            if (!auth.session) throw new Error("A tua sessão expirou. Entra outra vez para sincronizar.");
            await cloudSync.push(auth.session.access_token, session.userId, next);
            setNotice("Guardado neste dispositivo e sincronizado com a tua conta.");
          })
          .catch((error: unknown) => {
            setNotice(error instanceof Error ? `Guardado neste dispositivo · falhou a sincronização: ${error.message}` : "Guardado neste dispositivo · falhou a sincronização.");
          });
      } else {
        setNotice("Alterações guardadas neste dispositivo.");
      }
      return true;
    } catch (error) {
      setNotice(
        error instanceof Error && error.message.startsWith("Invalid GHOSTLINE")
          ? error.message
          : "O armazenamento do dispositivo está cheio ou indisponível. Exporta uma cópia de segurança e liberta espaço antes de guardar.",
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
        if (!client) throw new Error("A sincronização na nuvem não está configurada.");
        const { data: auth } = await client.auth.getSession();
        if (!auth.session) throw new Error("A sessão da conta já não está disponível.");
        const remote = await cloudSync.pull(auth.session.access_token, nextSession.userId);
        if (remote) {
          const checked = validateData(remote.data);
          nextData = mergeWorkspaceRecords(nextData, checked);
        }
        await cloudSync.push(auth.session.access_token, nextSession.userId, nextData);
      }
    } catch (error) {
      cloudWarning = error instanceof Error ? `Sessão iniciada; a sincronização precisa de atenção: ${error.message}` : "Sessão iniciada; a sincronização precisa de atenção.";
    }
    try {
      saveData(nextData, nextSession.userId);
      setData(nextData);
      setSession(nextSession);
      setGuestMode(false);
      setGuest(false);
      setPage("analysis");
      setNotice(cloudWarning || (nextSession.provider === "supabase" ? "O teu espaço está sincronizado com a tua conta." : "O teu espaço local está pronto."));
    } catch {
      setNotice("Não foi possível abrir o teu espaço neste dispositivo.");
    }
  }, [cloudSync]);
  const logout = async () => {
    try {
      if (session?.provider === "supabase" && supabaseConfigured) {
        const client = await getSupabaseClient();
        if (!client) throw new Error("A sincronização na nuvem não está configurada.");
        const { error } = await client.auth.signOut();
        if (error) throw error;
      }
    } catch (error) {
      setNotice(error instanceof Error ? `Não foi possível terminar a sessão na nuvem: ${error.message}` : "Não foi possível terminar a sessão na nuvem.");
    } finally {
      signOut();
      setSession(null);
      setPage("analysis");
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
        `Apagar ${r.name}? O melhor tempo e os melhores setores vão ser recalculados.`,
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
      setNotice("Entra com uma conta na nuvem para criar um link privado da run.");
      return;
    }
    const sharedTrail = data.trails.find((item) => item.id === r.trailId);
    if (!sharedTrail) return setNotice("Não foi possível encontrar a pista desta run.");
    if (!window.confirm("Quem tiver este link pode ver o traçado GPS. O link expira em 7 dias. Criar?")) return;
    try {
      const best = personalBest(data.runs, r.trailId, sharedTrail);
      const ghostRun = best && best.id !== r.id ? best : null;
      const url = await createPrivateRunShare(data.profile.name, sharedTrail, r, ghostRun);
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url);
      else window.prompt("Copia este link privado da run", url);
      setNotice("Link privado copiado. Expira em 7 dias.");
    } catch (error) {
      setNotice(error instanceof Error ? `Não foi possível criar o link privado: ${error.message}` : "Não foi possível criar o link privado.");
    }
  };
  const names: Record<Page, string> = {
    analysis: "Análise da run",
    history: "Histórico",
    trails: "As tuas pistas",
    garage: "Garagem",
    profile: "Perfil do rider",
    import: "Importar run",
    video: "Laboratório de vídeo",
  };
  if (sharedToken) return <SharedRunPage token={sharedToken} />;
  if (!session && !guest) {
    return (
      <AuthScreen
        onAuthenticated={authenticate}
        onGuest={() => {
          // Never show the last signed-in rider's workspace to a guest.
          const guestData = loadData(GUEST_SCOPE);
          setData(guestData);
          setTrailId(guestData.trails[0]?.id ?? "");
          setGuestMode(true);
          setGuest(true);
        }}
      />
    );
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          href="#analysis"
          className="wordmark"
          onClick={() => setPage("analysis")}
          aria-label="Início GHOSTLINE"
        >
          <svg viewBox="0 0 30 30" aria-hidden="true">
            <path d="M5 24V11L15 4l10 7v13l-5-4-5 4-5-4z" />
            <path d="M11 12v4m8-4v4" />
          </svg>
          GHOSTLINE<span className="brand-period">.</span>
        </a>
        <nav aria-label="Navegação principal">
          {nav.map((n) => (
            <button
              key={n.id}
              className={page === n.id ? "nav-item active" : "nav-item"}
              onClick={() => setPage(n.id)}
            >
              <n.icon size={19} />
              <span>{n.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
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
              <small>{session ? (session.provider === "supabase" ? "Conta na nuvem" : "Conta neste dispositivo") : "Sem conta"}</small>
            </span>
            <Settings size={16} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <strong>{names[page]}</strong>
          </div>
          <div className="top-actions">
            {!session && (
              <button
                className="button secondary compact"
                onClick={() => {
                  setGuestMode(false);
                  setGuest(false);
                }}
              >
                <LogIn size={15} />
                Entrar
              </button>
            )}
            <span className={`device-state ${online ? "" : "offline"}`} role="status">
              <i />
              {!online
                ? "Offline · as alterações ficam neste dispositivo"
                : session?.provider === "supabase"
                  ? "Conta na nuvem · espaço sincronizado"
                  : "Espaço neste dispositivo"}
            </span>
            <button
              className="button primary"
              onClick={() => setPage("import")}
            >
              <Plus size={16} />
              Importar run
            </button>
          </div>
        </header>
        <main>
          {notice && (
            <div className="notice" role="status">
              <Check size={16} />
              {notice}
              <button
                aria-label="Fechar notificação"
                onClick={() => setNotice("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {(page === "analysis" || page === "history") && (
            <>
              <h1 className="visually-hidden">{names[page]}</h1>
              <div className="trail-toolbar trail-hero">
                {trail && trail.points.length > 1 && (
                  <TrailPoster trail={trail} width={1600} height={560} className="trail-hero-photo" decorative />
                )}
                <div className="trail-identity">
                  <div>
                    <label className="trail-select">
                      <select
                        aria-label="Pista selecionada"
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
                      {trail?.location ?? "Sem pistas"}{" "}
                      <span>•</span> {difficultyLabel(trail?.difficulty)} <span>•</span>{" "}
                      {runs.length} runs
                      {data.demo && run?.synthetic && (
                        <>
                          {" "}
                          <span>•</span> dados de demonstração
                        </>
                      )}
                    </span>
                  </div>
                </div>
                <div className="trail-hero-actions">
                  {page === "analysis" && run && (
                    <button
                      className="button primary"
                      onClick={() => {
                        if (progress >= 1) setProgress(0);
                        setMapView("3d");
                        setPlaying(!playing || progress >= 1);
                      }}
                    >
                      {playing && progress < 1 ? <Pause size={16} /> : <Play size={16} />}
                      {playing && progress < 1 ? "Pausar voo" : "Ver em 3D"}
                    </button>
                  )}
                  <button
                    className="button secondary compact"
                    onClick={() => setPage("trails")}
                  >
                    Gerir setores <ArrowRight size={15} />
                  </button>
                </div>
              </div>
              {data.trails.length > 1 && (
                <div className="trail-rail" role="group" aria-label="Trocar de pista">
                  {data.trails.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={`trail-chip${t.id === trail?.id ? " active" : ""}`}
                      aria-pressed={t.id === trail?.id}
                      onClick={() => selectTrail(t.id)}
                    >
                      {t.points.length > 1 && (
                        <TrailPoster trail={t} width={320} height={180} className="trail-chip-poster" decorative />
                      )}
                      <span>{t.name}</span>
                    </button>
                  ))}
                </div>
              )}
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
                <h2>Sem runs nesta pista</h2>
                <p>Importa um GPX ou FIT com tempos.</p>
                <button
                  className="button primary"
                  onClick={() => setPage("import")}
                >
                  Importar run
                </button>
              </section>
            ) : (
              <>
                <div className="comparison-toolbar">
                  <label className="run-picker">
                    <span>
                      <i className="dot current" />
                      Run atual
                    </span>
                    <select
                      aria-label="Run atual"
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
                      Run de referência
                    </span>
                    <select
                      aria-label="Run de referência"
                      value={compareId}
                      onChange={(e) => setCompareId(e.target.value)}
                    >
                      <option value="pb">O teu Ghost · Melhor tempo</option>
                      {run.conditions && surfacePb && (
                        <option value="pb-surface">
                          Ghost com piso {CONDITION_LABELS[run.conditions].toLowerCase()} · {formatTime(durations.get(surfacePb.id) ?? 0)}
                        </option>
                      )}
                      {runs.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} · {formatTime(durations.get(r.id) ?? 0)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {mapSwitch("wide")}
                  <span className="session-date">
                    {new Date(run.date).toLocaleDateString("pt-PT", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </span>
                </div>
                <div className="analysis-grid">
                  <div className="map-column">
                    {mapSwitch("phone")}
                    {mapView === "2d" ? (
                      <TrailMap
                        trail={trail}
                        current={current}
                        ghost={ghost}
                        progress={progress}
                        sector={sector}
                        onProgress={inspectProgress}
                      />
                    ) : (
                      <Suspense fallback={<div className="terrain-stage terrain-placeholder" role="status">A abrir o mapa 3D…</div>}>
                        <Terrain3D
                          trail={trail}
                          current={current}
                          ghost={ghost}
                          progress={progress}
                          sector={sector}
                          playing={playing}
                          onProgress={inspectProgress}
                          fallback={
                            <TrailMap
                              trail={trail}
                              current={current}
                              ghost={ghost}
                              progress={progress}
                              sector={sector}
                              onProgress={inspectProgress}
                            />
                          }
                        />
                      </Suspense>
                    )}
                    <div className="telemetry-stats">
                      <div>
                        <span>Distância</span>
                        <strong>
                          {(current.distance / 1000).toFixed(2)}
                          <small>km</small>
                        </strong>
                      </div>
                      <div>
                        <span>Vel. média</span>
                        <strong>
                          {current.avgSpeed.toFixed(1)}
                          <small>km/h</small>
                        </strong>
                      </div>
                      <div>
                        <span>Vel. máxima</span>
                        <strong>
                          {current.maxSpeed > MAX_BELIEVABLE_SPEED_KMH
                            ? "—"
                            : current.maxSpeed.toFixed(1)}
                          <small>
                            {current.maxSpeed > MAX_BELIEVABLE_SPEED_KMH
                              ? "Rever GPS"
                              : "km/h"}
                          </small>
                        </strong>
                      </div>
                      <div>
                        <span>Descida</span>
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
                        <h2>Tempo</h2>
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
                            para{" "}
                            {compareId === "pb" ? "o melhor tempo" : "a referência"}
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
                          {compareId === "pb" ? "Melhor tempo" : "Referência"}
                        </span>
                        <strong>{formatTime(ghost.duration)}</strong>
                      </div>
                      <button
                        className="button secondary compact share-result"
                        onClick={async () => {
                          try {
                            const { renderResultCard, shareOrDownload } = await import("./lib/resultCard");
                            const blob = await renderResultCard({
                              trailName: trail.name,
                              location: trail.location,
                              runName: run.name,
                              date: new Date(run.date).toLocaleDateString("pt-PT", { day: "numeric", month: "long", year: "numeric" }),
                              current,
                              ghost,
                              delta: current.duration - ghost.duration,
                              isPersonalBest: run.id === pb.id,
                              sectors: splits.map((time, i) => ({
                                name: trail.sectorNames[i] ?? `Setor ${i + 1}`,
                                time,
                                delta: deltas[i],
                              })),
                            });
                            const slug = `${trail.name}-${run.name}`.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-");
                            const result = await shareOrDownload(blob, `${slug}.png`, `${trail.name} · ${formatTime(current.duration)}`);
                            if (result === "downloaded") setNotice("Imagem do resultado descarregada.");
                          } catch (error) {
                            setNotice(error instanceof Error ? error.message : "Não foi possível criar a imagem.");
                          }
                        }}
                      >
                        <Share2 size={14} /> Partilhar resultado
                      </button>
                    </section>
                    <section className="sector-panel">
                      <div className="section-heading">
                        <h2>Tempos por setor</h2>
                        <span className="muted">Δ segundos</span>
                      </div>
                      <div className="sector-rows">
                        {runSplit?.leadIn != null && (
                          <div className="sector-row lead-in-row">
                            <span className="sector-index">S0</span>
                            <span className="sector-name">
                              {trail.leadInName ?? "Entrada"}
                              <small className="muted">Opcional · não conta no tempo</small>
                            </span>
                            <span className="sector-time">{formatTime(runSplit.leadIn)}</span>
                            <strong
                              className={
                                compareSplit?.leadIn != null && runSplit.leadIn - compareSplit.leadIn > 0.005
                                  ? "lost"
                                  : "gained"
                              }
                            >
                              {compareSplit?.leadIn != null
                                ? formatDelta(runSplit.leadIn - compareSplit.leadIn)
                                : "—"}
                            </strong>
                          </div>
                        )}
                        {splits.map((s, i) => (
                          <button
                            key={i}
                            className={`sector-row ${deltas[i] > 0.005 ? "tile-lost" : "tile-gain"} ${sector === i ? "selected" : ""}`}
                            onClick={() => {
                              setSector(sector === i ? null : i);
                              inspectProgress(
                                (boundaries[i] + boundaries[i + 1]) / 2,
                              );
                            }}
                          >
                            <span className="sector-index">S{i + 1}</span>
                            <span className="sector-name">
                              {trail.sectorNames[i] ?? `Setor ${i + 1}`}
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
                    </section>
                    <section className="theory-panel">
                      <div>
                        <span>
                          <Target size={15} />
                          Melhor teórico
                        </span>
                        <strong>{formatTime(theory.total)}</strong>
                      </div>
                      <p>
                        Soma dos setores mais rápidos ·{" "}
                        <b>
                          −{Math.max(0, current.duration - theory.total).toFixed(2)}s
                        </b>{" "}
                        face a esta run
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
                        ? `Maior perda: S${worst + 1} · ${trail.sectorNames[worst] ?? `Setor ${worst + 1}`}`
                        : "Sem perdas face à referência"}
                    </strong>
                    <p>
                      {Math.max(...deltas) > 0.01
                        ? `${formatDelta(deltas[worst])} face à referência neste setor.`
                        : `Melhor teórico: ${formatTime(theory.total)}.`}
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
                    Ver setor <ArrowRight size={16} />
                  </button>
                </div>
                <div className="replay-toolbar">
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
                      ? "Pausar"
                      : "Repetir run · 4×"}
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
                    Comparações alinhadas pela distância GPS normalizada. A precisão
                    do GPS afeta os tempos por setor.
                  </span>
                  {runQuality && runQuality.confidence !== "good" && (
                    <span className={`gps-quality-flag ${runQuality.confidence}`}>
                      <CircleAlert size={14} />
                      GPS {runQuality.confidence === "poor" ? "a rever" : "limpo"}
                      {runQuality.removedPoints.length
                        ? ` · ${runQuality.removedPoints.length} ${runQuality.removedPoints.length === 1 ? "pico removido" : "picos removidos"}`
                        : ""}
                    </span>
                  )}
                  <button
                    className="text-button"
                    onClick={() => setPage("history")}
                  >
                    Ver as {runs.length} runs <ArrowRight size={15} />
                  </button>
                </div>
              </>
            ))}
          {page === "history" && (
            <>
              <section className="progression-snapshot" aria-label="Resumo da progressão">
                <div className="progression-snapshot-item">
                  <span>Última vs Ghost</span>
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
                      ? "A última run é o teu PB"
                      : "Contra o melhor tempo nesta pista"}
                  </small>
                </div>
                <div className="progression-snapshot-item">
                  <span>Média recente</span>
                  <strong className="mono">
                    {progression.recentAverageDuration === null
                      ? "—"
                      : formatTime(progression.recentAverageDuration)}
                  </strong>
                  <small>Últimas cinco tentativas nesta pista</small>
                </div>
                <div className="progression-snapshot-item">
                  <span>Consistência</span>
                  <strong className="mono">
                    {progression.consistencySpread === null
                      ? "—"
                      : `${progression.consistencySpread.toFixed(2)}s`}
                  </strong>
                  <small>Do mais rápido ao mais lento, nas recentes</small>
                </div>
              </section>
              <Progression runs={runs} trail={trail} onSelect={selectRun} />
              <section className="panel history-panel">
                <div className="section-heading">
                  <h2>Runs</h2>
                  <div className="history-filters">
                    <select
                      aria-label="Filtrar por piso"
                      value={historyConditions}
                      onChange={(e) => setHistoryConditions(e.target.value as RunConditions | "")}
                    >
                      <option value="">Todos os pisos</option>
                      {CONDITIONS.map((value) => (
                        <option key={value} value={value}>{CONDITION_LABELS[value]}</option>
                      ))}
                    </select>
                    <input
                      aria-label="Procurar runs"
                      placeholder="Procurar runs…"
                      value={historyQuery}
                      onChange={(e) => setHistoryQuery(e.target.value)}
                    />
                  </div>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Run</th>
                        <th>Data</th>
                        <th>Bike</th>
                        <th>Piso</th>
                        <th>Tempo</th>
                        <th>Para o Ghost</th>
                        <th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyRuns.map((r) => {
                          const t = durations.get(r.id) ?? courseDuration(r, trail);
                          const delta =
                            t - (pb ? (durations.get(pb.id) ?? courseDuration(pb, trail)) : 0);
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
                                {new Date(r.date).toLocaleDateString("pt-PT", {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                })}
                              </td>
                              <td>
                                <span className="history-bike-cell">
                                  {data.bikes.find((b) => b.id === r.bikeId)
                                    ?.name ?? "Sem bike"}
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
                              <td>
                                <select
                                  className="conditions-select"
                                  aria-label={`Piso de ${r.name}`}
                                  value={r.conditions ?? ""}
                                  onChange={(e) => {
                                    const value = e.target.value as RunConditions | "";
                                    update({
                                      ...data,
                                      demo: false,
                                      runs: data.runs.map((item) =>
                                        item.id === r.id ? { ...item, conditions: value || undefined } : item,
                                      ),
                                    });
                                  }}
                                >
                                  <option value="">—</option>
                                  {CONDITIONS.map((value) => (
                                    <option key={value} value={value}>{CONDITION_LABELS[value]}</option>
                                  ))}
                                </select>
                              </td>
                              <td className="mono">{formatTime(t)}</td>
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
                                  Analisar <ArrowRight size={14} />
                                </button>
                                <button
                                  className="text-button run-share-button"
                                  type="button"
                                  disabled={session?.provider !== "supabase"}
                                  title={session?.provider === "supabase" ? "Criar um link privado de 7 dias" : "Configura contas na nuvem para partilhar runs"}
                                  onClick={() => void shareRun(r)}
                                >
                                  <Share2 size={13} /> Partilhar
                                </button>
                                <button
                                  className="delete-button"
                                  aria-label={`Apagar ${r.name}`}
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
                      Nenhuma run encontrada. Tenta outra pesquisa ou importa uma run.
                    </p>
                  )}
                </div>
              </section>
              {theory && runs.length > 0 && (
                <section className="panel best-sectors">
                  <div className="section-heading">
                    <h2>Melhor teórico por setor</h2>
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
                            "Ainda sem run"}{" "}
                          <ArrowRight size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              )}
              <Leaderboard
                key={trail?.id}
                trail={trail}
                personalBest={realPb}
                riderName={data.profile.name}
                cloudUserId={session?.provider === "supabase" ? session.userId : undefined}
              />
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
                localUserId={session?.provider === "local" ? session.userId : undefined}
                cloudSyncEnabled={session?.provider === "supabase"}
              />
              <section className="panel data-panel">
                <h2>Dados</h2>
                <p>
                  {session?.provider === "supabase"
                    ? "Sincronizados com a tua conta. Os vídeos enviam-se à parte, em Vídeo."
                    : "Guardados neste browser. Exporta uma cópia antes de limpar os dados do browser."}
                </p>
                <div className="form-actions">
                  <button
                    className="button secondary"
                    onClick={() => downloadData(data)}
                  >
                    <Download size={16} />
                    Exportar todos os dados
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => backupInput.current?.click()}
                  >
                    Restaurar cópia
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
                        throw new Error("A cópia de segurança tem de ter menos de 25 MB.");
                      const restored = parseBackup(await file.text());
                      if (
                        window.confirm(
                          "Substituir o espaço deste dispositivo pela cópia? Exporta os dados atuais primeiro se os quiseres manter.",
                        )
                      ) {
                        if (update(restored)) {
                          selectTrail(restored.trails[0]?.id ?? "");
                          setNotice("Cópia restaurada neste dispositivo.");
                        }
                      }
                    } catch (error) {
                      setNotice(
                        error instanceof Error
                          ? error.message
                          : "Não foi possível restaurar esta cópia.",
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
                  <h1>Importar run</h1>
                  <p>Uma descida por ficheiro.</p>
                </div>
                {data.runs.some((r) => r.synthetic) && (
                  <button
                    className="button secondary"
                    onClick={() =>
                      downloadGPX(data.runs.find((r) => r.synthetic)!)
                    }
                  >
                    <Download size={16} />
                    Experimentar GPX de exemplo
                  </button>
                )}
              </div>
              <ImportRun
                data={data}
                onChange={update}
                cloud={session?.provider === "supabase"}
                scope={scope}
                stravaVersion={stravaVersion}
                onImported={(tid, rid) => {
                  selectTrail(tid);
                  setRunId(rid);
                  setPage("analysis");
                }}
              />
              </>
            </Suspense>
          )}
          {page === "video" && <Suspense fallback={pageLoading}><VideoLab data={data} userId={scope} cloudUserId={session?.provider === "supabase" ? session.userId : undefined} /></Suspense>}
          <footer className="app-footer">
            <span>GHOSTLINE</span>
            <span>Rotas Trailforks · altitude EU-DEM · mapa © OpenStreetMap</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
