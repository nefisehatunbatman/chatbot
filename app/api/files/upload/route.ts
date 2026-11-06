import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireUser } from "@/lib/auth";
import { LIMITS } from "@/lib/attachments";
import { blobEnabled } from "@/lib/blobstore";
import { handle, HttpError, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

// Tarayıcının dosyayı DOĞRUDAN Vercel Blob'a yüklemesi için kısa ömürlü izin üretir.
// Böylece büyük telefon fotoğrafları Vercel'in 4.5 MB istek sınırına takılmaz.
export const POST = handle(async (req: Request) => {
  if (!blobEnabled()) throw new HttpError(400, "Vercel Blob bağlı değil.");
  const body = await readJson<HandleUploadBody>(req);
  const result = await handleUpload({
    body,
    request: req,
    onBeforeGenerateToken: async (pathname) => {
      const user = await requireUser();
      if (!pathname.startsWith(`u/${user.id}/`)) throw new HttpError(403, "Geçersiz dosya yolu.");
      return {
        maximumSizeInBytes: LIMITS.blobMax,
        addRandomSuffix: true,
        validUntil: Date.now() + 10 * 60 * 1000,
      };
    },
  });
  return NextResponse.json(result);
});
