import { ActionButton } from "../components/ActionButton";
import { useState } from "preact/hooks";
import { AppIcon, AccountIdentity } from "../components/Identity";
import { ProviderIcon } from "../components/Icons";
import { PermissionSummary } from "../components/Permissions";
import { RevokeDialog } from "../components/RevokeDialog";
import { useI18n } from "../components/I18nProvider";
import { api, follow, revokeGrants } from "../lib/auth";
import { clientIdentity } from "../lib/presentation";
import type { Account, AppGrant, Config, RunAction, Session } from "../lib/types";

export function AccountPage({ config, session, accounts, grants, run, reload, onRevoked }: {
  config: Config; session: Session; accounts: Account[] | null; grants: AppGrant[] | null;
  run: RunAction; reload: () => void; onRevoked: (clientId: string) => void;
}) {
  const { t } = useI18n();
  const [revoke, setRevoke] = useState<AppGrant | null>(null);
  const linked = new Set(accounts?.map(account => account.providerId));
  return <>
    <h1>{t("account")}</h1>
    <AccountIdentity user={session.user} large />
    <section>
      <h2>{t("methods")}</h2>
      {accounts ? (
        <ul class="list">{config.providers.map(provider => (
          <li key={provider.id}>
            <ProviderIcon id={provider.id} /><span class="row-label">{provider.label}</span>
            {linked.has(provider.id) ? <span class="muted">{t("connected")}</span> : (
              <ActionButton className="text-button" run={run} onAction={() => follow("/link-social", { provider: provider.id, callbackURL: location.origin + "/" })} label={t("connect")} />
            )}
          </li>
        ))}</ul>
      ) : <p class="error">{t("methodsFailed")}</p>}
    </section>
    <section>
      <h2>{t("apps")}</h2>
      {grants === null ? (
        <><p class="error">{t("loadFailed")}</p><button type="button" class="text-button" onClick={reload}>{t("retry")}</button></>
      ) : grants.length === 0 ? <p class="empty">{t("noGrants")}</p> : (
        <ul class="list grants">{grants.map(entry => {
          const identity = clientIdentity(entry.client);
          return <li key={entry.client.client_id}>
            <AppIcon client={entry.client} />
            <div class="identity-copy row-label">
              <strong>{identity.name}</strong>
              <p class="domain" dir="ltr">{identity.domain || entry.client.client_id}</p>
              <PermissionSummary scopes={entry.grants.flatMap(grant => grant.scopes)} />
            </div>
            <button type="button" class="text-button" onClick={() => setRevoke(entry)}>{t("revoke")}</button>
          </li>;
        })}</ul>
      )}
    </section>
    <ActionButton className="signout full" run={run} label={t("signOut")} onAction={async () => {
      await api("/sign-out", {});
      location.assign("/");
    }} />
    {revoke && <RevokeDialog client={revoke.client} run={run} onClose={() => setRevoke(null)} onConfirm={async () => {
      await revokeGrants(revoke.grants);
      onRevoked(revoke.client.client_id);
    }} />}
  </>;
}
