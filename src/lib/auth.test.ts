// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
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
    ).rejects.toThrow(/already exists/);
    await expect(
      loginAccount({ email: registered.email, password: "wrong-pass" }),
    ).rejects.toThrow(/incorrect/);

    await expect(
      loginAccount({ email: "RIDER@example.com", password: "downhill-123" }),
    ).resolves.toEqual(registered);
  });

  it("enforces useful registration fields", async () => {
    await expect(
      registerAccount({ name: "Rider", email: "rider@example.com", password: "short" }),
    ).rejects.toThrow(/8 characters/);
    await expect(
      registerAccount({ name: "Rider", email: "bad", password: "long-enough" }),
    ).rejects.toThrow(/valid email/);
  });
});
