import test from 'node:test';
import assert from 'node:assert/strict';
import { i18n } from '../src/i18n-engine.ts';
import en from '../src/locales/en/translation.json' with { type: 'json' };
import zhCN from '../src/locales/zh-CN/translation.json' with { type: 'json' };
import es from '../src/locales/es/translation.json' with { type: 'json' };
import ja from '../src/locales/ja/translation.json' with { type: 'json' };
import ko from '../src/locales/ko/translation.json' with { type: 'json' };

function messages(resource, prefix = '') {
  return Object.entries(resource).flatMap(([key, value]) => typeof value === 'string'
    ? [[prefix + key, value]] : messages(value, `${prefix}${key}.`));
}

test('locale resources have matching keys and named interpolation variables', () => {
  const english = new Map(messages(en));
  for (const resource of [zhCN, es, ja, ko]) {
    const translated = new Map(messages(resource));
    assert.deepEqual([...english.keys()].sort(), [...translated.keys()].sort());
    for (const [key, value] of english) {
      assert.doesNotMatch(key, /[\p{Script=Han}]/u);
      assert.doesNotMatch(value, /[\p{Script=Han}]/u, key);
      const variables = text => [...text.matchAll(/{{(\w+)}}/g)].map(match => match[1]).sort();
      assert.deepEqual(variables(value), variables(translated.get(key)), key);
      assert.doesNotMatch(translated.get(key), /{\d+}/, key);
    }
  }
});

test('i18next renders the added languages with named variables', () => {
  for (const [language, expected] of [['es', 'Frase 2: Hello, Sam.'], ['ja', 'セリフ2：Hello, Sam.'], ['ko', '대사 2: Hello, Sam.']]) {
    assert.equal(i18n.t('recording.lineLabel', { lng: language, number: 2, text: 'Hello, Sam.' }), expected);
  }
});

test('i18next renders semantic keys and named variables in either language', () => {
  assert.equal(i18n.t('recording.lineLabel', { lng: 'en', number: 2, text: 'Hello, Sam.' }), 'Line 2: Hello, Sam.');
  assert.equal(i18n.t('library.sceneCount', { lng: 'zh-CN', count: 3 }), '3 个片段');
  assert.equal(i18n.t('navigation.library', { lng: 'en' }), 'Scene library');
  assert.equal(i18n.t('errors.microphoneDenied', { lng: 'en' }), 'Microphone access is off. Allow it in your browser’s site settings, then press record.');
});
