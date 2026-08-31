import {
  BookOpen,
  LogOut,
  Mic,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { useRef, useState, type RefObject } from "react";
import { ActionLink, Card } from "../shared/ui";
import {
  HeaderButton,
  RouteHeader,
} from "./AppHeader";
import {
  getGuardianAccountPath,
  getGuardianDubbingPath,
  getGuardianLearnersPath,
  getGuardianLessonsPath,
  getGuardianStoriesPath,
} from "./app-routes";
import { LearnerModeSwitchDialog } from "./LearnerModeSwitchDialog";

export function GuardianDashboardView({
  onSwitchToLearner,
  switchTriggerRef,
}: {
  onSwitchToLearner: () => void;
  switchTriggerRef?: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <main className="h-dvh w-full overflow-x-hidden overflow-y-auto bg-placeholder px-4 pb-12 pt-28 sm:px-6 md:px-10 md:pt-32">
      <RouteHeader>
        <HeaderButton
          aria-label="Switch to learner"
          icon={<LogOut strokeWidth={3} />}
          onClick={onSwitchToLearner}
          ref={switchTriggerRef}
          type="button"
        >
          Switch to learner
        </HeaderButton>
      </RouteHeader>

      <section className="mx-auto grid w-full max-w-5xl gap-8">
        <header className="grid gap-2 text-center">
          <h1 className="m-0 text-4xl leading-none tracking-tight text-brand-ink sm:text-6xl">
            Guardian dashboard
          </h1>
        </header>

        <Card
          aria-labelledby="manage-learners-heading"
          className="grid items-center gap-5 overflow-hidden p-6 ring-4 ring-brand-pink/15 sm:grid-cols-[auto_minmax(0,1fr)] md:grid-cols-[auto_minmax(0,1fr)_auto]"
          tone="solid"
        >
          <span
            aria-hidden="true"
            className="grid size-14 place-items-center rounded-2xl bg-brand-pink/20 text-brand-navy"
          >
            <UsersRound className="size-8" strokeWidth={2.5} />
          </span>
          <div className="grid min-w-0 gap-2">
            <h2
              className="m-0 text-3xl leading-tight text-brand-navy"
              id="manage-learners-heading"
            >
              Learner profiles
            </h2>
            <p className="m-0 font-bold leading-relaxed text-slate-600">
              Add, edit, or delete learner profiles. You’ll choose a learner
              when switching to learner mode.
            </p>
          </div>
          <ActionLink
            className="w-full sm:col-start-2 sm:w-auto sm:justify-self-start md:col-start-auto md:justify-self-end"
            to={getGuardianLearnersPath()}
          >
            Manage learners
          </ActionLink>
        </Card>

        <section
          aria-labelledby="learning-content-heading"
          className="grid gap-4"
        >
          <h2
            className="m-0 text-3xl leading-tight text-brand-navy"
            id="learning-content-heading"
          >
            Learning &amp; content
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            <Card
              aria-labelledby="my-lessons-heading"
              className="grid content-start gap-4 !bg-sky-50 p-5 ring-2 ring-inset ring-sky-100 sm:p-6"
              tone="muted"
            >
              <span
                aria-hidden="true"
                className="grid size-12 place-items-center rounded-2xl bg-sky-100 text-sky-800"
              >
                <BookOpen className="size-7" strokeWidth={2.5} />
              </span>
              <h3
                className="m-0 text-2xl leading-tight text-brand-navy"
                id="my-lessons-heading"
              >
                My Lessons
              </h3>
              <p className="m-0 font-bold leading-relaxed text-slate-600">
                Create or delete custom lessons for the learner.
              </p>
              <ActionLink
                className="mt-auto"
                fullWidth
                to={getGuardianLessonsPath()}
              >
                Manage lessons
              </ActionLink>
            </Card>

            <Card
              aria-labelledby="story-settings-heading"
              className="grid content-start gap-4 !bg-violet-50 p-5 ring-2 ring-inset ring-violet-100 sm:p-6"
              tone="muted"
            >
              <span
                aria-hidden="true"
                className="grid size-12 place-items-center rounded-2xl bg-violet-100 text-violet-800"
              >
                <Sparkles className="size-7" strokeWidth={2.5} />
              </span>
              <h3
                className="m-0 text-2xl leading-tight text-brand-navy"
                id="story-settings-heading"
              >
                Story settings
              </h3>
              <p className="m-0 font-bold leading-relaxed text-slate-600">
                Choose the story level and personalized story options.
              </p>
              <ActionLink
                className="mt-auto"
                fullWidth
                to={getGuardianStoriesPath()}
              >
                Open story settings
              </ActionLink>
            </Card>

            <Card
              aria-labelledby="voice-dubbing-heading"
              className="grid content-start gap-4 !bg-amber-50 p-5 ring-2 ring-inset ring-amber-100 sm:p-6"
              tone="muted"
            >
              <span
                aria-hidden="true"
                className="grid size-12 place-items-center rounded-2xl bg-amber-100 text-amber-800"
              >
                <Mic className="size-7" strokeWidth={2.5} />
              </span>
              <h3
                className="m-0 text-2xl leading-tight text-brand-navy"
                id="voice-dubbing-heading"
              >
                Voice dubbing
              </h3>
              <p className="m-0 font-bold leading-relaxed text-slate-600">
                Allow private voice clips or turn dubbing off and remove them.
              </p>
              <ActionLink
                className="mt-auto"
                fullWidth
                to={getGuardianDubbingPath()}
              >
                Manage voice dubbing
              </ActionLink>
            </Card>
          </div>
        </section>

        <Card
          aria-labelledby="account-privacy-heading"
          className="grid items-center gap-5 !bg-emerald-50 p-6 sm:grid-cols-[auto_minmax(0,1fr)] md:grid-cols-[auto_minmax(0,1fr)_auto]"
          elevation="soft"
          tone="muted"
        >
          <span
            aria-hidden="true"
            className="grid size-12 place-items-center rounded-2xl bg-emerald-100 text-emerald-800"
          >
            <ShieldCheck className="size-7" strokeWidth={2.5} />
          </span>
          <div className="grid min-w-0 gap-2">
            <h2
              className="m-0 text-2xl leading-tight text-brand-navy"
              id="account-privacy-heading"
            >
              Account &amp; privacy
            </h2>
            <p className="m-0 font-bold leading-relaxed text-slate-600">
              Review how AI is used, what Parrot saves, and account deletion
              controls.
            </p>
          </div>
          <ActionLink
            className="w-full sm:col-start-2 sm:w-auto sm:justify-self-start md:col-start-auto md:justify-self-end"
            to={getGuardianAccountPath()}
            variant="navy"
          >
            Open account &amp; privacy
          </ActionLink>
        </Card>
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
  const [isSwitchDialogOpen, setIsSwitchDialogOpen] = useState(false);
  const switchTriggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <GuardianDashboardView
        onSwitchToLearner={() => setIsSwitchDialogOpen(true)}
        switchTriggerRef={switchTriggerRef}
      />
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
