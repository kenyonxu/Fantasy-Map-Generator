import Alea from "alea";
import { afterEach, describe, expect, it } from "vitest";
import * as prob from "./probabilityUtils";
import type { RandomKit } from "./random";
import { makeRandom } from "./random";

const SEED = "test-seed";
const DRAW = 50;
const originalRandom = Math.random;

afterEach(() => {
  Math.random = originalRandom;
});

describe("makeRandom", () => {
  it("is deterministic for the same seed", () => {
    const a = makeRandom(SEED);
    const b = makeRandom(SEED);
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
  });

  it("matches probabilityUtils globals for the same seed", () => {
    const compare = (kitDraw: (kit: RandomKit) => unknown, globalDraw: () => unknown) => {
      Math.random = Alea(SEED);
      const kit = makeRandom(SEED);
      const kitSeq: unknown[] = [];
      const globalSeq: unknown[] = [];
      for (let i = 0; i < DRAW; i++) {
        kitSeq.push(kitDraw(kit));
        globalSeq.push(globalDraw());
      }
      expect(kitSeq).toEqual(globalSeq);
    };

    compare(
      kit => kit.next(),
      () => Math.random()
    );
    compare(
      kit => kit.rand(),
      () => prob.rand()
    );
    compare(
      kit => kit.rand(10),
      () => prob.rand(10)
    );
    compare(
      kit => kit.rand(1, 10),
      () => prob.rand(1, 10)
    );
    compare(
      kit => kit.P(0.5),
      () => prob.P(0.5)
    );
    compare(
      kit => kit.ra([1, 2, 3, 4, 5]),
      () => prob.ra([1, 2, 3, 4, 5])
    );
    compare(
      kit => kit.rw({ a: 1, b: 3 }),
      () => prob.rw({ a: 1, b: 3 })
    );
    compare(
      kit => kit.gauss(100, 30),
      () => prob.gauss(100, 30)
    );
    compare(
      kit => kit.biased(0, 10, 2),
      () => prob.biased(0, 10, 2)
    );
    compare(
      kit => kit.Pint(2.5),
      () => prob.Pint(2.5)
    );
  });

  it("instances are isolated", () => {
    const a = makeRandom(SEED);
    const b = makeRandom("other-seed");
    const bRef = makeRandom("other-seed");
    expect(b.next()).toBe(bRef.next());
    for (let i = 0; i < 10; i++) a.next();
    expect(b.next()).toBe(bRef.next());

    const c = makeRandom(SEED);
    const d = makeRandom("other-seed");
    expect([c.next(), c.next()]).not.toEqual([d.next(), d.next()]);
  });

  it("throws on empty/undefined seed", () => {
    expect(() => makeRandom("")).toThrow("makeRandom requires a non-empty seed");
    // @ts-expect-error - undefined seed must throw at runtime
    expect(() => makeRandom(undefined)).toThrow("makeRandom requires a non-empty seed");
  });

  it("accepts numeric 0 as a valid seed", () => {
    expect(() => makeRandom(0)).not.toThrow();
  });

  it("throws on null seed", () => {
    // @ts-expect-error - null seed must throw at runtime
    expect(() => makeRandom(null)).toThrow("makeRandom requires a non-empty seed");
  });
});
