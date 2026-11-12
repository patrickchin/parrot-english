# Meme discovery and scene additions

Updated 2026-11-12, Asia/Shanghai.

Choose moments people want to imitate, perform, and send to friends: creator
comedy, reaction exchanges, funny interviews, livestream moments, and recognizable
internet clips. A film or show is one possible source. Recognition, the comic
beat, and usable English determine the choice; a famous franchise alone does not.

The owner requested **ongoing discovery with periodic scene batches**, replacing
the earlier hourly request. The first batch contains **13 distinct
meme families** in [`content/meme-discovery.json`](../content/meme-discovery.json).
That file is the maintained research queue. Candidates are not playable catalog
entries, published scenes, or a claim to rank the most popular memes globally.

## First batch

The following priorities are editorial judgments. Counters are snapshots returned
by source extraction on 2026-11-12, not proof of recent growth or popularity today.
These established memes should anchor the enduring-favorites track while later
scans look for emerging material.

| Priority | Moment | Evidence and English fit | Next step |
| --- | --- | --- | --- |
| High | Emotional Damage | [Steven He original](https://www.youtube.com/watch?v=miD_TWmdGIY): 73,001,395 views returned. [Bilibili explainer](https://www.bilibili.com/video/BV1ZZ4y1f7eP/): rounded 3.1M views, evidence of Chinese recognition. | Playable reaction exchange published with the insulting support line retained but not selectable; adult prototype only. |
| High | Corn Kid | [Original interview](https://www.youtube.com/watch?v=1VbZE6YhjKk): 14,109,446 views. [Creator’s Instagram reel](https://www.instagram.com/reel/Cg14y_1Ilq0/): 2,165,042 likes returned. | Playable spoken exchange published and live-verified. The interview is separate from the musical remix. |
| High | Apparently Kid | [WNEP original](https://www.youtube.com/watch?v=rz5TGN7eUcM): 73,377,142 views returned. | Playable ride interview published and live-verified after source/speaker checks and independent recognition. |
| Medium | Can I pet that dog? | [Family-upload lead](https://www.youtube.com/shorts/YYx51ZrSn3g). Simple request and escalating emphasis. | Verify uploader and adult responses; distinguish the original family footage from bear/dog remixes. |
| Medium | Weather boy | [Source history](https://knowyourmeme.com/memes/wouldnt-you-like-to-know-weather-boy). Question, evasive answer, comic reaction. | Find the rights-holder footage. It is a staged father/son exchange, not an authentic hostile interview. |
| Medium | Very demure, very mindful | [Jools Lebron original-post lead](https://www.tiktok.com/@joolieannie/video/7399736793119247662), corroborated by [reuse discussion](https://www.reddit.com/r/OutOfTheLoop/comments/1f05iwy/). | Verify playback and a self-contained spoken passage; counts UNKNOWN. Solo performance needs an explicit format decision before changing the current exchange-oriented review tool. |
| Hold | city不city | [Douyin explainer](https://www.douyin.com/video/7381453938089905471), [Xiaohongshu spread discussed by Language Log](https://languagelog.ldc.upenn.edu/nll/?p=67359). | Cultural reference for a separately authored English scene; the source is largely Chinese. |
| Hold | 雷军 / Are you OK? | [Bilibili remix](https://www.bilibili.com/video/BV1es411D7sW/) and [speech repost lead](https://www.bilibili.com/video/BV1XE411q7Nj/). | Separate the original English speech from the musical remix. Check natural language fit; avoid accent mockery. |
| Hold | Bing chilling | [Origin research lead](https://zh.wikipedia.org/wiki/%E6%97%A9%E4%B8%8A%E5%A5%BD%E4%B8%AD%E5%9B%BD%EF%BC%8C%E7%8E%B0%E5%9C%A8%E6%88%91%E6%9C%89%E5%86%B0%E6%B7%87%E6%B7%8B). | Mandarin performance; keep as recognition research. |
| Hold | Bombastic Side Eye | [Origin and variants](https://knowyourmeme.com/memes/bombastic-side-eye-side-eye-tiktok-trend), [retrospective describing Douyin adoption](https://groovedynasty.cn/china-trends-2024/). | Sound alone offers too little dialogue. Verify distinct creators and a fuller source before authoring. |
| Hold | Just put the fries in the bag | [Reddit discussion](https://www.reddit.com/r/OutOfTheLoop/comments/1gfvxqd/whats_the_new_put_the_fries_in_the_bag_meme_about/). | Original sketch unverified. Explain dismissive social meaning; not a polite ordering model. |
| Hold | Remember November 2026 is coming | [Recent-date search lead](https://knowyourmeme.com/memes/remember-november-2026-is-coming). | An emerging-material lead, not a verified current trend. AI/sung fragment has little usable dialogue. |
| Hold | Democracy Manifest | [7NEWS follow-up lead](https://www.youtube.com/watch?v=3FVSuHIjN4Y). Distinctive rhetorical delivery. | Adult source review only: arrest, restraint, and anatomical remarks in surrounding footage. |

No comparable current platform-wide ranking or trend velocity was verified.
High priority means promising for review, not cleared or suitable for all ages.

The first three playable additions are published: Corn Kid, Apparently Kid, and
Emotional Damage. Their manifests, timed words, Chinese hints, five-language
metadata, source credits, waveforms, and role portraits are in the pack. See
[the scene batch](social-meme-scenes.md) for source ranges and verification.
The live catalog now contains 111 scenes. All three additions passed live
playback checks on desktop Chromium, phone Chromium, and WebKit, plus
recording/save/reload/replay on both Chromium layouts.

## Coverage and evidence

Chinese discovery starts with Douyin, Bilibili, and Xiaohongshu, then Weibo and
Kuaishou. Western discovery covers TikTok, Reddit, Instagram, Facebook, and
YouTube. Search both Chinese names/梗名 and the original English phrase; search
recent material separately from enduring references.

This run retrieved a Bilibili explainer and the original Instagram reel.
Douyin returned indexed examples but its direct scrape returned navigation.
Xiaohongshu had no verified individual post; secondary reporting establishes a
research lead only. Weibo and Kuaishou searches did not produce a verified
candidate. TikTok and Reddit evidence is indexed leads/discussion, without
direct playback or a ranked-feed audit. Facebook links were found, but the
scraper returned an unsupported-site error. YouTube original media and metadata
were accessible. Record access failures; an inaccessible platform is UNKNOWN.

Keep one record per meme family, with stable opaque `candidate_…` IDs and a
readable `key`. Add source variants and regional names to its evidence, rather
than creating one candidate per repost. Provider IDs remain unchanged. Compare
the queue against existing pack titles, source URLs, and dialogue before adding
another scene of the same moment.

For every retained candidate, record the original creator/source when verified,
individual evidence URLs, retrieval date, evidence type, actual labelled
metrics, language, practice idea, suitability notes, review state, and next
action. Leave unknown creators/counts unknown. Search snippets, view counts on
recommendation cards, hashtags, and platform-wide Discover totals cannot stand
in for an individual clip’s metrics. `bilibili.tv` international traffic does not
establish popularity on mainland `bilibili.com`.

Keep two editorial tracks: enduring favorites and recent leads. Rank within a
platform using comparable metrics and dated observations. Only describe a clip
as rising when repeated comparable observations support that claim. Cross-
platform reuse is valuable recognition evidence but must not be summed into a
made-up global audience count.

## Ongoing discovery and periodic additions

Keep researching while authoring and publish useful batches when they are ready.
The owner replaced the hourly cadence with continuous discovery and additions
from time to time. There is no fixed schedule or unattended worker configured.
This workflow describes work to continue, not a background service.

For each batch:

- Search Chinese platforms and Western platforms, rotating coverage and retaining
  dated sources. Keep emerging material separate from enduring favorites.
- Deduplicate families and reposts against the queue and playable catalog. Record
  access failures and unknown metrics without inventing rankings or growth.
- Advance promising English clips through source, speaker, dialogue, cut, and
  suitability checks. Keep complete exchanges and original performances.
- Prepare actual playable pack entries, bilingual dialogue, timed words,
  waveforms, posters, portraits, credits, and notices. Research alone is not a
  scene addition.
- Validate and test the new scenes, merge through a PR, then explicitly publish
  their media and content catalog to OSS. Verify the live scene links and report
  the actual published count. If upload access is unavailable, report that
  specific blocker; do not describe merged metadata as live scenes.
- Update the queue with concrete scene paths and publication state. Keep adding
  to the research pool while the current batch moves through authoring.

## From a find to a scene

1. Verify the original performance and identify a useful English exchange. Keep
   one continuous interval with the setup and payoff. Favor roughly 10–40
   seconds, at least two speakers, and three real turns in the existing local
   review workflow. Repeated delivery alone is a lead, not a reason to fabricate
   another speaker or dialogue. Broader solo-performance support is a separate
   product choice.
2. Keep the full source locally. Record its provider ID, URL, creator, upload
   date, and offsets. Compare cuts against surrounding uncut material; check the
   final syllable and release and exclude the next speaker from each prompt.
   Verify bilingual text and roles, including brief/off-screen interjections.
3. Write a review recipe and generate MP4/VTT/TXT plus an index and playlist in
   `content/local-dubbing/review/social-memes/`. Generated media is ignored and
   not available to a different checkout unless separately supplied.

   ```sh
   node scripts/prepare-review-clips.mjs social-memes
   node scripts/prepare-review-clips.mjs social-memes --check
   ```

4. Keep human listening, age/language fit, and source permissions visible as
   separate review states. Popularity or a creator’s own upload grants no reuse
   permission by itself. Follow the existing product-plan permissions process.
5. Add accepted scenes through the existing pack workflow, with opaque IDs,
   credits, Chinese hints, source timings, waveforms, and translations. Upload
   actual media to OSS before making a playable pack reference. Validate the
   pack and publish through the explicit content process. ESA holds player
   code; OSS holds structured content and media; takes remain on-device. No
   infrastructure change is needed for this content direction.
