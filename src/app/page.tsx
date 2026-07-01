"use client";

import { useEffect, useState, useCallback } from "react";
import { useWallet, shortAddr } from "@/hooks/use-wallet";
import { useLang } from "@/hooks/use-lang";
import { useXAuth } from "@/hooks/use-x-auth";
import { usePvPSocket } from "@/hooks/use-pvp-socket";
import {
  RITUAL_TESTNET,
  INFERENCE_REGISTRY,
  mockTxHash,
} from "@/lib/ritual";
import { DIFFICULTY_CONFIG, Difficulty } from "@/lib/game";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Wallet,
  Zap,
  Trophy,
  Coins,
  Crosshair,
  Cat,
  Sparkles,
  ExternalLink,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Flame,
  Languages,
  Twitter,
  LogOut,
  Swords,
  Users,
  Leaderboard as LeaderboardIcon,
  Gamepad2,
} from "lucide-react";
import { toast } from "sonner";
import GameCanvas from "@/components/game/game-canvas";
import { XLoginModal } from "@/components/x-login-modal";
import { FriendsPanel } from "@/components/friends-panel";
import { LeaderboardPanel } from "@/components/leaderboard-panel";
import { PvPPanel } from "@/components/pvp-panel";

type Screen = "start" | "playing" | "ended";
type Tab = "solo" | "pvp" | "friends" | "leaderboard";
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
  const { lang, change, t, tf, pickerOpen, setPickerOpen, langs } = useLang();
  const { session, login, logout, loading: xLoading } = useXAuth();

  const [tab, setTab] = useState<Tab>("solo");
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
  const [onchainVerified, setOnchainVerified] = useState<boolean>(false);
  const [history, setHistory] = useState<GameHistoryItem[]>([]);
  const [claimed, setClaimed] = useState(false);
  const [bestStreak, setBestStreak] = useState(0);
  const [streak, setStreak] = useState(0);

  // PvP socket — only connect when logged in
  const pvp = usePvPSocket(session?.handle ?? null, session?.avatarUrl ?? null);

  // Load history when wallet connects
  useEffect(() => {
    if (wallet.address) refreshHistory(wallet.address);
  }, [wallet.address]);

  // Auto-link wallet to X profile when both are available
  useEffect(() => {
    if (session?.handle && wallet.address) {
      fetch("/api/link-wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handle: session.handle,
          walletAddress: wallet.address,
        }),
      }).catch(() => {});
    }
  }, [session?.handle, wallet.address]);

  const refreshHistory = useCallback(async (addr: string) => {
    try {
      const r = await fetch(`/api/game-record?address=${addr}`);
      const j = await r.json();
      const recs: GameHistoryItem[] = j.records ?? [];
      setHistory(recs);
      let bal = STARTING_CHEESE;
      let best = 0;
      let cur = 0;
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
    } catch {}
  }, []);

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
      } else toast.error(j.error || t.faucetClaimFailed);
    } catch (e: any) {
      toast.error(e?.message ?? t.faucetFailed);
    }
  }, [wallet.address, t]);

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
    setOnchainVerified(false);
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

  const handleGameEnd = useCallback(
    async (r: GameResult) => {
      setResult(r);
      setScreen("ended");
      setSubmitting(true);
      try {
        // On-chain anchor via wallet
        let submittedTxHash: string | null = null;
        let onchainAnchor = false;
        try {
          const submitResp = await fetch("/api/onchain-submit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              inferenceHash: r.inferenceHash || "0x",
              difficulty,
              survived: !r.caught,
              cheeseCollected: r.cheeseCollected,
              playerAddress: wallet.address,
            }),
          });
          const submitJson = await submitResp.json();
          if (
            submitJson.needsWalletSubmit &&
            submitJson.to &&
            submitJson.data &&
            typeof window !== "undefined" &&
            window.ethereum
          ) {
            try {
              const chainId: string = await window.ethereum.request({
                method: "eth_chainId",
              });
              if (chainId?.toLowerCase() !== "0x7bb") {
                await window.ethereum.request({
                  method: "wallet_switchEthereumChain",
                  params: [{ chainId: "0x7bb" }],
                });
              }
              const txHashFromWallet: string = await window.ethereum.request({
                method: "eth_sendTransaction",
                params: [{ from: submitJson.from, to: submitJson.to, data: submitJson.data }],
              });
              submittedTxHash = txHashFromWallet;
              onchainAnchor = true;
              toast.info("🔗 Transaction submitted, waiting for confirmation...");
              await new Promise((res) => setTimeout(res, 2000));
            } catch (walletErr: any) {
              console.warn("Wallet submit failed:", walletErr?.message);
              toast.warning("Onchain anchor skipped — saving as mock record.");
            }
          }
        } catch {}

        const resp = await fetch("/api/game-record", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            playerAddress: wallet.address,
            playerXHandle: session?.handle,
            difficulty,
            wagerAmount,
            survivedMs: r.survivedMs,
            cheeseCollected: r.cheeseCollected,
            caught: r.caught,
            inferenceHash: r.inferenceHash,
            txHash: submittedTxHash,
          }),
        });
        const j = await resp.json();
        if (j.ok) {
          setTxHash(j.ritualTxHash);
          setPayout(j.payoutAmount);
          setOnchainVerified(j.onchainVerified ?? onchainAnchor);
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
          if (j.onchainVerified) toast.success("🔗 Verified on Ritual testnet!");
          if (wallet.address) refreshHistory(wallet.address);
        }
      } catch (e: any) {
        toast.error(e?.message ?? t.failedSave);
      } finally {
        setSubmitting(false);
      }
    },
    [wallet.address, session?.handle, difficulty, wagerAmount, refreshHistory, t, tf]
  );

  const handleLiveUpdate = useCallback((s: LiveSnap) => setLive(s), []);
  const cfg = DIFFICULTY_CONFIG[difficulty];
  const progressPct = Math.min(100, (live.elapsed / GAME_DURATION) * 100);

  return (
    <div className="min-h-screen bg-[#06070d] text-slate-100 relative overflow-hidden">
      {/* Animated background */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-rose-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: "1s" }} />
        <div className="absolute top-1/2 left-1/2 w-[400px] h-[400px] bg-purple-500/10 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: "2s" }} />
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(124,159,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(124,159,255,0.4) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
      </div>

      {/* Header */}
      <header className="relative z-20 border-b border-white/5 backdrop-blur-xl bg-black/20">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
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
                <span className="bg-gradient-to-r from-rose-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
                  {" "}
                  × CHAIN MOUSE
                </span>
              </h1>
              <p className="text-[11px] text-slate-400">{t.tagline}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Language picker */}
            <div className="relative">
              <button
                onClick={() => setPickerOpen(!pickerOpen)}
                className="group flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-mono text-slate-300 hover:border-rose-500/40 hover:text-rose-300 transition-all"
                aria-label="Select language"
                aria-expanded={pickerOpen}
              >
                <Languages className="h-3.5 w-3.5" />
                <span className="font-bold text-rose-300">
                  {langs.find((l) => l.code === lang)?.label ?? "EN"}
                </span>
                <svg className={`h-3 w-3 transition-transform ${pickerOpen ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              {pickerOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setPickerOpen(false)} />
                  <div className="absolute right-0 top-full z-50 mt-1 w-36 overflow-hidden rounded-lg border border-white/10 bg-slate-950/95 shadow-xl backdrop-blur-xl">
                    {langs.map((l) => (
                      <button
                        key={l.code}
                        onClick={() => change(l.code)}
                        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-white/5 transition-colors ${
                          lang === l.code ? "bg-rose-500/10 text-rose-300" : "text-slate-300"
                        }`}
                      >
                        <span className="text-base">{l.flag}</span>
                        <span className="font-mono font-bold">{l.label}</span>
                        {lang === l.code && (
                          <svg className="ml-auto h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <path d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {session && (
              <div className="flex items-center gap-2 rounded-lg border border-sky-500/30 bg-sky-500/10 px-2.5 py-1.5">
                <img
                  src={session.avatarUrl}
                  alt={session.handle}
                  className="h-5 w-5 rounded-full"
                />
                <span className="font-mono text-xs font-bold text-sky-300">
                  @{session.handle}
                </span>
                <button
                  onClick={logout}
                  className="text-slate-500 hover:text-rose-400"
                  title="Logout"
                >
                  <LogOut className="h-3 w-3" />
                </button>
              </div>
            )}

            <Badge variant="outline" className="border-rose-500/30 bg-rose-500/10 text-rose-300 hidden sm:flex">
              <Flame className="mr-1 h-3 w-3" />
              {t.streak}: {streak} ({t.best} {bestStreak})
            </Badge>
            <Badge variant="outline" className="border-amber-400/30 bg-amber-400/10 text-amber-300 hidden sm:flex">
              <Coins className="mr-1 h-3 w-3" />
              {balance} CHEESE
            </Badge>

            {!session && <XLoginModal onLogin={login} loading={xLoading} />}

            <Button
              onClick={connect}
              disabled={connecting || wallet.connected}
              size="sm"
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
            <Button size="sm" variant="outline" className="ml-2 h-6 border-amber-400/40 text-amber-300" onClick={ensureRitual}>
              {t.switch}
            </Button>
          </div>
        )}
      </header>

      {/* Tab nav */}
      <nav className="relative z-10 mx-auto max-w-7xl px-4 pt-4">
        <div className="flex gap-1 rounded-2xl border border-white/5 bg-white/5 p-1 backdrop-blur-xl overflow-x-auto">
          <TabButton active={tab === "solo"} onClick={() => setTab("solo")} icon={<Gamepad2 className="h-4 w-4" />} label={t.tabSolo} />
          <TabButton active={tab === "pvp"} onClick={() => setTab("pvp")} icon={<Swords className="h-4 w-4" />} label={t.tabPvP} disabled={!session} />
          <TabButton active={tab === "friends"} onClick={() => setTab("friends")} icon={<Users className="h-4 w-4" />} label={t.tabFriends} disabled={!session} />
          <TabButton active={tab === "leaderboard"} onClick={() => setTab("leaderboard")} icon={<Trophy className="h-4 w-4" />} label={t.tabLeaderboard} />
        </div>
      </nav>

      {/* Main content */}
      <main className="relative z-10 mx-auto max-w-7xl px-4 py-6">
        {tab === "solo" && (
          <SoloTab
            screen={screen}
            difficulty={difficulty}
            setDifficulty={setDifficulty}
            wagerAmount={wagerAmount}
            setWagerAmount={setWagerAmount}
            balance={balance}
            wallet={wallet}
            onStart={startGame}
            onClaim={claimFaucet}
            claimed={claimed}
            history={history}
            paused={paused}
            setPaused={setPaused}
            live={live}
            progressPct={progressPct}
            onEnd={handleGameEnd}
            onLiveUpdate={handleLiveUpdate}
            result={result}
            txHash={txHash}
            payout={payout}
            submitting={submitting}
            onchainVerified={onchainVerified}
            t={t}
            tf={tf}
          />
        )}

        {tab === "pvp" && session && (
          <PvPPanel t={t} myHandle={session.handle} myAvatarUrl={session.avatarUrl} pvp={pvp} />
        )}
        {tab === "pvp" && !session && <LoginRequired t={t} />}

        {tab === "friends" && session && (
          <FriendsPanel
            myHandle={session.handle}
            t={t}
            onChallenge={pvp.challengeFriend}
            incomingChallenge={pvp.challenge}
            onAcceptChallenge={pvp.acceptChallenge}
            onDeclineChallenge={pvp.declineChallenge}
          />
        )}
        {tab === "friends" && !session && <LoginRequired t={t} />}

        {tab === "leaderboard" && <LeaderboardPanel t={t} />}
      </main>

      <footer className="relative z-10 border-t border-white/5 px-4 py-6 text-center text-xs text-slate-500">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 sm:flex-row">
          <p>
            {t.footerBuiltOn}{" "}
            <a href="https://ritual.net" target="_blank" rel="noreferrer" className="text-rose-400 hover:underline">
              Ritual testnet
            </a>{" "}
            · {t.footerAi}{" "}
            <span className="text-cyan-400">z-ai-web-dev-sdk</span> ·{" "}
            {t.footerNotReal} 🧀
          </p>
          <div className="flex items-center gap-3">
            <a href="https://docs.ritual.net" target="_blank" rel="noreferrer" className="hover:text-slate-300">
              {t.docs}
            </a>
            <span>·</span>
            <a href="https://explorer.ritualfoundation.org" target="_blank" rel="noreferrer" className="hover:text-slate-300">
              {t.explorer}
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-mono font-bold transition-all ${
        active
          ? "bg-gradient-to-r from-rose-500/20 to-purple-500/20 text-rose-300 shadow-[inset_0_0_20px_rgba(255,77,109,0.15)]"
          : disabled
          ? "text-slate-700 cursor-not-allowed"
          : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function LoginRequired({ t }: { t: any }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="mb-4 text-6xl">🔐</div>
      <h2 className="font-mono text-2xl font-bold text-slate-300 mb-2">
        Login required
      </h2>
      <p className="text-sm text-slate-500 mb-6 max-w-md">
        Connect your X account to access this feature. Your X avatar becomes
        your in-game character.
      </p>
      <XLoginModal onLogin={async () => false} loading={false} />
    </div>
  );
}

/* ---------------- Solo Tab ---------------- */
function SoloTab({
  screen,
  difficulty,
  setDifficulty,
  wagerAmount,
  setWagerAmount,
  balance,
  wallet,
  onStart,
  onClaim,
  claimed,
  history,
  paused,
  setPaused,
  live,
  progressPct,
  onEnd,
  onLiveUpdate,
  result,
  txHash,
  payout,
  submitting,
  onchainVerified,
  t,
  tf,
}: any) {
  const cfg = DIFFICULTY_CONFIG[difficulty as Difficulty];
  const diffLabel = (d: Difficulty) =>
    d === "kitten" ? t.kitten : d === "hunter" ? t.hunter : t.strategist;
  const diffDesc = (d: Difficulty) =>
    d === "kitten" ? t.kittenDesc : d === "hunter" ? t.hunterDesc : t.strategistDesc;

  if (screen === "playing") {
    return (
      <SoloPlaying
        difficulty={difficulty}
        paused={paused}
        setPaused={setPaused}
        live={live}
        progressPct={progressPct}
        onEnd={onEnd}
        onLiveUpdate={onLiveUpdate}
        t={t}
      />
    );
  }

  if (screen === "ended" && result) {
    return (
      <SoloEnded
        result={result}
        difficulty={difficulty}
        wagerAmount={wagerAmount}
        txHash={txHash}
        payout={payout}
        submitting={submitting}
        onchainVerified={onchainVerified}
        onPlayAgain={() => {}}
        t={t}
        tf={tf}
      />
    );
  }

  // Start screen
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-4">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-rose-950/40 via-slate-950/60 to-cyan-950/40 p-8 backdrop-blur-xl">
          <div className="absolute inset-0 opacity-30">
            <div className="absolute top-4 right-4 text-9xl opacity-20">🐱</div>
            <div className="absolute bottom-4 left-4 text-7xl opacity-20">🐭</div>
          </div>
          <div className="relative z-10">
            <Badge className="mb-4 gap-1 border-rose-500/40 bg-rose-500/10 text-rose-300">
              <Sparkles className="h-3 w-3" /> {t.badgeOnchain}
            </Badge>
            <h2 className="font-mono text-4xl md:text-5xl font-bold tracking-tight mb-3">
              {t.heroTitleA}
              <span className="bg-gradient-to-r from-rose-400 to-amber-300 bg-clip-text text-transparent">
                {t.heroTitleAEmph}
              </span>
              {t.heroTitleB}
              <span className="bg-gradient-to-r from-cyan-400 to-emerald-300 bg-clip-text text-transparent">
                {t.heroTitleBEmph}
              </span>
              {t.heroTitleC}
            </h2>
            <p className="text-slate-300 max-w-2xl">{t.heroDesc}</p>
          </div>
        </div>

        {/* Difficulty + Wager */}
        <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-6 backdrop-blur-xl space-y-5">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t.choosePredator}
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {(Object.keys(DIFFICULTY_CONFIG) as Difficulty[]).map((d) => {
                const c = DIFFICULTY_CONFIG[d];
                const active = difficulty === d;
                return (
                  <button
                    key={d}
                    onClick={() => setDifficulty(d)}
                    className={`group relative rounded-2xl border p-4 text-left transition-all ${
                      active
                        ? "border-rose-500 bg-rose-500/10 shadow-[0_0_30px_rgba(255,77,109,0.2)]"
                        : "border-white/10 bg-white/5 hover:border-rose-500/40 hover:bg-white/10"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-3xl">{c.emoji}</span>
                      <span className="font-mono text-xs text-amber-300 bg-amber-400/10 px-2 py-0.5 rounded-full">
                        {c.payoutMultiplier}x
                      </span>
                    </div>
                    <div className="font-mono text-sm font-bold text-slate-100">
                      {diffLabel(d)}
                    </div>
                    <div className="text-[11px] leading-snug text-slate-400 mt-1">
                      {diffDesc(d)}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

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
              <span>{t.balanceLabel}: {balance}</span>
              <span>{Math.min(500, Math.max(10, balance))}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={onStart}
              disabled={!wallet.connected}
              className="gap-2 bg-gradient-to-r from-rose-500 to-purple-600 text-base font-bold hover:from-rose-400 hover:to-purple-500 shadow-lg shadow-rose-500/30"
              size="lg"
            >
              <Crosshair className="h-5 w-5" />
              {t.startHunt}
            </Button>
            {wallet.connected && balance === 0 && !claimed && (
              <Button onClick={onClaim} variant="outline" className="gap-2 border-amber-400/40 text-amber-300">
                <Coins className="h-4 w-4" />
                {t.claimFaucet}
              </Button>
            )}
            {!wallet.connected && (
              <p className="text-xs text-slate-400">🔗 {t.connectToPlay}</p>
            )}
          </div>
        </div>
      </div>

      {/* Right rail */}
      <div className="space-y-4">
        <div className="rounded-2xl border border-cyan-500/20 bg-slate-950/60 p-4 backdrop-blur-xl">
          <h3 className="font-mono text-sm font-bold text-cyan-300 mb-3">
            {t.howToPlay}
          </h3>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <MiniHowTo icon="WASD" label={t.move} />
            <MiniHowTo icon="🧀" label={t.collectCheese} />
            <MiniHowTo icon="🕳️" label={t.hideInHoles} />
            <MiniHowTo icon="⚡" label={t.grabBoosts} />
            <MiniHowTo icon="SPACE" label={t.dropDecoy} />
            <MiniHowTo icon="⏱️" label={t.survive60s} />
          </div>
        </div>

        {wallet.connected && (
          <div className="rounded-2xl border border-purple-500/20 bg-slate-950/60 p-4 backdrop-blur-xl">
            <h3 className="font-mono text-sm font-bold text-purple-300 mb-3">
              {t.yourLastRuns}
            </h3>
            <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
              {history.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-500">{t.noGames}</p>
              ) : (
                history.slice(0, 10).map((h: GameHistoryItem) => (
                  <div key={h.id} className="rounded-md border border-white/5 bg-white/5 px-2 py-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-slate-300">
                        {h.caught ? "💀" : "🎉"} {h.difficulty}
                      </span>
                      <span className="text-amber-300">
                        {h.caught ? `-${h.wagerAmount}` : `+${h.payoutAmount - h.wagerAmount}`}
                      </span>
                    </div>
                    <div className="mt-0.5 flex justify-between text-[10px] text-slate-500">
                      <span>
                        {(h.survivedMs / 1000).toFixed(1)}
                        {t.seconds} · 🧀{h.cheeseCollected}
                      </span>
                      {h.ritualTxHash && (
                        <a
                          href={`https://explorer.ritualfoundation.org/tx/${h.ritualTxHash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-cyan-400 hover:underline"
                        >
                          {h.ritualTxHash.slice(0, 8)}…
                        </a>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MiniHowTo({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="rounded-lg border border-white/5 bg-white/5 p-2">
      <div className="flex items-center gap-1.5">
        <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[9px] text-cyan-300">
          {icon}
        </span>
        <span className="text-[11px] font-semibold text-slate-200">{label}</span>
      </div>
    </div>
  );
}

function SoloPlaying({
  difficulty,
  paused,
  setPaused,
  live,
  progressPct,
  onEnd,
  onLiveUpdate,
  t,
}: any) {
  const cfg = DIFFICULTY_CONFIG[difficulty as Difficulty];
  const secondsLeft = ((GAME_DURATION - live.elapsed) / 1000).toFixed(1);
  const diffLabel =
    difficulty === "kitten" ? t.kitten : difficulty === "hunter" ? t.hunter : t.strategist;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <HudCard label={t.timeLeft} value={`${secondsLeft}${t.seconds}`} icon="⏱️" color="text-cyan-300" />
        <HudCard label={t.score} value={String(live.score)} icon={<Coins className="h-3.5 w-3.5" />} color="text-amber-300" />
        <HudCard label={t.aiInferences} value={String(live.inferenceCount)} icon={<Zap className="h-3.5 w-3.5" />} color="text-rose-300" />
        <HudCard label={t.difficulty} value={`${cfg.emoji} ${diffLabel}`} icon={cfg.emoji} color="text-purple-300" />
      </div>
      <div className="flex items-center gap-2">
        <Progress value={progressPct} className="h-2 bg-slate-800" />
        <span className="font-mono text-xs text-slate-400">{Math.floor(progressPct)}%</span>
        <Button size="sm" variant="outline" className="h-7 border-slate-700 text-xs" onClick={() => setPaused(!paused)}>
          {paused ? `▶ ${t.resume}` : `⏸ ${t.pause}`}
        </Button>
      </div>
      <GameCanvas difficulty={difficulty} paused={paused} onGameEnd={onEnd} onLiveUpdate={onLiveUpdate} />
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
          <Cat className="h-3 w-3" /> {t.aiStrategy}: <span className="font-mono">{live.catStrategy}</span>
        </Badge>
      </div>
      <p className="text-center text-[11px] text-slate-500">{t.controlsHint}</p>
    </div>
  );
}

function HudCard({ label, value, icon, color }: any) {
  return (
    <div className="rounded-xl border border-white/5 bg-slate-950/60 px-3 py-2 backdrop-blur-xl">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500">
        {typeof icon === "string" ? <span>{icon}</span> : icon}
        {label}
      </div>
      <div className={`mt-0.5 font-mono text-lg font-bold ${color}`}>{value}</div>
    </div>
  );
}

function SoloEnded({
  result,
  difficulty,
  wagerAmount,
  txHash,
  payout,
  submitting,
  onchainVerified,
  onPlayAgain,
  t,
  tf,
}: any) {
  const won = !result.caught;
  const diffLabel =
    difficulty === "kitten" ? t.kitten : difficulty === "hunter" ? t.hunter : t.strategist;
  return (
    <div className="mx-auto max-w-2xl">
      <div
        className={`overflow-hidden rounded-3xl border-2 backdrop-blur-xl ${
          won
            ? "border-emerald-500/40 bg-gradient-to-br from-emerald-950/40 to-slate-950/80"
            : "border-rose-500/40 bg-gradient-to-br from-rose-950/40 to-slate-950/80"
        }`}
      >
        <div className="p-8 text-center">
          <div className="text-7xl mb-3">{won ? "🎉" : "💀"}</div>
          <h2 className="font-mono text-4xl font-bold mb-2">
            {won ? t.survivedTitle : t.caughtTitle}
          </h2>
          <p className="text-slate-400">
            {won
              ? tf("survivedDesc", { label: diffLabel })
              : tf("caughtDesc", { label: diffLabel, sec: (result.survivedMs / 1000).toFixed(1) })}
          </p>
        </div>
        <div className="px-8 pb-8 space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <StatBox label={t.statSurvived} value={`${(result.survivedMs / 1000).toFixed(1)}${t.seconds}`} color="text-cyan-300" />
            <StatBox label={t.statCheese} value={`🧀 ${result.cheeseCollected}`} color="text-amber-300" />
            <StatBox label={t.statInferences} value={String(result.inferenceCount)} color="text-rose-300" />
          </div>
          <div className={`rounded-xl border p-4 ${won ? "border-emerald-500/30 bg-emerald-500/10" : "border-rose-500/30 bg-rose-500/10"}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400">{t.wager}</p>
                <p className="font-mono text-lg text-amber-300">{wagerAmount} CHEESE</p>
              </div>
              <div className="text-2xl">{won ? "→" : "✕"}</div>
              <div>
                <p className="text-xs text-slate-400">{won ? t.payout : t.lost}</p>
                <p className={`font-mono text-lg font-bold ${won ? "text-emerald-300" : "text-rose-300"}`}>
                  {won ? `+${payout - wagerAmount}` : `-${wagerAmount}`} CHEESE
                </p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-white/5 bg-slate-950/60 p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
              {submitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : onchainVerified ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <AlertCircle className="h-3.5 w-3.5 text-amber-400" />
              )}
              {t.ritualAnchor}
              {onchainVerified ? (
                <Badge className="ml-2 gap-1 border-emerald-400/40 bg-emerald-500/15 text-[9px] text-emerald-300">
                  <CheckCircle2 className="h-2.5 w-2.5" /> Verified
                </Badge>
              ) : (
                <Badge className="ml-2 gap-1 border-amber-400/40 bg-amber-500/15 text-[9px] text-amber-300">Mock</Badge>
              )}
            </p>
            <div className="mt-2 space-y-1 font-mono text-[10px] text-slate-400">
              <p>
                <span className="text-slate-500">{t.txHash}:</span>{" "}
                {txHash ? (
                  <a
                    href={`https://explorer.ritualfoundation.org/tx/${txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-cyan-300 hover:underline"
                  >
                    {txHash.slice(0, 18)}…{txHash.slice(-8)}
                  </a>
                ) : (
                  <span className="text-slate-600">{t.pending}</span>
                )}
              </p>
              <p>
                <span className="text-slate-500">{t.inferenceHash}:</span>{" "}
                <span className="text-rose-300">
                  {result.inferenceHash ? `${result.inferenceHash.slice(0, 18)}…` : "—"}
                </span>
              </p>
            </div>
          </div>
          <Button onClick={onPlayAgain} className="w-full gap-2 bg-gradient-to-r from-rose-500 to-purple-600 text-base font-bold">
            <Crosshair className="h-5 w-5" />
            {t.playAgain}
          </Button>
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value, color }: any) {
  return (
    <div className="rounded-lg border border-white/5 bg-slate-950/60 p-3 text-center">
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-1 font-mono text-lg font-bold ${color}`}>{value}</p>
    </div>
  );
}
