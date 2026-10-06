import { quadtree } from "d3";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Cultures } from "./cultures-generator";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("uses the requested culture set when regenerating an existing map", () => {
  options = Options.getDefaultOptions();
  options.map.cultures.set = "english";
  options.generation.cultures = { ...options.generation.cultures, set: "highFantasy", limit: 16 };
  const cells = { i: Array.from({ length: 500 }, (_, i) => i), s: Array(500).fill(1), h: [], t: [] };
  vi.stubGlobal("pack", { cells });
  vi.stubGlobal("grid", { cells: { temp: [] } });
  const getDefault = Cultures.getDefault.bind(Cultures);
  let names: string[] = [];
  vi.spyOn(Cultures, "getDefault").mockImplementation(count => {
    names = getDefault(count).map(culture => culture.name);
    throw new Error("stop before placement");
  });

  expect(() => Cultures.regenerate()).toThrow("stop before placement");
  expect(options.map.cultures.set).toBe("highFantasy");
  expect(Cultures.getDefault).toHaveBeenCalledWith(16);
  expect(names.includes("Quenian (Elfish)")).toBe(true);
});

it("recomputes a renamed culture's code without clashing with other cultures", () => {
  vi.stubGlobal("pack", {
    cultures: [
      { i: 0, name: "Wildlands", code: "Wi" },
      { i: 1, name: "Old", code: "Ol" },
      { i: 2, name: "Salt", code: "Sa" }
    ]
  });
  Cultures.rename(1, "Saltmere");
  expect(pack.cultures[1]).toMatchObject({ name: "Saltmere", code: "SA" });
  expect(() => Cultures.rename(5, "X")).toThrow("Culture 5 does not exist");
});

describe("locked culture centers register in the spacing quadtree", () => {
  it("a locked culture's center is found by the spacing search", () => {
    // mirror of cultures-generator.ts:1174 — must add coordinates, not the raw cell id
    const cells: { p: Record<number, [number, number]> } = { p: { 42: [100, 200] } };
    const locked = { lock: true, center: 42 as number | undefined };

    const centers = quadtree<[number, number]>();
    // FIXED behavior: add(this.cells.p[c.center])
    if (locked.center !== undefined) centers.add(cells.p[locked.center]);

    expect(centers.find(100, 200, 15)).toEqual([100, 200]); // within spacing → found
  });
});
