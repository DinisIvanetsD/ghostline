import { describe, expect, it } from "vitest";
import { streamsToPoints } from "./strava";

describe("Strava streams", () => {
  const base = {
    name: "Santa Marta",
    startDate: "2026-09-14T09:00:00Z",
    latlng: [
      [41.518, -8.395],
      [41.519, -8.396],
    ],
    time: [0, 4],
    altitude: [494, 480],
  };

  it("turns streams into timestamped points", () => {
    expect(streamsToPoints(base)).toEqual([
      { lat: 41.518, lon: -8.395, ele: 494, time: Date.parse("2026-09-14T09:00:00Z") },
      { lat: 41.519, lon: -8.396, ele: 480, time: Date.parse("2026-09-14T09:00:04Z") },
    ]);
  });

  it("tolerates missing altitude and rejects broken tracks", () => {
    expect(streamsToPoints({ ...base, altitude: [] })[1].ele).toBe(0);
    expect(() => streamsToPoints({ ...base, latlng: [] })).toThrow(/não tem traçado GPS/);
    expect(() => streamsToPoints({ ...base, time: [0] })).toThrow(/não tem traçado GPS/);
    expect(() => streamsToPoints({ ...base, latlng: [[95, 0], [41, -8]] })).toThrow(/inválidos/);
  });
});
