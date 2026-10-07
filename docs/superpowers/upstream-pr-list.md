# 可提上游的 PR 清单（备用）

来源：`kenyonxu/Fantasy-Map-Generator` master 领先 `Azgaar/Fantasy-Map-Generator` master（merge-base `354eeaa7`）的 60 个提交。按可独立评审/合并的单元分组，按“对上游价值优先”排序。

每个 PR 条目：标题（英文，上游通用）、动机、包含的提交、依赖关系、上游注意事项。

---

## PR 1: fix(load): clear culture (not province) when repairing invalid culture refs

**动机**：加载时“修复无效文化”分支把 `cells.culture[i] = 0` 误写成 `cells.province[i] = 0`——既漏修了无效文化，又清空了这些单元格合法的省份归属。加载即静默损坏地图数据。这是一个真实的数据损坏 bug，对上游用户直接可见。

**包含提交**：`48a823ce`

**依赖**：无。

**上游注意事项**：附带回归测试（`src/services/io/load-integrity.test.ts`）。`repairInvalidCultures` 从 `parseLoadedData` 内联块提取为 `Load` 的导出函数以便测试——零行为变更之外的最小接口变动。

**评审要点**：单行修复（load.ts:448）；测试锁真实实现。

---

## PR 2: fix(states): skip war declaration when all rivals are vassals

**动机**：外交模拟中，若某 attacker 的所有 rival 都是第三方 vassal，`ra([])` 返回 `undefined`，随后 `states[defender].name` 抛 TypeError。可在合理的外交配置下复现（编辑/旧存档）。

**包含提交**：`3ecf73f2`

**依赖**：无。

**上游注意事项**：附带测试。注：后续发现该配置从 `generateDiplomacy` 自身的关系循环不可达（只在手工编辑的存档上可达）——防御性修复，仍值得合。

**评审要点**：一行判空 `continue`。

---

## PR 3: fix(rivers): reset smallLength per map and stop treating cell 0 as a sentinel

**动机**：两个河流 bug：(a) `smallLength`（大小河流分类阈值）在模块单例上只算一次，同会话第二张地图沿用旧阈值——River/Creek/Brook 类型静默错误；(b) `while (cell)` 把合法索引 0 当终止哨兵，从/经 cell 0 的河流被截断或产生 undefined source/mouth。

**包含提交**：`dccaf87a`

**依赖**：无。

**上游注意事项**：附带测试（`addDownhill(0)` 直调验证 cell 0 被认领）。

**评审要点**：两行修复（重置 + 显式停止条件）。

---

## PR 4: fix(cultures): register locked culture centers by coordinates in the spacing quadtree

**动机**：`cultures-generator.ts:1174` 把 cell id 数字传给 d3 quadtree（默认访问器取 `d[0]` 得 NaN），点被静默丢弃——重新生成的文化可与锁定文化重叠。

**包含提交**：`665df150`

**依赖**：无。

**上游注意事项**：附带测试（镜像式，见说明）。一行修复（传坐标而非 id）。

**评审要点**：一行修复；该行的集成测试锁在 P2 阶段（PR 11）补上。

---

## PR 5: test(icons): normalize path separators so the suite passes on Windows

**动机**：`icon-sets.test.ts` 的 `directory()` 用 `readdirSync` 读出的路径在 Windows 是反斜杠，与 `import.meta.glob` 的正斜杠键不匹配——2 个断言在 Windows 失败（CI/Linux 绿）。

**包含提交**：`561b7a5a`

**依赖**：无。

**上游注意事项**：纯测试修复，Windows 开发者体验。

**评审要点**：一行归一化。

---

## PR 6: fix(scripts): stop treating arrow-function => as a closing bracket in context extraction

**动机**：`generate-assistant-context.mjs` 的括号深度计数把 `=>` 的 `>` 当闭括号，箭头函数声明之后整个文件被吞进 AI 上下文——`--check` 测试只会锁定这个错误输出，发现不了。

**包含提交**：`63097214`、`68cadd27`（后者把脚本改为仅直接执行时运行，防测试 import 副作用）

**依赖**：无。

**上游注意事项**：AI 助手上下文生成脚本的正确性修复。

**评审要点**：括号计数器加 `prev === "="` 守卫；main-module guard。

---

## PR 7: fix(security): escape entity names and uploads in overviews; quote CSV fields

**动机**：实体名称（burg/state/province/culture 名）只 trim 不转义即拼 innerHTML——`.map` 文件可分享，构成存储型 XSS。CSV 导出字段不包引号，名称含逗号即错位。覆盖 6 个 overview（burgs/rivers/routes/diplomacy/regiments/military）。

**包含提交**：`c68a5b83`、`f2165b4f`

**依赖**：无。

**上游注意事项**：这是安全修复，对上游用户直接有价值。统一用项目已有的 `escapeHtml`/`toCsvField`。

**评审要点**：多点同模式修复；上传内容也转义。

---

## PR 8: perf(goods,religions,load): compile once, cache routes, single-concat gzip

**动机**：三个性能修复：(a) goods 分布公式在 cell×good 双层循环里反复 `new Function` 编译（10 万格地图数万次）；(b) 宗教洪泛每条边线性扫 `pack.routes.find`（O(E×R)）；(c) gzip 解压 `concat(Array.from(chunk))` 逐块重建数组（O(n²)）。

**包含提交**：`94aee1da`、`55b42847`、`2f5f835b`

**依赖**：无。

**上游注意事项**：大地图（≥5 万格）生成/加载耗时可测地下降。每项附带测试/基准。

**评审要点**：三个独立的性能优化打包；行为不变。

---

## PR 9: fix(3d,electron,assistant): failure handling and security hardening

**动机**：四处健壮性/安全修复：(a) 3D 视图纹理光栅化/脚本加载失败不再挂起或崩溃（补 `onerror` + 用户提示）；(b) electron updater 四处 `.then` 补 `.catch`（窗口销毁即 unhandled rejection）+ 打包版忽略 `VITE_DEV_SERVER_URL`；(c) AI 读图脚本会话级确认（防提示注入→密钥窃取）+ 断开时清全部 provider key。

**包含提交**：`22d78634`、`0e1bfbd1`、`1bd4a931`、`2a5c0d3e`、`9906d7fc`

**依赖**：无。

**上游注意事项**：AI 助手的确认门槛是安全修复；`confirmationDialog` 加了可选 `onClose`（37 个既有调用方不受影响）。

**评审要点**：三处独立修复打包；AI 部分含工具描述诚实化。

---

## PR 10: refactor(generators): converge the three Dijkstra floods onto a shared priorityFlood

**动机**：cultures/religions/states 三处手抄的 Dijkstra 洪泛已发散且各自带坑（cultures 的 cost 无下限导致 0 成本格反复入队）。抽共享 `priorityFlood`（`src/generators/flood.ts`），各生成器只供 cost 表。

**包含提交**：`ea39c3ae`

**依赖**：无（但行为等价经三次独立验证）。

**上游注意事项**：行为等价是硬约束——RNG 流/并列打破/过滤顺序逐行比对一致；cultures 的 0 成本 churn 顺手修掉（生产中不可达，纯加固）。

**评审要点**：新共享抽象 + 三处迁移；8 个 flood 单测。

---

## PR 11: test(generators): golden-lock the three floods and the two P0 lines

**动机**：给三处洪泛加固定种子黄金输出测试；给 P0 的两行（cultures:1174 quadtree、states:656-660 空 rival 判空）补集成测试锁（这两行此前只有镜像/文档测试）。

**包含提交**：`5d11a3ea`

**依赖**：PR 10（洪泛收敛）。

**上游注意事项**：黄金值经独立手算复现；破坏检查（暂时回退修复→测试失败→恢复）验证通过。

**评审要点**：测试基础设施；锁真实生产路径。

---

## PR 12: refactor(utils): make ensureEl throw on missing element; migrate nullable call sites to findEl

**动机**：`ensureEl` 元素缺失时返回 `null` 但类型标 `T`（假契约），100+ 调用点在远离根因处抛 TypeError。改为缺失即 throw；可空语义迁移到 `findEl`。

**包含提交**：`480a7312`

**依赖**：无。

**上游注意事项**：实际影响面远小于预估（134 文件中仅 4 个需改动：15 处可空探测迁 `findEl`，1 处死检查移除）。

**评审要点**：契约收紧；死检查清理。

---

## PR 13: refactor(cultures,pipeline): return warnings from generate() instead of driving the DOM

**动机**：`cultures-generator.ts` 是全目录唯一在生成器里直接操作 jQuery UI 弹窗的地方（违反“生成器不触 DOM”）。改为返回 `{warning, error}`，呈现移到 pipeline/lifecycle 层（对齐 `States.recreate()` 模式）。

**包含提交**：`00010fb9`、`deaaa37c`

**依赖**：无。

**上游注意事项**：架构合规修复；`src/generators/` 目录现在零 DOM 操作。

**评审要点**：生成器/呈现分层；pipeline 呈现 UX 与原来一致。

---

## PR 14: refactor(controllers): type hierarchy chart, editor datums, and event handlers

**动机**：controllers 目录的 `any` 清零——图表 `ChartDatum` 判别联合 + `stratify<ChartDatum>()` 去 cast、编辑器 datum 类型化、事件处理器 `event: any` 收紧为具体类型。共 145 处 `any` 清除。

**包含提交**：`4bedba60`、`1aca2974`、`671c41b7`、`7bf1a079`、`1816dde7`

**依赖**：无。

**上游注意事项**：类型安全提升，无行为变更； burgs-overview 图表数据构建去重（消除两份拷贝）。

**评审要点**：纯类型化；`stratify<ChartDatum>()` 判别联合。

---

## PR 15: fix(states): make manual regenerate deterministic by seeding from options.map.seed

**动机**：手动“重新生成国家”时 `States.recreate()` 用新鲜随机种子，同一地图每次再生成结果都不同——不可复现。改用 `options.map.seed`。

**包含提交**：`83f05d3d`

**依赖**：无。

**上游注意事项**：用户可感知的行为修复（同种子再生成可复现）。

**评审要点**：一行修复 + 确定性回归测试。

---

## PR 16: feat(utils): add makeRandom factory producing a seed-bound RandomKit

**动机**：PRNG 注入化的基础设施——`makeRandom(seed)` 返回绑定到调用方 Alea 实例的 `RandomKit`（next/rand/P/Pint/ra/rw/gauss/biased），助手逻辑与 `probabilityUtils` 逐字节等价。

**包含提交**：`b47c5021`

**依赖**：无。

**上游注意事项**：这是后续 PR 17 的前置；单独可评审（工厂 + 8 个助手的等价测试）。

**评审要点**：工厂设计；8 个助手与 probabilityUtils 的位级等价测试。

---

## PR 17: refactor(generators): inject RandomKit into all generators

**动机**：PRNG 注入化主体——把 12 处 `Math.random = Alea(...)` 写点与 63 处读点迁移到各生成器自己的 `RandomKit` 实例，消除全局 `Math.random` 猴子补丁。每个生成器的随机性来源显式化、可独立测试、可 Worker 化。

**包含提交**：`c3cf7ad5`、`44d587b2`、`4406a7df`、`1e09a2f1`、`8f46bc8b`、`77ccb30c`、`749bad74`、`3f5e09c0`、`4c01493f`、`03017b14`

**依赖**：PR 16（makeRandom 工厂）。

**上游注意事项**：**这是最大的一个 PR**，且**改变同一 seed 的全图输出**（spec 已诚实记录完整偏移集）。对上游来说这是行为变更，需要明确沟通“同一 seed 的地图与迁移前不同，但迁移后是确定性的”。黄金测试锁住每个生成器的行为。

**评审要点**：逐生成器黄金测试；行为等价证据；spec 的已知变化清单。

---

## PR 18: refactor(rivers): thread RandomKit through specify; drop provinces' last global write

**动机**：删除最后一个生成器全局写点（`provinces-generator.ts:89`）——`Rivers.specify(R?)` 线程化后，它失去唯一消费者。`src/generators/` 目录零全局写点。

**包含提交**：`03017b14`

**依赖**：PR 17。

**上游注意事项**：河流类型/名字变为 provinces-kit 驱动（同种子确定性，值与迁移前不同——与 PR 17 同类偏移）。

**评审要点**：最后一个全局写点的删除；Rivers.specify 的 kit 线程化。

---

## 提交策略建议

**独立可合（无依赖，对上游价值直接）**：PR 1-9（bug 修复 + 性能 + 安全）——这些是“纯收益”，上游最容易接受。

**有依赖关系**：PR 10→11（洪泛收敛→黄金测试）、PR 16→17→18（PRNG 工厂→注入→删写点）。

**需要单独沟通的**：PR 17（PRNG 注入）是行为变更（同一 seed 全图不同），上游可能需要讨论是否接受“以行为变化换架构干净”。

**可以打包的**：PR 1-6（小 bug 修复）可以合成一个“bug fixes”PR；PR 12-14（结构重构）可以合成一个“refactoring”PR。

**上游可能不接受的**：PR 17/18 的行为变更。如果上游犹豫，PR 1-16 都可以独立落地。
