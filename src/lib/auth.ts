export type AuthSession = {
  userId: string;
  name: string;
  email: string;
  provider?: "local" | "supabase";
};

type StoredUser = AuthSession & { passwordHash: string };
type AuthStore = { users: StoredUser[]; sessionUserId: string | null };

const KEY = "ghostline.auth.v1";

function emptyStore(): AuthStore {
  return { users: [], sessionUserId: null };
}

function readStore(): AuthStore {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as Partial<AuthStore>;
    if (!Array.isArray(parsed.users)) return emptyStore();
    const users = parsed.users.filter(
      (user): user is StoredUser =>
        Boolean(
          user &&
            typeof user === "object" &&
            typeof user.userId === "string" &&
            typeof user.name === "string" &&
            typeof user.email === "string" &&
            typeof user.passwordHash === "string",
        ),
    );
    const sessionUserId =
      typeof parsed.sessionUserId === "string" ? parsed.sessionUserId : null;
    return { users, sessionUserId };
  } catch {
    return emptyStore();
  }
}

function writeStore(store: AuthStore): void {
  localStorage.setItem(KEY, JSON.stringify(store));
}

function fallbackHash(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return `fallback-${(hash >>> 0).toString(16)}`;
}

async function hashPassword(value: string): Promise<string> {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.subtle || typeof TextEncoder === "undefined")
    return fallbackHash(value);
  const digest = await cryptoApi.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function sessionFrom(user: StoredUser): AuthSession {
  return { userId: user.userId, name: user.name, email: user.email, provider: "local" };
}

export function getSession(): AuthSession | null {
  const store = readStore();
  const user = store.users.find((item) => item.userId === store.sessionUserId);
  return user ? sessionFrom(user) : null;
}

export function signOut(): void {
  const store = readStore();
  writeStore({ ...store, sessionUserId: null });
}

export async function registerAccount(input: {
  name: string;
  email: string;
  password: string;
}): Promise<AuthSession> {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (name.length < 2) throw new Error("Enter your name to create an account.");
  if (!/^\S+@\S+\.\S+$/.test(email))
    throw new Error("Enter a valid email address.");
  if (input.password.length < 8)
    throw new Error("Use at least 8 characters for your password.");
  const store = readStore();
  if (store.users.some((user) => user.email === email))
    throw new Error("An account with this email already exists.");
  const user: StoredUser = {
    userId: `user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    email,
    passwordHash: await hashPassword(input.password),
  };
  writeStore({ users: [...store.users, user], sessionUserId: user.userId });
  return sessionFrom(user);
}

export async function loginAccount(input: {
  email: string;
  password: string;
}): Promise<AuthSession> {
  const email = input.email.trim().toLowerCase();
  const store = readStore();
  const user = store.users.find((item) => item.email === email);
  if (!user || user.passwordHash !== (await hashPassword(input.password)))
    throw new Error("Email or password is incorrect.");
  writeStore({ ...store, sessionUserId: user.userId });
  return sessionFrom(user);
}
