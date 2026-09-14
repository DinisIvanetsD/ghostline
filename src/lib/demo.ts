import type { AppData, Bike, Point, Run, Trail } from "../types";

type DemoTrail = "mundial" | "free-ride" | "secret-spot";

// The rider's physical gates for Secret Spot Sameiro. Two uphill access points
// are accepted as starts; the marked finish is used to clip forgotten GPS
// capture after the run.
export const SECRET_SPOT_STARTS = [
  { lat: 41.5483056, lon: -8.3721111 },
  { lat: 41.5433056, lon: -8.3710278 },
] as const;
export const SECRET_SPOT_FINISH = { lat: 41.5628056, lon: -8.3732222 } as const;
const SECRET_SPOT_ROUTE: Point[] = [
  [41.54833, -8.37211, 513],
  [41.54843, -8.37194, 512],
  [41.54855, -8.37194, 508],
  [41.54865, -8.372, 508],
  [41.54884, -8.37195, 506],
  [41.54909, -8.37194, 506],
  [41.54929, -8.37207, 506],
  [41.54947, -8.37218, 502],
  [41.54987, -8.37209, 498],
  [41.54998, -8.37186, 498],
  [41.5502, -8.3718, 495],
  [41.55043, -8.37172, 490],
  [41.55057, -8.37176, 490],
  [41.55091, -8.37197, 487],
  [41.5512, -8.37218, 486],
  [41.55145, -8.3723, 484],
  [41.55163, -8.37241, 483],
  [41.55184, -8.37245, 477],
  [41.55195, -8.37243, 477],
  [41.55207, -8.3724, 477],
  [41.55216, -8.37244, 473],
  [41.55222, -8.37237, 473],
  [41.55221, -8.37227, 471],
  [41.55219, -8.37209, 471],
  [41.55225, -8.37195, 468],
  [41.55219, -8.37176, 464],
  [41.55225, -8.3717, 464],
  [41.55234, -8.37179, 464],
  [41.55239, -8.37164, 457],
  [41.55255, -8.37168, 457],
  [41.55265, -8.37187, 455],
  [41.55275, -8.37207, 455],
  [41.55277, -8.37215, 459],
  [41.5528, -8.37214, 459],
  [41.55283, -8.37207, 455],
  [41.55289, -8.37211, 459],
  [41.553, -8.37221, 451],
  // The rider's marked endpoint is farther north than the old public sample;
  // keep a gently sampled approach so sectors and the map terminate there.
  ...Array.from({ length: 18 }, (_, index) => {
    const from = { lat: 41.553, lon: -8.37221, ele: 451 };
    const fraction = (index + 1) / 18;
    return [
      from.lat + (SECRET_SPOT_FINISH.lat - from.lat) * fraction,
      from.lon + (SECRET_SPOT_FINISH.lon - from.lon) * fraction,
      from.ele - fraction * 12,
    ] as [number, number, number];
  }),
]
  .map(([lat, lon, ele]) => ({ lat, lon, ele, time: 0 }))
  .flatMap((point, index, route) => {
    if (index === 0) return [point];
    const previous = route[index - 1];
    return Array.from({ length: 5 }, (_, step) => {
      const fraction = (step + 1) / 5;
      return {
        lat: previous.lat + (point.lat - previous.lat) * fraction,
        lon: previous.lon + (point.lon - previous.lon) * fraction,
        ele: previous.ele + (point.ele - previous.ele) * fraction,
        time: 0,
      };
    });
  });

function geometry(kind: DemoTrail): Point[] {
  if (kind === "secret-spot") return SECRET_SPOT_ROUTE.map((point) => ({ ...point }));
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
      startPoints: [...SECRET_SPOT_STARTS],
      finishPoint: SECRET_SPOT_FINISH,
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
