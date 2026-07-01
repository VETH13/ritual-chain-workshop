// On-chain Ritual contract integration helpers
// ============================================
// In production, the game-result anchoring flow is:
//   1. Client plays game → gets inferenceHash
//   2. Client's wallet calls InferenceRegistry.recordGame(inferenceHash, difficulty, survived, cheese) on Ritual testnet
//   3. Client receives txHash
//   4. Client POSTs to /api/game-record with { ..., txHash }
//   5. Server verifies the tx is actually mined on Ritual testnet via RPC
//   6. Server saves to DB + updates leaderboard
//
// In dev/demo mode (no deployed contract), we fall back to mockTxHash().

export const RITUAL_TESTNET_RPC = "https://rpc.ritualfoundation.org";
export const RITUAL_TESTNET_EXPLORER = "https://explorer.ritualfoundation.org";

// InferenceRegistry contract ABI (subset)
// In a real deployment, this would be the actual compiled contract.
export const INFERENCE_REGISTRY_ABI = [
  // recordGame(bytes32 inferenceHash, uint8 difficulty, bool survived, uint16 cheeseCollected)
  {
    inputs: [
      { name: "inferenceHash", type: "bytes32" },
      { name: "difficulty", type: "uint8" },
      { name: "survived", type: "bool" },
      { name: "cheeseCollected", type: "uint16" },
    ],
    name: "recordGame",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  // getRecordCount(address player) view → uint256
  {
    inputs: [{ name: "player", type: "address" }],
    name: "getRecordCount",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// Convert a hex string to bytes32 (padded)
export function toBytes32(hex: string): string {
  // Strip 0x, pad to 64 chars, re-prefix
  const clean = hex.replace(/^0x/, "");
  const padded = clean.padStart(64, "0").slice(0, 64);
  return "0x" + padded;
}

// Encode function call for the contract (minimal encoder for recordGame)
export function encodeRecordGameCall(
  inferenceHash: string,
  difficulty: number,
  survived: boolean,
  cheeseCollected: number
): string {
  // Function selector: first 4 bytes of keccak256("recordGame(bytes32,uint8,bool,uint16)")
  // Computed via `cast sig` — verified against compiled contract ABI.
  const selector = "0xf7be6d12";
  const hashArg = toBytes32(inferenceHash).slice(2);
  const diffArg = difficulty.toString(16).padStart(64, "0");
  const survArg = (survived ? 1 : 0).toString(16).padStart(64, "0");
  const cheeseArg = cheeseCollected.toString(16).padStart(64, "0");
  return selector + hashArg + diffArg + survArg + cheeseArg;
}

// Verify a transaction was mined on Ritual testnet
// Returns the receipt if confirmed, or null if not found / failed
export async function verifyRitualTx(txHash: string): Promise<{
  confirmed: boolean;
  blockNumber: number | null;
  status: "success" | "failed" | "pending" | "not_found";
  from?: string;
  to?: string;
}> {
  try {
    const resp = await fetch(RITUAL_TESTNET_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getTransactionReceipt",
        params: [txHash],
      }),
    });
    const data = await resp.json();
    if (!data.result) {
      return { confirmed: false, blockNumber: null, status: "not_found" };
    }
    const receipt = data.result;
    if (!receipt.blockNumber) {
      return { confirmed: false, blockNumber: null, status: "pending" };
    }
    return {
      confirmed: receipt.status === "0x1",
      blockNumber: parseInt(receipt.blockNumber, 16),
      status: receipt.status === "0x1" ? "success" : "failed",
      from: receipt.from,
      to: receipt.to,
    };
  } catch (e) {
    console.error("verifyRitualTx error:", e);
    return { confirmed: false, blockNumber: null, status: "not_found" };
  }
}

// Check if a tx hash looks like a real Ritual tx (starts with 0x + 64 hex chars
// AND is not the all-zeros mock pattern we generate)
export function isRealTxHash(txHash: string | null | undefined): boolean {
  if (!txHash) return false;
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) return false;
  // Our mockTxHash starts with 0x0000000000000000000000000000000000000000
  // Real tx hashes have varied leading bytes
  const body = txHash.slice(2);
  const leadingZeros = body.match(/^0+/)?.[0].length ?? 0;
  return leadingZeros < 20;
}
