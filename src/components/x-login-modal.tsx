"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Twitter, Loader2, Wallet, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

type Props = {
  onLogin: (handle: string) => Promise<boolean>;
  loading: boolean;
};

export function XLoginModal({ onLogin, loading }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"choose" | "x" | "okx">("choose");
  const [handle, setHandle] = useState("");
  const [okxLoading, setOkxLoading] = useState(false);

  const submitX = async () => {
    const clean = handle.replace(/^@/, "").trim();
    if (!clean) {
      toast.error("Please enter your X handle");
      return;
    }
    if (!/^[a-zA-Z0-9_]{1,15}$/.test(clean)) {
      toast.error("Invalid X handle (max 15 chars, alphanumeric + underscore)");
      return;
    }
    const ok = await onLogin(clean);
    if (ok) {
      closeModal();
    }
  };

  const loginOKX = async () => {
    setOkxLoading(true);
    try {
      const okxwallet = (window as any).okxwallet;
      if (!okxwallet) {
        toast.error("OKX wallet not found. Install the OKX extension.");
        window.open("https://www.okx.com/web3", "_blank");
        return;
      }
      const accounts: string[] = await okxwallet.request({
        method: "eth_requestAccounts",
      });
      const addr = accounts?.[0];
      if (!addr) {
        toast.error("No OKX account found");
        return;
      }
      // Use wallet address as handle (shortened for display)
      // Avatar: use a generated blockie-style avatar via dicebear API
      const shortAddr = addr.toLowerCase();
      const ok = await onLogin(`okx:${shortAddr}`);
      if (ok) {
        closeModal();
      }
    } catch (e: any) {
      toast.error(e?.message ?? "OKX login failed");
    } finally {
      setOkxLoading(false);
    }
  };

  const closeModal = () => {
    setOpen(false);
    setHandle("");
    setMode("choose");
  };

  return (
    <>
      <Button
        onClick={() => {
          setOpen(true);
          setMode("choose");
        }}
        className="gap-2 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 shadow-lg shadow-sky-500/30"
      >
        <Twitter className="h-4 w-4" />
        Login
      </Button>
      <Dialog open={open} onOpenChange={(o) => { if (!o) closeModal(); else setOpen(o); }}>
        <DialogContent className="border-sky-500/30 bg-slate-950/95 backdrop-blur-xl">
          {mode === "choose" && (
            <>
              <DialogHeader>
                <DialogTitle className="text-sky-300">
                  Choose login method
                </DialogTitle>
                <DialogDescription>
                  Login to use your avatar as the in-game character, unlock PvP,
                  and add friends.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <button
                  onClick={() => setMode("x")}
                  className="group flex w-full items-center gap-3 rounded-xl border border-sky-500/30 bg-sky-500/5 p-4 text-left hover:border-sky-500/60 hover:bg-sky-500/10 transition-all"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-blue-600">
                    <Twitter className="h-5 w-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="font-mono text-sm font-bold text-sky-200">
                      Login with X
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Use your X (Twitter) handle + avatar
                    </p>
                  </div>
                  <span className="text-slate-500 group-hover:text-sky-300">→</span>
                </button>
                <button
                  onClick={() => setMode("okx")}
                  className="group flex w-full items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-left hover:border-emerald-500/60 hover:bg-emerald-500/10 transition-all"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-lg font-bold text-white">
                    OKX
                  </div>
                  <div className="flex-1">
                    <p className="font-mono text-sm font-bold text-emerald-200">
                      Login with OKX Wallet
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Use your OKX wallet address + generated avatar
                    </p>
                  </div>
                  <span className="text-slate-500 group-hover:text-emerald-300">→</span>
                </button>
              </div>
            </>
          )}

          {mode === "x" && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-sky-300">
                  <Twitter className="h-5 w-5" />
                  Connect your X account
                </DialogTitle>
                <DialogDescription>
                  Enter your X (Twitter) handle to use your avatar as the in-game
                  character and unlock PvP matchmaking with friends.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="x-handle" className="text-slate-300">
                    X Handle
                  </Label>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500">@</span>
                    <Input
                      id="x-handle"
                      value={handle}
                      onChange={(e) => setHandle(e.target.value)}
                      placeholder="elonmusk"
                      className="border-slate-700 bg-slate-900/60 font-mono text-sky-100"
                      onKeyDown={(e) => e.key === "Enter" && submitX()}
                      autoFocus
                    />
                  </div>
                  <p className="text-[11px] text-slate-500">
                    We fetch your public avatar via unavatar.io. No password, no
                    OAuth needed for demo.
                  </p>
                </div>
                <Button
                  onClick={submitX}
                  disabled={loading}
                  className="w-full gap-2 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Twitter className="h-4 w-4" />
                  )}
                  {loading ? "Connecting..." : "Connect & Play"}
                </Button>
                <button
                  onClick={() => setMode("choose")}
                  className="flex w-full items-center justify-center gap-1 text-xs text-slate-500 hover:text-slate-300"
                >
                  <ArrowLeft className="h-3 w-3" />
                  Back
                </button>
              </div>
            </>
          )}

          {mode === "okx" && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-emerald-300">
                  <Wallet className="h-5 w-5" />
                  Connect OKX Wallet
                </DialogTitle>
                <DialogDescription>
                  Connect your OKX wallet to use it as your identity. A unique
                  avatar will be generated from your wallet address.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-lg font-bold text-white">
                      OKX
                    </div>
                    <div className="flex-1">
                      <p className="font-mono text-sm font-bold text-emerald-200">
                        OKX Web3 Wallet
                      </p>
                      <p className="text-[11px] text-slate-400">
                        Multi-chain wallet (EVM, BTC, Solana, etc.)
                      </p>
                    </div>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500">
                  Clicking below will open your OKX wallet extension. We&apos;ll
                  use your wallet address as your unique handle, and generate an
                  avatar from it (no X account needed).
                </p>
                <Button
                  onClick={loginOKX}
                  disabled={okxLoading || loading}
                  className="w-full gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500"
                >
                  {okxLoading || loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Wallet className="h-4 w-4" />
                  )}
                  {okxLoading || loading ? "Connecting..." : "Connect OKX Wallet"}
                </Button>
                <button
                  onClick={() => setMode("choose")}
                  className="flex w-full items-center justify-center gap-1 text-xs text-slate-500 hover:text-slate-300"
                >
                  <ArrowLeft className="h-3 w-3" />
                  Back
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
