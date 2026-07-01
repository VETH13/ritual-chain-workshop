import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db = globalForPrisma.prisma ?? new PrismaClient({ log: ["error"] });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

// Schema init promise (deduped)
let schemaPromise: Promise<void> | null = null;

// Auto-create schema on first access (for serverless / ephemeral filesystems)
export async function ensureSchema(): Promise<void> {
  if (schemaPromise) return schemaPromise;
  schemaPromise = (async () => {
    try {
      await db.player.count();
    } catch {
      await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "Player" (id TEXT PRIMARY KEY, xHandle TEXT NOT NULL UNIQUE, xAvatarUrl TEXT, walletAddress TEXT, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL);`);
      await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "Friend" (id TEXT PRIMARY KEY, fromHandle TEXT NOT NULL, toHandle TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(fromHandle, toHandle));`);
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Friend_toHandle_status_idx" ON "Friend"(toHandle, status);`);
      await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "GameRecord" (id TEXT PRIMARY KEY, playerAddress TEXT NOT NULL, playerXHandle TEXT, difficulty TEXT NOT NULL, wagerAmount INTEGER NOT NULL, survivedMs INTEGER NOT NULL, cheeseCollected INTEGER NOT NULL, caught BOOLEAN NOT NULL, payoutAmount INTEGER NOT NULL, inferenceHash TEXT NOT NULL, ritualTxHash TEXT, opponentXHandle TEXT, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
      await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "Leaderboard" (id TEXT PRIMARY KEY, playerAddress TEXT NOT NULL, playerXHandle TEXT UNIQUE, totalGames INTEGER NOT NULL DEFAULT 0, wins INTEGER NOT NULL DEFAULT 0, totalCheese INTEGER NOT NULL DEFAULT 0, bestSurviveMs INTEGER NOT NULL DEFAULT 0, updatedAt DATETIME NOT NULL);`);
      console.log("[db] Schema initialized");
    }
  })();
  return schemaPromise;
}

// Auto-init on module load (best-effort, doesn't block imports)
if (typeof window === "undefined") {
  ensureSchema().catch(console.error);
}
