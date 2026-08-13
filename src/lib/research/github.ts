import { fetchJson } from "../http";
import type { RawHit } from "./search";

interface RepoHit {
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
}

export async function searchGitHub(query: string, count = 6): Promise<(RawHit & { extract?: string })[]> {
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=${count}&sort=stars`;
  const r = await fetchJson<{ items?: RepoHit[] }>(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "FolioEbookGenerator/1.0",
    },
    timeoutMs: 12000,
  });
  const items = r.data?.items || [];
  const hits: (RawHit & { extract?: string })[] = [];
  for (const it of items.slice(0, count)) {
    let extract = it.description || "";
    try {
      if (hits.length >= 2) {
        hits.push({
          title: it.full_name,
          url: it.html_url,
          snippet: (it.description || "GitHub repository").slice(0, 280),
          provider: "github",
          extract,
        });
        continue;
      }
      const readme = await fetchJson<{ content?: string; encoding?: string; html_url?: string }>(
        `https://api.github.com/repos/${it.full_name}/readme`,
        {
          headers: { Accept: "application/vnd.github+json", "User-Agent": "FolioEbookGenerator/1.0" },
          timeoutMs: 10000,
          retries: 0,
        }
      );
      if (readme.data?.content && readme.data.encoding === "base64") {
        extract = Buffer.from(readme.data.content.replace(/\n/g, ""), "base64").toString("utf8").slice(0, 12000);
      }
    } catch {
      /* keep description */
    }
    hits.push({
      title: it.full_name,
      url: it.html_url,
      snippet: (it.description || extract).slice(0, 280),
      provider: "github",
      extract,
    });
  }
  return hits;
}

export async function searchGitHubCodeWikiStyle(query: string): Promise<RawHit[]> {
  // Topics + educational notes often live as markdown textbooks
  const q = `${query} textbook OR notes OR syllabus OR ncert OR course in:readme,description`;
  const r = await fetchJson<{ items?: RepoHit[] }>(
    `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&per_page=5`,
    { headers: { Accept: "application/vnd.github+json", "User-Agent": "FolioEbookGenerator/1.0" } }
  );
  return (r.data?.items || []).map((it) => ({
    title: it.full_name,
    url: it.html_url,
    snippet: it.description || "GitHub educational repository",
    provider: "github",
  }));
}
