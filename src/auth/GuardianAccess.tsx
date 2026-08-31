import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  loadGuardianAccess,
  lockGuardianAccess,
  subscribeGuardianAccessRequired,
  unlockGuardianAccess,
  GuardianAccessApiError,
  type GuardianAccessRequestOptions,
  type GuardianAccessState,
} from "./guardian-access-api";

export { notifyGuardianAccessRequired } from "./guardian-access-api";

export type GuardianMode = "loading" | "learner" | "guardian";

export type GuardianAccessContextValue = {
  blockedByLearnerSwitch: boolean;
  mode: GuardianMode;
  expiresAt: string | null;
  error: string;
  retry: () => void;
  unlock: (password: string) => Promise<string | null>;
  lock: () => Promise<string | null>;
};

type GuardianAccessApi = {
  loadGuardianAccess(
    options?: GuardianAccessRequestOptions,
  ): Promise<GuardianAccessState>;
  unlockGuardianAccess(
    password: string,
    options?: GuardianAccessRequestOptions,
  ): Promise<GuardianAccessState>;
  lockGuardianAccess(
    options?: GuardianAccessRequestOptions,
  ): Promise<GuardianAccessState>;
};

type AccessSnapshot = {
  blockedByLearnerSwitch: boolean;
  error: string;
  expiresAt: string | null;
  identity: string | null;
  mode: GuardianMode;
};

type Schedule = (callback: () => void, delay: number) => () => void;

const GuardianAccessContext = createContext<GuardianAccessContextValue | null>(
  null,
);
const FALLBACK_ERROR = "Guardian access could not be checked. Please try again.";
const LOCK_ERROR =
  "Could not lock guardian mode. Try again before handing over the device.";
const STALE_OPERATION_ERROR = "Guardian access changed. Please try again.";
const GUARDIAN_ACCESS_LOCK_CHANNEL = "parrot-guardian-access-lock";

async function guardianAccessLockScopeName(identity: string) {
  if (!globalThis.crypto?.subtle || typeof TextEncoder === "undefined") {
    return null;
  }
  try {
    const digest = await globalThis.crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(identity),
    );
    const scope = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    return `${GUARDIAN_ACCESS_LOCK_CHANNEL}-${scope}`;
  } catch {
    return null;
  }
}

function guardianAccessStorage() {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function guardianAccessLockToken() {
  try {
    if (typeof globalThis.crypto?.randomUUID === "function") {
      return globalThis.crypto.randomUUID();
    }
    if (typeof globalThis.crypto?.getRandomValues !== "function") {
      throw new Error("Secure random values are unavailable.");
    }
    const bytes = new Uint32Array(4);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16)).join("-");
  } catch {
    return `${Date.now()}-${Math.random()}`;
  }
}

function guardianAccessLockMarker(storageKey: string) {
  const storage = guardianAccessStorage();
  if (storage === null) return null;
  try {
    return storage.getItem(storageKey);
  } catch {
    return null;
  }
}

function syncGuardianAccessLock(
  storageKey: string,
  marker: string | null,
) {
  const storage = guardianAccessStorage();
  if (storage === null) return false;
  try {
    if (marker === null) storage.removeItem(storageKey);
    else storage.setItem(storageKey, marker);
    return true;
  } catch {
    // Cross-tab coordination is an additional safeguard, not a mode-switch failure.
    return false;
  }
}

function retainGuardianAccessLockMarker(storageKey: string | null) {
  if (storageKey === null || guardianAccessLockMarker(storageKey) !== null) {
    return;
  }
  syncGuardianAccessLock(storageKey, guardianAccessLockToken());
}

function initialSnapshot(identity: string | null): AccessSnapshot {
  return {
    blockedByLearnerSwitch: false,
    error: "",
    expiresAt: null,
    identity,
    mode: identity === null ? "learner" : "loading",
  };
}

function messageFor(error: unknown) {
  return error instanceof Error && error.message ? error.message : FALLBACK_ERROR;
}

function isDefinitiveGuardianPasswordFailure(error: unknown) {
  return (
    error instanceof GuardianAccessApiError &&
    (error.status === 401 || error.status === 403)
  );
}

function productionSchedule(callback: () => void, delay: number) {
  const timer = setTimeout(callback, delay);
  return () => clearTimeout(timer);
}

function isLiveGuardianState(
  state: GuardianAccessState,
  timestamp: number,
): state is Extract<GuardianAccessState, { mode: "guardian" }> {
  return state.mode === "guardian" && Date.parse(state.expiresAt) > timestamp;
}

export function createGuardianAccessProvider({
  api = {
    loadGuardianAccess,
    lockGuardianAccess,
    unlockGuardianAccess,
  },
  now = Date.now,
  schedule = productionSchedule,
}: {
  api?: GuardianAccessApi;
  now?: () => number;
  schedule?: Schedule;
} = {}) {
  return function GuardianAccessProviderImplementation({
    children,
    sessionIdentity,
  }: {
    children: ReactNode;
    sessionIdentity: string | null;
  }) {
    const [snapshot, setSnapshot] = useState(() =>
      initialSnapshot(sessionIdentity),
    );
    const generationRef = useRef(0);
    const controllerRef = useRef<AbortController | null>(null);
    const identityRef = useRef(sessionIdentity);
    const intentRef = useRef<{
      blocksAutomaticAccess: boolean;
      identity: string | null;
      mode: "guardian" | "learner" | null;
      version: number;
    }>({
      blocksAutomaticAccess: false,
      identity: sessionIdentity,
      mode: null,
      version: 0,
    });
    const settledIntentRef = useRef(0);
    const operationTailRef = useRef<Promise<void>>(Promise.resolve());
    const lockStorageKeyPromise = useMemo(
      () =>
        sessionIdentity === null
          ? Promise.resolve<string | null>(null)
          : guardianAccessLockScopeName(sessionIdentity).then((scope) =>
              scope === null ? null : `${scope}:state`,
            ),
      [sessionIdentity],
    );
    const siblingLockIntentRef = useRef<{
      identity: string;
      version: number;
    } | null>(null);
    identityRef.current = sessionIdentity;

    const isCurrent = useCallback(
      (identity: string, generation: number) =>
        generationRef.current === generation && identityRef.current === identity,
      [],
    );

    const enqueue = useCallback(function enqueueOperation<Result>(
      operation: () => Promise<Result>,
    ) {
      const result = operationTailRef.current.then(
        () => operation(),
        () => operation(),
      );
      operationTailRef.current = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    }, []);

    const beginIntent = useCallback(
      (
        identity: string,
        mode: "guardian" | "learner",
        blocksAutomaticAccess = false,
      ) => {
        const version = intentRef.current.version + 1;
        intentRef.current = {
          blocksAutomaticAccess,
          identity,
          mode,
          version,
        };
        return version;
      },
      [],
    );

    const isLatestIntent = useCallback(
      (
        identity: string,
        mode: "guardian" | "learner",
        version: number,
      ) => {
        const intent = intentRef.current;
        return (
          intent.identity === identity &&
          intent.mode === mode &&
          intent.version === version
        );
      },
      [],
    );

    const applyState = useCallback(
      (
        state: GuardianAccessState,
        identity: string,
        generation: number,
      ) => {
        if (!isCurrent(identity, generation)) return false;
        if (!isLiveGuardianState(state, now())) {
          setSnapshot({ ...initialSnapshot(identity), mode: "learner" });
          return false;
        }
        setSnapshot({
          blockedByLearnerSwitch: false,
          error: "",
          expiresAt: state.expiresAt,
          identity,
          mode: "guardian",
        });
        return true;
      },
      [isCurrent, now],
    );

    const load = useCallback(async (preserveMode = false) => {
      if (sessionIdentity === null) return;
      const identity = sessionIdentity;
      const generation = generationRef.current;
      if (!preserveMode) {
        setSnapshot((current) =>
          current.identity === identity &&
          current.mode === "loading" &&
          current.error === "" &&
          current.expiresAt === null
            ? current
            : {
                ...initialSnapshot(identity),
                blockedByLearnerSwitch:
                  current.identity === identity &&
                  current.blockedByLearnerSwitch,
              },
        );
      }
      await enqueue(async () => {
        if (!isCurrent(identity, generation)) return;
        const controller = new AbortController();
        controllerRef.current = controller;
        let storageKey: string | null = null;
        try {
          storageKey = await lockStorageKeyPromise;
          if (!isCurrent(identity, generation) || controller.signal.aborted) {
            return;
          }
          const intent = intentRef.current;
          if (
            intent.identity === identity &&
            intent.version !== settledIntentRef.current
          ) {
            return;
          }
          const state = await api.loadGuardianAccess({
            signal: controller.signal,
          });
          if (!isCurrent(identity, generation) || controller.signal.aborted) {
            return;
          }
          if (
            storageKey !== null &&
            guardianAccessLockMarker(storageKey) !== null
          ) {
            setSnapshot({
              ...initialSnapshot(identity),
              blockedByLearnerSwitch: true,
              mode: "learner",
            });
            return;
          }
          const settledIntent = intentRef.current;
          if (
            settledIntent.identity === identity &&
            settledIntent.version !== settledIntentRef.current
          ) {
            return;
          }
          const liveGuardianState = isLiveGuardianState(state, now());
          setSnapshot((current) => {
            if (
              current.identity === identity &&
              current.blockedByLearnerSwitch
            ) {
              return {
                ...initialSnapshot(identity),
                blockedByLearnerSwitch: true,
                mode: "learner",
              };
            }
            if (!liveGuardianState) {
              return { ...initialSnapshot(identity), mode: "learner" };
            }
            return {
              blockedByLearnerSwitch: false,
              error: "",
              expiresAt: state.expiresAt,
              identity,
              mode: "guardian",
            };
          });
        } catch (error) {
          if (!isCurrent(identity, generation) || controller.signal.aborted) {
            return;
          }
          const markerBlocksAutomaticAccess =
            storageKey !== null &&
            guardianAccessLockMarker(storageKey) !== null;
          setSnapshot((current) => ({
            blockedByLearnerSwitch:
              markerBlocksAutomaticAccess ||
              (current.identity === identity &&
                current.blockedByLearnerSwitch),
            error: messageFor(error),
            expiresAt: null,
            identity,
            mode: "learner",
          }));
        } finally {
          if (controllerRef.current === controller) controllerRef.current = null;
        }
      });
    }, [enqueue, isCurrent, lockStorageKeyPromise, now, sessionIdentity]);

    useEffect(() => {
      generationRef.current += 1;
      controllerRef.current?.abort();
      controllerRef.current = null;
      operationTailRef.current = Promise.resolve();
      siblingLockIntentRef.current = null;
      const version = intentRef.current.version + 1;
      intentRef.current = {
        blocksAutomaticAccess: false,
        identity: sessionIdentity,
        mode: null,
        version,
      };
      settledIntentRef.current = version;
      if (sessionIdentity === null) setSnapshot(initialSnapshot(null));
      else void load();
      return () => {
        generationRef.current += 1;
        controllerRef.current?.abort();
        controllerRef.current = null;
      };
    }, [load, sessionIdentity]);

    useEffect(() => {
      if (sessionIdentity === null || typeof document === "undefined") return;
      const recheck = () => {
        if (document.visibilityState === "visible") void load(true);
      };
      document.addEventListener("visibilitychange", recheck);
      return () => document.removeEventListener("visibilitychange", recheck);
    }, [load, sessionIdentity]);

    const visibleSnapshot =
      snapshot.identity === sessionIdentity
        ? snapshot
        : initialSnapshot(sessionIdentity);

    const reconcileLearner = useCallback(() => {
      const identity = identityRef.current;
      if (identity === null) return;
      const currentIntent = intentRef.current;
      if (
        currentIntent.identity === identity &&
        currentIntent.mode === "learner" &&
        (currentIntent.blocksAutomaticAccess ||
          currentIntent.version !== settledIntentRef.current)
      ) {
        return;
      }
      const generation = generationRef.current;
      const version = beginIntent(identity, "learner");
      controllerRef.current?.abort();
      controllerRef.current = null;
      setSnapshot({ ...initialSnapshot(identity), mode: "learner" });
      void enqueue(async () => {
        if (!isCurrent(identity, generation)) return;
        try {
          const storageKey = await lockStorageKeyPromise;
          if (
            !isCurrent(identity, generation) ||
            !isLatestIntent(identity, "learner", version)
          ) {
            return;
          }
          retainGuardianAccessLockMarker(storageKey);
          const locked = await api.lockGuardianAccess();
          if (
            !isCurrent(identity, generation) ||
            !isLatestIntent(identity, "learner", version)
          ) {
            return;
          }
          if (locked.mode !== "learner") {
            settledIntentRef.current = version;
            setSnapshot({
              blockedByLearnerSwitch: false,
              error: LOCK_ERROR,
              expiresAt: null,
              identity,
              mode: "learner",
            });
            return;
          }
          const state = await api.loadGuardianAccess();
          if (
            !isCurrent(identity, generation) ||
            !isLatestIntent(identity, "learner", version)
          ) {
            return;
          }
          settledIntentRef.current = version;
          if (state.mode === "learner" || Date.parse(state.expiresAt) <= now()) {
            setSnapshot({ ...initialSnapshot(identity), mode: "learner" });
          } else {
            setSnapshot({
              blockedByLearnerSwitch: false,
              error: LOCK_ERROR,
              expiresAt: null,
              identity,
              mode: "learner",
            });
          }
        } catch {
          if (
            !isCurrent(identity, generation) ||
            !isLatestIntent(identity, "learner", version)
          ) {
            return;
          }
          settledIntentRef.current = version;
          setSnapshot({
            blockedByLearnerSwitch: false,
            error: LOCK_ERROR,
            expiresAt: null,
            identity,
            mode: "learner",
          });
        }
      });
    }, [
      beginIntent,
      enqueue,
      isCurrent,
      isLatestIntent,
      lockStorageKeyPromise,
    ]);

    const collapseToLearner = useCallback((expectedIdentity?: string) => {
      const identity = identityRef.current;
      if (
        identity === null ||
        (expectedIdentity !== undefined && identity !== expectedIdentity)
      ) {
        return;
      }
      const version = beginIntent(identity, "learner", true);
      settledIntentRef.current = version;
      siblingLockIntentRef.current = { identity, version };
      generationRef.current += 1;
      controllerRef.current?.abort();
      controllerRef.current = null;
      setSnapshot({
        ...initialSnapshot(identity),
        blockedByLearnerSwitch: true,
        mode: "learner",
      });
    }, [beginIntent]);

    const compensateSiblingLock = useCallback(
      async (identity: string) => {
        const siblingLock = siblingLockIntentRef.current;
        const intent = intentRef.current;
        if (
          siblingLock === null ||
          siblingLock.identity !== identity ||
          intent.identity !== identity ||
          intent.mode !== "learner" ||
          intent.version !== siblingLock.version
        ) {
          return;
        }
        try {
          const state = await api.lockGuardianAccess();
          if (
            state.mode === "learner" &&
            siblingLockIntentRef.current === siblingLock &&
            isLatestIntent(identity, "learner", siblingLock.version)
          ) {
            settledIntentRef.current = siblingLock.version;
          }
        } catch {
          // The sibling already locked successfully; retain the local fail-closed UI.
        }
      },
      [api, isLatestIntent],
    );

    const compensateGuardianUnlock = useCallback(
      async (
        identity: string,
        generation: number,
        storageKey: string | null,
        latestVersion?: number,
      ) => {
        if (
          !isCurrent(identity, generation) ||
          (latestVersion !== undefined &&
            !isLatestIntent(identity, "guardian", latestVersion))
        ) {
          return;
        }
        retainGuardianAccessLockMarker(storageKey);
        try {
          await api.lockGuardianAccess();
        } catch {
          // The caller remains in learner mode even if the best-effort lock fails.
        }
      },
      [api, isCurrent, isLatestIntent],
    );

    useEffect(() => {
      if (
        visibleSnapshot.mode !== "guardian" ||
        visibleSnapshot.expiresAt === null
      ) {
        return;
      }
      const identity = sessionIdentity;
      const expiresAt = visibleSnapshot.expiresAt;
      return schedule(() => {
        const current = snapshot;
        if (
          identity !== null &&
          current.identity === identity &&
          current.expiresAt === expiresAt
        ) {
          reconcileLearner();
        }
      }, Math.max(0, Date.parse(expiresAt) - now()));
    }, [
      reconcileLearner,
      sessionIdentity,
      snapshot,
      visibleSnapshot.expiresAt,
      visibleSnapshot.mode,
    ]);

    useEffect(
      () => subscribeGuardianAccessRequired(reconcileLearner),
      [reconcileLearner],
    );

    useEffect(() => {
      if (sessionIdentity === null) return;
      const identity = sessionIdentity;
      let receiveStorage: ((event: StorageEvent) => void) | null = null;
      let disposed = false;
      void lockStorageKeyPromise.then((storageKey) => {
        if (
          disposed ||
          storageKey === null ||
          identityRef.current !== identity
        ) {
          return;
        }
        try {
          receiveStorage = (event) => {
            if (
              identityRef.current === identity &&
              event.key === storageKey &&
              event.newValue !== null &&
              guardianAccessLockMarker(storageKey) === event.newValue
            ) {
              collapseToLearner(identity);
            }
          };
          window.addEventListener("storage", receiveStorage);
          const intent = intentRef.current;
          const unlockIsAwaitingScope =
            intent.identity === identity &&
            intent.mode === "guardian" &&
            intent.version !== settledIntentRef.current;
          if (
            !unlockIsAwaitingScope &&
            guardianAccessLockMarker(storageKey) !== null
          ) {
            collapseToLearner(identity);
          }
        } catch {
          // Storage may be unavailable; visibility rechecks remain authoritative.
        }
      });
      return () => {
        disposed = true;
        if (receiveStorage !== null) {
          window.removeEventListener("storage", receiveStorage);
        }
      };
    }, [collapseToLearner, lockStorageKeyPromise, sessionIdentity]);

    const unlock = useCallback(
      async (password: string) => {
        if (sessionIdentity === null) return FALLBACK_ERROR;
        const identity = sessionIdentity;
        const generation = generationRef.current;
        const version = beginIntent(identity, "guardian");
        setSnapshot({ ...initialSnapshot(identity), mode: "learner" });
        return enqueue(async () => {
          if (!isCurrent(identity, generation)) return STALE_OPERATION_ERROR;
          const storageKey = await lockStorageKeyPromise;
          if (!isCurrent(identity, generation)) return STALE_OPERATION_ERROR;
          const lockMarkerBeforeUnlock =
            storageKey === null ? null : guardianAccessLockMarker(storageKey);
          const controller = new AbortController();
          controllerRef.current = controller;
          try {
            const state = await api.unlockGuardianAccess(password, {
              signal: controller.signal,
            });
            const unlockIsCurrent = isCurrent(identity, generation);
            const newerGuardianIntent =
              intentRef.current.identity === identity &&
              intentRef.current.mode === "guardian";
            if (
              !unlockIsCurrent ||
              !isLatestIntent(identity, "guardian", version)
            ) {
              if (
                unlockIsCurrent &&
                newerGuardianIntent &&
                state.mode === "guardian"
              ) {
                await compensateGuardianUnlock(identity, generation, storageKey);
              } else {
                await compensateSiblingLock(identity);
              }
              return STALE_OPERATION_ERROR;
            }
            const lockMarkerAfterUnlock =
              storageKey === null ? null : guardianAccessLockMarker(storageKey);
            if (
              lockMarkerAfterUnlock !== null &&
              lockMarkerAfterUnlock !== lockMarkerBeforeUnlock
            ) {
              collapseToLearner(identity);
              await compensateSiblingLock(identity);
              return STALE_OPERATION_ERROR;
            }
            settledIntentRef.current = version;
            if (!applyState(state, identity, generation)) {
              if (state.mode === "guardian") {
                await compensateGuardianUnlock(
                  identity,
                  generation,
                  storageKey,
                  version,
                );
              }
              if (
                !isCurrent(identity, generation) ||
                !isLatestIntent(identity, "guardian", version)
              ) {
                return STALE_OPERATION_ERROR;
              }
              return FALLBACK_ERROR;
            }
            if (storageKey !== null) syncGuardianAccessLock(storageKey, null);
            return null;
          } catch (error) {
            const unlockIsCurrent = isCurrent(identity, generation);
            const newerGuardianIntent =
              intentRef.current.identity === identity &&
              intentRef.current.mode === "guardian";
            if (
              !unlockIsCurrent ||
              !isLatestIntent(identity, "guardian", version)
            ) {
              if (
                unlockIsCurrent &&
                newerGuardianIntent &&
                !isDefinitiveGuardianPasswordFailure(error)
              ) {
                await compensateGuardianUnlock(identity, generation, storageKey);
              } else {
                await compensateSiblingLock(identity);
              }
              return STALE_OPERATION_ERROR;
            }
            const message = messageFor(error);
            if (!isDefinitiveGuardianPasswordFailure(error)) {
              await compensateGuardianUnlock(
                identity,
                generation,
                storageKey,
                version,
              );
            }
            if (
              !isCurrent(identity, generation) ||
              !isLatestIntent(identity, "guardian", version)
            ) {
              return STALE_OPERATION_ERROR;
            }
            settledIntentRef.current = version;
            setSnapshot({
              blockedByLearnerSwitch: false,
              error: "",
              expiresAt: null,
              identity,
              mode: "learner",
            });
            return message;
          } finally {
            if (controllerRef.current === controller) {
              controllerRef.current = null;
            }
          }
        });
      }, [
        applyState,
        beginIntent,
        enqueue,
        compensateSiblingLock,
        compensateGuardianUnlock,
        collapseToLearner,
        isCurrent,
        isLatestIntent,
        lockStorageKeyPromise,
        sessionIdentity,
      ],
    );

    const lock = useCallback(async () => {
      if (sessionIdentity === null) return FALLBACK_ERROR;
      const identity = sessionIdentity;
      const generation = generationRef.current;
      const version = beginIntent(identity, "learner", true);
      setSnapshot((current) =>
        current.identity === identity ? { ...current, error: "" } : current,
      );
      return enqueue(async () => {
        if (!isCurrent(identity, generation)) return STALE_OPERATION_ERROR;
        const storageKey = await lockStorageKeyPromise;
        if (!isCurrent(identity, generation)) return STALE_OPERATION_ERROR;
        try {
          const state = await api.lockGuardianAccess();
          if (
            !isCurrent(identity, generation) ||
            !isLatestIntent(identity, "learner", version)
          ) {
            return STALE_OPERATION_ERROR;
          }
          if (state.mode !== "learner") {
            intentRef.current = {
              blocksAutomaticAccess: false,
              identity,
              mode: null,
              version,
            };
            settledIntentRef.current = version;
            setSnapshot((current) =>
              current.identity === identity
                ? { ...current, error: LOCK_ERROR }
                : current,
            );
            return LOCK_ERROR;
          }
          settledIntentRef.current = version;
          setSnapshot({
            ...initialSnapshot(identity),
            blockedByLearnerSwitch: true,
            mode: "learner",
          });
          if (storageKey !== null) {
            syncGuardianAccessLock(storageKey, guardianAccessLockToken());
          }
          return null;
        } catch {
          if (
            !isCurrent(identity, generation) ||
            !isLatestIntent(identity, "learner", version)
          ) {
            return STALE_OPERATION_ERROR;
          }
          intentRef.current = {
            blocksAutomaticAccess: false,
            identity,
            mode: null,
            version,
          };
          settledIntentRef.current = version;
          setSnapshot((current) =>
            current.identity === identity
              ? { ...current, error: LOCK_ERROR }
              : current,
          );
          return LOCK_ERROR;
        }
      });
    }, [
      beginIntent,
      enqueue,
      isCurrent,
      isLatestIntent,
      lockStorageKeyPromise,
      sessionIdentity,
    ]);

    const value = useMemo<GuardianAccessContextValue>(
      () => ({
        blockedByLearnerSwitch: visibleSnapshot.blockedByLearnerSwitch,
        error: visibleSnapshot.error,
        expiresAt: visibleSnapshot.expiresAt,
        lock,
        mode: visibleSnapshot.mode,
        retry: () => void load(),
        unlock,
      }),
      [load, lock, unlock, visibleSnapshot],
    );

    return (
      <GuardianAccessContext.Provider value={value}>
        {children}
      </GuardianAccessContext.Provider>
    );
  };
}

const ProductionGuardianAccessProvider = createGuardianAccessProvider();

export function GuardianAccessProvider(props: {
  children: ReactNode;
  sessionIdentity: string | null;
}) {
  return <ProductionGuardianAccessProvider {...props} />;
}

export function useGuardianAccess() {
  const value = useContext(GuardianAccessContext);
  if (value === null) {
    throw new Error("useGuardianAccess() requires GuardianAccessProvider.");
  }
  return value;
}
