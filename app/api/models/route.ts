import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/http";
import { getGeminiModels, getOpenRouterModels, getUserKeys, isFreeAllowed } from "@/lib/models";
import type { ModelInfo, Tier } from "@/lib/types";

export const dynamic = "force-dynamic";

// Krediden düşmeyen bilinen OpenAI modelleri (OpenRouter'da ":free" sürümleri).
const FREE_PICKS = ["openai/gpt-oss-120b:free", "openai/gpt-oss-20b:free"];

// Ücretli "en iyi" modeller: her gruptan en yeni olanı otomatik seçilir.
const PAID_GROUPS: RegExp[] = [
  /^openai\/gpt-\d+(\.\d+)?$/,
  /^anthropic\/claude-opus-[\d.-]+$/,
  /^anthropic\/claude-sonnet-[\d.-]+$/,
  /^google\/gemini-[\d.]+-pro$/,
];

const envList = (name: string) => (process.env[name] || "").split(",").map((s) => s.trim()).filter(Boolean);

// Kullanıcının görebileceği modeller:
//  - normal kullanıcı: sadece ücretsiz ChatGPT / Gemini / Claude ailesi (sitenin anahtarıyla, kredi harcamaz)
//  - pro kullanıcı: hepsi (sitenin anahtarıyla)
//  - kendi OpenRouter anahtarı olan: hepsi (kendi anahtarıyla)
//  - kendi Gemini anahtarı olan: ayrıca Google'ın Gemini modelleri
export const GET = handle(async () => {
  const user = await requireUser();
  const keys = await getUserKeys(user.id);
  const all = await getOpenRouterModels();
  const tier: Tier = keys.openrouter ? "own" : user.isPro ? "pro" : "free";

  let models: ModelInfo[] = (tier === "free" ? all.filter(isFreeAllowed) : all).map(({ created: _c, ...m }) => ({
    ...m,
    source: tier === "own" ? ("own" as const) : ("site" as const),
  }));

  let geminiError: string | null = null;
  let gemini: ModelInfo[] = [];
  if (keys.gemini) {
    try {
      gemini = await getGeminiModels(keys.gemini);
    } catch (e) {
      geminiError = (e as Error).message;
    }
  }
  models = [...gemini, ...models];

  const ids = new Set(models.map((m) => m.id));
  const freeOverride = envList("RECOMMENDED_FREE");
  let free = (freeOverride.length ? freeOverride : FREE_PICKS).filter((id) => ids.has(id));
  // Ücretsiz Google modellerinden en yeni 2 tanesini de öner
  if (!freeOverride.length) {
    free.push(
      ...all
        .filter((m) => m.free && m.id.startsWith("google/"))
        .sort((a, b) => b.created - a.created)
        .slice(0, 2)
        .map((m) => m.id)
    );
  }
  if (!free.length) free = models.filter((m) => m.free && m.source !== "gemini").map((m) => m.id).slice(0, 3);

  let paid: string[] = [];
  if (tier !== "free") {
    const paidOverride = envList("RECOMMENDED_PAID");
    paid = paidOverride.length
      ? paidOverride.filter((id) => ids.has(id))
      : PAID_GROUPS.map((re) => all.filter((m) => re.test(m.id)).sort((a, b) => b.created - a.created)[0]?.id).filter(
          (x): x is string => !!x
        );
  }

  const envDefault = process.env.DEFAULT_MODEL;
  const defaultModel = envDefault && ids.has(envDefault) ? envDefault : free[0] || models[0]?.id || "";

  return NextResponse.json({ models, recommended: { free, paid }, defaultModel, tier, geminiError });
});
