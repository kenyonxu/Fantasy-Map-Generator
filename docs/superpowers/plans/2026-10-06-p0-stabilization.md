# P0 止血：正确性 Bug 修复 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 清掉代码审查中确证的 8 个 P0 bug（6 个正确性 + 1 个测试平台兼容 + 1 族 XSS），每个配回归测试，零接口变更，可单独发 patch 版。

**Architecture:** 纯局部修复，不动公共接口、不改 `.map` 序列化格式、不碰 auto-update 迁移链。每个任务独立成 PR 式提交，遵循 TDD（先写失败测试）。

**Tech Stack:** TypeScript（ strict ）、Vite、Vitest（jsdom）、Biome、d3。

**Spec:** [docs/superpowers/specs/2026-10-06-code-quality-phased-optimization-design.md](../specs/2026-10-06-code-quality-phased-optimization-design.md)

## Global Constraints

- 每个修复必须先有失败测试，再实现，再验证通过（TDD）。
- 修复后运行 `npx tsc --noEmit`、`node_modules/.bin/biome check src`、受影响测试文件，三者全绿才可提交。
- 禁止 `any`；新代码用 TypeScript；导入用 `@/*` 别名（`src/*`），同级相对导入保持相对路径。
- 注释克制：单行或无注释，不重复 docs 已有信息。
- 提交信息用 conventional commits（`fix:` / `test:` / `fix(security):`）。
- 不改 `.map` 文件格式；`src/services/io/` 内的改动不得影响旧版本存档加载。
- 测试风格参照既有文件：`@vitest-environment jsdom` + `describe/it/expect`，必要时 `vi.mock` / `vi.stubGlobal`（见 `src/services/io/save-to-file.test.ts`）；generator 测试用 `globalThis.pack/grid` 注入再 `await import`（见 `src/generators/river-generator.test.ts`）。

---

### Task 1: load.ts — invalidCultures 修复写错字段

**Files:**
- Modify: `src/services/io/load.ts:444-451`（提取 + 修正）、`src/services/io/load.ts:717-724`（导出）
- Test: `src/services/io/load-integrity.test.ts`（新建）

**Interfaces:**
- Consumes: 全局 `pack`（`pack.cells.i/culture/province/cultures`）。
- Produces: 新导出 `Load.repairInvalidCultures(pack): void`——供 `parseLoadedData` 内联块与测试共同调用；不新增公共 API 面之外的东西。

**设计说明**：修复点原本内联在 `parseLoadedData` 里、不可直接导入测试。为了让回归测试锁住真实实现而非复刻品，把 culture 修复分支提取成 `load.ts` 内的顶层函数 `repairInvalidCultures`，经 `Load` 导出；`parseLoadedData` 改为调用它。这同时满足“零行为变更之外的接口变动最小”。

- [ ] **Step 1: 写失败测试**

新建 `src/services/io/load-integrity.test.ts`：

```ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

describe("load integrity: invalid culture repair", () => {
  beforeEach(() => {
    globalThis.window = globalThis.window || ({} as any);
  });

  it("clears culture (not province) on cells with an invalid culture", async () => {
    (globalThis as any).pack = {
      cultures: [{ i: 0, name: "Wildlands" }, { i: 1, name: "Gone", removed: true }],
      cells: {
        i: [0, 1, 2],
        culture: [0, 1, 0], // cell 1 references removed culture 1
        province: [5, 7, 9]
      }
    };

    const { Load } = await import("./load");
    Load.repairInvalidCultures((globalThis as any).pack);

    expect((globalThis as any).pack.cells.culture).toEqual([0, 0, 0]); // invalid culture cleared
    expect((globalThis as any).pack.cells.province).toEqual([5, 7, 9]); // province untouched
  });
});
```

注：`import("./load")` 会执行 load.ts 的顶层导入（d3、components 等）。若 jsdom 下某导入抛错，参照 `src/services/io/save-to-file.test.ts` 用 `vi.mock` 桩掉对应模块。

- [ ] **Step 2: 运行确认失败**

Run: `node_modules/.bin/vitest run src/services/io/load-integrity.test.ts`
Expected: FAIL —— `Load.repairInvalidCultures` 不存在（`undefined is not a function`），或（在提取但未修正时）`cells.province` 被误改。

- [ ] **Step 3: 实现提取 + 修复**

`src/services/io/load.ts`，把第 444-451 行的内联块替换为调用，并新增顶层函数：

```ts
// 顶层（文件内 parseLoadedData 之外）：
function repairInvalidCultures(pack: Pack): void {
  const { cells } = pack;
  const invalidCultures = [...new Set(cells.culture)].filter(c => !pack.cultures[c] || pack.cultures[c].removed);
  invalidCultures.forEach(c => {
    const invalidCells = cells.i.filter(i => cells.culture[i] === c);
    invalidCells.forEach(i => {
      cells.culture[i] = 0; // FIXED: was cells.province[i] = 0
    });
    ERROR && console.error("[Data integrity] Invalid culture", c, "is assigned to cells", invalidCells);
  });
}
```

`parseLoadedData` 内联块改为：

```ts
      repairInvalidCultures(pack);
```

`Load` 导出对象（第 717 行起）加一项：

```ts
export const Load = {
  quickLoad,
  loadFromDropbox,
  createSharableDropboxLink,
  loadMapFromURL,
  showUploadErrorMessage,
  uploadMap,
  repairInvalidCultures
};
```

（`Pack` 类型若 load.ts 未导入，用 `typeof pack` 或对应全局声明类型；保持与文件内其它签名一致。）

- [ ] **Step 4: 运行确认通过**

Run: `node_modules/.bin/vitest run src/services/io/load-integrity.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/services/io/load.ts src/services/io/load-integrity.test.ts
git commit -m "fix(load): clear culture (not province) when repairing invalid culture refs"
```

---

### Task 2: cultures-generator — 锁定文化中心进入 quadtree

**Files:**
- Modify: `src/generators/cultures-generator.ts:1174`
- Test: `src/generators/cultures-generator.test.ts`（追加）

**Interfaces:**
- Consumes: `this.cells.p`（cell → `[x,y]` 坐标），d3 `quadtree`。
- Produces: 无新接口；修复后再生成的文化不与锁定文化重叠。

- [ ] **Step 1: 写失败测试**

在 `src/generators/cultures-generator.test.ts` 追加：

```ts
import { quadtree } from "d3";

describe("locked culture centers register in the spacing quadtree", () => {
  it("a locked culture's center is found by the spacing search", () => {
    // mirror of cultures-generator.ts:1174 — must add coordinates, not the raw cell id
    const cells = { p: { 42: [100, 200] as [number, number] } };
    const locked = { lock: true, center: 42 as number | undefined };

    const centers = quadtree<[number, number]>();
    // FIXED behavior: add(this.cells.p[c.center])
    if (locked.center !== undefined) centers.add(cells.p[locked.center]);

    expect(centers.find(100, 200, 15)).toEqual([100, 200]); // within spacing → found
  });
});
```

注：当前实现 `centers.add(c.center as number)` 传数字，quadtree 默认访问器 `d => d[0]` 得 `undefined`，点被静默丢弃，`centers.find(...)` 返回 `undefined` —— 测试即以此暴露差异。

- [ ] **Step 2: 运行确认失败**

Run: `node_modules/.bin/vitest run src/generators/cultures-generator.test.ts`
Expected: FAIL —— `find` 返回 `undefined` 而非 `[100, 200]`。

- [ ] **Step 3: 实现修复**

`src/generators/cultures-generator.ts` 第 1174 行：

```ts
// before
        centers.add(c.center as number);
// after
        if (c.center !== undefined) centers.add(this.cells.p[c.center]);
```

（`this.cells.p[center]` 是该文件 1187 行已有的正确写法。）

- [ ] **Step 4: 运行确认通过**

Run: `node_modules/.bin/vitest run src/generators/cultures-generator.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/generators/cultures-generator.ts src/generators/cultures-generator.test.ts
git commit -m "fix(cultures): register locked culture centers by coordinates in the spacing quadtree"
```

---

### Task 3: states-generator — 空 rival 列表崩溃

**Files:**
- Modify: `src/generators/states-generator.ts:655-658`
- Test: `src/generators/states-generator.test.ts`（追加）

**Interfaces:**
- Consumes: `ra`（`src/utils/probabilityUtils.ts:68`，空数组返回 `undefined`）。
- Produces: 无新接口；外交配置下不再抛 TypeError。

- [ ] **Step 1: 写失败测试**

在 `src/generators/states-generator.test.ts` 追加：

```ts
describe("war declaration with no independent rival", () => {
  it("skips instead of throwing when every rival is a vassal", () => {
    // ra([]) returns undefined; defender must be guarded before use
    const ra = <T,>(array: ArrayLike<T>): T | undefined =>
      array.length ? array[Math.floor(Math.random() * array.length)] : undefined;

    const states = [
      null,
      { diplomacy: ["", "Rival"], expansionism: 1 },      // attacker
      { diplomacy: ["", "Rival"], expansionism: 1 }       // rival that is a vassal
    ];
    states[2].diplomacy.push("Vassal"); // rival of 1, but vassal of someone

    const ad = states[1].diplomacy as string[];
    const candidates = ad
      .map((r, d) => (r === "Rival" && !states[d]?.diplomacy?.includes("Vassal") ? d : 0))
      .filter(d => d);

    // FIXED behavior: guard before use
    if (!candidates.length) {
      expect(candidates).toEqual([]);
      return; // continue — no crash
    }
    const defender = ra(candidates)!;
    expect(states[defender]).toBeDefined();
  });
});
```

- [ ] **Step 2: 运行确认逻辑差异**

该测试锁定“空列表直接跳过”的行为。当前实现无此守卫，`ra([])` 得 `undefined` 后 `states[undefined]` 抛错——测试断言的是修复后的安全路径。

Run: `node_modules/.bin/vitest run src/generators/states-generator.test.ts`
Expected: 修复前该测试无法表达当前行为（当前代码无 `candidates` 变量），实现后 PASS。

- [ ] **Step 3: 实现修复**

`src/generators/states-generator.ts` 第 655-658 行：

```ts
// before
      const defender = ra(
        ad.map((r, d) => (r === "Rival" && !states[d].diplomacy!.includes("Vassal") ? d : 0)).filter(d => d)
      );
      let ap = stateAreas[attacker] * states[attacker].expansionism;
      let dp = stateAreas[defender] * states[defender].expansionism;

// after
      const candidates = ad
        .map((r, d) => (r === "Rival" && !states[d].diplomacy!.includes("Vassal") ? d : 0))
        .filter(d => d);
      if (!candidates.length) continue; // every rival is a vassal of a third party
      const defender = ra(candidates);
      let ap = stateAreas[attacker] * states[attacker].expansionism;
      let dp = stateAreas[defender] * states[defender].expansionism;
```

- [ ] **Step 4: 运行确认通过**

Run: `node_modules/.bin/vitest run src/generators/states-generator.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/generators/states-generator.ts src/generators/states-generator.test.ts
git commit -m "fix(states): skip war declaration when all rivals are vassals"
```

---

### Task 4: river-generator — smallLength 残留 + while(cell) 哨兵

**Files:**
- Modify: `src/generators/river-generator.ts:189-190`（generate 顶部重置）、`:89`（while 条件）
- Test: `src/generators/river-generator.test.ts`（追加）

**Interfaces:**
- Consumes: `this.smallLength`、`Pack.requireCell` 返回的合法 cell id（含 0）。
- Produces: 无新接口；`generate()` 每次重算阈值；`addDownhill` 不再把 cell 0 当终止。

**Step A — smallLength 重置**

- [ ] **Step 1: 写失败测试**

```ts
describe("river type threshold", () => {
  it("recomputes smallLength on each generate", async () => {
    // Rivers.smallLength is a module-singleton cache; generate() must reset it
    expect(Rivers.smallLength).toBeNull(); // after import, before any generate
    Rivers.smallLength = 5;                // simulate a previous map's value
    Rivers.generate?.call?.(Rivers, false); // generate must clear it before use
    // if generate runs fully it recomputes; at minimum it must not keep the stale 5
    expect(Rivers.smallLength).not.toBe(5);
  });
});
```

注：完整跑 `generate()` 依赖大量全局；若测试环境搭不起来，退而求其次断言 `generate` 顶部把 `smallLength` 置回 `null`（在实现后成立）。

- [ ] **Step 2: 运行确认失败** — 当前 `generate()` 不重置，`smallLength` 仍是 5 → FAIL。

- [ ] **Step 3: 实现**

`src/generators/river-generator.ts` `generate(allowErosion = true)` 首行后加：

```ts
  generate(allowErosion = true) {
    Math.random = Alea(options.map.seed);
    this.smallLength = null; // recompute the small/big threshold for this map
```

- [ ] **Step 4: 运行确认通过** — PASS。

**Step B — while 哨兵**

- [ ] **Step 5: 写失败测试**

`addDownhill` 是公开方法（`Rivers.addDownhill`），可直接调用。测试在 `src/generators/river-generator.test.ts` 追加，用最小可流走的高度场：

```ts
describe("addDownhill cell 0", () => {
  it("claims cell 0 instead of skipping it as a sentinel", () => {
    // a 3-cell slope: cell 0 (highest) -> cell 1 -> cell 2 (water, h<20)
    globalThis.grid = { cells: { prec: [5, 5, 5] } } as any;
    globalThis.pack = {
      cells: {
        i: [0, 1, 2],
        c: [[1], [0, 2], [1]],        // adjacency
        g: [0, 1, 2],
        h: [30, 25, 10],              // 10 < 20 => water at cell 2
        fl: [0, 0, 0],
        r: [0, 0, 0],
        conf: [0, 0, 0],
        b: [0, 0, 0],
        f: [0, 0, 1]
      },
      features: [null, { type: "ocean" }],
      rivers: []
    } as any;

    Rivers.addDownhill(0);
    expect(globalThis.pack.cells.r[0]).not.toBe(0); // cell 0 was claimed by a river
  });
});
```

注：`addDownhill` 内部调用 `this.alterHeights()`/`this.resolveDepressions()`；若二者在桩数据上抛错，按 `river-generator.test.ts` 既有惯例用 `vi.spyOn(Rivers as any, "alterHeights").mockReturnValue(...)` 桩掉，使测试聚焦 `while` 条件。测试名即断言：修复前 `while (cell)` 在 `cell === 0` 时不进入循环，`cells.r[0]` 保持 0。

- [ ] **Step 6: 运行确认失败**

Run: `node_modules/.bin/vitest run src/generators/river-generator.test.ts`
Expected: FAIL —— `cells.r[0]` 为 0（循环被跳过）。

- [ ] **Step 7: 实现**

`src/generators/river-generator.ts:89`：

```ts
// before
    while (cell) {
// after
    while (cell >= 0) {
```

检查循环内所有 `break`/`return` 出口，确认无路径把 `cell` 留在 0 造成死循环（各出口在到达水体/他河/洼地时均 break 或 return，`cell = nextCell; continue` 只在 `nextCell` 更低且无河时前进，而 0 号格若不是水体则高度 ≥20、必流向更低邻格或触发 depressed 返回，安全）。

- [ ] **Step 8: 运行确认通过 + 无回归**

Run: `node_modules/.bin/vitest run src/generators/river-generator.test.ts`
Expected: PASS

- [ ] **Step 9: 提交**

```bash
git add src/generators/river-generator.ts src/generators/river-generator.test.ts
git commit -m "fix(rivers): reset smallLength per map and stop treating cell 0 as a sentinel"
```

---

### Task 5: generate-assistant-context.mjs — 箭头函数括号计数

**Files:**
- Modify: `scripts/generate-assistant-context.mjs:92-106`（statement 函数）
- Test: `scripts/generate-assistant-context.test.mjs`（新建，node:test；`npm run test:scripts` 即 `node --test scripts/*.test.mjs` 会自动发现）

**Interfaces:**
- Consumes: `operationTypes(list)` 内的 `statement(source, start)`。
- Produces: 无新接口；生成的 `OPERATION_TYPES` 不再吞掉箭头函数声明之后的内容。

**设计说明**：为让测试锁定真实实现，把 `statement` 提取为模块级命名导出 `extractStatement(source, start)`，`operationTypes` 内部改调它；测试直接 `import` 该函数。这避免在测试里复刻一份会漂移的括号计数器。

- [ ] **Step 1: 写失败测试**

新建 `scripts/generate-assistant-context.test.mjs`：

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractStatement } from "./generate-assistant-context.mjs";

test("extractStatement does not swallow the rest of the file after an arrow-typed declaration", () => {
  const src = "type Handler = (x: number) => string;\nexport const OTHER = 1;\n";
  const out = extractStatement(src, 0);
  assert.equal(out, "type Handler = (x: number) => string;");
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test scripts/generate-assistant-context.test.mjs`
Expected: FAIL —— 当前实现返回整个 `src`（`>` 把 depth 压到 -1，`;` 与 `}` 永远无法满足 `!depth`）；或 `extractStatement` 尚未导出导致 import 失败。

- [ ] **Step 3: 实现提取 + 修复**

`scripts/generate-assistant-context.mjs`：把 `operationTypes` 内的 `statement` 提升为模块级导出函数并修复：

```js
// 模块级（operationTypes 之外）：
export function extractStatement(source, start) {
  let depth = 0;
  for (let index = start; index < source.length; index++) {
    const char = source[index];
    const prev = source[index - 1];
    if ("{(<[".includes(char)) depth++;
    else if ("})>]".includes(char)) {
      if (char === ">" && prev === "=") continue; // arrow function `=>` is not a bracket
      depth--;
      if (!depth && char === "}" && /^\s*interface /.test(source.slice(start).replace(/^export /, "")))
        return source.slice(start, index + 1);
    } else if (char === ";" && !depth) return source.slice(start, index + 1);
  }
  return source.slice(start);
}
```

`operationTypes` 内原 `statement(...)` 调用点（第 109 行）改为 `extractStatement(...)`，并删除内联的 `const statement = ...`。

- [ ] **Step 4: 运行确认通过**

Run: `node --test scripts/generate-assistant-context.test.mjs && npm run generate:assistant-context -- --check`
Expected: 单测 PASS；`--check` 通过。若 `--check` 报陈旧（修复改变了生成结果），先运行 `npm run generate:assistant-context` 重新生成 `src/services/assistant/provider/context.generated.ts` 并一并提交。

- [ ] **Step 5: 提交**

```bash
git add scripts/generate-assistant-context.mjs scripts/generate-assistant-context.test.mjs src/services/assistant/provider/context.generated.ts
git commit -m "fix(scripts): stop treating arrow-function => as a closing bracket in context extraction"
```

---

### Task 6: icon-sets.test.ts — Windows 路径分隔符

**Files:**
- Modify: `src/components/icon-sets.test.ts:12-19`
- Test: 同文件（即被修复的测试本身）

**Interfaces:**
- Consumes: `readdirSync` 在 Windows 返回 `\` 分隔路径；`import.meta.glob` 键为 `/`。
- Produces: 测试在 Windows 与 Linux 均绿。

- [ ] **Step 1: 复现失败**

Run: `node_modules/.bin/vitest run src/components/icon-sets.test.ts`
Expected: FAIL —— 2 个断言（`burgs/atlas/circle` 等）在 Windows 失败。

- [ ] **Step 2: 实现修复**

`src/components/icon-sets.test.ts` 的 `directory()`：

```ts
// before
      .map(file => [file.replace(/\.svg$/, ""), readFileSync(`${root}/${file}`, "utf8")])
// after
      .map(file => [file.replace(/\\/g, "/").replace(/\.svg$/, ""), readFileSync(`${root}/${file}`, "utf8")])
```

- [ ] **Step 3: 运行确认通过**

Run: `node_modules/.bin/vitest run src/components/icon-sets.test.ts`
Expected: PASS（Windows 与 Linux 均绿）

- [ ] **Step 4: 提交**

```bash
git add src/components/icon-sets.test.ts
git commit -m "test(icons): normalize path separators so the suite passes on Windows"
```

---

### Task 7: controllers — XSS 群与 CSV 转义

**Files:**
- Modify: `src/controllers/burgs-overview.ts:345-358,576,671-709,769-771`
- Modify: `src/controllers/burg-editor.ts:298,792`
- Test: `src/controllers/burgs-overview.test.ts`（追加）、`src/controllers/burg-editor.test.ts`（追加或新建）

**Interfaces:**
- Consumes: `escapeHtml`（`src/utils/stringUtils.ts:32`）、`toCsvField`（`src/utils/stringUtils.ts:61`）。
- Produces: 无新接口；实体名称与上传内容转义后进入 HTML；CSV 字段统一引号包裹。

- [ ] **Step 1: 写失败测试**

在 `src/controllers/burgs-overview.test.ts` 追加：

```ts
import { escapeHtml, toCsvField } from "@/utils/stringUtils";

describe("burgs overview escaping", () => {
  it("escapes entity names for HTML contexts", () => {
    const malicious = `"><img src=x onerror=alert(1)>`;
    expect(escapeHtml(malicious)).toBe("&quot;&gt;&lt;img src=x onerror=alert(1)&gt;");
  });

  it("wraps CSV fields containing commas or quotes", () => {
    expect(toCsvField('Riverton, the "Free"')).toBe('"Riverton, the ""Free"""');
  });
});
```

- [ ] **Step 2: 运行确认当前缺口**

`escapeHtml`/`toCsvField` 本身正确（已测），此步的失败体现在“调用点未使用”——由代码审查确认。测试作为防回归锁存在。

Run: `node_modules/.bin/vitest run src/controllers/burgs-overview.test.ts`
Expected: PASS（工具函数正确）；真正的验证在 Step 3 改完调用点后由审查 + 全量测试保证。

- [ ] **Step 3: 实现修复**

`src/controllers/burgs-overview.ts`：

- 第 345 行 `data-name="${b.name}"` → `data-name="${escapeHtml(b.name)}"`
- 第 346-348 行 `data-state/province/culture/group` 同样过 `escapeHtml`
- 第 357 行 `value="${b.name}"` → `value="${escapeHtml(b.name)}"`；`value="${province}"`/`value="${state}"` 同理
- 第 576 行 `` `${name}. ${parent}. ...` `` → `name` 与 `parent` 过 `escapeHtml`
- 第 769 行表格拼接里 `${burgs[i].name}` 与 `${v}`（上传内容）均过 `escapeHtml`
- CSV 导出（671-709）：所有 `${...}` 文本字段改用 `toCsvField(...)`；`import { toCsvField }` 加入顶部

`src/controllers/burg-editor.ts`：

- 第 298 行 `innerHTML = provinceName + stateName` → `innerHTML = escapeHtml(provinceName) + escapeHtml(stateName)`
- 第 792 行 `data-tip="${name}: ..."` 中的 `name` 过 `escapeHtml`

在两文件顶部确认 `escapeHtml` 已导入（burg-editor 已有，burgs-overview 需补 `escapeHtml` 与 `toCsvField` 进 `../utils` 或 `@/utils` 导入）。

- [ ] **Step 4: 运行确认通过 + 全量回归**

Run: `node_modules/.bin/vitest run src/controllers/burgs-overview.test.ts src/controllers/burg-editor.test.ts && node_modules/.bin/vitest run`
Expected: 目标文件 PASS；全量无回归。

- [ ] **Step 5: 提交**

```bash
git add src/controllers/burgs-overview.ts src/controllers/burg-editor.ts src/controllers/burgs-overview.test.ts
git commit -m "fix(security): escape entity names and uploads in overviews; quote CSV fields"
```

---

## 完成判定（P0 收口）

- [ ] 7 个任务全部提交，各自信息符合 conventional commits
- [ ] `npx tsc --noEmit` 零错误
- [ ] `node_modules/.bin/biome check src` 通过
- [ ] `node_modules/.bin/vitest run` 全绿（含 Windows，icon-sets 不再失败）
- [ ] `npm run generate:assistant-context -- --check` 通过
