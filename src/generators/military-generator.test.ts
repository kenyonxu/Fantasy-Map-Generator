import Alea from "alea";
import { afterEach, describe, expect, it, vi } from "vitest";

// Golden for the PRNG injection: generate() must produce the same regiments whether its draws
// come from the ambient stream (pre-migration, seeded here) or the generator's own seed-bound
// kit (post-migration) - both are Alea over options.map.seed, drawn in the same call order.
// The only random reads are generateNote's campaign/year rolls (ra, rand, gauss).
describe("Military.generate golden (PRNG)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("reproduces regiments, names and notes from a fixed seed", async () => {
    await import("./military-generator");
    const n = 40;
    const burgAt = (i: number, cell: number, state: number, population: number, port = 0) => ({
      i,
      cell,
      state,
      population,
      port,
      culture: state,
      capital: +(i % 2 === 1)
    });
    const burg = new Uint16Array(n);
    const haven = new Uint16Array(n);
    const h = new Array(n).fill(35);
    const biome = new Array(n).fill(5);
    burg[2] = 1;
    burg[15] = 2;
    burg[22] = 3;
    burg[32] = 4;
    haven[15] = 17; // the port of burg 2 anchors on this water cell
    haven[32] = 33;
    h[17] = 0;
    h[33] = 0;
    for (let i = 10; i <= 12; i++) biome[i] = 8; // wetland block in state 1
    for (let i = 24; i <= 26; i++) biome[i] = 1; // nomadic block in state 2
    for (let i = 28; i <= 30; i++) h[i] = 75; // highland block in state 2
    const cells = {
      i: Array.from({ length: n }, (_, i) => i),
      p: Array.from({ length: n }, (_, i) => [(i % 8) * 15, Math.floor(i / 8) * 20] as [number, number]),
      pop: Array.from({ length: n }, (_, i) => (h[i] < 20 ? 0 : 100 + ((i * 13) % 150))),
      biome,
      h,
      f: Array.from({ length: n }, (_, i) => (h[i] < 20 ? 2 : 1)),
      religion: Array.from({ length: n }, (_, i) => (i < 20 ? 1 : 2)),
      culture: Array.from({ length: n }, (_, i) => (i < 20 ? 1 : 2)),
      state: Uint16Array.from(Array.from({ length: n }, (_, i) => (h[i] < 20 ? 0 : i < 20 ? 1 : 2))),
      burg,
      haven,
      province: new Uint16Array(n)
    };
    vi.stubGlobal("pack", {
      cells,
      provinces: [0],
      burgs: [0, burgAt(1, 2, 1, 8000), burgAt(2, 15, 1, 5000, 1), burgAt(3, 22, 2, 12000), burgAt(4, 32, 2, 6000, 1)],
      states: [
        0,
        {
          i: 1,
          name: "Aldmark",
          center: 2,
          culture: 1,
          type: "Generic",
          form: "Monarchy",
          formName: "Kingdom",
          expansionism: 3,
          area: 100,
          diplomacy: ["x", "Enemy", "Suspicion"],
          neighbors: [0, 2, 0],
          campaigns: [{ name: "War of the Reeds", start: 970, end: 0, defender: 1, attacker: 2 }]
        },
        {
          i: 2,
          name: "Brelan",
          center: 22,
          culture: 2,
          type: "Naval",
          form: "Republic",
          formName: "Republic",
          expansionism: 2,
          area: 120,
          diplomacy: ["x", "Enemy", "Ally"],
          neighbors: [0, 1, 0]
        }
      ]
    });

    options = Options.getDefaultOptions();
    options.map.seed = "military-gold";
    vi.spyOn(Math, "random").mockImplementation(Alea("military-gold") as () => number);

    Military.generate();

    const pack = globalThis.pack as any;
    const summary = pack.states
      .filter((s: any) => s.i)
      .map((s: any) => ({
        i: s.i,
        alert: s.alert,
        military: (s.military ?? []).map((r: any) => ({
          i: r.i,
          name: r.name,
          a: r.a,
          u: r.u,
          n: r.n,
          note: r.note
        }))
      }));
    expect(summary).toEqual([
      {
        i: 1,
        alert: 2.24,
        military: [
          {
            i: 0,
            name: "1st Regiment",
            a: 102641,
            u: {
              archers: 43920,
              cavalry: 7363,
              infantry: 44907,
              artillery: 6451
            },
            n: 0,
            note: "Regiment was formed in 985 Era during the War of the Reeds. \r\n\r\nRegiment composition in 1000 E:\r\n— archers: 43920\r\n— cavalry: 7363\r\n— infantry: 44907\r\n— artillery: 6451."
          },
          {
            i: 1,
            name: "2nd Regiment",
            a: 55867,
            u: {
              archers: 23465,
              cavalry: 4425,
              infantry: 24617,
              artillery: 3360
            },
            n: 0,
            note: "Regiment was formed in 980 Era during the War of the Reeds. \r\n\r\nRegiment composition in 1000 E:\r\n— archers: 23465\r\n— cavalry: 4425\r\n— infantry: 24617\r\n— artillery: 3360."
          },
          {
            i: 2,
            name: "3rd Regiment",
            a: 12954,
            u: {
              archers: 4773,
              cavalry: 2127,
              infantry: 6054
            },
            n: 0,
            note: "Regiment was formed in 970 Era during the War of the Reeds. \r\n\r\nRegiment composition in 1000 E:\r\n— archers: 4773\r\n— cavalry: 2127\r\n— infantry: 6054."
          },
          {
            i: 3,
            name: "4th Regiment",
            a: 9056,
            u: {
              infantry: 4620,
              archers: 2218,
              cavalry: 2218
            },
            n: 0,
            note: "Regiment was formed in 991 Era during the War of the Reeds. \r\n\r\nRegiment composition in 1000 E:\r\n— infantry: 4620\r\n— archers: 2218\r\n— cavalry: 2218."
          },
          {
            i: 4,
            name: "5th Regiment",
            a: 3755,
            u: {
              infantry: 1915,
              archers: 920,
              cavalry: 920
            },
            n: 0,
            note: "Regiment was formed in 987 Era during the War of the Reeds. \r\n\r\nRegiment composition in 1000 E:\r\n— infantry: 1915\r\n— archers: 920\r\n— cavalry: 920."
          },
          {
            i: 5,
            name: "1st Fleet",
            a: 1680,
            u: {
              fleet: 1680
            },
            n: 1,
            note: "Regiment was formed in 986 Era during the War of the Reeds. \r\n\r\nRegiment composition in 1000 E:\r\n— fleet: 1680."
          }
        ]
      },
      {
        i: 2,
        alert: 0.59,
        military: [
          {
            i: 0,
            name: "1st Regiment",
            a: 31484,
            u: {
              archers: 14114,
              cavalry: 960,
              infantry: 12842,
              artillery: 3568
            },
            n: 0,
            note: "Regiment was formed in 903 Era. \r\n\r\nRegiment composition in 1000 E:\r\n— archers: 14114\r\n— cavalry: 960\r\n— infantry: 12842\r\n— artillery: 3568."
          },
          {
            i: 1,
            name: "2nd Regiment",
            a: 13255,
            u: {
              archers: 5923,
              cavalry: 416,
              infantry: 5429,
              artillery: 1487
            },
            n: 0,
            note: "Regiment was formed in 994 Era. \r\n\r\nRegiment composition in 1000 E:\r\n— archers: 5923\r\n— cavalry: 416\r\n— infantry: 5429\r\n— artillery: 1487."
          },
          {
            i: 2,
            name: "3rd Regiment",
            a: 3421,
            u: {
              infantry: 1776,
              cavalry: 486,
              archers: 1159
            },
            n: 0,
            note: "Regiment was formed in 994 Era. \r\n\r\nRegiment composition in 1000 E:\r\n— infantry: 1776\r\n— cavalry: 486\r\n— archers: 1159."
          },
          {
            i: 3,
            name: "1st Fleet",
            a: 1147,
            u: {
              fleet: 1147
            },
            n: 1,
            note: "Regiment was formed in 877 Era. \r\n\r\nRegiment composition in 1000 E:\r\n— fleet: 1147."
          }
        ]
      }
    ]);
  });
});
