import { LogOut, Mic, ShieldCheck, UsersRound } from "lucide-react";
import { useRef, useState, type RefObject } from "react";
import { useGuardianLanguage } from "../i18n/guardian-language";
import { ActionLink, Card } from "../shared/ui";
import { HeaderButton, RouteHeader } from "./AppHeader";
import {
  getGuardianAccountPath,
  getGuardianDubbingPath,
  getGuardianLearnersPath,
} from "./app-routes";
import { LearnerModeSwitchDialog } from "./LearnerModeSwitchDialog";

export function GuardianDashboardView({
  onSwitchToLearner,
  switchTriggerRef,
}: {
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

      <section className="mx-auto grid w-full max-w-5xl gap-8">
        <header className="grid gap-2 text-center">
          <h1 className="m-0 text-4xl leading-none tracking-tight text-brand-ink sm:text-6xl">
            {copy.title}
          </h1>
        </header>

        <Card
          aria-labelledby="manage-learners-heading"
          className="grid items-center gap-5 overflow-hidden p-6 sm:grid-cols-[auto_minmax(0,1fr)] md:grid-cols-[auto_minmax(0,1fr)_auto]"
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
              {copy.learnerProfilesTitle}
            </h2>
            <p className="m-0 font-bold leading-relaxed text-slate-600">
              {copy.learnerProfilesDescription}
            </p>
          </div>
          <ActionLink
            className="w-full sm:col-start-2 sm:w-auto sm:justify-self-start md:col-start-auto md:justify-self-end"
            to={getGuardianLearnersPath()}
          >
            {copy.manageLearners}
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
            {copy.learningContentTitle}
          </h2>
          <div className="grid gap-4">
            <Card
              aria-labelledby="voice-dubbing-heading"
              className="grid content-start gap-4 !bg-amber-50 p-5 sm:p-6"
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
                {copy.voiceDubbingTitle}
              </h3>
              <p className="m-0 font-bold leading-relaxed text-slate-600">
                {copy.voiceDubbingDescription}
              </p>
              <ActionLink
                className="mt-auto"
                fullWidth
                to={getGuardianDubbingPath()}
              >
                {copy.manageVoiceDubbing}
              </ActionLink>
            </Card>
          </div>
        </section>

        <Card
          aria-labelledby="account-privacy-heading"
          className="grid items-center gap-5 !bg-emerald-50 p-6 sm:grid-cols-[auto_minmax(0,1fr)] md:grid-cols-[auto_minmax(0,1fr)_auto]"
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
              {copy.accountPrivacyTitle}
            </h2>
            <p className="m-0 font-bold leading-relaxed text-slate-600">
              {copy.accountPrivacyDescription}
            </p>
          </div>
          <ActionLink
            className="w-full sm:col-start-2 sm:w-auto sm:justify-self-start md:col-start-auto md:justify-self-end"
            to={getGuardianAccountPath()}
            variant="navy"
          >
            {copy.openAccountPrivacy}
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
