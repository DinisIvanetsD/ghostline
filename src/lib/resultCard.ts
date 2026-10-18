import type { Telemetry } from "../types";
import { formatDelta, formatTime } from "./analysis";
import { traceSegments } from "./traceColors";

export interface ResultCardInput {
  trailName: string;
  location: string;
  runName: string;
  date: string;
  current: Telemetry;
  ghost: Telemetry;
  /** Seconds against the reference; negative is faster. */
  delta: number;
  isPersonalBest: boolean;
  sectors: Array<{ name: string; time: number; delta: number }>;
}

const W = 1080;
const H = 1350; // 4:5, the portrait size Instagram and WhatsApp keep uncropped.
const BG = "#f6f7f9";
const TEXT = "#1b1e24";
const MUTED = "#5d6577";
const ACCENT = "#1d3f91";
const LOST = "#9a5410";
const GAINED = "#1d3f91";

/** Draw a shareable result card for a run and return it as a PNG. */
export async function renderResultCard(input: ResultCardInput): Promise<Blob> {
  await document.fonts?.ready;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Este browser não consegue criar a imagem.");
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = ACCENT;
  ctx.font = '700 44px "Public Sans", sans-serif';
  ctx.fillText("GHOSTLINE.", 72, 110);
  ctx.fillStyle = MUTED;
  ctx.font = '400 26px "Public Sans", sans-serif';
  ctx.textAlign = "right";
  ctx.fillText(input.date, W - 72, 110);
  ctx.textAlign = "left";

  ctx.fillStyle = TEXT;
  ctx.font = '700 76px "Public Sans", sans-serif';
  ctx.fillText(input.trailName, 72, 220, W - 144);
  ctx.fillStyle = MUTED;
  ctx.font = '400 30px "Public Sans", sans-serif';
  ctx.fillText(`${input.runName} · ${input.location}`, 72, 268, W - 144);

  ctx.fillStyle = TEXT;
  ctx.font = '700 150px "Public Sans", sans-serif';
  ctx.fillText(formatTime(input.current.duration), 64, 440);
  ctx.font = '700 40px "Public Sans", sans-serif';
  ctx.fillStyle = input.delta > 0.005 ? LOST : GAINED;
  ctx.fillText(`${formatDelta(input.delta)} vs Ghost`, 72, 504);
  if (input.isPersonalBest) {
    ctx.fillStyle = ACCENT;
    ctx.fillRect(W - 72 - 210, 462, 210, 56);
    ctx.fillStyle = BG;
    ctx.font = '700 32px "Public Sans", sans-serif';
    ctx.textAlign = "center";
    ctx.fillText("NOVO PB", W - 72 - 105, 501);
    ctx.textAlign = "left";
  }

  // Route coloured by where time was won or lost against the Ghost.
  const box = { x: 72, y: 560, w: W - 144, h: 400 };
  const samples = input.current.samples;
  const lats = samples.map((s) => s.lat);
  const lons = samples.map((s) => s.lon);
  const midLat = ((Math.min(...lats) + Math.max(...lats)) / 2) * (Math.PI / 180);
  const spanX = Math.max(1e-9, (Math.max(...lons) - Math.min(...lons)) * Math.cos(midLat));
  const spanY = Math.max(1e-9, Math.max(...lats) - Math.min(...lats));
  const scale = Math.min(box.w / spanX, box.h / spanY);
  const offX = box.x + (box.w - spanX * scale) / 2;
  const offY = box.y + (box.h - spanY * scale) / 2;
  const project = ([lat, lon]: [number, number]) => [
    offX + (lon - Math.min(...lons)) * Math.cos(midLat) * scale,
    offY + (Math.max(...lats) - lat) * scale,
  ];
  ctx.lineCap = "round";
  ctx.lineWidth = 12;
  traceSegments(input.current, input.ghost, "ghost", 30, 300).forEach((segment) => {
    const [x1, y1] = project(segment.from);
    const [x2, y2] = project(segment.to);
    ctx.strokeStyle = segment.color;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  });

  const rowsTop = 1010;
  const rowHeight = Math.min(56, 230 / Math.max(1, input.sectors.length));
  input.sectors.slice(0, 6).forEach((sector, index) => {
    const y = rowsTop + index * rowHeight;
    ctx.fillStyle = MUTED;
    ctx.font = '700 26px "Public Sans", sans-serif';
    ctx.fillText(`S${index + 1}`, 72, y);
    ctx.fillStyle = TEXT;
    ctx.font = '700 30px "Public Sans", sans-serif';
    ctx.fillText(sector.name, 140, y, 520);
    ctx.font = '700 28px "Public Sans", sans-serif';
    ctx.textAlign = "right";
    ctx.fillText(formatTime(sector.time), 860, y);
    ctx.fillStyle = sector.delta > 0.005 ? LOST : GAINED;
    ctx.fillText(formatDelta(sector.delta), W - 72, y);
    ctx.textAlign = "left";
  });

  ctx.fillStyle = MUTED;
  ctx.font = '400 24px "Public Sans", sans-serif';
  ctx.fillText("Persegue o teu Ghost · ghostline", 72, H - 56);

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Não foi possível criar a imagem."))), "image/png"),
  );
}

/** Share through the phone's share sheet when possible, otherwise download. */
export async function shareOrDownload(blob: Blob, filename: string, title: string): Promise<"shared" | "downloaded"> {
  const file = new File([blob], filename, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return "shared";
    } catch (error) {
      // A dismissed share sheet is not an error worth reporting.
      if (error instanceof DOMException && error.name === "AbortError") return "shared";
    }
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "downloaded";
}
