/**
 * Workers global fetch is restricted to public Internet destinations by
 * global_fetch_strictly_public in wrangler.jsonc. Keep that flag enabled;
 * do not replace this with a private-network or service binding fetch.
 * The CIMD plugin adds URL validation, timeouts and streamed size limits.
 */
export async function fetchClientMetadataResource(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  // Workers does not implement redirect: "error"; the plugin rejects 3xx responses.
  const request = new Request(input, { ...init, redirect: "manual" });
  const url = new URL(request.url);
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw new Error("CIMD resources must use HTTPS without credentials or fragments");
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    throw new Error("CIMD resources only support GET and HEAD");
  }
  return fetch(request);
}
