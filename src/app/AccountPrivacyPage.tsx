import { ChevronLeft, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { useDeleteAccountAction } from "../auth/account-actions";
import { ActionButton, Card } from "../shared/ui";
import { AccountDeleteDialog } from "./AccountDeleteDialog";
import { AccountPrivacySections } from "./AboutDialog";
import { HeaderLink, RouteHeader } from "./AppHeader";
import { getGuardianPath } from "./app-routes";

export function AccountPrivacyPage() {
  const deleteAccount = useDeleteAccountAction();
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <main className="min-h-dvh w-full overflow-x-hidden bg-placeholder px-4 pb-12 pt-28 font-ui sm:px-6 md:px-10 md:pt-32">
      <RouteHeader>
        <HeaderLink
          aria-label="Back to Guardian dashboard"
          icon={<ChevronLeft strokeWidth={3} />}
          to={getGuardianPath()}
        >
          Back to Guardian dashboard
        </HeaderLink>
      </RouteHeader>

      <div className="mx-auto grid w-full max-w-3xl gap-6">
        <header className="grid gap-2 text-center">
          <p className="m-0 text-xs font-black uppercase tracking-widest text-brand-blue">
            For grown-ups
          </p>
          <h1 className="m-0 text-4xl leading-none tracking-tight text-brand-ink sm:text-6xl">
            Account &amp; privacy
          </h1>
        </header>

        <AccountPrivacySections />

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
              Danger zone
            </h2>
            <p className="m-0 font-bold leading-relaxed text-slate-700">
              Permanently remove this account and its saved learner data.
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
            Delete account
          </ActionButton>
        </Card>
      </div>

      {isDeleteOpen ? (
        <AccountDeleteDialog
          onClose={() => setIsDeleteOpen(false)}
          onDelete={deleteAccount}
          returnFocusRef={deleteButtonRef}
        />
      ) : null}
    </main>
  );
}
