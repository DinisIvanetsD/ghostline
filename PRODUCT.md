# GHOSTLINE

## Product
Performance analysis for downhill and MTB riders. Chase yourself.
Core loop: RIDE → ANALYZE → FIND TIME → SEND AGAIN.
Riders compare repeat runs on the same trail against their own Personal Best, identify sector losses, and combine fastest sectors into a Theoretical Best.

## Platform
web

## Stack
Delegated to implementation by explicit user request. Greenfield React and TypeScript with Vite. Local-first persistence is an implementation assumption for an immediately usable MVP without external credentials. Cloud accounts and cross-device sync remain future work; the production shell now includes a local-device account gate so the final user flow is distinct from the demo workspace.

## Brand commitments
Dark, premium, minimal, technical. Motorsport telemetry for downhill MTB. Maps, ghost comparisons and sector deltas lead. Avoid generic fitness dashboard styling.

## Scope
Local rider accounts and profiles, bike management, setup/maintenance notes, trail creation, GPX/FIT import, GPS quality cleanup, timestamped runs, interactive maps, telemetry, personal best, comparisons, editable sectors, physical finish gates, theoretical best, history, progression snapshots and a local Video Lab for FIT/GPX sync, two-point drift correction, stop detection, riding signals, sector jump points, per-run projects, WebM telemetry overlays and edit-plan export. The shell is installable and cacheable for offline analysis after the first visit. Synthetic demo data is seeded into a new rider workspace. Full MP4 rendering, camera-vision event detection and AI feedback remain the next layer.
