export const englishGuardianMessages = {
  language: {
    controlLabel: "Guardian guidance language",
    englishOption: "English",
    chineseOption: "中文",
  },
  common: {
    cancel: "Cancel",
    retry: "Try again",
    back: "Back",
    pageNavigation: "Page navigation",
    save: "Save",
    saving: "Saving…",
  },
  auth: {
    checkingSession: "Checking your session…",
    sessionUnavailableTitle: "Sign-in is temporarily unavailable",
    sessionUnavailableBody: "Check your connection, then try again.",
    createAccountTitle: "Create your account",
    welcomeBackTitle: "Welcome back",
    signUpHelp:
      "Use the grown-up’s name for this Guardian account. You can add learner profiles next.",
    modeLabel: "Choose sign in or sign up",
    signIn: "Sign in",
    signUp: "Sign up",
    accountName: "Account name",
    email: "Email",
    password: "Password",
    passwordHint: "At least 8 characters",
    securityCheck: "Security check",
    securityComplete: "Security check complete.",
    securityChecking: "Checking that you’re human…",
    securityUnavailable:
      "Guest access and sign-up are temporarily unavailable.",
    securityLoadFailed:
      "The security check could not load. Refresh and try again.",
    securityHelp:
      "The security check is needed only for guest access and new accounts.",
    creatingAccount: "Creating account…",
    signingIn: "Signing in…",
    createAccount: "Create account",
    signInAndStart: "Sign in and start",
    or: "or",
    continuingAsGuest: "Continuing as guest…",
    continueAsGuest: "Continue as guest",
    errors: {
      "name-required": "Enter your name.",
      "invalid-email": "Enter a valid email address.",
      "password-too-short": "Password must be at least 8 characters.",
      "email-registered":
        "This email is already registered. Sign in instead.",
      "invalid-credentials": "The email or password is incorrect.",
      "security-check-required":
        "Complete the security check, then try again.",
      "security-check-rejected":
        "The security check expired or was rejected. Please try again.",
      "sign-in-failed": "Unable to sign you in. Please try again.",
      "sign-out-failed": "Sign out did not finish.",
    },
  },
  guardianAccess: {
    errors: {
      "check-failed": "Guardian access could not be checked. Please try again.",
      "lock-failed":
        "Could not lock guardian mode. Try again before handing over the device.",
      "access-changed": "Guardian access changed. Please try again.",
    },
  },
  unlock: {
    title: "Switch to guardian mode",
    body: "Guardian tools and learner activities stay in separate modes.",
    pending: "Switching modes…",
    action: "Switch to guardian mode",
  },
  guardianDashboard: {
    title: "Guardian dashboard",
    switchToLearner: "Switch to learner",
    learnerProfilesTitle: "Learner profiles",
    learnerProfilesDescription:
      "Add, edit, or delete learner profiles. You’ll choose a learner when switching to learner mode.",
    manageLearners: "Manage learners",
    learningContentTitle: "Learning & content",
    storySettingsTitle: "Story settings",
    storySettingsDescription:
      "Choose the story level and personalized story options.",
    openStorySettings: "Open story settings",
    voiceDubbingTitle: "Voice dubbing",
    voiceDubbingDescription:
      "Review and delete private nursery-rhyme voice clips.",
    manageVoiceDubbing: "Manage voice dubbing",
    accountPrivacyTitle: "Account & privacy",
    accountPrivacyDescription:
      "Review how AI is used, what Parrot saves, and account deletion controls.",
    openAccountPrivacy: "Open account & privacy",
  },
  modeBoundary: {
    checkingTitle: "Checking guardian access…",
    checkingDescription: "Confirming which profile can use this screen.",
    loadingTitle: "Loading…",
    loadingDescription: "Getting your activity ready.",
    backToDashboard: "Back to Guardian dashboard",
  },
  learnerSwitch: {
    title: "Who is learning now?",
    description: "Choose who will use learner mode.",
    loading: "Loading learners…",
    loadFailed: "Learner profiles could not be loaded.",
    profilesLabel: "Learner profiles",
    empty: "Add a learner before switching to learner mode.",
    manageLearners: "Manage learners",
    startAs: (name: string) => `Start learner mode as ⁨${name}⁩`,
    starting: (name: string) => `Starting ⁨${name}⁩…`,
    startingStatus: (name: string) =>
      `Starting learner mode as ⁨${name}⁩…`,
    errors: {
      "select-failed": "Could not select this learner. Try again.",
      "lock-failed":
        "Could not lock guardian mode. Try again before handing over the device.",
    },
  },
  learnerTarget: {
    loading: "Loading learner settings…",
    loadFailed: "Learner profiles could not be loaded.",
    noLearners: "No learners yet.",
    addLearner: "Add learner",
    invalidTarget: "The learner target in this page link could not be found.",
    manageLearners: "Manage learners",
    chooserLabel: "Choose learner settings target",
    learnerMode: "Learner mode",
    editingFor: (name: string) => `Editing settings for ⁨${name}⁩`,
  },
  learners: {
    roster: {
      backToDashboard: "Back to guardian dashboard",
      backToDashboardAria: "Back to guardian dashboard",
      title: "Manage learners",
      loading: "Loading learner profiles…",
      age: (age: number) => `Age ${age}`,
      ageMissing: "Age not added",
      setupStatuses: {
        completed: "Setup complete",
        in_progress: "Setup in progress",
        not_started: "Setup not started",
      },
      editProfile: "Edit profile",
      editProfileAria: (name: string) => `Edit ${name}'s profile`,
      delete: "Delete",
      deleteAria: (name: string) => `Delete ${name}`,
      deleting: "Deleting ",
      finishDeleting: "Finish deleting ",
      finishDeletingAria: (name: string) => `Finish deleting ${name}`,
      lastLearnerBefore: "Add another learner before deleting ",
      lastLearnerAfter: ".",
      addTitle: "Add learner",
      addDescription:
        "Use the name they like to be called. You can add their other details next.",
      preferredName: "Preferred name",
      adding: "Adding learner…",
      add: "Add learner",
      deletedStatusBefore: "",
      deletedStatusAfter: " was deleted.",
      errors: {
        "load-failed": "Learner profiles could not be loaded.",
        "add-failed": "The learner could not be added.",
        "last-learner": "Add another learner before deleting this learner.",
        "learner-busy":
          "Finish this learner's current conversation, then try again.",
        "cleanup-pending":
          "Learner cleanup is still in progress. Try again.",
        "deletion-uncertain":
          "We couldn't confirm whether this learner was deleted. Refresh learner profiles before trying again.",
        "delete-failed": "The learner was not deleted. Try again.",
      },
    },
    deleteDialog: {
      cannotUndo: "Cannot be undone",
      titleBefore: "Delete ",
      titleAfter: "?",
      descriptionBefore: "This removes ",
      descriptionAfter:
        "'s learner profile and private learner data. Your Guardian account and other learners remain.",
      alertBefore: "Could not delete ",
      cancel: "Cancel",
      deleteBefore: "Delete ",
      deletingBefore: "Deleting ",
    },
    details: {
      loadingTitle: "Loading learner details…",
      loadingDescription: "Getting this learner’s saved details ready.",
      errorTitle: "Learner details are taking a break",
      loadFailed: "The learner profile could not be loaded.",
      backToRoster: "Back to Manage learners",
    },
    profile: {
      back: "Back",
      managing: (name: string) => `Managing ${name}`,
      managingBefore: "Managing ",
      managingAfter: "",
      title: "Learner details",
      loading: "Loading your profile…",
      loadErrorTitle: "Profile is taking a break",
      description: "These details personalize chats and lessons.",
      savedAnswersHelper:
        "We save your answers. A grown-up can change your name and age.",
      name: "Name",
      age: "Age",
      aboutBefore: "About ",
      aboutAfter: "",
      aboutFallback: "this learner",
      descriptionPlaceholder: "Add a short description",
      recordingTitle: "Lesson voice recordings",
      recordingDescription:
        "Recording is available automatically during each join-in moment. Clips apply only to this learner profile, and one latest clip is saved per join-in moment. You can delete every saved clip here at any time.",
      recordingAvailable: "Lesson recording is available automatically.",
      recordingCleanupPending:
        "Saved lesson recordings are still being deleted.",
      deleteRecordings: "Delete saved lesson recordings",
      finishDeletingRecordings: "Finish deleting lesson recordings",
      deleteRecordingsConfirm:
        "Delete all saved lesson voice recordings? This cannot be undone.",
      redoTitle: "Redo learner setup",
      redoDescription:
        "Answer Peppa’s setup questions again. For a normal chat, go Home and choose Talk to Peppa.",
      redoAction: "Redo setup questions",
      peppaAlt: "Peppa smiling",
      saveChanges: "Save changes",
      saving: "Saving…",
      cancel: "Cancel",
      pageErrors: {
        "load-failed": "The learner profile could not be loaded.",
        "save-failed": "The learner profile could not be saved.",
        "recording-choice-failed":
          "The lesson recording choice could not be saved.",
      },
      fieldErrors: {
        "answer-required": "Please enter an answer.",
        "question-unavailable": "This question is no longer available.",
        "description-required": "Please enter a description.",
        "too-long": "Please shorten this answer and try again.",
        "private-details":
          "Do not share your school, home address, phone, email, or password.",
        "preferred-name": "Please use only your first name or nickname.",
        "age-whole-number":
          "Please tell me your age using a whole number.",
        "check-answer": "Please check this answer and try again.",
      },
    },
    setup: {
      loading: "Loading your questions…",
      loadErrorTitle: "Questions are taking a break",
      loadErrorDescription:
        "Your questions could not be loaded. Please try again.",
      finishing: "Finishing your profile…",
      questionCount: (count: number, resuming: boolean) =>
        `Answer ${count}${resuming ? " more" : ""} ${count === 1 ? "question" : "questions"}`,
      description:
        "We save your answers. A grown-up can change your name and age.",
      start: "Start questions",
      continue: "Continue questions",
      skip: "Skip for now",
      peppaAlt: "Peppa waving hello",
    },
    question: {
      progress: (current: number, total: number) =>
        `Question ${current} of ${total}`,
      replay: "Replay question",
      peppaAlt: "Peppa, your English host",
      answer: "Your answer",
      speak: "Speak your answer",
      back: "Back",
      skipQuestion: "Skip question",
      skip: "Skip for now",
      save: "Save",
      next: "Next",
      operationFailed: "Something went wrong. Please try again.",
      operationErrors: {
        "sound-start-failed":
          "Sound did not play. You can keep going or tap the speaker button.",
        "sound-replay-failed":
          "Sound did not play. Tap the speaker button again.",
        "voice-failed":
          "Voice answer could not finish. You can still type your answer.",
        "try-again": "Please try again.",
        "skip-failed": "Skip for now could not finish.",
        "question-skip-failed": "Skip question could not finish.",
      },
      statuses: {
        opening: "Opening mic…",
        recording: "Listening…",
        transcribing: "Writing…",
        saving: "Thinking…",
        ready: "Ready.",
      },
    },
    acknowledgment: {
      next: "Next",
      peppaAlt: "Peppa smiling",
    },
  },
  account: {
    label: "Account",
    profileLabel: (name: string, mode: string) =>
      `Profile for ${name}, ${mode} mode`,
    signingOutProfileLabel: (profile: string) => `Signing out… ${profile}`,
    guardian: "Guardian",
    guardianModeStatus: "Guardian mode",
    learner: "Learner",
    learnerModeStatus: "Learner mode",
    activeProfile: "Active profile",
    menuLabel: "Account menu",
    grownUpAccess: "Grown-up access",
    switchingModes: "Switching modes…",
    switchModes: "Switch modes",
    guardianDashboard: "Guardian dashboard",
    manageLearners: "Manage learners",
    accountPrivacy: "Account & privacy",
    signOut: "Sign out",
    signingOut: "Signing out…",
    signOutAgain: "Sign out again",
  },
  learnerBoundary: {
    grownUpAccessHelper: "",
    guardianAccessErrorHelper: "",
    switchToLearnerHelper: "",
    chooseLearnerTitleHelper: "",
    chooseLearnerBodyHelper: "",
    savedAnswersHelper: "",
    recordingPermissionHelper: "",
    recordingCautionHelper: "",
  },
} as const;

type WidenMessages<T> = T extends (...args: infer Args) => string
  ? (...args: Args) => string
  : T extends string
    ? string
    : { readonly [Key in keyof T]: WidenMessages<T[Key]> };

export type GuardianMessages = WidenMessages<typeof englishGuardianMessages>;
