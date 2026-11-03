import { createContext, type ComponentChildren } from "preact";
import { useContext, useEffect, useState } from "preact/hooks";
import { initialLanguage, translate, type Language } from "../i18n";

type I18n = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: Parameters<typeof translate>[1], values?: Record<string, string>) => string;
};
const I18nContext = createContext<I18n | undefined>(undefined);

export function I18nProvider({ children }: { children: ComponentChildren }) {
  const [language, setLanguage] = useState(initialLanguage);
  useEffect(() => {
    document.documentElement.lang = language;
    try { localStorage.setItem("language", language); } catch {}
  }, [language]);
  return (
    <I18nContext.Provider value={{ language, setLanguage, t: (key, values) => translate(language, key, values) }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("Missing language provider");
  return context;
}
