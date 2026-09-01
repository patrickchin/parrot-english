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
  storySettings: {
    backToDashboard: "Back to guardian dashboard",
    title: "Story settings",
    chooseLevel: "Choose story level",
    levelSummary: "Selected story level details",
    shelfBefore: "This shelf opens first for ",
    shelfAfter: ". Every story shelf is still available.",
    cefrLabel: "CEFR",
    loading: "Loading story settings…",
    saving: "Saving story level…",
    saved: (level: string) => `Story level saved: ${level}.`,
    levels: {
      "first-words": {
        label: "Level 1 · Words & pictures",
        cefrReference: "Entry Pre-A1",
        description: "A few familiar words on each page.",
      },
      "repeating-patterns": {
        label: "Level 2 · Repeating stories",
        cefrReference: "Supported Pre-A1",
        description: "Short sentences repeat so you can join in.",
      },
      "tiny-stories": {
        label: "Level 3 · Short stories",
        cefrReference: "Secure Pre-A1",
        description: "Short sentences tell a whole story.",
      },
      "early-a1": {
        label: "Level 4 · Longer stories",
        cefrReference: "Pre-A1 to A1 bridge",
        description: "More words and pages build a fuller story.",
      },
    },
    errors: {
      "load-failed": "Story settings could not be loaded.",
      "save-level-failed": "Story level could not be saved.",
    },
  },
  personalizedArt: {
    sectionLabel: "Personalized story art",
    aiPrivate: "AI · Private",
    headingBeforeStory: "Make page one of ",
    headingAfterStory: " look like ",
    descriptionBeforeName:
      "This is optional. A cropped copy goes to Cloudflare Workers AI. Parrot adds only ",
    descriptionAfterName:
      "'s private storybook-style picture to this account, and you can delete it anytime.",
    uploadBeforeName: "Upload ",
    uploadAfterName: "'s photo",
    selectedFile: (fileName: string) => `Selected: ${fileName}`,
    photoSelected: "Photo selected.",
    noPhoto: "No photo chosen yet.",
    consentBeforeName: "I am 18 or older. I confirm I am ",
    consentAfterName:
      "'s guardian or have permission to use this photo, and I agree to send a cropped copy to Cloudflare Workers AI to make the illustration.",
    creating: "Creating story art…",
    generate: "Generate story art",
    regenerate: "Regenerate story art",
    delete: "Delete story art",
    cleanupLabel: "Private art cleanup",
    cleanupTitleBeforeName: "Remove ",
    cleanupTitleAfterName: "'s stored story art",
    cleanupDescriptionBeforeName:
      "New generation is unavailable, but ",
    cleanupDescriptionAfterName:
      "'s private story art can still be deleted. If an earlier purge failed, this retries it.",
    deleteStored: "Delete stored story art",
    deletingStored: "Deleting stored story art…",
    preview: "Preview",
    previewLabel: "Storybook portrait preview",
    previewBeforeName: "",
    previewAfterName:
      "'s private storybook-style portrait will appear here.",
    generatedAlt: (name: string, storyTitle: string) =>
      `Personalized story art for ${name} in ${storyTitle}`,
    errors: {
      "load-failed": "Personalized story art could not be loaded.",
      "generate-failed": "Story art could not be generated.",
      "delete-failed": "Story art could not be deleted.",
    },
    statuses: {
      ready: "Story art ready",
      removed: "Personalized story art removed.",
    },
  },
  dubbingSettings: {
    backToDashboard: "Back to guardian dashboard",
    title: "Voice dubbing",
    loading: "Loading voice dubbing settings…",
    availableTitle: "Voice dubbing is available",
    savedCount: (saved: number, total: number) =>
      `${saved} of ${total} clips saved; `,
    savedCountAfterName:
      " can record and replace lines across every nursery rhyme.",
    privacyBeforeName: "Saved voice clips are private to ",
    privacyAfterName:
      "'s profile. A new take replaces the saved clip for that rhyme line.",
    deleteAllGuidance:
      "This Guardian page only deletes every saved clip; it does not delete individual lines.",
    deleteBeforeName: "Delete ",
    deleteAfterName: "'s saved nursery-rhyme voice clips",
    deleting: "Removing voice clips…",
    emptyTitle: "No saved voice clips",
    emptyBeforeName: "",
    emptyAfterName: " has no saved nursery-rhyme voice clips.",
    cleanupTitle: "Voice clip removal needs to finish",
    cleanupBeforeName: "",
    cleanupAfterName:
      "'s voice dubbing stays unavailable in every nursery rhyme until every saved clip has been removed.",
    finishCleanup: "Finish removing nursery-rhyme clips",
    removedBeforeName: "",
    removedAfterName: "'s nursery-rhyme voice clips were removed.",
    errors: {
      "load-failed": "Voice dubbing settings could not be loaded.",
      "change-failed": "Voice dubbing settings could not be changed.",
    },
  },
  accountPrivacy: {
    backToDashboard: "Back to Guardian dashboard",
    title: "Account & privacy",
    aiDataTitle: "AI and saved data",
    aiUseTitle: "How Parrot uses AI",
    aiUseBody:
      "AI helps turn speech into text, check spoken answers, run voice conversations, and make optional story art.",
    aiWarning:
      "AI can hear words wrongly or say something wrong. Please check speech feedback and stay nearby during voice chats.",
    accountKeepsTitle: "What this account keeps",
    keepsProfiles:
      "Parrot keeps all learner profiles and their saved data, including conversation words as text. A conversation that ends early may still have saved text.",
    keepsTarget:
      "Choosing a learner in Guardian settings changes only which learner’s data you manage. Learner mode changes only through Switch to learner, where you choose who will use the session.",
    keepsActivityAudio:
      "Voice services process audio during Talk to Peppa, learner setup, and speech checks, but Parrot does not save that activity audio to the account.",
    keepsDubbing:
      "Voice-dubbing rhymes save that learner’s private voice clips to the account. A new take replaces the saved clip for that line, and the Guardian can delete every saved clip.",
    keepsLessons:
      "Lessons save one private voice clip for each join-in moment. A new take replaces the previous take for that moment. Parrot does not score or transcribe these clips yet. Stopping lesson recording or deleting the account deletes them.",
    keepsLessonProfiles:
      "Saved lesson recordings are managed independently for each selected learner profile.",
    keepsStoryArt:
      "If a grown-up chooses story art, a cropped photo is sent to Cloudflare Workers AI. The photo is not added to the account. Parrot keeps each learner’s private storybook picture until it is deleted.",
    outsideServices:
      "Outside AI and voice services process some inputs under their own retention rules.",
    actionsTitle: "What you can do",
    actionsBody:
      "A learner can finish a conversation at any time. In Guardian mode, choose a learner to manage their saved details, lesson voice recordings, nursery-rhyme voice clips, and optional story art.",
    deletionBody:
      "Delete account removes the account, all learner profiles and their saved data, including saved conversation text, private voice clips from all nursery rhymes, lesson voice recordings, and private story art. A small deletion marker stays so old private art cannot return.",
    technicalLabel: "Technical build details",
    technicalTitle: "Technical build details",
    technicalSubtitle: "Versions and AI services for troubleshooting",
    technicalBody:
      "Current services include Cloudflare for hosting and story art, LiveKit for live voice transport, OpenAI for live voice, and Groq for speech checks and profile summaries. Some saved lesson and profile audio was made with ElevenLabs before deployment.",
    webApp: "Web app",
    worker: "Cloudflare Worker",
    agent: "Conversation agent",
    gitCommit: "Git commit",
    deployment: "Deployment",
    uploaded: "Uploaded",
    lastReported: "Last reported",
    realtimeModel: "Realtime voice model",
    transcriptionModel: "Input transcription",
    loadingTechnical: "Loading technical details…",
    technicalFailed:
      "Technical details could not load. The AI and saved data notes above are still available.",
    agentMissing:
      "Not reported yet. It reports its build when it starts a conversation.",
    matchesWeb: "Matches the web commit",
    differsFromWeb: "Different commit from the web app",
    workerDeployment: (deploymentId: string) =>
      `Worker deployment ${deploymentId}`,
    missingValue: "Not available",
    dangerTitle: "Danger zone",
    dangerBody: "Permanently remove this account and its saved learner data.",
    deleteAccount: "Delete account",
    deleteDialog: {
      cannotUndo: "Cannot be undone",
      title: "Delete account",
      description:
        "This removes your account, all learner profiles, saved conversation text, private voice clips from all nursery rhymes, lesson voice recordings, and private story art from Parrot. A small deletion marker stays so old private art cannot return.",
      password: "Password",
      cancel: "Cancel",
      deleting: "Deleting account…",
      confirm: "Delete account now",
      errors: {
        "account-delete-failed":
          "Unable to delete the account. The account and private story art were kept. Please try again.",
      },
    },
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
    identityCheck: {
      checkingTitle: "Checking the current learner",
      checkingDescription: "Please wait before making changes.",
      failedTitle: "We couldn't verify the current learner",
      failedDescription:
        "Try again before continuing so changes are saved for the right learner.",
    },
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
