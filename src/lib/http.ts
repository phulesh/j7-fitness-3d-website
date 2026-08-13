import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const UA =
  "FolioEbookGenerator/1.0 (research-based educational ebook generator; contact: folio-local)";

export class HttpError extends Error {
  constructor(
    message: string,
    public status?: number
  ) {
    super(message);
  }
}

async function curlGet(
  url: string,
  timeoutMs: number,
  headers?: Record<string, string>
): Promise<{ ok: boolean; status: number; text: string; finalUrl: string }> {
  try {
    const args = [
      "-4",
      "-sS",
      "-L",
      "--compressed",
      "--max-time",
      String(Math.max(5, Math.round(timeoutMs / 1000))),
      "-A",
      UA,
      "-H",
      "Accept: text/html,application/xhtml+xml,application/json,application/xml;q=0.9,*/*;q=0.8",
    ];
    for (const [k, v] of Object.entries(headers || {})) {
      if (k.toLowerCase() === "user-agent") continue;
      args.push("-H", `${k}: ${v}`);
    }
    args.push("-w", "\n__FOLIO_STATUS__:%{http_code}", url);
    const { stdout } = await execFileAsync("curl", args, { maxBuffer: 8 * 1024 * 1024 });
    const mark = stdout.lastIndexOf("__FOLIO_STATUS__:");
    const text = mark >= 0 ? stdout.slice(0, mark).replace(/\n$/, "") : stdout;
    const status = mark >= 0 ? Number(stdout.slice(mark + 17).trim()) : 200;
    return { ok: status >= 200 && status < 400 && status !== 0, status: status || 0, text, finalUrl: url };
  } catch (e) {
    return { ok: false, status: 0, text: (e as Error).message, finalUrl: url };
  }
}

export async function fetchText(
  url: string,
  opts: { timeoutMs?: number; headers?: Record<string, string>; retries?: number } = {}
): Promise<{ ok: boolean; status: number; text: string; finalUrl: string }> {
  const timeoutMs = opts.timeoutMs ?? 7000;
  const retries = opts.retries ?? 2;
  let lastErr: Error | null = null;
  for (let i = 0; i <= retries; i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        redirect: "follow",
        headers: {
          "User-Agent": UA,
          Accept: "text/html,application/xhtml+xml,application/json,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en,hi;q=0.8,*",
          ...(opts.headers || {}),
        },
      });
      const text = await res.text();
      return { ok: res.ok, status: res.status, text, finalUrl: res.url || url };
    } catch (e) {
      lastErr = e as Error;
      const viaCurl = await curlGet(url, timeoutMs, opts.headers);
      if (viaCurl.status !== 0) return viaCurl;
      await sleep(350 * 2 ** i + Math.floor(Math.random() * 180));
    } finally {
      clearTimeout(t);
    }
  }
  return { ok: false, status: 0, text: lastErr?.message || "network error", finalUrl: url };
}

export async function fetchJson<T = unknown>(
  url: string,
  opts: { timeoutMs?: number; headers?: Record<string, string>; retries?: number } = {}
): Promise<{ ok: boolean; status: number; data: T | null; raw: string }> {
  const r = await fetchText(url, opts);
  if (!r.ok) return { ok: false, status: r.status, data: null, raw: r.text };
  try {
    return { ok: true, status: r.status, data: JSON.parse(r.text) as T, raw: r.text };
  } catch {
    return { ok: false, status: r.status, data: null, raw: r.text };
  }
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function decodeHtml(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

export function stripTags(html: string): string {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<\/h[1-6]>/gi, "\n\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+\n/g, "\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim()
  );
}

export function truncate(s: string, n: number) {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…";
}

export function normalizeSpace(s: string) {
  return s.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}
