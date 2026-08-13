import { cookies } from "next/headers";
import { nanoid } from "nanoid";
import { createUser, hashPassword, readSession, sessionCookie, signSession, checkOrigin } from "@/lib/security";
import { json, bad, limit } from "@/lib/api";

export async function POST(req: Request) {
  if (!checkOrigin(req)) return bad("Invalid origin", 403);
  const blocked = limit(req, "guest", 30, 60 * 60 * 1000);
  if (blocked) return blocked;
  const existing = await readSession();
  if (existing) return json({ user: existing });
  const id = nanoid(6);
  const user = createUser({
    email: `guest-${id}@folio.local`,
    name: "Guest",
    passwordHash: await hashPassword(nanoid(16)),
    isGuest: true,
  });
  const token = await signSession({ id: user.id, email: user.email, name: user.name, isGuest: true });
  cookies().set(sessionCookie(token));
  return json({ user: { id: user.id, email: user.email, name: user.name, isGuest: true } });
}
