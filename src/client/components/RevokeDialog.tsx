import { ActionButton } from "./ActionButton";
import type { RunAction } from "../lib/types";
import { useEffect, useRef, useState } from "preact/hooks";
import type { Client } from "../lib/presentation";
import { AppIdentity } from "./Identity";
import { useI18n } from "./I18nProvider";

export function RevokeDialog({ client, run, onClose, onConfirm }: {
  client: Client; run: RunAction; onClose: () => void; onConfirm: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [pending, setPending] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog ref={ref} class="confirm-dialog" aria-labelledby="revoke-title" onClose={onClose} onCancel={event => { if (pending) event.preventDefault(); }}>
      <h2 id="revoke-title">{t("revokeTitle")}</h2>
      <AppIdentity client={client} className="dialog-app" />
      <p class="muted">{t("revokeHint")}</p>
      <div class="dialog-actions">
        <button type="button" class="text-button" onClick={() => ref.current?.close()}>{t("cancel")}</button>
        <ActionButton className="primary" run={run} onPendingChange={setPending} label={t("revoke")} onAction={async () => {
          await onConfirm();
          onClose();
        }} />
      </div>
    </dialog>
  );
}
