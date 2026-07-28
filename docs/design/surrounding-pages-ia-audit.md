# Surrounding Pages IA Audit

Date: 2026-07-28

## Product jobs

Parrot English currently has two learner jobs:

1. have an open English conversation with Peppa;
2. choose and play a guided speaking lesson.

There are three supporting jobs:

1. enter or leave the learning account;
2. personalize practice for one learner;
3. let a supervising adult create or edit a custom lesson.

Progress and storytelling do not yet support a job. They must not compete with
today's usable choices or navigate to dead ends. The revised presentation keeps
them as smaller disabled previews below the two primary activities.

## Current-state sitemap and journey audit

```text
/login
  -> /profile/setup (required once, with Skip for now)
    -> /
      -> /talk-to-peppa
      -> /lessons
        -> /lessons/parrot/:id/scenes/:scene
        -> /lessons/my/:id/scenes/:scene
        -> /lessons/my/create
        -> /lessons/my/:id/edit
      -> /lessons/my/create (duplicate home entry)
      -> /progress (disabled card -> coming-soon page)
      -> /stories (disabled card -> coming-soon page)

Account-name menu
  -> /profile (learner details, despite the account-oriented placement)
  -> About
  -> Log out
```

The route and gate implementation is safe: it preserves same-origin
destinations across authentication, canonicalizes lesson scenes, and redirects
unknown routes home. The presentation has these problems:

- Five equal home cards obscure the only two usable learner activities.
- Create a Lesson is duplicated on Home and in My Lessons even though the flow
  is a supervising-adult tool with an exposed JSON editor.
- Progress and Storytelling are visible promises with no successful outcome.
- "Profile" in an account menu conflates account identity, learner
  personalization, and settings.
- "Chat with Peppa again" inside profile editing sounds like the main
  conversation activity but actually restarts profile setup.
- Lesson cards place artwork, a long title, metadata, and an action side by
  side; at 280-320 px the title is squeezed into a narrow column.
- My Lesson loading uses obsolete CSS class names, and a load failure silently
  redirects to the catalog.

### Primary journey findings

- **New learner:** authentication and profile setup are serial gates before any
  practice. Skip exists, but the setup value and later edit location are not
  clearly explained.
- **Returning learner:** Home asks the learner to scan five choices even though
  only Talk to Peppa and Lessons work.
- **Start a chat:** the entry is clear; the exit returns home. When realtime
  chat is unavailable, the fallback offers only Home instead of another useful
  practice path.
- **Choose a lesson:** the catalog is correctly separated by ownership, but the
  page gives every built-in lesson equal visual weight and becomes cramped on
  narrow screens.
- **Edit a learner profile:** fields are straightforward, but the route and
  labels do not distinguish learner data from the authenticated account.
- **Sign out:** the action exists in the name menu, but "Log out" does not match
  the product's "Sign in" language.
- **Recover from failures:** auth/profile screens generally provide Retry.
  Custom-lesson list and route failures are weaker and can become dead ends.

## Competitor evidence

These are direct observations from current official product or help material.
They describe information architecture and product behavior; they are not a
claim that every cited app screen has the same visual layout at every
breakpoint.

- [Duolingo's home-screen redesign](https://blog.duolingo.com/new-duolingo-home-screen-design/)
  says the home screen was changed to give learners one clear path and a best
  next step. [Duolingo ABC's published scope and sequence](https://lit-lessons-cdn.duolingo.com/resources/duolingo_abc_scope_and_sequence_english.pdf)
  maps levels to buildings and lessons to steps within a path.
- [Lingokids' Parents Area](https://help.lingokids.com/hc/en-us/articles/115005129325-What-is-the-Parents-Area)
  separates the Kids Area from progress, child-profile, subscription, download,
  and account controls, and places a parental age gate between them.
- [Khan Academy Kids' parent guide](https://khankids.zendesk.com/hc/en-us/articles/360006764812-Parent-and-Home-Account-Users-Getting-Started-and-creating-an-account-with-Khan-Academy-Kids)
  shows one large Play action for the personalized Learning Path and a
  secondary Library entry. Its
  [parental-controls guide](https://khankids.zendesk.com/hc/en-us/articles/360047566151-How-do-I-access-parental-controls)
  places those controls in the parent section.
- [Speak's Tutor guide](https://help.speak.com/en/articles/11396739-what-is-speak-tutor)
  places Tutor access at the bottom of Home or Practice. Tutor can create
  personalized speaking lessons and lets learners revisit lessons they
  created.
- [Praktika](https://praktika.ai/) promotes a personalized study plan and free
  conversation. Its current
  [Learning Process guide](https://intercom.help/praktika-ai/en/articles/10707916-learning-process)
  places study-plan goals on Lessons while completed lessons, progress, avatar,
  and learning-language settings live under Profile.
- [ELSA's navigation guide](https://elsanow.freshdesk.com/en/support/solutions/articles/31000177846-general-navigation-guide-for-elsa)
  makes Today the task-oriented home, sends each task directly to its lesson or
  coach session, keeps structured learning under Learn, and groups Profile,
  achievements, and the leaderboard under Progress.

### Translation to Parrot English

The reusable pattern is not "copy a learning path." Parrot English has only two
working learner modes and seven built-in lessons. The applicable pattern is:

- make the next useful learner actions obvious;
- keep browse/create tools inside the content area they affect;
- keep learner data distinct from account actions;
- do not expose parent-area concepts until there is a real parental boundary;
- if unavailable features are previewed, keep them disabled and visually
  subordinate to working activities.

## Keep, change, remove, merge, split

| Decision | Recommendation |
| --- | --- |
| Keep | Home as the learner hub; Talk to Peppa; Lessons; source-separated lesson URLs; safe auth/profile redirects; shared headers; account menu; custom lesson routes. |
| Change | Home to two primary activity choices plus two smaller disabled previews; lessons to one compact thumbnail-led vertical list with the primary action on the right; "Profile" to "Learner profile"; "Log out" to "Sign out"; preserve the page that opened Learner profile; setup and retry copy to say what happens next. |
| Remove | The duplicate Create a Lesson home card, working-link treatment for unfinished features, and exposed generated JSON from the default custom-lesson path. |
| Merge | Custom lesson creation into the My Lessons section as its secondary adult-oriented action. |
| Split | Account identity (email/sign-out/about) from learner personalization (name/age/about); simple custom-lesson generation from advanced JSON import/editing. |

## Implemented target IA

```text
/login                         Account access
  -> /profile/setup            Optional learner personalization gate
    -> /                       Primary: Talk to Peppa | Lessons
                               Disabled previews: Progress | Storytelling
      -> /talk-to-peppa        Open conversation
      -> /lessons              Ready-made lessons | My lessons
        -> lesson player       Back to Lessons
        -> create/edit custom  Clearly labeled grown-up tool

Account menu
  -> /profile?returnTo=…       Learner profile; Back/Cancel/Save returns to source
  -> About
  -> Sign out

/progress, /stories            Legacy-safe redirects to Home; not linked
unknown routes                 Redirect to Home
```

This intentionally does not add a fake Parent Area, global tab bar, progress
dashboard, or resume system without data. Those become appropriate only when
the corresponding product behavior exists.
