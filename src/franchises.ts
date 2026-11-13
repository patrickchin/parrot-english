// Creator clips share one browse collection; their source names remain on scenes.
export const memeFranchises = ['Apparently Kid', 'Steven He', 'Recess Therapy'];
export const franchiseGroup = (name: string) => memeFranchises.includes(name) ? 'Memes' : name;

const artworkBase = 'https://parrotbook-media-f6e09412.oss-cn-hongkong.aliyuncs.com/artwork/franchises/';
export const franchiseArtwork: Record<string, { url: string; fit?: 'contain' | 'cover' }> = {
  "SpongeBob SquarePants": { url: artworkBase + "spongebob-squarepants-120c473e5d65.png", fit: 'contain' },
  "Shrek": { url: artworkBase + "shrek-0831a62fda76.jpg", fit: 'cover' },
  "Finding Nemo": { url: artworkBase + "finding-nemo-8329ed4b1d42.jpg", fit: 'cover' },
  "Toy Story": { url: artworkBase + "toy-story-636b5b5fb43e.jpg", fit: 'cover' },
  "Cars": { url: artworkBase + "cars-367a018cfa60.jpg", fit: 'cover' },
  "Despicable Me": { url: artworkBase + "despicable-me-712397741a14.jpg", fit: 'cover' },
  "Up": { url: artworkBase + "up-d338249c2007.jpg", fit: 'cover' },
  "Ratatouille": { url: artworkBase + "ratatouille-remy-11ea4c45b4f2.jpg", fit: 'cover' },
  "Kung Fu Panda": { url: artworkBase + "kung-fu-panda-9ba28e1f2f32.jpg", fit: 'cover' },
  "Madagascar": { url: artworkBase + "madagascar-de356995828b.jpg", fit: 'cover' },
  "Ben and Holly’s Little Kingdom": { url: artworkBase + "ben-and-holly-s-little-kingdom-56f4ce24a74e.jpg", fit: 'cover' },
  "Peppa Pig": { url: artworkBase + "peppa-pig-6ac5e4294f8f.png", fit: 'contain' },
  "Bluey": { url: artworkBase + "bluey-74b6f4d49841.jpg", fit: 'cover' },
  "English Singsing": { url: artworkBase + "english-singsing-7076f149114b.jpg", fit: 'contain' },
  "Gogo's Adventures with English": { url: artworkBase + "gogo-s-adventures-with-english-24324f4fe490.webp", fit: 'cover' },
  "Young Sheldon": { url: artworkBase + "young-sheldon-e64698390e74.png", fit: 'contain' },
  "Harry Potter": { url: artworkBase + "harry-potter-dc252e3cab47.jpg", fit: 'cover' },
  "Friends": { url: artworkBase + "friends-abad3b9f8314.jpg", fit: 'cover' },
  "How I Met Your Mother": { url: artworkBase + "how-i-met-your-mother-586190bf6c95.png", fit: 'contain' },
  "The Big Bang Theory": { url: artworkBase + "the-big-bang-theory-8c5373b40a99.png", fit: 'contain' },
};
