import { useEffect, useRef, useState } from "preact/hooks";
import { useI18n } from "./components/I18nProvider";
import { Shell } from "./components/Shell";
import { api, loadPage, oauthError } from "./lib/auth";
import type { PageData, RunAction } from "./lib/types";
import { AccountPage } from "./pages/AccountPage";
import { ConsentPage } from "./pages/ConsentPage";
import { ErrorPage } from "./pages/ErrorPage";
import { LoginPage } from "./pages/LoginPage";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; data: PageData }
  | { status: "error"; error: unknown };

export function App() {
  const { t } = useI18n();
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(oauthError);
  const [revoked, setRevoked] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const reload = () => setRevision(value => value + 1);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setState({ status: "loading" });
    loadPage().then(
      data => { if (active) setState({ status: "ready", data }); },
      error => { if (active) setState({ status: "error", error }); },
    );
    return () => { active = false; };
  }, [revision]);

  const run: RunAction = async task => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setRevoked(false);
    try {
      await task();
    } catch (error) {
      if (mounted.current) setError(error instanceof Error ? error.message : t("failed"));
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const switchAccount = async () => {
    await api("/sign-out", {});
    if (mounted.current) reload();
  };
  const data = state.status === "ready" ? state.data : undefined;
  const page = data?.page ?? (state.status === "error" ? "error" : "loading");
  const title = t(page === "login" ? "signIn" : page === "consent" ? "consentTitle" : page === "account" ? "account" : page === "error" ? "errorTitle" : "loading");
  useEffect(() => { document.title = title; }, [title]);

  return (
    <Shell page={page} busy={busy} error={Boolean(error)}
      message={busy ? t("working") : error || (revoked ? t("revoked") : "")}>
      {state.status === "loading" && <p class="muted" role="status">{t("loading")}</p>}
      {state.status === "error" && <ErrorPage error={state.error} retry={reload} />}
      {data?.page === "login" && <LoginPage {...data} run={run} switchAccount={switchAccount} />}
      {data?.page === "consent" && <ConsentPage {...data} run={run} switchAccount={switchAccount} />}
      {data?.page === "account" && <AccountPage {...data} run={run} reload={reload} onRevoked={() => setRevoked(true)} />}
    </Shell>
  );
}
