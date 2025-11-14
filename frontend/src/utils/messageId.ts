/**
 * Message ID generator - single source of truth for unique message IDs
 * Uses UUID v4 format for globally unique, stable identifiers
 */

export function createMessageId(): string {
  // Generate UUID v4
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

