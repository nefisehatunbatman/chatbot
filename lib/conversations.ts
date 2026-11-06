import type { PoolClient } from "pg";
import { toMeta, type AttachmentMeta, type AttachmentRow } from "./attachments";
import { blobDelete } from "./blobstore";
import { q } from "./db";
import { HttpError } from "./http";

export type MessageOut = {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
  model?: string;
  error?: string;
  attachments?: AttachmentMeta[];
};

export async function getOwnedConversation(id: string, userId: string) {
  const rows = await q<{ id: string; title: string }>(
    "SELECT id, title FROM conversations WHERE id = $1 AND user_id = $2",
    [id, userId]
  );
  if (!rows[0]) throw new HttpError(404, "Sohbet bulunamadı.");
  return rows[0];
}

export async function loadMessages(convId: string): Promise<(MessageOut & { seq: number })[]> {
  const msgs = await q<{
    id: string; seq: string; role: "user" | "assistant"; content: string;
    reasoning: string | null; model: string | null; error: string | null;
  }>(
    "SELECT id, seq, role, content, reasoning, model, error FROM messages WHERE conversation_id = $1 ORDER BY seq",
    [convId]
  );
  const atts = await q<AttachmentRow>(
    `SELECT a.id, a.user_id, a.message_id, a.name, a.kind, a.mime, a.size, a.blob_url, a.model_blob_url
     FROM attachments a JOIN messages m ON m.id = a.message_id
     WHERE m.conversation_id = $1 ORDER BY a.created_at`,
    [convId]
  );
  const byMsg = new Map<string, AttachmentMeta[]>();
  for (const a of atts) {
    const list = byMsg.get(a.message_id!) || [];
    list.push(toMeta(a));
    byMsg.set(a.message_id!, list);
  }
  return msgs.map((m) => ({
    id: m.id,
    seq: Number(m.seq),
    role: m.role,
    content: m.content,
    reasoning: m.reasoning || undefined,
    model: m.model || undefined,
    error: m.error || undefined,
    attachments: byMsg.get(m.id),
  }));
}

// Belirli bir mesajdan SONRAKİ mesajları (ve eklerini) siler. Düzenle / yeniden oluştur için.
export async function deleteMessagesAfter(c: PoolClient, convId: string, seq: number) {
  const r = await c.query<{ blob_url: string | null; model_blob_url: string | null }>(
    `SELECT a.blob_url, a.model_blob_url FROM attachments a JOIN messages m ON m.id = a.message_id
     WHERE m.conversation_id = $1 AND m.seq > $2`,
    [convId, seq]
  );
  await c.query("DELETE FROM messages WHERE conversation_id = $1 AND seq > $2", [convId, seq]);
  return r.rows.flatMap((x) => [x.blob_url, x.model_blob_url]);
}

export async function deleteConversation(convId: string) {
  const r = await q<{ blob_url: string | null; model_blob_url: string | null }>(
    `SELECT a.blob_url, a.model_blob_url FROM attachments a JOIN messages m ON m.id = a.message_id
     WHERE m.conversation_id = $1`,
    [convId]
  );
  await q("DELETE FROM conversations WHERE id = $1", [convId]);
  await blobDelete(r.flatMap((x) => [x.blob_url, x.model_blob_url]));
}

export function makeTitle(text: string, fallback?: string) {
  const t = text.replace(/\s+/g, " ").trim();
  if (t) return t.length > 60 ? t.slice(0, 60) + "…" : t;
  return fallback || "Yeni sohbet";
}
