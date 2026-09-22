import { analyze, sectorTimes } from "./analysis";
import type { Run, Trail } from "../types";

export interface SectorTrend {
  index: number;
  name: string;
  latest: number;
  average: number;
  best: number;
  deltaToBest: number;
  /** Positive values mean the latest sector was slower than the first. */
  changeFromFirst: number;
}

export interface ProgressionInsights {
  runCount: number;
  latestRunId: string | null;
  latestDuration: number | null;
  personalBestRunId: string | null;
  personalBestDuration: number | null;
  /** Seconds slower than the PB. Zero when the latest run is the PB. */
  latestDeltaToPersonalBest: number | null;
  recentAverageDuration: number | null;
  /** Max minus min duration across the recent window, in seconds. */
  consistencySpread: number | null;
  /** 0-100 score where 100 means the recent runs are tightly grouped. */
  consistencyScore: number | null;
  /** Direction of the recent average compared with the previous window. */
  trend: "improving" | "stable" | "slowing" | "insufficient";
  /** A reachable next target between the current average and the PB. */
  nextTargetDuration: number | null;
  /** Sector with the largest latest-to-best gap. */
  focusSector: SectorTrend | null;
  sectorTrends: SectorTrend[];
}

export interface ProgressionOptions {
  /** Number of chronologically latest runs included in recent statistics. */
  recentWindow?: number;
  trail?: Trail;
}

type TimedRun = { run: Run; duration: number; order: number };

/**
 * Build small, UI-agnostic progression metrics for runs belonging to one trail.
 * Runs are ordered by their recorded date; ties retain their input order.
 */
export function progressionInsights(
  runs: Run[],
  options: ProgressionOptions = {},
): ProgressionInsights {
  const empty: ProgressionInsights = {
    runCount: 0,
    latestRunId: null,
    latestDuration: null,
    personalBestRunId: null,
    personalBestDuration: null,
    latestDeltaToPersonalBest: null,
    recentAverageDuration: null,
    consistencySpread: null,
    consistencyScore: null,
    trend: "insufficient",
    nextTargetDuration: null,
    focusSector: null,
    sectorTrends: [],
  };
  if (!runs.length) return empty;

  const timed = runs.map((run, order) => ({
    run,
    duration: analyze(run.points).duration,
    order,
  }));
  timed.sort((a, b) => {
    const aTime = Date.parse(a.run.date);
    const bTime = Date.parse(b.run.date);
    if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime)
      return aTime - bTime;
    if (a.run.date !== b.run.date) return a.run.date.localeCompare(b.run.date);
    return a.order - b.order;
  });

  const latest = timed[timed.length - 1];
  const personalBest = timed.reduce((best, item) =>
    item.duration < best.duration ? item : best,
  );
  const windowSize = Math.max(1, Math.floor(options.recentWindow ?? 5));
  const recent = timed.slice(-windowSize);
  const durations = recent.map((item) => item.duration);
  const recentAverageDuration =
    durations.reduce((sum, value) => sum + value, 0) / durations.length;
  const consistencySpread = Math.max(...durations) - Math.min(...durations);
  const consistencyScore = Math.max(
    0,
    Math.min(100, 100 - (consistencySpread / recentAverageDuration) * 100),
  );
  const previous = timed.slice(Math.max(0, timed.length - windowSize * 2), -windowSize);
  const previousAverage = previous.length
    ? previous.reduce((sum, item) => sum + item.duration, 0) / previous.length
    : null;
  const trend =
    previousAverage === null || recent.length < 2
      ? "insufficient"
      : recentAverageDuration < previousAverage - 0.25
        ? "improving"
        : recentAverageDuration > previousAverage + 0.25
          ? "slowing"
          : "stable";
  const nextTargetDuration =
    recentAverageDuration > personalBest.duration
      ? personalBest.duration + (recentAverageDuration - personalBest.duration) * 0.35
      : personalBest.duration;
  const sectorTrends = buildSectorTrends(timed, options.trail);
  const focusSector = sectorTrends.length
    ? sectorTrends.reduce((worst, sector) =>
        sector.deltaToBest > worst.deltaToBest ? sector : worst,
      )
    : null;

  return {
    runCount: timed.length,
    latestRunId: latest.run.id,
    latestDuration: latest.duration,
    personalBestRunId: personalBest.run.id,
    personalBestDuration: personalBest.duration,
    latestDeltaToPersonalBest: latest.duration - personalBest.duration,
    recentAverageDuration,
    consistencySpread,
    consistencyScore,
    trend,
    nextTargetDuration,
    focusSector,
    sectorTrends,
  };
}

function buildSectorTrends(timed: TimedRun[], trail?: Trail): SectorTrend[] {
  if (!trail) return [];
  const sectorRuns = timed.map((item) => ({
    item,
    times: sectorTimes(item.run, trail),
  }));
  const count = sectorRuns.reduce(
    (maximum, current) => Math.max(maximum, current.times.length),
    0,
  );
  return Array.from({ length: count }, (_, index) => {
    const values = sectorRuns
      .map((entry) => entry.times[index])
      .filter((value): value is number => Number.isFinite(value));
    const latest = values[values.length - 1];
    const first = values[0];
    const best = Math.min(...values);
    return {
      index,
      name: trail.sectorNames[index] ?? `Sector ${index + 1}`,
      latest,
      average: values.reduce((sum, value) => sum + value, 0) / values.length,
      best,
      deltaToBest: latest - best,
      changeFromFirst: latest - first,
    };
  });
}
