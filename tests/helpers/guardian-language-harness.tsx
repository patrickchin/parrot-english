import type { ReactElement } from "react";
import { MemoryRouter } from "react-router";
import { GuardianLanguageChrome } from "../../src/i18n/GuardianLanguageChrome";
import { GuardianLanguageControl } from "../../src/i18n/GuardianLanguageControl";
import {
  GuardianLanguageProvider,
  type GuardianLanguage,
} from "../../src/i18n/guardian-language";

export function GuardianLanguageHarness({
  initialLanguage,
  route,
}: {
  initialLanguage: GuardianLanguage;
  route: string;
}): ReactElement {
  return (
    <MemoryRouter initialEntries={[route]}>
      <GuardianLanguageProvider initialLanguage={initialLanguage} storage={null}>
        <GuardianLanguageChrome>
          <GuardianLanguageControl />
          <div>Route content</div>
        </GuardianLanguageChrome>
      </GuardianLanguageProvider>
    </MemoryRouter>
  );
}
