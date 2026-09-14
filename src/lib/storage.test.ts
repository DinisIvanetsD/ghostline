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
