import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ActionButton, cx, IconButton } from "../shared/ui";

type BackendBuild = {
  commitSha: string;
  deployedAt: string | null;
  deploymentId: string;
  version: string;
};

type ComponentBuild = {
  commitSha: string;
  component: string;
  details?: {
    models?: {
      llm?: string;
      stt?: string;
      tts?: string;
    };
  };
  reportedAt: string;
  version: string;
};

type BuildInfo = {
  backend: BackendBuild;
  components: ComponentBuild[];
};

type BuildField = {
  label: string;
  value: string;
};

const WEB_BUILD = {
  commitSha: import.meta.env.VITE_PARROT_COMMIT_SHA,
  version: import.meta.env.VITE_PARROT_APP_VERSION,
};

function displayDate(value: string | null) {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString();
}

function isComparableCommit(value: string) {
  return !["local", "unknown", "unavailable"].includes(value.toLowerCase());
}

function BuildMatch({ commitSha }: { commitSha: string }) {
  if (
    !isComparableCommit(WEB_BUILD.commitSha) ||
    !isComparableCommit(commitSha)
  ) {
    return null;
  }
  const matches = WEB_BUILD.commitSha === commitSha;
  return (
    <p
      className={cx(
        "m-0 rounded-xl px-3 py-2 text-xs font-black leading-tight",
        matches
          ? "bg-emerald-100 text-emerald-900"
          : "bg-amber-100 text-amber-950",
      )}
      role={matches ? "status" : "alert"}
    >
      {matches ? "Matches the web commit" : "Different commit from the web app"}
    </p>
  );
}

function BuildCard({
  commitSha,
  fields = [],
  title,
  version,
}: {
  commitSha: string;
  fields?: BuildField[];
  title: string;
  version: string;
}) {
  return (
    <section className="grid gap-3 rounded-2xl border-3 border-sky-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h3 className="m-0 text-base font-black leading-tight text-brand-navy">
          {title}
        </h3>
        <span className="shrink-0 rounded-full bg-sky-100 px-2.5 py-1 text-xs font-black leading-none text-brand-blue">
          v{version}
        </span>
      </div>
      <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm leading-tight">
        <dt className="font-black text-slate-500">Git commit</dt>
        <dd className="m-0 break-all text-right font-mono font-bold text-slate-900">
          {commitSha}
        </dd>
        {fields.map(({ label, value }) => (
          <div className="contents" key={label}>
            <dt className="font-black text-slate-500">{label}</dt>
            <dd className="m-0 break-all text-right font-mono text-xs font-bold text-slate-900">
              {value}
            </dd>
          </div>
        ))}
      </dl>
      {title === "Web app" ? null : <BuildMatch commitSha={commitSha} />}
    </section>
  );
}

async function loadBuildInfo(signal: AbortSignal) {
  const response = await fetch("/api/build-info", {
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) {
    throw new Error(`Build information failed (${response.status}).`);
  }
  return (await response.json()) as BuildInfo;
}

export function AboutDialog({ onClose }: { onClose: () => void }) {
  const [buildInfo, setBuildInfo] = useState<BuildInfo | null>(null);
  const [error, setError] = useState("");
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    closeRef.current?.focus();

    function closeFromEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", closeFromEscape);
    void loadBuildInfo(controller.signal)
      .then(setBuildInfo)
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError("Deployed service details are unavailable.");
      });

    return () => {
      controller.abort();
      document.removeEventListener("keydown", closeFromEscape);
    };
  }, [onClose]);

  const agent = buildInfo?.components.find(
    ({ component }) => component === "conversation-agent",
  );
  const agentModels = agent?.details?.models;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-end overflow-y-auto bg-brand-navy/55 p-3 pt-18 short:pt-16 md:p-7 md:pt-24"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-labelledby="about-parrot-title"
        aria-modal="true"
        className="grid max-h-[calc(100dvh-5rem)] w-full max-w-md gap-4 overflow-y-auto rounded-3xl border-4 border-white bg-sky-50 p-4 text-left font-ui text-slate-900 shadow-control-navy short:max-h-[calc(100dvh-4.5rem)] md:p-5"
        role="dialog"
      >
        <header className="flex items-center justify-between gap-3">
          <div>
            <p className="m-0 text-xs font-black uppercase tracking-widest text-brand-blue">
              Deployment details
            </p>
            <h2
              className="m-0 mt-1 text-xl font-black leading-tight text-brand-navy md:text-2xl"
              id="about-parrot-title"
            >
              About Parrot English
            </h2>
          </div>
          <IconButton
            aria-label="Close About"
            onClick={onClose}
            ref={closeRef}
            type="button"
          >
            <X aria-hidden="true" className="size-6" strokeWidth={3} />
          </IconButton>
        </header>

        <BuildCard
          commitSha={WEB_BUILD.commitSha}
          title="Web app"
          version={WEB_BUILD.version}
        />

        {buildInfo ? (
          <BuildCard
            commitSha={buildInfo.backend.commitSha}
            fields={[
              {
                label: "Deployment",
                value: buildInfo.backend.deploymentId,
              },
              {
                label: "Uploaded",
                value: displayDate(buildInfo.backend.deployedAt),
              },
            ]}
            title="Cloudflare Worker"
            version={buildInfo.backend.version}
          />
        ) : (
          <section className="rounded-2xl border-3 border-sky-200 bg-white p-3">
            <h3 className="m-0 text-base font-black text-brand-navy">
              Cloudflare Worker
            </h3>
            <p className="m-0 mt-2 text-sm font-bold leading-snug text-slate-600">
              {error || "Loading deployed service details…"}
            </p>
          </section>
        )}

        {agent ? (
          <BuildCard
            commitSha={agent.commitSha}
            fields={[
              { label: "Last reported", value: displayDate(agent.reportedAt) },
              ...(agentModels?.llm
                ? [{ label: "LLM", value: agentModels.llm }]
                : []),
              ...(agentModels?.stt
                ? [{ label: "Speech to text", value: agentModels.stt }]
                : []),
              ...(agentModels?.tts
                ? [{ label: "Text to speech", value: agentModels.tts }]
                : []),
            ]}
            title="Conversation agent"
            version={agent.version}
          />
        ) : (
          <section className="rounded-2xl border-3 border-sky-200 bg-white p-3">
            <h3 className="m-0 text-base font-black text-brand-navy">
              Conversation agent
            </h3>
            <p className="m-0 mt-2 text-sm font-bold leading-snug text-slate-600">
              {error ||
                (buildInfo
                  ? "Not reported yet. It reports its build when it starts a conversation."
                  : "Loading deployed service details…")}
            </p>
          </section>
        )}

        {buildInfo ? (
          <p className="m-0 px-1 text-xs font-bold leading-snug text-slate-500">
            Worker deployment {buildInfo.backend.deploymentId}
          </p>
        ) : null}
        <ActionButton
          className="w-full rounded-full"
          onClick={onClose}
          type="button"
          variant="navy"
        >
          Done
        </ActionButton>
      </section>
    </div>
  );
}
