import type { Point } from "../types";

/** Fixes worse than this are dropped; phone GPS under trees often reports 30–60 m. */
export const MAX_ACCURACY_METERS = 30;
// Scoped per rider so an interrupted trace is never offered to someone else.
const recordingKey = (scope: string) => `ghostline.recording.v1.${encodeURIComponent(scope)}`;

export interface GpsFix {
  latitude: number;
  longitude: number;
  altitude: number | null;
  accuracy: number;
  timestamp: number;
}

/** Turn a browser position into a track point, or null when it should be skipped. */
export function acceptFix(fix: GpsFix, previous?: Point): Point | null {
  if (
    !Number.isFinite(fix.latitude) ||
    !Number.isFinite(fix.longitude) ||
    Math.abs(fix.latitude) > 90 ||
    Math.abs(fix.longitude) > 180 ||
    !(fix.accuracy <= MAX_ACCURACY_METERS) ||
    (previous && fix.timestamp <= previous.time)
  )
    return null;
  return {
    lat: fix.latitude,
    lon: fix.longitude,
    // Phones without a barometer report null altitude; keep the last known one.
    ele: Number.isFinite(fix.altitude) ? (fix.altitude as number) : (previous?.ele ?? 0),
    time: fix.timestamp,
  };
}

/** Keep an in-progress recording so a reload or a closed tab does not lose the run. */
export function saveRecording(scope: string, points: Point[]): void {
  try {
    localStorage.setItem(recordingKey(scope), JSON.stringify(points));
  } catch {
    // Storage full or blocked: the recording continues in memory.
  }
}

export function loadRecording(scope: string): Point[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(recordingKey(scope)) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter(
          (p): p is Point =>
            p && [p.lat, p.lon, p.ele, p.time].every((v) => typeof v === "number" && Number.isFinite(v)),
        )
      : [];
  } catch {
    return [];
  }
}

export function clearRecording(scope: string): void {
  try {
    localStorage.removeItem(recordingKey(scope));
  } catch {
    // Nothing to clear.
  }
}
