import { cookies } from "next/headers";
import { clearSessionCookie, revokeCurrentSession } from "@/lib/security";
import { json } from "@/lib/api";

export async function POST() {
  cookies().set(clearSessionCookie());
  return json({ ok: true });
}
