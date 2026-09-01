import { LogOut } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { useLocation } from "react-router";
import { GuardianDubbingSettings } from "../dubbing/GuardianDubbingSettings";
import { useGuardianLanguage } from "../i18n/guardian-language";
import { GuardianLearnerProfiles } from "../learner-profile/GuardianLearnerProfiles";
import { useLearnerSelection } from "../learner-profile/LearnerProfileContext";
import { AccountPrivacyContent } from "./AccountPrivacyPage";
import { HeaderButton, RouteHeader } from "./AppHeader";
import { LearnerModeSwitchDialog } from "./LearnerModeSwitchDialog";

export function GuardianDashboardView({
  children,
  onSwitchToLearner,
  switchTriggerRef,
}: {
  children?: ReactNode;
  onSwitchToLearner: () => void;
  switchTriggerRef?: RefObject<HTMLButtonElement | null>;
}) {
  const { messages } = useGuardianLanguage();
  const copy = messages.guardianDashboard;

  return (
    <main className="h-dvh w-full overflow-x-hidden overflow-y-auto bg-placeholder px-4 pb-12 pt-28 sm:px-6 md:px-10 md:pt-32">
      <RouteHeader ariaLabel={messages.common.pageNavigation}>
        <HeaderButton
          aria-label={copy.switchToLearner}
          icon={<LogOut />}
          onClick={onSwitchToLearner}
          ref={switchTriggerRef}
          type="button"
        >
          {copy.switchToLearner}
        </HeaderButton>
      </RouteHeader>

      <section className="mx-auto grid w-full max-w-5xl gap-12">
        <header className="grid gap-2 text-center">
          <h1
            className="m-0 text-4xl leading-none tracking-tight text-brand-ink sm:text-6xl"
            id="guardian-dashboard-heading"
          >
            {copy.title}
          </h1>
        </header>
        {children}
      </section>
    </main>
  );
}

export function GuardianDashboard({
  onBeforeNavigate,
}: {
  learnerName?: string;
  onBeforeNavigate?: () => void;
}) {
  const { hash } = useLocation();
  const { interactionReady, rosterRevision } = useLearnerSelection();
  const [inlineRosterRevision, setInlineRosterRevision] = useState(0);
  const [isSwitchDialogOpen, setIsSwitchDialogOpen] = useState(false);
  const handledFocusDestinationRef = useRef<string | null>(null);
  const switchTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!interactionReady) return;
    const focusDestination = hash || "#guardian-dashboard-heading";
    if (handledFocusDestinationRef.current === focusDestination) return;
    const dashboardHeading = document.getElementById(
      "guardian-dashboard-heading",
    );
    const hashTarget = hash.startsWith("#")
      ? document.getElementById(hash.slice(1))
      : null;
    const target = hashTarget ?? dashboardHeading;
    const headingId = target?.getAttribute("aria-labelledby");
    const heading = headingId
      ? document.getElementById(headingId)
      : target === dashboardHeading
        ? dashboardHeading
        : null;
    if (!(target instanceof HTMLElement) || !(heading instanceof HTMLElement)) {
      return;
    }
    const activeElement = document.activeElement;
    const initialHandoff = handledFocusDestinationRef.current === null;
    const dashboardMain = dashboardHeading?.closest("main");
    if (
      initialHandoff &&
      activeElement !== document.body &&
      !dashboardMain?.contains(activeElement)
    ) {
      handledFocusDestinationRef.current = focusDestination;
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      handledFocusDestinationRef.current = focusDestination;
      if (
        document.activeElement !== activeElement ||
        !target.isConnected ||
        !heading.isConnected
      ) {
        return;
      }
      if (hashTarget) {
        target.scrollIntoView?.({ block: "start" });
      } else {
        heading.closest("main")?.scrollTo?.({ top: 0 });
      }
      heading.dataset.routeFocusTarget = "";
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [hash, interactionReady]);

  return (
    <>
      <GuardianDashboardView
        onSwitchToLearner={() => setIsSwitchDialogOpen(true)}
        switchTriggerRef={switchTriggerRef}
      >
        <GuardianLearnerProfiles
          embedded
          onRosterChanged={() =>
            setInlineRosterRevision((current) => current + 1)
          }
        />
        <GuardianDubbingSettings
          embedded
          rosterRevision={rosterRevision + inlineRosterRevision}
        />
        <AccountPrivacyContent embedded />
      </GuardianDashboardView>
      {isSwitchDialogOpen ? (
        <LearnerModeSwitchDialog
          destination="/"
          onBeforeNavigate={onBeforeNavigate}
          onClose={() => setIsSwitchDialogOpen(false)}
          returnFocusRef={switchTriggerRef}
        />
      ) : null}
    </>
  );
}
