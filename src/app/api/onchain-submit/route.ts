import { NextRequest, NextResponse } from "next/server";
import {
  encodeRecordGameCall,
  toBytes32,
  isRealTxHash,
  verifyRitualTx,
} from "@/lib/onchain";

// POST /api/onchain-submit
// Body: { inferenceHash, difficulty, survived, cheeseCollected, playerAddress, txHash? }
//
// Two modes:
// 1. PRE-SUBMIT (no txHash): returns the encoded calldata + contract address
//    so the client can call eth_sendTransaction via its wallet.
// 2. VERIFY (with txHash): verifies the tx on Ritual testnet RPC.
//
// In dev mode, the contract isn't deployed so we just return a mock txHash.

const REGISTRY_ADDRESS = "0x1NFEE00000000000000000000000000000000000";

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

    // Generate a deterministic mock txHash for dev mode.
    // We prefix with many zeros so isRealTxHash() recognizes it as a mock
    // (avoiding unnecessary RPC verification calls against an undeployed contract).
    const randomHex = Array.from(crypto.getRandomValues(new Uint8Array(8)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const mockHash = "0x" + "0".repeat(48) + randomHex.padStart(16, "0");

    return NextResponse.json({
      // In production with a real deployed contract, the client would use
      // `to` + `data` to call eth_sendTransaction via window.ethereum.
      // Here we return the mock txHash so the flow keeps working in dev.
      to: REGISTRY_ADDRESS,
      data,
      from: playerAddress,
      txHash: mockHash, // mock for dev mode
      mock: true,
      note: "Contract not deployed on Ritual testnet yet — returning mock txHash. Deploy InferenceRegistry and replace REGISTRY_ADDRESS to enable real anchoring.",
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "onchain submit failed" },
      { status: 500 }
    );
  }
}
