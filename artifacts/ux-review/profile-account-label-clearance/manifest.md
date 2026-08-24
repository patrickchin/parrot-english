# Shared account-label clearance visual evidence

Captured: 2026-08-24

Base: `f83e7ce` from
`codex/profile-compact-primary-action`

Candidate: `1fd1242` from
`codex/profile-account-label-clearance`

Stress identities:

- fallback email: `family.account.for.alexandria.montgomery@example.test`;
- name: `Alexandria-Montgomery-Washington` with the same email.

## Capture method and limits

- The JPEGs are one-device-pixel Playwright Chromium captures against separate
  local Vite servers for the base and candidate worktrees. The browser used a
  light color scheme, reduced motion, loaded document fonts, and the existing
  E2E API fixture. A same-origin session intercept changed only the returned
  name and email.
- Focused captures use keyboard-visible authored focus paint. Routes, copy,
  lesson/profile data, and authentication behavior otherwise remain the
  deterministic repository fixtures.
- These screenshots prove rendered CSS geometry, not physical target size,
  safe-area behavior, screen-reader speech, caregiver recognition of the icon,
  or child comprehension. The stress identities are synthetic boundary inputs,
  not a claim about the distribution of real names.

## Files

| File | Purpose | SHA-256 |
| --- | --- | --- |
| `base/lessons-280x568-email.jpg` | Fallback email consumes the persistent header and completely covers Back | `bfc4428aa2484c7b0b184d6a22c10e38fd8c340fa63c68a9b72e03014363893a` |
| `candidate/lessons-280x568-email.jpg` | Bounded mirrored Back and Account controls at the smallest route viewport | `f63fa60c21bb4515dc05dd2c60db37cdb82bb7b588567c2cb9d4cba032d0f8e9` |
| `base/profile-320x640-email.jpg` | Fallback email covers profile progress and Replay | `3a984ed1e822985d79457ddd7cc25a879215bb51df5f1598810e10c1a72ea0a8` |
| `candidate/profile-320x640-email.jpg` | Stable Account footprint leaves progress and Replay complete | `0de5f749bb4bc19c696f23956698b0833840c1288b49014e934c2ae3fd4b6b6b` |
| `candidate/profile-359x640-email-replay-focused.jpg` | Exact prior focus-only boundary with complete Replay focus paint | `7fdf7c6d61fd9a46e5d7984992622b9353d014cb06c3303e63919f4143c45c14` |
| `base/lesson-768x621-email.jpg` | Fallback email covers the active lesson HUD at the short/md seam | `be9047235714f171b9140d0556c5dc799075f65c727b86e5d540d454ed471bcb` |
| `candidate/lesson-768x621-email-account-focused.jpg` | Focused square Account remains clear of the complete lesson HUD | `ca88de213fd82a2d8e069a69ed5ee75f287b680855a77a9d6e6678a41fdf5bbd` |
| `candidate/lessons-280x568-long-name-menu.jpg` | Full name and email wrap inside the open narrow menu | `eee97bf2a8c6809eef8667d187b2949d472bad64188d4f46530d747eba5c70c3` |
| `candidate/lessons-280x568-long-name-sign-out-error.jpg` | Failed sign-out alert occupies its own row instead of covering menu actions | `73cbd6e39ae3bc7374b2b9db4bcbaab841523c9786656ae35dfccf3e017c73f7` |
| `candidate/lessons-640x360-long-name-sign-out-focused.jpg` | Bounded landscape menu scrolls the last action and complete focus paint into view | `a448ca2489c33ec207de90001128bb1ef27a6dd9ca12a5ec54303b6abe8b44ce` |
| `candidate/lessons-1440x900-long-name.jpg` | Wide layout restores functional Account text without showing arbitrary identity | `7a2f22cde86a703642b1ff3ea35ab800b7f51efa71101c496ec6dba99258bcf3` |

## Measured geometry

| Surface | Base | Candidate | Result |
| --- | --- | --- | --- |
| Lesson list, 280x568 | Account `x=10...270`, width 260; Back `x=10...54` | Account `x=226...270`, width 44; Back unchanged | Complete collision becomes 172px of clear center space. |
| Profile, 320x640 | Account `x=14...306`, width 292; Replay `x=142.56...190.56` | Account `x=254...306`, width 52; Replay unchanged | Progress and Replay no longer sit under Account. |
| Active lesson, 768x621 | Account `x=222.5...740`, width 517.5; HUD `x=96...672` | Account `x=688...752`, width 64; HUD unchanged | Candidate border gap is 16px and remains 8px with Account focus paint. |
| Open menu, 640x360 | Natural panel reached `y=62...369`; focused paint reached `y=365` | Panel `y=62...350`; scroll top 19; focus paint ends at inner clip edge `y=346` | Panel, action, and complete paint remain reachable. |
| Failed sign-out, 280x568 | Fixed alert offset could cover the menu | Panel `y=62...430`; alert `y=169...226`; actions begin at `y=230` | Alert and actions remain separate in normal grid flow. |
| Lesson list, 1440x900 | arbitrary identity could use the old 576px cap | Account `x=1238.81...1412`, width 173.19 | Wide trigger shows only icon, **Account**, and chevron. |

## Rendered verdict

The candidate removes arbitrary identity from every closed persistent header,
keeps the child task and route action visually dominant, and preserves the full
identity one activation away. The narrow open-menu capture initially exposed a
grid min-content escape that a `scrollWidth` assertion had missed. The retained
candidate adds `min-width: 0` to each identity row; the full strings now wrap
inside the 280px viewport and the acceptance test also measures their rendered
border boxes.

Independent review then reproduced unbounded vertical growth: the ordinary
stress identity reached below a 640x360 viewport, and longer CJK/RTL identities
made fixed-position actions unreachable because they did not increase document
scroll height. The retained panel has a viewport-relative maximum height and
owned scrolling. Menu actions use an eight-pixel scroll margin so browser focus
scrolling includes the authored outline/ring, not only the button border.

A failed sign-out previously reopened with its fixed alert painted over Delete
account and Sign out. The alert now becomes a normal-flow row inside the open
bounded panel and remains below the trigger only while the menu is closed.
Both reviewer follow-ups have durable focused/error screenshots above.

Retain provisionally. Physical-device safe-area checks, enlarged-text review,
screen-reader output, and direct child/caregiver recognition remain follow-up
evidence rather than claims made from these screenshots.
