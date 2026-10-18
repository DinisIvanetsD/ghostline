import maplibregl, { type GeoJSONSource, type LngLatLike } from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, Mountain, Navigation } from "lucide-react";
import type { Telemetry, Trail } from "../types";
import { routePositionAt } from "../lib/analysis";
import { traceSegments, type TraceMode } from "../lib/traceColors";
import {
  SATELLITE_ATTRIBUTION,
  SATELLITE_TILES,
  TERRAIN_ATTRIBUTION,
  TERRAIN_TILES,
} from "../lib/imagery";
import "maplibre-gl/dist/maplibre-gl.css";

interface Props {
  trail: Trail;
  current: Telemetry;
  ghost: Telemetry;
  progress: number;
  sector: number | null;
  /** While the replay plays, the camera rides along with the rider. */
  playing?: boolean;
  onProgress: (value: number) => void;
  /** Rendered instead when WebGL is unavailable. */
  fallback: React.ReactNode;
}

type Sample = Telemetry["samples"][number];
const lngLat = (s: Pick<Sample, "lat" | "lon">): [number, number] => [s.lon, s.lat];
const bearingBetween = (a: Pick<Sample, "lat" | "lon">, b: Pick<Sample, "lat" | "lon">) => {
  const rad = Math.PI / 180;
  const y = Math.sin((b.lon - a.lon) * rad) * Math.cos(b.lat * rad);
  const x =
    Math.cos(a.lat * rad) * Math.sin(b.lat * rad) -
    Math.sin(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos((b.lon - a.lon) * rad);
  return (Math.atan2(y, x) * 180) / Math.PI;
};
const sampleAt = (t: Telemetry, fraction: number) =>
  t.samples.reduce((a, b) => (Math.abs(b.fraction - fraction) < Math.abs(a.fraction - fraction) ? b : a));
const sampleAtTime = (t: Telemetry, time: number) =>
  t.samples.reduce((a, b) => (Math.abs(b.time - time) < Math.abs(a.time - time) ? b : a));
const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** The run as a 3D flight over the trail's real relief and aerial photo. */
export function Terrain3D({ trail, current, ghost, progress, sector, playing = false, onProgress, fallback }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const onProgressRef = useRef(onProgress);
  const currentRef = useRef(current);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [mode, setMode] = useState<TraceMode>("ghost");
  const [follow, setFollow] = useState(false);
  useEffect(() => {
    onProgressRef.current = onProgress;
    currentRef.current = current;
  }, [onProgress, current]);

  const overview = useMemo(() => {
    const s = current.samples;
    const bounds = s.reduce(
      (b, p) => b.extend(lngLat(p)),
      new maplibregl.LngLatBounds(lngLat(s[0]), lngLat(s[0])),
    );
    // Look across the slope: along the descent the run collapses into a short line.
    return { bounds, bearing: bearingBetween(s[0], s[s.length - 1]) - 90 };
  }, [current]);

  useEffect(() => {
    if (!el.current) return;
    let instance: maplibregl.Map;
    try {
      instance = new maplibregl.Map({
        container: el.current,
        attributionControl: { compact: true },
        style: {
          version: 8,
          sources: {
            photo: { type: "raster", tiles: [SATELLITE_TILES], tileSize: 256, maxzoom: 15, attribution: SATELLITE_ATTRIBUTION },
            dem: { type: "raster-dem", tiles: [TERRAIN_TILES], tileSize: 256, maxzoom: 14, encoding: "terrarium", attribution: TERRAIN_ATTRIBUTION },
          },
          layers: [
            { id: "ground", type: "background", paint: { "background-color": "#151922" } },
            { id: "photo", type: "raster", source: "photo", paint: { "raster-saturation": -0.2, "raster-brightness-max": 0.82, "raster-contrast": 0.08 } },
          ],
          terrain: { source: "dem", exaggeration: 1.7 },
          sky: { "sky-color": "#0b0e13", "horizon-color": "#1f2430", "fog-color": "#0b0e13", "sky-horizon-blend": 0.6, "horizon-fog-blend": 0.7, "fog-ground-blend": 0.2 },
        },
        bounds: overview.bounds,
        fitBoundsOptions: { padding: 50 },
        pitch: 55,
        bearing: overview.bearing,
        maxPitch: 80,
        cooperativeGestures: false,
      });
    } catch {
      setFailed(true);
      return;
    }
    map.current = instance;
    instance.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
    instance.on("load", () => {
      const empty = { type: "FeatureCollection", features: [] } as GeoJSON.FeatureCollection;
      instance.addSource("ghost-line", { type: "geojson", data: empty });
      instance.addSource("trace", { type: "geojson", data: empty });
      instance.addSource("sector", { type: "geojson", data: empty });
      instance.addSource("riders", { type: "geojson", data: empty });
      instance.addLayer({ id: "ghost-line", type: "line", source: "ghost-line", paint: { "line-color": "#e6e6e8", "line-width": 3, "line-opacity": 0.55, "line-dasharray": [1.5, 2] } });
      instance.addLayer({ id: "sector", type: "line", source: "sector", paint: { "line-color": "#ffbe55", "line-width": 14, "line-opacity": 0.35, "line-blur": 2 } });
      instance.addLayer({ id: "trace", type: "line", source: "trace", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "color"], "line-width": 5 } });
      instance.addLayer({ id: "riders", type: "circle", source: "riders", paint: { "circle-radius": ["case", ["==", ["get", "who"], "run"], 8, 7], "circle-color": ["case", ["==", ["get", "who"], "run"], "#ffbe55", "#a4a9b3"], "circle-stroke-color": "#0b0e13", "circle-stroke-width": 3, "circle-pitch-alignment": "map" } });
      // The constructor fits the bounds flat; refit with the tilt so the run fills the stage.
      instance.fitBounds(overview.bounds, { padding: 40, pitch: 55, bearing: overview.bearing, duration: 0 });
      setReady(true);
    });
    instance.on("click", (event) => {
      const samples = currentRef.current.samples;
      let best = samples[0];
      let bestDistance = Infinity;
      for (const s of samples) {
        const p = instance.project(lngLat(s));
        const d = (p.x - event.point.x) ** 2 + (p.y - event.point.y) ** 2;
        if (d < bestDistance) {
          bestDistance = d;
          best = s;
        }
      }
      if (bestDistance < 60 ** 2) onProgressRef.current(best.fraction);
    });
    instance.on("webglcontextlost", () => setFailed(true));
    return () => {
      markers.current.forEach((m) => m.remove());
      markers.current = [];
      instance.remove();
      map.current = null;
      setReady(false);
    };
  }, [overview]);

  // Trace colours, the Ghost line and the sector gates.
  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready) return;
    const segments =
      mode === "plain"
        ? [{ from: [current.samples[0].lat, current.samples[0].lon], to: [current.samples.at(-1)!.lat, current.samples.at(-1)!.lon], color: "#ffbe55" }]
        : traceSegments(current, ghost, mode);
    const trace: GeoJSON.FeatureCollection =
      mode === "plain"
        ? { type: "FeatureCollection", features: [{ type: "Feature", properties: { color: "#ffbe55" }, geometry: { type: "LineString", coordinates: current.samples.map(lngLat) } }] }
        : {
            type: "FeatureCollection",
            features: segments.map((s) => ({
              type: "Feature",
              properties: { color: s.color },
              geometry: { type: "LineString", coordinates: [[s.from[1], s.from[0]], [s.to[1], s.to[0]]] },
            })),
          };
    (instance.getSource("trace") as GeoJSONSource).setData(trace);
    (instance.getSource("ghost-line") as GeoJSONSource).setData({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: ghost.samples.map(lngLat) },
    });
    markers.current.forEach((m) => m.remove());
    const boundaries = [0, ...trail.boundaries, 1];
    markers.current = boundaries.map((f, i) => {
      const p = routePositionAt(trail.points.length > 1 ? trail.points : current.samples, f);
      const node = document.createElement("button");
      node.type = "button";
      node.className = "gate-3d";
      node.textContent = i === 0 ? "S" : i === boundaries.length - 1 ? "F" : String(i);
      node.setAttribute("aria-label", i === 0 ? "Partida" : i === boundaries.length - 1 ? "Chegada" : `Limite do setor ${i}`);
      node.addEventListener("click", (event) => {
        event.stopPropagation();
        onProgressRef.current(f);
      });
      return new maplibregl.Marker({ element: node }).setLngLat([p.lon, p.lat]).addTo(instance);
    });
  }, [ready, mode, current, ghost, trail]);

  // Highlight the selected sector along the run.
  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready) return;
    const boundaries = [0, ...trail.boundaries, 1];
    const coords =
      sector === null
        ? []
        : current.samples
            .filter((p) => p.fraction >= boundaries[sector] && p.fraction <= boundaries[sector + 1])
            .map(lngLat);
    (instance.getSource("sector") as GeoJSONSource).setData({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: coords.length > 1 ? coords : [] },
    });
  }, [ready, sector, current, trail]);

  // Rider and Ghost on the shared clock; the camera rides along when following.
  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready) return;
    const p = sampleAt(current, progress);
    const g = sampleAtTime(ghost, p.time);
    (instance.getSource("riders") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: { who: "ghost" }, geometry: { type: "Point", coordinates: lngLat(g) } },
        { type: "Feature", properties: { who: "run" }, geometry: { type: "Point", coordinates: lngLat(p) } },
      ],
    });
    if (follow || playing) {
      const ahead = sampleAt(current, Math.min(1, progress + 0.04));
      instance.easeTo({
        center: lngLat(p) as LngLatLike,
        bearing: bearingBetween(p, ahead),
        pitch: 70,
        zoom: 16.6,
        duration: reducedMotion() ? 0 : 450,
      });
    }
  }, [ready, progress, current, ghost, follow, playing]);

  const showOverview = () => {
    setFollow(false);
    map.current?.fitBounds(overview.bounds, {
      padding: 50,
      pitch: 55,
      bearing: overview.bearing,
      duration: reducedMotion() ? 0 : 1600,
    });
  };

  if (failed) return <>{fallback}</>;
  return (
    <div className="terrain-stage">
      <div ref={el} className="terrain-map" aria-label={`Mapa 3D de ${trail.name}`} />
      <div className="terrain-tools">
        <div className="trace-modes" role="group" aria-label="Cor do traçado">
          {(
            [
              ["ghost", "Δ Ghost"],
              ["speed", "Velocidade"],
              ["plain", "Simples"],
            ] as const
          ).map(([value, label]) => (
            <button key={value} type="button" className={mode === value ? "active" : ""} aria-pressed={mode === value} onClick={() => setMode(value)}>
              {label}
            </button>
          ))}
        </div>
        <div className="terrain-camera">
          <button type="button" className={follow ? "active" : ""} aria-pressed={follow} onClick={() => setFollow(!follow)}>
            <Navigation size={14} /> Seguir run
          </button>
          <button type="button" onClick={showOverview}>
            <Crosshair size={14} /> Vista geral
          </button>
        </div>
      </div>
      {!ready && (
        <div className="terrain-loading" role="status">
          <Mountain size={18} /> A carregar o relevo…
        </div>
      )}
      <div className="terrain-legend">
        {mode === "plain" ? (
          <span><i className="dot current" /> Run atual</span>
        ) : (
          <span className="trace-scale">
            <i className={`trace-ramp ${mode}`} />
            {mode === "speed" ? "Lento → rápido" : "A perder → a ganhar tempo"}
          </span>
        )}
        <span><i className="dot ghost" /> Ghost</span>
      </div>
    </div>
  );
}
