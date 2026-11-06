import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { cleanupOrphans, kindOf, LIMITS, toMeta, type AttachmentRow } from "@/lib/attachments";
import { q } from "@/lib/db";
import { handle, HttpError, newId, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

// Blob'a yüklenen dosyayı kullanıcıya bağlar. URL'nin bu kullanıcının klasöründe olduğunu doğrular.
function checkUrl(url: unknown, userId: string): string | null {
  if (url == null) return null;
  if (typeof url !== "string") throw new HttpError(400, "Geçersiz dosya adresi.");
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new HttpError(400, "Geçersiz dosya adresi.");
  }
  if (u.protocol !== "https:" || !u.hostname.endsWith(".blob.vercel-storage.com") || !u.pathname.startsWith(`/u/${userId}/`)) {
    throw new HttpError(403, "Bu dosya sana ait değil.");
  }
  return url;
}

export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const b = await readJson<{ name?: string; mime?: string; size?: number; url?: string; modelUrl?: string }>(req);
  const name = (typeof b.name === "string" && b.name.slice(0, 200)) || "dosya";
  const mime = (typeof b.mime === "string" && b.mime) || "application/octet-stream";
  const size = Number(b.size) || 0;
  const kind = kindOf(name, mime);
  if (!kind) throw new HttpError(415, `"${name}" desteklenmiyor.`);
  if (size > LIMITS.blobMax) throw new HttpError(413, "Dosya çok büyük.");
  const url = checkUrl(b.url, user.id);
  if (!url) throw new HttpError(400, "Dosya adresi gerekli.");
  const modelUrl = checkUrl(b.modelUrl, user.id);

  await cleanupOrphans(user.id);

  const rows = await q<AttachmentRow>(
    `INSERT INTO attachments (id, user_id, name, kind, mime, size, blob_url, model_blob_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, user_id, message_id, name, kind, mime, size, blob_url, model_blob_url`,
    [newId(), user.id, name, kind, mime, size, url, modelUrl]
  );
  return NextResponse.json({ attachment: toMeta(rows[0]) });
});
