import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Options } from "@/components/options-model";
import type { GridGraph } from "@/types/GridGraph";
import "./precipitation-generator";

const CELLS_X = 8;
const CELLS_Y = 6;

// captured before the RandomKit injection; the same seed must keep producing it
const GOLDEN_PREC = [
  0, 0, 0, 0, 0, 0, 0, 0, 15, 15, 31, 38, 26, 89, 10, 15, 15, 10, 55, 13, 55, 25, 15, 15, 15, 15, 19, 88, 43, 43, 10,
  15, 15, 15, 37, 11, 12, 81, 10, 15, 15, 15, 10, 10, 10, 10, 15, 15
];

/** a small handcrafted map: an ocean with a hilly landmass, a permafrost row on top */
const buildGrid = (): GridGraph => {
  const count = CELLS_X * CELLS_Y;
  const at = (x: number, y: number) => y * CELLS_X + x;
  const h = new Uint8Array(count).fill(10);
  for (let y = 1; y <= 4; y++) {
    for (let x = 2; x <= 5; x++) h[at(x, y)] = 40 + ((x + y) % 3) * 15;
  }
  const temp = new Int8Array(count).fill(12);
  for (let x = 0; x < CELLS_X; x++) temp[at(x, 0)] = -10;
  return {
    cellsX: CELLS_X,
    cellsY: CELLS_Y,
    cells: { h, temp, i: Uint32Array.from({ length: count }, (_, i) => i), prec: new Uint8Array(count) }
  } as unknown as GridGraph;
};

describe("Precipitation golden", () => {
  beforeEach(() => {
    globalThis.options = Options.getDefaultOptions();
    options.map.seed = "golden-seed";
    vi.stubGlobal("Grid", { getCellsDesired: () => 10000 });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fills grid.cells.prec with the same winds for the same seed", () => {
    globalThis.grid = buildGrid();
    Precipitation.generate();

    expect(Array.from(grid.cells.prec)).toEqual(GOLDEN_PREC);

    // the winds re-seed per run: someone else's rolls in between change nothing
    for (let i = 0; i < 50; i++) Math.random();
    globalThis.grid = buildGrid();
    Precipitation.generate();
    expect(Array.from(grid.cells.prec)).toEqual(GOLDEN_PREC);
  });

  it("changes the precipitation when the seed changes", () => {
    globalThis.grid = buildGrid();
    Precipitation.generate();
    const first = Array.from(grid.cells.prec);

    options.map.seed = "other-seed";
    globalThis.grid = buildGrid();
    Precipitation.generate();
    expect(Array.from(grid.cells.prec)).not.toEqual(first);
  });
});
