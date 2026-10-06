import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type FloodSeed, priorityFlood } from "./flood";

interface QueueItem {
  cell: number;
  priority: number;
}

/** FlatQueue stand-in: stable min-priority queue that records every push (tests only). */
class RecordingFlatQueue {
  private items: { item: QueueItem; priority: number }[] = [];
  pushed: { item: QueueItem; priority: number }[] = [];
  get length() {
    return this.items.length;
  }
  push(item: QueueItem, priority: number) {
    this.pushed.push({ item, priority });
    this.items.push({ item, priority });
    this.items.sort((a, b) => a.priority - b.priority); // stable: ties pop in push order
  }
  pop() {
    return this.items.shift()?.item;
  }
}

/** n cells in a row, bidirectional adjacency */
const line = (n: number): number[][] =>
  Array.from({ length: n }, (_, i) => [i - 1, i + 1].filter(neib => neib >= 0 && neib < n));

describe("priorityFlood", () => {
  const queues: RecordingFlatQueue[] = [];

  beforeEach(() => {
    queues.length = 0;
    vi.stubGlobal(
      "FlatQueue",
      class extends RecordingFlatQueue {
        constructor() {
          super();
          queues.push(this);
        }
      }
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("floods a line from the seed and accumulates cost along the path", () => {
    const c = line(4);
    const assigned: [number, string][] = [];
    const seenPriorities = new Map<number, number>(); // popped cell → priority edgeCost received

    priorityFlood<string>({
      seeds: [{ cell: 0, ctx: "A" }],
      neighbors: cell => c[cell],
      edgeCost: (from, _to, _ctx, priority) => {
        seenPriorities.set(from, priority);
        return priority + 1;
      },
      assign: (to, ctx) => assigned.push([to, ctx]),
      maxCost: 10,
      initialCost: 0
    });

    expect(assigned).toEqual([
      [1, "A"],
      [2, "A"],
      [3, "A"]
    ]); // the seed was visited: its neighbors got flooded
    expect(seenPriorities.get(0)).toBe(0); // seed pops at priority 0
    expect(seenPriorities.get(2)).toBe(2); // cell 2 pops at 0 → 1 → 2 accumulated cost
  });

  it("lets the seed cell be claimed over a back-edge when initialCost is omitted", () => {
    const c = line(4);
    const assigned: number[] = [];

    priorityFlood<string>({
      seeds: [{ cell: 0, ctx: "A" }],
      neighbors: cell => c[cell],
      edgeCost: (_from, _to, _ctx, priority) => priority + 1,
      assign: to => assigned.push(to),
      maxCost: 10
    });

    // cultures sets no seed cost, so its center is assigned when reached back from a neighbor
    expect(assigned).toEqual([1, 0, 2, 3]);
  });

  it("skips edges edgeCost rejects with null", () => {
    const c = line(4);
    const assigned: number[] = [];

    priorityFlood<string>({
      seeds: [{ cell: 0, ctx: "A" }],
      neighbors: cell => c[cell],
      edgeCost: (_from, to, _ctx, priority) => (to === 2 ? null : priority + 1),
      assign: to => assigned.push(to),
      maxCost: 10,
      initialCost: 0
    });

    expect(assigned).toEqual([1]); // 2 is impassable, so 2 and 3 are never reached
    expect(queues[0].pushed.map(({ item }) => item.cell)).toEqual([0, 1]);
  });

  it("stops expanding past maxCost", () => {
    const c = line(4);
    const assigned: number[] = [];
    const expanded = new Set<number>();

    priorityFlood<string>({
      seeds: [{ cell: 0, ctx: "A" }],
      neighbors: cell => c[cell],
      edgeCost: (from, _to, _ctx, priority) => {
        expanded.add(from);
        return priority + 2;
      },
      assign: to => assigned.push(to),
      maxCost: 4, // reaches 1 (2) and 2 (4), truncates 3 (6)
      initialCost: 0
    });

    expect(assigned).toEqual([1, 2]);
    expect(expanded.has(3)).toBe(false); // truncated cells are never enqueued nor expanded
  });

  it("hands assign the reached cell and the ctx object by reference", () => {
    const c = line(2);
    const ctx = { stateId: 7, nativeBiome: 4 };
    let assignedCell = -1;
    let assignedCtx: unknown = null;

    priorityFlood<typeof ctx>({
      seeds: [{ cell: 0, ctx }],
      neighbors: cell => c[cell],
      edgeCost: (_from, _to, _seedCtx, priority) => priority + 1,
      assign: (to, seedCtx) => {
        assignedCell = to;
        assignedCtx = seedCtx;
      },
      maxCost: 5,
      initialCost: 0
    });

    expect(assignedCell).toBe(1);
    expect(assignedCtx).toBe(ctx);
  });

  it("does not re-enqueue cells reached at zero total cost", () => {
    const c = line(3);
    const assigned: number[] = [];

    priorityFlood<string>({
      seeds: [{ cell: 0, ctx: "A" }],
      neighbors: cell => c[cell],
      edgeCost: (_from, _to, _ctx, priority) => priority, // every step costs 0
      assign: to => assigned.push(to),
      maxCost: 1
    });

    // regression guard: `!cost[n]` treated 0-cost cells as unvisited forever and churned the queue
    const pushCounts = new Map<number, number>();
    for (const { item } of queues[0].pushed) pushCounts.set(item.cell, (pushCounts.get(item.cell) ?? 0) + 1);
    expect(pushCounts.get(0)).toBe(2); // seed + a single improvement (undefined → 0)
    expect(pushCounts.get(1)).toBe(1);
    expect(pushCounts.get(2)).toBe(1);
    expect(assigned).toEqual([1, 0, 2]); // each cell is assigned once, then never touched again
  });

  it("treats seeds as visited at initialCost", () => {
    const c = line(2);
    const assigned: [number, string][] = [];

    priorityFlood<string>({
      seeds: [{ cell: 0, ctx: "A" }],
      neighbors: cell => c[cell],
      edgeCost: (_from, _to, _ctx, priority) => priority + 10,
      assign: (to, ctx) => assigned.push([to, ctx]),
      maxCost: 100,
      initialCost: 1
    });

    // religions/states mark seed cells with cost 1 so back-edges (total ≥ 10) cannot claim them
    expect(assigned).toEqual([[1, "A"]]);
    expect(queues[0].pushed.map(({ item }) => item.cell)).toEqual([0, 1]);
  });

  it("floods from multiple seeds, each carrying its own ctx", () => {
    const c = line(4);
    const assigned: [number, number][] = [];
    const seeds: FloodSeed<number>[] = [
      { cell: 0, ctx: 1 },
      { cell: 3, ctx: 2 }
    ];

    priorityFlood<number>({
      seeds,
      neighbors: cell => c[cell],
      edgeCost: (_from, _to, _ctx, priority) => priority + 1,
      assign: (to, ctx) => assigned.push([to, ctx]),
      maxCost: 1, // each seed reaches only its immediate neighbor
      initialCost: 0
    });

    expect(assigned).toEqual([
      [1, 1],
      [2, 2]
    ]);
  });
});
