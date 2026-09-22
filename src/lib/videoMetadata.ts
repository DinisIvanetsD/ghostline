interface Mp4Box {
  type: string;
  start: number;
  dataStart: number;
  end: number;
}

const MAX_MOVIE_METADATA_BYTES = 16 * 1024 * 1024;
const CONTAINER_BOXES = new Set(["moov", "udta", "meta", "ilst"]);

function readBoxes(data: Uint8Array, start: number, end: number): Mp4Box[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const boxes: Mp4Box[] = [];
  let cursor = start;
  while (cursor + 8 <= end) {
    const size32 = view.getUint32(cursor);
    const type = new TextDecoder("latin1").decode(data.subarray(cursor + 4, cursor + 8));
    let headerSize = 8;
    let boxSize = size32;
    if (size32 === 1) {
      if (cursor + 16 > end) break;
      const largeSize = view.getBigUint64(cursor + 8);
      if (largeSize > BigInt(Number.MAX_SAFE_INTEGER)) break;
      boxSize = Number(largeSize);
      headerSize = 16;
    } else if (size32 === 0) {
      boxSize = end - cursor;
    }
    if (boxSize < headerSize || cursor + boxSize > end) break;
    boxes.push({ type, start: cursor, dataStart: cursor + headerSize, end: cursor + boxSize });
    cursor += boxSize;
  }
  return boxes;
}

function decodeText(data: Uint8Array, start: number, end: number): string {
  return new TextDecoder("utf-8").decode(data.subarray(start, end)).replace(/\0+$/g, "").trim();
}

function parseCaptureDate(value: string): Date | null {
  const text = value.trim();
  if (!text) return null;
  let date: Date;
  if (/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?$/.test(text)) {
    const [year, month, day, hour, minute, second = "0"] = text.match(/\d+/g) ?? [];
    date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  } else {
    date = new Date(text);
  }
  const time = date.getTime();
  return Number.isFinite(time) && time >= Date.UTC(2000, 0, 1) && time < Date.UTC(2100, 0, 1) ? date : null;
}

function metadataDates(data: Uint8Array, moov: Mp4Box): Date[] {
  const candidates: string[] = [];
  const walk = (parent: Mp4Box, keys = new Map<number, string>(), depth = 0) => {
    if (depth > 8) return;
    let childStart = parent.dataStart;
    if (parent.type === "meta") childStart += 4; // FullBox version and flags.
    const children = readBoxes(data, childStart, parent.end);

    if (parent.type === "meta") {
      const keyBox = children.find((box) => box.type === "keys");
      if (keyBox) {
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        const keyData = keyBox.dataStart + 4;
        if (keyData + 4 <= keyBox.end) {
          const count = view.getUint32(keyData);
          let cursor = keyData + 4;
          for (let index = 1; index <= count && cursor + 8 <= keyBox.end; index += 1) {
            const size = view.getUint32(cursor);
            if (size < 8 || cursor + size > keyBox.end) break;
            const namespace = new TextDecoder("latin1").decode(data.subarray(cursor + 4, cursor + 8));
            const name = decodeText(data, cursor + 8, cursor + size);
            keys.set(index, `${namespace}:${name}`.toLowerCase());
            cursor += size;
          }
        }
      }
    }

    for (const box of children) {
      if (box.type === "©day") {
        candidates.push(decodeText(data, box.dataStart, box.end));
      } else if (parent.type === "ilst") {
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        const itemId = view.getUint32(box.start + 4);
        const key = keys.get(itemId) ?? "";
        if (key.includes("creationdate") || key.includes("creation_date") || key === "mdta:com.apple.quicktime.creationdate") {
          const valueBox = readBoxes(data, box.dataStart, box.end).find((item) => item.type === "data");
          if (valueBox && valueBox.dataStart + 8 <= valueBox.end) candidates.push(decodeText(data, valueBox.dataStart + 8, valueBox.end));
        }
      }
      if (CONTAINER_BOXES.has(box.type)) walk(box, keys, depth + 1);
    }
  };
  walk(moov);
  return candidates.map(parseCaptureDate).filter((date): date is Date => date !== null);
}

/**
 * Reads only the MP4/MOV movie metadata atom, never the video media payload.
 * QuickTime capture-date metadata is optional, so unsupported/missing metadata
 * safely returns null and the rider can still align the clip manually.
 */
export async function readVideoCaptureDate(file: Blob): Promise<Date | null> {
  try {
    let offset = 0;
    while (offset + 8 <= file.size) {
      const headerBuffer = await file.slice(offset, Math.min(file.size, offset + 16)).arrayBuffer();
      const header = new DataView(headerBuffer);
      const type = new TextDecoder("latin1").decode(new Uint8Array(headerBuffer, 4, 4));
      const size32 = header.getUint32(0);
      let size = size32;
      let headerSize = 8;
      if (size32 === 1) {
        if (headerBuffer.byteLength < 16) return null;
        const largeSize = header.getBigUint64(8);
        if (largeSize > BigInt(Number.MAX_SAFE_INTEGER)) return null;
        size = Number(largeSize);
        headerSize = 16;
      } else if (size32 === 0) {
        size = file.size - offset;
      }
      if (size < headerSize || offset + size > file.size) return null;
      if (type === "moov") {
        if (size > MAX_MOVIE_METADATA_BYTES) return null;
        const movie = new Uint8Array(await file.slice(offset, offset + size).arrayBuffer());
        const parsed = readBoxes(movie, 0, movie.byteLength).find((box) => box.type === "moov");
        return parsed ? metadataDates(movie, parsed)[0] ?? null : null;
      }
      offset += size;
    }
  } catch {
    // A malformed/unsupported movie must never interrupt video selection.
  }
  return null;
}

/** Suggests the video-time value for run elapsed 0, when both files have real timestamps. */
export function suggestVideoOffset(runStartTime: number, captureDate: Date): number | null {
  if (!Number.isFinite(runStartTime) || !Number.isFinite(captureDate.getTime())) return null;
  const runStartMs = Math.abs(runStartTime) > 1e11 ? runStartTime : runStartTime * 1000;
  if (runStartMs < Date.UTC(2000, 0, 1) || runStartMs >= Date.UTC(2100, 0, 1)) return null;
  const offset = (runStartMs - captureDate.getTime()) / 1000;
  return Math.abs(offset) <= 12 * 60 * 60 ? Math.round(offset * 10) / 10 : null;
}
