import { useEffect, useRef } from "preact/hooks";
import type { Client } from "../lib/presentation";
import { AppIdentity } from "./Identity";
import { useI18n } from "./I18nProvider";

export function RevokeDialog({ client, onClose, onConfirm }: {
  client: Client; onClose: () => void; onConfirm: () => void;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog ref={ref} class="confirm-dialog" aria-labelledby="revoke-title" onClose={onClose}>
      <h2 id="revoke-title">{t("revokeTitle")}</h2>
      <AppIdentity client={client} className="dialog-app" />
      <p class="muted">{t("revokeHint")}</p>
      <div class="dialog-actions">
        <button type="button" class="text-button" onClick={() => ref.current?.close()}>{t("cancel")}</button>
        <button type="button" class="primary" onClick={() => { onClose(); onConfirm(); }}>{t("revoke")}</button>
      </div>
    </dialog>
  );
}
