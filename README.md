# Workers SSO

Thin, self-hosted SSO for **Cloudflare Workers + D1**, powered by Better Auth.

It provides two layers:

1. **Browser SSO** — sign in once at `auth.example.com`; a secure HttpOnly parent-domain cookie gives trusted `*.example.com` sites the same session.
2. **Portable API auth** — authenticated browsers can obtain a short-lived, asymmetrically signed JWT. Resource servers verify it locally through OIDC discovery + JWKS.

## Features

- Google, Microsoft and X (Twitter) OAuth
- Cloudflare Workers + D1
- Vite UI with the Cloudflare Vite plugin
- parent-domain browser SSO
- Better Auth JWT/JWKS
- Better Auth OAuth 2.1 / OIDC provider metadata
- OIDC discovery at `{AUTH_ISSUER}/.well-known/openid-configuration`
- public asymmetric JWKS
- short-lived JWTs
- no authentication secret shared with resource servers
- no per-subdomain configuration required for the browser SSO model

> Parent-domain cookies deliberately treat every subdomain as one browser trust boundary. Do not use this mode if arbitrary users or third parties can control a subdomain.

## Deploy

```bash
npm install
npx wrangler d1 create workers-sso
```

Put the returned D1 ID into `wrangler.jsonc`.

`BETTER_AUTH_URL` and `ROOT_DOMAIN` are optional. By default the Worker uses the incoming
request: origin becomes the Better Auth base URL, and `auth.example.com` yields cookie/CORS
parent domain `example.com`. `localhost` and `*.workers.dev` stay host-only (no parent cookie).

Set them in **Settings → Variables and Secrets** only if you need to pin a canonical host or
a parent domain that is not the request host minus one label. Do **not** put them in
`wrangler.jsonc` `vars` — Wrangler overwrites dashboard values for keys present in that file,
even with `--keep-vars`.

For local development, copy `.dev.vars.example` to `.dev.vars`.

Generate and store the Better Auth secret:

```bash
openssl rand -base64 32
npx wrangler secret put BETTER_AUTH_SECRET
```

Add whichever upstream providers you want:

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET

npx wrangler secret put MICROSOFT_CLIENT_ID
npx wrangler secret put MICROSOFT_CLIENT_SECRET

npx wrangler secret put TWITTER_CLIENT_ID
npx wrangler secret put TWITTER_CLIENT_SECRET
```

Generate the Better Auth schema, including JWT and OAuth-provider tables, apply it to D1, then deploy:

```bash
npm run auth:generate
npx wrangler d1 migrations apply workers-sso --remote
npm run deploy
```

Attach `auth.example.com` as the Worker's custom domain.

## Upstream OAuth callback URLs

For `https://auth.example.com`:

| Provider | Callback |
|---|---|
| Google | `https://auth.example.com/api/auth/callback/google` |
| Microsoft | `https://auth.example.com/api/auth/callback/microsoft` |
| X / Twitter | `https://auth.example.com/api/auth/callback/twitter` |

Configure these once. Individual subdomains do not need their own Google/Microsoft/X applications.

## Browser SSO

Send a user to:

```text
https://auth.example.com/?callbackURL=https://game.example.com/
```

After OAuth completes, Better Auth creates a secure HttpOnly session cookie scoped to the parent domain.

For browser UI that only needs the current session:

```js
const session = await fetch("https://auth.example.com/api/auth/get-session", {
  credentials: "include"
}).then(r => r.json());
```

Treat the browser cookie as opaque. Do not share `BETTER_AUTH_SECRET` with another Worker and do not parse Better Auth's session cookie yourself.

## Resource Workers: one required setting

For a resource Worker deployed with workers-sso, the only required authentication setting is:

```text
AUTH_ISSUER=https://auth.example.com/api/auth
```

The Worker can derive everything else from standard OIDC discovery:

```text
AUTH_ISSUER
   ↓
{AUTH_ISSUER}/.well-known/openid-configuration
   ↓
jwks_uri
   ↓
public signing keys
```

For workers-sso's convenience JWTs, the default expected audience is also the issuer:

```text
aud = AUTH_ISSUER
```

So a consuming Worker can make `AUTH_AUDIENCE` optional and default it to `AUTH_ISSUER`.

This means a normal workers-sso deployment needs only one variable, while deployments using another OIDC provider can override the audience when that provider uses a different resource identifier.

## Get a short-lived JWT

A browser with an existing workers-sso session can obtain a 15-minute JWT:

```js
const { token } = await fetch("https://auth.example.com/api/auth/token", {
  credentials: "include"
}).then(r => r.json());
```

Then call an API normally:

```js
await fetch("https://api.example.com/private", {
  headers: {
    Authorization: `Bearer \${token}`
  }
});
```

The `/token` endpoint is a first-party session-to-JWT convenience endpoint. OAuth/OIDC clients should use the OAuth Provider endpoints advertised by discovery instead.

## Generic verification

A resource Worker should:

1. Read `AUTH_ISSUER`.
2. Fetch and cache `{AUTH_ISSUER}/.well-known/openid-configuration`.
3. Read `jwks_uri` from the metadata.
4. Verify the JWT signature against that JWKS.
5. Verify `iss === AUTH_ISSUER`.
6. Verify `aud === AUTH_AUDIENCE`, with `AUTH_AUDIENCE` defaulting to `AUTH_ISSUER`.
7. Verify `exp` / `nbf`.
8. Perform application-specific authorization separately.

That contract does not require Better Auth in the resource Worker. Any standards-based JOSE/JWT library can implement it.

A generic open-source Worker can therefore expose only:

```text
AUTH_ISSUER=
AUTH_AUDIENCE=   # optional
```

and let the deployer choose workers-sso, Keycloak, Auth0, or another compatible OIDC issuer.

## Discovery endpoints

With the default deployment:

```text
Issuer:
https://auth.example.com/api/auth

OIDC discovery:
https://auth.example.com/api/auth/.well-known/openid-configuration

OAuth authorization-server metadata:
https://auth.example.com/api/auth/.well-known/oauth-authorization-server

JWKS:
discover from the metadata rather than hard-coding this URL
```

The OAuth Provider plugin also exposes its authorization, token, UserInfo, introspection and revocation endpoints through the Better Auth handler.

## Audience model

workers-sso intentionally defaults convenience JWTs to one shared audience equal to the issuer. This keeps trusted first-party resource Workers at **one required configuration value**.

If you need strict token isolation between individual APIs — for example, a token for `game.example.com` must never be accepted by `admin.example.com` — use explicit OAuth protected resources / RFC 8707 resource indicators and configure distinct audiences. Better Auth's OAuth Provider supports that model, but resources are explicit rather than wildcard subdomains.

## Why two mechanisms?

```text
Parent-domain Cookie
    = seamless first-party browser SSO

Bearer JWT + OIDC discovery + JWKS
    = portable resource-server contract
```

The browser cookie remains an implementation detail of workers-sso. Other open-source Workers only need to understand standard bearer JWT verification.

## Local development

Copy `.dev.vars.example` to `.dev.vars`, fill the desired credentials, and run:

```bash
npm run dev
```

The UI is a Vite app (`index.html` + `src/client`). `npm run dev` uses the Cloudflare Vite plugin, so the Worker, D1, and frontend share one origin. Production deploys run `vite build` first; in Workers Builds set:

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy --keep-vars`

## Security model

- session cookies are `Secure` and `HttpOnly`
- browser callbacks are restricted to the request parent domain
- credentialed CORS is restricted to HTTPS origins under that parent domain
- upstream OAuth credentials and Better Auth secret live only in the auth Worker
- JWT signing uses asymmetric JWKS keys
- resource servers receive only public verification keys
- signing keys rotate every 30 days with a 30-day grace period
- resource Workers verify issuer, audience, lifetime and signature

## License

MIT
