import { Icon, type IconName } from "./Icons";
import { useI18n } from "./I18nProvider";

const labels = {
  openid: ["identity", "identityShort"], profile: ["profile", "profileShort"],
  email: ["email", "emailShort"], offline_access: ["offline", "offlineShort"],
} as const;
const icons: Record<string, IconName> = { openid: "shield", profile: "user", email: "mail", offline_access: "clock" };

function usePermissionLabel() {
  const { t } = useI18n();
  return (scope: string, short = false) => Object.hasOwn(labels, scope)
    ? t(labels[scope as keyof typeof labels][short ? 1 : 0])
    : t("unknownPermission", { scope });
}

export function Permissions({ scopes }: { scopes: string[] }) {
  const label = usePermissionLabel();
  return <ul class="permissions">{scopes.map(scope => (
    <li key={scope}><Icon name={icons[scope] || "shield"} /><span>{label(scope)}</span></li>
  ))}</ul>;
}

export function PermissionSummary({ scopes }: { scopes: string[] }) {
  const label = usePermissionLabel();
  const { language } = useI18n();
  return <p class="scope-summary">{[...new Set(scopes)].map(scope => label(scope, true)).join(language === "zh-CN" ? "、" : ", ")}</p>;
}
