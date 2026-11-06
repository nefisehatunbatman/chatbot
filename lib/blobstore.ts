import { del, get } from "@vercel/blob";

// Vercel Blob bağlıysa dosyalar orada, değilse veritabanında (küçük boyutla) tutulur.
export const blobEnabled = () => !!process.env.BLOB_READ_WRITE_TOKEN;
export const blobAccess = (): "public" | "private" =>
  process.env.BLOB_ACCESS === "public" ? "public" : "private";

export async function blobGet(url: string) {
  const r = await get(url, { access: blobAccess() });
  if (!r || r.statusCode !== 200) throw new Error("Dosya depodan okunamadı.");
  return r;
}

export async function blobBytes(url: string): Promise<Buffer> {
  const r = await blobGet(url);
  return Buffer.from(await new Response(r.stream).arrayBuffer());
}

export async function blobDelete(urls: (string | null | undefined)[]) {
  const list = urls.filter((u): u is string => !!u);
  if (!list.length || !blobEnabled()) return;
  try {
    await del(list);
  } catch (e) {
    console.error("Blob silinemedi", e);
  }
}
