import { cookies } from "next/headers";
import { bad, json, requireUser } from "@/lib/api";
import { checkOrigin, getUserById, hashPassword, sessionCookie, signSession, updatePassword, verifyPassword } from "@/lib/security";

export async function POST(req: Request) {
  if (!checkOrigin(req)) return bad("Invalid origin", 403);
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  if (auth.user.isGuest) return bad("Create an account before setting a password.", 403);
  let body: any;
  try { body = await req.json(); } catch { return bad("Invalid JSON"); }
  if (typeof body.currentPassword !== "string" || typeof body.newPassword !== "string" || body.newPassword.length < 8) {
    return bad("Provide your current password and a new password of at least 8 characters.");
  }
  const user = getUserById(auth.user.id);
  if (!user || !(await verifyPassword(body.currentPassword, user.passwordHash))) return bad("Current password is incorrect.", 401);
  updatePassword(user.id, await hashPassword(body.newPassword));
  const token = await signSession({ id: user.id, email: user.email, name: user.name, isGuest: false });
  cookies().set(sessionCookie(token));
  return json({ ok: true });
}
