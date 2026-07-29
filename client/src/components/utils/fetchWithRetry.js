// Wraps `fetch` so a transient, mid-request network drop (Wi-Fi blip, brief
// connection reset to the lab server, etc.) doesn't nuke work that already
// succeeded server-side just before it — e.g. an evaluation run whose only
// remaining step is saving the result. Retries a small, fixed number of
// times with exponential backoff, and ONLY for errors that look like a
// network-layer failure (never for a real 4xx/5xx response — those are
// application errors, not connectivity issues, and retrying them would just
// resubmit against a request the server already understood and rejected).

const isNetworkError = (err) => (
  // Chrome: "Failed to fetch" · Safari: "Load failed" · Firefox: "NetworkError when attempting to fetch resource."
  err instanceof TypeError
  || /Failed to fetch|Load failed|NetworkError/i.test(err?.message || '')
);

export async function fetchWithRetry(url, options = {}, { retries = 3, baseDelayMs = 800, timeoutMs = 20_000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);
      return response;
    } catch (err) {
      clearTimeout(timeoutId);
      lastErr = err;
      const timedOut = err?.name === 'AbortError';
      if ((!isNetworkError(err) && !timedOut) || attempt === retries) break;
      const delay = baseDelayMs * 2 ** attempt;
      console.warn(`[fetchWithRetry] ${timedOut ? 'Timed out' : 'Network error'} on ${url}, retrying in ${delay}ms (${attempt + 1}/${retries})`, err);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastErr;
}