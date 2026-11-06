import { cookies } from "next/headers";
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { q } from "./db";
import { HttpError } from "./http";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const SESSION_COOKIE = "orc_session";
const SESSION_DAYS = 30;

export type UserSettings = { system?: string; theme?: "system" | "light" | "dark"; model?: string };
export type User = { id: string; username: string; settings: UserSettings; isPro: boolean; isAdmin: boolean };

// Admin: Vercel'deki ADMIN_USERNAME ile aynı kullanıcı adı. Admin her zaman pro'dur.
export const isAdminName = (username: string) =>
  !!process.env.ADMIN_USERNAME && process.env.ADMIN_USERNAME.trim().toLowerCase() === username;

// Şifre asla düz metin saklanmaz: rastgele tuz + scrypt özeti saklanır.
export async function hashPassword(pw: string) {
  const salt = randomBytes(16);
  const hash = await scrypt(pw, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export async function verifyPassword(pw: string, stored: string) {
  const [alg, saltHex, hashHex] = stored.split("$");
  if (alg !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scrypt(pw, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  await q("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)", [
    sha256(token),
    userId,
    expires,
  ]);
  // Süresi dolmuş oturumları temizle
  await q("DELETE FROM sessions WHERE expires_at < now()");
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await q("DELETE FROM sessions WHERE token_hash = $1", [sha256(token)]);
  jar.delete(SESSION_COOKIE);
}

export async function getUser(): Promise<User | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = await q<{ id: string; username: string; settings: UserSettings; is_pro: boolean }>(
    `SELECT u.id, u.username, u.settings, u.is_pro FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [sha256(token)]
  );
  const r = rows[0];
  if (!r) return null;
  const isAdmin = isAdminName(r.username);
  return { id: r.id, username: r.username, settings: r.settings || {}, isAdmin, isPro: isAdmin || r.is_pro };
}

export async function requireUser(): Promise<User> {
  const u = await getUser();
  if (!u) throw new HttpError(401, "Oturum kapalı. Lütfen tekrar giriş yap.");
  return u;
}
