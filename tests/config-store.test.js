import test from 'node:test';
import assert from 'node:assert/strict';
import { SITES } from '../web/js/data/sites.js';
import { CONFIG_KEY, loadConfig, saveConfig, resetConfig } from '../web/js/core/config-store.js';

/** 内存 storage：{getItem,setItem,removeItem}，Map 实现的注入式最小适配。 */
function createMemoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

const ALL_IDS = SITES.map((s) => s.id);

/** 断言 enabled 恰好覆盖 9 个站 id，且每个值与 expected[id]（缺省 true）一致。 */
function assertEnabledShape(enabled, overrides = {}) {
  const expected = Object.fromEntries(ALL_IDS.map((id) => [id, overrides[id] ?? true]));
  assert.deepEqual(enabled, expected);
}

test('CONFIG_KEY 固定为 otools-fanyi.config.v1', () => {
  assert.equal(CONFIG_KEY, 'otools-fanyi.config.v1');
});

test('空 storage → 9 站全 true', () => {
  const storage = createMemoryStorage();
  assertEnabledShape(loadConfig(storage, SITES).enabled);
});

test('存 { baidu: false } → baidu 关、其余 8 站全 true', () => {
  const storage = createMemoryStorage({
    [CONFIG_KEY]: JSON.stringify({ enabled: { baidu: false } }),
  });
  const { enabled } = loadConfig(storage, SITES);
  assert.equal(enabled.baidu, false);
  for (const id of ALL_IDS) {
    if (id !== 'baidu') assert.equal(enabled[id], true, `${id} 应保持默认开启`);
  }
});

test('损坏 JSON（{{{bad）→ 默认全开且不抛错', () => {
  const storage = createMemoryStorage({ [CONFIG_KEY]: '{{{bad' });
  assertEnabledShape(loadConfig(storage, SITES).enabled);
});

test('存未知 id（{ foo: true }）→ 忽略，仅返回已知站点', () => {
  const storage = createMemoryStorage({
    [CONFIG_KEY]: JSON.stringify({ enabled: { foo: true, baidu: false } }),
  });
  const { enabled } = loadConfig(storage, SITES);
  assert.equal(enabled.foo, undefined, '未知 id 不应出现在结果中');
  assertEnabledShape(enabled, { baidu: false });
});

test('save → load 往返一致', () => {
  const storage = createMemoryStorage();
  const enabled = Object.fromEntries(ALL_IDS.map((id) => [id, true]));
  enabled.youdao = false;
  enabled.google = false;
  saveConfig(storage, enabled);
  assert.deepEqual(loadConfig(storage, SITES).enabled, enabled);
});

test('resetConfig 后再 load → 全开', () => {
  const storage = createMemoryStorage({
    [CONFIG_KEY]: JSON.stringify({ enabled: { baidu: false } }),
  });
  resetConfig(storage, SITES);
  assert.equal(storage.getItem(CONFIG_KEY), null, 'resetConfig 应删除存储 key');
  assertEnabledShape(loadConfig(storage, SITES).enabled);
});

test('值非布尔（字符串 "false"）→ 仅严格 === false 视为关闭，其余视为开启', () => {
  const storage = createMemoryStorage({
    [CONFIG_KEY]: JSON.stringify({
      enabled: { baidu: 'false', youdao: 0, sogou: null, deepl: false },
    }),
  });
  const { enabled } = loadConfig(storage, SITES);
  assert.equal(enabled.baidu, true, "字符串 \"false\" 应视为开启");
  assert.equal(enabled.youdao, true, '数字 0 应视为开启');
  assert.equal(enabled.sogou, true, 'null 应视为开启');
  assert.equal(enabled.deepl, false, '严格 false 才视为关闭');
});
