import { useI18n } from "../components/I18nProvider";

export function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const { t } = useI18n();
  return <>
    <h1>{t("errorTitle")}</h1>
    <p class="error" role="alert">{error instanceof Error ? error.message : t("loadFailed")}</p>
    <button type="button" class="primary full" onClick={retry}>{t("retry")}</button>
    <a href="/" class="text-button full">{t("home")}</a>
  </>;
}
