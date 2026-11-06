import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { q } from "@/lib/db";
import { handle, HttpError, readJson } from "@/lib/http";
import { buildMe } from "@/lib/me";
import { KEY_PROVIDERS, verifyKey, type KeyProvider } from "@/lib/models";

export const dynamic = "force-dynamic";

// Kullanıcının kendi Gemini / OpenRouter anahtarını kaydeder (key: null → siler).
export const PUT = handle(async (req: Request) => {
  const user = await requireUser();
  const { provider, key } = await readJson<{ provider?: string; key?: string | null }>(req);
  if (!KEY_PROVIDERS.includes(provider as KeyProvider)) throw new HttpError(400, "Geçersiz sağlayıcı.");
  const p = provider as KeyProvider;

  if (key == null || key === "") {
    await q("UPDATE users SET api_keys = api_keys - $2 WHERE id = $1", [user.id, p]);
  } else {
    const k = String(key).trim();
    if (k.length < 10 || k.length > 300 || /\s/.test(k)) throw new HttpError(400, "Anahtar biçimi geçersiz.");
    try {
      await verifyKey(p, k);
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
    await q("UPDATE users SET api_keys = api_keys || jsonb_build_object($2::text, $3::text) WHERE id = $1", [
      user.id,
      p,
      encrypt(k),
    ]);
  }
  return NextResponse.json(await buildMe(user));
});
