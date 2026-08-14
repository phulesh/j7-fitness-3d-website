import { getStore, nowIso, persist } from "./db";

/** Creates an isolated account fixture for self-test scripts (never available in production). */
export function ensureSelftestUser(id: string) {
  if (process.env.NODE_ENV === "production") throw new Error("Self-test fixtures are disabled in production");
  const store = getStore();
  if (store.users.some((user) => user.id === id)) return;
  const now = nowIso();
  store.users.push({
    id,
    email: `${id}@selftest.invalid`,
    name: "Self-test",
    // bcrypt hash, never a usable plaintext credential.
    passwordHash: "$2a$12$cUj8BUVvD8FRRj3cLIUpse6yR3k9Pjg0W4oQk1qG5TJVgOaoKQIZu",
    isGuest: false,
    createdAt: now,
    updatedAt: now,
  });
  persist();
}
