// Thin fetch wrapper: timeout + one retry on 429/5xx with backoff. JSON only.
export async function fetchJson(url, { headers = {}, timeoutMs = 12000, retries = 1 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { headers, signal: ctrl.signal });
      clearTimeout(timer);
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        await sleep(1500 * (attempt + 1));
        continue;
      }
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        const err = new Error(`HTTP ${res.status} for ${url} :: ${body.slice(0, 200)}`);
        err.status = res.status;
        throw err;
      }
      return await res.json();
    } catch (err) {
      clearTimeout(timer);
      // Retry transient network blips (DNS/socket resets) too, not just timeouts/5xx.
      const code = err.code || err.cause?.code || "";
      const networkBlip =
        /^(ECONN|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|EPIPE|UND_ERR)/.test(code) ||
        err.message === "fetch failed";
      if (attempt < retries && (err.name === "AbortError" || err.status >= 500 || networkBlip)) {
        await sleep(1500 * (attempt + 1));
        continue;
      }
      throw err;
    }
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
