export type Language = "en" | "zh-CN";
const zh = {
  signIn: "登录以继续", signInHint: "选择一种方式登录你的账户", continueTo: "继续前往", with: "使用 {provider} 登录",
  cancel: "取消", allow: "允许并继续", consentTitle: "允许此应用访问你的账户？", permissions: "此应用将能够",
  identity: "确认你的账户身份", profile: "读取昵称与头像", email: "读取邮箱地址", offline: "在你离线时保持访问权限",
  currentAccount: "当前账户", switchAccount: "切换账户", returnTo: "返回", account: "你的账户", signedIn: "已登录",
  methods: "登录方式", connected: "已连接", connect: "连接", apps: "已授权的应用", revoke: "撤销授权", signOut: "退出登录",
  noProviders: "暂时没有可用的登录方式", noGrants: "还没有授权任何应用", loadFailed: "加载失败，请重试", retry: "重试",
  working: "正在处理…", loading: "正在加载…", failed: "操作失败，请重试", errorTitle: "暂时无法继续",
  revokeTitle: "撤销对此应用的授权？", revokeHint: "下次访问时需要重新授权。这不会退出应用中已经建立的登录会话。",
  continueAs: "以 {name} 的身份继续", unknownPermission: "访问权限：{scope}", methodsFailed: "无法加载已连接的登录方式",
  identityShort: "账户身份", profileShort: "昵称与头像", emailShort: "邮箱地址", offlineShort: "离线访问", home: "返回账户首页",
};
const en: Record<keyof typeof zh, string> = {
  signIn: "Sign in to continue", signInHint: "Choose how to sign in to your account", continueTo: "Continue to", with: "Continue with {provider}",
  cancel: "Cancel", allow: "Allow and continue", consentTitle: "Allow this app to access your account?", permissions: "This app will be able to",
  identity: "Confirm your account identity", profile: "Read your name and profile picture", email: "Read your email address", offline: "Maintain access while you are offline",
  currentAccount: "Current account", switchAccount: "Switch account", returnTo: "Return to", account: "Your account", signedIn: "Signed in",
  methods: "Sign-in methods", connected: "Connected", connect: "Connect", apps: "Authorized apps", revoke: "Revoke access", signOut: "Sign out",
  noProviders: "No sign-in methods are available", noGrants: "You haven’t authorized any apps yet", loadFailed: "Couldn’t load this page. Try again.", retry: "Try again",
  working: "Working…", loading: "Loading…", failed: "Something went wrong. Try again.", errorTitle: "Unable to continue",
  revokeTitle: "Revoke access for this app?", revokeHint: "You’ll need to authorize it again next time. This won’t sign you out of sessions already established in the app.",
  continueAs: "Continue as {name}", unknownPermission: "Permission: {scope}", methodsFailed: "Couldn’t load connected sign-in methods",
  identityShort: "Account identity", profileShort: "Name and profile picture", emailShort: "Email address", offlineShort: "Offline access", home: "Back to account",
};
export function initialLanguage(): Language {
  try {
    const saved = localStorage.getItem("language");
    if (saved === "en" || saved === "zh-CN") return saved;
  } catch {}
  return navigator.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}
export function translate(language: Language, key: keyof typeof zh, values: Record<string, string> = {}) {
  return Object.entries(values).reduce((text, [name, value]) => text.replace(`{${name}}`, value), (language === "zh-CN" ? zh : en)[key]);
}
