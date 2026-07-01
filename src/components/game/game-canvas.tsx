"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import {
  ARENA_WIDTH,
  ARENA_HEIGHT,
  GAME_DURATION_MS,
  DIFFICULTY_CONFIG,
  Difficulty,
  Entity,
  GameState,
  Particle,
  randomPos,
  dist,
  normalize,
  clamp,
} from "@/lib/game";
import { inferenceHash } from "@/lib/ritual";

// Pre-load sprite images
const mouseImg = typeof Image !== "undefined" ? new Image() : null;
const catImg = typeof Image !== "undefined" ? new Image() : null;
if (mouseImg) mouseImg.src = "/mouse-sprite.png";
if (catImg) catImg.src = "/cat-sprite.png";

type Props = {
  difficulty: Difficulty;
  paused: boolean;
  onGameEnd: (result: {
    survivedMs: number;
    cheeseCollected: number;
    caught: boolean;
    inferenceHash: string | null;
    inferenceCount: number;
  }) => void;
  onLiveUpdate?: (snapshot: {
    elapsed: number;
    score: number;
    inferenceCount: number;
    catStrategy: string;
    catConfidence: number;
    speedBoost: boolean;
    inHole: boolean;
  }) => void;
};

type InferenceResp = {
  targetX: number;
  targetY: number;
  strategy: string;
  confidence: number;
  reasoning: string;
  inferenceHash: string;
};

export default function GameCanvas({
  difficulty,
  paused,
  onGameEnd,
  onLiveUpdate,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState | null>(null);
  const keysRef = useRef<Record<string, boolean>>({});
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const lastInferenceAtRef = useRef<number>(0);
  const inflightInferenceRef = useRef<boolean>(false);
  const endedRef = useRef<boolean>(false);
  const [catStrategy, setCatStrategy] = useState<string>("—");
  const [catConfidence, setCatConfidence] = useState<number>(0);

  // ---- Init game state on mount / difficulty change ----
  const initGame = useCallback(() => {
    const cfg = DIFFICULTY_CONFIG[difficulty];
    const mouse: Entity = {
      id: "mouse",
      type: "mouse",
      pos: { x: 100, y: ARENA_HEIGHT / 2 },
      vel: { x: 0, y: 0 },
      radius: 16,
      color: "#3bdcff",
    };
    const cat: Entity = {
      id: "cat",
      type: "cat",
      pos: { x: ARENA_WIDTH - 100, y: ARENA_HEIGHT / 2 },
      vel: { x: 0, y: 0 },
      radius: 24,
      color: "#ff4d6d",
      aiState: {
        lastInference: 0,
        target: { x: mouse.pos.x, y: mouse.pos.y },
        strategy: "init",
        confidence: 0,
      },
    };
    const cheeses: Entity[] = Array.from({ length: 5 }).map((_, i) => ({
      id: `cheese-${i}`,
      type: "cheese",
      pos: randomPos(ARENA_WIDTH, ARENA_HEIGHT, 60),
      vel: { x: 0, y: 0 },
      radius: 10,
      color: "#ffd33d",
      value: 50,
    }));
    const holes: Entity[] = Array.from({ length: 3 }).map((_, i) => ({
      id: `hole-${i}`,
      type: "hole",
      pos: randomPos(ARENA_WIDTH, ARENA_HEIGHT, 80),
      vel: { x: 0, y: 0 },
      radius: 22,
      color: "#4a3b6b",
    }));
    const decoys: Entity[] = [];
    const boosts: Entity[] = Array.from({ length: 1 }).map((_, i) => ({
      id: `boost-${i}`,
      type: "boost",
      pos: randomPos(ARENA_WIDTH, ARENA_HEIGHT, 60),
      vel: { x: 0, y: 0 },
      radius: 11,
      color: "#9b6bff",
    }));

    stateRef.current = {
      width: ARENA_WIDTH,
      height: ARENA_HEIGHT,
      mouse,
      cat,
      cheeses,
      holes,
      decoys,
      boosts,
      particles: [],
      score: 0,
      cheeseCollected: 0,
      startTime: performance.now(),
      elapsed: 0,
      duration: GAME_DURATION_MS,
      caught: false,
      survived: false,
      status: "playing",
      lastInferenceHash: null,
      inferenceCount: 0,
      speedBoostUntil: 0,
      inHoleUntil: 0,
      difficulty,
    };
    endedRef.current = false;
    lastInferenceAtRef.current = 0;
    inflightInferenceRef.current = false;
  }, [difficulty]);

  useEffect(() => {
    initGame();
  }, [initGame]);

  // ---- Keyboard input ----
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      keysRef.current[e.key.toLowerCase()] = true;
      // Prevent arrow scroll
      if (
        [
          "arrowup",
          "arrowdown",
          "arrowleft",
          "arrowright",
          " ",
        ].includes(e.key.toLowerCase())
      ) {
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      keysRef.current[e.key.toLowerCase()] = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // ---- Spawn particles helper ----
  const spawnParticles = useCallback(
    (
      list: Particle[],
      x: number,
      y: number,
      color: string,
      count = 12
    ) => {
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

  // ---- Request AI inference for the cat ----
  const requestInference = useCallback(async () => {
    const s = stateRef.current;
    if (!s || s.status !== "playing" || inflightInferenceRef.current) return;
    inflightInferenceRef.current = true;
    const cfg = DIFFICULTY_CONFIG[difficulty];
    try {
      const body = {
        difficulty,
        mousePos: { ...s.mouse.pos },
        mouseVel: { ...s.mouse.vel },
        catPos: { ...s.cat.pos },
        catVel: { ...s.cat.vel },
        cheeses: s.cheeses.map((c) => ({ x: c.pos.x, y: c.pos.y })),
        holes: s.holes.map((h) => ({ x: h.pos.x, y: h.pos.y })),
        arenaWidth: s.width,
        arenaHeight: s.height,
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
      s.lastInferenceHash = data.inferenceHash;
      s.inferenceCount += 1;
      lastInferenceAtRef.current = s.elapsed;
      setCatStrategy(data.strategy);
      setCatConfidence(data.confidence);
    } catch (e) {
      // Fallback: target mouse directly
      if (s.cat.aiState) {
        s.cat.aiState.target = { ...s.mouse.pos };
        s.cat.aiState.strategy = "chase-fallback";
        s.cat.aiState.confidence = 0.5;
      }
      // Local inference hash fallback
      s.lastInferenceHash = inferenceHash({
        mousePos: s.mouse.pos,
        catPos: s.cat.pos,
        difficulty,
        elapsed: s.elapsed,
        fallback: true,
      });
      s.inferenceCount += 1;
      lastInferenceAtRef.current = s.elapsed;
    } finally {
      inflightInferenceRef.current = false;
    }
  }, [difficulty]);

  // ---- Main game loop ----
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

      // Update only if playing and not paused
      if (s.status === "playing" && !paused) {
        s.elapsed = t - s.startTime;

        // Trigger AI inference at interval
        const cfg = DIFFICULTY_CONFIG[difficulty];
        if (
          s.elapsed - lastInferenceAtRef.current > cfg.catInferInterval &&
          !inflightInferenceRef.current
        ) {
          requestInference();
        }

        // ---- Mouse movement ----
        const m = s.mouse;
        const k = keysRef.current;
        const ax =
          (k["arrowright"] || k["d"] ? 1 : 0) -
          (k["arrowleft"] || k["a"] ? 1 : 0);
        const ay =
          (k["arrowdown"] || k["s"] ? 1 : 0) -
          (k["arrowup"] || k["w"] ? 1 : 0);
        const aMag = Math.hypot(ax, ay) || 1;
        const speedMult = t < s.speedBoostUntil ? 1.7 : 1;
        const ms = cfg.mouseSpeed * speedMult;
        m.vel.x = (ax / aMag) * ms;
        m.vel.y = (ay / aMag) * ms;
        if (ax === 0 && ay === 0) {
          m.vel.x *= 0.7;
          m.vel.y *= 0.7;
        }
        m.pos.x = clamp(m.pos.x + m.vel.x * (dt / 16), m.radius, s.width - m.radius);
        m.pos.y = clamp(m.pos.y + m.vel.y * (dt / 16), m.radius, s.height - m.radius);

        // ---- Cat movement (towards aiState.target) ----
        const c = s.cat;
        const tgt = c.aiState?.target ?? m.pos;
        const dx = tgt.x - c.pos.x;
        const dy = tgt.y - c.pos.y;
        const d = Math.hypot(dx, dy) || 1;
        const cs = cfg.catSpeed;
        c.vel.x = (dx / d) * cs;
        c.vel.y = (dy / d) * cs;
        c.pos.x = clamp(c.pos.x + c.vel.x * (dt / 16), c.radius, s.width - c.radius);
        c.pos.y = clamp(c.pos.y + c.vel.y * (dt / 16), c.radius, s.height - c.radius);

        // ---- Holes (safe zone) ----
        let inHole = false;
        for (const h of s.holes) {
          if (dist(m.pos, h.pos) < h.radius) {
            inHole = true;
            s.inHoleUntil = t + 200;
          }
        }
        const safe = inHole || t < s.inHoleUntil;

        // ---- Cheese collection ----
        for (let i = s.cheeses.length - 1; i >= 0; i--) {
          const ch = s.cheeses[i];
          if (dist(m.pos, ch.pos) < m.radius + ch.radius) {
            s.score += ch.value || 50;
            s.cheeseCollected += 1;
            spawnParticles(s.particles, ch.pos.x, ch.pos.y, "#ffd33d", 14);
            s.cheeses.splice(i, 1);
            // Respawn after delay
            setTimeout(() => {
              const st = stateRef.current;
              if (st && st.status === "playing") {
                st.cheeses.push({
                  id: `cheese-${Date.now()}`,
                  type: "cheese",
                  pos: randomPos(ARENA_WIDTH, ARENA_HEIGHT, 60),
                  vel: { x: 0, y: 0 },
                  radius: 10,
                  color: "#ffd33d",
                  value: 50,
                });
              }
            }, 3000);
          }
        }

        // ---- Boost pickup ----
        for (let i = s.boosts.length - 1; i >= 0; i--) {
          const b = s.boosts[i];
          if (dist(m.pos, b.pos) < m.radius + b.radius) {
            s.speedBoostUntil = t + 4000;
            spawnParticles(s.particles, b.pos.x, b.pos.y, "#9b6bff", 18);
            s.boosts.splice(i, 1);
            setTimeout(() => {
              const st = stateRef.current;
              if (st && st.status === "playing") {
                st.boosts.push({
                  id: `boost-${Date.now()}`,
                  type: "boost",
                  pos: randomPos(ARENA_WIDTH, ARENA_HEIGHT, 60),
                  vel: { x: 0, y: 0 },
                  radius: 11,
                  color: "#9b6bff",
                });
              }
            }, 8000);
          }
        }

        // ---- Decoys (spawn on space) ----
        // Press space to drop a decoy that distracts the cat for 3s
        if (k[" "] && s.decoys.length < 3 && t - (s.decoys.at(-1)?.expiresAt ?? 0) > 1000) {
          s.decoys.push({
            id: `decoy-${Date.now()}`,
            type: "decoy",
            pos: { ...m.pos },
            vel: { x: 0, y: 0 },
            radius: 10,
            color: "#7cf",
            expiresAt: t + 3000,
          });
          if (s.cat.aiState) {
            s.cat.aiState.target = { ...m.pos };
            s.cat.aiState.strategy = "distracted";
            s.cat.aiState.confidence = 0.2;
          }
          k[" "] = false; // consume
        }
        // Cleanup expired decoys
        s.decoys = s.decoys.filter((d) => !d.expiresAt || d.expiresAt > t);

        // ---- Cat catches mouse ----
        if (!safe && dist(m.pos, c.pos) < m.radius + c.radius - 2) {
          s.status = "lost";
          s.caught = true;
          spawnParticles(s.particles, m.pos.x, m.pos.y, "#ff4d6d", 40);
          spawnParticles(s.particles, m.pos.x, m.pos.y, "#3bdcff", 30);
        }

        // ---- Survival win ----
        if (s.elapsed >= s.duration && s.status === "playing") {
          s.status = "won";
          s.survived = true;
        }

        // ---- Particles ----
        for (let i = s.particles.length - 1; i >= 0; i--) {
          const p = s.particles[i];
          p.life += dt;
          p.pos.x += p.vel.x;
          p.pos.y += p.vel.y;
          p.vel.x *= 0.96;
          p.vel.y *= 0.96;
          if (p.life >= p.maxLife) s.particles.splice(i, 1);
        }

        // Live update to parent
        onLiveUpdate?.({
          elapsed: s.elapsed,
          score: s.score,
          inferenceCount: s.inferenceCount,
          catStrategy: s.cat.aiState?.strategy ?? "—",
          catConfidence: s.cat.aiState?.confidence ?? 0,
          speedBoost: t < s.speedBoostUntil,
          inHole: safe,
        });
      }

      // ---- RENDER ----
      render(ctx, s, t);

      // End game hook
      if (s.status !== "playing" && !endedRef.current) {
        endedRef.current = true;
        onGameEnd({
          survivedMs: Math.min(s.elapsed, s.duration),
          cheeseCollected: s.cheeseCollected,
          caught: s.status === "lost",
          inferenceHash: s.lastInferenceHash,
          inferenceCount: s.inferenceCount,
        });
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [
    difficulty,
    paused,
    requestInference,
    spawnParticles,
    onGameEnd,
    onLiveUpdate,
  ]);

  // ---- Render function ----
  const render = (ctx: CanvasRenderingContext2D, s: GameState, t: number) => {
    // BG
    ctx.fillStyle = "#070b18";
    ctx.fillRect(0, 0, s.width, s.height);

    // Grid floor
    ctx.strokeStyle = "rgba(80,110,170,0.12)";
    ctx.lineWidth = 1;
    for (let x = 0; x < s.width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, s.height);
      ctx.stroke();
    }
    for (let y = 0; y < s.height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(s.width, y);
      ctx.stroke();
    }

    // Border glow
    ctx.strokeStyle = "rgba(124,159,255,0.35)";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, s.width - 2, s.height - 2);

    // Holes
    for (const h of s.holes) {
      const grad = ctx.createRadialGradient(
        h.pos.x,
        h.pos.y,
        2,
        h.pos.x,
        h.pos.y,
        h.radius
      );
      grad.addColorStop(0, "#1a0f2e");
      grad.addColorStop(1, "#0a0612");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(h.pos.x, h.pos.y, h.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(155,107,255,0.4)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // Pulse
      ctx.strokeStyle = `rgba(155,107,255,${0.1 + 0.1 * Math.sin(t / 300)})`;
      ctx.beginPath();
      ctx.arc(h.pos.x, h.pos.y, h.radius + 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Cheeses (glowing yellow)
    for (const ch of s.cheeses) {
      ctx.save();
      ctx.translate(ch.pos.x, ch.pos.y);
      ctx.rotate(t / 1000);
      const grad = ctx.createRadialGradient(0, 0, 1, 0, 0, ch.radius * 2);
      grad.addColorStop(0, "#fff6c2");
      grad.addColorStop(0.5, "#ffd33d");
      grad.addColorStop(1, "rgba(255,160,0,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, ch.radius * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffd33d";
      ctx.beginPath();
      // Triangle wedge cheese
      ctx.moveTo(-ch.radius, -ch.radius * 0.4);
      ctx.lineTo(ch.radius, 0);
      ctx.lineTo(-ch.radius, ch.radius * 0.4);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#a86b00";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }

    // Boosts
    for (const b of s.boosts) {
      const pulse = 1 + 0.15 * Math.sin(t / 150);
      const grad = ctx.createRadialGradient(
        b.pos.x,
        b.pos.y,
        1,
        b.pos.x,
        b.pos.y,
        b.radius * 2.5 * pulse
      );
      grad.addColorStop(0, "#d8c2ff");
      grad.addColorStop(0.5, "#9b6bff");
      grad.addColorStop(1, "rgba(155,107,255,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(b.pos.x, b.pos.y, b.radius * 2.5 * pulse, 0, Math.PI * 2);
      ctx.fill();
      // Lightning bolt
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.moveTo(b.pos.x - 3, b.pos.y - 6);
      ctx.lineTo(b.pos.x + 2, b.pos.y - 1);
      ctx.lineTo(b.pos.x - 1, b.pos.y);
      ctx.lineTo(b.pos.x + 3, b.pos.y + 6);
      ctx.lineTo(b.pos.x - 2, b.pos.y + 1);
      ctx.lineTo(b.pos.x + 1, b.pos.y);
      ctx.closePath();
      ctx.fill();
    }

    // Decoys
    for (const d of s.decoys) {
      const alpha = d.expiresAt ? Math.max(0, (d.expiresAt - t) / 3000) : 1;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#3bdcff";
      ctx.beginPath();
      ctx.arc(d.pos.x, d.pos.y, d.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Particles
    for (const p of s.particles) {
      const a = 1 - p.life / p.maxLife;
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.pos.x, p.pos.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Mouse (player) — uses sprite image with glow & status tint
    const m = s.mouse;
    const safe = t < s.inHoleUntil;
    const boosted = t < s.speedBoostUntil;
    const mScale = 0.18; // sprite is ~360px, target ~32px radius
    const mSize = m.radius * 2.6;
    // Trail
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = m.color;
    ctx.beginPath();
    ctx.arc(m.pos.x - m.vel.x * 3, m.pos.y - m.vel.y * 3, m.radius * 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    // Glow
    const mGrad = ctx.createRadialGradient(
      m.pos.x,
      m.pos.y,
      1,
      m.pos.x,
      m.pos.y,
      m.radius * 2.8
    );
    mGrad.addColorStop(0, safe ? "rgba(124,255,160,0.65)" : boosted ? "rgba(194,164,255,0.65)" : "rgba(124,210,255,0.65)");
    mGrad.addColorStop(1, "rgba(59,220,255,0)");
    ctx.fillStyle = mGrad;
    ctx.beginPath();
    ctx.arc(m.pos.x, m.pos.y, m.radius * 2.8, 0, Math.PI * 2);
    ctx.fill();
    // Direction angle for sprite rotation
    const mvLen = Math.hypot(m.vel.x, m.vel.y);
    let mAngle = 0;
    if (mvLen > 0.1) {
      mAngle = Math.atan2(m.vel.y, m.vel.x);
    }
    // Draw sprite, flipped horizontally based on direction
    ctx.save();
    ctx.translate(m.pos.x, m.pos.y);
    if (m.vel.x < 0) {
      // Facing left — flip
      ctx.scale(-1, 1);
      ctx.rotate(-mAngle);
    } else {
      ctx.rotate(mAngle);
    }
    // Slight bob
    const bob = Math.sin(t / 120) * 1;
    ctx.translate(0, bob);
    if (mouseImg && mouseImg.complete && mouseImg.naturalWidth > 0) {
      // Tint by overlaying color if safe/boosted
      ctx.drawImage(mouseImg, -mSize / 2, -mSize / 2, mSize, mSize);
      if (safe) {
        ctx.globalCompositeOperation = "source-atop";
        ctx.fillStyle = "rgba(124,255,160,0.35)";
        ctx.fillRect(-mSize / 2, -mSize / 2, mSize, mSize);
        ctx.globalCompositeOperation = "source-over";
      } else if (boosted) {
        ctx.globalCompositeOperation = "source-atop";
        ctx.fillStyle = "rgba(194,164,255,0.45)";
        ctx.fillRect(-mSize / 2, -mSize / 2, mSize, mSize);
        ctx.globalCompositeOperation = "source-over";
      }
    } else {
      // Fallback: simple circle
      ctx.fillStyle = safe ? "#7cffa0" : boosted ? "#c2a4ff" : "#3bdcff";
      ctx.beginPath();
      ctx.arc(0, 0, m.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Cat (AI) — uses sprite image with red glow
    const c = s.cat;
    const cSize = c.radius * 2.8;
    // Target line
    if (c.aiState?.target) {
      ctx.strokeStyle = `rgba(255,77,109,${0.15 + 0.1 * Math.sin(t / 200)})`;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(c.pos.x, c.pos.y);
      ctx.lineTo(c.aiState.target.x, c.aiState.target.y);
      ctx.stroke();
      ctx.setLineDash([]);
      // Target marker
      ctx.strokeStyle = "rgba(255,77,109,0.4)";
      ctx.beginPath();
      ctx.arc(c.aiState.target.x, c.aiState.target.y, 8, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Glow
    const cGrad = ctx.createRadialGradient(
      c.pos.x,
      c.pos.y,
      1,
      c.pos.x,
      c.pos.y,
      c.radius * 3.2
    );
    cGrad.addColorStop(0, "rgba(255,77,109,0.55)");
    cGrad.addColorStop(1, "rgba(255,77,109,0)");
    ctx.fillStyle = cGrad;
    ctx.beginPath();
    ctx.arc(c.pos.x, c.pos.y, c.radius * 3.2, 0, Math.PI * 2);
    ctx.fill();
    // Sprite
    const cvLen = Math.hypot(c.vel.x, c.vel.y);
    let cAngle = 0;
    if (cvLen > 0.1) {
      cAngle = Math.atan2(c.vel.y, c.vel.x);
    }
    ctx.save();
    ctx.translate(c.pos.x, c.pos.y);
    // Cat sprite faces right naturally — flip if moving left
    if (c.vel.x < 0) {
      ctx.scale(-1, 1);
      ctx.rotate(-cAngle);
    } else {
      ctx.rotate(cAngle);
    }
    // Pulsing scale when confidence is high
    const pulse = 1 + (c.aiState?.confidence ?? 0) * 0.05 * Math.sin(t / 150);
    ctx.scale(pulse, pulse);
    if (catImg && catImg.complete && catImg.naturalWidth > 0) {
      ctx.drawImage(catImg, -cSize / 2, -cSize / 2, cSize, cSize);
      // Red tint overlay (menacing)
      ctx.globalCompositeOperation = "source-atop";
      ctx.fillStyle = `rgba(255,77,109,${0.15 + (c.aiState?.confidence ?? 0.5) * 0.25})`;
      ctx.fillRect(-cSize / 2, -cSize / 2, cSize, cSize);
      ctx.globalCompositeOperation = "source-over";
    } else {
      // Fallback: red circle
      ctx.fillStyle = c.color;
      ctx.beginPath();
      ctx.arc(0, 0, c.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // AI Eye — pulsing marker above cat
    const eyeR = 4 + Math.sin(t / 200) * 1.2;
    ctx.fillStyle = "#ff4d6d";
    ctx.beginPath();
    ctx.arc(c.pos.x - 8, c.pos.y - c.radius - 14, eyeR * 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(c.pos.x - 8, c.pos.y - c.radius - 14, 1.5, 0, Math.PI * 2);
    ctx.fill();
    // Confidence ring around the marker
    ctx.strokeStyle = `rgba(255,77,109,${c.aiState?.confidence ?? 0.5})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(c.pos.x - 8, c.pos.y - c.radius - 14, eyeR * 1.6, 0, Math.PI * 2 * (c.aiState?.confidence ?? 0.5));
    ctx.stroke();
  };

  return (
    <div className="relative w-full">
      <canvas
        ref={canvasRef}
        width={ARENA_WIDTH}
        height={ARENA_HEIGHT}
        className="w-full rounded-xl border border-rose-500/30 shadow-[0_0_40px_rgba(255,77,109,0.15)]"
        style={{ imageRendering: "pixelated", aspectRatio: `${ARENA_WIDTH}/${ARENA_HEIGHT}` }}
      />
      <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 rounded-md bg-black/60 px-2 py-1 text-xs text-rose-300 backdrop-blur">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-rose-500" />
        AI Strategy: <span className="font-mono text-rose-200">{catStrategy}</span>
        <span className="text-rose-400/60">·</span>
        Conf: <span className="font-mono text-rose-200">{(catConfidence * 100).toFixed(0)}%</span>
      </div>
    </div>
  );
}
