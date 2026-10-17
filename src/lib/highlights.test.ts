import { describe, expect, it } from "vitest";
import { pickHighlights } from "./highlights";
import type { SectorVideoWindow } from "./videoSync";

const window = (index: number, start: number, end: number): SectorVideoWindow => ({
  index,
  name: `S${index + 1}`,
  runStartTime: start,
  runEndTime: end,
  videoStartTime: start + 10,
  videoEndTime: end + 10,
  duration: end - start,
});
const windows = [window(0, 0, 40), window(1, 40, 80), window(2, 80, 120), window(3, 120, 160)];

describe("highlight reel", () => {
  it("keeps best and gaining sectors in riding order", () => {
    const picks = pickHighlights(windows, [40, 38, 41, 37], [40, 40, 40, 40], [false, false, false, true], { padding: 0 });
    expect(picks.map((pick) => pick.index)).toEqual([1, 3]);
    expect(picks[0]).toMatchObject({ start: 50, end: 90, delta: -2 });
  });

  it("limits the reel and merges overlapping padded cuts", () => {
    const picks = pickHighlights(windows, [39, 39, 39, 39], [40, 40, 40, 40], [], { max: 2, padding: 1 });
    expect(picks).toHaveLength(1);
    expect(picks[0]).toMatchObject({ start: 9, end: 91 });
  });

  it("falls back to the closest sector when nothing beat the Ghost", () => {
    const picks = pickHighlights(windows, [42, 40.5, 43, 44], [40, 40, 40, 40], []);
    expect(picks.map((pick) => pick.index)).toEqual([1]);
  });

  it("clamps cuts to the video", () => {
    const picks = pickHighlights(windows, [38, 41, 41, 41], [40, 40, 40, 40], [], { padding: 20, videoDuration: 45 });
    expect(picks[0]).toMatchObject({ start: 0, end: 45 });
  });
});
