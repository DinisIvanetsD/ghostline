import { analyze } from "./analysis";
import {
  createDemoData,
  SECRET_SPOT_FINISH,
  SECRET_SPOT_STARTS,
} from "./demo";
import { clipToRouteFinish } from "./routeMatch";
import type { AppData, Bike, Point, Profile, Run, Trail } from "../types";
const KEY = "ghostline.data.v1";
let storageWarning = "";
const metersBetween = (a: Pick<Point, "lat" | "lon">, b: Pick<Point, "lat" | "lon">) => {
  const rad = Math.PI / 180;
  return Math.hypot(
    (b.lon - a.lon) * rad * 6_371_000 * Math.cos(((a.lat + b.lat) * rad) / 2),
    (b.lat - a.lat) * rad * 6_371_000,
  );
};
const retime = (run: Run, route: Point[]): Point[] => {
  const start = run.points[0]?.time ?? 0;
  const duration = Math.max(0, (run.points.at(-1)?.time ?? start) - start);
  return route.map((point, index) => ({
    ...point,
    time: start + (index / Math.max(1, route.length - 1)) * duration,
  }));
};
const LEGACY_SECRET_FINISH = { lat: 41.553, lon: -8.37221 } as const;
const fail = (m: string): never => {
  throw new Error(`Invalid GHOSTLINE data: ${m}`);
};
const str = (v: unknown, l: string, req = true): string => {
  if (typeof v !== "string" || (req && !v.trim()))
    fail(`${l} must be a non-empty string`);
  return v as string;
};
const optionalStr = (v: unknown, l: string): string =>
  v === undefined ? "" : str(v, l, false);
const num = (v: unknown, l: string): number => {
  if (typeof v !== "number" || !Number.isFinite(v)) fail(`${l} must be finite`);
  return v as number;
};
const pts = (v: unknown, l: string, empty: boolean): Point[] => {
  if (
    !Array.isArray(v) ||
    (v.length < 2 && (!empty || v.length === 1)) ||
    v.length > 25000
  )
    fail(`${l} has an invalid point count`);
  return (v as unknown[]).map((x: unknown, i: number) => {
    const p = (
      x && typeof x === "object" ? x : fail(`${l}[${i}] is invalid`)
    ) as Record<string, unknown>;
    if (
      (typeof p.lat === "number" && (p.lat < -90 || p.lat > 90)) ||
      (typeof p.lon === "number" && (p.lon < -180 || p.lon > 180))
    )
      fail(`${l}[${i}] coordinates out of range`);
    return {
      lat: num(p.lat, `${l}[${i}].lat`),
      lon: num(p.lon, `${l}[${i}].lon`),
      ele: num(p.ele, `${l}[${i}].ele`),
      time: num(p.time, `${l}[${i}].time`),
    };
  });
};
const unique = (xs: { id: string }[], label: string) => {
  const s = new Set<string>();
  xs.forEach((x) => {
    if (s.has(x.id)) fail(`${label} IDs must be unique`);
    s.add(x.id);
  });
};
export function validateData(input: unknown): AppData {
  if (!input || typeof input !== "object") fail("root must be an object");
  const v = input as Record<string, unknown>;
  if (v.version !== 1) fail("unsupported version");
  const p = (
    v.profile && typeof v.profile === "object"
      ? v.profile
      : fail("profile is required")
  ) as Record<string, unknown>;
  const profile: Profile = {
    name: str(p.name, "profile.name"),
    email: str(p.email, "profile.email", false),
    home: str(p.home, "profile.home", false),
  };
  if (
    !Array.isArray(v.bikes) ||
    !Array.isArray(v.trails) ||
    !Array.isArray(v.runs)
  )
    fail("collections must be arrays");
  const bikes: Bike[] = (v.bikes as unknown[]).map((x: unknown, i: number) => {
    const b = (
      x && typeof x === "object" ? x : fail(`bikes[${i}] is invalid`)
    ) as Record<string, unknown>;
    return {
      id: str(b.id, `bikes[${i}].id`),
      name: str(b.name, `bikes[${i}].name`),
      brand: str(b.brand, `bikes[${i}].brand`, false),
      travel: num(b.travel, `bikes[${i}].travel`),
      type: str(b.type, `bikes[${i}].type`),
      ...(b.suspensionSetup !== undefined
        ? { suspensionSetup: optionalStr(b.suspensionSetup, `bikes[${i}].suspensionSetup`) }
        : {}),
      ...(b.tyres !== undefined
        ? { tyres: optionalStr(b.tyres, `bikes[${i}].tyres`) }
        : {}),
      ...(b.wheels !== undefined
        ? { wheels: optionalStr(b.wheels, `bikes[${i}].wheels`) }
        : {}),
      ...(b.notes !== undefined
        ? { notes: optionalStr(b.notes, `bikes[${i}].notes`) }
        : {}),
      ...(b.lastService !== undefined
        ? { lastService: optionalStr(b.lastService, `bikes[${i}].lastService`) }
        : {}),
    };
  });
  const trails: Trail[] = (v.trails as unknown[]).map(
    (x: unknown, i: number) => {
      const t = (
        x && typeof x === "object" ? x : fail(`trails[${i}] is invalid`)
      ) as Record<string, unknown>;
      const bs = Array.isArray(t.boundaries)
        ? (t.boundaries as unknown[])
        : fail(`trails[${i}].boundaries are invalid`);
      if (
        bs.some(
          (n: unknown, j: number) =>
            typeof n !== "number" ||
            !Number.isFinite(n) ||
            n <= 0 ||
            n >= 1 ||
            (j > 0 && n <= (bs[j - 1] as number)),
        )
      )
        fail(`trails[${i}].boundaries are invalid`);
      const ns = Array.isArray(t.sectorNames)
        ? (t.sectorNames as unknown[])
        : fail(`trails[${i}].sectorNames are invalid`);
      if (
        ns.length !== bs.length + 1 ||
        ns.some((n: unknown) => typeof n !== "string" || !n.trim())
      )
        fail(`trails[${i}].sectorNames are invalid`);
      const finishPoint =
        t.finishPoint && typeof t.finishPoint === "object"
          ? (() => {
              const fp = t.finishPoint as Record<string, unknown>;
              return {
                lat: num(fp.lat, `trails[${i}].finishPoint.lat`),
                lon: num(fp.lon, `trails[${i}].finishPoint.lon`),
              };
            })()
          : undefined;
      const startPoints = Array.isArray(t.startPoints)
        ? (t.startPoints as unknown[]).map((value, j) => {
            if (!value || typeof value !== "object")
              fail(`trails[${i}].startPoints[${j}] is invalid`);
            const point = value as Record<string, unknown>;
            return {
              lat: num(point.lat, `trails[${i}].startPoints[${j}].lat`),
              lon: num(point.lon, `trails[${i}].startPoints[${j}].lon`),
            };
          })
        : undefined;
      return {
        id: str(t.id, `trails[${i}].id`),
        name: str(t.name, `trails[${i}].name`),
        location: str(t.location, `trails[${i}].location`, false),
        difficulty: str(t.difficulty, `trails[${i}].difficulty`),
        points: pts(t.points, `trails[${i}].points`, true),
        boundaries: [...bs] as number[],
        sectorNames: [...ns] as string[],
        ...(startPoints?.length ? { startPoints } : {}),
        ...(finishPoint ? { finishPoint } : {}),
      };
    },
  );
  const runs: Run[] = (v.runs as unknown[]).map((x, i) => {
    const r = (
      x && typeof x === "object" ? x : fail(`runs[${i}] is invalid`)
    ) as Record<string, unknown>;
    if (
      typeof r.date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(r.date) ||
      !Number.isFinite(Date.parse(r.date))
    )
      fail(`runs[${i}].date is invalid`);
    const rp = pts(r.points, `runs[${i}].points`, false);
    try {
      analyze(rp);
    } catch (e) {
      fail(
        `runs[${i}] telemetry invalid: ${e instanceof Error ? e.message : "analysis failed"}`,
      );
    }
    return {
      id: str(r.id, `runs[${i}].id`),
      trailId: str(r.trailId, `runs[${i}].trailId`),
      bikeId: str(r.bikeId, `runs[${i}].bikeId`),
      name: str(r.name, `runs[${i}].name`),
      date: str(r.date, `runs[${i}].date`),
      points: rp,
      notes: str(r.notes, `runs[${i}].notes`, false),
      ...(typeof r.synthetic === "boolean" ? { synthetic: r.synthetic } : {}),
    } as Run;
  });
  unique(bikes, "Bike");
  unique(trails, "Trail");
  unique(runs, "Run");
  const bi = new Set(bikes.map((x) => x.id)),
    ti = new Set(trails.map((x) => x.id));
  runs.forEach((r) => {
    if (!bi.has(r.bikeId)) fail(`run ${r.id} references missing bike`);
    if (!ti.has(r.trailId)) fail(`run ${r.id} references missing trail`);
  });
  return { version: 1, profile, bikes, trails, runs, demo: v.demo === true };
}
export function readStorageWarning(): string {
  return storageWarning;
}
export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      storageWarning = "";
      return createDemoData();
    }
    const data = validateData(JSON.parse(raw));
    // Replace the untouched Sintra demo on first load after the Braga content
    // upgrade. The shape check keeps edited or imported local workspaces safe.
    if (
      data.demo &&
      data.profile.home === "Sintra, Portugal" &&
      data.bikes.length === 2 &&
      data.trails.length === 2 &&
      data.runs.length === 9 &&
      data.trails.every((trail) =>
        ["pedra-branca", "fojo"].includes(trail.id),
      )
    ) {
      const upgraded = createDemoData();
      localStorage.setItem(KEY, JSON.stringify(upgraded));
      storageWarning = "";
      return upgraded;
    }
    // Keep an existing Braga demo aligned with the named local spots after a
    // content-only update. The exact shape check avoids touching rider data.
    if (
      data.demo &&
      data.profile.home === "Braga, Portugal" &&
      data.bikes.length === 2 &&
      data.trails.length === 3 &&
      data.runs.length === 11 &&
      data.trails.every((trail) =>
        ["Mundial", "Free Ride", "Secret Spot"].includes(trail.name),
      )
    ) {
      const upgraded = createDemoData();
      localStorage.setItem(KEY, JSON.stringify(upgraded));
      storageWarning = "";
      return upgraded;
    }
    // Refresh an untouched Braga demo created before the canonical Secret
    // Spot geometry and physical finish gate were added. User edits and
    // imported rides set demo=false, so this cannot overwrite rider work.
    if (
      data.demo &&
      data.profile.home === "Braga, Portugal" &&
      data.bikes.length === 2 &&
      data.trails.length === 3 &&
      data.runs.length === 11 &&
      data.trails.some((trail) => trail.id === "secret-spot" && !trail.finishPoint)
    ) {
      const upgraded = createDemoData();
      localStorage.setItem(KEY, JSON.stringify(upgraded));
      storageWarning = "";
      return upgraded;
    }
    // A rider may already have imported a Secret Spot file before the finish
    // gate existed. Add the canonical gate and trim only that trail's old
    // post-finish GPS tail; every other trail remains byte-for-byte intact.
    const secret = data.trails.find((trail) => trail.id === "secret-spot");
    const secretRuns = data.runs.filter((run) => run.trailId === "secret-spot");
    const canonicalSecret = secret
      ? createDemoData().trails.find((trail) => trail.id === "secret-spot")
      : undefined;
    // An older demo could have been personalized (which sets demo=false)
    // while retaining its old synthetic Secret Spot route. Replace that stale
    // geometry with the rider-defined gate route in the same load pass.
    const staleSyntheticSecret =
      secret &&
      canonicalSecret &&
      secretRuns.length > 0 &&
      secretRuns.every((run) => run.synthetic) &&
      metersBetween(secret.points.at(-1) ?? SECRET_SPOT_FINISH, SECRET_SPOT_FINISH) > 250;
    const legacySecretRoute =
      secret &&
      canonicalSecret &&
      metersBetween(secret.points[0] ?? SECRET_SPOT_STARTS[0], SECRET_SPOT_STARTS[0]) < 200 &&
      metersBetween(secret.points.at(-1) ?? LEGACY_SECRET_FINISH, LEGACY_SECRET_FINISH) < 250 &&
      metersBetween(secret.points.at(-1) ?? LEGACY_SECRET_FINISH, SECRET_SPOT_FINISH) > 500;
    const replaceSecretRoute = Boolean(staleSyntheticSecret || legacySecretRoute);
    if (secret) {
      const finishPoint = SECRET_SPOT_FINISH;
      const physicalPoints = replaceSecretRoute
        ? canonicalSecret!.points
        : clipToRouteFinish(secret.points, secret.points, finishPoint);
      const runs = data.runs.map((run) =>
        run.trailId === secret.id
          ? {
              ...run,
              points: replaceSecretRoute && run.synthetic
                ? retime(run, canonicalSecret!.points)
                : clipToRouteFinish(run.points, secret.points, finishPoint),
            }
          : run,
      );
      const previousLast = secret.points.at(-1);
      const physicalLast = physicalPoints.at(-1);
      const previousStarts = secret.startPoints ?? [];
      const startsChanged =
        previousStarts.length !== SECRET_SPOT_STARTS.length ||
        SECRET_SPOT_STARTS.some(
          (point, index) =>
            previousStarts[index]?.lat !== point.lat ||
            previousStarts[index]?.lon !== point.lon,
        );
      const trailChanged =
        !secret.finishPoint ||
        secret.finishPoint.lat !== finishPoint.lat ||
        secret.finishPoint.lon !== finishPoint.lon ||
        startsChanged ||
        physicalPoints.length !== secret.points.length ||
        physicalLast?.lat !== previousLast?.lat ||
        physicalLast?.lon !== previousLast?.lon;
      const runsChanged = data.runs.some((run, index) => {
        const next = runs[index];
        return (
          run.points.length !== next.points.length ||
          run.points.at(-1)?.lat !== next.points.at(-1)?.lat ||
          run.points.at(-1)?.lon !== next.points.at(-1)?.lon
        );
      });
      if (trailChanged || runsChanged) {
        const trails = data.trails.map((trail) =>
          trail.id === secret.id
            ? {
                ...trail,
                points: physicalPoints,
                startPoints: [...SECRET_SPOT_STARTS],
                finishPoint,
              }
            : trail,
        );
        const upgraded = validateData({ ...data, trails, runs });
        localStorage.setItem(KEY, JSON.stringify(upgraded));
        storageWarning = "";
        return upgraded;
      }
    }
    storageWarning = "";
    return data;
  } catch (e) {
    storageWarning = `Saved GHOSTLINE data could not be loaded (${e instanceof Error ? e.message : "storage unavailable"}). A demo workspace is shown; your original data remains until you explicitly save.`;
    return createDemoData();
  }
}
export function saveData(data: AppData): void {
  localStorage.setItem(KEY, JSON.stringify(validateData(data)));
  storageWarning = "";
}
export function parseBackup(text: string): AppData {
  if (!text.trim()) fail("backup is empty");
  return validateData(JSON.parse(text));
}
export function downloadData(data: AppData): void {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(validateData(data), null, 2)], {
      type: "application/json",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "ghostline-backup.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
