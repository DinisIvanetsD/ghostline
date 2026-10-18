import type { Point } from "../types";

// DGT 2018 orthophotos for mainland Portugal (open data, WMS with CORS).
const DGT_WMS = "https://cartografia.dgterritorio.gov.pt/ortos2018/service";
export const IMAGERY_ATTRIBUTION = "Ortofotos 2018 © DGT";
// Mapzen/AWS terrain tiles, terrarium-encoded elevation (public dataset).
export const TERRAIN_TILES = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
export const TERRAIN_ATTRIBUTION = "Relevo © Mapzen, AWS Terrain Tiles";

const R = 6378137;
export const toMercator = (lat: number, lon: number): [number, number] => [
  (lon * Math.PI * R) / 180,
  R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)),
];

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Web-mercator box around a route, padded and stretched to the poster's aspect. */
export function posterBox(points: Array<Pick<Point, "lat" | "lon">>, aspect: number, pad = 0.18): Box {
  const xy = points.map((p) => toMercator(p.lat, p.lon));
  let minX = Math.min(...xy.map((p) => p[0]));
  let maxX = Math.max(...xy.map((p) => p[0]));
  let minY = Math.min(...xy.map((p) => p[1]));
  let maxY = Math.max(...xy.map((p) => p[1]));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  let w = Math.max(200, (maxX - minX) * (1 + pad * 2));
  let h = Math.max(200, (maxY - minY) * (1 + pad * 2));
  if (w / h > aspect) h = w / aspect;
  else w = h * aspect;
  minX = cx - w / 2;
  maxX = cx + w / 2;
  minY = cy - h / 2;
  maxY = cy + h / 2;
  return { minX, minY, maxX, maxY };
}

/** A GetMap URL for the orthophoto inside a box, at the given pixel size. */
export function orthophotoUrl(box: Box, width: number, height: number): string {
  const params = new URLSearchParams({
    SERVICE: "WMS",
    VERSION: "1.1.1",
    REQUEST: "GetMap",
    LAYERS: "Ortos2018-RGB",
    STYLES: "",
    SRS: "EPSG:3857",
    BBOX: [box.minX, box.minY, box.maxX, box.maxY].map((v) => v.toFixed(1)).join(","),
    WIDTH: String(Math.round(width)),
    HEIGHT: String(Math.round(height)),
    FORMAT: "image/png",
  });
  return `${DGT_WMS}?${params}`;
}

// The 3D stage needs CORS-clean textures; DGT sends a duplicated
// Access-Control-Allow-Origin header that WebGL rejects, so the terrain is
// draped with the Sentinel-2 cloudless mosaic instead (CC BY 4.0).
export const SATELLITE_TILES = "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg";
export const SATELLITE_ATTRIBUTION = "Sentinel-2 cloudless 2016 © EOX (Copernicus)";

/** Route as an SVG path in a 0..width x 0..height frame matching the box. */
export function routePath(points: Array<Pick<Point, "lat" | "lon">>, box: Box, width: number, height: number): string {
  return points
    .map((p, i) => {
      const [x, y] = toMercator(p.lat, p.lon);
      const px = ((x - box.minX) / (box.maxX - box.minX)) * width;
      const py = ((box.maxY - y) / (box.maxY - box.minY)) * height;
      return `${i ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`;
    })
    .join("");
}
