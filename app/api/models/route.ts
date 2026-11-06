import { NextResponse } from "next/server";
import type { ModelInfo } from "@/lib/types";

export const dynamic = "force-dynamic";

type RawModel = {
  id: string;
  name?: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
  architecture?: { input_modalities?: string[] };
};

// OpenRouter'daki TÜM modelleri çeker. Liste 1 saat önbellekte tutulur.
export async function GET() {
  try {
    const r = await fetch("https://openrouter.ai/api/v1/models", {
      next: { revalidate: 3600 },
    });
    if (!r.ok) throw new Error(`OpenRouter ${r.status}`);
    const data = (await r.json()) as { data?: RawModel[] };

    const models: ModelInfo[] = (data.data || [])
      .map((m) => {
        const prompt = Number(m.pricing?.prompt ?? NaN);
        const completion = Number(m.pricing?.completion ?? NaN);
        const mods = m.architecture?.input_modalities || [];
        return {
          id: m.id,
          name: m.name || m.id,
          context: m.context_length || 0,
          free: m.id.endsWith(":free") || (prompt === 0 && completion === 0),
          image: mods.includes("image"),
          promptPrice: prompt > 0 ? prompt : 0,
          completionPrice: completion > 0 ? completion : 0,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "tr"));

    return NextResponse.json({
      models,
      defaultModel: process.env.DEFAULT_MODEL || "openai/gpt-4o-mini",
    });
  } catch (e) {
    return NextResponse.json(
      { error: `Model listesi alınamadı: ${(e as Error).message}` },
      { status: 502 }
    );
  }
}
