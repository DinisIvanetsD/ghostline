---
name: Ghostline
description: Downhill run telemetry for Braga riders, painted as cobalt azulejo on white glaze.
colors:
  cobalt: "#1d3f91"
  cobalt-hover: "#2c58c4"
  cobalt-rule: "#dfe5f2"
  cobalt-mist: "#d6def3"
  ochre-band: "#c9782a"
  ochre-text: "#9a5410"
  glaze: "#f6f7f9"
  panel: "#ffffff"
  raised: "#eef1f7"
  border: "#d5dce9"
  field-border: "#b4bdd4"
  ink: "#1b1e24"
  muted: "#5d6577"
typography:
  display:
    fontFamily: "Public Sans, sans-serif"
    fontSize: "44px"
    fontWeight: 400
    lineHeight: 1.3
    letterSpacing: "-0.03em"
    fontFeature: "tnum"
  headline:
    fontFamily: "Public Sans, sans-serif"
    fontSize: "25px"
    fontWeight: 600
    lineHeight: 1.2
  title:
    fontFamily: "Public Sans, sans-serif"
    fontSize: "21px"
    fontWeight: 600
    lineHeight: 1.2
  body:
    fontFamily: "Public Sans, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "tnum"
  label:
    fontFamily: "Public Sans, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    letterSpacing: "0"
  tile-figure:
    fontFamily: "Public Sans, sans-serif"
    fontSize: "15px"
    fontWeight: 800
    fontFeature: "tnum"
rounded:
  tile: "0px"
  sm: "2px"
spacing:
  tile-gap: "6px"
  control-y: "10px"
  control-x: "16px"
  gutter: "22px"
  panel: "24px"
  page: "36px"
components:
  button-primary:
    backgroundColor: "{colors.cobalt}"
    textColor: "{colors.panel}"
    rounded: "{rounded.sm}"
    padding: "10px 16px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.cobalt-hover}"
  button-secondary:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "10px 16px"
    height: "40px"
  button-secondary-hover:
    backgroundColor: "{colors.raised}"
  input-field:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "8px 10px"
    height: "40px"
  nav-item:
    backgroundColor: "{colors.cobalt}"
    textColor: "{colors.cobalt-mist}"
    rounded: "{rounded.sm}"
    padding: "13px 12px"
  nav-item-hover:
    backgroundColor: "{colors.cobalt-hover}"
    textColor: "{colors.panel}"
  nav-item-active:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.cobalt}"
  sector-tile-gained:
    backgroundColor: "{colors.cobalt}"
    textColor: "{colors.panel}"
    typography: "{typography.tile-figure}"
    rounded: "{rounded.tile}"
    padding: "10px 12px"
  sector-tile-lost:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    typography: "{typography.tile-figure}"
    rounded: "{rounded.tile}"
    padding: "10px 12px"
  map-marker:
    backgroundColor: "{colors.cobalt}"
    textColor: "{colors.panel}"
    rounded: "{rounded.tile}"
    size: "26px"
---

# Design System: Ghostline

## Overview

**Creative North Star: "Azulejo de Braga"**

Ghostline is painted like the tiled panels of Bom Jesus and Sameiro: cobalt fields on white glaze, with the run's data laid out as tiles. The cobalt field is the shell. It is the left rail on desktop and the header with its nav row on phone. Everything the rider reads sits on white glaze panels inside it. The world is built for a phone held on the hill in full sun, often with gloves on. Contrast is high, figures are large and tabular, and colour carries meaning before any label is read.

Colour is flat and has one meaning per hue. Cobalt means the brand, the active state, the primary action and time gained. Ochre means time lost. Everything else is ink on white with pale cobalt rules. Depth comes from frames and rules, never from shadow: a data panel earns a 2px cobalt frame, and a form groups its parts with thin rules. The reused signature is the sector tile. Each sector is a square that is filled cobalt when the rider gained time and stays white with an ochre band along its foot when time was lost. The map trace uses the same two colours, so a tile and its stretch of trail read as one fact.

The system replaces Ghostline's earlier near-black dashboard with a single neon accent.

**Key Characteristics:**
- A committed cobalt shell: rail on desktop, header and nav row on phone.
- White panels on a glaze ground, flat colour, no shadows.
- Square geometry with 2px corners on controls and 0px on tiles and markers.
- Cobalt means time gained, ochre means time lost, on tiles, figures and the map trace alike.
- Public Sans for every role, with tabular figures throughout.

## Colors

Two glazes and a white ground: cobalt for the shell and for gain, ochre for loss, ink and cool greys for everything else.

### Primary
- **Bom Jesus Cobalt** (cobalt): the shell field (desktop rail and phone header), the primary button, the run time figure, the 2px data-panel frames, gained sector tiles, square map markers, focus outlines and the "gaining" end of the trace ramp. Gained-time figures use it as text.
- **Lit Cobalt** (cobalt-hover): hover state for anything already cobalt (primary button, nav items in the rail, gained tiles).
- **Cobalt Mist** (cobalt-mist): resting nav labels and secondary text inside the cobalt shell.
- **Pale Cobalt Rule** (cobalt-rule): hairline rules that divide groups inside a white panel (leaderboard rows, recorder readouts, form sections).

### Secondary
- **Sameiro Ochre** (ochre-band): fill colour for time lost. It is used for the 10px band at the foot of a lost sector tile (7px on phone) and for the "losing" end of the map trace. It is a fill only and is never used for text.
- **Burnt Ochre** (ochre-text): text colour for time lost (positive deltas, the gap to the best time). It is the legible text partner of Sameiro Ochre.

### Neutral
- **Glaze White** (glaze): the page ground behind all panels.
- **Panel White** (panel): every panel, card, input and lost tile. Also the active nav item inside the cobalt shell.
- **Raised Glaze** (raised): hover fill for secondary buttons and white tiles, and the track of the sign-in tab switcher.
- **Panel Border** (border): the 1px frame on quiet panels and dividers between stat cells.
- **Field Border** (field-border): the 1px stroke on inputs and selects.
- **Ink** (ink): body text, headings and the selected-tile outline.
- **Slate** (muted): labels, metadata, units and breadcrumbs.

### Named Rules
**The One Meaning Rule.** Cobalt is gain and ochre is loss, everywhere: tile, figure, map trace and share card. Never use ochre for decoration, and never use cobalt to show a loss.

**The Flat Glaze Rule.** Colour is applied flat. The only gradients in the system are the two map legend ramps, which explain the trace colours.

**The Ochre Pair Rule.** Sameiro Ochre is a fill and Burnt Ochre is its text. Never set text in Sameiro Ochre on white.

## Typography

**Display Font:** Public Sans (with sans-serif)
**Body Font:** Public Sans (with sans-serif)

**Character:** Public Sans is a sturdy civic grotesque, plain enough to read on a phone in sun. It is self-hosted in three weights (400, 600 and 800). Tabular figures are set at the root, so times line up in columns and do not jitter while a run plays back.

### Hierarchy
- **Display** (400, 44px, line-height 1.3, -0.03em): the run time in the timing panel, always in cobalt. It grows to 49px on screens 1550px and wider.
- **Headline** (600, 25px): the trail name in the trail select (21px on phone).
- **Title** (600, 21px): panel headings such as "Tempo" and "Tempos por setor".
- **Body** (400, 13px, line-height 1.5): controls, table cells, run pickers and paragraph copy.
- **Label** (400, 12px, no tracking, sentence case): field and stat labels in Slate. 12px is the floor for anything the rider must read.
- **Tile figure** (800, 15px, tabular): the delta inside a sector tile (13px on phone). The sector index uses 800 at 12px and the sector name uses 600 at 13px.

### Named Rules
**The Sunlit Label Rule.** Labels are sentence case, untracked and at least 12px. Readability on the hill beats compactness.

**The Tabular Rule.** Every time, delta and distance uses tabular figures in Public Sans. Do not add a separate monospace face.

## Layout

On desktop, a fixed 224px cobalt rail sits on the left and the main column is capped at 1660px with 31px/36px page padding. The analysis view is a two-column grid. The map is on the left, and on the right is a 337px timing column (380px at 1550px and wider), separated by a 22px gutter. The timing column stacks the time panel above the sector tiles, which form a 2 x 2 grid of square tiles with a 6px gap.

At 700px and below, the rail becomes a sticky cobalt header. It holds the wordmark, an avatar at top right and a full-width row of five nav items, each at least 44px tall. Content then runs as one column in a fixed order: time panel, sector tiles as four squares in a row (5px gap), map (240px tall, with its legend and trace switch moved below the trace), then the theoretical best. The run and reference selects stack at full width so that times are not cut off.

Panels use 24px padding. The spacing rhythm is tight inside data (5-10px) and generous between panels (15-22px).

## Elevation & Depth

The system is flat and uses no shadows. Depth comes from framing, not lifting. Data panels (map, timing, telemetry, history, progression, best sectors and leaderboard) carry a 2px cobalt frame. Quiet panels and forms carry a 1px Panel Border. Inside a panel, groups are divided by Pale Cobalt rules and never boxed again. Selection is shown with a 3px ink outline offset 2px, not with elevation.

### Named Rules
**The Framed Not Lifted Rule.** A surface that matters gets a cobalt frame. Nothing casts a shadow.

**The No Card-in-Card Rule.** Groups inside a card are separated by rules on white, never by grey boxes nested inside it.

## Shapes

The geometry is square, like a tile. Controls, panels, inputs and buttons use 2px corners (sm), which reads as square but not sharp. Sector tiles and map markers have 0px corners and a 1:1 aspect ratio. The avatar is the only circle. Borders carry the structure: 2px cobalt for data, 1px border or field-border for quiet surfaces, and a dashed 2px cobalt frame for the full-width lead-in tile.

## Components

### Buttons
Plain, solid and square.
- **Shape:** near-square corners (2px), at least 40px tall, 13px at 600 weight.
- **Primary:** a Bom Jesus Cobalt fill with light text and 10px/16px padding. Used for "Importar run" and other committing actions.
- **Hover / Focus:** the background moves to Lit Cobalt over 0.15s. Focus shows a 2px cobalt outline offset 4px (white inside the cobalt shell).
- **Secondary:** a transparent fill with a 1px grey stroke and Ink text. Hover fills it with Raised Glaze. Used for "Entrar", "Gerir setores" and "Partilhar resultado" (full width in the timing panel).
- **Danger:** Burnt Ochre text.

### Cards / Containers
- **Corner Style:** 2px.
- **Background:** Panel White on Glaze White.
- **Shadow Strategy:** none (see Elevation & Depth).
- **Border:** 2px cobalt on data panels and the sign-in card, 1px Panel Border on quiet panels.
- **Internal Padding:** 24px (12-20px in the timing panel).

### Inputs / Fields
- **Style:** Panel White fill with a 1px Field Border stroke, 2px corners, at least 40px tall and 13px text.
- **Focus:** a 2px cobalt outline. The sign-in field shifts its border to cobalt.
- **Run pickers:** borderless selects under a 12px Slate label. The trail select is set at Headline size.

### Navigation
- **Desktop:** a cobalt rail with the wordmark in white. Nav items are 14px at 700 weight in Cobalt Mist with 2px corners. Hover fills them with Lit Cobalt and white text. The active item is a Panel White block with cobalt text. The profile link sits at the foot, above a mid-cobalt rule.
- **Phone:** a sticky cobalt header with a single row of five equal nav items (11px, icon plus label, at least 44px tall). The active item is still a white block with cobalt text.

### Sector Tiles (signature)
Each sector is a square tile with a 2px cobalt frame and 0px corners. The sector index sits top left and the delta top right, with the sector name and split time below.
- **Gained:** a cobalt fill with white text. Hover moves to Lit Cobalt.
- **Lost:** a Panel White fill with Ink text, a Burnt Ochre delta and a 10px Sameiro Ochre band along the bottom edge (7px on phone).
- **Selected:** a 3px ink outline, offset 2px. Tapping a tile finds that sector on the map.
- **Lead-in:** spans the full row, with a dashed frame and no aspect lock.
- **Arrangement:** 2 x 2 beside the map on desktop. On phone, four in a row with the split time hidden and the name clamped to two lines.

### Map Markers and Trace
- **Markers:** 26px cobalt squares with a 2px white border, 0px corners and white 800 labels (S, 1, 2, 3, F). They carry the tile grammar onto the map.
- **Trace:** in Ghost mode, each segment is mixed from Sameiro Ochre (losing) through a pale cobalt (on pace) to cobalt (gaining). Speed mode uses the same ochre-to-cobalt ramp. The legend shows the ramp as a 38px x 5px gradient strip.

### Share Card
The exported result card uses the same palette (Glaze White ground, Ink text, Slate secondary text, cobalt for the time and gains, Burnt Ochre for losses) and the same Public Sans face.

## Do's and Don'ts

### Do:
- **Do** keep the shell cobalt (#1d3f91): rail on desktop, header and nav row on phone, with the active nav item as a white block with cobalt text.
- **Do** frame data panels with a 2px cobalt border and leave quiet panels and forms at 1px.
- **Do** show gain in cobalt and loss in ochre, with #c9782a as fill and #9a5410 as text, consistently across tiles, figures, trace and share card.
- **Do** keep sector tiles square (1:1, 0px corners), in a 2 x 2 grid on desktop and four in a row on phone.
- **Do** set every time and delta in Public Sans with tabular figures.
- **Do** keep labels in sentence case, untracked and at least 12px.

### Don't:
- **Don't** add shadows or gradients. The map legend ramps are the only gradients.
- **Don't** round corners beyond 2px. The avatar is the only circle.
- **Don't** nest grey boxes inside a card. Divide groups with #dfe5f2 rules on white.
- **Don't** set text in #c9782a on white. Use #9a5410 for loss text.
- **Don't** introduce a second typeface, a monospace face or a dark theme.
