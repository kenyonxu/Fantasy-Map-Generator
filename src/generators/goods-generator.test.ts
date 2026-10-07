import Alea from "alea";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("GoodsModule", () => {
  let goodsModule: any;

  beforeEach(async () => {
    globalThis.TIME = false;
    options.map.seed = "seed";
    globalThis.window = globalThis.window || ({} as any);
    globalThis.grid = { cells: { temp: [20, 20, 20, 20] } } as any;
    globalThis.pack = {
      biomes: Array.from({ length: 20 }, (_, i) => ({ i, habitability: 50 })),
      cells: {
        i: [0, 1, 2, 3],
        biome: Uint8Array.from([0, 0, 0, 0]),
        h: Uint8Array.from([20, 20, 20, 20]),
        t: Uint16Array.from([1, 1, 1, 1]),
        r: Uint16Array.from([0, 0, 0, 0]),
        g: Uint16Array.from([0, 0, 0, 0]),
        f: Uint16Array.from([0, 0, 0, 0]),
        good: Uint16Array.from([1, 2, 1, 2])
      },
      features: [{ type: "land" }],
      goods: [
        {
          i: 1,
          name: "Custom A",
          tags: [],
          value: 1,
          unit: "unit",
          icon: "icon-a",
          color: "#ffffff",
          chance: 100,
          distribution: "true"
        },
        {
          i: 2,
          name: "Custom B",
          tags: [],
          value: 1,
          unit: "unit",
          icon: "icon-b",
          color: "#000000",
          chance: 100,
          distribution: "true"
        }
      ]
    } as any;

    const { GoodsModule } = await import("./goods-generator");
    goodsModule = new GoodsModule();
    globalThis.Goods = goodsModule as any;
  });

  it("keeps the current catalogue when rerolling placement", () => {
    goodsModule.generate({ randomSeed: 123 });

    expect(globalThis.pack.goods).toHaveLength(2);
    expect(globalThis.pack.goods[0].name).toBe("Custom A");
    expect(globalThis.pack.goods[1].name).toBe("Custom B");
  });

  it("restores the default catalogue when requested explicitly", () => {
    goodsModule.restoreDefaults();

    expect(globalThis.pack.goods.some((good: any) => good.name === "Wood")).toBe(true);
    expect(globalThis.pack.goods[0].name).not.toBe("Custom A");
  });

  it("restores the original defaults even after the current catalogue was edited", () => {
    goodsModule.generate();
    globalThis.pack.goods[0].name = "Edited Wood";

    goodsModule.restoreDefaults();

    expect(globalThis.pack.goods[0].name).toBe("Wood");
  });

  it("initialises the catalogue from defaults when none exists yet", () => {
    globalThis.pack.goods = [];
    goodsModule.generate();

    expect(globalThis.pack.goods.some((good: any) => good.name === "Wood")).toBe(true);
  });

  it("does not corrupt the default template when a restored good is edited", () => {
    goodsModule.restoreDefaults();
    const wood = globalThis.pack.goods.find((good: any) => good.name === "Wood")!;
    wood.name = "Edited Wood";

    goodsModule.restoreDefaults();

    expect(globalThis.pack.goods.find((good: any) => good.name === "Edited Wood")).toBeUndefined();
    expect(globalThis.pack.goods.some((good: any) => good.name === "Wood")).toBe(true);
  });

  it("clears a single good when it is no longer placeable", () => {
    globalThis.pack.goods[0].chance = 0;
    goodsModule.regeneratePlacement(1);

    const goodIds = Array.from(globalThis.pack.cells.good);
    expect(goodIds.some(id => id === 1)).toBe(false);
    expect(goodIds.filter(id => id === 2)).toHaveLength(2);
  });

  describe("placement compiles distribution once per good", () => {
    it("compiles each distribution once per generate, not once per cell", () => {
      const cellCount = 60;
      globalThis.pack.cells.i = Array.from({ length: cellCount }, (_, cellId) => cellId);
      globalThis.pack.cells.biome = Uint8Array.from({ length: cellCount }, () => 0);

      const OriginalFunction = globalThis.Function;
      let compiled = 0;
      globalThis.Function = new Proxy(OriginalFunction, {
        construct: (target, args) => {
          compiled += 1;
          return Reflect.construct(target, args);
        }
      });
      try {
        goodsModule.generate({ randomSeed: 42 });
      } finally {
        globalThis.Function = OriginalFunction;
      }

      const placed = Array.from(globalThis.pack.cells.good).filter(goodId => goodId !== 0);
      expect(placed).toHaveLength(6); // 2 goods, each capped at ceil(200 * 60 / 5000) = 3 cells
      expect(compiled).toBe(2); // one compile per good, not per placement
    });
  });
});

describe("Goods.generate golden (PRNG)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // Golden for the PRNG injection: generate() must place the same goods whether its draws
  // come from the ambient stream (pre-migration, seeded here) or the generator's own
  // seed-bound kit (post-migration) - both are Alea over the seed, drawn in the same order.
  it("reproduces the default catalogue placement from a fixed seed", async () => {
    globalThis.TIME = false;
    const { GoodsModule } = await import("./goods-generator");
    const goodsModule = new GoodsModule();
    globalThis.Goods = goodsModule as any;

    const n = 60;
    const col = (i: number) => i % 10;
    const h = Array.from({ length: n }, (_, i) => 20 + ((i * 7) % 56)); // 20..75
    globalThis.pack = {
      goods: [], // force restoreDefaults() so the full default catalogue is placed
      biomes: Array.from({ length: 20 }, (_, i) => ({ i, habitability: i === 11 ? 0 : 22 + i * 5 })),
      features: [0, { i: 1, type: "land" }],
      cells: {
        i: Array.from({ length: n }, (_, i) => i),
        biome: Array.from({ length: n }, (_, i) => (i % 12) as number),
        h,
        t: Array.from({ length: n }, (_, i) => (col(i) < 2 ? -1 : col(i) < 4 ? 1 : 2)),
        r: Array.from({ length: n }, (_, i) => +(col(i) === 5 && h[i] < 50)),
        g: Array.from({ length: n }, (_, i) => i % 6),
        f: Array.from({ length: n }, () => 1)
      }
    } as any;
    globalThis.grid = { cells: { temp: [24, 22, 19, 17, 15, 12] } } as any;

    options.map.seed = "goods-gold";
    vi.spyOn(Math, "random").mockImplementation(Alea("goods-gold") as () => number);

    goodsModule.generate();

    expect(Array.from(globalThis.pack.cells.good as Uint16Array)).toEqual([
      0, 0, 16, 2, 0, 0, 1, 0, 0, 0, 0, 0, 34, 0, 0, 0, 0, 0, 0, 0, 0, 0, 42, 0, 0, 0, 0, 0, 0, 1, 29, 4, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 34, 0, 0, 13, 7, 0, 0, 0, 0
    ]);
    expect(globalThis.pack.goods[0].visible).toBe(true);
  });
});
