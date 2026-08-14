import { cookies } from "next/headers";
import { clearSessionCookie, revokeCurrentSession } from "@/lib/security";
import { json } from "@/lib/api";

export async function POST() {
  // Revoke the server-side token before clearing the browser cookie. A copied
  // or intercepted old cookie must not remain usable after explicit logout.
  revokeCurrentSession();
  cookies().set(clearSessionCookie());
  return json({ ok: true });
}
