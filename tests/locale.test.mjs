import test from 'node:test';
import assert from 'node:assert/strict';
import { contentPath, languagePath, pathLanguage, languages, preferredLanguage } from '../src/locale.ts';

test('language prefixes use complete path segments and preserve the page path', () => {
  for (const [path, language, content] of [
    ['/en/', 'en', '/'],
    ['/zh', 'zh-CN', '/'],
    ['/zh/scenes/patrick/dubs/dub_abc', 'zh-CN', '/scenes/patrick/dubs/dub_abc'],
    ['/en/library/teens', 'en', '/library/teens'],
    ['/es/scenes/patrick/dubs/dub_abc', 'es', '/scenes/patrick/dubs/dub_abc'],
    ['/ja/library/teens', 'ja', '/library/teens'],
    ['/ko/dubs', 'ko', '/dubs'],
    ['/espanol', undefined, '/espanol'],
    ['/japan', undefined, '/japan'],
    ['/korea', undefined, '/korea'],
    ['/english', undefined, '/english'],
    ['/zhang', undefined, '/zhang'],
    ['/fr/scenes/patrick', undefined, '/fr/scenes/patrick'],
  ]) {
    assert.equal(pathLanguage(path), language);
    assert.equal(contentPath(path), content);
    for (const item of languages) assert.equal(languagePath(path, item.value), '/' + item.prefix + content);
  }
});

test('remembered choices recognize every supported language and reject unknown values', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    for (const value of ['en', 'zh-CN', 'es', 'ja', 'ko', 'fr', null]) {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => value } });
      assert.equal(preferredLanguage(), languages.some(item => item.value === value) ? value : 'zh-CN');
    }
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('unavailable'); } });
    assert.equal(preferredLanguage(), 'zh-CN');
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  }
});
