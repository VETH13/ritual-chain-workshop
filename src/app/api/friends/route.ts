import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";

// GET /api/friends?handle=xxx — list friends for a player
export async function GET(req: NextRequest) {
  await ensureSchema();
  const handle = req.nextUrl.searchParams.get("handle")?.toLowerCase();
  if (!handle) return NextResponse.json({ friends: [] });

  const [sent, received] = await Promise.all([
    db.friend.findMany({
      where: { fromHandle: handle },
      include: { to: true },
    }),
    db.friend.findMany({
      where: { toHandle: handle },
      include: { from: true },
    }),
  ]);

  const friends = [
    ...sent.map((f) => ({
      handle: f.toHandle,
      status: f.status,
      direction: "out",
      avatar: f.to?.xAvatarUrl,
      createdAt: f.createdAt,
    })),
    ...received.map((f) => ({
      handle: f.fromHandle,
      status: f.status,
      direction: "in",
      avatar: f.from?.xAvatarUrl,
      createdAt: f.createdAt,
    })),
  ];

  return NextResponse.json({ friends });
}

// POST /api/friends — add a friend (or accept pending request)
// Body: { fromHandle, toHandle, action: "add" | "accept" }
export async function POST(req: NextRequest) {
  await ensureSchema();
  try {
    const { fromHandle, toHandle, action } = await req.json();
    if (!fromHandle || !toHandle || !action) {
      return NextResponse.json({ error: "Missing params" }, { status: 400 });
    }
    const from = fromHandle.replace(/^@/, "").trim().toLowerCase();
    const to = toHandle.replace(/^@/, "").trim().toLowerCase();
    if (from === to) {
      return NextResponse.json({ error: "Cannot add yourself" }, { status: 400 });
    }

    // Verify from player exists
    const fromPlayer = await db.player.findUnique({ where: { xHandle: from } });
    if (!fromPlayer) {
      return NextResponse.json({ error: "Your profile not found — login first" }, { status: 404 });
    }

    // If toPlayer doesn't exist, auto-create them with avatar from unavatar.io
    // This lets you add friends who haven't logged in yet.
    let toPlayer = await db.player.findUnique({ where: { xHandle: to } });
    if (!toPlayer) {
      const avatarUrl = `https://unavatar.io/twitter/${to}`;
      toPlayer = await db.player.create({
        data: { xHandle: to, xAvatarUrl: avatarUrl },
      });
    }

    if (action === "add") {
      // Check if there's a pending request in the other direction (auto-accept)
      const reverse = await db.friend.findUnique({
        where: { fromHandle_toHandle: { fromHandle: to, toHandle: from } },
      });
      if (reverse && reverse.status === "pending") {
        // Auto-accept both sides
        await db.friend.update({
          where: { id: reverse.id },
          data: { status: "accepted" },
        });
        await db.friend.upsert({
          where: { fromHandle_toHandle: { fromHandle: from, toHandle: to } },
          update: { status: "accepted" },
          create: { fromHandle: from, toHandle: to, status: "accepted" },
        });
        return NextResponse.json({ ok: true, status: "accepted" });
      }
      // Create pending request
      await db.friend.upsert({
        where: { fromHandle_toHandle: { fromHandle: from, toHandle: to } },
        update: {},
        create: { fromHandle: from, toHandle: to, status: "pending" },
      });
      return NextResponse.json({ ok: true, status: "pending" });
    }

    if (action === "accept") {
      await db.friend.update({
        where: { fromHandle_toHandle: { fromHandle: to, toHandle: from } },
        data: { status: "accepted" },
      });
      await db.friend.upsert({
        where: { fromHandle_toHandle: { fromHandle: from, toHandle: to } },
        update: { status: "accepted" },
        create: { fromHandle: from, toHandle: to, status: "accepted" },
      });
      return NextResponse.json({ ok: true, status: "accepted" });
    }

    if (action === "block") {
      await db.friend.upsert({
        where: { fromHandle_toHandle: { fromHandle: from, toHandle: to } },
        update: { status: "blocked" },
        create: { fromHandle: from, toHandle: to, status: "blocked" },
      });
      return NextResponse.json({ ok: true, status: "blocked" });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Friend operation failed" },
      { status: 500 }
    );
  }
}

// DELETE /api/friends?from=xxx&to=xxx — remove a friend
export async function DELETE(req: NextRequest) {
  const from = req.nextUrl.searchParams.get("from")?.toLowerCase();
  const to = req.nextUrl.searchParams.get("to")?.toLowerCase();
  if (!from || !to) {
    return NextResponse.json({ error: "Missing params" }, { status: 400 });
  }
  await db.friend.deleteMany({
    where: {
      OR: [
        { fromHandle: from, toHandle: to },
        { fromHandle: to, toHandle: from },
      ],
    },
  });
  return NextResponse.json({ ok: true });
}
