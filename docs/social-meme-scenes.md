# Three playable internet meme scenes — 2026-11-12

Published for the existing adult prototype: original spoken performances from
Recess Therapy, WNEP, and Steven He. The library has 111 authored scenes: 67 in
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
