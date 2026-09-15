import { useEffect, useState } from "react";
import type { Telemetry, Trail, Run } from "../types";
import { analyze, formatTime } from "../lib/analysis";
import { MAX_BELIEVABLE_SPEED_KMH } from "../lib/gpsQuality";
function useChartWidth() {
  const [element, ref] = useState<SVGSVGElement | null>(null);
  const [width, setWidth] = useState(1000);
  useEffect(() => {
    if (!element) return;
    const observer = new ResizeObserver((entries) =>
      setWidth(Math.max(260, entries[0].contentRect.width)),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return { ref, width };
}
interface Props {
  current: Telemetry;
  ghost: Telemetry;
  trail: Trail;
  progress: number;
  onProgress: (value: number) => void;
}
export function TelemetryChart({
  current,
  ghost,
  trail,
  progress,
  onProgress,
}: Props) {
  const [metric, setMetric] = useState<"speed" | "elevation">("speed");
  const { ref, width } = useChartWidth();
  const left = 32,
    right = width - 12,
    span = right - left;
  const values = current.samples.concat(ghost.samples);
  const plottedValue = (sample: (typeof values)[number]) =>
    metric === "speed"
      ? Math.min(MAX_BELIEVABLE_SPEED_KMH, Math.max(0, sample.speed))
      : sample.elevation;
  const max = values.reduce((v, s) => Math.max(v, plottedValue(s)), -Infinity) * 1.08;
  const min =
    metric === "elevation"
      ? values.reduce((v, s) => Math.min(v, s.elevation), Infinity) - 10
      : 0;
  const y = (v: number) => 150 - ((v - min) / Math.max(1, max - min)) * 130;
  const x = (f: number) => left + f * span;
  const line = (t: Telemetry) =>
    t.samples
      .filter(
        (_, i) =>
          i % Math.max(1, Math.floor(t.samples.length / 600)) === 0 ||
          i === t.samples.length - 1,
      )
      .map(
        (s, i) =>
          `${i ? "L" : "M"}${x(s.fraction).toFixed(2)},${y(plottedValue(s)).toFixed(2)}`,
      )
      .join(" ");
  const sample = current.samples.reduce((a, b) =>
    Math.abs(b.fraction - progress) < Math.abs(a.fraction - progress) ? b : a,
  );
  const sampleValue = plottedValue(sample);
  const boundaries = [0, ...trail.boundaries, 1];
  return (
    <section className="panel telemetry">
      <div className="section-heading">
        <h2>Read the run.</h2>
        <div className="segmented">
          <button
            className={metric === "speed" ? "active" : ""}
            onClick={() => setMetric("speed")}
          >
            Speed
          </button>
          <button
            className={metric === "elevation" ? "active" : ""}
            onClick={() => setMetric("elevation")}
          >
            Elevation
          </button>
        </div>
      </div>
      <div className="trace-meta">
        <span>
          <i className="dot current" />
          Current{" "}
          <b>
            {metric === "speed" && sample.speed > MAX_BELIEVABLE_SPEED_KMH
              ? "GPS review"
              : `${sampleValue.toFixed(1)} ${metric === "speed" ? "km/h" : "m"}`}
          </b>
        </span>
        <span className="muted">
          {(sample.distance / 1000).toFixed(2)} km into run ·{" "}
          {formatTime(sample.time)}
        </span>
      </div>
      <svg
        ref={ref}
        className="telemetry-svg"
        viewBox={`0 0 ${width} 185`}
        role="img"
        aria-label={`${metric} over distance. Use the trail progress slider to inspect telemetry.`}
        onPointerMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          onProgress(
            Math.max(0, Math.min(1, (e.clientX - rect.left - left) / span)),
          );
        }}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line
              x1={left}
              x2={right}
              y1={y(min + (max - min) * f)}
              y2={y(min + (max - min) * f)}
              className="chart-grid"
            />
            <text x="0" y={y(min + (max - min) * f) + 4}>
              {Math.round(min + (max - min) * f)}
            </text>
          </g>
        ))}
        {boundaries.map((f, i) => (
          <g key={f}>
            <line
              x1={x(f)}
              x2={x(f)}
              y1="12"
              y2="150"
              className="sector-line"
            />
            {(width > 450 ||
              i === 0 ||
              i === boundaries.length - 1 ||
              i === Math.floor(boundaries.length / 2)) && (
              <text
                x={x(f)}
                y="176"
                textAnchor={i === boundaries.length - 1 ? "end" : "start"}
              >
                {((f * current.distance) / 1000).toFixed(1)} km
              </text>
            )}
          </g>
        ))}
        <path d={line(ghost)} className="ghost-trace" />
        <path d={line(current)} className="current-trace" />
        <line
          x1={x(progress)}
          x2={x(progress)}
          y1="12"
          y2="150"
          className="cursor-line"
        />
        <circle cx={x(progress)} cy={y(sampleValue)} r="4" fill="#d5f55a" />
      </svg>
      <label className="scrubber">
        <span>Trail progress</span>
        <input
          type="range"
          min="0"
          max="1000"
          value={Math.round(progress * 1000)}
          onChange={(e) => onProgress(Number(e.target.value) / 1000)}
        />
        <span>{Math.round(progress * 100)}%</span>
      </label>
    </section>
  );
}
export function Progression({
  runs,
  onSelect,
}: {
  runs: Run[];
  onSelect: (run: Run) => void;
}) {
  const { ref, width } = useChartWidth();
  const sorted = [...runs].sort((a, b) => a.date.localeCompare(b.date));
  const values = sorted.map((r) => analyze(r.points).duration);
  const min = Math.min(...values) - 3,
    max = Math.max(...values) + 3;
  if (!runs.length)
    return (
      <div className="empty-state">Import a run to start your progression.</div>
    );
  const x = (i: number) =>
    40 + (i * (width - 80)) / Math.max(1, values.length - 1);
  const y = (v: number) => 130 - ((v - min) / (max - min)) * 100;
  return (
    <section className="panel progression">
      <div className="section-heading">
        <h2>Every run counts.</h2>
        <span className="muted">Run time · lower is faster</span>
      </div>
      <svg
        ref={ref}
        viewBox={`0 0 ${width} 170`}
        role="group"
        aria-label="Run time progression"
      >
        <path
          d={values.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ")}
          fill="none"
          stroke="#d5f55a"
          strokeWidth="2"
        />
        {sorted.map((r, i) => (
          <g
            key={r.id}
            className="progress-point"
            role="button"
            tabIndex={0}
            aria-label={`Analyze ${r.name}`}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(r);
              }
            }}
            onClick={() => onSelect(r)}
          >
            <title>
              {r.name}: {formatTime(values[i])}
            </title>
            <circle cx={x(i)} cy={y(values[i])} r="5" fill="#d5f55a" />
            {(width > 600 || i % 2 === 0) && (
              <>
                <text x={x(i)} y={y(values[i]) - 15} textAnchor="middle">
                  {formatTime(values[i])}
                </text>
                <text x={x(i)} y="158" textAnchor="middle">
                  {new Date(r.date).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                  })}
                </text>
              </>
            )}
          </g>
        ))}
      </svg>
    </section>
  );
}
