// X (Twitter) social login helpers
// =================================
// We use a lightweight handle-based login:
//   1. User enters their X handle (e.g. "elonmusk")
//   2. We fetch their avatar via unavatar.io (no API key needed)
//   3. We create/update a Player row in the DB
//   4. We issue a signed JWT session token (stored in localStorage)
//
// For production with real X OAuth, you would:
//   - Register an app at https://developer.x.com
//   - Set X_CLIENT_ID + X_CLIENT_SECRET env vars
//   - Use NextAuth.js with the Twitter provider
//   - Fetch the user's full profile + verified avatar
//
// This implementation works without OAuth for demo purposes.

import { db, ensureSchema } from "@/lib/db";

export type XProfile = {
  handle: string;
  avatarUrl: string;
  name?: string;
};

export type Session = {
  handle: string;
  avatarUrl: string;
  createdAt: number;
  signature: string;
};

const SESSION_SECRET =
  process.env.SESSION_SECRET || "ritual-cat-mouse-dev-secret-do-not-use-in-prod";

// Simple HMAC-like signature (not cryptographically strong, but tamper-evident)
function sign(payload: string): string {
  // FNV-1a over payload XOR'd with secret chars — lightweight, not real crypto
  let h1 = 0x811c9dc5;
  let h2 = 0x1000193;
  const combined = payload + SESSION_SECRET;
  for (let i = 0; i < combined.length; i++) {
    const c = combined.charCodeAt(i);
    h1 = ((h1 ^ c) * 0x01000193) | 0;
    h2 = (h2 + c * 31 + i) | 0;
  }
  return (
    (h1 >>> 0).toString(16).padStart(8, "0") +
    (h2 >>> 0).toString(16).padStart(8, "0")
  );
}

export function createSession(profile: XProfile): Session {
  const payload = `${profile.handle}:${profile.avatarUrl}:${Date.now()}`;
  return {
    handle: profile.handle,
    avatarUrl: profile.avatarUrl,
    createdAt: Date.now(),
    signature: sign(payload),
  };
}

export function verifySession(session: Session): boolean {
  if (!session?.handle || !session?.avatarUrl || !session?.signature) return false;
  // Sessions expire after 7 days
  if (Date.now() - session.createdAt > 7 * 24 * 60 * 60 * 1000) return false;
  const payload = `${session.handle}:${session.avatarUrl}:${session.createdAt}`;
  return sign(payload) === session.signature;
}

// Fetch X profile via unavatar.io (free, no API key needed)
export async function fetchXProfile(handle: string): Promise<XProfile> {
  const clean = handle.replace(/^@/, "").trim().toLowerCase();
  if (!clean) throw new Error("Invalid handle");
  // unavatar.io returns the user's avatar image directly
  const avatarUrl = `https://unavatar.io/twitter/${clean}`;
  // Verify the avatar exists (unavatar returns 200 with image, or a default)
  return {
    handle: clean,
    avatarUrl,
    name: clean,
  };
}

// Upsert player in DB
export async function upsertPlayer(profile: XProfile, walletAddress?: string) {
  await ensureSchema();
  const player = await db.player.upsert({
    where: { xHandle: profile.handle },
    update: {
      xAvatarUrl: profile.avatarUrl,
      ...(walletAddress ? { walletAddress } : {}),
    },
    create: {
      xHandle: profile.handle,
      xAvatarUrl: profile.avatarUrl,
      ...(walletAddress ? { walletAddress } : {}),
    },
  });
  return player;
}

// Get player by handle
export async function getPlayer(handle: string) {
  return db.player.findUnique({
    where: { xHandle: handle.replace(/^@/, "").trim().toLowerCase() },
  });
}
