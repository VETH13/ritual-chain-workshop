import { NextResponse } from "next/server";

// GET /api/online-players
// Proxies to the PvP WebSocket server's HTTP endpoint to get the list of
// online players. In dev, connects directly to localhost:3003.
// In prod (Vercel), returns empty list (PvP server not deployed there).

export async function GET() {
  // Dev mode — connect directly to the PvP server
  if (
    process.env.NODE_ENV !== "production" ||
    process.env.VERCEL_ENV === "development"
  ) {
    try {
      const resp = await fetch("http://localhost:3003/online-players", {
        signal: AbortSignal.timeout(3000),
      });
      if (resp.ok) {
        const data = await resp.json();
        return NextResponse.json(data);
      }
    } catch (e) {
      // fall through
    }
  }
  // Prod / fallback — return empty list
  return NextResponse.json({ online: [] });
}
