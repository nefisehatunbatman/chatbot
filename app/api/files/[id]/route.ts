import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { attachmentBytes, getOwnedAttachment } from "@/lib/attachments";
import { blobDelete } from "@/lib/blobstore";
import { q } from "@/lib/db";
import { handle, HttpError } from "@/lib/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// Dosyayı sadece sahibine verir. ?download=1 → indir, ?variant=model → küçük önizleme.
export const GET = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  const att = await getOwnedAttachment(id, user.id);
  const url = new URL(req.url);
  const variant = url.searchParams.get("variant") === "model" ? "model" : "original";
  const { bytes, mime } = await attachmentBytes(att.id, variant);
  const disposition = url.searchParams.get("download") === "1" ? "attachment" : "inline";
  const safeMime = att.kind === "text" ? "text/plain; charset=utf-8" : mime;
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": safeMime,
      "Content-Length": String(bytes.length),
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(att.name)}`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
});

// Henüz gönderilmemiş bir eki kaldırır.
export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  const att = await getOwnedAttachment(id, user.id);
  if (att.message_id) throw new HttpError(400, "Gönderilmiş ek silinemez; sohbeti silebilirsin.");
  await q("DELETE FROM attachments WHERE id = $1", [att.id]);
  await blobDelete([att.blob_url, att.model_blob_url]);
  return NextResponse.json({ ok: true });
});
