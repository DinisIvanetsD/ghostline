import type { Telemetry } from "../types";
import { ghostGap } from "./analysis";

export type TraceMode = "plain" | "speed" | "ghost";
export interface TraceSegment {
  from: [number, number];
  to: [number, number];
  color: string;
}

const SLOW = [201, 120, 42]; // ochre: time lost
const MID = [190, 200, 225];
const FAST = [29, 63, 145]; // cobalt
const GAINED = [29, 63, 145]; // cobalt: time gained
const NEUTRAL = [140, 158, 204]; // pale cobalt: on the Ghost's pace

const mix = (a: number[], b: number[], t: number) =>
  `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(",")})`;
const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))];
};

/** Speed colour for t in [0, 1]: slow (ochre) through pale glaze to fast (cobalt). */
export const speedColor = (t: number) =>
  t < 0.5 ? mix(SLOW, MID, t * 2) : mix(MID, FAST, (t - 0.5) * 2);

/**
 * Colour each segment of the current run by speed, or by the time it gains or
 * loses against the Ghost over the preceding ~30 m. Runs are aligned by
 * normalized distance, the same alignment the sector panel uses.
 */
export function traceSegments(
  current: Telemetry,
  ghost: Telemetry,
  mode: Exclude<TraceMode, "plain">,
  windowMeters = 30,
  maxSegments = 600,
): TraceSegment[] {
  const samples = current.samples;
  if (samples.length < 2) return [];
  let values: number[];
  let color: (value: number) => string;
  if (mode === "speed") {
    values = samples.map((s) => s.speed);
    // Percentiles keep one GPS spike from flattening the whole scale.
    const low = percentile(values, 0.1);
    const high = percentile(values, 0.9);
    color = (v) => speedColor(high > low ? Math.max(0, Math.min(1, (v - low) / (high - low))) : 0.5);
  } else {
    const delta = ghostGap(current, ghost);
    let back = 0;
    values = samples.map((s, i) => {
      while (back < i && s.distance - samples[back].distance > windowMeters) back += 1;
      const span = s.distance - samples[back].distance;
      return span > 0 ? (delta[i] - delta[back]) / span : 0; // seconds lost per metre
    });
    const scale = Math.max(1e-6, percentile(values.map(Math.abs), 0.75));
    color = (v) => {
      const t = Math.max(-1, Math.min(1, v / scale));
      return t > 0 ? mix(NEUTRAL, SLOW, t) : mix(NEUTRAL, GAINED, -t);
    };
  }
  // Long recordings are joined into at most maxSegments coloured pieces.
  const step = Math.max(1, Math.ceil((samples.length - 1) / maxSegments));
  const segments: TraceSegment[] = [];
  for (let i = 0; i < samples.length - 1; i += step) {
    const end = Math.min(samples.length - 1, i + step);
    segments.push({
      from: [samples[i].lat, samples[i].lon],
      to: [samples[end].lat, samples[end].lon],
      color: color(values[end]),
    });
  }
  return segments;
}
