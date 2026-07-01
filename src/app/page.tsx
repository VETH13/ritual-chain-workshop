"use client";

import { useEffect, useState, useCallback } from "react";
import { useWallet, shortAddr } from "@/hooks/use-wallet";
import { useLang } from "@/hooks/use-lang";
import {
  RITUAL_TESTNET,
  CHEESE_TOKEN,
  mockTxHash,
} from "@/lib/ritual";
import { DIFFICULTY_CONFIG, Difficulty } from "@/lib/game";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Wallet,
  Zap,
  Trophy,
  Coins,
  Crosshair,
  Mouse as MouseIcon,
  Cat,
  Sparkles,
  Github,
  ExternalLink,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Flame,
  Languages,
} from "lucide-react";
import { toast } from "sonner";
import GameCanvas from "@/components/game/game-canvas";
import type { Dict } from "@/lib/i18n";

type TfFn = (key: keyof Dict, vars?: Record<string, string | number>) => string;

type Screen = "start" | "playing" | "ended";
type LiveSnap = {
  elapsed: number;
  score: number;
  inferenceCount: number;
  catStrategy: string;
  catConfidence: number;
  speedBoost: boolean;
  inHole: boolean;
};

type GameResult = {
  survivedMs: number;
  cheeseCollected: number;
  caught: boolean;
  inferenceHash: string | null;
  inferenceCount: number;
};

type LeaderboardEntry = {
  id: string;
  playerAddress: string;
  totalGames: number;
  wins: number;
  totalCheese: number;
  bestSurviveMs: number;
};

type GameHistoryItem = {
  id: string;
  difficulty: string;
  wagerAmount: number;
  survivedMs: number;
  cheeseCollected: number;
  caught: boolean;
  payoutAmount: number;
  inferenceHash: string;
  ritualTxHash: string | null;
  createdAt: string;
};

const GAME_DURATION = 60_000;
const STARTING_CHEESE = 1000;

export default function Home() {
  const { wallet, connect, connecting, error, ensureRitual } = useWallet();
  const { lang, toggle, t, tf } = useLang();
  const [screen, setScreen] = useState<Screen>("start");
  const [difficulty, setDifficulty] = useState<Difficulty>("hunter");
  const [wagerAmount, setWagerAmount] = useState<number>(50);
  const [balance, setBalance] = useState<number>(STARTING_CHEESE);
  const [paused, setPaused] = useState(false);
  const [live, setLive] = useState<LiveSnap>({
    elapsed: 0,
    score: 0,
    inferenceCount: 0,
    catStrategy: "—",
    catConfidence: 0,
    speedBoost: false,
    inHole: false,
  });
  const [result, setResult] = useState<GameResult | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [payout, setPayout] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [history, setHistory] = useState<GameHistoryItem[]>([]);
  const [claimed, setClaimed] = useState(false);
  const [bestStreak, setBestStreak] = useState(0);
  const [streak, setStreak] = useState(0);

  // Load leaderboard on mount
  useEffect(() => {
    refreshLeaderboard();
  }, []);

  const refreshLeaderboard = useCallback(async () => {
    try {
      const r = await fetch("/api/leaderboard");
      const j = await r.json();
      setLeaderboard(j.leaderboard ?? []);
    } catch {
      // ignore
    }
  }, []);

  // Load player history & balance when wallet connects
  useEffect(() => {
    if (wallet.address) {
      refreshHistory(wallet.address);
    }
  }, [wallet.address]);

  const refreshHistory = useCallback(async (addr: string) => {
    try {
      const r = await fetch(`/api/game-record?address=${addr}`);
      const j = await r.json();
      const recs: GameHistoryItem[] = j.records ?? [];
      setHistory(recs);
      // Compute balance: start - wagers + payouts
      let bal = STARTING_CHEESE;
      let best = 0;
      let cur = 0;
      // Records come back newest-first; iterate oldest-first so streak ends at "now"
      const chronological = [...recs].reverse();
      for (const rec of chronological) {
        bal -= rec.wagerAmount;
        bal += rec.payoutAmount;
        if (!rec.caught) {
          cur += 1;
          best = Math.max(best, cur);
        } else {
          cur = 0;
        }
      }
      setBalance(Math.max(0, bal));
      setStreak(cur);
      setBestStreak(best);
    } catch {
      // ignore
    }
  }, []);

  // Claim faucet
  const claimFaucet = useCallback(async () => {
    if (!wallet.address) return;
    try {
      const r = await fetch("/api/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: wallet.address }),
      });
      const j = await r.json();
      if (j.ok) {
        setClaimed(true);
        setBalance(STARTING_CHEESE);
        toast.success(j.message);
      } else {
        toast.error(j.error || t.faucetClaimFailed);
      }
    } catch (e: any) {
      toast.error(e?.message ?? t.faucetFailed);
    }
  }, [wallet.address, t]);

  // Start a new game
  const startGame = useCallback(async () => {
    if (!wallet.address) {
      toast.error(t.connectFirst);
      return;
    }
    if (!wallet.isRitual) {
      const ok = await ensureRitual();
      if (!ok) {
        toast.error(t.switchToRitual);
        return;
      }
    }
    if (wagerAmount > balance) {
      toast.error(t.insufficientCheese);
      return;
    }
    setResult(null);
    setTxHash(null);
    setPayout(0);
    setLive({
      elapsed: 0,
      score: 0,
      inferenceCount: 0,
      catStrategy: "—",
      catConfidence: 0,
      speedBoost: false,
      inHole: false,
    });
    setScreen("playing");
  }, [wallet, ensureRitual, wagerAmount, balance, t]);

  // Called when game ends
  const handleGameEnd = useCallback(
    async (r: GameResult) => {
      setResult(r);
      setScreen("ended");
      setSubmitting(true);
      try {
        const resp = await fetch("/api/game-record", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            playerAddress: wallet.address,
            difficulty,
            wagerAmount,
            survivedMs: r.survivedMs,
            cheeseCollected: r.cheeseCollected,
            caught: r.caught,
            inferenceHash: r.inferenceHash,
          }),
        });
        const j = await resp.json();
        if (j.ok) {
          setTxHash(j.ritualTxHash);
          setPayout(j.payoutAmount);
          if (j.won) {
            setStreak((s) => {
              const ns = s + 1;
              setBestStreak((b) => Math.max(b, ns));
              return ns;
            });
            setBalance((b) => b - wagerAmount + j.payoutAmount);
            toast.success(tf("survived", { n: j.payoutAmount }));
          } else {
            setStreak(0);
            setBalance((b) => b - wagerAmount);
            toast.error(tf("caughtYou", { n: wagerAmount }));
          }
          if (wallet.address) refreshHistory(wallet.address);
          refreshLeaderboard();
        }
      } catch (e: any) {
        toast.error(e?.message ?? t.failedSave);
      } finally {
        setSubmitting(false);
      }
    },
    [wallet.address, difficulty, wagerAmount, refreshHistory, refreshLeaderboard, t, tf]
  );

  // Live update throttled
  const handleLiveUpdate = useCallback((s: LiveSnap) => {
    setLive(s);
  }, []);

  const cfg = DIFFICULTY_CONFIG[difficulty];
  const progressPct = Math.min(100, (live.elapsed / GAME_DURATION) * 100);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#070b18] via-[#0a0e1f] to-[#0d0418] text-slate-100">
      {/* Background grid pattern */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(124,159,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(124,159,255,0.4) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />
      {/* Top bar */}
      <header className="relative z-10 border-b border-rose-500/15 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            {/* Ritual logo badge */}
            <div className="relative">
              <img
                src="/logo-badge.png"
                alt="Ritual"
                className="h-10 w-10 rounded-lg shadow-[0_0_20px_rgba(0,102,51,0.6)] ring-1 ring-emerald-400/40"
              />
              <span className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-cyan-400 text-[11px] shadow ring-2 ring-slate-900">
                🐭
              </span>
              <span className="absolute -bottom-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-rose-500 text-[11px] shadow ring-2 ring-slate-900">
                🐱
              </span>
            </div>
            <div>
              <h1 className="font-mono text-lg font-bold tracking-tight">
                RITUAL CAT
                <span className="bg-gradient-to-r from-rose-400 to-cyan-400 bg-clip-text text-transparent">
                  {" "}
                  × CHAIN MOUSE
                </span>
              </h1>
              <p className="text-[11px] text-slate-400">
                {t.tagline}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Language toggle */}
            <button
              onClick={toggle}
              className="group flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900/60 px-2.5 py-1.5 text-xs font-mono text-slate-300 hover:border-rose-500/40 hover:text-rose-300 transition-colors"
              title={lang === "en" ? "切换到中文" : "Switch to English"}
            >
              <Languages className="h-3.5 w-3.5" />
              <span className={lang === "en" ? "font-bold text-rose-300" : "text-slate-500"}>EN</span>
              <span className="text-slate-600">/</span>
              <span className={lang === "zh" ? "font-bold text-rose-300" : "text-slate-500"}>中</span>
            </button>
            <Badge
              variant="outline"
              className="border-rose-500/30 bg-rose-500/10 text-rose-300"
            >
              <Flame className="mr-1 h-3 w-3" />
              {t.streak}: {streak} ({t.best} {bestStreak})
            </Badge>
            <Badge
              variant="outline"
              className="border-amber-400/30 bg-amber-400/10 text-amber-300"
            >
              <Coins className="mr-1 h-3 w-3" />
              {balance} CHEESE
            </Badge>
            <Button
              onClick={connect}
              disabled={connecting || wallet.connected}
              className="gap-2 bg-gradient-to-r from-rose-500 to-purple-600 hover:from-rose-400 hover:to-purple-500"
            >
              <Wallet className="h-4 w-4" />
              {wallet.connected
                ? shortAddr(wallet.address)
                : connecting
                ? t.connecting
                : t.connectWallet}
            </Button>
          </div>
        </div>
        {error && (
          <div className="border-t border-rose-500/20 bg-rose-500/10 px-4 py-2 text-center text-xs text-rose-300">
            {error}
          </div>
        )}
        {!wallet.isRitual && wallet.connected && (
          <div className="border-t border-amber-500/20 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-300">
            ⚠️ {t.wrongNetwork}
            <Button
              size="sm"
              variant="outline"
              className="ml-2 h-6 border-amber-400/40 text-amber-300"
              onClick={ensureRitual}
            >
              {t.switch}
            </Button>
          </div>
        )}
      </header>

      <main className="relative z-10 mx-auto max-w-7xl px-4 py-6">
        {screen === "start" && (
          <StartScreen
            difficulty={difficulty}
            setDifficulty={setDifficulty}
            wagerAmount={wagerAmount}
            setWagerAmount={setWagerAmount}
            balance={balance}
            wallet={wallet}
            onStart={startGame}
            onClaim={claimFaucet}
            claimed={claimed}
            leaderboard={leaderboard}
            history={history}
            t={t}
            tf={tf}
          />
        )}

        {screen === "playing" && (
          <PlayingScreen
            difficulty={difficulty}
            paused={paused}
            setPaused={setPaused}
            live={live}
            progressPct={progressPct}
            onEnd={handleGameEnd}
            onLiveUpdate={handleLiveUpdate}
            onAbort={() => {
              setScreen("start");
            }}
            t={t}
            tf={tf}
          />
        )}

        {screen === "ended" && result && (
          <EndedScreen
            result={result}
            difficulty={difficulty}
            wagerAmount={wagerAmount}
            txHash={txHash}
            payout={payout}
            submitting={submitting}
            onPlayAgain={() => {
              setScreen("start");
            }}
            t={t}
            tf={tf}
          />
        )}
      </main>

      <footer className="relative z-10 border-t border-slate-800 px-4 py-6 text-center text-xs text-slate-500">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 sm:flex-row">
          <p>
            {t.footerBuiltOn}{" "}
            <a
              href="https://ritual.net"
              target="_blank"
              rel="noreferrer"
              className="text-rose-400 hover:underline"
            >
              Ritual testnet
            </a>{" "}
            · {t.footerAi}{" "}
            <span className="text-cyan-400">z-ai-web-dev-sdk</span> ·{" "}
            {t.footerNotReal} 🧀
          </p>
          <div className="flex items-center gap-3">
            <a
              href="https://docs.ritual.net"
              target="_blank"
              rel="noreferrer"
              className="hover:text-slate-300"
            >
              {t.docs}
            </a>
            <span>·</span>
            <a
              href="https://explorer.testnet.ritual.net"
              target="_blank"
              rel="noreferrer"
              className="hover:text-slate-300"
            >
              {t.explorer}
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ---------------- Start Screen ---------------- */
function StartScreen({
  difficulty,
  setDifficulty,
  wagerAmount,
  setWagerAmount,
  balance,
  wallet,
  onStart,
  onClaim,
  claimed,
  leaderboard,
  history,
  t,
  tf,
}: {
  difficulty: Difficulty;
  setDifficulty: (d: Difficulty) => void;
  wagerAmount: number;
  setWagerAmount: (n: number) => void;
  balance: number;
  wallet: { connected: boolean; address: string | null; isRitual: boolean };
  onStart: () => void;
  onClaim: () => void;
  claimed: boolean;
  leaderboard: LeaderboardEntry[];
  history: GameHistoryItem[];
  t: Dict;
  tf: TfFn;
}) {
  const cfg = DIFFICULTY_CONFIG[difficulty];
  const diffLabel = (d: Difficulty) =>
    d === "kitten" ? t.kitten : d === "hunter" ? t.hunter : t.strategist;
  const diffDesc = (d: Difficulty) =>
    d === "kitten"
      ? t.kittenDesc
      : d === "hunter"
      ? t.hunterDesc
      : t.strategistDesc;
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Left: Hero & game */}
      <div className="lg:col-span-2 space-y-4">
        <Card className="overflow-hidden border-rose-500/30 bg-gradient-to-br from-slate-900/80 to-purple-950/40 backdrop-blur">
          <CardHeader>
            <Badge className="w-fit gap-1 border-rose-500/40 bg-rose-500/10 text-rose-300">
              <Sparkles className="h-3 w-3" /> {t.badgeOnchain}
            </Badge>
            <CardTitle className="font-mono text-3xl tracking-tight">
              {t.heroTitleA}
              <span className="bg-gradient-to-r from-rose-400 to-amber-300 bg-clip-text text-transparent">
                {t.heroTitleAEmph}
              </span>
              {t.heroTitleB}
              <span className="bg-gradient-to-r from-cyan-400 to-emerald-300 bg-clip-text text-transparent">
                {t.heroTitleBEmph}
              </span>
              {t.heroTitleC}
            </CardTitle>
            <CardDescription className="text-slate-300">
              {t.heroDesc}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Difficulty picker */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                {t.choosePredator}
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {(Object.keys(DIFFICULTY_CONFIG) as Difficulty[]).map((d) => {
                  const c = DIFFICULTY_CONFIG[d];
                  const active = difficulty === d;
                  return (
                    <button
                      key={d}
                      onClick={() => setDifficulty(d)}
                      className={`group rounded-lg border p-3 text-left transition-all ${
                        active
                          ? "border-rose-500 bg-rose-500/10 shadow-[0_0_20px_rgba(255,77,109,0.2)]"
                          : "border-slate-700 bg-slate-900/40 hover:border-rose-500/40 hover:bg-slate-900/70"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-2xl">{c.emoji}</span>
                        <span className="font-mono text-xs text-amber-300">
                          {c.payoutMultiplier}x
                        </span>
                      </div>
                      <div className="mt-1 font-mono text-sm font-bold">
                        {diffLabel(d)}
                      </div>
                      <div className="text-[11px] leading-snug text-slate-400">
                        {diffDesc(d)}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Wager slider */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {t.wagerLabel}
                </p>
                <p className="font-mono text-sm text-amber-300">
                  {wagerAmount} → {t.winAmount}{" "}
                  {Math.floor(wagerAmount * cfg.payoutMultiplier)}
                </p>
              </div>
              <input
                type="range"
                min={10}
                max={Math.min(500, Math.max(10, balance))}
                step={10}
                value={wagerAmount}
                onChange={(e) => setWagerAmount(Number(e.target.value))}
                className="w-full accent-rose-500"
              />
              <div className="mt-1 flex justify-between text-[10px] text-slate-500">
                <span>10</span>
                <span>
                  {t.balanceLabel}: {balance}
                </span>
                <span>{Math.min(500, Math.max(10, balance))}</span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={onStart}
                disabled={!wallet.connected}
                className="gap-2 bg-gradient-to-r from-rose-500 to-purple-600 text-base font-bold hover:from-rose-400 hover:to-purple-500"
                size="lg"
              >
                <Crosshair className="h-5 w-5" />
                {t.startHunt}
              </Button>
              {wallet.connected && balance === 0 && !claimed && (
                <Button
                  onClick={onClaim}
                  variant="outline"
                  className="gap-2 border-amber-400/40 text-amber-300"
                >
                  <Coins className="h-4 w-4" />
                  {t.claimFaucet}
                </Button>
              )}
              {!wallet.connected && (
                <p className="text-xs text-slate-400">🔗 {t.connectToPlay}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* How to play */}
        <Card className="border-cyan-500/20 bg-slate-900/60 backdrop-blur">
          <CardHeader>
            <CardTitle className="font-mono text-lg">{t.howToPlay}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <HowToPlayItem icon="WASD" title={t.move} desc={t.moveDesc} />
            <HowToPlayItem
              icon="🧀"
              title={t.collectCheese}
              desc={t.collectCheeseDesc}
            />
            <HowToPlayItem
              icon="🕳️"
              title={t.hideInHoles}
              desc={t.hideInHolesDesc}
            />
            <HowToPlayItem
              icon="⚡"
              title={t.grabBoosts}
              desc={t.grabBoostsDesc}
            />
            <HowToPlayItem
              icon="SPACE"
              title={t.dropDecoy}
              desc={t.dropDecoyDesc}
            />
            <HowToPlayItem
              icon="⏱️"
              title={t.survive60s}
              desc={t.survive60sDesc}
            />
            <HowToPlayItem
              icon="🧠"
              title={t.aiInference}
              desc={t.aiInferenceDesc}
            />
            <HowToPlayItem
              icon="💰"
              title={t.multiplierPayout}
              desc={t.multiplierPayoutDesc}
            />
          </CardContent>
        </Card>
      </div>

      {/* Right: Leaderboard & history */}
      <div className="space-y-4">
        <Card className="border-amber-400/20 bg-slate-900/60 backdrop-blur">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 font-mono text-base">
              <Trophy className="h-4 w-4 text-amber-400" />
              {t.leaderboard}
            </CardTitle>
            <CardDescription className="text-xs">
              {t.leaderboardDesc}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
              {leaderboard.length === 0 && (
                <p className="py-6 text-center text-xs text-slate-500">
                  {t.noSurvivors}
                </p>
              )}
              {leaderboard.slice(0, 10).map((e, i) => (
                <div
                  key={e.id}
                  className="flex items-center justify-between rounded-md px-2 py-1.5 text-xs hover:bg-slate-800/50"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
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
                    <span className="font-mono text-slate-300">
                      {shortAddr(e.playerAddress)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-400">
                    <span title="Wins">
                      <CheckCircle2 className="mr-0.5 inline h-3 w-3 text-emerald-400" />
                      {e.wins}
                    </span>
                    <span title="Best survive">
                      {(e.bestSurviveMs / 1000).toFixed(1)}
                      {t.seconds}
                    </span>
                    <span title="Cheese" className="text-amber-300">
                      🧀{e.totalCheese}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {wallet.connected && (
          <Card className="border-cyan-500/20 bg-slate-900/60 backdrop-blur">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 font-mono text-base">
                <MouseIcon className="h-4 w-4 text-cyan-400" />
                {t.yourLastRuns}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
                {history.length === 0 && (
                  <p className="py-6 text-center text-xs text-slate-500">
                    {t.noGames}
                  </p>
                )}
                {history.slice(0, 10).map((h) => (
                  <div
                    key={h.id}
                    className="rounded-md border border-slate-800 bg-slate-900/40 px-2 py-1.5 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-slate-300">
                        {h.caught ? "💀" : "🎉"} {h.difficulty}
                      </span>
                      <span className="text-amber-300">
                        {h.caught
                          ? `-${h.wagerAmount}`
                          : `+${h.payoutAmount - h.wagerAmount}`}
                      </span>
                    </div>
                    <div className="mt-0.5 flex justify-between text-[10px] text-slate-500">
                      <span>
                        {(h.survivedMs / 1000).toFixed(1)}
                        {t.seconds} · 🧀{h.cheeseCollected}
                      </span>
                      {h.ritualTxHash && (
                        <span className="font-mono">
                          {h.ritualTxHash?.slice(0, 10)}…
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function HowToPlayItem({
  icon,
  title,
  desc,
}: {
  icon: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-900/40 p-2">
      <div className="flex items-center gap-2">
        <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-cyan-300">
          {icon}
        </span>
        <span className="text-xs font-semibold">{title}</span>
      </div>
      <p className="mt-1 text-[11px] leading-snug text-slate-400">{desc}</p>
    </div>
  );
}

/* ---------------- Playing Screen ---------------- */
function PlayingScreen({
  difficulty,
  paused,
  setPaused,
  live,
  progressPct,
  onEnd,
  onLiveUpdate,
  onAbort,
  t,
  tf,
}: {
  difficulty: Difficulty;
  paused: boolean;
  setPaused: (p: boolean) => void;
  live: LiveSnap;
  progressPct: number;
  onEnd: (r: GameResult) => void;
  onLiveUpdate: (s: LiveSnap) => void;
  onAbort: () => void;
  t: Dict;
  tf: TfFn;
}) {
  const cfg = DIFFICULTY_CONFIG[difficulty];
  const secondsLeft = ((GAME_DURATION - live.elapsed) / 1000).toFixed(1);
  const diffLabel =
    difficulty === "kitten"
      ? t.kitten
      : difficulty === "hunter"
      ? t.hunter
      : t.strategist;
  return (
    <div className="grid gap-4 lg:grid-cols-4">
      <div className="lg:col-span-3 space-y-3">
        {/* HUD bar */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <HudCard
            label={t.timeLeft}
            value={`${secondsLeft}${t.seconds}`}
            icon={<span>⏱️</span>}
            color="text-cyan-300"
          />
          <HudCard
            label={t.score}
            value={String(live.score)}
            icon={<Coins className="h-3.5 w-3.5" />}
            color="text-amber-300"
          />
          <HudCard
            label={t.aiInferences}
            value={String(live.inferenceCount)}
            icon={<Zap className="h-3.5 w-3.5" />}
            color="text-rose-300"
          />
          <HudCard
            label={t.difficulty}
            value={`${cfg.emoji} ${diffLabel}`}
            icon={<span>{cfg.emoji}</span>}
            color="text-purple-300"
          />
        </div>

        {/* Timer progress */}
        <div className="flex items-center gap-2">
          <Progress value={progressPct} className="h-2 bg-slate-800" />
          <span className="font-mono text-xs text-slate-400">
            {Math.floor(progressPct)}%
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-7 border-slate-700 text-xs"
            onClick={() => setPaused(!paused)}
          >
            {paused ? `▶ ${t.resume}` : `⏸ ${t.pause}`}
          </Button>
        </div>

        {/* Game canvas */}
        <GameCanvas
          difficulty={difficulty}
          paused={paused}
          onGameEnd={onEnd}
          onLiveUpdate={onLiveUpdate}
        />

        {/* Status pills */}
        <div className="flex flex-wrap gap-2">
          {live.speedBoost && (
            <Badge className="gap-1 border-purple-400/40 bg-purple-500/15 text-purple-300">
              <Zap className="h-3 w-3" /> {t.speedBoost}
            </Badge>
          )}
          {live.inHole && (
            <Badge className="gap-1 border-emerald-400/40 bg-emerald-500/15 text-emerald-300">
              <CheckCircle2 className="h-3 w-3" /> {t.safeInHole}
            </Badge>
          )}
          <Badge className="gap-1 border-rose-400/40 bg-rose-500/15 text-rose-300">
            <Cat className="h-3 w-3" /> {t.aiStrategy}:{" "}
            <span className="font-mono">{live.catStrategy}</span>
          </Badge>
          <Badge className="gap-1 border-cyan-400/40 bg-cyan-500/15 text-cyan-300">
            {t.conf}:{" "}
            <span className="font-mono">
              {(live.catConfidence * 100).toFixed(0)}%
            </span>
          </Badge>
        </div>

        <p className="text-center text-[11px] text-slate-500">{t.controlsHint}</p>
      </div>

      {/* Right rail: live inference feed */}
      <div>
        <Card className="border-rose-500/20 bg-slate-900/60 backdrop-blur">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 font-mono text-sm">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
              </span>
              {t.liveFeed}
            </CardTitle>
            <CardDescription className="text-[11px]">
              {t.liveFeedDesc}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div>
              <p className="text-slate-400">{t.latestStrategy}</p>
              <p className="font-mono text-rose-300">{live.catStrategy}</p>
            </div>
            <div>
              <p className="text-slate-400">{t.confidence}</p>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full bg-gradient-to-r from-rose-500 to-amber-400 transition-all"
                  style={{ width: `${live.catConfidence * 100}%` }}
                />
              </div>
            </div>
            <div>
              <p className="text-slate-400">{t.inferencesSoFar}</p>
              <p className="font-mono text-2xl text-rose-300">
                {live.inferenceCount}
              </p>
            </div>
            <Separator className="bg-slate-800" />
            <div className="rounded-md bg-slate-900/70 p-2 text-[10px] text-slate-500">
              <p className="font-mono text-cyan-300">
                {"// "}
                {t.anchorTitle}
              </p>
              <p>chain_id: 0x27e3 (10211)</p>
              <p>contract: InferenceRegistry</p>
              <p>model: z-ai-llm (verifiable)</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function HudCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2 backdrop-blur">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500">
        {icon}
        {label}
      </div>
      <div className={`mt-0.5 font-mono text-lg font-bold ${color}`}>{value}</div>
    </div>
  );
}

/* ---------------- Ended Screen ---------------- */
function EndedScreen({
  result,
  difficulty,
  wagerAmount,
  txHash,
  payout,
  submitting,
  onPlayAgain,
  t,
  tf,
}: {
  result: GameResult;
  difficulty: Difficulty;
  wagerAmount: number;
  txHash: string | null;
  payout: number;
  submitting: boolean;
  onPlayAgain: () => void;
  t: Dict;
  tf: TfFn;
}) {
  const won = !result.caught;
  const cfg = DIFFICULTY_CONFIG[difficulty];
  const diffLabel =
    difficulty === "kitten"
      ? t.kitten
      : difficulty === "hunter"
      ? t.hunter
      : t.strategist;
  return (
    <div className="mx-auto max-w-2xl">
      <Card
        className={`overflow-hidden border-2 backdrop-blur ${
          won
            ? "border-emerald-500/40 bg-gradient-to-br from-emerald-950/40 to-slate-900/80"
            : "border-rose-500/40 bg-gradient-to-br from-rose-950/40 to-slate-900/80"
        }`}
      >
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 text-6xl">{won ? "🎉" : "💀"}</div>
          <CardTitle className="font-mono text-3xl">
            {won ? t.survivedTitle : t.caughtTitle}
          </CardTitle>
          <CardDescription>
            {won
              ? tf("survivedDesc", { label: diffLabel })
              : tf("caughtDesc", {
                  label: diffLabel,
                  sec: (result.survivedMs / 1000).toFixed(1),
                })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-2">
            <StatBox
              label={t.statSurvived}
              value={`${(result.survivedMs / 1000).toFixed(1)}${t.seconds}`}
              color="text-cyan-300"
            />
            <StatBox
              label={t.statCheese}
              value={`🧀 ${result.cheeseCollected}`}
              color="text-amber-300"
            />
            <StatBox
              label={t.statInferences}
              value={String(result.inferenceCount)}
              color="text-rose-300"
            />
          </div>

          {/* Payout box */}
          <div
            className={`rounded-lg border p-4 ${
              won
                ? "border-emerald-500/30 bg-emerald-500/10"
                : "border-rose-500/30 bg-rose-500/10"
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400">{t.wager}</p>
                <p className="font-mono text-lg text-amber-300">
                  {wagerAmount} CHEESE
                </p>
              </div>
              <div className="text-2xl">{won ? "→" : "✕"}</div>
              <div>
                <p className="text-xs text-slate-400">
                  {won ? t.payout : t.lost}
                </p>
                <p
                  className={`font-mono text-lg font-bold ${
                    won ? "text-emerald-300" : "text-rose-300"
                  }`}
                >
                  {won ? `+${payout - wagerAmount}` : `-${wagerAmount}`} CHEESE
                </p>
              </div>
            </div>
          </div>

          {/* On-chain proof */}
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
              {submitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              )}
              {t.ritualAnchor}
            </p>
            <div className="mt-2 space-y-1 font-mono text-[10px] text-slate-400">
              <p>
                <span className="text-slate-500">{t.txHash}:</span>{" "}
                {txHash ? (
                  <span className="text-cyan-300">
                    {txHash.slice(0, 18)}…{txHash.slice(-8)}
                  </span>
                ) : (
                  <span className="text-slate-600">{t.pending}</span>
                )}
              </p>
              <p>
                <span className="text-slate-500">{t.inferenceHash}:</span>{" "}
                <span className="text-rose-300">
                  {result.inferenceHash
                    ? `${result.inferenceHash.slice(0, 18)}…`
                    : "—"}
                </span>
              </p>
              <p>
                <span className="text-slate-500">{t.difficulty}:</span>{" "}
                <span className="text-purple-300">{difficulty}</span>
              </p>
            </div>
            {txHash && (
              <a
                href={`https://explorer.testnet.ritual.net/tx/${txHash}`}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-[11px] text-cyan-400 hover:underline"
              >
                {t.viewOnExplorer} <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>

          <Button
            onClick={onPlayAgain}
            className="w-full gap-2 bg-gradient-to-r from-rose-500 to-purple-600 text-base font-bold hover:from-rose-400 hover:to-purple-500"
            size="lg"
          >
            <Crosshair className="h-5 w-5" />
            {t.playAgain}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function StatBox({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-900/60 p-3 text-center">
      <p className="text-[10px] uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p className={`mt-1 font-mono text-lg font-bold ${color}`}>{value}</p>
    </div>
  );
}
