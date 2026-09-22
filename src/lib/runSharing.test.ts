import { describe, expect, it } from "vitest";
import { createDemoData } from "./demo";
import { createShareToken, hashShareToken, validateSharedRun } from "./runSharing";

describe("private run links", () => {
  it("creates unguessable URL-safe tokens and deterministic one-way hashes", async () => {
    const first = createShareToken();
    const second = createShareToken();
    expect(first).toMatch(/^[A-Za-z0-9_-]{40,50}$/);
    expect(second).not.toBe(first);
    expect(await hashShareToken(first)).toHaveLength(64);
    expect(await hashShareToken(first)).toBe(await hashShareToken(first));
  });

  it("accepts bounded ride snapshots and rejects corrupt GPS payloads", () => {
    const demo = createDemoData();
    const [trail] = demo.trails;
    const [run] = demo.runs;
    const snapshot = { riderName: "Rider", trail, run, ghost: null, expiresAt: "2030-01-01T00:00:00.000Z" };
    expect(validateSharedRun(snapshot)).toEqual(snapshot);
    expect(validateSharedRun({ ...snapshot, run: { ...run, points: [] } })).toBeNull();
    expect(validateSharedRun({ ...snapshot, trail: { ...trail, sectorNames: [] } })).toBeNull();
  });
});
