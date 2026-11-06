import type { User } from "./auth";
import { decrypt } from "./crypto";
import { q } from "./db";
import { HttpError } from "./http";
import type { ModelInfo } from "./types";

export const OPENROUTER = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
export const GEMINI = process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta";
export const GEMINI_PREFIX = "gemini:";

export type KeyProvider = "gemini" | "openrouter";
export const KEY_PROVIDERS: KeyProvider[] = ["gemini", "openrouter"];

// Normal kullanıcıların görebildiği ücretsiz modellerin sağlayıcıları
const FREE_PROVIDERS = ["openai/", "google/", "anthropic/"];

type RawModel = {
  id: string;
  name?: string;
  created?: number;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
  architecture?: { input_modalities?: string[] };
};

export type OrModel = ModelInfo & { created: number };

// OpenRouter model listesi (1 saat önbellek)
export async function getOpenRouterModels(): Promise<OrModel[]> {
  const r = await fetch(`${OPENROUTER}/models`, { next: { revalidate: 3600 } }).catch(() => null);
  if (!r || !r.ok) throw new HttpError(502, "Model listesi OpenRouter'dan alınamadı.");
  const data = (await r.json()) as { data?: RawModel[] };
  return (data.data || [])
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
        source: "site" as const,
        created: m.created || 0,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "tr"));
}

// Normal kullanıcı için izinli mi: ücretsiz + ChatGPT/Gemini/Claude ailesi
export const isFreeAllowed = (m: { id: string; free: boolean }) =>
  m.free && FREE_PROVIDERS.some((p) => m.id.startsWith(p));

// --- Kullanıcının kendi anahtarları ---
export async function getUserKeys(userId: string): Promise<Partial<Record<KeyProvider, string>>> {
  const rows = await q<{ api_keys: Record<string, string> }>("SELECT api_keys FROM users WHERE id = $1", [userId]);
  const enc = rows[0]?.api_keys || {};
  const out: Partial<Record<KeyProvider, string>> = {};
  for (const p of KEY_PROVIDERS) {
    if (enc[p]) {
      const k = decrypt(enc[p]);
      if (k) out[p] = k;
    }
  }
  return out;
}

// --- Gemini (Google AI Studio) ---
type GeminiRaw = {
  name: string;
  displayName?: string;
  inputTokenLimit?: number;
  supportedGenerationMethods?: string[];
};

export async function getGeminiModels(apiKey: string): Promise<ModelInfo[]> {
  const r = await fetch(`${GEMINI}/models?pageSize=200`, {
    headers: { "x-goog-api-key": apiKey },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(r.status === 400 || r.status === 403 ? "Gemini anahtarı geçersiz." : `Gemini hatası (${r.status})`);
  const j = (await r.json()) as { models?: GeminiRaw[] };
  return (j.models || [])
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
    .filter((m) => {
      const id = m.name.replace(/^models\//, "");
      return id.startsWith("gemini") && !/(embedding|tts|image|live|audio|aqa|robotics)/.test(id);
    })
    .map((m) => {
      const id = m.name.replace(/^models\//, "");
      return {
        id: GEMINI_PREFIX + id,
        name: `Gemini (kendi anahtarın): ${m.displayName || id}`,
        context: m.inputTokenLimit || 0,
        free: false,
        image: true,
        promptPrice: 0,
        completionPrice: 0,
        source: "gemini" as const,
      };
    })
    .sort((a, b) => b.id.localeCompare(a.id, "en", { numeric: true }));
}

// Anahtarın çalıştığını kaydetmeden önce kontrol eder (model çağrısı yapmaz, sadece hesap/model listesi sorar).
export async function verifyKey(provider: KeyProvider, apiKey: string) {
  if (provider === "gemini") {
    await getGeminiModels(apiKey);
    return;
  }
  const r = await fetch(`${OPENROUTER}/key`, { headers: { Authorization: `Bearer ${apiKey}` }, cache: "no-store" }).catch(() => null);
  if (!r || !r.ok) throw new Error("OpenRouter anahtarı geçersiz.");
}

// --- Bir istek hangi anahtarla, nereye gidecek? ---
export type Route = {
  url: string;
  apiKey: string;
  model: string;
  provider: "openrouter" | "gemini";
  billing: "site" | "own";
};

export async function resolveRoute(user: User, modelId: string): Promise<Route> {
  const keys = await getUserKeys(user.id);

  if (modelId.startsWith(GEMINI_PREFIX)) {
    if (!keys.gemini) throw new HttpError(400, "Bu modeli kullanmak için Ayarlar'dan Gemini anahtarını ekle.");
    return {
      url: `${GEMINI}/openai/chat/completions`,
      apiKey: keys.gemini,
      model: modelId.slice(GEMINI_PREFIX.length),
      provider: "gemini",
      billing: "own",
    };
  }

  if (keys.openrouter) {
    return { url: `${OPENROUTER}/chat/completions`, apiKey: keys.openrouter, model: modelId, provider: "openrouter", billing: "own" };
  }

  const siteKey = process.env.OPENROUTER_API_KEY;
  if (!siteKey) throw new HttpError(500, "Sunucuda OPENROUTER_API_KEY ayarlanmamış.");

  if (!user.isPro) {
    // Kredi asla harcanmasın: model OpenRouter listesinde gerçekten ücretsiz mi, sunucuda kontrol et
    const list = await getOpenRouterModels();
    const m = list.find((x) => x.id === modelId);
    if (!m || !isFreeAllowed(m)) {
      throw new HttpError(
        403,
        "Bu model sadece pro kullanıcılara açık. Ücretsiz bir model seç ya da Ayarlar'dan kendi anahtarını ekle."
      );
    }
  }
  return { url: `${OPENROUTER}/chat/completions`, apiKey: siteKey, model: modelId, provider: "openrouter", billing: "site" };
}
