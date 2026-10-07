import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MIN_NAVIGABLE_FLUX } from "./river-generator";

describe("RoutesModule river-aware water cost", () => {
  let Routes: any;

  beforeEach(async () => {
    globalThis.TIME = false;
    globalThis.window = globalThis.window || ({} as any);
    // Defaults overridden per-test; needs to exist before module import so window.Routes wires up
    globalThis.pack = {
      cells: {
        h: [] as number[],
        r: [] as number[],
        fl: [] as number[],
        p: [] as [number, number][],
        t: [] as number[],
        g: [] as number[]
      },
      rivers: [],
      routes: []
    } as any;
    globalThis.grid = { cells: { temp: [20, 20, 20, 20, 20, 20, 20, 20] } } as any;

    await import("./routes-generator");
    Routes = (globalThis as any).Routes;
  });

  function setupTwoRiverPack() {
    // Layout: two parallel rivers (A: cells 1->2, B: cells 3->4), both with flux >= threshold.
    // Cells 2 and 3 are voronoi-neighbors (banks face each other across a watershed) but they
    // belong to different rivers and must NOT be river-adjacent.
    globalThis.pack.cells = {
      h: [20, 25, 25, 25, 25, 5], // 5 is sea
      r: [0, 1, 1, 2, 2, 0],
      fl: [0, MIN_NAVIGABLE_FLUX, MIN_NAVIGABLE_FLUX + 50, MIN_NAVIGABLE_FLUX, MIN_NAVIGABLE_FLUX + 50, 0],
      p: [
        [0, 0],
        [10, 0],
        [20, 0],
        [10, 5],
        [20, 5],
        [30, 0]
      ],
      t: [1, 1, 1, 1, 1, -1],
      g: [0, 0, 0, 0, 0, 0]
    } as any;
    // River A flows 1 -> 2 -> 5 (sea); River B flows 3 -> 4 -> 5 (sea)
    globalThis.pack.rivers = [
      { i: 1, cells: [1, 2, 5] },
      { i: 2, cells: [3, 4, 5] }
    ] as any;
    Routes.sync();
  }

  it("allows a step along the river course above the flux threshold", () => {
    setupTwoRiverPack();
    expect(Routes.getWaterPathCost(1, 2)).toBeLessThan(Infinity);
    expect(Routes.getWaterPathCost(2, 1)).toBeLessThan(Infinity);
  });

  it("rejects a step between voronoi-adjacent cells of different rivers", () => {
    setupTwoRiverPack();
    expect(Routes.getWaterPathCost(2, 3)).toBe(Infinity);
    expect(Routes.getWaterPathCost(3, 2)).toBe(Infinity);
  });

  it("rejects a step onto a river cell with flux below the threshold", () => {
    globalThis.pack.cells = {
      h: [20, 25, 25],
      r: [0, 1, 1],
      fl: [0, MIN_NAVIGABLE_FLUX, MIN_NAVIGABLE_FLUX - 1],
      p: [
        [0, 0],
        [10, 0],
        [20, 0]
      ],
      t: [1, 1, 1],
      g: [0, 0, 0]
    } as any;
    globalThis.pack.rivers = [{ i: 1, cells: [1, 2] }] as any;
    Routes.sync();

    expect(Routes.getWaterPathCost(1, 2)).toBe(Infinity);
  });

  it("permits the river mouth ↔ sea transition", () => {
    setupTwoRiverPack();
    expect(Routes.getWaterPathCost(2, 5)).toBeLessThan(Infinity);
    expect(Routes.getWaterPathCost(5, 2)).toBeLessThan(Infinity);
  });

  it("allows a coastal non-river land cell to exit to any adjacent water cell", () => {
    // cell 0 is a coastal port (land, no river); cells 1 and 2 are adjacent sea cells
    globalThis.pack.cells = {
      h: [25, 5, 5],
      r: [0, 0, 0],
      fl: [0, 0, 0],
      p: [
        [0, 0],
        [10, 0],
        [0, 10]
      ],
      t: [1, -1, -1],
      g: [0, 0, 0]
    } as any;
    globalThis.pack.rivers = [] as any;
    Routes.sync();

    expect(Routes.getWaterPathCost(0, 1)).toBeLessThan(Infinity);
    expect(Routes.getWaterPathCost(0, 2)).toBeLessThan(Infinity);
  });

  it("forces a coastal port to exit through its haven cell", () => {
    // cell 0 is a coastal port with two adjacent sea cells; its haven is cell 1.
    // The route must leave through the haven so it meets the burg shifted toward it.
    globalThis.pack.cells = {
      h: [25, 5, 5],
      r: [0, 0, 0],
      fl: [0, 0, 0],
      haven: [1, 0, 0], // cell 0's haven is cell 1
      p: [
        [0, 0],
        [10, 0],
        [0, 10]
      ],
      t: [1, -1, -1],
      g: [0, 0, 0]
    } as any;
    globalThis.pack.rivers = [] as any;
    Routes.sync();

    expect(Routes.getWaterPathCost(0, 1)).toBeLessThan(Infinity); // haven — allowed
    expect(Routes.getWaterPathCost(0, 2)).toBe(Infinity); // non-haven water — blocked
  });

  it("rejects exit from a river-mouth land cell into a non-mouth water cell", () => {
    // River 1 mouth at cell 2; recorded sea exit is cell 5.
    // Cell 6 is a sea cell also voronoi-adjacent to the mouth but not the recorded outlet.
    globalThis.pack.cells = {
      h: [25, 25, 25, 5, 5, 5, 5],
      r: [0, 1, 1, 0, 0, 0, 0],
      fl: [0, MIN_NAVIGABLE_FLUX, MIN_NAVIGABLE_FLUX + 50, 0, 0, 0, 0],
      p: [
        [0, 0],
        [10, 0],
        [20, 0],
        [25, 0],
        [25, 5],
        [25, -5],
        [30, 0]
      ],
      t: [1, 1, 1, -1, -1, -1, -2],
      g: [0, 0, 0, 0, 0, 0, 0]
    } as any;
    globalThis.pack.rivers = [{ i: 1, cells: [1, 2, 5] }] as any;
    Routes.sync();

    expect(Routes.getWaterPathCost(2, 5)).toBeLessThan(Infinity); // recorded outlet — allowed
    expect(Routes.getWaterPathCost(2, 6)).toBe(Infinity); // adjacent water but not the river's outlet
  });

  it("rejects land cells that are not on a river at all", () => {
    globalThis.pack.cells = {
      h: [20, 25, 25],
      r: [0, 0, 1],
      fl: [0, 0, MIN_NAVIGABLE_FLUX],
      p: [
        [0, 0],
        [10, 0],
        [20, 0]
      ],
      t: [1, 1, 1],
      g: [0, 0, 0]
    } as any;
    globalThis.pack.rivers = [{ i: 1, cells: [2] }] as any;
    Routes.sync();

    expect(Routes.getWaterPathCost(0, 1)).toBe(Infinity);
  });
});

describe("RoutesModule.findWaterPath", () => {
  let Routes: any;

  // Two coastal ports (land cells 0 and 4) with three sea cells between them.
  // Cell 0's haven is cell 1; cell 4's haven is set per test.
  function setupTwoPortsPack(destinationHaven: number) {
    globalThis.TIME = false;
    globalThis.window = globalThis.window || ({} as any);
    // Minimal stand-in for the legacy FlatQueue global the shared findPath uses
    (globalThis as any).window.FlatQueue = class {
      items: { id: number; priority: number }[] = [];
      get length() {
        return this.items.length;
      }
      push(id: number, priority: number) {
        this.items.push({ id, priority });
        this.items.sort((a, b) => a.priority - b.priority);
      }
      peekValue() {
        return this.items[0]?.priority;
      }
      pop() {
        return this.items.shift()?.id;
      }
    };
    globalThis.grid = { cells: { temp: [20, 20, 20, 20, 20] } } as any;
    globalThis.pack = {
      cells: {
        h: [25, 5, 5, 5, 25],
        r: [0, 0, 0, 0, 0],
        fl: [0, 0, 0, 0, 0],
        haven: [1, 0, 0, 0, destinationHaven],
        burg: [1, 0, 0, 0, 2],
        c: [
          [1, 2],
          [0, 2, 3],
          [0, 1, 3, 4],
          [1, 2, 4],
          [2, 3]
        ],
        p: [
          [0, 0],
          [10, 0],
          [10, 10],
          [20, 0],
          [30, 0]
        ],
        t: [1, -1, -2, -1, 1],
        g: [0, 0, 0, 0, 0]
      },
      burgs: [{}, { x: 2, y: 1 }, { x: 28, y: 1 }],
      rivers: [],
      routes: []
    } as any;
  }

  beforeEach(async () => {
    setupTwoPortsPack(3);
    await import("./routes-generator");
    Routes = (globalThis as any).Routes;
    Routes.sync();
  });

  it("leaves and enters ports through their havens", () => {
    expect(Routes.findWaterPath(0, 4)).toEqual([0, 1, 3, 4]);
  });

  it("detours to the haven the destination port was shifted towards", () => {
    setupTwoPortsPack(2);
    Routes.sync();
    expect(Routes.findWaterPath(0, 4)).toEqual([0, 1, 2, 4]);
  });

  it("returns null when the destination cannot be reached over water", () => {
    globalThis.pack.cells.h = [25, 25, 25, 5, 25] as any; // the sea is cut off by land
    Routes.sync();
    expect(Routes.findWaterPath(0, 4)).toBe(null);
  });

  it("getWaterPoints anchors the path at the burg positions, not the cell centres", () => {
    const points = Routes.getWaterPoints([0, 1, 3, 4]);
    expect(points.at(0)).toEqual([2, 1, 0]);
    expect(points.at(-1)).toEqual([28, 1, 4]);
  });
});

describe("RoutesModule.addMeandering", () => {
  let Routes: any;
  let Rivers: any;

  beforeEach(async () => {
    globalThis.TIME = false;
    globalThis.window = globalThis.window || ({} as any);
    options.map.graph = { width: 1000, height: 1000, points: 10000 };
    globalThis.pack = {
      cells: {
        h: [] as number[],
        r: [] as number[],
        fl: [] as number[],
        p: [] as [number, number][],
        t: [] as number[],
        g: [] as number[],
        burg: [] as number[]
      },
      burgs: [],
      rivers: [],
      routes: []
    } as any;
    globalThis.grid = { cells: { temp: [20, 20, 20, 20, 20, 20, 20, 20] } } as any;

    await import("./routes-generator");
    await import("./river-generator");
    Routes = (globalThis as any).Routes;
    Rivers = (globalThis as any).Rivers;
  });

  function setupRiverPack() {
    // 5 cells along a single river [1,2,3,4], cell 5 is sea (mouth water)
    globalThis.pack.cells = {
      h: [20, 25, 25, 25, 25, 5],
      r: [0, 1, 1, 1, 1, 0],
      fl: [0, 200, 200, 200, 200, 0],
      p: [
        [0, 0],
        [10, 0],
        [25, 0],
        [40, 0],
        [55, 0],
        [70, 0]
      ],
      t: [1, 1, 1, 1, 1, -1],
      g: [0, 0, 0, 0, 0, 0],
      burg: [0, 0, 0, 0, 0, 0]
    } as any;
    globalThis.pack.rivers = [{ i: 1, cells: [1, 2, 3, 4, 5] }] as any;
    Routes.sync();
  }

  it("emits an anchor for each input cell and interior meander points between river-edge anchors", () => {
    setupRiverPack();
    const routeCells = [1, 2, 3, 4];
    const anchors = routeCells.map(c => globalThis.pack.cells.p[c]);
    const result = Routes.addMeandering(routeCells, anchors);

    // Every input cell appears in the output, and interpolation produces extra points.
    const emittedCellIds = new Set(result.map((p: number[]) => p[2]));
    for (const c of routeCells) {
      expect(emittedCellIds.has(c)).toBe(true);
    }
    expect(result.length).toBeGreaterThan(routeCells.length);
  });

  it("emits one point per cell when there are no river edges (open sea)", () => {
    globalThis.pack.cells = {
      h: [5, 5, 5],
      r: [0, 0, 0],
      fl: [0, 0, 0],
      p: [
        [0, 0],
        [10, 0],
        [20, 0]
      ],
      t: [-1, -1, -1],
      g: [0, 0, 0],
      burg: [0, 0, 0]
    } as any;
    globalThis.pack.rivers = [] as any;
    Routes.sync();

    const routeCells = [0, 1, 2];
    const anchors = routeCells.map(c => globalThis.pack.cells.p[c]);
    const result = Routes.addMeandering(routeCells, anchors);

    expect(result.length).toBe(routeCells.length);
    expect(result.map((p: number[]) => p[2])).toEqual(routeCells);
  });

  it("matches anchor positions when route runs upstream (mouth→source)", () => {
    setupRiverPack();
    const downstreamCells = [1, 2, 3, 4];
    const upstreamCells = downstreamCells.slice().reverse();
    const downstreamAnchors = downstreamCells.map(c => globalThis.pack.cells.p[c]);
    const upstreamAnchors = upstreamCells.map(c => globalThis.pack.cells.p[c]);

    const down = Routes.addMeandering(downstreamCells, downstreamAnchors);
    const up = Routes.addMeandering(upstreamCells, upstreamAnchors);

    // The number of points produced is the same in both directions.
    expect(up.length).toBe(down.length);

    // Reversing the upstream output should give the same anchor coordinates as the downstream output
    const downAnchorXY = down.map((p: number[]) => [p[0], p[1]]);
    const upReversedXY = up
      .slice()
      .reverse()
      .map((p: number[]) => [p[0], p[1]]);
    expect(upReversedXY).toEqual(downAnchorXY);
  });

  it("splits the run at a confluence (each river meandered independently)", () => {
    // Two rivers joining at cell 3.
    // River 1: 1 → 2 → 3 (downstream). River 2: 5 → 4 → 3 (downstream).
    // Route walks tributary [5,4,3] then continues onto river 1 backwards [3,2,1] (upstream),
    // which exercises the confluence split.
    globalThis.pack.cells = {
      h: [20, 25, 25, 25, 25, 25],
      r: [0, 1, 1, 1, 2, 2],
      fl: [0, 200, 200, 300, 200, 200],
      p: [
        [0, 0],
        [10, 0],
        [25, 0],
        [40, 0],
        [40, 15],
        [40, 30]
      ],
      t: [1, 1, 1, 1, 1, 1],
      g: [0, 0, 0, 0, 0, 0],
      burg: [0, 0, 0, 0, 0, 0]
    } as any;
    globalThis.pack.rivers = [
      { i: 1, cells: [1, 2, 3] },
      { i: 2, cells: [5, 4, 3] }
    ] as any;
    Routes.sync();

    const routeCells = [5, 4, 3, 2, 1];
    const anchors = routeCells.map(c => globalThis.pack.cells.p[c]);
    const result = Routes.addMeandering(routeCells, anchors);

    // The cellId sequence should transition through the route order, with no spurious gaps.
    const cellIds = result.map((p: number[]) => p[2]);
    const transitions: number[] = [];
    for (let i = 0; i < cellIds.length; i++) {
      if (i === 0 || cellIds[i] !== cellIds[i - 1]) transitions.push(cellIds[i]);
    }
    expect(transitions).toEqual(routeCells);
  });

  it("anchors river-following cells at cell centers, ignoring shifted burg coords", () => {
    setupRiverPack();
    const routeCells = [1, 2, 3, 4];
    // Burg at cell 3 is shifted off its cell center; the route must still follow the river.
    const anchors: [number, number][] = [
      [10, 0],
      [25, 0],
      [40, 3], // burg shifted off cell center (cell 3 center is [40, 0])
      [55, 0]
    ];
    const result = Routes.addMeandering(routeCells, anchors);

    // The anchor for cell 3 must be the cell center [40, 0], not the burg coord [40, 3].
    const cell3Anchors = result.filter(
      (p: number[], idx: number, arr: number[][]) => p[2] === 3 && (idx === 0 || arr[idx - 1][2] !== 3)
    );
    expect(cell3Anchors.length).toBeGreaterThan(0);
    const cell3Anchor = cell3Anchors[0];
    expect(cell3Anchor[0]).toBe(40);
    expect(cell3Anchor[1]).toBe(0);
  });

  it("keeps a port cell on the river course — burg markers never move a river route", () => {
    setupRiverPack();
    // Ports at both an interior cell (3) and the terminal cell (4), each with a burg marker shifted
    // off the river. A river-following route ignores the markers entirely and stays on the course.
    globalThis.pack.cells.burg = [0, 0, 0, 7, 9, 0] as any;
    const routeCells = [1, 2, 3, 4];
    const anchors: [number, number][] = [
      [10, 0],
      [25, 0],
      [40, 9], // interior port marker — ignored
      [55, 8] // terminal port marker — ignored
    ];
    const result = Routes.addMeandering(routeCells, anchors);

    // Interior port (cell 3) stays at its river cell center [40, 0].
    const cell3Anchor = result.find(
      (p: number[], idx: number, arr: number[][]) => p[2] === 3 && (idx === 0 || arr[idx - 1][2] !== 3)
    );
    expect([cell3Anchor[0], cell3Anchor[1]]).toEqual([40, 0]);

    // Terminal port (cell 4) also stays at its river cell center [55, 0], not the marker [55, 8].
    const last = result[result.length - 1];
    expect(last[2]).toBe(4);
    expect([last[0], last[1]]).toEqual([55, 0]);
  });

  it("buildLinks does not create self-links from interior meander points", () => {
    setupRiverPack();
    const routeCells = [1, 2, 3, 4];
    const anchors = routeCells.map(c => globalThis.pack.cells.p[c]);
    const result = Routes.addMeandering(routeCells, anchors);

    const route = { i: 0, group: "searoutes", feature: 0, points: result };
    const links = Routes.buildLinks([route]);

    // No cell should link to itself
    for (const fromStr of Object.keys(links)) {
      const from = Number(fromStr);
      expect(links[from][from]).toBeUndefined();
    }
    // Adjacent cells in the route should be linked
    expect(links[1][2]).toBe(0);
    expect(links[2][3]).toBe(0);
    expect(links[3][4]).toBe(0);
  });

  it("produces geometry identical to the river polygon along the same cells", () => {
    setupRiverPack();
    const riverCells = [1, 2, 3, 4, 5];

    // River polygon geometry: cell centers, [x, y, flux]
    const polygon = Rivers.addMeandering(riverCells);

    // Route geometry along the same cells (downstream), anchored at cell centers internally
    const routeAnchors = riverCells.map(c => globalThis.pack.cells.p[c]);
    const route = Routes.addMeandering(riverCells, routeAnchors);

    // Same number of points, and every x/y coincides — the route overlays the river exactly.
    expect(route.length).toBe(polygon.length);
    for (let i = 0; i < polygon.length; i++) {
      expect(route[i][0]).toBeCloseTo(polygon[i][0], 6);
      expect(route[i][1]).toBeCloseTo(polygon[i][1], 6);
    }
  });

  it("a partial route run overlays the river polygon exactly, even where acute angles were relaxed", () => {
    // A sharp zig-zag river (cells 1..5 on land, 6 the sea mouth) so the meander relaxation flips
    // acute cusps. A route covering only the interior cells [2,3,4] must still trace the same
    // curve the polygon does over those cells — re-meandering its own slice would relax the run
    // boundaries differently and drift off the river.
    globalThis.pack.cells = {
      h: [20, 25, 25, 25, 25, 25, 5],
      r: [0, 1, 1, 1, 1, 1, 0],
      fl: [0, 200, 200, 200, 200, 200, 0],
      p: [
        [0, 0],
        [0, 0],
        [15, 16],
        [30, 0],
        [45, 16],
        [60, 0],
        [75, 5]
      ],
      t: [1, 1, 1, 1, 1, 1, -1],
      g: [0, 0, 0, 0, 0, 0, 0],
      burg: [0, 0, 0, 0, 0, 0, 0]
    } as any;
    globalThis.pack.rivers = [{ i: 1, cells: [1, 2, 3, 4, 5, 6] }] as any;
    Routes.sync();

    const polygon = Rivers.addMeandering([1, 2, 3, 4, 5, 6]);

    // Anchors are never moved by relaxation, so each cell center appears verbatim in the polygon.
    const anchorIndexOf = (cell: number) => {
      const [cx, cy] = globalThis.pack.cells.p[cell];
      return polygon.findIndex((point: number[]) => point[0] === cx && point[1] === cy);
    };
    const from = anchorIndexOf(2);
    const to = anchorIndexOf(4);
    const polygonSlice = polygon.slice(from, to + 1);

    const runCells = [2, 3, 4];
    const route = Routes.addMeandering(
      runCells,
      runCells.map(c => globalThis.pack.cells.p[c])
    );

    expect(route.length).toBe(polygonSlice.length);
    for (let i = 0; i < polygonSlice.length; i++) {
      expect(route[i][0]).toBeCloseTo(polygonSlice[i][0], 6);
      expect(route[i][1]).toBeCloseTo(polygonSlice[i][1], 6);
    }
  });
});

describe("RoutesModule.remove", () => {
  let Routes: any;

  beforeEach(async () => {
    globalThis.TIME = false;
    globalThis.window = globalThis.window || ({} as any);
    // d3 select() needs a document in the node env
    globalThis.document = { querySelector: () => null, documentElement: {} } as any;
    globalThis.pack = { cells: {}, routes: [] } as any;
    await import("./routes-generator");
    Routes = (globalThis as any).Routes;
  });

  it("removes a route when the link index is asymmetric (reverse cell absent)", () => {
    globalThis.pack.routes = [
      {
        i: 1,
        group: "roads",
        points: [
          [0, 0, 10],
          [0, 0, 20]
        ]
      }
    ] as any;
    // asymmetric index: forward link 10->20 exists but cell 20 has no reverse entry
    globalThis.pack.cells.routes = { 10: { 20: 1 } } as any;

    expect(() => Routes.remove(globalThis.pack.routes[0].i)).not.toThrow();
    expect(globalThis.pack.routes).toHaveLength(0);
    expect(globalThis.pack.cells.routes[10][20]).toBeUndefined();
  });
});

describe("ensureRouteGroupStyles", () => {
  it("seeds styles for route groups missing from the store, keeping existing entries", async () => {
    globalThis.TIME = false;
    globalThis.window = globalThis.window || ({} as any);
    globalThis.grid = { cells: { temp: [20] } } as any;
    globalThis.pack = {
      cells: { h: [], r: [], fl: [], p: [], t: [], g: [] },
      rivers: [],
      routes: [
        { i: 0, group: "roads", points: [] },
        { i: 1, group: "route-royal", points: [] }
      ]
    } as any;
    await import("./routes-generator");
    const Routes = (globalThis as any).Routes;

    const roads = { attrs: { opacity: 0.9, stroke: "#d06324", "stroke-width": 0.7 } };
    (globalThis as any).styles = { routes: { groups: { roads: structuredClone(roads) } } };

    Routes.ensureRouteGroupStyles();

    const groups = (globalThis as any).styles.routes.groups;
    expect(groups.roads).toEqual(roads);
    expect(groups["route-royal"]).toEqual(roads);
    expect(groups["route-royal"]).not.toBe(groups.roads);
  });
});

describe("ensureRouteGroupStyles before a map exists", () => {
  it("is a no-op when the pack has no routes yet (style preset applied on initial load)", async () => {
    globalThis.TIME = false;
    globalThis.window = globalThis.window || ({} as any);
    globalThis.grid = { cells: { temp: [20] } } as any;
    globalThis.pack = {} as any;
    await import("./routes-generator");
    const Routes = (globalThis as any).Routes;

    (globalThis as any).styles = { routes: { groups: { roads: { attrs: { opacity: 0.9 } } } } };

    expect(() => Routes.ensureRouteGroupStyles()).not.toThrow();
    expect(Object.keys((globalThis as any).styles.routes.groups)).toEqual(["roads"]);
  });
});

describe("Routes.generate golden (PRNG)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // Golden for the PRNG injection: generate() must produce the same routes (names included)
  // whether the naming draws come from the ambient stream (pre-migration, seeded here) or
  // the generator's own seed-bound kit (post-migration) - both are Alea over options.map.seed.
  it("reproduces roads, trails, searoutes and their names from a fixed seed", async () => {
    globalThis.TIME = false;
    globalThis.Names = (await import("./names-generator")).Names;
    await import("./pack-generator"); // wires window.Pack (window === globalThis in tests)
    // @ts-expect-error vendored UMD script without TypeScript declarations
    (globalThis as any).FlatQueue = (await import("../../public/libs/flatqueue.js")).default;
    await import("./routes-generator");
    const Routes = (globalThis as any).Routes;

    const W = 14;
    const H = 10;
    const n = W * H;
    const col = (i: number) => i % W;
    const row = (i: number) => Math.floor(i / W);
    const isWater = (i: number) => col(i) >= 11;
    const neighbors = (i: number) =>
      [
        [col(i) - 1, row(i)],
        [col(i) + 1, row(i)],
        [col(i), row(i) - 1],
        [col(i), row(i) + 1]
      ]
        .filter(([c, r]) => c >= 0 && c < W && r >= 0 && r < H)
        .map(([c, r]) => r * W + c);
    const burgAt = (i: number, cell: number, name: string, capital = 0, port = 0) => ({
      i,
      cell,
      name,
      capital,
      port,
      feature: 1,
      x: col(cell) * 100 + 50,
      y: row(cell) * 100 + 50
    });
    const haven = new Array(n).fill(0);
    haven[52] = 53; // port 5 (cell 10,3) leaves through its haven into the channel
    haven[108] = 109; // port 6 (cell 10,7) likewise
    globalThis.pack = {
      burgs: [
        0,
        burgAt(1, 30, "Vaerna", 1), // (2,2)
        burgAt(2, 36, "Ostmouth", 1), // (8,2)
        burgAt(3, 87, "Rudd"), // (3,6)
        burgAt(4, 91, "Kern"), // (7,6)
        burgAt(5, 52, "Milhaven", 0, 2), // (10,3) port on the channel
        burgAt(6, 108, "Saltbruck", 0, 2) // (10,7)
      ],
      rivers: [],
      routes: [],
      biomes: Array.from({ length: 12 }, (_, i) => ({ i, habitability: i === 0 ? 0 : 25 + i * 5 })),
      features: [0, { i: 1, type: "island" }, { i: 2, type: "ocean" }],
      cells: {
        i: Array.from({ length: n }, (_, i) => i),
        c: Array.from({ length: n }, (_, i) => neighbors(i)),
        p: Array.from({ length: n }, (_, i) => [col(i) * 100, row(i) * 100] as [number, number]),
        h: Array.from({ length: n }, (_, i) => (isWater(i) ? 5 : 35)),
        t: Array.from({ length: n }, (_, i) => (isWater(i) ? -1 : 2)),
        biome: Array.from({ length: n }, () => 5),
        r: Array.from({ length: n }, () => 0),
        fl: Array.from({ length: n }, () => 0),
        g: Array.from({ length: n }, (_, i) => i % 4),
        f: Array.from({ length: n }, (_, i) => (isWater(i) ? 2 : 1)),
        burg: (() => {
          const burg = new Array(n).fill(0);
          burg[30] = 1;
          burg[36] = 2;
          burg[87] = 3;
          burg[91] = 4;
          burg[52] = 5;
          burg[108] = 6;
          return burg;
        })(),
        haven
      }
    } as any;
    globalThis.grid = { cells: { temp: [24, 22, 20, 18] } } as any;

    options.map.seed = "routes-gold";
    options.map.graph = { width: 1400, height: 1000, points: 10000 };
    const Alea = (await import("alea")).default;
    vi.spyOn(Math, "random").mockImplementation(Alea("routes-gold") as () => number);

    Routes.generate();

    const routes = (globalThis.pack as any).routes;
    expect(
      routes.map((r: any) => ({
        i: r.i,
        group: r.group,
        name: r.name,
        feature: r.feature,
        cells: r.points.map((p: any) => p[2])
      }))
    ).toEqual([
      {
        i: 0,
        group: "roads",
        name: "The Misty Ostmouth highway",
        feature: 1,
        cells: [30, 31, 32, 33, 34, 35, 36]
      },
      {
        i: 1,
        group: "trails",
        name: "Ostmouth track",
        feature: 1,
        cells: [108, 94, 80, 66, 52, 38, 37, 36]
      },
      {
        i: 2,
        group: "trails",
        name: "Kernese trail",
        feature: 1,
        cells: [94, 93, 92, 91]
      },
      {
        i: 3,
        group: "trails",
        name: "Kernese trail",
        feature: 1,
        cells: [87, 88, 89, 90, 91]
      },
      {
        i: 4,
        group: "trails",
        name: "Ostmouth pass",
        feature: 1,
        cells: [92, 78, 64, 50, 36]
      },
      {
        i: 5,
        group: "trails",
        name: "Crimson trail",
        feature: 1,
        cells: [31, 45, 59, 73, 87]
      },
      {
        i: 6,
        group: "searoutes",
        name: "The Obscure Eldritch lane",
        feature: 2,
        cells: [52, 53, 67, 81, 95, 109, 108]
      }
    ]);
  });
});
