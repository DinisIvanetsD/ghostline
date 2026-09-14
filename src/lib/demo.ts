import type { AppData, Bike, Point, Run, Trail } from "../types";

type DemoTrail = "mundial" | "free-ride" | "secret-spot";

function geometry(kind: DemoTrail): Point[] {
  const config = {
    mundial: {
      // Trailforks trailhead: 41.51818, -8.39571 (Santa Marta das Cortiças)
      start: { lat: 41.51818, lon: -8.39571, ele: 493 },
      length: 0.011,
      width: 0.015,
      drop: 245,
      wiggle: 0.00045,
      bends: 6,
      drift: 9,
    },
    "free-ride": {
      // Trailforks trailhead: 41.51520, -8.39599 (Santa Marta das Cortiças)
      start: { lat: 41.5152, lon: -8.39599, ele: 538 },
      length: 0.008,
      width: 0.012,
      drop: 150,
      wiggle: 0.00035,
      bends: 5,
      drift: 8,
    },
    "secret-spot": {
      // Trailforks trailhead: 41.54833, -8.37211 (Sameiro / Santa Marta network)
      start: { lat: 41.54833, lon: -8.37211, ele: 511 },
      length: 0.009,
      width: 0.013,
      drop: 190,
      wiggle: 0.0004,
      bends: 7,
      drift: 6,
    },
  }[kind];
  return Array.from({ length: 181 }, (_, i) => {
    const t = i / 180;
    const wiggle = Math.sin(t * Math.PI * config.bends) * config.wiggle;
    return {
      lat: config.start.lat - t * config.length + wiggle,
      lon:
        config.start.lon +
        t * config.width +
        Math.sin(t * Math.PI * (config.bends + 3)) * 0.0007,
      ele:
        config.start.ele -
        t * config.drop +
        Math.sin(t * Math.PI * 5) * config.drift,
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
    notes: "Synthetic Braga downhill session",
    synthetic: true,
  };
}

export function createDemoData(): AppData {
  const mundial = geometry("mundial"),
    freeRide = geometry("free-ride"),
    secretSpot = geometry("secret-spot");
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
      id: "mundial",
      name: "Mundial da Santa Marta",
      location: "Santa Marta das Cortiças, Braga",
      difficulty: "Black",
      points: timedRun(
        "route",
        "mundial",
        "",
        "2026-09-01",
        "",
        [58, 54, 56, 52],
        mundial,
      ).points,
      boundaries: [0.25, 0.5, 0.75],
      sectorNames: ["Start Gate", "Pines", "Rock Garden", "Finish"],
    },
    {
      id: "free-ride",
      name: "Free Ride",
      location: "Santa Marta das Cortiças, Braga",
      difficulty: "Red",
      points: timedRun(
        "route2",
        "free-ride",
        "",
        "2026-09-01",
        "",
        [48, 44, 46],
        freeRide,
      ).points,
      boundaries: [0.33, 0.66],
      sectorNames: ["Drop In", "Jumps", "Finish"],
    },
    {
      id: "secret-spot",
      name: "Secret Spot Sameiro",
      location: "Sameiro, Braga",
      difficulty: "Black",
      points: timedRun(
        "route3",
        "secret-spot",
        "",
        "2026-09-01",
        "",
        [52, 49, 50, 47],
        secretSpot,
      ).points,
      boundaries: [0.25, 0.5, 0.75],
      sectorNames: ["Top Woods", "Technical", "Flow", "Finish"],
    },
  ];
  const runs: Run[] = [
    timedRun(
      "run-01",
      "mundial",
      "bike-enduro",
      "2026-09-01",
      "Run 01 · Warm up",
      [47, 46, 45, 45],
      mundial,
    ),
    timedRun(
      "run-02",
      "mundial",
      "bike-trail",
      "2026-09-03",
      "Run 02 · Loose lines",
      [46, 45, 47, 44],
      mundial,
    ),
    timedRun(
      "run-03",
      "mundial",
      "bike-enduro",
      "2026-09-06",
      "Run 03 · Full send",
      [44, 47, 44, 44],
      mundial,
    ),
    timedRun(
      "run-04",
      "mundial",
      "bike-trail",
      "2026-09-09",
      "Run 04 · Clean exit",
      [48, 44, 46, 45],
      mundial,
    ),
    timedRun(
      "run-05",
      "mundial",
      "bike-enduro",
      "2026-09-11",
      "Run 05 · Personal best",
      [45, 44, 45, 44],
      mundial,
    ),
    timedRun(
      "run-06",
      "mundial",
      "bike-enduro",
      "2026-09-12",
      "Run 06 · Fast roots",
      [43, 48, 46, 43],
      mundial,
    ),
    timedRun(
      "run-07",
      "mundial",
      "bike-trail",
      "2026-09-13",
      "Run 07 · Full send",
      [46, 43, 47, 46],
      mundial,
    ),
    timedRun(
      "run-08",
      "free-ride",
      "bike-trail",
      "2026-09-05",
      "Run 08 · Easy flow",
      [42, 41, 40],
      freeRide,
    ),
    timedRun(
      "run-09",
      "free-ride",
      "bike-enduro",
      "2026-09-13",
      "Run 09 · Valley sprint",
      [39, 40, 39],
      freeRide,
    ),
    timedRun(
      "run-10",
      "secret-spot",
      "bike-enduro",
      "2026-09-08",
      "Run 10 · Technical lines",
      [53, 48, 51, 46],
      secretSpot,
    ),
    timedRun(
      "run-11",
      "secret-spot",
      "bike-trail",
      "2026-09-13",
      "Run 11 · Clean finish",
      [50, 50, 48, 45],
      secretSpot,
    ),
  ];
  return {
    version: 1,
    profile: {
      name: "Alex Morgan",
      email: "alex.morgan@example.com",
      home: "Braga, Portugal",
    },
    bikes,
    trails,
    runs,
    demo: true,
  };
}
