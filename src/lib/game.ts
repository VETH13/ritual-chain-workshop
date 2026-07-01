// Game state types and helpers
export type Vec2 = { x: number; y: number };

export type Difficulty = "kitten" | "hunter" | "strategist";

export type EntityType = "mouse" | "cat" | "cheese" | "hole" | "decoy" | "boost";

export type Entity = {
  id: string;
  type: EntityType;
  pos: Vec2;
  vel: Vec2;
  radius: number;
  color: string;
  // For cat: AI state
  aiState?: {
    lastInference: number;
    target: Vec2 | null;
    strategy: string;
    confidence: number;
  };
  // Power-up expiry
  expiresAt?: number;
  // Cheese value
  value?: number;
};

export type GameState = {
  width: number;
  height: number;
  mouse: Entity;
  cat: Entity;
  cheeses: Entity[];
  holes: Entity[];
  decoys: Entity[];
  boosts: Entity[];
  particles: Particle[];
  score: number;
  cheeseCollected: number;
  startTime: number;
  elapsed: number;
  duration: number; // total game duration in ms
  caught: boolean;
  survived: boolean;
  status: "playing" | "won" | "lost";
  lastInferenceHash: string | null;
  inferenceCount: number;
  speedBoostUntil: number;
  inHoleUntil: number;
  difficulty: Difficulty;
};

export type Particle = {
  pos: Vec2;
  vel: Vec2;
  life: number;
  maxLife: number;
  color: string;
  size: number;
};

export const DIFFICULTY_CONFIG: Record<
  Difficulty,
  {
    label: string;
    catSpeed: number;
    mouseSpeed: number;
    catInferInterval: number;
    catPrediction: number;
    payoutMultiplier: number;
    description: string;
    emoji: string;
  }
> = {
  kitten: {
    label: "Kitten 🐱",
    catSpeed: 1.6,
    mouseSpeed: 2.4,
    catInferInterval: 1500,
    catPrediction: 0,
    payoutMultiplier: 1.5,
    description: "Clumsy AI, random walk. Easy 1.5x payout.",
    emoji: "🐱",
  },
  hunter: {
    label: "Hunter 🐯",
    catSpeed: 2.0,
    mouseSpeed: 2.4,
    catInferInterval: 800,
    catPrediction: 1,
    payoutMultiplier: 2.5,
    description: "Greedy chase with 1-step prediction. 2.5x payout.",
    emoji: "🐯",
  },
  strategist: {
    label: "Strategist 🦁",
    catSpeed: 2.4,
    mouseSpeed: 2.4,
    catInferInterval: 500,
    catPrediction: 3,
    payoutMultiplier: 5,
    description: "Deep predictive inference, ambush logic. 5x payout.",
    emoji: "🦁",
  },
};

export const ARENA_WIDTH = 800;
export const ARENA_HEIGHT = 560;
export const GAME_DURATION_MS = 60_000;

// Spacing helpers
export function dist(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function normalize(v: Vec2): Vec2 {
  const m = Math.sqrt(v.x * v.x + v.y * v.y) || 1;
  return { x: v.x / m, y: v.y / m };
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function randomPos(width: number, height: number, margin = 40): Vec2 {
  return {
    x: margin + Math.random() * (width - 2 * margin),
    y: margin + Math.random() * (height - 2 * margin),
  };
}

// Distance from point to line segment (for prediction)
export function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return dist(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = clamp(t, 0, 1);
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy });
}
