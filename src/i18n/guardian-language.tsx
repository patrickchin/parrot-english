import {
  createContext,
  useContext,
  useState,
  type PropsWithChildren,
  type ReactElement,
} from "react";
import { getGateRouteKind, isGuardianRoute } from "../app/app-routes";
import {
  englishGuardianMessages,
  type GuardianMessages,
} from "./messages/en";
import { chineseGuardianMessages } from "./messages/zh-Hans";

export const GUARDIAN_LANGUAGE_STORAGE_KEY = "parrot:guardian-language";
export const GUARDIAN_LANGUAGES = ["en", "zh-Hans"] as const;
export type GuardianLanguage = (typeof GUARDIAN_LANGUAGES)[number];
export type GuardianLanguageStorage = Pick<Storage, "getItem" | "setItem">;

type GuardianLanguageContextValue = Readonly<{
  language: GuardianLanguage;
  messages: GuardianMessages;
  selectLanguage: (language: GuardianLanguage) => void;
}>;

const DEFAULT_LANGUAGE_CONTEXT: GuardianLanguageContextValue = {
  language: "en",
  messages: englishGuardianMessages,
  selectLanguage() {},
};
const GuardianLanguageContext = createContext(DEFAULT_LANGUAGE_CONTEXT);

function isGuardianLanguage(value: string | null): value is GuardianLanguage {
  return value === "en" || value === "zh-Hans";
}

export function resolveGuardianLanguage(
  storedLanguage: string | null,
  browserLanguages: readonly string[],
): GuardianLanguage {
  if (isGuardianLanguage(storedLanguage)) return storedLanguage;
  return browserLanguages.some(
    (language) => language.split("-", 1)[0]?.toLowerCase() === "zh",
  )
    ? "zh-Hans"
    : "en";
}

export function isGuardianGuidanceSurface(pathname: string) {
  return getGateRouteKind(pathname) === "login" || isGuardianRoute(pathname);
}

function getBrowserStorage(): GuardianLanguageStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function getBrowserLanguages(): readonly string[] {
  let browserNavigator: Navigator;
  try {
    if (typeof navigator === "undefined") return [];
    browserNavigator = navigator;
  } catch {
    return [];
  }
  try {
    if (Array.isArray(browserNavigator.languages)) return browserNavigator.languages;
  } catch {
    // Fall through to the singular browser language preference.
  }
  try {
    return typeof browserNavigator.language === "string"
      ? [browserNavigator.language]
      : [];
  } catch {
    return [];
  }
}

function messagesFor(language: GuardianLanguage): GuardianMessages {
  return language === "zh-Hans" ? chineseGuardianMessages : englishGuardianMessages;
}

export function GuardianLanguageProvider({
  browserLanguages,
  children,
  initialLanguage,
  storage,
}: PropsWithChildren<{
  initialLanguage?: GuardianLanguage;
  storage?: GuardianLanguageStorage | null;
  browserLanguages?: readonly string[];
}>): ReactElement {
  const resolvedStorage = storage === undefined ? getBrowserStorage() : storage;
  const [language, setLanguage] = useState<GuardianLanguage>(() => {
    if (initialLanguage) return initialLanguage;
    let storedLanguage: string | null = null;
    try {
      storedLanguage = resolvedStorage?.getItem(GUARDIAN_LANGUAGE_STORAGE_KEY) ?? null;
    } catch {
      // Local preference storage is optional.
    }
    return resolveGuardianLanguage(storedLanguage, browserLanguages ?? getBrowserLanguages());
  });
  const value: GuardianLanguageContextValue = {
    language,
    messages: messagesFor(language),
    selectLanguage(nextLanguage) {
      setLanguage(nextLanguage);
      try {
        resolvedStorage?.setItem(GUARDIAN_LANGUAGE_STORAGE_KEY, nextLanguage);
      } catch {
        // Keep the current in-memory choice if local storage is unavailable.
      }
    },
  };

  return (
    <GuardianLanguageContext.Provider value={value}>
      {children}
    </GuardianLanguageContext.Provider>
  );
}

export function useGuardianLanguage(): GuardianLanguageContextValue {
  return useContext(GuardianLanguageContext);
}
