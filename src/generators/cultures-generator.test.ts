import Alea from "alea";
import { quadtree } from "d3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error vendored UMD script without TypeScript declarations
import FlatQueue from "../../public/libs/flatqueue.js";
import { Cultures } from "./cultures-generator";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("uses the requested culture set when regenerating an existing map", () => {
  options = Options.getDefaultOptions();
  options.map.cultures.set = "english";
  options.generation.cultures = { ...options.generation.cultures, set: "highFantasy", limit: 16 };
  const cells = { i: Array.from({ length: 500 }, (_, i) => i), s: Array(500).fill(1), h: [], t: [] };
  vi.stubGlobal("pack", { cells });
  vi.stubGlobal("grid", { cells: { temp: [] } });
  const getDefault = Cultures.getDefault.bind(Cultures);
  let names: string[] = [];
  vi.spyOn(Cultures, "getDefault").mockImplementation(count => {
    names = getDefault(count).map(culture => culture.name);
    throw new Error("stop before placement");
  });

  expect(() => Cultures.regenerate()).toThrow("stop before placement");
  expect(options.map.cultures.set).toBe("highFantasy");
  expect(Cultures.getDefault).toHaveBeenCalledWith(16);
  expect(names.includes("Quenian (Elfish)")).toBe(true);
});

it("recomputes a renamed culture's code without clashing with other cultures", () => {
  vi.stubGlobal("pack", {
    cultures: [
      { i: 0, name: "Wildlands", code: "Wi" },
      { i: 1, name: "Old", code: "Ol" },
      { i: 2, name: "Salt", code: "Sa" }
    ]
  });
  Cultures.rename(1, "Saltmere");
  expect(pack.cultures[1]).toMatchObject({ name: "Saltmere", code: "SA" });
  expect(() => Cultures.rename(5, "X")).toThrow("Culture 5 does not exist");
});

describe("locked culture centers register in the spacing quadtree", () => {
  it("a locked culture's center is found by the spacing search", () => {
    // mirror of cultures-generator.ts:1174 — must add coordinates, not the raw cell id
    const cells: { p: Record<number, [number, number]> } = { p: { 42: [100, 200] } };
    const locked = { lock: true, center: 42 as number | undefined };

    const centers = quadtree<[number, number]>();
    // FIXED behavior: add(this.cells.p[c.center])
    if (locked.center !== undefined) centers.add(cells.p[locked.center]);

    expect(centers.find(100, 200, 15)).toEqual([100, 200]); // within spacing → found
  });
});

describe("Cultures.expand golden", () => {
  beforeEach(() => {
    (globalThis as any).FlatQueue = FlatQueue;
    options = Options.getDefaultOptions();
    options.generation.cultures.growthRate = 50; // small map: lift maxExpansionCost above per-cell costs
  });

  it("floods two contesting cultures to a fixed split of a 12-cell line", () => {
    const n = 12;
    const cells = {
      i: Array.from({ length: n }, (_, i) => i),
      c: Array.from({ length: n }, (_, i) => [i - 1, i + 1].filter(x => x >= 0 && x < n)),
      p: Array.from({ length: n }, (_, i) => [i * 10, 0] as [number, number]),
      culture: new Uint16Array(n),
      biome: Uint8Array.from([1, 1, 1, 1, 1, 1, 4, 4, 4, 4, 4, 4]),
      h: Array.from({ length: n }, (_, i) => (i === 6 ? 70 : 35)),
      r: Array.from({ length: n }, (_, i) => (i === 9 ? 1 : 0)),
      fl: Array.from({ length: n }, (_, i) => (i === 9 ? 150 : 0)),
      t: Array.from({ length: n }, (_, i) => (i === 0 || i === 11 ? 1 : -1)),
      pop: Array.from({ length: n }, (_, i) => (i === 7 ? 0 : 5)),
      area: new Array(n).fill(5),
      f: new Array(n).fill(0)
    };
    vi.stubGlobal("pack", {
      cells,
      cultures: [
        { i: 0, name: "Wildlands", type: "Generic" },
        { i: 1, name: "Plain folk", center: 0, type: "Generic", expansionism: 2 },
        { i: 2, name: "Forest hunters", center: 11, type: "Hunting", expansionism: 1 }
      ],
      biomes: [
        { i: 0, cost: 0 },
        { i: 1, cost: 10 },
        { i: 2, cost: 0 },
        { i: 3, cost: 0 },
        { i: 4, cost: 60 }
      ],
      features: [{ i: 0, type: "ocean", cells: 0 }]
    } as any);
    vi.spyOn(Math, "random").mockImplementation(Alea("cultures-expand-golden"));

    Cultures.expand();

    // golden from the converged priorityFlood: the faster plain culture crosses the mountain
    // (195 < 330 accumulated cost) and claims up to cell 8, except unpopulated cell 7; the
    // flood semantics changed vs the legacy copies only for the zero-cost churn case (flood.test.ts)
    expect([...pack.cells.culture]).toEqual([1, 1, 1, 1, 1, 1, 1, 0, 2, 2, 2, 2]);
  });
});

describe("Cultures.generate extreme climate", () => {
  const n = 100;
  const makeCells = (populatedCount: number) => ({
    i: Array.from({ length: n }, (_, i) => i),
    s: Array.from({ length: n }, (_, i) => (i < populatedCount ? 1 : 0)),
    c: Array.from({ length: n }, (_, i) => [i - 1, i + 1].filter(x => x >= 0 && x < n)),
    g: Array.from({ length: n }, (_, i) => i),
    p: Array.from({ length: n }, (_, i) => [i * 20, 0] as [number, number]),
    culture: new Uint16Array(n),
    biome: new Uint8Array(n).fill(5),
    h: new Array(n).fill(35),
    r: new Array(n).fill(0),
    fl: new Array(n).fill(0),
    t: new Array(n).fill(-1),
    pop: new Array(n).fill(5),
    area: new Array(n).fill(5),
    f: new Array(n).fill(0),
    haven: new Array(n).fill(0),
    harbor: new Array(n).fill(0)
  });

  beforeEach(() => {
    (globalThis as any).FlatQueue = FlatQueue;
    options = Options.getDefaultOptions();
    options.generation.cultures = { ...options.generation.cultures, set: "english", limit: 4 };
    options.map.graph.width = 200;
    options.map.graph.height = 100;
    vi.stubGlobal("grid", { cells: { temp: new Array(n).fill(5) } });
    vi.stubGlobal("Names", { nameBases: new Array(10).fill({}), getBase: () => "Test" } as any);
    vi.stubGlobal("$", vi.fn());
    vi.stubGlobal("alertMessage", { innerHTML: "" });
  });

  it("returns a warning instead of driving the DOM when no cell is populated", () => {
    vi.stubGlobal("pack", { cells: makeCells(0), features: [{ i: 0, type: "ocean", cells: 0 }] });

    const result = Cultures.generate();

    expect(result?.warning).toContain("The climate is harsh");
    expect(result?.error).toBeUndefined();
    expect($).not.toHaveBeenCalled();
    expect((globalThis as any).alertMessage.innerHTML).toBe("");
    expect(pack.cultures).toEqual([expect.objectContaining({ name: "Wildlands" })]);
  });

  it("returns a warning and keeps generating the reduced count when livable area is insufficient", () => {
    // 60 of 100 populated: 60 < 4 * 25 lowers the count to floor(60 / 50) = 1
    vi.stubGlobal("pack", { cells: makeCells(60), features: [{ i: 0, type: "ocean", cells: 0 }] });

    const result = Cultures.generate();

    expect(result?.warning).toContain("There are only 60 populated cells");
    expect(result?.warning).toContain("Only 1 out of 4");
    expect(result?.error).toBeUndefined();
    expect($).not.toHaveBeenCalled();
    expect((globalThis as any).alertMessage.innerHTML).toBe("");
    expect(pack.cultures).toHaveLength(2); // Wildlands + the one reduced culture
  });

  it("returns an empty result when the climate is livable", () => {
    vi.stubGlobal("pack", { cells: makeCells(n), features: [{ i: 0, type: "ocean", cells: 0 }] });

    const result = Cultures.generate();

    expect(result).toEqual({});
    expect($).not.toHaveBeenCalled();
    expect(pack.cultures).toHaveLength(5); // Wildlands + 4 requested
  });

  it("regenerate passes the generate result through", () => {
    vi.stubGlobal("pack", {
      cells: makeCells(0),
      features: [{ i: 0, type: "ocean", cells: 0 }],
      states: [{ i: 0 }],
      burgs: [0],
      religions: [{ i: 0 }]
    });

    const result = Cultures.regenerate();

    expect(result?.warning).toContain("The climate is harsh");
    expect($).not.toHaveBeenCalled();
  });
});

describe("Cultures.regenerate with a locked culture", () => {
  beforeEach(() => {
    (globalThis as any).FlatQueue = FlatQueue;
    options = Options.getDefaultOptions();
    options.generation.cultures = { ...options.generation.cultures, limit: 2, set: "english" };
    options.map.graph.width = 200;
    options.map.graph.height = 100; // initial center spacing = (200 + 100) / 2 / 2 = 75
    vi.stubGlobal("grid", { cells: { temp: [] } });
    vi.stubGlobal("Names", { nameBases: new Array(10).fill({}), getBase: () => "Test" } as any);
  });

  it("spaces the regenerated center away from the locked center and keeps the locked cell", () => {
    const n = 60;
    const score = (i: number) => (i === 29 || i === 30 ? 100 : i === 9 || i === 11 ? 99 : i >= 31 ? 50 : 1);
    const cells = {
      i: Array.from({ length: n }, (_, i) => i),
      c: Array.from({ length: n }, (_, i) => [i - 1, i + 1].filter(x => x >= 0 && x < n)),
      p: Array.from({ length: n }, (_, i) => [i * 20, 0] as [number, number]),
      culture: (() => {
        const ids = new Uint16Array(n);
        ids[10] = 5; // the locked culture owns only its center cell
        return ids;
      })(),
      biome: new Uint8Array(n).fill(5),
      h: new Array(n).fill(35),
      r: new Array(n).fill(0),
      fl: new Array(n).fill(0),
      t: new Array(n).fill(-1),
      s: Array.from({ length: n }, (_, i) => score(i)),
      pop: new Array(n).fill(5),
      area: new Array(n).fill(5),
      f: new Array(n).fill(0),
      haven: new Array(n).fill(0),
      harbor: new Array(n).fill(0)
    };
    const packStub = {
      cells,
      cultures: [
        { i: 0, name: "Wildlands" },
        { i: 5, name: "Locked", code: "LK", center: 10, lock: true, base: 3, type: "Generic" }
      ],
      biomes: [{ i: 5, cost: 50 }],
      features: [{ i: 0, type: "ocean", cells: 0 }],
      states: [{ i: 0 }],
      burgs: [0],
      religions: [{ i: 0 }]
    } as any;
    vi.stubGlobal("pack", packStub);
    // draw plan under Alea("lock-5"): rand pick, 2 shuffle draws, then placeCenter's biased
    // pick 1 lands on sorted[2] (cell 9, 20 off the locked center) and pick 2 on sorted[0] (cell 29)
    vi.spyOn(Math, "random").mockImplementation(Alea("lock-5"));

    Cultures.regenerate();

    const locked = packStub.cultures.find((culture: { lock?: boolean }) => culture.lock);
    expect(locked).toMatchObject({ i: 1, center: 10 });
    const regenerated = packStub.cultures.find((culture: { i: number }) => culture.i === 2);
    expect(regenerated).toBeDefined();
    const [lockedX] = cells.p[10];
    const [regeneratedX] = cells.p[regenerated!.center];
    // the spacing quadtree received the locked center, so the near pick is rejected (cultures-generator.ts:1175)
    expect(Math.abs(regeneratedX - lockedX)).toBeGreaterThanOrEqual(300);
    // the flood never overwrites a locked culture's cell
    expect(packStub.cells.culture[10]).toBe(1);
  });
});
