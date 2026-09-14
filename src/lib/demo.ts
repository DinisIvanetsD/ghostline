import type { AppData, Bike, Point, Run, Trail } from "../types";

function geometry(kind: "primary" | "secondary"): Point[] {
  const start =
    kind === "primary"
      ? { lat: 38.7872, lon: -9.3905, ele: 430 }
      : { lat: 38.792, lon: -9.378, ele: 350 };
  return Array.from({ length: 181 }, (_, i) => {
    const t = i / 180;
    const wiggle =
      Math.sin(t * Math.PI * 6) * (kind === "primary" ? 0.0012 : 0.0008);
    return {
      lat: start.lat - t * (kind === "primary" ? 0.009 : 0.007) + wiggle,
      lon:
        start.lon +
        t * (kind === "primary" ? 0.012 : 0.01) +
        Math.sin(t * Math.PI * 9) * 0.0006,
      ele:
        start.ele -
        t * (kind === "primary" ? 180 : 105) +
        Math.sin(t * Math.PI * 5) * 4,
      time: 0,
    };
  });
}
function timedRun(
  id: string,
  trailId: string,
  bikeId: string,
  date: string,
  name: string,
  durations: number[],
  points: Point[],
): Run {
  const epoch = Date.parse(`${date}T09:00:00Z`),
    n = points.length - 1;
  const times = points.map((_, i) => {
    const sector = Math.min(
      durations.length - 1,
      Math.floor(i / (n / durations.length)),
    );
    const local =
      (i - (sector * n) / durations.length) / (n / durations.length);
    return (
      epoch +
      (durations.slice(0, sector).reduce((a, b) => a + b, 0) +
        Math.max(0, Math.min(1, local)) * durations[sector]) *
        1000
    );
  });
  return {
    id,
    trailId,
    bikeId,
    name,
    date,
    points: points.map((p, i) => ({ ...p, time: times[i] })),
    notes: "Synthetic Sintra downhill session",
    synthetic: true,
  };
}

export function createDemoData(): AppData {
  const primary = geometry("primary"),
    secondary = geometry("secondary");
  const bikes: Bike[] = [
    {
      id: "bike-enduro",
      name: "Enduro 29",
      brand: "Canyon",
      travel: 170,
      type: "Enduro",
    },
    {
      id: "bike-trail",
      name: "Trail 27.5",
      brand: "Santa Cruz",
      travel: 140,
      type: "Trail",
    },
  ];
  const trails: Trail[] = [
    {
      id: "pedra-branca",
      name: "Pedra Branca",
      location: "Sintra, Portugal",
      difficulty: "Black",
      points: timedRun(
        "route",
        "pedra-branca",
        "",
        "2026-09-01",
        "",
        [45, 45, 45, 45],
        primary,
      ).points,
      boundaries: [0.25, 0.5, 0.75],
      sectorNames: ["Start", "Pines", "Rock Garden", "Finish"],
    },
    {
      id: "fojo",
      name: "Fojo",
      location: "Sintra, Portugal",
      difficulty: "Blue",
      points: timedRun(
        "route2",
        "fojo",
        "",
        "2026-09-01",
        "",
        [40, 40, 40],
        secondary,
      ).points,
      boundaries: [0.33, 0.66],
      sectorNames: ["Upper Woods", "Valley", "Finish"],
    },
  ];
  const runs: Run[] = [
    timedRun(
      "run-01",
      "pedra-branca",
      "bike-enduro",
      "2026-09-01",
      "Run 01 · Warm up",
      [47, 46, 45, 45],
      primary,
    ),
    timedRun(
      "run-02",
      "pedra-branca",
      "bike-trail",
      "2026-09-03",
      "Run 02 · Loose lines",
      [46, 45, 47, 44],
      primary,
    ),
    timedRun(
      "run-03",
      "pedra-branca",
      "bike-enduro",
      "2026-09-06",
      "Run 03 · Full send",
      [44, 47, 44, 44],
      primary,
    ),
    timedRun(
      "run-04",
      "pedra-branca",
      "bike-trail",
      "2026-09-09",
      "Run 04 · Clean exit",
      [48, 44, 46, 45],
      primary,
    ),
    timedRun(
      "run-05",
      "pedra-branca",
      "bike-enduro",
      "2026-09-11",
      "Run 05 · Personal best",
      [45, 44, 45, 44],
      primary,
    ),
    timedRun(
      "run-06",
      "pedra-branca",
      "bike-enduro",
      "2026-09-12",
      "Run 06 · Fast roots",
      [43, 48, 46, 43],
      primary,
    ),
    timedRun(
      "run-07",
      "pedra-branca",
      "bike-trail",
      "2026-09-13",
      "Run 07 · Full send",
      [46, 43, 47, 46],
      primary,
    ),
    timedRun(
      "run-08",
      "fojo",
      "bike-trail",
      "2026-09-05",
      "Run 08 · Easy flow",
      [42, 41, 40],
      secondary,
    ),
    timedRun(
      "run-09",
      "fojo",
      "bike-enduro",
      "2026-09-13",
      "Run 09 · Valley sprint",
      [39, 40, 39],
      secondary,
    ),
  ];
  return {
    version: 1,
    profile: {
      name: "Alex Morgan",
      email: "alex.morgan@example.com",
      home: "Sintra, Portugal",
    },
    bikes,
    trails,
    runs,
    demo: true,
  };
}
