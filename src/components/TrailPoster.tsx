import { useState } from "react";
import type { Trail } from "../types";
import { IMAGERY_ATTRIBUTION, orthophotoUrl, posterBox, routePath } from "../lib/imagery";

interface Props {
  trail: Trail;
  width: number;
  height: number;
  className?: string;
  /** Background use: hidden from assistive tech, no route caption. */
  decorative?: boolean;
}

/** The trail's real aerial photo with its line drawn on it: the poster art. */
export function TrailPoster({ trail, width, height, className = "", decorative = false }: Props) {
  const [failed, setFailed] = useState(false);
  const box = posterBox(trail.points, width / height);
  return (
    <div className={`trail-poster ${className}`} aria-hidden={decorative || undefined}>
      {!failed && (
        <img
          src={orthophotoUrl(box, Math.min(width, 1200), Math.min(height, 1200 * (height / width)))}
          alt={decorative ? "" : `Fotografia aérea de ${trail.name}`}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      )}
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
        <path d={routePath(trail.points, box, width, height)} />
      </svg>
      {!decorative && <small className="trail-poster-credit">{IMAGERY_ATTRIBUTION}</small>}
    </div>
  );
}
