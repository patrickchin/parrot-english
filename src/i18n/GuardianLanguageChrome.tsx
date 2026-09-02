import {
  useEffect,
  useLayoutEffect,
  type PropsWithChildren,
  type ReactElement,
} from "react";
import { useLocation } from "react-router";
import {
  isGuardianGuidanceSurface,
  useGuardianLanguage,
} from "./guardian-language";

const useBrowserLayoutEffect =
  typeof document === "undefined" ? useEffect : useLayoutEffect;

export function GuardianLanguageChrome({
  children,
}: PropsWithChildren): ReactElement {
  const location = useLocation();
  const { language } = useGuardianLanguage();
  const documentLanguage = isGuardianGuidanceSurface(
    location.pathname,
    location.search,
  )
    ? language
    : "en";

  useBrowserLayoutEffect(() => {
    const previousLanguage = document.documentElement.lang;
    document.documentElement.lang = documentLanguage;
    return () => {
      if (document.documentElement.lang === documentLanguage) {
        document.documentElement.lang = previousLanguage;
      }
    };
  }, [documentLanguage]);

  return <>{children}</>;
}
