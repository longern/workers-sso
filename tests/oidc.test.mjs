import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { createHmac, createHash } from 'node:crypto';
import { Miniflare, convertV4MiniflareOptions, Response } from 'miniflare';

const issuer = 'https://auth.example.com';
const clientId = 'https://play.example.net/api/auth/oidc/client.json';
const redirectUri = 'https://play.example.net/api/auth/oidc/callback';
const secret = 'test-only-secret-with-at-least-32-characters';
const verifier = 'test-pkce-verifier-with-at-least-forty-three-characters';
let mf, db;
let metadataRequests = 0;
const metadata = {
  client_id: clientId, client_name: 'Playweft',
  client_uri: 'https://play.example.net/', redirect_uris: [redirectUri],
  grant_types: ['authorization_code'], response_types: ['code'],
  token_endpoint_auth_method: 'none', scope: 'openid profile',
};
function authorize(extra = {}) {
  const query = new URLSearchParams({
    client_id: clientId, redirect_uri: redirectUri, response_type: 'code',
    scope: 'openid profile', state: 'test-state', nonce: 'test-nonce',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256', ...extra,
  });
  return issuer + '/api/auth/oauth2/authorize?' + query;
}
function sessionCookie() {
  const token = 'test-session-token';
  const signed = token + '.' + createHmac('sha256', secret).update(token).digest('base64');
  return '__Secure-better-auth.session_token=' + encodeURIComponent(signed);
}
async function request(url, init = {}) {
  return mf.dispatchFetch(url, { redirect: 'manual', ...init, headers: { accept: 'text/html', ...init.headers } });
}
async function redirectTarget(response) {
  if (response.status === 302) return new URL(response.headers.get('location'), issuer);
  assert.equal(response.status, 200, await response.clone().text());
  const data = await response.json();
  assert.equal(data.redirect, true);
  return new URL(data.url, issuer);
}
async function post(path, body, cookie = sessionCookie()) {
  return request(issuer + path, {
    method: 'POST', headers: {
      cookie, origin: issuer, 'content-type': 'application/json', accept: 'application/json',
    }, body: JSON.stringify(body),
  });
}
before(async () => {
  mf = new Miniflare(convertV4MiniflareOptions({
    modules: ['index.js', ...(await readdir('dist/workers_sso/assets')).filter(p => p.endsWith('.js')).map(p => 'assets/' + p)]
      .map(p => ({ type: 'ESModule', path: 'dist/workers_sso/' + p })),
    modulesRoot: 'dist/workers_sso',
    compatibilityDate: '2026-09-19',
    compatibilityFlags: ['nodejs_compat', 'global_fetch_strictly_public'],
    bindings: { BETTER_AUTH_URL: issuer, BETTER_AUTH_SECRET: secret,
      GOOGLE_CLIENT_ID: 'test-google', GOOGLE_CLIENT_SECRET: 'test-google-secret' },
    d1Databases: ['DB'],
    serviceBindings: { ASSETS: () => new Response('page') },
    outboundService: (req) => {
      if (req.url === clientId) {
        metadataRequests++;
        return Response.json(metadata, { headers: { 'cache-control': 'public, max-age=300' } });
      }
      if (req.url === 'https://invalid.example.net/client.json') {
        return Response.json({ ...metadata, client_id: 'https://different.example.net/client.json' });
      }
      if (req.url === 'https://redirect.example.net/client.json') {
        return new Response(null, { status: 302, headers: { location: clientId } });
      }
      throw new Error('Unexpected outbound request: ' + req.url);
    },
  }));
  db = await mf.getD1Database('DB');
  const sql = await readFile('migrations/0001_better_auth.sql', 'utf8');
  for (const statement of sql.replace(/^--.*$/gm, '').split(';').filter(s => s.trim())) {
    await db.prepare(statement).run();
  }
  const now = Date.now();
  await db.prepare('INSERT INTO user (id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,?,?,?)')
    .bind('test-user', 'Test Player', 'test@example.com', 1, now, now).run();
  await db.prepare('INSERT INTO session (id,expiresAt,token,createdAt,updatedAt,userId) VALUES (?,?,?,?,?,?)')
    .bind('test-session', now + 3600000, 'test-session-token', now, now, 'test-user').run();
});
after(async () => { await mf?.dispose(); });

test('root Discovery advertises CIMD and the existing API endpoints', async () => {
  for (const path of ['/.well-known/openid-configuration', '/.well-known/oauth-authorization-server']) {
    const response = await request(issuer + path);
    assert.equal(response.status, 200);
    const config = await response.json();
    assert.equal(config.issuer, issuer);
    assert.equal(config.client_id_metadata_document_supported, true);
    assert.ok(config.token_endpoint_auth_methods_supported.includes('none'));
    assert.equal(config.authorization_endpoint, issuer + '/api/auth/oauth2/authorize');
  }
});

test('CIMD client reaches login without pre-registration and social login preserves the signed query', async () => {
  const response = await request(authorize());
  const login = await redirectTarget(response);
  assert.equal(login.pathname, '/');
  assert.ok(login.searchParams.has('sig'));
  const signin = await post('/api/auth/sign-in/social', {
    provider: 'google', callbackURL: issuer + '/', oauth_query: login.search.slice(1),
  }, '');
  assert.equal(signin.status, 200);
  assert.equal(new URL((await signin.json()).url).hostname, 'accounts.google.com');
  const client = await db.prepare('SELECT clientDiscoveryId, clientSecret FROM oauthClient WHERE clientId = ?').bind(clientId).first();
  assert.equal(client.clientDiscoveryId, 'cimd');
  assert.equal(client.clientSecret, null);
});

test('consent issues a code, PKCE exchanges it, and ID token signature/claims verify', async () => {
  const response = await request(authorize(), { headers: { cookie: sessionCookie() } });
  const consent = await redirectTarget(response);
  assert.equal(consent.pathname, '/consent');
  const result = await post('/api/auth/oauth2/consent', { accept: true, oauth_query: consent.search.slice(1) });
  assert.equal(result.status, 200);
  const callback = new URL((await result.json()).url);
  assert.equal(callback.origin + callback.pathname, redirectUri);
  assert.equal(callback.searchParams.get('state'), 'test-state');
  assert.equal(callback.searchParams.get('iss'), issuer);
  const token = await request(issuer + '/api/auth/oauth2/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId,
      redirect_uri: redirectUri, code: callback.searchParams.get('code'), code_verifier: verifier }),
  });
  assert.equal(token.status, 200, await token.clone().text());
  const tokens = await token.json();
  const { jwtVerify, createLocalJWKSet } = await import('jose');
  const jwks = await (await request(issuer + '/api/auth/.well-known/jwks.json')).json();
  const { payload } = await jwtVerify(tokens.id_token, createLocalJWKSet(jwks), { issuer, audience: clientId });
  assert.equal(payload.nonce, 'test-nonce');
  const info = await request(issuer + '/api/auth/oauth2/userinfo', { headers: { authorization: 'Bearer ' + tokens.access_token } });
  assert.equal(info.status, 200);
  assert.equal((await info.json()).sub, payload.sub);
  assert.equal(metadataRequests, 1, 'metadata is reused across Worker requests');
});

test('CIMD rejects mismatching documents, redirects, unsafe URLs and unregistered redirect URIs', async () => {
  for (const client_id of ['https://invalid.example.net/client.json', 'https://redirect.example.net/client.json',
    'http://unsafe.example.net/client.json', 'https://127.0.0.1/client.json']) {
    const response = await request(authorize({ client_id }));
    const body = await response.text();
    const data = JSON.parse(body);
    if (response.status === 400) {
      assert.equal(data.error, 'invalid_client');
    } else {
      assert.equal(response.status, 200);
      const errorPage = new URL(data.url);
      assert.equal(errorPage.origin, issuer);
      assert.equal(errorPage.pathname, '/api/auth/error');
      assert.equal(errorPage.searchParams.get('error'), 'invalid_client');
    }
    assert.ok(!body.includes('test-google-secret'));
  }
  const response = await request(authorize({ redirect_uri: 'https://attacker.example/callback' }));
  const data = await response.json();
  const errorPage = new URL(data.url);
  assert.equal(errorPage.origin, issuer);
  assert.equal(errorPage.searchParams.get('error'), 'invalid_redirect');
});

test('denied consent returns access_denied to the registered callback', async () => {
  const response = await request(authorize({ prompt: 'consent' }), { headers: { cookie: sessionCookie() } });
  const query = (await redirectTarget(response)).search.slice(1);
  const denied = await post('/api/auth/oauth2/consent', { accept: false, oauth_query: query });
  assert.equal(denied.status, 200, await denied.clone().text());
  const callback = new URL((await denied.json()).url);
  assert.equal(callback.searchParams.get('error'), 'access_denied');
  assert.equal(callback.searchParams.get('state'), 'test-state');
});


test('PKCE mismatch and tampered consent query are rejected', async () => {
  const consentResponse = await request(authorize({ prompt: 'consent' }), { headers: { cookie: sessionCookie() } });
  const consent = await redirectTarget(consentResponse);
  consent.searchParams.set('scope', 'openid profile email');
  const tampered = await post('/api/auth/oauth2/consent', { accept: true, oauth_query: consent.search.slice(1) });
  assert.equal(tampered.status, 400);

  const codeResponse = await request(authorize(), { headers: { cookie: sessionCookie() } });
  const callback = await redirectTarget(codeResponse);
  assert.equal(callback.origin + callback.pathname, redirectUri);
  assert.ok(callback.searchParams.get('code'));
  const token = await request(issuer + '/api/auth/oauth2/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId,
      redirect_uri: redirectUri, code: callback.searchParams.get('code'), code_verifier: 'wrong-verifier' }),
  });
  assert.equal(token.status, 400);
  assert.equal((await token.json()).error, 'invalid_grant');
});

test('signed login pages can read public client metadata and forged queries cannot', async () => {
  const login = await redirectTarget(await request(authorize()));
  const response = await post('/api/auth/oauth2/public-client-prelogin', {
    client_id: clientId, oauth_query: login.search.slice(1),
  }, '');
  assert.equal(response.status, 200, await response.clone().text());
  const client = await response.json();
  assert.equal(client.client_name, 'Playweft');
  assert.equal(client.client_id, clientId);
  assert.equal(client.client_uri, 'https://play.example.net/');
  assert.equal(client.client_secret, undefined);
  login.searchParams.set('scope', 'openid profile email');
  const forged = await post('/api/auth/oauth2/public-client-prelogin', {
    client_id: clientId, oauth_query: login.search.slice(1),
  }, '');
  assert.equal(forged.status, 400);
});

test('account consent management is session scoped', async () => {
  const response = await request(issuer + '/api/auth/oauth2/get-consents', { headers: { cookie: sessionCookie() } });
  assert.equal(response.status, 200);
  const grants = await response.json();
  assert.ok(grants.length > 0);
  const guest = await request(issuer + '/api/auth/oauth2/get-consents');
  assert.equal(guest.status, 401);
  const denied = await post('/api/auth/oauth2/delete-consent', { id: grants[0].id }, '');
  assert.equal(denied.status, 401);
  const revoked = await post('/api/auth/oauth2/delete-consent', { id: grants[0].id });
  assert.equal(revoked.status, 200);
  const remaining = await (await request(issuer + '/api/auth/oauth2/get-consents', { headers: { cookie: sessionCookie() } })).json();
  assert.ok(!remaining.some(grant => grant.id === grants[0].id));
});
