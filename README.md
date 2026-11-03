# Workers SSO

A self-hosted OpenID Connect provider for **Cloudflare Workers + D1**, powered by
Better Auth. Applications sign users in through Authorization Code with PKCE;
the authentication site keeps its own host-only session cookie.

## Features

- Google, Microsoft and X (Twitter) sign-in
- OAuth 2.1 / OIDC authorization, token and UserInfo endpoints
- OIDC Discovery and asymmetric signing keys exposed through JWKS
- Client ID Metadata Document (CIMD, draft-02) support
- Explicitly registered public and confidential clients
- Login, consent and account pages, with English and Simplified Chinese
- Account linking and management of granted application consent
- Preact, TypeScript and Vite with the Cloudflare Vite plugin

## Deploy

```bash
npm install
npx wrangler d1 create workers-sso
```

Put the returned D1 ID into `wrangler.jsonc`.

`BETTER_AUTH_URL` is optional. By default the Worker derives its origin and issuer
from the request URL. Set it to a canonical origin, such as
`https://auth.example.com`, to pin the authentication domain. Attach that domain
as the Worker's custom domain.

Configure runtime variables and secrets in **Settings → Variables and Secrets**.
Do not put dashboard-managed values in `wrangler.jsonc` `vars`: Wrangler overwrites
values for keys present in that file, even with `--keep-vars`.

Generate and store the Better Auth secret:

```bash
openssl rand -base64 32
npx wrangler secret put BETTER_AUTH_SECRET
```

Configure whichever upstream providers you need:

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET

npx wrangler secret put MICROSOFT_CLIENT_ID
npx wrangler secret put MICROSOFT_CLIENT_SECRET

npx wrangler secret put TWITTER_CLIENT_ID
npx wrangler secret put TWITTER_CLIENT_SECRET
```

For a new installation, generate the Better Auth schema, apply it to D1, then deploy:

```bash
npm run auth:generate
npx wrangler d1 migrations apply workers-sso --remote
npm run deploy
```

The checked-in initial migration includes the core, JWT and OAuth Provider tables.
Existing installations should add new migrations for future schema changes instead
of regenerating an already-applied migration.

## Upstream sign-in providers

For `https://auth.example.com`, register these callback URLs with the enabled providers:

| Provider | Callback |
|---|---|
| Google | `https://auth.example.com/api/auth/callback/google` |
| Microsoft | `https://auth.example.com/api/auth/callback/microsoft` |
| X / Twitter | `https://auth.example.com/api/auth/callback/twitter` |

Applications using this OIDC provider do not need their own Google/Microsoft/X credentials.

## Connect an application

Use an OIDC client library and configure the issuer:

```text
https://auth.example.com
```

Discovery is available at:

```text
https://auth.example.com/.well-known/openid-configuration
```

OAuth authorization-server metadata is also available at
`https://auth.example.com/.well-known/oauth-authorization-server`.
Authorization, token, UserInfo and other endpoint URLs are advertised by metadata;
clients should discover them rather than hard-code API paths.

An application sends the browser to the authorization endpoint with its client ID,
registered redirect URI, `response_type=code`, requested scopes, state, nonce and
S256 PKCE challenge. After login and consent, the application exchanges the code
using its PKCE verifier and verifies the ID Token's signature, issuer, audience,
nonce and lifetime. The application then establishes its own local session.

The authentication cookie stays on the authentication host. Applications do not
read this cookie or call the authentication site's internal session API.

### CIMD

CIMD lets a client use the HTTPS URL of its metadata document as its `client_id`,
without manual registration or a shared client secret. Discovery advertises
`client_id_metadata_document_supported: true`.

For Playweft, configure only:

```text
OIDC_ISSUER_URL=https://auth.example.com
```

Playweft publishes metadata at `https://play.example.com/api/auth/oidc/client.json`.
The document must identify its own URL and list permitted callback URLs. CIMD
clients remain subject to login and consent; hosting metadata does not make an
application trusted. Dynamic Client Registration remains disabled.

The Better Auth CIMD plugin persists discovered clients and their provenance in
the existing D1 `oauthClient` table. Sessions and consent also use the existing database.

Metadata and discovery-owned JWKS are fetched over HTTPS without following redirects.
Keep `global_fetch_strictly_public` enabled so Cloudflare restricts global fetch
to public Internet destinations. Do not replace this transport with a private-network
or service binding fetch. The plugin enforces URL validation, size limits, timeouts,
bounded caching and fetch budgets. Budgets are per Worker isolate, not deployment-wide.

### Registered clients

Clients can also use an explicitly registered client ID with PKCE. Public clients
use token authentication method `none`; confidential clients authenticate using a
supported method such as `client_secret_basic` or `client_secret_post`.

ID Tokens are addressed to the application's client ID. Access-token audiences
follow the configured OAuth resources; resource servers must verify the expected
audience instead of assuming it equals the issuer. Do not use ID Tokens as API access tokens.

## Frontend structure

The UI uses Preact with hooks, TypeScript and Vite:

- `src/client/main.tsx`: app entry point
- `src/client/pages/`: login, consent, account and error pages
- `src/client/components/`: shared UI
- `src/client/lib/`: authentication requests and presentation data
- `src/client/i18n.ts`: translations
- `src/client/styles.css`: styles

The UI's session, account-linking, application-info and consent-management APIs
are internal to the authentication site. The official OAuth Provider client plugin
preserves the signed authorization query across social login and consent.

## Local development

Copy `.dev.vars.example` to `.dev.vars`, fill the desired credentials, then run:

```bash
npm run dev
```

The Cloudflare Vite plugin serves the Worker, local D1 and frontend on one origin.
Validate changes with:

```bash
npm run typecheck
npm test
```

Tests use an isolated Worker and D1 database with test metadata and sessions;
they do not contact a real upstream sign-in provider.

For Workers Builds, use `npm run build` as the build command and
`npx wrangler deploy --keep-vars` as the deploy command.

## Security and upgrades

- Production session cookies are host-only, `Secure`, `HttpOnly` and `SameSite=Lax`.
- Only the authentication origin is trusted for internal browser API mutations.
- Upstream credentials and the Better Auth secret stay in the authentication Worker.
- OIDC tokens use asymmetric signing keys; relying applications use public JWKS.
- Signing keys rotate every 30 days with a 30-day grace period.

The previous parent-domain-cookie integration has been removed. `ROOT_DOMAIN`
is no longer read, credentialed cross-subdomain CORS is removed, the convenience
`/api/auth/token` endpoint returns 404, and the old `?callbackURL=` launch pattern
is no longer used. Applications must use the standard OIDC authorization flow.

Session cookies now use the `workers-sso` prefix to avoid reusing old shared-domain
cookies. Users with an existing authentication-site session must sign in again once.
This does not remotely terminate sessions already established by relying applications.
No D1 schema migration is required for this cleanup.

## License

MIT
