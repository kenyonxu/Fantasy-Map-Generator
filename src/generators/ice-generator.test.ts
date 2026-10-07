import { beforeEach, describe, expect, it } from "vitest";
import { Options } from "@/components/options-model";
import type { GridFeature } from "./features-generator";
import "./grid-generator";
import "./ice-generator";

// golden lock: the same seed must carve the exact same glaciers and icebergs
const fingerprint = (value: unknown): string => {
  const json = JSON.stringify(value);
  let hash = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    hash ^= json.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
};

/** a mock map warm in the south: a northern landmass grows glaciers, the cold sea around it grows icebergs */
const buildMockMap = (seed: string) => {
  globalThis.options = Options.getDefaultOptions();
  options.map.seed = seed;
  options.map.graph = { width: 800, height: 600, points: 400 };

  globalThis.grid = Grid.generate(seed, 800, 600, 400);
  const { cells, points } = grid;
  const count = points.length;

  const h = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    const y = points[i][1];
    if (y > 120 && y < 260 && i % 7 !== 0) h[i] = 30 + (i % 5) * 10; // holes keep the coastline ragged
  }
  cells.h = h;

  const temp = new Int8Array(count);
  for (let i = 0; i < count; i++) temp[i] = Math.round((points[i][1] / 600) * 50 - 25);
  cells.temp = temp;

  cells.f = new Uint16Array(count); // every cell hangs off the one ocean feature, so no lake ice
  grid.features = [{ i: 0, land: false, border: true, type: "ocean" }] as GridFeature[];

  const t = new Int8Array(count);
  for (let i = 0; i < count; i++) {
    const isLand = h[i] >= 20;
    if (cells.c[i].some(n => h[n] >= 20 !== isLand)) t[i] = isLand ? 1 : -1;
  }
  cells.t = t;

  globalThis.pack = { ice: [] } as unknown as typeof pack;
};

// captured before the RandomKit injection; the same seed must keep producing it
const GOLDEN = {
  count: 19,
  glaciers: 1,
  icebergs: 18,
  fingerprint: "22a2c30a"
};

describe("Ice.generate golden", () => {
  beforeEach(() => {
    buildMockMap("golden-seed");
  });

  it("reproduces the same ice for the same seed", () => {
    Ice.generate();

    expect(pack.ice.length).toBe(GOLDEN.count);
    expect(pack.ice.filter(ice => ice.type === "glacier").length).toBe(GOLDEN.glaciers);
    expect(pack.ice.filter(ice => ice.type === "iceberg").length).toBe(GOLDEN.icebergs);
    expect(fingerprint(pack.ice)).toBe(GOLDEN.fingerprint);

    // generation restarts its own PRNG, so a rerun lands on the same ice
    Ice.generate();
    expect(fingerprint(pack.ice)).toBe(GOLDEN.fingerprint);
  });

  it("changes the ice when the seed changes", () => {
    Ice.generate();
    const first = fingerprint(pack.ice);

    options.map.seed = "other-seed"; // same grid, different ice rolls
    Ice.generate();
    expect(fingerprint(pack.ice)).not.toBe(first);
  });
});
