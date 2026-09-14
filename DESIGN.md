---
name: Ghostline
description: Local-first downhill MTB telemetry for comparing runs, sectors, and route traces.
colors:
  background: "#101311"
  panel: "#181c19"
  raised: "#212622"
  border: "#313830"
  text: "#f0f2e9"
  muted: "#9ca698"
  accent: "#d5f55a"
  lost: "#f19784"
  gained: "#9edfc0"
  ghost: "#bec8bf"
typography:
  body:
    {
      fontFamily: "Barlow, sans-serif",
      fontSize: "14px",
      fontWeight: 400,
      lineHeight: 1.5,
    }
  display:
    {
      fontFamily: "Barlow Condensed, sans-serif",
      fontSize: "42px",
      fontWeight: 600,
      lineHeight: 1.1,
      letterSpacing: "-0.02em",
    }
  title:
    {
      fontFamily: "Barlow Condensed, sans-serif",
      fontSize: "24px",
      fontWeight: 600,
      lineHeight: 1.2,
      letterSpacing: "0.005em",
    }
  measurement:
    {
      fontFamily: "IBM Plex Mono, monospace",
      fontSize: "13px",
      fontWeight: 400,
      lineHeight: 1.3,
    }
  label:
    {
      fontFamily: "Barlow, sans-serif",
      fontSize: "10px",
      fontWeight: 600,
      lineHeight: 1.2,
      letterSpacing: "0.12em",
    }
rounded: { control: "4px", nav: "5px", panel: "8px" }
spacing:
  {
    xs: "4px",
    sm: "8px",
    md: "12px",
    lg: "16px",
    xl: "24px",
    2xl: "32px",
    3xl: "48px",
  }
components:
  button-primary:
    {
      backgroundColor: "{colors.accent}",
      textColor: "{colors.background}",
      typography: "{typography.body}",
      rounded: "{rounded.control}",
      padding: "10px 16px",
      height: "40px",
    }
  button-secondary:
    {
      backgroundColor: "transparent",
      textColor: "{colors.text}",
      typography: "{typography.body}",
      rounded: "{rounded.control}",
      padding: "10px 16px",
      height: "40px",
    }
  panel:
    {
      backgroundColor: "{colors.panel}",
      textColor: "{colors.text}",
      rounded: "{rounded.panel}",
      padding: "24px",
    }
  input:
    {
      backgroundColor: "{colors.background}",
      textColor: "{colors.text}",
      typography: "{typography.body}",
      rounded: "{rounded.control}",
      padding: "10px 12px",
      height: "43px",
    }
  nav-item:
    {
      backgroundColor: "transparent",
      textColor: "{colors.muted}",
      typography: "{typography.body}",
      rounded: "{rounded.nav}",
      padding: "13px 12px",
      height: "40px",
    }
  telemetry-trace:
    {
      backgroundColor: "transparent",
      textColor: "{colors.accent}",
      typography: "{typography.measurement}",
      size: "2px",
    }
---

# Design System: Ghostline

## Overview

**Creative North Star: “The Race Engineer Workstation”**

Ghostline is a compact downhill MTB telemetry workstation: matte green-black surfaces, fine instrument borders, condensed race-board headings, and measured data typography. The interface is dense enough for comparison work while leaving the current run and its ghost trace easy to read at a glance.

Color is telemetry: acid yellow marks the current run and active controls; cool pale green marks the ghost; coral and mint report time lost and gained. Depth comes from dark tonal layers and hairline borders. Preserve the pinned motorsport telemetry direction and disciplined annotation placement; avoid decorative gradients and shadows.

**Key Characteristics:**

- Matte dark green-black canvas with restrained tonal layering.
- Barlow Condensed headings, Barlow UI copy, and IBM Plex Mono measurements.
- Acid yellow current state, coral loss, mint gain, and pale ghost trace.
- Compact controls, fine borders, and a 40px minimum interactive target.

## Colors

The palette is an instrument panel: warm off-white text on green-black layers, with state colors reserved for telemetry and interaction.

### Primary

- **Acid Yellow Current Run** (`#d5f55a`): Current run, active navigation, focus rings, progress, and primary actions.

### Neutral

- **Matte Canvas** (`#101311`): Application background and scrollbar track.
- **Panel Green-Black** (`#181c19`): Contained cards and telemetry panels.
- **Raised Green-Black** (`#212622`): Hovered controls and raised utility surfaces.
- **Fine Border** (`#313830`): Panel, navigation, divider, and table rules.
- **Warm Off-White** (`#f0f2e9`): Primary text and headings.
- **Cool Muted** (`#9ca698`): Supporting copy, labels, and secondary data.
- **Cool Pale Ghost** (`#bec8bf`): Ghost trace and comparison reference.

### Tertiary

- **Coral Time Lost** (`#f19784`): Lost time, danger, and destructive affordances.
- **Mint Time Gained** (`#9edfc0`): Gained time and positive device status.

**The Telemetry Color Rule.** Use acid yellow for current state, coral for lost time, mint for gained time, and pale ghost green for the comparison trace.

## Typography

**Display Font:** Barlow Condensed (self-hosted, with sans-serif fallback)  
**Body Font:** Barlow (self-hosted, with sans-serif fallback)  
**Label/Mono Font:** IBM Plex Mono (self-hosted, with monospace fallback)

Barlow Condensed gives headings a race-board silhouette. Barlow keeps controls practical; IBM Plex Mono is reserved for numbers, timings, sectors, and trace metadata.

### Hierarchy

- **Display** (600, `42px`, `1.1`): Page and empty-state headings; `36px` on narrow screens.
- **Title** (600, `24px`, `1.2`): Panel and section headings; management headings use `30px`.
- **Body** (400, `14px`, `1.5`): Navigation, controls, and explanatory text.
- **Measurement** (400, `13px`, `1.3`): Timings, deltas, sector values, and tabular figures.
- **Label** (600, `10px`, `0.12em`): Compact annotations and captions.

**The Measurement Rule.** Compared or sequential numbers use IBM Plex Mono; prose stays in Barlow.

## Layout

Desktop uses a fixed `224px` left rail and a fluid main shell capped at `1660px`, with `36px` gutters. The analysis surface places a flexible map/telemetry area beside a timing and sector stack; at `1000px` and below they stack. At `1200px`, the rail contracts to `190px` and gutters to `24px`.

The spacing rhythm is `4 / 8 / 12 / 16 / 24 / 32 / 48px`. Panels generally use `24px` padding, with tighter telemetry and mobile variants. At `700px`, navigation becomes a sticky top row, content uses `18px` gutters, and tables scroll in their own region. Interactive controls keep a minimum height of `40px`.

## Elevation & Depth

Ghostline is flat by default and conveys depth through tonal layering, borders, and selection states. The stylesheet defines no box shadows or decorative gradients. Panels sit on `#101311` using `#181c19`; hover and selected states use `#212622` or a low-opacity acid-yellow tint.

**The Flat-by-Default Rule.** Use a tonal surface or fine border to establish hierarchy; do not add shadows to routine panels or controls.

## Shapes

Standard controls use `4px` corners, navigation items use `5px`, and contained panels use `8px`. Avatars are circular. Borders are usually `1px` and use the fine-border token; selected rows use tonal backgrounds rather than heavy outlines.

## Components

### Buttons

- **Shape:** Rectangular controls with `4px` corners and at least `40px` height.
- **Primary:** Acid yellow fill, dark canvas text, `10px 16px` padding; hover lightens to `#e2ff81`.
- **Secondary:** Transparent surface with a `1px` border and warm off-white text; hover uses the raised surface.
- **Focus:** `2px` acid-yellow outline with `4px` offset.
- **Danger:** Coral text for destructive actions.

### Cards / Containers

- **Corner Style:** `8px` standard; dense instrument groups may use `6px`.
- **Background:** Panel green-black on the matte canvas; raised green-black marks hover.
- **Shadow Strategy:** No shadows; use borders and tonal contrast.
- **Border:** `1px` fine border.
- **Internal Padding:** `24px` standard, `15–21px` for dense and narrow telemetry.

### Inputs / Fields

- **Style:** `#101311` background, `1px solid #414d39`, `4px` corners, `10px 12px` padding, and `43px` minimum height.
- **Focus:** Acid-yellow `2px` outline with `4px` offset; caret uses acid yellow.
- **Placeholder:** Muted green-gray (`#9aa88e`).

### Chips

- **Style:** Small bordered labels such as demo and personal-best badges, with `3px` corners and dark green surfaces.
- **State:** Acid yellow marks the active dot or value.

### Navigation

- **Style:** Fixed desktop rail with condensed wordmark; sticky horizontal top row below `700px`.
- **State:** Hover uses a dark raised surface; active uses a low-opacity acid-yellow background and acid-yellow text.

### Telemetry Trace

The signature comparison surface pairs a current acid-yellow route trace with a dashed pale ghost trace, sector markers, a shared scrubber, and mono trace metadata. Sector selection highlights the corresponding route portion so map and telemetry remain one interaction.

## Do's and Don'ts

### Do:

- **Do** keep the race-engineer workstation metaphor visible in density and comparison-first layout.
- **Do** use the established colors for semantic telemetry states.
- **Do** preserve the `4 / 8 / 12 / 16 / 24 / 32 / 48px` rhythm.
- **Do** use Barlow Condensed for headings, Barlow for copy, and IBM Plex Mono for measurements.
- **Do** keep visible focus indicators and `40px` interactive targets.

### Don't:

- **Don't** introduce decorative gradients, routine shadows, or soft marketing-card styling.
- **Don't** use coral or mint as general brand accents; they communicate time state.
- **Don't** replace the condensed heading and mono measurement pairing.
- **Don't** make current/ghost comparison secondary to ornamental imagery or oversized empty space.
