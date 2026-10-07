import Alea from "alea";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(async () => {
  await import("./provinces-generator");
});

it("keeps a province's full-name pattern and rebuilds it when the name is not in it", () => {
  globalThis.pack = {
    provinces: [
      0,
      { i: 1, name: "Old", formName: "Duchy", fullName: "Duchy of Old" },
      { i: 2, name: "Ash", formName: "March", fullName: "Border" }
    ]
  } as any;
  Provinces.rename(1, "New");
  expect(pack.provinces[1].fullName).toBe("Duchy of New");
  Provinces.rename(2, "Elm");
  expect(pack.provinces[2].fullName).toBe("Elm March");
  expect(() => Provinces.rename(3, "X")).toThrow("Province 3 does not exist");
});

const PROVINCES_GOLD = [
  {
    i: 1,
    state: 1,
    center: 16,
    burg: 1,
    name: "Midland",
    formName: "Barony",
    fullName: "Midland Barony",
    color: "#88bab9",
    coa: '{"t1":"#ff0000","charges":[{"charge":"pike","t":"argent","p":"e","t2":"argent","size":1.5}],"shield":"heater"}'
  },
  {
    i: 2,
    state: 1,
    center: 60,
    burg: 4,
    name: "Dunland",
    formName: "County",
    fullName: "Dunland County",
    color: "#6de3aa",
    coa: '{"t1":"#ff0000","ordinaries":[{"ordinary":"chief","t":"or","line":"urdy"}],"shield":"heater"}'
  },
  {
    i: 3,
    state: 2,
    center: 68,
    burg: 5,
    name: "Vy",
    formName: "Province",
    fullName: "Vy Province",
    color: "#eab275",
    coa: '{"t1":"#ff0000","charges":[{"charge":"crossJerusalem","t":"argent","p":"e","size":1.5}],"shield":"rounded"}'
  },
  {
    i: 4,
    state: 2,
    center: 81,
    burg: 6,
    name: "Saltbruck",
    formName: "Prefecture",
    fullName: "Saltbruck Prefecture",
    color: "#ff8c7a",
    coa: '{"t1":"#ff0000","charges":[{"charge":"anvil","t":"or","p":"jlh","size":0.7}],"shield":"rounded"}'
  },
  {
    i: 5,
    state: 1,
    center: 89,
    burg: 7,
    name: "Horstonia",
    formName: "Territory",
    fullName: "Horstonia Territory",
    color: "#83baba",
    coa: '{"t1":"#66c2a5","division":{"division":"perBend","t":"or","line":"nowyReversed"},"shield":"heater"}'
  },
  {
    i: 6,
    state: 2,
    center: 10,
    burg: 0,
    name: "Zizhersia",
    formName: "Area",
    fullName: "Zizhersia Area",
    color: "#f59284",
    coa: '{"t1":"pally-argent-sable","division":{"division":"perPale","t":"gules","line":"straight"},"ordinaries":[{"ordinary":"chief","t":"purpure","line":"straight"}],"shield":"rounded"}'
  }
] as const;
const CELLS_GOLD = [
  1, 1, 1, 1, 1, 1, 3, 3, 3, 3, 6, 6, 1, 1, 1, 1, 1, 1, 3, 3, 3, 3, 6, 6, 1, 1, 1, 1, 1, 1, 3, 3, 3, 3, 4, 4, 2, 2, 1,
  1, 1, 1, 3, 3, 3, 3, 4, 4, 2, 2, 2, 1, 1, 1, 3, 3, 3, 3, 4, 4, 2, 2, 2, 2, 1, 1, 3, 3, 3, 4, 4, 4, 2, 2, 2, 2, 1, 1,
  3, 3, 4, 4, 4, 4, 2, 2, 2, 2, 2, 5, 3, 3, 4, 4, 4, 4
] as const;
const STATES_GOLD = [
  [1, 2, 5],
  [3, 4, 6]
] as const;

describe("Provinces.generate golden (PRNG)", () => {
  // Golden for the PRNG injection: generate() must produce the same provinces (names, forms,
  // colors, coa included) whether its draws come from the ambient stream (pre-migration,
  // seeded here) or the generator's own localSeed-bound kit (post-migration) - both are Alea
  // over options.map.seed, drawn in the same call order, including the Emblems/Names interleave.
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("reproduces provinces from a fixed seed", async () => {
    globalThis.TIME = false;
    globalThis.Names = (await import("./names-generator")).Names;
    globalThis.Burgs = (await import("./burgs-generator")).Burgs;
    // @ts-expect-error vendored UMD script without TypeScript declarations
    (globalThis as any).FlatQueue = (await import("../../public/libs/flatqueue.js")).default;
    await import("./provinces-generator");

    const W = 12;
    const H = 8;
    const n = W * H;
    const col = (i: number) => i % W;
    const row = (i: number) => Math.floor(i / W);
    const neighbors = (i: number) =>
      [
        [col(i) - 1, row(i)],
        [col(i) + 1, row(i)],
        [col(i), row(i) - 1],
        [col(i), row(i) + 1]
      ]
        .filter(([c, r]) => c >= 0 && c < W && r >= 0 && r < H)
        .map(([c, r]) => r * W + c);
    const burgAt = (i: number, cell: number, state: number, population: number, capital = 0) => ({
      i,
      cell,
      state,
      population,
      capital,
      name: ["Vaerna", "Ostmouth", "Rudd", "Kern", "Milhaven", "Saltbruck"][i - 1],
      culture: state,
      coa: { name: `p${i}`, charge: "cross", t1: "#ff0000", t2: "#ffffff" }
    });
    const burg = new Array(n).fill(0);
    burg[16] = 1; // (4,1) state 1 capital
    burg[27] = 2; // (3,2)
    burg[44] = 3; // (8,3)
    burg[60] = 4; // (0,5)
    burg[68] = 5; // (8,5) state 2 capital
    burg[81] = 6; // (9,6)
    burg[89] = 7; // (5,7)
    globalThis.pack = {
      burgs: [
        0,
        burgAt(1, 16, 1, 12000, 1),
        burgAt(2, 27, 1, 5000),
        burgAt(3, 44, 1, 3000),
        burgAt(4, 60, 1, 4000),
        burgAt(5, 68, 2, 11000, 1),
        burgAt(6, 81, 2, 6000),
        burgAt(7, 89, 2, 2000)
      ],
      cultures: [0, { i: 1, base: 1, shield: "heater" }, { i: 2, base: 5, shield: "rounded" }],
      features: [0, { i: 1, type: "island", cells: n }, { i: 2, type: "ocean" }],
      states: [
        { i: 0, name: "neutral" },
        {
          i: 1,
          name: "Aldmark",
          form: "Monarchy",
          color: "#66c2a5",
          center: 16,
          coa: { charge: "simple", t1: "#66c2a5", t2: "#ffffff" }
        },
        {
          i: 2,
          name: "Brelan",
          form: "Republic",
          color: "#fc8d62",
          center: 68,
          coa: { charge: "simple", t1: "#fc8d62", t2: "#ffffff" }
        }
      ],
      cells: {
        i: Array.from({ length: n }, (_, i) => i),
        c: Array.from({ length: n }, (_, i) => neighbors(i)),
        p: Array.from({ length: n }, (_, i) => [col(i) * 100, row(i) * 100] as [number, number]),
        h: Array.from({ length: n }, (_, i) => (row(i) === 4 && col(i) >= 5 && col(i) <= 7 ? 72 : 35)),
        t: Array.from({ length: n }, () => 2),
        biome: Array.from({ length: n }, () => 5),
        pop: Array.from({ length: n }, () => 120),
        r: Array.from({ length: n }, () => 0),
        fl: Array.from({ length: n }, () => 0),
        f: Array.from({ length: n }, () => 1),
        haven: new Array(n).fill(0),
        burg,
        culture: Array.from({ length: n }, (_, i) => (col(i) < 6 ? 1 : 2)),
        state: Array.from({ length: n }, (_, i) => (col(i) < 6 ? 1 : 2))
      }
    } as any;

    options.map.seed = "provinces-gold";
    options.generation.provinces = { ...options.generation.provinces, ratio: 10 }; // small ratio leaves wild-province cells
    vi.spyOn(Math, "random").mockImplementation(Alea("provinces-gold") as () => number);

    Provinces.generate();

    const provinces = (globalThis.pack as any).provinces;
    expect(
      provinces.slice(1).map((p: any) => ({
        i: p.i,
        state: p.state,
        center: p.center,
        burg: p.burg,
        name: p.name,
        formName: p.formName,
        fullName: p.fullName,
        color: p.color,
        coa: JSON.stringify(p.coa)
      }))
    ).toEqual(PROVINCES_GOLD);
    expect(Array.from(globalThis.pack.cells.province as Uint16Array)).toEqual(CELLS_GOLD);
    expect((globalThis.pack.states as any[]).slice(1).map(s => s.provinces)).toEqual(STATES_GOLD);
  });
});
