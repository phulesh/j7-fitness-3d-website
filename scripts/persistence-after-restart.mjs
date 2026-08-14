const base = process.env.TEST_BASE_URL;
const email = process.env.TEST_ACCOUNT_EMAIL;
const password = process.env.TEST_ACCOUNT_PASSWORD;
const ebookId = process.env.TEST_EBOOK_ID;
if (!base || !email || !password || !ebookId) {
  throw new Error("Set TEST_BASE_URL, TEST_ACCOUNT_EMAIL, TEST_ACCOUNT_PASSWORD, and TEST_EBOOK_ID in the trusted shell.");
}
let cookie = "";
async function request(url, init = {}) {
  const headers = { "content-type": "application/json", origin: base, ...(init.headers || {}) };
  if (cookie) headers.cookie = cookie;
  const response = await fetch(base + url, { ...init, headers });
  const set = response.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0];
  const data = await response.json().catch(() => ({}));
  return { response, data };
}
const login = await request("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
if (!login.response.ok) throw new Error(`AUTH AFTER RESTART: FAIL (${login.response.status})`);
const ebook = await request(`/api/ebooks/${encodeURIComponent(ebookId)}`);
if (!ebook.response.ok || ebook.data.ebook?.id !== ebookId) throw new Error("EBOOK AFTER RESTART: FAIL");
console.log("AUTH AFTER RESTART: PASS");
console.log("EBOOK AFTER RESTART: PASS");
