import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins";
import { oauthProvider } from "@better-auth/oauth-provider";

interface Env {
  DB: D1Database;
  ROOT_DOMAIN: string;
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  MICROSOFT_CLIENT_ID?: string;
  MICROSOFT_CLIENT_SECRET?: string;
  TWITTER_CLIENT_ID?: string;
  TWITTER_CLIENT_SECRET?: string;
}

function issuerFor(env: Env) {
  return new URL("/api/auth", env.BETTER_AUTH_URL).href.replace(/\/$/, "");
}

function authFor(env: Env) {
  const issuer = issuerFor(env);
  const socialProviders: Record<string, any> = {};

  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    socialProviders.google = {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET
    };
  }

  if (env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET) {
    socialProviders.microsoft = {
      clientId: env.MICROSOFT_CLIENT_ID,
      clientSecret: env.MICROSOFT_CLIENT_SECRET,
      tenantId: "common"
    };
  }

  if (env.TWITTER_CLIENT_ID && env.TWITTER_CLIENT_SECRET) {
    socialProviders.twitter = {
      clientId: env.TWITTER_CLIENT_ID,
      clientSecret: env.TWITTER_CLIENT_SECRET
    };
  }

  return betterAuth({
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [
      env.BETTER_AUTH_URL,
      `https://${env.ROOT_DOMAIN}`,
      `https://*.${env.ROOT_DOMAIN}`
    ],
    advanced: {
      useSecureCookies: true,
      crossSubDomainCookies: {
        enabled: true,
        domain: env.ROOT_DOMAIN
      }
    },
    socialProviders,
    plugins: [
      jwt({
        disableSettingJwtHeader: true,
        jwks: {
          jwksPath: "/.well-known/jwks.json",
          rotationInterval: 60 * 60 * 24 * 30,
          gracePeriod: 60 * 60 * 24 * 30
        },
        jwt: {
          issuer,
          audience: issuer,
          expirationTime: "15m",
          definePayload: ({ user }) => ({
            sub: user.id,
            email: user.email,
            name: user.name,
            email_verified: user.emailVerified
          })
        }
      }),
      oauthProvider({
        loginPage: "/",
        consentPage: "/consent",
        scopes: ["openid", "profile", "email"]
      })
    ]
  });
}

function trusted(origin: string | null, env: Env) {
  if (!origin) return false;

  try {
    const u = new URL(origin);
    return (
      u.protocol === "https:" &&
      (u.hostname === env.ROOT_DOMAIN ||
        u.hostname.endsWith("." + env.ROOT_DOMAIN))
    );
  } catch {
    return false;
  }
}

function cors(response: Response, request: Request, env: Env) {
  const origin = request.headers.get("Origin");
  if (!trusted(origin, env)) return response;

  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", origin!);
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Vary", "Origin");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function pageShell(title: string, body: string, script = "") {
  return new Response(
    `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
:root{font-family:system-ui;color-scheme:light dark}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f5f5f5}
main{width:min(380px,calc(100% - 40px));padding:28px;background:Canvas;border:1px solid #ccc;border-radius:16px}
button{width:100%;padding:12px;margin:7px 0;border:1px solid #bbb;border-radius:10px;background:Canvas;cursor:pointer}
p{color:GrayText}
.row{display:flex;gap:10px}
.row button{width:50%}
</style>
<main>${body}</main>
${script ? `<script>${script}</script>` : ""}`,
    {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff"
      }
    }
  );
}

function loginPage(env: Env) {
  const providers = [
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? ["google", "Google"]
      : null,
    env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET
      ? ["microsoft", "Microsoft"]
      : null,
    env.TWITTER_CLIENT_ID && env.TWITTER_CLIENT_SECRET
      ? ["twitter", "X (Twitter)"]
      : null
  ].filter(Boolean) as string[][];

  const buttons = providers
    .map(
      ([id, label]) =>
        `<button data-provider="${id}">Continue with ${label}</button>`
    )
    .join("");

  const script = `
const p = new URLSearchParams(location.search);
const requested = p.get("callbackURL");
let callbackURL = "/";

if (requested) {
  try {
    const u = new URL(requested);
    const root = ${JSON.stringify(env.ROOT_DOMAIN)};
    if (
      u.protocol === "https:" &&
      (u.hostname === root || u.hostname.endsWith("." + root))
    ) callbackURL = u.href;
  } catch {}
}

document.querySelectorAll("button[data-provider]").forEach((button) => {
  button.onclick = async () => {
    const status = document.querySelector("#status");
    status.textContent = "Redirecting…";
    button.disabled = true;

    try {
      const r = await fetch("/api/auth/sign-in/social", {
        method: "POST",
        credentials: "include",
        headers: {"content-type":"application/json"},
        body: JSON.stringify({
          provider: button.dataset.provider,
          callbackURL
        })
      });

      const data = await r.json();
      if (!r.ok) throw new Error(data.message || data.error || "Sign-in failed");
      if (!data.url) throw new Error("No redirect URL returned");
      location.href = data.url;
    } catch (error) {
      status.textContent =
        error instanceof Error ? error.message : "Sign-in failed";
      button.disabled = false;
    }
  };
});
`;

  return pageShell(
    "Sign in",
    `<h1>Sign in</h1>
<p>One account for every *.${env.ROOT_DOMAIN} app.</p>
${buttons || "<p>No OAuth provider configured.</p>"}
<p id="status"></p>`,
    script
  );
}

function consentPage() {
  const script = `
async function decide(accept) {
  const status = document.querySelector("#status");
  status.textContent = accept ? "Authorizing…" : "Denying…";

  try {
    const response = await fetch("/api/auth/oauth2/consent", {
      method: "POST",
      credentials: "include",
      headers: {"content-type":"application/json"},
      body: JSON.stringify({ accept })
    });

    if (response.redirected) {
      location.href = response.url;
      return;
    }

    const data = await response.json().catch(() => null);
    if (data?.url) {
      location.href = data.url;
      return;
    }

    if (!response.ok) {
      throw new Error(data?.message || data?.error || "Consent failed");
    }
  } catch (error) {
    status.textContent =
      error instanceof Error ? error.message : "Consent failed";
  }
}

document.querySelector("#accept").onclick = () => decide(true);
document.querySelector("#deny").onclick = () => decide(false);
`;

  return pageShell(
    "Authorize",
    `<h1>Authorize application</h1>
<p id="details">An application is requesting access to your identity.</p>
<div class="row">
  <button id="deny">Deny</button>
  <button id="accept">Allow</button>
</div>
<p id="status"></p>`,
    script
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const auth = authFor(env);

    if (url.pathname === "/health") {
      return Response.json({
        ok: true,
        issuer: issuerFor(env)
      });
    }

    if (url.pathname === "/" && request.method === "GET") {
      return loginPage(env);
    }

    if (url.pathname === "/consent" && request.method === "GET") {
      return consentPage();
    }

    if (
      url.pathname.startsWith("/api/auth/") ||
      url.pathname === "/.well-known/oauth-authorization-server/api/auth"
    ) {
      if (request.method === "OPTIONS") {
        const origin = request.headers.get("Origin");

        if (!trusted(origin, env)) {
          return new Response(null, { status: 403 });
        }

        return new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": origin!,
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Max-Age": "86400",
            Vary: "Origin"
          }
        });
      }

      return cors(await auth.handler(request), request, env);
    }

    return new Response("Not found", { status: 404 });
  }
} satisfies ExportedHandler<Env>;
