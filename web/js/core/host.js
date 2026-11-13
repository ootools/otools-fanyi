/*
 * 宿主桥（Task 7 完整版）：策略矩阵 + 系统浏览器三级打开链 + 剪贴板。
 * ------------------------------------------------------------------
 * 系统浏览器打开的三级 fallback 链（见 spec「宿主桥」章节）：
 *   1. SDK 包装层：window.otools.shell.openExternal（shell 形态）
 *                  / window.otools.shellOpenExternal（flat 形态）
 *   2. Tauri IPC：invoke('otools_shell_open_external', { url })
 *      —— 命令名与宿主 builtin_plugin_handlers.rs 注册一致
 *   3. window.open(url, '_blank') 兜底（Tauri webview 里可能 no-op）
 *
 * 失败语义（永不静默失败）：
 *   - 逐级 try/catch 降级，仅当全链失败才 reject（UI 层 catch 后展示可复制
 *     完整 URL 的卡片，属 UI 层职责，本模块只管链路）；
 *   - openExternal 为 async，任何同步异常都会转为 rejection，绝不同步抛；
 *   - window 级返回 null/undefined 也计失败（弹窗被拦 / no-op 场景）；
 *     sdk / tauri 级只看调用是否成功（不抛、promise 兑现），避免 fire-and-forget
 *     实现返回 undefined 被误判后二次 open。
 *
 * 能力探测均为调用时进行（宿主可能晚于桥创建注入 window.otools）；
 * tauri 探测沿用桥脚本同款 window → parent → top 逐层查找。
 * 本文件保持无 DOM 依赖（copyText 经 win.document 派生），可被 node --test 导入。
 */

/**
 * 依据探测到的能力 flags 选择系统浏览器打开策略。
 * 优先级：hasSdkShell > hasSdkFlat > hasTauriInvoke > 'window'。
 * hasSdkFlat 命中也归 'sdk' 策略（调用方按 flat 形态调用）。
 *
 * @param {{ hasSdkShell: boolean, hasSdkFlat: boolean, hasTauriInvoke: boolean }} flags
 * @returns {'sdk' | 'tauri' | 'window'}
 */
export function pickOpenStrategy(flags) {
  var f = flags || {};
  if (f.hasSdkShell || f.hasSdkFlat) return 'sdk';
  if (f.hasTauriInvoke) return 'tauri';
  return 'window';
}

/**
 * window → parent → top 逐层查找 __TAURI_INTERNALS__.invoke（沿用桥脚本探测方式）。
 * 跨域 WindowProxy 上任何属性读取都会同步抛 SecurityError：压栈与循环内
 * 属性读取均逐个 try/catch，读不到的候选视为无 tauri、跳过继续，绝不外抛。
 *
 * @param {Window} win
 * @returns {((cmd: string, args: object) => Promise<any>) | null}
 */
function findTauriInvoke(win) {
  var candidates = [win];
  try { if (win.parent && win.parent !== win) candidates.push(win.parent); } catch (e) {}
  try { if (win.top && win.top !== win) candidates.push(win.top); } catch (e) {}
  for (var i = 0; i < candidates.length; i++) {
    var t = null;
    try { t = candidates[i] && candidates[i].__TAURI_INTERNALS__; } catch (e) { t = null; }
    if (t && typeof t.invoke === 'function') return t.invoke.bind(t);
  }
  return null;
}

/**
 * 探测 win 上的真实宿主能力对象，产出 pickOpenStrategy 的 flags。
 *
 * @param {Window} win
 * @returns {{ hasSdkShell: boolean, hasSdkFlat: boolean, hasTauriInvoke: boolean }}
 */
function detectFlags(win) {
  var otools = win && win.otools;
  return {
    hasSdkShell: !!(otools && otools.shell && typeof otools.shell.openExternal === 'function'),
    hasSdkFlat: !!(otools && typeof otools.shellOpenExternal === 'function'),
    hasTauriInvoke: !!findTauriInvoke(win),
  };
}

/**
 * 按 pickOpenStrategy 结果排出实际尝试的级别序列（只纳入真实存在的通道，
 * 失败逐级降级）：sdk-shell → sdk-flat → tauri → window。
 *
 * @param {Window} win
 * @param {string} url
 * @returns {{ name: string, run: () => Promise<any> }[]}
 */
function buildLevels(win, url) {
  var flags = detectFlags(win);
  var strategy = pickOpenStrategy(flags);
  var levels = [];
  if (strategy === 'sdk') {
    if (flags.hasSdkShell) {
      levels.push({
        name: 'sdk-shell',
        run: function () { return win.otools.shell.openExternal(url); },
      });
    }
    if (flags.hasSdkFlat) {
      levels.push({
        name: 'sdk-flat',
        run: function () { return win.otools.shellOpenExternal(url); },
      });
    }
  }
  if (strategy === 'sdk' || strategy === 'tauri') {
    var invoke = findTauriInvoke(win);
    if (invoke) {
      levels.push({
        name: 'tauri',
        run: function () { return invoke('otools_shell_open_external', { url: url }); },
      });
    }
  }
  levels.push({
    name: 'window',
    run: function () {
      var w = win.open(url, '_blank');
      if (!w) throw new Error('window.open 返回 ' + String(w) + '（可能被拦截）');
    },
  });
  return levels;
}

/**
 * execCommand('copy') 降级：临时 textarea + select + copy，用毕移除。
 * 任何一步不可用 / 抛错 → false，不影响调用方。
 *
 * @param {Document|null} doc
 * @param {string} text
 * @returns {boolean}
 */
function execCommandCopy(doc, text) {
  var ta = null;
  try {
    if (!doc || !doc.body || typeof doc.createElement !== 'function' || typeof doc.execCommand !== 'function') {
      return false;
    }
    ta = doc.createElement('textarea');
    ta.value = text;
    if (ta.style) {
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
    }
    doc.body.appendChild(ta);
    if (typeof ta.select === 'function') ta.select();
    return !!doc.execCommand('copy');
  } catch (e) {
    return false;
  } finally {
    if (ta) {
      try { doc.body.removeChild(ta); } catch (e2) { /* 清理失败不影响结果 */ }
    }
  }
}

/**
 * 创建宿主桥：系统浏览器打开三级链 + 剪贴板写入。
 * 所有能力探测在方法调用时进行，同一桥可随宿主注入时机动态生效。
 *
 * @param {Window} win 宿主 window（测试注入假件，不触碰全局）
 * @returns {{
 *   available(): boolean,
 *   openExternal(url: string): Promise<void>,
 *   copyText(text: string): Promise<boolean>,
 * }}
 */
export function createHostBridge(win) {
  /** otools 包装或 tauri invoke 任一存在即视为「在宿主里」。 */
  function available() {
    var f = detectFlags(win);
    return !!(f.hasSdkShell || f.hasSdkFlat || f.hasTauriInvoke);
  }

  /**
   * 三级链打开系统浏览器。任一级成功即 resolve(void)；
   * 全链失败 reject（UI 层 catch 后走可复制 URL 卡片）。
   * async 保证全链路绝不同步抛。
   */
  async function openExternal(url) {
    var levels = buildLevels(win, url);
    var errors = [];
    for (var i = 0; i < levels.length; i++) {
      try {
        await levels[i].run();
        return;
      } catch (e) {
        errors.push(levels[i].name + ': ' + (e && e.message ? e.message : String(e)));
      }
    }
    throw new Error('系统浏览器打开失败（三级通道均不可用）: ' + errors.join(' | '));
  }

  /**
   * 复制文本：navigator.clipboard.writeText 优先；失败/不可用降级
   * execCommand('copy')（临时 textarea）；均败 resolve(false)。
   */
  async function copyText(text) {
    var s = String(text == null ? '' : text);
    var nav = win && win.navigator;
    var clip = nav && nav.clipboard;
    if (clip && typeof clip.writeText === 'function') {
      try {
        await clip.writeText(s);
        return true;
      } catch (e) { /* 权限拒绝等 → 降级 execCommand */ }
    }
    var doc = win && win.document;
    return execCommandCopy(doc, s);
  }

  return { available: available, openExternal: openExternal, copyText: copyText };
}
