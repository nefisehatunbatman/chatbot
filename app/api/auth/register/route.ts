import { NextResponse } from "next/server";
import { createSession, hashPassword } from "@/lib/auth";
import { q } from "@/lib/db";
import { handle, HttpError, newId, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,32}$/;

export const POST = handle(async (req: Request) => {
  const invite = process.env.INVITE_CODE;
  if (!invite) throw new HttpError(403, "Kayıt kapalı (sunucuda INVITE_CODE ayarlanmamış).");

  const { username, password, inviteCode } = await readJson<{
    username?: string;
    password?: string;
    inviteCode?: string;
  }>(req);

  if (inviteCode !== invite) {
    await new Promise((r) => setTimeout(r, 700));
    throw new HttpError(403, "Davet kodu yanlış.");
  }
  if (typeof username !== "string" || !USERNAME_RE.test(username)) {
    throw new HttpError(400, "Kullanıcı adı 3-32 karakter olmalı; harf, rakam, _ . - kullanabilirsin.");
  }
  if (typeof password !== "string" || password.length < 8 || password.length > 200) {
    throw new HttpError(400, "Şifre en az 8 karakter olmalı.");
  }

  const name = username.toLowerCase();
  const exists = await q("SELECT 1 FROM users WHERE username = $1", [name]);
  if (exists.length) throw new HttpError(409, "Bu kullanıcı adı alınmış.");

  const id = newId();
  await q("INSERT INTO users (id, username, password_hash) VALUES ($1, $2, $3)", [
    id,
    name,
    await hashPassword(password),
  ]);
  await createSession(id);
  return NextResponse.json({ ok: true });
});
