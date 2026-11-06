import { NextResponse } from "next/server";
import { AUTH_COOKIE, tokenFor } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const pw = process.env.ACCESS_PASSWORD;
  if (!pw) {
    return NextResponse.json(
      { error: "Sunucuda ACCESS_PASSWORD ayarlanmamış. Vercel ayarlarından ekle ve yeniden deploy et." },
      { status: 500 }
    );
  }
  const body = (await req.json().catch(() => ({}))) as { password?: string };
  if (typeof body.password !== "string" || body.password !== pw) {
    await new Promise((r) => setTimeout(r, 700)); // tahmin denemelerini yavaşlatır
    return NextResponse.json({ error: "Şifre yanlış." }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, await tokenFor(pw), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
