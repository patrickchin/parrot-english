import type { Story, StoryArtwork, StoryPage } from "./story-types.ts";

type PrototypePage = Pick<StoryPage, "id" | "joinIn" | "text"> & {
  artworkPrompt: string;
};

type PrototypeStory = Pick<
  Story,
  "completionText" | "id" | "level" | "title"
> & {
  coverPrompt: string;
  pages: readonly PrototypePage[];
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

function coverArtwork(
  storyId: string,
  level: Story["level"],
  prompt: string,
): StoryArtwork {
  const imageVersion = level === "first-english-words" ? 7 : 3;
  return {
    alt: prompt,
    prompt,
    src: `https://media.parrotbook.com/assets/v${imageVersion}/stories/${storyId}-cover.webp`,
  };
}

function storyPageImageVersion(story: Pick<Story, "id" | "level">) {
  if (story.level === "first-english-words") return 7;
  if (story.level === "first-words" || story.id === "where-is-dot") return 3;
  return 6;
}

function joinInAudioId(text: string) {
  const slug = text
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `story-join-in-${slug}`;
}

function makePrototypeStory({
  coverPrompt,
  pages,
  ...story
}: PrototypeStory): Story {
  return {
    ...story,
    cover: coverArtwork(story.id, story.level, coverPrompt),
    pages: pages.map(({ artworkPrompt, ...page }, pageIndex) => ({
      ...page,
      artwork: pageArtwork({
        alt: `${artworkPrompt} in ${story.title}, page ${pageIndex + 1}`,
        prompt: artworkPrompt,
        src: `https://media.parrotbook.com/assets/v${storyPageImageVersion(story)}/story-pages/${story.id}-${page.id}.webp`,
      }),
      joinInAudioId: joinInAudioId(page.joinIn),
      narrationAudioId: `story-${story.id}-${page.id}-narration`,
    })),
  };
}

export const STORY_SCRIPT_CANDIDATES: readonly Story[] = [
  makePrototypeStory({
    id: "hello-cat",
    title: "Hello, Cat!",
    level: "first-english-words",
    coverPrompt: "Bob waves hello to a friendly cat, dog, and bird",
    completionText: "Bye, cat. Bye, dog. Bye, bird.",
    pages: [
      {
        id: "cat-hello",
        artworkPrompt: "Bob and a friendly cat wave hello to each other",
        text: "A cat. Hello, cat!",
        joinIn: "Hello!",
      },
      {
        id: "dog-hello",
        artworkPrompt: "Bob and a friendly dog wave hello to each other",
        text: "A dog. Hello, dog!",
        joinIn: "Hello!",
      },
      {
        id: "bird-hello",
        artworkPrompt: "Bob and a friendly bird wave hello to each other",
        text: "A bird. Hello, bird!",
        joinIn: "Hello!",
      },
      {
        id: "friends-hello",
        artworkPrompt: "Bob, the cat, dog, and bird wave hello together",
        text: "Cat, dog, bird. Hello!",
        joinIn: "Hello!",
      },
      {
        id: "friends-bye",
        artworkPrompt: "Bob waves goodbye as the cat, dog, and bird leave",
        text: "Bye, cat. Bye, dog. Bye, bird.",
        joinIn: "Bye!",
      },
    ],
  }),
  makePrototypeStory({
    id: "marys-face",
    title: "Mary’s Face",
    level: "first-english-words",
    coverPrompt: "Mary pointing to her smiling face",
    completionText: "Face, eyes, ears, nose, mouth.",
    pages: [
      {
        id: "face",
        artworkPrompt: "Mary pointing to her whole face",
        text: "Point. Face.",
        joinIn: "Face!",
      },
      {
        id: "eyes",
        artworkPrompt: "Mary pointing to her eyes",
        text: "Point. Eyes.",
        joinIn: "Eyes!",
      },
      {
        id: "ears",
        artworkPrompt: "Mary pointing to her ears",
        text: "Point. Ears.",
        joinIn: "Ears!",
      },
      {
        id: "nose",
        artworkPrompt: "Mary pointing to her nose",
        text: "Point. Nose.",
        joinIn: "Nose!",
      },
      {
        id: "mouth",
        artworkPrompt: "Mary pointing to her mouth",
        text: "Point. Mouth.",
        joinIn: "Mouth!",
      },
    ],
  }),
  makePrototypeStory({
    id: "wash-sam-wash",
    title: "Wash, Sam, Wash!",
    level: "first-english-words",
    coverPrompt: "Sam washing his hands with soap and water",
    completionText: "Clean hands!",
    pages: [
      {
        id: "dirty-hands",
        artworkPrompt: "Sam showing his dirty hands",
        text: "Dirty hands.",
        joinIn: "Dirty hands!",
      },
      {
        id: "water-on-hands",
        artworkPrompt: "Sam putting water on his hands",
        text: "Water on hands.",
        joinIn: "Water!",
      },
      {
        id: "soap-on-hands",
        artworkPrompt: "Sam putting soap on his hands",
        text: "Soap on hands.",
        joinIn: "Soap!",
      },
      {
        id: "wash-hands",
        artworkPrompt: "Sam washing his hands with soap and water",
        text: "Wash hands. Wash, wash!",
        joinIn: "Wash, wash!",
      },
      {
        id: "clean-hands",
        artworkPrompt: "Sam showing his clean hands",
        text: "Clean hands.",
        joinIn: "Clean hands!",
      },
    ],
  }),
  makePrototypeStory({
    id: "the-red-ball",
    title: "The Red Ball",
    level: "first-words",
    coverPrompt: "A bright red ball beside a smiling young child",
    completionText: "The red ball is home.",
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
    level: "tiny-stories",
    coverPrompt: "Ben the green parrot walking beside Sam the little firefly",
    completionText: "Sam is home. “Thank you, Ben.”",
    pages: [
      {
        id: "pip-sees-light",
        artworkPrompt: "Ben seeing Sam's small light near a garden path",
        text: "Ben sees a little light. “Hello! I am Sam.”",
        joinIn: "Glow, Sam, glow!",
      },
      {
        id: "flicker-is-lost",
        artworkPrompt: "Sam looking worried while Ben listens",
        text: "“I am lost,” says Sam. “I need my family.”",
        joinIn: "Glow, Sam, glow!",
      },
      {
        id: "pip-can-help",
        artworkPrompt: "Ben pointing along the path for Sam to follow",
        text: "“I can help,” says Ben. “Follow me.”",
        joinIn: "Follow Ben!",
      },
      {
        id: "walk-by-water",
        artworkPrompt: "Ben and Sam walking beside calm water",
        text: "They walk by the water. Sam glows.",
        joinIn: "Glow, Sam, glow!",
      },
      {
        id: "family-lights",
        artworkPrompt: "Many little firefly lights flying toward Sam",
        text: "Many little lights fly near them. “My family!”",
        joinIn: "We found them!",
      },
      {
        id: "flicker-home",
        artworkPrompt: "Sam with his family while Ben smiles",
        text: "Sam is home. “Thank you, Ben.”",
        joinIn: "Sam is home!",
      },
    ],
  }),
  makePrototypeStory({
    id: "the-noisy-little-band",
    title: "The Noisy Little Band",
    level: "tiny-stories",
    coverPrompt: "Three animal friends playing a drum, bell, and shaker",
    completionText: "The little band is quiet.",
    pages: [
      {
        id: "bo-drum",
        artworkPrompt: "Bob playing a small red drum",
        text: "Bob has a drum. Boom, boom!",
        joinIn: "Boom, boom!",
      },
      {
        id: "mia-bell",
        artworkPrompt: "Mary ringing a small gold bell",
        text: "Mary has a bell. Ding, ding!",
        joinIn: "Ding, ding!",
      },
      {
        id: "tomo-shaker",
        artworkPrompt: "Jack playing a little shaker",
        text: "Jack has a shaker. Chik, chik!",
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
    title: "Bob Tries",
    level: "tiny-stories",
    coverPrompt: "A friendly round robot ready to jump and run",
    completionText: "Bob can try!",
    pages: [
      {
        id: "robo-walks",
        artworkPrompt: "Bob walking with small careful steps",
        text: "Bob can walk. Beep, beep!",
        joinIn: "Go, Bob, go!",
      },
      {
        id: "robo-jumps",
        artworkPrompt: "Bob jumping into the air",
        text: "“Can you jump?” Bob jumps.",
        joinIn: "Yes, I can!",
      },
      {
        id: "robo-runs",
        artworkPrompt: "Bob running across a playground",
        text: "“Can you run?” Bob runs.",
        joinIn: "Yes, I can!",
      },
      {
        id: "robo-tries-flying",
        artworkPrompt: "Bob trying to fly and landing on a soft mat",
        text: "“Can you fly?” Bob tries. Bump! “Not yet.”",
        joinIn: "Try, Bob, try!",
      },
      {
        id: "robo-tries-swimming",
        artworkPrompt: "Bob trying to swim with a bright float",
        text: "“Can you swim?” Bob tries. Splash!",
        joinIn: "Try, Bob, try!",
      },
      {
        id: "robo-can-try",
        artworkPrompt: "Bob smiling proudly beside the pool",
        text: "Bob smiles. “I can try!”",
        joinIn: "I can try!",
      },
    ],
  }),
  makePrototypeStory({
    id: "tess-can-help",
    title: "Rose Can Help",
    level: "tiny-stories",
    coverPrompt: "Two friends kneeling beside a red cart with a loose wheel",
    completionText: "The cart can roll again.",
    pages: [
      {
        id: "cart-broken",
        artworkPrompt: "Ben looking sad beside his broken red cart",
        text: "Ben's red cart is broken. He is sad.",
        joinIn: "Oh no!",
      },
      {
        id: "can-i-help",
        artworkPrompt: "Rose asking Ben if she can help",
        text: "Rose asks, “Can I help?”",
        joinIn: "Can I help?",
      },
      {
        id: "find-wheel",
        artworkPrompt: "Rose and Ben finding the cart's little wheel",
        text: "They find the little wheel.",
        joinIn: "We can help!",
      },
      {
        id: "put-wheel-on",
        artworkPrompt: "Rose holding the wheel while Ben puts it on",
        text: "Rose holds it. Ben puts it on.",
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
        artworkPrompt: "The repaired red cart rolling while Ben smiles",
        text: "The cart rolls again. Ben smiles.",
        joinIn: "Roll, cart, roll!",
      },
    ],
  }),
  makePrototypeStory({
    id: "ready-maya-ready",
    title: "Ready, Mary, Ready!",
    level: "tiny-stories",
    coverPrompt: "Mary dressed for school with her bag and shoes on",
    completionText: "Mary is ready!",
    pages: [
      {
        id: "maya-wakes",
        artworkPrompt: "Mary waking up in bed in the morning",
        text: "Mary wakes up. “Good morning!”",
        joinIn: "Wake up!",
      },
      {
        id: "maya-washes",
        artworkPrompt: "Mary washing her face at a sink",
        text: "She washes her face. Swish, swish.",
        joinIn: "Wash, wash!",
      },
      {
        id: "maya-dresses",
        artworkPrompt: "Mary putting on her socks",
        text: "She gets dressed. Socks on!",
        joinIn: "Get dressed!",
      },
      {
        id: "maya-eats",
        artworkPrompt: "Mary eating toast at a table",
        text: "She eats toast. Crunch, crunch.",
        joinIn: "Eat, eat!",
      },
      {
        id: "maya-brushes",
        artworkPrompt: "Mary brushing her teeth",
        text: "She brushes her teeth. Brush, brush.",
        joinIn: "Brush, brush!",
      },
      {
        id: "maya-ready",
        artworkPrompt: "Mary wearing her bag and shoes by the door",
        text: "Bag on, shoes on. “I am ready!”",
        joinIn: "Ready, Mary, ready!",
      },
    ],
  }),
  makePrototypeStory({
    id: "kite-come-back",
    title: "Kite, Come Back!",
    level: "early-a1",
    coverPrompt: "Rose and Dad holding a red kite beneath a tree",
    completionText: "The kite is free!",
    pages: [
      {
        id: "kite-flies",
        artworkPrompt: "Rose's red kite flying high in a blue sky",
        text: "Rose's red kite flies high.",
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
        artworkPrompt: "Rose giving the kite string one small pull",
        text: "Rose gives the string one small pull. It will not move.",
        joinIn: "Stop and ask!",
      },
      {
        id: "ask-dad",
        artworkPrompt: "Rose asking Dad to help with the stuck kite",
        text: "Rose asks Dad, “Can you help?”",
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
        artworkPrompt: "Rose and Dad flying the red kite together",
        text: "Rose and Dad fly the kite together.",
        joinIn: "Fly, kite, fly!",
      },
    ],
  }),
  makePrototypeStory({
    id: "the-picnic-blanket-search",
    title: "The Picnic Blanket Search",
    level: "early-a1",
    coverPrompt: "Sam on a path with a hill, tunnel, and picnic basket in the distance",
    completionText: "Sam found the blanket. It is picnic time.",
    pages: [
      {
        id: "blanket-missing",
        artworkPrompt: "Sam looking for a missing blanket at the start of a path",
        text: "Sam cannot find the picnic blanket. Let's look!",
        joinIn: "Look, look—where can it be?",
      },
      {
        id: "little-hill",
        artworkPrompt: "Sam walking up and down a small green hill",
        text: "A little hill! Sam goes up and down.",
        joinIn: "Up and down!",
      },
      {
        id: "low-branch",
        artworkPrompt: "Sam ducking under a low tree branch",
        text: "A low branch! Sam goes under.",
        joinIn: "Under we go!",
      },
      {
        id: "little-bridge",
        artworkPrompt: "Sam crossing a little bridge over water",
        text: "A little bridge! Sam goes over it.",
        joinIn: "Over we go!",
      },
      {
        id: "short-tunnel",
        artworkPrompt: "Sam walking through a short bright tunnel",
        text: "A short tunnel! Sam walks through.",
        joinIn: "Through we go!",
      },
      {
        id: "blanket-inside",
        artworkPrompt: "Sam finding the folded blanket inside a basket",
        text: "A picnic basket! The blanket is inside.",
        joinIn: "We found it!",
      },
      {
        id: "picnic-time",
        artworkPrompt: "Sam sitting on the blanket for a picnic",
        text: "Sam sits on the blanket. Picnic time!",
        joinIn: "Hooray for our picnic!",
      },
    ],
  }),
  makePrototypeStory({
    id: "soup-for-five",
    title: "Soup for Five",
    level: "early-a1",
    coverPrompt: "Five animal friends around a pot of vegetable soup",
    completionText: "One warm bowl for each friend.",
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
    title: "Ben Finds the Way",
    level: "early-a1",
    coverPrompt: "A friendly little whale beside a simple underwater map",
    completionText: "Ben is home.",
    pages: [
      {
        id: "which-way-home",
        artworkPrompt: "Ben the whale looking for his red-rock home",
        text: "Ben the whale cannot see his red-rock home.",
        joinIn: "Which way home?",
      },
      {
        id: "swim-straight",
        artworkPrompt: "A crab pointing straight ahead for Ben",
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
        artworkPrompt: "Ben asking if home is far while friends point nearby",
        text: "“Is home far?” asks Ben. “No, it is near!”",
        joinIn: "Home is near!",
      },
      {
        id: "red-rock",
        artworkPrompt: "Ben seeing his red-rock home ahead",
        text: "There is the red rock!",
        joinIn: "We found it!",
      },
      {
        id: "wally-home",
        artworkPrompt: "Ben at home thanking his underwater friends",
        text: "“Thank you, friends. I found my way home.”",
        joinIn: "Straight, left, right—home!",
      },
    ],
  }),
  makePrototypeStory({
    id: "the-moon-bus",
    title: "The Moon Bus",
    level: "early-a1",
    coverPrompt: "A cheerful yellow bus flying toward the moon and three stars",
    completionText: "The moon bus is home.",
    pages: [
      {
        id: "bus-to-moon",
        artworkPrompt: "A yellow bus stopping beneath a sign for the moon",
        text: "A bus stops. “To the moon!”",
        joinIn: "Beep, beep—moon bus, go!",
      },
      {
        id: "leo-ticket",
        artworkPrompt: "Jack getting on the bus and asking for one ticket",
        text: "Jack gets on. “One ticket, please.”",
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
        artworkPrompt: "Jack and the rabbit bouncing on the moon",
        text: "The bus stops on the moon. Bounce, bounce!",
        joinIn: "Bounce on the moon!",
      },
      {
        id: "blue-earth",
        artworkPrompt: "Jack looking from the moon toward blue Earth",
        text: "Jack looks at Earth. “Home is blue.”",
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
    level: "first-words",
    coverPrompt: "Three simple hats in red, blue, and yellow",
    completionText: "My yellow hat is on my head!",
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
    title: "Wake Up, Mary!",
    level: "first-words",
    coverPrompt: "A small sleepy panda named Mary stretching awake",
    completionText: "Good night, Mary.",
    pages: [
      {
        id: "nori-sleeps",
        artworkPrompt: "Mary the panda asleep in a small bed",
        text: "Mary sleeps.",
        joinIn: "Sleep, Mary, sleep.",
      },
      {
        id: "nori-wakes",
        artworkPrompt: "Mary opening her eyes and sitting up",
        text: "Wake up, Mary!",
        joinIn: "Wake up!",
      },
      {
        id: "nori-jumps",
        artworkPrompt: "Mary jumping with both feet",
        text: "Mary can jump.",
        joinIn: "Jump, jump!",
      },
      {
        id: "nori-claps",
        artworkPrompt: "Mary clapping her paws",
        text: "Mary can clap.",
        joinIn: "Clap, clap!",
      },
      {
        id: "nori-dances",
        artworkPrompt: "Mary dancing happily",
        text: "Mary can dance.",
        joinIn: "Dance, dance!",
      },
      {
        id: "nori-sleeps-again",
        artworkPrompt: "Mary tucked back into bed at night",
        text: "Mary sleeps again.",
        joinIn: "Good night, Mary.",
      },
    ],
  }),
  makePrototypeStory({
    id: "three-apples",
    title: "Three Apples",
    level: "first-words",
    coverPrompt: "Three red apples on a low tree branch",
    completionText: "One apple for me. One for you.",
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
    title: "Where Is Rose?",
    level: "repeating-patterns",
    coverPrompt: "A spotted kitten hiding near a large yellow box",
    completionText: "We found Rose under the box.",
    pages: [
      {
        id: "dot-and-box",
        artworkPrompt: "Rose the spotted kitten beside a yellow box",
        text: "Rose has a box.",
        joinIn: "Where is Rose?",
      },
      {
        id: "not-in",
        artworkPrompt: "An empty yellow box with its lid open",
        text: "Is Rose in the box? No.",
        joinIn: "Not in!",
      },
      {
        id: "not-on",
        artworkPrompt: "The top of the yellow box with no kitten",
        text: "Is Rose on the box? No.",
        joinIn: "Not on!",
      },
      {
        id: "look-under",
        artworkPrompt: "A small spotted tail peeking from under the box",
        text: "Is Rose under the box?",
        joinIn: "Look under!",
      },
      {
        id: "dot-found",
        artworkPrompt: "Rose smiling under the lifted yellow box",
        text: "Yes! We find Rose.",
        joinIn: "Hello, Rose!",
      },
    ],
  }),
  makePrototypeStory({
    id: "boots-in-the-rain",
    title: "Boots in the Rain",
    level: "repeating-patterns",
    coverPrompt: "A child in yellow boots standing in gentle rain",
    completionText: "Warm and dry. Home!",
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
    level: "repeating-patterns",
    coverPrompt: "A large bear and a little mouse beside two boxes",
    completionText: "Big for Bob. Small for Mary.",
    pages: [
      {
        id: "bo-big-box",
        artworkPrompt: "Bob the bear beside a big box",
        text: "Bob has a big box.",
        joinIn: "Big box!",
      },
      {
        id: "pia-small-box",
        artworkPrompt: "Mary the mouse beside a small box",
        text: "Mary has a small box.",
        joinIn: "Small box!",
      },
      {
        id: "bo-does-not-fit",
        artworkPrompt: "Bob trying to sit in the small box",
        text: "Bob sits in the small box. Bob does not fit.",
        joinIn: "Too small!",
      },
      {
        id: "pia-box-too-big",
        artworkPrompt: "Mary looking very small inside the big box",
        text: "Mary sits in the big box. The box is too big.",
        joinIn: "Too big!",
      },
      {
        id: "big-for-bo",
        artworkPrompt: "Bob sitting comfortably in the big box",
        text: "Bob gets the big box. It fits.",
        joinIn: "Big for Bob!",
      },
      {
        id: "small-for-pia",
        artworkPrompt: "Mary sitting comfortably in the small box",
        text: "Mary gets the small box. It fits.",
        joinIn: "Small for Mary!",
      },
    ],
  }),
  makePrototypeStory({
    id: "lina-goes-to-sleep",
    title: "Mary Goes to Sleep",
    level: "repeating-patterns",
    coverPrompt: "Mary tucked into bed beneath a moon and one star",
    completionText: "Good night, Mary.",
    pages: [
      {
        id: "it-is-night",
        artworkPrompt: "Mary looking out at a dark blue evening sky",
        text: "It is night.",
        joinIn: "Good night.",
      },
      {
        id: "one-star",
        artworkPrompt: "One bright star above Mary's house",
        text: "One star is up.",
        joinIn: "Good night, star.",
      },
      {
        id: "moon-up",
        artworkPrompt: "A round moon above Mary's house",
        text: "The moon is up.",
        joinIn: "Good night, moon.",
      },
      {
        id: "light-off",
        artworkPrompt: "Mary's bedroom lamp switched off",
        text: "The light is off.",
        joinIn: "Good night, light.",
      },
      {
        id: "eyes-shut",
        artworkPrompt: "Mary closing her eyes in bed",
        text: "Mary shuts her eyes.",
        joinIn: "Good night, Mary.",
      },
      {
        id: "sleep-well",
        artworkPrompt: "Mary sleeping peacefully",
        text: "Sleep well, Mary.",
        joinIn: "Sleep, sleep, sleep.",
      },
    ],
  }),
  makePrototypeStory({
    id: "seed-wake-up",
    title: "Seed, Wake Up!",
    level: "repeating-patterns",
    coverPrompt: "A small seed sprouting into a bright flower",
    completionText: "Hello, little flower!",
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
    level: "repeating-patterns",
    coverPrompt: "Two friends sharing two crackers at a small table",
    completionText: "Thank you. We can share.",
    pages: [
      {
        id: "two-crackers",
        artworkPrompt: "Rose holding two round crackers",
        text: "Rose has two crackers.",
        joinIn: "One for you, one for me.",
      },
      {
        id: "bo-hungry",
        artworkPrompt: "Bob looking at the crackers and touching his tummy",
        text: "Bob is hungry.",
        joinIn: "One for you, one for me.",
      },
      {
        id: "cracker-please",
        artworkPrompt: "Bob politely asking Rose for a cracker",
        text: "“A cracker, please?”",
        joinIn: "Please!",
      },
      {
        id: "we-can-share",
        artworkPrompt: "Rose offering one cracker to Bob",
        text: "“Yes. We can share.”",
        joinIn: "We can share!",
      },
      {
        id: "one-for-each",
        artworkPrompt: "Bob and Rose each holding one cracker",
        text: "One for Bob. One for Rose.",
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
