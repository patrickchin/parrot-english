import type {
  Story,
  StoryArtwork,
  StoryPage,
  StoryPromptExperiment,
} from "./story-types.ts";

type PrototypePage = Pick<StoryPage, "id" | "joinIn" | "text"> & {
  artworkPrompt: string;
};

type PrototypeStory = Pick<
  Story,
  | "category"
  | "completionText"
  | "durationMinutes"
  | "id"
  | "level"
  | "assumedKnownWords"
  | "summary"
  | "targetWords"
  | "title"
> & {
  coverPrompt: string;
  pages: readonly PrototypePage[];
  promptExperiment: StoryPromptExperiment;
};

function pageArtwork({
  alt,
  prompt,
  src,
}: {
  alt: string;
  prompt: string;
  src: string | null;
}): StoryArtwork {
  return {
    alt,
    prompt,
    src,
  };
}

function coverArtwork(storyId: string, prompt: string): StoryArtwork {
  return {
    alt: prompt,
    prompt,
    src: `https://media.parrotbook.com/assets/v3/stories/${storyId}-cover.webp`,
  };
}

function makePrototypeStory({
  coverPrompt,
  pages,
  ...story
}: PrototypeStory): Story {
  return {
    ...story,
    cover: coverArtwork(story.id, coverPrompt),
    pages: pages.map(({ artworkPrompt, ...page }, pageIndex) => ({
      ...page,
      artwork: pageArtwork({
        alt: `${artworkPrompt} in ${story.title}, page ${pageIndex + 1}`,
        prompt: artworkPrompt,
        src:
          story.level === "first-words"
            ? `https://media.parrotbook.com/assets/v3/story-pages/${story.id}-${page.id}.webp`
            : null,
      }),
      narrationAudioId: null,
    })),
  };
}

export const STORY_SCRIPT_CANDIDATES: readonly Story[] = [
  makePrototypeStory({
    id: "the-red-ball",
    title: "The Red Ball",
    category: "One object",
    durationMinutes: 1,
    level: "first-words",
    summary: "Follow one red ball as it rolls away and comes home.",
    targetWords: ["red", "ball", "roll", "stop", "home"],
    assumedKnownWords: [],
    coverPrompt: "A bright red ball beside a smiling young child",
    completionText: "The red ball is home.",
    promptExperiment: {
      focus: "One-object repetition",
      instruction:
        "Write a five-page story about one object. Use one colour, two action words, no figurative language, and no sentence longer than six words.",
      hypothesis:
        "Keeping one object throughout lets a new learner understand the action through repetition alone.",
    },
    pages: [
      {
        id: "my-red-ball",
        artworkPrompt: "A child holding one bright red ball",
        text: "Here is my red ball.",
        joinIn: "Red ball!",
      },
      {
        id: "roll-away",
        artworkPrompt: "The red ball beginning to roll away",
        text: "Roll, red ball, roll.",
        joinIn: "Roll, ball, roll!",
      },
      {
        id: "roll-to-me",
        artworkPrompt: "The red ball rolling back toward the child",
        text: "The ball rolls to me.",
        joinIn: "Roll, ball, roll!",
      },
      {
        id: "stop-ball",
        artworkPrompt: "The child holding up one hand as the ball stops",
        text: "Stop, red ball, stop!",
        joinIn: "Stop!",
      },
      {
        id: "ball-home",
        artworkPrompt: "The red ball resting in its basket at home",
        text: "My red ball is home.",
        joinIn: "Home!",
      },
    ],
  }),
  makePrototypeStory({
    id: "the-lantern-trail",
    title: "The Lantern Trail",
    category: "Plain-language rewrite",
    durationMinutes: 2,
    level: "tiny-stories",
    summary: "Help Pip guide Flicker home in a simpler version of the first story.",
    targetWords: ["light", "lost", "family", "help", "follow", "glow", "home"],
    assumedKnownWords: [
      "fly",
      "find",
      "hello",
      "little",
      "many",
      "near",
      "need",
      "say",
      "see",
      "thank",
      "walk",
      "water",
    ],
    coverPrompt: "Pip the green parrot walking beside Flicker the little firefly",
    completionText: "Flicker is home. “Thank you, Pip.”",
    promptExperiment: {
      exactRefrain: "Glow, Flicker, glow!",
      focus: "Plain-language rewrite",
      instruction:
        "Preserve the existing characters and plot, but replace every poetic description with literal, high-frequency language. Use no metaphor and no sentence longer than ten words.",
      hypothesis:
        "This tests whether the first story's difficulty came from its language rather than its plot.",
    },
    pages: [
      {
        id: "pip-sees-light",
        artworkPrompt: "Pip seeing Flicker's small light near a garden path",
        text: "Pip sees a little light. “Hello! I am Flicker.”",
        joinIn: "Glow, Flicker, glow!",
      },
      {
        id: "flicker-is-lost",
        artworkPrompt: "Flicker looking worried while Pip listens",
        text: "“I am lost,” says Flicker. “I need my family.”",
        joinIn: "Glow, Flicker, glow!",
      },
      {
        id: "pip-can-help",
        artworkPrompt: "Pip pointing along the path for Flicker to follow",
        text: "“I can help,” says Pip. “Follow me.”",
        joinIn: "Follow Pip!",
      },
      {
        id: "walk-by-water",
        artworkPrompt: "Pip and Flicker walking beside calm water",
        text: "They walk by the water. Flicker glows.",
        joinIn: "Glow, Flicker, glow!",
      },
      {
        id: "family-lights",
        artworkPrompt: "Many little firefly lights flying toward Flicker",
        text: "Many little lights fly near them. “My family!”",
        joinIn: "We found them!",
      },
      {
        id: "flicker-home",
        artworkPrompt: "Flicker with his family while Pip smiles",
        text: "Flicker is home. “Thank you, Pip.”",
        joinIn: "Flicker is home!",
      },
    ],
  }),
  makePrototypeStory({
    id: "the-noisy-little-band",
    title: "The Noisy Little Band",
    category: "Sounds",
    durationMinutes: 2,
    level: "tiny-stories",
    summary: "Make drum, bell, and shaker sounds, first loud and then quiet.",
    targetWords: ["drum", "bell", "shaker", "loud", "quiet", "sing"],
    assumedKnownWords: ["band", "everyone", "little", "smile"],
    coverPrompt: "Three animal friends playing a drum, bell, and shaker",
    completionText: "The little band is quiet.",
    promptExperiment: {
      focus: "Sound-supported meaning",
      instruction:
        "Let sound effects carry part of the meaning. Contrast loud and quiet using the same instruments.",
      hypothesis:
        "Sound-supported vocabulary may stay understandable even when the learner misses some narration.",
    },
    pages: [
      {
        id: "bo-drum",
        artworkPrompt: "Bo playing a small red drum",
        text: "Bo has a drum. Boom, boom!",
        joinIn: "Boom, boom!",
      },
      {
        id: "mia-bell",
        artworkPrompt: "Mia ringing a small gold bell",
        text: "Mia has a bell. Ding, ding!",
        joinIn: "Ding, ding!",
      },
      {
        id: "tomo-shaker",
        artworkPrompt: "Tomo playing a little shaker",
        text: "Tomo has a shaker. Chik, chik!",
        joinIn: "Chik, chik!",
      },
      {
        id: "too-loud",
        artworkPrompt: "The three friends playing very loudly",
        text: "The little band is loud. Too loud!",
        joinIn: "Too loud!",
      },
      {
        id: "play-quiet",
        artworkPrompt: "The band playing softly while friends listen",
        text: "Now the little band is quiet. Tap, ding, chik.",
        joinIn: "Quiet, quiet.",
      },
      {
        id: "band-sings",
        artworkPrompt: "Everyone smiling and singing with the little band",
        text: "Everyone smiles. They sing, la, la, la!",
        joinIn: "Sing, little band!",
      },
    ],
  }),
  makePrototypeStory({
    id: "robo-tries",
    title: "Robo Tries",
    category: "Can and cannot",
    durationMinutes: 2,
    level: "tiny-stories",
    summary: "Ask Robo what he can do and cheer when he tries.",
    targetWords: ["can", "jump", "run", "fly", "swim", "try"],
    assumedKnownWords: ["go", "smile", "walk", "yet"],
    coverPrompt: "A friendly round robot ready to jump and run",
    completionText: "Robo can try!",
    promptExperiment: {
      focus: "Predictable grammar frame",
      instruction:
        "Repeat the question Can you and immediately show success or an attempt. End by valuing trying rather than perfection.",
      hypothesis:
        "A predictable grammar frame can teach several action verbs without adding plot complexity.",
    },
    pages: [
      {
        id: "robo-walks",
        artworkPrompt: "Robo walking with small careful steps",
        text: "Robo can walk. Beep, beep!",
        joinIn: "Go, Robo, go!",
      },
      {
        id: "robo-jumps",
        artworkPrompt: "Robo jumping into the air",
        text: "“Can you jump?” Robo jumps.",
        joinIn: "Yes, I can!",
      },
      {
        id: "robo-runs",
        artworkPrompt: "Robo running across a playground",
        text: "“Can you run?” Robo runs.",
        joinIn: "Yes, I can!",
      },
      {
        id: "robo-tries-flying",
        artworkPrompt: "Robo trying to fly and landing on a soft mat",
        text: "“Can you fly?” Robo tries. Bump! “Not yet.”",
        joinIn: "Try, Robo, try!",
      },
      {
        id: "robo-tries-swimming",
        artworkPrompt: "Robo trying to swim with a bright float",
        text: "“Can you swim?” Robo tries. Splash!",
        joinIn: "Try, Robo, try!",
      },
      {
        id: "robo-can-try",
        artworkPrompt: "Robo smiling proudly beside the pool",
        text: "Robo smiles. “I can try!”",
        joinIn: "I can try!",
      },
    ],
  }),
  makePrototypeStory({
    id: "tess-can-help",
    title: "Tess Can Help",
    category: "Helping",
    durationMinutes: 2,
    level: "tiny-stories",
    summary: "Tess and Timo work together to fix a little cart.",
    targetWords: ["cart", "broken", "help", "wheel", "fix", "roll"],
    assumedKnownWords: [
      "ask",
      "find",
      "hold",
      "little",
      "put",
      "red",
      "sad",
      "smile",
      "together",
    ],
    coverPrompt: "Two friends kneeling beside a red cart with a loose wheel",
    completionText: "The cart can roll again.",
    promptExperiment: {
      focus: "Concrete problem and solution",
      instruction:
        "Use one visible break-and-fix problem, two cooperating characters, and one reusable helping question.",
      hypothesis:
        "A concrete problem gives social language an obvious purpose while keeping the story arc small.",
    },
    pages: [
      {
        id: "cart-broken",
        artworkPrompt: "Timo looking sad beside his broken red cart",
        text: "Timo's red cart is broken. He is sad.",
        joinIn: "Oh no!",
      },
      {
        id: "can-i-help",
        artworkPrompt: "Tess asking Timo if she can help",
        text: "Tess asks, “Can I help?”",
        joinIn: "Can I help?",
      },
      {
        id: "find-wheel",
        artworkPrompt: "Tess and Timo finding the cart's little wheel",
        text: "They find the little wheel.",
        joinIn: "We can help!",
      },
      {
        id: "put-wheel-on",
        artworkPrompt: "Tess holding the wheel while Timo puts it on",
        text: "Tess holds it. Timo puts it on.",
        joinIn: "We can help!",
      },
      {
        id: "fix-cart",
        artworkPrompt: "The two friends fastening the wheel together",
        text: "They fix the cart together.",
        joinIn: "Fix, fix, fix!",
      },
      {
        id: "cart-rolls",
        artworkPrompt: "The repaired red cart rolling while Timo smiles",
        text: "The cart rolls again. Timo smiles.",
        joinIn: "Roll, cart, roll!",
      },
    ],
  }),
  makePrototypeStory({
    id: "ready-maya-ready",
    title: "Ready, Maya, Ready!",
    category: "Morning routine",
    durationMinutes: 2,
    level: "tiny-stories",
    summary: "Follow Maya's morning from waking up to leaving home.",
    targetWords: ["wake", "wash", "get dressed", "eat", "brush", "ready"],
    assumedKnownWords: [
      "bag",
      "face",
      "good",
      "morning",
      "shoe",
      "sock",
      "teeth",
      "toast",
    ],
    coverPrompt: "Maya dressed for school with her bag and shoes on",
    completionText: "Maya is ready!",
    promptExperiment: {
      focus: "Familiar chronological sequence",
      instruction:
        "Put one daily routine action on each page, in real chronological order, with a gesture or sound cue.",
      hypothesis:
        "Familiar sequencing lets the child predict the next page and retell it from personal experience.",
    },
    pages: [
      {
        id: "maya-wakes",
        artworkPrompt: "Maya waking up in bed in the morning",
        text: "Maya wakes up. “Good morning!”",
        joinIn: "Wake up!",
      },
      {
        id: "maya-washes",
        artworkPrompt: "Maya washing her face at a sink",
        text: "She washes her face. Swish, swish.",
        joinIn: "Wash, wash!",
      },
      {
        id: "maya-dresses",
        artworkPrompt: "Maya putting on her socks",
        text: "She gets dressed. Socks on!",
        joinIn: "Get dressed!",
      },
      {
        id: "maya-eats",
        artworkPrompt: "Maya eating toast at a table",
        text: "She eats toast. Crunch, crunch.",
        joinIn: "Eat, eat!",
      },
      {
        id: "maya-brushes",
        artworkPrompt: "Maya brushing her teeth",
        text: "She brushes her teeth. Brush, brush.",
        joinIn: "Brush, brush!",
      },
      {
        id: "maya-ready",
        artworkPrompt: "Maya wearing her bag and shoes by the door",
        text: "Bag on, shoes on. “I am ready!”",
        joinIn: "Ready, Maya, ready!",
      },
    ],
  }),
  makePrototypeStory({
    id: "kite-come-back",
    title: "Kite, Come Back!",
    category: "Small adventure",
    durationMinutes: 2,
    level: "early-a1",
    summary: "Ana asks an adult to help free a kite from a tree.",
    targetWords: ["kite", "wind", "stuck", "string", "pull", "help", "free"],
    assumedKnownWords: [
      "ask",
      "come",
      "dad",
      "down",
      "fly",
      "get",
      "give",
      "high",
      "lift",
      "move",
      "please",
      "red",
      "small",
      "stop",
      "together",
      "tree",
    ],
    coverPrompt: "Ana and Dad holding a red kite beneath a tree",
    completionText: "The kite is free!",
    promptExperiment: {
      focus: "Problem, attempt, help, solution",
      instruction:
        "Create a short problem-attempt-help-solution story around the paired states stuck and free.",
      hypothesis:
        "A small amount of suspense may improve attention without requiring a large vocabulary.",
    },
    pages: [
      {
        id: "kite-flies",
        artworkPrompt: "Ana's red kite flying high in a blue sky",
        text: "Ana's red kite flies high.",
        joinIn: "Fly, kite, fly!",
      },
      {
        id: "wind-pulls",
        artworkPrompt: "A gust of wind pulling the kite away",
        text: "Whoosh! The wind pulls it away.",
        joinIn: "Come back, kite!",
      },
      {
        id: "kite-stuck",
        artworkPrompt: "The red kite stuck on a tree branch",
        text: "The kite gets stuck in a tree.",
        joinIn: "Oh no! It is stuck.",
      },
      {
        id: "ana-pulls",
        artworkPrompt: "Ana giving the kite string one small pull",
        text: "Ana gives the string one small pull. It will not move.",
        joinIn: "Stop and ask!",
      },
      {
        id: "ask-dad",
        artworkPrompt: "Ana asking Dad to help with the stuck kite",
        text: "Ana asks Dad, “Can you help?”",
        joinIn: "Help, please!",
      },
      {
        id: "kite-free",
        artworkPrompt: "Dad safely lifting the kite down from the branch",
        text: "Dad lifts it down. The kite is free!",
        joinIn: "The kite is free!",
      },
      {
        id: "fly-together",
        artworkPrompt: "Ana and Dad flying the red kite together",
        text: "Ana and Dad fly the kite together.",
        joinIn: "Fly, kite, fly!",
      },
    ],
  }),
  makePrototypeStory({
    id: "the-picnic-blanket-search",
    title: "The Picnic Blanket Search",
    category: "Join-in search",
    durationMinutes: 2,
    level: "early-a1",
    summary: "Go up, under, over, and through to find the picnic blanket.",
    targetWords: ["look", "up and down", "under", "over", "through", "blanket", "find"],
    assumedKnownWords: [
      "basket",
      "branch",
      "bridge",
      "go",
      "hill",
      "inside",
      "let's",
      "little",
      "low",
      "picnic",
      "short",
      "sit",
      "time",
      "tunnel",
      "walk",
    ],
    coverPrompt: "Jo on a path with a hill, tunnel, and picnic basket in the distance",
    completionText: "Jo found the blanket. It is picnic time.",
    promptExperiment: {
      focus: "Participatory search adventure",
      instruction:
        "Use an original search-adventure call-and-response structure. Present one obstacle and one movement phrase per page; avoid poetic descriptions.",
      hypothesis:
        "Repeated group language can create an adventure-book feeling while keeping each page predictable.",
    },
    pages: [
      {
        id: "blanket-missing",
        artworkPrompt: "Jo looking for a missing blanket at the start of a path",
        text: "Jo cannot find the picnic blanket. Let's look!",
        joinIn: "Look, look—where can it be?",
      },
      {
        id: "little-hill",
        artworkPrompt: "Jo walking up and down a small green hill",
        text: "A little hill! Jo goes up and down.",
        joinIn: "Up and down!",
      },
      {
        id: "low-branch",
        artworkPrompt: "Jo ducking under a low tree branch",
        text: "A low branch! Jo goes under.",
        joinIn: "Under we go!",
      },
      {
        id: "little-bridge",
        artworkPrompt: "Jo crossing a little bridge over water",
        text: "A little bridge! Jo goes over it.",
        joinIn: "Over we go!",
      },
      {
        id: "short-tunnel",
        artworkPrompt: "Jo walking through a short bright tunnel",
        text: "A short tunnel! Jo walks through.",
        joinIn: "Through we go!",
      },
      {
        id: "blanket-inside",
        artworkPrompt: "Jo finding the folded blanket inside a basket",
        text: "A picnic basket! The blanket is inside.",
        joinIn: "We found it!",
      },
      {
        id: "picnic-time",
        artworkPrompt: "Jo sitting on the blanket for a picnic",
        text: "Jo sits on the blanket. Picnic time!",
        joinIn: "Hooray for our picnic!",
      },
    ],
  }),
  makePrototypeStory({
    id: "soup-for-five",
    title: "Soup for Five",
    category: "Food and preferences",
    durationMinutes: 2,
    level: "early-a1",
    summary: "Five friends choose vegetables and make soup together.",
    targetWords: ["soup", "carrots", "peas", "corn", "like", "mix", "taste"],
    assumedKnownWords: [
      "bowl",
      "cat",
      "dog",
      "everyone",
      "five",
      "friend",
      "go",
      "hen",
      "make",
      "round",
      "say",
      "want",
      "warm",
    ],
    coverPrompt: "Five animal friends around a pot of vegetable soup",
    completionText: "One warm bowl for each friend.",
    promptExperiment: {
      focus: "Preference frame and cumulative action",
      instruction:
        "Repeat I like with three interchangeable food words, then combine them in one cumulative cooking action.",
      hypothesis:
        "A preference frame supports vocabulary practice and personally meaningful responses.",
    },
    pages: [
      {
        id: "make-soup",
        artworkPrompt: "Five friends preparing to make soup",
        text: "Five friends want to make warm soup.",
        joinIn: "Mix, mix, mix!",
      },
      {
        id: "carrots-in",
        artworkPrompt: "Hen adding carrots to the soup pot",
        text: "“I like carrots,” says Hen. In they go.",
        joinIn: "In they go!",
      },
      {
        id: "peas-in",
        artworkPrompt: "Cat adding peas to the soup pot",
        text: "“I like peas,” says Cat. In they go.",
        joinIn: "In they go!",
      },
      {
        id: "corn-in",
        artworkPrompt: "Dog adding corn to the soup pot",
        text: "“I like corn,” says Dog. In it goes.",
        joinIn: "In it goes!",
      },
      {
        id: "mix-round",
        artworkPrompt: "The friends mixing the soup round and round",
        text: "They mix the soup. Round and round.",
        joinIn: "Mix, mix, mix!",
      },
      {
        id: "taste-soup",
        artworkPrompt: "The friends tasting the soup from little spoons",
        text: "They taste it. Yum!",
        joinIn: "Taste the soup!",
      },
      {
        id: "bowl-each",
        artworkPrompt: "Five warm bowls of soup, one for each friend",
        text: "One warm bowl for each friend.",
        joinIn: "Soup for everyone!",
      },
    ],
  }),
  makePrototypeStory({
    id: "wally-finds-the-way",
    title: "Wally Finds the Way",
    category: "Directions",
    durationMinutes: 2,
    level: "early-a1",
    summary: "Use straight, left, and right to help Wally find home.",
    targetWords: ["straight", "left", "right", "far", "near", "way", "home"],
    assumedKnownWords: [
      "ask",
      "crab",
      "fish",
      "find",
      "friend",
      "green",
      "past",
      "plant",
      "red",
      "rock",
      "say",
      "see",
      "swim",
      "tall",
      "thank",
      "turn",
      "turtle",
      "whale",
    ],
    coverPrompt: "A friendly little whale beside a simple underwater map",
    completionText: "Wally is home.",
    promptExperiment: {
      focus: "Directions with gestures",
      instruction:
        "Pair each direction with an immediate movement and visible landmark. Repeat all three directions as a gesture sequence.",
      hypothesis:
        "Body gestures and a simple visual map should make abstract direction words easier to remember.",
    },
    pages: [
      {
        id: "which-way-home",
        artworkPrompt: "Wally Whale looking for his red-rock home",
        text: "Wally Whale cannot see his red-rock home.",
        joinIn: "Which way home?",
      },
      {
        id: "swim-straight",
        artworkPrompt: "A crab pointing straight ahead for Wally",
        text: "Crab says, “Swim straight past me.”",
        joinIn: "Straight!",
      },
      {
        id: "turn-left",
        artworkPrompt: "A turtle pointing left at green sea plants",
        text: "Turtle says, “Turn left at the green plants.”",
        joinIn: "Turn left!",
      },
      {
        id: "turn-right",
        artworkPrompt: "A fish pointing right at a tall rock",
        text: "Fish says, “Turn right at the tall rock.”",
        joinIn: "Turn right!",
      },
      {
        id: "home-is-near",
        artworkPrompt: "Wally asking if home is far while friends point nearby",
        text: "“Is home far?” asks Wally. “No, it is near!”",
        joinIn: "Home is near!",
      },
      {
        id: "red-rock",
        artworkPrompt: "Wally seeing his red-rock home ahead",
        text: "There is the red rock!",
        joinIn: "We found it!",
      },
      {
        id: "wally-home",
        artworkPrompt: "Wally at home thanking his underwater friends",
        text: "“Thank you, friends. I found my way home.”",
        joinIn: "Straight, left, right—home!",
      },
    ],
  }),
  makePrototypeStory({
    id: "the-moon-bus",
    title: "The Moon Bus",
    category: "Gentle fantasy",
    durationMinutes: 2,
    level: "early-a1",
    summary: "Ride a bus past three stars, visit the moon, and come home.",
    targetWords: ["bus", "moon", "ticket", "seats", "ride", "stars", "Earth", "home"],
    assumedKnownWords: [
      "blue",
      "bounce",
      "get",
      "go",
      "hello",
      "look",
      "past",
      "please",
      "rabbit",
      "stop",
      "take",
      "three",
    ],
    coverPrompt: "A cheerful yellow bus flying toward the moon and three stars",
    completionText: "The moon bus is home.",
    promptExperiment: {
      focus: "Simple language in a fantasy setting",
      instruction:
        "Wrap very simple transport language in a fantasy setting while keeping sentence structure concrete and repetitive.",
      hypothesis:
        "Comparing this with familiar settings will show whether fantasy adds engagement or vocabulary load.",
    },
    pages: [
      {
        id: "bus-to-moon",
        artworkPrompt: "A yellow bus stopping beneath a sign for the moon",
        text: "A bus stops. “To the moon!”",
        joinIn: "Beep, beep—moon bus, go!",
      },
      {
        id: "leo-ticket",
        artworkPrompt: "Leo getting on the bus and asking for one ticket",
        text: "Leo gets on. “One ticket, please.”",
        joinIn: "Moon bus, go!",
      },
      {
        id: "rabbit-seats",
        artworkPrompt: "A rabbit getting on and pointing to two seats",
        text: "A rabbit gets on. “Two seats, please.”",
        joinIn: "Moon bus, go!",
      },
      {
        id: "three-stars",
        artworkPrompt: "The moon bus riding past three bright stars",
        text: "They ride past three stars.",
        joinIn: "One, two, three stars!",
      },
      {
        id: "moon-bounce",
        artworkPrompt: "Leo and the rabbit bouncing on the moon",
        text: "The bus stops on the moon. Bounce, bounce!",
        joinIn: "Bounce on the moon!",
      },
      {
        id: "blue-earth",
        artworkPrompt: "Leo looking from the moon toward blue Earth",
        text: "Leo looks at Earth. “Home is blue.”",
        joinIn: "Hello, Earth!",
      },
      {
        id: "bus-home",
        artworkPrompt: "The yellow moon bus returning everyone home",
        text: "The bus takes them home. Beep, beep!",
        joinIn: "Home we go!",
      },
    ],
  }),
  makePrototypeStory({
    id: "which-hat",
    title: "Which Hat?",
    category: "Colours",
    durationMinutes: 1,
    level: "first-words",
    summary: "Try red, blue, and yellow hats, then wear the yellow one.",
    targetWords: ["hat", "red", "blue", "yellow", "head"],
    assumedKnownWords: ["see", "three"],
    coverPrompt: "Three simple hats in red, blue, and yellow",
    completionText: "My yellow hat is on my head!",
    promptExperiment: {
      focus: "One-word substitution",
      instruction:
        "Repeat one substitution sentence, changing only the colour. Finish by putting on the yellow hat.",
      hypothesis:
        "A one-word substitution frame isolates colour vocabulary and makes the final yellow-hat reveal predictable.",
    },
    pages: [
      {
        id: "red-hat",
        artworkPrompt: "A child looking at one red hat",
        text: "I see a red hat.",
        joinIn: "Red hat!",
      },
      {
        id: "blue-hat",
        artworkPrompt: "A child looking at one blue hat",
        text: "I see a blue hat.",
        joinIn: "Blue hat!",
      },
      {
        id: "yellow-hat",
        artworkPrompt: "A child looking at one yellow hat",
        text: "I see a yellow hat.",
        joinIn: "Yellow hat!",
      },
      {
        id: "three-hats",
        artworkPrompt: "The red, blue, and yellow hats in a row",
        text: "Three hats. Which hat?",
        joinIn: "Which hat?",
      },
      {
        id: "hat-on-head",
        artworkPrompt: "The smiling child wearing the yellow hat",
        text: "My yellow hat is on my head!",
        joinIn: "Yellow hat!",
      },
    ],
  }),
  makePrototypeStory({
    id: "wake-up-nori",
    title: "Wake Up, Nori!",
    category: "Actions",
    durationMinutes: 1,
    level: "first-words",
    summary: "Copy Nori as she wakes, jumps, claps, and dances.",
    targetWords: ["sleep", "wake", "jump", "clap", "dance"],
    assumedKnownWords: ["again", "good", "night"],
    coverPrompt: "A small sleepy panda named Nori stretching awake",
    completionText: "Good night, Nori.",
    promptExperiment: {
      focus: "Total Physical Response",
      instruction:
        "Give a physical command, then immediately show the character doing it. Use only actions a child can copy.",
      hypothesis:
        "Physical responses can make new action verbs understandable without translation.",
    },
    pages: [
      {
        id: "nori-sleeps",
        artworkPrompt: "Nori the panda asleep in a small bed",
        text: "Nori sleeps.",
        joinIn: "Sleep, Nori, sleep.",
      },
      {
        id: "nori-wakes",
        artworkPrompt: "Nori opening her eyes and sitting up",
        text: "Wake up, Nori!",
        joinIn: "Wake up!",
      },
      {
        id: "nori-jumps",
        artworkPrompt: "Nori jumping with both feet",
        text: "Nori can jump.",
        joinIn: "Jump, jump!",
      },
      {
        id: "nori-claps",
        artworkPrompt: "Nori clapping her paws",
        text: "Nori can clap.",
        joinIn: "Clap, clap!",
      },
      {
        id: "nori-dances",
        artworkPrompt: "Nori dancing happily",
        text: "Nori can dance.",
        joinIn: "Dance, dance!",
      },
      {
        id: "nori-sleeps-again",
        artworkPrompt: "Nori tucked back into bed at night",
        text: "Nori sleeps again.",
        joinIn: "Good night, Nori.",
      },
    ],
  }),
  makePrototypeStory({
    id: "three-apples",
    title: "Three Apples",
    category: "Counting",
    durationMinutes: 1,
    level: "first-words",
    summary: "Count three apples, watch one fall, and share the rest.",
    targetWords: ["apple", "one", "two", "three", "falls"],
    assumedKnownWords: [],
    coverPrompt: "Three red apples on a low tree branch",
    completionText: "One apple for me. One for you.",
    promptExperiment: {
      focus: "Counting sequence",
      instruction:
        "Build the story around counting up, one visible change, and a simple sharing ending.",
      hypothesis:
        "A number sequence gives the child a familiar structure while introducing only one event word.",
    },
    pages: [
      {
        id: "one-apple",
        artworkPrompt: "One red apple on a branch",
        text: "One apple.",
        joinIn: "One!",
      },
      {
        id: "two-apples",
        artworkPrompt: "Two red apples on a branch",
        text: "Two apples.",
        joinIn: "One, two!",
      },
      {
        id: "three-apples-counted",
        artworkPrompt: "Three red apples on a branch",
        text: "Three apples!",
        joinIn: "One, two, three!",
      },
      {
        id: "one-falls",
        artworkPrompt: "One apple falling from the branch",
        text: "Oh! One apple falls.",
        joinIn: "Oh no!",
      },
      {
        id: "two-left",
        artworkPrompt: "Two apples left on the branch",
        text: "Now there are two.",
        joinIn: "Two apples!",
      },
      {
        id: "one-each",
        artworkPrompt: "Two children each holding one apple",
        text: "One for me. One for you.",
        joinIn: "One and one!",
      },
    ],
  }),
  makePrototypeStory({
    id: "where-is-dot",
    title: "Where Is Dot?",
    category: "Position words",
    durationMinutes: 1,
    level: "first-words",
    summary: "Look in, on, and under a box to find Dot.",
    targetWords: ["box", "where", "in", "on", "under", "find"],
    assumedKnownWords: ["hello", "look"],
    coverPrompt: "A spotted kitten hiding near a large yellow box",
    completionText: "We found Dot under the box.",
    promptExperiment: {
      focus: "Repeated location question",
      instruction:
        "Repeat exactly the same location question, change one preposition, and delay the yes answer until the end.",
      hypothesis:
        "Repeated question-and-answer language makes three position words easier to compare.",
    },
    pages: [
      {
        id: "dot-and-box",
        artworkPrompt: "Dot the spotted kitten beside a yellow box",
        text: "Dot has a box.",
        joinIn: "Where is Dot?",
      },
      {
        id: "not-in",
        artworkPrompt: "An empty yellow box with its lid open",
        text: "Is Dot in the box? No.",
        joinIn: "Not in!",
      },
      {
        id: "not-on",
        artworkPrompt: "The top of the yellow box with no kitten",
        text: "Is Dot on the box? No.",
        joinIn: "Not on!",
      },
      {
        id: "look-under",
        artworkPrompt: "A small spotted tail peeking from under the box",
        text: "Is Dot under the box?",
        joinIn: "Look under!",
      },
      {
        id: "dot-found",
        artworkPrompt: "Dot smiling under the lifted yellow box",
        text: "Yes! We find Dot.",
        joinIn: "Hello, Dot!",
      },
    ],
  }),
  makePrototypeStory({
    id: "boots-in-the-rain",
    title: "Boots in the Rain",
    category: "Daily life",
    durationMinutes: 1,
    level: "repeating-patterns",
    summary: "Put on boots and a coat for a rainy walk.",
    targetWords: ["rain", "wet", "boots", "coat", "dry"],
    assumedKnownWords: ["go", "home", "make", "stay", "warm"],
    coverPrompt: "A child in yellow boots standing in gentle rain",
    completionText: "Warm and dry. Home!",
    promptExperiment: {
      focus: "Familiar cause and action",
      instruction:
        "Teach clothing through a familiar cause-and-action routine. Introduce the problem before naming the useful objects.",
      hypothesis:
        "A real-life sequence may transfer into everyday speech more easily than a fantasy plot.",
    },
    pages: [
      {
        id: "rain-falls",
        artworkPrompt: "Rain falling outside a front door",
        text: "Rain, rain, rain.",
        joinIn: "Rain!",
      },
      {
        id: "wet-feet",
        artworkPrompt: "A dry child watching rain from the front door",
        text: "Rain can make me wet.",
        joinIn: "Wet, wet!",
      },
      {
        id: "boots-on",
        artworkPrompt: "The child pulling on yellow rain boots",
        text: "My boots go on.",
        joinIn: "Boots on!",
      },
      {
        id: "coat-on",
        artworkPrompt: "The child putting on a rain coat",
        text: "My coat goes on.",
        joinIn: "Coat on!",
      },
      {
        id: "stay-dry",
        artworkPrompt: "The child splashing in a puddle while staying dry",
        text: "Splash! I stay dry.",
        joinIn: "Splash, splash!",
      },
      {
        id: "warm-home",
        artworkPrompt: "Boots and coat beside the warm front door",
        text: "Boots off. Coat off. Home!",
        joinIn: "Warm and dry!",
      },
    ],
  }),
  makePrototypeStory({
    id: "big-box-small-box",
    title: "Big Box, Small Box",
    category: "Opposites",
    durationMinutes: 2,
    level: "repeating-patterns",
    summary: "Help Bo and Pia find the box that fits.",
    targetWords: ["big", "small", "box", "too", "fit"],
    assumedKnownWords: ["get", "sit"],
    coverPrompt: "A large bear and a little mouse beside two boxes",
    completionText: "Big for Bo. Small for Pia.",
    promptExperiment: {
      focus: "Mirrored opposites",
      instruction:
        "Put opposites into mirrored scenes. Reuse the same nouns and verbs and avoid synonyms such as large or tiny.",
      hypothesis:
        "Direct contrast should teach opposites better than describing them separately.",
    },
    pages: [
      {
        id: "bo-big-box",
        artworkPrompt: "Bo the bear beside a big box",
        text: "Bo has a big box.",
        joinIn: "Big box!",
      },
      {
        id: "pia-small-box",
        artworkPrompt: "Pia the mouse beside a small box",
        text: "Pia has a small box.",
        joinIn: "Small box!",
      },
      {
        id: "bo-does-not-fit",
        artworkPrompt: "Bo trying to sit in the small box",
        text: "Bo sits in the small box. Bo does not fit.",
        joinIn: "Too small!",
      },
      {
        id: "pia-box-too-big",
        artworkPrompt: "Pia looking very small inside the big box",
        text: "Pia sits in the big box. The box is too big.",
        joinIn: "Too big!",
      },
      {
        id: "big-for-bo",
        artworkPrompt: "Bo sitting comfortably in the big box",
        text: "Bo gets the big box. It fits.",
        joinIn: "Big for Bo!",
      },
      {
        id: "small-for-pia",
        artworkPrompt: "Pia sitting comfortably in the small box",
        text: "Pia gets the small box. It fits.",
        joinIn: "Small for Pia!",
      },
    ],
  }),
  makePrototypeStory({
    id: "lina-goes-to-sleep",
    title: "Lina Goes to Sleep",
    category: "Bedtime",
    durationMinutes: 1,
    level: "repeating-patterns",
    summary: "Say good night to the star, moon, light, and Lina.",
    targetWords: ["night", "star", "moon", "light", "sleep"],
    assumedKnownWords: ["eye", "good", "shut", "well"],
    coverPrompt: "Lina tucked into bed beneath a moon and one star",
    completionText: "Good night, Lina.",
    promptExperiment: {
      focus: "Calm ritual",
      instruction:
        "Use a calm world-turning-off sequence with the same good-night phrase on every page.",
      hypothesis:
        "A familiar bedtime ritual may support memory and naturally slow the read-aloud pace.",
    },
    pages: [
      {
        id: "it-is-night",
        artworkPrompt: "Lina looking out at a dark blue evening sky",
        text: "It is night.",
        joinIn: "Good night.",
      },
      {
        id: "one-star",
        artworkPrompt: "One bright star above Lina's house",
        text: "One star is up.",
        joinIn: "Good night, star.",
      },
      {
        id: "moon-up",
        artworkPrompt: "A round moon above Lina's house",
        text: "The moon is up.",
        joinIn: "Good night, moon.",
      },
      {
        id: "light-off",
        artworkPrompt: "Lina's bedroom lamp switched off",
        text: "The light is off.",
        joinIn: "Good night, light.",
      },
      {
        id: "eyes-shut",
        artworkPrompt: "Lina closing her eyes in bed",
        text: "Lina shuts her eyes.",
        joinIn: "Good night, Lina.",
      },
      {
        id: "sleep-well",
        artworkPrompt: "Lina sleeping peacefully",
        text: "Sleep well, Lina.",
        joinIn: "Sleep, sleep, sleep.",
      },
    ],
  }),
  makePrototypeStory({
    id: "seed-wake-up",
    title: "Seed, Wake Up!",
    category: "Nature",
    durationMinutes: 1,
    level: "repeating-patterns",
    summary: "Give a seed water and sun, then watch it grow.",
    targetWords: ["seed", "water", "sun", "grow", "flower"],
    assumedKnownWords: ["hello", "little", "sleep", "wake", "warm"],
    coverPrompt: "A small seed sprouting into a bright flower",
    completionText: "Hello, little flower!",
    promptExperiment: {
      focus: "Visible cause and effect",
      instruction:
        "Explain one simple science transformation using two visible inputs and a delayed reveal.",
      hypothesis:
        "A clear cause-and-effect sequence can teach content vocabulary without a complex plot.",
    },
    pages: [
      {
        id: "seed-sleeps",
        artworkPrompt: "A little seed resting under brown soil",
        text: "A little seed sleeps.",
        joinIn: "Wake up, seed!",
      },
      {
        id: "seed-water",
        artworkPrompt: "Drops of water falling onto the soil",
        text: "Drip, drop. Here is water.",
        joinIn: "Water!",
      },
      {
        id: "seed-sun",
        artworkPrompt: "Warm sunlight shining on the soil",
        text: "Warm, warm. Here is the sun.",
        joinIn: "Sun!",
      },
      {
        id: "seed-starts-growing",
        artworkPrompt: "A tiny green shoot breaking through the soil",
        text: "Wake up, little seed!",
        joinIn: "Grow, grow, grow!",
      },
      {
        id: "seed-grows",
        artworkPrompt: "The green shoot growing taller",
        text: "The seed grows and grows.",
        joinIn: "Grow, grow, grow!",
      },
      {
        id: "hello-flower",
        artworkPrompt: "A bright flower open above the soil",
        text: "Hello, little flower!",
        joinIn: "Hello, flower!",
      },
    ],
  }),
  makePrototypeStory({
    id: "a-snack-for-two",
    title: "A Snack for Two",
    category: "Kind words",
    durationMinutes: 2,
    level: "repeating-patterns",
    summary: "Use please and thank you while sharing two crackers.",
    targetWords: ["cracker", "hungry", "please", "share", "thank you"],
    assumedKnownWords: ["welcome"],
    coverPrompt: "Two friends sharing two crackers at a small table",
    completionText: "Thank you. We can share.",
    promptExperiment: {
      exactRefrain: "One for you, one for me.",
      focus: "Useful social exchange",
      instruction:
        "Build the whole story around a useful social exchange and repeat the sharing phrase before the resolution.",
      hypothesis:
        "Functional phrases may be retained better when they immediately solve a character's need.",
    },
    pages: [
      {
        id: "two-crackers",
        artworkPrompt: "Nina holding two round crackers",
        text: "Nina has two crackers.",
        joinIn: "One for you, one for me.",
      },
      {
        id: "bo-hungry",
        artworkPrompt: "Bo looking at the crackers and touching his tummy",
        text: "Bo is hungry.",
        joinIn: "One for you, one for me.",
      },
      {
        id: "cracker-please",
        artworkPrompt: "Bo politely asking Nina for a cracker",
        text: "“A cracker, please?”",
        joinIn: "Please!",
      },
      {
        id: "we-can-share",
        artworkPrompt: "Nina offering one cracker to Bo",
        text: "“Yes. We can share.”",
        joinIn: "We can share!",
      },
      {
        id: "one-for-each",
        artworkPrompt: "Bo and Nina each holding one cracker",
        text: "One for Bo. One for Nina.",
        joinIn: "One for you, one for me.",
      },
      {
        id: "thank-you",
        artworkPrompt: "The two friends smiling after their snack",
        text: "“Thank you!” “You're welcome!”",
        joinIn: "Thank you!",
      },
    ],
  }),
];
