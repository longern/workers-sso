import type { ComponentChildren } from "preact";
import { useEffect, useId, useRef, useState } from "preact/hooks";
import type { RunAction } from "../lib/types";
import { useI18n } from "./I18nProvider";

function ActionToast({ message, onDismiss, id }: {
  message: string; onDismiss: () => void; id: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const toast = ref.current!;
    toast.showPopover();
    const timer = window.setTimeout(onDismiss, 4000);
    const toggle = () => { if (!toast.matches(":popover-open")) onDismiss(); };
    toast.addEventListener("toggle", toggle);
    return () => {
      window.clearTimeout(timer);
      toast.removeEventListener("toggle", toggle);
      toast.hidePopover();
    };
  }, []);
  return <div ref={ref} id={id} class="action-toast" popover="auto" role="alert">{message}</div>;
}

export function ActionButton({ label, className = "", children, run, onAction, onPendingChange }: {
  label: string; className?: string; children?: ComponentChildren; run: RunAction;
  onAction: () => Promise<void>; onPendingChange?: (pending: boolean) => void;
}) {
  const { t } = useI18n();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const errorId = useId();
  useEffect(() => () => { mounted.current = false; }, []);
  async function submit() {
    if (inFlight.current) return;
    inFlight.current = true;
    setError("");
    setPending(true);
    onPendingChange?.(true);
    try { await run(onAction); }
    catch (error) {
      if (mounted.current) setError(error instanceof Error ? error.message : t("failed"));
    } finally {
      inFlight.current = false;
      if (mounted.current) { setPending(false); onPendingChange?.(false); }
    }
  }
  const full = className.split(" ").some(name => name === "full" || name === "provider-button");
  return (
    <span class={`action-control${full ? " action-control-full" : ""}`}>
      <button type="button" class={`${className} action-button${pending ? " is-pending" : ""}`}
        disabled={pending} aria-busy={pending} aria-label={pending ? `${label}: ${t("working")}` : label}
        aria-describedby={error ? errorId : undefined} onClick={() => void submit()}>
        <span class="action-button-label">{children ?? label}</span>
        {pending && <span class="button-spinner" aria-hidden="true" />}
      </button>
      {error && <ActionToast id={errorId} message={error} onDismiss={() => setError("")} />}
    </span>
  );
}
