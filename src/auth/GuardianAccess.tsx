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
    const sequenceRef = useRef(0);
    const controllerRef = useRef<AbortController | null>(null);
    const identityRef = useRef(sessionIdentity);
    identityRef.current = sessionIdentity;

    const isCurrent = useCallback(
      (operation: number, identity: string, signal: AbortSignal) =>
        sequenceRef.current === operation &&
        identityRef.current === identity &&
        !signal.aborted,
      [],
    );

    const beginOperation = useCallback((identity: string) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      return {
        controller,
        identity,
        operation: ++sequenceRef.current,
      };
    }, []);

    const applyState = useCallback(
      (
        state: GuardianAccessState,
        identity: string,
        operation: number,
        signal: AbortSignal,
      ) => {
        if (!isCurrent(operation, identity, signal)) return;
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
      const { controller, identity, operation } = beginOperation(sessionIdentity);
      setSnapshot((current) =>
        current.identity === identity &&
        current.mode === "loading" &&
        current.error === "" &&
        current.expiresAt === null
          ? current
          : initialSnapshot(identity),
      );
      try {
        const state = await api.loadGuardianAccess({
          signal: controller.signal,
        });
        applyState(state, identity, operation, controller.signal);
      } catch (error) {
        if (!isCurrent(operation, identity, controller.signal)) return;
        setSnapshot({
          error: messageFor(error),
          expiresAt: null,
          identity,
          mode: "learner",
        });
      }
    }, [applyState, beginOperation, isCurrent, sessionIdentity]);

    useEffect(() => {
      sequenceRef.current += 1;
      controllerRef.current?.abort();
      controllerRef.current = null;
      if (sessionIdentity === null) setSnapshot(initialSnapshot(null));
      else void load();
      return () => {
        sequenceRef.current += 1;
        controllerRef.current?.abort();
        controllerRef.current = null;
      };
    }, [load, sessionIdentity]);

    useEffect(() => {
      if (sessionIdentity === null || typeof document === "undefined") return;
      const recheck = () => void load();
      document.addEventListener("visibilitychange", recheck);
      return () => document.removeEventListener("visibilitychange", recheck);
    }, [load, sessionIdentity]);

    const visibleSnapshot =
      snapshot.identity === sessionIdentity
        ? snapshot
        : initialSnapshot(sessionIdentity);

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
        sequenceRef.current += 1;
        controllerRef.current?.abort();
        controllerRef.current = null;
        setSnapshot((current) =>
          current.identity === identity && current.expiresAt === expiresAt
            ? { ...initialSnapshot(identity), mode: "learner" }
            : current,
        );
      }, Math.max(0, Date.parse(expiresAt) - now()));
    }, [sessionIdentity, visibleSnapshot.expiresAt, visibleSnapshot.mode]);

    useEffect(
      () =>
        subscribeGuardianAccessRequired(() => {
          sequenceRef.current += 1;
          controllerRef.current?.abort();
          controllerRef.current = null;
          setSnapshot({
            ...initialSnapshot(identityRef.current),
            mode: "learner",
          });
        }),
      [],
    );

    const unlock = useCallback(
      async (password: string) => {
        if (sessionIdentity === null) return FALLBACK_ERROR;
        const { controller, identity, operation } =
          beginOperation(sessionIdentity);
        setSnapshot({ ...initialSnapshot(identity), mode: "learner" });
        try {
          const state = await api.unlockGuardianAccess(password, {
            signal: controller.signal,
          });
          applyState(state, identity, operation, controller.signal);
          return null;
        } catch (error) {
          if (!isCurrent(operation, identity, controller.signal)) return null;
          const message = messageFor(error);
          setSnapshot({
            error: message,
            expiresAt: null,
            identity,
            mode: "learner",
          });
          return message;
        }
      }, [applyState, beginOperation, isCurrent, sessionIdentity],
    );

    const lock = useCallback(async () => {
      if (sessionIdentity === null) return FALLBACK_ERROR;
      const { controller, identity, operation } = beginOperation(sessionIdentity);
      setSnapshot((current) =>
        current.identity === identity ? { ...current, error: "" } : current,
      );
      try {
        const state = await api.lockGuardianAccess({ signal: controller.signal });
        applyState(state, identity, operation, controller.signal);
        return null;
      } catch (error) {
        if (!isCurrent(operation, identity, controller.signal)) return null;
        const message = messageFor(error);
        setSnapshot((current) =>
          current.identity === identity ? { ...current, error: message } : current,
        );
        return message;
      }
    }, [applyState, beginOperation, isCurrent, sessionIdentity]);

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
