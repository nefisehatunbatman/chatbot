import { NextResponse } from "next/server";
import { requireUser, type UserSettings } from "@/lib/auth";
import { q } from "@/lib/db";
import { handle, HttpError, readJson } from "@/lib/http";
import { buildMe } from "@/lib/me";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const user = await requireUser();
  return NextResponse.json(await buildMe(user));
});

// Ayarlar (sistem talimatı, tema, son model) kullanıcıya özel saklanır.
export const PUT = handle(async (req: Request) => {
  const user = await requireUser();
  const { settings } = await readJson<{ settings?: UserSettings }>(req);
  if (!settings || typeof settings !== "object") throw new HttpError(400, "Ayar gerekli.");
  const clean: UserSettings = {};
  if (typeof settings.system === "string") clean.system = settings.system.slice(0, 8000);
  if (settings.theme === "light" || settings.theme === "dark" || settings.theme === "system") clean.theme = settings.theme;
  if (typeof settings.model === "string") clean.model = settings.model.slice(0, 200);
  await q("UPDATE users SET settings = settings || $2::jsonb WHERE id = $1", [user.id, JSON.stringify(clean)]);
  return NextResponse.json({ ok: true });
});
