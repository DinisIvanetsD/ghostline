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
  anchors: [],
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
    expect(loadVideoProject("run-2")).toEqual({ videoName: "", offsetSeconds: 0, previewRate: 1, skipStops: true, stopAnalysis: null, trim: null, anchors: [] });
  });

  it("keeps only valid, increasing sync anchors", () => {
    localStorage.setItem("ghostline.video-projects.v1", JSON.stringify({ "run-3": { anchors: [{ runTime: 10, videoTime: 30 }, { runTime: 0, videoTime: 5 }, { runTime: 0, videoTime: 6 }, { runTime: -2, videoTime: 1 }, { runTime: 20, videoTime: "bad" }] } }));
    expect(loadVideoProject("run-3")?.anchors).toEqual([{ runTime: 0, videoTime: 5 }, { runTime: 10, videoTime: 30 }]);
  });

  it("keeps video projects isolated by rider scope", () => {
    saveVideoProject("run-1", state, "user-a");
    saveVideoProject("run-1", { ...state, videoName: "other.mp4" }, "user-b");

    expect(loadVideoProject("run-1", "user-a")?.videoName).toBe("dji-mimo-run.mp4");
    expect(loadVideoProject("run-1", "user-b")?.videoName).toBe("other.mp4");
    expect(loadVideoProject("run-1", "user-c")).toBeNull();
    expect(localStorage.getItem("ghostline.video-projects.v1.user-a")).toBeTruthy();
  });

  it("persists a private cloud video locator without storing the clip itself", () => {
    saveVideoProject("run-cloud", { ...state, cloudPath: "user-a/run-cloud/clip.mp4" }, "user-a");
    expect(loadVideoProject("run-cloud", "user-a")?.cloudPath).toBe("user-a/run-cloud/clip.mp4");
    expect(localStorage.getItem("ghostline.video-projects.v1.user-a")).not.toContain("blob:");
  });

  it("supports clearing one rider scope without removing another", () => {
    saveVideoProject("run-1", state, "user-a");
    saveVideoProject("run-1", state, "user-b");
    clearVideoProjects("user-a");

    expect(loadVideoProject("run-1", "user-a")).toBeNull();
    expect(loadVideoProject("run-1", "user-b")).toEqual(state);
  });
});
