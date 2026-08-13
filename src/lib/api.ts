import { NextResponse } from "next/server";
import { checkOrigin, clientIp, rateLimit, readSession } from "./security";

export async function requireUser(req: Request) {
  if (!checkOrigin(req)) {
    return { error: NextResponse.json({ error: "Invalid origin" }, { status: 403 }) };
  }
  const user = await readSession();
  if (!user) {
    return { error: NextResponse.json({ error: "Sign in to continue." }, { status: 401 }) };
  }
  return { user };
}

export function limit(req: Request, name: string, n: number, windowMs: number) {
  const key = `${name}:${clientIp(req)}`;
  const r = rateLimit(key, n, windowMs);
  if (!r.ok) {
    return NextResponse.json({ error: "Too many requests. Please wait and try again." }, { status: 429 });
  }
  return null;
}

export function json<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
