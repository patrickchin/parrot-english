import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import {
  useGuardianAccess,
  type GuardianAccessErrorCode,
} from "../auth/GuardianAccess";
import { AdultBoundaryHelper } from "../i18n/AdultBoundaryHelper";
import { useGuardianLanguage } from "../i18n/guardian-language";
import { ActionButton, ActionLink, Card } from "../shared/ui";
import { FeaturePlaceholder } from "./FeaturePlaceholder";
import { getGuardianPath } from "./app-routes";
import { LearnerModeSwitchDialog } from "./LearnerModeSwitchDialog";

type ModeBoundaryProps = {
  children?: ReactNode;
  onBeforeNavigate?: () => void;
};

function BoundaryContent({ children }: { children?: ReactNode }) {
  return children ?? <Outlet />;
}

function AccessCheck({ guardianAudience }: { guardianAudience: boolean }) {
  const { messages } = useGuardianLanguage();
  return (
    <FeaturePlaceholder
      actionLabel={
        guardianAudience ? messages.modeBoundary.backToDashboard : undefined
      }
      actionTo={guardianAudience ? getGuardianPath() : "/"}
      busy
      description={
        guardianAudience
          ? messages.modeBoundary.checkingDescription
          : "Confirming which profile can use this screen."
      }
      title={
        guardianAudience
          ? messages.modeBoundary.checkingTitle
          : "Checking guardian access…"
      }
    />
  );
}

function AutomaticGuardianAccess({
  autoStart = true,
}: {
  autoStart?: boolean;
}) {
  const { messages } = useGuardianLanguage();
  const { unlock } = useGuardianAccess();
  const [error, setError] = useState<GuardianAccessErrorCode | null>(
    autoStart ? null : "check-failed",
  );
  const isPendingRef = useRef(false);

  const switchMode = useCallback(async () => {
    if (isPendingRef.current) return;
    isPendingRef.current = true;
    setError(null);
    try {
      setError((await unlock("")) ?? null);
    } catch {
      setError("check-failed");
    } finally {
      isPendingRef.current = false;
    }
  }, [unlock]);

  useEffect(() => {
    if (!autoStart) return;
    const timeout = window.setTimeout(() => void switchMode(), 0);
    return () => window.clearTimeout(timeout);
  }, [autoStart, switchMode]);

  return error ? (
    <FeaturePlaceholder
      actionLabel={messages.modeBoundary.backToDashboard}
      actionTo={getGuardianPath()}
      description={messages.guardianAccess.errors[error]}
      onRetry={() => void switchMode()}
      retryLabel={messages.common.retry}
      title={messages.modeBoundary.openFailedTitle}
    />
  ) : (
    <AccessCheck guardianAudience={true} />
  );
}

function LearnerSwitchRedirect() {
  const navigate = useNavigate();

  useEffect(() => {
    const timeout = window.setTimeout(
      () => navigate("/", { replace: true }),
      0,
    );
    return () => window.clearTimeout(timeout);
  }, [navigate]);

  return <AccessCheck guardianAudience={true} />;
}

export function GuardianModeBoundary({ children }: ModeBoundaryProps) {
  const { blockedByLearnerSwitch, mode } = useGuardianAccess();
  const location = useLocation();
  const routeKey = `${location.pathname}${location.search}`;
  const routeAttemptRef = useRef<{
    key: string;
    state: "idle" | "running" | "spent";
  }>({ key: routeKey, state: "idle" });
  if (routeAttemptRef.current.key !== routeKey) {
    routeAttemptRef.current = { key: routeKey, state: "idle" };
  }

  if (mode === "loading") return <AccessCheck guardianAudience={true} />;
  if (mode === "learner") {
    if (blockedByLearnerSwitch) return <LearnerSwitchRedirect />;
    if (routeAttemptRef.current.state === "spent") {
      return <AutomaticGuardianAccess autoStart={false} />;
    }
    routeAttemptRef.current.state = "running";
    return <AutomaticGuardianAccess />;
  }
  if (routeAttemptRef.current.state === "running") {
    routeAttemptRef.current.state = "spent";
  }
  return <BoundaryContent>{children}</BoundaryContent>;
}

export function LearnerModeBoundary({
  children,
  onBeforeNavigate,
}: ModeBoundaryProps) {
  const { acknowledgeLearnerSwitch, blockedByLearnerSwitch, mode } =
    useGuardianAccess();
  const location = useLocation();
  const [isSwitchDialogOpen, setIsSwitchDialogOpen] = useState(false);
  const switchTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (mode === "learner" && blockedByLearnerSwitch) {
      acknowledgeLearnerSwitch();
    }
  }, [acknowledgeLearnerSwitch, blockedByLearnerSwitch, mode]);

  if (mode === "loading") return <AccessCheck guardianAudience={false} />;
  if (mode === "learner") return <BoundaryContent>{children}</BoundaryContent>;

  return (
    <main className="grid h-dvh w-screen place-items-start overflow-y-auto bg-placeholder px-4 pb-10 pt-28 md:place-items-center md:px-6 md:pb-12 md:pt-32">
      <Card className="my-auto grid w-full max-w-2xl justify-items-center gap-4 p-8 text-center sm:p-12">
        <h1 className="m-0 text-4xl leading-none text-brand-ink sm:text-6xl">
          Switch to learner mode
        </h1>
        <p className="m-0 max-w-lg font-bold leading-relaxed text-slate-600">
          Learning activities are available in the learner profile.
        </p>
        <AdultBoundaryHelper message="switchToLearnerHelper" />
        <ActionButton
          onClick={() => setIsSwitchDialogOpen(true)}
          ref={switchTriggerRef}
          type="button"
        >
          Switch to learner mode
        </ActionButton>
        <ActionLink to={getGuardianPath()}>
          Back to Guardian dashboard
        </ActionLink>
      </Card>
      {isSwitchDialogOpen ? (
        <LearnerModeSwitchDialog
          destination={`${location.pathname}${location.search}${location.hash}`}
          onBeforeNavigate={onBeforeNavigate}
          onClose={() => setIsSwitchDialogOpen(false)}
          returnFocusRef={switchTriggerRef}
        />
      ) : null}
    </main>
  );
}
