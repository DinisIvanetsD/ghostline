---
name: Ghostline
description: Downhill run telemetry for Braga riders, presented as a dark streaming catalogue with real aerial photos and a 3D flight over the relief.
colors:
  night: "#0b0e13"
  panel: "#151922"
  raised: "#1f2430"
  border: "#2a3040"
  field-border: "#3a4254"
  text: "#e6e6e8"
  muted: "#a4a9b3"
  amber: "#ffbe55"
  amber-hover: "#ffcd7a"
  coral: "#ff8a6b"
  mint: "#6fd6a0"
  trace-neutral: "#8a90a0"
typography:
  display:
    fontFamily: "Big Shoulders Display, Public Sans, sans-serif"
    fontSize: "64px"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "0.02em"
    textTransform: "uppercase"
  run-time:
    fontFamily: "Big Shoulders Display, Public Sans, sans-serif"
    fontSize: "68px"
    fontWeight: 800
    lineHeight: 1
    fontFeature: "tnum"
  title:
    fontFamily: "Big Shoulders Display, Public Sans, sans-serif"
    fontSize: "24px"
    fontWeight: 800
    letterSpacing: "0.02em"
    textTransform: "uppercase"
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
rounded:
  control: "6px"
  panel: "8px"
  hero: "10px"
  marker: "4px"
spacing:
  tile-gap: "6px"
  control-y: "10px"
  control-x: "16px"
  gutter: "22px"
  panel: "24px"
  hero: "28px"
components:
  button-primary:
    backgroundColor: "{colors.amber}"
    textColor: "{colors.night}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.amber-hover}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    borderColor: "{colors.field-border}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
    height: "40px"
  button-secondary-hover:
    borderColor: "{colors.amber}"
    textColor: "{colors.amber}"
  input-field:
    backgroundColor: "{colors.night}"
    textColor: "{colors.text}"
    borderColor: "{colors.border}"
    rounded: "{rounded.control}"
    height: "40px"
  nav-item:
    textColor: "{colors.muted}"
    rounded: "{rounded.control}"
    padding: "13px 12px"
  nav-item-active:
    borderColor: "{colors.amber}"
    textColor: "{colors.amber}"
  trail-poster:
    backgroundColor: "{colors.raised}"
    rounded: "{rounded.panel}"
    aspectRatio: "16 / 9"
  sector-tile-gained:
    backgroundColor: "rgba(111,214,160,.1)"
    borderColor: "rgba(111,214,160,.45)"
    textColor: "{colors.text}"
    rounded: "{rounded.panel}"
  sector-tile-lost:
    backgroundColor: "rgba(255,138,107,.08)"
    borderColor: "rgba(255,138,107,.4)"
    textColor: "{colors.text}"
    rounded: "{rounded.panel}"
  gate-marker:
    backgroundColor: "{colors.night}"
    textColor: "{colors.text}"
    borderColor: "{colors.text}"
    rounded: "{rounded.marker}"
    size: "28px"
---

# Design System: Ghostline

## Overview

**Creative North Star: "Catálogo de pistas"**

Ghostline looks like a streaming catalogue where every title is a trail. The ground is night blue-black. Each trail is shown as a poster: its real aerial photo with the route drawn in amber. The analysis page opens on a hero poster of the selected trail, with the trail name set large in condensed capitals. Below the hero, the run is shown as a 3D flight over the real relief. The rider sees the trace, the Ghost and the sector gates on the mountain itself.

Colour has one meaning per hue. Amber is the brand, the active state, the primary action and the rider's own run. Mint means time gained. Coral means time lost. Everything else is light grey on dark panels. Depth comes from photos, scrims and motion, not from shadows. The focused item in a group grows and its siblings dim, like a poster in a streaming row.

This system replaces the earlier "Azulejo de Braga" world of cobalt on white glaze.

**Key Characteristics:**
- Dark world (`color-scheme: dark`) with hairline 1px borders and 6-10px corners.
- Real imagery everywhere a trail is named: DGT 2018 orthophotos on posters and Sentinel-2 cloudless on the 3D drape.
- Big Shoulders Display for titles and the run time, Public Sans for everything else, with tabular figures.
- Amber for brand and action, mint for gain and coral for loss, on tiles, figures and the 3D trace alike.
- Focus-grows, siblings-dim motion on poster grids and sector tiles. All of it is off under `prefers-reduced-motion`.

## Colors

### Primary
- **Floodlight Amber** (amber, `#ffbe55`): the primary button fill, the active nav outline, the rider's trace in plain mode, the rider dot in 3D, the route line on posters, the selected sector outline and the trail-poster hover border.
- **Lit Amber** (amber-hover, `#ffcd7a`): hover state of the primary button.

### Meaning
- **Mint** (mint, `#6fd6a0`): time gained. It is used for gained-sector deltas, the tint and border of gained tiles, and the "gaining" end of the Ghost trace ramp.
- **Coral** (coral, `#ff8a6b`): time lost. It is used for positive deltas, the tint and border of lost tiles, and the "losing" end of both trace ramps.
- **Trace Grey** (trace-neutral, `#8a90a0`): on the Ghost's pace, and the middle of the speed ramp.

### Neutral
- **Night** (night, `#0b0e13`): the page ground, the sidebar, input fills and the scrim colour on photos.
- **Panel** (panel, `#151922`): every panel and card.
- **Raised** (raised, `#1f2430`): hover fills, the active segment of a switch, and the poster placeholder.
- **Border** (border, `#2a3040`): 1px panel and field borders and dividers.
- **Field Border** (field-border, `#3a4254`): the stroke on secondary buttons.
- **Text** (text, `#e6e6e8`) and **Muted** (muted, `#a4a9b3`): body text and labels.

### Named Rules
**The One Meaning Rule.** Mint is gain and coral is loss, everywhere: tiles, figures, the 3D trace and the share card. Amber is never used to show gain or loss.

**The Real Ground Rule.** A trail is always shown on its own aerial photo. Never use a stock image or an illustration for a trail.

## Typography

**Display Font:** Big Shoulders Display 700/800, self-hosted with Fontsource.
**Body Font:** Public Sans 400/600/800, latin and latin-ext.

**Character:** The display face is a condensed capitals face. It reads like a title card on a poster. Public Sans keeps the data plain and readable on a phone in sunlight. Tabular figures are set at the root, so times line up and do not jitter during replay.

### Hierarchy
- **Display** (800, 64px, uppercase): the trail name in the hero. It is 28px on phone.
- **Run time** (800, 68px, tabular): the time in the timing panel. It is 54px on phone.
- **Title** (800, about 24px, uppercase): panel headings such as "Tempo", "Tempos por setor" and "Garagem", plus poster card names.
- **Body** (400, 13px): controls, tables and copy.
- **Label** (400, 12px, sentence case): field and stat labels in Muted. 12px is the floor.

## Layout

On desktop, a 224px Night sidebar sits on the left. The active item has an amber outline. The analysis page has three bands:
1. The **hero poster**: the trail's aerial photo with a slow Ken Burns drift, under a bottom-and-left scrim. It holds the trail select, the trail facts, and the "Ver em 3D" and "Gerir setores" actions.
2. The **run pickers**: the current run versus the reference run.
3. A two-column grid. The **3D stage** (540px tall) and its stats are on the left. The timing panel and the 2 x 2 sector tiles are on the right.

At 700px and below, the sidebar becomes a top header with a scrolling nav row. The hero stacks its actions under the title. Content then runs in one column: timing, sector tiles four in a row, the 3D stage (380px tall), stats and telemetry.

The Pistas page is a poster grid: `repeat(auto-fill, minmax(260px, 1fr))` with 16:9 posters on top of each card.

## Elevation & Depth

There are no drop shadows. Depth comes from three things:
- **Photo plus scrim.** Hero and sign-in backdrops lay a Night gradient over the aerial photo, so the text stays readable.
- **Perspective motion.** Poster cards lift (`translateY(-4px) rotateX(3deg) scale(1.03)`) inside a 1200px perspective. Sector tiles tilt 6deg on hover. The selected tile scales to 1.05.
- **Dimming.** When one card in a group is hovered or selected, its siblings drop to 0.5-0.55 opacity.

## Shapes

Controls use 6px corners, panels and posters 8px, and the hero 10px. Gate markers in 3D are 28px squares with 4px corners. The avatar and status dots are the only circles.

## Components

### Buttons
- **Primary:** an amber fill with Night text at 800 weight. Hover moves to Lit Amber. It is used for "Importar run", "Ver em 3D", "Nova pista" and "Guardar".
- **Secondary:** transparent, with a 1px Field Border stroke. Hover turns the border and text amber.

### Trail Poster
The `TrailPoster` component draws the DGT orthophoto (WMS GetMap, EPSG:3857) cropped to the route's box at the poster's aspect ratio. An SVG layer draws the route in amber with a 3px non-scaling stroke. A small "Ortofotos 2018 © DGT" credit sits in the bottom-right corner unless the poster is decorative. If the photo fails to load, the route stays visible on Raised.

### 3D Stage
The `Terrain3D` component uses MapLibre GL with the AWS terrarium DEM at 1.7x exaggeration and a Sentinel-2 cloudless drape. A dark sky and fog finish the scene.
- **Camera:** the overview looks across the slope, at the descent bearing minus 90 degrees and a pitch of 55, so the run reads top-left to bottom-right instead of collapsing along the line of sight. "Seguir run" and replay switch to a chase camera at pitch 70 and zoom 16.6.
- **Overlays:** the trace is colour-mixed per segment. The Ghost is a dashed light line, the selected sector a blurred amber band, and the riders are amber and grey dots. The gates are S, 1, 2, 3 and F buttons that jump the replay to that point.
- **Tools:** a Night glass bar holds the trace mode (Δ Ghost, Velocidade, Simples) and the camera (Seguir run, Vista geral). A legend sits bottom-left and attribution bottom-right.
- **Fallback:** the 2D Leaflet `TrailMap` is shown while the chunk loads, if WebGL is missing, or if the context is lost.

### Sector Tiles
Tiles have 8px corners, with the index top-left and the delta top-right. Gained tiles are mint-tinted with a mint delta. Lost tiles are coral-tinted with a coral delta. The selected tile gets an amber border and scales to 1.05 while the other tiles dim to 0.5.

### Trace Ramps
- **Ghost:** coral (losing), then grey (on pace), then mint (gaining).
- **Speed:** coral (slow), then grey, then amber (fast).

The 38 x 5px legend strip shows the same ramp.

### Share Card
The exported PNG uses the same palette: a Night ground, Text and Muted copy, amber for the time, and mint or coral for the deltas.

## Motion
- `poster-drift`: a 24s alternating Ken Burns drift (scale 1.08 to 1.16, small translate) on the hero and sign-in backdrops.
- Card lift and tile tilt: 0.3-0.35s with `cubic-bezier(.2,.7,.2,1)`.
- Camera moves: 450ms `easeTo` while following, and a 1.6s fly to the overview.
- Under `prefers-reduced-motion: reduce`, the drift animation, the transitions and the transforms are removed, and camera moves have zero duration.

## Do's and Don'ts

### Do:
- **Do** show every trail on its real aerial photo, and credit DGT, EOX/Copernicus and the terrain tiles.
- **Do** keep amber for action and the rider's own line, mint for gain and coral for loss.
- **Do** use Big Shoulders Display, uppercase, for titles and the run time, and Public Sans for data and copy.
- **Do** keep the 3D overview looking across the slope.
- **Do** keep a working 2D fallback for every 3D view.

### Don't:
- **Don't** add drop shadows. Use a scrim, perspective or dimming instead.
- **Don't** drape the 3D terrain with the DGT WMS. Its duplicated `Access-Control-Allow-Origin` header breaks WebGL textures.
- **Don't** return to a light theme or cobalt accents.
- **Don't** animate anything without a reduced-motion path.
