import { getSupabaseClient } from "./supabase";
import type { VideoProjectState } from "./videoProjects";

const BUCKET = "ghostline-videos";

export interface SyncedVideoProject extends VideoProjectState {
  storagePath: string;
  updatedAt: string;
}

export async function uploadRideVideo(
  userId: string,
  runId: string,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  const client = await getSupabaseClient();
  if (!client) throw new Error("O armazenamento de vídeo na nuvem não está configurado.");
  const extensionMime: Record<string, string> = { mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm" };
  const extension = file.name.split(".").at(-1)?.toLowerCase() ?? "";
  const contentType = file.type.startsWith("video/") ? file.type : extensionMime[extension];
  if (!contentType) throw new Error("Escolhe um vídeo MP4, MOV ou WebM.");
  if (file.size > 250 * 1024 * 1024) throw new Error("Os vídeos na nuvem estão limitados a 250 MB. Mantém este clip no dispositivo ou exporta uma versão mais curta.");
  const safeName = file.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-100) || "ride-video";
  const path = `${userId}/${encodeURIComponent(runId)}/${crypto.randomUUID()}-${safeName}`;
  const { data: auth, error: authError } = await client.auth.getSession();
  if (authError) throw authError;
  if (!auth.session) throw new Error("Entra outra vez antes de enviar este vídeo.");
  const { Upload } = await import("tus-js-client");
  const configuredUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!configuredUrl) throw new Error("O armazenamento de vídeo na nuvem não está configurado.");
  const projectUrl = new URL(configuredUrl);
  const projectRef = projectUrl.hostname.split(".")[0];
  const endpoint = projectUrl.hostname.endsWith(".supabase.co")
    ? `https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable`
    : `${projectUrl.origin}/storage/v1/upload/resumable`;
  await new Promise<void>((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${auth.session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? "",
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: 6 * 1024 * 1024,
      metadata: {
        bucketName: BUCKET,
        objectName: path,
        contentType,
        cacheControl: "3600",
      },
      onError: reject,
      onProgress: (uploaded, total) => onProgress?.(total > 0 ? uploaded / total : 0),
      onSuccess: () => resolve(),
    });
    upload.start();
  });
  return path;
}

export async function loadCloudVideoProject(userId: string, runId: string): Promise<SyncedVideoProject | null> {
  const client = await getSupabaseClient();
  if (!client) return null;
  const { data, error } = await client
    .from("ghostline_video_projects")
    .select("project, storage_path, updated_at")
    .eq("user_id", userId)
    .eq("run_id", runId)
    .maybeSingle();
  if (error) throw error;
  if (!data || !data.project || typeof data.project !== "object" || typeof data.storage_path !== "string") return null;
  return { ...(data.project as VideoProjectState), storagePath: data.storage_path, updatedAt: data.updated_at };
}

export async function saveCloudVideoProject(userId: string, runId: string, project: VideoProjectState, storagePath: string): Promise<void> {
  const client = await getSupabaseClient();
  if (!client) throw new Error("O armazenamento de vídeo na nuvem não está configurado.");
  if (!storagePath.startsWith(`${userId}/`)) throw new Error("Este vídeo não pertence a esta conta.");
  const { error } = await client.from("ghostline_video_projects").upsert({
    user_id: userId,
    run_id: runId,
    project,
    storage_path: storagePath,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,run_id" });
  if (error) throw error;
}

export async function signedRideVideoUrl(userId: string, storagePath: string): Promise<string> {
  const client = await getSupabaseClient();
  if (!client) throw new Error("O armazenamento de vídeo na nuvem não está configurado.");
  if (!storagePath.startsWith(`${userId}/`)) throw new Error("Este vídeo não pertence a esta conta.");
  const { data, error } = await client.storage.from(BUCKET).createSignedUrl(storagePath, 60 * 60);
  if (error) throw error;
  return data.signedUrl;
}
