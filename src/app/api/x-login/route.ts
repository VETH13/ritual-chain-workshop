import { NextRequest, NextResponse } from "next/server";
import { fetchXProfile, upsertPlayer, createSession } from "@/lib/auth";

// POST /api/x-login
// Body: { handle: "elonmusk" }
// Returns: { session, player }
export async function POST(req: NextRequest) {
  try {
    const { handle } = await req.json();
    if (!handle || typeof handle !== "string") {
      return NextResponse.json(
        { error: "Missing X handle" },
        { status: 400 }
      );
    }
    const clean = handle.replace(/^@/, "").trim().toLowerCase();
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
