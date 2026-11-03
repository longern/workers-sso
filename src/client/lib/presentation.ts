export type Client = { client_id: string; client_name?: string; client_uri?: string; logo_uri?: string };
export function webUrl(value?: string): URL | undefined {
  if (!value) return;
  try {
    const url = new URL(value);
    if ((url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password) return url;
  } catch {}
}
export function clientIdentity(client: Client) {
  const domain = (webUrl(client.client_id) ?? webUrl(client.client_uri))?.host ?? "";
  return { name: client.client_name?.trim() || domain || client.client_id, domain };
}
export function requestedScopes(search: string) {
  return [...new Set((new URLSearchParams(search).get("scope") ?? "").split(/\s+/).filter(Boolean))];
}
