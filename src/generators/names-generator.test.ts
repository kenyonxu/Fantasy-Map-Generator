import Alea from "alea";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeRandom } from "@/utils/random";
import { Names } from "./names-generator";

// Golden for the PRNG injection: the same values must come out whether the methods draw the
// ambient stream (no kit passed, pre-migration) or the seed-bound kit (post-migration). Both
// streams are Alea over the same seed and the call order is the sequence below.
describe("Names golden", () => {
  const SEED = "names-gold";

  beforeEach(() => {
    globalThis.pack = {
      cultures: Array.from({ length: 6 }, (_, i) => ({ base: i }))
    } as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("reproduces name sequences from a fixed seed", () => {
    vi.spyOn(Math, "random").mockImplementation(Alea(SEED) as () => number);
    const R = makeRandom(SEED);

    const bases = Array.from({ length: 5 }, () => Names.getBase(1, 5, 9, "", R));
    const culture = Names.getCulture(1, 3, 6, "", R);
    const short = Names.getCultureShort(1, R);
    const state = Names.getState("Marlborg", 1, undefined, R);
    const ruthenian = Names.getState("Adalveskton", 5, undefined, R);
    const mapName = Names.getMapName(R);
    const era = Names.getEra(R);

    expect({ bases, culture, short, state, ruthenian, mapName, era }).toEqual({
      bases: ["Piclester", "Wathersbo", "Neton", "Swasalbo", "Bretfield"],
      culture: "Pen",
      short: "Padsmouth",
      state: "Marlborg",
      ruthenian: "Adalve",
      mapName: "Asdes",
      era: "Torkburgh Era"
    });
  });
});
