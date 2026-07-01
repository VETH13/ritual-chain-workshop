import { NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";

// GET /api/leaderboard — top players by bestSurviveMs then totalCheese
export async function GET() {
  await ensureSchema();
  const entries = await db.leaderboard.findMany({
    orderBy: [{ bestSurviveMs: "desc" }, { totalCheese: "desc" }],
    take: 20,
  });
  return NextResponse.json({ leaderboard: entries });
}
