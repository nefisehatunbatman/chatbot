import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { cleanupOrphans, kindOf, LIMITS, toMeta, type AttachmentRow } from "@/lib/attachments";
import { q } from "@/lib/db";
import { handle, HttpError, newId } from "@/lib/http";

export const dynamic = "force-dynamic";

// Blob bağlı DEĞİLKEN kullanılan yol: dosya doğrudan veritabanına yazılır.
export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new HttpError(413, "Dosya çok büyük veya okunamadı.");
  }
  const file = form.get("file");
  const modelFile = form.get("modelFile");
  if (!(file instanceof File)) throw new HttpError(400, "Dosya gerekli.");

  const kind = kindOf(file.name, file.type);
  if (!kind) throw new HttpError(415, `"${file.name}" desteklenmiyor.`);
  const total = file.size + (modelFile instanceof File ? modelFile.size : 0);
  if (total > LIMITS.dbMax) throw new HttpError(413, "Dosya çok büyük (en fazla 4 MB).");
  if (kind === "text" && file.size > LIMITS.text) throw new HttpError(413, "Metin dosyası en fazla 400 KB olabilir.");

  await cleanupOrphans(user.id);

  const id = newId();
  const rows = await q<AttachmentRow>(
    `INSERT INTO attachments (id, user_id, name, kind, mime, size, data, model_data)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, user_id, message_id, name, kind, mime, size, blob_url, model_blob_url`,
    [
      id,
      user.id,
      file.name.slice(0, 200) || "dosya",
      kind,
      file.type || "application/octet-stream",
      file.size,
      Buffer.from(await file.arrayBuffer()),
      modelFile instanceof File ? Buffer.from(await modelFile.arrayBuffer()) : null,
    ]
  );
  return NextResponse.json({ attachment: toMeta(rows[0]) });
});
