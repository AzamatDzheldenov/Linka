import { ru } from "./ru";
import { uz } from "./uz";
import type { Messages } from "./ru";

export type Language = "ru" | "uz";
export type { Messages };

export const dictionaries = {
  ru,
  uz,
} satisfies Record<Language, Messages>;

let activeLanguage: Language = "ru";

export function setActiveLanguage(language: Language) {
  activeLanguage = language;
}

export function getActiveLanguage() {
  return activeLanguage;
}

export function getDictionary(language = activeLanguage) {
  return dictionaries[language];
}

export const t = new Proxy({} as Messages, {
  get(_target, property: keyof Messages) {
    return getDictionary()[property];
  },
});
