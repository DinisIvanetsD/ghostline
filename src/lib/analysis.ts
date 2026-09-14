import type { Point, Run, Sample, Telemetry, Trail } from "../types";

const EARTH_RADIUS = 6_371_000;
const finite = (value: number, label: string) => {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
};
const distanceBetween = (
  a: Pick<Point, "lat" | "lon">,
  b: Pick<Point, "lat" | "lon">,
) => {
  const lat1 = (a.lat * Math.PI) / 180,
    lat2 = (b.lat * Math.PI) / 180;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180,
    dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.sqrt(Math.min(1, h)));
};

/** Times are elapsed seconds; Point.time may be Unix seconds or Unix milliseconds. */
export function analyze(points: Point[]): Telemetry {
  if (points.length < 2) throw new Error("At least two points are required");
  points.forEach((p, i) => {
    finite(p.lat, `Point ${i} latitude`);
    finite(p.lon, `Point ${i} longitude`);
    finite(p.ele, `Point ${i} elevation`);
    finite(p.time, `Point ${i} time`);
    if (p.lat < -90 || p.lat > 90 || p.lon < -180 || p.lon > 180)
      throw new Error(`Point ${i} coordinates are out of range`);
  });
  for (let i = 1; i < points.length; i++)
    if (points[i].time <= points[i - 1].time)
      throw new Error("Point timestamps must be strictly increasing");
  // GPX timestamps are epoch milliseconds; ordinary relative timestamps are seconds.
  const scale =
    points.map((p) => Math.abs(p.time)).reduce((a, b) => Math.max(a, b), 0) >
    1e11
      ? 1000
      : 1;
  const start = points[0].time / scale;
  const duration = points[points.length - 1].time / scale - start;
  if (!(duration > 0))
    throw new Error("Track duration must be greater than zero");
  let distance = 0,
    ascent = 0,
    descent = 0;
  const samples: Sample[] = points.map((p, i) => {
    if (i) {
      const d = distanceBetween(points[i - 1], p);
      distance += d;
      const de = p.ele - points[i - 1].ele;
      if (de > 0) ascent += de;
      else descent -= de;
    }
    const time = p.time / scale - start;
    return {
      distance,
      fraction: 0,
      time,
      speed: 0,
      elevation: p.ele,
      lat: p.lat,
      lon: p.lon,
    };
  });
  if (!(distance > 0))
    throw new Error("Track distance must be greater than zero");
  samples.forEach((s) => {
    s.fraction = s.distance / distance;
  });
  for (let i = 1; i < samples.length; i++) {
    const dt = samples[i].time - samples[i - 1].time;
    samples[i].speed =
      ((samples[i].distance - samples[i - 1].distance) / dt) * 3.6;
  }
  samples[0].speed = samples[1].speed;
  let maxSpeed = 0;
  for (const sample of samples) maxSpeed = Math.max(maxSpeed, sample.speed);
  return {
    samples,
    duration,
    distance,
    avgSpeed: (distance / duration) * 3.6,
    maxSpeed,
    descent,
    ascent,
  };
}

export function timeAt(telemetry: Telemetry, fraction: number): number {
  if (!telemetry.samples.length) return 0;
  const f = Math.max(0, Math.min(1, fraction));
  const samples = telemetry.samples;
  if (f >= 1) return telemetry.duration;
  if (f <= samples[0].fraction) return samples[0].time;
  for (let i = 1; i < samples.length; i++)
    if (f <= samples[i].fraction) {
      const a = samples[i - 1],
        b = samples[i],
        span = b.fraction - a.fraction;
      return span > 0
        ? a.time + ((b.time - a.time) * (f - a.fraction)) / span
        : b.time;
    }
  return telemetry.duration;
}

export function sectorTimes(run: Run, trail: Trail): number[] {
  if (run.trailId !== trail.id) return [];
  const telemetry = analyze(run.points);
  const boundaries = [0, ...interiorBoundaries(trail.boundaries), 1];
  if (trail.points.length < 2)
    return boundaries
      .slice(1)
      .map(
        (end, i) =>
          timeAt(telemetry, end) - timeAt(telemetry, boundaries[i]),
      );

  // Sector gates belong to the trail's physical route. Looking them up on
  // each run's own normalized distance would move a gate when a rider takes
  // a wider line or records a GPS detour before the split.
  const gates = boundaries.map((fraction) => routePositionAt(trail.points, fraction));
  const gateTimes = gates.map((gate, index) => {
    if (index === 0) return 0;
    if (index === gates.length - 1) return telemetry.duration;
    return timeAtNearestPosition(telemetry, gate.lat, gate.lon);
  });
  for (let i = 1; i < gateTimes.length; i += 1)
    gateTimes[i] = Math.max(
      gateTimes[i - 1],
      Math.min(telemetry.duration, gateTimes[i]),
    );
  return gateTimes.slice(1).map((end, i) => end - gateTimes[i]);
}

/** Return the geographic position at a fraction of a route's traveled distance. */
export function routePositionAt(
  points: Array<Pick<Point, "lat" | "lon">>,
  fraction: number,
): Pick<Point, "lat" | "lon"> {
  if (!points.length) return { lat: 0, lon: 0 };
  if (points.length === 1) return { lat: points[0].lat, lon: points[0].lon };
  const distances = [0];
  for (let i = 1; i < points.length; i += 1)
    distances.push(distances[i - 1] + distanceBetween(points[i - 1], points[i]));
  const total = distances[distances.length - 1];
  const target = Math.max(0, Math.min(1, fraction)) * total;
  for (let i = 1; i < distances.length; i += 1) {
    if (target <= distances[i]) {
      const span = distances[i] - distances[i - 1];
      const local = span > 0 ? (target - distances[i - 1]) / span : 0;
      return {
        lat: points[i - 1].lat + (points[i].lat - points[i - 1].lat) * local,
        lon: points[i - 1].lon + (points[i].lon - points[i - 1].lon) * local,
      };
    }
  }
  return { lat: points[points.length - 1].lat, lon: points[points.length - 1].lon };
}

function timeAtNearestPosition(
  telemetry: Telemetry,
  lat: number,
  lon: number,
): number {
  let bestDistance = Infinity;
  let bestTime = 0;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const project = (sample: Sample) => ({
    x: (sample.lon - lon) * cosLat,
    y: sample.lat - lat,
  });
  for (let i = 1; i < telemetry.samples.length; i += 1) {
    const a = telemetry.samples[i - 1];
    const b = telemetry.samples[i];
    const pa = project(a);
    const pb = project(b);
    const dx = pb.x - pa.x;
    const dy = pb.y - pa.y;
    const span = dx * dx + dy * dy;
    const local = span > 0 ? Math.max(0, Math.min(1, -(pa.x * dx + pa.y * dy) / span)) : 0;
    const x = pa.x + dx * local;
    const y = pa.y + dy * local;
    const distance = x * x + y * y;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestTime = a.time + (b.time - a.time) * local;
    }
  }
  return bestTime;
}

export function personalBest(runs: Run[], trailId: string): Run | undefined {
  return runs
    .filter((r) => r.trailId === trailId)
    .reduce<Run | undefined>((best, run) => {
      if (!best) return run;
      return analyze(run.points).duration < analyze(best.points).duration
        ? run
        : best;
    }, undefined);
}

export function theoreticalBest(
  runs: Run[],
  trail: Trail,
): { total: number; sectors: { time: number; runId: string }[] } {
  const matching = runs.filter((r) => r.trailId === trail.id);
  const all = matching.map((run) => ({ run, times: sectorTimes(run, trail) }));
  const count = interiorBoundaries(trail.boundaries).length + 1;
  const sectors = Array.from({ length: count }, (_, i) => {
    const winner = all
      .filter((x) => x.times.length === count)
      .sort((a, b) => a.times[i] - b.times[i])[0];
    return winner
      ? { time: winner.times[i], runId: winner.run.id }
      : { time: 0, runId: "" };
  });
  return { total: sectors.reduce((sum, s) => sum + s.time, 0), sectors };
}

function interiorBoundaries(boundaries: number[]): number[] {
  return [
    ...new Set(boundaries.filter((b) => Number.isFinite(b) && b > 0 && b < 1)),
  ].sort((a, b) => a - b);
}

export function formatTime(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const rounded = Math.round(safe * 100) / 100;
  const minutes = Math.floor(rounded / 60),
    remainder = (rounded - minutes * 60).toFixed(2).padStart(5, "0");
  return `${minutes}:${remainder}`;
}

export function formatDelta(seconds: number): string {
  const sign = seconds > 0 ? "+" : seconds < 0 ? "-" : "";
  return `${sign}${Math.abs(seconds).toFixed(2)}s`;
}
