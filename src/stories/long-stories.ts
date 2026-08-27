import type { Story } from "./story-types.ts";

const LONG_STORY_SOURCES = [
  {
    "assumedKnownWords": [],
    "category": "Long stories",
    "completionText": "You finished The Gruffalo!",
    "cover": {
      "alt": "",
      "prompt": "",
      "src": null
    },
    "durationMinutes": 6,
    "id": "the-gruffalo",
    "level": "long-stories",
    "pages": [
      {
        "artwork": {
          "alt": "",
          "prompt": "",
          "src": null
        },
        "id": "page-001",
        "joinIn": "Turn the page!",
        "joinInAudioId": null,
        "narrationAudioId": "story-the-gruffalo-page-001-narration",
        "text": " A mouse took a stroll through the deep dark wood.\nA fox saw the mouse, and the mouse looked good.\n\n\"Where are you going to, little brown mouse?\nCome and have lunch in my underground house.\"\n\n\"It's terribly kind of you, Fox, but no –\nI'm going to have lunch with a gruffalo.\"\n\n\"A gruffalo? What's a gruffalo?\"\n\"A gruffalo! Why, didn't you know?"
      },
      {
        "artwork": {
          "alt": "",
          "prompt": "",
          "src": null
        },
        "id": "page-002",
        "joinIn": "Turn the page!",
        "joinInAudioId": null,
        "narrationAudioId": "story-the-gruffalo-page-002-narration",
        "text": "He has terrible tusks, and terrible claws,\nAnd terrible teeth in his terrible jaws.\"\n\n\"Where are you meeting him?\"\n\"Here, by these rocks,\nAnd his favourite food is roasted fox.\"\n\n\"Roasted fox! I'm off!\" Fox said.\n\"Goodbye, little mouse,\" and away he sped.\n\n\"Silly old Fox! Doesn't he know,\nThere's no such thing as a gruffalo?\""
      },
      {
        "artwork": {
          "alt": "",
          "prompt": "",
          "src": null
        },
        "id": "page-003",
        "joinIn": "Turn the page!",
        "joinInAudioId": null,
        "narrationAudioId": "story-the-gruffalo-page-003-narration",
        "text": "On went the mouse through the deep dark wood.\nAn owl saw the mouse, and the mouse looked good.\n\n\"Where are you going to, little brown mouse?\nCome and have tea in my treetop house.\"\n\n\"It's terribly kind of you, Owl, but no –\nI'm going to have tea with a gruffalo.\"\n\n\"A gruffalo? What's a gruffalo?\"\n\"A gruffalo! Why, didn't you know?"
      },
      {
        "artwork": {
          "alt": "",
          "prompt": "",
          "src": null
        },
        "id": "page-004",
        "joinIn": "Turn the page!",
        "joinInAudioId": null,
        "narrationAudioId": "story-the-gruffalo-page-004-narration",
        "text": "He has knobbly knees, and turned-out toes,\nAnd a poisonous wart at the end of his nose.\"\n\n\"Where are you meeting him?\"\n\"Here, by this stream,\nAnd his favourite food is owl ice cream.\"\n\n\"Owl ice cream! Toowhit toowhoo!\"\n\"Goodbye, little mouse,\" and away Owl flew.\n\n\"Silly old Owl! Doesn't he know,\nThere's no such thing as a gruffalo?\""
      },
      {
        "artwork": {
          "alt": "",
          "prompt": "",
          "src": null
        },
        "id": "page-005",
        "joinIn": "Turn the page!",
        "joinInAudioId": null,
        "narrationAudioId": "story-the-gruffalo-page-005-narration",
        "text": "On went the mouse through the deep dark wood.\nA snake saw the mouse, and the mouse looked good.\n\n\"Where are you going to, little brown mouse?\nCome for a feast in my logpile house.\"\n\n\"It's terribly kind of you, Snake, but no –\nI'm having a feast with a gruffalo.\"\n\n\"A gruffalo? What's a gruffalo?\"\n\"A gruffalo! Why, didn't you know?"
      },
      {
        "artwork": {
          "alt": "",
          "prompt": "",
          "src": null
        },
        "id": "page-006",
        "joinIn": "Turn the page!",
        "joinInAudioId": null,
        "narrationAudioId": "story-the-gruffalo-page-006-narration",
        "text": "His eyes are orange, his tongue is black,\nHe has purple prickles all over his back.\"\n\n\"Where are you meeting him?\"\n\"Here, by this lake,\nAnd his favourite food is scrambled snake.\"\n\n\"Scrambled snake! It's time I hid!\"\n\"Goodbye, little mouse,\" and away Snake slid.\n\n\"Silly old Owl! Doesn't he know,\nThere's no such thing as a gruffal...?\"\n\n...OH!\""
      },
      {
        "artwork": {
          "alt": "",
          "prompt": "",
          "src": null
        },
        "id": "page-007",
        "joinIn": "Turn the page!",
        "joinInAudioId": null,
        "narrationAudioId": "story-the-gruffalo-page-007-narration",
        "text": "But who is this creature with terrible claws\nAnd terrible teeth in his terrible jaws?\nHe has knobbly knees, and turned-out toes,\nAnd a poisonous wart at the end of his nose.\nHis eyes are orange, his tongue is black,\nHe has purple prickles all over his back.\n\n\"Oh help! Oh no!\nIt's a gruffalo!\"\n\n\"My favourite food!\" the Gruffalo said.\n\"You'll taste good on a slice of bread!\""
      },
      {
        "artwork": {
          "alt": "",
          "prompt": "",
          "src": null
        },
        "id": "page-008",
        "joinIn": "Turn the page!",
        "joinInAudioId": null,
        "narrationAudioId": "story-the-gruffalo-page-008-narration",
        "text": "\"Good?\" said the mouse. \"Don't call me good!\nI'm the scariest creature in this wood.\nJust walk behind me and soon you'll see,\nEveryone is afraid of me.\"\n\n\"All right,\" said the Gruffalo, bursting with laughter.\n\"You go ahead and I'll follow after.\"\n\nThey walked and walked till the Gruffalo said,\n\"I hear a hiss in the leaves ahead.\""
      },
      {
        "artwork": {
          "alt": "",
          "prompt": "",
          "src": null
        },
        "id": "page-009",
        "joinIn": "Turn the page!",
        "joinInAudioId": null,
        "narrationAudioId": "story-the-gruffalo-page-009-narration",
        "text": "\"It's Snake,\" said the mouse. \"Why, Snake, hello!\"\nSnake took one look at the Gruffalo.\n\"Oh crumbs!\" he said, \"Goodbye, little mouse!\"\nAnd off he slid to his logpile house.\n\n\"You see?\" said the mouse. \"I told you so.\"\n\"Amazing!\" said the Gruffalo.\n\nThey walked some more till the Gruffalo said,\n\"I hear a hoot in the trees ahead.\""
      },
      {
        "artwork": {
          "alt": "",
          "prompt": "",
          "src": null
        },
        "id": "page-010",
        "joinIn": "Turn the page!",
        "joinInAudioId": null,
        "narrationAudioId": "story-the-gruffalo-page-010-narration",
        "text": "\"It's Owl,\" said the mouse. \"Why, Owl, hello!\"\nOwl took one look at the Gruffalo.\n\"Oh dear!\" he said, \"Goodbye, little mouse!\"\nAnd off he flew to his treetop house.\n\n\"You see?\" said the mouse. \"I told you so.\"\n\"Astounding!\" said the Gruffalo.\n\nThey walked some more till the Gruffalo said,\n\"I can hear feet on the path ahead.\""
      },
      {
        "artwork": {
          "alt": "",
          "prompt": "",
          "src": null
        },
        "id": "page-011",
        "joinIn": "Turn the page!",
        "joinInAudioId": null,
        "narrationAudioId": "story-the-gruffalo-page-011-narration",
        "text": "\"It's Fox,\" said the mouse. \"Why, Fox, hello!\"\nFox took one look at the Gruffalo.\n\"Oh help!\" he said, \"Goodbye, little mouse!\"\nAnd off he ran to his underground house.\n\n\"Well, Gruffalo,\" said the mouse. \"You see?\nEveryone is afraid of me!\nBut now my tummy's beginning to rumble.\nMy favourite food is – gruffalo crumble!\"\n\n\"Gruffalo crumble!\" the Gruffalo said,\nAnd quick as the wind he turned and fled."
      },
      {
        "artwork": {
          "alt": "",
          "prompt": "",
          "src": null
        },
        "id": "page-012",
        "joinIn": "Turn the page!",
        "joinInAudioId": null,
        "narrationAudioId": "story-the-gruffalo-page-012-narration",
        "text": "All was quiet in the deep dark wood.\nThe mouse found a nut and the nut was good."
      }
    ],
    "promptExperiment": {
      "focus": "Read aloud",
      "hypothesis": "Saved narration supports reading along.",
      "instruction": "Listen and read along."
    },
    "summary": "The Gruffalo",
    "targetWords": [],
    "title": "The Gruffalo"
  },
  {
    "assumedKnownWords": [],
    "category": "Long stories",
    "completionText": "You finished We’re Going on a Bear Hunt!",
    "cover": {
      "alt": "",
      "prompt": "",
      "src": null
    },
    "durationMinutes": 3,
    "id": "we-re-going-on-a-bear-hunt",
    "level": "long-stories",
    "pages": [
      {
        "artwork": {
          "alt": "",
          "prompt": "",
          "src": null
        },
        "id": "page-001",
        "joinIn": "Turn the page!",
        "joinInAudioId": null,
        "narrationAudioId": "story-we-re-going-on-a-bear-hunt-page-001-narration",
        "text": "We're going on a bear hunt,\nWe're gonna catch a big one,\nWhat a beautiful day,\nWe're not scared.\nOh oh!\nGrass,\nLong, wavy, grass.\nWe can't go over it,\nWe can't go under it,\nWe've gotta go throught it!\nSwishy swashy, swishy swashy.\nWe're going on a bear hunt,\nWe're gonna catch a big one,\nWhat a beautiful day,\nWe're not scared.\nOh oh!\nMud,\nThick, oozy mud."
      },
      {
        "artwork": {
          "alt": "",
          "prompt": "",
          "src": null
        },
        "id": "page-002",
        "joinIn": "Turn the page!",
        "joinInAudioId": null,
        "narrationAudioId": "story-we-re-going-on-a-bear-hunt-page-002-narration",
        "text": "We can't go over it,\nWe can't go under it,\nWe've gotta go throught it!\nSquelch squelch, squelch squelch\nWe're going on a bear hunt,\nWe're gonna catch a big one,\nWhat a beautiful day,\nWe're not scared.\nOh oh!\nA river,\nA deep, cold river.\nWe can't go over it,\nWe can't go under it,\nWe've gotta go throught it!\nSplish splosh, splish splosh."
      },
      {
        "artwork": {
          "alt": "",
          "prompt": "",
          "src": null
        },
        "id": "page-003",
        "joinIn": "Turn the page!",
        "joinInAudioId": null,
        "narrationAudioId": "story-we-re-going-on-a-bear-hunt-page-003-narration",
        "text": "We're going on a bear hunt,\nWe're gonna catch a big one,\nWhat a beautiful day,\nWe're not scared.\nOh oh!\nA forest,\nA big, dark forest.\nWe can't go over it,\nWe can't go under it,\nWe've gotta go throught it!\nStmble trip, stumble trip.\nWe're going on a bear hunt,\nWe're gonna catch a big one,\nWhat a beautiful day,\nWe're not scared.\nOh oh!\nA cave,"
      },
      {
        "artwork": {
          "alt": "",
          "prompt": "",
          "src": null
        },
        "id": "page-004",
        "joinIn": "Turn the page!",
        "joinInAudioId": null,
        "narrationAudioId": "story-we-re-going-on-a-bear-hunt-page-004-narration",
        "text": "A scary, dark cave.\nWe can't go over it,\nWe can't go under it,\nWe've gotta go throught it!\nTiptoe, tiptoe.\n(Say the following verse all together and quickly.)\nOH NO IT'S A BEAR!!!\nQuick!\nThrough the cave, tiptoe, tiptoe,\nThrough the forest, stumble trip, stumble trip,\nThrough the river, splish splosh, splish spolosh,\nThrough the mud, squelch squelch, squelch squelch,\nThrough the grass, swishy swashy, swishy swashy."
      },
      {
        "artwork": {
          "alt": "",
          "prompt": "",
          "src": null
        },
        "id": "page-005",
        "joinIn": "Turn the page!",
        "joinInAudioId": null,
        "narrationAudioId": "story-we-re-going-on-a-bear-hunt-page-005-narration",
        "text": "Run to the house, run up the stairs,\nOh oh forgot to shut the door!\nRun back downstairs, shut the door,\nRun back up, to the bedroom,\nJump into bed, pull up the covers,\nWE ARE NEVER GOING ON A BEAR HUNT AGAIN!!"
      }
    ],
    "promptExperiment": {
      "focus": "Read aloud",
      "hypothesis": "Saved narration supports reading along.",
      "instruction": "Listen and read along."
    },
    "summary": "We’re Going on a Bear Hunt",
    "targetWords": [],
    "title": "We’re Going on a Bear Hunt"
  }
] satisfies readonly Story[];

const STORY_MEDIA_BASE = "https://media.parrotbook.com/assets/v5";

const LONG_STORY_SPLITS = {
  "the-gruffalo": [
    ["Come and have lunch in my underground house.\""],
    ["And his favourite food is roasted fox.\""],
    ["Come and have tea in my treetop house.\""],
    ["And his favourite food is owl ice cream.\""],
    ["Come for a feast in my logpile house.\""],
    ["And his favourite food is scrambled snake.\""],
    ["And a poisonous wart at the end of his nose."],
    ["Everyone is afraid of me.\""],
    ["And off he slid to his logpile house."],
    ["And off he flew to his treetop house."],
    ["And off he ran to his underground house."],
    [],
  ],
  "we-re-going-on-a-bear-hunt": [
    ["Long, wavy, grass.", "Swishy swashy, swishy swashy."],
    ["Squelch squelch, squelch squelch", "A deep, cold river."],
    ["A big, dark forest.", "Stmble trip, stumble trip."],
    ["Tiptoe, tiptoe.", "Quick!"],
    [],
  ],
} as const;

const LONG_STORY_VISUALS = {
  "the-gruffalo": {
    cover: {
      alt: "A little brown mouse walks through a sunlit forest while a large tusked creature watches from the path.",
      prompt: "A brave little woodland mouse begins a journey as a friendly-looking tusked forest creature appears between the trees.",
    },
    scenes: [
      ["A little brown mouse politely greets a fox outside a tree-root burrow.", "A brave little mouse meets a friendly red fox beside an underground woodland den in warm dappled light."],
      ["The mouse smiles by a pile of rocks as the frightened fox runs away.", "The confident mouse stands beside woodland rocks while a red fox flees down the path in comic alarm."],
      ["The mouse greets a tawny owl leaning from a doorway high in an oak.", "A tawny owl invites the little mouse toward a cozy treetop hollow in a deep green forest."],
      ["The mouse watches a startled owl fly away above a sparkling stream.", "A knowing mouse stands by a woodland stream while a tawny owl flaps quickly back to its tree hollow."],
      ["The mouse greets a green snake curled inside a mossy log pile.", "A friendly green snake curls from a snug log-pile home to greet the little woodland mouse."],
      ["The surprised mouse sees enormous purple-prickled feet as the snake flees by a lake.", "At a shadowy woodland lake, a snake escapes while the feet and prickles of a huge creature enter behind the astonished mouse."],
      ["A huge tusked, purple-prickled creature bends toward the tiny mouse in a forest clearing.", "A full friendly-comic reveal of a towering tusked forest creature meeting a tiny quick-thinking mouse."],
      ["The confident mouse leads the laughing creature along a woodland path.", "The little mouse marches ahead while the enormous purple-prickled creature follows through the deep forest."],
      ["A green snake dives into its log pile after seeing the creature behind the mouse.", "The mouse calmly greets a snake as the huge creature watches and the startled snake retreats into its logs."],
      ["A tawny owl flies toward its tree hollow after seeing the creature with the mouse.", "The mouse greets an owl beneath an oak while the amazed creature watches the owl hurry away."],
      ["The triumphant mouse points as the fox and the huge creature run in opposite directions.", "At a woodland crossroads, the bold mouse sends both a fox and the enormous forest creature racing away."],
      ["The little mouse sits peacefully on a mossy root and eats a nut.", "A quiet golden woodland ending with the contented mouse nibbling one hazelnut on a mossy tree root."],
    ],
  },
  "we-re-going-on-a-bear-hunt": {
    cover: {
      alt: "Four children follow a meadow path toward a river, forest, cave, and distant bear.",
      prompt: "Four diverse young adventurers set out across a bright layered landscape toward a distant gentle bear.",
    },
    scenes: [
      ["Four children push through long grass toward a wide patch of thick mud.", "Four adventurous children swish through tall meadow grass as the youngest discovers the muddy path ahead."],
      ["Four muddy children hold hands and splash through a cold blue river.", "The same four children laugh and help one another wade through a sparkling river toward a pine forest."],
      ["Four children step over roots in a dark pine forest with a cave ahead.", "The children travel together through a big shadowy forest while a rocky cave waits beyond the trees."],
      ["Four surprised children turn to run after meeting a gentle brown bear in a cave.", "Inside a rocky cave, the children discover one curious shaggy bear and wheel around in comic surprise."],
      ["The four children cuddle safely under a patchwork quilt with the front door shut.", "A cozy moonlit ending with all four children laughing under one quilt after closing the door and lining up their muddy boots."],
    ],
  },
} as const;

function splitSceneText(text: string, markers: readonly string[]) {
  const parts: string[] = [];
  let remaining = text;

  for (const marker of markers) {
    const markerIndex = remaining.indexOf(marker);
    if (markerIndex < 0) {
      throw new Error("Missing long-story split marker: " + marker);
    }
    const boundary = markerIndex + marker.length;
    parts.push(remaining.slice(0, boundary).trimEnd());
    remaining = remaining.slice(boundary).replace(/^\n+/u, "");
  }

  parts.push(remaining);
  return parts;
}

export const LONG_STORIES = LONG_STORY_SOURCES.map((sourceStory) => {
  if (!(sourceStory.id in LONG_STORY_SPLITS)) {
    throw new Error("Missing long-story plan: " + sourceStory.id);
  }
  const storyId = sourceStory.id as keyof typeof LONG_STORY_SPLITS;
  const splitPlan = LONG_STORY_SPLITS[storyId];
  const visuals = LONG_STORY_VISUALS[storyId];
  let pageNumber = 0;

  return {
    ...sourceStory,
    cover: {
      ...visuals.cover,
      src:
        STORY_MEDIA_BASE +
        "/stories/" +
        sourceStory.id +
        "-cover.webp",
    },
    pages: sourceStory.pages.flatMap((sourcePage, sceneIndex) => {
      const [alt, prompt] = visuals.scenes[sceneIndex];
      const artwork = {
        alt,
        prompt,
        src:
          STORY_MEDIA_BASE +
          "/story-pages/" +
          sourceStory.id +
          "-page-" +
          String(sceneIndex + 1).padStart(3, "0") +
          ".webp",
      };

      return splitSceneText(sourcePage.text, splitPlan[sceneIndex]).map(
        (text) => {
          pageNumber += 1;
          const id = "page-" + String(pageNumber).padStart(3, "0");
          return {
            artwork,
            id,
            joinIn: sourcePage.joinIn,
            joinInAudioId: null,
            narrationAudioId:
              "story-" + sourceStory.id + "-" + id + "-narration",
            text,
          };
        },
      );
    }),
  };
}) satisfies readonly Story[];
