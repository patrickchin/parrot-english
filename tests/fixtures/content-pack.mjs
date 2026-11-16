// A small contract fixture independent of the editable founder catalog and media.
export const contentBase = 'https://content.example/content/';
export const scenes = ['hello', 'goodbye'].map(name => ({
  version: 1, id: `scene_${name}`, title: name, description: 'A short original conversation.',
  duration: 1, video: 'video.mp4', mediaBase: `${contentBase}media/${name}/`,
  roles: [{ id: `role_${name}`, name: 'Sam', label: 'Sam', hint: 'One line' }],
  lines: [{ id: `line_${name}`, roleId: `role_${name}`, start: 0, end: 1, text: 'Hello, Sam.', hint: '你好，Sam。' }],
  credit: { title: name, attribution: 'Sam', source: 'https://example.com/source',
    licence: 'Creator permission', licenceUrl: 'https://example.com/licence', changes: 'Marked for dubbing.' },
}));
export const pack = {
  version: 1, id: 'pack_fixture', title: 'Greetings', franchise: 'Original', description: 'Contract fixture.', author: 'Sam',
  scenes: scenes.map(scene => ({
    id: scene.id, slug: scene.title, title: scene.title, english: 'Hello, Sam.', note: 'Original',
    source: scene.credit.source, cohort: 'younger-age-5', poster: `scenes/${scene.title}/poster.jpg`,
    tags: ['greetings'], quotes: scene.lines.flatMap(line => [line.text, line.hint]),
    manifest: `scenes/${scene.title}/scene.json`,
  })),
  locales: { en: {
    scenes: Object.fromEntries(scenes.map(scene => [scene.id, { title: scene.title, licence: scene.credit.licence, changes: scene.credit.changes }])),
    roles: Object.fromEntries(scenes.map(scene => [scene.roles[0].id, { name: 'Sam', hint: 'One line' }])),
  } },
};
export const catalog = { version: 1, packs: [{ id: pack.id, manifest: 'packs/pack_fixture/pack.json', uploader: 'Patrick' }] };
export const documents = new Map([
  [contentBase + 'catalog.json', catalog],
  [contentBase + catalog.packs[0].manifest, pack],
  ...pack.scenes.map((summary, index) => [new URL(summary.manifest, contentBase + catalog.packs[0].manifest).href, scenes[index]]),
]);
