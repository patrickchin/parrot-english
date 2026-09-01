import type { ReactElement } from "react";
import { useGuardianLanguage } from "./guardian-language";
import type { GuardianMessages } from "./messages/en";

export function AdultBoundaryHelper({
  message,
  placement = "block",
}: {
  message: keyof GuardianMessages["learnerBoundary"];
  placement?: "block" | "compact";
}): ReactElement | null {
  const { language, messages } = useGuardianLanguage();
  const copy = messages.learnerBoundary[message];
  if (language !== "zh-Hans" || !copy) return null;

  return (
    <span
      className={placement === "compact" ? "text-xs font-bold" : undefined}
      lang="zh-Hans"
    >
      {copy}
    </span>
  );
}
