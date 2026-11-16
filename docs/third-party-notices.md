# Third-party software notices

The browser export feature uses `mediabunny@1.65.2` and conditionally loads
`@mediabunny/aac-encoder@1.65.2` when native AAC encoding is unavailable. The AAC
extension's WASM is code in its JavaScript bundle; recordings and authored media
remain outside the application bundle.

The distributed notice is [public/software-notices.html](../public/software-notices.html),
served at `/software-notices.html`. It includes both complete license texts,
attribution, exact source archives, and upstream build instructions.

Mediabunny and the AAC encoder wrapper are copyright © 2026-present, Vanilagy
and contributors, under MPL 2.0. We use their unmodified upstream sources.

- [Exact Mediabunny 1.65.2 sources](https://github.com/Vanilagy/mediabunny/tree/v1.65.2)
- [Published AAC package and wrapper sources](https://registry.npmjs.org/@mediabunny/aac-encoder/-/aac-encoder-1.65.2.tgz)
- [MPL 2.0 license](https://github.com/Vanilagy/mediabunny/blob/v1.65.2/packages/aac-encoder/LICENSE)

The extension contains an unmodified FFmpeg AAC encoder build under LGPL 2.1
or later, copyright its respective contributors. Its upstream build enables
no GPL, version 3, or nonfree components. It uses FFmpeg commit
`60a2818f76dcd1fee3155b1791304af104a0fc1b` and Emscripten 4.0.21. To rebuild or
replace FFmpeg, use the corresponding source and complete upstream commands:

- [Corresponding FFmpeg source archive](https://github.com/FFmpeg/FFmpeg/archive/60a2818f76dcd1fee3155b1791304af104a0fc1b.tar.gz)
- [AAC build commands and artifact provenance](https://github.com/Vanilagy/mediabunny/blob/v1.65.2/packages/aac-encoder/README.md#building-and-development)
- [FFmpeg licensing information](https://github.com/Vanilagy/mediabunny/blob/v1.65.2/packages/aac-encoder/licenses/ffmpeg/LICENSE.md)
- [LGPL 2.1 license](https://github.com/Vanilagy/mediabunny/blob/v1.65.2/packages/aac-encoder/licenses/ffmpeg/COPYING.LGPLv2.1)

When upgrading either package, keep the public notices, source links, and
included license texts aligned with the distributed versions. Preserve the
upstream copyright and license notices when bundling.
