import { NextResponse } from "next/server";
import { isAdminName, requireUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { handle, HttpError, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const u = await requireUser();
  if (!u.isAdmin) throw new HttpError(403, "Bu sayfa sadece admin içindir.");
  return u;
}

export const GET = handle(async () => {
  await requireAdmin();
  const rows = await q<{ id: string; username: string; is_pro: boolean; created_at: Date; convs: string; own_key: boolean }>(
    `SELECT u.id, u.username, u.is_pro, u.created_at,
            (SELECT count(*) FROM conversations c WHERE c.user_id = u.id) AS convs,
            (u.api_keys ? 'openrouter') AS own_key
     FROM users u ORDER BY u.created_at`
  );
  return NextResponse.json({
    users: rows.map((r) => ({
      id: r.id,
      username: r.username,
      isPro: r.is_pro,
      isAdmin: isAdminName(r.username),
      ownKey: r.own_key,
      conversations: Number(r.convs),
      createdAt: new Date(r.created_at).getTime(),
    })),
  });
});

// Bir kullanıcıyı pro yapar veya pro'luğunu kaldırır.
export const PATCH = handle(async (req: Request) => {
  await requireAdmin();
  const { userId, isPro } = await readJson<{ userId?: string; isPro?: boolean }>(req);
  if (typeof userId !== "string" || typeof isPro !== "boolean") throw new HttpError(400, "Geçersiz istek.");
  const r = await q("UPDATE users SET is_pro = $2 WHERE id = $1 RETURNING id", [userId, isPro]);
  if (!r.length) throw new HttpError(404, "Kullanıcı bulunamadı.");
  return NextResponse.json({ ok: true });
});
