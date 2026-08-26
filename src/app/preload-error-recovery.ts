const RECOVERY_MARKER = "parrot:preload-error-build";

interface RecoveryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface PreloadEventTarget {
  addEventListener(type: "vite:preloadError", listener: (event: Event) => void): void;
}

interface PreloadErrorRecoveryOptions {
  buildIdentity: string;
  target?: PreloadEventTarget;
  getStorage?: () => RecoveryStorage;
  reload?: () => void;
}

export function installPreloadErrorRecovery({
  buildIdentity,
  target = window,
  getStorage = () => window.sessionStorage,
  reload = () => window.location.reload(),
}: PreloadErrorRecoveryOptions) {
  let storage: RecoveryStorage;
  let recoveryUsed = false;

  try {
    storage = getStorage();
    const previousBuild = storage.getItem(RECOVERY_MARKER);
    if (previousBuild !== null) {
      storage.removeItem(RECOVERY_MARKER);
    }
    recoveryUsed = previousBuild === buildIdentity;
  } catch {
    return;
  }

  target.addEventListener("vite:preloadError", (event) => {
    if (recoveryUsed) return;

    try {
      storage.setItem(RECOVERY_MARKER, buildIdentity);
    } catch {
      return;
    }

    recoveryUsed = true;
    event.preventDefault();
    reload();
  });
}
