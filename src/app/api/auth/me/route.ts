import { readSession } from "@/lib/security";
import { json } from "@/lib/api";

export async function GET() {
  const user = await readSession();
  return json({ user });
}
