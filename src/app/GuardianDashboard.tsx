import { LogOut } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { useGuardianAccess } from "../auth/GuardianAccess";
import { ActionLink, Card } from "../shared/ui";
import {
  GuardianLearnerContextLabel,
  HeaderButton,
  RouteHeader,
} from "./AppHeader";
import {
  getGuardianDubbingPath,
  getGuardianLearnersPath,
  getGuardianPath,
  getGuardianLessonsPath,
  getGuardianStoriesPath,
  getProfilePath,
} from "./app-routes";

export function GuardianDashboardView({
  error,
  isSwitching,
  learnerName,
  onSwitchToLearner,
}: {
  error: string;
  isSwitching: boolean;
  learnerName: string;
  onSwitchToLearner: () => void;
}) {
  return (
    <main className="min-h-dvh w-full overflow-x-hidden bg-placeholder px-4 pb-12 pt-28 sm:px-6 md:px-10 md:pt-32">
      <RouteHeader>
        <HeaderButton
          aria-label="Switch to learner"
          disabled={isSwitching}
          icon={<LogOut strokeWidth={3} />}
          onClick={onSwitchToLearner}
          type="button"
        >
          {isSwitching ? "Switching to learner…" : "Switch to learner"}
        </HeaderButton>
      </RouteHeader>

      <section className="mx-auto grid w-full max-w-5xl gap-6">
        <header className="grid gap-2 text-center">
          <GuardianLearnerContextLabel learnerName={learnerName} />
          <h1 className="m-0 text-4xl leading-none tracking-tight text-brand-ink sm:text-6xl">
            Guardian dashboard
          </h1>
        </header>

        {error ? (
          <p
            className="m-0 rounded-2xl bg-rose-100 px-4 py-3 text-center font-extrabold text-red-900"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="grid content-start gap-4 p-6">
            <h2 className="m-0 text-2xl leading-tight text-brand-navy">
              Learner profiles
            </h2>
            <p className="m-0 font-bold leading-relaxed text-slate-600">
              Add a learner, choose who is active, or manage each learner&apos;s
              details.
            </p>
            <ActionLink className="mt-auto" to={getGuardianLearnersPath()}>
              Manage learner profiles
            </ActionLink>
          </Card>

          <Card className="grid content-start gap-4 p-6">
            <h2 className="m-0 text-2xl leading-tight text-brand-navy">
              Learner details
            </h2>
            <p className="m-0 font-bold leading-relaxed text-slate-600">
              Review and update the learner&apos;s name, age, and profile
              details.
            </p>
            <ActionLink
              className="mt-auto"
              to={getProfilePath(getGuardianPath())}
            >
              Manage learner details
            </ActionLink>
          </Card>

          <Card className="grid content-start gap-4 p-6">
            <h2 className="m-0 text-2xl leading-tight text-brand-navy">
              My Lessons
            </h2>
            <p className="m-0 font-bold leading-relaxed text-slate-600">
              Create and edit custom lessons for the learner.
            </p>
            <ActionLink className="mt-auto" to={getGuardianLessonsPath()}>
              Manage lessons
            </ActionLink>
          </Card>

          <Card className="grid content-start gap-4 p-6">
            <h2 className="m-0 text-2xl leading-tight text-brand-navy">
              Story settings
            </h2>
            <p className="m-0 font-bold leading-relaxed text-slate-600">
              Choose the story level and personalized story options.
            </p>
            <ActionLink className="mt-auto" to={getGuardianStoriesPath()}>
              Open story settings
            </ActionLink>
          </Card>

          <Card className="grid content-start gap-4 p-6">
            <h2 className="m-0 text-2xl leading-tight text-brand-navy">
              Voice dubbing
            </h2>
            <p className="m-0 font-bold leading-relaxed text-slate-600">
              Allow private voice clips or turn dubbing off and remove them.
            </p>
            <ActionLink className="mt-auto" to={getGuardianDubbingPath()}>
              Manage voice dubbing
            </ActionLink>
          </Card>

          <Card className="grid content-start gap-4 p-6">
            <h2 className="m-0 text-2xl leading-tight text-brand-navy">
              Account and privacy
            </h2>
            <p className="m-0 font-bold leading-relaxed text-slate-600">
              Open the profile dropdown for AI and saved data, sign out, or
              delete the account.
            </p>
          </Card>
        </div>
      </section>
    </main>
  );
}

export function GuardianDashboard({
  learnerName,
  onBeforeNavigate,
}: {
  learnerName: string;
  onBeforeNavigate?: () => void;
}) {
  const { error, lock } = useGuardianAccess();
  const navigate = useNavigate();
  const [isSwitching, setIsSwitching] = useState(false);

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
    <GuardianDashboardView
      error={error}
      isSwitching={isSwitching}
      learnerName={learnerName.trim() || "Learner"}
      onSwitchToLearner={() => void switchToLearner()}
    />
  );
}
