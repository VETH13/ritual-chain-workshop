import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";

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

// Fallback heuristic inference if LLM is unavailable
function heuristicInference(req: InferenceRequest): InferenceResponse {
  const { difficulty, mousePos, mouseVel, catPos, cheeses, holes } = req;
  let target = { ...mousePos };
  let strategy = "chase";
  let confidence = 0.5;

  if (difficulty === "kitten") {
    // Random wander
    const angle = Math.random() * Math.PI * 2;
    target = {
      x: catPos.x + Math.cos(angle) * 100,
      y: catPos.y + Math.sin(angle) * 100,
    };
    strategy = "wander";
    confidence = 0.3 + Math.random() * 0.3;
  } else if (difficulty === "hunter") {
    // Greedy chase with 1-step prediction
    target = {
      x: mousePos.x + mouseVel.x * 15,
      y: mousePos.y + mouseVel.y * 15,
    };
    strategy = "predict-1";
    confidence = 0.65;
  } else {
    // Strategist: predict 3 steps + consider cheeses as lures
    let predX = mousePos.x + mouseVel.x * 45;
    let predY = mousePos.y + mouseVel.y * 45;
    // If mouse near a cheese, predict they'll go for it
    for (const c of cheeses) {
      const d = Math.hypot(c.x - mousePos.x, c.y - mousePos.y);
      if (d < 100) {
        predX = c.x;
        predY = c.y;
        strategy = "ambush-lure";
        break;
      }
    }
    // Avoid targeting holes
    for (const h of holes) {
      const d = Math.hypot(h.x - predX, h.y - predY);
      if (d < 50) {
        // Circle around
        const ang = Math.atan2(h.y - catPos.y, h.x - catPos.x);
        predX = h.x + Math.cos(ang + Math.PI / 2) * 80;
        predY = h.y + Math.sin(ang + Math.PI / 2) * 80;
        strategy = "flank-hole";
      }
    }
    target = { x: predX, y: predY };
    confidence = 0.85;
  }

  return {
    targetX: target.x,
    targetY: target.y,
    strategy,
    confidence,
    reasoning: `Heuristic ${difficulty} strategy: ${strategy}`,
    inferenceHash: hashPayload({ target, strategy, confidence, ...req }),
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as InferenceRequest;

    // Try LLM inference for "verifiable AI" flavor — fallback to heuristic
    try {
      const zai = await ZAI.create();
      const prompt = `You are the AI brain of a cat in a "cat vs mouse" arena game.
You must decide the cat's next target position to maximize catch probability.

Current state:
- Difficulty: ${body.difficulty}
- Arena: ${body.arenaWidth} x ${body.arenaHeight}
- Mouse position: (${body.mousePos.x.toFixed(0)}, ${body.mousePos.y.toFixed(0)})
- Mouse velocity: (${body.mouseVel.x.toFixed(2)}, ${body.mouseVel.y.toFixed(2)})
- Cat position: (${body.catPos.x.toFixed(0)}, ${body.catPos.y.toFixed(0)})
- Cheese on field: ${JSON.stringify(body.cheeses.map((c) => ({ x: Math.round(c.x), y: Math.round(c.y) })))}
- Mouse holes (safe zones): ${JSON.stringify(body.holes.map((h) => ({ x: Math.round(h.x), y: Math.round(h.y) })))}
- Elapsed: ${body.elapsed}ms / 60000ms

Respond with ONLY valid JSON, no markdown:
{
  "targetX": <number 0-${body.arenaWidth}>,
  "targetY": <number 0-${body.arenaHeight}>,
  "strategy": "<one of: wander, chase, predict, ambush, flank, predict-1, ambush-lure, flank-hole>",
  "confidence": <number 0-1>,
  "reasoning": "<one short sentence>"
}`;

      const completion = await zai.chat.completions.create({
        messages: [
          {
            role: "system",
            content:
              "You are a tactical AI for a cat-vs-mouse game. Output ONLY raw JSON, no extra text.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 300,
      });

      const raw = completion.choices[0]?.message?.content ?? "";
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const resp: InferenceResponse = {
          targetX: Number(parsed.targetX),
          targetY: Number(parsed.targetY),
          strategy: String(parsed.strategy ?? "chase"),
          confidence: Number(parsed.confidence ?? 0.7),
          reasoning: String(parsed.reasoning ?? ""),
          inferenceHash: hashPayload({ ...parsed, ...body }),
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
