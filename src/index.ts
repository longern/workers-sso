import { betterAuth } from "better-auth";

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

function authFor(env: Env) {
  const socialProviders: Record<string, any> = {};
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)
    socialProviders.google = { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET };
  if (env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET)
    socialProviders.microsoft = { clientId: env.MICROSOFT_CLIENT_ID, clientSecret: env.MICROSOFT_CLIENT_SECRET, tenantId: "common" };
  if (env.TWITTER_CLIENT_ID && env.TWITTER_CLIENT_SECRET)
    socialProviders.twitter = { clientId: env.TWITTER_CLIENT_ID, clientSecret: env.TWITTER_CLIENT_SECRET };

  return betterAuth({
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [env.BETTER_AUTH_URL, `https://${env.ROOT_DOMAIN}`, `https://*.${env.ROOT_DOMAIN}`],
    advanced: {
      useSecureCookies: true,
      crossSubDomainCookies: { enabled: true, domain: env.ROOT_DOMAIN }
    },
    socialProviders
  });
}

function trusted(origin: string | null, env: Env) {
  if (!origin) return false;
  try {
    const u = new URL(origin);
    return u.protocol === "https:" && (u.hostname === env.ROOT_DOMAIN || u.hostname.endsWith("." + env.ROOT_DOMAIN));
  } catch { return false; }
}

function cors(response: Response, request: Request, env: Env) {
  const origin = request.headers.get("Origin");
  if (!trusted(origin, env)) return response;
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", origin!);
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Vary", "Origin");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function loginPage(env: Env) {
  const providers = [
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? ["google","Google"] : null,
    env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET ? ["microsoft","Microsoft"] : null,
    env.TWITTER_CLIENT_ID && env.TWITTER_CLIENT_SECRET ? ["twitter","X (Twitter)"] : null
  ].filter(Boolean) as string[][];

  const buttons = providers.map(([id,label]) => `<button data-provider="${id}">Continue with ${label}</button>`).join("");
  return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sign in</title><style>:root{font-family:system-ui;color-scheme:light dark}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f5f5f5}main{width:min(360px,calc(100% - 40px));padding:28px;background:Canvas;border:1px solid #ccc;border-radius:16px}button{width:100%;padding:12px;margin:7px 0;border:1px solid #bbb;border-radius:10px;background:Canvas;cursor:pointer}p{color:GrayText}</style>
<main><h1>Sign in</h1><p>One account for every *.${env.ROOT_DOMAIN} app.</p>${buttons || "<p>No OAuth provider configured.</p>"}<p id="status"></p></main>
<script>
const p=new URLSearchParams(location.search), requested=p.get("callbackURL"); let callbackURL="/";
if(requested){try{const u=new URL(requested),root=${JSON.stringify(env.ROOT_DOMAIN)};if(u.protocol==="https:"&&(u.hostname===root||u.hostname.endsWith("."+root)))callbackURL=u.href}catch{}}
document.querySelectorAll("button").forEach(b=>b.onclick=async()=>{const s=document.querySelector("#status");s.textContent="Redirecting…";b.disabled=true;try{const r=await fetch("/api/auth/sign-in/social",{method:"POST",credentials:"include",headers:{"content-type":"application/json"},body:JSON.stringify({provider:b.dataset.provider,callbackURL})});const d=await r.json();if(!r.ok)throw Error(d.message||d.error||"Sign-in failed");if(d.url)location.href=d.url;else throw Error("No redirect URL returned")}catch(e){s.textContent=e.message;b.disabled=false}});
</script>`, { headers: { "content-type":"text/html; charset=utf-8", "cache-control":"no-store", "x-content-type-options":"nosniff" }});
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") return Response.json({ok:true});
    if (url.pathname === "/" && request.method === "GET") return loginPage(env);
    if (url.pathname.startsWith("/api/auth/")) {
      if (request.method === "OPTIONS") {
        const origin=request.headers.get("Origin");
        if(!trusted(origin,env)) return new Response(null,{status:403});
        return new Response(null,{status:204,headers:{
          "Access-Control-Allow-Origin":origin!,"Access-Control-Allow-Credentials":"true",
          "Access-Control-Allow-Headers":"Content-Type","Access-Control-Allow-Methods":"GET, POST, OPTIONS",
          "Access-Control-Max-Age":"86400","Vary":"Origin"
        }});
      }
      return cors(await authFor(env).handler(request), request, env);
    }
    return new Response("Not found",{status:404});
  }
} satisfies ExportedHandler<Env>;
