---
version: 1
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: ["src/styles.css"]
---

# GHOSTLINE app shell (Operate)

Scope: the whole rider app (analysis, history, video, trails, garage, import, auth). Visitor mode: Operate.
Audience: downhill riders in Braga, mostly on a phone on the hill between runs, in daylight, often with gloves.
Job: read the run time, the gap to the Ghost and the worst sector at a glance; then import, compare, edit sectors.
Constraints: everything may change visually (user confirmed); standard web controls; Portuguese copy, neutral and technical.

## Direction contract

THESIS: GHOSTLINE painted like the azulejo panels of Bom Jesus and Sameiro: cobalt fields on white glaze, sector data laid as tiles. It refuses the near-black dashboard with one neon accent.

OWN-WORLD: glaze white ground (#f6f7f9), cobalt (#1d3f91) as the committed shell colour (rail, mobile header, active state, primary action), pale cobalt rules (#dfe5f2), ochre for time lost, cobalt for time gained, ink (#1b1e24). Flat colour only: no gradients, no shadows, square tile corners (0–2px), 2px cobalt frames on data. Public Sans for everything, tabular figures for times.

STORY: on the hill, in sun, the rider sees time, gap and worst sector without zooming; taps a sector tile to find it on the map; at home compares runs drawn at one scale.

FIRST VIEWPORT: phone: cobalt header with wordmark and nav row; trail select; run and reference selects; map framed in cobalt with the trace coloured cobalt (gain) and ochre (loss); time panel with large cobalt time and delta; sector tiles grid. Desktop: cobalt left rail, map left, time and tiles right.

FORM: Azulejo de Braga, candidate 7 of 7 on the ordered list, seed 51e2165b. Signature move: sector tiles, each sector a square tile filled cobalt when gained and banded ochre when lost, matching the map trace.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
