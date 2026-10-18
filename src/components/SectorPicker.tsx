import L from "leaflet";
import { useEffect, useRef } from "react";
import type { Point } from "../types";
import { routePositionAt } from "../lib/analysis";
import { routeFractionAt } from "../lib/routeMatch";
import { DGT_WMS, IMAGERY_ATTRIBUTION } from "../lib/imagery";
import "leaflet/dist/leaflet.css";

interface Props {
  points: Point[];
  /** Interior sector gates as route fractions, sorted. */
  boundaries: number[];
  onAdd: (fraction: number) => void;
  onRemove: (index: number) => void;
}

/** Tap the route to add a sector gate; tap a numbered gate to remove it. */
export function SectorPicker({ points, boundaries, onAdd, onRemove }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layers = useRef<L.LayerGroup | null>(null);
  const handlers = useRef({ onAdd, onRemove, points });
  useEffect(() => {
    handlers.current = { onAdd, onRemove, points };
  }, [onAdd, onRemove, points]);
  useEffect(() => {
    if (!el.current) return;
    const instance = L.map(el.current, { zoomControl: true, scrollWheelZoom: false });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(instance);
    L.tileLayer
      .wms(DGT_WMS, { layers: "Ortos2018-RGB", format: "image/png", maxZoom: 19, attribution: IMAGERY_ATTRIBUTION })
      .addTo(instance);
    layers.current = L.layerGroup().addTo(instance);
    instance.on("click", (event: L.LeafletMouseEvent) =>
      handlers.current.onAdd(
        routeFractionAt(handlers.current.points, { lat: event.latlng.lat, lon: event.latlng.lng }),
      ),
    );
    map.current = instance;
    const observer = new ResizeObserver(() => instance.invalidateSize());
    observer.observe(el.current);
    return () => {
      observer.disconnect();
      instance.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    if (!map.current) return;
    map.current.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lon] as L.LatLngTuple)), {
      padding: [24, 24],
      animate: false,
    });
  }, [points]);
  useEffect(() => {
    const group = layers.current;
    if (!group) return;
    group.clearLayers();
    L.polyline(points.map((p) => [p.lat, p.lon] as L.LatLngTuple), {
      color: "#ffbe55",
      weight: 5,
      interactive: false,
    }).addTo(group);
    const gate = (fraction: number, label: string, title: string) => {
      const p = routePositionAt(points, fraction);
      return L.marker([p.lat, p.lon], {
        title,
        keyboard: true,
        icon: L.divIcon({
          className: "map-sector",
          html: `<span>${label}</span>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        }),
      }).addTo(group);
    };
    gate(0, "S", "Partida");
    gate(1, "F", "Chegada");
    boundaries.forEach((fraction, index) =>
      gate(fraction, String(index + 1), `Remover limite ${index + 1}`).on("click", () =>
        handlers.current.onRemove(index),
      ),
    );
  }, [points, boundaries]);
  return (
    <div className="sector-picker">
      <div ref={el} className="sector-picker-map" aria-label="Mapa para marcar os setores" />
      <small className="muted">
        Toca na pista para criar um limite de setor e num número para o remover.
        Depois carrega em Guardar pista.
      </small>
    </div>
  );
}
