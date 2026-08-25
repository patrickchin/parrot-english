import { ChevronDown, Database, Settings2, Sparkles, X } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { ActionButton, Card, cx, IconButton } from "../shared/ui";
import { useDialogFocus } from "./useDialogFocus";

type BackendBuild = {
  commitSha: string;
  details: {
    models: {
      lessonScript: string;
    };
  };
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

export function AboutDialog({
  onClose,
  returnFocusRef,
}: {
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const [buildInfo, setBuildInfo] = useState<BuildInfo | null>(null);
  const [error, setError] = useState("");
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useDialogFocus({
    dialogRef,
    initialFocusRef: closeRef,
    onClose,
    returnFocusRef,
  });

  useEffect(() => {
    const controller = new AbortController();
    void loadBuildInfo(controller.signal)
      .then(setBuildInfo)
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
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
    <div
      className="fixed inset-0 z-50 flex items-start justify-end overflow-y-auto bg-brand-navy/55 p-3 pt-18 short:pt-16 md:p-7 md:pt-24"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-labelledby="ai-data-title"
        aria-modal="true"
        className="grid max-h-[calc(100dvh-5rem)] w-full max-w-lg gap-4 overflow-y-auto rounded-3xl border-4 border-white bg-sky-50 p-4 text-left font-ui text-slate-900 shadow-control-navy short:max-h-[calc(100dvh-4.5rem)] md:p-5"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="flex items-center justify-between gap-3">
          <div>
            <p className="m-0 text-xs font-black uppercase tracking-widest text-brand-blue">
              For grown-ups
            </p>
            <h2
              className="m-0 mt-1 text-xl font-black leading-tight text-brand-navy md:text-2xl"
              id="ai-data-title"
            >
              AI and saved data
            </h2>
          </div>
          <IconButton
            aria-label="Close AI and saved data"
            onClick={onClose}
            ref={closeRef}
            type="button"
          >
            <X aria-hidden="true" className="size-6" strokeWidth={3} />
          </IconButton>
        </header>

        <AboutSection
          icon={<Sparkles className="size-5" strokeWidth={2.5} />}
          title="How Parrot uses AI"
        >
          <p className="m-0">
            AI helps make custom lessons, turn speech into text, check spoken
            answers, run voice conversations, and make optional story art.
          </p>
          <p className="m-0 rounded-xl bg-amber-50 px-3 py-2 text-amber-950">
            AI can hear words wrongly or say something wrong. Please check
            AI-made lessons and stay nearby during voice chats.
          </p>
        </AboutSection>

        <AboutSection
          icon={<Database className="size-5" strokeWidth={2.5} />}
          title="What this account keeps"
        >
          <ul className="m-0 grid list-disc gap-2 pl-5">
            <li>
              Parrot keeps the learner profile, custom lessons, and conversation
              words as text. A conversation that ends early may still have saved
              text.
            </li>
            <li>
              Talk to Peppa does not change the learner profile. Learner setup
              and profile editing can.
            </li>
            <li>
              Voice services process audio during an activity. Raw audio is not
              added to the Parrot account.
            </li>
            <li>
              If a grown-up chooses story art, a cropped photo is sent to
              Cloudflare Workers AI. The photo is not added to the account.
              Parrot keeps one private storybook picture until it is deleted.
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
            A child can finish a conversation at any time. Use Learner details
            in Guardian mode to change saved details. Delete optional art on its
            story page.
          </p>
          <p className="m-0">
            Delete account removes the account, learner profile, custom lessons,
            saved conversation text, and private story art from Parrot. A small
            deletion marker stays so old private art cannot return.
          </p>
        </AboutSection>

        <details className="group rounded-2xl border-3 border-sky-200 bg-white">
          <summary
            aria-label="Technical build details"
            className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-2 font-black text-brand-navy focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-brand-ink [&::-webkit-details-marker]:hidden"
          >
            <span>
              <span className="block">Technical build details</span>
              <span className="mt-0.5 block text-xs font-bold text-slate-500">
                Versions and AI services for troubleshooting
              </span>
            </span>
            <ChevronDown
              aria-hidden="true"
              className="size-5 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
              strokeWidth={3}
            />
          </summary>
          <div className="grid gap-3 border-t-3 border-sky-100 p-3">
            <p className="m-0 px-1 text-sm font-bold leading-relaxed text-slate-600">
              Current services include Cloudflare for hosting and story art,
              LiveKit for live voice transport, OpenAI for lesson generation
              and live voice, and Groq for speech checks and profile summaries.
              Some saved lesson and profile audio was made with ElevenLabs
              before deployment.
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
                    label: "Lesson script LLM",
                    value: buildInfo.backend.details.models.lessonScript,
                  },
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
        <ActionButton
          fullWidth
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
