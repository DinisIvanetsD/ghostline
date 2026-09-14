import L from "leaflet";
import { useEffect, useRef, useState } from "react";
import { LocateFixed, Mountain, Layers } from "lucide-react";
import type { Trail, Telemetry } from "../types";
import "leaflet/dist/leaflet.css";

interface Props {
  trail: Trail;
  current: Telemetry;
  ghost: Telemetry;
  progress: number;
  sector: number | null;
  onProgress: (value: number) => void;
}
export function TrailMap({
  trail,
  current,
  ghost,
  progress,
  sector,
  onProgress,
}: Props) {
  const el = useRef<HTMLDivElement>(null),
    map = useRef<L.Map | null>(null),
    layers = useRef<L.LayerGroup | null>(null),
    marker = useRef<L.CircleMarker | null>(null),
    ghostMarker = useRef<L.CircleMarker | null>(null);
  const [terrain, setTerrain] = useState(true),
    [tileError, setTileError] = useState(false);
  useEffect(() => {
    if (!el.current) return;
    const instance = L.map(el.current, {
      zoomControl: false,
      attributionControl: true,
      scrollWheelZoom: false,
    });
    map.current = instance;
    layers.current = L.layerGroup().addTo(instance);
    L.control.zoom({ position: "bottomright" }).addTo(instance);
    const observer = new ResizeObserver(() => instance.invalidateSize());
    observer.observe(el.current);
    return () => {
      observer.disconnect();
      instance.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    if (!map.current || !terrain) return;
    const tiles = L.tileLayer(
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      },
    );
    tiles.on("tileerror", () => setTileError(true));
    tiles.addTo(map.current);
    tiles.bringToBack();
    return () => {
      tiles.remove();
    };
  }, [terrain]);
  useEffect(() => {
    if (!map.current || !layers.current) return;
    const group = layers.current;
    group.clearLayers();
    const boundaries = [0, ...trail.boundaries, 1];
    const coords = current.samples.map((p) => [p.lat, p.lon] as L.LatLngTuple);
    L.polyline(
      ghost.samples.map((p) => [p.lat, p.lon] as L.LatLngTuple),
      { color: "#bec8bf", weight: 7, opacity: 0.48, dashArray: "5 9" },
    ).addTo(group);
    L.polyline(coords, { color: "#d5f55a", weight: 3.5, opacity: 1 }).addTo(
      group,
    );
    if (sector !== null) {
      const start = boundaries[sector],
        end = boundaries[sector + 1];
      L.polyline(
        current.samples
          .filter((p) => p.fraction >= start && p.fraction <= end)
          .map((p) => [p.lat, p.lon] as L.LatLngTuple),
        { color: "#f19784", weight: 7 },
      ).addTo(group);
    }
    boundaries.forEach((f, i) => {
      const p = current.samples.reduce((a, b) =>
        Math.abs(b.fraction - f) < Math.abs(a.fraction - f) ? b : a,
      );
      L.marker([p.lat, p.lon], {
        icon: L.divIcon({
          className: "map-sector",
          html: `<span>${i === 0 ? "S" : i === boundaries.length - 1 ? "F" : i}</span>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        }),
      })
        .on("click", () => onProgress(f))
        .addTo(group);
    });
    ghostMarker.current = L.circleMarker(coords[0], {
      radius: 7,
      color: "#e2e8dd",
      weight: 2,
      fillColor: "#5b6851",
      fillOpacity: 1,
    }).addTo(group);
    marker.current = L.circleMarker(coords[0], {
      radius: 7,
      color: "#101311",
      weight: 3,
      fillColor: "#d5f55a",
      fillOpacity: 1,
    }).addTo(group);
    map.current.fitBounds(L.latLngBounds(coords), { padding: [48, 45] });
  }, [trail, current, ghost, sector, onProgress]);
  useEffect(() => {
    const p = current.samples.reduce((a, b) =>
      Math.abs(b.fraction - progress) < Math.abs(a.fraction - progress) ? b : a,
    );
    marker.current?.setLatLng([p.lat, p.lon]);
    const g = ghost.samples.reduce((a, b) =>
      Math.abs(b.time - p.time) < Math.abs(a.time - p.time) ? b : a,
    );
    ghostMarker.current?.setLatLng([g.lat, g.lon]);
  }, [progress, current, ghost, sector]);
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const click = (e: L.LeafletMouseEvent) => {
      const p = current.samples.reduce((a, b) =>
        e.latlng.distanceTo([b.lat, b.lon]) <
        e.latlng.distanceTo([a.lat, a.lon])
          ? b
          : a,
      );
      onProgress(p.fraction);
    };
    instance.on("click", click);
    return () => {
      instance.off("click", click);
    };
  }, [current, onProgress]);
  return (
    <div className="map-panel">
      <div
        ref={el}
        className="trail-map"
        aria-label={`Interactive GPS map of ${trail.name}`}
      />
      <div className="map-top">
        <span className="map-tag">
          <Mountain size={14} />
          {trail.location}
        </span>
        <span className="map-tag">GPS TRACE</span>
      </div>
      <div className="map-bottom">
        <button
          className="map-tag map-button"
          onClick={() => {
            setTileError(false);
            setTerrain(!terrain);
          }}
        >
          <Layers size={14} />
          {terrain ? "Hide basemap" : "Show basemap"}
        </button>
        <button
          className="icon-button"
          aria-label="Fit trail to map"
          onClick={() =>
            map.current?.fitBounds(
              L.latLngBounds(
                current.samples.map((p) => [p.lat, p.lon] as L.LatLngTuple),
              ),
              { padding: [48, 45] },
            )
          }
        >
          <LocateFixed size={18} />
        </button>
      </div>
      <div className="map-legend">
        <span>
          <i className="dot current" />
          Current run
        </span>
        <span>
          <i className="dot ghost" />
          Ghost
        </span>
      </div>
      {tileError && terrain && (
        <span className="map-error">
          Basemap unavailable. GPS trace is still interactive.
        </span>
      )}
    </div>
  );
}
