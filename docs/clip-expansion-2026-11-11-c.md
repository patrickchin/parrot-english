# Twelve more complete exchanges — 2026-11-11, batch C

The internal-test catalogue now has 64 continuous scenes: 24 film/animation,
14 around age five, 12 for older children, and 14 for teens. This batch adds
six younger-child conversations and three each for the other two age folders.
The groupings are editorial starting points; listening and age-fit review for
individual learners remains pending.

Every cut keeps at least two speaking characters and three actual character
turns. Setup, responses, pauses, and the scene's resolution stay together in
one source interval. There are no stitched compilations or narrator-only
vocabulary clips. Original English audio is preserved; no speech was generated.

| Folder | Scene | Length | Speaking roles | Uncut source range |
| --- | --- | ---: | --- | --- |
| Around five | Can we have some real coins? | 22.70 s | Bandit, Bluey, Chilli | [Source](https://www.youtube.com/watch?v=zqExJdPYu00&t=9s), 9.65–32.35 s |
| Around five | Dad, this is not fair! | 21.64 s | Bluey, Bandit | [Source](https://www.youtube.com/watch?v=zqExJdPYu00&t=84s), 84.80–106.44 s |
| Around five | That pancake went too high! | 29.75 s | Daddy Pig, Peppa, Mummy Pig | [Source](https://www.youtube.com/watch?v=mzGkxm7lLrg&t=0s), 0.00–29.75 s |
| Around five | Let George have another turn | 20.72 s | Peppa, Daddy Pig | [Source](https://www.youtube.com/watch?v=SHi4XJxgfVs&t=145s), 145.40–166.12 s |
| Around five | My magic went a bit wrong | 19.70 s | Nanny Plum, Holly | [Source](https://www.youtube.com/watch?v=Kmw12eUP4MM&t=119s), 119.15–138.85 s |
| Around five | I have got a simple plan | 25.75 s | Holly, Ben | [Source](https://www.youtube.com/watch?v=Kmw12eUP4MM&t=310s), 310.55–336.30 s |
| 10–12 | That is no way to thank our hosts | 25.70 s | George Cooper Sr., Sheldon | [Source](https://www.youtube.com/watch?v=VSrdPFnxYNA&t=0s), 0.40–26.10 s |
| 10–12 | You can make your own breakfast | 22.90 s | George Cooper Sr., Missy | [Source](https://www.youtube.com/watch?v=sSd7LrihSik&t=114s), 114.40–137.30 s |
| 10–12 | Will I be timed? | 23.82 s | Dr. Sturgis, Sheldon | [Source](https://www.youtube.com/watch?v=Twb47ynU4lw&t=110s), 110.78–134.60 s |
| Teens | What was in that brown jar? | 16.05 s | Chandler, Joey | [Source](https://www.youtube.com/watch?v=IHJI6_VpH00&t=7s), 7.20–23.25 s |
| Teens | Is that how water works? | 15.50 s | Ted, Robin, Marshall | [Source](https://www.youtube.com/watch?v=C-0azcoEvks&t=1s), 1.45–16.95 s |
| Teens | Not for two thousand six hundred years | 13.90 s | Penny, Sheldon | [Source](https://www.youtube.com/watch?v=hiBXVUMDugY&t=106s), 106.55–120.45 s |

## Dialogue and boundaries

Bilingual lines, stable role/line IDs, word cues, and waveform metadata accompany
each scene. Source frames and two independent ASR passes supported speaker and
text checks. CTC cues were reviewed against those references; high-pitched
Bluey lines and mechanical noises needed manual corrections. Ben's plan keeps
Holly's interruption about the meadow as her own line. Daddy Pig gives the final
hide-and-seek instruction. Dr. Sturgis conducts Sheldon's test. Marshall's brief
shirt joke stays in the original audio as non-selectable support.

Ends were checked against the uncut sources. The magic-mistake final word ends
at 138.491 s, before the 138.850 s cut and the next speaker at 139.193 s. Missy's
final “fridge” ends at 136.906 s, before the 137.300 s cut. “Fantastic” ends at
134.063 s, before 134.600 s. Bluey's final word ends at 106.189 s; the 106.440 s
cut leaves its release and excludes the channel card. Per-line prompts stop
before a different speaker enters. Human listening remains pending.

## Content notes

Bluey's claw game is intentionally unfair family role-play; Mum's job offer
means a household chore. The pancake mishap uses a hot pan and is not a child
cooking demonstration. Holly's mistakes involve fictional magic. Ben's later
put-down and the bird/climbing sequence are excluded. Dad proposes a prank,
and Sheldon rejects it as unkind; the prank is not performed. The breakfast
exchange includes family sarcasm. Test names are proper nouns, not assessment
advice. Joey's food joke shows poor food-safety judgment; the payment argument,
violent shove, and adult subplot are excluded. The HIMYM cut discusses water
and sarcasm; the final teen scene is a bathroom-break joke during a long lesson.

## Authoring and delivery

The maintained preschool and TV recipes record the source-relative ranges and
reviewed dialogue. Matching local MP4, bilingual VTT, and TXT review files stay
under the ignored `content/local-dubbing/review/<folder>/` directories. Pass
selected slugs to the existing preparation scripts; the scene builder's
`--preschool` flag handles a selected preschool batch without rebuilding the
older scenes. Scene manifests and waveforms live with application metadata.

The new Bluey, Peppa Pig, Young Sheldon, and Friends downloads are from official
show/broadcaster channels. The existing HIMYM source is a fan upload. Source
names, credits, links, and the `redistribution-not-cleared` status are retained.
The owner approved continued uploads to the existing internal-test application;
this does not establish public-release rights or change the site's access settings.

OSS holds the 24 new immutable video/poster objects; ESA holds code and structured
metadata. All uploads were verified by hash and size, and the temporary exact-
object RAM uploader, key, and policy were removed. Releases use the automatic
GitHub-main ESA build and require the live health revision and playback checks.
