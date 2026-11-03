import { createAuthClient } from "better-auth/client";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { webUrl, type Client } from "./presentation";
import type { Account, AppGrant, Config, Grant, PageData, Session } from "./types";

const authClient = createAuthClient({ plugins: [oauthProviderClient()] });

export async function api<T = unknown>(path: string, body?: Record<string, unknown>): Promise<T> {
  const { data, error } = await authClient.$fetch<T>(path, {
    method: body ? "POST" : "GET",
    body,
    headers: { accept: "application/json" },
  });
  if (error) throw new Error(error.message || "Request failed");
  return data as T;
}

export async function follow(path: string, body: Record<string, unknown>) {
  const data = await api<{ url?: string }>(path, body);
  const url = data.url ? webUrl(new URL(data.url, location.origin).href) : undefined;
  if (!url) throw new Error("No valid redirect URL returned");
  location.assign(url.href);
}

export function oauthError() {
  const params = new URLSearchParams(location.search);
  return params.get("error_description") || params.get("error") || "";
}

async function loadGrants(): Promise<AppGrant[]> {
  const consents = await api<Grant[]>("/oauth2/get-consents");
  const groups = new Map<string, Grant[]>();
  for (const grant of consents) {
    groups.set(grant.clientId, [...(groups.get(grant.clientId) || []), grant]);
  }
  const entries = [...groups];
  const clients = await Promise.allSettled(entries.map(([id]) =>
    api<Client>(`/oauth2/public-client?client_id=${encodeURIComponent(id)}`),
  ));
  return entries.map(([id, grants], index) => {
    const result = clients[index];
    return { grants, client: result.status === "fulfilled" ? result.value : { client_id: id } };
  });
}

export async function loadPage(): Promise<PageData> {
  const response = await fetch("/api/public-config", { credentials: "include" });
  if (!response.ok) throw new Error("Could not load site configuration");
  const config = await response.json() as Config;
  const session = await api<Session | null>("/get-session");
  const params = new URLSearchParams(location.search);
  if (params.has("client_id") || location.pathname === "/consent") {
    const clientId = params.get("client_id");
    if (!clientId || !params.has("sig")) throw new Error("Missing signed authorization request");
    // The official client forwards oauth_query, which the server validates.
    const client = await api<Client>("/oauth2/public-client-prelogin", { client_id: clientId });
    return location.pathname === "/consent" && session?.user
      ? { page: "consent", client, session }
      : { page: "login", config, client, session: session ?? undefined };
  }
  if (!session?.user) return { page: "login", config };
  const [accounts, grants] = await Promise.allSettled([
    api<Account[]>("/list-accounts"),
    loadGrants(),
  ]);
  return {
    page: "account", config, session,
    accounts: accounts.status === "fulfilled" ? accounts.value : null,
    grants: grants.status === "fulfilled" ? grants.value : null,
  };
}

export async function revokeGrants(grants: Grant[]) {
  // Each request goes through the plugin's session ownership check.
  for (const grant of grants) await api("/oauth2/delete-consent", { id: grant.id });
}
