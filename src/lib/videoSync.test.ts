import { describe, expect, it } from "vitest";
import type { Point, Run, Trail } from "../types";
import { detectStops, runTimeForVideo, sectorVideoWindows, videoTimeForRun } from "./videoSync";

const point = (time: number, lat: number, lon = -8.4): Point => ({ time, lat, lon, ele: 100 });
const trail: Trail = { id: "t", name: "Trail", location: "Braga", difficulty: "Black", points: [point(0, 41), point(10, 41.001)], boundaries: [0.5], sectorNames: ["Top", "Bottom"] };
const run: Run = { id: "r", trailId: "t", bikeId: "b", name: "Run", date: "2026-01-01", notes: "", points: [point(0, 41), point(10, 41.001), point(20, 41.002), point(30, 41.003)] };

describe("video synchronization", () => {
  it("detects contiguous GPS stops and trims the ride window", () => {
    const points = [point(0, 41), point(5, 41.0005), point(8, 41.0005), point(12, 41.0005), point(17, 41.001), point(20, 41.0015)];
    const result = detectStops(points, { speedThresholdKmh: 2, minDurationSeconds: 3 });
    expect(result.stops).toHaveLength(1);
    expect(result.stops[0]).toMatchObject({ startTime: 5, endTime: 12, duration: 7 });
    expect(result.rideWindow).toMatchObject({ startTime: 0, endTime: 20, duration: 20 });
  });

  it("removes low-speed lead-in and roll-out from the ride window", () => {
    const points = [
      point(0, 41),
      point(5, 41),
      point(10, 41.0005),
      point(15, 41.001),
      point(20, 41.001),
      point(25, 41.001),
    ];
    const result = detectStops(points, { speedThresholdKmh: 2, minDurationSeconds: 3 });
    expect(result.stops).toHaveLength(2);
    expect(result.rideWindow).toMatchObject({ startTime: 5, endTime: 15, duration: 10 });
  });

  it("maps both directions with offset, playback rate, and piecewise anchors", () => {
    const settings = { offsetSeconds: 4, playbackRate: 2 };
    expect(videoTimeForRun(10, settings)).toBe(9);
    expect(runTimeForVideo(9, settings)).toBe(10);
    const anchored = { ...settings, anchors: [{ runTime: 0, videoTime: 8 }, { runTime: 10, videoTime: 18 }] };
    expect(videoTimeForRun(5, anchored)).toBe(13);
    expect(runTimeForVideo(13, anchored)).toBe(5);
  });

  it("returns video windows aligned to the trail sectors", () => {
    const windows = sectorVideoWindows(run, trail, { offsetSeconds: 2 });
    expect(windows).toHaveLength(2);
    expect(windows[0].name).toBe("Top");
    expect(windows[0].runStartTime).toBe(0);
    expect(windows[0].runEndTime).toBe(15);
    expect(windows[0].videoStartTime).toBe(2);
    expect(windows[0].videoEndTime).toBe(17);
    expect(sectorVideoWindows({ ...run, trailId: "other" }, trail, { offsetSeconds: 0 })).toEqual([]);
  });
});
