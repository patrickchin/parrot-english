# Twenty additional meme scenes — 2026-10-29

Added for the existing adult prototype test, bringing the meme shelf to 24.
The earlier Sintel sample was subsequently retired from the product. Every addition has selectable roles,
English dialogue, Chinese meaning hints, 5 ms reference peaks, and word timings
forced-aligned to its prepared audio. Learner recordings remain in memory.

The film excerpts and extracted thumbnails are **not cleared for redistribution**.
A YouTube upload, including an official upload, does not grant our service a
licence to rehost or edit it. Each manifest retains the source, original studio
credit, excerpt offsets, and `redistribution-not-cleared` status. These additions
do not establish clearance for a child pilot or public commercial catalogue.

| Scene | Film / series | Source | Source excerpt | Prepared duration |
| --- | --- | --- | --- | --- |
| [一直游下去！](https://parrotbook.com/#keep-swimming) | Finding Nemo | [YouTube](https://www.youtube.com/watch?v=AsemWIZUk4k&t=7s) | 7.25–10.70 s | 3.462 s |
| [鱼儿是朋友！](https://parrotbook.com/#fish-friends) | Finding Nemo | [YouTube](https://www.youtube.com/watch?v=c6mVl6fAxLw&t=18s) | 18.60–21.45 s | 2.880 s |
| [飞向宇宙！](https://parrotbook.com/#infinity) | Toy Story | [YouTube](https://www.youtube.com/watch?v=T2b-Ve0GHBw&t=46s) | 46.60–49.80 s | 3.200 s |
| [你是个玩具！](https://parrotbook.com/#you-are-a-toy) | Toy Story | [YouTube](https://www.youtube.com/watch?v=wRsTXf4jvhY&t=45s) | 45.15–48.10 s | 2.967 s |
| [有风格地落下！](https://parrotbook.com/#falling-with-style) | Toy Story | [YouTube](https://www.youtube.com/watch?v=zffvi3dTVIo&t=192s) | 192.75–196.45 s | 3.712 s |
| [我就是速度！](https://parrotbook.com/#i-am-speed) | Cars on the Road | [YouTube](https://www.youtube.com/watch?v=y39L1PesHmc&t=35s) | 35.85–38.15 s | 2.320 s |
| [咔嚓！](https://parrotbook.com/#ka-chow) | Cars | [YouTube](https://www.youtube.com/watch?v=bhOdIoonjP4&t=5s) | 5.20–8.20 s | 3.003 s |
| [太毛茸茸了！](https://parrotbook.com/#so-fluffy) | Despicable Me | [YouTube](https://www.youtube.com/watch?v=82utG7Q3G_k&t=52s) | 52.40–54.10 s | 1.668 s |
| [香蕉！](https://parrotbook.com/#banana) | Minions | [YouTube](https://www.youtube.com/watch?v=d3psto4Y0o4&t=4s) | 4.50–6.90 s | 2.419 s |
| [松鼠！](https://parrotbook.com/#squirrel) | Up | [YouTube](https://www.youtube.com/watch?v=xrAIGLkSMls&t=17s) | 17.70–20.04 s | 2.360 s |
| [刚认识就喜欢你！](https://parrotbook.com/#meet-dug) | Up | [YouTube](https://www.youtube.com/watch?v=xrAIGLkSMls&t=8s) | 8.40–11.15 s | 2.760 s |
| [谁都能做饭！](https://parrotbook.com/#anyone-can-cook) | Ratatouille | [YouTube](https://www.youtube.com/watch?v=thkDWSUzQDo&t=17s) | 17.20–19.05 s | 1.869 s |
| [没有秘密配料！](https://parrotbook.com/#secret-ingredient) | Kung Fu Panda | [YouTube](https://www.youtube.com/watch?v=K7DnFGdqT8c&t=37s) | 37.15–39.40 s | 2.252 s |
| [今天是一份礼物！](https://parrotbook.com/#today-is-a-gift) | Kung Fu Panda | [YouTube](https://www.youtube.com/watch?v=PSBfcpqICvY&t=72s) | 72.20–77.45 s | 5.255 s |
| [吼一声嘛！](https://parrotbook.com/#do-the-roar) | Shrek Forever After | [YouTube](https://www.youtube.com/watch?v=6I5B0jyLBUg&t=58s) | 58.35–59.50 s | 1.168 s |
| [我们到了吗？](https://parrotbook.com/#are-we-there-yet) | Shrek 2 | [YouTube](https://www.youtube.com/watch?v=basofea2UEs&t=25s) | 25.90–28.60 s | 2.700 s |
| [谁在我的沼泽里？](https://parrotbook.com/#my-swamp) | Shrek | [YouTube](https://www.youtube.com/watch?v=xuS9UxuUZ3Y&t=70s) | 70.30–73.55 s | 3.253 s |
| [我准备好了！](https://parrotbook.com/#im-ready) | SpongeBob SquarePants | [YouTube](https://www.youtube.com/watch?v=AGTH7rOEbxE&t=0s) | 0.00–3.35 s | 3.378 s |
| [蛋黄酱是乐器吗？](https://parrotbook.com/#mayonnaise) | SpongeBob SquarePants | [YouTube](https://www.youtube.com/watch?v=bJ1-CMJY7CE&t=15s) | 15.10–20.85 s | 5.756 s |
| [微笑，挥挥手！](https://parrotbook.com/#smile-and-wave) | Madagascar | [YouTube](https://www.youtube.com/watch?v=F64CJmF2dHM&t=3s) | 3.10–6.80 s | 3.700 s |

## Authoring and storage

`content/extra-scenes.json` is the source recipe. `src/extra-clips.json` is its
generated library index. The files in `public/packs/<slug>/` are JSON manifests
and numeric waveform metadata only. Video and JPEG media are uploaded separately
to the existing Alibaba OSS bucket in Hong Kong; ESA contains application code
and metadata. No runtime speech recognition or voice generation was added.

```sh
node scripts/prepare-extra-packs.mjs [slug ...]
node scripts/prepare-waveforms.mjs [slug ...]
uv run --python 3.12 scripts/align-words.py [slug ...]
npm test
npm run build
npm run test:browser
```

The preparation script needs FFmpeg and the named source files under the ignored
`content/local-dubbing/` folder. It preserves existing pack, role, and line IDs.
The source downloads, prepared video, thumbnails, and temporary speech transcripts
stay out of Git and the app build. After preparing changed media, publish it under
a fresh object filename if that filename has already shipped: media uses immutable
cache headers. The files in this expansion use their initial `v1` names.

The first cuts were checked for unrelated intros, remix footage, and partial
preceding speech. Several sources were replaced during this review. The speed
scene uses Mater in Cars on the Road so the character is visible while speaking;
the original Cars opening speaks that line over black frames. Ka-chow is a
character catchphrase, and Minion speech is a performance exercise rather than a
model of standard English. Only the excerpt is included, not a recommendation of
the entire source upload for children.

As with the original meme packs, there is no separate music/effects stem: a take
replaces the full original audio mix during the selected character's line. Each
scene's **Scene credits / 片段与来源** panel provides its YouTube link.


## Verification

- All 20 manifests pass the shared pack validator, have globally distinct entity
  IDs, complete word cues, and a reference waveform matching their duration.
- All 40 new OSS media objects match local SHA-256 digests, return byte ranges,
  and allow anonymous CORS reads from the app origin with correct media types.
- The browser suite covers all 24 shelf cards and bilingual search, playback of
  every meme pack, and recording a turn in both a new one-role scene and a new
  two-role scene. Desktop and phone Chromium use synthetic microphones; WebKit
  microphone capture remains a physical-device check.
- The production preview also plays all 24 meme packs directly from OSS, without
  local media routes. No new runtime packages or infrastructure services were added.
