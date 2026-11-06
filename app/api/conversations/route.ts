import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { handle } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const user = await requireUser();
  const rows = await q<{ id: string; title: string; updated_at: Date }>(
    "SELECT id, title, updated_at FROM conversations WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 500",
    [user.id]
  );
  return NextResponse.json({
    conversations: rows.map((r) => ({ id: r.id, title: r.title, updatedAt: new Date(r.updated_at).getTime() })),
  });
});
