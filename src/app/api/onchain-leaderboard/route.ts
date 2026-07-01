import { NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { RITUAL_TESTNET_RPC } from "@/lib/onchain";
import { INFERENCE_REGISTRY } from "@/lib/ritual";

// GET /api/onchain-leaderboard
// Reads records directly from the InferenceRegistry contract on Ritual testnet
// and merges with local DB for X handle / avatar enrichment.
//
// The contract stores records per-player. To build a leaderboard we:
//   1. Query totalRecords() to know how many records exist
//   2. Query getRecordCount() for each known player (from local DB)
//   3. Merge with local Player table for avatars/handles
//
// Note: the contract doesn't expose a global iterator, so we rely on the local
// DB to enumerate known players. For a fully trustless leaderboard, you'd add
// a getter or use event indexing.

export async function GET() {
  await ensureSchema();
  try {
    // 1. Get total on-chain records
    const totalResp = await fetch(RITUAL_TESTNET_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [
          { to: INFERENCE_REGISTRY.address, data: "0x125f8974" }, // totalRecords() selector
          "latest",
        ],
      }),
    });
    const totalData = await totalResp.json();
    const totalRecordsHex = totalData?.result ?? "0x0";
    const totalOnchainRecords = parseInt(totalRecordsHex, 16) || 0;

    // 2. Get all players from local DB who have wallet addresses
    const players = await db.player.findMany({
      where: { walletAddress: { not: null } },
      select: { xHandle: true, xAvatarUrl: true, walletAddress: true },
    });

    // 3. For each player, query getRecordCount(address)
    const playerRecords = await Promise.all(
      players.map(async (p) => {
        if (!p.walletAddress) return null;
        try {
          // getRecordCount(address) selector: 0x2f63bd6a + padded address
          const addrPadded = p.walletAddress
            .replace(/^0x/, "")
            .toLowerCase()
            .padStart(64, "0");
          const data = "0x2f63bd6a" + addrPadded;
          const resp = await fetch(RITUAL_TESTNET_RPC, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "eth_call",
              params: [{ to: INFERENCE_REGISTRY.address, data }, "latest"],
            }),
          });
          const json = await resp.json();
          const count = parseInt(json?.result ?? "0x0", 16) || 0;

          // Also fetch the latest record for this player
          // getLatestRecord(address) selector: 0xe8a3f4b9 (computed via cast sig)
          // Actually let me use the simpler approach: query local DB for the latest
          const localRecords = await db.gameRecord.findMany({
            where: { playerAddress: p.walletAddress.toLowerCase() },
            orderBy: { createdAt: "desc" },
            take: 1,
          });
          const latest = localRecords[0];
          return {
            handle: p.xHandle,
            avatar: p.xAvatarUrl,
            wallet: p.walletAddress,
            onchainCount: count,
            bestSurviveMs: latest?.survivedMs ?? 0,
            cheeseCollected: latest?.cheeseCollected ?? 0,
            lastDifficulty: latest?.difficulty ?? "—",
            lastCaught: latest?.caught ?? false,
          };
        } catch {
          return null;
        }
      })
    );

    const valid = playerRecords
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .filter((x) => x.onchainCount > 0)
      .sort((a, b) => {
        // Sort by on-chain count desc, then by best survive
        if (b.onchainCount !== a.onchainCount) {
          return b.onchainCount - a.onchainCount;
        }
        return b.bestSurviveMs - a.bestSurviveMs;
      });

    return NextResponse.json({
      totalOnchainRecords,
      contractAddress: INFERENCE_REGISTRY.address,
      leaderboard: valid,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Failed to fetch on-chain leaderboard" },
      { status: 500 }
    );
  }
}
