import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Marker } from "./markers-generator";

const NAV_KEY = "navigator";

function setNavigator(value: unknown) {
  Object.defineProperty(globalThis, NAV_KEY, {
    value,
    configurable: true,
    writable: true
  });
}

describe("MarkersModule.addEncounter", () => {
  let markers: any;
  const CELL = 1;
  let originalNavigatorDescriptor: PropertyDescriptor | undefined;

  beforeEach(async () => {
    originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, NAV_KEY);

    globalThis.TIME = false;
    options.map.cultures.set = "world";
    globalThis.window = globalThis.window || ({} as any);

    globalThis.pack = {
      cells: {
        culture: Uint8Array.from([0, 2, 0, 0]),
        biome: Uint8Array.from([0, 3, 0, 0])
      },
      biomes: [{ name: "" }, { name: "" }, { name: "" }, { name: "Forest" }]
    } as any;

    globalThis.Names = {
      getCulture: () => "Aeloran"
    } as any;

    await import("./markers-generator");
    markers = globalThis.Markers;
  });

  afterEach(() => {
    if (originalNavigatorDescriptor) {
      Object.defineProperty(globalThis, NAV_KEY, originalNavigatorDescriptor);
    } else {
      delete (globalThis as any)[NAV_KEY];
    }
  });

  it("uses the Deorum iframe legend when the browser is online", () => {
    setNavigator({ onLine: true });

    const marker = { i: 42, cell: CELL } as Marker;
    markers.addEncounter(marker, CELL);

    expect(marker.name).toBe("Random encounter");
    expect(String(marker.note).includes(`https://deorum.vercel.app/encounter/${CELL}`)).toBe(true);
    expect(String(marker.note).includes("<iframe")).toBe(true);
  });

  it("falls back to a procedural culture/biome legend when offline", () => {
    setNavigator({ onLine: false });

    const marker = { i: 7, cell: CELL } as Marker;
    markers.addEncounter(marker, CELL);

    expect(String(marker.note).includes("iframe")).toBe(false);
    expect(String(marker.note).includes("deorum")).toBe(false);
    expect(String(marker.note).includes("Aeloran")).toBe(true);
    expect(String(marker.note).includes("forest")).toBe(true);
  });

  it("treats a missing navigator (SSR / Node) as online", () => {
    setNavigator(undefined);

    const marker = { i: 9, cell: CELL } as Marker;
    markers.addEncounter(marker, CELL);

    expect(String(marker.note).includes("deorum.vercel.app")).toBe(true);
  });
});

describe("MarkersModule.rename", () => {
  it("renames a marker by id", async () => {
    await import("./markers-generator");
    globalThis.pack = { markers: [{ i: 4, name: "Old Well" }] } as any;
    globalThis.Markers.rename(4, "Wishing Well");
    expect(pack.markers[0].name).toBe("Wishing Well");
    expect(() => globalThis.Markers.rename(0, "X")).toThrow("Marker 0 does not exist");
  });
});

describe("MarkersModule mines", () => {
  it("places mines only in burgs extracting an ore or mineral, named after it", async () => {
    await import("./markers-generator");
    const goods = [
      { i: 1, name: "Iron", tags: ["ore"] },
      { i: 2, name: "Grain", tags: ["food"] }
    ];
    globalThis.Goods = { get: (id: number) => goods.find(good => good.i === id) } as any;
    globalThis.pack = {
      cells: {
        i: [0, 1, 2, 3],
        burg: [0, 1, 2, 3],
        good: [1, 1, 2, 1]
      },
      burgs: [
        {},
        { name: "Ironton", population: 1, production: [{ goodId: 1, units: 2 }] },
        { name: "Farmton", population: 1, production: [{ goodId: 2, units: 2 }] },
        { name: "Smithton", population: 1, production: [{ goodId: 1, units: 2, recipe: [] }] }
      ]
    } as any;
    const markers = globalThis.Markers as any;

    expect(markers.listMines(pack)).toEqual([1]);
    const marker = { i: 0, cell: 1 } as Marker;
    markers.addMine(marker, 1);
    expect(marker.name).toBe("Ironton — iron mining town");
  });
});

describe("MarkersModule migrations", () => {
  it("picks animals native to the biome and skips biomes without migrations", async () => {
    await import("./markers-generator");
    globalThis.pack = {
      cells: { i: [0, 1, 2], h: [30, 30, 30], pop: [0, 0, 0], biome: [10, 11, 1] }
    } as any;
    const markers = globalThis.Markers as any;

    expect(markers.listMigrations(pack)).toEqual([0, 2]);
    const marker = { i: 0, cell: 0 } as Marker;
    markers.addMigration(marker, 0);
    expect(["Reindeer", "Musk oxen", "Wolves", "Foxes", "Geese", "Hares", "Owls"]).toContain(
      marker.name.replace(" migration", "")
    );
  });
});

// Golden for the PRNG injection: generate() must place the same markers whether its draws come
// from the ambient stream (pre-migration, seeded here) or the generator's own seed-bound kit
// (post-migration) - both are Alea over options.map.seed, drawn in the same call order.
describe("Markers.generate golden (PRNG)", () => {
  const NAV_KEY = "navigator";

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, NAV_KEY);
    if (descriptor && !descriptor.configurable) return;
    delete (globalThis as any)[NAV_KEY];
  });

  it("reproduces the marker set from a fixed seed", async () => {
    // the encounter legend is the online iframe, which rolls nothing
    Object.defineProperty(globalThis, NAV_KEY, {
      value: { onLine: true },
      configurable: true,
      writable: true
    });
    const NamesModule = await import("./names-generator"); // real Names: marker names roll from its bases
    globalThis.Names = NamesModule.Names;
    await import("./markers-generator");

    const n = 140;
    const cells = {
      i: Array.from({ length: n }, (_, i) => i),
      p: Array.from({ length: n }, (_, i) => [(i % 14) * 250, Math.floor(i / 14) * 350] as [number, number]),
      h: new Array(n).fill(35),
      pop: Array.from({ length: n }, (_, i) => (i < 50 ? 1 : i < 110 ? 5 : 0)),
      biome: new Array(n).fill(5),
      culture: new Array(n).fill(1),
      religion: new Array(n).fill(0),
      state: Array.from({ length: n }, (_, i) => (i >= 50 && i < 110 ? 1 : 0)),
      burg: (() => {
        const burg = new Array(n).fill(0);
        burg[60] = 1;
        return burg;
      })(),
      r: new Array(n).fill(0),
      fl: new Array(n).fill(0),
      t: new Array(n).fill(-1),
      good: new Array(n).fill(0),
      harbor: new Array(n).fill(0),
      c: Array.from({ length: n }, (_, i) => [i - 1, i + 1].filter(x => x >= 0 && x < n))
    };
    vi.stubGlobal("pack", {
      cells,
      cultures: [{ base: 0 }, { base: 1 }],
      burgs: [0, { i: 1, cell: 60, name: "Va", population: 5 }],
      states: [
        { i: 0, name: "Neutrals" },
        { i: 1, name: "Wessex", campaigns: [{ name: "War of the Twin Rivers", start: 100, end: 200 }] }
      ],
      rivers: [],
      features: [{ i: 0, type: "ocean", cells: 0 }],
      markers: []
    });
    vi.stubGlobal("Routes", { isCrossroad: () => false, isConnected: () => false, hasRoad: () => false });
    vi.stubGlobal("Goods", { get: () => undefined });
    vi.stubGlobal("Markets", { get: () => undefined });
    vi.stubGlobal("grid", { cells: { temp: new Array(n).fill(15) } });

    options = Options.getDefaultOptions();
    options.map.seed = "markers-gold";
    options.map.cultures.set = "world";
    vi.spyOn(Math, "random").mockImplementation((await import("alea")).default("markers-gold") as () => number);

    Markers.generate();

    const summary = ((globalThis.pack as any).markers as any[]).map(({ i, type, cell, name, note }) => ({
      i,
      type,
      cell,
      name,
      note
    }));
    expect(summary).toEqual([
      {
        i: 0,
        type: "battlefields",
        cell: 68,
        name: "Westher Battlefield",
        note: "A historical battle of the War of the Twin Rivers. \r\nDate: December 14, 166 Era."
      },
      {
        i: 1,
        type: "dungeons",
        cell: 24,
        name: "Dungeon",
        note: '<div>Undiscovered dungeon. See <a href="https://watabou.github.io/one-page-dungeon/?seed=markers-gold24" target="_blank">One page dungeon</a></div><iframe style="pointer-events: none;" src="https://watabou.github.io/one-page-dungeon/?seed=markers-gold24" sandbox="allow-scripts allow-same-origin"></iframe>'
      },
      {
        i: 2,
        type: "statues",
        cell: 48,
        name: "Bunden Statue",
        note: 'An ancient statue. It has an inscription, but no one can translate it:\n        <div style="font-size: 1.8em; line-break: anywhere;">\udc12\ud802\udc0d\udc01\ud802\ud802\ud802\ud802\ud802\udc3c\udc0c\udc27\ud802\udc2d\udc27\ud802\udc10\udc31\udc27 \ud802\udc0d\udc2f\ud802\udc0c\udc11\udc21\udc1a\udc1b\ud802\ud802\ud802\udc21\udc18\ud802 \ud802\ud802\udc05\ud802\ud802\ud802</div>'
      },
      {
        i: 3,
        type: "ruins",
        cell: 88,
        name: "Ruined Mausoleum",
        note: "Ruins of an ancient mausoleum. Untold riches may lie within."
      },
      {
        i: 4,
        type: "migration",
        cell: 2,
        name: "Mantises migration",
        note: "A huge group of mantises are migrating, whether part of their annual routine, or something more extraordinary."
      },
      {
        i: 5,
        type: "necropolises",
        cell: 124,
        name: "Uxbrid Graveyard",
        note: "A desolate necropolis where an eerie stillness reigns. Time seems frozen amidst the decaying mausoleums, and the silence is broken only by the whispers of the wind and the rustle of tattered banners."
      },
      {
        i: 6,
        type: "encounters",
        cell: 97,
        name: "Random encounter",
        note: '<div>You have encountered a character.</div><iframe src="https://deorum.vercel.app/encounter/97" width="375" height="600" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>'
      },
      { i: 7, type: "party", cell: 60, name: "The Party", note: "Current location of the adventuring party." }
    ]);
  });
});
