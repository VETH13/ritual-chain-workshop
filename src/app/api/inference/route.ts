import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import { DIFFICULTY_CONFIG, Difficulty } from "@/lib/game";

// AI Inference endpoint — simulates Ritual's verifiable AI inference oracle
// The cat calls this endpoint with the current game state, and the LLM returns
// its next strategic move. Each response includes a "proof" hash that gets
// anchored on Ritual testnet.

export type InferenceRequest = {
  difficulty: "kitten" | "hunter" | "strategist";
  mousePos: { x: number; y: number };
  mouseVel: { x: number; y: number };
  catPos: { x: number; y: number };
  catVel: { x: number; y: number };
  cheeses: { x: number; y: number }[];
  holes: { x: number; y: number }[];
  arenaWidth: number;
  arenaHeight: number;
  elapsed: number;
  // Optional: mouse's recent positions (for memory-aware AI)
  mouseHistory?: { x: number; y: number }[];
};

export type InferenceResponse = {
  targetX: number;
  targetY: number;
  strategy: string;
  confidence: number;
  reasoning: string;
  inferenceHash: string;
};

function hashPayload(payload: object): string {
  const json = JSON.stringify(payload);
  let h1 = 0x811c9dc5;
  let h2 = 0x1000193;
  for (let i = 0; i < json.length; i++) {
    const c = json.charCodeAt(i);
    h1 = ((h1 ^ c) * 0x01000193) | 0;
    h2 = (h2 + c * 31 + i) | 0;
  }
  const p1 = (h1 >>> 0).toString(16).padStart(8, "0");
  const p2 = (h2 >>> 0).toString(16).padStart(8, "0");
  return ("0x" + p1 + p2 + "ff1a" + Date.now().toString(16).padStart(8, "0"))
    .padEnd(66, "0")
    .slice(0, 66);
}

// Fallback heuristic inference if LLM is unavailable.
// Uses the new difficulty knobs (thinkingDepth, lookaheadSec, usesTraps, etc.)
function heuristicInference(req: InferenceRequest): InferenceResponse {
  const cfg = DIFFICULTY_CONFIG[req.difficulty as Difficulty];
  const { mousePos, mouseVel, catPos, cheeses, holes } = req;
  let target = { ...mousePos };
  let strategy = "chase";
  let confidence = 0.5;
  const arenaW = req.arenaWidth;
  const arenaH = req.arenaHeight;

  // Compute predicted mouse position using lookaheadSec
  const lookahead = cfg.lookaheadSec;
  const predX = mousePos.x + mouseVel.x * lookahead * 60; // 60fps assumption
  const predY = mousePos.y + mouseVel.y * lookahead * 60;
  // Wall-bounce prediction: if predicted position is out of bounds, reflect
  let bx = predX;
  let by = predY;
  if (bx < 0) bx = -bx;
  if (bx > arenaW) bx = 2 * arenaW - bx;
  if (by < 0) by = -by;
  if (by > arenaH) by = 2 * arenaH - by;
  bx = Math.max(0, Math.min(arenaW, bx));
  by = Math.max(0, Math.min(arenaH, by));

  if (req.difficulty === "kitten") {
    // Random wander, occasionally drift toward mouse
    if (Math.random() < cfg.aggression) {
      target = { x: mousePos.x, y: mousePos.y };
      strategy = "wander-chase";
    } else {
      const angle = Math.random() * Math.PI * 2;
      target = {
        x: catPos.x + Math.cos(angle) * 100,
        y: catPos.y + Math.sin(angle) * 100,
      };
      strategy = "wander";
    }
    confidence = 0.3 + Math.random() * 0.3;
  } else if (req.difficulty === "hunter") {
    // Greedy chase with 1-step prediction + bounded pursuit
    target = { x: bx, y: by };
    strategy = "predict-1";
    // Bounded pursuit: if mouse is heading into a hole, flank instead
    if (cfg.usesBoundedPursuit) {
      for (const h of holes) {
        const dMouseToHole = Math.hypot(h.x - mousePos.x, h.y - mousePos.y);
        const dPredToHole = Math.hypot(h.x - bx, h.y - by);
        if (dMouseToHole < 80 && dPredToHole < 50) {
          // Mouse is fleeing to a hole — intercept between mouse and hole
          const ang = Math.atan2(h.y - mousePos.y, h.x - mousePos.x);
          target = {
            x: mousePos.x + Math.cos(ang) * 40,
            y: mousePos.y + Math.sin(ang) * 40,
          };
          strategy = "intercept-hole";
          break;
        }
      }
    }
    confidence = 0.65 + (lookahead > 0 ? 0.1 : 0);
  } else {
    // Strategist: deep prediction + traps + flanking
    target = { x: bx, y: by };
    strategy = "predict-deep";
    confidence = 0.85;

    // If mouse is near a cheese, predict they'll detour to it
    if (cfg.usesTraps) {
      for (const c of cheeses) {
        const d = Math.hypot(c.x - mousePos.x, c.y - mousePos.y);
        if (d < 120) {
          // Ambush between cheese and mouse's predicted path
          const ang = Math.atan2(c.y - mousePos.y, c.x - mousePos.x);
          target = {
            x: c.x - Math.cos(ang) * 30, // just past the cheese
            y: c.y - Math.sin(ang) * 30,
          };
          strategy = "ambush-lure";
          break;
        }
      }
    }
    // Avoid charging into holes — flank around them
    if (cfg.usesBoundedPursuit) {
      for (const h of holes) {
        const d = Math.hypot(h.x - target.x, h.y - target.y);
        if (d < 60) {
          const ang = Math.atan2(h.y - catPos.y, h.x - catPos.x);
          target = {
            x: h.x + Math.cos(ang + Math.PI / 2) * 80,
            y: h.y + Math.sin(ang + Math.PI / 2) * 80,
          };
          strategy = "flank-hole";
          break;
        }
      }
    }
    // Wall-pinning: if mouse is near a wall, target a position that cuts off escape
    const wallMargin = 60;
    const nearWallX = mousePos.x < wallMargin || mousePos.x > arenaW - wallMargin;
    const nearWallY = mousePos.y < wallMargin || mousePos.y > arenaH - wallMargin;
    if ((nearWallX || nearWallY) && strategy === "predict-deep") {
      // Cut off the wall by aiming between mouse and arena center
      const cx = arenaW / 2;
      const cy = arenaH / 2;
      target = {
        x: (mousePos.x + cx) / 2,
        y: (mousePos.y + cy) / 2,
      };
      strategy = "wall-pin";
      confidence = 0.9;
    }
  }

  // Clamp target to arena
  target.x = Math.max(0, Math.min(arenaW, target.x));
  target.y = Math.max(0, Math.min(arenaH, target.y));

  return {
    targetX: target.x,
    targetY: target.y,
    strategy,
    confidence,
    reasoning: `Heuristic ${req.difficulty} (depth=${cfg.thinkingDepth}, lookahead=${cfg.lookaheadSec}s): ${strategy}`,
    inferenceHash: hashPayload({ target, strategy, confidence, ...req }),
  };
}

function buildLLMPrompt(body: InferenceRequest): string {
  const cfg = DIFFICULTY_CONFIG[body.difficulty as Difficulty];
  const history = body.mouseHistory ?? [];
  const historyStr =
    history.length > 0
      ? history
          .slice(-cfg.memoryTicks)
          .map((p, i) => `t-${history.length - i}: (${Math.round(p.x)}, ${Math.round(p.y)})`)
          .join(" → ")
      : "(none)";

  return `You are the AI brain of a cat in a "cat vs mouse" arena game on Ritual testnet.
Your goal: catch the mouse before the 60-second timer runs out.

DIFFICULTY: ${body.difficulty.toUpperCase()}
- thinkingDepth: ${cfg.thinkingDepth} (reason ${cfg.thinkingDepth} step(s) ahead)
- memoryTicks: ${cfg.memoryTicks} (remember last ${cfg.memoryTicks} mouse positions)
- usesTraps: ${cfg.usesTraps} (set ambushes near cheese/holes if true)
- aggression: ${cfg.aggression} (0=flank/stealth, 1=direct pursuit)
- lookaheadSec: ${cfg.lookaheadSec} (extrapolate mouse trajectory this far)

CURRENT STATE:
- Arena: ${body.arenaWidth} x ${body.arenaHeight}
- Mouse position: (${body.mousePos.x.toFixed(0)}, ${body.mousePos.y.toFixed(0)})
- Mouse velocity: (${body.mouseVel.x.toFixed(2)}, ${body.mouseVel.y.toFixed(2)})
- Cat position: (${body.catPos.x.toFixed(0)}, ${body.catPos.y.toFixed(0)})
- Cat velocity: (${body.catVel.x.toFixed(2)}, ${body.catVel.y.toFixed(2)})
- Cheese on field: ${JSON.stringify(body.cheeses.map((c) => ({ x: Math.round(c.x), y: Math.round(c.y) })))}
- Mouse holes (safe zones — mouse is invincible inside): ${JSON.stringify(body.holes.map((h) => ({ x: Math.round(h.x), y: Math.round(h.y) })))}
- Mouse history (oldest → newest): ${historyStr}
- Elapsed: ${body.elapsed}ms / 60000ms

STRATEGIC PRIORITIES (in order):
1. If mouse is heading toward a hole, INTERCEPT between mouse and hole.
2. If mouse is near a cheese, AMBUSH past the cheese (mouse will detour to grab it).
3. If mouse is near a wall, WALL-PIN by targeting a point between mouse and arena center.
4. Otherwise, PREDICT mouse position ${cfg.lookaheadSec}s ahead and pursue.
5. NEVER target inside a hole — the cat cannot enter.

Respond with ONLY valid JSON, no markdown:
{
  "targetX": <number 0-${body.arenaWidth}>,
  "targetY": <number 0-${body.arenaHeight}>,
  "strategy": "<one of: wander, chase, predict, ambush, flank, predict-1, predict-deep, ambush-lure, flank-hole, intercept-hole, wall-pin>",
  "confidence": <number 0-1>,
  "reasoning": "<one short sentence explaining your tactical choice>"
}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as InferenceRequest;

    // Try LLM inference for "verifiable AI" flavor — fallback to heuristic
    try {
      const zai = await ZAI.create();
      const prompt = buildLLMPrompt(body);

      const completion = await zai.chat.completions.create({
        messages: [
          {
            role: "system",
            content:
              "You are a tactical AI for a cat-vs-mouse game. You reason about mouse trajectory, holes, cheese, and walls. Output ONLY raw JSON, no markdown, no extra text.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 400,
      });

      const raw = completion.choices[0]?.message?.content ?? "";
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const cfg = DIFFICULTY_CONFIG[body.difficulty as Difficulty];
        const resp: InferenceResponse = {
          targetX: Math.max(0, Math.min(body.arenaWidth, Number(parsed.targetX))),
          targetY: Math.max(0, Math.min(body.arenaHeight, Number(parsed.targetY))),
          strategy: String(parsed.strategy ?? "chase"),
          confidence: Math.max(0, Math.min(1, Number(parsed.confidence ?? 0.7))),
          reasoning: String(parsed.reasoning ?? ""),
          inferenceHash: hashPayload({ ...parsed, ...body, cfg }),
        };
        return NextResponse.json(resp);
      }
      throw new Error("No JSON in LLM response");
    } catch (e) {
      // Fallback to heuristic
      return NextResponse.json(heuristicInference(body));
    }
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "inference failed" },
      { status: 500 }
    );
  }
}
