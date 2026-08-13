import { cookies } from "next/headers";
import { createUser, getUserByEmail, hashPassword, sessionCookie, signSession } from "@/lib/security";
import { registerSchema } from "@/lib/validation";
import { bad, json, limit } from "@/lib/api";
import { checkOrigin } from "@/lib/security";

export async function POST(req: Request) {
  if (!checkOrigin(req)) return bad("Invalid origin", 403);
  const blocked = limit(req, "register", 8, 60 * 60 * 1000);
  if (blocked) return blocked;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON");
  }
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) return bad("Please provide a valid name, email, and a password of at least 8 characters.");
  if (getUserByEmail(parsed.data.email)) return bad("An account with that email already exists.", 409);
  const user = createUser({
    email: parsed.data.email,
    name: parsed.data.name,
    passwordHash: await hashPassword(parsed.data.password),
  });
  const token = await signSession({ id: user.id, email: user.email, name: user.name, isGuest: false });
  cookies().set(sessionCookie(token));
  return json({ user: { id: user.id, email: user.email, name: user.name, isGuest: false } });
}
