import { describe, expect, it } from "vitest";
import type { Point } from "../types";
import { clipToFinish, clipToRouteFinish, detectTrail, matchRoute, scoreRouteMatch } from "./routeMatch";

const route: Point[] = Array.from({ length: 20 }, (_, i) => ({
  lat: 38 + i * 0.001,
  lon: -9 + Math.sin(i / 3) * 0.001,
  ele: 100,
  time: i,
}));
const shifted = (step: number) =>
  route
    .filter((_, i) => i % step === 0 || i === route.length - 1)
    .map((p) => ({ ...p, time: p.time * 2 }));
describe("matchRoute", () => {
  it("clips post-finish capture at an explicit physical gate", () => {
    const points: Point[] = [
      { lat: 41, lon: 0, ele: 100, time: 0 },
      { lat: 41.001, lon: 0.001, ele: 99, time: 1 },
      { lat: 41.002, lon: 0.002, ele: 98, time: 2 },
    ];
    const clipped = clipToFinish(points, { lat: 41.001, lon: 0.001 });
    expect(clipped).toHaveLength(2);
    expect(clipped.at(-1)).toMatchObject({ lat: 41.001, lon: 0.001 });
  });
  it("leaves a recording untouched when the gate is not nearby", () => {
    const points = [route[0], route[1]];
    expect(clipToFinish(points, { lat: 42, lon: 1 })).toEqual(points);
  });
  it("uses the route corridor when GPS drifts before the finish gate", () => {
    const sparseRoute: Point[] = Array.from({ length: 3 }, (_, index) => ({
      lat: 38 + index * 0.003,
      lon: -9,
      ele: 100,
      time: index,
    }));
    const finish = sparseRoute.at(-1)!;
    const drifted = [
      ...sparseRoute.slice(0, -1),
      { ...finish, lat: finish.lat + 0.0025, lon: finish.lon, time: 3 },
      { lat: 38.03, lon: -8.9, ele: 100, time: 4 },
    ];
    const clipped = clipToRouteFinish(drifted, sparseRoute, finish);
    expect(clipped).toHaveLength(3);
    expect(clipped.at(-1)).toMatchObject({ lat: finish.lat, lon: finish.lon });
  });
  it("accepts the same route and sparse GPX", () => {
    expect(matchRoute(route, route).ok).toBe(true);
    expect(matchRoute(shifted(4), route).ok).toBe(true);
  });
  it("accepts a run that starts at a configured alternate gate", () => {
    const alternate = { lat: route[0].lat - 0.0004, lon: route[0].lon + 0.0002 };
    const run = [
      { ...alternate, ele: 100, time: 0 },
      ...route.map((point, index) => ({
        ...point,
        time: index + 1,
      })),
    ];
    expect(matchRoute(run, route, { startPoints: [alternate] }).ok).toBe(true);
  });
  it("rejects reverse, remote, and mismatched length routes", () => {
    expect(matchRoute([...route].reverse(), route).ok).toBe(false);
    expect(
      matchRoute(
        route.map((p) => ({ ...p, lat: p.lat + 1 })),
        route,
      ).ok,
    ).toBe(false);
    expect(matchRoute(route.slice(0, 5), route).ok).toBe(false);
  });
  it("handles a closed loop direction", () => {
    const loop = [...route, route[0]];
    expect(matchRoute(loop, loop).ok).toBe(true);
    expect(matchRoute([...loop].reverse(), loop).ok).toBe(false);
  });
  it("scores a matching route and detects it among nearby trail choices", () => {
    const other: Point[] = route.map((point) => ({ ...point, lat: point.lat + 0.05 }));
    const scored = scoreRouteMatch(shifted(2), route);
    expect(scored.confidence).toBe("high");
    expect(scored.corridorCoverage).toBeGreaterThan(0.9);
    expect(detectTrail(shifted(2), [
      { id: "other", name: "Other", location: "Braga", difficulty: "Black", points: other, boundaries: [], sectorNames: [] },
      { id: "target", name: "Target", location: "Braga", difficulty: "Black", points: route, boundaries: [], sectorNames: [] },
    ])?.trail.id).toBe("target");
  });
});

it("rejects reverse travel on a short two-point route", () => {
  const short = [route[0], { ...route[0], lat: route[0].lat + 0.001 }];
  expect(matchRoute([...short].reverse(), short).ok).toBe(false);
  expect(matchRoute(short, short).ok).toBe(true);
});
