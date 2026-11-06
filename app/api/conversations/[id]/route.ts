import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { deleteConversation, getOwnedConversation, loadMessages } from "@/lib/conversations";
import { q } from "@/lib/db";
import { handle, HttpError, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  const conv = await getOwnedConversation(id, user.id);
  const messages = (await loadMessages(conv.id)).map(({ seq: _seq, ...m }) => m);
  return NextResponse.json({ id: conv.id, title: conv.title, messages });
});

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  await getOwnedConversation(id, user.id);
  const { title } = await readJson<{ title?: string }>(req);
  if (typeof title !== "string" || !title.trim()) throw new HttpError(400, "Başlık gerekli.");
  await q("UPDATE conversations SET title = $2 WHERE id = $1", [id, title.trim().slice(0, 120)]);
  return NextResponse.json({ ok: true });
});

export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  await getOwnedConversation(id, user.id);
  await deleteConversation(id);
  return NextResponse.json({ ok: true });
});
