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
