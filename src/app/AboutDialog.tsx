import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { useGuardianLanguage } from "../i18n/guardian-language";
import { Card, cx } from "../shared/ui";

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
      realtime?: string;
      transcription?: string;
    };
  };
  reportedAt: string;
  version: string;
};

type BuildInfo = {
  backend: BackendBuild;
  components: ComponentBuild[];
};

export type BuildInfoState =
  | { phase: "loading" }
  | { phase: "failed" }
  | { info: BuildInfo; phase: "ready" };

type BuildField = {
  label: string;
  value: string;
};

const WEB_BUILD = {
  commitSha: import.meta.env.VITE_PARROT_COMMIT_SHA,
  version: import.meta.env.VITE_PARROT_APP_VERSION,
};

function displayDate(value: string | null, missingValue: string) {
  if (!value) return missingValue;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString();
}

function isComparableCommit(value: string) {
  return !["local", "unknown", "unavailable"].includes(value.toLowerCase());
}

function BuildMatch({ commitSha }: { commitSha: string }) {
  const { messages } = useGuardianLanguage();
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
      {matches
        ? messages.accountPrivacy.matchesWeb
        : messages.accountPrivacy.differsFromWeb}
    </p>
  );
}

function BuildCard({
  commitSha,
  fields = [],
  kind,
  title,
  version,
}: {
  commitSha: string;
  fields?: BuildField[];
  kind: "web" | "backend" | "agent";
  title: string;
  version: string;
}) {
  const { messages } = useGuardianLanguage();
  return (
    <Card className="grid gap-3 p-3" elevation="soft" tone="inset">
      <div className="flex items-center justify-between gap-3">
        <h3 className="m-0 text-base font-black leading-tight text-brand-navy">
          {title}
        </h3>
        <span className="shrink-0 rounded-full bg-sky-100 px-2.5 py-1 text-xs font-black leading-none text-brand-blue">
          v{version}
        </span>
      </div>
      <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm leading-tight">
        <dt className="font-black text-slate-500">
          {messages.accountPrivacy.gitCommit}
        </dt>
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
      {kind === "web" ? null : <BuildMatch commitSha={commitSha} />}
    </Card>
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

export function AccountPrivacySections() {
  const { messages } = useGuardianLanguage();
  const copy = messages.accountPrivacy;
  const [buildInfoState, setBuildInfoState] = useState<BuildInfoState>({
    phase: "loading",
  });

  useEffect(() => {
    const controller = new AbortController();
    void loadBuildInfo(controller.signal)
      .then((info) => setBuildInfoState({ info, phase: "ready" }))
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError")
          return;
        setBuildInfoState({ phase: "failed" });
      });

    return () => {
      controller.abort();
    };
  }, []);

  const buildInfo =
    buildInfoState.phase === "ready" ? buildInfoState.info : null;
  const agent = buildInfo?.components.find(
    ({ component }) => component === "conversation-agent",
  );
  const agentModels = agent?.details?.models;

  return (
    <details className="group rounded-2xl border-3 border-sky-200 bg-white">
      <summary
        aria-label={copy.technicalLabel}
        className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-2 font-black text-brand-navy focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-brand-ink [&::-webkit-details-marker]:hidden"
      >
        <div>
          <h2
            className="m-0 text-base font-black leading-tight"
            id="technical-build-title"
          >
            {copy.technicalTitle}
          </h2>
          <span className="mt-0.5 block text-xs font-bold text-slate-500">
            {copy.technicalSubtitle}
          </span>
        </div>
        <ChevronDown
          aria-hidden="true"
          className="size-5 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
          strokeWidth={3}
        />
      </summary>
      <div className="grid gap-3 border-t-3 border-sky-100 p-3">
        <p className="m-0 px-1 text-sm font-bold leading-relaxed text-slate-600">
          {copy.technicalBody}
        </p>
        <BuildCard
          commitSha={WEB_BUILD.commitSha}
          kind="web"
          title={copy.webApp}
          version={WEB_BUILD.version}
        />

        {buildInfo ? (
          <BuildCard
            commitSha={buildInfo.backend.commitSha}
            fields={[
              {
                label: copy.deployment,
                value: buildInfo.backend.deploymentId,
              },
              {
                label: copy.uploaded,
                value: displayDate(
                  buildInfo.backend.deployedAt,
                  copy.missingValue,
                ),
              },
            ]}
            kind="backend"
            title={copy.worker}
            version={buildInfo.backend.version}
          />
        ) : (
          <Card className="p-3" elevation="soft" tone="inset">
            <h3 className="m-0 text-base font-black text-brand-navy">
              {copy.worker}
            </h3>
            <p className="m-0 mt-2 text-sm font-bold leading-snug text-slate-600">
              {buildInfoState.phase === "failed"
                ? copy.technicalFailed
                : copy.loadingTechnical}
            </p>
          </Card>
        )}

        {agent ? (
          <BuildCard
            commitSha={agent.commitSha}
            fields={[
              {
                label: copy.lastReported,
                value: displayDate(agent.reportedAt, copy.missingValue),
              },
              ...(agentModels?.realtime
                ? [
                    {
                      label: copy.realtimeModel,
                      value: agentModels.realtime,
                    },
                  ]
                : []),
              ...(agentModels?.transcription
                ? [
                    {
                      label: copy.transcriptionModel,
                      value: agentModels.transcription,
                    },
                  ]
                : []),
            ]}
            kind="agent"
            title={copy.agent}
            version={agent.version}
          />
        ) : (
          <Card className="p-3" elevation="soft" tone="inset">
            <h3 className="m-0 text-base font-black text-brand-navy">
              {copy.agent}
            </h3>
            <p className="m-0 mt-2 text-sm font-bold leading-snug text-slate-600">
              {buildInfoState.phase === "failed"
                ? copy.technicalFailed
                : buildInfo
                  ? copy.agentMissing
                  : copy.loadingTechnical}
            </p>
          </Card>
        )}

        {buildInfo ? (
          <p className="m-0 px-1 text-xs font-bold leading-snug text-slate-500">
            {copy.workerDeployment(buildInfo.backend.deploymentId)}
          </p>
        ) : null}
      </div>
    </details>
  );
}
