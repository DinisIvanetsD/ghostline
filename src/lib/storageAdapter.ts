/**
 * Small persistence boundary used by local-first features.
 *
 * The app currently runs on device storage, but keeping reads and writes behind
 * this interface means Supabase/Firebase can replace the adapter later without
 * changing feature code. The adapter deliberately has no network behaviour.
 */
export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function localStorageAdapter(): StorageAdapter | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const storage = localStorage;
    // A tiny capability check catches private browsing and disabled storage.
    const probe = "ghostline.storage.probe";
    storage.setItem(probe, "1");
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

export function scopedStorageKey(namespace: string, scope?: string): string {
  const cleanScope = scope?.trim();
  return cleanScope
    ? `${namespace}.${encodeURIComponent(cleanScope)}`
    : namespace;
}
