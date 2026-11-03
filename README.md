# Workers SSO

Thin, self-hosted SSO for **Cloudflare Workers + D1**, powered by Better Auth.

It provides two layers:

1. **Browser SSO** — sign in once at `auth.example.com`; a secure HttpOnly parent-domain cookie gives trusted `*.example.com` sites the same session.
2. **Portable API auth** — authenticated browsers can obtain a short-lived, asymmetrically signed JWT. Resource servers verify it locally through OIDC discovery + JWKS.

## Frontend structure

The UI uses Preact with hooks, TypeScript and Vite. `src/client/main.tsx` mounts
the app; `pages/` contains login, consent, account and error pages, `components/`
contains shared UI, and `lib/` owns authentication requests and presentation data.
Translations and CSS remain independent. No router or global state library is needed.

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
AUTH_ISSUER=https://auth.example.com
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
https://auth.example.com

OIDC discovery:
https://auth.example.com/.well-known/openid-configuration

OAuth authorization-server metadata:
https://auth.example.com/.well-known/oauth-authorization-server

JWKS:
discover from the metadata rather than hard-coding this URL
```

The issuer is the site origin, without `/api/auth` or a trailing slash. OIDC clients can therefore configure `OIDC_ISSUER_URL=https://auth.example.com`. The OAuth Provider plugin exposes its authorization, token, UserInfo, introspection and revocation endpoints under `/api/auth`; clients discover those URLs from the metadata.

Changing from the previous `/api/auth` issuer changes token identity: update consuming services' issuer settings together. Existing tokens with the old issuer will no longer pass verification against the new issuer.

## OIDC clients with CIMD

CIMD (Client ID Metadata Document, draft-02) is enabled through Better Auth's
`@better-auth/cimd` plugin. A client can use the HTTPS URL of its metadata document
as its `client_id`, without manual registration or a shared client secret.
Discovery advertises `client_id_metadata_document_supported: true`.

For Playweft, configure only:

```text
OIDC_ISSUER_URL=https://auth.example.com
```

Playweft publishes its metadata at
`https://play.example.com/api/auth/oidc/client.json` and uses Authorization Code
with PKCE (S256). The document must identify its own URL and list its permitted
callback URLs. Login and consent use the OAuth Provider client plugin to preserve
the provider's signed authorization query across the social login flow.

CIMD clients remain subject to login and user consent; hosting a metadata document
does not make an application trusted. Dynamic Client Registration remains disabled.
Explicitly registered clients continue to work. The plugin persists discovered client
metadata and its discovery provenance in the existing D1 `oauthClient` table;
login sessions and user consent also use the existing database. No additional
D1 tables or storage bindings are required.

The Worker fetches metadata and discovery-owned JWKS over HTTPS without following
redirects. Keep `global_fetch_strictly_public` enabled: Cloudflare's network boundary
restricts global fetch to public Internet destinations, including same-zone requests.
Do not replace this transport with a private-network or service binding fetch.
The plugin validates document URLs, origin-bound fields, response types and sizes,
and applies timeouts, bounded caching and fetch budgets. These budgets are per Worker
isolate rather than a deployment-wide rate limit.

Run `npm run typecheck` and `npm test` to validate the integration. Tests use an
isolated local Worker and D1 database, with test-only metadata responses and sessions;
they do not contact a real social login provider.

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
