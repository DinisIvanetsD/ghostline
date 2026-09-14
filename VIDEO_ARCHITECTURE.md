# Video analysis path

The Video Lab is deliberately split into a deterministic sync layer and an optional vision layer. A rider can already import a DJI Mimo clip, choose the matching FIT/GPX run, align the GPS start, skip detected pauses in preview, jump to sector windows, and export a small edit plan. The original video never leaves the browser in this workflow.

## Current pipeline

1. FIT or GPX is parsed into the shared `Point[]` contract.
2. `videoSync.ts` normalizes timestamps, detects contiguous low-speed intervals, and returns the moving ride window.
3. An offset maps run elapsed seconds to video seconds. Optional anchors and a rate can provide a piecewise correction when a camera clock drifts; the UI's preview speed stays separate so slow motion never changes GPS timing.
4. Trail boundaries are converted into video windows. Each window carries the run time, video time, sector name and delta to the selected Ghost.
5. The exported JSON edit plan is portable. It contains the source filename, sync settings, detected stop intervals, trim window and sector metadata for a desktop editor or a future renderer.

## AI extension

The stable seam for computer vision is the video timeline, not the GPS parser. A frame sampler can use `HTMLVideoElement.requestVideoFrameCallback()` to produce `{ videoTime, frame }` samples. A model adapter then returns versioned events:

```ts
type VideoEvent = {
  type: "jump" | "braking" | "corner" | "line";
  videoStart: number;
  videoEnd: number;
  confidence: number;
  model: string;
};
```

The event times are converted with the same sync settings and displayed beside the map and sector deltas. An adapter can run an ONNX model in WebGPU/WASM for private analysis or submit an explicitly opted-in, downsampled clip to a server worker. Model results should remain separate from raw runs so that a new model version can be compared without rewriting telemetry.

## Export extension

The current edit plan is the safe interchange format. A renderer can consume its `trim`, `detectedStops` and `sectors` fields to produce an MP4. A browser build can use WebCodecs with a demux/mux library or FFmpeg.wasm; a server worker is preferable for long 4K clips. The UI should keep the same flow and replace the download action with a progress-aware render job when that service exists.

## Privacy and failure handling

Video stays local until a rider opts into a remote model or renderer. Missing or drifting camera clocks are handled with manual anchors. Low-confidence model events are shown as suggestions and never alter the original run. FIT/GPX remains the source of timing truth; video analysis enriches it.
