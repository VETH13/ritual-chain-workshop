"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import {
  ARENA_WIDTH,
  ARENA_HEIGHT,
  GAME_DURATION_MS,
  DIFFICULTY_CONFIG,
  Difficulty,
  Entity,
  Particle,
  randomPos,
  dist,
  normalize,
  clamp,
} from "@/lib/game";
import { inferenceHash } from "@/lib/ritual";

type InferenceResp = {
  targetX: number;
  targetY: number;
  strategy: string;
  confidence: number;
  reasoning: string;
  inferenceHash: string;
};

type Props = {
  myHandle: string;
  myAvatarUrl: string;
  opponentHandle: string;
  opponentAvatarUrl: string;
  sharedCheeses: { x: number; y: number; taken: string | null }[];
  onEnd: (result: {
    survivedMs: number;
    cheeseCollected: number;
    caught: boolean;
    inferenceHash: string | null;
  }) => void;
  onStateUpdate: (s: {
    x: number;
    y: number;
    velX: number;
    velY: number;
    cheeseCollected: number;
    caught: boolean;
    cheesesTaken: number[];
  }) => void;
  opponentState: {
    handle: string;
    x: number;
    y: number;
    velX: number;
    velY: number;
    cheeseCollected: number;
    caught: boolean;
    cheesesTaken: number[];
  } | null;
  catState: { x: number; y: number; targetX: number; targetY: number } | null;
  onCatState: (s: { x: number; y: number; targetX: number; targetY: number }) => void;
  onTimeUp: () => void;
};

// Pre-load avatar images
function useAvatar(url: string) {
  const ref = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!url) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;
    ref.current = img;
  }, [url]);
  return ref;
}

export default function PvPCanvas({
  myHandle,
  myAvatarUrl,
  opponentHandle,
  opponentAvatarUrl,
  sharedCheeses,
  onEnd,
  onStateUpdate,
  opponentState,
  catState,
  onCatState,
  onTimeUp,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<{
    mouse: Entity;
    cat: Entity;
    cheeses: { x: number; y: number; taken: string | null; idx: number }[];
    particles: Particle[];
    score: number;
    cheeseCollected: number;
    caught: boolean;
    startTime: number;
    elapsed: number;
    cheesesTaken: number[];
    lastInferenceAt: number;
    lastStateSent: number;
    speedBoostUntil: number;
    inHoleUntil: number;
    holes: Entity[];
    boosts: Entity[];
    ended: boolean;
  } | null>(null);
  const keysRef = useRef<Record<string, boolean>>({});
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const inflightInferenceRef = useRef<boolean>(false);
  const myAvatarRef = useAvatar(myAvatarUrl);
  const oppAvatarRef = useAvatar(opponentAvatarUrl);
  const [catStrategy, setCatStrategy] = useState("chase");
  const [catConfidence, setCatConfidence] = useState(0.5);

  // Init state
  const initGame = useCallback(() => {
    const mouse: Entity = {
      id: "mouse-me",
      type: "mouse",
      pos: { x: 100, y: ARENA_HEIGHT / 2 },
      vel: { x: 0, y: 0 },
      radius: 16,
      color: "#3bdcff",
    };
    const cat: Entity = {
      id: "cat",
      type: "cat",
      pos: { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2 },
      vel: { x: 0, y: 0 },
      radius: 22,
      color: "#ff4d6d",
      aiState: { lastInference: 0, target: { ...mouse.pos }, strategy: "chase", confidence: 0.6 },
    };
    const holes: Entity[] = Array.from({ length: 3 }).map((_, i) => ({
      id: `hole-${i}`,
      type: "hole",
      pos: randomPos(ARENA_WIDTH, ARENA_HEIGHT, 80),
      vel: { x: 0, y: 0 },
      radius: 22,
      color: "#4a3b6b",
    }));
    const boosts: Entity[] = [];
    stateRef.current = {
      mouse,
      cat,
      cheeses: sharedCheeses.map((c, i) => ({ ...c, idx: i })),
      particles: [],
      score: 0,
      cheeseCollected: 0,
      caught: false,
      startTime: performance.now(),
      elapsed: 0,
      cheesesTaken: [],
      lastInferenceAt: 0,
      lastStateSent: 0,
      speedBoostUntil: 0,
      inHoleUntil: 0,
      holes,
      boosts,
      ended: false,
    };
  }, [sharedCheeses]);

  useEffect(() => {
    initGame();
  }, [initGame]);

  // Keyboard
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      keysRef.current[e.key.toLowerCase()] = true;
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(e.key.toLowerCase())) {
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => (keysRef.current[e.key.toLowerCase()] = false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const spawnParticles = useCallback(
    (list: Particle[], x: number, y: number, color: string, count = 12) => {
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + Math.random() * 0.3;
        const s = 1 + Math.random() * 3;
        list.push({
          pos: { x, y },
          vel: { x: Math.cos(a) * s, y: Math.sin(a) * s },
          life: 0,
          maxLife: 400 + Math.random() * 300,
          color,
          size: 2 + Math.random() * 3,
        });
      }
    },
    []
  );

  // AI inference for the cat (PvP uses "hunter" difficulty)
  const requestInference = useCallback(async () => {
    const s = stateRef.current;
    if (!s || s.caught || inflightInferenceRef.current) return;
    inflightInferenceRef.current = true;
    try {
      const body = {
        difficulty: "hunter" as Difficulty,
        mousePos: { ...s.mouse.pos },
        mouseVel: { ...s.mouse.vel },
        catPos: { ...s.cat.pos },
        catVel: { ...s.cat.vel },
        cheeses: s.cheeses.filter((c) => !c.taken).map((c) => ({ x: c.x, y: c.y })),
        holes: s.holes.map((h) => ({ x: h.pos.x, y: h.pos.y })),
        arenaWidth: ARENA_WIDTH,
        arenaHeight: ARENA_HEIGHT,
        elapsed: s.elapsed,
      };
      const resp = await fetch("/api/inference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data: InferenceResp = await resp.json();
      if (s.cat.aiState) {
        s.cat.aiState.target = { x: data.targetX, y: data.targetY };
        s.cat.aiState.strategy = data.strategy;
        s.cat.aiState.confidence = data.confidence;
      }
      s.lastInferenceAt = s.elapsed;
      setCatStrategy(data.strategy);
      setCatConfidence(data.confidence);
      onCatState({
        x: s.cat.pos.x,
        y: s.cat.pos.y,
        targetX: data.targetX,
        targetY: data.targetY,
      });
    } catch {
      if (s.cat.aiState) {
        s.cat.aiState.target = { ...s.mouse.pos };
      }
    } finally {
      inflightInferenceRef.current = false;
    }
  }, [onCatState]);

  // Main loop
  useEffect(() => {
    const loop = (t: number) => {
      const s = stateRef.current;
      if (!s) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }
      const dt = lastTimeRef.current ? t - lastTimeRef.current : 16;
      lastTimeRef.current = t;
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      if (!s.caught && !s.ended) {
        s.elapsed = t - s.startTime;

        // AI inference every 800ms
        if (s.elapsed - s.lastInferenceAt > 800 && !inflightInferenceRef.current) {
          requestInference();
        }

        // Mouse movement
        const m = s.mouse;
        const k = keysRef.current;
        const ax = (k["arrowright"] || k["d"] ? 1 : 0) - (k["arrowleft"] || k["a"] ? 1 : 0);
        const ay = (k["arrowdown"] || k["s"] ? 1 : 0) - (k["arrowup"] || k["w"] ? 1 : 0);
        const aMag = Math.hypot(ax, ay) || 1;
        const speedMult = t < s.speedBoostUntil ? 1.7 : 1;
        const ms = 2.4 * speedMult;
        m.vel.x = (ax / aMag) * ms;
        m.vel.y = (ay / aMag) * ms;
        if (ax === 0 && ay === 0) {
          m.vel.x *= 0.7;
          m.vel.y *= 0.7;
        }
        m.pos.x = clamp(m.pos.x + m.vel.x * (dt / 16), m.radius, ARENA_WIDTH - m.radius);
        m.pos.y = clamp(m.pos.y + m.vel.y * (dt / 16), m.radius, ARENA_HEIGHT - m.radius);

        // Cat movement
        const c = s.cat;
        const tgt = c.aiState?.target ?? m.pos;
        const dx = tgt.x - c.pos.x;
        const dy = tgt.y - c.pos.y;
        const d = Math.hypot(dx, dy) || 1;
        const cs = 2.0; // hunter speed
        c.vel.x = (dx / d) * cs;
        c.vel.y = (dy / d) * cs;
        c.pos.x = clamp(c.pos.x + c.vel.x * (dt / 16), c.radius, ARENA_WIDTH - c.radius);
        c.pos.y = clamp(c.pos.y + c.vel.y * (dt / 16), c.radius, ARENA_HEIGHT - c.radius);

        // Holes
        let inHole = false;
        for (const h of s.holes) {
          if (dist(m.pos, h.pos) < h.radius) {
            inHole = true;
            s.inHoleUntil = t + 200;
          }
        }
        const safe = inHole || t < s.inHoleUntil;

        // Cheese collection (shared - once taken, gone for both)
        for (let i = s.cheeses.length - 1; i >= 0; i--) {
          const ch = s.cheeses[i];
          if (ch.taken) continue;
          if (dist(m.pos, { x: ch.x, y: ch.y }) < m.radius + 12) {
            ch.taken = myHandle;
            s.score += 50;
            s.cheeseCollected += 1;
            s.cheesesTaken.push(ch.idx);
            spawnParticles(s.particles, ch.x, ch.y, "#ffd33d", 14);
          }
        }
        // Remove taken cheeses (but keep indices for sync)
        // Actually keep them with taken flag so we don't re-add

        // Cat catches mouse
        if (!safe && dist(m.pos, c.pos) < m.radius + c.radius - 2) {
          s.caught = true;
          spawnParticles(s.particles, m.pos.x, m.pos.y, "#ff4d6d", 40);
        }

        // Time up
        if (s.elapsed >= GAME_DURATION_MS) {
          s.ended = true;
          onTimeUp();
        }

        // Particles
        for (let i = s.particles.length - 1; i >= 0; i--) {
          const p = s.particles[i];
          p.life += dt;
          p.pos.x += p.vel.x;
          p.pos.y += p.vel.y;
          p.vel.x *= 0.96;
          p.vel.y *= 0.96;
          if (p.life >= p.maxLife) s.particles.splice(i, 1);
        }

        // Send state to opponent every 50ms
        if (t - s.lastStateSent > 50) {
          s.lastStateSent = t;
          onStateUpdate({
            x: m.pos.x,
            y: m.pos.y,
            velX: m.vel.x,
            velY: m.vel.y,
            cheeseCollected: s.cheeseCollected,
            caught: s.caught,
            cheesesTaken: s.cheesesTaken,
          });
        }
      }

      // Render
      render(ctx, s, t, opponentState, myAvatarRef.current, oppAvatarRef.current, myHandle, opponentHandle);

      // End
      if (s.caught && !s.ended) {
        s.ended = true;
        onEnd({
          survivedMs: Math.min(s.elapsed, GAME_DURATION_MS),
          cheeseCollected: s.cheeseCollected,
          caught: true,
          inferenceHash: null,
        });
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [
    requestInference,
    spawnParticles,
    onEnd,
    onStateUpdate,
    onTimeUp,
    opponentState,
    myAvatarRef,
    oppAvatarRef,
    myHandle,
    opponentHandle,
  ]);

  // Sync cat position from opponent if provided
  useEffect(() => {
    if (catState && stateRef.current) {
      stateRef.current.cat.pos.x = catState.x;
      stateRef.current.cat.pos.y = catState.y;
      if (stateRef.current.cat.aiState) {
        stateRef.current.cat.aiState.target = { x: catState.targetX, y: catState.targetY };
      }
    }
  }, [catState]);

  // Render function
  const render = (
    ctx: CanvasRenderingContext2D,
    s: NonNullable<typeof stateRef.current>,
    t: number,
    oppState: Props["opponentState"],
    myImg: HTMLImageElement | null,
    oppImg: HTMLImageElement | null,
    myH: string,
    oppH: string
  ) => {
    // Background
    const bgGrad = ctx.createLinearGradient(0, 0, 0, ARENA_HEIGHT);
    bgGrad.addColorStop(0, "#0a0e1f");
    bgGrad.addColorStop(1, "#0d0418");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);

    // Grid
    ctx.strokeStyle = "rgba(124,159,255,0.08)";
    ctx.lineWidth = 1;
    for (let x = 0; x < ARENA_WIDTH; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, ARENA_HEIGHT);
      ctx.stroke();
    }
    for (let y = 0; y < ARENA_HEIGHT; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(ARENA_WIDTH, y);
      ctx.stroke();
    }

    // Border
    ctx.strokeStyle = "rgba(255,77,109,0.3)";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, ARENA_WIDTH - 2, ARENA_HEIGHT - 2);

    // Holes
    for (const h of s.holes) {
      const grad = ctx.createRadialGradient(h.pos.x, h.pos.y, 2, h.pos.x, h.pos.y, h.radius);
      grad.addColorStop(0, "#1a0f2e");
      grad.addColorStop(1, "#0a0612");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(h.pos.x, h.pos.y, h.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(155,107,255,0.4)";
      ctx.stroke();
    }

    // Cheeses (shared)
    for (const ch of s.cheeses) {
      if (ch.taken) continue;
      ctx.save();
      ctx.translate(ch.x, ch.y);
      ctx.rotate(t / 1000);
      const grad = ctx.createRadialGradient(0, 0, 1, 0, 0, 20);
      grad.addColorStop(0, "#fff6c2");
      grad.addColorStop(0.5, "#ffd33d");
      grad.addColorStop(1, "rgba(255,160,0,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffd33d";
      ctx.beginPath();
      ctx.moveTo(-10, -4);
      ctx.lineTo(10, 0);
      ctx.lineTo(-10, 4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Particles
    for (const p of s.particles) {
      const a = 1 - p.life / p.maxLife;
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.pos.x, p.pos.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Opponent mouse (purple)
    if (oppState) {
      const o: Entity = {
        id: "opp",
        type: "mouse",
        pos: { x: oppState.x, y: oppState.y },
        vel: { x: oppState.velX, y: oppState.velY },
        radius: 16,
        color: "#c2a4ff",
      };
      drawMouse(ctx, o, t, oppImg, "#c2a4ff", oppState.caught);
    }

    // My mouse (cyan)
    const safe = t < s.inHoleUntil;
    const boosted = t < s.speedBoostUntil;
    drawMouse(ctx, s.mouse, t, myImg, safe ? "#7cffa0" : boosted ? "#c2a4ff" : "#3bdcff", s.caught);

    // Cat
    drawCat(ctx, s.cat, t);

    // Score HUD on canvas
    ctx.font = "bold 16px monospace";
    ctx.fillStyle = "#3bdcff";
    ctx.fillText(`@${myH}: ${s.cheeseCollected}`, 12, 24);
    if (oppState) {
      ctx.fillStyle = "#c2a4ff";
      ctx.fillText(`@${oppH}: ${oppState.cheeseCollected}`, 12, 44);
    }
    const timeLeft = Math.max(0, (GAME_DURATION_MS - s.elapsed) / 1000).toFixed(1);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 20px monospace";
    ctx.textAlign = "right";
    ctx.fillText(`${timeLeft}s`, ARENA_WIDTH - 12, 28);
    ctx.textAlign = "left";
  };

  function drawMouse(
    ctx: CanvasRenderingContext2D,
    m: Entity,
    t: number,
    img: HTMLImageElement | null,
    glowColor: string,
    caught: boolean
  ) {
    if (caught) {
      ctx.globalAlpha = 0.3;
    }
    // Glow
    const grad = ctx.createRadialGradient(m.pos.x, m.pos.y, 1, m.pos.x, m.pos.y, m.radius * 2.5);
    grad.addColorStop(0, glowColor + "aa");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(m.pos.x, m.pos.y, m.radius * 2.5, 0, Math.PI * 2);
    ctx.fill();
    // Avatar image (circular) or fallback circle
    const size = m.radius * 2.2;
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(m.pos.x, m.pos.y, m.radius, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(img, m.pos.x - m.radius, m.pos.y - m.radius, m.radius * 2, m.radius * 2);
      ctx.restore();
      // Ring
      ctx.strokeStyle = glowColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(m.pos.x, m.pos.y, m.radius + 1, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = glowColor;
      ctx.beginPath();
      ctx.arc(m.pos.x, m.pos.y, m.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawCat(ctx: CanvasRenderingContext2D, c: Entity, t: number) {
    // Glow
    const grad = ctx.createRadialGradient(c.pos.x, c.pos.y, 1, c.pos.x, c.pos.y, c.radius * 3);
    grad.addColorStop(0, "rgba(255,77,109,0.5)");
    grad.addColorStop(1, "rgba(255,77,109,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(c.pos.x, c.pos.y, c.radius * 3, 0, Math.PI * 2);
    ctx.fill();
    // Body
    ctx.fillStyle = c.color;
    ctx.beginPath();
    ctx.arc(c.pos.x, c.pos.y, c.radius, 0, Math.PI * 2);
    ctx.fill();
    // Eye
    const eyeR = 4 + Math.sin(t / 200) * 1.2;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(c.pos.x, c.pos.y - 2, eyeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#7a0010";
    ctx.beginPath();
    ctx.arc(c.pos.x, c.pos.y - 2, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  return (
    <div className="relative w-full">
      <canvas
        ref={canvasRef}
        width={ARENA_WIDTH}
        height={ARENA_HEIGHT}
        className="w-full rounded-2xl border border-rose-500/30 shadow-[0_0_60px_rgba(255,77,109,0.2)]"
        style={{ aspectRatio: `${ARENA_WIDTH}/${ARENA_HEIGHT}` }}
      />
      <div className="pointer-events-none absolute left-3 top-12 flex items-center gap-2 rounded-md bg-black/60 px-2 py-1 text-xs text-rose-300 backdrop-blur">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-rose-500" />
        Cat: <span className="font-mono text-rose-200">{catStrategy}</span>
        <span className="text-rose-400/60">·</span>
        Conf: <span className="font-mono text-rose-200">{(catConfidence * 100).toFixed(0)}%</span>
      </div>
    </div>
  );
}
