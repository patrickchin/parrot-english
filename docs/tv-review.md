# TV conversation review — 2026-11-11

The first eight continuous dialogue cuts were selected for adult review and subsequently
approved by the owner for the existing internal test application. They
have 2–4 speaking characters, at least four character turns, and run 23–37
seconds. A second batch adds 12 scenes, bringing the TV folders to nine scenes for older
children and 11 for teenagers.

These age groupings are editorial starting points. The selected exchanges
need adult listening and suitability review for the actual learners; they do
not establish that whole episodes or series are suitable for those ages.

## Review folders

Under `content/local-dubbing/review/` in the shared main checkout:

- `older-children/`: approximately ages 10–12; nine school/family/friendship conversations.
- `teens/`: approximately 13+; 11 faster sitcom conversations.

Open an individual MP4 or `play-all.m3u8`. Matching TXT files contain source
links, characters, summaries, practice goals, and specific content notes.
`index.json` records the source ranges and output SHA-256 hashes. The application scenes include original English audio, bilingual dialogue,
selectable speaking roles, timed words, and reference waveforms.

## First batch

| Folder | Scene | Length | Speaking roles | Source range |
| --- | --- | ---: | --- | --- |
| Older children | A book about making friends | 30.60 s | Sheldon, librarian | [Young Sheldon — TBS](https://www.youtube.com/watch?v=RlQzUX-UOW4&t=29s), 29.70–60.30 s |
| Older children | Trying out a book’s advice | 27.25 s | Sheldon, George | [Young Sheldon — TBS](https://www.youtube.com/watch?v=RlQzUX-UOW4&t=108s), 108.20–135.45 s |
| Older children | Asking Dad to talk to a teacher | 34.95 s | George, Sheldon | [Young Sheldon — official channel](https://www.youtube.com/watch?v=GJ0y2haVfFI&t=16s), 16.50–51.45 s |
| Teens | A sofa that will not turn | 32.50 s | Rachel, Ross, Chandler | [Friends — official channel](https://www.youtube.com/watch?v=UJHa8Bjjy1k&t=165s), 165.90–198.40 s |
| Teens | Joey discovers a thesaurus | 37.20 s | Ross, Joey | [Friends — official channel](https://www.youtube.com/watch?v=ZeTeCcvIVMo), 0.00–37.20 s |
| Teens | Choosing a half of the cheesecake | 29.70 s | Rachel, Chandler | [Friends — TBS](https://www.youtube.com/watch?v=FxLDcqiOSZI&t=55s), 55.70–85.40 s |
| Teens | A very nervous driving lesson | 22.88 s | Barney, Ted | [HIMYM — Day Drunk](https://www.youtube.com/watch?v=aYa-yIHXDAg&t=92s), 92.50–115.38 s |
| Teens | Which animal is the better comparison? | 32.70 s | Marshall, Ted, Robin, Lily | [HIMYM — Cool Ones](https://www.youtube.com/watch?v=thn1SOwjXT0), 0.00–32.70 s |

The first five source uploads are from official show or broadcaster channels.
The two HIMYM uploads are fan uploads; original-work credits and channel names
are retained in the recipe. The selected HIMYM sources are 720p English video
without the burned-in Swedish subtitles found in an earlier driving candidate.

## Selection and cut review

Each output uses one uninterrupted source interval. The sofa scene keeps the
failed move and response. The thesaurus scene includes the request, explanation,
and result. The cake scene retains the decision and sharing conditions. The
driving and animal-comparison scenes contain exchanges rather than catchphrases.

Review notes record family sarcasm, raised voices, food squabbling, comic unsafe
driving, a bar setting with drinks, and a dating metaphor where present. Cut
ranges exclude the sofa-sketch innuendo, Joey’s subsequent dating joke, later
sexual material in the cake compilation, sexist driving remarks, the later
accident joke, and the animal-fighting suggestion. The school cuts exclude the
later crude adult discussion and channel end cards.

Source ASR and frame sheets supported speaker and boundary review. ASR alone
was not treated as evidence of a complete ending: the original surrounding
source was inspected, including the school end card and the next narrator in
the duck comparison. CTC alignment in the uncut duck source places the final
word’s end at 32.507 s and the next voice’s start at 32.848 s; the selected
out-point is 32.700 s. Human listening remains pending.

## Second batch — 12 more complete exchanges

These cuts retain a question, explanation, response, or comic resolution rather
than isolated quotes. They run 11.7–38.6 seconds. The shorter Harry/Ron card
exchange has four complete turns and is not padded with unrelated action.

| Folder | Scene | Length | Speaking roles | Source range |
| --- | --- | ---: | --- | --- |
| Older children | Einstein’s hair and a familiar personality | 23.30 s | Dr. Sturgis, Missy, Sheldon | [Source](https://www.youtube.com/watch?v=Twb47ynU4lw&t=19s), 19.15–42.45 s |
| Older children | Could you move the camera? | 23.45 s | Missy, Researcher | [Source](https://www.youtube.com/watch?v=Twb47ynU4lw&t=158s), 158.55–182.00 s |
| Older children | Breakfast and a difference in meaning | 24.00 s | Missy, Georgie, Mandy | [Source](https://www.youtube.com/watch?v=KzjNc5A25_A&t=29s), 29.05–53.05 s |
| Older children | Everyone gets a chore | 18.85 s | George Cooper Sr., Missy | [Source](https://www.youtube.com/watch?v=sSd7LrihSik&t=139s), 139.85–158.70 s |
| Older children | Where did the picture go? | 11.70 s | Harry, Ron | [Source](https://www.youtube.com/watch?v=phdwdrPs3Bo&t=14s), 14.65–26.35 s |
| Older children | Meeting a new friend on the train | 29.35 s | Ron, Harry | [Source](https://www.youtube.com/watch?v=Pr0U9CgneZ8&t=1s), 1.10–30.45 s |
| Teens | Returning half a sofa | 38.55 s | Shop assistant, Ross | [Source](https://www.youtube.com/watch?v=UJHa8Bjjy1k&t=239s), 239.10–277.65 s |
| Teens | What is that vacuum attachment for? | 19.95 s | Rachel, Chandler | [Source](https://www.youtube.com/watch?v=fOcYm9udNQA&t=4s), 4.10–24.05 s |
| Teens | Imagine not paying the bill immediately | 20.37 s | Ross, Monica | [Source](https://www.youtube.com/watch?v=fOcYm9udNQA&t=103s), 103.35–123.72 s |
| Teens | A present or the present? | 30.07 s | Penny, Amy, Sheldon, Leonard | [Source](https://www.youtube.com/watch?v=uQ9YMK3n5kk&t=29s), 29.75–59.82 s |
| Teens | A lesson needs a notebook | 28.95 s | Sheldon, Penny | [Source](https://www.youtube.com/watch?v=hiBXVUMDugY&t=0s), 0.20–29.15 s |
| Teens | Literally or figuratively? | 17.05 s | Ted, Robin, Barney and Marshall | [Source](https://www.youtube.com/watch?v=C-0azcoEvks&t=17s), 17.40–34.45 s |

Young Sheldon, Friends, and The Big Bang Theory sources are official show or
broadcaster uploads. The moving-card source is Warner Bros.; the new-friend
Harry Potter and HIMYM sources are fan uploads, identified in the recipe.

The selected dialogue includes family teasing, cleaning, chores, meeting a
friend, returning a damaged sofa, and figurative language. The gift game ends
with Penny's figurative “kill them” remark; the Einstein scene contains a
fictionalized childhood anecdote. Adult review for individual learners remains
appropriate. Later sexual jokes, crude family dialogue, and a subsequent
nationality joke are excluded by the selected intervals.

Source frames, captions, independent ASR, and uncut-source alignment supported
speaker and boundary checks. Amy's brief agreement and Barney/Marshall's
overlapping agreement stay in the original audio as non-selectable support.
The vacuum scene stops after Chandler's punchline, before a different multi-
speaker exchange. The gift-game out-point retains the last word and precedes
the next voice. Human listening review remains pending.

## Reproduce and check

The maintained recipe is `content/tv-review-scenes.json`. Preserve each source
at the recorded ignored `localFile` path. FFmpeg and FFprobe are required.

```sh
node scripts/prepare-tv-review.mjs
node scripts/prepare-tv-review.mjs --check
```

The script validates IDs, durations, speaking-role/turn minimums, audio/video
streams, and full decoding of the selected cuts. Pass scene slugs to process
only a new batch; `--metadata-only` refreshes review notes/captions without
re-encoding existing media. Media, raw downloads, ASR,
playlists, and review indexes stay in the ignored authoring directory. Source
frame sheets are under `~/Pictures/Screenshots/Codex/parrot-english/` with the
`tv-review-` and `more-` prefixes. No speech was generated.

The batch retains `redistribution-not-cleared` status and the existing internal
test access settings. Public-release rights have not been established.

`node scripts/prepare-tv-scenes.mjs` prepares independent scenes and updates
their content packs. Hashed MP4 and poster files retain their existing OSS URLs;
scene manifests, waveform metadata, search summaries, and localized content also
publish to OSS through the [pack publishing workflow](content-packs.md). ESA
holds application code and interface assets.
The upload manifest is generated under the ignored `tv-release/media.json`.
The first batch uploaded 16 media objects; the second batch adds 24 objects.
Uploads are checked against MD5/size metadata.
The temporary exact-object uploader and credentials were deleted after upload.

At this batch's release, the application had 52 scenes across four folders:
24 film/animation clips, eight younger-child scenes, nine ages-10–12 TV scenes,
and 11 teen TV scenes.
The shared sofa response is preserved as an incidental non-selectable role.
The driving captions retain Ted’s Zitch-dog game call; the cake captions retain
Rachel’s off-screen response. Prompt boundaries are kept between speaker changes.
Only a merge to GitHub `main` triggers the automatic ESA application release.
