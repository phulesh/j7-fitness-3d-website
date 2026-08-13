import { fetchText } from "../http";

// A single process-wide probe for whether the open web is reachable from this
// host. Research and fact-check both use it so that offline deployments fall
// back to the locally retrieved corpus instead of hanging on network timeouts.
let liveWebCache: boolean | null = null;

export async function probeLiveWeb(): Promise<boolean> {
  if (liveWebCache !== null) return liveWebCache;
  const r = await fetchText("https://en.wikipedia.org/w/api.php?action=query&meta=siteinfo&format=json", {
    timeoutMs: 2500,
    retries: 0,
  });
  liveWebCache = Boolean(r.ok);
  return liveWebCache;
}

export function resetLiveWebProbe() {
  liveWebCache = null;
}
