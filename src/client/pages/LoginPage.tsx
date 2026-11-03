import { ActionButton } from "../components/ActionButton";
import { AppIdentity, AccountIdentity } from "../components/Identity";
import { ProviderIcon } from "../components/Icons";
import { useI18n } from "../components/I18nProvider";
import { follow } from "../lib/auth";
import { clientIdentity, type Client } from "../lib/presentation";
import type { Config, RunAction, Session } from "../lib/types";

export function LoginPage({ config, client, session, run, switchAccount }: {
  config: Config; client?: Client; session?: Session; run: RunAction; switchAccount: () => Promise<void>;
}) {
  const { t } = useI18n();
  return <>
    {client && <AppIdentity client={client} className="login-app" />}
    <h1>{t("signIn")}</h1>
    <p class="subtitle">{client ? `${t("continueTo")} ${clientIdentity(client).name}` : t("signInHint")}</p>
    {session && client ? (
      <div class="continue-account">
        <AccountIdentity user={session.user} />
        <ActionButton className="primary full" run={run} onAction={() => follow("/oauth2/continue", {})}
          label={t("continueAs", { name: session.user.name || session.user.email || session.user.id })} />
        <ActionButton className="text-button" run={run} onAction={switchAccount} label={t("switchAccount")} />
      </div>
    ) : (
      <div class="provider-buttons">{config.providers.map(provider => (
        <ActionButton key={provider.id} className="provider-button" run={run}
          onAction={() => follow("/sign-in/social", { provider: provider.id, callbackURL: location.origin + "/" })}
          label={t("with", { provider: provider.label })}>
          <ProviderIcon id={provider.id} /><span>{t("with", { provider: provider.label })}</span>
        </ActionButton>
      ))}</div>
    )}
    {!config.providers.length && !session && <p class="muted">{t("noProviders")}</p>}
    {client && <a class="text-button cancel" href="/">{t("cancel")}</a>}
  </>;
}
