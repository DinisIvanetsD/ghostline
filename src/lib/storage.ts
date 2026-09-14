import { analyze } from "./analysis";
import { createDemoData } from "./demo";
import type { AppData, Bike, Point, Profile, Run, Trail } from "../types";
const KEY = "ghostline.data.v1";
let storageWarning = "";
const fail = (m: string): never => {
  throw new Error(`Invalid GHOSTLINE data: ${m}`);
};
const str = (v: unknown, l: string, req = true): string => {
  if (typeof v !== "string" || (req && !v.trim()))
    fail(`${l} must be a non-empty string`);
  return v as string;
};
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
      return {
        id: str(t.id, `trails[${i}].id`),
        name: str(t.name, `trails[${i}].name`),
        location: str(t.location, `trails[${i}].location`, false),
        difficulty: str(t.difficulty, `trails[${i}].difficulty`),
        points: pts(t.points, `trails[${i}].points`, true),
        boundaries: [...bs] as number[],
        sectorNames: [...ns] as string[],
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
