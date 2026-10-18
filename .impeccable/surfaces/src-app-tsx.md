---
version: 1
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: ["src/styles.css"]
---

# GHOSTLINE app shell (Operate)

Scope: the whole rider app (analysis, history, video, trails, garage, import, auth). Visitor mode: Operate.
Audience: downhill riders in Braga; phone on the hill and desktop at home.
Job: read the run time, the gap to the Ghost and the worst sector; relive the run in 3D; browse trails and runs.
Constraints: user rejected the flat azulejo look ("parece matemática") and asked for 3D and motion; Portuguese copy, neutral and technical; standard web controls.

## Direction contract

THESIS: GHOSTLINE as a streaming catalog of your own descents: real aerial photos of each trail are the posters, the focused poster grows while the wall dims, and opening a run plays it as a 3D flight over the real relief. It refuses flat diagrams and the dark dashboard with a neon accent.

OWN-WORLD: blue-black ground #0b0e13, surfaces #151922 and #1f2430, text #e6e6e8 / #a4a9b3, one warm accent #ffbe55 reserved for focus, the current run and primary actions; coral #ff8a6b for time lost, mint #6fd6a0 for time gained. Colour otherwise comes only from imagery (DGT 2018 orthophotos, open data). Big Shoulders Display for titles in caps, Public Sans for everything else, tabular figures. 6px corners, hairline seams, no glow.

STORY: the rider lands on a hero of the trail photo with the time; scrolls into the 3D flight with the ghost; browses trails and runs as poster rails.

FIRST VIEWPORT: shell rail (desktop) or top bar with nav (phone); hero band: trail photo dimmed, trail title in large condensed caps, run time and gap; below it the 3D terrain stage with the coloured trace, rider and ghost; sector tiles beside (desktop) or under (phone).

FORM: Streaming catalog wall (challenger pop-culture-shelf-streaming-title-card-wall), chosen on the bolder re-roll, seed 51e2165b. Signature moves: poster rails with focus growth and dimming; 3D flight over real relief.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
