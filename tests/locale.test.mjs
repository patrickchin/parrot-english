import test from 'node:test';
import assert from 'node:assert/strict';
import { contentPath, languagePath, pathLanguage } from '../src/locale.ts';

test('language prefixes use complete path segments and preserve the page path', () => {
  for (const [path, language, content] of [
    ['/en/', 'en', '/'],
    ['/zh', 'zh-CN', '/'],
    ['/zh/scenes/patrick/dubs/dub_abc', 'zh-CN', '/scenes/patrick/dubs/dub_abc'],
    ['/en/library/teens', 'en', '/library/teens'],
    ['/english', undefined, '/english'],
    ['/zhang', undefined, '/zhang'],
    ['/fr/scenes/patrick', undefined, '/fr/scenes/patrick'],
  ]) {
    assert.equal(pathLanguage(path), language);
    assert.equal(contentPath(path), content);
    assert.equal(languagePath(path, 'en'), '/en' + content);
    assert.equal(languagePath(path, 'zh-CN'), '/zh' + content);
  }
});
