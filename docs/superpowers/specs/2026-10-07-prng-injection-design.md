# PRNG 全面注入化 规格设计（generators 阶段）

日期：2026-10-07
来源：P3 长期演进项。前置状态：P0–P2 已全部合并（spec：`docs/superpowers/specs/2026-10-06-code-quality-phased-optimization-design.md`）；`States.recreate()` 种子确定性已单独修复。

## 目标与原则

主目标：**架构演进优先**——消除生成器之间经全局 `Math.random` 的隐式耦合，让每个生成器的随机性来源显式化、可独立测试，并为未来 Worker/多线程生成铺路。

原则：

- **行为等价的交付口径（最终评审修订）**：交付的保证是两层——①每个生成器自身序列保真：给定自己的种子，其输出确定不变（黄金测试逐生成器锚定）；②迁移后同一 `options.map.seed` 的全图生成确定、可复现。**不承诺**与迁移前共享全局流布局逐字节一致：部分生成器迁移前消费共享流的残留位置，注入化后从各自 `Alea(seed)` 位置 0 起步（完整位移集见“已知变化”）——这在移除共享全局流的目标下不可避免。
- 策略：**方案 B 助手工厂化**——`probabilityUtils` 的助手逻辑集中不复制，工厂绑定到各生成器自己的 Alea 实例。
- 范围：本阶段**只改 `src/generators/`**。controllers/components 的 5 处 `Math.random = Alea(...)` 与 `probabilityUtils` 的全局导出签名**不动**。
- 沿用既定质量门禁：TDD、`npx tsc --noEmit` + `biome check src` + 全量 vitest 全绿、禁 `any`、conventional commits（本阶段多为 `refactor:`）。

## 现状（2026-10-07 实测）

- `Math.random = ...` 写点：generators 内 12 处（features×2、goods、ice、markets、provinces、grid、heightmap、routes、states、precipitation、river）。
- `Math.random()` 读点：63 处，集中在 `probabilityUtils.ts`（`rand/P/gauss/ra/rw` 全部读全局）及少数直接调用（states-generator:227,275,304 等）。
- 生成器几乎全部经 `probabilityUtils` 助手间接读随机；`Names`（names-generator）被多生成器调用且内部也读全局——是序列保真的关键点。

## 设计

### 一、核心抽象与种子流

新文件 `src/utils/random.ts`（或并入 `probabilityUtils.ts` 顶部）导出工厂：

```ts
export interface RandomKit {
  next(): number;                 // 裸 PRNG，替代 Math.random()
  rand(min?: number, max?: number): number;
  P(probability: number): boolean;
  ra<T>(array: ArrayLike<T>): T;
  rw(object: Record<string, number>): string;
  gauss(expected?: number, deviation?: number, min?: number, max?: number, round?: number): number;
  // ... 其余现有助手按需迁移
}
export function makeRandom(seed: string | number): RandomKit;
```

- 内部用 `Alea(seed)` 实例化；每个助手是 `probabilityUtils` 对应函数的**闭包绑定版**——逻辑逐字复用（`gauss` 里 `randomNormal.source(() => next())`），仅把 `Math.random()` 换成 `next()`。
- **种子流**：`options.map.seed` 是唯一事实源。每个生成器的 `generate()` 入口 `const R = makeRandom(options.map.seed)`；派生种子（goods 的 `config.randomSeed`、provinces 的 `localSeed`）照旧传入 `makeRandom(derived)`。
- **并存**：`probabilityUtils` 的全局导出（`ra/rw/gauss/rand/P`）保持原样，controllers/components 继续用；工厂是新增。

### 二、生成器迁移模式与读点替换

样板（`river-generator.ts`）：

```ts
// before:
generate(allowErosion = true) {
  Math.random = Alea(options.map.seed);
  // ... Math.random() / ra() / rw() ...

// after:
generate(allowErosion = true) {
  const R = makeRandom(options.map.seed);
  // Math.random() → R.next()，ra(...) → R.ra(...)，rw(...) → R.rw(...)
```

- **等价性锚点**：Alea 算法不变（同 seed 同序列），只要每个 `Math.random()`/助手调用逐一替换为 `R.*` 且**调用顺序与次数完全不变**，输出即逐字节一致。
- **替换清单**：直接 `Math.random()` → `R.next()`；`ra/rw/gauss/rand/P(...)` → 对应 `R.*`。
- **写点删除**：12 处 `Math.random = Alea(...)` 全部删除——每个生成器自己的 Alea 从创建起就是干净的，无需“重置”。
- **Names 传递（已裁决选 b）**：`Names` 内部也读全局随机；为保序列，**需要保序的调用点把 `R` 传给 Names 的方法**（Names 的公开方法加 `R` 参数），而不是 Names 自起实例（会和主生成器脱钩、行为漂移）。

### 三、测试策略与迁移顺序

**锚点测试（golden determinism）**：迁移**前**，为每个要动的生成器加“固定种子 → 固定输出”黄金测试（复用 P2 golden 模式：固定 `options.map.seed` + mock pack，快照关键输出数组）。迁移**后**这些测试**不改断言**地通过——任何变化都说明替换漏了一处或顺序变了。

**迁移顺序**（按风险递增，每生成器独立提交、独立跑黄金测试）：

1. 低风险：`ice-generator`、`precipitation-generator`、`grid-generator`（读点少、无 Names 依赖）
2. 中风险：`river-generator`、`features-generator`、`goods-generator`、`markets-generator`、`provinces-generator`、`routes-generator`、`heightmap-generator`
3. 高风险（含 Names 传递）：`states-generator`、`cultures-generator`、`burgs-generator`、`religions-generator`、`markers-generator`、`names-generator`

每个迁移提交 = 黄金测试（先写，确认迁移前通过）+ 注入改动 + 该生成器测试全绿。

**守门**：全部迁移后 `grep -rn "Math.random = " src/generators` → 0、`grep -rn "Math.random()" src/generators` → 0（除测试/注释）。

### 四、边界、错误处理与验收

**边界（本阶段不做）**：不改 controllers/components 的 5 处写点；不改 `probabilityUtils` 全局导出签名；不改 `options.map.seed` 类型/语义；不清理测试里既有的 `Math.random = Alea(...)` 设置（变为无害冗余，后续清理）。

**错误处理**：`makeRandom` 接受 `string | number`；空字符串/`undefined` 抛清晰错误（当前 Alea 对 undefined 静默给默认序列，是隐患）。生成器入口不再有“PRNG 未初始化”类错误（`R` 局部构造）。

**验收标准**：

1. `makeRandom(seed)` 工厂存在，`RandomKit` 覆盖现有全部助手。
2. `grep -rn "Math.random = " src/generators` → 0；`grep -rn "Math.random()" src/generators` → 0（除测试/注释）。
3. 每个迁移生成器有“固定种子 → 固定输出”黄金测试，迁移前后断言不变。
4. `npx tsc --noEmit` + `biome check src` + 全量 vitest 全绿。
5. 手动验证：同一地图种子连点两次“重新生成”（states/cultures 等），结果一致。
6. spec 明示 Erase 模式行为可能变化并已固定新黄金。

**架构演进交代**：`makeRandom` 是纯函数式工厂——生成器实例可在 Worker 里独立构造（`postMessage` 传 seed + pack 序列化快照），为多线程生成铺路；随机性来源从“神秘全局”变“显式局部”，可单测、可替换。

## 已知变化（用户可感知）

- **features-generator Erase 模式**：`features-generator.ts:109` 故意重设种子以在 heightmap edit（Erase mode）时保序——这是与编辑器共用全局序列的隐式契约。注入化后该契约消失，Erase 模式结果可能与迁移前不同。**裁决：可接受**（编辑器场景的可复现性本非用户可感知契约），在 spec 明示并在该生成器黄金测试中固定新行为。
- **random-template mapSize**：`Coordinates` 注入后，随机模板的 mapSize/latitude 从“继承管线残留流”变为从 `makeRandom(options.map.seed)` 位置 0 起步——同一 seed 的随机模板地图（volcano/archipelago/continents… 加权 roll）的 mapSize/latitude 可能与迁移前不同；固定模板不受影响。已在 coordinates 黄金测试中固定新行为。
- **值级位移**：zones/journeys 的取值、feature 名称（culture 分支经 ambient `Names.getCulture` 在位移后的位置抽取）、states/burgs 的 coa 交错——与迁移前不同。
- **管线级位移（完整清单，最终评审核定）**：cultures 的选择/放置、burg 的放置/命名、states 的放置（管线路径）、religions、burgsSpecify 细节、state forms/taxes、military notes、markers——迁移前这些步骤消费共享流的残留位置，迁移后各自从全新的 `Alea(options.map.seed)` 位置 0 起步，输出与迁移前不同。
- **同一 seed 的全图与迁移前不同——这是移除共享全局流的必然结果；迁移后同一 seed 的全图是确定性的且可复现。**
- 手动“重新生成”（states/cultures 等）从“每次不同”变为“同种子一致”——这是**目标行为**（`States.recreate()` 已先行修复）。
- **政策注记（供 controllers 阶段）**：本阶段确立“generation path = kit, interactive path = ambient”契约——`grep "Math.random()" src/generators` 留有 12 处已核对的保留点（goods×3 编辑器 reroll 包装 + regenerate 路径、relief×6 渲染路径、routes×1 reroll 包装、markets×1 与 journey-story×1 ambient 兜底），均为有意保留，非泄漏；controllers 阶段沿用此契约。

### controllers 阶段收尾（2026-10-07 追加）

- **Rivers.specify 线程化**：`specify(R?: RandomKit)` 现在把 kit 传入 `getType`/`getName`；pipeline 两个调用点（`generation-pipeline.ts:41,90`）传 `makeRandom(options.map.seed)`，编辑器调用点（heightmap-editor、world-configurator）传新鲜种子保重掷 UX。**`provinces-generator.ts:89` 的最后一个生成器全局写点已删除**——`src/generators/` 目录现在零全局写点。河流类型/名字变为 provinces-kit 驱动（同种子确定性），值与迁移前不同（与本表同类偏移）。
- **5 处非生成器写点的处置**：`seed.ts:20`（喂 `options-model.randomize()`，真实下游消费者）与 `heightmap-editor.ts:1740`（编辑器路径）按政策**保留**；`heightmap-selection.ts:235,343,355`（模板预览渲染，无下游）也保留——它们自包含、按 seed 确定性、无害。统一收编是 controllers 阶段的后续项。
- **Names 交互调用点**（16 文件 25 处“摇名字”）：`Names` 方法已是可选 `R?` + 环境回退，交互点保持 ambient（重掷 UX 保留），**零代码改动**。

## 风险与备注

- 最大风险是**替换漏点或顺序漂移**导致输出变化——由黄金测试逐生成器拦截。
- `gauss`/`rw` 的逻辑有微妙处（加权表、正态源 `.source()`）——工厂版逐字复用，不重写。
- 迁移期间 `probabilityUtils` 全局导出与工厂并存是过渡态；controllers 阶段再统一。
