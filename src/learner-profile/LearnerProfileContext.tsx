import { createContext, useContext, type ReactNode } from "react";
import type { LearnerProfileSummary } from "./learner-profile-api";

type LearnerProfileContextValue = {
  profile: LearnerProfileSummary;
  replaceProfile: (profile: LearnerProfileSummary) => void;
};

const LearnerProfileContext =
  createContext<LearnerProfileContextValue | null>(null);

export function LearnerProfileProvider({
  children,
  profile,
  replaceProfile,
}: LearnerProfileContextValue & { children: ReactNode }) {
  return (
    <LearnerProfileContext.Provider value={{ profile, replaceProfile }}>
      {children}
    </LearnerProfileContext.Provider>
  );
}

export function useLearnerProfile() {
  const value = useContext(LearnerProfileContext);
  if (!value) throw new Error("Learner profile is unavailable.");
  return value;
}
