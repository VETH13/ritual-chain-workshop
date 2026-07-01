import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mockTxHash } from "@/lib/ritual";

// POST /api/game-record — save a finished game and "anchor" to Ritual testnet
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      playerAddress,
      difficulty,
      wagerAmount,
      survivedMs,
      cheeseCollected,
      caught,
      inferenceHash,
    } = body;

    if (!playerAddress || !difficulty) {
      return NextResponse.json(
        { error: "Missing playerAddress or difficulty" },
        { status: 400 }
      );
    }

    const payoutMultiplier =
      difficulty === "kitten" ? 1.5 : difficulty === "hunter" ? 2.5 : 5;
    const won = !caught;
    const payoutAmount = won
      ? Math.floor(wagerAmount * payoutMultiplier)
      : 0;

    // Mock "Ritual testnet tx hash" — simulates anchoring the inference proof
    const ritualTxHash = mockTxHash(inferenceHash + playerAddress + Date.now());

    const record = await db.gameRecord.create({
      data: {
        playerAddress: playerAddress.toLowerCase(),
        difficulty,
        wagerAmount: Number(wagerAmount) || 0,
        survivedMs: Number(survivedMs) || 0,
        cheeseCollected: Number(cheeseCollected) || 0,
        caught: Boolean(caught),
        payoutAmount,
        inferenceHash: String(inferenceHash || ""),
        ritualTxHash,
      },
    });

    // Update leaderboard
    const addr = playerAddress.toLowerCase();
    const existing = await db.leaderboard.findUnique({ where: { id: addr } });
    if (existing) {
      await db.leaderboard.update({
        where: { id: addr },
        data: {
          totalGames: existing.totalGames + 1,
          wins: existing.wins + (won ? 1 : 0),
          totalCheese: existing.totalCheese + (Number(cheeseCollected) || 0),
          bestSurviveMs: Math.max(
            existing.bestSurviveMs,
            Number(survivedMs) || 0
          ),
        },
      });
    } else {
      await db.leaderboard.create({
        data: {
          id: addr,
          playerAddress: addr,
          totalGames: 1,
          wins: won ? 1 : 0,
          totalCheese: Number(cheeseCollected) || 0,
          bestSurviveMs: Number(survivedMs) || 0,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      record,
      payoutAmount,
      ritualTxHash,
      won,
    });
  } catch (e: any) {
    console.error("game-record error:", e);
    return NextResponse.json(
      { error: e?.message ?? "failed to save record" },
      { status: 500 }
    );
  }
}

// GET /api/game-record?address=0x... — fetch recent games for a player
export async function GET(req: NextRequest) {
  const addr = req.nextUrl.searchParams.get("address")?.toLowerCase();
  if (!addr) {
    return NextResponse.json({ records: [] });
  }
  const records = await db.gameRecord.findMany({
    where: { playerAddress: addr },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return NextResponse.json({ records });
}
