import { ChevronLeft, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import {
  useDeleteAccountAction,
  useIsSharedGuestAccount,
} from "../auth/account-actions";
import { useGuardianLanguage } from "../i18n/guardian-language";
import { ActionButton, ActionLink, Card } from "../shared/ui";
import { AccountDeleteDialog } from "./AccountDeleteDialog";
import { AccountPrivacySections } from "./AboutDialog";
import { HeaderLink, RouteHeader } from "./AppHeader";
import { getGuardianDubbingPath, getGuardianPath } from "./app-routes";

export function AccountPrivacyContent() {
  const { messages } = useGuardianLanguage();
  const copy = messages.accountPrivacy;
  const deleteAccount = useDeleteAccountAction();
  const isSharedGuest = useIsSharedGuestAccount();
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <Card
        aria-labelledby="voice-clips-title"
        className="grid items-center gap-4 p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:p-6"
        tone="solid"
      >
        <div className="grid min-w-0 gap-2">
          <h2
            className="m-0 text-2xl leading-tight text-brand-navy"
            id="voice-clips-title"
          >
            {copy.savedVoiceClipsTitle}
          </h2>
          <p className="m-0 font-bold leading-relaxed text-slate-600">
            {copy.savedVoiceClipsDescription}
          </p>
        </div>
        <ActionLink
          className="w-full sm:w-auto"
          size="compact"
          to={getGuardianDubbingPath()}
          variant="surface"
        >
          {copy.manageSavedVoiceClips}
        </ActionLink>
      </Card>

      <AccountPrivacySections />

      {!isSharedGuest ? (
        <Card
          aria-labelledby="danger-zone-title"
          className="grid gap-4 !border-red-300 !bg-rose-50 p-5 sm:p-6"
          id="danger-zone"
          tone="solid"
        >
          <div className="grid gap-2">
            <h2
              className="m-0 text-2xl font-black leading-tight text-red-800"
              id="danger-zone-title"
            >
              {copy.dangerTitle}
            </h2>
            <p className="m-0 font-bold leading-relaxed text-slate-700">
              {copy.dangerBody}
            </p>
          </div>
          <ActionButton
            className="justify-self-start"
            onClick={() => setIsDeleteOpen(true)}
            ref={deleteButtonRef}
            type="button"
            variant="rose"
          >
            <Trash2 aria-hidden="true" className="size-5" strokeWidth={3} />
            {copy.deleteAccount}
          </ActionButton>
        </Card>
      ) : null}

      {!isSharedGuest && isDeleteOpen ? (
        <AccountDeleteDialog
          onClose={() => setIsDeleteOpen(false)}
          onDelete={deleteAccount}
          returnFocusRef={deleteButtonRef}
        />
      ) : null}
    </>
  );
}

export function AccountPrivacyPage() {
  const { messages } = useGuardianLanguage();
  const copy = messages.accountPrivacy;

  return (
    <main className="h-dvh w-full overflow-x-hidden overflow-y-auto bg-placeholder px-4 pb-12 pt-28 font-ui sm:px-6 md:px-10 md:pt-32">
      <RouteHeader ariaLabel={messages.common.pageNavigation}>
        <HeaderLink
          aria-label={copy.backToDashboard}
          icon={<ChevronLeft />}
          to={getGuardianPath()}
        >
          {copy.backToDashboard}
        </HeaderLink>
      </RouteHeader>

      <div className="mx-auto grid w-full max-w-3xl gap-6">
        <header className="grid gap-2 text-center">
          <h1 className="m-0 text-4xl leading-none tracking-tight text-brand-ink sm:text-6xl">
            {copy.title}
          </h1>
        </header>
        <AccountPrivacyContent />
      </div>
    </main>
  );
}
