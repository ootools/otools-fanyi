/*
 * 宿主桥策略（Task 2 spike 最小版）。
 * ------------------------------------------------------------------
 * 系统浏览器打开的三级 fallback 链（见 spec「宿主桥」章节）：
 *   1. SDK 包装层：window.otools.shell.openExternal（shell 形态）
 *                  / window.otools.shellOpenExternal（flat 形态）
 *   2. Tauri IPC：invoke('otools_shell_open_external', { url })
 *   3. window.open(url, '_blank') 兜底
 * 本文件只放无 DOM 的策略纯函数；Task 7 扩充 createHostBridge（签名不变）。
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
