import type { User } from "./auth";
import { blobAccess, blobEnabled } from "./blobstore";
import { mask } from "./crypto";
import { getUserKeys } from "./models";
import type { Me } from "./types";

// Tarayıcıya gönderilen kullanıcı özeti. Anahtarlar ASLA tam gönderilmez, sadece maskeli.
export async function buildMe(user: User): Promise<Me> {
  const keysEnabled = !!process.env.KEYS_SECRET && process.env.KEYS_SECRET.length >= 16;
  const keys = keysEnabled ? await getUserKeys(user.id) : {};
  return {
    user: { id: user.id, username: user.username, settings: user.settings || {}, isPro: user.isPro, isAdmin: user.isAdmin },
    keys: {
      gemini: keys.gemini ? mask(keys.gemini) : null,
      openrouter: keys.openrouter ? mask(keys.openrouter) : null,
    },
    keysEnabled,
    blob: { enabled: blobEnabled(), access: blobAccess() },
  };
}
