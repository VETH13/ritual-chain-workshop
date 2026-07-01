"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";

export type PvPStatus = "idle" | "queueing" | "in-match" | "ended";

export type OpponentInfo = {
  handle: string;
  avatarUrl: string;
};

export type MatchStartPayload = {
  matchId: string;
  opponent: OpponentInfo;
  youAre: "player1" | "player2";
  cheeses: { x: number; y: number; taken: string | null }[];
  startTime: number;
  duration: number;
};

export type OpponentState = {
  handle: string;
  x: number;
  y: number;
  velX: number;
  velY: number;
  cheeseCollected: number;
  caught: boolean;
  cheesesTaken: number[];
};

export type MatchEndPayload = {
  matchId: string;
  reason: "time" | "both-caught";
  scores: Record<string, number>;
  catches: Record<string, boolean>;
  winner: string | null;
  endedAt: number;
};

export type ChallengePayload = {
  from: string;
  avatarUrl: string;
};

export function usePvPSocket(handle: string | null, avatarUrl: string | null) {
  const socketRef = useRef<Socket | null>(null);
  const [status, setStatus] = useState<PvPStatus>("idle");
  const [matchStart, setMatchStart] = useState<MatchStartPayload | null>(null);
  const [opponentState, setOpponentState] = useState<OpponentState | null>(null);
  const [matchEnd, setMatchEnd] = useState<MatchEndPayload | null>(null);
  const [queuePosition, setQueuePosition] = useState(0);
  const [challenge, setChallenge] = useState<ChallengePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  // Connect when handle is available
  useEffect(() => {
    if (!handle || !avatarUrl) return;
    if (socketRef.current) return;

    // Determine the socket URL
    let socketUrl: string;
    let socketPath: string;
    if (
      typeof window !== "undefined" &&
      window.location.hostname === "localhost" &&
      window.location.port === "3000"
    ) {
      // Dev mode — connect directly to the PvP server
      socketUrl = "http://localhost:3003";
      socketPath = "/";
    } else {
      // Prod — use relative URL + XTransformPort (Caddy handles routing)
      socketUrl = window?.location?.origin ?? "/";
      socketPath = "/";
    }

    const socket = io(socketUrl + "/?XTransformPort=3003", {
      path: socketPath,
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: 5,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("register", { handle, avatarUrl });
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("registered", () => setStatus("idle"));
    socket.on("queued", ({ position }) => {
      setStatus("queueing");
      setQueuePosition(position);
    });
    socket.on("queue-cancelled", () => {
      setStatus("idle");
      setQueuePosition(0);
    });
    socket.on("match-start", (payload: MatchStartPayload) => {
      setMatchStart(payload);
      setMatchEnd(null);
      setOpponentState(null);
      setStatus("in-match");
    });
    socket.on("opponent-state", (s: OpponentState) => setOpponentState(s));
    socket.on("match-end", (payload: MatchEndPayload) => {
      setMatchEnd(payload);
      setStatus("ended");
    });
    socket.on("challenge-received", (c: ChallengePayload) => setChallenge(c));
    socket.on("challenge-declined", () => {
      setError("Challenge declined");
      setTimeout(() => setError(null), 3000);
    });
    socket.on("challenge-failed", ({ reason }) => {
      setError(reason);
      setTimeout(() => setError(null), 3000);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [handle, avatarUrl]);

  const findMatch = useCallback(() => {
    socketRef.current?.emit("find-match");
  }, []);

  const cancelQueue = useCallback(() => {
    socketRef.current?.emit("cancel-queue");
  }, []);

  const challengeFriend = useCallback((friendHandle: string) => {
    socketRef.current?.emit("challenge-friend", { friendHandle });
  }, []);

  const acceptChallenge = useCallback((fromHandle: string) => {
    setChallenge(null);
    socketRef.current?.emit("accept-challenge", { fromHandle });
  }, []);

  const declineChallenge = useCallback(() => {
    setChallenge(null);
    socketRef.current?.emit("decline-challenge", {
      fromHandle: challenge?.from ?? "",
    });
  }, [challenge]);

  const sendPlayerState = useCallback(
    (data: {
      x: number;
      y: number;
      velX: number;
      velY: number;
      cheeseCollected: number;
      caught: boolean;
      cheesesTaken: number[];
    }) => {
      socketRef.current?.emit("player-state", data);
    },
    []
  );

  const sendTimeUp = useCallback(() => {
    socketRef.current?.emit("match-time-up");
  }, []);

  const reset = useCallback(() => {
    setMatchStart(null);
    setMatchEnd(null);
    setOpponentState(null);
    setStatus("idle");
  }, []);

  return {
    status,
    connected,
    matchStart,
    opponentState,
    matchEnd,
    queuePosition,
    challenge,
    error,
    findMatch,
    cancelQueue,
    challengeFriend,
    acceptChallenge,
    declineChallenge,
    sendPlayerState,
    sendTimeUp,
    reset,
  };
}
