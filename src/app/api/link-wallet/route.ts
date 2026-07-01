import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST /api/link-wallet
// Body: { handle, walletAddress }
// Links a wallet address to an X player profile so their on-chain records
// show up in the leaderboard.
export async function POST(req: NextRequest) {
  try {
    const { handle, walletAddress } = await req.json();
    if (!handle || !walletAddress) {
      return NextResponse.json(
        { error: "Missing handle or walletAddress" },
        { status: 400 }
      );
    }
    const clean = handle.replace(/^@/, "").trim().toLowerCase();
    const addr = walletAddress.toLowerCase();

    const player = await db.player.update({
      where: { xHandle: clean },
      data: { walletAddress: addr },
    });

    // Also update existing GameRecords for this wallet to include the handle
    await db.gameRecord.updateMany({
      where: { playerAddress: addr, playerXHandle: null },
      data: { playerXHandle: clean },
    });

    // Update leaderboard entries
    const existing = await db.leaderboard.findUnique({ where: { id: addr } });
    if (existing) {
      await db.leaderboard.update({
        where: { id: addr },
        data: { playerXHandle: clean },
      });
    }

    return NextResponse.json({ ok: true, player });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Failed to link wallet" },
      { status: 500 }
    );
  }
}
