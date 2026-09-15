// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDemoData,
  SECRET_SPOT_FINISH,
  SECRET_SPOT_STARTS,
} from "./demo";
import { loadData, parseBackup, readStorageWarning, saveData } from "./storage";

describe("storage validation", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  it("round trips valid data and rejects broken references", () => {
    const data = createDemoData();
    saveData(data);
    expect(loadData()).toEqual(data);
    const broken = { ...data, runs: [{ ...data.runs[0], bikeId: "missing" }] };
    expect(() => saveData(broken)).toThrow(/missing bike/);
  });
  it("keeps workspaces isolated when an account scope is supplied", () => {
    const data = createDemoData();
    data.profile.name = "Rider A";
    saveData(data, "user-a");

    expect(loadData("user-a").profile.name).toBe("Rider A");
    expect(loadData("user-b").demo).toBe(true);
    expect(localStorage.getItem("ghostline.data.v1.user-a")).toContain(
      "Rider A",
    );
  });
  it("shows demo data while preserving corrupt storage and exposes a warning", () => {
    localStorage.setItem("ghostline.data.v1", JSON.stringify({ version: 2 }));
    const loaded = loadData();
    expect(loaded.demo).toBe(true);
    expect(readStorageWarning()).toMatch(/could not be loaded/);
    expect(localStorage.getItem("ghostline.data.v1")).toContain("version");
  });
  it("upgrades the original Sintra demo to the Braga demo", () => {
    const legacy = createDemoData();
    legacy.profile.home = "Sintra, Portugal";
    legacy.trails = legacy.trails.slice(0, 2);
    legacy.trails[0].id = "pedra-branca";
    legacy.trails[1].id = "fojo";
    legacy.runs = legacy.runs
      .filter((run) => run.trailId !== "secret-spot")
      .map((run) => ({
        ...run,
        trailId: run.trailId === "mundial" ? "pedra-branca" : "fojo",
      }));
    localStorage.setItem("ghostline.data.v1", JSON.stringify(legacy));
    const upgraded = loadData();
    expect(upgraded.profile.home).toBe("Braga, Portugal");
    expect(upgraded.trails.map((trail) => trail.id)).toEqual([
      "mundial",
      "free-ride",
      "secret-spot",
    ]);
    expect(localStorage.getItem("ghostline.data.v1")).toContain("Mundial");
  });
  it("refreshes named Braga demo spots without touching custom data", () => {
    const previous = createDemoData();
    previous.trails[0].name = "Mundial";
    previous.trails[0].location = "Braga, Portugal";
    previous.trails[1].name = "Free Ride";
    previous.trails[1].location = "Braga, Portugal";
    previous.trails[2].name = "Secret Spot";
    previous.trails[2].location = "Braga, Portugal";
    localStorage.setItem("ghostline.data.v1", JSON.stringify(previous));
    const upgraded = loadData();
    expect(upgraded.trails.map((trail) => trail.name)).toEqual([
      "Mundial da Santa Marta",
      "Free Ride",
      "Secret Spot Sameiro",
    ]);
  });
  it("adds the Secret Spot finish gate and trims an old post-finish tail", () => {
    const previous = createDemoData();
    const secret = previous.trails.find((trail) => trail.id === "secret-spot")!;
    delete secret.finishPoint;
    const base = secret.points.map((point, index) => ({
      ...point,
      time: Date.parse("2026-09-14T09:00:00Z") + index * 1000,
    }));
    const tail = [
      ...base,
      { lat: 41.5635, lon: -8.3733, ele: 440, time: base.at(-1)!.time + 1000 },
      { lat: 41.565, lon: -8.374, ele: 435, time: base.at(-1)!.time + 2000 },
    ];
    previous.runs = previous.runs.map((run) =>
      run.trailId === "secret-spot" ? { ...run, points: tail } : run,
    );
    previous.demo = false;
    secret.points = tail;
    localStorage.setItem("ghostline.data.v1", JSON.stringify(previous));

    const loaded = loadData();
    const loadedTrail = loaded.trails.find((trail) => trail.id === "secret-spot")!;
    expect(loadedTrail.finishPoint).toEqual(SECRET_SPOT_FINISH);
    expect(loadedTrail.startPoints).toEqual(SECRET_SPOT_STARTS);
    expect(loadedTrail.points.at(-1)).toMatchObject(SECRET_SPOT_FINISH);
    loaded.runs
      .filter((run) => run.trailId === "secret-spot")
      .forEach((run) => expect(run.points.at(-1)).toMatchObject(SECRET_SPOT_FINISH));
    expect(localStorage.getItem("ghostline.data.v1")).toContain("finishPoint");
  });
  it("refreshes a personalized workspace that still has the old Secret Spot demo route", () => {
    const previous = createDemoData();
    const secret = previous.trails.find((trail) => trail.id === "secret-spot")!;
    const oldRoute = Array.from({ length: 181 }, (_, index) => ({
      lat: 41.54833 - (index / 180) * 0.009,
      lon: -8.37211 + (index / 180) * 0.013,
      ele: 511 - (index / 180) * 190,
      time: Date.parse("2026-09-14T09:00:00Z") + index * 1000,
    }));
    secret.points = oldRoute;
    secret.finishPoint = SECRET_SPOT_FINISH;
    previous.runs = previous.runs.map((run) =>
      run.trailId === "secret-spot"
        ? { ...run, points: oldRoute.map((point, index) => ({ ...point, time: point.time + index * 1000 })) }
        : run,
    );
    previous.demo = false;
    localStorage.setItem("ghostline.data.v1", JSON.stringify(previous));

    const loaded = loadData();
    const loadedTrail = loaded.trails.find((trail) => trail.id === "secret-spot")!;
    expect(loadedTrail.points).toHaveLength(271);
    expect(loadedTrail.points.at(-1)).toMatchObject(SECRET_SPOT_FINISH);
    expect(loadedTrail.points.at(-1)!.lat).toBe(41.5628056);
  });
  it("validates backups and rejects duplicate IDs", () => {
    const data = createDemoData();
    expect(parseBackup(JSON.stringify(data))).toEqual(data);
    const broken = { ...data, bikes: [data.bikes[0], { ...data.bikes[0] }] };
    expect(() => parseBackup(JSON.stringify(broken))).toThrow(
      /IDs must be unique/,
    );
  });
  it("surfaces storage quota errors", () => {
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("quota", "QuotaExceededError");
      });
    expect(() => saveData(createDemoData())).toThrow(/quota/i);
    setItem.mockRestore();
  });
});

it("rejects invalid trail geometry and run dates in backups", () => {
  const data = createDemoData();
  expect(() =>
    parseBackup(
      JSON.stringify({
        ...data,
        trails: [
          {
            ...data.trails[0],
            points: [{ ...data.trails[0].points[0], lat: 100 }],
          },
        ],
      }),
    ),
  ).toThrow(/point count|range/);
  expect(() =>
    parseBackup(
      JSON.stringify({ ...data, runs: [{ ...data.runs[0], date: "invalid" }] }),
    ),
  ).toThrow(/date/);
});
