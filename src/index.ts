import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins";
import { oauthProvider } from "@better-auth/oauth-provider";
import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "./cimd-transport";

interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  BETTER_AUTH_URL?: string;
  BETTER_AUTH_SECRET: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  MICROSOFT_CLIENT_ID?: string;
  MICROSOFT_CLIENT_SECRET?: string;
  TWITTER_CLIENT_ID?: string;
  TWITTER_CLIENT_SECRET?: string;
}

type Provider = { id: string; label: string };

function originFor(env: Env, request: Request) {
  return new URL(env.BETTER_AUTH_URL || request.url).origin;
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

function createAuth(env: Env, request: Request) {
  const origin = originFor(env, request);
  const socialProviders: Record<string, any> = {};

  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    socialProviders.google = {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    };
  }

  if (env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET) {
    socialProviders.microsoft = {
      clientId: env.MICROSOFT_CLIENT_ID,
      clientSecret: env.MICROSOFT_CLIENT_SECRET,
      tenantId: "common",
    };
  }

  if (env.TWITTER_CLIENT_ID && env.TWITTER_CLIENT_SECRET) {
    socialProviders.twitter = {
      clientId: env.TWITTER_CLIENT_ID,
      clientSecret: env.TWITTER_CLIENT_SECRET,
    };
  }

  return betterAuth({
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: origin,
    trustedOrigins: [origin],
    disabledPaths: ["/token"],
    advanced: {
      useSecureCookies: new URL(origin).protocol === "https:",
      // Keep host-only sessions separate from the former parent-domain cookies.
      cookiePrefix: "workers-sso",
    },
    socialProviders,
    plugins: [
      jwt({
        disableSettingJwtHeader: true,
        jwks: {
          jwksPath: "/.well-known/jwks.json",
          rotationInterval: 60 * 60 * 24 * 30,
          gracePeriod: 60 * 60 * 24 * 30,
        },
        jwt: { issuer: origin },
      }),
      oauthProvider({
        loginPage: "/",
        consentPage: "/consent",
        allowPublicClientPrelogin: true,
        scopes: ["openid", "profile", "email"],
      }),
      cimd({ fetchClientMetadataResource }),
    ],
  });
}

// Reuse the plugin instance so CIMD caching and fetch budgets survive requests.
let cachedAuth: { env: Env; origin: string; auth: ReturnType<typeof createAuth> } | undefined;

function authFor(env: Env, request: Request) {
  const origin = originFor(env, request);
  if (cachedAuth?.env === env && cachedAuth.origin === origin) return cachedAuth.auth;
  const auth = createAuth(env, request);
  cachedAuth = { env, origin, auth };
  return auth;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = originFor(env, request);

    if (url.pathname === "/health") {
      return Response.json({
        ok: true,
        issuer: origin,
      });
    }

    if (url.pathname === "/api/public-config" && request.method === "GET") {
      return Response.json({
        providers: providersFor(env),
      });
    }

    if (
      url.pathname.startsWith("/api/auth/") ||
      url.pathname === "/.well-known/openid-configuration" ||
      url.pathname === "/.well-known/oauth-authorization-server" ||
      url.pathname.startsWith("/.well-known/oauth-authorization-server/")
    ) {
      return authFor(env, request).handler(request);
    }

    if (url.pathname.startsWith("/api/")) {
      return new Response("Not found", { status: 404 });
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
