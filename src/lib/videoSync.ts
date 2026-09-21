import type { Point, Run, Trail } from "../types";
import { analyze, timeAt } from "./analysis";

export interface StopDetectionOptions {
  speedThresholdKmh?: number;
  minDurationSeconds?: number;
}
export interface StopInterval { startTime: number; endTime: number; duration: number; startIndex: number; endIndex: number; }
export interface RideWindow { startTime: number; endTime: number; duration: number; }
export interface StopAnalysis { stops: StopInterval[]; rideWindow: RideWindow; }
export interface VideoSyncAnchor { runTime: number; videoTime: number; }
export interface VideoSyncSettings { offsetSeconds: number; playbackRate?: number; anchors?: VideoSyncAnchor[]; }
export interface SectorVideoWindow { index: number; name: string; runStartTime: number; runEndTime: number; videoStartTime: number; videoEndTime: number; duration: number; }

const DEFAULT_SPEED_THRESHOLD = 2;
const DEFAULT_MIN_STOP = 3;

function elapsedTimes(points: Point[]): number[] {
  if (points.length < 2) return points.map(() => 0);
  const scale = points.reduce((max, point) => Math.max(max, Math.abs(point.time)), 0) > 1e11 ? 1000 : 1;
  const start = points[0].time / scale;
  return points.map((point) => point.time / scale - start);
}

/** Finds contiguous low-speed periods and the moving portion of a run. */
export function detectStops(points: Point[], options: StopDetectionOptions = {}): StopAnalysis {
  if (points.length < 2) return { stops: [], rideWindow: { startTime: 0, endTime: 0, duration: 0 } };
  const threshold = options.speedThresholdKmh ?? DEFAULT_SPEED_THRESHOLD;
  const minimum = options.minDurationSeconds ?? DEFAULT_MIN_STOP;
  if (!Number.isFinite(threshold) || threshold < 0) throw new Error("Speed threshold must be a non-negative number");
  if (!Number.isFinite(minimum) || minimum < 0) throw new Error("Minimum stop duration must be a non-negative number");
  const times = elapsedTimes(points);
  const stopped = (i: number) => {
    const dt = times[i] - times[i - 1];
    if (!(dt > 0)) return false;
    const latDelta = (points[i].lat - points[i - 1].lat) * 111_320;
    const lonDelta = (points[i].lon - points[i - 1].lon) * 111_320 * Math.cos((points[i].lat * Math.PI) / 180);
    return (Math.sqrt(latDelta ** 2 + lonDelta ** 2) / dt) * 3.6 <= threshold;
  };
  const stops: StopInterval[] = [];
  let start = -1;
  const addStop = (end: number) => {
    if (start >= 0 && times[end] - times[start] >= minimum) stops.push({ startTime: times[start], endTime: times[end], duration: times[end] - times[start], startIndex: start, endIndex: end });
    start = -1;
  };
  for (let i = 1; i < points.length; i++) {
    if (stopped(i)) { if (start < 0) start = i - 1; }
    else if (start >= 0) addStop(i - 1);
  }
  if (start >= 0) addStop(points.length - 1);
  const moving = points
    .map((_, i) => i)
    .filter(
      (i) =>
        (i > 0 && !stopped(i)) ||
        (i < points.length - 1 && !stopped(i + 1)),
    );
  const startTime = moving.length ? times[moving[0]] : 0;
  const endTime = moving.length ? times[moving[moving.length - 1]] : times[times.length - 1];
  return { stops, rideWindow: { startTime, endTime, duration: Math.max(0, endTime - startTime) } };
}

/**
 * Returns the samples inside a detected moving window. We intentionally keep
 * the original samples (rather than inventing interpolated points) so FIT and
 * DJI timestamps stay auditable and strictly increasing.
 */
export function clipToRideWindow(points: Point[], window: RideWindow): Point[] {
  if (points.length < 2 || !Number.isFinite(window.startTime) || !Number.isFinite(window.endTime) || window.endTime <= window.startTime)
    return points;
  const scale = points.reduce((max, point) => Math.max(max, Math.abs(point.time)), 0) > 1e11 ? 1000 : 1;
  const start = points[0].time / scale;
  const clipped = points.filter((point) => {
    const elapsed = point.time / scale - start;
    return elapsed >= window.startTime && elapsed <= window.endTime;
  });
  return clipped.length >= 2 ? clipped : points;
}

function baseRate(settings: VideoSyncSettings): number {
  const rate = settings.playbackRate ?? 1;
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("Playback rate must be greater than zero");
  if (!Number.isFinite(settings.offsetSeconds)) throw new Error("Video offset must be finite");
  return rate;
}
function validAnchors(settings: VideoSyncSettings): VideoSyncAnchor[] {
  const sorted = [...(settings.anchors ?? [])]
    .filter((a) => Number.isFinite(a.runTime) && Number.isFinite(a.videoTime))
    .sort((a, b) => a.runTime - b.runTime);
  return sorted.filter(
    (anchor, index) =>
      index === 0 ||
      (anchor.runTime > sorted[index - 1].runTime &&
        anchor.videoTime > sorted[index - 1].videoTime),
  );
}

/** Maps run elapsed seconds onto the video timeline, using anchors when supplied. */
export function videoTimeForRun(runTime: number, settings: VideoSyncSettings): number {
  const rate = baseRate(settings);
  if (!Number.isFinite(runTime)) throw new Error("Run time must be finite");
  const anchors = validAnchors(settings);
  if (!anchors.length) return settings.offsetSeconds + runTime / rate;
  if (anchors.length === 1) return anchors[0].videoTime + (runTime - anchors[0].runTime) / rate;
  if (runTime <= anchors[0].runTime) { const a = anchors[0], b = anchors[1]; return a.videoTime + (runTime - a.runTime) * (b.videoTime - a.videoTime) / (b.runTime - a.runTime); }
  for (let i = 1; i < anchors.length; i++) if (runTime <= anchors[i].runTime) { const a = anchors[i - 1], b = anchors[i]; return a.videoTime + (runTime - a.runTime) * (b.videoTime - a.videoTime) / (b.runTime - a.runTime); }
  const a = anchors[anchors.length - 2], b = anchors[anchors.length - 1];
  return b.videoTime + (runTime - b.runTime) * (b.videoTime - a.videoTime) / (b.runTime - a.runTime);
}

export function runTimeForVideo(videoTime: number, settings: VideoSyncSettings): number {
  const rate = baseRate(settings);
  if (!Number.isFinite(videoTime)) throw new Error("Video time must be finite");
  const anchors = validAnchors(settings).sort((a, b) => a.videoTime - b.videoTime).filter((anchor, index, list) => index === 0 || anchor.videoTime > list[index - 1].videoTime);
  if (!anchors.length) return (videoTime - settings.offsetSeconds) * rate;
  if (anchors.length === 1) return anchors[0].runTime + (videoTime - anchors[0].videoTime) * rate;
  if (videoTime <= anchors[0].videoTime) { const a = anchors[0], b = anchors[1]; return a.runTime + (videoTime - a.videoTime) * (b.runTime - a.runTime) / (b.videoTime - a.videoTime); }
  for (let i = 1; i < anchors.length; i++) if (videoTime <= anchors[i].videoTime) { const a = anchors[i - 1], b = anchors[i]; return a.runTime + (videoTime - a.videoTime) * (b.runTime - a.runTime) / (b.videoTime - a.videoTime); }
  const a = anchors[anchors.length - 2], b = anchors[anchors.length - 1];
  return b.runTime + (videoTime - b.videoTime) * (b.runTime - a.runTime) / (b.videoTime - a.videoTime);
}

export function sectorVideoWindows(run: Run, trail: Trail, settings: VideoSyncSettings): SectorVideoWindow[] {
  if (run.trailId !== trail.id || run.points.length < 2) return [];
  const telemetry = analyze(run.points);
  const boundaries = [0, ...trail.boundaries.filter((b) => Number.isFinite(b) && b > 0 && b < 1).sort((a, b) => a - b), 1];
  return boundaries.slice(1).map((end, index) => {
    const runStartTime = timeAt(telemetry, boundaries[index]);
    const runEndTime = timeAt(telemetry, end);
    return { index, name: trail.sectorNames[index] ?? `Sector ${index + 1}`, runStartTime, runEndTime, videoStartTime: videoTimeForRun(runStartTime, settings), videoEndTime: videoTimeForRun(runEndTime, settings), duration: Math.max(0, runEndTime - runStartTime) };
  });
}
