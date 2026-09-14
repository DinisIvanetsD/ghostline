import type { Point } from "../types";

const EARTH_RADIUS_METERS = 6_371_000;

export type GpsConfidence = "good" | "review" | "poor";

export interface GpsQualityOptions {
  /** Maximum believable instantaneous speed. MTB defaults to a deliberately generous 160 km/h. */
  maxSpeedKmh?: number;
  /** A recording pause longer than this is reported as a temporal gap. */
  maxGapSeconds?: number;
  /** Gaps this long are considered a broken recording rather than a short GPS pause. */
  poorGapSeconds?: number;
  /** Remove every remaining impossible leg when the source is an activity export. */
  removeImpossible?: boolean;
}

export interface OutlierSegment {
  startIndex: number;
  endIndex: number;
  distanceMeters: number;
  durationSeconds: number;
  speedKmh: number;
  reason: "impossible-speed" | "temporal-gap" | "invalid-time";
  recoverable: boolean;
}

export interface GpsQualityResult {
  points: Point[];
  removedPoints: Point[];
  outlierSegments: OutlierSegment[];
  maxObservedSpeedKmh: number;
  confidence: GpsConfidence;
}

/**
 * Remove isolated GPS jumps while keeping genuine stops intact.
 *
 * Times can be elapsed seconds or epoch milliseconds, matching the rest of
 * the telemetry pipeline. Unrecoverable segments are retained and surfaced
 * in the result so callers can decide whether to trim or ask the rider to
 * review the recording.
 */
export function cleanTrack(
  points: Point[],
  options: GpsQualityOptions = {},
): GpsQualityResult {
  const maxSpeedKmh = options.maxSpeedKmh ?? 160;
  const maxGapSeconds = options.maxGapSeconds ?? 15;
  const poorGapSeconds = options.poorGapSeconds ?? 120;
  if (!(maxSpeedKmh > 0) || !(maxGapSeconds > 0) || !(poorGapSeconds >= maxGapSeconds))
    throw new Error("GPS quality thresholds must be positive and ordered");

  const scale = points.some((point) => Math.abs(point.time) > 1e11) ? 1000 : 1;
  const removed = new Set<number>();
  const segments: OutlierSegment[] = [];

  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const durationSeconds = (b.time - a.time) / scale;
    const distanceMeters = distanceBetween(a, b);
    const speedKmh = durationSeconds > 0 ? (distanceMeters / durationSeconds) * 3.6 : Infinity;
    if (!(durationSeconds > 0)) {
      segments.push({ startIndex: i - 1, endIndex: i, distanceMeters, durationSeconds, speedKmh, reason: "invalid-time", recoverable: false });
    } else if (durationSeconds > maxGapSeconds) {
      segments.push({ startIndex: i - 1, endIndex: i, distanceMeters, durationSeconds, speedKmh, reason: "temporal-gap", recoverable: false });
    } else if (speedKmh > maxSpeedKmh) {
      segments.push({ startIndex: i - 1, endIndex: i, distanceMeters, durationSeconds, speedKmh, reason: "impossible-speed", recoverable: false });
    }
  }

  // A single bad fix produces two impossible legs, while the leg around it
  // remains plausible. Evaluate against retained neighbours and restart after
  // every removal so alternating spikes never make a valid point look bad.
  while (true) {
    const retained = points.map((_, index) => index).filter((index) => !removed.has(index));
    let removedOne = false;
    for (let position = 1; position < retained.length - 1; position += 1) {
      const previousIndex = retained[position - 1];
      const currentIndex = retained[position];
      const nextIndex = retained[position + 1];
      const left = segment(points[previousIndex], points[currentIndex], scale);
      const right = segment(points[currentIndex], points[nextIndex], scale);
      const bridge = segment(points[previousIndex], points[nextIndex], scale);
      if (
        left.durationSeconds > 0 &&
        right.durationSeconds > 0 &&
        bridge.durationSeconds > 0 &&
        left.durationSeconds <= maxGapSeconds &&
        right.durationSeconds <= maxGapSeconds &&
        left.speedKmh > maxSpeedKmh &&
        right.speedKmh > maxSpeedKmh &&
        bridge.speedKmh <= maxSpeedKmh
      ) {
        removed.add(currentIndex);
        for (const outlier of segments) {
          if (
            (outlier.startIndex === previousIndex && outlier.endIndex === currentIndex) ||
            (outlier.startIndex === currentIndex && outlier.endIndex === nextIndex)
          ) outlier.recoverable = true;
        }
        removedOne = true;
        break;
      }
    }
    if (!removedOne) break;
  }

  // Captures often continue after the rider has crossed the finish. A final
  // impossible jump is almost always a stray GPS fix; trim the tail while
  // retaining the timed stationary intervals that follow a real stop.
  for (let i = points.length - 1; i > 1; i -= 1) {
    if (removed.has(i) || removed.has(i - 1)) break;
    const tail = segment(points[i - 1], points[i], scale);
    if (!(tail.durationSeconds > 0) || tail.speedKmh <= maxSpeedKmh) break;
    const previous = segment(points[i - 2], points[i - 1], scale);
    if (previous.speedKmh > maxSpeedKmh) break;
    removed.add(i);
    for (const outlier of segments) {
      if (outlier.startIndex === i - 1 && outlier.endIndex === i)
        outlier.recoverable = true;
    }
  }

  // A noisy export can contain a short chain of impossible legs rather than
  // one clean out-and-back spike. Keep the first and last GPS fixes, then
  // remove the interior fix that eliminates the most impossible distance at
  // each pass. This makes telemetry safe to display while retaining the raw
  // points on the run for later inspection.
  while (options.removeImpossible) {
    const retained = points
      .map((_, index) => index)
      .filter((index) => !removed.has(index));
    if (retained.length <= 2) break;
    const legs = retained.slice(1).map((index, position) =>
      segment(points[retained[position]], points[index], scale),
    );
    const badLeg = legs.findIndex(
      (leg) =>
        leg.durationSeconds > 0 &&
        leg.durationSeconds <= maxGapSeconds &&
        leg.speedKmh > maxSpeedKmh,
    );
    if (badLeg < 0) break;

    const candidates = [retained[badLeg], retained[badLeg + 1]].filter(
      (index) => index > 0 && index < points.length - 1 && !removed.has(index),
    );
    let bestIndex: number | undefined;
    let bestGain = -Infinity;
    for (const candidate of candidates) {
      const position = retained.indexOf(candidate);
      const before = [
        position > 0 ? legs[position - 1] : undefined,
        legs[position],
      ].filter(Boolean) as ReturnType<typeof segment>[];
      const beforeBad = before.filter(
        (leg) => leg.durationSeconds > 0 && leg.durationSeconds <= maxGapSeconds && leg.speedKmh > maxSpeedKmh,
      ).length;
      const bridge = segment(
        points[retained[position - 1]],
        points[retained[position + 1]],
        scale,
      );
      const bridgeBad =
        bridge.durationSeconds > 0 &&
        bridge.durationSeconds <= maxGapSeconds &&
        bridge.speedKmh > maxSpeedKmh;
      const gain = beforeBad - (bridgeBad ? 1 : 0);
      if (gain > bestGain) {
        bestGain = gain;
        bestIndex = candidate;
      }
    }

    // At the edge, remove the second-to-last/second fix. In the middle, a
    // zero-gain tie still removes a clearly impossible fix and allows the
    // next pass to evaluate the new bridge.
    const fallback = badLeg === 0 ? retained[1] : retained[badLeg];
    const indexToRemove = bestIndex ?? fallback;
    if (indexToRemove === undefined || indexToRemove <= 0 || indexToRemove >= points.length - 1)
      break;
    removed.add(indexToRemove);
    for (const outlier of segments) {
      if (
        outlier.startIndex === indexToRemove - 1 ||
        outlier.endIndex === indexToRemove ||
        outlier.startIndex === indexToRemove
      ) outlier.recoverable = true;
    }
  }

  const cleaned = points.filter((_, index) => !removed.has(index));
  const cleanedSegments = cleaned.slice(1).map((point, index) => segment(cleaned[index], point, scale));
  const maxObservedSpeedKmh = cleanedSegments
    .filter((item) => item.durationSeconds > 0 && item.durationSeconds <= maxGapSeconds)
    .reduce((max, item) => Math.max(max, item.speedKmh), 0);
  const unrecoverable = segments.some((segment) => !segment.recoverable && (segment.reason === "impossible-speed" || segment.reason === "invalid-time"));
  const severeGap = segments.some((segment) => segment.reason === "temporal-gap" && segment.durationSeconds > poorGapSeconds);
  const confidence: GpsConfidence = unrecoverable || severeGap ? "poor" : segments.length || removed.size ? "review" : "good";
  return {
    points: cleaned,
    removedPoints: [...removed].sort((a, b) => a - b).map((index) => points[index]),
    outlierSegments: segments,
    maxObservedSpeedKmh,
    confidence,
  };
}

function segment(a: Point, b: Point, scale: number) {
  const durationSeconds = (b.time - a.time) / scale;
  const distanceMeters = distanceBetween(a, b);
  return {
    durationSeconds,
    distanceMeters,
    speedKmh: durationSeconds > 0 ? (distanceMeters / durationSeconds) * 3.6 : Infinity,
  };
}

function distanceBetween(a: Pick<Point, "lat" | "lon">, b: Pick<Point, "lat" | "lon">): number {
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(Math.min(1, h)));
}
