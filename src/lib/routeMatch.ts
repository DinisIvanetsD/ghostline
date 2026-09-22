import type { Point, Trail } from "../types";
const R = 6_371_000;
const distance = (
  a: Pick<Point, "lat" | "lon">,
  b: Pick<Point, "lat" | "lon">,
) => {
  const rad = Math.PI / 180;
  return (
    Math.hypot(
      (b.lon - a.lon) * rad * Math.cos(((a.lat + b.lat) * rad) / 2),
      (b.lat - a.lat) * rad,
    ) * R
  );
};
const simplify = <T extends Pick<Point, "lat" | "lon">>(points: T[], max: number): T[] =>
  points.length <= max
    ? points
    : Array.from(
        { length: max },
        (_, i) => points[Math.round((i * (points.length - 1)) / (max - 1))],
      );

/**
 * Trim a recording at a known physical finish gate. GPS devices often keep
 * recording while a rider talks, walks back, or rides away from the trail.
 * The gate is explicit trail metadata, so this never changes unrelated trails
 * or guesses from the shape of an arbitrary recording.
 */
export function clipToFinish(
  points: Point[],
  finishPoint?: Pick<Point, "lat" | "lon">,
): Point[] {
  if (!finishPoint || points.length < 2) return points;
  let bestIndex = 0;
  let bestDistance = Infinity;
  for (let index = 0; index < points.length; index += 1) {
    const candidate = points[index];
    const gap = distance(candidate, {
      lat: finishPoint.lat,
      lon: finishPoint.lon,
    });
    if (gap < bestDistance) {
      bestDistance = gap;
      bestIndex = index;
    }
  }
  // A finish gate that is nowhere near the recording should not silently
  // discard the ride. The normal route-match error remains actionable.
  if (bestIndex < 1 || bestDistance > 250) return points;
  const finish = points[bestIndex];
  const clipped = points.slice(0, bestIndex + 1);
  clipped[clipped.length - 1] = {
    ...finish,
    lat: finishPoint.lat,
    lon: finishPoint.lon,
  };
  return clipped;
}
const cumulative = (points: Array<Pick<Point, "lat" | "lon">>) => {
  const result = [0];
  for (let i = 1; i < points.length; i++)
    result.push(result[i - 1] + distance(points[i - 1], points[i]));
  return result;
};
function nearest(
  point: Pick<Point, "lat" | "lon">,
  route: Array<Pick<Point, "lat" | "lon">>,
  distances: number[],
) {
  const rad = Math.PI / 180,
    cos = Math.cos(point.lat * rad);
  let best = { distance: Infinity, progress: 0 };
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1],
      b = route[i],
      x = (point.lon - a.lon) * rad * cos,
      y = (point.lat - a.lat) * rad,
      bx = (b.lon - a.lon) * rad * cos,
      by = (b.lat - a.lat) * rad;
    const u = Math.max(
      0,
      Math.min(1, (x * bx + y * by) / Math.max(1e-24, bx * bx + by * by)),
    );
    const gap = Math.hypot(x - bx * u, y - by * u) * R;
    if (gap < best.distance)
      best = {
        distance: gap,
        progress: distances[i - 1] + u * (distances[i] - distances[i - 1]),
      };
  }
  return best;
}

/**
 * Trim at the last point that is still on the physical route when GPS drift
 * means no sample lands within the finish gate itself. This is deliberately
 * conservative: the route endpoint must already be the configured gate and
 * the candidate must be near the final 20% of the route corridor.
 */
export function clipToRouteFinish(
  points: Point[],
  routePoints: Array<Pick<Point, "lat" | "lon">>,
  finishPoint?: Pick<Point, "lat" | "lon">,
): Point[] {
  const direct = clipToFinish(points, finishPoint);
  if (
    direct !== points ||
    !finishPoint ||
    routePoints.length < 2 ||
    distance(routePoints.at(-1)!, finishPoint) > 250
  )
    return direct;
  const route = simplify(routePoints, 800);
  const distances = cumulative(route);
  const routeLength = distances.at(-1)!;
  if (!(routeLength > 0)) return points;
  let bestIndex = -1;
  let bestProgress = 0;
  for (let index = 0; index < points.length; index += 1) {
    const hit = nearest(points[index], route, distances);
    if (hit.distance <= 300 && hit.progress > bestProgress) {
      bestProgress = hit.progress;
      bestIndex = index;
    }
  }
  if (bestIndex < 1 || bestProgress < routeLength * 0.8) return points;
  const clipped = points.slice(0, bestIndex + 1);
  clipped[clipped.length - 1] = {
    ...clipped[clipped.length - 1],
    lat: finishPoint.lat,
    lon: finishPoint.lon,
  };
  return clipped;
}
/** Approximate compatibility guard, not race-grade map matching. Work is bounded for large files. */
export function matchRoute(
  runPoints: Point[],
  trailPoints: Point[],
  options?: { startPoints?: Array<Pick<Point, "lat" | "lon">> },
): { ok: boolean; reason?: string } {
  if (runPoints.length < 2 || trailPoints.length < 2)
    return { ok: false, reason: "Both routes need at least two points." };
  const baseRoute = simplify(trailPoints, 800),
    run = simplify(runPoints, 300);
  const startCandidates = [baseRoute[0], ...(options?.startPoints ?? [])];
  const start = startCandidates.reduce((best, candidate) =>
    distance(run[0], candidate) < distance(run[0], best) ? candidate : best,
  );
  // If a rider starts from an alternate access gate, include a short virtual
  // approach to the canonical route so corridor and direction checks still
  // work without duplicating the trail in storage.
  const route = start === baseRoute[0] ? baseRoute : [start, ...baseRoute];
  if (
    distance(run[0], route[0]) > 200 ||
    distance(run.at(-1)!, route.at(-1)!) > 200
  )
    return { ok: false, reason: "Route endpoints are too far apart." };
  const fullRouteLength = cumulative(trailPoints).at(-1)!,
    fullRunLength = cumulative(runPoints).at(-1)!;
  if (
    !fullRouteLength ||
    fullRunLength / fullRouteLength < 0.75 ||
    fullRunLength / fullRouteLength > 1.25
  )
    return { ok: false, reason: "Route lengths do not match." };
  const distances = cumulative(route),
    routeLength = distances.at(-1)!,
    closed = distance(route[0], route.at(-1)!) < 5;
  if (!closed) {
    const a = route[0],
      b = route.at(-1)!,
      c = run[0],
      d = run.at(-1)!;
    if (
      (b.lat - a.lat) * (d.lat - c.lat) + (b.lon - a.lon) * (d.lon - c.lon) <=
      0
    )
      return { ok: false, reason: "Run follows the trail in reverse." };
  }
  let previous = 0;
  for (let index = 0; index < run.length; index++) {
    const hit = nearest(run[index], route, distances);
    if (hit.distance > 200)
      return { ok: false, reason: "Run leaves the trail corridor." };
    const progress =
      closed && index === run.length - 1 ? routeLength : hit.progress;
    if (progress + Math.max(10, routeLength * 0.04) < previous)
      return { ok: false, reason: "Run follows the trail in reverse." };
    previous = Math.max(previous, progress);
  }
  return { ok: true };
}

export interface RouteMatchScore {
  score: number;
  corridorCoverage: number;
  endpointDistance: number;
  lengthRatio: number;
  confidence: "high" | "medium" | "low";
}

export interface DetectedTrail {
  trail: Trail;
  match: RouteMatchScore;
}

const clamp = (value: number, min = 0, max = 1) =>
  Math.max(min, Math.min(max, value));

/**
 * Scores a recording against a trail without requiring a perfect endpoint.
 * This is deliberately a review aid for imports: the existing strict
 * matchRoute guard still decides whether a selected route may be saved.
 */
export function scoreRouteMatch(
  runPoints: Point[],
  trailPoints: Point[],
  options?: { startPoints?: Array<Pick<Point, "lat" | "lon">> },
): RouteMatchScore {
  if (runPoints.length < 2 || trailPoints.length < 2)
    return { score: 0, corridorCoverage: 0, endpointDistance: Infinity, lengthRatio: 0, confidence: "low" };
  const baseRoute = simplify(trailPoints, 800);
  const run = simplify(runPoints, 300);
  const startCandidates = [baseRoute[0], ...(options?.startPoints ?? [])];
  const start = startCandidates.reduce((best, candidate) =>
    distance(run[0], candidate) < distance(run[0], best) ? candidate : best,
  );
  const route = start === baseRoute[0] ? baseRoute : [start, ...baseRoute];
  const distances = cumulative(route);
  const routeLength = distances.at(-1) ?? 0;
  const runLength = cumulative(runPoints).at(-1) ?? 0;
  const lengthRatio = routeLength > 0 ? runLength / routeLength : 0;
  const hits = run.map((point) => nearest(point, route, distances));
  const corridorCoverage = hits.length
    ? hits.filter((hit) => hit.distance <= 250).length / hits.length
    : 0;
  const endpointDistance =
    distance(run[0], route[0]) + distance(run.at(-1)!, route.at(-1)!);
  const endpointScore = Math.exp(-endpointDistance / 500);
  const lengthScore = clamp(1 - Math.abs(Math.log(Math.max(0.01, lengthRatio))) / Math.log(1.4));
  const score = clamp(
    corridorCoverage * 0.55 + endpointScore * 0.2 + lengthScore * 0.25,
  );
  return {
    score,
    corridorCoverage,
    endpointDistance,
    lengthRatio,
    confidence: score >= 0.82 ? "high" : score >= 0.62 ? "medium" : "low",
  };
}

/** Find the most likely trail for an imported recording for pre-save review. */
export function detectTrail(runPoints: Point[], trails: Trail[]): DetectedTrail | undefined {
  return trails
    .map((trail) => {
      // A configured finish gate makes DJI Mimo recordings robust to a walk
      // or roll-out captured after the actual line.
      const clipped = trail.finishPoint
        ? clipToRouteFinish(runPoints, trail.points, trail.finishPoint)
        : runPoints;
      return {
        trail,
        match: scoreRouteMatch(clipped, trail.points, { startPoints: trail.startPoints }),
      };
    })
    .sort((a, b) => b.match.score - a.match.score)[0];
}
