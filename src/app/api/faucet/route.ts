import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST /api/faucet — mint 1000 mock CHEESE tokens to player address
// (In production, this would call the Ritual testnet faucet contract)
export async function POST(req: NextRequest) {
  try {
    const { address } = await req.json();
    if (!address) {
      return NextResponse.json({ error: "Missing address" }, { status: 400 });
    }
    // Mock balance tracking via leaderboard row
    const addr = address.toLowerCase();
    const existing = await db.leaderboard.findUnique({ where: { id: addr } });
    if (existing) {
      // Already claimed — return current state
      return NextResponse.json({
        ok: true,
        alreadyClaimed: true,
        balance: 1000,
        message: "You already claimed your 1000 CHEESE from faucet.",
      });
    }
    await db.leaderboard.create({
      data: {
        id: addr,
        playerAddress: addr,
        totalGames: 0,
        wins: 0,
        totalCheese: 0,
        bestSurviveMs: 0,
      },
    });
    return NextResponse.json({
      ok: true,
      balance: 1000,
      message: "Claimed 1000 CHEESE from Ritual testnet faucet.",
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "faucet failed" },
      { status: 500 }
    );
  }
}
