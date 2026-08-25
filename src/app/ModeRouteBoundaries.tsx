import { useState, type ReactNode } from "react";
import { Outlet, useNavigate } from "react-router";
import { useGuardianAccess } from "../auth/GuardianAccess";
import { GuardianUnlockScreen } from "../auth/GuardianUnlock";
import { ActionButton, Card } from "../shared/ui";
import { FeaturePlaceholder } from "./FeaturePlaceholder";

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
  const { error, lock, mode } = useGuardianAccess();
  const navigate = useNavigate();
  const [isSwitching, setIsSwitching] = useState(false);

  if (mode === "loading") return <AccessCheck />;
  if (mode === "learner") return <BoundaryContent>{children}</BoundaryContent>;

  async function switchToLearner() {
    if (isSwitching) return;
    setIsSwitching(true);
    try {
      const lockError = await lock();
      if (lockError) return;
      onBeforeNavigate?.();
      navigate("/");
    } finally {
      setIsSwitching(false);
    }
  }

  return (
    <main className="grid h-dvh w-screen place-items-start overflow-y-auto bg-placeholder px-4 pb-10 pt-28 md:place-items-center md:px-6 md:pb-12 md:pt-32">
      <Card className="my-auto grid w-full max-w-2xl justify-items-center gap-4 p-8 text-center sm:p-12">
        <h1 className="m-0 text-4xl leading-none text-brand-ink sm:text-6xl">
          Switch to learner mode
        </h1>
        <p className="m-0 max-w-lg font-bold leading-relaxed text-slate-600">
          Learning activities are available in the learner profile.
        </p>
        {error ? (
          <p className="m-0 font-extrabold text-red-800" role="alert">
            {error}
          </p>
        ) : null}
        <ActionButton
          disabled={isSwitching}
          onClick={() => void switchToLearner()}
          type="button"
        >
          {isSwitching ? "Switching to learner mode…" : "Switch to learner mode"}
        </ActionButton>
      </Card>
    </main>
  );
}
