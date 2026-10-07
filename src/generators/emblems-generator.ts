import { IconSets } from "@/components/icon-sets";
import { Icons } from "@/components/icons";
import {
  charges,
  divisions,
  lineWeights,
  ordinaries,
  positions,
  shields,
  tinctures,
  typeMapping
} from "@/data/emblems";
import type { Emblem, EmblemCharge, EmblemOrdinary, HeraldicEmblem } from "@/types/emblems";
import type { IconSet } from "@/types/icons";
import { P, rw } from "@/utils";
import type { RandomKit } from "@/utils/random";

declare global {
  interface Window {
    Emblems: EmblemsGenerator;
  }
}

// shapes that resolve per entity rather than fixing one shield for the whole map (the "Diversiform" option group)
const DIVERSIFORM_SHAPES = ["culture", "random", "state"];

// without a kit, direct callers (editors, provinces) draw the ambient global stream
const roll = (R: RandomKit | undefined, probability: number): boolean => (R ? R.P(probability) : P(probability));
const pickWeighted = (R: RandomKit | undefined, object: Record<string, number>): string =>
  R ? R.rw(object) : rw(object);

function createTinctures(R?: RandomKit) {
  return {
    field: { ...tinctures.field, stains: +roll(R, tinctures.field.stains) },
    division: { ...tinctures.division, stains: +roll(R, tinctures.division.stains) },
    charge: { ...tinctures.charge, stains: +roll(R, tinctures.charge.stains) },
    metals: tinctures.metals,
    colours: tinctures.colours,
    stains: tinctures.stains,
    patterns: tinctures.patterns
  };
}

export type ChargeIconSetId = `charges-${string}`;

// the charge categories drawn from files: inescutcheons are built from shield paths
const CHARGE_CATEGORIES = Object.keys(charges.types).filter(type => type !== "inescutcheon" && type !== "uploaded");

/** Charge files keep Armoria's 200-unit shield space: the symbol frames the charge box and never clips,
 * takes its tinctures from the charge group, and scopes the ids the art uses inside itself */
function prepareCharge(svg: string, symbolId: string): string {
  return svg
    .replace(/^\s*<svg\b[^>]*>/, '<svg viewBox="60 60 80 80" overflow="visible">')
    .replace(/<g id="[^"]*"/, "<g")
    .replace(/\bid="([^"]+)"/g, `id="${symbolId}-$1"`)
    .replace(/href="#([^"]+)"/g, `href="#${symbolId}-$1"`)
    .replace(/url\(#([^)]+)\)/g, `url(#${symbolId}-$1)`);
}

export class EmblemsGenerator {
  private emblemShape = "culture";

  /** one icon set per charge category, so a map loads only the categories its emblems use */
  readonly iconSets: readonly (IconSet & { id: ChargeIconSetId })[] = CHARGE_CATEGORIES.map(category => ({
    id: `charges-${category}` as ChargeIconSetId,
    group: "Heraldry",
    prepare: prepareCharge,
    paint: { fill: "#d7374a", stroke: "#000" } // gules, Armoria's preview tincture
  }));

  /** the icon reference of a charge name as blazons store it, `lionRampant` → `charges-beasts-lionRampant` */
  chargeIcon(name: string): string | undefined {
    return this.iconSets.map(({ id }) => IconSets.symbolId(id, name)).find(id => IconSets.fileOf(id));
  }

  /** what a charge stores for a picked icon: a charge set's file name, so blazons stay Armoria's; any other icon as it is */
  chargeOf(icon: string): string {
    const set = IconSets.setForId(icon);
    return set?.startsWith("charges-") ? icon.slice(set.length + 1) : icon;
  }

  /** the icon a charge draws: its charge set symbol, or the library icon it names */
  chargeArt(charge: string): string | undefined {
    return this.chargeIcon(charge) ?? (Icons.kind(charge) ? charge : undefined);
  }

  generate(
    parentEmblem: Emblem | null | undefined,
    kinship: number | null,
    dominion: number | null,
    type?: string,
    R?: RandomKit
  ): HeraldicEmblem {
    const parent = parentEmblem && "t1" in parentEmblem ? parentEmblem : null;
    if (!parent) {
      kinship = 0;
      dominion = 0;
    }

    let usedPattern: string | null = null;
    const usedTinctures: string[] = [];

    const t1 = roll(R, kinship as number) ? parent!.t1 : this.getTincture("field", usedTinctures, null, R);
    if (t1.includes("-")) usedPattern = t1;
    const emblem: HeraldicEmblem = { t1 };

    const addCharge = roll(R, usedPattern ? 0.5 : 0.93); // 80% for charge
    const linedOrdinary =
      (addCharge && roll(R, 0.3)) || roll(R, 0.5)
        ? parent?.ordinaries && roll(R, kinship as number)
          ? parent.ordinaries[0].ordinary
          : pickWeighted(R, ordinaries.lined)
        : null;

    const ordinary =
      (!addCharge && roll(R, 0.65)) || roll(R, 0.3)
        ? linedOrdinary
          ? linedOrdinary
          : pickWeighted(R, ordinaries.straight)
        : null; // 36% for ordinary
    const rareDivided = ["chief", "terrace", "chevron", "quarter", "flaunches"].includes(ordinary!);

    const divisioned = (() => {
      if (rareDivided) return roll(R, 0.03);
      if (addCharge && ordinary) return roll(R, 0.03);
      if (addCharge) return roll(R, 0.3);
      if (ordinary) return roll(R, 0.7);
      return roll(R, 0.995);
    })();

    const division = (() => {
      if (divisioned) {
        if (parent?.division && roll(R, (kinship as number) - 0.1)) return parent.division.division;
        return pickWeighted(R, divisions.variants);
      }
      return null;
    })();

    if (division) {
      const t = this.getTincture("division", usedTinctures, roll(R, 0.98) ? emblem.t1 : null, R);
      emblem.division = { division, t };
      if (divisions[division as keyof typeof divisions])
        emblem.division.line =
          usedPattern || (ordinary && roll(R, 0.7))
            ? "straight"
            : pickWeighted(R, divisions[division as keyof typeof divisions]);
    }

    if (ordinary) {
      emblem.ordinaries = [{ ordinary, t: this.getTincture("charge", usedTinctures, emblem.t1, R) }];
      if (linedOrdinary)
        emblem.ordinaries[0].line =
          usedPattern || (division && roll(R, 0.7)) ? "straight" : pickWeighted(R, lineWeights);
      if (division && !addCharge && !usedPattern && roll(R, 0.5) && ordinary !== "bordure" && ordinary !== "orle") {
        if (roll(R, 0.8)) emblem.ordinaries[0].divided = "counter";
        // 40%
        else if (roll(R, 0.6)) emblem.ordinaries[0].divided = "field";
        // 6%
        else emblem.ordinaries[0].divided = "division"; // 4%
      }
    }

    if (addCharge) {
      const charge = (() => {
        if (parent?.charges && roll(R, (kinship as number) - 0.1)) return parent.charges[0].charge;
        if (type && type !== "Generic" && roll(R, 0.3)) return pickWeighted(R, typeMapping[type]);
        return this.selectCharge(ordinary || divisioned ? charges.types : charges.single, R);
      })();
      const chargeDataEntry = charges.data[charge] || {};

      let p: string;
      let t: string;

      const ordinaryData = ordinaries.data[ordinary!];
      const tOrdinary = emblem.ordinaries ? emblem.ordinaries[0].t : null;

      if (ordinaryData?.positionsOn && roll(R, 0.8)) {
        // place charge over ordinary (use tincture of field type)
        p = pickWeighted(R, ordinaryData.positionsOn);
        t = !usedPattern && roll(R, 0.3) ? emblem.t1 : this.getTincture("charge", [], tOrdinary, R);
      } else if (ordinaryData?.positionsOff && roll(R, 0.95)) {
        // place charge out of ordinary (use tincture of ordinary type)
        p = pickWeighted(R, ordinaryData.positionsOff);
        t = !usedPattern && roll(R, 0.3) ? tOrdinary! : this.getTincture("charge", usedTinctures, emblem.t1, R);
      } else if (positions.divisions[division as keyof typeof positions.divisions]) {
        // place charge in fields made by division
        p = pickWeighted(R, positions.divisions[division as keyof typeof positions.divisions]);
        t = this.getTincture("charge", tOrdinary ? usedTinctures.concat(tOrdinary) : usedTinctures, emblem.t1, R);
      } else if (chargeDataEntry.positions) {
        // place charge-suitable position
        p = pickWeighted(R, chargeDataEntry.positions);
        t = this.getTincture("charge", usedTinctures, emblem.t1, R);
      } else {
        // place in standard position (use new tincture)
        p = usedPattern
          ? "e"
          : charges.conventional[charge as keyof typeof charges.conventional]
            ? pickWeighted(R, positions.conventional)
            : pickWeighted(R, positions.complex);
        t = this.getTincture("charge", usedTinctures.concat(tOrdinary!), emblem.t1, R);
      }

      if (chargeDataEntry.natural && chargeDataEntry.natural !== t && chargeDataEntry.natural !== tOrdinary)
        t = chargeDataEntry.natural;

      const item: EmblemCharge = { charge: charge, t, p };
      const colors = chargeDataEntry.colors || 1;
      if (colors > 1) item.t2 = roll(R, 0.25) ? this.getTincture("charge", usedTinctures, emblem.t1, R) : t;
      if (colors > 2 && item.t2) item.t3 = roll(R, 0.5) ? this.getTincture("charge", usedTinctures, emblem.t1, R) : t;
      emblem.charges = [item];

      if (p === "ABCDEFGHIJKL" && roll(R, 0.95)) {
        // add central charge if charge is in bordure
        emblem.charges[0].charge = pickWeighted(R, charges.conventional);
        const chargeNew = this.selectCharge(charges.single, R);
        const tNew = this.getTincture("charge", usedTinctures, emblem.t1, R);
        emblem.charges.push({ charge: chargeNew, t: tNew, p: "e" });
      } else if (roll(R, 0.8) && charge === "inescutcheon") {
        // add charge to inescutcheon
        const chargeNew = this.selectCharge(charges.types, R);
        const t2 = this.getTincture("charge", [], t, R);
        emblem.charges.push({ charge: chargeNew, t: t2, p, size: 0.5 });
      } else if (division && !ordinary) {
        const allowCounter = !usedPattern && (!emblem.division?.line || emblem.division.line === "straight");

        // dimidiation: second charge at division basic positions
        if (roll(R, 0.3) && ["perPale", "perFess"].includes(division) && emblem.division?.line === "straight") {
          emblem.charges[0].divided = "field";
          if (roll(R, 0.95)) {
            const p2 =
              p === "e" || roll(R, 0.5)
                ? "e"
                : pickWeighted(R, positions.divisions[division as keyof typeof positions.divisions]);
            const chargeNew = this.selectCharge(charges.single, R);
            const tNew = this.getTincture("charge", usedTinctures, emblem.division!.t, R);
            emblem.charges.push({
              charge: chargeNew,
              t: tNew,
              p: p2,
              divided: "division"
            });
          }
        } else if (allowCounter && roll(R, 0.4)) emblem.charges[0].divided = "counter";
        // counterchanged, 40%
        else if (["perPale", "perFess", "perBend", "perBendSinister"].includes(division) && roll(R, 0.8)) {
          // place 2 charges in division standard positions
          const [p1, p2] =
            division === "perPale"
              ? ["p", "q"]
              : division === "perFess"
                ? ["k", "n"]
                : division === "perBend"
                  ? ["l", "m"]
                  : ["j", "o"]; // perBendSinister
          emblem.charges[0].p = p1;

          const chargeNew = this.selectCharge(charges.single, R);
          const tNew = this.getTincture("charge", usedTinctures, emblem.division!.t, R);
          emblem.charges.push({ charge: chargeNew, t: tNew, p: p2 });
        } else if (["perCross", "perSaltire"].includes(division) && roll(R, 0.5)) {
          // place 4 charges in division standard positions
          const [p1, p2, p3, p4] = division === "perCross" ? ["j", "l", "m", "o"] : ["b", "d", "f", "h"];
          emblem.charges[0].p = p1;

          const c2 = this.selectCharge(charges.single, R);
          const t2 = this.getTincture("charge", [], emblem.division!.t, R);

          const c3 = this.selectCharge(charges.single, R);
          const t3 = this.getTincture("charge", [], emblem.division!.t, R);

          const c4 = this.selectCharge(charges.single, R);
          const t4 = this.getTincture("charge", [], emblem.t1, R);
          emblem.charges.push({ charge: c2, t: t2, p: p2 }, { charge: c3, t: t3, p: p3 }, { charge: c4, t: t4, p: p4 });
        } else if (allowCounter && p.length > 1) emblem.charges[0].divided = "counter"; // counterchanged, 40%
      }

      for (const c of emblem.charges) {
        this.defineChargeAttributes(ordinary, division, c, R);
      }
    }

    // dominions have canton with parent coa
    if (roll(R, dominion as number) && parent?.charges) {
      const invert = this.isSameType(parent.t1, emblem.t1, R);
      const t = invert ? this.getTincture("division", usedTinctures, emblem.t1, R) : parent.t1;
      const canton: EmblemOrdinary = { ordinary: "canton", t };

      if (emblem.charges) {
        for (let i = emblem.charges.length - 1; i >= 0; i--) {
          const charge = emblem.charges[i];
          if (charge.size === 1.5) charge.size = 1.4;
          charge.p = charge.p.replaceAll(/[ajy]/g, "");
          if (!charge.p) emblem.charges.splice(i, 1);
        }
      }

      let charge = parent.charges[0].charge;
      if (charge === "inescutcheon" && parent.charges[1]) charge = parent.charges[1].charge;

      let t2 = invert ? parent.t1 : parent.charges[0].t;
      if (this.isSameType(t, t2, R)) t2 = this.getTincture("charge", usedTinctures, t, R);

      if (!emblem.charges) emblem.charges = [];
      emblem.charges.push({ charge, t: t2, p: "y", size: 0.5 });

      if (emblem.ordinaries) {
        emblem.ordinaries.push(canton);
      } else {
        emblem.ordinaries = [canton];
      }
    }

    return emblem;
  }

  setShape(shape: string): void {
    this.emblemShape = shape;
  }

  get shape(): string {
    return this.emblemShape;
  }

  /** The shape is picked per culture or state instead of being fixed for the whole map */
  get isDiversiform(): boolean {
    return DIVERSIFORM_SHAPES.includes(this.emblemShape);
  }

  private selectCharge(set?: Record<string, number>, R?: RandomKit): string {
    const type = set ? pickWeighted(R, set) : pickWeighted(R, charges.types);
    return type === "inescutcheon"
      ? "inescutcheon"
      : pickWeighted(R, charges[type as keyof typeof charges] as Record<string, number>);
  }

  // Select tincture: element type (field, division, charge), used field tinctures, field type to follow RoT
  private getTincture(
    element: "field" | "division" | "charge",
    fields: string[] = [],
    RoT: string | null,
    R?: RandomKit
  ): string {
    const base = RoT ? (RoT.includes("-") ? RoT.split("-")[1] : RoT) : null;
    const tinctures = createTinctures(R);

    let type = pickWeighted(R, tinctures[element]); // metals, colours, stains, patterns
    if (RoT && type !== "patterns") type = this.getType(base!, R) === "metals" ? "colours" : "metals"; // follow RoT
    if (type === "metals" && fields.includes("or") && fields.includes("argent")) type = "colours"; // exclude metals overuse
    let tincture = pickWeighted(R, tinctures[type as keyof typeof tinctures] as Record<string, number>);

    while (tincture === base || fields.includes(tincture)) {
      tincture = pickWeighted(R, tinctures[type as keyof typeof tinctures] as Record<string, number>);
    } // follow RoT

    if (type !== "patterns" && element !== "charge") fields.push(tincture); // add field tincture

    if (type === "patterns") {
      tincture = this.definePattern(tincture, element, fields, R);
    }

    return tincture;
  }

  private defineChargeAttributes(
    ordinary: string | null,
    division: string | null,
    c: EmblemCharge,
    R?: RandomKit
  ): void {
    // define size
    c.size = (c.size || 1) * this.getSize(c.p, ordinary, division);

    // clean-up position
    c.p = [...new Set(c.p)].join("");

    // define orientation
    if (roll(R, 0.02) && charges.data[c.charge]?.sinister) c.sinister = 1;
    if (roll(R, 0.02) && charges.data[c.charge]?.reversed) c.reversed = 1;
  }

  private getType(t: string, R?: RandomKit): string | undefined {
    const tinc = t.includes("-") ? t.split("-")[1] : t;
    const tinctures = createTinctures(R);
    if (Object.keys(tinctures.metals).includes(tinc)) return "metals";
    if (Object.keys(tinctures.colours).includes(tinc)) return "colours";
    if (Object.keys(tinctures.stains).includes(tinc)) return "stains";
    return undefined;
  }

  private isSameType(t1: string, t2: string, R?: RandomKit): boolean {
    return this.typeOf(t1, R) === this.typeOf(t2, R);
  }

  private typeOf(tinc: string, R?: RandomKit): string {
    const tinctures = createTinctures(R);
    if (Object.keys(tinctures.metals).includes(tinc)) return "metals";
    if (Object.keys(tinctures.colours).includes(tinc)) return "colours";
    if (Object.keys(tinctures.stains).includes(tinc)) return "stains";
    return "pattern";
  }

  private definePattern(
    pattern: string,
    element: "field" | "division" | "charge",
    usedTinctures: string[],
    R?: RandomKit
  ): string {
    let t1: string | null = null;
    let t2: string | null = null;
    let size = "";

    // Size selection - must use sequential P() calls to match original behavior
    if (roll(R, 0.1)) size = "-small";
    // biome-ignore lint/suspicious/noDuplicateElseIf: sequential P() calls advance random state, conditions are not truly duplicate
    else if (roll(R, 0.1)) size = "-smaller";
    else if (roll(R, 0.01)) size = "-big";
    else if (roll(R, 0.005)) size = "-smallest";

    // apply standard tinctures
    if (roll(R, 0.5) && ["vair", "vairInPale", "vairEnPointe"].includes(pattern)) {
      t1 = "azure";
      t2 = "argent";
    } else if (roll(R, 0.8) && pattern === "ermine") {
      t1 = "argent";
      t2 = "sable";
    } else if (pattern === "pappellony") {
      if (roll(R, 0.2)) {
        t1 = "gules";
        t2 = "or";
        // biome-ignore lint/suspicious/noDuplicateElseIf: sequential P() calls advance random state, conditions are not truly duplicate
      } else if (roll(R, 0.2)) {
        t1 = "argent";
        t2 = "sable";
        // biome-ignore lint/suspicious/noDuplicateElseIf: sequential P() calls advance random state, conditions are not truly duplicate
      } else if (roll(R, 0.2)) {
        t1 = "azure";
        t2 = "argent";
      }
    } else if (pattern === "masoned") {
      if (roll(R, 0.3)) {
        t1 = "gules";
        t2 = "argent";
        // biome-ignore lint/suspicious/noDuplicateElseIf: sequential P() calls advance random state, conditions are not truly duplicate
      } else if (roll(R, 0.3)) {
        t1 = "argent";
        t2 = "sable";
      } else if (roll(R, 0.1)) {
        t1 = "or";
        t2 = "sable";
      }
    } else if (pattern === "fretty") {
      if (t2 === "sable" || roll(R, 0.35)) {
        t1 = "argent";
        t2 = "gules";
      } else if (roll(R, 0.25)) {
        t1 = "sable";
        t2 = "or";
      } else if (roll(R, 0.15)) {
        t1 = "gules";
        t2 = "argent";
      }
    } else if (pattern === "semy") pattern = `${pattern}_of_${this.selectCharge(charges.semy, R)}`;

    if (!t1 || !t2) {
      const tinctures = createTinctures(R);
      const startWithMetal = roll(R, 0.7);
      t1 = startWithMetal ? pickWeighted(R, tinctures.metals) : pickWeighted(R, tinctures.colours);
      t2 = startWithMetal ? pickWeighted(R, tinctures.colours) : pickWeighted(R, tinctures.metals);
    }

    // division should not be the same tincture as base field
    if (element === "division") {
      if (usedTinctures.includes(t1)) t1 = this.replaceTincture(t1, R);
      if (usedTinctures.includes(t2)) t2 = this.replaceTincture(t2, R);
    }

    usedTinctures.push(t1, t2);
    return `${pattern}-${t1}-${t2}${size}`;
  }

  private replaceTincture(t: string, R?: RandomKit): string {
    const type = this.getType(t, R);
    let n: string | null = null;
    const tinctures = createTinctures(R);
    while (!n || n === t) {
      n = pickWeighted(R, tinctures[type as keyof typeof tinctures] as Record<string, number>);
    }
    return n;
  }

  private getSize(p: string, o: string | null = null, d: string | null = null): number {
    if (p === "e" && (o === "bordure" || o === "orle")) return 1.1;
    if (p === "e") return 1.5;
    if (p === "jln" || p === "jlh") return 0.7;
    if (p === "abcpqh" || p === "ez" || p === "be") return 0.5;
    if (["a", "b", "c", "d", "f", "g", "h", "i", "bh", "df"].includes(p)) return 0.5;
    if (["j", "l", "m", "o", "jlmo"].includes(p) && d === "perCross") return 0.6;
    if (p.length > 10) return 0.18; // >10 (bordure)
    if (p.length > 7) return 0.3; // 8, 9, 10
    if (p.length > 4) return 0.4; // 5, 6, 7
    if (p.length > 2) return 0.5; // 3, 4
    return 0.7; // 1, 2
  }

  /** Carry the map placement over a regeneration: the size and position are the user's, not the generator's */
  private keepPlacement(previous: Emblem | undefined, emblem: HeraldicEmblem): HeraldicEmblem {
    if (previous?.size !== undefined) emblem.size = previous.size;
    if (previous?.x !== undefined) emblem.x = previous.x;
    if (previous?.y !== undefined) emblem.y = previous.y;
    return emblem;
  }

  regenerate(): void {
    pack.states.forEach(state => {
      if (!state.i || state.removed) return;
      const cultureType = pack.cultures[state.culture].type;
      state.coa = this.keepPlacement(state.coa, this.generate(null, null, null, cultureType));
      state.coa.shield = this.getShield(state.culture);
    });

    pack.burgs.forEach(burg => {
      if (!burg.i || burg.removed) return;
      const state = burg.state === undefined ? undefined : pack.states[burg.state];
      let kinship = state ? 0.25 : 0;
      if (burg.capital) kinship += 0.1;
      else if (burg.port) kinship -= 0.1;
      if (state && burg.culture !== state.culture) kinship -= 0.25;
      burg.coa = this.keepPlacement(burg.coa, this.generate(state ? state.coa : null, kinship, null, burg.type));
      burg.coa.shield = this.getShield(burg.culture ?? 0, state ? burg.state : 0);
    });

    pack.provinces.forEach(province => {
      if (!province.i || province.removed) return;
      const parent = province.burg ? pack.burgs[province.burg] : pack.states[province.state];
      let dominion = false;
      if (!province.burg) {
        dominion = P(0.2);
        if (province.formName === "Colony") dominion = P(0.95);
        else if (province.formName === "Island") dominion = P(0.6);
        else if (province.formName === "Islands") dominion = P(0.5);
        else if (province.formName === "Territory") dominion = P(0.4);
        else if (province.formName === "Land") dominion = P(0.3);
      }

      const nameByBurg = province.burg && province.name.slice(0, 3) === (parent.name ?? "").slice(0, 3);
      const kinship = dominion ? 0 : nameByBurg ? 0.8 : 0.4;
      const culture = pack.cells.culture[province.center];
      const port = province.burg ? pack.burgs[province.burg].port : undefined;
      const type = Burgs.getType(province.center, port);
      province.coa = this.keepPlacement(province.coa, this.generate(parent.coa, kinship, Number(dominion), type));
      province.coa.shield = this.getShield(culture, province.state);
    });
  }

  /** Set the emblem of a state, province or burg, keyed like "state:3": a heraldic emblem in the generator's vocabulary, or { icon } for a picture. Its size and position stay */
  set(key: string, coa: Emblem): void {
    const entity = this.owner(key);
    if (typeof coa !== "object" || coa === null || Array.isArray(coa)) throw new Error("The emblem must be an object");
    if ("icon" in coa) {
      if (!Icons.kind(coa.icon)) throw new Error(`Icon ${coa.icon} does not exist`);
    } else this.requireHeraldic(coa);
    const { size, x, y } = entity.coa ?? {};
    entity.coa = { ...structuredClone(coa), size, x, y };
  }

  /** Draw a new emblem for a state, province or burg, akin to its overlord's; its shield, size and position stay */
  regenerateOne(key: string): void {
    const entity = this.owner(key);
    const [type] = key.split(":");
    const { cells, states, provinces } = pack;
    let parent: { coa?: Emblem; culture?: number } | undefined;
    if (type === "province") parent = states[entity.state ?? 0];
    else if (type === "burg") {
      const province = cells.province[entity.cell ?? 0];
      parent = province ? provinces[province] : states[entity.state ?? 0];
    }
    const shield = entity.coa?.shield || this.getShield(entity.culture || parent?.culture || 0, entity.state);
    const { size, x, y } = entity.coa ?? {};
    entity.coa = { ...this.generate(parent?.coa ?? null, 0.3, 0.1, undefined), shield, size, x, y };
  }

  /** Place an emblem on the map: x and y in map units, size from 0 to 5. null returns a value to automatic */
  place(key: string, x: number | null, y: number | null, size: number | null): void {
    const entity = this.owner(key);
    if (!entity.coa) throw new Error(`${key} has no emblem`);
    const { width, height } = options.map.graph;
    const check = (value: number | null, max: number, label: string) => {
      if (value !== null && (typeof value !== "number" || !(value >= 0 && value <= max)))
        throw new Error(`The ${label} must be a number from 0 to ${max}, or null`);
    };
    check(x, width, "x");
    check(y, height, "y");
    check(size, 5, "size");
    for (const [field, value] of [
      ["x", x],
      ["y", y],
      ["size", size]
    ] as const) {
      if (value === null) delete entity.coa[field];
      else entity.coa[field] = Math.round(value * 100) / 100;
    }
  }

  private owner(key: string): { coa?: Emblem; state?: number; cell?: number; culture?: number } {
    const [type, id] = typeof key === "string" ? key.split(":") : [];
    const list = { state: pack.states, province: pack.provinces, burg: pack.burgs }[type as "state"] as
      | { i: number; removed?: boolean }[]
      | undefined;
    const entity = list?.[Number(id)];
    if (!list || !entity?.i || entity.removed || entity.i !== Number(id))
      throw new Error(`${key} is not a state, province or burg with an emblem; use keys like "state:3"`);
    return entity as { coa?: Emblem };
  }

  private isTincture(value: unknown): boolean {
    const plain = (name: string) => name in tinctures.metals || name in tinctures.colours || name in tinctures.stains;
    if (typeof value !== "string") return false;
    if (plain(value)) return true;
    const [pattern, first, second] = value.split("-");
    if (!first || !second || !plain(first) || !plain(second)) return false;
    return pattern in tinctures.patterns || (pattern.startsWith("semy_of_") && !!this.chargeArt(pattern.slice(8)));
  }

  private requireHeraldic(coa: HeraldicEmblem): void {
    const fail = (what: string) => {
      throw new Error(`The emblem's ${what} is not one the generator knows`);
    };
    const line = (name: unknown) => name === undefined || (typeof name === "string" && name in lineWeights);
    const shapes = Object.keys(shields.types).flatMap(type => Object.keys(shields[type]));
    if (!this.isTincture(coa.t1)) fail("field tincture t1");
    if (coa.shield !== undefined && !shapes.includes(coa.shield)) fail("shield");
    const { division } = coa;
    if (
      division &&
      (!(division.division in divisions.variants) || !this.isTincture(division.t) || !line(division.line))
    )
      fail("division");
    for (const item of coa.ordinaries ?? [])
      if (
        !(item.ordinary in ordinaries.lined || item.ordinary in ordinaries.straight) ||
        !this.isTincture(item.t) ||
        !line(item.line)
      )
        fail(`ordinary ${item.ordinary}`);
    for (const item of coa.charges ?? [])
      if (!this.chargeArt(item.charge) || !this.isTincture(item.t) || typeof item.p !== "string")
        fail(`charge ${item.charge}`);
  }

  getShield(culture: number, state?: number, emblemShape = this.emblemShape): string {
    if (!DIVERSIFORM_SHAPES.includes(emblemShape)) return emblemShape;

    if (emblemShape === "state" && state && pack.states[state].coa) return pack.states[state].coa!.shield!;
    if (pack.cultures[culture].shield) return pack.cultures[culture].shield!;
    ERROR && console.error("Shield shape is not defined on culture level", pack.cultures[culture]);
    return "heater";
  }

  toString(emblem: Emblem): string {
    return JSON.stringify(emblem).replaceAll("#", "%23");
  }

  copy(emblem: Emblem): Emblem {
    return JSON.parse(JSON.stringify(emblem));
  }

  get shields() {
    return shields;
  }
}

export const Emblems = new EmblemsGenerator();
window.Emblems = Emblems;
