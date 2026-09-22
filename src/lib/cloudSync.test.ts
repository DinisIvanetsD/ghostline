import { describe, expect, it, vi } from "vitest";
import { createWorkspaceCloudSync, isSupabaseConfigured, mergeWorkspaceRecords } from "./cloudSync";

describe("optional Supabase workspace sync", () => {
  it("merges locally created and cloud records without duplicating IDs", () => {
    const merged = mergeWorkspaceRecords(
      {
        profile: { name: "Local rider" },
        bikes: [{ id: "bike-local" }, { id: "bike-shared", label: "old" }],
        trails: [{ id: "trail-local" }],
        runs: [{ id: "run-local" }],
        demo: true,
      },
      {
        profile: { name: "Cloud rider" },
        bikes: [{ id: "bike-shared", label: "cloud" }],
        trails: [{ id: "trail-cloud" }],
        runs: [{ id: "run-cloud" }],
      },
    );
    expect(merged.profile).toEqual({ name: "Cloud rider" });
    expect(merged.bikes).toEqual([{ id: "bike-local" }, { id: "bike-shared", label: "cloud" }]);
    expect(merged.trails.map(({ id }) => id)).toEqual(["trail-local", "trail-cloud"]);
    expect(merged.runs.map(({ id }) => id)).toEqual(["run-local", "run-cloud"]);
    expect(merged.demo).toBe(false);
  });

  it("remains unconfigured without environment credentials and fails closed", async () => {
    const sync = createWorkspaceCloudSync(null);
    expect(sync.configured).toBe(false);
    expect(isSupabaseConfigured(null)).toBe(false);
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(sync.pull("token", "user-1")).rejects.toThrow(/not configured/);
    await expect(sync.push("token", "user-1", { runs: [] })).rejects.toThrow(/not configured/);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("requires a Supabase user token before making requests", async () => {
    const sync = createWorkspaceCloudSync({ url: "https://example.supabase.co", anonKey: "public-anon-key" });
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(sync.pull("", "user-1")).rejects.toThrow(/access token is required/);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
