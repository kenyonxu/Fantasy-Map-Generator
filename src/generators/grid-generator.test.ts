import { describe, expect, it } from "vitest";
import "./grid-generator";

// golden lock: the same seed must rebuild the exact same graph
const fingerprint = (value: unknown): string => {
  const json = JSON.stringify(value);
  let hash = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    hash ^= json.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
};

describe("Grid.generate golden", () => {
  it("reproduces the same graph for the same seed", () => {
    const graph = Grid.generate("golden-seed", 800, 600, 400);

    expect(graph.spacing).toBe(34.64);
    expect(graph.cellsX).toBe(23);
    expect(graph.cellsY).toBe(17);
    expect(graph.points.length).toBe(391);
    expect(graph.points[0]).toEqual([6.21, 11.85]);

    expect(fingerprint(graph.points)).toBe("b91deb8d");
    expect(fingerprint(graph.cells.c)).toBe("4f5d20da");
    expect(fingerprint(graph.vertices.p)).toBe("67425127");
    expect(fingerprint(graph.boundary)).toBe("e8bc230e");

    // generation restarts its own PRNG, so a rerun from scratch lands on the same graph
    const rerun = Grid.generate("golden-seed", 800, 600, 400);
    expect(fingerprint(rerun.points)).toBe(fingerprint(graph.points));
    expect(fingerprint(rerun.cells.c)).toBe(fingerprint(graph.cells.c));
  });

  it("changes the graph when the seed changes", () => {
    const a = Grid.generate("golden-seed", 800, 600, 400);
    const b = Grid.generate("other-seed", 800, 600, 400);
    expect(fingerprint(b.points)).not.toBe(fingerprint(a.points));
  });
});
