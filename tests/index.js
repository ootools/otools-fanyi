/**
 * 测试聚合入口（沿用 snake 模板约定）。
 * ------------------------------------------------------------------
 * Node 22 的 `node --test` 位置参数按 glob/模块解析，`node --test tests/`
 * 会把目录本身当模块解析（目录 → index.js），所以这里统一 import 全部
 * 测试文件，保证 `node --test tests/` 能跑全量用例。
 * Task 3+ 新增 tests/*.test.js 时，记得在此追加一行 import。
 * 注意：`node --test tests/*.test.js` 会把本入口也跑一遍（用例重复执行），
 * 推荐用 `node --test tests/` 或直接 `node --test`。
 */
// Task 3 起逐个追加，例如：
import './sites.test.js';
import './prefill.test.js';
