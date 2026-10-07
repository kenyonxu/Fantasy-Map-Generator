import Alea from "alea";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MIN_NAVIGABLE_FLUX } from "./river-generator";

describe("RiverModule helpers", () => {
  let Rivers: any;

  beforeEach(async () => {
    globalThis.TIME = false;
    globalThis.window = globalThis.window || ({} as any);
    globalThis.pack = {
      cells: { r: [], fl: [], f: [] },
      features: [],
      rivers: []
    } as any;

    await import("./river-generator");
    Rivers = (globalThis as any).Rivers;
  });

  function setCells(cells: { r?: number[]; fl?: number[]; f?: number[] }) {
    globalThis.pack.cells = { r: [], fl: [], f: [], ...cells } as any;
  }

  describe("isNavigable", () => {
    it("returns true when cell has a river and flux meets the threshold", () => {
      setCells({ r: [0, 1, 1], fl: [0, MIN_NAVIGABLE_FLUX, MIN_NAVIGABLE_FLUX + 50] });
      expect(Rivers.isNavigable(1)).toBe(true);
      expect(Rivers.isNavigable(2)).toBe(true);
    });

    it("returns false for cells with no river", () => {
      setCells({ r: [0, 0], fl: [500, 500] });
      expect(Rivers.isNavigable(0)).toBe(false);
    });

    it("returns false for river cells below the threshold", () => {
      setCells({ r: [0, 1], fl: [0, MIN_NAVIGABLE_FLUX - 1] });
      expect(Rivers.isNavigable(1)).toBe(false);
    });
  });

  describe("resolveDrainFeature", () => {
    it("returns the ocean feature id when river drains into the sea", () => {
      // cell 5 is the river-bearing land cell; cell 6 is the sea cell at the mouth
      setCells({ r: [0, 0, 0, 0, 0, 1, 0], f: [0, 0, 0, 0, 0, 0, 2] });
      globalThis.pack.features = [null, null, { i: 2, type: "ocean" }] as any;
      globalThis.pack.rivers = [{ i: 1, cells: [5, 6] }] as any;

      expect(Rivers.resolveDrainFeature(5)).toBe(2);
    });

    it("returns the closed lake feature id when river terminates in a closed lake", () => {
      setCells({ r: [0, 0, 1, 0], f: [0, 0, 0, 3] });
      globalThis.pack.features = [
        null,
        null,
        null,
        { i: 3, type: "lake" } // no outlet => closed
      ] as any;
      globalThis.pack.rivers = [{ i: 1, cells: [2, 3] }] as any;

      expect(Rivers.resolveDrainFeature(2)).toBe(3);
    });

    it("follows lake outlet onward to the final receiving sea", () => {
      // river 1 ends in lake (feature 3, has outlet to river 2); river 2 ends in ocean (feature 4)
      setCells({ r: [0, 1, 0, 2, 0], f: [0, 0, 3, 0, 4] });
      globalThis.pack.features = [null, null, null, { i: 3, type: "lake", outlet: 2 }, { i: 4, type: "ocean" }] as any;
      globalThis.pack.rivers = [
        { i: 1, cells: [1, 2] },
        { i: 2, cells: [3, 4] }
      ] as any;

      expect(Rivers.resolveDrainFeature(1)).toBe(4);
    });

    it("returns null when river leaves the map", () => {
      setCells({ r: [0, 1], f: [0, 0] });
      globalThis.pack.features = [null, null] as any;
      globalThis.pack.rivers = [{ i: 1, cells: [1, -1] }] as any;

      expect(Rivers.resolveDrainFeature(1)).toBeNull();
    });

    it("returns null for a cell with no river", () => {
      setCells({ r: [0, 0] });
      expect(Rivers.resolveDrainFeature(0)).toBeNull();
    });
  });

  describe("resolveLakeDrainFeature", () => {
    it("returns the ocean feature id when the lake outlet chain reaches the sea", () => {
      // lake feature 2 has outlet river 1; river 1 ends in ocean feature 3
      setCells({ r: [0, 1, 0], f: [0, 0, 3] });
      globalThis.pack.features = [null, null, { i: 2, type: "lake", outlet: 1 }, { i: 3, type: "ocean" }] as any;
      globalThis.pack.rivers = [{ i: 1, cells: [1, 2] }] as any;

      expect(Rivers.resolveLakeDrainFeature(2)).toBe(3);
    });

    it("follows a chain through an intermediate open lake to reach the ocean", () => {
      // lake 2 → river 1 → lake 3 (open) → river 2 → ocean 4
      setCells({ r: [0, 1, 0, 2, 0], f: [0, 0, 3, 0, 4] });
      globalThis.pack.features = [
        null,
        null,
        { i: 2, type: "lake", outlet: 1 },
        { i: 3, type: "lake", outlet: 2 },
        { i: 4, type: "ocean" }
      ] as any;
      globalThis.pack.rivers = [
        { i: 1, cells: [1, 2] }, // river 1 drains lake 2 into lake 3
        { i: 2, cells: [3, 4] } // river 2 drains lake 3 into ocean 4
      ] as any;

      expect(Rivers.resolveLakeDrainFeature(2)).toBe(4);
    });

    it("returns the closed downstream lake feature id when the chain terminates there", () => {
      // lake 2 (open) → river 1 → lake 3 (closed, no outlet)
      setCells({ r: [0, 1, 0], f: [0, 0, 3] });
      globalThis.pack.features = [
        null,
        null,
        { i: 2, type: "lake", outlet: 1 },
        { i: 3, type: "lake" } // no outlet — closed
      ] as any;
      globalThis.pack.rivers = [{ i: 1, cells: [1, 2] }] as any;

      expect(Rivers.resolveLakeDrainFeature(2)).toBe(3);
    });

    it("returns null when the outlet river exits the map", () => {
      setCells({ r: [0, 1], f: [0, 0] });
      globalThis.pack.features = [null, null, { i: 2, type: "lake", outlet: 1 }] as any;
      globalThis.pack.rivers = [{ i: 1, cells: [1, -1] }] as any;

      expect(Rivers.resolveLakeDrainFeature(2)).toBeNull();
    });

    it("returns the lake's own feature id when the lake has no outlet (closed lake)", () => {
      globalThis.pack.features = [null, null, { i: 2, type: "lake" }] as any;
      globalThis.pack.rivers = [] as any;

      expect(Rivers.resolveLakeDrainFeature(2)).toBe(2);
    });

    it("returns null for a non-lake feature id", () => {
      globalThis.pack.features = [null, null, { i: 2, type: "ocean" }] as any;
      globalThis.pack.rivers = [] as any;

      expect(Rivers.resolveLakeDrainFeature(2)).toBeNull();
    });

    it("returns null for an unknown feature id", () => {
      globalThis.pack.features = [null] as any;
      globalThis.pack.rivers = [] as any;

      expect(Rivers.resolveLakeDrainFeature(99)).toBeNull();
    });
  });
});

describe("RiverModule.rename", () => {
  it("renames a river by id and keeps its custom label pattern", async () => {
    await import("./river-generator");
    globalThis.pack = { rivers: [{ i: 7, name: "Ald", type: "River", label: { text: "Ald Falls" } }] } as any;
    (globalThis as any).Rivers.rename(7, "Brae");
    expect(pack.rivers[0]).toMatchObject({ name: "Brae", label: { text: "Brae Falls" } });
    expect(() => (globalThis as any).Rivers.rename(1, "X")).toThrow("River 1 does not exist");
  });
});

describe("river type threshold", () => {
  it("recomputes smallLength on each generate", async () => {
    // all-water stub: generate() runs end to end without forming rivers
    globalThis.pack = {
      cells: {
        i: [0, 1, 2],
        c: [[1], [0, 2], [1]],
        h: [10, 10, 10],
        t: [0, 0, 0],
        b: [0, 0, 0],
        f: [0, 0, 0],
        g: [0, 0, 0],
        p: [
          [0, 0],
          [10, 0],
          [20, 0]
        ]
      },
      features: [],
      rivers: []
    } as any;
    globalThis.grid = { cells: { prec: [5, 5, 5] }, points: [0, 0] } as any;
    (globalThis as any).Lakes = {
      detectCloseLakes: () => {},
      defineClimateData: () => [],
      cleanupLakeData: () => {}
    };

    await import("./river-generator");
    const Rivers = (globalThis as any).Rivers;

    Rivers.smallLength = 5; // simulate a previous map's stale cache
    Rivers.generate(false);
    expect(Rivers.smallLength).not.toBe(5); // generate must clear it before use
  });
});

describe("addDownhill cell 0", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("claims cell 0 instead of skipping it as a sentinel", async () => {
    // a 3-cell slope: cell 0 (highest) -> cell 1 -> cell 2 (water, h<20)
    globalThis.grid = { cells: { prec: [5, 5, 5] }, points: [0, 0] } as any;
    globalThis.pack = {
      cells: {
        i: [0, 1, 2],
        c: [[1], [0, 2], [1]], // adjacency
        g: [0, 1, 2],
        h: [30, 25, 10], // 10 < 20 => water at cell 2
        p: [
          [0, 0],
          [10, 0],
          [20, 0]
        ],
        fl: [0, 0, 0],
        r: [0, 0, 0],
        conf: [0, 0, 0],
        b: [0, 0, 0],
        f: [0, 0, 1],
        culture: [0, 0, 0]
      },
      features: [null, { type: "ocean" }],
      rivers: []
    } as any;
    (globalThis as any).Names = { getCulture: () => "Ald" };

    await import("./river-generator");
    const Rivers = (globalThis as any).Rivers;
    // keep the test focused on the while condition
    vi.spyOn(Rivers, "alterHeights").mockReturnValue([30, 25, 10]);
    vi.spyOn(Rivers, "resolveDepressions").mockReturnValue(undefined);

    Rivers.addDownhill(0);
    expect(globalThis.pack.cells.r[0]).not.toBe(0); // cell 0 was claimed by a river
  });
});

// PRNG injection golden: generate() consumes no randomness itself (meander and Lakes are pure), so the
// seeding that matters is the test's Alea(options.map.seed) and the global draws specify() makes for
// river types. generate()'s own global re-seed removal must not move a single draw.
describe("river generation golden (PRNG injection)", () => {
  let Rivers: any;

  beforeAll(async () => {
    globalThis.window = globalThis.window || ({} as any);
    await import("./river-generator");
    Rivers = (globalThis as any).Rivers;
  });

  // two valleys: river 1 (cells 0-1) joins river 2 (cells 6-2-3-4) which exits into the ocean at cell 5
  function buildFixture() {
    globalThis.TIME = false;
    globalThis.WARN = false;
    globalThis.options = {
      map: { seed: "golden-seed", graph: { points: 10000, width: 100, height: 100 } },
      generation: { resolveDepressionsSteps: 250 }
    } as any;
    globalThis.grid = { cells: { prec: [40, 40, 40, 40, 40, 40, 40, 40] } } as any;
    globalThis.Lakes = {
      detectCloseLakes: () => {},
      defineClimateData: () => [],
      cleanupLakeData: () => {}
    } as any;
    globalThis.Names = { getCulture: () => "Ald" } as any;
    globalThis.pack = {
      cells: {
        i: [0, 1, 2, 3, 4, 5, 6, 7],
        c: [[1], [0, 2], [1, 3, 7], [2, 4], [3, 5], [4], [7], [6, 2]],
        g: [0, 1, 2, 3, 4, 5, 6, 7],
        h: [40, 35, 30, 25, 20, 10, 38, 36],
        t: [1, 1, 1, 1, 1, 0, 1, 1],
        b: [0, 0, 0, 0, 0, 0, 0, 0],
        f: [1, 1, 1, 1, 1, 1, 1, 1],
        haven: [0, 0, 0, 0, 0, 0, 0, 0],
        p: [
          [10, 20],
          [20, 20],
          [30, 20],
          [40, 20],
          [50, 20],
          [60, 20],
          [25, 10],
          [27, 15]
        ],
        culture: [0, 0, 0, 0, 0, 0, 0, 0]
      },
      features: [0, { i: 1, type: "ocean" }], // pack.features[0] is the real module's numeric placeholder
      rivers: []
    } as any;
  }

  function runGeneration(seed = "golden-seed") {
    globalThis.options.map.seed = seed;
    Math.random = Alea(seed);
    Rivers.generate(true);
    Rivers.specify();
    return {
      cellsR: Array.from(globalThis.pack.cells.r),
      rivers: JSON.parse(JSON.stringify(globalThis.pack.rivers))
    };
  }

  it("generates cells.r and pack.rivers deterministically from the seeded stream", () => {
    buildFixture();
    const run = runGeneration();
    expect(run.cellsR).toEqual([1, 1, 1, 2, 2, 0, 2, 2]);
    expect(run.rivers).toEqual([
      {
        i: 1,
        source: 0,
        mouth: 1,
        discharge: 80,
        length: 20.99,
        width: 0.04,
        widthFactor: 1,
        sourceWidth: 0.06,
        parent: 2,
        cells: [0, 1, 2],
        basin: 2,
        name: "Ald",
        type: "Creek"
      },
      {
        i: 2,
        source: 6,
        mouth: 4,
        discharge: 280,
        length: 42.85,
        width: 0.12,
        widthFactor: 1.2,
        sourceWidth: 0.06,
        parent: 2,
        cells: [6, 7, 2, 3, 4, 5],
        basin: 2,
        name: "Ald",
        type: "River"
      }
    ]);
  });

  it("reproduces the same output on a fresh reseed", () => {
    buildFixture();
    const first = runGeneration();
    buildFixture();
    expect(runGeneration()).toEqual(first);
  });

  it("rolls different river types under a different seed", () => {
    buildFixture();
    const baseline = runGeneration();
    buildFixture();
    expect(runGeneration("golden-seed-6").rivers).not.toEqual(baseline.rivers); // Creek vs Brook
  });

  it("kit-driven specify produces deterministic river types from the seed", async () => {
    const { makeRandom } = await import("@/utils/random");
    buildFixture();
    globalThis.options.map.seed = "golden-seed";
    Math.random = Alea("golden-seed");
    Rivers.generate(true);
    Rivers.specify(makeRandom("golden-seed")); // pipeline path: kit-bound
    const first = globalThis.pack.rivers.map((r: any) => r.type);

    buildFixture();
    globalThis.options.map.seed = "golden-seed";
    Math.random = Alea("golden-seed");
    Rivers.generate(true);
    Rivers.specify(makeRandom("golden-seed"));
    const second = globalThis.pack.rivers.map((r: any) => r.type);

    expect(second).toEqual(first); // same seed → same types via kit
  });
});
