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
import { TrailMap } from "./TrailMap";

interface Props {
  data: AppData;
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

function rideWindowLabel(window: RideWindow | null): string {
  if (!window) return "No ride window scanned";
  return `${clock(window.startTime)} → ${clock(window.endTime)}`;
}

export function VideoLab({ data }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const previousUrl = useRef<string | null>(null);
  const [trailId, setTrailId] = useState(data.trails[0]?.id ?? "");
  const [runId, setRunId] = useState("");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoName, setVideoName] = useState("");
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoTime, setVideoTime] = useState(0);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [videoError, setVideoError] = useState("");
  const [offsetSeconds, setOffsetSeconds] = useState(0);
  const [previewRate, setPreviewRate] = useState(1);
  const [progress, setProgress] = useState(0);
  const [selectedSector, setSelectedSector] = useState<number | null>(null);
  const [stopAnalysis, setStopAnalysis] = useState<StopAnalysis | null>(null);
  const [skipStops, setSkipStops] = useState(true);
  const [trim, setTrim] = useState<TrimWindow | null>(null);

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
  const pb = useMemo(
    () => personalBest(data.runs, trail?.id ?? ""),
    [data.runs, trail],
  );
  const ghost = useMemo(() => (pb ? analyze(pb.points) : current), [pb, current]);
  const settings: VideoSyncSettings = useMemo(
    () => ({ offsetSeconds }),
    [offsetSeconds],
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
  const runProgressTime = current ? timeAt(current, progress) : 0;

  useEffect(() => {
    return () => {
      if (previousUrl.current) URL.revokeObjectURL(previousUrl.current);
    };
  }, []);

  useEffect(() => {
    setRunId("");
    setSelectedSector(null);
    setProgress(0);
    setStopAnalysis(null);
    setTrim(null);
  }, [trailId]);

  useEffect(() => {
    setSelectedSector(null);
    setProgress(0);
    setStopAnalysis(null);
    setTrim(null);
  }, [run?.id]);

  useEffect(() => {
    // A trim window is stored in video coordinates. Changing alignment makes
    // that window stale, so require a fresh ride-window apply.
    setTrim(null);
  }, [offsetSeconds]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = previewRate;
  }, [previewRate, videoUrl]);

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

  const selectVideo = (file: File | undefined) => {
    if (!file) return;
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
  };

  const seekVideo = (nextTime: number) => {
    const safe = Math.max(0, Math.min(videoDuration || Number.MAX_SAFE_INTEGER, nextTime));
    if (videoRef.current) videoRef.current.currentTime = safe;
    setVideoTime(safe);
    onVideoTime();
  };

  const setRunStartAtPlayhead = () => {
    setOffsetSeconds(videoTime);
    setProgress(0);
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
            <span className="eyebrow"><Sparkles size={13} /> LOCAL WORKFLOW</span>
            <h2>Choose a ride to sync</h2>
            <p>Keep the original video on this device. GHOSTLINE only stores the sync plan you export.</p>
          </div>
          <label className="button secondary video-file-button">
            <Upload size={16} />
            {videoName ? "Replace video" : "Choose video"}
            <input
              aria-label="Choose video file"
              type="file"
              accept="video/mp4,video/quicktime,video/webm,video/*"
              onChange={(event) => selectVideo(event.currentTarget.files?.[0])}
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
      </section>

      {!videoUrl ? (
        <section className="video-empty panel">
          <div className="video-empty-icon"><Film size={29} /></div>
          <div>
            <h2>Drop in your ride footage.</h2>
            <p>MP4, MOV or WebM works in the browser. Import your DJI Mimo export, then set the GPS start point once.</p>
          </div>
          <label className="button primary video-file-button">
            <Camera size={16} /> Choose video
            <input aria-label="Choose video file" type="file" accept="video/mp4,video/quicktime,video/webm,video/*" onChange={(event) => selectVideo(event.currentTarget.files?.[0])} />
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
                <span><Gauge size={14} /> {current ? `${current.samples.find((sample) => Math.abs(sample.fraction - progress) < 0.02)?.speed.toFixed(1) ?? "0.0"} km/h` : "—"}</span>
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
              <label className="field"><span>GPS start in video (s)</span><input aria-label="GPS start offset" type="number" step="0.1" value={offsetSeconds} onChange={(event) => setOffsetSeconds(Number(event.target.value) || 0)} /></label>
              <label className="field"><span>Preview speed</span><select aria-label="Video playback rate" value={previewRate} onChange={(event) => setPreviewRate(Number(event.target.value))}><option value="1">1× real time</option><option value="0.5">0.5× slow motion</option><option value="2">2× analysis</option></select></label>
              <button className="button secondary sync-action" onClick={setRunStartAtPlayhead}><Target size={15} /> Set run start at playhead</button>
            </div>
            <p className="sync-help">Scrub to the moment the bike leaves the start, then set it as the GPS start. Sector markers and telemetry follow this offset.</p>
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
              <p>Send a small JSON edit plan to your desktop editor or the future GHOSTLINE renderer. It includes sync, cuts, sector windows and deltas.</p>
              <button className="button primary" disabled={!videoDuration} onClick={exportPlan}><Download size={15} /> Download edit plan</button>
              <span className="muted export-note">Video stays local; no upload is required.</span>
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
