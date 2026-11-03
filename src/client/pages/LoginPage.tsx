import { AppIdentity, AccountIdentity } from "../components/Identity";
import { ProviderIcon } from "../components/Icons";
import { useI18n } from "../components/I18nProvider";
import { callbackURL, follow } from "../lib/auth";
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
        <button type="button" class="primary full" onClick={() => void run(() => follow("/oauth2/continue", {}))}>
          {t("continueAs", { name: session.user.name || session.user.email || session.user.id })}
        </button>
        <button type="button" class="text-button" onClick={() => void run(switchAccount)}>{t("switchAccount")}</button>
      </div>
    ) : (
      <div class="provider-buttons">{config.providers.map(provider => (
        <button key={provider.id} type="button" class="provider-button"
          onClick={() => void run(() => follow("/sign-in/social", { provider: provider.id, callbackURL: callbackURL(config) }))}>
          <ProviderIcon id={provider.id} /><span>{t("with", { provider: provider.label })}</span>
        </button>
      ))}</div>
    )}
    {!config.providers.length && !session && <p class="muted">{t("noProviders")}</p>}
    {client && <a class="text-button cancel" href="/">{t("cancel")}</a>}
  </>;
}
