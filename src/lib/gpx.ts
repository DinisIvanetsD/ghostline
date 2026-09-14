import type { Point } from "../types";

const MAX_POINTS = 25_000;

/** Parse one GPX track or route. Times are epoch milliseconds, or elapsed seconds when absent. */
export function parseGPX(text: string, requireTime = false): Point[] {
  if (typeof text !== "string" || !text.trim())
    throw new Error("Invalid GPX: no track points found");
  // Fail early on oversized uploads before asking the browser XML parser to build a huge tree.
  const pointTagCount = (text.match(/<(?:trkpt|rtept)\b/gi) ?? []).length;
  if (pointTagCount > MAX_POINTS)
    throw new Error(
      `Invalid GPX: point limit is ${MAX_POINTS.toLocaleString()}`,
    );
  const Parser = globalThis.DOMParser;
  if (!Parser) throw new Error("Invalid GPX: XML parser is unavailable");
  const document = new Parser().parseFromString(text, "application/xml");
  if (
    document.getElementsByTagName("parsererror").length ||
    document.documentElement?.localName !== "gpx"
  )
    throw new Error("Invalid GPX: malformed XML");
  const tracks = elements(document, "trk");
  const routes = elements(document, "rte");
  if (tracks.length && routes.length)
    throw new Error("Invalid GPX: choose a track or route, not both");
  if (tracks.length > 1 || routes.length > 1)
    throw new Error("Invalid GPX: multiple tracks or routes are not supported");
  const container = tracks[0] ?? routes[0];
  if (!container) throw new Error("Invalid GPX: no track points found");
  let nodes: Element[];
  if (tracks[0]) {
    const segments = children(container, "trkseg");
    if (segments.length > 1)
      throw new Error("Invalid GPX: multiple track segments are not supported");
    nodes =
      segments.length === 1
        ? children(segments[0], "trkpt")
        : children(container, "trkpt");
  } else nodes = children(container, "rtept");
  if (nodes.length < 2)
    throw new Error("Invalid GPX: at least two track points are required");
  if (nodes.length > MAX_POINTS)
    throw new Error(
      `Invalid GPX: point limit is ${MAX_POINTS.toLocaleString()}`,
    );

  const points: Point[] = [];
  let previousTime: number | undefined;
  let hadTime = false;
  nodes.forEach((node, index) => {
    const latText = node.getAttribute("lat");
    const lonText = node.getAttribute("lon");
    const lat = Number(latText);
    const lon = Number(lonText);
    if (
      latText === null ||
      lonText === null ||
      !latText.trim() ||
      !lonText.trim() ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon)
    )
      throw new Error(
        `Invalid GPX point ${index + 1}: latitude and longitude are required`,
      );
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180)
      throw new Error(
        `Invalid GPX point ${index + 1}: coordinates are out of range`,
      );
    const eleText = childText(node, "ele");
    const ele =
      eleText === undefined || eleText.trim() === "" ? 0 : Number(eleText);
    if (!Number.isFinite(ele))
      throw new Error(`Invalid GPX point ${index + 1}: invalid elevation`);
    const timeText = childText(node, "time");
    if (timeText !== undefined && timeText.trim()) {
      const time = Date.parse(timeText.trim());
      if (!Number.isFinite(time))
        throw new Error(`Invalid GPX point ${index + 1}: invalid timestamp`);
      if (previousTime !== undefined && time < previousTime)
        throw new Error("Invalid GPX: timestamps must be strictly increasing");
      // Some head units emit two track points in the same FIT/GPX second.
      // Keep the first sample so the analysis engine receives a valid clock.
      if (previousTime !== undefined && time === previousTime) return;
      previousTime = time;
      hadTime = true;
      points.push({ lat, lon, ele, time });
    } else {
      if (requireTime)
        throw new Error(
          `Invalid GPX point ${index + 1}: timestamp is required`,
        );
      points.push({ lat, lon, ele, time: index });
    }
  });
  if (
    hadTime &&
    points.some((point, index) => index && point.time <= points[index - 1].time)
  )
    throw new Error("Invalid GPX: timestamps must be strictly increasing");
  if (
    !points.some(
      (point) => point.lat !== points[0].lat || point.lon !== points[0].lon,
    )
  )
    throw new Error("Invalid GPX: track distance must be greater than zero");
  return points;
}

function elements(root: Document, name: string): Element[] {
  return Array.from(root.getElementsByTagNameNS("*", name));
}
function children(root: Element, name: string): Element[] {
  return Array.from(root.children).filter((child) => child.localName === name);
}
function childText(root: Element, name: string): string | undefined {
  return children(root, name)[0]?.textContent ?? undefined;
}
