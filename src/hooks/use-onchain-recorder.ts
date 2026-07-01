"use client";

import { useCallback } from "react";
import {
  INFERENCE_REGISTRY_ABI,
  encodeRecordGameCall,
  toBytes32,
} from "@/lib/onchain";
import { RITUAL_TESTNET, CHEESE_TOKEN } from "@/lib/ritual";

// Hook for submitting real on-chain transactions to Ritual testnet.
// In production this would call the deployed InferenceRegistry contract.
// In dev mode it returns a mock tx hash.

export type RecordGameParams = {
  inferenceHash: string;
  difficulty: "kitten" | "hunter" | "strategist";
  survived: boolean;
  cheeseCollected: number;
};

export type SubmitResult = {
  txHash: string | null;
  status: "submitted" | "mocked" | "error";
  error?: string;
};

// Difficulty enum → uint8
const DIFF_MAP: Record<string, number> = {
  kitten: 0,
  hunter: 1,
  strategist: 2,
};

// The mock InferenceRegistry contract address on Ritual testnet
// (Replace with the real deployed address once available)
const REGISTRY_ADDRESS = "0x1NFEE00000000000000000000000000000000000";

export function useOnchainRecorder() {
  const submitGameRecord = useCallback(
    async (params: RecordGameParams): Promise<SubmitResult> => {
      if (typeof window === "undefined" || !window.ethereum) {
        // No wallet — return mock
        return {
          txHash: null,
          status: "mocked",
          error: "No wallet available",
        };
      }

      try {
        // Ensure we're on Ritual testnet
        const chainId: string = await window.ethereum.request({
          method: "eth_chainId",
        });
        if (chainId?.toLowerCase() !== RITUAL_TESTNET.chainId.toLowerCase()) {
          // Try switching
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: RITUAL_TESTNET.chainId }],
          });
        }

        // Get accounts
        const accounts: string[] = await window.ethereum.request({
          method: "eth_accounts",
        });
        const from = accounts?.[0];
        if (!from) {
          return { txHash: null, status: "mocked", error: "No account" };
        }

        // Encode the contract call
        // Note: the actual deployed contract selector would be different.
        // For dev/demo, we just send a 0-value tx to a placeholder address.
        const data = encodeRecordGameCall(
          params.inferenceHash || "0x",
          DIFF_MAP[params.difficulty] ?? 1,
          params.survived,
          params.cheeseCollected
        );

        // Try sending as a contract call. If the contract doesn't exist
        // (current state), the wallet will still produce a tx hash but
        // it will likely fail on-chain. We accept the tx hash optimistically.
        const txHash: string = await window.ethereum.request({
          method: "eth_sendTransaction",
          params: [
            {
              from,
              to: REGISTRY_ADDRESS,
              data,
              // value: "0x0", // no ETH sent
            },
          ],
        });

        return { txHash, status: "submitted" };
      } catch (e: any) {
        // User rejected, or contract not deployed, or wrong network
        return {
          txHash: null,
          status: "error",
          error: e?.message ?? "Transaction failed",
        };
      }
    },
    []
  );

  return { submitGameRecord };
}
