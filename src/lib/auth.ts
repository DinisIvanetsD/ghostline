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

const PBKDF2_ITERATIONS = 210_000;
const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
const fromHex = (hex: string) =>
  new Uint8Array((hex.match(/../g) ?? []).map((pair) => parseInt(pair, 16)));

// shortcut: without WebCrypto (plain http on a LAN IP) passwords get a weak
// unsalted hash; these accounts only gate a device-local workspace.
function fallbackHash(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return `fallback-${(hash >>> 0).toString(16)}`;
}

async function pbkdf2(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<string> {
  const subtle = globalThis.crypto.subtle;
  const key = await subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return toHex(new Uint8Array(bits));
}

/** Salted PBKDF2 hash stored as `pbkdf2$iterations$salt$hash`. */
async function hashPassword(password: string): Promise<string> {
  if (!globalThis.crypto?.subtle) return fallbackHash(password);
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toHex(salt)}$${await pbkdf2(password, salt, PBKDF2_ITERATIONS)}`;
}

/** Verify against current and older stored formats (unsalted SHA-256, fallback). */
async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (stored.startsWith("pbkdf2$")) {
    const [, iterations, salt, hash] = stored.split("$");
    if (!globalThis.crypto?.subtle) return false;
    return (await pbkdf2(password, fromHex(salt), Number(iterations))) === hash;
  }
  if (stored.startsWith("fallback-")) return fallbackHash(password) === stored;
  if (!globalThis.crypto?.subtle) return false;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(password));
  return toHex(new Uint8Array(digest)) === stored;
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
  if (name.length < 2) throw new Error("Escreve o teu nome para criar a conta.");
  if (!/^\S+@\S+\.\S+$/.test(email))
    throw new Error("Escreve um email válido.");
  if (input.password.length < 8)
    throw new Error("Usa pelo menos 8 caracteres na palavra-passe.");
  const store = readStore();
  if (store.users.some((user) => user.email === email))
    throw new Error("Já existe uma conta com este email.");
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
  if (!user || !(await verifyPassword(input.password, user.passwordHash)))
    throw new Error("Email ou palavra-passe incorretos.");
  // Accounts made before salted hashes are upgraded on their next sign-in.
  const passwordHash = user.passwordHash.startsWith("pbkdf2$")
    ? user.passwordHash
    : await hashPassword(input.password);
  writeStore({
    users: store.users.map((item) => (item.userId === user.userId ? { ...item, passwordHash } : item)),
    sessionUserId: user.userId,
  });
  return sessionFrom(user);
}

export async function changePassword(input: {
  userId: string;
  current: string;
  next: string;
}): Promise<void> {
  if (input.next.length < 8) throw new Error("Usa pelo menos 8 caracteres na palavra-passe.");
  const store = readStore();
  const user = store.users.find((item) => item.userId === input.userId);
  if (!user || !(await verifyPassword(input.current, user.passwordHash)))
    throw new Error("A palavra-passe atual está errada.");
  const passwordHash = await hashPassword(input.next);
  writeStore({
    ...store,
    users: store.users.map((item) => (item.userId === user.userId ? { ...item, passwordHash } : item)),
  });
}
