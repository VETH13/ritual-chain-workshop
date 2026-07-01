import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { mockTxHash } from "@/lib/ritual";
import { verifyRitualTx, isRealTxHash } from "@/lib/onchain";

// POST /api/game-record
// Body: {
//   playerAddress, difficulty, wagerAmount, survivedMs, cheeseCollected,
//   caught, inferenceHash,
//   txHash?  ← if provided and real, we verify it on Ritual testnet
// }
//
// If txHash is provided AND verifies on Ritual, we mark the record as
// "onchain_verified: true" and use the real txHash.
// Otherwise (dev/demo mode), we fall back to mockTxHash().

export async function POST(req: NextRequest) {
  await ensureSchema();
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
      txHash,
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

    // Determine the tx hash + verification status
    let ritualTxHash: string;
    let onchainVerified = false;
    let verifyStatus: string;

    if (txHash && isRealTxHash(txHash)) {
      // Real Ritual testnet tx — verify it actually mined
      const receipt = await verifyRitualTx(txHash);
      if (receipt.confirmed) {
        ritualTxHash = txHash;
        onchainVerified = true;
        verifyStatus = `verified on Ritual (block ${receipt.blockNumber})`;
      } else if (receipt.status === "pending") {
        // Tx submitted but not yet mined — accept optimistically, mark as pending
        ritualTxHash = txHash;
        onchainVerified = false;
        verifyStatus = "tx pending on Ritual";
      } else {
        // Tx not found or failed — reject
        return NextResponse.json(
          {
            error: `Transaction verification failed: ${receipt.status}`,
            txHash,
            status: receipt.status,
          },
          { status: 400 }
        );
      }
    } else {
      // Dev/demo mode — generate a mock tx hash
      ritualTxHash = mockTxHash(inferenceHash + playerAddress + Date.now());
      onchainVerified = false;
      verifyStatus = "mock (no txHash provided)";
    }

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
      onchainVerified,
      verifyStatus,
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
  await ensureSchema();
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
