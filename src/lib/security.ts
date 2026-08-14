import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "crypto";
import { nanoid } from "nanoid";
import { getDatabase, getStore, persist, nowIso } from "./db";
import type { UserRecord } from "./types";

const COOKIE = "folio_session";
const SESSION_DAYS = 14;

export async function hashPassword(password: string) { return bcrypt.hash(password, 12); }
export async function verifyPassword(password: string, hash: string) { return bcrypt.compare(password, hash); }
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

/** Creates an opaque, revocable server-side session. No identity data is trusted from the cookie. */
export async function signSession(user: { id: string; email: string; name: string; isGuest: boolean }) {
  const token = randomBytes(32).toString("base64url");
  const now = nowIso();
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString();
  const db = getDatabase();
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now);
  db.prepare("INSERT INTO sessions(token_hash,user_id,created_at,expires_at,last_seen_at) VALUES(?,?,?,?,?)")
    .run(tokenHash(token), user.id, now, expires, now);
  return token;
}

export async function readSession() {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  const db = getDatabase();
  const row = db.prepare(`SELECT u.id,u.email,u.name,u.is_guest AS isGuest,s.expires_at AS expiresAt
    FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?`).get(tokenHash(token)) as any;
  if (!row || Date.parse(row.expiresAt) <= Date.now()) {
    db.prepare("DELETE FROM sessions WHERE token_hash=?").run(tokenHash(token));
    return null;
  }
  db.prepare("UPDATE sessions SET last_seen_at=? WHERE token_hash=?").run(nowIso(), tokenHash(token));
  return { id: String(row.id), email: String(row.email), name: String(row.name), isGuest: Boolean(row.isGuest) };
}

export function revokeCurrentSession() {
  const token = cookies().get(COOKIE)?.value;
  if (token) getDatabase().prepare("DELETE FROM sessions WHERE token_hash=?").run(tokenHash(token));
}

export function revokeUserSessions(userId: string) {
  getDatabase().prepare("DELETE FROM sessions WHERE user_id=?").run(userId);
}

export function sessionCookie(token: string) {
  return { name: COOKIE, value: token, httpOnly: true, sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * SESSION_DAYS };
}
export function clearSessionCookie() {
  return { name: COOKIE, value: "", httpOnly: true, sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 };
}

export function getUserById(id: string): UserRecord | null {
  return (getStore().users.find((u) => u.id === id) as UserRecord) || null;
}
export function getUserByEmail(email: string): UserRecord | null {
  const e = email.trim().toLowerCase();
  return (getStore().users.find((u) => String(u.email).toLowerCase() === e) as UserRecord) || null;
}

export function createUser(input: { email: string; name: string; passwordHash: string; isGuest?: boolean }): UserRecord {
  const now = nowIso();
  const user: UserRecord = { id: nanoid(16), email: input.email.trim().toLowerCase(), name: input.name,
    passwordHash: input.passwordHash, isGuest: Boolean(input.isGuest), createdAt: now, updatedAt: now };
  const store = getStore();
  if (store.users.some((u) => String(u.email).toLowerCase() === user.email)) {
    throw new Error("EMAIL_EXISTS");
  }
  store.users.push(user);
  try { persist(); } catch (error) {
    store.users = store.users.filter((u) => u.id !== user.id);
    if (String(error).toLowerCase().includes("unique")) throw new Error("EMAIL_EXISTS");
    throw error;
  }
  return user;
}

export function updatePassword(userId: string, passwordHash: string) {
  const user = getStore().users.find((u) => u.id === userId);
  if (!user) return false;
  user.passwordHash = passwordHash;
  user.updatedAt = nowIso();
  persist();
  revokeUserSessions(userId);
  return true;
}

export function rateLimit(keyName: string, limit: number, windowMs: number): { ok: boolean; remaining: number } {
  const store = getStore(); const now = Date.now(); const row = store.rateLimits[keyName];
  if (!row || now - row.windowStart > windowMs) { store.rateLimits[keyName] = { count: 1, windowStart: now }; persist(); return { ok: true, remaining: limit - 1 }; }
  if (row.count >= limit) return { ok: false, remaining: 0 };
  row.count += 1; persist(); return { ok: true, remaining: limit - row.count };
}

export function checkOrigin(req: Request): boolean {
  const origin = req.headers.get("origin"); if (!origin) return true;
  const host = req.headers.get("host");
  try {
    const o = new URL(origin); if (host && o.host === host) return true;
    const app = process.env.NEXT_PUBLIC_APP_URL; if (app && new URL(app).host === o.host) return true;
    if (process.env.NODE_ENV !== "production" && (o.hostname.endsWith(".e2b.app") || o.hostname.endsWith(".localhost"))) return true;
    return false;
  } catch { return false; }
}
export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

const MAX_UPLOAD = Number(process.env.MAX_UPLOAD_MB || 10) * 1024 * 1024;
const ALLOWED_UPLOAD = new Set(["application/pdf","application/vnd.openxmlformats-officedocument.wordprocessingml.document","text/plain","text/markdown","application/msword"]);
export function validateUpload(file: File): { ok: true } | { ok: false; error: string } {
  if (file.size > MAX_UPLOAD) return { ok: false, error: `File is too large. Maximum size is ${process.env.MAX_UPLOAD_MB || 10} MB.` };
  const extOk = [".pdf", ".docx", ".doc", ".txt", ".md"].some((e) => file.name.toLowerCase().endsWith(e));
  if (!extOk) return { ok: false, error: "Upload a PDF, DOCX, or TXT syllabus / document." };
  if (file.type && !ALLOWED_UPLOAD.has(file.type) && file.type !== "application/octet-stream") return { ok: false, error: "Unsupported file type." };
  return { ok: true };
}
export function safeFilename(name: string) { return name.replace(/[^a-zA-Z0-9._\-\u0900-\u0D7F\u0600-\u06FF ]+/g, "").slice(0, 80) || "ebook"; }
