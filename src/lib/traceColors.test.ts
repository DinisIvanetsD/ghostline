import { describe, expect, it } from "vitest";
import type { Point } from "../types";
import { analyze } from "./analysis";
import { traceSegments } from "./traceColors";

// 200 points ~5.5 m apart heading north; `pace(i)` is seconds per step.
const track = (pace: (i: number) => number): Point[] => {
  let time = 0;
  return Array.from({ length: 200 }, (_, i) => {
    if (i) time += pace(i);
    return { lat: 41.5 + i * 0.00005, lon: -8.4, ele: 500 - i, time };
  });
};

describe("trace colours", () => {
  const ghost = analyze(track(() => 1));
  const current = analyze(track((i) => (i < 100 ? 0.8 : 1.3)));

  it("marks where the run gains and loses against the Ghost", () => {
    const segments = traceSegments(current, ghost, "ghost");
    expect(segments).toHaveLength(199);
    const red = (c: string) => Number(c.match(/\d+/)![0]);
    // Early segments gain (mint), late segments lose (coral, high red channel).
    expect(red(segments[50].color)).toBeLessThan(red(segments[170].color));
    expect(segments[170].color).toBe("rgb(255,138,107)");
  });

  it("caps the number of segments for long recordings", () => {
    const segments = traceSegments(current, ghost, "speed", 30, 50);
    expect(segments.length).toBeLessThanOrEqual(50);
    expect(segments.at(-1)!.to).toEqual([current.samples.at(-1)!.lat, current.samples.at(-1)!.lon]);
  });

  it("scales speed from slow to fast", () => {
    const segments = traceSegments(current, ghost, "speed");
    expect(segments[50].color).toBe("rgb(255,190,85)");
    expect(segments[170].color).toBe("rgb(255,138,107)");
  });
});
