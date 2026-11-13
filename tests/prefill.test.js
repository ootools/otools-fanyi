import test from 'node:test';
import assert from 'node:assert/strict';
import { SITES } from '../web/js/data/sites.js';
import { MAX_PREFILL_CHARS, buildSiteUrl } from '../web/js/core/prefill.js';

const site = (id) => {
  const found = SITES.find((s) => s.id === id);
  assert.ok(found, `SITES 中应存在 ${id}`);
  return found;
};

// 协议 fixture 只验证 URL 生成器，不代表任何线上站点支持自动预填。
const hashFixture = {
  id: 'hash-fixture',
  name: 'Hash 协议 fixture',
  url: 'https://example.test/translator',
  type: 'browser',
  prefill: '#auto/zh/{text}',
  note: '仅用于离线 URL 拼接测试',
};
const queryFixture = {
  id: 'query-fixture',
  name: 'Query 协议 fixture',
  url: 'https://example.test/translate',
  type: 'browser',
  prefill: '?sl=auto&tl=zh-CN&text={text}&op=translate',
  note: '仅用于离线 URL 拼接测试',
};

test('hash 模板：baidu 与协议 fixture 追加到原 URL 尾部', () => {
  assert.equal(buildSiteUrl(site('baidu'), 'hi there'), 'https://fanyi.baidu.com#auto/zh/hi%20there');
  assert.equal(
    buildSiteUrl(hashFixture, 'hi there'),
    'https://example.test/translator#auto/zh/hi%20there',
  );
});

test('query 模板：bing 以 ?text= 追加', () => {
  assert.equal(buildSiteUrl(site('bing'), 'hi there'), 'https://cn.bing.com/translator?text=hi%20there');
});

test('sogou 路径式 query 模板整体正确', () => {
  assert.equal(
    buildSiteUrl(site('sogou'), 'hi there'),
    'https://fanyi.sogou.com/text?keyword=hi%20there&transfrom=auto&transto=zh-CHS&model=general',
  );
});

test('query 协议 fixture 保留 sl/tl/op 参数', () => {
  assert.equal(
    buildSiteUrl(queryFixture, 'hi there'),
    'https://example.test/translate?sl=auto&tl=zh-CN&text=hi%20there&op=translate',
  );
});

test('deepl 未确认预填：输入不附加到访问链接，生产 prefill 为 null', () => {
  const deepl = site('deepl');
  assert.equal(buildSiteUrl(deepl, 'Hello world 你好'), 'https://www.deepl.com/translator');
  assert.equal(deepl.prefill, null);
});

test('google 未确认预填：输入不附加到访问链接，生产 prefill 为 null', () => {
  const google = site('google');
  assert.equal(buildSiteUrl(google, 'Hello world 你好'), 'https://translate.google.com');
  assert.equal(google.prefill, null);
});

test('空文本（\'\' 或 null）→ 原样返回 site.url', () => {
  const baidu = site('baidu');
  assert.equal(buildSiteUrl(baidu, ''), baidu.url);
  assert.equal(buildSiteUrl(baidu, null), baidu.url);
});

test('site.prefill 为 null → 原样返回 site.url', () => {
  const tencent = site('tencent');
  assert.equal(tencent.prefill, null);
  assert.equal(buildSiteUrl(tencent, 'hello'), tencent.url);
});

test('特殊字符编码后不含裸 # / & / 空格，且可解码回原文', () => {
  const text = 'a#b&c 中  😀';
  const cases = [
    { target: site('baidu'), before: 'https://fanyi.baidu.com#auto/zh/', after: '' },
    { target: site('bing'), before: 'https://cn.bing.com/translator?text=', after: '' },
    { target: hashFixture, before: 'https://example.test/translator#auto/zh/', after: '' },
    {
      target: queryFixture,
      before: 'https://example.test/translate?sl=auto&tl=zh-CN&text=',
      after: '&op=translate',
    },
  ];
  for (const { target, before, after } of cases) {
    const result = buildSiteUrl(target, text);
    assert.ok(result.startsWith(before), `${target.id} 结果应以模板前缀开头`);
    const encoded = after
      ? result.slice(before.length, result.length - after.length)
      : result.slice(before.length);
    assert.doesNotMatch(encoded, /[#& ]/, `${target.id} 编码文本不含裸 #/&/空格`);
    assert.equal(decodeURIComponent(encoded), text, `${target.id} 编码文本应解码回原文`);
  }
});

test('超长文本：8001 字符截断为前 8000 字符', () => {
  assert.equal(MAX_PREFILL_CHARS, 8000);
  const text = '甲'.repeat(8001);
  const result = buildSiteUrl(site('bing'), text);
  const prefix = 'https://cn.bing.com/translator?text=';
  assert.ok(result.startsWith(prefix), '结果应以 bing 模板前缀开头');
  const decoded = decodeURIComponent(result.slice(prefix.length));
  assert.equal(decoded.length, 8000);
  assert.equal(decoded, text.slice(0, 8000));
});

test('超长文本含增补平面字符：截断按代码点，不抛 URIError', () => {
  const text = 'a'.repeat(7999) + '😀' + 'b'.repeat(5);
  const result = buildSiteUrl(site('bing'), text);
  const prefix = 'https://cn.bing.com/translator?text=';
  assert.ok(result.startsWith(prefix), '结果应以 bing 模板前缀开头');
  const decoded = decodeURIComponent(result.slice(prefix.length));
  assert.equal([...decoded].length, 8000, '解码文本按代码点计恰为 8000');
  assert.equal(decoded, 'a'.repeat(7999) + '😀', '截断边界处的 😀 保持完整');
});

test('输入含孤立代理项：兜底替换为 U+FFFD，不抛错', () => {
  const result = buildSiteUrl(site('bing'), '\uD800abc');
  assert.equal(result, 'https://cn.bing.com/translator?text=%EF%BF%BDabc');
});

test('幂等：同一输入两次调用结果相同', () => {
  const text = '幂等 test 123';
  assert.equal(buildSiteUrl(site('baidu'), text), buildSiteUrl(site('baidu'), text));
  assert.equal(buildSiteUrl(site('sogou'), text), buildSiteUrl(site('sogou'), text));
});
