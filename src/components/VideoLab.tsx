import { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  Check,
  Clapperboard,
  Download,
  Film,
  Gauge,
  MapPin,
  Pause,
  Play,
  Scissors,
  SlidersHorizontal,
  Sparkles,
  Target,
  Timer,
  Upload,
  Zap,
} from "lucide-react";
import type { AppData } from "../types";
import {
  analyze,
  formatDelta,
  formatTime,
  personalBest,
  sectorTimes,
  theoreticalBest,
  timeAt,
} from "../lib/analysis";
import {
  detectStops,
  runTimeForVideo,
  sectorVideoWindows,
  videoTimeForRun,
  type RideWindow,
  type StopAnalysis,
  type VideoSyncSettings,
} from "../lib/videoSync";
import { loadVideoProject, saveVideoProject } from "../lib/videoProjects";
import { readVideoCaptureDate, suggestVideoOffset } from "../lib/videoMetadata";
import { loadCloudVideoProject, saveCloudVideoProject, signedRideVideoUrl, uploadRideVideo } from "../lib/videoCloud";
import { MAX_BELIEVABLE_SPEED_KMH } from "../lib/gpsQuality";
import {
  detectRidingEvents,
  type RidingEvent,
  type RidingEventType,
} from "../lib/ridingEvents";
import { canRenderOverlayWebM, renderOverlayWebM } from "../lib/videoRender";
import { TrailMap } from "./TrailMap";

interface Props {
  data: AppData;
  userId?: string;
  cloudUserId?: string;
}

interface TrimWindow {
  start: number;
  end: number;
}

function clock(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const minutes = Math.floor(safe / 60);
  const remainder = Math.floor(safe - minutes * 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${remainder}`;
}

function fractionAtTime(telemetry: ReturnType<typeof analyze>, elapsed: number) {
  const samples = telemetry.samples;
  if (elapsed <= 0) return 0;
  if (elapsed >= telemetry.duration) return 1;
  for (let i = 1; i < samples.length; i += 1) {
    const a = samples[i - 1];
    const b = samples[i];
    if (elapsed <= b.time) {
      const span = b.time - a.time;
      return span > 0
        ? a.fraction + ((b.fraction - a.fraction) * (elapsed - a.time)) / span
        : b.fraction;
    }
  }
  return 1;
}

function downloadEditPlan(payload: object, filename: string) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function rideWindowLabel(window: RideWindow | null): string {
  if (!window) return "No ride window scanned";
  return `${clock(window.startTime)} → ${clock(window.endTime)}`;
}

const eventLabels: Record<RidingEventType, string> = {
  braking: "Braking",
  acceleration: "Acceleration",
  jump: "Jump / drop",
  pause: "Pause",
  corner: "Corner signal",
};

function eventDetail(event: RidingEvent): string {
  if (event.type === "braking") return `${Math.abs(event.speedChange).toFixed(0)} km/h drop`;
  if (event.type === "acceleration") return `${Math.abs(event.speedChange).toFixed(0)} km/h gain`;
  if (event.type === "jump") return `${Math.abs(event.elevationChange).toFixed(1)} m drop`;
  if (event.type === "corner") return `${Math.round(event.turnAngle ?? 0)}° GPS direction change`;
  return `${(event.endTime - event.startTime).toFixed(1)}s stopped`;
}

export function VideoLab({ data, userId, cloudUserId }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const previousUrl = useRef<string | null>(null);
  const [trailId, setTrailId] = useState(data.trails[0]?.id ?? "");
  const [runId, setRunId] = useState("");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoName, setVideoName] = useState("");
  const [videoCaptureDate, setVideoCaptureDate] = useState<Date | null>(null);
  const [videoMetadataState, setVideoMetadataState] = useState<"idle" | "checking" | "found" | "missing">("idle");
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoTime, setVideoTime] = useState(0);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [videoError, setVideoError] = useState("");
  const [cloudPath, setCloudPath] = useState("");
  const [cloudVideoStatus, setCloudVideoStatus] = useState("");
  const [cloudUploadProgress, setCloudUploadProgress] = useState(0);
  const [offsetSeconds, setOffsetSeconds] = useState(0);
  const [previewRate, setPreviewRate] = useState(1);
  const [progress, setProgress] = useState(0);
  const [selectedSector, setSelectedSector] = useState<number | null>(null);
  const [stopAnalysis, setStopAnalysis] = useState<StopAnalysis | null>(null);
  const [skipStops, setSkipStops] = useState(true);
  const [trim, setTrim] = useState<TrimWindow | null>(null);
  const [anchors, setAnchors] = useState<{ runTime: number; videoTime: number }[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [renderState, setRenderState] = useState<"idle" | "rendering" | "done" | "error">("idle");
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderError, setRenderError] = useState("");
  const overlayExportSupported = canRenderOverlayWebM();
  const renderAbort = useRef<AbortController | null>(null);
  const hydratedProjectRun = useRef<string | null>(null);
  const videoSelectionId = useRef(0);
  const [projectReady, setProjectReady] = useState(false);
  const previousOffset = useRef(offsetSeconds);

  const trail = data.trails.find((item) => item.id === trailId) ?? data.trails[0];
  const runs = useMemo(
    () =>
      data.runs
        .filter((item) => item.trailId === trail?.id)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [data.runs, trail],
  );
  const run = runs.find((item) => item.id === runId) ?? runs[0];
  const current = useMemo(() => (run ? analyze(run.points) : null), [run]);
  const timestampOffsetSuggestion = useMemo(() => {
    if (!run?.points.length || !videoCaptureDate || !current || !videoDuration) return null;
    const suggestion = suggestVideoOffset(run.points[0].time, videoCaptureDate);
    if (suggestion === null || suggestion >= videoDuration || suggestion + current.duration <= 0) return null;
    return suggestion;
  }, [run, videoCaptureDate, videoDuration, current]);
  const pb = useMemo(
    () => personalBest(data.runs, trail?.id ?? ""),
    [data.runs, trail],
  );
  const ghost = useMemo(() => (pb ? analyze(pb.points) : current), [pb, current]);
  const settings: VideoSyncSettings = useMemo(
    () => ({ offsetSeconds, anchors }),
    [offsetSeconds, anchors],
  );
  const windows = useMemo(
    () => (run && trail ? sectorVideoWindows(run, trail, settings) : []),
    [run, trail, settings],
  );
  const splits = useMemo(
    () => (run && trail ? sectorTimes(run, trail) : []),
    [run, trail],
  );
  const ghostSplits = useMemo(
    () => (pb && trail ? sectorTimes(pb, trail) : []),
    [pb, trail],
  );
  const theory = useMemo(
    () => (trail ? theoreticalBest(runs, trail) : null),
    [runs, trail],
  );
  const ridingEvents = useMemo(
    () => (run ? detectRidingEvents(run.points) : []),
    [run],
  );
  const highlightedEvents = useMemo(
    () => [...ridingEvents].sort((a, b) => b.severity - a.severity).slice(0, 8),
    [ridingEvents],
  );
  const runProgressTime = current ? timeAt(current, progress) : 0;

  useEffect(() => {
    return () => {
      if (previousUrl.current) URL.revokeObjectURL(previousUrl.current);
      renderAbort.current?.abort();
    };
  }, []);

  useEffect(() => {
    renderAbort.current?.abort();
    setRunId("");
    setSelectedSector(null);
    setProgress(0);
    setStopAnalysis(null);
    setTrim(null);
    setAnchors([]);
    setSelectedEvent(null);
    setRenderState("idle");
    setRenderProgress(0);
    setRenderError("");
  }, [trailId]);

  useEffect(() => {
    renderAbort.current?.abort();
    setSelectedSector(null);
    setProgress(0);
    setStopAnalysis(null);
    setTrim(null);
    setAnchors([]);
    setSelectedEvent(null);
    setRenderState("idle");
    setRenderProgress(0);
    setRenderError("");
  }, [run?.id]);

  useEffect(() => {
    // A trim window is stored in video coordinates. Changing alignment makes
    // that window stale, so require a fresh ride-window apply.
    if (previousOffset.current !== offsetSeconds) setTrim(null);
    previousOffset.current = offsetSeconds;
  }, [offsetSeconds]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = previewRate;
  }, [previewRate, videoUrl]);

  useEffect(() => {
    if (!run?.id || hydratedProjectRun.current !== run.id) return;
    if (!projectReady) return;
    const project = { videoName, offsetSeconds, previewRate, skipStops, stopAnalysis, trim, anchors, cloudPath: cloudPath || undefined };
    saveVideoProject(run.id, project, userId);
    if (!cloudUserId || !cloudPath) return;
    const timeout = window.setTimeout(() => {
      void saveCloudVideoProject(cloudUserId, run.id, project, cloudPath)
        .then(() => setCloudVideoStatus("Video and sync markers are saved to your private account."))
        .catch((error: unknown) => setCloudVideoStatus(error instanceof Error ? `Cloud project save failed: ${error.message}` : "Cloud project save failed."));
    }, 650);
    return () => window.clearTimeout(timeout);
  }, [run?.id, projectReady, userId, cloudUserId, videoName, offsetSeconds, previewRate, skipStops, stopAnalysis, trim, anchors, cloudPath]);

  useEffect(() => {
    if (!run?.id) return;
    hydratedProjectRun.current = run.id;
    setProjectReady(false);
    setCloudPath("");
    setCloudVideoStatus(cloudUserId ? "Checking private video library…" : "Original clips stay on this device.");
    const localProject = loadVideoProject(run.id, userId);
    let active = true;
    const restore = async () => {
      let saved = localProject;
      let remotePath = localProject?.cloudPath ?? "";
      if (cloudUserId) {
        try {
          const remote = await loadCloudVideoProject(cloudUserId, run.id);
          if (remote) {
            saved = remote;
            remotePath = remote.storagePath;
          }
        } catch (error) {
          if (active) setCloudVideoStatus(error instanceof Error ? `Cloud video library unavailable: ${error.message}` : "Cloud video library unavailable.");
        }
      }
      if (!active) return;
      const savedOffset = saved?.offsetSeconds ?? 0;
      previousOffset.current = savedOffset;
      if (saved?.videoName) setVideoName(saved.videoName);
      setOffsetSeconds(savedOffset);
      setPreviewRate(saved?.previewRate ?? 1);
      setSkipStops(saved?.skipStops ?? true);
      setStopAnalysis(saved?.stopAnalysis ?? null);
      setTrim(saved?.trim ?? null);
      setAnchors(saved?.anchors ?? []);
      setCloudPath(remotePath);
      if (cloudUserId && remotePath && saved?.videoName) {
        try {
          const url = await signedRideVideoUrl(cloudUserId, remotePath);
          if (!active) return;
          setVideoUrl(url);
          setCloudVideoStatus("Private cloud video ready on this device.");
        } catch (error) {
          if (active) setCloudVideoStatus(error instanceof Error ? `Could not open cloud video: ${error.message}` : "Could not open cloud video.");
        }
      } else if (cloudUserId) {
        setCloudVideoStatus("Choose a clip to save it to your private account.");
      }
      setProjectReady(true);
    };
    void restore();
    return () => { active = false; };
  }, [run?.id, userId, cloudUserId]);

  const onVideoTime = () => {
    const video = videoRef.current;
    if (!video || !current) return;
    const nextTime = video.currentTime;
    if (skipStops && stopAnalysis) {
      const stopped = stopAnalysis.stops.find((stop) => {
        const start = videoTimeForRun(stop.startTime, settings);
        const end = videoTimeForRun(stop.endTime, settings);
        return nextTime >= start && nextTime < end - 0.05;
      });
      if (stopped) {
        video.currentTime = videoTimeForRun(stopped.endTime, settings);
        return;
      }
    }
    const nextRunTime = Math.max(0, Math.min(current.duration, runTimeForVideo(nextTime, settings)));
    setVideoTime(nextTime);
    setProgress(fractionAtTime(current, nextRunTime));
  };

  const reportVideoError = () => {
    setVideoPlaying(false);
    setVideoDuration(0);
    setVideoError("This clip could not be decoded in this browser. Try MP4 (H.264), MOV or WebM.");
  };

  const selectVideo = async (file: File | undefined) => {
    if (!file) return;
    const isSavedClip = file.name === videoName;
    const selectionId = ++videoSelectionId.current;
    setVideoCaptureDate(null);
    setVideoMetadataState("checking");
    void readVideoCaptureDate(file).then((captureDate) => {
      if (selectionId !== videoSelectionId.current) return;
      setVideoCaptureDate(captureDate);
      setVideoMetadataState(captureDate ? "found" : "missing");
    });
    renderAbort.current?.abort();
    if (previousUrl.current) URL.revokeObjectURL(previousUrl.current);
    const nextUrl = URL.createObjectURL(file);
    previousUrl.current = nextUrl;
    setVideoUrl(nextUrl);
    setVideoName(file.name);
    setVideoTime(0);
    setVideoDuration(0);
    setVideoPlaying(false);
    setVideoError("");
    setTrim(null);
    setCloudPath("");
    setCloudVideoStatus(cloudUserId ? "Uploading private video…" : "Original clip stays on this device.");
    setCloudUploadProgress(0);
    // Object URLs cannot survive a refresh, but the sync plan can. Keep the
    // calibration when the rider re-attaches the same DJI Mimo export and
    // clear it when they choose a replacement clip.
    if (!isSavedClip) setAnchors([]);
    setRenderState("idle");
    setRenderProgress(0);
    setRenderError("");
    if (cloudUserId && run?.id) {
      try {
        const path = await uploadRideVideo(cloudUserId, run.id, file, (fraction) => {
          setCloudUploadProgress(fraction);
          setCloudVideoStatus(`Uploading private video · ${Math.round(fraction * 100)}%`);
        });
        setCloudPath(path);
        setCloudUploadProgress(1);
        setCloudVideoStatus("Video uploaded securely. Saving its sync markers…");
      } catch (error) {
        setCloudVideoStatus(error instanceof Error ? `Video stays on this device: ${error.message}` : "Video stays on this device; upload failed.");
      }
    } else if (cloudUserId) {
      setCloudVideoStatus("Select a run before uploading its video to your account.");
    }
  };

  const seekVideo = (nextTime: number) => {
    const safe = Math.max(0, Math.min(videoDuration || Number.MAX_SAFE_INTEGER, nextTime));
    if (videoRef.current) videoRef.current.currentTime = safe;
    setVideoTime(safe);
    onVideoTime();
  };

  const applyTimestampSuggestion = () => {
    if (timestampOffsetSuggestion === null || !current || !videoDuration) return;
    const nextOffset = timestampOffsetSuggestion;
    const nextVideoTime = Math.max(0, Math.min(videoDuration, nextOffset));
    setAnchors([]);
    setOffsetSeconds(nextOffset);
    if (videoRef.current) videoRef.current.currentTime = nextVideoTime;
    setVideoTime(nextVideoTime);
    setProgress(fractionAtTime(current, Math.max(0, runTimeForVideo(nextVideoTime, { offsetSeconds: nextOffset }))));
  };

  const setRunStartAtPlayhead = () => {
    const finish = anchors.find((anchor) => anchor.runTime > 0);
    if (finish && videoTime >= finish.videoTime) return;
    setOffsetSeconds(videoTime);
    setAnchors((currentAnchors) => currentAnchors.filter((anchor) => anchor.runTime !== 0).concat({ runTime: 0, videoTime }).sort((a, b) => a.runTime - b.runTime));
    setProgress(0);
  };

  const setRunFinishAtPlayhead = () => {
    if (!videoDuration || !current) return;
    const start = anchors.find((anchor) => anchor.runTime === 0);
    if (start && videoTime <= start.videoTime) return;
    setAnchors((currentAnchors) => {
      const next = currentAnchors.filter((anchor) => anchor.runTime !== current.duration);
      return [...next, { runTime: current.duration, videoTime }].sort((a, b) => a.runTime - b.runTime);
    });
  };

  const resetAnchors = () => setAnchors([]);

  const changeOffset = (value: number) => {
    const nextOffset = Number.isFinite(value) ? value : 0;
    setAnchors((currentAnchors) => {
      // A negative offset means GPS recording started before the camera. A GPS
      // start anchor cannot live before video time zero, so let the offset map it.
      if (nextOffset < 0) return [];
      const start = currentAnchors.find((anchor) => anchor.runTime === 0);
      // A finish-only marker has no stable baseline for an offset edit. Clear
      // it so the newly entered offset becomes the active mapping instead of
      // leaving the field looking editable while having no effect.
      if (!start) return currentAnchors.length ? [] : currentAnchors;
      const delta = nextOffset - start.videoTime;
      return currentAnchors.map((anchor) => ({
        ...anchor,
        videoTime: Math.max(0, anchor.videoTime + delta),
      }));
    });
    setOffsetSeconds(nextOffset);
  };

  const scanStops = () => {
    if (!run) return;
    const analysis = detectStops(run.points, {
      speedThresholdKmh: 2,
      minDurationSeconds: 3,
    });
    setStopAnalysis(analysis);
  };

  const applyRideWindow = () => {
    if (!stopAnalysis || !videoDuration) return;
    const start = videoTimeForRun(stopAnalysis.rideWindow.startTime, settings);
    const end = videoTimeForRun(stopAnalysis.rideWindow.endTime, settings);
    setTrim({
      start: Math.max(0, Math.min(videoDuration, start)),
      end: Math.max(0, Math.min(videoDuration, end)),
    });
  };

  const inspectSector = (index: number) => {
    setSelectedSector(index);
    const window = windows[index];
    if (window && videoUrl) seekVideo(window.videoStartTime);
    if (window && current) setProgress(fractionAtTime(current, window.runStartTime));
  };

  const inspectEvent = (event: RidingEvent) => {
    setSelectedEvent(event.id);
    if (!current) return;
    setProgress(fractionAtTime(current, event.startTime));
    if (videoUrl && videoDuration) seekVideo(videoTimeForRun(event.startTime, settings));
  };

  const exportOverlay = async () => {
    if (!videoRef.current || !videoDuration || !current || !ghost || !run || !trail) return;
    const controller = new AbortController();
    renderAbort.current = controller;
    setRenderState("rendering");
    setRenderProgress(0);
    setRenderError("");
    const start = trim?.start ?? 0;
    const end = trim?.end ?? videoDuration;
    try {
      const blob = await renderOverlayWebM({
        video: videoRef.current,
        startTime: start,
        endTime: end,
        signal: controller.signal,
        onProgress: setRenderProgress,
        drawOverlay: (context, frame) => {
          const runSeconds = Math.max(0, Math.min(current.duration, runTimeForVideo(frame.currentTime, settings)));
          const fraction = fractionAtTime(current, runSeconds);
          const sample = current.samples.reduce((closest, next) =>
            Math.abs(next.fraction - fraction) < Math.abs(closest.fraction - fraction) ? next : closest,
          );
          const sectorIndex = windows.findIndex((window) => runSeconds >= window.runStartTime && runSeconds <= window.runEndTime);
          const delta = sectorIndex >= 0 ? splits[sectorIndex] - (ghostSplits[sectorIndex] ?? splits[sectorIndex]) : 0;
          const sectorLabel = sectorIndex >= 0 ? `S${sectorIndex + 1} · ${windows[sectorIndex].name}` : "RUN REVIEW";
          const panelHeight = Math.max(62, Math.round(frame.height * 0.12));
          context.fillStyle = "rgba(10, 14, 10, 0.78)";
          context.fillRect(0, 0, frame.width, panelHeight);
          context.fillStyle = "#d5f55a";
          context.font = `600 ${Math.max(16, Math.round(frame.width / 62))}px Barlow, sans-serif`;
          context.fillText("GHOSTLINE", Math.round(frame.width * 0.025), Math.round(panelHeight * 0.38));
          context.fillStyle = "#f0f2e9";
          context.font = `${Math.max(12, Math.round(frame.width / 84))}px Barlow, sans-serif`;
          context.fillText(`${trail.name}  ·  ${sectorLabel}`, Math.round(frame.width * 0.025), Math.round(panelHeight * 0.68));
          context.textAlign = "right";
          context.fillStyle = "#f0f2e9";
          context.font = `500 ${Math.max(14, Math.round(frame.width / 70))}px "IBM Plex Mono", monospace`;
          context.fillText(`${clock(runSeconds)}  ${sample.speed.toFixed(1)} km/h`, frame.width - Math.round(frame.width * 0.025), Math.round(panelHeight * 0.42));
          context.fillStyle = delta > 0.005 ? "#f19784" : "#9edfc0";
          context.font = `${Math.max(11, Math.round(frame.width / 92))}px "IBM Plex Mono", monospace`;
          context.fillText(`${formatDelta(delta)} vs Ghost`, frame.width - Math.round(frame.width * 0.025), Math.round(panelHeight * 0.72));
          context.textAlign = "left";

          const mapWidth = Math.max(92, Math.round(frame.width * 0.13));
          const mapHeight = Math.round(mapWidth * 0.68);
          const mapX = frame.width - mapWidth - Math.round(frame.width * 0.025);
          const mapY = panelHeight + Math.round(frame.height * 0.025);
          const mapPad = Math.max(9, Math.round(mapWidth * 0.08));
          const trace = current.samples;
          const all = [...trace, ...ghost.samples];
          const minLat = Math.min(...all.map((point) => point.lat));
          const maxLat = Math.max(...all.map((point) => point.lat));
          const minLon = Math.min(...all.map((point) => point.lon));
          const maxLon = Math.max(...all.map((point) => point.lon));
          const latSpan = Math.max(0.000001, maxLat - minLat);
          const lonSpan = Math.max(0.000001, maxLon - minLon);
          const project = (point: { lat: number; lon: number }) => ({
            x: mapX + mapPad + ((point.lon - minLon) / lonSpan) * (mapWidth - mapPad * 2),
            y: mapY + mapPad + ((maxLat - point.lat) / latSpan) * (mapHeight - mapPad * 2),
          });
          context.fillStyle = "rgba(10, 14, 10, 0.82)";
          context.fillRect(mapX, mapY, mapWidth, mapHeight);
          context.lineWidth = Math.max(2, Math.round(frame.width / 850));
          context.lineCap = "round";
          context.lineJoin = "round";
          context.setLineDash([context.lineWidth * 2, context.lineWidth * 2]);
          context.strokeStyle = "rgba(220, 231, 217, 0.75)";
          context.beginPath();
          ghost.samples.forEach((point, index) => {
            const position = project(point);
            if (!index) context.moveTo(position.x, position.y);
            else context.lineTo(position.x, position.y);
          });
          context.stroke();
          context.setLineDash([]);
          context.strokeStyle = "#d5f55a";
          context.beginPath();
          trace.forEach((point, index) => {
            const position = project(point);
            if (!index) context.moveTo(position.x, position.y);
            else context.lineTo(position.x, position.y);
          });
          context.stroke();
          const mapMarker = project(sample);
          context.fillStyle = "#d5f55a";
          context.beginPath();
          context.arc(mapMarker.x, mapMarker.y, Math.max(3, mapWidth * 0.025), 0, Math.PI * 2);
          context.fill();
        },
      });
      downloadBlob(blob, `${run.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "run"}-ghostline.webm`);
      setRenderState("done");
      setRenderProgress(1);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setRenderState("idle");
        setRenderProgress(0);
      } else {
        setRenderState("error");
        setRenderError(error instanceof Error ? error.message : "The overlay video could not be exported.");
      }
    } finally {
      renderAbort.current = null;
    }
  };

  const exportPlan = () => {
    if (!run || !trail) return;
    downloadEditPlan(
      {
        format: "ghostline-video-edit-plan",
        version: 1,
        video: videoName || null,
        trail: { id: trail.id, name: trail.name, location: trail.location },
        run: { id: run.id, name: run.name, date: run.date },
        sync: settings,
        trim,
        detectedStops: stopAnalysis?.stops ?? [],
        ridingEvents,
        sectors: windows.map((window, index) => ({
          ...window,
          bestSector: theory?.sectors[index]?.runId === run.id,
          deltaToGhost: splits[index] - (ghostSplits[index] ?? splits[index]),
        })),
      },
      `${run.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "run"}-edit-plan.json`,
    );
  };

  return (
    <>
      <div className="page-heading video-heading">
        <div>
          <h1>Line up the ride.</h1>
          <p>Sync DJI Mimo footage to your Ghost and see where the seconds moved.</p>
        </div>
        <span className="demo-label">
          <Clapperboard size={13} />
          VIDEO LAB <i />
        </span>
      </div>

      <section className="video-setup panel">
        <div className="video-setup-head">
          <div>
            <span className="eyebrow"><Sparkles size={13} /> {cloudUserId ? "PRIVATE CLOUD WORKFLOW" : "LOCAL WORKFLOW"}</span>
            <h2>Choose a ride to sync</h2>
            <p>{cloudUserId ? "Upload private clips and their sync markers to your account, then open them on another device." : "Choose a clip from Photos or Files. Your original and sync plan stay on this device."}</p>
          </div>
          <label className="button secondary video-file-button">
            <Upload size={16} />
            {videoUrl ? "Replace video" : "Choose video"}
            <input
              aria-label="Choose video file"
              type="file"
              accept="video/mp4,video/quicktime,video/webm,video/*"
              onChange={(event) => { void selectVideo(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }}
            />
          </label>
        </div>
        <div className="video-select-grid">
          <label className="field">
            Trail
            <select aria-label="Video trail" value={trail?.id ?? ""} onChange={(event) => setTrailId(event.target.value)}>
              {data.trails.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="field">
            Run to follow
            <select aria-label="Video run" value={run?.id ?? ""} onChange={(event) => setRunId(event.target.value)}>
              {runs.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <div className="video-run-facts">
            <span><Timer size={14} /> {current ? formatTime(current.duration) : "—"}</span>
            <span><MapPin size={14} /> {trail?.location ?? "No trail"}</span>
          </div>
        </div>
        <p className={`video-cloud-status ${cloudPath ? "saved" : ""}`} role="status">{cloudVideoStatus}</p>
        {cloudUserId && cloudUploadProgress > 0 && cloudUploadProgress < 1 && (
          <progress className="video-cloud-progress" max="1" value={cloudUploadProgress} aria-label="Video upload progress" />
        )}
      </section>

      {!videoUrl ? (
        <section className="video-empty panel">
          <div className="video-empty-icon"><Film size={29} /></div>
          <div>
            <h2>{videoName ? "Pick up your synced run." : "Drop in your ride footage."}</h2>
            <p>{videoName ? cloudPath ? `Your private ${videoName} is ready to open on this device.` : `Your ${videoName} sync settings are saved on this device. Re-select the original file to continue.` : "MP4, MOV or WebM works in the browser. Import your DJI Mimo export, then set the GPS start point once."}</p>
          </div>
          <label className="button primary video-file-button">
            <Camera size={16} /> Choose video
            <input aria-label="Choose video file" type="file" accept="video/mp4,video/quicktime,video/webm,video/*" onChange={(event) => { void selectVideo(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} />
          </label>
        </section>
      ) : (
        <>
          <section className="video-stage-grid">
            <div className="video-player-panel panel">
              <div className="video-player-wrap">
                <video
                  ref={videoRef}
                  src={videoUrl}
                  controls
                  onLoadedMetadata={(event) => {
                    const duration = event.currentTarget.duration;
                    if (Number.isFinite(duration) && duration > 0) {
                      setVideoDuration(duration);
                      setVideoError("");
                    } else {
                      reportVideoError();
                    }
                  }}
                  onError={reportVideoError}
                  onTimeUpdate={onVideoTime}
                  onPlay={() => setVideoPlaying(true)}
                  onPause={() => setVideoPlaying(false)}
                  preload="metadata"
                />
                <span className="video-badge"><Camera size={13} /> {videoName}</span>
              </div>
              {videoError && <p className="error-line video-error"><Camera size={14} /> {videoError}</p>}
              <div className="video-controls">
                <button className="icon-button" disabled={!videoDuration} aria-label={videoPlaying ? "Pause video" : "Play video"} onClick={() => { if (!videoRef.current) return; if (videoRef.current.paused) void videoRef.current.play().catch(reportVideoError); else videoRef.current.pause(); }}>
                  {videoPlaying ? <Pause size={16} /> : <Play size={16} />}
                </button>
                <span className="mono">{clock(videoTime)}</span>
                <input aria-label="Video timeline" disabled={!videoDuration} type="range" min="0" max={videoDuration || 0} step="0.01" value={Math.min(videoDuration || 0, videoTime)} onChange={(event) => seekVideo(Number(event.target.value))} />
                <span className="mono">{clock(videoDuration)}</span>
              </div>
              <div className="video-progress-line"><i style={{ width: `${progress * 100}%` }} /></div>
              <div className="video-player-meta">
                <span><Gauge size={14} /> {(() => {
                  const sample = current?.samples.find((item) => Math.abs(item.fraction - progress) < 0.02);
                  if (!sample) return "—";
                  return sample.speed > MAX_BELIEVABLE_SPEED_KMH ? "GPS review" : `${sample.speed.toFixed(1)} km/h`;
                })()}</span>
                <span className="mono">GPS {formatTime(runProgressTime)}</span>
                <span>{trail?.name}</span>
              </div>
            </div>
            <div className="video-map-panel">
              {trail && current && ghost ? <TrailMap trail={trail} current={current} ghost={ghost} progress={progress} sector={selectedSector} onProgress={(value) => { setProgress(value); const next = videoTimeForRun(timeAt(current, value), settings); if (videoUrl) seekVideo(next); }} /> : <div className="panel video-map-empty">Select a run to show its GPS trace.</div>}
            </div>
          </section>

          <section className="sync-controls panel">
            <div className="section-heading">
              <div><span className="eyebrow"><SlidersHorizontal size={13} /> ALIGNMENT</span><h2>Make the clocks agree</h2></div>
              <span className="sync-status"><Check size={13} /> Local sync</span>
            </div>
            <div className="sync-grid">
              <label className="field"><span>GPS start in video (s)</span><input aria-label="GPS start offset" type="number" step="0.1" value={offsetSeconds} onChange={(event) => changeOffset(Number(event.target.value))} /></label>
              <label className="field"><span>Preview speed</span><select aria-label="Video playback rate" value={previewRate} onChange={(event) => setPreviewRate(Number(event.target.value))}><option value="1">1× real time</option><option value="0.5">0.5× slow motion</option><option value="2">2× analysis</option></select></label>
              <button className="button secondary sync-action" onClick={setRunStartAtPlayhead}><Target size={15} /> Set run start at playhead</button>
            </div>
            {videoMetadataState === "checking" && <p className="sync-metadata-note" role="status">Checking the clip for its recording timestamp…</p>}
            {videoMetadataState === "missing" && videoUrl && <p className="sync-metadata-note" role="status">No recording timestamp found in this clip. You can still line it up with the start and finish markers below.</p>}
            {videoCaptureDate && <div className="sync-suggestion" role="status">
              <div><strong><Sparkles size={14} /> Recording timestamp found</strong><span>{videoCaptureDate.toLocaleString()} · compare it with the GPS start before applying.</span><small>Camera clock or time-zone differences can affect this estimate.</small></div>
              {timestampOffsetSuggestion !== null ? <button className="button secondary" onClick={applyTimestampSuggestion}>Use {timestampOffsetSuggestion > 0 ? "+" : ""}{timestampOffsetSuggestion.toFixed(1)}s suggestion</button> : <span className="muted">No close timestamp match for this GPS run; align manually.</span>}
            </div>}
            <div className="sync-anchors">
              <div><strong>Two point sync</strong><span className="muted">{anchors.length ? `${anchors.length} anchor${anchors.length === 1 ? "" : "s"} · ${anchors.map((anchor) => `${anchor.runTime === 0 ? "start" : "finish"} ${clock(anchor.videoTime)}`).join(" · ")}` : "Optional: lock both ends of the run to the video."}</span></div>
              <div className="sync-anchor-actions"><button className="button secondary" onClick={setRunStartAtPlayhead}><Target size={14} /> Mark start</button><button className="button secondary" disabled={!videoDuration} onClick={setRunFinishAtPlayhead}><Target size={14} /> Mark finish</button><button className="text-button" disabled={!anchors.length} onClick={resetAnchors}>Reset anchors</button></div>
            </div>
            <p className="sync-help">Scrub to the moment the bike leaves the start, then set it as the GPS start. With two anchors active, changing the offset shifts both markers together.</p>
          </section>

          <div className="video-tools-grid">
            <section className="panel trim-panel">
              <div className="section-heading"><div><span className="eyebrow"><Scissors size={13} /> CLEAN THE TAKE</span><h2>Trim the stops</h2></div><span className="muted">GPS assisted</span></div>
              <p>Find pauses in the FIT/GPX signal, keep the descent window and carry every cut into the edit plan.</p>
              <div className="trim-actions"><button className="button secondary" onClick={scanStops}><Gauge size={15} /> Scan GPS stops</button><button className="button secondary" disabled={!stopAnalysis} onClick={() => setSkipStops(!skipStops)}><Scissors size={15} /> {skipStops ? "Stops skipped in preview" : "Play stops in preview"}</button><button className="button primary" disabled={!stopAnalysis || !videoDuration} onClick={applyRideWindow}>Apply ride window</button></div>
              <div className="trim-readout"><span>Ride window</span><strong className="mono">{rideWindowLabel(stopAnalysis?.rideWindow ?? null)}</strong></div>
              {stopAnalysis && <div className="stop-list">{stopAnalysis.stops.length ? stopAnalysis.stops.map((stop) => <div key={`${stop.startTime}-${stop.endTime}`}><span className="mono">{clock(stop.startTime)}–{clock(stop.endTime)}</span><strong>{stop.duration.toFixed(1)}s stop</strong></div>) : <span className="muted">No pauses over 3 seconds found.</span>}</div>}
              {trim && <div className="trim-applied"><Check size={14} /> Output window {clock(trim.start)} → {clock(trim.end)}</div>}
            </section>
            <section className="panel export-panel">
              <div className="section-heading"><div><span className="eyebrow"><Download size={13} /> TAKE IT FURTHER</span><h2>Export an edit plan</h2></div></div>
              <p>Render a shareable overlay locally, or send the precise cuts and sector windows to your desktop editor.</p>
              <div className="export-actions">
                <button className="button primary" disabled={!videoDuration || !overlayExportSupported || renderState === "rendering"} onClick={() => void exportOverlay()}><Film size={15} /> {renderState === "rendering" ? `Rendering ${Math.round(renderProgress * 100)}%` : "Export overlay WebM"}</button>
                <button className="button secondary" disabled={!videoDuration || renderState === "rendering"} onClick={exportPlan}><Download size={15} /> Download edit plan</button>
              </div>
              {renderState === "rendering" && <div className="render-progress"><progress max="1" value={renderProgress} /><button className="text-button" onClick={() => renderAbort.current?.abort()}>Cancel render</button></div>}
              {renderState === "done" && <span className="render-success"><Check size={14} /> Overlay clip downloaded</span>}
              {renderError && <p className="error-line render-error"><Camera size={14} /> {renderError}</p>}
              <span className="muted export-note">{overlayExportSupported ? "WebM overlay keeps the source local; MP4 rendering can use the same frame plan later." : "This device cannot render WebM in-browser. Download the edit plan and render it in a desktop editor."}</span>
            </section>
          </div>

          <section className="panel sector-video-panel">
            <div className="section-heading"><div><span className="eyebrow"><MapPin size={13} /> TELEMETRY CUTS</span><h2>Jump to the seconds that matter</h2></div><span className="muted">{windows.length} sectors · Ghost aligned</span></div>
            <div className="sector-video-grid">
              {windows.map((window, index) => {
                const delta = splits[index] - (ghostSplits[index] ?? splits[index]);
                const best = theory?.sectors[index]?.runId === run?.id;
                return <button key={window.index} className={`sector-video-row ${selectedSector === index ? "selected" : ""}`} onClick={() => inspectSector(index)}><span className="sector-video-index">S{index + 1}</span><span className="sector-video-name">{window.name}<small>{clock(window.videoStartTime)} → {clock(window.videoEndTime)}</small></span><span className="sector-video-time mono">{formatTime(window.duration)}</span><strong className={delta > 0.005 ? "lost" : "gained"}>{formatDelta(delta)}</strong>{best && <span className="sector-video-best">BEST</span>}</button>;
              })}
            </div>
          </section>

          <section className="panel riding-events-panel">
            <div className="section-heading">
              <div><span className="eyebrow"><Zap size={13} /> RIDE INTELLIGENCE</span><h2>Signals worth reviewing</h2></div>
              <span className="muted">GPS assisted · {ridingEvents.length} found</span>
            </div>
            <p className="riding-events-help">Local telemetry highlights braking, acceleration, pauses and drop-like elevation changes. Jump to a signal to review it against the Ghost.</p>
            {highlightedEvents.length ? (
              <div className="riding-events-list">
                {highlightedEvents.map((event) => (
                  <button
                    key={event.id}
                    className={`riding-event-row event-${event.type} ${selectedEvent === event.id ? "selected" : ""}`}
                    disabled={!videoUrl || !videoDuration}
                    onClick={() => inspectEvent(event)}
                  >
                    <span className="riding-event-time mono">{clock(event.startTime)}</span>
                    <span className="riding-event-kind"><strong>{eventLabels[event.type]}</strong><small>{eventDetail(event)}</small></span>
                    <span className="riding-event-confidence">{Math.round(event.confidence * 100)}% <small>confidence</small></span>
                    <span className="riding-event-action">{videoUrl && videoDuration ? "Review" : "Upload video"}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="riding-events-empty">No strong riding signals found in this run. GPS data stays untouched and private.</div>
            )}
          </section>
        </>
      )}

      <section className="video-ai-note panel">
        <div className="video-ai-icon"><Sparkles size={18} /></div>
        <div><h2>AI-ready by design.</h2><p>The sync layer is deterministic and private today. It leaves clean frame timestamps for the next step: a browser or server model can label jumps, braking and line choices without changing the rider workflow.</p></div>
        <span className="muted"><Check size={13} /> FIT + GPX aligned</span>
      </section>
    </>
  );
}
