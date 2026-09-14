# Verification record

Verified 14 September 2026 on Windows, Node 24, system Chrome.

## Automated checks

- `npm run typecheck`: passed.
- `npm run lint`: passed, zero errors.
- `npm test`: 8 files, 48 tests passed.
- `npm run build`: passed (Vite production bundle).
- `npm run test:e2e`: 15 Playwright tests passed, including playable/invalid Video Lab media, sync, stop scan, edit-plan and Secret Spot finish-gate flows.
- Runtime capture: zero page errors; actual basemap tiles loaded at desktop and mobile widths.
- Viewports: 1440px desktop and 390px mobile screenshots inspected. Browser tests additionally checked 360px analysis and 390px management. Document scroll width equals viewport width.
- Video Lab screenshots inspected with and without a local clip; desktop and mobile scroll width stayed equal to the viewport and no page errors were recorded.

## Definition of Done audit

| Requirement                              | Evidence                                                                                                                     | Result                     |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| Application launches                     | Live Vite app opened through browser automation; production build succeeds and its preview opened successfully through browser automation                                                   | Pass                       |
| Main flows end to end                    | Profile save/reload; bike add/edit/delete; trail create/import; GPX and FIT runs imported and compared; backup export/restore | Pass for local-profile MVP |
| Multiple same-trail runs                 | Seven Mundial, two Free Ride and two Secret Spot synthetic runs; newly created trail receives two user-imported runs in E2E | Pass                       |
| Automatic PB                             | Pure-domain tests; faster import earns PB badge; deleting PB updates reference to next fastest                               | Pass                       |
| Ghost and arbitrary comparison           | Reference selector, current run selector and signed total delta exercised                                                    | Pass                       |
| Sector gains/losses                      | All sectors render; physical trail gates are interpolated onto each run; sector click highlights route; sector count changes after editing; unit tests verify detours and sum equals duration | Pass                       |
| Theoretical Best                         | Fastest per-sector run references preserved; demo test verifies faster than PB and multiple source runs                      | Pass                       |
| Functional maps/telemetry                | Loaded real map tiles, geographic trace, markers, zoom controls, slider, elevation toggle, replay and selected sector        | Pass                       |
| Desktop/mobile polish                    | Two visual capture rounds; responsive charts; mobile overflow checks; independent review                                     | Pass                       |
| Immediate demo                           | Eleven dense synthetic runs across Mundial da Santa Marta and Free Ride in Santa Marta das Cortiças plus Secret Spot Sameiro, two bikes, one demo rider; sample GPX download | Pass                       |
| Video and FIT/GPX sync                    | Local MP4/MOV/WebM preview, run-linked offset sync with independent preview speed, GPS stop scan, ride-window trimming, sector jump points, riding signals, per-run settings and WebM overlay/edit-plan export | Pass within local workflow |
| Secret Spot finish                        | Rider-defined physical finish gate at 41.5628056, -8.3732222; GPX/FIT imports and existing saved runs are clipped at the marked endpoint, with two accepted uphill starts | Pass |
| No obvious broken screens/runtime errors | E2E covers analysis, history, garage, profile, trails, GPX/FIT import, demo route replacement, empty/corrupt state; capture records zero page errors | Pass within tested scope   |
| Build/lint/types/tests                   | Commands listed above all passed                                                                                             | Pass                       |

## Independent review and corrections

A separate correctness reviewer identified stationary end-time omission, sparse/closed route matching, nonuniform replay clock, and stale profile form after restore. All were addressed. A finish reviewer identified replay overriding sector selection and progression resizing after an empty trail. Both were fixed and explicitly covered in browser tests. The finish review scored those fixes and mobile chart legibility resolved, with a `ship` disposition conditional on final tests; final tests passed.

The original browser-test subagent stopped at its usage limit. The root completed and expanded its tests directly. Documentation and review were delegated separately.

## Boundaries of this verification

This verifies a local-first MVP, not deployed cloud infrastructure. There is no authenticated remote account service. GPS matching/timing is approximate and does not establish race timing precision. The Video Lab produces a browser-native WebM overlay plus sync/cut metadata; browser-side MP4 rendering and an actual camera-vision model are not included yet. Basemap outages, long-term device storage capacity, every GPS exporter and every browser/device have not been exhaustively tested. See README for operating limits and roadmap.
