/**
 * Preflight reachability check for baseUrl.
 *
 * Resolves on ANY HTTP response (even 4xx/5xx -- those prove the server is reachable).
 * Throws on network-level failures: connection refused, DNS failure, timeout.
 */
export async function checkBaseUrlReachable(url: string, timeoutMs = 5000): Promise<void> {
  await fetch(url, {
    method: "HEAD",
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "follow",
  });
}
