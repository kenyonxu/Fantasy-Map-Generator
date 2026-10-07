import Alea from "alea";
import { beforeEach, describe, expect, it } from "vitest";
import { Options } from "@/components/options-model";
import "./grid-generator";
import "./heightmap-generator";

// golden lock: the same seed must raise the exact same heightmap from a template
const fingerprint = (value: unknown): string => {
  const json = JSON.stringify(value);
  let hash = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    hash ^= json.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
};

const buildGraph = (seed: string) => {
  globalThis.options = Options.getDefaultOptions();
  options.map.seed = seed;
  options.map.graph = { width: 800, height: 600, points: 400 };
  globalThis.grid = Grid.generate(seed, 800, 600, 400);
  return grid;
};

const runTemplate = async (seed: string, templateId: string) => {
  const graph = buildGraph(seed);
  const heights = await HeightmapGenerator.generate(graph, templateId);
  const cells = Array.from(heights);
  return {
    fp: fingerprint(cells),
    land: cells.filter(h => h >= 20).length,
    spot: [cells[0], cells[195], cells[196], cells[197], cells[300]]
  };
};

describe("heightmap template golden", () => {
  beforeEach(() => {
    HeightmapGenerator.clearData();
  });

  // "continents" exercises Hill, Range, Strait, Trough and Pit; "peninsula" adds Invert
  it("raises the continents template deterministically from the seed", async () => {
    const run = await runTemplate("golden-seed", "continents");
    expect(run.fp).toBe("1fe3841d");
    expect(run.land).toBe(291);
    expect(run.spot).toEqual([57, 43, 12, 10, 57]);
  });

  it("raises the peninsula template deterministically from the seed", async () => {
    const run = await runTemplate("golden-seed", "peninsula");
    expect(run.fp).toBe("b2d5ba44");
    expect(run.land).toBe(391);
  });

  it("reproduces the same heights on a fresh rerun", async () => {
    const first = await runTemplate("golden-seed", "continents");
    const second = await runTemplate("golden-seed", "continents");
    expect(second).toEqual(first);
  });

  it("rolls different heights under a different seed", async () => {
    const baseline = await runTemplate("golden-seed", "continents");
    const other = await runTemplate("golden-seed-6", "continents");
    expect(other.fp).not.toBe(baseline.fp);
  });

  // editor contract: template previews and brush tools call the tools directly on the ambient stream
  it("gives the same heights to a direct fromTemplate call on a freshly seeded global", async () => {
    const graph = buildGraph("golden-seed");
    Math.random = Alea(options.map.seed);
    const heights = HeightmapGenerator.fromTemplate(graph, "continents");
    const direct = fingerprint(Array.from(heights));
    const viaGenerate = await runTemplate("golden-seed", "continents");
    expect(direct).toBe(viaGenerate.fp);
  });
});
