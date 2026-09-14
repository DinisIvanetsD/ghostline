import type { Run } from "../types";
export function downloadGPX(run: Run) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="GHOSTLINE" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>GHOSTLINE demo run</name><trkseg>${run.points.map((p) => `<trkpt lat="${p.lat}" lon="${p.lon}"><ele>${p.ele}</ele><time>${new Date(p.time > 1e11 ? p.time : p.time * 1000).toISOString()}</time></trkpt>`).join("")}</trkseg></trk></gpx>`;
  const url = URL.createObjectURL(
    new Blob([xml], { type: "application/gpx+xml" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "ghostline-demo-run.gpx";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
