import { NextResponse, after } from "next/server";
import { requireUser } from "@/lib/auth";
import { attachmentBytes, LIMITS } from "@/lib/attachments";
import { blobDelete } from "@/lib/blobstore";
import { deleteMessagesAfter, getOwnedConversation, loadMessages, makeTitle, type MessageOut } from "@/lib/conversations";
import { q, tx } from "@/lib/db";
import { handle, HttpError, newId, readJson } from "@/lib/http";
import { resolveRoute } from "@/lib/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Uzun cevaplar için. Vercel Hobby planında 60 güvenli; Fluid Compute açıksa 300'e çıkarabilirsin.
export const maxDuration = 60;

const BINARY_TURNS = 4; // Görsel/PDF'ler son 4 kullanıcı mesajı için tekrar gönderilir

type Body = {
  mode?: "send" | "regenerate" | "edit";
  conversationId?: string;
  model?: string;
  text?: string;
  attachmentIds?: string[];
  editMessageId?: string;
  imageSupport?: boolean;
};

type Part =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "file"; file: { filename: string; file_data: string } };

// Akış: tarayıcı → burası (geçmişi DB'den kurar) → OpenRouter → cevap hem tarayıcıya akar hem DB'ye kaydedilir.
export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const b = await readJson<Body>(req);
  const mode = b.mode || "send";
  const model = typeof b.model === "string" ? b.model.slice(0, 200) : "";
  if (!model) throw new HttpError(400, "Model seçilmedi.");
  // Model erişim kontrolü HER ŞEYDEN ÖNCE: izin yoksa hiçbir şey kaydedilmez, kredi harcanmaz
  const route = await resolveRoute(user, model);
  const text = typeof b.text === "string" ? b.text.slice(0, 100_000) : "";
  const attachmentIds = Array.isArray(b.attachmentIds) ? b.attachmentIds.filter((x) => typeof x === "string").slice(0, 20) : [];

  // 1) Sohbeti ve kullanıcı mesajını hazırla
  let convId = typeof b.conversationId === "string" ? b.conversationId : "";
  let removedBlobs: (string | null)[] = [];

  if (mode === "send") {
    if (!text.trim() && attachmentIds.length === 0) throw new HttpError(400, "Boş mesaj gönderilemez.");
    if (convId) await getOwnedConversation(convId, user.id);
    await tx(async (c) => {
      if (!convId) {
        let fallback: string | undefined;
        if (attachmentIds.length) {
          const r = await c.query("SELECT name FROM attachments WHERE id = $1 AND user_id = $2", [attachmentIds[0], user.id]);
          fallback = r.rows[0]?.name;
        }
        convId = newId();
        await c.query("INSERT INTO conversations (id, user_id, title) VALUES ($1, $2, $3)", [convId, user.id, makeTitle(text, fallback)]);
      }
      const msgId = newId();
      await c.query("INSERT INTO messages (id, conversation_id, role, content) VALUES ($1, $2, 'user', $3)", [msgId, convId, text]);
      if (attachmentIds.length) {
        await c.query(
          "UPDATE attachments SET message_id = $1 WHERE id = ANY($2) AND user_id = $3 AND message_id IS NULL",
          [msgId, attachmentIds, user.id]
        );
      }
    });
  } else if (mode === "regenerate") {
    if (!convId) throw new HttpError(400, "Sohbet gerekli.");
    await getOwnedConversation(convId, user.id);
    removedBlobs = await tx(async (c) => {
      const r = await c.query("SELECT max(seq) AS seq FROM messages WHERE conversation_id = $1 AND role = 'user'", [convId]);
      if (r.rows[0]?.seq == null) throw new HttpError(400, "Yeniden oluşturulacak mesaj yok.");
      return deleteMessagesAfter(c, convId, Number(r.rows[0].seq));
    });
  } else if (mode === "edit") {
    if (!convId || typeof b.editMessageId !== "string") throw new HttpError(400, "Düzenlenecek mesaj gerekli.");
    await getOwnedConversation(convId, user.id);
    removedBlobs = await tx(async (c) => {
      const r = await c.query(
        "SELECT seq FROM messages WHERE id = $1 AND conversation_id = $2 AND role = 'user'",
        [b.editMessageId, convId]
      );
      if (!r.rows[0]) throw new HttpError(404, "Mesaj bulunamadı.");
      await c.query("UPDATE messages SET content = $2 WHERE id = $1", [b.editMessageId, text]);
      return deleteMessagesAfter(c, convId, Number(r.rows[0].seq));
    });
  } else {
    throw new HttpError(400, "Geçersiz istek.");
  }
  await blobDelete(removedBlobs);

  // 2) Geçmişi OpenRouter formatına çevir
  const history = await loadMessages(convId);
  const apiMessages = await buildApiMessages(history, b.imageSupport !== false, route.provider !== "gemini");
  const system = (user.settings?.system || "").trim();
  const finalMessages = system ? [{ role: "system", content: system }, ...apiMessages] : apiMessages;

  const saveAssistant = async (content: string, reasoning: string, error: string | null) => {
    await q(
      "INSERT INTO messages (id, conversation_id, role, content, reasoning, model, error) VALUES ($1, $2, 'assistant', $3, $4, $5, $6)",
      [newId(), convId, content, reasoning || null, model, error]
    );
    await q("UPDATE conversations SET updated_at = now() WHERE id = $1", [convId]);
  };

  // 3) OpenRouter'a gönder
  const ac = new AbortController();
  req.signal.addEventListener("abort", () => ac.abort());
  let upstream: Response;
  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${route.apiKey}`,
      "Content-Type": "application/json",
    };
    if (route.provider === "openrouter") {
      headers["HTTP-Referer"] = process.env.SITE_URL || "https://vercel.app";
      headers["X-Title"] = "Coklu AI Sohbet";
    }
    upstream = await fetch(route.url, {
      method: "POST",
      headers,
      body: JSON.stringify({ model: route.model, messages: finalMessages, stream: true }),
      signal: ac.signal,
    });
  } catch (e) {
    const msg = `${route.provider === "gemini" ? "Gemini" : "OpenRouter"}'a ulaşılamadı: ${(e as Error).message}`;
    await saveAssistant("", "", msg);
    return NextResponse.json({ error: msg, conversationId: convId }, { status: 502, headers: { "X-Conversation-Id": convId } });
  }

  if (!upstream.ok || !upstream.body) {
    const raw = await upstream.text().catch(() => "");
    const who = route.provider === "gemini" ? "Gemini" : "OpenRouter";
    let msg = raw || `${who} hatası (${upstream.status})`;
    try {
      let j = JSON.parse(raw);
      if (Array.isArray(j)) j = j[0]; // Gemini bazen hatayı dizi içinde döner
      msg = j?.error?.metadata?.raw || j?.error?.message || msg;
    } catch {}
    const own = route.billing === "own";
    if (upstream.status === 401 || (route.provider === "gemini" && upstream.status === 400 && /API key/i.test(msg))) {
      msg = own ? `${who} anahtarın geçersiz veya süresi dolmuş. Ayarlar'dan güncelle.` : "Sitenin OpenRouter anahtarı geçersiz.";
    }
    if (upstream.status === 402) {
      msg = own ? "Kendi OpenRouter hesabında bakiye yetersiz." : "Sitenin OpenRouter bakiyesi yetersiz. Ücretsiz bir model seç.";
    }
    if (upstream.status === 429) {
      msg = route.provider === "gemini"
        ? "Gemini kotası doldu (ücretsiz kotada sık olur). Biraz bekle veya başka model seç."
        : "Hız sınırına takıldın (ücretsiz modellerde sık olur). Biraz bekle veya başka model seç.";
    }
    msg = String(msg).slice(0, 500);
    await saveAssistant("", "", msg);
    return NextResponse.json({ error: msg, conversationId: convId }, { status: upstream.status, headers: { "X-Conversation-Id": convId } });
  }

  // 4) Akışı tarayıcıya ilet; bitince (veya kullanıcı durdurunca) cevabı kaydet
  let resolveSaved!: () => void;
  const saved = new Promise<void>((r) => (resolveSaved = r));
  after(() => saved);

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let buf = "";
      let content = "";
      let reasoning = "";
      let error: string | null = null;
      let clientGone = false;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!clientGone) {
            try {
              controller.enqueue(value);
            } catch {
              clientGone = true;
            }
          }
          buf += decoder.decode(value, { stream: true });
          let i: number;
          while ((i = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, i).trim();
            buf = buf.slice(i + 1);
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (data === "[DONE]") continue;
            try {
              const j = JSON.parse(data);
              if (j.error) error = j.error.message || "Akış sırasında hata oluştu.";
              const d = j.choices?.[0]?.delta;
              if (d?.content) content += d.content;
              if (d?.reasoning) reasoning += d.reasoning;
            } catch {}
          }
        }
      } catch (e) {
        if (!ac.signal.aborted) error = `Bağlantı kesildi: ${(e as Error).message}`;
      } finally {
        try {
          if (!content && !reasoning && !error && !ac.signal.aborted) error = "Model boş yanıt döndürdü.";
          await saveAssistant(content, reasoning, error);
        } catch (e) {
          console.error("Cevap kaydedilemedi", e);
        }
        resolveSaved();
        try {
          controller.close();
        } catch {}
      }
    },
    cancel() {
      ac.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      "X-Conversation-Id": convId,
    },
  });
});

async function buildApiMessages(history: MessageOut[], allowImages: boolean, allowPdf: boolean) {
  const userIdx = history.map((m, i) => (m.role === "user" ? i : -1)).filter((i) => i >= 0);
  const binaryFrom = userIdx.length > BINARY_TURNS ? userIdx[userIdx.length - BINARY_TURNS] : 0;

  const out: { role: "user" | "assistant"; content: string | Part[] }[] = [];
  for (let idx = 0; idx < history.length; idx++) {
    const m = history[idx];
    if (m.role === "assistant") {
      if (m.content) out.push({ role: "assistant", content: m.content });
      continue;
    }
    let text = m.content || "";
    const parts: Part[] = [];
    for (const a of m.attachments || []) {
      try {
        if (a.kind === "text") {
          const { bytes } = await attachmentBytes(a.id, "original");
          text += `\n\n--- Dosya: ${a.name} ---\n${bytes.subarray(0, LIMITS.text).toString("utf8")}`;
        } else if (idx < binaryFrom) {
          text += `\n[Önceki ek: ${a.name}]`;
        } else if (a.kind === "image") {
          if (!allowImages) {
            text += `\n[Görsel: ${a.name} — seçili model görsel desteklemiyor]`;
            continue;
          }
          const { bytes, mime } = await attachmentBytes(a.id, "model");
          parts.push({ type: "image_url", image_url: { url: `data:${mime};base64,${bytes.toString("base64")}` } });
        } else if (a.kind === "pdf") {
          if (!allowPdf) {
            text += `\n[PDF: ${a.name} — bu sağlayıcı PDF eki desteklemiyor]`;
            continue;
          }
          const { bytes } = await attachmentBytes(a.id, "original");
          parts.push({ type: "file", file: { filename: a.name, file_data: `data:application/pdf;base64,${bytes.toString("base64")}` } });
        }
      } catch {
        text += `\n[${a.name} okunamadı]`;
      }
    }
    if (parts.length) out.push({ role: "user", content: [{ type: "text", text: text || "Ekteki dosyaya bak." }, ...parts] });
    else out.push({ role: "user", content: text || " " });
  }
  return out;
}
