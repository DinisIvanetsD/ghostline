import {
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import {
  Bike as BikeIcon,
  Check,
  CircleAlert,
  FileUp,
  LockKeyhole,
  LogOut,
  MapPin,
  Pencil,
  Plus,
  Save,
  Trash2,
  Upload,
  UserRound,
} from "lucide-react";
import { parseGPX } from "../lib/gpx";
import { loadStravaStreams, streamsToPoints, type StravaActivity } from "../lib/strava";
import { StravaPicker } from "./StravaPicker";
import { RunRecorder } from "./RunRecorder";
import { SectorPicker } from "./SectorPicker";
import { addGate, removeGate } from "../lib/sectorEdit";
import { clearRecording } from "../lib/recorder";
import { CONDITION_LABELS, CONDITIONS, DIFFICULTIES, difficultyLabel } from "../lib/labels";
import { changePassword } from "../lib/auth";
import { analyze, courseDuration, formatTime } from "../lib/analysis";
import { cleanTrack, type GpsQualityResult } from "../lib/gpsQuality";
import { clipToRouteFinish, detectTrail, matchRoute } from "../lib/routeMatch";
import { clipToRideWindow, detectStops, type StopAnalysis } from "../lib/videoSync";
import { progressionInsights } from "../lib/progressionInsights";
import { TrailMap } from "./TrailMap";
import type { AppData, Bike, Point, Profile, RunConditions, Trail } from "../types";

type Props = {
  data: AppData;
  onChange: (data: AppData) => boolean | void;
  onSignOut?: () => void;
  cloudSyncEnabled?: boolean;
  /** Set for device-local accounts, which can change their password here. */
  localUserId?: string;
};
const uid = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const clone = (data: AppData): AppData => ({
  ...data,
  demo: false,
  profile: { ...data.profile },
  bikes: [...data.bikes],
  trails: [...data.trails],
  runs: [...data.runs],
});
const isFIT = (file: File) => /\.fit$/i.test(file.name);
const hasFITSignature = (bytes: Uint8Array) =>
  bytes.byteLength >= 12 &&
  bytes[8] === 0x2e &&
  bytes[9] === 0x46 &&
  bytes[10] === 0x49 &&
  bytes[11] === 0x54;
const readTrackFile = async (file: File, requireTime: boolean) => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (isFIT(file) || hasFITSignature(bytes)) {
    // Keep the Garmin decoder out of the initial dashboard bundle. It is
    // loaded only when a rider chooses a FIT file.
    const { parseFIT } = await import("../lib/fit");
    return parseFIT(bytes);
  }
  return parseGPX(new TextDecoder().decode(bytes), requireTime);
};
const TREND_LABELS = {
  improving: "A melhorar",
  stable: "Estável",
  slowing: "Mais lento",
  insufficient: "A construir",
} as const;
const parseBoundaries = (raw: string) => {
  const values = raw.trim() ? raw.split(",").map((v) => Number(v.trim())) : [];
  if (
    values.some((v) => !Number.isFinite(v) || v <= 0 || v >= 1) ||
    values.some((v, i) => i > 0 && v <= values[i - 1])
  )
    throw new Error(
      "Os limites têm de ser números crescentes entre 0 e 1.",
    );
  return values;
};
const Section = ({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) => (
  <section className="panel">
    <div className="section-heading">
      <h2>{title}</h2>
      {action}
    </div>
    {children}
  </section>
);
const ErrorLine = ({ message }: { message?: string }) =>
  message ? (
    <p className="error-line" role="alert">
      <CircleAlert size={15} />
      {message}
    </p>
  ) : null;

export function Garage({ data, onChange }: Props) {
  const empty: Bike = {
    id: "",
    name: "",
    brand: "",
    travel: 0,
    type: "Downhill",
    suspensionSetup: "",
    sag: "",
    rebound: "",
    pressure: "",
    tyres: "",
    wheels: "",
    notes: "",
    lastService: "",
    serviceHistory: [],
  };
  const [draft, setDraft] = useState<Bike>(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [serviceDrafts, setServiceDrafts] = useState<Record<string, { date: string; description: string }>>({});
  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.name.trim()) return setError("Dá um nome a esta bike.");
    const next = clone(data);
    const bike = {
      ...draft,
      id: editing ?? uid("bike"),
      name: draft.name.trim(),
      brand: draft.brand.trim(),
      travel: Number(draft.travel) || 0,
      suspensionSetup: draft.suspensionSetup?.trim() ?? "",
      sag: draft.sag?.trim() ?? "",
      rebound: draft.rebound?.trim() ?? "",
      pressure: draft.pressure?.trim() ?? "",
      tyres: draft.tyres?.trim() ?? "",
      wheels: draft.wheels?.trim() ?? "",
      notes: draft.notes?.trim() ?? "",
      lastService: draft.lastService ?? "",
      serviceHistory: draft.serviceHistory ?? [],
    };
    next.bikes = editing
      ? next.bikes.map((b) => (b.id === editing ? bike : b))
      : [...next.bikes, bike];
    if (onChange(next) === false) return;
    setDraft(empty);
    setEditing(null);
    setError("");
  };
  const addService = (event: FormEvent, bike: Bike) => {
    event.preventDefault();
    const service = serviceDrafts[bike.id] ?? { date: new Date().toISOString().slice(0, 10), description: "" };
    if (!service.description.trim()) return setError("Escreve uma descrição curta da manutenção.");
    const next = clone(data);
    next.bikes = next.bikes.map((item) => item.id === bike.id
      ? {
          ...item,
          lastService: service.date,
          serviceHistory: [...(item.serviceHistory ?? []), { id: uid("service"), date: service.date, description: service.description.trim() }],
        }
      : item);
    if (onChange(next) === false) return;
    setServiceDrafts((current) => ({ ...current, [bike.id]: { date: new Date().toISOString().slice(0, 10), description: "" } }));
    setError("");
  };
  const remove = (id: string) => {
    if (data.runs.some((r) => r.bikeId === id))
      return setError(
        "Esta bike tem runs guardadas. Apaga essas runs primeiro.",
      );
    if (!window.confirm("Apagar esta bike?")) return;
    onChange({
      ...data,
      demo: false,
      bikes: data.bikes.filter((b) => b.id !== id),
    });
  };
  return (
    <div className="management-stack">
      <Section
        title="Garagem"
        action={
          <span className="muted">
            {data.bikes.length} bike{data.bikes.length === 1 ? "" : "s"}
          </span>
        }
      >
        <form className="garage-form" onSubmit={save}>
          <div className="garage-form-heading">
            <div>
              <h3>{editing ? "Editar bike" : "Adicionar bike"}</h3>
              <p className="muted">
                {editing
                  ? "A afinação fica registada nas runs novas."
                  : "A afinação fica registada em cada run importada."}
              </p>
            </div>
            {editing && <span className="garage-form-state">A editar</span>}
          </div>
          <div className="form-grid">
          <label className="field">
            Nome
            <input
              autoComplete="off"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <label className="field">
            Marca
            <input
              autoComplete="organization"
              value={draft.brand}
              onChange={(e) => setDraft({ ...draft, brand: e.target.value })}
            />
          </label>
          <label className="field">
            Tipo
            <select
              value={draft.type}
              onChange={(e) => setDraft({ ...draft, type: e.target.value })}
            >
              <option>Downhill</option>
              <option>Enduro</option>
              <option>Trail</option>
              <option>Hardtail</option>
            </select>
          </label>
          <label className="field">
            Curso (mm)
            <input
              type="number"
              min="0"
              value={draft.travel}
              onChange={(e) =>
                setDraft({ ...draft, travel: Number(e.target.value) })
              }
            />
          </label>
          <label className="field">
            Afinação da suspensão
            <input
              placeholder="ex. 78 psi · 2 cliques"
              value={draft.suspensionSetup ?? ""}
              onChange={(e) => setDraft({ ...draft, suspensionSetup: e.target.value })}
            />
          </label>
          <label className="field">
            Sag
            <input
              placeholder="ex. 28% trás · 20% frente"
              value={draft.sag ?? ""}
              onChange={(e) => setDraft({ ...draft, sag: e.target.value })}
            />
          </label>
          <label className="field">
            Retorno (rebound)
            <input
              placeholder="ex. 6 cliques abertos"
              value={draft.rebound ?? ""}
              onChange={(e) => setDraft({ ...draft, rebound: e.target.value })}
            />
          </label>
          <label className="field">
            Pressão dos pneus
            <input
              placeholder="ex. 22 / 25 psi"
              value={draft.pressure ?? ""}
              onChange={(e) => setDraft({ ...draft, pressure: e.target.value })}
            />
          </label>
          <label className="field">
            Pneus
            <input
              placeholder="ex. carcaça DH · macio"
              value={draft.tyres ?? ""}
              onChange={(e) => setDraft({ ...draft, tyres: e.target.value })}
            />
          </label>
          <label className="field">
            Rodas
            <input
              placeholder="ex. 29 / 27.5"
              value={draft.wheels ?? ""}
              onChange={(e) => setDraft({ ...draft, wheels: e.target.value })}
            />
          </label>
          <label className="field">
            Última manutenção
            <input
              type="date"
              value={draft.lastService ?? ""}
              onChange={(e) => setDraft({ ...draft, lastService: e.target.value })}
            />
          </label>
          <label className="field garage-notes">
            Notas da afinação
            <textarea
              rows={2}
              placeholder="O que convém lembrar antes da próxima run"
              value={draft.notes ?? ""}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            />
          </label>
          <div className="form-actions">
            <button className="button primary" type="submit">
              <Save size={16} />
              {editing ? "Atualizar bike" : "Adicionar bike"}
            </button>
            {editing && (
              <button
                className="button secondary"
                type="button"
                onClick={() => {
                  setEditing(null);
                  setDraft(empty);
                }}
              >
              Cancelar
              </button>
            )}
          </div>
          </div>
        </form>
        <ErrorLine message={error} />
        {data.bikes.length === 0 ? (
          <div className="empty-state garage-empty">
            <BikeIcon size={24} />
            <strong>Sem bikes</strong>
            <span>Adiciona uma bike para a associar às runs.</span>
          </div>
        ) : (
          <div className="bike-grid">
            {data.bikes.map((b) => {
              const runs = data.runs.filter((run) => run.bikeId === b.id);
              const trails = new Set(runs.map((run) => run.trailId)).size;
              const latest = runs
                .slice()
                .sort((a, z) => z.date.localeCompare(a.date))[0];
              const fastestByTrail = new Map<string, { id: string; duration: number }>();
              runs.forEach((run) => {
                const duration = courseDuration(run, data.trails.find((t) => t.id === run.trailId));
                const fastest = fastestByTrail.get(run.trailId);
                if (!fastest || duration < fastest.duration)
                  fastestByTrail.set(run.trailId, { id: run.id, duration });
              });
              const personalBests = runs.filter(
                (run) => fastestByTrail.get(run.trailId)?.id === run.id,
              ).length;
              const bikeProgression = progressionInsights(runs, { recentWindow: 5 });
              const setupResults = new Map<string, { label: string; best: number; count: number }>();
              runs.forEach((run) => {
                const snapshot = run.bikeSetupSnapshot;
                const label = snapshot
                  ? [snapshot.suspensionSetup, snapshot.sag, snapshot.rebound, snapshot.pressure, snapshot.tyres, snapshot.wheels].filter(Boolean).join(" · ")
                  : [b.suspensionSetup, b.sag, b.rebound, b.pressure, b.tyres, b.wheels].filter(Boolean).join(" · ");
                if (!label) return;
                const duration = courseDuration(run, data.trails.find((t) => t.id === run.trailId));
                const previous = setupResults.get(label);
                setupResults.set(label, {
                  label,
                  best: Math.min(previous?.best ?? Number.POSITIVE_INFINITY, duration),
                  count: (previous?.count ?? 0) + 1,
                });
              });
              const bestSetup = [...setupResults.values()].sort((a, z) => a.best - z.best)[0];
              const serviceAge = b.lastService
                ? Math.floor((Date.now() - Date.parse(b.lastService)) / 86_400_000)
                : null;
              return (
                <article className="bike-card" key={b.id}>
                  <div className="bike-card-heading">
                    <div className="bike-identity">
                      <h3>{b.name}</h3>
                      <p>{b.brand || "Marca por definir"}</p>
                    </div>
                    <span className="bike-type">{b.type}</span>
                  </div>
                  <div className="bike-specs">
                    <div>
                      <span>Curso</span>
                      <strong className="mono">{b.travel ? `${b.travel} mm` : "—"}</strong>
                    </div>
                    <div>
                      <span>Runs</span>
                      <strong className="mono">{runs.length}</strong>
                    </div>
                    <div>
                      <span>Runs PB</span>
                      <strong className="mono">{personalBests}</strong>
                    </div>
                    <div>
                      <span>Consistência</span>
                      <strong className="mono">
                        {bikeProgression.consistencyScore === null
                          ? "—"
                          : `${Math.round(bikeProgression.consistencyScore)}%`}
                      </strong>
                    </div>
                  </div>
                  {(b.suspensionSetup || b.sag || b.rebound || b.pressure || b.tyres || b.wheels) && (
                    <div className="bike-setup-summary">
                      <span className="bike-setup-label">AFINAÇÃO</span>
                      <span>
                        {[b.suspensionSetup, b.sag, b.rebound, b.pressure, b.tyres, b.wheels].filter(Boolean).join(" · ")}
                      </span>
                    </div>
                  )}
                  {b.lastService && (
                    <div className="bike-service">
                      <span>Última manutenção</span>
                      <strong className={`mono ${serviceAge !== null && serviceAge > 180 ? "service-due" : ""}`}>
                        {b.lastService}{serviceAge !== null && serviceAge > 180 ? " · em atraso" : ""}
                      </strong>
                    </div>
                  )}
                  <details className="bike-service-log">
                    <summary>Histórico de manutenção <span>{b.serviceHistory?.length ?? 0}</span></summary>
                    <div className="bike-service-log-content">
                      <form onSubmit={(event) => addService(event, b)}>
                        <label className="field">
                          Data
                          <input
                            aria-label={`Data da manutenção da ${b.name}`}
                            type="date"
                            value={serviceDrafts[b.id]?.date ?? new Date().toISOString().slice(0, 10)}
                            onChange={(event) => setServiceDrafts((current) => ({ ...current, [b.id]: { date: event.target.value, description: current[b.id]?.description ?? "" } }))}
                          />
                        </label>
                        <label className="field">
                          Trabalho feito
                          <input
                            aria-label={`Descrição da manutenção da ${b.name}`}
                            placeholder="Manutenção da suspensão, sangrar travões…"
                            value={serviceDrafts[b.id]?.description ?? ""}
                            onChange={(event) => setServiceDrafts((current) => ({ ...current, [b.id]: { date: current[b.id]?.date ?? new Date().toISOString().slice(0, 10), description: event.target.value } }))}
                          />
                        </label>
                        <button className="button secondary" type="submit">Registar manutenção</button>
                      </form>
                      {(b.serviceHistory ?? []).slice().sort((a, z) => z.date.localeCompare(a.date)).map((record) => (
                        <div className="bike-service-record" key={record.id}>
                          <strong>{record.description}</strong>
                          <span className="mono">{record.date}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                  <div className="bike-performance">
                    <div>
                      <span>Próximo objetivo</span>
                      <strong className="mono">
                        {bikeProgression.nextTargetDuration === null
                          ? "Adiciona uma run"
                          : formatTime(bikeProgression.nextTargetDuration)}
                      </strong>
                    </div>
                    <div>
                      <span>Tendência</span>
                      <strong className={`trend-${bikeProgression.trend}`}>
                        {TREND_LABELS[bikeProgression.trend]}
                      </strong>
                    </div>
                  </div>
                  {bestSetup && (
                    <div className="bike-setup-best">
                      <span className="bike-setup-label">AFINAÇÃO MAIS RÁPIDA</span>
                      <span title={bestSetup.label}>
                        {bestSetup.label} · {formatTime(bestSetup.best)} ({bestSetup.count} run{bestSetup.count === 1 ? "" : "s"})
                      </span>
                    </div>
                  )}
                  <div className="bike-card-footer">
                    <span className="muted">
                      {runs.length
                        ? `${trails} ${trails === 1 ? "pista" : "pistas"} · última ${latest?.date ?? "—"}`
                        : "Ainda sem runs"}
                    </span>
                    <div className="row-actions">
                      <button
                        className="icon-button"
                        title={`Editar ${b.name}`}
                        aria-label={`Editar ${b.name}`}
                        onClick={() => {
                          setEditing(b.id);
                          setDraft(b);
                        }}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        className="icon-button danger"
                        title={`Apagar ${b.name}`}
                        aria-label={`Apagar ${b.name}`}
                        onClick={() => remove(b.id)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}

export function ProfileSettings({ data, onChange, onSignOut, cloudSyncEnabled, localUserId }: Props) {
  const [profile, setProfile] = useState<Profile>(data.profile);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const save = (e: FormEvent) => {
    e.preventDefault();
    const name = profile.name.trim();
    if (!name) return setError("O nome do rider é obrigatório.");
    setError("");
    const result = onChange({
      ...data,
      profile: { name, email: profile.email.trim(), home: profile.home.trim() },
      demo: false,
    });
    if (result === false) return;
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };
  return (
    <Section title="Perfil do rider">
      <p className="muted">
        {cloudSyncEnabled
          ? "O teu espaço privado sincroniza entre dispositivos. Também podes enviar vídeos para a tua biblioteca privada no Laboratório de vídeo."
          : "O teu espaço está guardado neste dispositivo. Exporta uma cópia de segurança antes de limpar os dados do browser ou mudar de telemóvel."}
      </p>
      <form className="form-grid" onSubmit={save}>
        <label className="field">
          Nome do rider
          <input
            value={profile.name}
            onChange={(e) => setProfile({ ...profile, name: e.target.value })}
          />
        </label>
        <label className="field">
          Email <span className="muted">opcional</span>
          <input
            type="email"
            value={profile.email}
            onChange={(e) => setProfile({ ...profile, email: e.target.value })}
          />
        </label>
        <label className="field">
          Pistas habituais
          <input
            value={profile.home}
            onChange={(e) => setProfile({ ...profile, home: e.target.value })}
          />
        </label>
        <div className="form-actions">
          <button className="button primary" type="submit">
            <UserRound size={16} />
            Guardar perfil
          </button>
          {saved && (
            <span className="muted">
              <Check size={15} /> Guardado
            </span>
          )}
          {onSignOut && (
            <button className="button secondary" type="button" onClick={onSignOut}>
              <LogOut size={16} />
              Terminar sessão
            </button>
          )}
        </div>
      </form>
      <ErrorLine message={error} />
      {localUserId && <PasswordForm userId={localUserId} />}
    </Section>
  );
}

function PasswordForm({ userId }: { userId: string }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (next !== confirm) return setStatus({ ok: false, text: "As palavras-passe novas não coincidem." });
    try {
      await changePassword({ userId, current, next });
      setCurrent("");
      setNext("");
      setConfirm("");
      setStatus({ ok: true, text: "Palavra-passe alterada." });
    } catch (err) {
      setStatus({ ok: false, text: err instanceof Error ? err.message : "Não foi possível mudar a palavra-passe." });
    }
  };
  return (
    <form className="form-grid password-form" onSubmit={submit}>
      <h3>Mudar palavra-passe</h3>
      <label className="field">
        Palavra-passe atual
        <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
      </label>
      <label className="field">
        Nova palavra-passe
        <input type="password" autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} required />
      </label>
      <label className="field">
        Confirmar nova palavra-passe
        <input type="password" autoComplete="new-password" minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
      </label>
      <div className="form-actions">
        <button className="button secondary" type="submit">
          <LockKeyhole size={16} />
          Mudar palavra-passe
        </button>
        {status?.ok && <span className="muted" role="status"><Check size={15} /> {status.text}</span>}
      </div>
      {status && !status.ok && <ErrorLine message={status.text} />}
    </form>
  );
}

export function TrailManager({
  data,
  onChange,
  onSelect,
}: Props & { onSelect: (id: string) => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [difficulty, setDifficulty] = useState("Black");
  const [boundaries, setBoundaries] = useState("0.25, 0.5, 0.75");
  const [sectorNames, setSectorNames] = useState("");
  const [finishGate, setFinishGate] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const open = (trail?: Trail) => {
    setFinishGate(Boolean(trail?.finishPoint));
    setSelected(trail?.id ?? null);
    setName(trail?.name ?? "");
    setLocation(trail?.location ?? "");
    setDifficulty(trail?.difficulty ?? "Black");
    setBoundaries(
      (trail?.boundaries ?? [0.25, 0.5, 0.75])
        .filter((v) => v > 0 && v < 1)
        .join(", "),
    );
    const count = (trail?.boundaries?.length ?? 3) + 1;
    setSectorNames(
      trail?.sectorNames?.length === count
        ? trail.sectorNames.join(", ")
        : Array.from(
            { length: count },
            (_, i) => `Setor ${String(i + 1).padStart(2, "0")}`,
          ).join(", "),
    );
    setError("");
  };
  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError("Dá um nome a esta pista.");
    let parsed: number[];
    try {
      parsed = parseBoundaries(boundaries);
    } catch (err) {
      return setError(
        err instanceof Error ? err.message : "Limites inválidos.",
      );
    }
    const count = parsed.length + 1;
    const names = sectorNames
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    if (names.length && names.length !== count)
      return setError(
        `Escreve exatamente ${count} nomes de setores, separados por vírgulas.`,
      );
    const next = clone(data);
    const existing = selected
      ? next.trails.find((t) => t.id === selected)
      : undefined;
    const trail: Trail = {
      id: selected ?? uid("trail"),
      name: name.trim(),
      location: location.trim(),
      difficulty,
      points: existing?.points ?? [],
      boundaries: parsed,
      sectorNames: names.length
        ? names
        : Array.from(
            { length: count },
            (_, i) => `Setor ${String(i + 1).padStart(2, "0")}`,
          ),
      ...(existing?.startPoints ? { startPoints: existing.startPoints } : {}),
      // The finish gate defaults to the route's last point; it trims GPS
      // captured after the run on future imports.
      ...(finishGate && (existing?.finishPoint || existing?.points.length)
        ? {
            finishPoint: existing.finishPoint ?? {
              lat: existing.points.at(-1)!.lat,
              lon: existing.points.at(-1)!.lon,
            },
          }
        : {}),
    };
    next.trails = selected
      ? next.trails.map((t) => (t.id === selected ? trail : t))
      : [...next.trails, trail];
    if (onChange(next) === false) return;
    open();
  };
  const importRoute = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024)
      return setError("GPX and FIT files must be 10 MB or smaller.");
    try {
      const points = await readTrackFile(file, false);
      if (!points?.length) throw new Error("Não foram encontrados pontos de rota.");
      const trail: Trail = {
        id: uid("trail"),
        name: file.name.replace(/\.(?:gpx|fit)$/i, ""),
        location: "",
        difficulty: "Black",
        points,
        boundaries: [0.25, 0.5, 0.75],
        sectorNames: ["Setor 01", "Setor 02", "Setor 03", "Setor 04"],
      };
      if (
        onChange({
          ...data,
          demo: false,
          trails: [...data.trails, trail],
        }) === false
      )
        return;
      open(trail);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível ler essa rota GPX ou FIT.",
      );
    }
    e.target.value = "";
  };
  const remove = (id: string) => {
    const count = data.runs.filter((r) => r.trailId === id).length;
    if (
      count &&
      !window.confirm(
        `Esta pista tem ${count} ${count === 1 ? "run guardada" : "runs guardadas"}. Apagar a pista e essas runs?`,
      )
    )
      return;
    if (!window.confirm("Apagar esta pista?")) return;
    onChange({
      ...data,
      demo: false,
      trails: data.trails.filter((t) => t.id !== id),
      runs: data.runs.filter((r) => r.trailId !== id),
    });
    if (selected === id) open();
  };
  return (
    <Section
      title="Pistas"
      action={
        <button className="button primary" onClick={() => open()}>
          <Plus size={16} />
          Nova pista
        </button>
      }
    >
      <p className="muted">
        Rota a partir de um GPX ou FIT. Setores editáveis no mapa.
      </p>
      <div className="trail-list">
        {data.trails.map((t) => (
          <div className="trail-row" key={t.id}>
            <div>
              <strong>{t.name}</strong>
              <span className="muted">
                <MapPin size={13} />
                {t.location || "Local por definir"} · {difficultyLabel(t.difficulty)}
              </span>
            </div>
            <div className="row-actions">
              <button
                className="button secondary"
                onClick={() => onSelect(t.id)}
              >
                Ver análise
              </button>
              <button
                className="icon-button"
                title={`Editar ${t.name}`}
                onClick={() => open(t)}
              >
                <Pencil size={15} />
              </button>
              <button
                className="icon-button danger"
                title={`Apagar ${t.name}`}
                onClick={() => remove(t.id)}
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        ))}
      </div>
      {data.trails.length === 0 && (
        <div className="empty-state">
          <MapPin size={24} />
          <strong>Sem pistas</strong>
          <span>Importa uma rota GPX ou FIT.</span>
        </div>
      )}
      <div className="trail-editor">
        <h3>{selected ? "Editar pista" : "Nova pista"}</h3>
        <form className="form-grid" onSubmit={save}>
          <label className="field">
            Nome da pista
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            Local
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </label>
          <label className="field">
            Dificuldade
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
            >
              {DIFFICULTIES.map((value) => (
                <option key={value} value={value}>
                  {difficultyLabel(value)}
                </option>
              ))}
            </select>
          </label>
          {(() => {
            const route = data.trails.find((t) => t.id === selected)?.points ?? [];
            if (!selected || route.length < 2) return null;
            let gates: number[] | null = null;
            try {
              gates = parseBoundaries(boundaries);
            } catch {
              // An unfinished hand-typed list keeps the map hidden until it parses.
            }
            if (!gates) return null;
            const names = sectorNames.split(",").map((v) => v.trim()).filter(Boolean);
            const apply = (next: { boundaries: number[]; names: string[] } | null) => {
              if (!next) return;
              setBoundaries(next.boundaries.join(", "));
              setSectorNames(next.names.join(", "));
            };
            return (
              <div className="field sector-picker-field">
                Setores no mapa
                <SectorPicker
                  points={route}
                  boundaries={gates}
                  onAdd={(fraction) => apply(addGate(gates, names, fraction, "Novo setor"))}
                  onRemove={(index) => apply(removeGate(gates, names, index))}
                />
              </div>
            );
          })()}
          <label className="field">
            Limites dos setores{" "}
            <span className="muted">frações, separadas por vírgulas</span>
            <input
              value={boundaries}
              onChange={(e) => setBoundaries(e.target.value)}
              placeholder="0.25, 0.5, 0.75"
            />
            <small className="muted">O 0 e o 1 são adicionados automaticamente.</small>
          </label>
          <label className="field">
            Nomes dos setores{" "}
            <span className="muted">opcional, separados por vírgulas</span>
            <input
              value={sectorNames}
              onChange={(e) => setSectorNames(e.target.value)}
              placeholder="Arranque, Pedras, Chegada"
            />
          </label>
          <label className="field checkbox-field">
            <input
              type="checkbox"
              checked={finishGate}
              disabled={!selected || !data.trails.find((t) => t.id === selected)?.points.length}
              onChange={(e) => setFinishGate(e.target.checked)}
            />
            Meta no fim da rota
            <small className="muted">
              Corta o GPS gravado depois da chegada quando importas uma run.
            </small>
          </label>
          <div className="form-actions">
            <button className="button primary" type="submit">
              <Save size={16} />
              Guardar pista
            </button>
            {selected && (
              <button
                className="button secondary"
                type="button"
                onClick={() => open()}
              >
                Limpar
              </button>
            )}
          </div>
        </form>
        <button
          className="button secondary"
          onClick={() => inputRef.current?.click()}
        >
          <Upload size={16} />
          Importar rota GPX / FIT
        </button>
        <input
          ref={inputRef}
          hidden
          type="file"
          accept=".gpx,.fit,application/gpx+xml,application/octet-stream"
          onChange={importRoute}
        />
        <ErrorLine message={error} />
      </div>
    </Section>
  );
}

export function ImportRun({
  data,
  onChange,
  onImported,
  cloud = false,
  scope = "guest",
  stravaVersion = 0,
}: Props & {
  onImported: (trailId: string, runId: string) => void;
  cloud?: boolean;
  scope?: string;
  stravaVersion?: number;
}) {
  /** Label of the loaded source: a file name or a Strava activity name. */
  const [file, setFile] = useState<{ name: string; recorded?: boolean } | null>(null);
  const [points, setPoints] = useState<Point[] | null>(null);
  const [trailId, setTrailId] = useState(data.trails[0]?.id ?? "");
  const [bikeId, setBikeId] = useState(data.bikes[0]?.id ?? "");
  const [name, setName] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [conditions, setConditions] = useState<RunConditions | "">("");
  const [error, setError] = useState("");
  const [gpsQuality, setGpsQuality] = useState<GpsQualityResult | null>(null);
  const [rideWindow, setRideWindow] = useState<StopAnalysis | null>(null);
  const [trimToRideWindow, setTrimToRideWindow] = useState(false);
  const [trailDetection, setTrailDetection] = useState<{ name: string; score: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const manuallySelectedTrail = useRef(false);
  const trail = useMemo(
    () => data.trails.find((t) => t.id === trailId),
    [data.trails, trailId],
  );
  const reset = () => {
    setFile(null);
    setPoints(null);
    setGpsQuality(null);
    setRideWindow(null);
    setTrimToRideWindow(false);
    setTrailDetection(null);
    setError("");
  };
  const choose = async (e: ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    if (!picked) return;
    reset();
    if (picked.size > 10 * 1024 * 1024) {
      setError("GPX and FIT files must be 10 MB or smaller.");
      e.target.value = "";
      return;
    }
    setLoading(true);
    try {
      ingest(await readTrackFile(picked, true), picked.name);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível ler esta run GPX ou FIT.",
      );
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  };
  const importStrava = async (activity: StravaActivity) => {
    reset();
    setLoading(true);
    try {
      ingest(streamsToPoints(await loadStravaStreams(activity.id)), activity.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível importar esta atividade do Strava.");
    } finally {
      setLoading(false);
    }
  };
  /** Shared path for files and Strava: validate, detect the trail, clean GPS. */
  const ingest = (parsed: Point[] | null | undefined, label: string) => {
    if (!parsed?.length || parsed.some((p: Point) => !p.time))
      throw new Error(
        "Este ficheiro não tem tempos utilizáveis. Escolhe uma exportação GPX ou FIT com tempos.",
      );
    const detected = detectTrail(parsed, data.trails);
    const detectedTrail = !manuallySelectedTrail.current && detected?.match.confidence === "high" ? detected.trail : undefined;
    if (detectedTrail && detected) {
      setTrailId(detectedTrail.id);
      setTrailDetection({ name: detectedTrail.name, score: detected.match.score });
    }
    const importTrail = detectedTrail ?? trail;
    // Clip a configured physical finish before quality cleanup. DJI Mimo
    // captures often keep recording after the line; removing that tail
    // first prevents its final jump from pulling valid finish points out of
    // the cleaned route.
    const capturedPoints = importTrail?.finishPoint
      ? clipToRouteFinish(parsed, importTrail.points, importTrail.finishPoint)
      : parsed;
    const quality = cleanTrack(capturedPoints, { removeImpossible: true });
    if (quality.points.length < 2)
      throw new Error("Este traçado tem poucos pontos válidos depois da limpeza do GPS.");
    setFile({ name: label });
    setPoints(quality.points);
    setGpsQuality(quality);
    setRideWindow(detectStops(quality.points));
    setName(label.replace(/\.(?:gpx|fit)$/i, ""));
    const firstTime = parsed[0]?.time;
    if (firstTime) setDate(new Date(firstTime).toISOString().slice(0, 10));
  };
  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!points || !file) return setError("Escolhe primeiro uma run GPX ou FIT.");
    if (!trail) return setError("Escolhe uma pista.");
    if (!bikeId) return setError("Escolhe a bike usada nesta run.");
    // Apply an explicit physical finish gate before matching and persisting.
    // This removes post-finish GPS capture for configured trails such as
    // Secret Spot Sameiro while preserving the original behavior elsewhere.
    const physicalTrail = trail.finishPoint
      ? clipToRouteFinish(trail.points, trail.points, trail.finishPoint)
      : trail.points;
    const ridePoints = trimToRideWindow && rideWindow
      ? clipToRideWindow(points, rideWindow.rideWindow)
      : points;
    const importedPoints = trail.finishPoint
      ? clipToRouteFinish(ridePoints, physicalTrail, trail.finishPoint)
      : ridePoints;
    let targetTrail =
      physicalTrail.length === trail.points.length
        ? trail
        : { ...trail, points: physicalTrail };
    let savedRuns = data.runs;
    if (!physicalTrail.length)
      targetTrail = {
        ...trail,
        points: importedPoints,
        boundaries: trail.boundaries,
        sectorNames: trail.sectorNames,
      };
    else {
      const match = matchRoute(importedPoints, physicalTrail, {
        startPoints: trail.startPoints,
      });
      const existingRuns = data.runs.filter((run) => run.trailId === trail.id);
      const replacingDemoRoute =
        existingRuns.length > 0 && existingRuns.every((run) => run.synthetic);
      if (!match.ok && !replacingDemoRoute)
        return setError(
          match.reason ?? "Esta run não coincide com a rota da pista escolhida.",
        );
      if (replacingDemoRoute) {
        if (!match.ok) targetTrail = { ...trail, points: importedPoints };
        // A first real file becomes the source of truth for this demo trail;
        // leave other demo trails available while removing stale sample runs.
        savedRuns = data.runs.filter(
          (run) => !(run.trailId === trail.id && run.synthetic),
        );
      }
    }
    const runId = uid("run");
    const next = {
      ...data,
      trails: data.trails.map((t) => (t.id === trail.id ? targetTrail : t)),
      runs: [
        ...savedRuns,
        {
          id: runId,
          trailId,
          bikeId,
          name: name.trim() || file.name,
          date,
          points: importedPoints,
          notes: "",
          ...(conditions ? { conditions } : {}),
          bikeSetupSnapshot: (() => {
            const bike = data.bikes.find((item) => item.id === bikeId);
            return bike
              ? {
                  suspensionSetup: bike.suspensionSetup ?? "",
                  sag: bike.sag ?? "",
                  rebound: bike.rebound ?? "",
                  pressure: bike.pressure ?? "",
                  tyres: bike.tyres ?? "",
                  wheels: bike.wheels ?? "",
                  notes: bike.notes ?? "",
                }
              : undefined;
          })(),
        },
      ],
      demo: false,
    };
    if (onChange(next) === false) return;
    // A live recording's crash copy is only dropped once the run is saved.
    if (file.recorded) clearRecording(scope);
    onImported(trailId, runId);
    setFile(null);
    setPoints(null);
    setRideWindow(null);
    setTrimToRideWindow(false);
    setError("");
  };
  const telemetryResult = useMemo(() => {
    if (!points) return { value: null, error: "" };
    try {
      return { value: analyze(points), error: "" };
    } catch (err) {
      return {
        value: null,
        error:
          err instanceof Error ? err.message : "Não foi possível analisar esta rota.",
      };
    }
  }, [points]);
  const telemetry = telemetryResult.value;
  return (
    <Section title="Importar run">
      <p className="muted">
        GPX ou FIT com tempos, até 10 MB. A rota é comparada com a pista antes de guardar.
      </p>
      {trail?.finishPoint && (
        <p className="muted import-finish-note">
          Esta pista tem meta: os pontos GPS gravados depois da chegada são
          cortados automaticamente.
          {trail.startPoints?.length
            ? ` Aceita partidas alternativas; ${trail.leadInName ?? "o troço acima da partida principal"} conta como setor 0.`
            : ""}
        </p>
      )}
      <button
        className="button secondary"
        disabled={loading}
        onClick={() => inputRef.current?.click()}
      >
        <FileUp size={16} />
        {loading ? "A ler atividade…" : "Escolher ficheiro GPX ou FIT"}
      </button>
      <input
        ref={inputRef}
        hidden
        type="file"
        accept=".gpx,.fit,application/gpx+xml,application/octet-stream"
        onChange={choose}
      />
      <RunRecorder
        scope={scope}
        disabled={loading}
        onFinish={(track, label) => {
          reset();
          ingest(track, label);
          setFile({ name: label, recorded: true });
        }}
      />
      <StravaPicker cloud={cloud} version={stravaVersion} disabled={loading} onPick={(activity) => void importStrava(activity)} />
      {file && points && (
        <div className="file-preview">
          <strong>{file.name}</strong>
          <span className="muted">
            {points.length.toLocaleString("pt-PT")} pontos ·{" "}
            {telemetry ? formatTime(telemetry.duration) : "—"} · pronta a guardar
          </span>
        </div>
      )}
      {gpsQuality && (gpsQuality.confidence !== "good" || gpsQuality.maxObservedSpeedKmh > 120) && (
        <p className={`import-quality-note ${gpsQuality.confidence === "poor" ? "poor" : "review"}`} role="status">
          <CircleAlert size={15} />
          {gpsQuality.removedPoints.length
            ? `${gpsQuality.removedPoints.length} ${gpsQuality.removedPoints.length === 1 ? "pico de GPS removido" : "picos de GPS removidos"} antes da análise.`
            : "O GPS precisa de uma revisão rápida antes de perseguires esta run."}{" "}
          {gpsQuality.maxObservedSpeedKmh > 120 && `Pico num segmento: ${Math.round(gpsQuality.maxObservedSpeedKmh)} km/h.`}
        </p>
      )}
      {trailDetection && (
          <p className="import-trail-note" role="status">
          <MapPin size={15} />
          Pista detetada automaticamente: <strong>{trailDetection.name}</strong>
          <span>{Math.round(trailDetection.score * 100)}% de confiança na rota. Confirma o traçado GPS e a pista antes de guardar.</span>
        </p>
      )}
      {points && telemetry && trail && (
        <section className="import-preview" aria-label="Revisão da rota importada">
          <div className="import-preview-heading">
            <div>
              <strong>Pré-visualização</strong>
              <span>Confirma a partida e a chegada antes de guardar.</span>
            </div>
            <span className="mono">{points.length.toLocaleString("pt-PT")} pontos</span>
          </div>
          <TrailMap
            trail={trail}
            current={telemetry}
            ghost={trail.points.length > 1 ? analyze(trail.points) : telemetry}
            progress={0}
            sector={null}
            onProgress={() => undefined}
          />
        </section>
      )}
      {rideWindow && rideWindow.stops.length > 0 && (
        <label className="import-trim-toggle">
          <input
            type="checkbox"
            checked={trimToRideWindow}
            onChange={(event) => setTrimToRideWindow(event.target.checked)}
          />
          <span>
            <strong>Cortar para a parte a andar</strong>
            <small>
              {rideWindow.stops.length} {rideWindow.stops.length === 1 ? "pausa detetada" : "pausas detetadas"} · janela ativa {formatTime(rideWindow.rideWindow.duration)}. Remove o início e o fim parados antes de guardar.
            </small>
          </span>
        </label>
      )}
      <form className="form-grid" onSubmit={save}>
        <label className="field">
          Pista
          <select value={trailId} onChange={(e) => { manuallySelectedTrail.current = true; setTrailId(e.target.value); setTrailDetection(null); }}>
            <option value="">Escolher pista</option>
            {data.trails.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Bike
          <select value={bikeId} onChange={(e) => setBikeId(e.target.value)}>
            <option value="">Escolher bike</option>
            {data.bikes.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Nome da run
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          Piso
          <select value={conditions} onChange={(e) => setConditions(e.target.value as RunConditions | "")}>
            <option value="">Não indicado</option>
            {CONDITIONS.map((value) => (
              <option key={value} value={value}>{CONDITION_LABELS[value]}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Data
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <div className="form-actions">
          <button
            className="button primary"
            type="submit"
            disabled={!points || !!telemetryResult.error}
          >
            <Save size={16} />
            Guardar run
          </button>
        </div>
      </form>
      <ErrorLine message={error || telemetryResult.error} />
    </Section>
  );
}
