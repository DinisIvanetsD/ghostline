import type { AppData, Bike, Point, Run, Trail } from "../types";
import { TRAIL_ROUTES, type RouteVertex } from "./trailRoutes";

type DemoTrail = "mundial" | "free-ride" | "secret-spot";
type RouteId = keyof typeof TRAIL_ROUTES;

// The rider's physical gates for Secret Spot Sameiro. Two uphill access points
// are accepted as starts (Secret Spot 1 and the Bonus Spot drop-in above it);
// the marked finish is used to clip forgotten GPS capture after the run.
export const SECRET_SPOT_STARTS = [
  { lat: 41.5483056, lon: -8.3721111 },
  { lat: 41.5433056, lon: -8.3710278 },
] as const;
export const SECRET_SPOT_FINISH = { lat: 41.5628056, lon: -8.3732222 } as const;

const metersBetween = (a: Pick<Point, "lat" | "lon">, b: Pick<Point, "lat" | "lon">) => {
  const rad = Math.PI / 180;
  return Math.hypot(
    (b.lon - a.lon) * rad * 6_371_000 * Math.cos(((a.lat + b.lat) * rad) / 2),
    (b.lat - a.lat) * rad * 6_371_000,
  );
};

// Resample Trailforks vertices to ~5 m spacing so point index tracks distance,
// which keeps synthetic sector timing proportional along the real route.
function densify(vertices: RouteVertex[], stepMeters = 5): Point[] {
  const out: Point[] = [];
  vertices.forEach(([lat, lon, ele], i) => {
    if (i === 0) {
      out.push({ lat, lon, ele, time: 0 });
      return;
    }
    const [plat, plon, pele] = vertices[i - 1];
    const steps = Math.max(1, Math.round(metersBetween({ lat: plat, lon: plon }, { lat, lon }) / stepMeters));
    for (let step = 1; step <= steps; step += 1) {
      const f = step / steps;
      out.push({
        lat: plat + (lat - plat) * f,
        lon: plon + (lon - plon) * f,
        ele: pele + (ele - pele) * f,
        time: 0,
      });
    }
  });
  return out;
}

function routeLength(points: Point[]): number {
  return points.reduce((sum, p, i) => (i ? sum + metersBetween(points[i - 1], p) : 0), 0);
}

function geometry(kind: RouteId): Point[] {
  const vertices = TRAIL_ROUTES[kind].flat() as RouteVertex[];
  // The rider's finish gate sits ~10 m past the Trailforks segment end.
  if (kind === "secret-spot")
    vertices.push([SECRET_SPOT_FINISH.lat, SECRET_SPOT_FINISH.lon, vertices.at(-1)![2]]);
  return densify(vertices);
}

// Secret Spot sectors are the three Trailforks segments; each gate sits where
// the next segment starts, so the short connectors belong to the sector above.
function segmentBoundaries(kind: DemoTrail): number[] {
  const segments = TRAIL_ROUTES[kind] as RouteVertex[][];
  const total = routeLength(geometry(kind));
  return segments.slice(1).map((next, index) => {
    const upToGate = densify([...segments.slice(0, index + 1).flat(), next[0]]);
    return Math.round((routeLength(upToGate) / total) * 1000) / 1000;
  });
}
export const SECRET_SPOT_BOUNDARIES = segmentBoundaries("secret-spot");

function timedRun(
  id: string,
  trailId: string,
  bikeId: string,
  date: string,
  name: string,
  durations: number[],
  points: Point[],
  boundaries = durations.slice(1).map((_, i) => (i + 1) / durations.length),
): Run {
  const epoch = Date.parse(`${date}T09:00:00Z`),
    n = points.length - 1;
  const edges = [0, ...boundaries, 1].map((f) => f * n);
  const times = points.map((_, i) => {
    const next = edges.findIndex((edge) => i < edge);
    const sector = next < 0 ? durations.length - 1 : next - 1;
    const span = edges[sector + 1] - edges[sector];
    const local = span > 0 ? (i - edges[sector]) / span : 1;
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

// Mundial and Free Ride sector gates sit at the clear changes in the EU-DEM
// gradient profile of each Trailforks route (steep → flat → steep). Riders can
// rename or move them in Trails once they map the real features on the ground.
export const DEMO_SECTORS = {
  mundial: {
    boundaries: [0.22, 0.66, 0.79],
    sectorNames: ["Arranque", "Zona íngreme", "Plano a pedalar", "Descida final"],
  },
  "free-ride": {
    boundaries: [0.23, 0.7, 0.75, 0.85],
    sectorNames: ["Arranque", "Corpo central", "Plano a pedalar", "Muro", "Chegada"],
  },
  "secret-spot": {
    boundaries: SECRET_SPOT_BOUNDARIES,
    sectorNames: ["Secret Spot 1", "Secret Spot 2", "Secret Spot 3"],
  },
} as const;
// Trailforks grades: Mundial and Secret Spot are blue, Freeride is red.
export const DEMO_DIFFICULTY = { mundial: "Blue", "free-ride": "Red", "secret-spot": "Blue" } as const;
const endOf = (points: Point[]) => ({ lat: points.at(-1)!.lat, lon: points.at(-1)!.lon });
export const DEMO_FINISH_GATES = {
  mundial: endOf(geometry("mundial")),
  "free-ride": endOf(geometry("free-ride")),
  "secret-spot": SECRET_SPOT_FINISH,
} as const;

export function createDemoData(): AppData {
  const mundial = geometry("mundial"),
    freeRide = geometry("free-ride"),
    secretSpot = geometry("secret-spot");
  // A Secret Spot run dropped in from Bonus Spot: the extra top section is
  // timed as sector 0 and left out of the course time.
  const bonus = densify(TRAIL_ROUTES["bonus-spot"].flat() as RouteVertex[]);
  const fromBonus = [...bonus, ...secretSpot.slice(1)];
  const bonusShare = (bonus.length - 1) / (fromBonus.length - 1);
  const fromBonusBoundaries = [
    bonusShare,
    ...SECRET_SPOT_BOUNDARIES.map((b) => bonusShare + b * (1 - bonusShare)),
  ];
  const sectors = (id: DemoTrail) => ({
    boundaries: [...DEMO_SECTORS[id].boundaries],
    sectorNames: [...DEMO_SECTORS[id].sectorNames],
  });
  const run = (
    id: string,
    trailId: DemoTrail,
    bikeId: string,
    date: string,
    name: string,
    durations: number[],
    points: Point[],
  ) => timedRun(id, trailId, bikeId, date, name, durations, points, [...DEMO_SECTORS[trailId].boundaries]);
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
      difficulty: DEMO_DIFFICULTY.mundial,
      points: run("route", "mundial", "", "2026-09-01", "", [42, 78, 31, 38], mundial).points,
      ...sectors("mundial"),
      finishPoint: DEMO_FINISH_GATES.mundial,
    },
    {
      id: "free-ride",
      name: "Free Ride",
      location: "Santa Marta das Cortiças, Braga",
      difficulty: DEMO_DIFFICULTY["free-ride"],
      points: run("route2", "free-ride", "", "2026-09-01", "", [52, 98, 23, 23, 36], freeRide).points,
      ...sectors("free-ride"),
      finishPoint: DEMO_FINISH_GATES["free-ride"],
    },
    {
      id: "secret-spot",
      name: "Secret Spot Sameiro",
      location: "Sameiro, Braga",
      difficulty: DEMO_DIFFICULTY["secret-spot"],
      points: run("route3", "secret-spot", "", "2026-09-01", "", [100, 108, 73], secretSpot).points,
      ...sectors("secret-spot"),
      startPoints: [...SECRET_SPOT_STARTS],
      leadInName: "Bonus Spot",
      finishPoint: SECRET_SPOT_FINISH,
    },
  ];
  const runs: Run[] = [
    run("run-01", "mundial", "bike-enduro", "2026-09-01", "Run 01 · Aquecimento", [41, 77, 30, 38], mundial),
    run("run-02", "mundial", "bike-trail", "2026-09-03", "Run 02 · Linhas soltas", [40, 78, 31, 37], mundial),
    run("run-03", "mundial", "bike-enduro", "2026-09-06", "Run 03 · A fundo", [39, 79, 30, 37], mundial),
    run("run-04", "mundial", "bike-trail", "2026-09-09", "Run 04 · Saída limpa", [42, 76, 31, 37], mundial),
    run("run-05", "mundial", "bike-enduro", "2026-09-11", "Run 05 · Melhor pessoal", [40, 75, 30, 36], mundial),
    run("run-06", "mundial", "bike-enduro", "2026-09-12", "Run 06 · Raízes rápidas", [38, 80, 31, 35], mundial),
    run("run-07", "mundial", "bike-trail", "2026-09-13", "Run 07 · A fundo", [41, 74, 32, 38], mundial),
    run("run-08", "free-ride", "bike-trail", "2026-09-05", "Run 08 · Ritmo solto", [51, 96, 22, 23, 35], freeRide),
    run("run-09", "free-ride", "bike-enduro", "2026-09-13", "Run 09 · Sprint no vale", [49, 97, 21, 22, 34], freeRide),
    run("run-10", "secret-spot", "bike-enduro", "2026-09-08", "Run 10 · Linhas técnicas", [104, 106, 75], secretSpot),
    run("run-11", "secret-spot", "bike-trail", "2026-09-13", "Run 11 · Final limpo", [99, 109, 71], secretSpot),
    timedRun(
      "run-12",
      "secret-spot",
      "bike-enduro",
      "2026-09-14",
      "Run 12 · Desde o Bonus Spot",
      [56, 101, 107, 72],
      fromBonus,
      fromBonusBoundaries,
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
