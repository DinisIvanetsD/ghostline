import { describe, expect, it } from "vitest";
import { readVideoCaptureDate, suggestVideoOffset } from "./videoMetadata";

const encoder = new TextEncoder();
function fourcc(value: string): Uint8Array {
  return Uint8Array.from([...value].map((character) => character.charCodeAt(0) & 0xff));
}
function concat(...chunks: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(chunks.reduce((length, chunk) => length + chunk.length, 0));
  let cursor = 0;
  for (const chunk of chunks) { result.set(chunk, cursor); cursor += chunk.length; }
  return result;
}
function box(type: string, payload: Uint8Array): Uint8Array {
  const header = new Uint8Array(8);
  new DataView(header.buffer).setUint32(0, header.length + payload.length);
  header.set(fourcc(type), 4);
  return concat(header, payload);
}
function asBlobPart(data: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(data.length);
  copy.set(data);
  return copy.buffer;
}
function legacyMovie(value: string): Blob {
  const movie = box("moov", box("udta", box("©day", encoder.encode(value))));
  return new Blob([asBlobPart(movie)]);
}
function modernMovie(value: string): Blob {
  const name = encoder.encode("com.apple.quicktime.creationdate");
  const entry = concat(new Uint8Array(4), fourcc("mdta"), name);
  new DataView(entry.buffer).setUint32(0, entry.length);
  const keys = box("keys", concat(new Uint8Array(4), new Uint8Array([0, 0, 0, 1]), entry));
  const data = box("data", concat(new Uint8Array([0, 0, 0, 1, 0, 0, 0, 0]), encoder.encode(value)));
  const item = box("\u0000\u0000\u0000\u0001", data);
  const ilst = box("ilst", item);
  const meta = box("meta", concat(new Uint8Array(4), keys, ilst));
  return new Blob([asBlobPart(box("moov", meta))]);
}

describe("video capture metadata", () => {
  it("reads a legacy QuickTime recording date", async () => {
    const date = await readVideoCaptureDate(legacyMovie("2026-09-01T09:00:00Z"));
    expect(date?.toISOString()).toBe("2026-09-01T09:00:00.000Z");
  });

  it("reads modern mdta creation-date metadata", async () => {
    const date = await readVideoCaptureDate(modernMovie("2026-09-01T10:00:00+01:00"));
    expect(date?.toISOString()).toBe("2026-09-01T09:00:00.000Z");
  });

  it("ignores malformed or missing metadata without reading media data", async () => {
    expect(await readVideoCaptureDate(new Blob([asBlobPart(box("ftyp", encoder.encode("isom"))), asBlobPart(box("mdat", new Uint8Array(32)))]))).toBeNull();
    expect(await readVideoCaptureDate(new Blob([asBlobPart(new Uint8Array([0, 0, 0, 1, 0, 0, 0, 0]))]))).toBeNull();
  });

  it("suggests a signed offset only for epoch-timestamped GPS runs within the same session", () => {
    const start = Date.parse("2026-09-01T09:00:12.345Z");
    const capture = new Date("2026-09-01T09:00:00.000Z");
    expect(suggestVideoOffset(start, capture)).toBe(12.3);
    expect(suggestVideoOffset(capture.getTime() - 20_000, capture)).toBe(-20);
    expect(suggestVideoOffset(12, capture)).toBeNull();
    expect(suggestVideoOffset(start + 13 * 60 * 60 * 1000, capture)).toBeNull();
  });
});
