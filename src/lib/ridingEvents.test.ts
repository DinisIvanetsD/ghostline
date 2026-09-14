import { describe, expect, it } from "vitest";
import type { Point } from "../types";
import { detectRidingEvents, detectBrakingEvents, detectAccelerationEvents, detectJumpEvents, detectPauseEvents } from "./ridingEvents";

function track(speeds: number[], elevations: number[] = speeds.map(() => 500)): Point[] {
  let metres = 0;
  return speeds.map((speed, index) => {
    if (index) metres += speed / 3.6;
    return { lat: 41 + metres / 111_000, lon: -8, ele: elevations[index], time: index };
  });
}

describe("riding event analysis", () => {
  it("finds braking and acceleration changes with confidence and severity", () => {
    const points = track([30, 30, 30, 18, 8, 12, 30, 42]);
    const braking = detectBrakingEvents(points);
    const acceleration = detectAccelerationEvents(points);
    expect(braking.length).toBeGreaterThan(0);
    expect(acceleration.length).toBeGreaterThan(0);
    expect(braking[0]).toMatchObject({ type: "braking", startTime: 2, endTime: 4 });
    expect(braking[0].confidence).toBeGreaterThan(0.35);
    expect(acceleration[0].severity).toBeGreaterThan(0);
  });

  it("finds a drop-like elevation change only when the rider is moving", () => {
    const points = track([30, 30, 30, 30], [500, 500, 497.5, 497.5]);
    expect(detectJumpEvents(points)).toHaveLength(1);
    expect(detectJumpEvents(track([0, 0], [500, 497.5]))).toHaveLength(0);
  });

  it("groups a sustained pause and preserves chronological output", () => {
    const points = track([30, 30, 0, 0, 0, 0, 30, 30]);
    const pauses = detectPauseEvents(points);
    expect(pauses).toHaveLength(1);
    expect(pauses[0].endTime - pauses[0].startTime).toBeGreaterThanOrEqual(3);
    const events = detectRidingEvents(points);
    expect(events.map((event) => event.startTime)).toEqual([...events].map((event) => event.startTime).sort((a, b) => a - b));
  });
});
