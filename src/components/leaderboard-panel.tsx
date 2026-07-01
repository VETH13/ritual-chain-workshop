"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, Loader2, ExternalLink, Link2 } from "lucide-react";
import { INFERENCE_REGISTRY } from "@/lib/ritual";
import type { Dict } from "@/lib/i18n";

type OnchainEntry = {
  handle: string;
  avatar?: string | null;
  wallet: string;
  onchainCount: number;
  bestSurviveMs: number;
  cheeseCollected: number;
  lastDifficulty: string;
  lastCaught: boolean;
};

type Props = { t: Dict };

export function LeaderboardPanel({ t }: Props) {
  const [data, setData] = useState<{
    totalOnchainRecords: number;
    contractAddress: string;
    leaderboard: OnchainEntry[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const r = await fetch("/api/onchain-leaderboard");
        const j = await r.json();
        if (mounted) setData(j);
      } catch {
        // ignore
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    const interval = setInterval(load, 10000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="space-y-4">
      {/* On-chain stats */}
      <Card className="border-emerald-500/30 bg-gradient-to-br from-emerald-950/40 to-slate-950/80 backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-emerald-300">
            <Link2 className="h-5 w-5" />
            {t.onchainRecords}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500">
                {t.totalAnchored}
              </p>
              <p className="font-mono text-3xl font-bold text-emerald-300">
                {data?.totalOnchainRecords ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500">
                Contract
              </p>
              <a
                href={`https://explorer.ritualfoundation.org/address/${INFERENCE_REGISTRY.address}`}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-xs text-cyan-400 hover:underline break-all"
              >
                {INFERENCE_REGISTRY.address.slice(0, 10)}...
                {INFERENCE_REGISTRY.address.slice(-8)}{" "}
                <ExternalLink className="inline h-3 w-3" />
              </a>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Leaderboard */}
      <Card className="border-amber-400/30 bg-slate-950/60 backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-amber-300">
            <Trophy className="h-5 w-5" />
            {t.leaderboard}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
            </div>
          ) : !data || data.leaderboard.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              {t.noSurvivors}
            </p>
          ) : (
            <div className="space-y-2">
              {data.leaderboard.slice(0, 20).map((e, i) => (
                <div
                  key={e.wallet}
                  className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/40 p-3 hover:border-amber-500/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                        i === 0
                          ? "bg-amber-400 text-black"
                          : i === 1
                          ? "bg-slate-300 text-black"
                          : i === 2
                          ? "bg-amber-700 text-white"
                          : "bg-slate-700 text-slate-300"
                      }`}
                    >
                      {i + 1}
                    </span>
                    {e.avatar && (
                      <img
                        src={e.avatar}
                        alt={e.handle}
                        className="h-9 w-9 rounded-full border border-amber-500/30"
                      />
                    )}
                    <div>
                      <p className="font-mono text-sm font-bold text-amber-200">
                        @{e.handle}
                      </p>
                      <p className="text-[10px] text-slate-500 font-mono">
                        {e.wallet.slice(0, 8)}...{e.wallet.slice(-6)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <div className="text-center">
                      <p className="text-emerald-300 font-bold text-lg">{e.onchainCount}</p>
                      <p className="text-[9px] text-slate-500">on-chain</p>
                    </div>
                    <div className="text-center">
                      <p className="text-cyan-300 font-bold text-lg">
                        {(e.bestSurviveMs / 1000).toFixed(1)}s
                      </p>
                      <p className="text-[9px] text-slate-500">survived</p>
                    </div>
                    <div className="text-center">
                      <p className="text-amber-300 font-bold text-lg">
                        🧀{e.cheeseCollected}
                      </p>
                      <p className="text-[9px] text-slate-500">cheese</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
