import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Uzun cevaplar için. Vercel Hobby planında 60 güvenli; Fluid Compute açıksa 300'e çıkarabilirsin.
export const maxDuration = 60;

// Tarayıcı -> burası -> OpenRouter. API anahtarı yalnızca burada (sunucuda) kullanılır.
export async function POST(req: Request) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "Sunucuda OPENROUTER_API_KEY ayarlanmamış." },
      { status: 500 }
    );
  }

  let body: { model?: unknown; messages?: unknown; system?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  }
  const { model, messages, system } = body;
  if (typeof model !== "string" || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "Model ve mesaj gerekli." }, { status: 400 });
  }

  const finalMessages =
    typeof system === "string" && system.trim()
      ? [{ role: "system", content: system.trim() }, ...messages]
      : messages;

  let upstream: Response;
  try {
    upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.SITE_URL || "https://vercel.app",
        "X-Title": "Coklu AI Sohbet",
      },
      body: JSON.stringify({ model, messages: finalMessages, stream: true }),
      signal: req.signal,
    });
  } catch (e) {
    return NextResponse.json(
      { error: `OpenRouter'a ulaşılamadı: ${(e as Error).message}` },
      { status: 502 }
    );
  }

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    let msg = text || `OpenRouter hatası (${upstream.status})`;
    try {
      const j = JSON.parse(text);
      msg = j?.error?.metadata?.raw || j?.error?.message || msg;
    } catch {}
    if (upstream.status === 402) msg = "OpenRouter bakiyesi yetersiz. Ücretsiz bir model seç veya bakiye yükle.";
    if (upstream.status === 429) msg = "Hız sınırına takıldın (ücretsiz modellerde sık olur). Biraz bekle veya başka model seç.";
    return NextResponse.json({ error: String(msg).slice(0, 500) }, { status: upstream.status });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
