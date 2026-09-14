import type { StopAnalysis, VideoSyncAnchor } from "./videoSync";

export interface VideoTrimWindow {
  start: number;
  end: number;
}

export interface VideoProjectState {
  videoName: string;
  offsetSeconds: number;
  previewRate: number;
  skipStops: boolean;
  stopAnalysis: StopAnalysis | null;
  trim: VideoTrimWindow | null;
  anchors?: VideoSyncAnchor[];
}

const STORAGE_KEY = "ghostline.video-projects.v1";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validStopAnalysis(value: unknown): StopAnalysis | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<StopAnalysis>;
  if (!Array.isArray(candidate.stops) || !candidate.rideWindow) return null;
  if (!isFiniteNumber(candidate.rideWindow.startTime) || !isFiniteNumber(candidate.rideWindow.endTime) || !isFiniteNumber(candidate.rideWindow.duration)) return null;
  const stops = candidate.stops.filter((stop) =>
    stop && isFiniteNumber(stop.startTime) && isFiniteNumber(stop.endTime) && isFiniteNumber(stop.duration) && Number.isInteger(stop.startIndex) && Number.isInteger(stop.endIndex),
  );
  return { stops, rideWindow: candidate.rideWindow };
}

function validTrim(value: unknown): VideoTrimWindow | null {
  if (!value || typeof value !== "object") return null;
  const trim = value as Partial<VideoTrimWindow>;
  return isFiniteNumber(trim.start) && isFiniteNumber(trim.end) && trim.start >= 0 && trim.end >= trim.start
    ? { start: trim.start, end: trim.end }
    : null;
}

function validAnchors(value: unknown): VideoSyncAnchor[] {
  if (!Array.isArray(value)) return [];
  const anchors = value.filter((item): item is VideoSyncAnchor => {
    if (!item || typeof item !== "object") return false;
    const candidate = item as Partial<VideoSyncAnchor>;
    return isFiniteNumber(candidate.runTime) && isFiniteNumber(candidate.videoTime) && candidate.runTime >= 0 && candidate.videoTime >= 0;
  }).sort((a, b) => a.runTime - b.runTime);
  return anchors.filter(
    (anchor, index) =>
      index === 0 ||
      (anchor.runTime > anchors[index - 1].runTime &&
        anchor.videoTime > anchors[index - 1].videoTime),
  );
}

function readProjects(): Record<string, VideoProjectState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed as Record<string, VideoProjectState> : {};
  } catch {
    return {};
  }
}

export function loadVideoProject(runId: string): VideoProjectState | null {
  if (!runId) return null;
  const value = readProjects()[runId];
  if (!value || typeof value !== "object") return null;
  return {
    videoName: typeof value.videoName === "string" ? value.videoName : "",
    offsetSeconds: isFiniteNumber(value.offsetSeconds) ? value.offsetSeconds : 0,
    previewRate: isFiniteNumber(value.previewRate) && value.previewRate > 0 ? value.previewRate : 1,
    skipStops: typeof value.skipStops === "boolean" ? value.skipStops : true,
    stopAnalysis: validStopAnalysis(value.stopAnalysis),
    trim: validTrim(value.trim),
    anchors: validAnchors(value.anchors),
  };
}

export function saveVideoProject(runId: string, state: VideoProjectState): void {
  if (!runId) return;
  try {
    const projects = readProjects();
    projects[runId] = state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  } catch {
    // Video projects are a convenience cache; a full or unavailable device
    // store must never interrupt the run analysis workflow.
  }
}

export function clearVideoProjects(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore unavailable storage in private browsing contexts.
  }
}
