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
      <button type="button" class="text-button" onClick={() => void run(switchAccount)}>{t("switchAccount")}</button>
    </div>
    <p class="section-intro">{t("permissions")}</p>
    <Permissions scopes={requestedScopes(location.search)} />
    <div class="consent-actions">
      <button type="button" class="primary full" onClick={() => void run(() => follow("/oauth2/consent", { accept: true }))}>{t("allow")}</button>
      <button type="button" class="text-button full" onClick={() => void run(() => follow("/oauth2/consent", { accept: false }))}>{t("cancel")}</button>
    </div>
    {domain && <p class="return-note">{t("returnTo")} {domain}</p>}
  </>;
}
