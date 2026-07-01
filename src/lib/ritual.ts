// Ritual Testnet Configuration
// Ritual Chain is an AI-focused EVM-compatible L2
// Docs: https://docs.ritualfoundation.org
// Chain ID: 1979 | RPC: https://rpc.ritualfoundation.org

export const RITUAL_TESTNET = {
  chainId: "0x7bb", // 1979 in hex
  chainName: "Ritual Testnet",
  nativeCurrency: {
    name: "Ritual Token",
    symbol: "RITUAL",
    decimals: 18,
  },
  rpcUrls: ["https://rpc.ritualfoundation.org"],
  blockExplorerUrls: ["https://explorer.ritualfoundation.org"],
} as const;

export const RITUAL_CHAIN_ID_DECIMAL = 1979;

// Mock $CHEESE ERC-20 contract on Ritual testnet
// (In production this would be a real deployed contract address)
export const CHEESE_TOKEN = {
  address: "0xC4EE5E000000000000000000000000000000B4A3",
  symbol: "CHEESE",
  decimals: 18,
  // Faucet: every player gets 1000 CHEESE for free
  faucetAmount: "1000",
} as const;

// REAL deployed InferenceRegistry contract on Ritual testnet (chain 1979)
// Deployed via forge script — see /contracts/script/DeployInferenceRegistry.s.sol
// Function selector for recordGame(bytes32,uint8,bool,uint16) = 0xf7be6d12
export const INFERENCE_REGISTRY = {
  address: "0x7ce1d7BA8Cf307cC3c7e571577b5d94EFBB7560B",
  deployer: "0x0ABb3098Ebe1E5444fB7b185C0Ee790bD9A2b29A",
  deployedAtBlock: 0,
  functionSelector: "0xf7be6d12",
} as const;

export type WalletState = {
  address: string | null;
  chainId: string | null;
  isRitual: boolean;
  balance: string; // CHEESE balance (mock)
};

// Generate a pseudo "tx hash" for our mock on-chain interactions
export function mockTxHash(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  const hex = (Math.abs(h).toString(16) + Date.now().toString(16)).padStart(64, "0");
  return "0x" + hex.slice(0, 64);
}

// Generate a deterministic "inference hash" — simulates Ritual's verifiable inference proof
export function inferenceHash(payload: object): string {
  const json = JSON.stringify(payload);
  let h1 = 0x811c9dc5;
  let h2 = 0x1000193;
  for (let i = 0; i < json.length; i++) {
    const c = json.charCodeAt(i);
    h1 = (h1 ^ c) * 0x01000193 | 0;
    h2 = (h2 + c * 31 + i) | 0;
  }
  const p1 = (h1 >>> 0).toString(16).padStart(8, "0");
  const p2 = (h2 >>> 0).toString(16).padStart(8, "0");
  return ("0x" + p1 + p2 + "ff1a" + Date.now().toString(16).padStart(8, "0")).padEnd(66, "0").slice(0, 66);
}

// Add Ritual testnet to user's wallet
export async function addRitualTestnet(): Promise<boolean> {
  if (typeof window === "undefined" || !window.ethereum) return false;
  try {
    await window.ethereum.request({
      method: "wallet_addEthereumChain",
      params: [RITUAL_TESTNET],
    });
    return true;
  } catch (e) {
    console.error("Failed to add Ritual testnet:", e);
    return false;
  }
}

// Switch to Ritual testnet
export async function switchToRitual(): Promise<boolean> {
  if (typeof window === "undefined" || !window.ethereum) return false;
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: RITUAL_TESTNET.chainId }],
    });
    return true;
  } catch (e: any) {
    if (e?.code === 4902) {
      return addRitualTestnet();
    }
    return false;
  }
}
