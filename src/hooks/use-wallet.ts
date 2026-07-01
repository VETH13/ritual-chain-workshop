"use client";

import { useEffect, useState, useCallback } from "react";
import {
  RITUAL_TESTNET,
  RITUAL_CHAIN_ID_DECIMAL,
  switchToRitual,
  CHEESE_TOKEN,
} from "@/lib/ritual";

declare global {
  interface Window {
    ethereum?: any;
  }
}

export type Wallet = {
  address: string | null;
  chainId: string | null;
  isRitual: boolean;
  connected: boolean;
};

export function useWallet() {
  const [wallet, setWallet] = useState<Wallet>({
    address: null,
    chainId: null,
    isRitual: false,
    connected: false,
  });
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (typeof window === "undefined" || !window.ethereum) return;
    try {
      const accounts: string[] = await window.ethereum.request({
        method: "eth_accounts",
      });
      const chainId: string = await window.ethereum.request({
        method: "eth_chainId",
      });
      const addr = accounts?.[0] ?? null;
      setWallet({
        address: addr,
        chainId,
        isRitual:
          chainId?.toLowerCase() === RITUAL_TESTNET.chainId.toLowerCase(),
        connected: !!addr,
      });
    } catch (e) {
      // ignore
    }
  }, []);

  useEffect(() => {
    refresh();
    if (typeof window === "undefined" || !window.ethereum) return;
    const handleAccounts = () => refresh();
    const handleChain = () => refresh();
    window.ethereum.on?.("accountsChanged", handleAccounts);
    window.ethereum.on?.("chainChanged", handleChain);
    return () => {
      window.ethereum?.removeListener?.("accountsChanged", handleAccounts);
      window.ethereum?.removeListener?.("chainChanged", handleChain);
    };
  }, [refresh]);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      if (typeof window === "undefined" || !window.ethereum) {
        setError(
          "No EVM wallet found. Install MetaMask or any EVM wallet extension."
        );
        return;
      }
      const accounts: string[] = await window.ethereum.request({
        method: "eth_requestAccounts",
      });
      const chainId: string = await window.ethereum.request({
        method: "eth_chainId",
      });
      const addr = accounts?.[0] ?? null;
      setWallet({
        address: addr,
        chainId,
        isRitual:
          chainId?.toLowerCase() === RITUAL_TESTNET.chainId.toLowerCase(),
        connected: !!addr,
      });
      // Auto-switch to Ritual testnet
      if (
        chainId?.toLowerCase() !== RITUAL_TESTNET.chainId.toLowerCase()
      ) {
        await switchToRitual();
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to connect wallet");
    } finally {
      setConnecting(false);
    }
  }, []);

  const ensureRitual = useCallback(async () => {
    if (
      wallet.chainId?.toLowerCase() !== RITUAL_TESTNET.chainId.toLowerCase()
    ) {
      return await switchToRitual();
    }
    return true;
  }, [wallet.chainId]);

  return { wallet, connect, connecting, error, refresh, ensureRitual };
}

// Helper to truncate an ethereum address
export function shortAddr(addr: string | null, head = 6, tail = 4): string {
  if (!addr) return "";
  if (addr.length < head + tail + 2) return addr;
  return `${addr.slice(0, head)}...${addr.slice(-tail)}`;
}
