import type { Point } from "../types";
const R = 6_371_000;
const distance = (a: Point, b: Point) => {
  const rad = Math.PI / 180;
  return (
    Math.hypot(
      (b.lon - a.lon) * rad * Math.cos(((a.lat + b.lat) * rad) / 2),
      (b.lat - a.lat) * rad,
    ) * R
  );
};
const simplify = (points: Point[], max: number) =>
  points.length <= max
    ? points
    : Array.from(
        { length: max },
        (_, i) => points[Math.round((i * (points.length - 1)) / (max - 1))],
      );
const cumulative = (points: Point[]) => {
  const result = [0];
  for (let i = 1; i < points.length; i++)
    result.push(result[i - 1] + distance(points[i - 1], points[i]));
  return result;
};
function nearest(point: Point, route: Point[], distances: number[]) {
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
/** Approximate compatibility guard, not race-grade map matching. Work is bounded for large files. */
export function matchRoute(
  runPoints: Point[],
  trailPoints: Point[],
): { ok: boolean; reason?: string } {
  if (runPoints.length < 2 || trailPoints.length < 2)
    return { ok: false, reason: "Both routes need at least two points." };
  const route = simplify(trailPoints, 800),
    run = simplify(runPoints, 300);
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
