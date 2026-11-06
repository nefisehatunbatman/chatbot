import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { handle, HttpError } from "@/lib/http";
import type { ModelInfo } from "@/lib/types";

export const dynamic = "force-dynamic";

const OPENROUTER = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";

type RawModel = {
  id: string;
  name?: string;
  created?: number;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
  architecture?: { input_modalities?: string[] };
};

// Krediden düşmeyen bilinen OpenAI modelleri (OpenRouter'da ":free" sürümleri).
const FREE_PICKS = ["openai/gpt-oss-120b:free", "openai/gpt-oss-20b:free"];

// Ücretli "en iyi" modeller: her gruptan en yeni olanı otomatik seçilir.
const PAID_GROUPS: { label: string; re: RegExp }[] = [
  { label: "ChatGPT", re: /^openai\/gpt-\d+(\.\d+)?$/ },
  { label: "Claude Opus", re: /^anthropic\/claude-opus-[\d.-]+$/ },
  { label: "Claude Sonnet", re: /^anthropic\/claude-sonnet-[\d.-]+$/ },
];

// OpenRouter'daki TÜM modelleri çeker (1 saat önbellek).
export const GET = handle(async () => {
  await requireUser();
  const r = await fetch(`${OPENROUTER}/models`, { next: { revalidate: 3600 } }).catch(() => null);
  if (!r || !r.ok) throw new HttpError(502, "Model listesi OpenRouter'dan alınamadı.");
  const data = (await r.json()) as { data?: RawModel[] };
  const raw = data.data || [];

  const models: ModelInfo[] = raw
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

  const ids = new Set(models.map((m) => m.id));
  const override = (process.env.RECOMMENDED_FREE || "").split(",").map((s) => s.trim()).filter(Boolean);
  let free = (override.length ? override : FREE_PICKS).filter((id) => ids.has(id));
  if (!free.length) {
    free = models.filter((m) => m.free && m.id.startsWith("openai/")).map((m) => m.id).slice(0, 3);
  }

  const paidOverride = (process.env.RECOMMENDED_PAID || "").split(",").map((s) => s.trim()).filter(Boolean);
  const paid = paidOverride.length
    ? paidOverride.filter((id) => ids.has(id))
    : PAID_GROUPS.map((g) =>
        raw
          .filter((m) => g.re.test(m.id))
          .sort((a, b) => (b.created || 0) - (a.created || 0))[0]?.id
      ).filter((x): x is string => !!x);

  return NextResponse.json({
    models,
    recommended: { free, paid },
    defaultModel: process.env.DEFAULT_MODEL || free[0] || "openai/gpt-4o-mini",
  });
});
