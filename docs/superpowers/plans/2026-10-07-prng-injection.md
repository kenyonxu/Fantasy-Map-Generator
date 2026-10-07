# PRNG 注入化（generators 阶段）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `src/generators/` 的 12 处 `Math.random = Alea(...)` 写点与 63 处读点迁移到各生成器自己的 `RandomKit` 实例，消除全局 `Math.random` 猴子补丁，保持生成输出逐字节一致（features Erase 模式除外，见 spec 已知变化）。

**Architecture:** 方案 B 助手工厂化——新建 `src/utils/random.ts` 导出 `makeRandom(seed)`，返回绑定到调用方 Alea 实例的 `RandomKit`。每个生成器入口 `const R = makeRandom(seed)`，内部所有随机经 `R.*`。`probabilityUtils` 全局导出不动（controllers 仍用）。

**Tech Stack:** TypeScript strict、Vitest（jsdom）、Alea（已依赖）、d3 randomNormal。

**Spec:** [docs/superpowers/specs/2026-10-07-prng-injection-design.md](../specs/2026-10-07-prng-injection-design.md)

## Global Constraints

- **行为等价硬约束**：同一 `options.map.seed` 在迁移前后生成输出逐字节一致（唯一例外：features-generator Erase 模式，见 Task 9 裁决）。
- 每个生成器迁移前先写“固定种子 → 固定输出”黄金测试，迁移后**不改断言**地通过。
- TDD；每任务完成后 `npx tsc --noEmit` + `node_modules/.bin/biome check src` + 受影响测试全绿才可提交。
- 禁 `any`；双引号分号；单行注释；conventional commits（本阶段 `refactor:` / `test:`）。
- `probabilityUtils.ts` 的全局导出签名（`rand/P/gauss/Pint/ra/rw/biased/each/getNumberInRange/generateSeed`）**本阶段不动**。
- 不改 controllers/components 的 5 处 `Math.random = Alea(...)`；不改 `options.map.seed` 类型/语义。
- Alea 导入方式：`import Alea from "alea"`（既有用法，见 river-generator.ts:1）。

---

### Task 1: `makeRandom` 工厂与 `RandomKit`

**Files:**
- Create: `src/utils/random.ts`
- Test: `src/utils/random.test.ts`（新建）

**Interfaces:**
- Consumes: `Alea`（`import Alea from "alea"`）、`randomNormal`（d3）、`minmax/rn`（`./numberUtils`）。
- Produces: 后续所有任务依赖——

```ts
export interface RandomKit {
  next(): number;
  rand(min?: number, max?: number): number;
  P(probability: number): boolean;
  Pint(float: number): number;
  ra<T>(array: ArrayLike<T>): T;
  rw(object: Record<string, number>): string;
  gauss(expected?: number, deviation?: number, min?: number, max?: number, round?: number): number;
  biased(min: number, max: number, ex: number): number;
}
export function makeRandom(seed: string | number): RandomKit;
```

- [ ] **Step 1: 写失败测试**

新建 `src/utils/random.test.ts`。每个助手一组断言——(a) 确定性：同种子两次调用序列一致；(b) 语义：与 `probabilityUtils` 对应全局函数在同种子下产出相同序列（`rand(1,10)`、`P(0.5)`、`ra([..])`、`rw({a:1,b:3})`、`gauss(100,30)`、`biased(0,10,2)`、`Pint(2.5)`）；(c) 隔离：两个 `makeRandom` 实例互不干扰。

```ts
import { describe, expect, it } from "vitest";
import { makeRandom } from "./random";
import * as prob from "./probabilityUtils";

describe("makeRandom", () => {
  it("is deterministic for the same seed", () => {
    const a = makeRandom("s"), b = makeRandom("s");
    expect([a.next(), a.next()]).toEqual([b.next(), b.next()]);
  });

  it("matches probabilityUtils globals for the same seed", () => {
    // seed both the global Math.random and the kit identically, compare sequences
  });

  it("instances are isolated", () => { /* two kits don't share state */ });
  it("throws on empty/undefined seed", () => { /* @ts-expect-error */ expect(() => makeRandom("")).toThrow(); });
});
```

（“matches globals”测试用 `Math.random = (await import("alea")).default(seed)` 驱动全局，与 `makeRandom(seed)` 并行比对序列。）

- [ ] **Step 2: 运行确认失败**

Run: `node_modules/.bin/vitest run src/utils/random.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现工厂**

`src/utils/random.ts`：用 `Alea(seed)` 建 `next`，每个助手是 `probabilityUtils.ts` 对应函数的闭包绑定版（逻辑逐字复用，`Math.random()` → `next()`）。空种子/`undefined` 抛 `Error("makeRandom requires a non-empty seed")`。

- [ ] **Step 4: 运行确认通过**

Run: `node_modules/.bin/vitest run src/utils/random.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/utils/random.ts src/utils/random.test.ts
git commit -m "feat(utils): add makeRandom factory producing a seed-bound RandomKit"
```

---

### Task 2: 低风险生成器——ice / precipitation / grid

**Files:**
- Modify: `src/generators/ice-generator.ts:39`、`src/generators/precipitation-generator.ts:34`、`src/generators/grid-generator.ts:20`
- Test: 三文件的黄金测试（追加到各自 `.test.ts`，无则新建）

**Interfaces:**
- Consumes: `makeRandom`（Task 1）。
- Produces: 三生成器入口改为 `const R = makeRandom(options.map.seed)`（grid 用其 `seed` 参数），内部随机经 `R.*`。

- [ ] **Step 1: 先写黄金测试（迁移前）**

对每生成器：固定 `options.map.seed` + 最小可行 mock pack/grid，跑 `generate()`，快照关键输出（ice 的冰层数组、precipitation 的 `grid.cells.prec`、grid 的 `grid.cells` 结构指纹）。**确认迁移前通过**。

- [ ] **Step 2: 迁移 ice-generator**

删 `:39` 的 `Math.random = Alea(...)`，入口 `const R = makeRandom(options.map.seed)`，内部随机 → `R.*`。跑黄金测试（断言不变）。

- [ ] **Step 3: 迁移 precipitation-generator**

同上（`:34`）。

- [ ] **Step 4: 迁移 grid-generator**

同上（`:20`，种子来自 `generate(seed, ...)` 参数）。

- [ ] **Step 5: 全量回归**

Run: `npx tsc --noEmit` + `node_modules/.bin/biome check src/generators` + `node_modules/.bin/vitest run src/generators`
Expected: 全绿；黄金断言不变。

- [ ] **Step 6: 提交**

```bash
git add src/generators/ice-generator.ts src/generators/precipitation-generator.ts src/generators/grid-generator.ts src/generators/*.test.ts
git commit -m "refactor(generators): inject RandomKit into ice, precipitation and grid generators"
```

---

### Task 3: 中风险第一批——river / features（含 Erase 裁决）

**Files:**
- Modify: `src/generators/river-generator.ts:190`、`src/generators/features-generator.ts:109,517`
- Test: 各自黄金测试

**Interfaces:**
- Consumes: `makeRandom`。
- Produces: 两生成器注入 `R`；features 的 Erase 模式新行为固定为黄金。

- [ ] **Step 1: 黄金测试（迁移前）**

river：固定种子 + mock pack（复用 P2 的河流 fixture），快照 `cells.r`/`pack.rivers`。features：固定种子 + mock，快照 `pack.features`。**注意：features 的黄金在迁移前记录 Erase 模式当前行为；迁移后允许变化，固定新行为并注释。**

- [ ] **Step 2: 迁移 river-generator**

删 `:190`，入口 `const R = makeRandom(options.map.seed)`，`rw(...)` 等 → `R.*`（注意 P2 已改的 `while (cell >= 0)` 不受影响）。跑黄金。

- [ ] **Step 3: 迁移 features-generator（Erase 裁决）**

删 `:109` 与 `:517`。`:109` 的注释“heightmap edit in Erase mode 时保持同结果”是与编辑器共用全局序列的隐式契约——注入化后该契约消失。**裁决（spec 已批准）**：Erase 模式结果可能与迁移前不同，可接受。固定新行为为黄金并在测试注释说明。

- [ ] **Step 4: 全量回归 + 提交**

```bash
git add src/generators/river-generator.ts src/generators/features-generator.ts src/generators/*.test.ts
git commit -m "refactor(generators): inject RandomKit into river and features generators"
```

---

### Task 4: 中风险第二批——goods / markets / provinces / routes / heightmap

**Files:**
- Modify: `src/generators/goods-generator.ts:987`、`src/generators/markets-generator.ts:45`、`src/generators/provinces-generator.ts:86`、`src/generators/routes-generator.ts:218`、`src/generators/heightmap-generator.ts:558`
- Test: 各自黄金测试

**Interfaces:**
- Consumes: `makeRandom`。
- Produces: 五生成器注入 `R`（goods 用 `config.randomSeed ?? options.map.seed`，provinces 用 `localSeed`，routes 用 `randomSeed ?? options.map.seed`）。

- [ ] **Step 1: 黄金测试（迁移前）**

分别为五生成器固定种子 + mock，快照关键输出（goods 的 `cells.good`、markets 的 `pack.markets`、provinces 的 `cells.province`、routes 的 `pack.routes`、heightmap 的 `grid.cells.h`）。确认迁移前通过。

- [ ] **Step 2-6: 逐一迁移**

每生成器删写点、入口 `const R = makeRandom(...)`（用各自种子表达式）、内部随机 → `R.*`、跑黄金。每完成一个跑其测试。

- [ ] **Step 7: 全量回归 + 提交**

```bash
git add src/generators/goods-generator.ts src/generators/markets-generator.ts src/generators/provinces-generator.ts src/generators/routes-generator.ts src/generators/heightmap-generator.ts src/generators/*.test.ts
git commit -m "refactor(generators): inject RandomKit into goods, markets, provinces, routes and heightmap generators"
```

---

### Task 5: names-generator——公开方法接受 R

**Files:**
- Modify: `src/generators/names-generator.ts`（公开方法 `getBase/getCulture/getCultureShort/getBaseShort/getState/getMapName/getEra` 加 `R: RandomKit` 参数）
- Test: `src/generators/names-generator.test.ts`（黄金 + 契约）

**Interfaces:**
- Consumes: `makeRandom`、`RandomKit`（Task 1）。
- Produces: Names 公开方法签名变为 `method(..., R: RandomKit)`——**破坏性签名变更**，调用方（Task 6 的高风险生成器）必须传 `R`。内部 `ra(...)` → `R.ra(...)`、`P(...)` → `R.P(...)`、`rand(...)` → `R.rand(...)`、`Math.random()` → `R.next()`。

- [ ] **Step 1: 黄金测试（迁移前）**

固定种子，快照 `Names.getCulture(1)`、`Names.getState("Test", 1)` 等的序列。确认迁移前通过。

- [ ] **Step 2: 改签名 + 注入**

Names 公开方法加 `R: RandomKit` 末位参数（无可选默认——强制调用方传，编译器会抓漏点）。内部随机全换 `R.*`。**此时编译会报所有调用方错误——这是预期的，Task 6 修。**

- [ ] **Step 3: 临时兼容（可选）**

若想让本任务独立可提交：给 `R` 参数加默认 `= makeRandom(options.map.seed)`？**不**——那会破坏序列保真。正确做法是本任务与 Task 6 一起提交，或本任务先把 Names 改好、在 Task 6 统一修调用方后一次性提交。**采用后者：Task 5+6 合并为一个提交。**

- [ ] **Step 4: 提交（与 Task 6 合并）**

见 Task 6 Step 4。

---

### Task 6: 高风险生成器——states / cultures / burgs / religions / markers（含 Names 传递）

**Files:**
- Modify: `src/generators/states-generator.ts:192`、`src/generators/cultures-generator.ts`、`src/generators/burgs-generator.ts`、`src/generators/religions-generator.ts`、`src/generators/markers-generator.ts`，及它们对 `Names.*` 的调用点
- Test: 各自黄金测试

**Interfaces:**
- Consumes: `makeRandom`、`RandomKit`、Task 5 的 Names 新签名。
- Produces: 五生成器入口 `const R = makeRandom(options.map.seed)`，内部随机 → `R.*`，对 `Names.*` 的调用传入 `R`。

- [ ] **Step 1: 黄金测试（迁移前）**

分别为五生成器固定种子 + mock，快照关键输出（states 的 `cells.state`+`pack.states`、cultures 的 `cells.culture`、burgs 的 `pack.burgs`、religions 的 `cells.religion`、markers 的 `pack.markers`）。确认迁移前通过。

- [ ] **Step 2: 迁移 states-generator**

删 `:192`（P3 先行修复已改为 `options.map.seed`，保持一致），入口 `const R = makeRandom(options.map.seed)`。直接 `Math.random()`（:227,275,304）→ `R.next()`；`ra/rw/gauss` → `R.*`；对 `Names.getState(...)` 等调用传入 `R`。跑黄金。

- [ ] **Step 3: 迁移 cultures-generator**

同上（注意 `Names.getCulture(...)` 传 `R`；`expand()` 用 priorityFlood，无随机，不受影响）。跑黄金。

- [ ] **Step 4: 迁移 burgs-generator**

同上。跑黄金。

- [ ] **Step 5: 迁移 religions-generator**

同上（P1/P2 改的洪泛/routeById 不受影响）。跑黄金。

- [ ] **Step 6: 迁移 markers-generator**

同上。跑黄金。

- [ ] **Step 7: 守门 grep**

Run: `grep -rn "Math.random = " src/generators`（应 0）、`grep -rn "Math.random()" src/generators`（应 0，除测试/注释）。

- [ ] **Step 8: 全量回归**

Run: `npx tsc --noEmit` + `node_modules/.bin/biome check src` + `node_modules/.bin/vitest run`
Expected: 全绿；所有黄金断言不变。

- [ ] **Step 9: 提交（Task 5+6 合并）**

```bash
git add src/generators/names-generator.ts src/generators/states-generator.ts src/generators/cultures-generator.ts src/generators/burgs-generator.ts src/generators/religions-generator.ts src/generators/markers-generator.ts src/generators/*.test.ts
git commit -m "refactor(generators): inject RandomKit into names and the five high-risk generators"
```

---

## 完成判定（PRNG generators 阶段收口）

- [ ] 6 个任务全部提交，conventional commits
- [ ] `makeRandom` 工厂存在，`RandomKit` 覆盖 7 个随机助手
- [ ] `grep -rn "Math.random = " src/generators` → 0；`grep -rn "Math.random()" src/generators` → 0（除测试/注释）
- [ ] 每个迁移生成器的黄金测试在迁移前后断言不变（features Erase 除外，已固定新行为并注释）
- [ ] `npx tsc --noEmit` + `node_modules/.bin/biome check src` + `node_modules/.bin/vitest run` 全绿
- [ ] 手动验证：同一地图种子连点两次“重新生成”（states/cultures），结果一致
- [ ] features Erase 模式新行为已固定为黄金并在测试注释说明
