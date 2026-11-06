import { NextResponse } from "next/server";
import { createSession, verifyPassword } from "@/lib/auth";
import { q } from "@/lib/db";
import { handle, HttpError, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

export const POST = handle(async (req: Request) => {
  const { username, password } = await readJson<{ username?: string; password?: string }>(req);
  if (typeof username !== "string" || typeof password !== "string") {
    throw new HttpError(400, "Kullanıcı adı ve şifre gerekli.");
  }
  const rows = await q<{ id: string; password_hash: string }>(
    "SELECT id, password_hash FROM users WHERE username = $1",
    [username.trim().toLowerCase()]
  );
  const user = rows[0];
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    await new Promise((r) => setTimeout(r, 700)); // tahmin denemelerini yavaşlatır
    throw new HttpError(401, "Kullanıcı adı veya şifre yanlış.");
  }
  await createSession(user.id);
  return NextResponse.json({ ok: true });
});
