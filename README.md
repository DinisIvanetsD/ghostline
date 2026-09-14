# GHOSTLINE

**Chase yourself.** A local-first performance analysis workspace for downhill and MTB riders.

Compare repeated runs, find lost seconds, and build a theoretical best from the fastest sectors you have actually ridden. Includes eleven clearly marked synthetic runs across three Braga-inspired trails — Mundial da Santa Marta, Free Ride and Secret Spot Sameiro — so the complete analysis experience works immediately.

## Run locally

Requires Node.js 22.12+ (tested with Node 24) and npm.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173. No API keys, database, or account-provider configuration is required.

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

Browser tests use installed Google Chrome locally. CI uses Playwright Chromium: `npx playwright install --with-deps chromium`, then `CI=true npm run test:e2e`. On Windows PowerShell set `$env:CI='true'` before running if using downloaded Chromium instead of Chrome. `npm run preview` serves the production build. The GitHub Actions workflow runs all checks.

## Try the product

1. Open **Run analysis**. The latest Mundial da Santa Marta run is compared against its automatically selected Personal Best.
2. Select any reference run, inspect a sector, scrub the speed/elevation graph, or replay the two riders on a shared clock.
3. Open **Run history** to see progression, compare attempts, delete a run, and inspect the source of each theoretical-best sector.
4. Edit your **Rider profile**, then add/edit bikes in **Bike garage**.
5. Create a trail in **Trails**, or import its GPX/FIT route. Set interior sector boundaries as fractions, e.g. `0.25, 0.5, 0.75`, and name the sectors. Start and finish are included automatically.
6. **Import run** accepts timestamped GPX and Garmin FIT descents. Use **Try a sample GPX** to download a synthetic sample, then import it against Mundial da Santa Marta or your empty new trail. The first run defines an empty trail's geometry.
7. Export or restore a JSON backup from **Rider profile**.

## Implemented

- Persistent local rider profile; bike creation, editing and deletion with reference protection.
- Trail creation, GPX/FIT route import, editable named sectors, and trail/run deletion.
- GPX track and route parsing plus Garmin FIT decoding with validation, point limits, coordinate and timestamp checks.
- Geographic route compatibility checks, including direction, sparse routes and closed loops.
- Interactive Leaflet map with zoom, pan, start/finish/sector markers, selected sector highlighting, and current/Ghost markers.
- Time, distance, average/top speed, elevation, ascent/descent analysis; speed/elevation graphs and synchronized inspection.
- Automatic Personal Best, arbitrary same-trail comparisons, signed sector gains/losses, and theoretical best with source runs.
- Run history, search, clickable progression, and immediate recomputation after edits/deletions.
- Responsive desktop/mobile interface, keyboard controls, self-hosted typography and reduced-motion support.
- Versioned browser persistence, validated backups, quota errors and corrupt-storage recovery.

## Architecture

**React + TypeScript + Vite**, **Leaflet**, custom responsive SVG telemetry, Lucide icons, self-hosted Barlow/IBM Plex Mono. Vitest covers the domain and persistence; Playwright covers user flows.

- `src/types.ts`: explicit domain types for points, runs, trails, sectors, bikes and profile.
- `src/lib/analysis.ts`: pure telemetry, time interpolation, PB and theoretical-best calculations.
- `src/lib/gpx.ts` and `src/lib/fit.ts`: import boundaries; untrusted files become validated points.
- `src/lib/routeMatch.ts`: bounded geometric compatibility checks independent of timestamps.
- `src/lib/storage.ts`: versioned persistence and backup validation; replaceable with a server-backed repository later.
- `src/components/TrailMap.tsx`, `Charts.tsx`: geographic and telemetry inspection.
- `src/components/Management.tsx`: rider, bike, trail and import flows.
- `src/App.tsx`: workspace selection, comparison state and orchestration.

Raw GPS points are retained. Metrics and bests are derived, not duplicated as mutable records, so changing sectors or deleting a run immediately changes the result. Theoretical-best sectors reference the runs that supplied them. A stable run ID and elapsed-time sample model provide extension points for video offsets, detected events, line annotations and future feedback, without coupling them to the MVP.

## Calculation and data contract

Distances use haversine calculations, speed is **km/h**, elevation/distance are **metres**, analysis time is **seconds**. GPX timestamps are epoch milliseconds and FIT timestamps are converted from Garmin time; the engine also accepts epoch/relative seconds. Sector boundaries are strictly increasing interior fractions of total traveled distance. Time at a split is linearly interpolated between GPS samples. Full duration includes stationary start/end time.

PB is the shortest total duration among the rider's runs assigned to the selected trail. Theoretical best is the sum of independent minimum sector times on that trail. Ties retain the first stored run. Comparisons use normalized distance, not a race-grade geographic timing gate. Route validation guards against mismatched imports; it is not exact map matching.

## Deliberate MVP limits

- **The rider profile is local, not a cloud-authenticated account.** No password, multi-user authorization, server database, cross-device sync or recovery service is implemented. Data lives in this browser; export backups before clearing it.
- Local storage capacity varies by browser. Save failures retain the current workspace and show a message. Large libraries should move to IndexedDB/server storage next.
- One complete track/segment or route per file, up to 10 MB and 25,000 points. Runs accept GPX or Garmin FIT timestamps; duplicate second-resolution samples are coalesced. TCX, multiple segments, trimming and sensor streams are not included.
- Missing elevation is represented as zero; elevation/descent then cannot be treated as measured telemetry. GPS speed is not smoothed and can contain device noise.
- Normalized distance alignment is approximate, especially where riders take different lines or GPS drifts. Corridor/end-point tolerance is 200 m, length tolerance 25%; no race timing precision is claimed.
- Synthetic demo geometry is illustrative and is not trail navigation guidance.
- The basemap requires internet. GPS traces, timing and charts continue to work without tiles. Browser tile requests disclose the viewed map area to OpenStreetMap. No raw GPX is uploaded by the app.
- Video sync, braking/jump detection, line analysis and AI feedback are future modules.

The default basemap uses [OpenStreetMap tiles](https://operations.osmfoundation.org/policies/tiles/) with visible attribution and browser caching. A hosted production rollout should select a tile service appropriate to expected traffic.

## Next steps

1. Add authenticated accounts, a database and object storage for cross-device libraries.
2. Introduce geographic timing gates, GPS quality reporting and run trimming.
3. Add IndexedDB/offline app caching and a production map-provider configuration.
4. Build video synchronization as a run-linked media object with an elapsed-time offset; keep detection events separately versioned.
