import { blobBytes, blobDelete } from "./blobstore";
import { q } from "./db";
import { HttpError } from "./http";

export type AttachmentKind = "image" | "pdf" | "text";

export type AttachmentRow = {
  id: string;
  user_id: string;
  message_id: string | null;
  name: string;
  kind: AttachmentKind;
  mime: string;
  size: number;
  blob_url: string | null;
  model_blob_url: string | null;
  has_data?: boolean;
};

export type AttachmentMeta = { id: string; name: string; kind: AttachmentKind; mime: string; size: number };

export const toMeta = (r: AttachmentRow): AttachmentMeta => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  mime: r.mime,
  size: Number(r.size),
});

export const LIMITS = {
  blobMax: 25 * 1024 * 1024, // Blob ile: dosya başı 25 MB
  dbMax: 4 * 1024 * 1024, // Blob yoksa: istek başı ~4 MB (Vercel sınırı)
  text: 400 * 1024,
};

export function kindOf(name: string, mime: string): AttachmentKind | null {
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (mime.startsWith("text/") || mime === "application/json" || TEXT_EXT.has(ext)) return "text";
  return null;
}

export const TEXT_EXT = new Set([
  "txt", "md", "csv", "tsv", "json", "js", "jsx", "ts", "tsx", "py", "html", "htm", "css", "xml",
  "yaml", "yml", "log", "sql", "java", "c", "h", "cpp", "hpp", "cs", "go", "rs", "php", "rb", "sh",
  "ini", "toml", "kt", "swift", "m", "r", "tex",
]);

export async function getOwnedAttachment(id: string, userId: string) {
  const rows = await q<AttachmentRow>(
    `SELECT id, user_id, message_id, name, kind, mime, size, blob_url, model_blob_url
     FROM attachments WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  if (!rows[0]) throw new HttpError(404, "Dosya bulunamadı.");
  return rows[0];
}

// Dosyanın baytlarını getirir. variant="model": modele giden küçültülmüş görsel.
export async function attachmentBytes(id: string, variant: "original" | "model") {
  const rows = await q<{
    blob_url: string | null;
    model_blob_url: string | null;
    data: Buffer | null;
    model_data: Buffer | null;
    mime: string;
  }>("SELECT blob_url, model_blob_url, data, model_data, mime FROM attachments WHERE id = $1", [id]);
  const r = rows[0];
  if (!r) throw new HttpError(404, "Dosya bulunamadı.");
  if (variant === "model") {
    if (r.model_data) return { bytes: r.model_data, mime: "image/jpeg" };
    if (r.model_blob_url) return { bytes: await blobBytes(r.model_blob_url), mime: "image/jpeg" };
  }
  if (r.data) return { bytes: r.data, mime: r.mime };
  if (r.blob_url) return { bytes: await blobBytes(r.blob_url), mime: r.mime };
  throw new HttpError(404, "Dosya içeriği bulunamadı.");
}

// Yüklenip hiç gönderilmeyen (1 günden eski) dosyaları temizler.
export async function cleanupOrphans(userId: string) {
  const old = await q<{ blob_url: string | null; model_blob_url: string | null }>(
    `DELETE FROM attachments WHERE user_id = $1 AND message_id IS NULL AND created_at < now() - interval '1 day'
     RETURNING blob_url, model_blob_url`,
    [userId]
  );
  await blobDelete(old.flatMap((r) => [r.blob_url, r.model_blob_url]));
}
