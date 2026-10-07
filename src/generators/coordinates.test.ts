import Alea from "alea";
import { beforeAll, describe, expect, it } from "vitest";

// PRNG injection golden (spec 已知变化 amendment): the mapSize step read the shared global stream,
// transitively depending on the pipeline's draw history (heightmap and markupGrid re-seeds). With the
// RandomKit injection its draws become seed-bound, so RANDOM-template output differs from
// pre-injection by design — the snapshot below locks the NEW post-injection values. Fixed templates
// (TEMPLATE_POSITIONS) never draw and must stay byte-identical.
describe("coordinates golden (PRNG injection)", () => {
  let Coordinates: any;

  beforeAll(async () => {
    globalThis.window = globalThis.window || ({} as any);
    await import("./coordinates");
    Coordinates = (globalThis as any).Coordinates;
  });

  function buildFixture(template: string, seed = "golden-seed", partial = false) {
    globalThis.options = {
      map: { seed, graph: { width: 1280, height: 800 }, geography: {} },
      generation: { template, geography: {} }
    } as any;
    globalThis.grid = {
      features: [0, { land: true, border: partial }, { land: false, border: true }] // index 0: the real placeholder
    } as any;
  }

  function runMapSize(template: string, seed = "golden-seed", partial = false) {
    buildFixture(template, seed, partial);
    Math.random = Alea(seed);
    for (let i = 0; i < 23; i++) Math.random(); // pipeline draw history before the mapSize step
    Coordinates.generate();
    return JSON.parse(JSON.stringify(globalThis.options.map.geography));
  }

  it("sizes a random-template map deterministically from the seed", () => {
    buildFixture("continents");
    const run = runMapSize("continents");
    // mapSize-step draws moved off the global stream: this differs from pre-injection by design
    // (the fresh kit's whole-world roll hits where the old leftover-stream draw missed)
    expect(run).toEqual({
      mapSize: 100,
      latitude: 50,
      longitude: 50,
      coordinates: { latN: 90, latS: -90, latT: 180, lonE: 144, lonT: 288, lonW: -144 }
    });
  });

  it("sizes a partial random-template map through the gauss draws", () => {
    const run = runMapSize("continents", "golden-seed", true); // partial maps skip the whole-world roll
    // same sanctioned change: seed-bound draws instead of the pipeline's leftover stream
    expect(run).toEqual({
      mapSize: 22,
      latitude: 75,
      longitude: 50,
      coordinates: { latN: -15.3, latS: -54.9, latT: 39.6, lonE: 31.7, lonT: 63.4, lonW: -31.7 }
    });
  });

  it("reproduces the same map size on a fresh reseed", () => {
    const first = runMapSize("continents");
    expect(runMapSize("continents")).toEqual(first);
  });

  it("rolls a different map size under a different seed", () => {
    const baseline = runMapSize("continents");
    expect(runMapSize("continents", "golden-seed-6")).not.toEqual(baseline);
  });

  it("keeps fixed-template maps byte-identical", () => {
    expect(runMapSize("world")).toEqual({
      mapSize: 78,
      latitude: 27,
      longitude: 40,
      coordinates: { latN: 79.3, latS: -61.1, latT: 140.4, lonE: 125.8, lonT: 224.6, lonW: -98.8 }
    });
  });
});
