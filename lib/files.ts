import type { Attachment } from "./types";

const TEXT_EXT = [
  "txt", "md", "csv", "tsv", "json", "js", "jsx", "ts", "tsx", "py", "html", "htm",
  "css", "xml", "yaml", "yml", "log", "sql", "java", "c", "h", "cpp", "hpp", "cs",
  "go", "rs", "php", "rb", "sh", "ini", "toml", "kt", "swift", "m", "r", "tex",
];

export const ACCEPT = ["image/*", ".pdf", ...TEXT_EXT.map((e) => "." + e)].join(",");

const MAX_PDF = 3 * 1024 * 1024; // Vercel istek sınırı 4.5 MB, base64 ~%33 büyütür
const MAX_TEXT = 400 * 1024;
const MAX_IMG_SIDE = 1568;

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

function readAsDataURL(f: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error("Dosya okunamadı."));
    r.readAsDataURL(f);
  });
}

// Fotoğrafları küçültüp JPEG yapar: hem hızlı gider hem Vercel sınırına takılmaz.
async function downscale(f: File): Promise<string> {
  const url = URL.createObjectURL(f);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error(`"${f.name}" görseli açılamadı.`));
      i.src = url;
    });
    const scale = Math.min(1, MAX_IMG_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return c.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function fileToAttachment(f: File): Promise<Attachment> {
  const ext = (f.name.split(".").pop() || "").toLowerCase();
  const base = { id: uid(), name: f.name || "dosya", size: f.size };

  if (f.type.startsWith("image/")) {
    const dataUrl = await downscale(f);
    return { ...base, name: f.name || "görsel.jpg", kind: "image", dataUrl };
  }
  if (f.type === "application/pdf" || ext === "pdf") {
    if (f.size > MAX_PDF) throw new Error(`"${f.name}" çok büyük. PDF en fazla 3 MB olabilir.`);
    return { ...base, kind: "pdf", dataUrl: await readAsDataURL(f) };
  }
  if (f.type.startsWith("text/") || f.type === "application/json" || TEXT_EXT.includes(ext)) {
    if (f.size > MAX_TEXT) throw new Error(`"${f.name}" çok büyük. Metin dosyası en fazla 400 KB olabilir.`);
    return { ...base, kind: "text", text: await f.text() };
  }
  throw new Error(`"${f.name}" desteklenmiyor. Görsel, PDF veya metin/kod dosyası ekleyebilirsin.`);
}

export function formatSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
