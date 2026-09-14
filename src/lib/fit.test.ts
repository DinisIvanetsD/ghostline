// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { Encoder, Profile } from "@garmin/fitsdk";
import { parseFIT } from "./fit";

function activity(
  points: Array<{ lat: number; lon: number; ele: number; time: number }>,
) {
  const encoder = new Encoder();
  const write = (
    messageNumber: number,
    message: object,
  ) =>
    encoder.onMesg(
      messageNumber,
      message as unknown as Parameters<Encoder["onMesg"]>[1],
    );
  const first = new Date(points[0].time);
  write(Profile.MesgNum.FILE_ID, {
    manufacturer: "development",
    product: 1,
    timeCreated: first,
    type: "activity",
  });
  for (const point of points) {
    write(Profile.MesgNum.RECORD, {
      timestamp: new Date(point.time),
      positionLat: Math.round((point.lat / 180) * 2 ** 31),
      positionLong: Math.round((point.lon / 180) * 2 ** 31),
      altitude: point.ele,
      speed: 8,
    });
  }
  return new Uint8Array(encoder.close());
}

describe("FIT parser", () => {
  it("decodes Garmin records into GPS points with degrees and metres", () => {
    const points = parseFIT(
      activity([
        {
          lat: 38.7,
          lon: -9.3,
          ele: 410,
          time: Date.parse("2026-09-01T09:00:00Z"),
        },
        {
          lat: 38.701,
          lon: -9.299,
          ele: 400,
          time: Date.parse("2026-09-01T09:00:01Z"),
        },
      ]),
    );
    expect(points).toHaveLength(2);
    expect(points[0].lat).toBeCloseTo(38.7, 4);
    expect(points[0].lon).toBeCloseTo(-9.3, 4);
    expect(points[0].ele).toBeCloseTo(410);
    expect(points[1].time - points[0].time).toBe(1000);
  });

  it("rejects non-FIT bytes, corrupt CRC and zero-distance tracks", () => {
    expect(() => parseFIT(new Uint8Array(20))).toThrow(/signature/);
    const valid = new Uint8Array(
      activity([
        {
          lat: 38.7,
          lon: -9.3,
          ele: 410,
          time: Date.parse("2026-09-01T09:00:00Z"),
        },
        {
          lat: 38.701,
          lon: -9.299,
          ele: 400,
          time: Date.parse("2026-09-01T09:00:01Z"),
        },
      ]),
    );
    valid[valid.length - 1] ^= 1;
    expect(() => parseFIT(valid)).toThrow(/integrity/);
    expect(() =>
      parseFIT(
        activity([
          {
            lat: 38.7,
            lon: -9.3,
            ele: 410,
            time: Date.parse("2026-09-01T09:00:00Z"),
          },
          {
            lat: 38.7,
            lon: -9.3,
            ele: 400,
            time: Date.parse("2026-09-01T09:00:01Z"),
          },
        ]),
      ),
    ).toThrow(/distance/);
  });

  it("ignores records without coordinates but requires two usable timed records", () => {
    const encoder = new Encoder();
    const write = (
      messageNumber: number,
      message: object,
    ) =>
      encoder.onMesg(
        messageNumber,
        message as unknown as Parameters<Encoder["onMesg"]>[1],
      );
    const start = Date.parse("2026-09-01T09:00:00Z");
    write(Profile.MesgNum.FILE_ID, {
      manufacturer: "development",
      product: 1,
      timeCreated: new Date(start),
      type: "activity",
    });
    write(Profile.MesgNum.RECORD, {
      timestamp: new Date(start),
      altitude: 410,
    });
    write(Profile.MesgNum.RECORD, {
      timestamp: new Date(start + 1000),
      positionLat: Math.round((38.7 / 180) * 2 ** 31),
      positionLong: Math.round((-9.3 / 180) * 2 ** 31),
      altitude: 400,
    });
    expect(() => parseFIT(new Uint8Array(encoder.close()))).toThrow(
      /two GPS records/,
    );
  });

  it("coalesces duplicate second-resolution timestamps from head units", () => {
    const start = Date.parse("2026-09-01T09:00:00Z");
    const points = parseFIT(
      activity([
        { lat: 38.7, lon: -9.3, ele: 410, time: start },
        { lat: 38.7005, lon: -9.3005, ele: 405, time: start },
        { lat: 38.701, lon: -9.299, ele: 400, time: start + 1000 },
      ]),
    );
    expect(points).toHaveLength(2);
    expect(points[1].time - points[0].time).toBe(1000);
  });
});
