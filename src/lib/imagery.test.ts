import { describe, expect, it } from "vitest";
import { orthophotoUrl, posterBox, routePath, toMercator } from "./imagery";

const route = [
  { lat: 41.518, lon: -8.3957 },
  { lat: 41.5243, lon: -8.3973 },
];

describe("trail imagery", () => {
  it("frames the route at the poster's aspect with padding", () => {
    const box = posterBox(route, 3 / 4);
    expect((box.maxX - box.minX) / (box.maxY - box.minY)).toBeCloseTo(3 / 4, 6);
    const [x, y] = toMercator(route[1].lat, route[1].lon);
    expect(x).toBeGreaterThan(box.minX);
    expect(y).toBeLessThan(box.maxY);
  });

  it("builds a DGT GetMap request and an SVG path inside the frame", () => {
    const box = posterBox(route, 1);
    const url = new URL(orthophotoUrl(box, 600, 600));
    expect(url.searchParams.get("LAYERS")).toBe("Ortos2018-RGB");
    expect(url.searchParams.get("SRS")).toBe("EPSG:3857");
    expect(url.searchParams.get("BBOX")!.split(",")).toHaveLength(4);
    const coords = routePath(route, box, 100, 100).match(/-?\d+\.\d/g)!.map(Number);
    coords.forEach((v) => {
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThan(100);
    });
  });
});
