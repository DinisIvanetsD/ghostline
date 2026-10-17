// Gates closer than this to the start, finish or another gate would make a
// sector too short to time reliably with phone GPS.
const MIN_GAP = 0.02;

/** Split the sector containing `fraction`; the new sector gets `newName`. */
export function addGate(boundaries: number[], names: string[], fraction: number, newName: string) {
  const at = Math.round(fraction * 1000) / 1000;
  if ([0, ...boundaries, 1].some((b) => Math.abs(b - at) < MIN_GAP)) return null;
  const index = boundaries.filter((b) => b < at).length;
  const nextBoundaries = [...boundaries.slice(0, index), at, ...boundaries.slice(index)];
  const nextNames =
    names.length === boundaries.length + 1
      ? [...names.slice(0, index + 1), newName, ...names.slice(index + 1)]
      : names;
  return { boundaries: nextBoundaries, names: nextNames };
}

/** Merge the two sectors on either side of gate `index`, keeping the first name. */
export function removeGate(boundaries: number[], names: string[], index: number) {
  const nextNames =
    names.length === boundaries.length + 1
      ? names.filter((_, i) => i !== index + 1)
      : names;
  return { boundaries: boundaries.filter((_, i) => i !== index), names: nextNames };
}
