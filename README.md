# Workers SSO

Thin, self-hosted SSO for **Cloudflare Workers + D1**, powered by Better Auth.

It has two deliberately separate layers:

1. **Browser SSO** — sign in once at `auth.example.com`; a secure HttpOnly parent-domain session cookie gives trusted `*.example.com` sites the same browser session.
2. **Portable API auth** — authenticated browsers can obtain a short-lived, asymmetrically signed JWT. APIs verify it locally through public JWKS, with no shared secret and no Better Auth dependency.

## Features

- Google, Microsoft and X (Twitter) OAuth
- Cloudflare Workers + D1
- parent-domain browser SSO
- Better Auth JWT/JWKS plugin
- public JWKS at `/api/auth/.well-known/jwks.json`
- short-lived JWTs from `/api/auth/token`
- no per-subdomain OAuth client registration
- no authentication secret shared with resource servers
- credentialed CORS only for the configured parent domain

> Parent-domain cookies deliberately treat every subdomain as one browser trust boundary. Do not use this mode if arbitrary users or third parties can control a subdomain.

## Deploy

```bash
npm install
npx wrangler d1 create workers-sso
```

Put the returned D1 ID into `wrangler.jsonc`, then set your domain:

```json
"ROOT_DOMAIN": "example.com",
"BETTER_AUTH_URL": "https://auth.example.com"
```

Generate and store the Better Auth secret:

```bash
openssl rand -base64 32
npx wrangler secret put BETTER_AUTH_SECRET
```

Add whichever providers you want:

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put MICROSOFT_CLIENT_ID
npx wrangler secret put MICROSOFT_CLIENT_SECRET
npx wrangler secret put TWITTER_CLIENT_ID
npx wrangler secret put TWITTER_CLIENT_SECRET
```

Generate Better Auth's schema (including the JWT plugin's `jwks` table), apply it to D1, then deploy:

```bash
npx @better-auth/cli generate
npx wrangler d1 migrations apply workers-sso --remote
npm run deploy
```

Attach `auth.example.com` as the Worker's custom domain.

## OAuth callback URLs

For `https://auth.example.com`:

| Provider | Callback |
|---|---|
| Google | `https://auth.example.com/api/auth/callback/google` |
| Microsoft | `https://auth.example.com/api/auth/callback/microsoft` |
| X / Twitter | `https://auth.example.com/api/auth/callback/twitter` |

Configure these once. Individual subdomains do not need their own upstream OAuth applications.

## Browser SSO

Send a user to:

```text
https://auth.example.com/?callbackURL=https://game.example.com/
```

After OAuth completes, the browser has a secure HttpOnly session cookie scoped to the parent domain. The login page accepts callback URLs only on that HTTPS parent domain.

For browser UI that only needs the current session:

```js
const session = await fetch("https://auth.example.com/api/auth/get-session", {
  credentials: "include"
}).then(r => r.json());
```

Treat the session cookie as opaque. Do not copy `BETTER_AUTH_SECRET` into another Worker and do not implement your own cookie parser.

## Standard resource-server boundary: Bearer JWT + JWKS

When a frontend needs to call an independently deployed API, exchange its existing authenticated session for a short-lived JWT:

```js
const { token } = await fetch("https://auth.example.com/api/auth/token", {
  credentials: "include"
}).then(r => r.json());

await fetch("https://api.example.com/private", {
  headers: { Authorization: `Bearer ${token}` }
});
```

The API does **not** need D1, OAuth credentials or `BETTER_AUTH_SECRET`. It verifies the JWT using the public JWKS:

```text
https://auth.example.com/api/auth/.well-known/jwks.json
```

The token defaults to a 15-minute lifetime. Its issuer and audience are both `BETTER_AUTH_URL`.

A resource server should validate at least:

- signature against JWKS
- `iss === AUTH_ISSUER`
- `aud === AUTH_AUDIENCE`
- expiration / not-before claims
- application-specific authorization after authentication

For this repository's default configuration:

```text
AUTH_ISSUER=https://auth.example.com
AUTH_AUDIENCE=https://auth.example.com
JWKS_URL=https://auth.example.com/api/auth/.well-known/jwks.json
```

For example, a Worker can use any standards-based JOSE/JWT library. It does not need a workers-sso-specific SDK.

## Why two mechanisms?

The parent-domain cookie gives first-party subdomains seamless browser SSO. JWT/JWKS gives independently developed resource servers a clean, portable authentication boundary.

The important rule is:

```text
Cookie = browser SSO implementation detail
Bearer JWT + JWKS = API/resource-server contract
```

That means an open-source API can make authentication pluggable instead of importing Better Auth internals. A deployment can use workers-sso or another compatible JWT issuer.

## Current interoperability scope

The JWT/JWKS interface is standards-based JOSE/JWT verification, but this repository does **not** currently claim to be a complete OAuth 2.1 or OpenID Connect Authorization Server.

If a consumer specifically requires OIDC discovery, OAuth authorization-code flows, per-resource `aud`, token introspection/revocation, scopes, or RFC 9068 access-token semantics, use a full OAuth/OIDC provider configuration rather than assuming those features from the JWT endpoint.

## Local development

Copy `.dev.vars.example` to `.dev.vars`, fill the desired credentials, and run:

```bash
npm run dev
```

## Security model

- session cookies are `Secure` and `HttpOnly`
- browser callbacks are restricted to the configured parent domain
- credentialed CORS is restricted to HTTPS origins under `ROOT_DOMAIN`
- OAuth credentials and Better Auth secret live only in the auth Worker
- JWT signing uses Better Auth's asymmetric JWKS keys
- resource servers receive only public verification keys
- signing keys rotate every 30 days with a 30-day grace period

## License

MIT
