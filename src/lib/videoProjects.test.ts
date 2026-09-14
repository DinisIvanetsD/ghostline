// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { clearVideoProjects, loadVideoProject, saveVideoProject, type VideoProjectState } from "./videoProjects";

const state: VideoProjectState = {
  videoName: "dji-mimo-run.mp4",
  offsetSeconds: 12.4,
  previewRate: 0.5,
  skipStops: false,
  stopAnalysis: { stops: [{ startTime: 5, endTime: 9, duration: 4, startIndex: 1, endIndex: 2 }], rideWindow: { startTime: 0, endTime: 20, duration: 20 } },
  trim: { start: 12.4, end: 32.4 },
};

describe("video project persistence", () => {
  beforeEach(() => clearVideoProjects());

  it("round trips sync settings by run without storing video data", () => {
    saveVideoProject("run-1", state);
    expect(loadVideoProject("run-1")).toEqual(state);
    expect(localStorage.getItem("ghostline.video-projects.v1")).not.toContain("blob:");
  });

  it("ignores malformed stored projects and applies safe defaults", () => {
    localStorage.setItem("ghostline.video-projects.v1", JSON.stringify({ "run-2": { offsetSeconds: "bad", previewRate: -1, skipStops: "bad", trim: { start: 3, end: 1 } } }));
    expect(loadVideoProject("run-2")).toEqual({ videoName: "", offsetSeconds: 0, previewRate: 1, skipStops: true, stopAnalysis: null, trim: null });
  });
});
