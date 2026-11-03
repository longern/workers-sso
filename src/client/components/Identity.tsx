import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { clientIdentity, webUrl, type Client } from "../lib/presentation";
import type { User } from "../lib/types";
import { Icon } from "./Icons";
import { useI18n } from "./I18nProvider";

function ImageOrFallback({ src, fallback, className }: {
  src?: string | null; fallback: ComponentChildren; className: string;
}) {
  const [failedSource, setFailedSource] = useState<string>();
  return src && failedSource !== src && webUrl(src)
    ? <img src={src} alt="" class={className} referrerPolicy="no-referrer" onError={() => setFailedSource(src)} />
    : <>{fallback}</>;
}

export function AppIcon({ client }: { client: Client }) {
  return <ImageOrFallback src={client.logo_uri} className="app-icon" fallback={<span class="app-icon"><Icon name="game" /></span>} />;
}

export function AppIdentity({ client, className = "" }: { client: Client; className?: string }) {
  const { name, domain } = clientIdentity(client);
  return (
    <div class={`app-identity ${className}`}>
      <AppIcon client={client} />
      <div class="identity-copy">
        <strong>{name}</strong>
        {domain && <p class="domain" dir="ltr">{domain}</p>}
      </div>
    </div>
  );
}

export function AccountIdentity({ user, large = false }: { user: User; large?: boolean }) {
  const { t } = useI18n();
  const name = user.name || user.email || user.id;
  const initial = Array.from(name)[0]?.toUpperCase() || "U";
  return (
    <div class={`account-identity${large ? " large" : ""}`}>
      <ImageOrFallback src={user.image} className="avatar" fallback={<span class="avatar" aria-hidden="true">{initial}</span>} />
      <div class="identity-copy">
        <strong>{name}</strong>
        <p class="muted">{t(large ? "signedIn" : "currentAccount")}</p>
      </div>
    </div>
  );
}
