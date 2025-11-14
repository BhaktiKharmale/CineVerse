// src/utils/ownerToken.ts
// Robust owner-token generator for browser + non-browser contexts.
// Works with TypeScript, Vite, React. No runtime errors if localStorage/window/crypto missing.

const STORAGE_KEY = "cineverse_owner_token";

const isBrowser = typeof globalThis !== "undefined" && typeof (globalThis as any).window !== "undefined";

function readLocalStorage(key: string): string | null {
  try {
    if (!isBrowser) return null;
    return (globalThis as any).window.localStorage.getItem(key);
  } catch (e) {
    // localStorage may throw in private mode or restricted iframes
    // eslint-disable-next-line no-console
    console.warn("readLocalStorage failed:", e);
    return null;
  }
}

function writeLocalStorage(key: string, value: string): void {
  try {
    if (!isBrowser) return;
    (globalThis as any).window.localStorage.setItem(key, value);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("writeLocalStorage failed:", e);
  }
}

/** Prefer crypto.randomUUID -> crypto.getRandomValues -> Math.random fallback */
function generateUUID(): string {
  try {
    // Prefer modern randomUUID if available
    const maybeCrypto = (globalThis as any).crypto;
    if (maybeCrypto && typeof maybeCrypto.randomUUID === "function") {
      return maybeCrypto.randomUUID();
    }

    // Fallback to getRandomValues-based RFC4122 v4 generator (secure)
    if (maybeCrypto && typeof maybeCrypto.getRandomValues === "function") {
      // generate 16 random bytes
      const bytes = new Uint8Array(16);
      maybeCrypto.getRandomValues(bytes);

      // Per RFC4122 v4
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;

      const hex: string[] = [];
      bytes.forEach((b) => hex.push((b + 0x100).toString(16).slice(1)));
      return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex
        .slice(6, 8)
        .join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
    }
  } catch (e) {
    // ignore and fallback to Math.random
    // eslint-disable-next-line no-console
    console.warn("crypto fallback failed:", e);
  }

  // Last-resort fallback (not cryptographically secure, but fine for a local token)
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    /* eslint-disable no-bitwise */
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
    /* eslint-enable no-bitwise */
  });
}

/**
 * getOwnerToken - returns a stable per-browser token persisted in localStorage when available.
 * Safe to call in SSR/test envs.
 */
export function getOwnerToken(): string {
  // Try read existing token
  const existing = readLocalStorage(STORAGE_KEY);
  if (existing && existing.length > 0) return existing;

  // Make new token and persist (best-effort)
  const token = generateUUID();
  writeLocalStorage(STORAGE_KEY, token);
  return token;
}

export default getOwnerToken;
