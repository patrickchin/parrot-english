import {
  createContext,
  useContext,
  useEffect,
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

const AccountActionContext = createContext<AccountExperienceSetter | null>(
  null,
);

export function AccountActionProvider({
  children,
  setProfileAction,
}: {
  children: ReactNode;
  setProfileAction: AccountExperienceSetter;
}) {
  return (
    <AccountActionContext.Provider value={setProfileAction}>
      {children}
    </AccountActionContext.Provider>
  );
}

export function useProfileAccountAction(action: AccountExperience | null) {
  const setProfileAction = useContext(AccountActionContext);

  useEffect(() => {
    if (!setProfileAction) return;
    setProfileAction(action);
    return () =>
      setProfileAction((current) => (current === action ? null : current));
  }, [action, setProfileAction]);
}
