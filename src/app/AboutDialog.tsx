import { ChevronDown, Database, Settings2, Sparkles } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
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

type BuildField = {
  label: string;
  value: string;
};

function AboutSection({
  children,
  icon,
  title,
}: {
  children: ReactNode;
  icon: ReactNode;
  title: string;
}) {
  return (
    <Card className="grid gap-3 p-4" elevation="soft" tone="inset">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-full bg-sky-100 text-brand-blue"
        >
          {icon}
        </span>
        <h3 className="m-0 text-lg font-black leading-tight text-brand-navy">
          {title}
        </h3>
      </div>
      <div className="grid gap-2 text-sm font-bold leading-relaxed text-slate-700">
        {children}
      </div>
    </Card>
  );
}

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
  const [buildInfo, setBuildInfo] = useState<BuildInfo | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void loadBuildInfo(controller.signal)
      .then(setBuildInfo)
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError")
          return;
        setError(
          "Technical details could not load. The AI and saved data notes above are still available.",
        );
      });

    return () => {
      controller.abort();
    };
  }, []);

  const agent = buildInfo?.components.find(
    ({ component }) => component === "conversation-agent",
  );
  const agentModels = agent?.details?.models;

  return (
    <div className="grid gap-6">
      <section aria-labelledby="ai-data-title" className="grid gap-4">
        <header>
          <h2
            className="m-0 text-xl font-black leading-tight text-brand-navy md:text-2xl"
            id="ai-data-title"
          >
            AI and saved data
          </h2>
        </header>

        <AboutSection
          icon={<Sparkles className="size-5" strokeWidth={2.5} />}
          title="How Parrot uses AI"
        >
          <p className="m-0">
            AI helps turn speech into text, check spoken answers, run voice
            conversations, and summarize learner profiles.
          </p>
          <p className="m-0 rounded-xl bg-amber-50 px-3 py-2 text-amber-950">
            AI can hear words wrongly or say something wrong. Please check
            speech feedback and stay nearby during voice chats.
          </p>
        </AboutSection>

        <AboutSection
          icon={<Database className="size-5" strokeWidth={2.5} />}
          title="What this account keeps"
        >
          <ul className="m-0 grid list-disc gap-2 pl-5">
            <li>
              Parrot keeps all learner profiles and their saved data, including
              conversation words as text. A conversation that ends early may
              still have saved text.
            </li>
            <li>
              Choosing a learner in Guardian settings changes only which
              learner&apos;s data you manage. Learner mode changes only through
              Switch to learner, where you choose who will use the session.
            </li>
            <li>
              Voice services process audio during Talk to Peppa, learner setup,
              and speech checks, but Parrot does not save that activity audio
              to the account.
            </li>
            <li>
              Voice-dubbing rhymes save that learner&apos;s private voice clips
              to the account. A new take
              replaces the saved clip for that line, and the Guardian can
              delete every saved clip.
            </li>
            <li>
              Lessons save one private voice clip for
              each join-in moment. A new take replaces the previous take for
              that moment. Parrot does not score or transcribe these clips yet.
              Stopping lesson recording or deleting the account deletes them.
            </li>
            <li>
              Saved lesson recordings are managed independently for each
              selected learner profile.
            </li>
            <li>
              Accounts that previously made a private story picture may keep
              that generated picture until its learner or the account is
              deleted. The original photo was not stored.
            </li>
          </ul>
          <p className="m-0 text-xs text-slate-500">
            Outside AI and voice services process some inputs under their own
            retention rules.
          </p>
        </AboutSection>

        <AboutSection
          icon={<Settings2 className="size-5" strokeWidth={2.5} />}
          title="What you can do"
        >
          <p className="m-0">
            A learner can finish a conversation at any time. In Guardian mode,
            choose a learner to manage their saved details, lesson voice
            recordings, and nursery-rhyme voice clips.
          </p>
          <p className="m-0">
            Delete account removes the account, all learner profiles and their
            saved data, including saved conversation text, private voice clips
            from all nursery rhymes, lesson voice recordings, and any
            previously saved private story pictures. A small deletion marker
            stays so removed private media cannot return.
          </p>
        </AboutSection>
      </section>

      <details className="group rounded-2xl border-3 border-sky-200 bg-white">
          <summary
            aria-label="Technical build details"
            className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-2 font-black text-brand-navy focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-brand-ink [&::-webkit-details-marker]:hidden"
          >
            <div>
              <h2
                className="m-0 text-base font-black leading-tight"
                id="technical-build-title"
              >
                Technical build details
              </h2>
              <span className="mt-0.5 block text-xs font-bold text-slate-500">
                Versions and AI services for troubleshooting
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
              Current services include Cloudflare for hosting, LiveKit for live
              voice transport, OpenAI for live voice, and Groq for speech checks
              and profile summaries. Some saved lesson and profile audio was
              made with ElevenLabs before deployment.
            </p>

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
              <Card className="p-3" elevation="soft" tone="inset">
                <h3 className="m-0 text-base font-black text-brand-navy">
                  Cloudflare Worker
                </h3>
                <p className="m-0 mt-2 text-sm font-bold leading-snug text-slate-600">
                  {error || "Loading technical details…"}
                </p>
              </Card>
            )}

            {agent ? (
              <BuildCard
                commitSha={agent.commitSha}
                fields={[
                  {
                    label: "Last reported",
                    value: displayDate(agent.reportedAt),
                  },
                  ...(agentModels?.realtime
                    ? [
                        {
                          label: "Realtime voice model",
                          value: agentModels.realtime,
                        },
                      ]
                    : []),
                  ...(agentModels?.transcription
                    ? [
                        {
                          label: "Input transcription",
                          value: agentModels.transcription,
                        },
                      ]
                    : []),
                ]}
                title="Conversation agent"
                version={agent.version}
              />
            ) : (
              <Card className="p-3" elevation="soft" tone="inset">
                <h3 className="m-0 text-base font-black text-brand-navy">
                  Conversation agent
                </h3>
                <p className="m-0 mt-2 text-sm font-bold leading-snug text-slate-600">
                  {error ||
                    (buildInfo
                      ? "Not reported yet. It reports its build when it starts a conversation."
                      : "Loading technical details…")}
                </p>
              </Card>
            )}

            {buildInfo ? (
              <p className="m-0 px-1 text-xs font-bold leading-snug text-slate-500">
                Worker deployment {buildInfo.backend.deploymentId}
              </p>
            ) : null}
          </div>
      </details>
    </div>
  );
}
