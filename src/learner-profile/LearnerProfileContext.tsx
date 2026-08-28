import { createContext, useContext, useMemo, type ReactNode } from "react";
import type {
  LearnerProfileRoster,
  LearnerProfileSummary,
} from "./learner-profile-api";

type LearnerProfileContextValue = {
  profile: LearnerProfileSummary;
  replaceProfile: (profile: LearnerProfileSummary) => void;
};

const LearnerProfileContext = createContext<LearnerProfileContextValue | null>(
  null,
);

export type LearnerSelectionContextValue = {
  activeProfileId: string | null;
  createAndSelectLearner: (
    name: string,
    existingProfileIds: readonly string[],
  ) => Promise<LearnerProfileRoster>;
  deleteLearner: (profileId: string) => Promise<LearnerProfileRoster>;
  reloadSelectedLearner: (
    expectedProfileId: string,
  ) => Promise<LearnerProfileSummary>;
  selectLearner: (profileId: string) => Promise<LearnerProfileRoster>;
};

const LearnerSelectionContext =
  createContext<LearnerSelectionContextValue | null>(null);

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

export function LearnerSelectionProvider({
  activeProfileId,
  children,
  createAndSelectLearner,
  deleteLearner,
  reloadSelectedLearner,
  selectLearner,
}: LearnerSelectionContextValue & { children: ReactNode }) {
  const value = useMemo(
    () => ({
      activeProfileId,
      createAndSelectLearner,
      deleteLearner,
      reloadSelectedLearner,
      selectLearner,
    }),
    [
      activeProfileId,
      createAndSelectLearner,
      deleteLearner,
      reloadSelectedLearner,
      selectLearner,
    ],
  );
  return (
    <LearnerSelectionContext.Provider value={value}>
      {children}
    </LearnerSelectionContext.Provider>
  );
}

export function useLearnerSelection() {
  const value = useContext(LearnerSelectionContext);
  if (!value) throw new Error("Learner selection is unavailable.");
  return value;
}
