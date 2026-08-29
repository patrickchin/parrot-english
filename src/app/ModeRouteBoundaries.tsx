import { useRef, useState, type ReactNode } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { useGuardianAccess } from "../auth/GuardianAccess";
import { GuardianUnlockScreen } from "../auth/GuardianUnlock";
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

function AccessCheck() {
  return (
    <FeaturePlaceholder
      busy
      description="Confirming which profile can use this screen."
      title="Checking guardian access…"
    />
  );
}

export function GuardianModeBoundary({
  children,
  onBeforeNavigate,
}: ModeBoundaryProps) {
  const { mode } = useGuardianAccess();
  const navigate = useNavigate();

  if (mode === "loading") return <AccessCheck />;
  if (mode === "learner") {
    return (
      <GuardianUnlockScreen
        onCancel={() => {
          onBeforeNavigate?.();
          navigate("/");
        }}
      />
    );
  }
  return <BoundaryContent>{children}</BoundaryContent>;
}

export function LearnerModeBoundary({
  children,
  onBeforeNavigate,
}: ModeBoundaryProps) {
  const { mode } = useGuardianAccess();
  const location = useLocation();
  const [isSwitchDialogOpen, setIsSwitchDialogOpen] = useState(false);
  const switchTriggerRef = useRef<HTMLButtonElement>(null);

  if (mode === "loading") return <AccessCheck />;
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
        <ActionButton
          onClick={() => setIsSwitchDialogOpen(true)}
          ref={switchTriggerRef}
          type="button"
        >
          Switch to learner mode
        </ActionButton>
        <ActionLink to={getGuardianPath()}>Back to Guardian dashboard</ActionLink>
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
