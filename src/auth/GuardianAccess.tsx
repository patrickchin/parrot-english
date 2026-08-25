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
  type GuardianAccessRequestOptions,
  type GuardianAccessState,
} from "./guardian-access-api";

export { notifyGuardianAccessRequired } from "./guardian-access-api";

export type GuardianMode = "loading" | "learner" | "guardian";

export type GuardianAccessContextValue = {
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

function initialSnapshot(identity: string | null): AccessSnapshot {
  return {
    error: "",
    expiresAt: null,
    identity,
    mode: identity === null ? "learner" : "loading",
  };
}

function messageFor(error: unknown) {
  return error instanceof Error && error.message ? error.message : FALLBACK_ERROR;
}

function productionSchedule(callback: () => void, delay: number) {
  const timer = setTimeout(callback, delay);
  return () => clearTimeout(timer);
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
      identity: string | null;
      mode: "guardian" | "learner" | null;
      version: number;
    }>({ identity: sessionIdentity, mode: null, version: 0 });
    const settledIntentRef = useRef(0);
    const operationTailRef = useRef<Promise<void>>(Promise.resolve());
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
      (identity: string, mode: "guardian" | "learner") => {
        const version = intentRef.current.version + 1;
        intentRef.current = { identity, mode, version };
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
        if (!isCurrent(identity, generation)) return;
        if (
          state.mode === "learner" ||
          Date.parse(state.expiresAt) <= now()
        ) {
          setSnapshot({ ...initialSnapshot(identity), mode: "learner" });
          return;
        }
        setSnapshot({
          error: "",
          expiresAt: state.expiresAt,
          identity,
          mode: "guardian",
        });
      },
      [isCurrent],
    );

    const load = useCallback(async () => {
      if (sessionIdentity === null) return;
      const identity = sessionIdentity;
      const generation = generationRef.current;
      setSnapshot((current) =>
        current.identity === identity &&
        current.mode === "loading" &&
        current.error === "" &&
        current.expiresAt === null
          ? current
          : initialSnapshot(identity),
      );
      await enqueue(async () => {
        if (!isCurrent(identity, generation)) return;
        const controller = new AbortController();
        controllerRef.current = controller;
        try {
          const state = await api.loadGuardianAccess({
            signal: controller.signal,
          });
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
          applyState(state, identity, generation);
        } catch (error) {
          if (!isCurrent(identity, generation) || controller.signal.aborted) {
            return;
          }
          setSnapshot({
            error: messageFor(error),
            expiresAt: null,
            identity,
            mode: "learner",
          });
        } finally {
          if (controllerRef.current === controller) controllerRef.current = null;
        }
      });
    }, [applyState, enqueue, isCurrent, sessionIdentity]);

    useEffect(() => {
      generationRef.current += 1;
      controllerRef.current?.abort();
      controllerRef.current = null;
      operationTailRef.current = Promise.resolve();
      const version = intentRef.current.version + 1;
      intentRef.current = { identity: sessionIdentity, mode: null, version };
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
        if (document.visibilityState === "visible") void load();
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
      const generation = generationRef.current;
      const version = beginIntent(identity, "learner");
      controllerRef.current?.abort();
      controllerRef.current = null;
      setSnapshot({ ...initialSnapshot(identity), mode: "learner" });
      void enqueue(async () => {
        if (!isCurrent(identity, generation)) return;
        try {
          await api.lockGuardianAccess();
          if (
            !isCurrent(identity, generation) ||
            !isLatestIntent(identity, "learner", version)
          ) {
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
            error: LOCK_ERROR,
            expiresAt: null,
            identity,
            mode: "learner",
          });
        }
      });
    }, [beginIntent, enqueue, isCurrent, isLatestIntent]);

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

    const unlock = useCallback(
      async (password: string) => {
        if (sessionIdentity === null) return FALLBACK_ERROR;
        const identity = sessionIdentity;
        const generation = generationRef.current;
        const version = beginIntent(identity, "guardian");
        setSnapshot({ ...initialSnapshot(identity), mode: "learner" });
        return enqueue(async () => {
          if (!isCurrent(identity, generation)) return STALE_OPERATION_ERROR;
          try {
            const state = await api.unlockGuardianAccess(password);
            if (
              !isCurrent(identity, generation) ||
              !isLatestIntent(identity, "guardian", version)
            ) {
              return STALE_OPERATION_ERROR;
            }
            settledIntentRef.current = version;
            applyState(state, identity, generation);
            return null;
          } catch (error) {
            if (
              !isCurrent(identity, generation) ||
              !isLatestIntent(identity, "guardian", version)
            ) {
              return STALE_OPERATION_ERROR;
            }
            settledIntentRef.current = version;
            const message = messageFor(error);
            setSnapshot({
              error: "",
              expiresAt: null,
              identity,
              mode: "learner",
            });
            return message;
          }
        });
      }, [
        applyState,
        beginIntent,
        enqueue,
        isCurrent,
        isLatestIntent,
        sessionIdentity,
      ],
    );

    const lock = useCallback(async () => {
      if (sessionIdentity === null) return FALLBACK_ERROR;
      const identity = sessionIdentity;
      const generation = generationRef.current;
      const version = beginIntent(identity, "learner");
      setSnapshot((current) =>
        current.identity === identity ? { ...current, error: "" } : current,
      );
      return enqueue(async () => {
        if (!isCurrent(identity, generation)) return STALE_OPERATION_ERROR;
        try {
          const state = await api.lockGuardianAccess();
          if (
            !isCurrent(identity, generation) ||
            !isLatestIntent(identity, "learner", version)
          ) {
            return STALE_OPERATION_ERROR;
          }
          settledIntentRef.current = version;
          applyState(state, identity, generation);
          return null;
        } catch {
          if (
            !isCurrent(identity, generation) ||
            !isLatestIntent(identity, "learner", version)
          ) {
            return STALE_OPERATION_ERROR;
          }
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
      applyState,
      beginIntent,
      enqueue,
      isCurrent,
      isLatestIntent,
      sessionIdentity,
    ]);

    const value = useMemo<GuardianAccessContextValue>(
      () => ({
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
