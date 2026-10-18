---
name: verify
description: How to run and drive Ghostline (React/Vite) to verify a change at its real surface.
---

# Verify Ghostline

- Dev server: `.claude/launch.json` config "ghostline" (`npm run dev`, port 5173). Reuse it if it is already up.
- Drive with Playwright from a throwaway `.something.tmp.mjs` in the repo root (so `@playwright/test` resolves):
  `chromium.launch({ channel: "chrome" })`. The bundled headless shell is not installed, only system Chrome.
- Enter the app: click the button matching `/Ver a demonstração sem conta/` (guest mode, demo data).
- Nav buttons are `getByRole("button", { name: "<Análise|Histórico|Vídeo|Pistas|Garagem|Importar run>", exact: true }).first()`.
- Widths worth checking: 390 (phone), 768 (tablet, sidebar still shown), 1100, 1440.
  Overflow check: `document.documentElement.scrollWidth - clientWidth`. Elements clipped by
  `overflow: hidden` parents do not show up there, so compare child and parent rects too.
- 3D map (MapLibre) needs real Chrome with WebGL; the in-app browser pane can get stuck on
  "A carregar o relevo" after many hot reloads. Reload, or use Playwright Chrome.
- Map imagery: DGT WMS (`cartografia.dgterritorio.gov.pt`) loads fine as Leaflet `<img>` tiles,
  but fails as WebGL textures (duplicated CORS header). The 3D drape uses EOX Sentinel-2.
- Vite sometimes serves a stale transform after quick import edits ("X is not defined");
  `touch` the file to bust it.
- Delete the temp script and `tsconfig.tsbuildinfo` (from `tsc -b`) before committing.
