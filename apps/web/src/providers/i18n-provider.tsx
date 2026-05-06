"use client";

import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  getDictionary,
  Language,
  Messages,
  setActiveLanguage,
} from "@/lib/i18n";

const LANGUAGE_STORAGE_KEY = "linka.language";

type I18nContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: Messages;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("ru");

  useEffect(() => {
    const storedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);

    if (storedLanguage === "ru" || storedLanguage === "uz") {
      setLanguageState(storedLanguage);
      setActiveLanguage(storedLanguage);
      document.documentElement.lang = storedLanguage;
      return;
    }

    setActiveLanguage("ru");
    document.documentElement.lang = "ru";
  }, []);

  const value = useMemo<I18nContextValue>(() => {
    const dictionary = getDictionary(language);

    return {
      language,
      setLanguage(nextLanguage) {
        setLanguageState(nextLanguage);
        setActiveLanguage(nextLanguage);
        window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
        document.documentElement.lang = nextLanguage;
      },
      t: dictionary,
    };
  }, [language]);

  useEffect(() => {
    setActiveLanguage(language);
    document.documentElement.lang = language;
  }, [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);

  if (!value) {
    throw new Error("useI18n must be used inside I18nProvider");
  }

  return value;
}
