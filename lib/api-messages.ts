import type { Msg } from "./types";

type ApiPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "file"; file: { filename: string; file_data: string } };

export type ApiMessage = { role: "user" | "assistant"; content: string | ApiPart[] };

const LIMIT = 4_000_000; // Vercel'in 4.5 MB istek sınırının altında kal

// Sohbet geçmişini OpenRouter'ın beklediği formata çevirir.
export function toApiMessages(history: Msg[], allowImages: boolean): ApiMessage[] {
  const out: ApiMessage[] = [];
  for (const m of history) {
    if (m.role === "assistant") {
      if (m.content) out.push({ role: "assistant", content: m.content });
      continue;
    }
    const atts = m.attachments || [];
    let text = m.content || "";
    const binary: ApiPart[] = [];
    for (const a of atts) {
      if (a.kind === "text") {
        text += `\n\n--- Dosya: ${a.name} ---\n${a.text ?? "[içerik artık mevcut değil]"}`;
      } else if (a.kind === "image") {
        if (a.dataUrl && allowImages) binary.push({ type: "image_url", image_url: { url: a.dataUrl } });
        else text += `\n[Görsel: ${a.name} — bu modele gönderilemedi]`;
      } else if (a.kind === "pdf") {
        if (a.dataUrl) binary.push({ type: "file", file: { filename: a.name, file_data: a.dataUrl } });
        else text += `\n[PDF: ${a.name} — içerik artık mevcut değil]`;
      }
    }
    if (binary.length === 0) out.push({ role: "user", content: text || " " });
    else out.push({ role: "user", content: [{ type: "text", text: text || "Ekteki dosyaya bak." }, ...binary] });
  }

  // Çok büyükse eski mesajlardaki ekleri metne indir (son mesaja dokunma).
  let size = JSON.stringify(out).length;
  for (let i = 0; i < out.length - 1 && size > LIMIT; i++) {
    const c = out[i].content;
    if (Array.isArray(c)) {
      const t = c[0].type === "text" ? c[0].text : "";
      out[i] = { role: "user", content: t + "\n[Eski ek, boyut sınırı nedeniyle tekrar gönderilmedi]" };
      size = JSON.stringify(out).length;
    }
  }
  return out;
}
