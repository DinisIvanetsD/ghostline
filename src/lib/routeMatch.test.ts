import { describe, expect, it } from "vitest";
import type { Point } from "../types";
import { matchRoute } from "./routeMatch";

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
  it("accepts the same route and sparse GPX", () => {
    expect(matchRoute(route, route).ok).toBe(true);
    expect(matchRoute(shifted(4), route).ok).toBe(true);
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
});

it("rejects reverse travel on a short two-point route", () => {
  const short = [route[0], { ...route[0], lat: route[0].lat + 0.001 }];
  expect(matchRoute([...short].reverse(), short).ok).toBe(false);
  expect(matchRoute(short, short).ok).toBe(true);
});
