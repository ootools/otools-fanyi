import test from 'node:test';
import assert from 'node:assert/strict';
import { SITES } from '../web/js/data/sites.js';

test('站点清单：9 个条目且 id 唯一', () => {
  assert.equal(SITES.length, 9);
  const ids = SITES.map((site) => site.id);
  assert.equal(new Set(ids).size, ids.length, 'id 必须唯一');
});

test('嵌入类型：恰好 deepl、google 为 browser，其余 7 个为 embed', () => {
  const browserIds = SITES.filter((site) => site.type === 'browser').map((site) => site.id);
  assert.deepEqual([...browserIds].sort(), ['deepl', 'google']);
  const embedIds = SITES.filter((site) => site.type === 'embed').map((site) => site.id);
  assert.equal(embedIds.length, 7);
  for (const site of SITES) {
    assert.ok(
      site.type === 'embed' || site.type === 'browser',
      `${site.id} 的 type 必须是 embed | browser`,
    );
  }
});

test('URL：每条以 https:// 开头', () => {
  for (const site of SITES) {
    assert.match(site.url, /^https:\/\//, `${site.id} 的 url 必须以 https:// 开头`);
  }
});

test('prefill：为 null 或包含 {text} 占位符', () => {
  for (const site of SITES) {
    const ok = site.prefill === null || site.prefill.includes('{text}');
    assert.ok(ok, `${site.id} 的 prefill 必须是 null 或含 {text} 占位符`);
  }
});

test('id 顺序等于默认 Tab 顺序', () => {
  assert.deepEqual(
    SITES.map((site) => site.id),
    ['baidu', 'tencent', 'youdao', 'sogou', 'bing', 'caiyun', 'cnki', 'deepl', 'google'],
  );
});
