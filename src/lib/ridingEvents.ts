import type { Point } from "../types";
import { cleanTrack } from "./gpsQuality";

export type RidingEventType = "braking" | "acceleration" | "jump" | "pause";

export interface RidingEvent {
  id: string;
  type: RidingEventType;
  startTime: number;
  endTime: number;
  startIndex: number;
  endIndex: number;
  distance: number;
  severity: number;
  confidence: number;
  peakSpeed: number;
  speedChange: number;
  elevationChange: number;
}

export interface RidingEventOptions {
  brakingSpeedChange?: number;
  accelerationSpeedChange?: number;
  pauseSpeed?: number;
  pauseDuration?: number;
  jumpDrop?: number;
  maxEventDuration?: number;
}

const EARTH_RADIUS = 6_371_000;
const defaults: Required<RidingEventOptions> = {
  brakingSpeedChange: 8,
  accelerationSpeedChange: 8,
  pauseSpeed: 2,
  pauseDuration: 3,
  jumpDrop: 1.5,
  maxEventDuration: 5,
};

function distanceBetween(a: Point, b: Point): number {
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.sqrt(Math.min(1, h)));
}

function seconds(points: Point): number {
  return Math.abs(points.time) > 1e11 ? points.time / 1000 : points.time;
}

function measurements(points: Point[]) {
  const start = seconds(points[0]);
  return points.map((point, index) => {
    const time = seconds(point) - start;
    if (!index) return { time, speed: 0, distance: 0, elevation: point.ele, acceleration: 0 };
    const previous = points[index - 1];
    const dt = Math.max(0.001, time - (seconds(previous) - start));
    const distance = distanceBetween(previous, point);
    const speed = (distance / dt) * 3.6;
    const previousSpeed = index > 1 ? (distanceBetween(points[index - 2], previous) / Math.max(0.001, seconds(previous) - seconds(points[index - 2]))) * 3.6 : speed;
    return { time, speed, distance, elevation: point.ele, acceleration: ((speed - previousSpeed) / 3.6) / dt };
  });
}

function eventFrom(type: RidingEventType, start: number, end: number, values: ReturnType<typeof measurements>): RidingEvent {
  const a = values[start];
  const b = values[end];
  const speedChange = b.speed - a.speed;
  const elevationChange = b.elevation - a.elevation;
  const peakSpeed = Math.max(...values.slice(start, end + 1).map((value) => value.speed));
  const magnitude = type === "braking" || type === "acceleration" ? Math.abs(speedChange) : type === "jump" ? Math.abs(elevationChange) : b.time - a.time;
  const scale = type === "jump" ? 6 : type === "pause" ? 8 : 30;
  const confidence = Math.min(0.99, Math.max(0.35, 0.45 + magnitude / scale));
  return {
    id: `${type}-${start}-${end}`,
    type,
    startTime: a.time,
    endTime: b.time,
    startIndex: start,
    endIndex: end,
    distance: values.slice(start + 1, end + 1).reduce((sum, value) => sum + value.distance, 0),
    severity: Math.min(1, magnitude / scale),
    confidence,
    peakSpeed,
    speedChange,
    elevationChange,
  };
}

function validate(points: Point[]): void {
  if (points.length < 2) throw new Error("At least two points are required");
  for (let i = 1; i < points.length; i += 1) if (points[i].time <= points[i - 1].time) throw new Error("Point timestamps must be strictly increasing");
}

/** Detects deterministic riding events from a timestamped GPS track. Times are elapsed seconds in the result. */
export function detectRidingEvents(points: Point[], options: RidingEventOptions = {}): RidingEvent[] {
  validate(points);
  const config = { ...defaults, ...options };
  const values = measurements(cleanTrack(points).points);
  const events: RidingEvent[] = [];
  const addRuns = (type: RidingEventType, matches: (index: number) => boolean) => {
    let start = -1;
    for (let i = 1; i < values.length; i += 1) {
      if (matches(i) && start < 0) start = i - 1;
      const duration = start >= 0 ? values[i].time - values[start].time : 0;
      if (start >= 0 && (!matches(i) || duration >= config.maxEventDuration || i === values.length - 1)) {
        const end = !matches(i) ? i - 1 : i;
        if (end > start) events.push(eventFrom(type, start, end, values));
        start = -1;
      }
    }
  };
  addRuns("braking", (i) => values[i].acceleration <= -1.0 && values[i].speed < values[i - 1].speed && values[i - 1].speed - values[i].speed >= config.brakingSpeedChange / 3);
  addRuns("acceleration", (i) => values[i].acceleration >= 1.0 && values[i].speed > values[i - 1].speed && values[i].speed - values[i - 1].speed >= config.accelerationSpeedChange / 3);
  addRuns("pause", (i) => values[i].speed <= config.pauseSpeed);
  events.filter((event) => event.type === "pause").forEach((event) => {
    if (event.endTime - event.startTime < config.pauseDuration) events.splice(events.indexOf(event), 1);
  });
  for (let i = 1; i < values.length; i += 1) {
    const dt = values[i].time - values[i - 1].time;
    const drop = values[i - 1].elevation - values[i].elevation;
    if (dt <= 2.5 && drop >= config.jumpDrop && values[i - 1].speed >= 8)
      events.push(eventFrom("jump", i - 1, i, values));
  }
  return events.sort((a, b) => a.startTime - b.startTime || a.type.localeCompare(b.type));
}

export const detectBrakingEvents = (points: Point[], options?: RidingEventOptions) => detectRidingEvents(points, options).filter((event) => event.type === "braking");
export const detectAccelerationEvents = (points: Point[], options?: RidingEventOptions) => detectRidingEvents(points, options).filter((event) => event.type === "acceleration");
export const detectJumpEvents = (points: Point[], options?: RidingEventOptions) => detectRidingEvents(points, options).filter((event) => event.type === "jump");
export const detectPauseEvents = (points: Point[], options?: RidingEventOptions) => detectRidingEvents(points, options).filter((event) => event.type === "pause");
