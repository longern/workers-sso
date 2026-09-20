import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import { fileURLToPath } from "node:url";
import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins";
import { oauthProvider } from "@better-auth/oauth-provider";
import { getMigrations } from "better-auth/db/migration";

const issuer = "https://auth.example.com/api/auth";
const db = new Database(":memory:");

const auth = betterAuth({
  database: db,
  secret: "cli-placeholder-secret-at-least-32-chars!!",
  baseURL: "https://auth.example.com",
  socialProviders: {
    google: { clientId: "cli", clientSecret: "cli" },
    microsoft: { clientId: "cli", clientSecret: "cli", tenantId: "common" },
    twitter: { clientId: "cli", clientSecret: "cli" },
  },
  plugins: [
    jwt({
      disableSettingJwtHeader: true,
      jwks: {
        jwksPath: "/.well-known/jwks.json",
        rotationInterval: 60 * 60 * 24 * 30,
        gracePeriod: 60 * 60 * 24 * 30,
      },
      jwt: {
        issuer,
        audience: issuer,
        expirationTime: "15m",
      },
    }),
    oauthProvider({
      loginPage: "/",
      consentPage: "/consent",
      scopes: ["openid", "profile", "email"],
    }),
  ],
});

const { compileMigrations, toBeCreated, unsafeChanges, schemaProblems } =
  await getMigrations(auth.options, { throwOnUnsafe: false });

const sql = (await compileMigrations()).trim();
const out = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../migrations/0001_better_auth.sql",
);

await mkdir(dirname(out), { recursive: true });
await writeFile(out, sql.endsWith("\n") ? sql : sql + "\n");

console.log("wrote", out);
console.log("tables:", toBeCreated.map((t) => t.table).join(", "));
if (unsafeChanges?.length) console.log("unsafeChanges:", unsafeChanges);
if (schemaProblems?.length) console.log("schemaProblems:", schemaProblems);
