import "./styles.css";

type AttrValue = string | number | boolean | ((event: Event) => void) | null | undefined;
type Child = Node | string | number | false | null | undefined;
type Provider = { id: string; label: string };
type PublicConfig = { rootDomain: string; providers: Provider[] };
type User = { id: string; name?: string | null; email?: string | null; image?: string | null };
type Session = { user: User };
type Account = { providerId?: string };

const app = document.querySelector("#app") as HTMLElement;

function h(tag: string, attrs: Record<string, AttrValue> = {}, kids: Child | Child[] = []): HTMLElement {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = String(value);
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value != null && value !== false) {
      node.setAttribute(key, value === true ? "" : String(value));
    }
  }
  for (const kid of Array.isArray(kids) ? kids : [kids]) {
    if (kid == null || kid === false) continue;
    node.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return node;
}

function setStatus(text: string, isError = false) {
  let status = document.querySelector("#status");
  if (!status) {
    status = h("p", { id: "status", class: isError ? "error" : "muted" });
    app.append(status);
  }
  status.className = isError ? "error" : "muted";
  status.textContent = text || "";
}

async function api(path: string, options: RequestInit = {}): Promise<any> {
  const response = await fetch("/api/auth" + path, {
    credentials: "include",
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...options.headers,
    },
    ...options,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      data?.message ||
      data?.error?.message ||
      data?.error ||
      data?.error_description ||
      "Request failed";
    throw new Error(typeof message === "string" ? message : "Request failed");
  }
  return data;
}

function callbackURL(rootDomain: string) {
  const requested = new URLSearchParams(location.search).get("callbackURL");
  if (!requested) return location.origin + "/";
  try {
    const url = new URL(requested);
    if (
      url.protocol === "https:" &&
      (url.hostname === rootDomain || url.hostname.endsWith("." + rootDomain))
    ) {
      return url.href;
    }
  } catch {}
  return location.origin + "/";
}

function isExternalCallback(url: string) {
  try {
    return new URL(url).origin !== location.origin;
  } catch {
    return false;
  }
}

function oauthError() {
  const params = new URLSearchParams(location.search);
  return params.get("error_description") || params.get("error") || "";
}

async function startOAuth(provider: string, path: string, next: string) {
  setStatus("Redirecting…");
  for (const button of app.querySelectorAll("button")) button.disabled = true;
  try {
    const data = await api(path, {
      method: "POST",
      body: JSON.stringify({ provider, callbackURL: next }),
    });
    if (!data?.url) throw new Error("No redirect URL returned");
    location.href = data.url;
  } catch (error) {
    for (const button of app.querySelectorAll("button")) button.disabled = false;
    setStatus(error instanceof Error ? error.message : "Sign-in failed", true);
  }
}

function renderLogin(config: PublicConfig) {
  document.title = "Sign in";
  const next = callbackURL(config.rootDomain);
  app.replaceChildren(
    h("h1", {}, "Sign in"),
    h("p", { class: "muted" }, `One account for every *.${config.rootDomain} app.`),
    ...config.providers.map((provider) =>
      h(
        "button",
        {
          type: "button",
          onclick: () => startOAuth(provider.id, "/sign-in/social", next),
        },
        `Continue with ${provider.label}`,
      ),
    ),
    ...(config.providers.length
      ? []
      : [h("p", { class: "muted" }, "No OAuth provider configured.")]),
    h("p", { id: "status", class: oauthError() ? "error" : "muted" }, oauthError()),
  );
}

function renderConsent() {
  document.title = "Authorize";
  async function decide(accept: boolean) {
    setStatus(accept ? "Authorizing…" : "Denying…");
    try {
      const response = await fetch("/api/auth/oauth2/consent", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accept }),
        redirect: "manual",
      });
      if (response.status >= 300 && response.status < 400) {
        const locationHeader = response.headers.get("Location");
        if (locationHeader) {
          location.href = locationHeader;
          return;
        }
      }
      const data = await response.json().catch(() => null);
      if (data?.url) {
        location.href = data.url;
        return;
      }
      if (response.redirected) {
        location.href = response.url;
        return;
      }
      if (!response.ok) {
        throw new Error(data?.message || data?.error || "Consent failed");
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Consent failed", true);
    }
  }

  app.replaceChildren(
    h("h1", {}, "Authorize application"),
    h("p", { class: "muted" }, "An application is requesting access to your identity."),
    h("div", { class: "row" }, [
      h("button", { type: "button", id: "deny", onclick: () => decide(false) }, "Deny"),
      h("button", { type: "button", class: "primary", id: "accept", onclick: () => decide(true) }, "Allow"),
    ]),
    h("p", { id: "status", class: "muted" }),
  );
}

function accountList(_session: Session, accounts: Account[] | { data?: Account[] }, config: PublicConfig) {
  const linked = new Set(
    (Array.isArray(accounts) ? accounts : accounts?.data || [])
      .map((item) => item.providerId)
      .filter(Boolean),
  );
  const next = location.origin + "/";
  return h(
    "ul",
    { class: "accounts" },
    config.providers.map((provider) => {
      const connected = linked.has(provider.id);
      return h("li", {}, [
        h("span", {}, `${provider.label}${connected ? " · connected" : ""}`),
        connected
          ? null
          : h(
              "button",
              {
                type: "button",
                onclick: () => startOAuth(provider.id, "/link-social", next),
              },
              "Connect",
            ),
      ]);
    }),
  );
}

function renderHome(session: Session, accounts: Account[] | { data?: Account[] }, config: PublicConfig) {
  const user = session.user;
  const next = callbackURL(config.rootDomain);
  const external = isExternalCallback(next);
  document.title = user.name || "Signed in";

  const initial = (user.name || user.email || "U").slice(0, 1).toUpperCase();
  const avatar = user.image
    ? h("img", { class: "avatar", src: user.image, alt: "" })
    : h("div", { class: "avatar" }, initial);

  app.replaceChildren(
    h("h1", {}, "Signed in"),
    h("p", { class: "muted" }, `This session works across *.${config.rootDomain}.`),
    h("div", { class: "user" }, [
      avatar,
      h("div", {}, [
        h("h2", {}, user.name || "Account"),
        h("p", { class: "muted" }, user.email || user.id),
      ]),
    ]),
    h("p", { class: "muted" }, "Connected accounts"),
    accountList(session, accounts, config),
    ...(external
      ? [h(
          "button",
          { type: "button", class: "primary", onclick: () => { location.href = next; } },
          `Continue to ${new URL(next).hostname}`,
        )]
      : []),
    h("button", {
      type: "button",
      onclick: async () => {
        setStatus("Creating token…");
        try {
          const data = await api("/token");
          const token = data?.token || data?.access_token || JSON.stringify(data);
          let box = document.querySelector(".token");
          if (!box) {
            box = h("pre", { class: "token" });
            app.append(box);
          }
          box.textContent = token;
          setStatus("Token created. It expires in 15 minutes.");
        } catch (error) {
          setStatus(error instanceof Error ? error.message : "Token failed", true);
        }
      },
    }, "Get access token"),
    h("button", {
      type: "button",
      class: "ghost",
      onclick: async () => {
        setStatus("Signing out…");
        try {
          await api("/sign-out", { method: "POST", body: "{}" });
          location.href = "/";
        } catch (error) {
          setStatus(error instanceof Error ? error.message : "Sign out failed", true);
        }
      },
    }, "Sign out"),
    h("p", { id: "status", class: oauthError() ? "error" : "muted" }, oauthError()),
  );
}

async function boot() {
  const config = (await fetch("/api/public-config", { credentials: "include" }).then((r) => r.json())) as PublicConfig;

  if (location.pathname === "/consent") {
    renderConsent();
    return;
  }

  let session: Session | null = null;
  try {
    session = await api("/get-session");
  } catch {
    session = null;
  }

  if (!session?.user) {
    renderLogin(config);
    return;
  }

  let accounts: Account[] = [];
  try {
    accounts = await api("/list-accounts");
  } catch {
    accounts = [];
  }

  renderHome(session, accounts, config);
}

boot().catch((error) => {
  app.replaceChildren(
    h("h1", {}, "Something went wrong"),
    h("p", { class: "error" }, error instanceof Error ? error.message : "Failed to load"),
  );
});
