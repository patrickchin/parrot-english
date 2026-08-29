import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { GuardianLearnerTarget, useGuardianLearnerTarget } from "../../src/learner-profile/GuardianLearnerTarget";
import "../../src/styles.css";

const profiles = [
  {
    age: 6,
    createdAt: "2026-08-25T08:00:00.000Z",
    deletionPending: false,
    id: "learner-mia",
    name: "Mia",
    profileStatus: "completed" as const,
  },
  {
    age: null,
    createdAt: "2026-08-26T08:00:00.000Z",
    deletionPending: false,
    id: "learner-noah",
    name: "Noah the Extraordinary Space Explorer",
    profileStatus: "not_started" as const,
  },
  {
    age: 8,
    createdAt: "2026-08-27T08:00:00.000Z",
    deletionPending: false,
    id: "learner-alexandria",
    name: "Alexandria the Magnificent Storyteller",
    profileStatus: "in_progress" as const,
  },
];

globalThis.fetch = async () =>
  Response.json({ activeProfileId: "learner-mia", profiles });

function Fixture() {
  const state = useGuardianLearnerTarget();
  return (
    <main className="min-h-dvh w-full bg-placeholder px-2 py-6">
      <GuardianLearnerTarget state={state} />
      <output aria-label="Selected learner ID">
        {state.learnerProfileId ?? "unresolved"}
      </output>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <Fixture />
  </BrowserRouter>,
);
