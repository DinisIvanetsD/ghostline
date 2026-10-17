// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  changePassword,
  getSession,
  loginAccount,
  registerAccount,
  signOut,
} from "./auth";

describe("local rider accounts", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("registers a rider, creates a session and supports sign out", async () => {
    const session = await registerAccount({
      name: "Dinis Ivanets",
      email: "Dinis@example.com",
      password: "trail-pass-123",
    });

    expect(session.email).toBe("dinis@example.com");
    expect(getSession()).toEqual(session);
    expect(localStorage.getItem("ghostline.auth.v1")).not.toContain(
      "trail-pass-123",
    );

    signOut();
    expect(getSession()).toBeNull();
  });

  it("logs in an existing rider and rejects duplicate or incorrect credentials", async () => {
    const registered = await registerAccount({
      name: "Rider One",
      email: "rider@example.com",
      password: "downhill-123",
    });
    signOut();

    await expect(
      registerAccount({
        name: "Another Rider",
        email: "RIDER@example.com",
        password: "downhill-456",
      }),
    ).rejects.toThrow(/Já existe/);
    await expect(
      loginAccount({ email: registered.email, password: "wrong-pass" }),
    ).rejects.toThrow(/incorretos/);

    await expect(
      loginAccount({ email: "RIDER@example.com", password: "downhill-123" }),
    ).resolves.toEqual(registered);
  });

  it("enforces useful registration fields", async () => {
    await expect(
      registerAccount({ name: "Rider", email: "rider@example.com", password: "short" }),
    ).rejects.toThrow(/8 caracteres/);
    await expect(
      registerAccount({ name: "Rider", email: "bad", password: "long-enough" }),
    ).rejects.toThrow(/email válido/);
  });

  it("stores salted hashes and upgrades old unsalted accounts on sign-in", async () => {
    const a = await registerAccount({ name: "Rider A", email: "a@example.com", password: "same-pass-123" });
    await registerAccount({ name: "Rider B", email: "b@example.com", password: "same-pass-123" });
    const stored = JSON.parse(localStorage.getItem("ghostline.auth.v1")!);
    expect(stored.users[0].passwordHash).toMatch(/^pbkdf2\$/);
    expect(stored.users[0].passwordHash).not.toBe(stored.users[1].passwordHash);

    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("same-pass-123"));
    stored.users[0].passwordHash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem("ghostline.auth.v1", JSON.stringify(stored));
    await expect(loginAccount({ email: "a@example.com", password: "same-pass-123" })).resolves.toEqual(a);
    expect(JSON.parse(localStorage.getItem("ghostline.auth.v1")!).users[0].passwordHash).toMatch(/^pbkdf2\$/);
  });

  it("changes the password only with the current one", async () => {
    const rider = await registerAccount({ name: "Rider", email: "r@example.com", password: "first-pass-1" });
    await expect(changePassword({ userId: rider.userId, current: "wrong-pass", next: "second-pass-2" })).rejects.toThrow(/atual/);
    await changePassword({ userId: rider.userId, current: "first-pass-1", next: "second-pass-2" });
    signOut();
    await expect(loginAccount({ email: "r@example.com", password: "first-pass-1" })).rejects.toThrow(/incorretos/);
    await expect(loginAccount({ email: "r@example.com", password: "second-pass-2" })).resolves.toEqual(rider);
  });
});
