// PvP WebSocket server for Ritual Cat × Chain Mouse
// ================================================
// Handles real-time 1v1 matchmaking and game state sync.
// Both players are mice; a single AI cat chases both.
// Winner = most cheese when timer ends, or last survivor.

import { createServer } from "http";
import { Server, Socket } from "socket.io";

type Player = {
  socket: Socket;
  handle: string;
  avatarUrl: string;
  status: "queueing" | "in-match" | "idle";
  matchId: string | null;
};

type Match = {
  id: string;
  players: [Player, Player];
  state: "waiting" | "playing" | "ended";
  startTime: number;
  // Shared game state
  cheeses: { x: number; y: number; taken: string | null }[];
  scores: Record<string, number>; // handle → cheese count
  catches: Record<string, boolean>; // handle → caught
};

// Create a bare HTTP server — we'll add the request handler later
// (after `players` map is defined, and we need to chain it with socket.io's handler)
const httpServer = createServer();

const io = new Server(httpServer, {
  path: "/",
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingTimeout: 60000,
  pingInterval: 25000,
});

const players = new Map<string, Player>(); // socketId → Player
const queue: Player[] = [];
const matches = new Map<string, Match>();

function generateMatchId() {
  return `match_${Math.random().toString(36).slice(2, 10)}`;
}

function startMatch(p1: Player, p2: Player) {
  const matchId = generateMatchId();
  p1.matchId = matchId;
  p2.matchId = matchId;
  p1.status = "in-match";
  p2.status = "in-match";

  // Generate shared cheese positions (same for both players)
  const cheeses = Array.from({ length: 6 }).map((_, i) => ({
    x: 80 + Math.random() * 640,
    y: 60 + Math.random() * 440,
    taken: null,
  }));

  const match: Match = {
    id: matchId,
    players: [p1, p2],
    state: "playing",
    startTime: Date.now(),
    cheeses,
    scores: { [p1.handle]: 0, [p2.handle]: 0 },
    catches: { [p1.handle]: false, [p2.handle]: false },
  };
  matches.set(matchId, match);

  // Notify both players
  [p1, p2].forEach((p, idx) => {
    p.socket.emit("match-start", {
      matchId,
      opponent: {
        handle: idx === 0 ? p2.handle : p1.handle,
        avatarUrl: idx === 0 ? p2.avatarUrl : p1.avatarUrl,
      },
      youAre: idx === 0 ? "player1" : "player2",
      cheeses,
      startTime: match.startTime,
      duration: 60000,
    });
  });

  console.log(`Match ${matchId} started: @${p1.handle} vs @${p2.handle}`);
}

function endMatch(matchId: string, reason: "time" | "both-caught" = "time") {
  const match = matches.get(matchId);
  if (!match || match.state === "ended") return;
  match.state = "ended";

  const [p1, p2] = match.players;
  const s1 = match.scores[p1.handle] ?? 0;
  const s2 = match.scores[p2.handle] ?? 0;
  const c1 = match.catches[p1.handle] ?? false;
  const c2 = match.catches[p2.handle] ?? false;

  let winner: string | null;
  if (c1 && c2) {
    winner = null; // draw (both caught)
  } else if (c1) {
    winner = p2.handle;
  } else if (c2) {
    winner = p1.handle;
  } else if (s1 > s2) {
    winner = p1.handle;
  } else if (s2 > s1) {
    winner = p2.handle;
  } else {
    winner = null; // draw
  }

  const result = {
    matchId,
    reason,
    scores: match.scores,
    catches: match.catches,
    winner,
    endedAt: Date.now(),
  };

  [p1, p2].forEach((p) => {
    p.socket.emit("match-end", result);
    p.status = "idle";
    p.matchId = null;
  });

  matches.delete(matchId);
  console.log(`Match ${matchId} ended. Winner: ${winner ?? "draw"}`);
}

io.on("connection", (socket: Socket) => {
  console.log(`Connected: ${socket.id}`);

  socket.on("register", (data: { handle: string; avatarUrl: string }) => {
    const player: Player = {
      socket,
      handle: data.handle.replace(/^@/, "").toLowerCase(),
      avatarUrl: data.avatarUrl,
      status: "idle",
      matchId: null,
    };
    players.set(socket.id, player);
    socket.emit("registered", { ok: true, handle: player.handle });
    console.log(`Registered @${player.handle} (${socket.id})`);
  });

  socket.on("find-match", () => {
    const me = players.get(socket.id);
    if (!me || me.status !== "idle") return;

    // Try to find an opponent in the queue
    const opponent = queue.find((p) => p.handle !== me.handle && p.status === "queueing");
    if (opponent) {
      queue.splice(queue.indexOf(opponent), 1);
      startMatch(opponent, me);
    } else {
      me.status = "queueing";
      queue.push(me);
      socket.emit("queued", { position: queue.length });
      console.log(`@${me.handle} queued (position ${queue.length})`);
    }
  });

  socket.on("cancel-queue", () => {
    const me = players.get(socket.id);
    if (!me) return;
    const idx = queue.indexOf(me);
    if (idx >= 0) queue.splice(idx, 1);
    me.status = "idle";
    socket.emit("queue-cancelled");
  });

  // Challenge a specific friend
  socket.on("challenge-friend", (data: { friendHandle: string }) => {
    const me = players.get(socket.id);
    if (!me) return;
    const friend = Array.from(players.values()).find(
      (p) => p.handle === data.friendHandle.toLowerCase() && p.status === "idle"
    );
    if (friend) {
      friend.socket.emit("challenge-received", {
        from: me.handle,
        avatarUrl: me.avatarUrl,
      });
    } else {
      socket.emit("challenge-failed", {
        reason: "Friend is offline or in a match",
      });
    }
  });

  socket.on("accept-challenge", (data: { fromHandle: string }) => {
    const me = players.get(socket.id);
    if (!me) return;
    const challenger = Array.from(players.values()).find(
      (p) => p.handle === data.fromHandle.toLowerCase()
    );
    if (challenger && challenger.status === "idle") {
      startMatch(challenger, me);
    } else {
      socket.emit("challenge-failed", { reason: "Challenger no longer available" });
    }
  });

  socket.on("decline-challenge", (data: { fromHandle: string }) => {
    const me = players.get(socket.id);
    if (!me) return;
    const challenger = Array.from(players.values()).find(
      (p) => p.handle === data.fromHandle.toLowerCase()
    );
    if (challenger) {
      challenger.socket.emit("challenge-declined", { by: me.handle });
    }
  });

  // In-match state sync
  socket.on("player-state", (data: {
    x: number;
    y: number;
    velX: number;
    velY: number;
    cheeseCollected: number;
    caught: boolean;
    cheesesTaken: number[];
  }) => {
    const me = players.get(socket.id);
    if (!me || !me.matchId) return;
    const match = matches.get(me.matchId);
    if (!match || match.state !== "playing") return;

    // Update score
    match.scores[me.handle] = data.cheeseCollected;
    match.catches[me.handle] = data.caught;

    // Mark cheeses as taken (sync)
    for (const idx of data.cheesesTaken) {
      if (match.cheeses[idx] && !match.cheeses[idx].taken) {
        match.cheeses[idx].taken = me.handle;
      }
    }

    // Broadcast to opponent
    const opponent = match.players.find((p) => p.handle !== me.handle);
    if (opponent) {
      opponent.socket.emit("opponent-state", {
        handle: me.handle,
        x: data.x,
        y: data.y,
        velX: data.velX,
        velY: data.velY,
        cheeseCollected: data.cheeseCollected,
        caught: data.caught,
        cheesesTaken: data.cheesesTaken,
      });
    }

    // Check end conditions
    const bothCaught = match.players.every((p) => match.catches[p.handle]);
    if (bothCaught) {
      endMatch(match.id, "both-caught");
    }
  });

  // Cat state broadcast (one player hosts the AI cat, others see it)
  socket.on("cat-state", (data: { x: number; y: number; targetX: number; targetY: number }) => {
    const me = players.get(socket.id);
    if (!me || !me.matchId) return;
    const match = matches.get(me.matchId);
    if (!match) return;
    const opponent = match.players.find((p) => p.handle !== me.handle);
    if (opponent) {
      opponent.socket.emit("cat-state", data);
    }
  });

  // Match timer ended (either player can trigger)
  socket.on("match-time-up", () => {
    const me = players.get(socket.id);
    if (!me || !me.matchId) return;
    endMatch(me.matchId, "time");
  });

  socket.on("disconnect", () => {
    const me = players.get(socket.id);
    if (!me) {
      console.log(`Disconnected: ${socket.id}`);
      return;
    }
    // Remove from queue
    const idx = queue.indexOf(me);
    if (idx >= 0) queue.splice(idx, 1);
    // If in match, end it (opponent wins by default)
    if (me.matchId) {
      const match = matches.get(me.matchId);
      if (match && match.state === "playing") {
        match.catches[me.handle] = true;
        endMatch(me.matchId, "both-caught");
      }
    }
    players.delete(socket.id);
    console.log(`@${me.handle} disconnected`);
  });

  socket.on("error", (error) => {
    console.error(`Socket error (${socket.id}):`, error);
  });
});

// HTTP endpoints — wrap the existing socket.io request handler
// so we can intercept /online-players and /health
const originalListeners = httpServer.listeners("request").slice();
httpServer.removeAllListeners("request");
httpServer.on("request", (req: any, res: any) => {
  const url = req.url ?? "";
  if (url.startsWith("/online-players") || url === "/health") {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (url.startsWith("/online-players")) {
      const online = Array.from(players.values())
        .filter((p) => p.status !== "in-match")
        .map((p) => ({
          handle: p.handle,
          avatarUrl: p.avatarUrl,
          status: p.status,
        }));
      res.end(JSON.stringify({ online }));
    } else {
      res.end(JSON.stringify({ ok: true, online: players.size }));
    }
    return;
  }
  // For all other paths, delegate to the original socket.io handler
  for (const listener of originalListeners) {
    listener.call(httpServer, req, res);
  }
});

const PORT = 3003;
httpServer.listen(PORT, () => {
  console.log(`🎮 PvP WebSocket server running on port ${PORT}`);
});

process.on("SIGTERM", () => {
  httpServer.close(() => process.exit(0));
});
process.on("SIGINT", () => {
  httpServer.close(() => process.exit(0));
});
