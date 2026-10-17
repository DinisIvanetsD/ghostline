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
  splitLeadIn,
  theoreticalBest,
  timeAt,
} from "../lib/analysis";
import { pickHighlights } from "../lib/highlights";
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
  if (!window) return "Janela da run ainda por analisar";
  return `${clock(window.startTime)} → ${clock(window.endTime)}`;
}

const eventLabels: Record<RidingEventType, string> = {
  braking: "Travagem",
  acceleration: "Aceleração",
  jump: "Salto / drop",
  pause: "Pausa",
  corner: "Curva",
};

function eventDetail(event: RidingEvent): string {
  if (event.type === "braking") return `−${Math.abs(event.speedChange).toFixed(0)} km/h`;
  if (event.type === "acceleration") return `+${Math.abs(event.speedChange).toFixed(0)} km/h`;
  if (event.type === "jump") return `${Math.abs(event.elevationChange).toFixed(1)} m de queda`;
  if (event.type === "corner") return `${Math.round(event.turnAngle ?? 0)}° de mudança de direção no GPS`;
  return `${(event.endTime - event.startTime).toFixed(1)}s parado`;
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
    () => personalBest(data.runs, trail?.id ?? "", trail),
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
  const reelCuts = useMemo(
    () =>
      videoDuration
        ? pickHighlights(
            windows,
            splits,
            ghostSplits,
            windows.map((_, index) => theory?.sectors[index]?.runId === run?.id),
            { videoDuration },
          )
        : [],
    [windows, splits, ghostSplits, theory, run, videoDuration],
  );

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
        .then(() => setCloudVideoStatus("O vídeo e os marcadores estão guardados na tua conta privada."))
        .catch((error: unknown) => setCloudVideoStatus(error instanceof Error ? `Falhou a gravação na nuvem: ${error.message}` : "Falhou a gravação na nuvem."));
    }, 650);
    return () => window.clearTimeout(timeout);
  }, [run?.id, projectReady, userId, cloudUserId, videoName, offsetSeconds, previewRate, skipStops, stopAnalysis, trim, anchors, cloudPath]);

  useEffect(() => {
    if (!run?.id) return;
    hydratedProjectRun.current = run.id;
    setProjectReady(false);
    setCloudPath("");
    setCloudVideoStatus(cloudUserId ? "A verificar a biblioteca privada de vídeos…" : "Os vídeos originais ficam neste dispositivo.");
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
          if (active) setCloudVideoStatus(error instanceof Error ? `Biblioteca de vídeos indisponível: ${error.message}` : "Biblioteca de vídeos indisponível.");
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
          setCloudVideoStatus("Vídeo privado pronto neste dispositivo.");
        } catch (error) {
          if (active) setCloudVideoStatus(error instanceof Error ? `Não foi possível abrir o vídeo: ${error.message}` : "Não foi possível abrir o vídeo.");
        }
      } else if (cloudUserId) {
        setCloudVideoStatus("Escolhe um vídeo para o guardares na tua conta privada.");
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
    setVideoError("Este browser não consegue ler este vídeo. Experimenta MP4 (H.264), MOV ou WebM.");
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
    setCloudVideoStatus(cloudUserId ? "A enviar vídeo privado…" : "O vídeo original fica neste dispositivo.");
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
          setCloudVideoStatus(`A enviar vídeo privado · ${Math.round(fraction * 100)}%`);
        });
        setCloudPath(path);
        setCloudUploadProgress(1);
        setCloudVideoStatus("Vídeo enviado em segurança. A guardar os marcadores…");
      } catch (error) {
        setCloudVideoStatus(error instanceof Error ? `O vídeo fica neste dispositivo: ${error.message}` : "O vídeo fica neste dispositivo; o envio falhou.");
      }
    } else if (cloudUserId) {
      setCloudVideoStatus("Escolhe uma run antes de enviar o vídeo para a tua conta.");
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

  const exportOverlay = async (reel = false) => {
    if (!videoRef.current || !videoDuration || !current || !ghost || !run || !trail) return;
    const highlights = reel ? reelCuts : [];
    if (reel && !highlights.length) return;
    const controller = new AbortController();
    renderAbort.current = controller;
    setRenderState("rendering");
    setRenderProgress(0);
    setRenderError("");
    const start = trim?.start ?? 0;
    const end = trim?.end ?? videoDuration;
    // Ghost position follows course time, so a Bonus Spot lead-in on either
    // run does not push the Ghost ahead or behind.
    const runLeadIn = splitLeadIn(run, trail).leadIn ?? 0;
    const ghostLeadIn = pb ? (splitLeadIn(pb, trail).leadIn ?? 0) : 0;
    try {
      const blob = await renderOverlayWebM({
        video: videoRef.current,
        startTime: start,
        endTime: end,
        segments: reel ? highlights : undefined,
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
          const sectorLabel = sectorIndex >= 0 ? `S${sectorIndex + 1} · ${windows[sectorIndex].name}` : "REVISÃO DA RUN";
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
          const ghostElapsed = runSeconds - runLeadIn + ghostLeadIn;
          const ghostSample = ghost.samples.reduce((closest, next) =>
            Math.abs(next.time - ghostElapsed) < Math.abs(closest.time - ghostElapsed) ? next : closest,
          );
          const ghostMarker = project(ghostSample);
          context.strokeStyle = "#e2e8dd";
          context.fillStyle = "#5b6851";
          context.lineWidth = Math.max(1.5, mapWidth * 0.012);
          context.beginPath();
          context.arc(ghostMarker.x, ghostMarker.y, Math.max(3, mapWidth * 0.025), 0, Math.PI * 2);
          context.fill();
          context.stroke();
          const mapMarker = project(sample);
          context.fillStyle = "#d5f55a";
          context.beginPath();
          context.arc(mapMarker.x, mapMarker.y, Math.max(3, mapWidth * 0.025), 0, Math.PI * 2);
          context.fill();
          // Highlight reels open each cut with a short sector title card.
          const cut = highlights[frame.segmentIndex];
          if (cut && frame.segmentTime < 1.8) {
            const alpha = Math.min(1, (1.8 - frame.segmentTime) / 0.4);
            const cardHeight = Math.round(frame.height * 0.16);
            const cardY = Math.round(frame.height * 0.62);
            context.globalAlpha = alpha;
            context.fillStyle = "rgba(10, 14, 10, 0.86)";
            context.fillRect(0, cardY, frame.width, cardHeight);
            context.fillStyle = "#d5f55a";
            context.font = `700 ${Math.max(20, Math.round(frame.width / 30))}px "Barlow Condensed", Barlow, sans-serif`;
            context.fillText(`S${cut.index + 1} · ${cut.name}`, Math.round(frame.width * 0.04), cardY + Math.round(cardHeight * 0.5));
            context.fillStyle = cut.delta > 0.005 ? "#f19784" : "#9edfc0";
            context.font = `500 ${Math.max(13, Math.round(frame.width / 64))}px "IBM Plex Mono", monospace`;
            context.fillText(
              `${formatDelta(cut.delta)} vs Ghost${cut.best ? "  ·  MELHOR SETOR" : ""}`,
              Math.round(frame.width * 0.04),
              cardY + Math.round(cardHeight * 0.8),
            );
            context.globalAlpha = 1;
          }
        },
      });
      downloadBlob(blob, `${run.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "run"}-${reel ? "highlights" : "ghostline"}.webm`);
      setRenderState("done");
      setRenderProgress(1);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setRenderState("idle");
        setRenderProgress(0);
      } else {
        setRenderState("error");
        setRenderError(error instanceof Error ? error.message : "Não foi possível exportar o vídeo.");
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
          <h1>Alinha a run.</h1>
          <p>Sincroniza o vídeo do DJI Mimo com o teu Ghost e vê onde os segundos fugiram.</p>
        </div>
        <span className="demo-label">
          <Clapperboard size={13} />
          LABORATÓRIO DE VÍDEO <i />
        </span>
      </div>

      <section className="video-setup panel">
        <div className="video-setup-head">
          <div>
            <span className="eyebrow"><Sparkles size={13} /> {cloudUserId ? "NUVEM PRIVADA" : "NESTE DISPOSITIVO"}</span>
            <h2>Escolhe a run a sincronizar</h2>
            <p>{cloudUserId ? "Envia vídeos privados e os marcadores para a tua conta e abre-os noutro dispositivo." : "Escolhe um vídeo das Fotos ou dos Ficheiros. O original e a sincronização ficam neste dispositivo."}</p>
          </div>
          <label className="button secondary video-file-button">
            <Upload size={16} />
            {videoUrl ? "Trocar vídeo" : "Escolher vídeo"}
            <input
              aria-label="Escolher ficheiro de vídeo"
              type="file"
              accept="video/mp4,video/quicktime,video/webm,video/*"
              onChange={(event) => { void selectVideo(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }}
            />
          </label>
        </div>
        <div className="video-select-grid">
          <label className="field">
            Pista
            <select aria-label="Pista do vídeo" value={trail?.id ?? ""} onChange={(event) => setTrailId(event.target.value)}>
              {data.trails.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="field">
            Run a seguir
            <select aria-label="Run do vídeo" value={run?.id ?? ""} onChange={(event) => setRunId(event.target.value)}>
              {runs.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <div className="video-run-facts">
            <span><Timer size={14} /> {current ? formatTime(current.duration) : "—"}</span>
            <span><MapPin size={14} /> {trail?.location ?? "Sem pista"}</span>
          </div>
        </div>
        <p className={`video-cloud-status ${cloudPath ? "saved" : ""}`} role="status">{cloudVideoStatus}</p>
        {cloudUserId && cloudUploadProgress > 0 && cloudUploadProgress < 1 && (
          <progress className="video-cloud-progress" max="1" value={cloudUploadProgress} aria-label="Progresso do envio" />
        )}
      </section>

      {!videoUrl ? (
        <section className="video-empty panel">
          <div className="video-empty-icon"><Film size={29} /></div>
          <div>
            <h2>{videoName ? "Continua a tua run sincronizada." : "Junta o vídeo da tua run."}</h2>
            <p>{videoName ? cloudPath ? `O teu vídeo privado ${videoName} está pronto a abrir neste dispositivo.` : `A sincronização de ${videoName} está guardada neste dispositivo. Escolhe outra vez o ficheiro original para continuar.` : "MP4, MOV ou WebM funcionam no browser. Importa o vídeo do DJI Mimo e marca uma vez a partida do GPS."}</p>
          </div>
          <label className="button primary video-file-button">
            <Camera size={16} /> Escolher vídeo
            <input aria-label="Escolher ficheiro de vídeo" type="file" accept="video/mp4,video/quicktime,video/webm,video/*" onChange={(event) => { void selectVideo(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} />
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
                <button className="icon-button" disabled={!videoDuration} aria-label={videoPlaying ? "Pausar vídeo" : "Reproduzir vídeo"} onClick={() => { if (!videoRef.current) return; if (videoRef.current.paused) void videoRef.current.play().catch(reportVideoError); else videoRef.current.pause(); }}>
                  {videoPlaying ? <Pause size={16} /> : <Play size={16} />}
                </button>
                <span className="mono">{clock(videoTime)}</span>
                <input aria-label="Linha do tempo do vídeo" disabled={!videoDuration} type="range" min="0" max={videoDuration || 0} step="0.01" value={Math.min(videoDuration || 0, videoTime)} onChange={(event) => seekVideo(Number(event.target.value))} />
                <span className="mono">{clock(videoDuration)}</span>
              </div>
              <div className="video-progress-line"><i style={{ width: `${progress * 100}%` }} /></div>
              <div className="video-player-meta">
                <span><Gauge size={14} /> {(() => {
                  const sample = current?.samples.find((item) => Math.abs(item.fraction - progress) < 0.02);
                  if (!sample) return "—";
                  return sample.speed > MAX_BELIEVABLE_SPEED_KMH ? "Rever GPS" : `${sample.speed.toFixed(1)} km/h`;
                })()}</span>
                <span className="mono">GPS {formatTime(runProgressTime)}</span>
                <span>{trail?.name}</span>
              </div>
            </div>
            <div className="video-map-panel">
              {trail && current && ghost ? <TrailMap trail={trail} current={current} ghost={ghost} progress={progress} sector={selectedSector} onProgress={(value) => { setProgress(value); const next = videoTimeForRun(timeAt(current, value), settings); if (videoUrl) seekVideo(next); }} /> : <div className="panel video-map-empty">Escolhe uma run para ver o traçado GPS.</div>}
            </div>
          </section>

          <section className="sync-controls panel">
            <div className="section-heading">
              <div><span className="eyebrow"><SlidersHorizontal size={13} /> ALINHAMENTO</span><h2>Acerta os relógios</h2></div>
              <span className="sync-status"><Check size={13} /> Sincronização local</span>
            </div>
            <div className="sync-grid">
              <label className="field"><span>Partida do GPS no vídeo (s)</span><input aria-label="Desfasamento da partida do GPS" type="number" step="0.1" value={offsetSeconds} onChange={(event) => changeOffset(Number(event.target.value))} /></label>
              <label className="field"><span>Velocidade de pré-visualização</span><select aria-label="Velocidade do vídeo" value={previewRate} onChange={(event) => setPreviewRate(Number(event.target.value))}><option value="1">1× tempo real</option><option value="0.5">0.5× câmara lenta</option><option value="2">2× análise</option></select></label>
              <button className="button secondary sync-action" onClick={setRunStartAtPlayhead}><Target size={15} /> Marcar partida aqui</button>
            </div>
            {videoMetadataState === "checking" && <p className="sync-metadata-note" role="status">A procurar a hora de gravação no vídeo…</p>}
            {videoMetadataState === "missing" && videoUrl && <p className="sync-metadata-note" role="status">Este vídeo não tem hora de gravação. Podes alinhá-lo com os marcadores de partida e chegada abaixo.</p>}
            {videoCaptureDate && <div className="sync-suggestion" role="status">
              <div><strong><Sparkles size={14} /> Hora de gravação encontrada</strong><span>{videoCaptureDate.toLocaleString("pt-PT")} · compara com a partida do GPS antes de aplicar.</span><small>Diferenças no relógio da câmara ou no fuso horário podem afetar esta estimativa.</small></div>
              {timestampOffsetSuggestion !== null ? <button className="button secondary" onClick={applyTimestampSuggestion}>Usar sugestão de {timestampOffsetSuggestion > 0 ? "+" : ""}{timestampOffsetSuggestion.toFixed(1)}s</button> : <span className="muted">A hora não bate com esta run; alinha à mão.</span>}
            </div>}
            <div className="sync-anchors">
              <div><strong>Sincronização em dois pontos</strong><span className="muted">{anchors.length ? `${anchors.length} ${anchors.length === 1 ? "marcador" : "marcadores"} · ${anchors.map((anchor) => `${anchor.runTime === 0 ? "partida" : "chegada"} ${clock(anchor.videoTime)}`).join(" · ")}` : "Opcional: prende as duas pontas da run ao vídeo."}</span></div>
              <div className="sync-anchor-actions"><button className="button secondary" onClick={setRunStartAtPlayhead}><Target size={14} /> Marcar partida</button><button className="button secondary" disabled={!videoDuration} onClick={setRunFinishAtPlayhead}><Target size={14} /> Marcar chegada</button><button className="text-button" disabled={!anchors.length} onClick={resetAnchors}>Limpar marcadores</button></div>
            </div>
            <p className="sync-help">Anda com o vídeo até ao momento em que a bike sai da partida e marca-o como partida do GPS. Com dois marcadores, mudar o desfasamento move os dois juntos.</p>
          </section>

          <div className="video-tools-grid">
            <section className="panel trim-panel">
              <div className="section-heading"><div><span className="eyebrow"><Scissors size={13} /> LIMPA O TAKE</span><h2>Corta as paragens</h2></div><span className="muted">Com ajuda do GPS</span></div>
              <p>Encontra as pausas no sinal FIT/GPX, mantém só a descida e leva cada corte para o plano de edição.</p>
              <div className="trim-actions"><button className="button secondary" onClick={scanStops}><Gauge size={15} /> Procurar paragens no GPS</button><button className="button secondary" disabled={!stopAnalysis} onClick={() => setSkipStops(!skipStops)}><Scissors size={15} /> {skipStops ? "Paragens saltadas na pré-visualização" : "Mostrar paragens na pré-visualização"}</button><button className="button primary" disabled={!stopAnalysis || !videoDuration} onClick={applyRideWindow}>Aplicar janela da run</button></div>
              <div className="trim-readout"><span>Janela da run</span><strong className="mono">{rideWindowLabel(stopAnalysis?.rideWindow ?? null)}</strong></div>
              {stopAnalysis && <div className="stop-list">{stopAnalysis.stops.length ? stopAnalysis.stops.map((stop) => <div key={`${stop.startTime}-${stop.endTime}`}><span className="mono">{clock(stop.startTime)}–{clock(stop.endTime)}</span><strong>{stop.duration.toFixed(1)}s parado</strong></div>) : <span className="muted">Não há pausas com mais de 3 segundos.</span>}</div>}
              {trim && <div className="trim-applied"><Check size={14} /> Janela final {clock(trim.start)} → {clock(trim.end)}</div>}
            </section>
            <section className="panel export-panel">
              <div className="section-heading"><div><span className="eyebrow"><Download size={13} /> LEVA MAIS LONGE</span><h2>Exportar</h2></div></div>
              <p>Cria um vídeo curto com os teus melhores setores e o Ghost ao lado, a run completa com a telemetria, ou envia os cortes para o teu editor.</p>
              {reelCuts.length > 0 && (
                <p className="muted reel-summary">
                  Destaques: {reelCuts.map((cut) => `S${cut.index + 1} ${formatDelta(cut.delta)}`).join(" · ")} ·{" "}
                  {Math.round(reelCuts.reduce((sum, cut) => sum + cut.end - cut.start, 0))}s
                </p>
              )}
              <div className="export-actions">
                <button className="button primary" disabled={!videoDuration || !overlayExportSupported || renderState === "rendering" || !reelCuts.length} onClick={() => void exportOverlay(true)}><Sparkles size={15} /> {renderState === "rendering" ? `A criar ${Math.round(renderProgress * 100)}%` : "Vídeo de destaques"}</button>
                <button className="button secondary" disabled={!videoDuration || !overlayExportSupported || renderState === "rendering"} onClick={() => void exportOverlay()}><Film size={15} /> Run completa (WebM)</button>
                <button className="button secondary" disabled={!videoDuration || renderState === "rendering"} onClick={exportPlan}><Download size={15} /> Descarregar plano de edição</button>
              </div>
              {renderState === "rendering" && <div className="render-progress"><progress max="1" value={renderProgress} /><button className="text-button" onClick={() => renderAbort.current?.abort()}>Cancelar</button></div>}
              {renderState === "done" && <span className="render-success"><Check size={14} /> Vídeo descarregado</span>}
              {renderError && <p className="error-line render-error"><Camera size={14} /> {renderError}</p>}
              <span className="muted export-note">{overlayExportSupported ? "O vídeo é criado neste dispositivo; o original nunca sai daqui." : "Este dispositivo não consegue criar WebM no browser. Descarrega o plano de edição e usa um editor no computador."}</span>
            </section>
          </div>

          <section className="panel sector-video-panel">
            <div className="section-heading"><div><span className="eyebrow"><MapPin size={13} /> CORTES POR TELEMETRIA</span><h2>Salta para os segundos que importam</h2></div><span className="muted">{windows.length} setores · alinhado com o Ghost</span></div>
            <div className="sector-video-grid">
              {windows.map((window, index) => {
                const delta = splits[index] - (ghostSplits[index] ?? splits[index]);
                const best = theory?.sectors[index]?.runId === run?.id;
                return <button key={window.index} className={`sector-video-row ${selectedSector === index ? "selected" : ""}`} onClick={() => inspectSector(index)}><span className="sector-video-index">S{index + 1}</span><span className="sector-video-name">{window.name}<small>{clock(window.videoStartTime)} → {clock(window.videoEndTime)}</small></span><span className="sector-video-time mono">{formatTime(window.duration)}</span><strong className={delta > 0.005 ? "lost" : "gained"}>{formatDelta(delta)}</strong>{best && <span className="sector-video-best">MELHOR</span>}</button>;
              })}
            </div>
          </section>

          <section className="panel riding-events-panel">
            <div className="section-heading">
              <div><span className="eyebrow"><Zap size={13} /> LEITURA DA RUN</span><h2>Sinais a rever</h2></div>
              <span className="muted">Com ajuda do GPS · {ridingEvents.length} encontrados</span>
            </div>
            <p className="riding-events-help">A telemetria destaca travagens, acelerações, pausas e quedas de altitude parecidas com drops. Salta para um sinal para o comparares com o Ghost.</p>
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
                    <span className="riding-event-confidence">{Math.round(event.confidence * 100)}% <small>confiança</small></span>
                    <span className="riding-event-action">{videoUrl && videoDuration ? "Rever" : "Juntar vídeo"}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="riding-events-empty">Não há sinais fortes nesta run. Os dados GPS ficam intactos e privados.</div>
            )}
          </section>
        </>
      )}

      <section className="video-ai-note panel">
        <div className="video-ai-icon"><Sparkles size={18} /></div>
        <div><h2>Destaques automáticos.</h2><p>O vídeo de destaques escolhe sozinho os setores em que bateste o Ghost ou fizeste o teu melhor tempo, a partir da telemetria. Tudo é feito neste dispositivo, sem enviar o vídeo para lado nenhum.</p></div>
        <span className="muted"><Check size={13} /> FIT + GPX alinhados</span>
      </section>
    </>
  );
}
