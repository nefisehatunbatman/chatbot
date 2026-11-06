import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { HttpError } from "./http";

// Kullanıcı API anahtarları veritabanında AES-256-GCM ile şifrelenir.
// Veritabanı sızsa bile KEYS_SECRET olmadan anahtarlar okunamaz.
function key() {
  const secret = process.env.KEYS_SECRET;
  if (!secret || secret.length < 16) {
    throw new HttpError(500, "Sunucuda KEYS_SECRET ayarlanmamış (en az 16 karakter). Anahtar kaydetmek için gerekli.");
  }
  return createHash("sha256").update(secret).digest();
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), ct.toString("base64")].join(":");
}

export function decrypt(stored: string): string | null {
  try {
    const [v, iv, tag, ct] = stored.split(":");
    if (v !== "v1") return null;
    const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
    d.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(ct, "base64")), d.final()]).toString("utf8");
  } catch {
    return null; // KEYS_SECRET değiştiyse eski anahtarlar okunamaz
  }
}

export const mask = (k: string) => (k.length <= 8 ? "••••" : `${k.slice(0, 4)}••••${k.slice(-4)}`);
