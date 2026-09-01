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
