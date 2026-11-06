"use client";

import { upload } from "@vercel/blob/client";
import type { AttachmentMeta, Me } from "./types";

const TEXT_EXT = [
  "txt", "md", "csv", "tsv", "json", "js", "jsx", "ts", "tsx", "py", "html", "htm",
  "css", "xml", "yaml", "yml", "log", "sql", "java", "c", "h", "cpp", "hpp", "cs",
  "go", "rs", "php", "rb", "sh", "ini", "toml", "kt", "swift", "m", "r", "tex",
];

export const ACCEPT = ["image/*", ".pdf", ...TEXT_EXT.map((e) => "." + e)].join(",");

const MB = 1024 * 1024;
const LIMIT_BLOB = 25 * MB;
const LIMIT_DB = 4 * MB;
const LIMIT_TEXT = 400 * 1024;
const MODEL_IMG_SIDE = 1568;

export function kindOf(f: File): "image" | "pdf" | "text" | null {
  const ext = (f.name.split(".").pop() || "").toLowerCase();
  if (f.type.startsWith("image/")) return "image";
  if (f.type === "application/pdf" || ext === "pdf") return "pdf";
  if (f.type.startsWith("text/") || f.type === "application/json" || TEXT_EXT.includes(ext)) return "text";
  return null;
}

// Modele gidecek küçük JPEG kopyası (orijinal ayrıca saklanır, indirilebilir).
async function resize(f: File, side: number, quality = 0.85): Promise<Blob> {
  const url = URL.createObjectURL(f);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error(`"${f.name}" görseli açılamadı.`));
      i.src = url;
    });
    const scale = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return await new Promise<Blob>((res, rej) =>
      c.toBlob((b) => (b ? res(b) : rej(new Error("Görsel işlenemedi."))), "image/jpeg", quality)
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

const safeName = (n: string) => n.normalize("NFKD").replace(/[^\w.\-]+/g, "_").slice(-80) || "dosya";

async function jsonOrThrow(r: Response) {
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Yükleme hatası (${r.status})`);
  return j;
}

// Dosyayı yükler: Blob bağlıysa doğrudan Blob'a, değilse sunucu üzerinden veritabanına.
export async function uploadAttachment(
  f: File,
  me: Me,
  onProgress: (pct: number) => void
): Promise<AttachmentMeta> {
  const kind = kindOf(f);
  if (!kind) throw new Error(`"${f.name}" desteklenmiyor. Görsel, PDF veya metin/kod dosyası ekleyebilirsin.`);
  if (kind === "text" && f.size > LIMIT_TEXT) throw new Error(`"${f.name}" çok büyük. Metin dosyası en fazla 400 KB.`);
  const modelImg = kind === "image" ? await resize(f, MODEL_IMG_SIDE) : undefined;

  if (me.blob.enabled) {
    if (f.size > LIMIT_BLOB) throw new Error(`"${f.name}" çok büyük (en fazla 25 MB).`);
    const base = `u/${me.user.id}/${Date.now()}-${safeName(f.name)}`;
    const opts = { access: me.blob.access, handleUploadUrl: "/api/files/upload" } as const;
    const orig = await upload(base, f, {
      ...opts,
      contentType: f.type || undefined,
      multipart: f.size > 8 * MB,
      onUploadProgress: (e) => onProgress(Math.round(e.percentage * (modelImg ? 0.85 : 1))),
    });
    let modelUrl: string | undefined;
    if (modelImg) {
      const m = await upload(`u/${me.user.id}/${Date.now()}-onizleme.jpg`, modelImg, { ...opts, contentType: "image/jpeg" });
      modelUrl = m.url;
    }
    onProgress(100);
    const j = await jsonOrThrow(
      await fetch("/api/files/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: f.name, mime: f.type, size: f.size, url: orig.url, modelUrl }),
      })
    );
    return j.attachment;
  }

  // Blob yok: tek istekte en fazla ~4 MB
  let original: Blob = f;
  let name = f.name;
  if (modelImg && f.size + modelImg.size > LIMIT_DB) {
    original = await resize(f, 2560, 0.9); // büyük fotoğrafı yüksek kaliteyle küçült
    name = f.name.replace(/\.[^.]+$/, "") + ".jpg";
  }
  const total = original.size + (modelImg?.size || 0);
  if (total > LIMIT_DB) throw new Error(`"${f.name}" çok büyük (Blob bağlı değilken en fazla 4 MB).`);

  const fd = new FormData();
  fd.append("file", new File([original], name, { type: original.type || f.type }));
  if (modelImg) fd.append("modelFile", new File([modelImg], "onizleme.jpg", { type: "image/jpeg" }));
  onProgress(30);
  const j = await jsonOrThrow(await fetch("/api/files", { method: "POST", body: fd }));
  onProgress(100);
  return j.attachment;
}

export function formatSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < MB) return `${Math.round(n / 1024)} KB`;
  return `${(n / MB).toFixed(1)} MB`;
}
