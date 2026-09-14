export interface VideoOverlayFrame {
  currentTime: number;
  duration: number;
  width: number;
  height: number;
}

export interface VideoOverlayRenderOptions {
  video: HTMLVideoElement;
  startTime: number;
  endTime: number;
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
      reject(new Error("The video could not be prepared for export."));
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
  drawOverlay,
  onProgress,
  signal,
}: VideoOverlayRenderOptions): Promise<Blob> {
  const mimeType = typeof MediaRecorder !== "undefined" ? preferredMimeType() : "";
  const source = video as CapturableVideo;
  if (!mimeType || !source.captureStream || typeof HTMLCanvasElement === "undefined")
    throw new Error("This browser cannot render an overlay video. Download the edit plan instead.");
  if (!Number.isFinite(video.videoWidth) || video.videoWidth < 2 || !Number.isFinite(video.duration))
    throw new Error("Wait for the video metadata to load before exporting.");

  const start = Math.max(0, Math.min(video.duration - 0.05, startTime));
  const end = Math.min(video.duration, Math.max(start + 0.05, endTime));
  const duration = end - start;
  const width = Math.min(1280, video.videoWidth);
  const height = Math.max(2, Math.round(width * (video.videoHeight / video.videoWidth || 9 / 16)));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas rendering is unavailable in this browser.");

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
    recorder.onerror = () => finish(new Error("The browser stopped recording this video."));
    recorder.onstop = () => finish();

    const draw = () => {
      if (finished) return;
      const currentTime = video.currentTime;
      context.drawImage(video, 0, 0, width, height);
      drawOverlay(context, { currentTime, duration, width, height });
      const fraction = Math.max(0, Math.min(1, (currentTime - start) / Math.max(0.05, end - start)));
      onProgress?.(fraction);
      if (signal?.aborted) {
        cancel();
        return;
      }
      if (currentTime >= end - 0.04) {
        video.pause();
        recorder.stop();
        return;
      }
      animationFrame = requestAnimationFrame(draw);
    };

    const startRecording = async () => {
      try {
        if (signal?.aborted) throw abortError();
        video.pause();
        video.currentTime = start;
        await waitForSeek(video, start);
        recorder.start(250);
        await video.play();
        animationFrame = requestAnimationFrame(draw);
      } catch (error) {
        finish(error instanceof Error ? error : new Error("The video could not be exported."));
      }
    };
    void startRecording();
  });

  return result;
}
