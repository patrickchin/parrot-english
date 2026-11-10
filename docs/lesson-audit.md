# Speaker and source-cut audit — 2026-11-10

Reviewed all 32 active lessons against per-turn source frame sheets, authored
captions, saved source transcripts, and word alignments. This is an editorial
and technical audit; automated transcription and alignment are supporting
evidence, not a substitute for a final human listening pass.

## Corrections

| Lesson | Correction |
| --- | --- |
| Ben: How do I look? | Holly says the opening warning and “Me too.” Nanny Plum comments on the old hat and casts the spell. Ben keeps his own two turns. Include Holly’s complete closing response about her recovered wand. |
| Is that a dinosaur? | Danny’s short reaction belongs to Danny, not Peppa. Separate Madame Gazelle’s “Really scary!” from Danny’s “That’s brilliant!” and retain the teacher as a supporting voice. |
| Ka-chow | Chick Hicks asks about looking in Dinoco blue; Lightning McQueen repeats “Dinoco blue?” |
| What about the floor? (`banana`) | Margo also asks about the air. Remove Agnes’s unused role. |
| I am speed | Attribute the speed announcement to the announcer, not Mater. The announcer remains in the original soundtrack. |

No further speaker changes were identified in the other 27 lessons. The three
benchmark edits (Patrick, Chocolate, Onions) retain their source media and timings.

Supporting voices remain correctly attributed in the manifest and audible in
scene playback. Explicit `selectable: false` omits them from the practice picker.
Use this editorially, rather than automatically hiding every one-line role:
Agnes’s payoff in So fluffy and the boy’s repeated request in Do the roar are
still practice roles. Supporting-only parts in this revision are Madame Gazelle,
the speed announcer, Suzy and Mummy Pig in Pretend doctors, Margo in So fluffy,
Edith in What about the floor, Russell in Meet Dug, Fiona in the two relevant
Shrek scenes, Donkey in My swamp, Plankton in Mayonnaise, and Private in Smile and
wave.

## Source endings

Eleven scenes have revised media: Ben’s hat, Fish are friends, Ka-chow, What
about the floor, Squirrel, Anyone can cook, Secret ingredient, Today is a gift,
Do the roar, My swamp, and Smile and wave. The ten older edits retain a short
source tail; Ben’s scene continues through Holly’s complete closing response.
Word alignment was regenerated for Ben and the split dinosaur turns. Reference
windows retain up to 220 ms after aligned final words where the next turn and
source clip permit it. Existing windows are never shortened to create a gap.

The So fluffy source file itself ends at 54.054 s; its “It’s so fluffy!” payoff
is already complete in the saved source transcript. No synthetic silence or
repeated video frames were added. Existing media/audio remain in Alibaba OSS;
ESA holds code and structured pack/waveform metadata. Learner takes remain in
browser memory.

## Authoring checks

1. Identify each turn from the source performance. Check who speaks, including
   off-screen speakers, interjections, and speaker changes inside a draft line.
2. Compare caption endings with the uncut source. Forced alignment inside an
   already-truncated window cannot prove the final syllable is complete.
3. Leave a natural release after the final sound when the source allows it.
   Keep the next speaker out of a per-line prompt; include their full turn if
   the scene continues. Preserve genuine interruptions in the original exchange.
4. Choose useful practice parts explicitly. Keep incidental lines in the
   original soundtrack and manifest even when their speaker is not selectable.
5. Rebuild captions after timing/role edits with
   `node scripts/prepare-review-clips.mjs <cohort> --captions-only`. Recut changed
   source ranges first. Run `--check` for both cohorts, pack tests, and browser
   checks for the corrected role flow and end-of-line playback.

All 32 local MP4s passed full FFmpeg decoding, stream/duration checks, and
caption checks. The release’s 22 new video/poster objects are hash-verified
against OSS before publication. Local frame sheets and playback screenshots
belong under `~/Pictures/Screenshots/Codex/parrot-english/`.
