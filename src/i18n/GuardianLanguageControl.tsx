import type { ReactElement } from "react";
import { SegmentedButton, SegmentedControl } from "../shared/ui";
import { useGuardianLanguage } from "./guardian-language";

export function GuardianLanguageControl({
  placement = "global",
}: {
  placement?: "global" | "dialog";
}): ReactElement {
  const { language, messages, selectLanguage } = useGuardianLanguage();

  return (
    <SegmentedControl
      aria-label={messages.language.controlLabel}
      className={
        placement === "global"
          ? "fixed left-3.5 top-3.5 z-40 grid w-34 grid-cols-2 short:left-2.5 short:top-2.5 md:left-4 md:top-6 wide:left-7 [&>button]:!px-1"
          : "w-full grid-cols-2"
      }
      lang={language}
    >
      <SegmentedButton
        lang="en"
        onClick={() => selectLanguage("en")}
        selected={language === "en"}
        type="button"
      >
        {messages.language.englishOption}
      </SegmentedButton>
      <SegmentedButton
        lang="zh-Hans"
        onClick={() => selectLanguage("zh-Hans")}
        selected={language === "zh-Hans"}
        type="button"
      >
        {messages.language.chineseOption}
      </SegmentedButton>
    </SegmentedControl>
  );
}
