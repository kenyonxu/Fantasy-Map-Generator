# 分阶段代码质量优化规划

日期：2026-10-06
来源：四层代码质量审查（generators / utils+services+io / renderers+controllers / electron+scripts），所有条目均经原始代码抽查确认。

## 目标与原则

主目标：**先止血修正确性 bug**，其次性能与安全，最后结构性还债。

原则：

- 四阶段渐进式（P0 → P3），每阶段独立可交付、可暂停、可单独发版。
- 越早的阶段风险越低、收益越直接；结构性改动全部放在 P2 之后。
- **红线：不改变 `.map` 序列化格式**，保证用户存档可无损加载/保存（含旧版本迁移链）。
- 每个 bug 修复必须配回归测试；每阶段验收以 `tsc --noEmit` + `biome check` + 全量 vitest 绿为准。
- 遵守既有架构规则：generators 不触 DOM/SVG；renderers 纯且幂等；新代码用 TypeScript、禁 `any`。

## 基线状态（2026-10-06）

- `tsc --noEmit`：通过，零类型错误。
- `biome check src`：547 文件，通过。
- `vitest run`：1968 测试中 1966 通过；2 个失败为 `icon-sets.test.ts` 的 Windows 路径分隔符问题（本规划 P0 修复）。
- 代码规模：548 个 TS 文件，0 个 JS 文件（迁移已完成）。

---

## P0 — 止血（纯 bug 修复，零接口变更）

目标：清掉 8 个确证 bug + XSS 群，可单独出一个 patch 版本。所有改动均为局部小改，不动公共接口。

> **✅ 已实现（2026-10-06，merge commit `b6725089`）**：9 个提交全部落地。最终门禁：tsc 零错误、biome 550 文件干净、vitest 1980/1980（Windows 与 Linux 均绿）、test:scripts 54/54、assistant-context `--check` 同步。实施计划见 `docs/superpowers/plans/2026-10-06-p0-stabilization.md`。
>
> 实现偏差记录：
> - 任务 1/5 分别提取了导出函数 `Load.repairInvalidCultures` 与 `extractStatement`，以便回归测试锁定真实实现（而非复制品）。
> - 任务 2/3 的测试为镜像/文档式测试，锁不住生产行（cultures-generator.ts:1174、states-generator.ts:656-660）——已裁决，集成测试台归入 P2。
> - XSS 族在最终审查后扩展到全部 6 个 overview（burgs/rivers/routes/diplomacy/regiments/military）；notes-editor 与 diplomacy chronicle 的富文本为故意设计，sanitize 归 P1。
> - 审查判定 `cells.r[-1]` 为误报（有意的边界倾注哨兵）。
> - 修复脚本测试的 import 副作用（`generate-assistant-context.mjs` 加 main-module guard）。

### 正确性 bug（6 项）

| # | 位置 | 问题 | 修复 |
|---|------|------|------|
| 1 | `src/services/io/load.ts:448` | invalidCultures 修复误写 `cells.province[i] = 0`（应为 `cells.culture[i] = 0`），既漏修又清空合法省份归属 | 改字段；加回归测试覆盖该分支 |
| 2 | `src/generators/cultures-generator.ts:1174` | `centers.add(c.center as number)` 把 cell id 传给 d3-quadtree（默认访问器取 `d[0]` 得 NaN），锁定文化中心不参与间距判定，再生成可重叠 | 改为 `centers.add(this.cells.p[c.center])`，去掉 `as number`；对齐 1187 行写法 |
| 3 | `src/generators/states-generator.ts:655-664` | `ra()` 对过滤空的 rival 列表返回 `undefined`，随后 `states[defender].name` 抛 TypeError（所有 rival 均为第三方 vassal 时触发） | 过滤后判空 `continue` |
| 4 | `src/generators/river-generator.ts:51,613` | `smallLength` 只在单例上算一次，同会话第二张地图沿用旧阈值，河流大小分类静默错误 | `generate()`/`regenerate()` 开头重置为 `null` |
| 5 | `src/generators/river-generator.ts:89` | `while (cell)` 把合法索引 0 当终止哨兵，从/经 cell 0 的河流被截断或产生 undefined source/mouth | 改显式停止条件（`cell >= 0` + visited 检查） |
| 6 | `scripts/generate-assistant-context.mjs:97` | 括号深度计数把 `=>` 的 `>` 当闭括号，箭头函数声明之后整个文件被吞进 AI 上下文；`--check` 只会锁定错误输出 | 深度计数前跳过 `=` 后的 `>`，或换扫描器忽略 `=>` |

### 测试平台兼容（1 项）

| # | 位置 | 问题 | 修复 |
|---|------|------|------|
| 7 | `src/components/icon-sets.test.ts:12-19` | `directory()` 的 `readdirSync` 在 Windows 返回反斜杠路径，与 `import.meta.glob` 的正斜杠键不匹配，导致 2 个断言失败（CI/Linux 绿） | 测试内把 `\` 归一化为 `/` |

### 安全：XSS 群（1 族）

| # | 位置 | 问题 | 修复 |
|---|------|------|------|
| 8 | `src/controllers/burgs-overview.ts:345,357,576,771`、`burg-editor.ts:298,792`、`notes-editor.ts:302` 等 | 实体名称/上传文件内容只 trim 不转义即拼 innerHTML；`.map` 可分享，构成存储型 XSS | 所有插值统一过 `escapeHtml()`（utils 已有）；上传内容必须转义；同时把 CSV 导出统一到 `toCsvField` 修逗号错位 |

**P0 验收**：上述各点均有回归测试；`tsc` + `biome` + vitest 全绿（含 Windows）。

---

## P1 — 性能与安全加固（局部重构，不改公共接口）

> **✅ 已实现（2026-10-06，merge commit `b59aecb4`）**：8 个提交全部落地。最终门禁：tsc（根 + electron 双项目）零错误、biome 556 文件干净、vitest 1996/1996、test:scripts 54/54、assistant-context `--check` 同步。实施计划见 `docs/superpowers/plans/2026-10-06-p1-performance-security.md`。
>
> 实现偏差与裁决记录：
> - 性能三项以结构复杂度证据替代实测耗时（可证明行为不变且有回归锁）；大地图计时基准列为后续。
> - `uncompress` 沿用 P0 的提取导出模式（`Load.uncompress`）。
> - AI 读图确认落地为 `script-consent.ts` + `confirmationDialog` 新增可选 `onClose`；`read_map` 工具描述同步改为如实说明全权限。
> - 最终审查升级并修复了一项 Critical：确认对话框被 X/Escape 关闭时助手面板永久卡死。
> - 后续登记：`confirmOnClose` 同类隐患（electron/main.ts:240-259）、`update3dTexture` 的 TextureLoader 无 onError（:893）、io 测试共享 mock 模块。

| # | 位置 | 问题 | 修复 |
|---|------|------|------|
| 1 | `src/generators/goods-generator.ts:1015` | `new Function` 在 cell×good 双层循环内反复编译（10 万格地图数万次） | 提升到循环外、每个 good 编译一次（同文件 1051 行 `regeneratePlacement` 已有正确范式） |
| 2 | `src/generators/religions-generator.ts:1165` → `routes-generator.ts:825` | 洪泛每条边线性扫 `pack.routes.find`，O(E log E) 退化为 O(E×R) | 洪泛前构建 `Map<routeId, Route>` 缓存 |
| 3 | `src/services/io/load.ts:176-181` | gzip 解压 `concat(Array.from(chunk))` 逐块重建数组，O(n²) | 收集 chunk 后一次拼接（`Blob` → `arrayBuffer`） |
| 4 | `src/renderers/view-3d-renderer.ts:624-644,982-991` | 纹理 `img.onload` 无 `onerror`，SVG 光栅化失败则 Promise 永不 resolve，界面卡死无提示 | 补 `onerror → resolve(null)` + fallback + 用户可见 `tip`；`canvas.toBlob` 去掉非空断言 |
| 5 | `src/renderers/view-3d-renderer.ts:335-340,760-770` | OBJExporter / loopSubdivision 动态加载不检查返回值，离线直接 TypeError | 检查返回值，失败时 `tip` + 回退 |
| 6 | `src/services/assistant/provider/runtime.ts:26-42`、`connection.ts:22,35-38` | `read_map` 经 `new AsyncFunction` 全权限执行模型 JS，名为只读但无强制，可读 localStorage 里各家 API key；`clear()` 只清当前 provider | 会话首次执行前加用户确认；`clear()` 遍历清全部 `fmg-ai-kl-*`；文档明示风险 |
| 7 | `electron/updater.ts:31-33,55-88`、`electron/main.ts:15,295` | 四处 updater 对话框 `.then` 无 `.catch`（窗口销毁即 unhandled rejection）；打包版仍读 `VITE_DEV_SERVER_URL` | `ask()` 集中改为 rejection-safe；`DEV_SERVER_URL` 仅在 `!app.isPackaged` 时生效 |

**P1 验收**：大地图（≥5 万格）生成/加载耗时可测地下降；3D 失败路径有用户提示；AI 读图前有确认门槛。

---

## P2 — 结构性还债（允许接口调整，不碰 .map 格式）

| # | 范围 | 内容 |
|---|------|------|
| 1 | `cultures-generator.ts:1269-1359`、`religions-generator.ts:1027-1115`、`states-generator.ts:371-436` | 三处手抄 Dijkstra 洪泛（FlatQueue + cost 表 + lock 过滤）已发散且各自带坑；抽共享 `priorityFlood(seeds, edgeCost, canClaim)`，各生成器只供 cost 表；顺带修 cultures cost 无下限导致的 0 成本格反复入队 |
| 2 | `src/utils/nodeUtils.ts:8-19` 及 100+ 调用点 | `ensureEl` 元素缺失时返回 `null` 但类型标 `T`，假契约导致远离根因的 TypeError 与死检查；改为 throw（或 `T \| null` 强制收窄），清理死检查 |
| 3 | `cultures-generator.ts:1060-1087` | 全目录唯一在生成器里直接操作 jQuery UI 弹窗的地方；迁移到 controller，对齐 `States.recreate()` 返回 `{warning, error}` 的模式 |
| 4 | `burgs-overview.ts:517-568,624-658` 及编辑器事件处理器 | d3 图表模块的 `any` 集群类型化（定义 `ChartDatum` 判别联合，用 `stratify<ChartDatum>()` 去 cast）；编辑器 `event: any` 收紧为具体事件类型 |

**P2 验收**：洪泛逻辑单测覆盖（当前三处洪泛均无直接单测）；`any` 计数显著下降；架构规则（生成器不触 DOM）全目录无例外。

---

## P3 — 长期演进（登记在案，不承诺排期）

- **PRNG 注入化**：替代 12 处 `Math.random` 全局猴子补丁；`States.recreate()` 改用 `options.map.seed` 保证可复现。因测试与旧行为依赖该约定，需专项设计。
- **编辑器样板抽象**：20+ 个 editor/overview 文件共享 open→renderDialog→绑定→dialog 骨架；抽 `bind()` 辅助 + 对话框根事件委托。
- **CSP 收紧**：评估 `script-src` 去掉 `unsafe-inline`（`unsafe-eval` 因 goods 公式与 AI 运行时是 load-bearing，保留）。

---

## 风险与备注

- **每阶段独立分支 + 独立 PR**，避免大杂烩；P0 单独发 patch 版。
- P2 的 `ensureEl` 契约变更影响面最大（100+ 调用点），建议单独一个 PR 并配 codemod 式批量修改。
- 结构化重构不得改变 `.map` 序列化格式与 auto-update 迁移链行为；任何触及 `src/services/io/` 的改动需跑旧版本存档的加载回归。
- 审查中发现的其他低优先项（`parseMapVersion("")` 陷阱、`getBorderPath` 恒真条件、updater 重复提醒等）记录在案，随对应模块被触及时顺带清理，不单独排期。
