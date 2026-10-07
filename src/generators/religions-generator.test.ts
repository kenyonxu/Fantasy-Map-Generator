import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { isWater } from "../utils";
import type { Religion } from "./religions-generator";
import { type Route, Routes } from "./routes-generator";

interface TestableReligionsModule {
  add(x: number, y: number): number;
  combineReligions(namedReligions: Religion[], lockedReligions: Religion[]): Religion[];
  createHeresy(parent: Religion, center: number, i: number, codes: string[]): Religion;
  defineOrigins(religionIds: Uint16Array, indexedReligions: Religion[]): Religion[];
  generateHeresies(religions: Religion[], religionIds: Uint16Array): Religion[];
  generateReligionName(variety: string, form: string, deity: string, center: number): [string, string];
  normalizeHeresiesForExpansion(religions: Religion[], religionIds: Uint16Array): Religion[];
  recalculate(): void;
}

describe("ReligionsModule origins", () => {
  let Religions: TestableReligionsModule;

  beforeAll(async () => {
    await import("./religions-generator");
    Religions = globalThis.Religions as unknown as TestableReligionsModule;
  });

  beforeEach(() => {
    globalThis.pack = {
      cells: {
        c: [[1], [0, 2], [1, 3], [2]],
        p: [
          [0, 0],
          [1, 0],
          [2, 0],
          [3, 0]
        ]
      }
    } as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a heresy that inherits its organized parent", () => {
    vi.spyOn(Religions, "generateReligionName").mockReturnValue(["Test Heresy", "global"]);
    globalThis.pack.cells.culture = Uint16Array.from([1]);
    const parent = {
      i: 2,
      name: "Organized faith",
      type: "Organized",
      form: "Monotheism",
      culture: 1,
      center: 0,
      expansion: "global",
      expansionism: 5,
      deity: "The Parent Deity",
      color: "#336699"
    } satisfies Religion;

    const result = Religions.createHeresy(parent, 0, 4, ["OF"]);

    expect(result).toMatchObject({
      i: 4,
      type: "Heresy",
      origins: [2],
      center: 0,
      form: "Monotheism",
      deity: "The Parent Deity"
    });
  });

  it("does not generate heresies without an organized parent", () => {
    const religions = [
      { i: 0, name: "No religion" },
      {
        i: 1,
        name: "Nearby cult",
        type: "Cult",
        form: "Cult",
        culture: 1,
        center: 0,
        expansion: "global",
        expansionism: 5,
        deity: "Cult deity",
        color: "#993366"
      }
    ] as Religion[];

    expect(Religions.generateHeresies(religions, Uint16Array.from([1]))).toEqual([]);
  });

  it("does not generate heresies from a locked organized religion", () => {
    const religions = [
      { i: 0, name: "No religion" },
      {
        i: 1,
        name: "Locked organized religion",
        type: "Organized",
        form: "Monotheism",
        culture: 1,
        center: 0,
        expansion: "global",
        expansionism: 5,
        deity: "Locked deity",
        color: "#336699",
        lock: true
      }
    ] as Religion[];

    expect(Religions.generateHeresies(religions, Uint16Array.from([1]))).toEqual([]);
  });

  it("preserves origins of a locked religion", () => {
    const religions = [
      { i: 0, name: "No religion" },
      {
        i: 1,
        name: "Folk belief",
        type: "Folk",
        form: "Animism",
        culture: 1,
        center: 0,
        expansion: "culture"
      },
      {
        i: 2,
        name: "Organized faith",
        type: "Organized",
        form: "Monotheism",
        culture: 1,
        center: 1,
        expansion: "global"
      },
      {
        i: 3,
        name: "Locked cult",
        type: "Cult",
        form: "Cult",
        culture: 1,
        center: 3,
        expansion: "global",
        origins: [2],
        lock: true
      }
    ] as Religion[];
    const religionIds = Uint16Array.from([1, 1, 1, 3]);

    const result = Religions.defineOrigins(religionIds, religions);

    expect(result[3].origins).toEqual([2]);
  });

  it("keeps a sparse locked religion and its origins while combining regenerated religions", () => {
    const lockedReligion = {
      i: 3,
      name: "Locked cult",
      type: "Cult",
      form: "Cult",
      culture: 1,
      center: 3,
      expansion: "global",
      expansionism: 1,
      deity: "Cult deity",
      color: "#993366",
      origins: [2],
      lock: true
    } satisfies Religion;

    const result = Religions.combineReligions([], [lockedReligion]);

    expect(result[2]).toMatchObject({ i: 2, removed: true });
    expect(result[3]).toMatchObject({ i: 3, name: "Locked cult", origins: [2], lock: true });
  });

  it("does not add an origin that would create a cycle with a locked religion", () => {
    const religions = [
      { i: 0, name: "No religion" },
      {
        i: 1,
        name: "Locked organized religion",
        type: "Organized",
        form: "Monotheism",
        culture: 1,
        center: 0,
        expansion: "global",
        origins: [3],
        lock: true
      },
      {
        i: 2,
        name: "Folk belief",
        type: "Folk",
        form: "Animism",
        culture: 1,
        center: 2,
        expansion: "culture"
      },
      {
        i: 3,
        name: "Generated organized religion",
        type: "Organized",
        form: "Polytheism",
        culture: 1,
        center: 3,
        expansion: "global"
      }
    ] as Religion[];
    const religionIds = Uint16Array.from([1, 1, 1, 1]);

    const result = Religions.defineOrigins(religionIds, religions);

    expect(result[1].origins).toEqual([3]);
    expect(result[3].origins?.includes(1)).toBe(false);
  });

  it("does not add a transitive origin cycle through a generated religion", () => {
    globalThis.pack.cells.c = [[1], [0, 2], [1]];
    const religions = [
      { i: 0, name: "No religion" },
      {
        i: 1,
        name: "Locked organized religion",
        type: "Organized",
        form: "Monotheism",
        culture: 0,
        center: 0,
        expansion: "global",
        origins: [3],
        lock: true
      },
      {
        i: 2,
        name: "First generated religion",
        type: "Organized",
        form: "Polytheism",
        culture: 0,
        center: 1,
        expansion: "global"
      },
      {
        i: 3,
        name: "Second generated religion",
        type: "Cult",
        form: "Cult",
        culture: 0,
        center: 2,
        expansion: "global"
      }
    ] as Religion[];

    const result = Religions.defineOrigins(Uint16Array.from([1, 2, 3]), religions);

    expect(result[1].origins).toEqual([3]);
    expect(result[2].origins).toEqual([1]);
    expect(result[3].origins).toEqual([0]);
  });

  it("normalizes a legacy heresy to one organized parent before recalculation", () => {
    const religions = [
      { i: 0, name: "No religion" },
      {
        i: 1,
        name: "Folk belief",
        type: "Folk",
        form: "Animism",
        culture: 1,
        center: 0,
        expansion: "culture",
        expansionism: 0,
        deity: null,
        color: "#aaaaaa"
      },
      {
        i: 2,
        name: "Organized faith",
        type: "Organized",
        form: "Monotheism",
        culture: 1,
        center: 1,
        expansion: "global",
        expansionism: 5,
        deity: "The Parent Deity",
        color: "#336699"
      },
      {
        i: 3,
        name: "Legacy heresy",
        type: "Heresy",
        form: "Polytheism",
        culture: 1,
        center: 1,
        expansion: "global",
        expansionism: 1,
        deity: "Wrong deity",
        color: "#669933",
        origins: [1, 2]
      }
    ] as Religion[];

    const result = Religions.normalizeHeresiesForExpansion(religions, Uint16Array.from([1, 2]));

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ origins: [2], form: "Monotheism", deity: "The Parent Deity" });
  });

  it("retires a legacy heresy when no acyclic organized parent exists", () => {
    const religions = [
      { i: 0, name: "No religion" },
      {
        i: 1,
        name: "Organized faith",
        type: "Organized",
        form: "Monotheism",
        culture: 1,
        center: 0,
        expansion: "global",
        expansionism: 5,
        deity: "The Parent Deity",
        color: "#336699",
        origins: [2]
      },
      {
        i: 2,
        name: "Cyclic legacy heresy",
        type: "Heresy",
        form: "Monotheism",
        culture: 1,
        center: 0,
        expansion: "global",
        expansionism: 1,
        deity: "The Parent Deity",
        color: "#669933",
        origins: [1]
      }
    ] as Religion[];

    const result = Religions.normalizeHeresiesForExpansion(religions, Uint16Array.from([1]));

    expect(result).toEqual([]);
    expect(religions[1].origins).toEqual([0]);
    expect(religions[2]).toMatchObject({ removed: true, origins: [0], cells: 0 });
  });

  it("links a manually added heresy only to its organized parent", () => {
    const randomValues = [0.99, 0.25, 0.75, 0.99];
    let randomIndex = 0;
    vi.spyOn(Math, "random").mockImplementation(() => {
      if (randomIndex < randomValues.length) return randomValues[randomIndex++];
      return randomIndex++ % 2 ? 0.25 : 0.75;
    });
    globalThis.Names = { getCulture: () => "Test" } as any;
    vi.stubGlobal("Pack", { requireCell: () => 0 });
    globalThis.pack = {
      cells: {
        c: [[]],
        h: [30],
        culture: Uint16Array.from([1]),
        religion: Uint16Array.from([2])
      },
      cultures: [{ i: 0 }, { i: 1, name: "Test", color: "#aaaaaa" }],
      religions: [
        { i: 0, name: "No religion" },
        { i: 1, name: "Folk belief", type: "Folk", culture: 1, color: "#aaaaaa" },
        {
          i: 2,
          name: "Organized faith",
          type: "Organized",
          form: "Monotheism",
          culture: 1,
          deity: "The Parent Deity",
          color: "#336699",
          code: "OF"
        }
      ]
    } as any;

    Religions.add(5, 5);

    expect(globalThis.pack.religions[3]).toMatchObject({
      type: "Heresy",
      form: "Monotheism",
      deity: "The Parent Deity",
      origins: [2]
    });
  });
});

describe("ReligionsModule.rename", () => {
  it("recomputes a renamed religion's code", async () => {
    await import("./religions-generator");
    globalThis.pack = {
      religions: [
        { i: 0, name: "No religion" },
        { i: 1, name: "Old Faith", code: "OF" }
      ]
    } as any;
    globalThis.Religions.rename(1, "Sun Cult");
    expect(pack.religions[1]).toMatchObject({ name: "Sun Cult", code: "SC" });
    expect(() => globalThis.Religions.rename(2, "X")).toThrow("Religion 2 does not exist");
  });
});

describe("ReligionsModule.getPassageCost", () => {
  interface TestableReligionsModule {
    getPassageCost(cellId: number, nextCellId: number, routeById: Map<number, Route>): number;
  }

  let Religions: TestableReligionsModule;
  let routeById: Map<number, Route>;

  const road: Route = { i: 1, group: "roads", feature: 0, points: [] };
  const trail: Route = { i: 2, group: "trails", feature: 0, points: [] };
  const searoute: Route = { i: 3, group: "searoutes", feature: 0, points: [] };

  beforeAll(async () => {
    await import("./religions-generator");
    Religions = globalThis.Religions as unknown as TestableReligionsModule;
  });

  beforeEach(() => {
    globalThis.pack = {
      cells: {
        c: [[1], [0, 2, 3], [1], [1, 4, 5], [3], [3]],
        h: Uint8Array.from([30, 30, 30, 10, 10, 10]),
        biome: Uint8Array.from([1, 1, 1, 1, 1, 1]),
        routes: {
          0: { 1: 1 }, // road between 0 and 1
          1: { 0: 1, 2: 2, 3: 7 }, // trail between 1 and 2; stale id 7 between 1 and 3
          2: { 1: 2 },
          3: { 4: 3, 5: 9 }, // searoute between 3 and 4; stale id 9 between 3 and 5
          4: { 3: 3 },
          5: { 3: 9 }
        }
      },
      biomes: [
        { i: 1, cost: 10 },
        { i: 2, cost: 70 }
      ],
      routes: [road, trail, searoute]
    } as any;

    routeById = new Map(globalThis.pack.routes.map(route => [route.i, route]));
  });

  // expected cost derived independently from Routes.getRoute to lock passage-cost behavior
  const expectedCost = (from: number, to: number): number => {
    const route = Routes.getRoute(from, to);
    if (isWater(from, globalThis.pack)) return route ? 50 : 500;
    const biomeCost = globalThis.pack.biomes[globalThis.pack.cells.biome[to]].cost;
    if (!route) return biomeCost;
    return route.group === "roads" ? 1 : biomeCost / 3;
  };

  it.each([
    { description: "charges 1 for a road on land", from: 0, to: 1, expected: 1 },
    { description: "charges biomeCost/3 for a non-road route on land", from: 1, to: 2, expected: 70 / 3 },
    { description: "charges biomeCost without a route on land", from: 0, to: 2, expected: 70 },
    { description: "charges biomeCost when the route id is missing on land", from: 1, to: 3, expected: 70 },
    { description: "charges 50 for a route on water", from: 3, to: 4, expected: 50 },
    { description: "charges 500 when the route id is missing on water", from: 3, to: 5, expected: 500 },
    { description: "charges 500 without a route on water", from: 4, to: 5, expected: 500 }
  ])("$description", ({ from, to, expected }) => {
    expect(Religions.getPassageCost(from, to, routeById)).toBe(expected);
    expect(Religions.getPassageCost(from, to, routeById)).toBe(expectedCost(from, to));
  });
});

describe("Religions.recalculate golden", () => {
  beforeAll(async () => {
    await import("./religions-generator");
    // @ts-expect-error vendored UMD script without TypeScript declarations
    (globalThis as any).FlatQueue = (await import("../../public/libs/flatqueue.js")).default;
  });

  it("floods organized religions, the cult and the heresy to a fixed split of a 20-cell line", () => {
    const n = 20;
    globalThis.pack = {
      cells: {
        i: Array.from({ length: n }, (_, i) => i),
        c: Array.from({ length: n }, (_, i) => [i - 1, i + 1].filter(x => x >= 0 && x < n)),
        culture: Uint16Array.from(Array.from({ length: n }, (_, i) => (i < 14 ? 1 : 2))),
        state: Uint16Array.from(Array.from({ length: n }, (_, i) => (i < 14 ? 0 : 1))),
        religion: new Uint16Array(n),
        biome: new Uint8Array(n).fill(1),
        h: new Array(n).fill(35),
        routes: Array.from({ length: n }, () => ({}))
      },
      biomes: [
        { i: 0, cost: 0 },
        { i: 1, cost: 10 }
      ],
      routes: [],
      cultures: [
        { i: 0, name: "Wildlands" },
        { i: 1, name: "Westerners", center: 1, color: "#111111" },
        { i: 2, name: "Easterners", center: 18, color: "#222222" }
      ],
      religions: [
        { i: 0, name: "No religion" },
        { i: 1, name: "Western folk", type: "Folk", culture: 1, center: 0, expansion: "culture" },
        { i: 2, name: "Eastern folk", type: "Folk", culture: 2, center: 19, expansion: "culture" },
        {
          i: 3,
          name: "Western church",
          type: "Organized",
          culture: 1,
          center: 1,
          expansion: "culture",
          expansionism: 5,
          form: "Polytheism",
          deity: "The West",
          color: "#333333"
        },
        {
          i: 4,
          name: "Eastern cult",
          type: "Cult",
          culture: 2,
          center: 18,
          expansion: "state",
          expansionism: 2,
          form: "Cult",
          deity: "The East",
          color: "#444444"
        },
        {
          i: 5,
          name: "Western heresy",
          type: "Heresy",
          culture: 1,
          center: 2,
          expansion: "global",
          expansionism: 1,
          form: "Polytheism",
          deity: "The West",
          color: "#555555",
          origins: [3]
        }
      ]
    } as any;
    options = Options.getDefaultOptions();
    options.generation.cultures.growthRate = 175; // maxExpansionCost = (20 / 20) * 175 = 175

    const Religions = globalThis.Religions;
    Religions.recalculate();

    // golden from the converged priorityFlood: the church spans its culture (12/step), the cult its
    // state (15/step), then the heresy overruns the church's west (20/step) and stops past cell 10
    // (160 <= 175 < 180 — seeds enter the queue at cost 0, initialCost never propagates); the
    // flood semantics changed vs the legacy copies only for zero-cost churn (flood.test.ts)
    expect([...globalThis.pack.cells.religion]).toEqual([5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 3, 3, 3, 4, 4, 4, 4, 4, 4]);
  });
});

// Golden for the PRNG injection: generate() must produce the same religions whether its draws
// come from the ambient stream (pre-migration, seeded here) or the generator's own seed-bound
// kit (post-migration) - both are Alea over options.map.seed, drawn in the same call order.
describe("Religions.generate golden (PRNG)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("reproduces folk, organized and heresy religions from a fixed seed", async () => {
    const NamesModule = await import("./names-generator"); // real Names: religion names roll from its bases
    globalThis.Names = NamesModule.Names;
    await import("./religions-generator");
    // @ts-expect-error vendored UMD script without TypeScript declarations
    (globalThis as any).FlatQueue = (await import("../../public/libs/flatqueue.js")).default;
    const Alea = (await import("alea")).default;

    const n = 30;
    const cells = {
      i: Array.from({ length: n }, (_, i) => i),
      c: Array.from({ length: n }, (_, i) => [i - 1, i + 1].filter(x => x >= 0 && x < n)),
      p: Array.from({ length: n }, (_, i) => [(i % 6) * 250, Math.floor(i / 6) * 350] as [number, number]),
      religion: new Uint16Array(n),
      state: Uint16Array.from(Array.from({ length: n }, (_, i) => (i < 15 ? 1 : 2))),
      culture: Uint16Array.from(Array.from({ length: n }, (_, i) => (i < 15 ? 1 : 2))),
      biome: new Array(n).fill(5),
      h: new Array(n).fill(35),
      s: Array.from({ length: n }, (_, i) => ((i * 7) % 13) + 3),
      burg: (() => {
        const burg = new Array(n).fill(0);
        burg[3] = 1;
        burg[8] = 2;
        burg[13] = 3;
        burg[20] = 4;
        burg[26] = 5;
        return burg;
      })(),
      routes: new Array(n).fill(null),
      f: new Array(n).fill(0)
    };
    vi.stubGlobal("pack", {
      cells,
      biomes: [
        { i: 0, cost: 0 },
        { i: 1, cost: 10 },
        { i: 2, cost: 20 },
        { i: 3, cost: 30 },
        { i: 4, cost: 40 },
        { i: 5, cost: 50 }
      ],
      features: [{ i: 0, type: "ocean", cells: 0 }],
      cultures: [
        { i: 0, name: "Wildlands", color: "#aaaaaa", center: 0, base: 0 },
        { i: 1, name: "Luari", color: "#d5b8ed", center: 3, base: 1 },
        { i: 2, name: "Norse", color: "#8dd3c7", center: 20, base: 5 }
      ],
      burgs: [
        0,
        { i: 1, cell: 3, population: 42, name: "Va" },
        { i: 2, cell: 8, population: 35, name: "Kol" },
        { i: 3, cell: 13, population: 28, name: "Rav" },
        { i: 4, cell: 20, population: 21, name: "Ost" },
        { i: 5, cell: 26, population: 14, name: "Dol" }
      ],
      states: [
        { i: 0, name: "Neutrals" },
        { i: 1, name: "Wessex" },
        { i: 2, name: "Easland" }
      ],
      routes: [],
      religions: []
    });

    options = Options.getDefaultOptions();
    options.map.seed = "religions-gold";
    options.generation.religions.limit = 4;
    vi.spyOn(Math, "random").mockImplementation(Alea("religions-gold") as () => number);

    Religions.generate();

    const pack = globalThis.pack as any;
    const summary = pack.religions.map((r: any) => ({
      i: r.i,
      name: r.name,
      type: r.type,
      form: r.form,
      culture: r.culture,
      center: r.center,
      expansion: r.expansion,
      expansionism: r.expansionism,
      color: r.color,
      code: r.code,
      deity: r.deity,
      origins: r.origins
    }));
    expect(summary).toEqual([
      { i: 0, name: "No religion", origins: null },
      {
        i: 1,
        name: "Old Luari Deities",
        type: "Folk",
        form: "Polytheism",
        culture: 1,
        center: 3,
        expansion: "culture",
        expansionism: 0,
        color: "#d5b8ed",
        code: "OL",
        deity: "Tiningtham, The Ancient Cyclope of War",
        origins: [0]
      },
      {
        i: 2,
        name: "Norse Deities",
        type: "Folk",
        form: "Polytheism",
        culture: 2,
        center: 15,
        expansion: "culture",
        expansionism: 0,
        color: "#8dd3c7",
        code: "ND",
        deity: "Shida, The Blue Pegasus",
        origins: [0]
      },
      {
        i: 3,
        name: "Knutstable Deities",
        type: "Organized",
        form: "Polytheism",
        culture: 1,
        center: 3,
        expansion: "global",
        expansionism: 6.4,
        color: "#bfdaff",
        code: "KD",
        deity: "Monrith, The Enlightened Spirit of Fire",
        origins: [1, 2]
      },
      {
        i: 4,
        name: "Godhurstho School",
        type: "Organized",
        form: "Philosophical",
        culture: 1,
        center: 8,
        expansion: "global",
        expansionism: 3.6,
        color: "#c5cbff",
        code: "GS",
        deity: "Stansin, The Eight",
        origins: [1, 3]
      },
      {
        i: 5,
        name: "Luarism",
        type: "Organized",
        form: "Monotheism",
        culture: 1,
        center: 13,
        expansion: "culture",
        expansionism: 2.4,
        color: "#e1b2ff",
        code: "Lu",
        deity: "Cleokeridbu, The Great Swan",
        origins: [1, 2]
      },
      {
        i: 6,
        name: "Ost Blasphemy",
        type: "Cult",
        form: "Dark Cult",
        culture: 2,
        center: 20,
        expansion: "global",
        expansionism: 1,
        color: "#b7c67b",
        code: "OB",
        deity: "Romiylatsk, The Ineffable Unicorn",
        origins: [2, 1, 5]
      }
    ]);
    expect([...cells.religion]).toEqual([
      1, 1, 1, 3, 1, 1, 1, 1, 4, 1, 1, 1, 1, 5, 1, 2, 2, 2, 2, 2, 6, 2, 2, 2, 2, 2, 2, 2, 2, 2
    ]);
  });
});
