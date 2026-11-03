import type { ComponentChildren } from "preact";
import { Icon } from "./Icons";
import { useI18n } from "./I18nProvider";
import type { Language } from "../i18n";

export function Shell({ page, busy, children, message, error }: {
  page: string; busy: boolean; children: ComponentChildren; message?: string; error?: boolean;
}) {
  const { language, setLanguage } = useI18n();
  return <div class={`site-shell site-shell-${page}`}>
    <header class="site-header">
      <a class="site-name" href="/"><Icon name="user" /><span>{location.host}</span></a>
      <select id="language" name="language" aria-label="Language / 语言" value={language} disabled={busy}
        onChange={event => setLanguage(event.currentTarget.value as Language)}>
        <option value="zh-CN">简体中文</option><option value="en">English</option>
      </select>
    </header>
    <main class={`page page-${page}`} aria-busy={busy}>
      <fieldset class="page-controls" disabled={busy}>{children}</fieldset>
      <p id="status" class={`status${error ? " error" : ""}`} role="status" aria-live="polite">{message}</p>
    </main>
  </div>;
}
