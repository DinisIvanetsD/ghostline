import { describe, expect, it } from "vitest";
import type { Point, Run, Trail } from "../types";
import {
  analyze,
  formatDelta,
  formatTime,
  personalBest,
  sectorTimes,
  theoreticalBest,
  timeAt,
} from "./analysis";

const points: Point[] = [
  { lat: 38, lon: -9, ele: 100, time: 0 },
  { lat: 38, lon: -8.99, ele: 90, time: 10 },
  { lat: 38, lon: -8.98, ele: 95, time: 20 },
];
const trail: Trail = {
  id: "t",
  name: "T",
  location: "x",
  difficulty: "x",
  points,
  boundaries: [0.5],
  sectorNames: ["a", "b"],
};
const run = (id: string, trailId = "t", duration = 20): Run => ({
  id,
  trailId,
  bikeId: "b",
  name: id,
  date: "2026-09-01",
  points: points.map((p, i) => ({ ...p, time: (i * duration) / 2 })),
  notes: "",
});

describe("analysis", () => {
  it("calculates cumulative distance, descent/ascent and km/h", () => {
    const t = analyze(points);
    expect(t.duration).toBe(20);
    expect(t.distance).toBeGreaterThan(1700);
    expect(t.descent).toBe(10);
    expect(t.ascent).toBe(5);
    expect(t.maxSpeed).toBeGreaterThan(300);
  });
  it("reports average speed in km/h and finite telemetry", () => {
    const t = analyze(points);
    expect(t.avgSpeed).toBeCloseTo((t.distance / 20) * 3.6);
    expect(t.samples.every((s) => Number.isFinite(s.speed))).toBe(true);
  });
  it("rejects invalid, non-monotonic, zero-duration, and zero-distance input", () => {
    expect(() => analyze([{ ...points[0], lat: 91 }, points[1]])).toThrow(
      /coordinates/,
    );
    expect(() =>
      analyze([
        { ...points[0], time: 1 },
        { ...points[1], time: 1 },
      ]),
    ).toThrow(/strictly increasing/);
    expect(() =>
      analyze([
        { ...points[0], time: 0 },
        { ...points[0], time: 1 },
      ]),
    ).toThrow(/distance/);
  });
  it("handles large point arrays without spread argument limits", () => {
    const many = Array.from({ length: 30_000 }, (_, i) => ({
      lat: 38 + i * 1e-6,
      lon: -9,
      ele: 0,
      time: i,
    }));
    expect(Number.isFinite(analyze(many).maxSpeed)).toBe(true);
  });
  it("interpolates and clamps normalized progress", () => {
    const t = analyze(points);
    expect(timeAt(t, 0.5)).toBeCloseTo(10);
    expect(timeAt(t, -1)).toBe(0);
    expect(timeAt(t, 2)).toBe(20);
  });
  it("includes a timed tail after the final moving point", () => {
    const t = analyze([
      { ...points[0], time: 0 },
      { ...points[1], time: 10 },
      { ...points[1], time: 20 },
    ]);
    expect(timeAt(t, 1)).toBe(20);
    expect(
      sectorTimes(
        {
          ...run("tail"),
          points: [
            { ...points[0], time: 0 },
            { ...points[1], time: 10 },
            { ...points[1], time: 20 },
          ],
        },
        { ...trail, boundaries: [] },
      ),
    ).toEqual([20]);
  });
  it("selects PB and theoretical sectors only on the requested trail", () => {
    const runs = [
      run("slow", "t", 24),
      run("fast", "t", 20),
      run("other", "x", 1),
    ];
    expect(personalBest(runs, "t")?.id).toBe("fast");
    expect(sectorTimes(runs[1], trail)).toEqual([10, 10]);
    const result = theoreticalBest(runs, trail);
    expect(result.total).toBeCloseTo(20);
    expect(result.sectors).toHaveLength(2);
  });
  it("formats time and signed deltas including rounding carry", () => {
    expect(formatTime(59.999)).toBe("1:00.00");
    expect(formatDelta(1.2)).toBe("+1.20s");
    expect(formatDelta(-1.2)).toBe("-1.20s");
    expect(formatDelta(0)).toBe("0.00s");
  });
  it("uses sorted unique interior boundaries for sector timing", () => {
    const t = { ...trail, boundaries: [1, 0.5, 0.5, 0, -1, 2] };
    expect(sectorTimes(run("x"), t)).toHaveLength(2);
    expect(theoreticalBest([run("x")], t).sectors).toHaveLength(2);
  });
});

it("demo has nine dense realistic runs and a theoretical best assembled from different runs", async () => {
  const { createDemoData } = await import("./demo");
  const data = createDemoData();
  expect(data.runs).toHaveLength(9);
  const same = data.runs.filter((r) => r.trailId === data.trails[0].id);
  expect(same).toHaveLength(7);
  for (const run of data.runs) {
    const t = analyze(run.points);
    expect(run.points.length).toBeGreaterThan(100);
    expect(t.distance).toBeGreaterThan(1000);
    expect(t.maxSpeed).toBeLessThan(100);
    expect(t.duration).toBeGreaterThan(100);
  }
  const best = personalBest(same, data.trails[0].id)!;
  const theoretical = theoreticalBest(same, data.trails[0]);
  expect(theoretical.total).toBeLessThan(analyze(best.points).duration);
  expect(new Set(theoretical.sectors.map((s) => s.runId)).size).toBeGreaterThan(
    1,
  );
  for (const run of same)
    expect(
      sectorTimes(run, data.trails[0]).reduce((a, b) => a + b, 0),
    ).toBeCloseTo(analyze(run.points).duration, 8);
});
