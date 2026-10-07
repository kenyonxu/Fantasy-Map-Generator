import Alea from "alea";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { CapturedFeature, Feature } from "./features-generator";

const EMPTY = undefined; // pack.features holds a 0 placeholder and gaps where a feature id is unused

// pack cells 0-5 sit on grid cells 10-15; the feature ids per pack cell change when the graph is rebuilt
function setPack(featureIds: number[], features: (Partial<Feature> | undefined)[]): void {
  globalThis.pack = {
    cells: { f: Uint16Array.from(featureIds), g: [10, 11, 12, 13, 14, 15] },
    features
  } as unknown as typeof pack;
}

describe("feature user data across a re-markup", () => {
  beforeAll(async () => {
    await import("./features-generator");
  });

  beforeEach(() => {
    setPack(
      [1, 1, 1, 2, 2, 2],
      [EMPTY, { i: 1, name: "Mirror Lake", note: "Deep and cold" }, { i: 2, name: "Ald Sea" }]
    );
  });

  function capture(): CapturedFeature[] {
    return Features.captureUserData();
  }

  it("captures the grid cells a named or noted feature covered", () => {
    const captured = capture();

    expect(captured).toHaveLength(2);
    expect(captured[0]).toMatchObject({ name: "Mirror Lake", note: "Deep and cold" });
    expect([...captured[0].gridCells]).toEqual([10, 11, 12]);
  });

  it("hands the name and note to the new feature covering the same ground", () => {
    const captured = capture();

    // the graph is rebuilt: the lake is now feature 3 and lost a cell, the sea is feature 4
    setPack([3, 3, 0, 4, 4, 4], [EMPTY, EMPTY, EMPTY, { i: 3, name: "Generated" }, { i: 4, name: "Renamed" }]);
    Features.restoreUserData(captured);

    expect(pack.features[3]).toMatchObject({ name: "Mirror Lake", note: "Deep and cold" });
    expect(pack.features[4].name).toBe("Ald Sea");
  });

  it("drops the data when most of the old feature is gone", () => {
    const captured = capture();

    // only one of the lake's three grid cells is still a lake
    setPack([5, 0, 0, 4, 4, 4], [EMPTY, EMPTY, EMPTY, EMPTY, { i: 4 }, { i: 5, name: "Generated" }]);
    Features.restoreUserData(captured);

    expect(pack.features[5]).toMatchObject({ name: "Generated" });
    expect(pack.features[5].note).toBeUndefined();
  });

  it("gives one old feature to one new feature, best overlap first", () => {
    const captured = capture();

    // both old features now fall inside a single merged body of water
    setPack([3, 3, 3, 3, 3, 3], [EMPTY, EMPTY, EMPTY, { i: 3, name: "Generated" }]);
    Features.restoreUserData(captured);

    expect(pack.features[3].name).toBe("Mirror Lake");
    expect(pack.features[3].note).toBe("Deep and cold");
  });

  it("does not hand a lake's data to the island that replaced it", () => {
    setPack(
      [1, 1, 1, 2, 2, 2],
      [
        EMPTY,
        { i: 1, name: "Mirror Lake", note: "Deep and cold", type: "lake" },
        { i: 2, name: "Ald Sea", type: "ocean" }
      ]
    );
    const captured = capture();

    // the lake bed was raised, so the same ground is now part of an island
    setPack(
      [3, 3, 3, 4, 4, 4],
      [EMPTY, EMPTY, EMPTY, { i: 3, name: "Generated", type: "island" }, { i: 4, name: "Renamed", type: "ocean" }]
    );
    Features.restoreUserData(captured);

    expect(pack.features[3]).toMatchObject({ name: "Generated" });
    expect(pack.features[3].note).toBeUndefined();
    expect(pack.features[4].name).toBe("Ald Sea");
  });

  it("does nothing without a capture", () => {
    expect(() => Features.restoreUserData([])).not.toThrow();
  });

  it("carries own coastline settings to the new feature", () => {
    const coastline = { enabled: false } as Feature["coastline"];
    setPack([1, 1, 1, 2, 2, 2], [EMPTY, { i: 1, type: "lake" }, { i: 2, type: "island", coastline }]);
    const captured = capture();

    setPack([3, 3, 3, 4, 4, 4], [EMPTY, EMPTY, EMPTY, { i: 3, type: "lake" }, { i: 4, type: "island" }]);
    Features.restoreUserData(captured);

    expect(pack.features[4].coastline).toBe(coastline);
  });
});

describe("feature naming", () => {
  beforeAll(async () => {
    await import("./features-generator");
  });

  beforeEach(() => {
    // cells: 0 island (culture 1), 1 land shore of the lake (culture 2), 2 lake, 3 ocean
    globalThis.pack = {
      cells: {
        i: [0, 1, 2, 3],
        culture: [1, 2, 0, 0],
        p: [
          [10, 10],
          [20, 10],
          [30, 10],
          [5, 50]
        ]
      },
      cultures: [{ base: 0 }, { base: 1 }, { base: 2 }],
      features: [
        undefined,
        { i: 1, type: "island", firstCell: 0 },
        { i: 2, type: "lake", firstCell: 2, shoreline: [1] },
        { i: 3, type: "ocean", firstCell: 3, cells: 50 },
        { i: 4, type: "ocean", firstCell: 3, cells: 1, name: "Kept Sea" }
      ]
    } as unknown as typeof pack;
    globalThis.grid = { cells: { i: new Array(1000) } } as unknown as typeof grid;
    globalThis.options = { map: { seed: "1", graph: { width: 100, height: 100 } } } as unknown as typeof options;
    globalThis.Names = { getCulture: (culture: number) => `name-of-${culture}` } as unknown as typeof Names;
  });

  it("takes the culture of the first cell for islands and of a shore cell for lakes", () => {
    Math.random = () => 0.5; // no adjective roll
    expect(Features.getName(pack.features[1])).toBe("name-of-1");
    expect(Features.getName(pack.features[2])).toBe("name-of-2");
  });

  it("sizes the ocean subtype by cell count", () => {
    expect(Features.getOceanSubtype(pack.features[3])).toBe("ocean");
    expect(Features.getOceanSubtype({ cells: 5 } as Feature)).toBe("sea");
    expect(Features.getOceanSubtype(pack.features[4])).toBe("gulf");
  });

  it("names oceans with an adjective or a map side instead of a culture name", () => {
    for (let i = 0; i < 20; i++) {
      expect(Features.getName(pack.features[3])).toMatch(/^(\w+|Western|Eastern|Northern|Southern)$/);
      expect(Features.getName(pack.features[3])).not.toMatch(/^name-of-/);
    }
  });

  it("names only the features without a name", () => {
    Features.defineNames();
    expect(pack.features[1].name).toBe("name-of-1");
    expect(pack.features[3].name).toBeTruthy();
    expect(pack.features[3].name).not.toMatch(/^name-of-/);
    expect(pack.features[4].name).toBe("Kept Sea");
  });
});

// PRNG injection ruling (spec "已知变化"): markupGrid's re-seed of the global stream — kept so a
// heightmap edit in Erase mode replayed the same sequence — dies with injection, and Erase-mode
// output may differ from pre-migration. This golden locks the NEW post-migration behavior: markup
// output is randomness-free and naming depends only on options.map.seed, never on how much stale
// global stream was consumed before (the junk rolls below). Pre-migration the :517 re-seed wiped
// them; post-migration defineNames draws from its own seed-bound kit — same names either way.
describe("feature markup and naming golden (PRNG injection)", () => {
  let Features: any;

  beforeAll(async () => {
    globalThis.window = globalThis.window || ({} as any);
    await import("./features-generator");
    Features = (globalThis as any).Features;
  });

  function buildFixture(seed = "golden-seed") {
    globalThis.options = { map: { seed, graph: { width: 100, height: 100 } } } as unknown as typeof options;
    globalThis.grid = {
      cells: {
        i: new Array(5),
        h: [30, 10, 25, 10, 10],
        c: [[1, 2], [0, 3], [0, 3], [1, 2, 4], [3]],
        b: [0, 0, 0, 0, 1]
      }
    } as unknown as typeof grid;
    globalThis.Names = { getCulture: (culture: number) => `name-of-${culture}` } as unknown as typeof Names;
    // cells: 0 island (culture 1), 1 land shore of the lake (culture 2), 2 lake, 3 ocean, 4 named ocean
    globalThis.pack = {
      cells: {
        culture: [1, 2, 0, 0],
        p: [
          [10, 10],
          [20, 10],
          [30, 10],
          [5, 50]
        ]
      },
      cultures: [{ base: 0 }, { base: 1 }, { base: 2 }],
      features: [
        undefined,
        { i: 1, type: "island", firstCell: 0 },
        { i: 2, type: "lake", firstCell: 2, shoreline: [1] },
        { i: 3, type: "ocean", firstCell: 3, cells: 50 },
        { i: 4, type: "ocean", firstCell: 3, cells: 1, name: "Kept Sea" }
      ]
    } as unknown as typeof pack;
  }

  function runMarkupAndNaming(seed = "golden-seed") {
    globalThis.options.map.seed = seed;
    Math.random = Alea(seed);
    for (let i = 0; i < 5; i++) Math.random(); // stale editor-stream consumption before the markup
    Features.markupGrid();
    for (let i = 0; i < 3; i++) Math.random(); // steps between the markup and the naming
    Features.defineNames();
    return {
      t: Array.from(globalThis.grid.cells.t),
      f: Array.from(globalThis.grid.cells.f),
      gridFeatures: JSON.parse(JSON.stringify(globalThis.grid.features)),
      names: globalThis.pack.features.map((feature: Feature | undefined) => feature?.name)
    };
  }

  it("marks grid features and names pack features deterministically from the seed alone", () => {
    buildFixture();
    const run = runMarkupAndNaming();
    expect(run.t).toEqual([1, -1, 1, -1, -2]);
    expect(run.f).toEqual([1, 2, 1, 2, 2]);
    expect(run.gridFeatures).toEqual([
      0,
      { i: 1, land: true, border: false, type: "island" },
      { i: 2, land: false, border: true, type: "ocean" }
    ]);
    expect(run.names).toEqual([undefined, "name-of-1", "name-of-2", "Cold", "Kept Sea"]);
  });

  it("reproduces the same names on a fresh reseed", () => {
    buildFixture();
    const first = runMarkupAndNaming();
    buildFixture();
    expect(runMarkupAndNaming()).toEqual(first);
  });

  it("rolls different names under a different seed", () => {
    buildFixture();
    const baseline = runMarkupAndNaming();
    buildFixture();
    expect(runMarkupAndNaming("golden-seed-6").names).not.toEqual(baseline.names); // Cold vs Shining
  });
});
