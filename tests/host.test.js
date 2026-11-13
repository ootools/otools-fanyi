import test from 'node:test';
import assert from 'node:assert/strict';
import { pickOpenStrategy, createHostBridge } from '../web/js/core/host.js';

/**
 * 假 window / 假 document 工厂：全部显式注入能力件，绝不触碰真实 window/document。
 * ------------------------------------------------------------------
 * 能力件（均可选）：
 *   shell  → win.otools.shell.openExternal
 *   flat   → win.otools.shellOpenExternal
 *   invoke → win.__TAURI_INTERNALS__.invoke
 *   open   → win.open（返回值真值=成功，null/undefined=失败）
 *   clipboard → win.navigator.clipboard（需含 writeText）
 *   doc    → win.document（execCommand 降级用）
 */
function makeFakeWin({ shell, flat, invoke, open, clipboard, doc } = {}) {
  const win = {};
  if (shell || flat) {
    win.otools = {};
    if (shell) win.otools.shell = { openExternal: shell };
    if (flat) win.otools.shellOpenExternal = flat;
  }
  if (invoke) win.__TAURI_INTERNALS__ = { invoke };
  if (open) win.open = open;
  if (clipboard) win.navigator = { clipboard };
  if (doc) win.document = doc;
  return win;
}

/**
 * 假 document：createElement 产出的假 textarea 记录 value/style/select，
 * execCommand 按 execResult 返回（execThrows=true 时同步抛），append/remove 记入 log。
 */
function makeFakeDoc({ execResult = true, execThrows = false } = {}) {
  const log = { appended: [], removed: [], execCmds: [] };
  const doc = {
    body: {
      appendChild(el) { log.appended.push(el); },
      removeChild(el) { log.removed.push(el); },
    },
    createElement(tag) {
      return { tagName: tag, value: '', style: {}, selected: false, select() { this.selected = true; } };
    },
    execCommand(cmd) {
      log.execCmds.push(cmd);
      if (execThrows) throw new Error('execCommand boom');
      return execResult;
    },
  };
  return { doc, log };
}

/* ------------------------------------------------------------------ */
/* pickOpenStrategy 策略矩阵（计划 Task 7 Step 1 的 4 组 + 防御边界）      */
/* ------------------------------------------------------------------ */

test('① (true,*,*) → sdk（shell 优先，与其余 flags 无关）', () => {
  assert.equal(pickOpenStrategy({ hasSdkShell: true, hasSdkFlat: false, hasTauriInvoke: false }), 'sdk');
  assert.equal(pickOpenStrategy({ hasSdkShell: true, hasSdkFlat: true, hasTauriInvoke: true }), 'sdk');
  assert.equal(pickOpenStrategy({ hasSdkShell: true, hasSdkFlat: false, hasTauriInvoke: true }), 'sdk');
});

test('② (false,true,*) → sdk（flat 形态也归 sdk 策略，命中时按 flat 调用）', () => {
  assert.equal(pickOpenStrategy({ hasSdkShell: false, hasSdkFlat: true, hasTauriInvoke: false }), 'sdk');
  assert.equal(pickOpenStrategy({ hasSdkShell: false, hasSdkFlat: true, hasTauriInvoke: true }), 'sdk');
});

test('③ (false,false,true) → tauri', () => {
  assert.equal(pickOpenStrategy({ hasSdkShell: false, hasSdkFlat: false, hasTauriInvoke: true }), 'tauri');
});

test('④ (false,false,false) → window（兜底）', () => {
  assert.equal(pickOpenStrategy({ hasSdkShell: false, hasSdkFlat: false, hasTauriInvoke: false }), 'window');
});

test('⑤ flags 缺字段 / 空对象 / null → 一律 window（防御不抛）', () => {
  assert.equal(pickOpenStrategy({}), 'window');
  assert.equal(pickOpenStrategy({ hasSdkShell: false }), 'window');
  assert.equal(pickOpenStrategy(null), 'window');
});

/* ------------------------------------------------------------------ */
/* createHostBridge：三级链命中顺序与逐级降级轨迹                          */
/* ------------------------------------------------------------------ */

test('⑥ shell 成功 → 只调 shell，flat/tauri/window 均不触发；available() 为 true', async () => {
  const calls = [];
  const win = makeFakeWin({
    shell() { calls.push('shell'); return Promise.resolve(); },
    flat() { calls.push('flat'); },
    invoke() { calls.push('tauri'); },
    open() { calls.push('window'); return {}; },
  });
  const bridge = createHostBridge(win);
  assert.equal(bridge.available(), true, 'otools 包装存在即可用');
  await bridge.openExternal('https://example.com');
  assert.deepEqual(calls, ['shell'], '命中最高级后不再降级');
});

test('⑦ shell 同步 throw → 降级 flat 成功（window.open 不被调用）', async () => {
  const calls = [];
  const win = makeFakeWin({
    shell() { calls.push('shell'); throw new Error('shell boom'); },
    flat() { calls.push('flat'); },
    open() { calls.push('window'); return {}; },
  });
  await createHostBridge(win).openExternal('https://example.com');
  assert.deepEqual(calls, ['shell', 'flat'], '第一级失败落到下一级即成功');
});

test('⑧ shell 异步 reject → 降级 tauri，命令名与参数为 otools_shell_open_external/{url}', async () => {
  const calls = [];
  const invocations = [];
  const win = makeFakeWin({
    shell() { calls.push('shell'); return Promise.reject(new Error('shell async fail')); },
    invoke(cmd, args) { calls.push('tauri'); invocations.push([cmd, args]); },
    open() { calls.push('window'); return {}; },
  });
  await createHostBridge(win).openExternal('https://example.com/a?q=1');
  assert.deepEqual(calls, ['shell', 'tauri'], 'shell 失败落 tauri，不落 window');
  assert.deepEqual(
    invocations,
    [['otools_shell_open_external', { url: 'https://example.com/a?q=1' }]],
    '命令名与宿主 builtin_plugin_handlers.rs 注册一致，参数形如 { url }',
  );
});

test('⑨ tauri reject → 降级 window.open(url, "_blank")，返回真值即成功', async () => {
  const opens = [];
  const win = makeFakeWin({
    invoke() { return Promise.reject(new Error('invoke fail')); },
    open(url, target) { opens.push([url, target]); return { closed: false }; },
  });
  await createHostBridge(win).openExternal('https://example.com');
  assert.deepEqual(opens, [['https://example.com', '_blank']]);
});

test('⑩ available()：shell / flat / tauri invoke 任一存在 → true；全无 → false', () => {
  assert.equal(createHostBridge(makeFakeWin({ shell() {} })).available(), true);
  assert.equal(createHostBridge(makeFakeWin({ flat() {} })).available(), true);
  assert.equal(createHostBridge(makeFakeWin({ invoke() {} })).available(), true);
  assert.equal(createHostBridge(makeFakeWin({})).available(), false);
  assert.equal(createHostBridge({}).available(), false, '裸 window 不可用');
});

/* ------------------------------------------------------------------ */
/* 全级失败：openExternal 以 reject 表达失败，绝不同步抛                    */
/* ------------------------------------------------------------------ */

test('⑪ 全级失败（shell throw / flat reject / invoke reject / open 返回 null）→ reject', async () => {
  const opens = [];
  const win = makeFakeWin({
    shell() { throw new Error('shell boom'); },
    flat() { return Promise.reject(new Error('flat boom')); },
    invoke() { return Promise.reject(new Error('invoke boom')); },
    open() { opens.push(1); return null; },
  });
  const bridge = createHostBridge(win);
  const p = bridge.openExternal('https://example.com'); // 同步抛出则此行直接炸
  await assert.rejects(p, (err) => err instanceof Error);
  assert.equal(opens.length, 1, 'window 级被尝试（返回 null 计失败）');
});

test('⑫ window.open 返回 undefined 同样计失败 → reject', async () => {
  const win = makeFakeWin({
    shell() { throw new Error('shell boom'); },
    invoke() { return Promise.reject(new Error('invoke boom')); },
    open() { return undefined; },
  });
  const p = createHostBridge(win).openExternal('https://example.com');
  await assert.rejects(p, (err) => err instanceof Error);
});

test('⑬ 裸 win（无任何能力，open 也缺失）→ reject 且不同步抛', async () => {
  const bridge = createHostBridge({});
  assert.equal(bridge.available(), false);
  const p = bridge.openExternal('https://example.com');
  await assert.rejects(p, (err) => err instanceof Error);
});

/* ------------------------------------------------------------------ */
/* copyText：clipboard 优先，execCommand 降级，全败 resolve(false)          */
/* ------------------------------------------------------------------ */

test('⑭ clipboard.writeText 可用 → true，且不触碰 document（无降级动作）', async () => {
  const writes = [];
  const { doc, log } = makeFakeDoc();
  const win = makeFakeWin({
    clipboard: { writeText(t) { writes.push(t); return Promise.resolve(); } },
    doc,
  });
  assert.equal(await createHostBridge(win).copyText('你好 world'), true);
  assert.deepEqual(writes, ['你好 world']);
  assert.deepEqual(log.execCmds, [], 'clipboard 成功不得走 execCommand');
  assert.deepEqual(log.appended, [], '不得创建临时节点');
});

test('⑮ clipboard 缺失 + execCommand("copy") 返回 true → true（临时 textarea 挂载/移除/选中文本）', async () => {
  const { doc, log } = makeFakeDoc({ execResult: true });
  const win = makeFakeWin({ doc });
  assert.equal(await createHostBridge(win).copyText('copy me'), true);
  assert.deepEqual(log.execCmds, ['copy']);
  assert.equal(log.appended.length, 1, '临时 textarea 已挂载');
  assert.equal(log.appended[0].tagName, 'textarea');
  assert.equal(log.appended[0].value, 'copy me', '文本写入临时节点');
  assert.equal(log.appended[0].selected, true, '已选中以便 copy');
  assert.equal(log.removed.length, 1, '用毕移除临时节点');
});

test('⑯ writeText reject（权限拒绝）→ 降级 execCommand 成功 → true', async () => {
  const { doc, log } = makeFakeDoc({ execResult: true });
  const win = makeFakeWin({
    clipboard: { writeText() { return Promise.reject(new Error('NotAllowedError')); } },
    doc,
  });
  assert.equal(await createHostBridge(win).copyText('hi'), true);
  assert.deepEqual(log.execCmds, ['copy'], '写失败后落到 execCommand');
});

test('⑰ writeText reject + execCommand 返回 false → false', async () => {
  const { doc } = makeFakeDoc({ execResult: false });
  const win = makeFakeWin({
    clipboard: { writeText() { return Promise.reject(new Error('NotAllowedError')); } },
    doc,
  });
  assert.equal(await createHostBridge(win).copyText('hi'), false);
});

test('⑱ clipboard.writeText 非函数（不可用）+ execCommand 同步抛 → false', async () => {
  const { doc } = makeFakeDoc({ execThrows: true });
  const win = makeFakeWin({ clipboard: {}, doc });
  assert.equal(await createHostBridge(win).copyText('hi'), false);
});

test('⑲ 全缺（无 clipboard、无 document）→ false，不同步抛', async () => {
  const win = makeFakeWin({});
  assert.equal(await createHostBridge(win).copyText('hi'), false);
});

/* ------------------------------------------------------------------ */
/* 跨域 WindowProxy：探测候选读属性同步抛，必须逐候选防抛并跳过             */
/* ------------------------------------------------------------------ */

test('⑳ parent 为跨域 WindowProxy（读属性抛 SecurityError）→ 探测不抛，openExternal 走到 window 级成功', async () => {
  // 真实跨域 WindowProxy 上读任意自有属性同步抛 SecurityError；用 Proxy 模拟。
  const crossProxy = new Proxy({}, {
    get() {
      throw new Error('SecurityError: Blocked a frame with origin from accessing a cross-origin frame.');
    },
  });
  const opens = [];
  const win = {};
  win.parent = crossProxy; // 压栈可行（身份比较不触发 get），循环里读其属性才抛
  win.open = (url, target) => { opens.push([url, target]); return { closed: false }; };
  const bridge = createHostBridge(win);
  assert.equal(bridge.available(), false, '读不到的能力视为不存在，available() 不得同步抛');
  await bridge.openExternal('https://example.com');
  assert.deepEqual(opens, [['https://example.com', '_blank']], '跨域候选被跳过后照常走完链到 window 兜底级');
});
