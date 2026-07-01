"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Swords, Loader2, X, Trophy, User } from "lucide-react";
import PvPCanvas from "@/components/game/pvp-canvas";
import type { Dict } from "@/lib/i18n";
import type {
  usePvPSocket,
} from "@/hooks/use-pvp-socket";

type Props = {
  t: Dict;
  myHandle: string;
  myAvatarUrl: string;
  pvp: ReturnType<typeof usePvPSocket>;
};

export function PvPPanel({ t, myHandle, myAvatarUrl, pvp }: Props) {
  const [matchResult, setMatchResult] = useState<{
    won: boolean;
    draw: boolean;
    myScore: number;
    oppScore: number;
  } | null>(null);

  // Handle match end
  if (pvp.matchEnd && !matchResult) {
    const me = myHandle;
    const opp = pvp.matchStart?.opponent.handle ?? "";
    const myScore = pvp.matchEnd.scores[me] ?? 0;
    const oppScore = pvp.matchEnd.scores[opp] ?? 0;
    const won = pvp.matchEnd.winner === me;
    const draw = pvp.matchEnd.winner === null;
    setMatchResult({ won, draw, myScore, oppScore });
  }

  // Match in progress
  if (pvp.status === "in-match" && pvp.matchStart && !matchResult) {
    return (
      <div className="space-y-3">
        <Card className="border-rose-500/40 bg-gradient-to-r from-rose-950/40 to-purple-950/40 backdrop-blur-xl">
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <img
                src={myAvatarUrl}
                alt={myHandle}
                className="h-12 w-12 rounded-full border-2 border-cyan-400"
              />
              <div>
                <p className="font-mono text-sm font-bold text-cyan-300">
                  @{myHandle} (You)
                </p>
                <p className="text-xs text-cyan-200/60">Mouse</p>
              </div>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-rose-300">VS</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="font-mono text-sm font-bold text-purple-300">
                  @{pvp.matchStart.opponent.handle}
                </p>
                <p className="text-xs text-purple-200/60">Mouse</p>
              </div>
              <img
                src={pvp.matchStart.opponent.avatarUrl}
                alt={pvp.matchStart.opponent.handle}
                className="h-12 w-12 rounded-full border-2 border-purple-400"
              />
            </div>
          </CardContent>
        </Card>

        <PvPCanvas
          myHandle={myHandle}
          myAvatarUrl={myAvatarUrl}
          opponentHandle={pvp.matchStart.opponent.handle}
          opponentAvatarUrl={pvp.matchStart.opponent.avatarUrl}
          sharedCheeses={pvp.matchStart.cheeses}
          onEnd={(r) => {
            // Game over (caught) — send final state
            pvp.sendPlayerState({
              x: 0,
              y: 0,
              velX: 0,
              velY: 0,
              cheeseCollected: r.cheeseCollected,
              caught: true,
              cheesesTaken: [],
            });
          }}
          onStateUpdate={(s) => pvp.sendPlayerState(s)}
          opponentState={pvp.opponentState}
          catState={null}
          onCatState={() => {}}
          onTimeUp={() => pvp.sendTimeUp()}
        />

        <p className="text-center text-xs text-slate-500">{t.pvpDesc}</p>
      </div>
    );
  }

  // Match ended
  if (matchResult) {
    const oppHandle = pvp.matchStart?.opponent.handle ?? "opponent";
    return (
      <Card className="border-emerald-500/40 bg-gradient-to-br from-emerald-950/40 to-slate-950/80 backdrop-blur-xl">
        <CardContent className="py-8 text-center space-y-4">
          <div className="text-6xl">
            {matchResult.draw ? "🤝" : matchResult.won ? "🏆" : "💀"}
          </div>
          <div>
            <h2 className="font-mono text-3xl font-bold">
              {matchResult.draw ? (
                <span className="text-amber-300">{t.pvpDraw}</span>
              ) : matchResult.won ? (
                <span className="text-emerald-300">{t.pvpWin}</span>
              ) : (
                <span className="text-rose-300">{t.pvpLose}</span>
              )}
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              vs <span className="font-mono text-purple-300">@{oppHandle}</span>
            </p>
          </div>
          <div className="flex justify-center gap-8 text-lg font-mono">
            <div>
              <p className="text-cyan-300 text-3xl font-bold">{matchResult.myScore}</p>
              <p className="text-xs text-slate-500">You</p>
            </div>
            <div className="text-slate-600 text-3xl">—</div>
            <div>
              <p className="text-purple-300 text-3xl font-bold">{matchResult.oppScore}</p>
              <p className="text-xs text-slate-500">@{oppHandle}</p>
            </div>
          </div>
          <Button
            onClick={() => {
              setMatchResult(null);
              pvp.reset();
            }}
            className="gap-2 bg-gradient-to-r from-rose-500 to-purple-600"
          >
            <Swords className="h-4 w-4" />
            Play Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Queueing
  if (pvp.status === "queueing") {
    return (
      <Card className="border-purple-500/40 bg-slate-950/60 backdrop-blur-xl">
        <CardContent className="py-12 text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-purple-400 mx-auto" />
          <div>
            <h2 className="font-mono text-xl text-purple-300">{t.findingMatch}</h2>
            <p className="text-xs text-slate-500 mt-1">
              {t.queuePosition}: {pvp.queuePosition}
            </p>
          </div>
          <Button
            onClick={pvp.cancelQueue}
            variant="outline"
            className="gap-2 border-rose-500/40 text-rose-300"
          >
            <X className="h-4 w-4" />
            {t.cancelQueue}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Idle
  return (
    <div className="space-y-4">
      <Card className="border-purple-500/30 bg-gradient-to-br from-purple-950/40 to-rose-950/40 backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-purple-300">
            <Swords className="h-5 w-5" />
            {t.tabPvP}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-center gap-4 py-4">
            <div className="text-center">
              <img
                src={myAvatarUrl}
                alt={myHandle}
                className="h-16 w-16 rounded-full border-2 border-cyan-400 mx-auto"
              />
              <p className="font-mono text-xs text-cyan-300 mt-2">@{myHandle}</p>
            </div>
            <div className="text-4xl text-slate-600">VS</div>
            <div className="text-center">
              <div className="h-16 w-16 rounded-full border-2 border-dashed border-slate-700 flex items-center justify-center mx-auto">
                <User className="h-8 w-8 text-slate-700" />
              </div>
              <p className="font-mono text-xs text-slate-600 mt-2">???</p>
            </div>
          </div>

          <p className="text-center text-sm text-slate-400">{t.pvpDesc}</p>

          <Button
            onClick={pvp.findMatch}
            className="w-full gap-2 bg-gradient-to-r from-rose-500 to-purple-600 hover:from-rose-400 hover:to-purple-500 text-base font-bold py-6"
          >
            <Swords className="h-5 w-5" />
            {t.findMatch}
          </Button>

          <div className="flex items-center justify-center gap-2 text-xs">
            <Badge
              variant="outline"
              className={`gap-1 ${
                pvp.connected
                  ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-300"
                  : "border-slate-700 text-slate-500"
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${pvp.connected ? "bg-emerald-400 animate-pulse" : "bg-slate-600"}`} />
              {pvp.connected ? "Online" : "Connecting..."}
            </Badge>
          </div>

          {pvp.error && (
            <p className="text-center text-xs text-rose-400">{pvp.error}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
