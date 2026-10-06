# P1 性能与安全加固 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地 spec P1 阶段的 7 项性能与安全修复：goods 热循环编译、宗教洪泛线性扫描、gzip O(n²) 解压、3D 加载挂起/崩溃、AI 读图确认与 key 清理、electron updater 未捕获 rejection、打包版忽略 `VITE_DEV_SERVER_URL`。

**Architecture:** 局部重构，不改公共接口、不改 `.map` 格式。性能项先做基准测量再优化；安全项加确认门槛或集中式错误处理。

**Tech Stack:** TypeScript strict、Vitest（jsdom）、node:test（scripts）、Electron main（updater/main.ts 为 TS 但跑在 Node 上下文，测试以代码审查 + 现有 e2e 为门禁）。

**Spec:** [docs/superpowers/specs/2026-10-06-code-quality-phased-optimization-design.md](../specs/2026-10-06-code-quality-phased-optimization-design.md)

## Global Constraints

- 沿用 P0 规则：TDD（先失败测试）、`npx tsc --noEmit` + `node_modules/.bin/biome check src` + 受影响测试全绿才可提交、禁 `any`、`@/*` 别名、单行注释、conventional commits。
- **性能任务（1/2/3）必须先记录基准**（修改前的耗时或复杂度证据），修改后给出对比，写进报告。
- 不改 `.map` 序列化格式；`src/services/io/` 改动不得影响旧存档加载（必要时跑 auto-update 测试 `src/services/io/auto-update.test.ts`）。
- Electron 代码（`electron/updater.ts`、`electron/main.ts`）不在 vitest 覆盖内——验证靠 `tsc` + `electron/tsconfig.json` 编译 + 人工代码审查；不要求新增单测。
- 3D 渲染器（`view-3d-renderer.ts`）依赖 WebGL/Three.js，jsdom 测不了渲染；测试聚焦可抽出的纯逻辑（如返回值检查分支），渲染路径靠代码审查。
- AI 助手改动需通过既有测试：`src/services/assistant/provider/*.test.ts`、`src/controllers/assistant/*.test.ts`。

---

### Task 1: goods-generator — `new Function` 提升到循环外

**Files:**
- Modify: `src/generators/goods-generator.ts:1008-1021`（generate 的放置循环）
- Test: `src/generators/goods-generator.test.ts`（追加）

**Interfaces:**
- Consumes: `this.getMethods()`（返回方法表）、`good.distribution`（公式字符串）、`good.chance`。
- Produces: 无新接口；行为不变，仅编译次数从 O(cells×goods) 降到 O(goods)。

**基准先行**

- [ ] **Step 1: 记录修改前基准**

写一个临时基准（或直接在报告里用 `TIME && console.time` 思路）：在修复前，于 `generate` 放置循环入口计数 `new Function` 调用次数。最简做法——报告里引用代码结构即可：当前实现里 `new Function` 在 `for (const good of goods)` 内，对每个通过 chance 检查的 cell 都编译一次；`regeneratePlacement`（同文件 ~1051 行）已是每个 good 编译一次。记录：`grep -c "new Function" src/generators/goods-generator.ts`（应为 2），并标注循环嵌套层级。

- [ ] **Step 2: 写失败测试（回归锁）**

在 `src/generators/goods-generator.test.ts` 追加一个“每个 good 只编译一次”的行为测试。做法：spy 全局 `Function` 构造器不可行（太 invasive），改为断言**行为等价**——同一个 good 的 distribution 在两次调用间结果一致。可接受的锁：断言生成后 `cells.good` 的分布与一次编译的参考实现一致（用小型 mock pack）。

```ts
// 追加到 src/generators/goods-generator.test.ts
describe("placement compiles distribution once per good", () => {
  it("produces identical placement whether compiled per-cell or per-good", () => {
    // reference: compile once, evaluate for each cell
    // implementation under test: Goods generate with the same mock pack + seed
    // assert cells.good arrays are identical
  });
});
```

注：若搭建 mock pack 成本过高，退化为结构化测试——断言 `goods-generator.ts` 源码中放置循环内不再出现 `new Function`（读取源码文本断言 `new Function` 只出现 1 次，即在循环外）。这是弱锁但足以防回退。

- [ ] **Step 3: 实现修复**

`src/generators/goods-generator.ts` 放置循环（~1008-1021）。把每个 good 的编译提升到循环外，预编译为 Map：

```ts
// before (inside `for (const cellId of shuffledCells)` → `for (const good of goods)`):
        const spread = new Function(methods, `return ${good.distribution}`);
        if (!spread(this.getMethods())) continue;

// after: hoist compilation above the cell loop
    const compiledSpreads = new Map<number, (methods: unknown) => boolean>();
    for (const good of goods) {
      if (!good.distribution || !good.chance) continue;
      compiledSpreads.set(good.i, new Function(methods, `return ${good.distribution}`) as (m: unknown) => boolean);
    }

    for (const cellId of shuffledCells) {
      // ...
      for (const good of goods) {
        if (!good.distribution || !good.chance) continue;
        if (resources[good.i] >= resourceMaxCells) continue;
        if (Math.random() * 100 > good.chance) continue;

        const spread = compiledSpreads.get(good.i)!;
        if (!spread(this.getMethods())) continue;
        // ... unchanged assignment ...
      }
    }
```

注意：`goods` 数组在循环内会 `shuffle(goods)`（每 10 格一次）——提升编译不改变求值顺序语义，因为编译只依赖 `good.distribution` 字符串，与顺序无关。

- [ ] **Step 4: 运行确认通过 + 基准对比**

Run: `node_modules/.bin/vitest run src/generators/goods-generator.test.ts`
Expected: PASS。报告里给出修复后 `grep -c "new Function"` 仍在文件中出现 2 次，但放置循环内为 0 次（编译在循环外）。

- [ ] **Step 5: 提交**

```bash
git add src/generators/goods-generator.ts src/generators/goods-generator.test.ts
git commit -m "perf(goods): compile distribution predicates once per good, not per cell"
```

---

### Task 2: religions 洪泛 — route 查找 Map 缓存

**Files:**
- Modify: `src/generators/religions-generator.ts:1027-1115`（expandReligions / expandHeresies）、`:1165-1170`（getPassageCost）
- Test: `src/generators/religions-generator.test.ts`（追加）

**Interfaces:**
- Consumes: `Routes.getRoute(from, to)`（`src/generators/routes-generator.ts:825-833`，内部 `pack.routes.find` 线性扫）。
- Produces: 无新接口；洪泛复杂度从 O(E×R) 降回 O(E log E)。

**设计说明**：两处洪泛共用一个 `getPassageCost`。最小侵入方案——在 `expandReligions`/`expandHeresies` 入口构建 `Map<routeId, Route>`，经 `getPassageCost` 的私有缓存字段传入；或给 `getPassageCost` 加一个模块级缓存并在洪泛开始/结束时置空。选前者更显式：把 `getPassageCost(cellId, nextCellId)` 改为 `getPassageCost(cellId, nextCellId, routeById)`。

- [ ] **Step 1: 记录修改前基准**

报告引用：`routes-generator.ts:825-833` 的 `getRoute` 是 `pack.routes.find(...)` 线性扫；`getPassageCost`（religions-generator.ts:1165）在洪泛内层对每条边调用。记录复杂度证据即可。

- [ ] **Step 2: 写失败测试（回归锁）**

在 `src/generators/religions-generator.test.ts` 追加：构造一个含 routes 的 mock pack，断言 `getPassageCost` 返回与 `Routes.getRoute` 一致的结果（roads → 1，非 roads → biomeCost/3，无 route → biomeCost 或 500/50）。锁行为不变。

```ts
// 断言优化前后 getPassageCost 行为等价（ roads=1 / 非roads=biomeCost/3 / 无route=biomeCost 或水域 500/50 ）
```

- [ ] **Step 3: 实现修复**

```ts
// religions-generator.ts

// expandReligions 与 expandHeresies 入口处：
  private routeById(): Map<number, Route> {
    return new Map(pack.routes.map(route => [route.i, route]));
  }

// getPassageCost 改为：
  private getPassageCost(cellId: number, nextCellId: number, routeById: Map<number, Route>): number {
    const routeId = pack.cells.routes[cellId]?.[nextCellId];
    const route = routeId === undefined ? null : routeById.get(routeId) ?? null;
    if (isWater(cellId, pack)) return route ? 50 : 500;

    const biomePassageCost = pack.biomes[pack.cells.biome[nextCellId]].cost;
    if (!route) return biomePassageCost;
    return route.group === "roads" ? 1 : biomePassageCost / 3;
  }
```

两处调用点（1059、1104）传入 `routeById`（在洪泛方法开头构建一次）。注意：`Route` 类型从 routes-generator 导入（若已导出）；`isWater` 已在使用。

- [ ] **Step 4: 运行确认通过**

Run: `node_modules/.bin/vitest run src/generators/religions-generator.test.ts`
Expected: PASS，无回归。

- [ ] **Step 5: 提交**

```bash
git add src/generators/religions-generator.ts src/generators/religions-generator.test.ts
git commit -m "perf(religions): cache route lookups in a Map during expansion floods"
```

---

### Task 3: load.ts — gzip 解压 O(n²)

**Files:**
- Modify: `src/services/io/load.ts:172-186`（uncompress）
- Test: `src/services/io/load-integrity.test.ts`（追加，或新建 `load-uncompress.test.ts`）

**Interfaces:**
- Consumes: `DecompressionStream("gzip")`、`Blob.stream()`。
- Produces: 无新接口；解压从 O(n²) 降为 O(n)。

- [ ] **Step 1: 记录修改前基准**

报告引用 load.ts:176-180 的 `uncompressedData.concat(Array.from(chunk))`——每块重建整个数组。

- [ ] **Step 2: 写失败测试（行为锁）**

`uncompress` 返回 `Uint8Array | null`。测试：对一个已知 gzip 压缩的 `ArrayBuffer` 解压，断言字节内容正确；对非 gzip 输入断言返回 `null`（走 catch 分支）。这锁行为不锁性能，性能由代码结构保证。

```ts
// 用 CompressionStream 造一个 gzip ArrayBuffer，解回原文
// 对乱 bytes 输入断言 uncompress 返回 null
```

注：`uncompress` 是 load.ts 的私有函数——参照 P0 Task 1 的模式，把它提取为模块级函数并经 `Load` 导出以便测试（`Load.uncompress`）。若提取成本超预期，退化方案：测试源码文本中不再出现 `concat(Array.from`。

- [ ] **Step 3: 实现修复**

`src/services/io/load.ts`：

```ts
// before (176-181):
    let uncompressedData: number[] = [];
    for await (const chunk of uncompressedStream) {
      uncompressedData = uncompressedData.concat(Array.from(chunk));
    }
    return new Uint8Array(uncompressedData);

// after:
    const parts: Uint8Array[] = [];
    for await (const chunk of uncompressedStream) parts.push(chunk);
    return new Uint8Array(await new Blob(parts as BlobPart[]).arrayBuffer());
```

- [ ] **Step 4: 运行确认通过**

Run: `node_modules/.bin/vitest run src/services/io/`
Expected: PASS（含 auto-update 回归）。

- [ ] **Step 5: 提交**

```bash
git add src/services/io/load.ts src/services/io/load-integrity.test.ts
git commit -m "perf(load): concatenate gzip chunks once instead of quadratic concat"
```

---

### Task 4: view-3d-renderer — 纹理/脚本加载错误处理

**Files:**
- Modify: `src/renderers/view-3d-renderer.ts:624-644`（createMeshTextureUrl）、`:982-991`（updateGlobeTexure 的 img2）、`:335-340`（saveOBJ）、`:760-770`（loadLoopSubdivision）
- Test: 无新增（WebGL/Three 路径 jsdom 测不了）；验证靠 tsc + 代码审查

**Interfaces:**
- Consumes: `tip`（`src/components/tooltips`）、既有 fallback 范式（erosion-bake 失败分支）。
- Produces: 无新接口；失败路径不再挂起/崩溃，用户可见错误。

- [ ] **Step 1: 定位四处失败点**

确认四处：
1. `createMeshTextureUrl`（~624-644）：`new Promise(resolve => { img.onload = ...; canvas.toBlob(blob => { blob! ... }) })` — 无 `img.onerror`、`toBlob` 的 `blob` 非空断言在失败时抛 TypeError。
2. `updateGlobeTexure` 的 `img2`（~982-991）：同样缺 `onerror`。
3. `saveOBJ`（~335-340）：`const objexporter = await OBJExporter(); await objexporter.parse(mesh)` — `OBJExporter()` 失败时 resolve `false`，`.parse` 抛 TypeError。
4. `loadLoopSubdivision`（~760-770）：不检查返回值就调 `(window as any).loopSubdivision.modify(...)`。

- [ ] **Step 2: 实现修复**

按既有 erosion-bake fallback 范式（`tip(..., "error")` + 回退）：

1. `createMeshTextureUrl`：补 `img.onerror = () => resolve(null)`；`canvas.toBlob(blob => { if (!blob) return resolve(null); ... })`。返回类型改为 `Promise<string | null>`，调用方 `loadMapTexture`/`createMesh` 对 `null` 走 fallback（无纹理材质 + `tip` 报错）。
2. `updateGlobeTexure` 的 `img2`：补 `onerror → resolve(null)` 并对 null 回退（保持星空背景）。
3. `saveOBJ`：`const objexporter = await OBJExporter(); if (!objexporter) { tip("Cannot export OBJ: module failed to load", true, "error"); return; }`
4. `loadLoopSubdivision` 调用点：`const ok = await loadLoopSubdivision(); if (!ok || !(window as any).loopSubdivision) { /* 回退到未细分网格 */ mesh = new Three.Mesh(geometry, material); } else { ... }`

每处失败的 `tip` 文案给出可操作建议（如“3D texture failed to render; try a smaller map”）。

- [ ] **Step 3: 验证**

Run: `npx tsc --noEmit && node_modules/.bin/biome check src/renderers`
Expected: 干净。渲染路径由审查确认：所有 Promise 都有 resolve 出口（onload + onerror + toBlob null 分支）。

- [ ] **Step 4: 提交**

```bash
git add src/renderers/view-3d-renderer.ts
git commit -m "fix(3d): handle texture rasterization and script load failures instead of hanging"
```

---

### Task 5: AI 助手 — 读图确认 + key 清理

**Files:**
- Modify: `src/services/assistant/provider/runtime.ts:26-42`（runScript 或其调用点）、`src/controllers/assistant/map.ts:185-201`（read_map handle）、`src/services/assistant/provider/connection.ts:35-38`（clear）
- Test: `src/services/assistant/provider/runtime.test.ts`、`src/controllers/assistant/proposals.test.ts`（或 map 相关测试）、`src/services/assistant/provider/connection.test.ts`

**Interfaces:**
- Consumes: `runScript(code, helpers)`、`localStorage` 的 `fmg-ai-kl-*` keys、`PROVIDERS` 列表。
- Produces: `clear()` 清全部 provider key；`read_map` 在每个会话首次执行脚本前经用户确认。

**设计说明**：
- **key 清理**：`connection.ts:clear()` 当前只 `removeItem(keyStorageForProvider(get().provider))`。改为遍历 `PROVIDERS` 清掉所有 `fmg-ai-kl-*`。
- **读图确认**：`read_map` 的 `handle` 直接 `runScript`。加一个会话级确认——模块级布尔 `scriptConsentGiven`，首次执行前弹出确认（复用既有 `confirmationDialog` 或 alert 模式，参照 `src/components/dialog/dialog-helpers.ts` 的 `confirmationDialog`）。文案明示“脚本拥有页面完整权限，并非只读；仅在你信任此地图来源时继续”。确认后置 true，会话内不再追问。新建聊天/换地图时重置（聊天生命周期由 `src/services/assistant/chats.ts` 管理——确认钩子挂在“新会话”处）。

- [ ] **Step 1: 写失败测试**

`connection.test.ts` 追加：

```ts
// clear() removes every provider's key, not just the active one
localStorage.setItem("fmg-ai-kl-anthropic", "sk-ant");
localStorage.setItem("fmg-ai-kl-openai", "sk-oai");
// ... set active provider to anthropic, call clear()
// expect both keys removed
```

`runtime`/`map` 侧：断言 `read_map.handle` 在 consent 未给定时先请求确认且不执行脚本（mock `runScript` 断言未被调用；mock 确认对话框）。

- [ ] **Step 2: 运行确认失败**

`clear()` 当前只清一家 → 新测试失败。`read_map` 当前无确认 → consent 测试失败。

- [ ] **Step 3: 实现**

`connection.ts`：

```ts
import { PROVIDERS, ... } from "./providers";

export function clear(): void {
  for (const provider of PROVIDERS) localStorage.removeItem(keyStorageForProvider(provider.id));
  localStorage.setItem(CONNECTED_STORAGE, "0");
}
```

`map.ts` 的 `read_map.handle`（或其所在模块）加会话确认：

```ts
let scriptConsentGiven = false;

// inside handle, before runScript:
if (!scriptConsentGiven) {
  const ok = await confirmationDialog({ /* title: "Run AI script?", message 明示全权限与信任前提 */ });
  if (!ok) return { content: "Script execution declined", isError: true, item: { kind: "step", code, result: undefined } };
  scriptConsentGiven = true;
}
// ... existing runScript call ...
```

在聊天新建/换地图处重置 `scriptConsentGiven = false`（找到 chats.ts 的新会话钩子挂接）。若 `confirmationDialog` 的签名不同，按 `dialog-helpers.ts` 实际 API 调整。

- [ ] **Step 4: 运行确认通过**

Run: `node_modules/.bin/vitest run src/services/assistant src/controllers/assistant`
Expected: PASS，无回归。

- [ ] **Step 5: 提交**

```bash
git add src/services/assistant/provider/connection.ts src/services/assistant/provider/connection.test.ts src/controllers/assistant/map.ts src/services/assistant/chats.ts
git commit -m "fix(assistant): require per-session consent before running map scripts; clear all provider keys on disconnect"
```

---

### Task 6: electron — updater rejection 处理 + 打包版忽略 VITE_DEV_SERVER_URL

**Files:**
- Modify: `electron/updater.ts:13-17`（ask）、`:31-33,55-61,64-72,75-88`（四处 .then）
- Modify: `electron/main.ts:15,295`（DEV_SERVER_URL）
- Test: 无（electron 主进程不在 vitest 覆盖内；门禁为 tsc 编译 + 审查）

**Interfaces:**
- Consumes: `dialog.showMessageBox`、`BrowserWindow.getAllWindows()`。
- Produces: `ask()` 变为 rejection-safe（返回 `-1` 表示取消/窗口已销毁）；打包版不再读 `VITE_DEV_SERVER_URL`。

- [ ] **Step 1: 实现 updater 修复**

`electron/updater.ts`：

```ts
// before (13-17):
function ask(options: MessageBoxOptions): Promise<number> {
  const window = BrowserWindow.getAllWindows().find(candidate => !candidate.isDestroyed());
  const result = window ? dialog.showMessageBox(window, options) : dialog.showMessageBox(options);
  return result.then(({ response }) => response);
}

// after: central rejection-safe ask — -1 means cancelled or the window was destroyed mid-dialog
function ask(options: MessageBoxOptions): Promise<number> {
  const window = BrowserWindow.getAllWindows().find(candidate => !candidate.isDestroyed());
  const result = window ? dialog.showMessageBox(window, options) : dialog.showMessageBox(options);
  return result.then(({ response }) => response).catch(() => -1);
}
```

四处调用点的 `.then(response => {...})` 无需改——`response === 0` 判断对 `-1` 自然落空（不执行动作），正是期望语义。确认 `update-downloaded` 分支（response 0 → allowClose + quitAndInstall）在 `-1` 时不执行即可。

- [ ] **Step 2: 实现 main.ts 修复**

`electron/main.ts:15`：

```ts
// before:
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
// after:
const DEV_SERVER_URL = app.isPackaged ? undefined : process.env.VITE_DEV_SERVER_URL;
```

确认 `:295` 的 `window.loadURL(DEV_SERVER_URL || APP_URL)` 不变。

- [ ] **Step 3: 验证**

Run: `npx tsc --noEmit`（根 tsconfig 若不含 electron，跑 `npx tsc --noEmit -p electron/tsconfig.json`）+ `node_modules/.bin/biome check electron`
Expected: 干净。

- [ ] **Step 4: 提交**

```bash
git add electron/updater.ts electron/main.ts
git commit -m "fix(electron): make updater dialogs rejection-safe; ignore dev-server URL when packaged"
```

---

## 完成判定（P1 收口）

- [ ] 6 个任务全部提交，conventional commits
- [ ] 性能任务（1/2/3）报告含修复前后对比证据
- [ ] `npx tsc --noEmit`（含 electron）零错误
- [ ] `node_modules/.bin/biome check src electron` 通过
- [ ] `node_modules/.bin/vitest run` 全绿（当前基线 1980）
- [ ] `npm run test:scripts` 通过
- [ ] `npm run generate:assistant-context -- --check` 同步
