# P2 结构性还债 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地 spec P2 阶段的 4 项结构性修复：抽共享洪泛算法、收紧 ensureEl 假契约、cultures 生成器的 DOM 弹窗迁移到 controller、d3 `any` 集群类型化。同时关闭 P0 遗留的两行无回归锁代码（cultures-generator.ts:1174、states-generator.ts:656-660）。

**Architecture:** 允许接口调整（生成器内部、utils 导出），但不改 `.map` 序列化格式、不改 auto-update 迁移链。每步保持行为等价，测试先行。

**Tech Stack:** TypeScript strict、Vitest（jsdom）、d3（quadtree/hierarchy）、FlatQueue。

**Spec:** [docs/superpowers/specs/2026-10-06-code-quality-phased-optimization-design.md](../specs/2026-10-06-code-quality-phased-optimization-design.md)

## Global Constraints

- 沿用 P0/P1 规则：TDD（先失败测试）、`npx tsc --noEmit` + `node_modules/.bin/biome check src` + 全量 vitest 全绿才可提交、禁 `any`、`@/*` 别名、单行注释、conventional commits（本阶段多为 `refactor:` / `test:`）。
- **行为等价是硬约束**：洪泛收敛、`ensureEl` 收紧、弹窗迁移都不得改变生成结果或用户可见行为（除“错误更早更清晰地抛出”外）。
- 不改 `.map` 序列化格式；`src/services/io/` 不在本阶段范围内。
- 编辑器/生成器测试沿用既有 harness 风格（`globalThis.pack/grid` 注入 + `await import`）。
- 大规模批量修改（Task 2 的 ensureEl 调用点）可用 codemod 式脚本，但脚本必须在本任务提交前删除或作为 `scripts/` 正式工具保留——不留一次性脏文件。

---

### Task 1: 共享洪泛算法 `priorityFlood` 收敛三处 Dijkstra

**Files:**
- Create: `src/generators/flood.ts`（或 `src/utils/flood.ts`，按导入习惯——生成器专用就放 generators）
- Modify: `src/generators/cultures-generator.ts:1269-1359`、`src/generators/religions-generator.ts:1027-1115`（expandReligions + expandHeresies 两处）、`src/generators/states-generator.ts:371-436`
- Test: `src/generators/flood.test.ts`（新建）、三处生成器的既有测试

**Interfaces:**
- Consumes: 三处洪泛的共同点——FlatQueue 优先队列、`cells.c` 邻接、cost 数组、lock 过滤、maxExpansionCost 截断。
- Produces: 新导出 `priorityFlood<Ctx>(options)`，签名大致：

```ts
interface FloodOptions<Ctx> {
  seeds: { cell: number; ctx: Ctx }[];            // 初始种子（center + 携带上下文，如 cultureId / religionId / stateId+nativeBiome）
  neighbors: (cell: number) => readonly number[]; // 通常 cells.c[cell]
  edgeCost: (from: number, to: number, ctx: Ctx, priority: number) => number | null; // null = 不可通行（含 lock 过滤、类型过滤）
  assign?: (to: number, ctx: Ctx) => void;        // 赋值副作用（cells.culture[to] = ...）
  maxCost: number;                                 // 截断阈值
  initialCost?: number;                            // 种子初始 cost（religions/states 用 1，cultures 用 0）
}
export function priorityFlood<Ctx>(options: FloodOptions<Ctx>): void;
```

**设计说明**：三处洪泛的骨架完全一致（queue pop → 遍历邻居 → 过滤 → 算 cellCost → 截断 → cost 比较 → assign + push），差异只在 cost 计算与过滤条件。收敛后：
- cultures 的 cost 无下限问题（`!cost[n]` 在 totalCost=0 时永真）顺手修掉——共享实现用 `cost[to] === undefined || totalCost < cost[to]` 判断。
- religions 的 `routeById`（P1 已加）作为 `edgeCost` 闭包内的捕获传入。
- states 的 `cultureCost = -9`（负成本）通过 `edgeCost` 返回值表达，共享实现不做 `Math.max(..., 0)` 截断——由各 edgeCost 自行保证非负（states 现有 `Math.max(..., 0)` 保留在其 edgeCost 内）。

- [ ] **Step 1: 写 flood.ts 的失败测试**

新建 `src/generators/flood.test.ts`：用 3-5 格的线性图断言——(a) 种子被访问；(b) cost 累积正确；(c) `edgeCost` 返回 null 的边被跳过；(d) 超 maxCost 的被截断；(e) `assign` 被调用且参数正确；(f) totalCost=0 的格子不会被反复入队（防 cultures 现有的 0 成本 churn——用计数断言每个 cell 最多入队一次成本改进次数）。

- [ ] **Step 2: 运行确认失败**

Run: `node_modules/.bin/vitest run src/generators/flood.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 flood.ts 并迁移 cultures**

先实现 `priorityFlood`，再把 `Cultures.expand()`（cultures-generator.ts:1269-1359）改为调用它。`edgeCost` 闭包内组装现有的 getBiomeCost/getHeightCost/getRiverCost/getTypeCost + lock 过滤。`assign` 里做 `cells.pop[to] > 0` 判断 + `cells.culture[to] = cultureId`。

- [ ] **Step 4: 运行 cultures 测试确认无回归**

Run: `node_modules/.bin/vitest run src/generators/cultures-generator.test.ts src/generators/flood.test.ts`
Expected: PASS。cultures 生成结果应与迁移前一致（既有测试覆盖了生成路径）。

- [ ] **Step 5: 迁移 religions（expandReligions + expandHeresies）**

两处洪泛都改为 `priorityFlood`。`edgeCost` 内组装 cultureCost/stateCost/passageCost（routeById 在 flood 调用前构建一次，闭包捕获）。`assign` 里做 `cells.culture[nextCell]` 非空判断 + `religionIds[nextCell] = r`。注意 `expandHeresies` 的种子与过滤略有不同（heresy 类型），确认 edgeCost 表达。

- [ ] **Step 6: 运行 religions 测试确认无回归**

Run: `node_modules/.bin/vitest run src/generators/religions-generator.test.ts`
Expected: PASS。

- [ ] **Step 7: 迁移 states（expandStates）**

改为 `priorityFlood`。`edgeCost` 内组装 cultureCost/populationCost/biomeCost/heightCost/riverCost/typeCost + lock/capital 过滤。`assign` 里做 `cells.h[to] >= 20` 判断 + `cells.state[to] = s`。洪泛后的 `burgs.forEach(b => b.state = cells.state[b.cell])` 保留在 expandStates 内（flood 之外）。

- [ ] **Step 8: 全量回归**

Run: `node_modules/.bin/vitest run` + `npx tsc --noEmit` + `node_modules/.bin/biome check src`
Expected: 全绿。

- [ ] **Step 9: 提交**

```bash
git add src/generators/flood.ts src/generators/flood.test.ts src/generators/cultures-generator.ts src/generators/religions-generator.ts src/generators/states-generator.ts
git commit -m "refactor(generators): converge the three Dijkstra floods onto a shared priorityFlood"
```

---

### Task 2: 集成测试台——锁住 P0 遗留的两行

**Files:**
- Modify: `src/generators/cultures-generator.test.ts`、`src/generators/states-generator.test.ts`
- 依赖 Task 1 完成后的洪泛结构（测试经 `regenerate()`/`expand()` 驱动真实路径）

**Interfaces:**
- Consumes: P0 裁决遗留——`cultures-generator.ts:1174`（锁定文化坐标进 quadtree）与 `states-generator.ts:656-660`（空 rival 判空）目前只有镜像/文档测试。
- Produces: 两个集成测试，直接驱动 `regenerate()` 与战争声明路径，断言真实行为。

- [ ] **Step 1: cultures 集成测试**

构造含一个锁定文化（`lock: true, center: 已知 cell`）的 mock pack，运行 `Cultures.regenerate()`（或 `generate()` + `expand()`），断言没有再生成的文化中心落在锁定中心的间距半径内（用 quadtree.find 或直接坐标比较）。这会真实经过 1174 行。

- [ ] **Step 2: states 战争声明集成测试**

构造一个 attacker 的全部 rival 都是第三方 vassal 的 mock states，驱动战争声明循环（`declareWars` 或包含它的最小入口），断言不抛错且不产生战争。这会真实经过 656-660 行的判空分支。

- [ ] **Step 3: 运行确认通过 + 全量回归**

Run: `node_modules/.bin/vitest run src/generators/`
Expected: PASS。

- [ ] **Step 4: 提交**

```bash
git add src/generators/cultures-generator.test.ts src/generators/states-generator.test.ts
git commit -m "test(generators): integration-lock the two P0 lines the mirror tests could not reach"
```

---

### Task 3: `ensureEl` 契约收紧（throw 化）

**Files:**
- Modify: `src/utils/nodeUtils.ts:8-16`（ensureEl）
- Modify: 134 个文件中的所有调用点（用 codemod 批量处理 + 人工复核少数特殊情况）
- Test: `src/utils/nodeUtils.test.ts`（新建或追加）

**Interfaces:**
- Consumes: `ensureEl<T>(id)` 当前返回 `el as unknown as T`（元素缺失时返回 null 但类型标 T）。
- Produces: `ensureEl` 改为元素缺失时 `throw new Error(...)`；`findEl`（返回 `T | null`）已存在，供确实需要可空语义的调用点迁移。

**设计说明**：这是全阶段影响面最大的改动（134 文件）。策略：
1. 先把 `ensureEl` 改为 throw（源码里 TODO 已指明这是意图）。
2. 跑全量测试 + 类型检查，收集所有因 throw 暴露的调用点问题（`if (!ensureEl(...)) return;` 这类死检查）。
3. 用 codemod 批量删除死检查（`if (!ensureEl("x")) return;` → `ensureEl("x");`），人工复核其余。
4. 少数确实需要“元素可能不存在”语义的调用点改用 `findEl`。

- [ ] **Step 1: 写 ensureEl 的失败测试**

```ts
// nodeUtils.test.ts
describe("ensureEl", () => {
  it("returns the element when present", () => { /* append div#foo, expect ensureEl("foo") toBe it */ });
  it("throws when absent", () => { expect(() => ensureEl("missing")).toThrow('Element with id "missing" not found'); });
});
```

- [ ] **Step 2: 运行确认失败**（当前 ensureEl 不 throw）→ 实现 throw。

- [ ] **Step 3: 全量扫描暴露的调用点**

Run: `npx tsc --noEmit && node_modules/.bin/vitest run`——收集失败清单。用 grep 找出死检查模式：`grep -rn "if (!ensureEl" src`。

- [ ] **Step 4: codemod 批量处理死检查 + 人工复核**

写一次性脚本（或用 sed/jscodeshift）把 `if (!ensureEl("x")) return;` 改为 `ensureEl("x");`；把确实可空的改为 `findEl`。人工复核 diff 中每一处非常规用法。脚本用完即删或归档 `scripts/`。

- [ ] **Step 5: 全量回归**

Run: `npx tsc --noEmit && node_modules/.bin/biome check src && node_modules/.bin/vitest run`
Expected: 全绿。

- [ ] **Step 6: 提交**

```bash
git add src/utils/nodeUtils.ts src/utils/nodeUtils.test.ts <所有触及的调用点文件>
git commit -m "refactor(utils): make ensureEl throw on missing element; migrate nullable call sites to findEl"
```

---

### Task 4: cultures 生成器的 DOM 弹窗迁移到 controller

**Files:**
- Modify: `src/generators/cultures-generator.ts:1055-1090`（两处 `alertMessage.innerHTML` + `$("#alert").dialog(...)`）
- Modify: 弹窗的呈现方——`Cultures.generate()` 的两个 pipeline 调用点（`src/generators/generation-pipeline.ts:28,75`）或 `regenerate()` 的 controller 调用链
- Test: `src/generators/cultures-generator.test.ts`（断言返回的 warning/error 而非 DOM）

**Interfaces:**
- Consumes: cultures `generate()` 在 populated cells 不足时直接操作 DOM 弹窗（全目录唯一违反“生成器不触 DOM”的地方）。
- Produces: `generate()` 改为返回 `{ warning?: string; error?: string }`（对齐 `States.recreate()` 在 states-generator.ts:194-197 的模式）；DOM 呈现移到 pipeline/controller 层。

**设计说明**：`States.recreate()` 的正确模式是返回 `{warning, error}` 由调用方呈现。`Cultures.generate()` 的两个调用点都在 `generation-pipeline.ts`——需要确认 pipeline 如何向上冒泡 warning（pipeline.ts:24-39 目前只在 catch 里包错误）。若 pipeline 不支持 warning 冒泡，则在 `generation-pipeline.ts` 的 cultures 步骤包一层：调用 `Cultures.generate()` 拿返回值，有 warning/error 时用 `alertMessage`/`tip` 呈现（这一层是允许触 DOM 的）。

- [ ] **Step 1: 写失败测试**

断言极端气候（populated cells 不足）时 `generate()` 返回 `{ warning: ... }` 而非操作 DOM；spy `$("#alert")` 断言未被调用（或断言 document 中无新 dialog）。

- [ ] **Step 2: 实现——generate() 返回消息对象，pipeline 步骤呈现**

`cultures-generator.ts` 的两处弹窗逻辑改为 `return { warning: "..." }`；`generation-pipeline.ts` 的 cultures 步骤改为：

```ts
{ id: "cultures", run: () => {
  const result = Cultures.generate();
  if (result?.warning || result?.error) {
    // 在这一层呈现（pipeline 是应用壳层，允许触 DOM）
    alertMessage.innerHTML = result.error ?? result.warning!;
    $("#alert").dialog({ resizable: false, title: "Extreme climate warning", buttons: { Ok: function () { $(this).dialog("close"); } } });
  }
}}
```

（`regenerate()` 内部调用 `this.generate()` 的地方（1495 行）同样处理返回值。）

- [ ] **Step 3: 运行确认通过 + 全量回归**

Run: `node_modules/.bin/vitest run src/generators/cultures-generator.test.ts` + 全量
Expected: PASS。

- [ ] **Step 4: 提交**

```bash
git add src/generators/cultures-generator.ts src/generators/generation-pipeline.ts src/generators/cultures-generator.test.ts
git commit -m "refactor(cultures): return warnings from generate() instead of driving the DOM"
```

---

### Task 5: burgs-overview d3 图表 `any` 集群类型化

**Files:**
- Modify: `src/controllers/burgs-overview.ts:490-570`（showBurgsChart）、`:624-658`（updateChart 内嵌拷贝）
- Test: `src/controllers/burgs-overview.test.ts`（追加，若图表可测；否则以 tsc 收紧为门禁）

**Interfaces:**
- Consumes: d3 `stratify`/`packLayout` 的 `any` 集群（`(stratify() as any)`、`.parentId((d: any) => ...)`、全部 `.attr(..., (d: any) => ...)`）。
- Produces: 定义 `ChartDatum` 判别联合（state / province / burg 三种节点），用 `stratify<ChartDatum>()` 原生泛型去掉 cast；顺带把 `updateChart` 的数据构建与 `showBurgsChart` 共享（消除两份拷贝）。

**设计说明**：当前图表有 `{ id, state, color, name }`（states）与 `{ id, i, state, culture, province, parent, name, population, capital, x, y }`（burgs）两种形状被 `concat` 进 `any[]`。手写 id 重映射 `b.i + states.length - 1` 依赖“states 数组含哨兵 0 号”的脆弱约定。类型化后这些不变量由 `ChartDatum` 表达。

- [ ] **Step 1: 定义 ChartDatum 类型 + 类型化 stratify**

在 burgs-overview.ts（或抽 `burgs-chart.ts` 若文件过大）定义：

```ts
type ChartDatum =
  | { kind: "state"; id: string; parentId: string | null; color: string; name: string }
  | { kind: "burg"; id: string; parentId: string; name: string; population: number; capital: number; x: number; y: number; i: number };
```

（id 用字符串避免数字重映射冲突：`state-3` / `burg-17` / `province-5`，`stratify<ChartDatum>().id(d => d.id).parentId(d => d.parentId)`。）去掉全部 `as any` / `(d: any)`。

- [ ] **Step 2: 消除 updateChart 的重复数据构建**

`showBurgsChart` 与内嵌 `updateChart` 是同一逻辑的两份拷贝——把数据构建提为共享函数 `buildChartData(groupBy: string): ChartDatum[]`，两处调用。

- [ ] **Step 3: 验证**

Run: `npx tsc --noEmit`（类型收紧后主门禁）+ `node_modules/.bin/biome check src/controllers` + `node_modules/.bin/vitest run src/controllers/burgs-overview.test.ts`
Expected: 干净。若图表行为可测（jsdom + d3），加一个渲染 smoke 测试；否则以类型正确 + 既有测试不回归为准。

- [ ] **Step 4: 提交**

```bash
git add src/controllers/burgs-overview.ts src/controllers/burgs-overview.test.ts
git commit -m "refactor(burgs): type the hierarchy chart data; deduplicate chart data building"
```

---

### Task 6: 编辑器事件处理器 `any` 收紧

**Files:**
- Modify: `src/controllers/` 下 45 处 `event: any` / `(event: any)` / `(ev: any)`（burg-editor.ts:709、heightmap-editor.ts:439/1158/1216、burgs-overview.ts:573-575/591 等）
- Test: 无新增（类型收紧由 tsc 门禁；既有测试不回归为准）

**Interfaces:**
- Consumes: d3 回调（`.on("click", (event, d) => ...)`，event 实为 `PointerEvent`/`MouseEvent`）与 jQuery UI 回调（`this: HTMLElement` 的 DOM 事件）。
- Produces: 事件参数类型化（`PointerEvent`、`MouseEvent`、或 d3 的具体事件类型）；`this` 上下文用既有 `this: SVGGElement` 风格保持。

**设计说明**：d3 v7 的 `.on()` 回调事件类型是 `any` 由 d3 类型定义的历史遗留；项目里 `burg-editor.ts:709` 这类函数式回调可直接标 `event: PointerEvent`（d3 click 实际派发的就是 PointerEvent）。策略：逐文件把 `event: any` 换成具体 DOM 事件类型；d3 链式回调里 datum 参数的类型化已在 Task 5 覆盖 burgs-overview，本任务只管 event 参数。

- [ ] **Step 1: 列出全部 45 处并分类**

Run: `grep -rn "event: any\|(event: any)\|(ev: any)" src/controllers --include="*.ts" | grep -v test`——分为 d3 `.on()` 回调（event 是 PointerEvent/MouseEvent）与 jQuery/DOM 事件处理器两类。

- [ ] **Step 2: 逐文件收紧**

每处把 `event: any` 改为具体类型（多数为 `PointerEvent`；拖拽相关可能是 d3 的 `D3DragEvent`）。遇到事件体上访问了非标准属性的（如 `event.somethingCustom`），核对实际派发源再定类型，不硬塞。

- [ ] **Step 3: 验证**

Run: `npx tsc --noEmit` + `node_modules/.bin/biome check src/controllers` + `node_modules/.bin/vitest run src/controllers`
Expected: 干净；无回归。

- [ ] **Step 4: 提交**

```bash
git add src/controllers/
git commit -m "refactor(controllers): type editor event handlers instead of any"
```

---

## 完成判定（P2 收口）

- [ ] 6 个任务全部提交，conventional commits
- [ ] 三处洪泛收敛到 `priorityFlood`，且 cultures 的 0 成本 churn 顺手修掉
- [ ] P0 遗留两行（cultures:1174、states:656-660）有集成测试锁
- [ ] `ensureEl` 缺失即 throw；134 个调用点无死检查残留
- [ ] 生成器目录无任何 DOM/SVG 操作（架构规则全目录无例外）
- [ ] burgs-overview 图表无 `any` cast；编辑器事件处理器无 `event: any`
- [ ] `npx tsc --noEmit` + `node_modules/.bin/biome check src` + `node_modules/.bin/vitest run` 全绿
- [ ] 生成结果与重构前一致（既有生成器测试套件全绿即证据）
