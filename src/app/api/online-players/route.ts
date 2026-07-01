import { NextResponse } from "next/server";

// GET /api/online-players
// Proxies to the PvP WebSocket server's HTTP endpoint to get the list of
// online players. In dev, connects to localhost:3003.
// In prod, connects to the Railway-deployed PvP server.

const PVP_SERVER_URL =
  process.env.NODE_ENV === "production"
    ? "https://pvp-server-production-5bc3.up.railway.app"
    : "http://localhost:3003";

export async function GET() {
  try {
    const resp = await fetch(`${PVP_SERVER_URL}/online-players`, {
      signal: AbortSignal.timeout(5000),
    });
    if (resp.ok) {
      const data = await resp.json();
      return NextResponse.json(data);
    }
  } catch (e) {
    // fall through
  }
  return NextResponse.json({ online: [] });
}
