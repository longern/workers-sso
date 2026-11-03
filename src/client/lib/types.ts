import type { Client } from "./presentation";

export type Provider = { id: string; label: string };
export type Config = { providers: Provider[] };
export type User = {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
};
export type Session = { user: User };
export type Account = { providerId?: string };
export type Grant = { id: string; clientId: string; scopes: string[] };
export type AppGrant = { client: Client; grants: Grant[] };
export type PageData =
  | { page: "login"; config: Config; client?: Client; session?: Session }
  | { page: "consent"; client: Client; session: Session }
  | { page: "account"; config: Config; session: Session; accounts: Account[] | null; grants: AppGrant[] | null };
export type RunAction = (task: () => Promise<void>) => Promise<void>;
