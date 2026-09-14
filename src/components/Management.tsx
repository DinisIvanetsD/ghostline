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
  MapPin,
  Pencil,
  Plus,
  Save,
  Trash2,
  Upload,
  UserRound,
} from "lucide-react";
import { parseGPX } from "../lib/gpx";
import { analyze, formatTime } from "../lib/analysis";
import { clipToRouteFinish, matchRoute } from "../lib/routeMatch";
import type { AppData, Bike, Point, Profile, Trail } from "../types";

type Props = { data: AppData; onChange: (data: AppData) => boolean | void };
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
const parseBoundaries = (raw: string) => {
  const values = raw.trim() ? raw.split(",").map((v) => Number(v.trim())) : [];
  if (
    values.some((v) => !Number.isFinite(v) || v <= 0 || v >= 1) ||
    values.some((v, i) => i > 0 && v <= values[i - 1])
  )
    throw new Error(
      "Boundaries must be strictly increasing numbers between 0 and 1.",
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
  };
  const [draft, setDraft] = useState<Bike>(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const linkedRuns = data.runs.filter((run) => data.bikes.some((bike) => bike.id === run.bikeId));
  const coveredTrails = new Set(linkedRuns.map((run) => run.trailId)).size;
  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.name.trim()) return setError("Give this bike a name.");
    const next = clone(data);
    const bike = {
      ...draft,
      id: editing ?? uid("bike"),
      name: draft.name.trim(),
      brand: draft.brand.trim(),
      travel: Number(draft.travel) || 0,
    };
    next.bikes = editing
      ? next.bikes.map((b) => (b.id === editing ? bike : b))
      : [...next.bikes, bike];
    if (onChange(next) === false) return;
    setDraft(empty);
    setEditing(null);
    setError("");
  };
  const remove = (id: string) => {
    if (data.runs.some((r) => r.bikeId === id))
      return setError(
        "This bike is referenced by saved runs. Remove those runs first.",
      );
    if (!window.confirm("Delete this bike?")) return;
    onChange({
      ...data,
      demo: false,
      bikes: data.bikes.filter((b) => b.id !== id),
    });
  };
  return (
    <div className="management-stack">
      <Section
        title="Garage"
        action={
          <span className="muted">
            {data.bikes.length} bike{data.bikes.length === 1 ? "" : "s"}
          </span>
        }
      >
        <p className="muted">
          Keep the machines behind every split. Travel is recorded in
          millimetres.
        </p>
        <div className="garage-overview" aria-label="Garage overview">
          <div className="garage-stat">
            <span>Machines</span>
            <strong className="mono">{data.bikes.length}</strong>
            <small>{data.bikes.length === 1 ? "Bike in the garage" : "Bikes in the garage"}</small>
          </div>
          <div className="garage-stat">
            <span>Linked runs</span>
            <strong className="mono">{linkedRuns.length}</strong>
            <small>Runs ready for comparison</small>
          </div>
          <div className="garage-stat">
            <span>Trails covered</span>
            <strong className="mono">{coveredTrails}</strong>
            <small>Across the current workspace</small>
          </div>
        </div>
        <form className="garage-form" onSubmit={save}>
          <div className="garage-form-heading">
            <div>
              <h3>{editing ? "Edit machine" : "Add a machine"}</h3>
              <p className="muted">
                {editing
                  ? "Update the setup details used in your run history."
                  : "Give every run a bike setup so your comparisons stay honest."}
              </p>
            </div>
            {editing && <span className="garage-form-state">Editing</span>}
          </div>
          <div className="form-grid">
          <label className="field">
            Name
            <input
              autoComplete="off"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <label className="field">
            Brand
            <input
              autoComplete="organization"
              value={draft.brand}
              onChange={(e) => setDraft({ ...draft, brand: e.target.value })}
            />
          </label>
          <label className="field">
            Type
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
            Travel (mm)
            <input
              type="number"
              min="0"
              value={draft.travel}
              onChange={(e) =>
                setDraft({ ...draft, travel: Number(e.target.value) })
              }
            />
          </label>
          <div className="form-actions">
            <button className="button primary" type="submit">
              <Save size={16} />
              {editing ? "Update bike" : "Add bike"}
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
              Cancel
              </button>
            )}
          </div>
          </div>
        </form>
        <ErrorLine message={error} />
        {data.bikes.length === 0 ? (
          <div className="empty-state garage-empty">
            <BikeIcon size={24} />
            <strong>No bikes in the garage</strong>
            <span>Add the bike you ride so runs stay comparable.</span>
          </div>
        ) : (
          <div className="bike-grid">
            {data.bikes.map((b, index) => {
              const runs = data.runs.filter((run) => run.bikeId === b.id);
              const trails = new Set(runs.map((run) => run.trailId)).size;
              const latest = runs
                .slice()
                .sort((a, z) => z.date.localeCompare(a.date))[0];
              const fastestByTrail = new Map<string, { id: string; duration: number }>();
              runs.forEach((run) => {
                const duration = analyze(run.points).duration;
                const fastest = fastestByTrail.get(run.trailId);
                if (!fastest || duration < fastest.duration)
                  fastestByTrail.set(run.trailId, { id: run.id, duration });
              });
              const personalBests = runs.filter(
                (run) => fastestByTrail.get(run.trailId)?.id === run.id,
              ).length;
              return (
                <article className="bike-card" key={b.id}>
                  <div className="bike-card-heading">
                    <span className="bike-index mono">B{String(index + 1).padStart(2, "0")}</span>
                    <div className="bike-identity">
                      <h3>{b.name}</h3>
                      <p>{b.brand || "Brand not set"}</p>
                    </div>
                    <span className="bike-type">{b.type}</span>
                  </div>
                  <div className="bike-specs">
                    <div>
                      <span>Travel</span>
                      <strong className="mono">{b.travel ? `${b.travel} mm` : "—"}</strong>
                    </div>
                    <div>
                      <span>Runs</span>
                      <strong className="mono">{runs.length}</strong>
                    </div>
                    <div>
                      <span>PB runs</span>
                      <strong className="mono">{personalBests}</strong>
                    </div>
                  </div>
                  <div className="bike-card-footer">
                    <span className="muted">
                      {runs.length
                        ? `${trails} trail${trails === 1 ? "" : "s"} · last ${latest?.date ?? "—"}`
                        : "No runs linked yet"}
                    </span>
                    <div className="row-actions">
                      <button
                        className="icon-button"
                        title={`Edit ${b.name}`}
                        aria-label={`Edit ${b.name}`}
                        onClick={() => {
                          setEditing(b.id);
                          setDraft(b);
                        }}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        className="icon-button danger"
                        title={`Delete ${b.name}`}
                        aria-label={`Delete ${b.name}`}
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

export function ProfileSettings({ data, onChange }: Props) {
  const [profile, setProfile] = useState<Profile>(data.profile);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const save = (e: FormEvent) => {
    e.preventDefault();
    const name = profile.name.trim();
    if (!name) return setError("Rider name is required.");
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
    <Section title="Rider profile">
      <p className="muted">
        Your profile lives on this device. GHOSTLINE does not create an account
        or store a password here.
      </p>
      <form className="form-grid" onSubmit={save}>
        <label className="field">
          Rider name
          <input
            value={profile.name}
            onChange={(e) => setProfile({ ...profile, name: e.target.value })}
          />
        </label>
        <label className="field">
          Email <span className="muted">optional</span>
          <input
            type="email"
            value={profile.email}
            onChange={(e) => setProfile({ ...profile, email: e.target.value })}
          />
        </label>
        <label className="field">
          Home trails
          <input
            value={profile.home}
            onChange={(e) => setProfile({ ...profile, home: e.target.value })}
          />
        </label>
        <div className="form-actions">
          <button className="button primary" type="submit">
            <UserRound size={16} />
            Save profile
          </button>
          {saved && (
            <span className="muted">
              <Check size={15} /> Saved locally
            </span>
          )}
        </div>
      </form>
      <ErrorLine message={error} />
    </Section>
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
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const open = (trail?: Trail) => {
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
            (_, i) => `Sector ${String(i + 1).padStart(2, "0")}`,
          ).join(", "),
    );
    setError("");
  };
  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError("Name this trail.");
    let parsed: number[];
    try {
      parsed = parseBoundaries(boundaries);
    } catch (err) {
      return setError(
        err instanceof Error ? err.message : "Invalid boundaries.",
      );
    }
    const count = parsed.length + 1;
    const names = sectorNames
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    if (names.length && names.length !== count)
      return setError(
        `Enter exactly ${count} sector names, separated by commas.`,
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
            (_, i) => `Sector ${String(i + 1).padStart(2, "0")}`,
          ),
      ...(existing?.startPoints ? { startPoints: existing.startPoints } : {}),
      ...(existing?.finishPoint ? { finishPoint: existing.finishPoint } : {}),
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
      if (!points?.length) throw new Error("No route points found.");
      const trail: Trail = {
        id: uid("trail"),
        name: file.name.replace(/\.(?:gpx|fit)$/i, ""),
        location: "",
        difficulty: "Black",
        points,
        boundaries: [0.25, 0.5, 0.75],
        sectorNames: ["Sector 01", "Sector 02", "Sector 03", "Sector 04"],
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
          : "Could not read that GPX or FIT route.",
      );
    }
    e.target.value = "";
  };
  const remove = (id: string) => {
    const count = data.runs.filter((r) => r.trailId === id).length;
    if (
      count &&
      !window.confirm(
        `This trail has ${count} saved run${count === 1 ? "" : "s"}. Delete the trail and those runs?`,
      )
    )
      return;
    if (!window.confirm("Delete this trail?")) return;
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
      title="Trails"
      action={
        <button className="button primary" onClick={() => open()}>
          <Plus size={16} />
          New trail
        </button>
      }
    >
      <p className="muted">
        Build a route from a GPX or FIT file, then tune sector splits to match
        your local timing.
      </p>
      <div className="trail-list">
        {data.trails.map((t) => (
          <div className="trail-row" key={t.id}>
            <div>
              <strong>{t.name}</strong>
              <span className="muted">
                <MapPin size={13} />
                {t.location || "Location not set"} · {t.difficulty}
              </span>
            </div>
            <div className="row-actions">
              <button
                className="button secondary"
                onClick={() => onSelect(t.id)}
              >
                Select analysis
              </button>
              <button
                className="icon-button"
                title={`Edit ${t.name}`}
                onClick={() => open(t)}
              >
                <Pencil size={15} />
              </button>
              <button
                className="icon-button danger"
                title={`Delete ${t.name}`}
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
          <strong>No trails yet</strong>
          <span>Import a route to start comparing runs.</span>
        </div>
      )}
      <div className="trail-editor">
        <h3>{selected ? "Edit trail" : "New trail"}</h3>
        <form className="form-grid" onSubmit={save}>
          <label className="field">
            Trail name
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            Location
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </label>
          <label className="field">
            Difficulty
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
            >
              <option>Green</option>
              <option>Blue</option>
              <option>Red</option>
              <option>Black</option>
              <option>Double black</option>
            </select>
          </label>
          <label className="field">
            Sector boundaries{" "}
            <span className="muted">fractions, comma separated</span>
            <input
              value={boundaries}
              onChange={(e) => setBoundaries(e.target.value)}
              placeholder="0.25, 0.5, 0.75"
            />
            <small className="muted">0 and 1 are added automatically.</small>
          </label>
          <label className="field">
            Sector names{" "}
            <span className="muted">optional, comma separated</span>
            <input
              value={sectorNames}
              onChange={(e) => setSectorNames(e.target.value)}
              placeholder="Start, Rock garden, Finish"
            />
          </label>
          <div className="form-actions">
            <button className="button primary" type="submit">
              <Save size={16} />
              Save trail
            </button>
            {selected && (
              <button
                className="button secondary"
                type="button"
                onClick={() => open()}
              >
                Clear
              </button>
            )}
          </div>
        </form>
        <button
          className="button secondary"
          onClick={() => inputRef.current?.click()}
        >
          <Upload size={16} />
          Import GPX / FIT route
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
}: Props & { onImported: (trailId: string, runId: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [points, setPoints] = useState<Point[] | null>(null);
  const [trailId, setTrailId] = useState(data.trails[0]?.id ?? "");
  const [bikeId, setBikeId] = useState(data.bikes[0]?.id ?? "");
  const [name, setName] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const trail = useMemo(
    () => data.trails.find((t) => t.id === trailId),
    [data.trails, trailId],
  );
  const choose = async (e: ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    if (!picked) return;
    setFile(null);
    setPoints(null);
    setError("");
    if (picked.size > 10 * 1024 * 1024) {
      setError("GPX and FIT files must be 10 MB or smaller.");
      e.target.value = "";
      return;
    }
    setLoading(true);
    try {
      const parsed = await readTrackFile(picked, true);
      if (!parsed?.length || parsed.some((p: Point) => !p.time))
        throw new Error(
          "This file has no usable timestamps. Choose a timestamped GPX or FIT ride export.",
        );
      setFile(picked);
      setPoints(parsed);
      setName(picked.name.replace(/\.(?:gpx|fit)$/i, ""));
      const firstTime = parsed[0]?.time;
      if (firstTime) setDate(new Date(firstTime).toISOString().slice(0, 10));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not read this GPX or FIT run.",
      );
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  };
  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!points || !file) return setError("Choose a GPX or FIT run first.");
    if (!trail) return setError("Choose a trail.");
    if (!bikeId) return setError("Choose the bike used for this run.");
    // Apply an explicit physical finish gate before matching and persisting.
    // This removes post-finish GPS capture for configured trails such as
    // Secret Spot Sameiro while preserving the original behavior elsewhere.
    const physicalTrail = trail.finishPoint
      ? clipToRouteFinish(trail.points, trail.points, trail.finishPoint)
      : trail.points;
    const importedPoints = trail.finishPoint
      ? clipToRouteFinish(points, physicalTrail, trail.finishPoint)
      : points;
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
          match.reason ?? "This run does not match the selected trail route.",
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
        },
      ],
      demo: false,
    };
    if (onChange(next) === false) return;
    onImported(trailId, runId);
    setFile(null);
    setPoints(null);
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
          err instanceof Error ? err.message : "Could not analyse this route.",
      };
    }
  }, [points]);
  const telemetry = telemetryResult.value;
  return (
    <Section title="Import run">
      <p className="muted">
        Drop in a timestamped GPX or FIT export up to 10 MB. GHOSTLINE checks
        its route against the selected trail before saving.
      </p>
      {trail?.finishPoint && (
        <p className="muted import-finish-note">
          Secret Spot finish gate uses the marked endpoint and accepts either uphill
          access start. GPS points recorded after the finish are clipped
          automatically.
        </p>
      )}
      <button
        className="button secondary"
        disabled={loading}
        onClick={() => inputRef.current?.click()}
      >
        <FileUp size={16} />
        {loading ? "Reading activity…" : "Choose GPX or FIT file"}
      </button>
      <input
        ref={inputRef}
        hidden
        type="file"
        accept=".gpx,.fit,application/gpx+xml,application/octet-stream"
        onChange={choose}
      />
      {file && points && (
        <div className="file-preview">
          <strong>{file.name}</strong>
          <span className="muted">
            {points.length.toLocaleString()} points ·{" "}
            {telemetry ? formatTime(telemetry.duration) : "—"} · ready to save
          </span>
        </div>
      )}
      <form className="form-grid" onSubmit={save}>
        <label className="field">
          Trail
          <select value={trailId} onChange={(e) => setTrailId(e.target.value)}>
            <option value="">Choose trail</option>
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
            <option value="">Choose bike</option>
            {data.bikes.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Run name
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          Ride date
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
            Save run
          </button>
        </div>
      </form>
      <ErrorLine message={error || telemetryResult.error} />
    </Section>
  );
}
