import {
  createContext,
  useContext,
  useEffect,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

export type ProfileAccountAction = {
  error: string;
  onOpen: () => void;
} | null;

type ProfileActionSetter = Dispatch<SetStateAction<ProfileAccountAction>>;

const AccountActionContext = createContext<ProfileActionSetter | null>(null);

export function AccountActionProvider({
  children,
  setProfileAction,
}: {
  children: ReactNode;
  setProfileAction: ProfileActionSetter;
}) {
  return (
    <AccountActionContext.Provider value={setProfileAction}>
      {children}
    </AccountActionContext.Provider>
  );
}

export function useProfileAccountAction(action: ProfileAccountAction) {
  const setProfileAction = useContext(AccountActionContext);

  useEffect(() => {
    if (!setProfileAction) return;
    setProfileAction(action);
    return () =>
      setProfileAction((current) => (current === action ? null : current));
  }, [action, setProfileAction]);
}
