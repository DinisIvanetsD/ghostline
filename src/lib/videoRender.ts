export interface VideoOverlayFrame {
  currentTime: number;
  duration: number;
  width: number;
  height: number;
  /** Index of the clip being recorded when several segments are joined. */
  segmentIndex: number;
  /** Seconds since the current segment started. */
  segmentTime: number;
}

export interface VideoSegment {
  start: number;
  end: number;
}

export interface VideoOverlayRenderOptions {
  video: HTMLVideoElement;
  startTime: number;
  endTime: number;
  /** Optional cut list (e.g. a highlight reel); replaces startTime/endTime. */
  segments?: VideoSegment[];
  drawOverlay: (context: CanvasRenderingContext2D, frame: VideoOverlayFrame) => void;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

type CapturableVideo = HTMLVideoElement & {
  captureStream?: () => MediaStream;
};

function preferredMimeType(): string {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  return candidates.find((mime) => MediaRecorder.isTypeSupported(mime)) ?? "";
}

/** Capability check used to keep the export action honest on iOS Safari. */
export function canRenderOverlayWebM(): boolean {
  if (typeof MediaRecorder === "undefined" || typeof HTMLCanvasElement === "undefined") return false;
  if (!MediaRecorder.isTypeSupported || !preferredMimeType()) return false;
  return typeof HTMLVideoElement !== "undefined" && "captureStream" in HTMLVideoElement.prototype;
}

function waitForSeek(video: HTMLVideoElement, target: number): Promise<void> {
  if (video.readyState >= 2 && Math.abs(video.currentTime - target) < 0.02)
    return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Não foi possível preparar o vídeo para exportar."));
    };
    const cleanup = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    };
    video.addEventListener("seeked", onSeeked, { once: true });
    video.addEventListener("error", onError, { once: true });
  });
}

function abortError(): DOMException {
  return new DOMException("Video export cancelled", "AbortError");
}

/**
 * Render a telemetry overlay into a browser-native WebM file. This intentionally
 * stays dependency-free; a future MP4 renderer can consume the same frame hook.
 */
export async function renderOverlayWebM({
  video,
  startTime,
  endTime,
  segments,
  drawOverlay,
  onProgress,
  signal,
}: VideoOverlayRenderOptions): Promise<Blob> {
  const mimeType = typeof MediaRecorder !== "undefined" ? preferredMimeType() : "";
  const source = video as CapturableVideo;
  if (!mimeType || !source.captureStream || typeof HTMLCanvasElement === "undefined")
    throw new Error("Este browser não consegue criar o vídeo. Descarrega o plano de edição.");
  if (!Number.isFinite(video.videoWidth) || video.videoWidth < 2 || !Number.isFinite(video.duration))
    throw new Error("Espera que o vídeo carregue antes de exportar.");

  const cuts = (segments?.length ? segments : [{ start: startTime, end: endTime }]).map((segment) => {
    const start = Math.max(0, Math.min(video.duration - 0.05, segment.start));
    return { start, end: Math.min(video.duration, Math.max(start + 0.05, segment.end)) };
  });
  const duration = cuts.reduce((sum, cut) => sum + (cut.end - cut.start), 0);
  let cutIndex = 0;
  let recordedBefore = 0;
  const width = Math.min(1280, video.videoWidth);
  const height = Math.max(2, Math.round(width * (video.videoHeight / video.videoWidth || 9 / 16)));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Este browser não suporta desenho em canvas.");

  const originalTime = video.currentTime;
  const originalRate = video.playbackRate;
  const wasPlaying = !video.paused;
  const stream = canvas.captureStream(30);
  const audioTracks = source.captureStream().getAudioTracks();
  audioTracks.forEach((track) => stream.addTrack(track));
  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks: Blob[] = [];
  let animationFrame = 0;
  let finished = false;

  const result = new Promise<Blob>((resolve, reject) => {
    const cleanup = () => {
      cancelAnimationFrame(animationFrame);
      signal?.removeEventListener("abort", cancel);
      stream.getTracks().forEach((track) => track.stop());
      video.currentTime = originalTime;
      video.playbackRate = originalRate;
      if (wasPlaying) void video.play().catch(() => undefined);
    };
    const finish = (error?: Error) => {
      if (finished) return;
      finished = true;
      cleanup();
      if (error) reject(error);
      else resolve(new Blob(chunks, { type: mimeType }));
    };
    const cancel = () => {
      if (recorder.state !== "inactive") recorder.stop();
      finish(abortError());
    };
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    recorder.onerror = () => finish(new Error("O browser parou de gravar este vídeo."));
    recorder.onstop = () => finish();

    const draw = () => {
      if (finished) return;
      const cut = cuts[cutIndex];
      const currentTime = video.currentTime;
      const segmentTime = Math.max(0, currentTime - cut.start);
      context.drawImage(video, 0, 0, width, height);
      drawOverlay(context, { currentTime, duration, width, height, segmentIndex: cutIndex, segmentTime });
      const fraction = Math.max(0, Math.min(1, (recordedBefore + segmentTime) / Math.max(0.05, duration)));
      onProgress?.(fraction);
      if (signal?.aborted) {
        cancel();
        return;
      }
      if (currentTime >= cut.end - 0.04) {
        video.pause();
        if (cutIndex === cuts.length - 1) {
          recorder.stop();
          return;
        }
        recordedBefore += cut.end - cut.start;
        cutIndex += 1;
        void jumpTo(cuts[cutIndex].start);
        return;
      }
      animationFrame = requestAnimationFrame(draw);
    };
    // Pause recording while seeking so the joined clip has no frozen frames.
    const jumpTo = async (time: number) => {
      try {
        if (recorder.state === "recording") recorder.pause();
        video.currentTime = time;
        await waitForSeek(video, time);
        if (signal?.aborted) throw abortError();
        if (recorder.state === "paused") recorder.resume();
        else recorder.start(250);
        await video.play();
        animationFrame = requestAnimationFrame(draw);
      } catch (error) {
        if (recorder.state !== "inactive") recorder.stop();
        finish(error instanceof Error ? error : new Error("Não foi possível exportar o vídeo."));
      }
    };

    const startRecording = async () => {
      if (signal?.aborted) return finish(abortError());
      video.pause();
      await jumpTo(cuts[0].start);
    };
    void startRecording();
  });

  return result;
}
