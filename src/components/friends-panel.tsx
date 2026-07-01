"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  UserPlus,
  Users,
  Loader2,
  CheckCircle2,
  XCircle,
  Swords,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import type { Dict } from "@/lib/i18n";
import type { ChallengePayload } from "@/hooks/use-pvp-socket";

// Format a handle for display (OKX wallets show shortened address)
function displayHandle(handle: string): string {
  if (handle.startsWith("okx:")) {
    const addr = handle.slice(4);
    return `OKX ${addr.slice(0, 6)}...${addr.slice(-4)}`;
  }
  return `@${handle}`;
}

type Friend = {
  handle: string;
  status: string; // pending | accepted | blocked
  direction: "in" | "out";
  avatar?: string | null;
  createdAt: string;
};

type Props = {
  myHandle: string;
  t: Dict;
  onChallenge: (handle: string) => void;
  incomingChallenge: ChallengePayload | null;
  onAcceptChallenge: (handle: string) => void;
  onDeclineChallenge: () => void;
};

export function FriendsPanel({
  myHandle,
  t,
  onChallenge,
  incomingChallenge,
  onAcceptChallenge,
  onDeclineChallenge,
}: Props) {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [addHandle, setAddHandle] = useState("");
  const [adding, setAdding] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`/api/friends?handle=${myHandle}`);
      const j = await r.json();
      setFriends(j.friends ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [myHandle]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  const addFriend = async () => {
    let clean = addHandle.replace(/^@/, "").trim().toLowerCase();
    if (!clean) return;
    // If it looks like a wallet address (0x + 40 hex), prefix with "okx:"
    if (/^0x[a-f0-9]{40}$/.test(clean)) {
      clean = `okx:${clean}`;
    }
    setAdding(true);
    try {
      const r = await fetch("/api/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromHandle: myHandle, toHandle: clean, action: "add" }),
      });
      const j = await r.json();
      if (j.ok) {
        toast.success(
          j.status === "accepted" ? "Friend added!" : "Friend request sent"
        );
        setAddHandle("");
        refresh();
      } else {
        toast.error(j.error || "Failed to add friend");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setAdding(false);
    }
  };

  const removeFriend = async (handle: string) => {
    try {
      await fetch(`/api/friends?from=${myHandle}&to=${handle}`, {
        method: "DELETE",
      });
      toast.success("Removed");
      refresh();
    } catch {
      toast.error("Failed to remove");
    }
  };

  const acceptedFriends = friends.filter((f) => f.status === "accepted");
  const pendingFriends = friends.filter((f) => f.status === "pending");

  return (
    <div className="space-y-4">
      {/* Incoming challenge notification */}
      {incomingChallenge && (
        <Card className="border-amber-400/50 bg-amber-500/10 backdrop-blur-xl animate-pulse">
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              {incomingChallenge.avatarUrl && (
                <img
                  src={incomingChallenge.avatarUrl}
                  alt={incomingChallenge.from}
                  className="h-10 w-10 rounded-full border-2 border-amber-400"
                />
              )}
              <div>
                <p className="font-bold text-amber-300">
                  ⚔️ Challenge from {displayHandle(incomingChallenge.from)}
                </p>
                <p className="text-xs text-amber-200/70">Accept to start a PvP match</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => onAcceptChallenge(incomingChallenge.from)}
                className="gap-1 bg-emerald-500 hover:bg-emerald-400 text-white"
              >
                <CheckCircle2 className="h-4 w-4" />
                {t.acceptChallenge}
              </Button>
              <Button
                onClick={onDeclineChallenge}
                variant="outline"
                className="gap-1 border-amber-400/40 text-amber-300"
              >
                <XCircle className="h-4 w-4" />
                {t.decline}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add friend */}
      <Card className="border-sky-500/30 bg-slate-950/60 backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sky-300">
            <UserPlus className="h-5 w-5" />
            {t.addFriend}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex gap-2">
            <Input
              value={addHandle}
              onChange={(e) => setAddHandle(e.target.value)}
              placeholder="X handle (e.g. elonmusk) or OKX address (0x...)"
              className="border-slate-700 bg-slate-900/60 font-mono"
              onKeyDown={(e) => e.key === "Enter" && addFriend()}
            />
            <Button
              onClick={addFriend}
              disabled={adding}
              className="gap-2 bg-gradient-to-r from-sky-500 to-blue-600"
            >
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              {t.addFriend}
            </Button>
          </div>
          <p className="text-[11px] text-slate-500">
            Add by X handle or OKX wallet address. They&apos;ll receive a request
            when they login.
          </p>
        </CardContent>
      </Card>

      {/* Friends list */}
      <Card className="border-purple-500/30 bg-slate-950/60 backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-purple-300">
            <Users className="h-5 w-5" />
            {t.onlineFriends} ({acceptedFriends.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
            </div>
          ) : acceptedFriends.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">{t.noFriends}</p>
          ) : (
            <div className="space-y-2">
              {acceptedFriends.map((f) => (
                <div
                  key={f.handle}
                  className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/40 p-3 hover:border-purple-500/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {f.avatar ? (
                      <img
                        src={f.avatar}
                        alt={f.handle}
                        className="h-10 w-10 rounded-full border border-purple-500/30"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-slate-700 flex items-center justify-center text-xs font-mono">
                        {f.handle.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <p className="font-mono text-sm font-bold text-purple-200">{displayHandle(f.handle)}</p>
                      <p className="text-[10px] text-slate-500">friend</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => onChallenge(f.handle)}
                      className="gap-1 bg-gradient-to-r from-rose-500 to-purple-600"
                    >
                      <Swords className="h-3.5 w-3.5" />
                      {t.challenge}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => removeFriend(f.handle)}
                      className="text-slate-500 hover:text-rose-400"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending requests */}
      {pendingFriends.length > 0 && (
        <Card className="border-amber-500/30 bg-slate-950/60 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-300">
              <Clock className="h-5 w-5" />
              Pending requests
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pendingFriends.map((f) => (
              <div
                key={f.handle}
                className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/40 p-3"
              >
                <div className="flex items-center gap-3">
                  {f.avatar && (
                    <img src={f.avatar} alt={f.handle} className="h-8 w-8 rounded-full" />
                  )}
                  <div>
                    <p className="font-mono text-sm text-amber-200">{displayHandle(f.handle)}</p>
                    <Badge variant="outline" className="text-[9px]">
                      {f.direction === "in" ? "incoming" : "sent"}
                    </Badge>
                  </div>
                </div>
                {f.direction === "in" && (
                  <Button
                    size="sm"
                    onClick={() => onAcceptChallenge(f.handle)}
                    className="bg-emerald-500 hover:bg-emerald-400"
                  >
                    Accept
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
