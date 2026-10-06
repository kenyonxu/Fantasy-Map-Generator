export interface FloodSeed<Ctx> {
  cell: number;
  ctx: Ctx;
}

export interface FloodOptions<Ctx> {
  seeds: FloodSeed<Ctx>[];
  neighbors: (cell: number) => readonly number[];
  /** total cost of reaching `to` through this edge (fold in `priority`), or null when impassable */
  edgeCost: (from: number, to: number, ctx: Ctx, priority: number) => number | null;
  assign?: (to: number, ctx: Ctx) => void;
  maxCost: number;
  initialCost?: number;
}

interface FloodItem<Ctx> extends FloodSeed<Ctx> {
  priority: number;
}

/** Shared Dijkstra-style flood behind culture, religion and state expansion. */
export function priorityFlood<Ctx>(options: FloodOptions<Ctx>): void {
  const queue = new FlatQueue();
  const cost: number[] = [];

  for (const seed of options.seeds) {
    if (options.initialCost !== undefined) cost[seed.cell] = options.initialCost;
    queue.push({ ...seed, priority: 0 }, 0);
  }

  while (queue.length) {
    const { cell, ctx, priority } = queue.pop() as FloodItem<Ctx>;

    for (const to of options.neighbors(cell)) {
      const totalCost = options.edgeCost(cell, to, ctx, priority);
      if (totalCost === null || totalCost > options.maxCost) continue;

      if (cost[to] === undefined || totalCost < cost[to]) {
        options.assign?.(to, ctx);
        cost[to] = totalCost;
        queue.push({ cell: to, ctx, priority: totalCost }, totalCost);
      }
    }
  }
}
