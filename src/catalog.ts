export const clips = [
  { slug: 'patrick', title: '不，这是派大星！', english: 'No, this is Patrick.', note: '接电话，也能演出两种情绪。', colour: 'bg-[#f4d7e5]', art: 'phone', source: 'https://www.youtube.com/watch?v=dwifOuuMkfo' },
  { slug: 'chocolate', title: '巧克力？！', english: 'Chocolate!', note: '从小声询问，到忍不住大喊。', colour: 'bg-[#f4dcae]', art: 'chocolate', source: 'https://www.youtube.com/watch?v=NBhxIyT8Slg' },
  { slug: 'wumbo', title: '调成 Wumbo！', english: 'I wumbo, you wumbo…', note: '一本正经地，胡说八道。', colour: 'bg-[#cde8f8]', art: 'letters', source: 'https://www.youtube.com/watch?v=--hsVknT1c0' },
  { slug: 'onions', title: '怪物就像洋葱', english: 'Ogres are like onions.', note: '一个认真解释，一个不停打岔。', colour: 'bg-[#dbe8b9]', art: 'onion', source: 'https://www.youtube.com/shorts/LEmFWRWLeGU' },
  { slug: 'sintel', title: '你在找谁？', english: 'Sintel', note: '3 句简短台词，完整体验一次。', colour: 'bg-[#dce0ee]', art: 'dragon', source: 'https://www.youtube.com/watch?v=eRsGyueVLvQ' },
] as const;
export type ClipSlug = typeof clips[number]['slug'];
