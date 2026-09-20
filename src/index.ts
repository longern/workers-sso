import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins";
import { oauthProvider } from "@better-auth/oauth-provider";

interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
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

type Provider = { id: string; label: string };

function issuerFor(env: Env) {
  return new URL("/api/auth", env.BETTER_AUTH_URL).href.replace(/\/$/, "");
}

function providersFor(env: Env): Provider[] {
  const providers: Provider[] = [];
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    providers.push({ id: "google", label: "Google" });
  }
  if (env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET) {
    providers.push({ id: "microsoft", label: "Microsoft" });
  }
  if (env.TWITTER_CLIENT_ID && env.TWITTER_CLIENT_SECRET) {
    providers.push({ id: "twitter", label: "X (Twitter)" });
  }
  return providers;
}

function onRootDomain(host: string, root: string) {
  return host === root || host.endsWith("." + root);
}

function authFor(env: Env, request: Request) {
  const url = new URL(request.url);
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

  const cookieDomain = onRootDomain(url.hostname, env.ROOT_DOMAIN)
    ? env.ROOT_DOMAIN
    : undefined;

  return betterAuth({
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [
      env.BETTER_AUTH_URL,
      url.origin,
      `https://${env.ROOT_DOMAIN}`,
      `https://*.${env.ROOT_DOMAIN}`
    ],
    advanced: {
      useSecureCookies: url.protocol === "https:",
      crossSubDomainCookies: cookieDomain
        ? { enabled: true, domain: cookieDomain }
        : { enabled: false }
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

function trusted(origin: string | null, env: Env, request: Request) {
  if (!origin) return false;
  try {
    const u = new URL(origin);
    return (
      u.origin === new URL(request.url).origin ||
      (u.protocol === "https:" && onRootDomain(u.hostname, env.ROOT_DOMAIN))
    );
  } catch {
    return false;
  }
}

function copySetCookies(from: Headers, to: Headers) {
  const cookies =
    typeof from.getSetCookie === "function" ? from.getSetCookie() : [];
  for (const cookie of cookies) to.append("Set-Cookie", cookie);
}

function cors(response: Response, request: Request, env: Env) {
  const origin = request.headers.get("Origin");
  const sameOrigin = origin === new URL(request.url).origin;
  if (!origin || sameOrigin || !trusted(origin, env, request)) return response;

  const headers = new Headers(response.headers);
  headers.delete("Set-Cookie");
  copySetCookies(response.headers, headers);
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Vary", "Origin");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({
        ok: true,
        issuer: issuerFor(env)
      });
    }

    if (url.pathname === "/api/public-config" && request.method === "GET") {
      return Response.json({
        rootDomain: env.ROOT_DOMAIN,
        providers: providersFor(env)
      });
    }

    if (
      url.pathname.startsWith("/api/auth/") ||
      url.pathname === "/.well-known/oauth-authorization-server" ||
      url.pathname.startsWith("/.well-known/oauth-authorization-server/")
    ) {
      if (request.method === "OPTIONS") {
        const origin = request.headers.get("Origin");
        if (!trusted(origin, env, request)) {
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

      return cors(await authFor(env, request).handler(request), request, env);
    }

    if (url.pathname.startsWith("/api/")) {
      return new Response("Not found", { status: 404 });
    }

    return env.ASSETS.fetch(request);
  }
} satisfies ExportedHandler<Env>;
