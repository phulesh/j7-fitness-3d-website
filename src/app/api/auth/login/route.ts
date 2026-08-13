import { cookies } from "next/headers";
import { getUserByEmail, sessionCookie, signSession, verifyPassword, checkOrigin } from "@/lib/security";
import { loginSchema } from "@/lib/validation";
import { bad, json, limit } from "@/lib/api";

export async function POST(req: Request) {
  if (!checkOrigin(req)) return bad("Invalid origin", 403);
  const blocked = limit(req, "login", 20, 15 * 60 * 1000);
  if (blocked) return blocked;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON");
  }
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) return bad("Invalid email or password.");
  const user = getUserByEmail(parsed.data.email);
  if (!user || user.isGuest) return bad("Invalid email or password.", 401);
  const ok = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!ok) return bad("Invalid email or password.", 401);
  const token = await signSession({ id: user.id, email: user.email, name: user.name, isGuest: false });
  cookies().set(sessionCookie(token));
  return json({ user: { id: user.id, email: user.email, name: user.name, isGuest: false } });
}
