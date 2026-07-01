import { NextRequest, NextResponse } from "next/server";
import {
  encodeRecordGameCall,
  isRealTxHash,
  verifyRitualTx,
  RITUAL_TESTNET_RPC,
} from "@/lib/onchain";
import { INFERENCE_REGISTRY } from "@/lib/ritual";

// POST /api/onchain-submit
// Body: { inferenceHash, difficulty, survived, cheeseCollected, playerAddress, txHash? }
//
// Two modes:
// 1. PRE-SUBMIT (no txHash): returns the encoded calldata + contract address
//    so the client can call eth_sendTransaction via its wallet.
// 2. VERIFY (with txHash): verifies the tx on Ritual testnet RPC.

const DIFF_MAP: Record<string, number> = {
  kitten: 0,
  hunter: 1,
  strategist: 2,
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      inferenceHash,
      difficulty,
      survived,
      cheeseCollected,
      playerAddress,
      txHash,
    } = body;

    if (!playerAddress || !difficulty) {
      return NextResponse.json(
        { error: "Missing playerAddress or difficulty" },
        { status: 400 }
      );
    }

    // Mode 2: verify a submitted tx
    if (txHash && isRealTxHash(txHash)) {
      const receipt = await verifyRitualTx(txHash);
      return NextResponse.json({
        txHash,
        verified: receipt.confirmed,
        status: receipt.status,
        blockNumber: receipt.blockNumber,
        explorer: `https://explorer.ritualfoundation.org/tx/${txHash}`,
      });
    }

    // Mode 1: return calldata for client to submit via wallet
    const diffNum = DIFF_MAP[difficulty] ?? 1;
    const data = encodeRecordGameCall(
      inferenceHash || "0x",
      diffNum,
      Boolean(survived),
      Number(cheeseCollected) || 0
    );

    // Contract is now deployed on Ritual testnet (chain 1979).
    // The client uses `to` + `data` + `from` to call eth_sendTransaction
    // via window.ethereum. The wallet will return a real txHash.
    return NextResponse.json({
      to: INFERENCE_REGISTRY.address,
      data,
      from: playerAddress,
      rpcUrl: RITUAL_TESTNET_RPC,
      chainId: "0x7bb", // 1979
      explorer: "https://explorer.ritualfoundation.org",
      // No mock txHash — client must submit and get a real one back.
      // The presence of `to` + `data` tells the client to fire a real tx.
      needsWalletSubmit: true,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "onchain submit failed" },
      { status: 500 }
    );
  }
}
