import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

export type AccountExperience = {
  error: string;
  learnerName: string | null;
  onOpenProfile: (() => void) | null;
};

type AccountExperienceSetter = Dispatch<
  SetStateAction<AccountExperience | null>
>;

type AccountActionContextValue = {
  action: AccountExperience | null;
  setAction: AccountExperienceSetter;
};

const AccountActionContext = createContext<AccountActionContextValue | null>(null);

export function AccountActionProvider({
  children,
  profileAction = null,
  setProfileAction,
}: {
  children: ReactNode;
  profileAction?: AccountExperience | null;
  setProfileAction: AccountExperienceSetter;
}) {
  const value = useMemo(
    () => ({ action: profileAction, setAction: setProfileAction }),
    [profileAction, setProfileAction],
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

export function useAccountExperience() {
  return useContext(AccountActionContext)?.action ?? null;
}
