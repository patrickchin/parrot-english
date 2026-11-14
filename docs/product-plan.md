# Parrotbook China dubbing product plan

Date: 2026-10-28

Software friend-test direction updated 2026-11-14: separate software delivery
from creator-permission work for the current owner-directed test. Use the
existing authored scenes as owner-published content packs that friends can
browse and select. Only the owner publishes packs through the authenticated
content command; there is no user pack-upload interface. Creator permissions
are deferred for this work, rather than a blocker on implementing or testing
the software. Existing permission labels remain factual metadata; no permission
clearance is asserted. Child-release and wider public-operation work remain
separate from this friend test.

Audience and visual direction updated 2026-11-12: Parrotbook serves independent
learners across ages, including children, teens, and adults. Use the green Pop
Studio identity throughout the application: vivid green, forest ink, mint
surfaces, yellow actions, and a small parrot mark. Scene content and language
level tailor the experience; the global interface should welcome every age.
Guardian consent and privacy requirements still apply before child use.

Content direction updated 2026-11-12: prioritize recognizable, memeable internet
moments, including creator sketches, reactions, interviews, livestream exchanges,
and viral clips. Film and TV scenes remain eligible when the particular moment
has evidence of recognition or reuse. Discover on Douyin, Bilibili, Xiaohongshu,
Weibo, Kuaishou, TikTok, Reddit, Instagram, Facebook, and YouTube. Chinese
platforms guide what learners recognize; original spoken English and a complete
comic beat determine whether a clip fits this player. Chinese-only, silent,
music-only, and invented-language memes belong in the research queue unless a
separate original English adaptation is commissioned and labelled as such.

The owner requested **ongoing discovery with periodic additions**, superseding
the earlier hourly cadence. Maintain a deduplicated source queue,
separate enduring favorites from recent trends, and record dated evidence rather
than claiming a universal popularity ranking. Continue adding suitable local
review scenes through the existing authoring workflow. Keep original speakers,
complete exchanges, source credits, age guidance, and publication review. See
[the discovery workflow](meme-discovery.md) and its first research batch.
Internet meme clips share one **Memes** browse tag; creator names stay in source
credits and searchable metadata. New meme sources must join this tag automatically.
Film/TV franchises retain their own tags.
No fixed schedule or unattended worker is configured; continue discovery during
content authoring and publish verified batches when ready.

Prototype status: the versioned content catalog offers 128 internal-test
scenes, including internet memes, film/animation, and beginner/TV conversations.
The earlier Sintel sample was removed from the
product on 2026-10-29; licensed footage remains only as an internal test fixture. Media is served from Alibaba OSS object storage, separately from the
ESA application code. Redistribution rights remain unconfirmed. See
[clip sources](clip-sources.md) and [infrastructure](infrastructure.md) for the
actual state. Adult browser testing is complete for the documented paths;
physical-device validation and any child pilot remain subsequent work.

Adult POC sharing (2026-11-11): after completing a dub with at least one recorded
line, testers can download an MP4 generated entirely on their device, then send
or upload the file using their usual messaging or social apps. This adult-only
test flow has no parent/child approval step, account, recording upload, or hosted
sharing page. It does not change the guardian setup planned for a later child
release. Current scene redistribution permissions remain unconfirmed.

Adult POC saving (2026-11-11): accepted recordings and partial/completed lesson
state autosave in browser IndexedDB. Each started session has its own `dub_…`
identifier. My dubs lists saved attempts for continuing or deleting; starting
over retains the earlier session. Saving preserves roles, line position,
skipped/recorded turns, waveforms, and any selected local source file. There is
no server recording store or account. Save failures remain visible and keep the
current takes in memory for retry. Browser persistence is requested where
supported, but clearing site data removes the drafts, and downloaded videos are
the user's backup. This adult-test behavior supersedes session-only storage for
the POC; the later child release still needs its planned guardian save controls.

Preserve the existing Parrot English prototype as research and build an English
dubbing player inspired by The Choicer Voicer. The initial route to market is
through the founder's contacts who work with children. Keep the player usable
by older learners through different scene content and language levels.

The interface is designed for independent use across ages. The proposed child
pilot still uses three separate starter scenes. Learners hear a line, perform
it, and watch the scene
with their own voices. A guardian handles necessary consent and save/share
settings; the activity does not depend on a teacher. Prototype playback and recording locally before adding
accounts, cloud recordings, automated assessment, or public community hosting.

## Research archive and fresh history

Main starts from a new root commit with no ancestry shared with the earlier
prototype. The existing project is retained as research under these Git tags:

- `research/parrot-english-2026-10-28` preserves the earlier main application
  and its documentation at `8df68a24`.
- `research/parrotbook-planning-2026-10-28` preserves the original pivot plan
  and company clarification at `522899f5`.
- `research/aliyun-pilot-2026-10-28` preserves the unmerged China hosting
  prototype from PR 209 at `492409cf`.

The tags preserve tracked source and documentation. They do not back up cloud
records, external media, credentials, or provider configuration. Existing
services and learner data require a separate retirement and retention decision;
keep personal data and secrets out of Git. Historical media needs a rights
review before republication.

Build the replacement in this fresh tree. Recover specific ideas or code from
the research tags only when they fit the new product. Subsequent changes to
main go through pull requests; the history reset was a one-time user-authorized
exception.

## Product and first audience

Use Parrotbook as the working brand. Build our own code, visual identity, and
content format; use The Choicer Voicer as an interaction reference. Its
developer describes a customizable player with external content packs and a Dub Mode
on the [official game page](https://yeahmaybe.itch.io/the-choicer-voicer).

Design the first pilot around a child choosing and completing an activity on
their own device. Prioritize touch interaction on phones and tablets, while
keeping larger screens usable. The same controls and visual identity also serve
teen and adult learners; select suitable content for each audience. Confirm
actual devices before choosing the
delivery platform. Pre-A1/A1 English is the proposed starter-scene level; exact
ages and learning needs should come from pilot families. The founder's contacts
can help recruit families; teacher tools are outside the initial scope.

The minimum complete activity is:

1. A guardian completes the required recording notice and authorization setup.
   The child then chooses a scene from the scene library.
2. The child chooses a role, watches the reference scene, and hears a line.
3. The player shows a short video lead-in with a moving cursor, records the line
   with a little extra room at either end, and offers listen and retry.
4. The learner continues through the scene and watches the assembled dub.
5. The child watches the result, retries a line, or chooses another scene.
   Starting a new learner/session clears the previous learner's takes.

Use a prominent play/record action, visible recording states, and short Chinese
instructions alongside English dialogue. Avoid requiring a child to import a
ZIP or understand audio settings: starter scenes appear as playable scenes, and
custom-scene import belongs in the grown-up area. Show English subtitles and
optional Chinese meaning hints. Allow skipping a line, hearing it again, and
stopping immediately. Use completion and replay as
the initial feedback. Treat pronunciation assessment as a separate future
feature requiring validation with Chinese learners; voice similarity is not
evidence of English proficiency. Private local video export can follow reliable
playback and confirmation that each scene permits exported dubs.

The initial release excludes teacher dashboards, classroom management,
online multiplayer, public rankings, open chat,
voice cloning, AI conversations, subscriptions, and a public scene marketplace.
These are separate additions after the core activity earns repeat use.

## Scene content and permissions

Use one versioned scene format for founder-made and community-made scenes. Ship
starter scenes separately from the player, with the same loading and validation
path. Separate distribution supports reuse and independent updates. Scenes made
by the founder still belong in the product's rights review.

Chinese copyright law protects qualifying foreign works. Article 24 lists
specific exceptions, including a limited school-classroom use; it does not
provide a general short-clip or educational-app exemption. The plan therefore
requires a documented rights basis for distributed starter scenes.
[PRC Copyright Law, articles 2 and 24](https://www.ncac.gov.cn/xxfb/flfg/flfg_532/202103/t20210309_50530.html).

Separate software and scenes do not automatically remove liability. The Supreme
People's Court addresses joint provision of works and knowing assistance to
infringement. Review our own hosting, promotion, linking, and contribution to
scenes together. [Judicial interpretation on network dissemination](https://www.court.gov.cn/fabu/xiangqing/282671.html).

For the first three scenes, use original short scenes or material whose actual
rights holder gives permission for this use. An authorization must cover the
relevant footage, dialogue, performances, and music, plus editing, dialogue
replacement, mainland-China delivery, and any allowed exports or commercial
use. Record territory, duration, attribution, and sharing limits. Permission
from a fan uploader cannot clear rights they do not hold. Check any open
license for adaptation and commercial-use restrictions.

YouTube can help discover creators to approach. Obtain the licensed source
files from them or another authorized channel; permission to watch a video is
not a redistribution license. YouTube also has its own
[download and reuse restrictions](https://www.youtube.co.uk/t/terms).
Chinese hosting does not resolve every contractual or cross-border issue.

Proposed original starter scenes:

| Scene | English practice | Format |
| --- | --- | --- |
| Bob and Mary order a snack | Greetings, requests, thank you | Two roles, 6–8 lines |
| Jack and Rose find a lost bag | Questions, descriptions, location | Two roles, 6–8 lines |
| Ben and Sam plan a game | Invitations, agreement, turn taking | Two roles, 6–8 lines |

Aim for 20–45 seconds per scene and one short sentence per turn. Use existing
authored-name conventions. Original actors or commissioned animation can make
these scenes recognizable and entertaining without depending on famous TV
characters. Record human guide performances first; follow project audio rules
if generated audio is later commissioned.

Community participation starts with invited adult creators sending scenes for
review. Local import is a software capability, not a claim that every imported
file is cleared. Before offering public distribution, introduce rights and
child-suitability review, attribution, reporting and removal, contributor
terms, and a named adult contact for each scene. Keep child performances private.

## Scene format and authoring

A scene contains a JSON manifest, a browser-compatible scene video, line
reference audio, and optionally a separate music/effects backing track. The
manifest describes version, title, English level, roles, English text, optional
Chinese hints, line timings, credits, and permissions metadata. Use opaque,
URL-safe IDs such as `scene_…`, `role_…`, and `line_…`; paths stay relative to
the package. Keep permission evidence in a private rights register and publish
only the credit and usage terms intended for users.

Start with a documented folder format and a small authoring/validation command.
Add ZIP import if it materially improves delivery on the chosen devices. Do
not build a full browser video editor for three scenes. Use FFmpeg during
authoring to normalize video and prepare prompt segments, with human review of
every caption and timing.

Validate at import: manifest version, file types, size and expanded-size limits,
safe relative paths, referenced-file completeness, IDs, and timings within media
duration. Scenes contain no executable code, arbitrary HTML, or tracking URLs.
An imported file must not trigger a microphone request until the user starts
the recording flow. Do not claim compatibility with Choicer Voicer packs
without implementing and testing an adapter separately.

## Chinese infrastructure and domain

The founder has an existing cloud account and a company used mainly for another
project, but no company dedicated to Parrotbook. Treat the existing company as
the first candidate operator, subject to confirming mainland registration,
business scope, ownership, and the relevant service qualifications. A dedicated
new company is not a prerequisite for building the prototype. Alibaba allows
multiple websites under one filing entity, subject to provincial limits; this
does not establish this particular company's eligibility for the proposed
service. [Alibaba filing limits](https://help.aliyun.com/zh/icp-filing/basic-icp-service/product-overview/limits).

If the existing company operates Parrotbook, keep its app resources, access
permissions, and cost tracking separate from the other project. The named
operator should actually take responsibility for the service and user data.
Consider a separate company later if ownership, partners, licensing, or business
separation makes that useful. Confirm operator eligibility before deciding
domain ownership and filing arrangements.

Keep `parrotbook.com` if the ownership and filing checks succeed. The archived application
configured `parrotbook.com` and `www.parrotbook.com` for a Cloudflare Worker,
and `media.parrotbook.com` for media. Public RDAP and DNS checks on
2026-10-28 identify Cloudflare as registrar and authoritative DNS provider.

Alibaba Cloud requires an approved registrar, supported suffix, and matching
real-name/filing information. An overseas registrar may require a transfer to
an approved mainland registrar while preserving the domain name. Confirm this
domain's exact eligibility with the filing provider before transferring it.
Then identify the actual operator, apply for or update the appropriate filing,
and plan DNS and HTTPS cutover. DNS hosting, registration, hosting, and brand
ownership are distinct. A subdomain does not bypass the parent domain's filing
requirements. [Alibaba domain verification guidance](https://help.aliyun.com/zh/icp-filing/basic-icp-service/user-guide/prepare-and-check-the-domain-name).

Proposed pilot architecture:

| Component | First implementation |
| --- | --- |
| Player | Small React/Vite app; selectively recover suitable controls from the archive |
| Public app and approved scenes | Mainland Alibaba OSS with HTTPS delivery through CDN or ESA |
| Recording and assembled playback | Browser microphone and audio/video APIs; takes remain on the device |
| Session state | Adult POC drafts and recordings in local IndexedDB; playback state in memory |
| Accounts and database | Omitted until a pilot demonstrates a need |
| Optional later API | Mainland Function Compute and private OSS, introduced with access control and retention |

OSS supports static websites and custom domains; mainland custom domains need
ICP filing. [OSS hosting documentation](https://help.aliyun.com/zh/oss/user-guide/hosting-static-websites).
Mainland ESA acceleration likewise requires filing.
[ESA site access](https://www.alibabacloud.com/help/zh/edge-security-acceleration/esa/support/site-access-related-issues).
Validate regional availability and pricing for the selected account before
buying infrastructure. Static-only hosting still needs an eligible filing
arrangement; storage alone should not be assumed to qualify as the filing
supporting resource.

Keep runtime assets, fonts, and libraries self-hosted on the selected China
delivery path. The replacement pilot should not depend on the archived
Cloudflare API/D1/R2, Turnstile, Groq, ElevenLabs, or LiveKit/OpenAI runtime
flows. The separate Alibaba research tag preserves a Function Compute/MySQL
and ESA prototype; inspect its source, deployment records, and actual account
state before reusing anything. The simpler local-recording pilot does not
require that backend. Archived recording helpers and audio scheduling are
reuse candidates, although the old playback code is coupled to rhyme
definitions and consent APIs.

A responsive browser player is the first delivery candidate because a family
can open a link without installation. It must prove child usability,
microphone permissions, video/audio sync, and reliability on the actual phones
and tablets. If WeChat phones are the primary
surface and browser tests fail, prefer a native WeChat mini-program recording
flow rather than building extensive browser workarounds. Choose one primary
surface first; do not implement both concurrently. Do not assume desktop
browser tests establish mobile or WeChat compatibility. The child-facing flow
remains the same whichever delivery platform proves suitable.

## Children and service classification

Before collecting pilot recordings, establish who operates the product and who
obtains guardian authorization. Under PIPL, personal information of children
under 14 is sensitive, guardian consent is required, and special processing
rules are needed. Design a clear recording notice, limited purpose and
retention, withdrawal, and deletion. Local processing reduces transfers but is
not an automatic exemption. [PIPL, articles 28–31](https://www.cac.gov.cn/2021-08/20/c_1631050028355286.htm).

For the later child release, use session-only takes by default, collect no child names or voice analytics,
and clear recordings before another learner starts. Persistent local save or
export needs an adult action, a clear shared-device warning, and a deletion
path. Do not reuse the prototype's shared guest identity or automatically
migrate its learner records. Cloud saving or speech assessment requires a
separate data-flow review, including vendor processing and overseas access.

The founder's contacts offer a useful distribution route, but children's
English training has a service-classification question. The Ministry of
Education considers purpose, content, teaching method, and assessment when
classifying training, including foreign languages. Determine how the actual
activity and operator are treated locally; calling it a game or tool does not
settle the issue. [MOE classification guidance](https://www.moe.gov.cn/srcsite/A29/202111/t20211112_579358.html).

Obtain a scoped PRC review of the proposed pilot before releasing it to
children, and of the expanded scope before public operation or charging.
Questions should cover educational-tool versus training status, any game
publication requirements, video-service requirements for the planned catalog
and sharing, telecom filings/licensing, and operator eligibility. ICP filing
alone does not answer those questions. Relevant authorities publish
[game approval requirements](https://www.nppa.gov.cn/bsfw/xksx/cbfxl/wlcbfwspsx/202210/t20221013_600725.html)
and [online audiovisual service licensing guidance](https://www.nrta.gov.cn/col/col2477/index.html).
These are classification questions, not a conclusion that every listed license
applies to a local dubbing tool. An invitation-only or free pilot should not be
assumed exempt from applicable rules.

## Delivery sequence

| Phase | Deliverable | Completion condition |
| --- | --- | --- |
| Preserve research | Fresh main root plus annotated research tags | Completed: prior source recoverable; cloud retirement remains separate |
| Confirm pilot | Device, age/level, operator and guardian setup decisions | Pilot families agree to a concrete activity; permissions and classification route established |
| Prove dubbing | One original scene, role selection, per-line recording, assembled replay, clear session | A child completes the flow on a target phone or tablet without teacher help or overseas runtime services |
| Make content portable | Validated format and three rights-cleared scenes | Each loads independently; a second adult can prepare a scene from the guide |
| Deliver in mainland China | Eligible domain, HTTPS, OSS and chosen delivery service | Actual home/mobile networks tested; microphone, playback and reset verified |
| Run observed pilot | Proposed 10–20 learners recruited through existing contacts | Independent completion, repeat use and learner willingness measured with minimal data |
| Choose expansion | Home practice, older learners, or creator contributions | Select the route supported by observed use; add only its required services |

Suggested pilot success thresholds are product hypotheses: at least 80% of
participants finish one short scene after guardian setup without step-by-step
adult help, at least half voluntarily retry a line or choose another scene,
and at least half return for a second session within a week. Ask parents
whether they would pay for the tool or scenes. Record technical failures and
consented observations rather than uploading child voices for analytics. A
pilot measures usability and demand; it does not establish learning efficacy.

Browser verification should cover denied microphone permission, no input,
interrupted playback, retries, timing drift, invalid scenes, missing media, and
clearing one learner's takes before the next learner. When the browser app is scaffolded, provide `npm run test:browser` and use
Playwright accessible locators for responsive UI changes, plus manual audio
checks on real target devices. Estimate schedule and hosting cost after device,
operator, rights, and filing decisions; those dependencies can dominate coding.

## Decisions still needed

- Target phones/tablets and whether families open the activity through WeChat
  or a standalone browser.
- Pilot learners' ages, English level, and independent-use needs.
- Eligibility and willingness to use the existing company as the mainland
  operator, its filing province, and domain ownership arrangements; create a
  dedicated company only if the operating or ownership requirements call for it.
- Available original content, performers, and a budget for three starter scenes.
- Whether local playback is sufficient for the pilot or an adult needs private
  video export immediately.
- Whether the first payer is a parent or an institution distributing family
  access; this does not add teacher workflows to the first release.

The next validation should prove the dubbing session on the founder and
colleague's actual phones, with human review of the chosen footage and timing.
Content marketplaces, cloud migrations, and AI assessment follow demonstrated demand.
