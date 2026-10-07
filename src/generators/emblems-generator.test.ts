import Alea from "alea";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IconSets } from "@/components/icon-sets";
import { charges } from "@/data/emblems/charges";
import { makeRandom } from "@/utils/random";
import "./burgs-generator";
import "./goods-generator";
import "./relief-generator";
import { EmblemsGenerator } from "./emblems-generator";

describe("EmblemsGenerator", () => {
  it("maps every declared charge to one file in its category", () => {
    const emblems = new EmblemsGenerator();
    const catalog = charges as unknown as Record<string, Record<string, number>>;
    const files = emblems.iconSets.flatMap(set => IconSets.files(set.id).map(name => [set.id.slice(8), name]));
    const names = files.map(([, name]) => name);
    expect(new Set(names).size).toBe(names.length);
    for (const [category, name] of files) {
      expect(name in catalog[category]).toBe(true);
      expect(emblems.chargeIcon(name)).toBe(`charges-${category}-${name}`);
    }
    for (const set of emblems.iconSets) {
      const category = set.id.slice(8);
      for (const name of Object.keys(catalog[category])) {
        expect(emblems.chargeIcon(name)).toBe(`charges-${category}-${name}`);
      }
    }
  });

  it("selects shield shapes from explicit data without reading the DOM", () => {
    const emblems = new EmblemsGenerator();
    globalThis.pack = {
      cultures: [
        { i: 0, shield: "round" },
        { i: 1, shield: "polish" }
      ],
      states: [{ i: 0 }, { i: 1, coa: { shield: "hessen", t1: "gules" } }]
    } as unknown as typeof pack;

    expect(emblems.getShield(1, undefined, "culture")).toBe("polish");
    expect(emblems.getShield(1, 1, "state")).toBe("hessen");
    expect(emblems.getShield(1, undefined, "french")).toBe("french");
  });
});

// Golden for the PRNG injection: generate() must draw the same emblems whether its reads come
// from the ambient stream (seeded here) or a same-seed kit threaded by the states/burgs callers.
describe("Emblems.generate golden (PRNG)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reproduces a family of emblems from a fixed seed", () => {
    const emblems = new EmblemsGenerator();
    vi.spyOn(Math, "random").mockImplementation(Alea("emblems-gold") as () => number);

    const family = [
      emblems.generate(null, null, null, "Generic"),
      emblems.generate(null, null, null, "Naval"),
      emblems.generate(null, null, null, "Generic"),
      emblems.generate(null, null, null, "Generic"),
      emblems.generate(null, null, null, "Hunting")
    ];
    const children = family.map(parent => [
      emblems.generate(parent, 0.9, null, "Capital"),
      emblems.generate(parent, 0.25, null, "City"),
      emblems.generate(parent, 0.1, 0.9, "Generic")
    ]);
    const ambient = [family, children];

    expect([family, children]).toEqual([
      [
        {
          t1: "sable",
          charges: [
            {
              charge: "cinquefoil",
              t: "or",
              p: "e",
              size: 1.5
            }
          ]
        },
        {
          t1: "gules",
          ordinaries: [
            {
              ordinary: "pale",
              t: "argent",
              line: "straight"
            }
          ],
          charges: [
            {
              charge: "bowWithThreeArrows",
              t: "argent",
              p: "y",
              t2: "argent",
              t3: "argent",
              size: 0.5
            }
          ]
        },
        {
          t1: "sable",
          division: {
            division: "perFess",
            t: "argent",
            line: "straight"
          },
          charges: [
            {
              charge: "bugleHorn2",
              t: "or",
              p: "k",
              t2: "or",
              size: 0.7
            },
            {
              charge: "column",
              t: "gules",
              p: "n",
              size: 0.7
            }
          ]
        },
        {
          t1: "purpure",
          charges: [
            {
              charge: "centaur",
              t: "or",
              p: "e",
              t2: "or",
              t3: "or",
              size: 1.5
            }
          ]
        },
        {
          t1: "azure",
          ordinaries: [
            {
              ordinary: "terrace",
              t: "argent",
              line: "straight"
            }
          ],
          charges: [
            {
              charge: "crossFleury",
              t: "or",
              p: "e",
              size: 1.5
            }
          ]
        }
      ],
      [
        [
          {
            t1: "sable",
            ordinaries: [
              {
                ordinary: "quarter",
                t: "or"
              }
            ]
          },
          {
            t1: "vert",
            ordinaries: [
              {
                ordinary: "orle",
                t: "or"
              }
            ],
            charges: [
              {
                charge: "mascle",
                t: "or",
                p: "e",
                size: 1.1
              }
            ]
          },
          {
            t1: "purpure",
            charges: [
              {
                charge: "rabbitSejant",
                t: "or",
                p: "e",
                t2: "or",
                size: 1.4
              },
              {
                charge: "cinquefoil",
                t: "sable",
                p: "y",
                size: 0.5
              }
            ],
            ordinaries: [
              {
                ordinary: "canton",
                t: "or"
              }
            ]
          }
        ],
        [
          {
            t1: "gules",
            division: {
              division: "perFess",
              t: "argent",
              line: "rayonne"
            },
            charges: [
              {
                charge: "bowWithThreeArrows",
                t: "or",
                p: "k",
                t2: "or",
                t3: "or",
                size: 0.7
              },
              {
                charge: "fusil",
                t: "vert",
                p: "n",
                size: 0.7
              }
            ]
          },
          {
            t1: "purpure",
            ordinaries: [
              {
                ordinary: "bend",
                t: "or",
                line: "straight"
              }
            ],
            charges: [
              {
                charge: "pot",
                t: "gules",
                p: "joe",
                size: 0.5
              }
            ]
          },
          {
            t1: "sable",
            charges: [
              {
                charge: "palace",
                t: "argent",
                p: "e",
                size: 1.4
              },
              {
                charge: "bowWithThreeArrows",
                t: "gules",
                p: "y",
                size: 0.5
              }
            ],
            ordinaries: [
              {
                ordinary: "canton",
                t: "argent"
              }
            ]
          }
        ],
        [
          {
            t1: "azure",
            ordinaries: [
              {
                ordinary: "orle",
                t: "argent"
              }
            ],
            charges: [
              {
                charge: "bugleHorn2",
                t: "or",
                p: "abcpqh",
                t2: "or",
                size: 0.5
              }
            ]
          },
          {
            t1: "gules",
            charges: [
              {
                charge: "bugleHorn2",
                t: "argent",
                p: "e",
                t2: "argent",
                size: 1.5
              }
            ]
          },
          {
            t1: "argent",
            division: {
              division: "perPale",
              t: "sable",
              line: "straight"
            },
            charges: [
              {
                charge: "roundel2",
                t: "vert",
                p: "pq",
                divided: "counter",
                size: 0.7
              },
              {
                charge: "bugleHorn2",
                t: "or",
                p: "y",
                size: 0.5
              }
            ],
            ordinaries: [
              {
                ordinary: "canton",
                t: "sable"
              }
            ]
          }
        ],
        [
          {
            t1: "purpure",
            ordinaries: [
              {
                ordinary: "terrace",
                t: "argent",
                line: "straight"
              }
            ],
            charges: [
              {
                charge: "centaur",
                t: "argent",
                p: "e",
                t2: "or",
                t3: "or",
                size: 1.5
              }
            ]
          },
          {
            t1: "purpure",
            charges: [
              {
                charge: "crossMaltese",
                t: "argent",
                p: "e",
                size: 1.5
              }
            ]
          },
          {
            t1: "or",
            charges: [
              {
                charge: "scissors",
                t: "gules",
                p: "ln",
                size: 0.7
              },
              {
                charge: "centaur",
                t: "or",
                p: "y",
                size: 0.5
              }
            ],
            ordinaries: [
              {
                ordinary: "canton",
                t: "purpure"
              }
            ]
          }
        ],
        [
          {
            t1: "azure",
            charges: [
              {
                charge: "scalesHanging",
                t: "or",
                p: "jln",
                size: 0.7
              }
            ]
          },
          {
            t1: "counterPotent-or-vert",
            division: {
              division: "perPale",
              t: "sable",
              line: "straight"
            },
            ordinaries: [
              {
                ordinary: "bordure",
                t: "gules"
              }
            ]
          },
          {
            t1: "argent",
            ordinaries: [
              {
                ordinary: "bordure",
                t: "sable"
              },
              {
                ordinary: "canton",
                t: "azure"
              }
            ],
            charges: [
              {
                charge: "butterfly",
                t: "argent",
                p: "ABCDEFGHIJKL",
                t2: "purpure",
                t3: "argent",
                size: 0.18
              },
              {
                charge: "crossFleury",
                t: "or",
                p: "y",
                size: 0.5
              }
            ]
          }
        ]
      ]
    ]);

    // the kit the states/burgs callers thread must reproduce the ambient sequence exactly
    const R = makeRandom("emblems-gold");
    const kitFamily = [
      emblems.generate(null, null, null, "Generic", R),
      emblems.generate(null, null, null, "Naval", R),
      emblems.generate(null, null, null, "Generic", R),
      emblems.generate(null, null, null, "Generic", R),
      emblems.generate(null, null, null, "Hunting", R)
    ];
    const kitChildren = kitFamily.map(parent => [
      emblems.generate(parent, 0.9, null, "Capital", R),
      emblems.generate(parent, 0.25, null, "City", R),
      emblems.generate(parent, 0.1, 0.9, "Generic", R)
    ]);
    expect([kitFamily, kitChildren]).toEqual(ambient);
  });
});
