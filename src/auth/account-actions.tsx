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

type AccountExperienceSetter = Dispatch<
  SetStateAction<AccountExperience | null>
>;

type AccountActionContextValue = {
  action: AccountExperience | null;
  sessionIdentity: string | null;
  setAction: AccountExperienceSetter;
};

const AccountActionContext = createContext<AccountActionContextValue | null>(
  null,
);

export function AccountActionProvider({
  children,
  profileAction = null,
  sessionIdentity = null,
  setProfileAction,
}: {
  children: ReactNode;
  profileAction?: AccountExperience | null;
  sessionIdentity?: string | null;
  setProfileAction: AccountExperienceSetter;
}) {
  const value = useMemo(
    () => ({
      action: profileAction,
      sessionIdentity,
      setAction: setProfileAction,
    }),
    [profileAction, sessionIdentity, setProfileAction],
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
