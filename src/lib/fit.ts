import { Decoder, Stream } from "@garmin/fitsdk";
import type { Point } from "../types";

const FIT_EPOCH = Date.UTC(1989, 11, 31);
const SEMICIRCLES_TO_DEGREES = 180 / 2 ** 31;
const MAX_POINTS = 25_000;

type FitRecord = {
  timestamp?: Date | number;
  positionLat?: number;
  positionLong?: number;
  enhancedAltitude?: number;
  altitude?: number;
};

/** Decode a Garmin FIT activity into the same GPS point contract used by GPX. */
export function parseFIT(buffer: ArrayBuffer | Uint8Array): Point[] {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.byteLength < 14) throw new Error("Invalid FIT: file is too small");
  const stream = Stream.fromByteArray(bytes);
  const decoder = new Decoder(stream);
  if (!decoder.isFIT()) throw new Error("Invalid FIT: FIT signature not found");
  if (!decoder.checkIntegrity())
    throw new Error("Invalid FIT: file integrity check failed");
  const { messages, errors } = decoder.read({
    applyScaleAndOffset: true,
    convertDateTimesToDates: true,
    convertTypesToStrings: false,
    expandSubFields: true,
    expandComponents: true,
    includeUnknownData: false,
  });
  if (errors.length) {
    throw new Error(`Invalid FIT: ${errors[0]?.message ?? "decoder error"}`);
  }
  const records = (messages.recordMesgs ?? []) as FitRecord[];
  if (records.length > MAX_POINTS)
    throw new Error(
      `Invalid FIT: point limit is ${MAX_POINTS.toLocaleString()}`,
    );

  let previousTime = -Infinity;
  const points: Point[] = [];
  for (const [index, record] of records.entries()) {
    const latRaw = record.positionLat;
    const lonRaw = record.positionLong;
    const timestamp = toMilliseconds(record.timestamp);
    if (
      !Number.isFinite(latRaw) ||
      !Number.isFinite(lonRaw) ||
      timestamp === undefined
    ) {
      continue;
    }
    const lat = Number(latRaw) * SEMICIRCLES_TO_DEGREES;
    const lon = Number(lonRaw) * SEMICIRCLES_TO_DEGREES;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180)
      throw new Error(
        `Invalid FIT record ${index + 1}: coordinates are out of range`,
      );
    if (timestamp < previousTime)
      throw new Error("Invalid FIT: timestamps must be strictly increasing");
    // FIT records are second-resolution and some devices emit duplicate
    // records. Keep the first sample at that timestamp and continue.
    if (timestamp === previousTime) continue;
    previousTime = timestamp;
    const elevation = record.enhancedAltitude ?? record.altitude ?? 0;
    if (!Number.isFinite(elevation))
      throw new Error(`Invalid FIT record ${index + 1}: invalid altitude`);
    points.push({ lat, lon, ele: Number(elevation), time: timestamp });
  }
  if (points.length < 2)
    throw new Error(
      "Invalid FIT: at least two GPS records with timestamps are required",
    );
  if (
    !points.some(
      (point, index) =>
        index > 0 &&
        (point.lat !== points[0].lat || point.lon !== points[0].lon),
    )
  )
    throw new Error("Invalid FIT: track distance must be greater than zero");
  return points;
}

function toMilliseconds(value: Date | number | undefined): number | undefined {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value))
    return value < 1e11 ? FIT_EPOCH + value * 1000 : value;
  return undefined;
}
