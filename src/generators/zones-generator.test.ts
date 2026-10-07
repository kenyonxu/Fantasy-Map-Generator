import Alea from "alea";
import { afterEach, describe, expect, it, vi } from "vitest";

// Golden for the PRNG injection: generate() must produce the same zones whether its draws come
// from the ambient stream (pre-migration, seeded here) or the generator's own seed-bound kit
// (post-migration) - both are Alea over options.map.seed, drawn in the same call order.
describe("Zones.generate golden (PRNG)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("reproduces zones, names and cell sets from a fixed seed", async () => {
    globalThis.Names = (await import("./names-generator")).Names;
    // @ts-expect-error vendored UMD script without TypeScript declarations
    (globalThis as any).FlatQueue = (await import("../../public/libs/flatqueue.js")).default;
    await import("./zones-generator");

    // 10x8 grid: ocean cols 0-1, coastal land col 2, inland cols 3-9.
    // Religion 2 (the heresy) holds only cols 8-9, so the crusade cannot burn the cells the
    // highland (rows 0-1, cols 6-7) and hill (rows 6-7, cols 6-7) blocks need; a river runs
    // down col 5 with a burg on it for floods.
    const W = 10;
    const H = 8;
    const n = W * H;
    const col = (i: number) => i % W;
    const row = (i: number) => Math.floor(i / W);
    const isWater = (i: number) => col(i) < 2;
    const highland = (i: number) => row(i) < 2 && col(i) >= 6 && col(i) <= 7;
    const hills = (i: number) => row(i) >= 6 && col(i) >= 6 && col(i) <= 7;
    const onRiver = (i: number) => col(i) === 5 && row(i) >= 2 && row(i) <= 6;
    const neighbors = (i: number) =>
      [
        [col(i) - 1, row(i)],
        [col(i) + 1, row(i)],
        [col(i), row(i) - 1],
        [col(i), row(i) + 1]
      ]
        .filter(([c, r]) => c >= 0 && c < W && r >= 0 && r < H)
        .map(([c, r]) => r * W + c);
    const cells = {
      i: Array.from({ length: n }, (_, i) => i),
      p: Array.from({ length: n }, (_, i) => [col(i) * 100, row(i) * 120] as [number, number]),
      c: Array.from({ length: n }, (_, i) => neighbors(i)),
      h: Array.from({ length: n }, (_, i) =>
        isWater(i) ? 0 : highland(i) ? 75 : hills(i) ? 55 : col(i) === 2 ? 25 : 35
      ),
      t: Array.from({ length: n }, (_, i) => (isWater(i) ? -1 : col(i) === 2 ? 1 : 2)),
      f: Array.from({ length: n }, (_, i) => (isWater(i) ? 2 : 1)),
      biome: Array.from({ length: n }, () => 5),
      pop: Array.from({ length: n }, (_, i) => (isWater(i) ? 0 : 100 + ((i * 13) % 150))),
      culture: Array.from({ length: n }, (_, i) => (isWater(i) ? 0 : col(i) <= 7 ? 1 : 2)),
      religion: Array.from({ length: n }, (_, i) => (isWater(i) ? 0 : col(i) <= 7 ? 1 : 2)),
      state: Array.from({ length: n }, (_, i) => (isWater(i) ? 0 : col(i) <= 5 ? 1 : 2)),
      r: Array.from({ length: n }, (_, i) => (onRiver(i) ? 3 : 0)),
      fl: Array.from({ length: n }, (_, i) => (onRiver(i) ? 110 - row(i) * 15 : 0)),
      burg: (() => {
        const burg = new Array(n).fill(0);
        burg[22] = 1;
        burg[25] = 2;
        burg[66] = 3;
        return burg;
      })()
    };
    vi.stubGlobal("pack", {
      cells,
      features: [0, { i: 1, type: "island" }, { i: 2, type: "ocean" }],
      biomes: [{ i: 0, cost: 0 }, ...Array.from({ length: 12 }, (_, i) => ({ i: i + 1, cost: 50 }))],
      markers: [{ type: "volcanoes", cell: 33, name: "Cinder Mount", note: "Active volcano" }],
      burgs: [
        0,
        { i: 1, cell: 22, name: "Vaerna" },
        { i: 2, cell: 25, name: "Rudd" },
        { i: 3, cell: 66, name: "Ostmouth" }
      ],
      religions: [0, { i: 1, type: "Organized", name: "Old Faith" }, { i: 2, type: "Heresy", name: "New Schism" }],
      cultures: [
        { i: 0, base: 0 },
        { i: 1, base: 1 },
        { i: 2, base: 5 }
      ],
      states: [
        0,
        {
          i: 1,
          name: "Aldmark",
          neighbors: [0, 2, 0],
          campaigns: [{ name: "Border War", start: 980, end: 0, defender: 1, attacker: 2 }]
        },
        { i: 2, name: "Brelan", neighbors: [0, 1, 0] }
      ]
    });
    vi.stubGlobal("Routes", { getRoute: () => 0, isConnected: () => true });

    options = Options.getDefaultOptions();
    options.map.seed = "zones-gold-4";
    vi.spyOn(Math, "random").mockImplementation(Alea("zones-gold-4") as () => number);

    Zones.generate();

    const summary = (globalThis.pack as any).zones.map((z: any) => ({
      i: z.i,
      name: z.name,
      type: z.type,
      color: z.color,
      cells: z.cells
    }));
    expect(summary).toEqual([
      {
        i: 0,
        name: "Brelanese Invasion",
        type: "Invasion",
        color: "url(#hatch1)",
        cells: [65, 75, 65, 74, 73, 64, 54, 44, 34, 24, 55, 14, 4, 5, 3, 72, 62, 52, 42, 32]
      },
      {
        i: 1,
        name: "Brelanese Insurrection",
        type: "Rebels",
        color: "url(#hatch3)",
        cells: [5]
      },
      {
        i: 2,
        name: "Brelanese Insurrection",
        type: "Rebels",
        color: "url(#hatch3)",
        cells: [5]
      },
      {
        i: 3,
        name: "Brelanese Revolutionaries",
        type: "Rebels",
        color: "url(#hatch3)",
        cells: [5]
      },
      {
        i: 4,
        name: "Oldan Proselytism",
        type: "Proselytism",
        color: "url(#hatch6)",
        cells: [68, 69, 58, 78, 68, 59, 79, 48, 49, 38]
      },
      {
        i: 5,
        name: "Old Proselytism",
        type: "Proselytism",
        color: "url(#hatch6)",
        cells: [18, 19, 8, 28, 18, 9, 29]
      },
      {
        i: 6,
        name: "Brutal Cough",
        type: "Disease",
        color: "url(#hatch12)",
        cells: [66]
      },
      {
        i: 7,
        name: "Penkwaran Avalanche",
        type: "Avalanche",
        color: "url(#hatch5)",
        cells: [7, 17, 16, 6]
      },
      {
        i: 8,
        name: "Tarby Fault",
        type: "Fault",
        color: "url(#hatch2)",
        cells: [77, 67, 57, 47]
      },
      {
        i: 9,
        name: "Berkenbach Tsunami",
        type: "Tsunami",
        color: "url(#hatch13)",
        cells: [22, 12]
      }
    ]);
  });
});
