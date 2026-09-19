# Workers SSO

Thin, self-hosted SSO for **Cloudflare Workers + D1**, powered by Better Auth.

Sign in once at `auth.example.com`; the secure HttpOnly session cookie is scoped to `example.com`, so trusted apps on `*.example.com` receive the same session automatically.

## Features

- Google, Microsoft and X (Twitter) OAuth
- Cloudflare Workers + D1
- parent-domain session cookie
- no per-subdomain client ID, secret or registration
- credentialed CORS only for the configured parent domain
- tiny built-in login page

> This intentionally treats every subdomain as part of one trust boundary. Do not use it if arbitrary users or third parties can control a subdomain.

## Deploy

```bash
npm install
npx wrangler d1 create workers-sso
```

Put the returned D1 ID into `wrangler.jsonc`, then change:

```json
"ROOT_DOMAIN": "example.com",
"BETTER_AUTH_URL": "https://auth.example.com"
```

Generate a secret and store it:

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

Create Better Auth's D1 schema using the Better Auth CLI, then deploy:

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

These are configured once; individual subdomains do not need OAuth apps.

## Sign in

Send a user to:

```text
https://auth.example.com/?callbackURL=https://game.example.com/
```

The login page only accepts HTTPS callback URLs on the configured parent domain.

## Read the session from any subdomain

Browser:

```js
const session = await fetch("https://auth.example.com/api/auth/get-session", {
  credentials: "include"
}).then(r => r.json());
```

Because the session cookie is HttpOnly, application JavaScript cannot read the token itself. It only asks the central auth endpoint for the current session.

A server-side Worker can forward the incoming `Cookie` header to the same endpoint.

## Local development

Copy `.dev.vars.example` to `.dev.vars`, fill the desired credentials, and run:

```bash
npm run dev
```

## Security model

This project is deliberately simpler than general-purpose OIDC. Its simplicity comes from one assumption: all participating sites are trusted subdomains of one parent domain.

- session cookies are `Secure` and `HttpOnly`
- cross-origin session responses are only allowed to HTTPS origins below `ROOT_DOMAIN`
- login callback URLs are restricted to the same parent domain
- OAuth credentials live only in the central Worker

If you need unrelated root domains or untrusted subdomains, use normal OIDC/OAuth client registration instead.

## License

MIT
