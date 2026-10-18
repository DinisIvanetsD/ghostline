// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { acceptFix, clearRecording, loadRecording, saveRecording } from "./recorder";

const fix = (over: Partial<Parameters<typeof acceptFix>[0]> = {}) => ({
  latitude: 41.518,
  longitude: -8.395,
  altitude: 490,
  accuracy: 8,
  timestamp: 1_000,
  ...over,
});

describe("live GPS recorder", () => {
  beforeEach(() => localStorage.clear());

  it("keeps accurate, forward-moving fixes", () => {
    const first = acceptFix(fix())!;
    expect(first).toEqual({ lat: 41.518, lon: -8.395, ele: 490, time: 1_000 });
    expect(acceptFix(fix({ timestamp: 2_000, altitude: null }), first)?.ele).toBe(490);
  });

  it("drops imprecise, repeated or impossible fixes", () => {
    const first = acceptFix(fix())!;
    expect(acceptFix(fix({ accuracy: 45 }))).toBeNull();
    expect(acceptFix(fix({ timestamp: 1_000 }), first)).toBeNull();
    expect(acceptFix(fix({ latitude: 95 }))).toBeNull();
    expect(acceptFix(fix({ accuracy: Number.NaN }))).toBeNull();
  });

  it("survives a reload, stays with its rider and ignores broken storage", () => {
    saveRecording("rider-a", [{ lat: 1, lon: 2, ele: 3, time: 4 }]);
    expect(loadRecording("rider-a")).toHaveLength(1);
    expect(loadRecording("rider-b")).toEqual([]);
    expect(loadRecording("guest")).toEqual([]);
    localStorage.setItem("ghostline.recording.v1.rider-a", "{broken");
    expect(loadRecording("rider-a")).toEqual([]);
    saveRecording("rider-a", [{ lat: 1, lon: 2, ele: 3, time: 4 }]);
    clearRecording("rider-a");
    expect(loadRecording("rider-a")).toEqual([]);
  });
});
