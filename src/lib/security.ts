import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { getStore, persist, nowIso } from "./db";
import type { UserRecord } from "./types";

const AUTH_SECRET = process.env.AUTH_SECRET || "folio-dev-secret-change-in-production-32b";
const key = new TextEncoder().encode(AUTH_SECRET);
const COOKIE = "folio_session";

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function signSession(user: { id: string; email: string; name: string; isGuest: boolean }) {
  return new SignJWT({
    sub: user.id,
    email: user.email,
    name: user.name,
    isGuest: user.isGuest,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("14d")
    .sign(key);
}

export async function readSession() {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key);
    return {
      id: String(payload.sub),
      email: String(payload.email || ""),
      name: String(payload.name || ""),
      isGuest: Boolean(payload.isGuest),
    };
  } catch {
    return null;
  }
}

export function sessionCookie(token: string) {
  return {
    name: COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  };
}

export function clearSessionCookie() {
  return {
    name: COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  };
}

export function getUserById(id: string): UserRecord | null {
  return (getStore().users.find((u) => u.id === id) as UserRecord) || null;
}

export function getUserByEmail(email: string): UserRecord | null {
  const e = email.toLowerCase();
  return (getStore().users.find((u) => String(u.email).toLowerCase() === e) as UserRecord) || null;
}

export function createUser(input: { email: string; name: string; passwordHash: string; isGuest?: boolean }): UserRecord {
  const user: UserRecord = {
    id: nanoid(16),
    email: input.email.toLowerCase(),
    name: input.name,
    passwordHash: input.passwordHash,
    isGuest: Boolean(input.isGuest),
    createdAt: nowIso(),
  };
  getStore().users.push(user);
  persist();
  return user;
}

export function rateLimit(keyName: string, limit: number, windowMs: number): { ok: boolean; remaining: number } {
  const store = getStore();
  const now = Date.now();
  const row = store.rateLimits[keyName];
  if (!row || now - row.windowStart > windowMs) {
    store.rateLimits[keyName] = { count: 1, windowStart: now };
    persist();
    return { ok: true, remaining: limit - 1 };
  }
  if (row.count >= limit) return { ok: false, remaining: 0 };
  row.count += 1;
  persist();
  return { ok: true, remaining: limit - row.count };
}

export function checkOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  const host = req.headers.get("host");
  try {
    const o = new URL(origin);
    if (host && o.host === host) return true;
    const app = process.env.NEXT_PUBLIC_APP_URL;
    if (app && new URL(app).host === o.host) return true;
    if (o.hostname.endsWith(".e2b.app") || o.hostname.endsWith(".localhost")) return true;
    return false;
  } catch {
    return false;
  }
}

export function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

const MAX_UPLOAD = Number(process.env.MAX_UPLOAD_MB || 10) * 1024 * 1024;
const ALLOWED_UPLOAD = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "application/msword",
]);

export function validateUpload(file: File): { ok: true } | { ok: false; error: string } {
  if (file.size > MAX_UPLOAD) {
    return { ok: false, error: `File is too large. Maximum size is ${process.env.MAX_UPLOAD_MB || 10} MB.` };
  }
  const name = file.name.toLowerCase();
  const extOk = [".pdf", ".docx", ".doc", ".txt", ".md"].some((e) => name.endsWith(e));
  if (!extOk) {
    return { ok: false, error: "Upload a PDF, DOCX, or TXT syllabus / document." };
  }
  if (file.type && !ALLOWED_UPLOAD.has(file.type) && file.type !== "application/octet-stream") {
    return { ok: false, error: "Unsupported file type." };
  }
  return { ok: true };
}

export function safeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._\-\u0900-\u0D7F\u0600-\u06FF ]+/g, "").slice(0, 80) || "ebook";
}
