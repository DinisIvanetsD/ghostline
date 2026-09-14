// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDemoData } from "./demo";
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
