import { ActionButton } from "../components/ActionButton";
import { AppIdentity, AccountIdentity } from "../components/Identity";
import { Permissions } from "../components/Permissions";
import { useI18n } from "../components/I18nProvider";
import { follow } from "../lib/auth";
import { clientIdentity, requestedScopes, type Client } from "../lib/presentation";
import type { RunAction, Session } from "../lib/types";

export function ConsentPage({ client, session, run, switchAccount }: {
  client: Client; session: Session; run: RunAction; switchAccount: () => Promise<void>;
}) {
  const { t } = useI18n();
  const { domain } = clientIdentity(client);
  return <>
    <h1>{t("consentTitle")}</h1>
    <AppIdentity client={client} className="client-card" />
    <div class="consent-account">
      <AccountIdentity user={session.user} />
      <ActionButton className="text-button" run={run} onAction={switchAccount} label={t("switchAccount")} />
    </div>
    <p class="section-intro">{t("permissions")}</p>
    <Permissions scopes={requestedScopes(location.search)} />
    <div class="consent-actions">
      <ActionButton className="primary full" run={run} onAction={() => follow("/oauth2/consent", { accept: true })} label={t("allow")} />
      <ActionButton className="text-button full" run={run} onAction={() => follow("/oauth2/consent", { accept: false })} label={t("cancel")} />
    </div>
    {domain && <p class="return-note">{t("returnTo")} {domain}</p>}
  </>;
}
