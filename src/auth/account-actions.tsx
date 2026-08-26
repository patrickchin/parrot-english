import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

export type AccountExperience = {
  error: string;
  guardianUnlockDestination?: string | null;
  hasActiveLearner: boolean;
  learnerName: string | null;
  onOpenProfile: (() => void) | null;
};

export type DeleteAccountAction = (
  password: string,
) => Promise<string | null>;

type AccountExperienceSetter = Dispatch<
  SetStateAction<AccountExperience | null>
>;

type AccountActionContextValue = {
  action: AccountExperience | null;
  deleteAccount: DeleteAccountAction;
  sessionIdentity: string | null;
  setAction: AccountExperienceSetter;
};

const AccountActionContext = createContext<AccountActionContextValue | null>(
  null,
);

export function AccountActionProvider({
  children,
  deleteAccount,
  profileAction = null,
  sessionIdentity = null,
  setProfileAction,
}: {
  children: ReactNode;
  deleteAccount: DeleteAccountAction;
  profileAction?: AccountExperience | null;
  sessionIdentity?: string | null;
  setProfileAction: AccountExperienceSetter;
}) {
  const value = useMemo(
    () => ({
      action: profileAction,
      deleteAccount,
      sessionIdentity,
      setAction: setProfileAction,
    }),
    [deleteAccount, profileAction, sessionIdentity, setProfileAction],
  );
  return (
    <AccountActionContext.Provider value={value}>
      {children}
    </AccountActionContext.Provider>
  );
}

export function useProfileAccountAction(action: AccountExperience | null) {
  const setProfileAction = useContext(AccountActionContext)?.setAction;

  useEffect(() => {
    if (!setProfileAction) return;
    setProfileAction(action);
    return () =>
      setProfileAction((current) => (current === action ? null : current));
  }, [action, setProfileAction]);
}

export function useClearProfileAccountAction() {
  const setProfileAction = useContext(AccountActionContext)?.setAction;
  return useCallback(() => setProfileAction?.(null), [setProfileAction]);
}

export function useAccountExperience() {
  return useContext(AccountActionContext)?.action ?? null;
}

export function useAccountSessionIdentity() {
  return useContext(AccountActionContext)?.sessionIdentity ?? null;
}

export function useDeleteAccountAction() {
  const deleteAccount = useContext(AccountActionContext)?.deleteAccount;
  if (!deleteAccount) {
    throw new Error("Account actions are unavailable.");
  }
  return deleteAccount;
}
