import { describe, expect, it } from "vitest";
import { cleanTrack } from "./gpsQuality";
import type { Point } from "../types";

const point = (lat: number, time: number, ele = 500): Point => ({ lat, lon: -8.37, ele, time });

describe("cleanTrack", () => {
  it("removes an isolated impossible spike and reconnects the route", () => {
    const result = cleanTrack([point(41.5, 0), point(42.5, 1), point(41.5001, 2)]);
    expect(result.points).toHaveLength(2);
    expect(result.removedPoints).toHaveLength(1);
    expect(result.outlierSegments.every((segment) => segment.recoverable)).toBe(true);
    expect(result.confidence).toBe("review");
    expect(result.maxObservedSpeedKmh).toBeLessThan(160);
  });

  it("keeps a valid fast downhill segment", () => {
    const result = cleanTrack([point(41.5, 0), point(41.5005, 2)]);
    expect(result.points).toHaveLength(2);
    expect(result.removedPoints).toHaveLength(0);
    expect(result.confidence).toBe("good");
  });

  it("does not remove valid fixes between alternating GPS spikes", () => {
    const result = cleanTrack([
      point(41.5, 0),
      point(42.5, 1),
      point(41.5001, 2),
      point(42.5001, 3),
      point(41.5002, 4),
    ]);
    expect(result.points.map((item) => item.time)).toEqual([0, 2, 4]);
    expect(result.removedPoints.map((item) => item.time)).toEqual([1, 3]);
  });

  it("preserves a stationary interval", () => {
    const result = cleanTrack([point(41.5, 0), point(41.5, 10), point(41.5001, 11)]);
    expect(result.points).toHaveLength(3);
    expect(result.removedPoints).toHaveLength(0);
    expect(result.confidence).toBe("good");
  });

  it("flags an unrecoverable temporal gap", () => {
    const result = cleanTrack([point(41.5, 0), point(41.501, 200)]);
    expect(result.outlierSegments[0]?.reason).toBe("temporal-gap");
    expect(result.outlierSegments[0]?.recoverable).toBe(false);
    expect(result.confidence).toBe("poor");
  });
});
