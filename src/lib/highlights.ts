import type { SectorVideoWindow } from "./videoSync";

export interface Highlight {
  index: number;
  name: string;
  start: number;
  end: number;
  /** Seconds against the Ghost in this sector; negative is faster. */
  delta: number;
  /** True when this run holds the rider's best time for the sector. */
  best: boolean;
}

/**
 * Pick the sectors worth showing in a short reel: the rider's best sectors and
 * the ones where they beat the Ghost, fastest gains first, then put them back
 * in riding order. With nothing gained, the closest sector to the Ghost is
 * still shown so the reel is never empty.
 */
export function pickHighlights(
  windows: SectorVideoWindow[],
  splits: number[],
  ghostSplits: number[],
  bestSectors: boolean[],
  options: { max?: number; padding?: number; videoDuration?: number } = {},
): Highlight[] {
  const { max = 3, padding = 1, videoDuration = Number.POSITIVE_INFINITY } = options;
  const candidates = windows
    .map((window, index) => ({
      index,
      name: window.name,
      start: Math.max(0, window.videoStartTime - padding),
      end: Math.min(videoDuration, window.videoEndTime + padding),
      delta: (splits[index] ?? 0) - (ghostSplits[index] ?? splits[index] ?? 0),
      best: Boolean(bestSectors[index]),
    }))
    .filter((item) => item.end - item.start > 0.5);
  const strong = candidates.filter((item) => item.best || item.delta < -0.005);
  const chosen = (strong.length ? strong : candidates)
    .sort((a, b) => Number(b.best) - Number(a.best) || a.delta - b.delta)
    .slice(0, strong.length ? max : 1)
    .sort((a, b) => a.start - b.start);
  // Padding can make neighbouring sectors overlap; merge them into one cut.
  return chosen.reduce<Highlight[]>((merged, item) => {
    const previous = merged.at(-1);
    if (previous && item.start <= previous.end) {
      previous.end = Math.max(previous.end, item.end);
      return merged;
    }
    merged.push({ ...item });
    return merged;
  }, []);
}
