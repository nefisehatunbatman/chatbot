// Şifreden çerez değeri üretir. Edge (middleware) ve Node'da çalışır.
export const AUTH_COOKIE = "orc_auth";

export async function tokenFor(password: string): Promise<string> {
  const secret = process.env.AUTH_SECRET || "coklu-ai";
  const data = new TextEncoder().encode(`${secret}:${password}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
