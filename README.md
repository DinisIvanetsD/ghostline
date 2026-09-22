# GHOSTLINE

**Chase yourself.** A local-first performance analysis workspace for downhill and MTB riders.

Compare repeated runs, find lost seconds, and build a theoretical best from the fastest sectors you have actually ridden. Includes eleven clearly marked synthetic runs across three local trails — Mundial da Santa Marta and Free Ride in Santa Marta das Cortiças, plus Secret Spot Sameiro — so the complete analysis experience works immediately.

## Run locally

Requires Node.js 22.12+ (tested with Node 24) and npm.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173. Without Supabase settings the app remains local-first. To test hosted accounts and sync, copy `.env.example` to `.env.local` and fill in the public project URL and anon key.

## Enable real accounts and cloud sync

The app supports Supabase email/password accounts, email confirmation, password recovery, private rider workspaces, and private video storage. Create a Supabase project, run [`supabase/schema.sql`](supabase/schema.sql) in its SQL editor, and add the Vite variables from `.env.example` to `.env.local`. In Supabase Auth, allow the local URL and the deployed GitHub Pages URL (including its `/ghostline/` base path) as redirect URLs. For GitHub Pages, add repository Actions secrets named `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; the publish workflow injects them during the build. The anon key is intended for browser use; never add a service-role key to the frontend.

When Supabase is not configured, the app visibly runs as a device-local preview. Account recovery and multi-device sync need the hosted configuration above. Cloud media uploads are private and limited to 250 MB per clip by the included bucket policy.

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

Browser tests use installed Google Chrome locally. CI uses Playwright Chromium: `npx playwright install --with-deps chromium`, then `CI=true npm run test:e2e`. On Windows PowerShell set `$env:CI='true'` before running if using downloaded Chromium instead of Chrome. `npm run preview` serves the production build. The GitHub Actions workflow runs all checks.

## Install on iPhone

The public build is published at [dinisivanetsd.github.io/ghostline](https://dinisivanetsd.github.io/ghostline/). Open it in Safari, tap **Share**, choose **Add to Home Screen**, keep the `GHOSTLINE.` name, and tap **Add**. The app opens in standalone mode and keeps the rider's local workspace on that iPhone.

## Try the product

1. Open **Run analysis**. The latest Mundial da Santa Marta run is compared against its automatically selected Personal Best.
2. Select any reference run, inspect a sector, scrub the speed/elevation graph, or replay the two riders on a shared clock.
3. Open **Run history** to see progression, compare attempts, delete a run, and inspect the source of each theoretical-best sector.
4. Edit your **Rider profile**, then add/edit bikes in **Bike garage**.
5. Create a trail in **Trails**, or import its GPX/FIT route. Set interior sector boundaries as fractions, e.g. `0.25, 0.5, 0.75`, and name the sectors. Start and finish are included automatically.
6. **Import run** accepts timestamped GPX and Garmin FIT descents. Use **Try a sample GPX** to download a synthetic sample, then import it against Mundial da Santa Marta or your empty new trail. The first run defines an empty trail's geometry. Secret Spot Sameiro uses the rider-defined finish gate (`41.5628056, -8.3732222`) and accepts either marked uphill start; GPS points captured after the endpoint are clipped automatically.
7. Export or restore a JSON backup from **Rider profile**. After the first visit, the workspace shell can reopen offline; map tiles still need a connection.
8. Open **Video lab**, choose an MP4/MOV/WebM clip from DJI Mimo, select the matching FIT/GPX run, mark the GPS start and finish for drift-resistant sync, scan pauses, jump between sector windows or GPS riding signals, and export a local WebM overlay. Download the edit plan when you are ready to cut the footage elsewhere.

The seeded trail references follow the rider's Santa Marta das Cortiças setup. Public Trailforks pages identify the network as Santa Marta, Braga: [Freeride](https://www.trailforks.com/trails/freeride-8627/), [Mundial](https://www.trailforks.com/trails/mundial-835186/) and [Secret Spot](https://www.trailforks.com/trails/secret-spot-234073/). Trailforks requires a login to download the source GPX, so the demo keeps clearly marked synthetic geometry around the public trailheads.

## Implemented

- Persistent local rider profile; bike creation, editing and deletion with reference protection.
- Trail creation, GPX/FIT route import, editable named sectors, and trail/run deletion.
- GPX track and route parsing plus Garmin FIT decoding with validation, point limits, coordinate and timestamp checks.
- Geographic route compatibility checks, including direction, sparse routes and closed loops.
- Interactive Leaflet map with zoom, pan, start/finish/sector markers, selected sector highlighting, and current/Ghost markers.
- Time, distance, average/top speed, elevation, ascent/descent analysis; speed/elevation graphs and synchronized inspection.
- GPS quality cleanup for isolated spikes, chained DJI Mimo teleports and trailing impossible fixes, with review notices and defensive telemetry on stored runs.
- Automatic Personal Best, arbitrary same-trail comparisons, signed sector gains/losses, and theoretical best with source runs. Sector gates follow the physical trail route and are interpolated onto each run's GPS trace.
- Run history, search, clickable progression, recent average/consistency snapshot, and immediate recomputation after edits/deletions.
- **Bike garage** with linked-run coverage, PB counts, per-bike suspension/tyre/wheel setup, service date and notes.
- **Video lab** with MP4/MOV/WebM preview, FIT/GPX-to-video offset or two-point drift sync, independent slow-motion preview, GPS stop detection, ride-window trimming, sector jump points, GPS riding-signal review, per-run project settings, a rendered WebM telemetry overlay, and a portable JSON edit plan. With Supabase configured, clips up to 250 MB and sync markers can be opened across devices.
- **Unlisted run links** with a random bearer token, a seven-day expiry, hashed token storage, GPS snapshots, and a read-only trail/sector viewer. Sharing is available only with a configured cloud account.
- Physical finish gates for known trails. Secret Spot Sameiro trims forgotten post-finish capture in future GPX/FIT imports and supports both marked uphill starts.
- Responsive desktop/mobile interface, keyboard controls, self-hosted typography and reduced-motion support.
- Versioned browser persistence, validated backups, quota errors and corrupt-storage recovery.

## Architecture

**React + TypeScript + Vite**, **Leaflet**, custom responsive SVG telemetry, Lucide icons, self-hosted Barlow/IBM Plex Mono. Vitest covers the domain and persistence; Playwright covers user flows.

- `src/types.ts`: explicit domain types for points, runs, trails, sectors, bikes and profile.
- `src/lib/analysis.ts`: pure telemetry, time interpolation, PB and theoretical-best calculations.
- `src/lib/gpsQuality.ts`: deterministic GPS spike/gap classification shared by imports, telemetry and riding-event detection.
- `src/lib/progressionInsights.ts`: trail-scoped progression, recent average, consistency and sector trend calculations.
- `src/lib/gpx.ts` and `src/lib/fit.ts`: import boundaries; untrusted files become validated points.
- `src/lib/routeMatch.ts`: bounded geometric compatibility checks plus explicit physical finish gates for trails whose GPS capture commonly continues after the run.
- `src/lib/storage.ts`: versioned local persistence and backup validation.
- `src/lib/cloudSync.ts`, `src/lib/supabase.ts`, `supabase/schema.sql`: optional Supabase authentication, row-level-secured workspace sync, and private video-storage policy.
- `src/components/TrailMap.tsx`, `Charts.tsx`: geographic and telemetry inspection.
- `src/components/Management.tsx`: rider, bike, trail and import flows.
- `src/components/VideoLab.tsx` and `src/lib/videoSync.ts`: local video alignment, pause detection, sector windows and edit-plan export.
- `VIDEO_ARCHITECTURE.md`: the extension seam for frame sampling, ONNX/server model adapters and MP4 rendering.
- `src/App.tsx`: workspace selection, comparison state and orchestration.

Raw GPS points are retained. Metrics and bests are derived, not duplicated as mutable records, so changing sectors or deleting a run immediately changes the result. Theoretical-best sectors reference the runs that supplied them. A stable run ID and elapsed-time sample model provide extension points for video offsets, detected events, line annotations and future feedback, without coupling them to the MVP.

## Calculation and data contract

Distances use haversine calculations, speed is **km/h**, elevation/distance are **metres**, analysis time is **seconds**. GPX timestamps are epoch milliseconds and FIT timestamps are converted from Garmin time; the engine also accepts epoch/relative seconds. Sector boundaries are strictly increasing interior fractions of total traveled distance. Time at a split is linearly interpolated between GPS samples. Full duration includes stationary start/end time.

PB is the shortest total duration among the rider's runs assigned to the selected trail. Theoretical best is the sum of independent minimum sector times on that trail. Ties retain the first stored run. Sector gates use the trail's physical route and nearest-run interpolation when geometry is available; a normalized-distance fallback is used for geometry-less trails. Comparisons use normalized distance, not a race-grade geographic timing gate. Route validation guards against mismatched imports; it is not exact map matching.

## Deliberate MVP limits

- **Hosted account features need configuration.** Without Supabase settings, the visible preview uses local browser accounts, has no password recovery or cross-device sync, and is not a secure identity service. With Supabase configured, auth and workspace sync are real; simultaneous offline edits across devices use a last-save-wins workspace model.
- Local storage capacity varies by browser. Save failures retain the current workspace and show a message. Video clips stay out of the workspace JSON; they are held locally in the browser or stored privately in Supabase Storage when configured.
- One complete track/segment or route per file, up to 10 MB and 25,000 points. Runs accept GPX or Garmin FIT timestamps; duplicate second-resolution samples are coalesced. TCX, multiple segments and sensor streams are not included; Video Lab ride-window trimming is available after import.
- Missing elevation is represented as zero; elevation/descent then cannot be treated as measured telemetry. GPS speed is derived from geometry and isolated impossible spikes are removed before telemetry; unrecoverable gaps remain flagged for review.
- Normalized distance alignment is approximate, especially where riders take different lines or GPS drifts. Corridor/end-point tolerance is 200 m, length tolerance 25%; no race timing precision is claimed.
- Synthetic demo geometry is illustrative and is not trail navigation guidance. Secret Spot Sameiro's seeded route follows the rider-provided start/finish gates; Trailforks remains the source of truth for access and current trail conditions.
- The basemap requires internet. GPS traces, timing and charts continue to work without tiles. Browser tile requests disclose the viewed map area to OpenStreetMap. No raw GPX is uploaded by the app.
- The Video lab renders a browser-native WebM telemetry overlay when the device supports MediaRecorder; it does not render a new MP4 in the browser yet. Riding-event labels are GPS-derived signals, not camera-vision detection or coaching. Automatic video/GPS alignment still needs the rider's start/finish anchors.
- Friend comparisons, private leaderboards, iOS share-sheet receiving, and local notifications are not enabled yet. Friend and leaderboard flows need invite/consent controls and a configured live backend; browser notifications also need user opt-in.

The default basemap uses [OpenStreetMap tiles](https://operations.osmfoundation.org/policies/tiles/) with visible attribution and browser caching. A hosted production rollout should select a tile service appropriate to expected traffic.

## Next steps

1. Configure the Supabase project and GitHub Actions secrets to turn on hosted login and private sync in the deployed site.
2. Add consent-based rider connections and private leaderboards on top of the existing unlisted run links.
3. Add incoming iOS Share Sheet support and improve offline map and media handling.
4. Add an FFmpeg/WebCodecs renderer for one-click MP4 export and improve sync suggestions using video/GPS event timing.
5. Add an opt-in vision model for camera-based line feedback, with model versioning and confidence scores.
