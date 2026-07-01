import { NextRequest, NextResponse } from "next/server";
import { fetchXProfile, upsertPlayer, createSession } from "@/lib/auth";

// POST /api/x-login
// Body: { handle: "elonmusk" } for X login
//    or { handle: "okx:0xabc..." } for OKX wallet login
// Returns: { session, player }
export async function POST(req: NextRequest) {
  try {
    const { handle } = await req.json();
    if (!handle || typeof handle !== "string") {
      return NextResponse.json(
        { error: "Missing handle" },
        { status: 400 }
      );
    }

    const raw = handle.trim();

    // OKX wallet login — handle is "okx:0x..."
    if (raw.toLowerCase().startsWith("okx:")) {
      const addr = raw.slice(4).trim().toLowerCase();
      if (!/^0x[a-f0-9]{40}$/.test(addr)) {
        return NextResponse.json(
          { error: "Invalid OKX wallet address" },
          { status: 400 }
        );
      }
      const profile = await fetchXProfile(`okx:${addr}`);
      const player = await upsertPlayer(profile, addr);
      const session = createSession(profile);
      return NextResponse.json({ session, player });
    }

    // X (Twitter) handle login
    const clean = raw.replace(/^@/, "").trim().toLowerCase();
    if (!/^[a-z0-9_]{1,15}$/i.test(clean)) {
      return NextResponse.json(
        { error: "Invalid X handle (max 15 chars, alphanumeric + underscore)" },
        { status: 400 }
      );
    }

    const profile = await fetchXProfile(clean);
    const player = await upsertPlayer(profile);
    const session = createSession(profile);

    return NextResponse.json({ session, player });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Login failed" },
      { status: 500 }
    );
  }
}
