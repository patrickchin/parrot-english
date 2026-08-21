# Shared Focus Visibility Evidence

Captured 2026-08-21 (Asia/Shanghai) for
`codex/shared-focus-visibility`.

## Provenance

- Every image is a genuine Codex in-app Browser JPEG whose pixel dimensions
  match its filename.
- Before-state source: `codex/contrast-safe-child-actions` at `a851d88`, served
  from `http://127.0.0.1:4185` by Vite with the repository's opt-in E2E
  session/API mocks.
- After-state source: the production implementation committed at `d5e1bdc`,
  served from `http://127.0.0.1:4186` with the same mocks.
- No production account, profile, lesson, story, microphone, or child data was
  used. The profile captures use the repository's deterministic fallback
  profile fixture; the other routes use the standard local E2E learner and
  lesson/story fixtures.
- The browser viewport was explicitly overridden for each capture. Each focus
  image was taken only after the named accessible target was the document's
  active element and matched `:focus-visible`.
- These are normal-color Chromium captures. Forced-colors evidence is limited
  to the automated computed-style regression described in the implementation
  memo; there is no simulated or real Windows High Contrast screenshot here.
- The JPEGs are qualitative review evidence. Quantitative changed-area and
  contrast calculations used fresh lossless in-memory Playwright screenshots,
  not these compressed files.

## Captures

| File | Viewport | Accessible target and evidence moment |
| --- | ---: | --- |
| [before-profile-setup-focus-280x568.jpg](./before-profile-setup-focus-280x568.jpg) | 280×568 | Base **Set up profile** focus treatment on the profile gradient |
| [after-profile-setup-focus-280x568.jpg](./after-profile-setup-focus-280x568.jpg) | 280×568 | Matched candidate **Set up profile** with the contiguous light/deep indicator |
| [after-profile-field-focus-280x568.jpg](./after-profile-field-focus-280x568.jpg) | 280×568 | Candidate profile textarea focus fallback |
| [after-profile-icon-focus-280x568.jpg](./after-profile-icon-focus-280x568.jpg) | 280×568 | Candidate circular **Speak your answer** icon-button focus |
| [after-profile-text-action-focus-280x568.jpg](./after-profile-text-action-focus-280x568.jpg) | 280×568 | Candidate transparent **Skip for now** text-action focus |
| [before-account-menu-focus-390x844.jpg](./before-account-menu-focus-390x844.jpg) | 390×844 | Base **Learner profile** focus outline against the navy menu |
| [after-account-menu-focus-390x844.jpg](./after-account-menu-focus-390x844.jpg) | 390×844 | Matched candidate **Learner profile** focus treatment |
| [after-story-card-focus-390x844.jpg](./after-story-card-focus-390x844.jpg) | 390×844 | Candidate story-card link focus, including viewport-edge containment |
| [after-story-level-tab-focus-390x844.jpg](./after-story-level-tab-focus-390x844.jpg) | 390×844 | Candidate selected story-level tab focus |
| [before-story-reader-focus-390x844.jpg](./before-story-reader-focus-390x844.jpg) | 390×844 | Base dark Story Reader **Back** link focus |
| [after-story-reader-focus-390x844.jpg](./after-story-reader-focus-390x844.jpg) | 390×844 | Matched candidate dark Story Reader **Back** link focus |
| [after-lesson-player-focus-640x360.jpg](./after-lesson-player-focus-640x360.jpg) | 640×360 | Candidate lesson **Back** action beside scene art at the short-wide boundary |
| [after-lesson-player-focus-1440x900.jpg](./after-lesson-player-focus-1440x900.jpg) | 1440×900 | Candidate lesson **Back** action over the desktop image/overlay composition |

## Quantitative evidence

The focused browser regression compares focused and unfocused screenshots of
the same target. It counts CSS-pixel-equivalent rendered pixels whose
same-position luminance change reaches 3:1 and requires at least the area of a
two-CSS-pixel perimeter using the target's rendered corner geometry.

On the unchanged base, 10 of 12 cases passed and the two known dark-surface
cases failed:

| Base target | Qualifying changed area | Required area | Strongest same-pixel change |
| --- | ---: | ---: | ---: |
| Account-menu **Learner profile** | 0 CSS px² | 857 CSS px² | 1.280:1 |
| Story Reader **Back** | 0 CSS px² | 327 CSS px² | 1.000:1 |

The candidate passes all 12 cases. Its normal-color layer order is control →
four-pixel white inner ring → four-pixel deep-navy outline → surface. The two
focus tokens are 16.576:1 apart. The outside footprint remains the same eight
CSS pixels used by the prior offset outline.

## Integrity

SHA-256 digests:

```text
d32b0f80150665d753fc6a6c43ecef1de3dd9cbe1feb91fda10c2a9461e8b3d2  before-profile-setup-focus-280x568.jpg
1fcec29e855a8a1747359591fe7669b7a132af5935dc384a41a20f1f8efb3fe3  before-account-menu-focus-390x844.jpg
a7f6a8cd72244eae7b8389c09f390c9468e1989bbf8c6030bbf179dc90b9cac4  after-profile-text-action-focus-280x568.jpg
a5792f4d734b4f42f146ef7516c58eaf51a32f66563e11673f5157659b869063  after-story-reader-focus-390x844.jpg
ced09ebd675f50fe8d814a1f845d08f30de4386f87f8cb4c0ec3a011b7349029  after-profile-setup-focus-280x568.jpg
eb07078fba395eae3a94978154d6a8558be85938187c8a5ba40f89f3d3e277ca  after-profile-field-focus-280x568.jpg
22d210b991095f781969c9f32904050597d36f275d62c631f7b02e1926764919  after-profile-icon-focus-280x568.jpg
8b9c56c78ba72aba3d95364d997d101b774856235d48b6990373d13b1cb40455  after-lesson-player-focus-1440x900.jpg
de6307072a4f6552a84cb8fd25a186f42524b3818fabc7d5d2c741d321bb7e95  after-lesson-player-focus-640x360.jpg
5d503b9060921d71a44d43ec041594e08aa7099f30b79a68b4b2bb20dc292eaf  after-account-menu-focus-390x844.jpg
ec27d469ad1372f3b3394d2f5cd05023762fb654929457ce019d63a142c5001a  after-story-level-tab-focus-390x844.jpg
040a6d6acb8d12c4abc4226d3c6b5a428fcb8f1a942ea63f7eaaa4deb0ef8589  before-story-reader-focus-390x844.jpg
d790aa7bd8ad5f587ebabe029304cae76cb56fe4022ec89700d1b85337a1c76d  after-story-card-focus-390x844.jpg
```

## Review decision and limits

Retain the shared two-color treatment provisionally. The matched dark-surface
captures make the focus location visible without changing control geometry,
and the narrow profile, story-card, selected-tab, short-wide lesson, and
desktop image-adjacent captures show no observed clipping or main horizontal
overflow.

These images are review evidence, not a conformance certificate. They do not
prove every pixel next to an arbitrary image or gradient, every browser or
device, real forced-color palettes, target assistive-technology behavior,
zoom/text-spacing behavior, or comprehension by children and caregivers. The
route-specific Story Reader page-text focus treatment is not a shared-control
consumer and remains a separate recorded follow-up.
