import { describe, expect, it } from "vitest";
import { createDemoData } from "./demo";
import { leaderboardRow, parseLeaderboard } from "./leaderboard";

describe("leaderboard", () => {
  const data = createDemoData();
  const trail = data.trails[0];
  const real = { ...data.runs[0], synthetic: false };

  it("publishes only name, course time, sectors and date", () => {
    const row = leaderboardRow(trail, real, "  Dinis  ");
    expect(Object.keys(row).sort()).toEqual(["best_seconds", "rider_name", "run_date", "sectors", "trail_key"]);
    expect(row.rider_name).toBe("Dinis");
    expect(row.sectors).toHaveLength(trail.boundaries.length + 1);
    expect(row.best_seconds).toBeCloseTo(row.sectors.reduce((a, b) => a + b, 0), 1);
  });

  it("refuses demo runs, custom trails and empty names", () => {
    expect(() => leaderboardRow(trail, data.runs[0], "Dinis")).toThrow(/demonstração/);
    expect(() => leaderboardRow({ ...trail, id: "trail-x" }, real, "Dinis")).toThrow(/classificação partilhada/);
    expect(() => leaderboardRow(trail, real, " ")).toThrow(/nome/);
  });

  it("sorts rows and drops malformed ones", () => {
    const rows = parseLeaderboard([
      { user_id: "b", rider_name: "B", best_seconds: "190.5", sectors: [1, 2], run_date: "2026-09-01" },
      { user_id: "a", rider_name: "A", best_seconds: 180, sectors: null, run_date: "2026-09-02" },
      { user_id: 3, rider_name: "bad", best_seconds: 1 },
    ]);
    expect(rows.map((row) => row.riderName)).toEqual(["A", "B"]);
    expect(rows[1].bestSeconds).toBe(190.5);
  });
});
