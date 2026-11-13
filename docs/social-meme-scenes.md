# Playable internet meme scenes

Published for the existing adult prototype: original spoken performances from
Recess Therapy, WNEP, and Steven He. The library has 118 authored scenes: 74 in
Memes & clips, 15 First English, 15 Ages 10–12, and 14 Teenagers. Existing scene
manifests and media references are unchanged.

| Scene | Original source | Continuous range | Duration | Practice roles |
| --- | --- | --- | --- | --- |
| A corntastic day! | [Recess Therapy](https://www.youtube.com/watch?v=1VbZE6YhjKk&t=58s) | 58.98–71.40 s | 12.430 s | Tariq, Julian |
| Apparently, you get dizzy! | [WNEP](https://www.youtube.com/watch?v=rz5TGN7eUcM&t=24s) | 24.15–39.15 s | 15.015 s | Sofia, Noah |
| Emotional damage! | [Steven He](https://www.youtube.com/watch?v=miD_TWmdGIY&t=61s) | 61.00–72.88 s | 11.887 s | Steven’s dad, Steven |

Each scene has original video/audio, Chinese meaning hints, five-language title,
role and credit metadata, CTC word timing, a 5 ms waveform, a poster, and actual
speaker crops. Media is served from OSS; local authoring copies remain ignored.
ESA holds code and interface translations; OSS holds media and
structured content. Learner recordings stay on-device. No infrastructure change
is required.

The maintained recipe is `content/social-meme-review-scenes.json`. Role IDs,
scene IDs, original provider IDs, source hashes, exact intervals, normalized
portrait crop recipes, dialogue, timing, and verification notes are retained.

## Source and dialogue checks

Corn Kid uses the original spoken interview, separately from the song remix.
The earlier draft wish was corrected from the burned-in paraphrase to the
spoken version supported by the original automatic captions and independent
recognition. Corntastic is labelled as wordplay. The family laughter remains.
The next sentence begins after this cut.

The WNEP cut preserves Sofia’s off-screen questions and brief interjection as
her own lines. Noah’s repetition and informal grammar remain part of the
performance. The other child’s later television remark is outside the selected
source interval, rather than being reassigned to Noah.

The game boss in Emotional Damage gives the body-related taunt, the dad reacts,
and Steven suggests holding the block button. Aunty’s original line remains in
the video and subtitles with `selectable: false`: the short insulting line offers
little useful practice. The cut stops before her next taunt. Surrounding threats
and profanity are outside this interval. Content notes identify the stereotypes,
body comment, nonstandard phrasing, and adult prototype context.

Source frames, automatic captions, and independent base.en/small.en recognition
were compared, with CTC timing for authored words. Cuts were checked against
surrounding uncut audio, including material beyond both ends; alignment in the
output alone was not treated as evidence of completeness. Human editorial
feedback remains useful during adult testing. This is not a child-pilot approval
or a formal age rating. Reuse permissions remain `redistribution-not-cleared`.

## Reproduce

Supply the original source files and recorded portrait crops under
`content/local-dubbing/`, then run:

```sh
node scripts/prepare-review-clips.mjs social-memes
node scripts/prepare-review-clips.mjs social-memes --check
node scripts/prepare-tv-scenes.mjs --recipe content/social-meme-review-scenes.json
uv run --python 3.12 scripts/align-words.py corn-corntastic-day apparently-get-dizzy emotional-damage
npm run content:validate
npm run content:stage
```

The existing generic builder accepts the recipe’s `reviewFolder` so it consumes
the social-meme cuts directly. Existing pack translations are retained on reruns.
Portrait time/crop records identify the source frames for regenerating JPEGs;
use a new content-derived filename if an image changes.

## Verification and publication

- Full typecheck, 37 application tests, 14 content tests, and the application /
  content boundary build passed. The production build passed.
- Browser checks: 14 passed, one expected WebKit microphone skip. Each new scene
  passed search, role selection, portrait loading, subtitle and credit checks,
  and original playback on desktop Chromium, phone Chromium, and WebKit. All
  three passed recording, save, reload, and replay on both Chromium layouts.
- All three MP4s passed complete decoding, stream/duration and subtitle checks.
  Screenshots are under `~/Pictures/Screenshots/Codex/parrot-english/`.
- Staged catalog: 4 packs, 111 scenes, 226 JSON objects. Aggregate content revision:
  `8e1059c38d166d68a31ef7e7`.
- Upload manifest: `content/local-dubbing/social-release/media.json`, 13 media
  objects, 9,621,509 bytes, each with a recorded SHA-256 checksum.
- **Published and live-verified on 2026-11-12**: the catalog contains 111 scenes.
  All 226 staged JSON objects and 13 media objects matched expected SHA-256
  checksums; all 457 external media references were available before activation.
  Catalog activation happened last with `Cache-Control: no-store`.
- The authenticated Alibaba MCP connection issued short-lived PUT URLs for the
  exact existing OSS object keys. This used the same staged release and catalog-
  last publication sequence as the CLI publisher. Alibaba signing rate limits
  were respected. No upload identity or bucket setting was changed.
- Nine live scene/surface checks passed against actual production and OSS:
  desktop Chromium, phone Chromium, and WebKit for all three scenes. Both
  Chromium layouts also passed recording, save, reload, and replay. The browser
  flows made no upload requests. Video byte-range requests and CORS passed.
- App workflow 43197333288 succeeded; `/api/health` reports its actual build
  commit `55e3a7a14446b9477d67fad96056de33d01944d8`. The content catalog has
  its independent revision above.

For future publication, upload media to its exact manifest keys, verify sizes
and hashes, then use the authenticated OSS content publisher from merged source.
The publisher
checks every external media reference, uploads immutable release objects first,
and replaces the catalog last. Verify all three live links and playback before
changing the publication status. Re-read the live catalog before activating an
update so another authoring batch is not silently overwritten.

Discovery continues alongside authoring and additions are published in batches.
The earlier hourly schedule request has been replaced; no timer is configured.


## Second batch — 2026-11-13

Two more scenes were published and live-verified on 2026-11-13 for the same
adult prototype, bringing the live catalog to 113 scenes (69 in Memes & clips).
All 111 earlier scene manifests are preserved byte-for-byte. Publication followed
PR #266 merging; media and immutable JSON were verified before catalog activation.

| Scene | Source archive | Continuous range | Encoded duration | Practice roles |
| --- | --- | --- | --- | --- |
| Wouldn't you like to know, weather boy? | [FOX5 broadcast archive](https://www.youtube.com/watch?v=XOi2jFIhZhA) | 0–12.02 s | 12.034 s | Ted Pretty, Ted’s son |
| I like turtles! | [KGW broadcast archive](https://www.youtube.com/watch?v=CMNry4PE93Y) | 0–13.08 s | 13.114 s | Nancy Francis, Jonathon |

Weather boy was a planned joke between Ted Pretty and his son, as Pretty
confirmed in [Esquire’s interview](https://www.esquire.com/news-politics/news/a56034/weather-boi-ted-pretty-interview/).
The source includes the setup, sarcastic reply, and reporter’s reaction; it stops
after “Back to you guys” with its release, before the studio anchor speaks.
Fireworks sales appear in the background. The credits explain the staged joke.

I like turtles uses the original 2007 broadcast, separately from the later movie
promotion. [KGW’s retrospective](https://www.kgw.com/article/entertainment/zombie-kid-i-like-turtles-returns-teenage-mutant-ninja/283-75fbb90e-8f82-4d53-b725-a3b9eee83c64)
confirms the source, reporter, and Jonathon’s name. The cut retains the reporter’s
introduction and question, the unexpected answer, and “You’re a great zombie.”
The next broadcast sentence is excluded. Jonathon’s punchline is selectable.
Portraits come from the same uncut source, including the reporter’s later frame.

Both use source-specific credits, five-language title/role/credit metadata,
Chinese hints, CTC words, and 5 ms waveforms. Full-source small.en recognition and
source-frame checks precede alignment; final syllables and the next speaker are
checked against the original context. No generated speech or infrastructure
change. Reuse permission remains unconfirmed under the existing adult prototype
notices. Chinese-platform queries supplied BBC Dad research leads but no
verified Chinese popularity evidence for these two clips; archive view counts
are dated observations, not current rankings.


Second-batch verification:

- `npm test`: 37 application, 14 content, and one boundary test passed. The
  production build passed. All five meme review clips passed complete FFmpeg
  decoding and caption checks.
- Browser suite: 20 passed, one expected WebKit microphone skip. Both new clips
  passed discovery, portraits, roles, subtitles/credits, and original playback
  on desktop Chromium, phone Chromium, and WebKit. Chromium also passed
  recording, save, reload, and replay on both layouts.
- Content revision: `d6d4b08b481818c6541fc053`; 230 staged JSON objects and eight
  media objects passed SHA-256 verification. All 465 referenced media objects
  were available before catalog activation; the catalog uses `no-store`.
- Six live scene/surface checks passed against production and real OSS media.
  All four Chromium checks also recorded, saved, reloaded, and replayed a take.
  No upload requests or page errors occurred. Physical-device microphone testing
  remains separate from the browser checks.
- Player workflow 43377801528 succeeded; production health matched its actual
  build commit `e3b21a4f838eadfae494bc4f50dc5d39105a1cdf`. Content has its own
  revision above. Media/structured content remain in OSS and learner recordings
  remain on-device.


## Third batch — 2026-11-13

Three more scenes were published and live-verified on 2026-11-13 for the adult
prototype. The live catalog has 116 scenes, including 72 in Memes & clips. All
113 preceding scene manifests and their translations remain unchanged. Publication
followed PR #268 merging, with immutable files verified and the catalog activated last.

| Scene | Source archive | Continuous range | Duration | Practice roles |
| --- | --- | --- | --- | --- |
| What's nine plus ten? | [Vine archive](https://www.youtube.com/watch?v=wSRHxVDMzvc) | 0–5.60 s | 5.607 s | Questioner, Boy |
| And they were roommates! | [Matt Sukkar Vine archive](https://www.youtube.com/watch?v=y-P0m0M_8pc) | 0–4.38 s | 4.380 s | Woman, Matt |
| Can I pet that dog? | [Family upload](https://www.youtube.com/watch?v=YYx51ZrSn3g) | 3.82–10.72 s | 6.900 s | Acesyn, Kayla |

The social review authoring guard now accepts complete two-speaker exchanges
from four seconds and two turns, while retaining the longer conversation guards
for other cohorts. No looping or padding is added to satisfy a duration target.
A CLI regression check verifies short social captions and continued rejection of
the same short film edit or a single-speaker exchange.

The 9 + 10 archive repeats its Vine twice; the player uses only the first complete
exchange and ends before the second copy. Both insults remain as performed,
with an adult-prototype content note. The answer 21 is the joke; the Chinese hint
and all five credit translations state that the correct answer is 19. The
questioner is off-screen and the performers’ identities remain unverified. The
archive uploader is credited separately from the original performance.

[VICE’s history](https://www.vice.com/en/article/why-and-they-were-roommates-was-the-best-vine-ever/)
identifies Matt Sukkar, the original Vine `OhP767KHxxJ`, and the two spoken lines.
The walking woman remains unidentified. No relationship is inferred beyond the
spoken word roommates. Both portraits use the actual source frames. The final
roommates and its release remain before the original archive ends.

[FOX 13’s report](https://www.fox13news.com/news/hilarious-video-shows-texas-boy-refusing-to-go-to-sleep-until-he-pet-that-dog)
identifies Acesyn and his mother Kayla Holley. This is the original indoor family
footage, not the bear remix. The cut keeps three complete requests and both
refusals, then the raised-voice release before the next exchange. The child’s
accent confuses automatic recognition; authored wording follows the repeated
source phrase corroborated by the publisher. Kayla stays selectable with her
own off-screen lines. She has no source portrait, so the shared initials display
is used. The 9 + 10 questioner uses the same fallback. No portraits are invented.

All three include original source audio, Chinese hints, CTC words, waveforms,
and five-language title/role/credit text. Source checks include context beyond
the chosen cuts and the next speaker; alignment alone is not treated as proof
of a complete ending. Media and structured content remain in OSS, application
code in ESA, and learner recordings on-device. Reuse permission remains
unconfirmed under the existing adult-prototype notices. Chinese-platform queries
did not supply verified popularity metrics for this batch.


Third-batch verification:

- 37 application tests, 15 content tests, and one boundary test passed. The
  production build passed. All eight meme cuts passed full decoding and captions.
- Browser suite: 29 passed, one expected WebKit microphone skip. The three new
  clips passed discovery, roles/portraits/initials fallback, subtitles/credits,
  and playback in desktop Chromium, phone Chromium, and WebKit. Both Chromium
  layouts also passed recording, save, reload, and replay.
- Content revision: `1af4c5dd95fc7e7d17649104`. All 236 JSON objects and ten media
  objects passed SHA-256 verification. All 475 referenced media objects were
  available before catalog activation. The catalog uses `no-store`.
- Nine live checks passed against production and actual OSS media. All six
  Chromium checks recorded, saved, reloaded, and replayed a take; the phone checks
  selected the other speaker, including Kayla’s off-screen role. No upload
  requests or page errors occurred. Video byte ranges and CORS passed.
- Player workflow 43381128519 succeeded; production health matched its actual
  build commit `b79bc33dd03e2f80485c6c525ecc52dd49a3ec2d`. Physical-device
  microphone testing remains separate from the browser checks.


## Fourth batch and shared Memes tag — 2026-11-13

Two more performances were published and live-verified on 2026-11-13, bringing
the live catalog to 118 scenes, including ten internet memes. All ten use a single **Memes** browse tag; they do
not create separate creator/source tags. The directory now derives this grouping
from the existing `meme` and `internet` metadata rather than three hard-coded
creator names. Creator/source names remain on scene cards, in credits, and in
search. Film and TV franchise tags remain distinct. Browser checks verify the
Memes count, absence of separate source tags, full member list, and creator search.
All 116 preceding scene manifests, summaries, and translations are preserved.

| Scene | Source | Continuous range | Duration | Practice roles |
| --- | --- | --- | --- | --- |
| I'm in me mum's car! | [Creator Instagram repost](https://www.instagram.com/reel/B_Pzd8yh8ZT/) | 0–6.42 s | 6.420 s | Tristan, Mum |
| Are you OK? | [Unremixed stage archive](https://www.youtube.com/watch?v=rKT-169biQw) | 75.30–84.20 s | 8.920 s | Lei Jun |

The car clip comes from Tristan Simmonds’s own repost, captioned as the original
2014 Vine. Both original speakers and the final reaction remain. Regional
me-for-my and the engine imitation are explained; no rewritten speech is used.
Mum’s one-line role remains selectable, with her actual source portrait. The
credit links directly to Instagram, without appending a YouTube seek suffix.

Lei Jun uses the English speech, separately from the song remix, at Xiaomi’s
23 April 2015 New Delhi launch. [Historical reporting](https://www.geekwire.com/2015/are-you-ok-xiaomi-ceos-speech-becomes-a-hit-viral-music-video/)
distinguishes the speech from the remix. A Bilibili index lead supports recognition
without supplying a current rank. The selected original audio retains the crowd
cheers and one actual English speaker. Hugo is visible but does not speak in this
cut; no audience dialogue or role is invented. The review tool now accepts
multi-line solo memes as well as exchanges, with longer-conversation safeguards
retained for other cohorts. A CLI test covers both formats and rejects a
single-line draft.

An independent CTC alignment of uncut 81.2–87-second context puts the final you
at 83.367–83.468 and the next We at 84.792. Ending at 84.20 retains the release
and excludes the next sentence. Practice focuses on gratitude and question
intonation; it does not mock an accent or present this crowd interaction as a
formal opening greeting. Historical product branding is not a current offer.

Both scenes include original source audio, Chinese hints, five-language
scene/role/credit text, CTC words, waveforms, and actual speaker portraits.
Reuse permission remains unconfirmed under the existing adult-prototype notices.
Code remains in ESA, media/structured content in OSS, and learner takes on-device.
Publication follows merge and immutable-file verification, with the catalog last.


Fourth-batch verification:

- `npm test` passed: 38 application tests, 15 content tests, and one boundary
  test. The production build passed. All ten meme cuts passed full decoding and
  caption checks.
- Browser suite: 38 passed, one expected WebKit microphone skip. The independent
  catalog-backed tag regression also passed on all three browser surfaces.
- Live tag checks passed on desktop Chromium, phone Chromium, and WebKit: one
  Memes tag with all ten members, no separate creator/source tags, working
  creator-name search, and retained film-franchise tags. Source names remain on
  scene cards and credits. Screenshots are in the Codex screenshot folder.
- Content revision `edbaa3405315e81cfc5e7420`: 240 JSON objects and seven media
  objects passed SHA-256 verification; all 482 media references were available
  before catalog activation. Catalog activation remained last with `no-store`.
- Both new scenes passed six production browser checks using actual OSS media.
  All four Chromium flows also recorded, saved, reloaded, and replayed takes.
  No upload requests or page errors occurred. Range requests and CORS passed.
- Player workflow 43384472869 succeeded; production health matched its actual
  build commit `833d81db17f762bc8a308bac81126812fa609c7c`. Physical-device
  microphone testing remains separate from these browser checks.
