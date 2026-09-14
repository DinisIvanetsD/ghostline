/* @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { parseGPX } from "./gpx";

const gpx = (withTime = true) =>
  `<gpx><trk><trkseg><trkpt lat="38" lon="-9"><ele>100</ele>${withTime ? "<time>2026-09-01T09:00:00Z</time>" : ""}</trkpt><trkpt lat="38.001" lon="-9.001"><ele>90</ele>${withTime ? "<time>2026-09-01T09:00:01Z</time>" : ""}</trkpt></trkseg></trk></gpx>`;
describe("GPX parser", () => {
  it("parses coordinates, elevation, and timestamps", () => {
    const points = parseGPX(gpx());
    expect(points).toHaveLength(2);
    expect(points[0].time).toBe(Date.parse("2026-09-01T09:00:00Z"));
  });
  it("handles missing times only when allowed", () => {
    expect(() => parseGPX(gpx(false), true)).toThrow(/timestamp is required/);
    expect(parseGPX(gpx(false))).toHaveLength(2);
  });
  it("rejects malformed or insufficient tracks", () => {
    expect(() => parseGPX("<gpx/>")).toThrow(/track points/);
    expect(() =>
      parseGPX(
        '<gpx><trk><trkseg><trkpt lat="bad" lon="-9"/><trkpt lat="38.1" lon="-9"/></trkseg></trk></gpx>',
      ),
    ).toThrow(/latitude/);
  });
  it("supports namespaced route points and ignores waypoints", () => {
    const points = parseGPX(
      '<gpx xmlns="x"><wpt lat="0" lon="0"/><rte><rtept lat="38" lon="-9"/><rtept lat="38.001" lon="-9.001"/></rte></gpx>',
    );
    expect(points).toHaveLength(2);
    expect(points[0].ele).toBe(0);
  });
  it("rejects malformed XML, mixed track and route, and discontinuous tracks", () => {
    expect(() =>
      parseGPX('<gpx><trk><trkseg><trkpt lat="0" lon="0"></gpx>'),
    ).toThrow(/malformed/);
    expect(() =>
      parseGPX(
        '<gpx><trk><trkseg><trkpt lat="0" lon="0"/><trkpt lat="1" lon="1"/></trkseg></trk><rte><rtept lat="0" lon="0"/><rtept lat="1" lon="1"/></rte></gpx>',
      ),
    ).toThrow(/both/);
    expect(() => parseGPX("<gpx><trk><trkseg/><trkseg/></trk></gpx>")).toThrow(
      /segments/,
    );
  });
  it("rejects out of range coordinates and non-monotonic timestamps", () => {
    expect(() =>
      parseGPX(
        '<gpx><rte><rtept lat="91" lon="0"/><rtept lat="0" lon="0"/></rte></gpx>',
      ),
    ).toThrow(/range/);
    expect(() =>
      parseGPX(
        '<gpx><rte><rtept lat="0" lon="0"><time>2026-01-01T00:00:01Z</time></rtept><rtept lat="1" lon="1"><time>2026-01-01T00:00:00Z</time></rtept></rte></gpx>',
      ),
    ).toThrow(/increasing/);
  });
  it("enforces the point limit", () => {
    const body = Array.from(
      { length: 25_001 },
      (_, i) => `<rtept lat="${i / 100000}" lon="0"/>`,
    ).join("");
    expect(() => parseGPX(`<gpx><rte>${body}</rte></gpx>`)).toThrow(/25,000/);
  });
});
