import { describe, expect, it } from "vitest";
import type { Point, Run, Trail } from "../types";
import { progressionInsights } from "./progressionInsights";

const points: Point[] = [
  { lat: 41, lon: -8, ele: 500, time: 0 },
  { lat: 41.001, lon: -8, ele: 450, time: 10 },
  { lat: 41.002, lon: -8, ele: 400, time: 20 },
];
const run = (id: string, date: string, duration: number): Run => ({
  id,
  trailId: "trail",
  bikeId: "bike",
  name: id,
  date,
  points: points.map((point, index) => ({ ...point, time: (index * duration) / 2 })),
  notes: "",
});
const trail: Trail = {
  id: "trail",
  name: "Test trail",
  location: "Braga",
  difficulty: "DH",
  points,
  boundaries: [0.5],
  sectorNames: ["Top", "Finish"],
};

describe("progressionInsights", () => {
  it("returns null metrics for an empty history", () => {
    expect(progressionInsights([])).toEqual({
      runCount: 0,
      latestRunId: null,
      latestDuration: null,
      personalBestRunId: null,
      personalBestDuration: null,
      latestDeltaToPersonalBest: null,
      recentAverageDuration: null,
      consistencySpread: null,
      consistencyScore: null,
      trend: "insufficient",
      nextTargetDuration: null,
      focusSector: null,
      sectorTrends: [],
    });
  });

  it("treats a single run as the PB with zero spread", () => {
    const result = progressionInsights([run("only", "2026-09-03", 20)]);
    expect(result.latestRunId).toBe("only");
    expect(result.personalBestRunId).toBe("only");
    expect(result.latestDeltaToPersonalBest).toBe(0);
    expect(result.recentAverageDuration).toBe(20);
    expect(result.consistencySpread).toBe(0);
    expect(result.consistencyScore).toBe(100);
    expect(result.trend).toBe("insufficient");
    expect(result.nextTargetDuration).toBe(20);
  });

  it("orders by date and computes the latest delta to the PB", () => {
    const result = progressionInsights([
      run("latest", "2026-09-05", 24),
      run("pb", "2026-09-02", 18),
      run("middle", "2026-09-04", 21),
    ], { recentWindow: 2 });
    expect(result.latestRunId).toBe("latest");
    expect(result.personalBestRunId).toBe("pb");
    expect(result.latestDeltaToPersonalBest).toBe(6);
    expect(result.recentAverageDuration).toBe(22.5);
    expect(result.consistencySpread).toBe(3);
    expect(result.consistencyScore).toBeCloseTo(86.67, 1);
    expect(result.trend).toBe("slowing");
    expect(result.nextTargetDuration).toBeCloseTo(19.575, 5);
  });

  it("provides sector trend metrics when a trail is supplied", () => {
    const result = progressionInsights(
      [run("a", "2026-09-01", 20), run("b", "2026-09-02", 16)],
      { trail },
    );
    expect(result.sectorTrends).toHaveLength(2);
    expect(result.sectorTrends[0].name).toBe("Top");
    expect(result.sectorTrends[0].deltaToBest).toBe(0);
    expect(result.focusSector?.name).toBe("Top");
  });
});
