import { max, mean } from "d3";
import { requireColor } from "@/utils/colorUtils";
import { makeRandom, type RandomKit } from "@/utils/random";
import { requireName } from "@/utils/validationUtils";
import { gauss, generateSeed, getAdjective, P, ra, rand, rw } from "../utils";
import { Population } from "./population-generator";

declare global {
  var Zones: ZonesModule;
}

// without a kit, editor callers draw the ambient global stream
const roll = (R: RandomKit | undefined, probability: number): boolean => (R ? R.P(probability) : P(probability));
const pick = <T>(R: RandomKit | undefined, array: ArrayLike<T>): T => (R ? R.ra(array) : ra(array));
const pickWeighted = (R: RandomKit | undefined, object: Record<string, number>): string =>
  R ? R.rw(object) : rw(object);
const rollInt = (R: RandomKit | undefined, min?: number, max?: number): number =>
  R ? R.rand(min, max) : rand(min, max);
const rollGauss = (R: RandomKit | undefined, expected: number, deviation: number, min: number, max: number): number =>
  R ? R.gauss(expected, deviation, min, max) : gauss(expected, deviation, min, max);
const adjective = (R: RandomKit | undefined, noun: string): string => getAdjective(noun, R ? R.next : Math.random);

export interface Zone {
  i: number;
  name: string;
  type: string;
  cells: number[];
  color: string;
  hidden?: boolean;
  note?: string;
}

type ZoneGenerator = (usedCells: Uint8Array, R?: RandomKit) => void;

interface ZoneConfig {
  quantity: number;
  generate: ZoneGenerator;
}

class ZonesModule {
  private config: Record<string, ZoneConfig>;

  constructor() {
    this.config = {
      invasion: { quantity: 2, generate: (u, R) => this.addInvasion(u, R) },
      rebels: { quantity: 1.5, generate: (u, R) => this.addRebels(u, R) },
      proselytism: { quantity: 1.6, generate: (u, R) => this.addProselytism(u, R) },
      crusade: { quantity: 1.6, generate: (u, R) => this.addCrusade(u, R) },
      disease: { quantity: 1.4, generate: (u, R) => this.addDisease(u, R) },
      disaster: { quantity: 1, generate: (u, R) => this.addDisaster(u, R) },
      eruption: { quantity: 1, generate: (u, R) => this.addEruption(u, R) },
      avalanche: { quantity: 0.8, generate: (u, R) => this.addAvalanche(u, R) },
      fault: { quantity: 1, generate: (u, R) => this.addFault(u, R) },
      flood: { quantity: 1, generate: (u, R) => this.addFlood(u, R) },
      tsunami: { quantity: 1, generate: (u, R) => this.addTsunami(u, R) }
    };
  }

  /** Rename a zone; its name is its description */
  rename(zoneId: number, name: string): void {
    this.living(zoneId).name = requireName(name);
  }

  /** Set a zone's color */
  recolor(zoneId: number, color: string): void {
    this.living(zoneId).color = requireColor(color);
  }

  /** Set a zone's type, a free label such as Invasion or Disease */
  setType(zoneId: number, type: string): void {
    this.living(zoneId).type = requireName(type);
  }

  /** Hide or show a zone */
  setHidden(zoneId: number, hidden: boolean): void {
    const zone = this.living(zoneId);
    if (hidden) zone.hidden = true;
    else delete zone.hidden;
  }

  /** Add a zone over a list of cell ids; returns its id */
  add(name: string, type: string, cells: number[]): number {
    const i = pack.zones.length ? Math.max(...pack.zones.map(zone => zone.i)) + 1 : 0;
    const zone = { i, name: requireName(name), type: requireName(type), color: `url(#hatch${i % 42})`, cells: [] };
    pack.zones.push(zone);
    this.setCells(i, cells);
    return i;
  }

  /** Set the cells a zone covers, as a list of cell ids */
  setCells(zoneId: number, cells: number[]): void {
    const count = pack.cells.i.length;
    if (
      !Array.isArray(cells) ||
      !cells.length ||
      cells.some(cell => !Number.isInteger(cell) || cell < 0 || cell >= count)
    )
      throw new Error(`The cells must be a non-empty list of cell ids from 0 to ${count - 1}`);
    this.living(zoneId).cells = [...new Set(cells)];
  }

  /** Set the rural and urban population of a zone's land, in people: its cells and burgs scale to the totals */
  setPopulation(zoneId: number, rural: number, urban: number): void {
    const cells = new Set(this.living(zoneId).cells);
    Population.setArea(
      Population.landCells(cell => cells.has(cell)),
      Population.burgIds(burg => cells.has(burg.cell)),
      rural,
      urban
    );
  }

  /** Remove a zone */
  remove(zoneId: number): void {
    this.living(zoneId);
    pack.zones = pack.zones.filter(zone => zone.i !== zoneId);
  }

  private living(zoneId: number): Zone {
    const zone = pack.zones.find(({ i }) => i === zoneId);
    if (!zone) throw new Error(`Zone ${zoneId} does not exist`);
    return zone;
  }

  // a fresh seed per click, so the regenerate button rerolls (Routes.regenerate precedent); the pipeline uses generate()
  regenerate(globalModifier = 1): void {
    this.generate(globalModifier, makeRandom(generateSeed()));
  }

  generate(globalModifier = 1, R: RandomKit = makeRandom(options.map.seed)) {
    const usedCells = new Uint8Array(pack.cells.i.length);
    pack.zones = [];

    Object.values(this.config).forEach(type => {
      const expectedNumber = type.quantity * globalModifier;
      let number = rollGauss(R, expectedNumber, expectedNumber / 2, 0, 100);
      while (number--) type.generate(usedCells, R);
    });
  }

  private addInvasion(usedCells: Uint8Array, R?: RandomKit) {
    const { cells, states } = pack;

    const ongoingConflicts = states
      .filter(s => s.i && !s.removed && s.campaigns)
      .flatMap(s => s.campaigns!)
      .filter(c => !c.end);
    if (!ongoingConflicts.length) return;
    const { defender, attacker } = pick(R, ongoingConflicts);

    const borderCells = cells.i.filter(cellId => {
      if (usedCells[cellId]) return false;
      if (cells.state[cellId] !== defender) return false;
      return cells.c[cellId].some(c => cells.state[c] === attacker);
    });

    const startCell = pick(R, borderCells);
    if (startCell === undefined) return;

    const invasionCells: number[] = [];
    const queue = [startCell];
    const maxCells = rollInt(R, 5, 30);

    while (queue.length) {
      const cellId = roll(R, 0.4) ? queue.shift()! : queue.pop()!;
      invasionCells.push(cellId);
      if (invasionCells.length >= maxCells) break;

      cells.c[cellId].forEach(neibCellId => {
        if (usedCells[neibCellId]) return;
        if (cells.state[neibCellId] !== defender) return;
        usedCells[neibCellId] = 1;
        queue.push(neibCellId);
      });
    }

    const subtype = pickWeighted(R, {
      Invasion: 5,
      Occupation: 4,
      Conquest: 3,
      Incursion: 2,
      Intervention: 2,
      Assault: 1,
      Foray: 1,
      Intrusion: 1,
      Irruption: 1,
      Offensive: 1,
      Pillaging: 1,
      Plunder: 1,
      Raid: 1,
      Skirmishes: 1
    });
    const name = `${adjective(R, states[attacker].name)} ${subtype}`;

    pack.zones.push({
      i: pack.zones.length,
      name,
      type: "Invasion",
      cells: invasionCells,
      color: "url(#hatch1)"
    });
  }

  private addRebels(usedCells: Uint8Array, R?: RandomKit) {
    const { cells, states } = pack;

    const state = pick(
      R,
      states.filter(s => s.i && !s.removed && s.neighbors?.some(Boolean))
    );
    if (!state) return;

    const neibStateId = pick(
      R,
      state.neighbors!.filter((n: number) => n && !states[n].removed)
    );
    if (!neibStateId) return;

    const cellsArray: number[] = [];
    const queue: number[] = [];
    const borderCellId = cells.i.find(
      i => cells.state[i] === state.i && cells.c[i].some(c => cells.state[c] === neibStateId)
    );
    if (borderCellId) queue.push(borderCellId);
    const maxCells = rollInt(R, 10, 30);

    while (queue.length) {
      const cellId = queue.shift()!;
      cellsArray.push(cellId);
      if (cellsArray.length >= maxCells) break;

      cells.c[cellId].forEach(neibCellId => {
        if (usedCells[neibCellId]) return;
        if (cells.state[neibCellId] !== state.i) return;
        usedCells[neibCellId] = 1;
        if (neibCellId % 4 !== 0 && !cells.c[neibCellId].some(c => cells.state[c] === neibStateId)) return;
        queue.push(neibCellId);
      });
    }

    const rebels = pickWeighted(R, {
      Rebels: 5,
      Insurrection: 2,
      Mutineers: 1,
      Insurgents: 1,
      Rebellion: 1,
      Renegades: 1,
      Revolters: 1,
      Revolutionaries: 1,
      Rioters: 1,
      Separatists: 1,
      Secessionists: 1,
      Conspiracy: 1
    });

    const name = `${adjective(R, states[neibStateId].name)} ${rebels}`;
    pack.zones.push({
      i: pack.zones.length,
      name,
      type: "Rebels",
      cells: cellsArray,
      color: "url(#hatch3)"
    });
  }

  private addProselytism(usedCells: Uint8Array, R?: RandomKit) {
    const { cells, religions } = pack;

    const organizedReligions = religions.filter(r => r.i && !r.removed && r.type === "Organized");
    const religion = pick(R, organizedReligions);
    if (!religion) return;

    const targetBorderCells = cells.i.filter(
      i =>
        cells.h[i] >= 20 &&
        cells.pop[i] &&
        cells.religion[i] !== religion.i &&
        cells.c[i].some(c => cells.religion[c] === religion.i)
    );
    const startCell = pick(R, targetBorderCells);
    if (!startCell) return;

    const targetReligionId = cells.religion[startCell];
    const proselytismCells: number[] = [];
    const queue = [startCell];
    const maxCells = rollInt(R, 10, 30);

    while (queue.length) {
      const cellId = queue.shift()!;
      proselytismCells.push(cellId);
      if (proselytismCells.length >= maxCells) break;

      cells.c[cellId].forEach(neibCellId => {
        if (usedCells[neibCellId]) return;
        if (cells.religion[neibCellId] !== targetReligionId) return;
        if (cells.h[neibCellId] < 20 || !cells.pop[neibCellId]) return;
        usedCells[neibCellId] = 1;
        queue.push(neibCellId);
      });
    }

    const name = `${adjective(R, religion.name.split(" ")[0])} Proselytism`;
    pack.zones.push({
      i: pack.zones.length,
      name,
      type: "Proselytism",
      cells: proselytismCells,
      color: "url(#hatch6)"
    });
  }

  private addCrusade(usedCells: Uint8Array, R?: RandomKit) {
    const { cells, religions } = pack;

    const heresies = religions.filter(r => !r.removed && r.type === "Heresy");
    if (!heresies.length) return;

    const heresy = pick(R, heresies);
    const crusadeCells = cells.i.filter(i => !usedCells[i] && cells.religion[i] === heresy.i);
    if (!crusadeCells.length) return;
    for (const i of crusadeCells) {
      usedCells[i] = 1;
    }

    const name = `${adjective(R, heresy.name.split(" ")[0])} Crusade`;
    pack.zones.push({
      i: pack.zones.length,
      name,
      type: "Crusade",
      cells: Array.from(crusadeCells),
      color: "url(#hatch6)"
    });
  }

  private addDisease(usedCells: Uint8Array, R?: RandomKit) {
    const { cells, burgs } = pack;

    const burg = pick(
      R,
      burgs.filter(b => !usedCells[b.cell] && b.i && !b.removed)
    );
    if (!burg) return;

    const cellsArray: number[] = [];
    const cost: number[] = [];
    const maxCells = rollInt(R, 20, 40);

    const queue = new FlatQueue();
    queue.push({ e: burg.cell, p: 0 }, 0);

    while (queue.length) {
      const next = queue.pop();
      if (cells.burg[next.e] || cells.pop[next.e]) cellsArray.push(next.e);
      usedCells[next.e] = 1;

      cells.c[next.e].forEach(nextCellId => {
        const c = Routes.getRoute(next.e, nextCellId) ? 5 : 100;
        const p = next.p + c;
        if (p > maxCells) return;

        if (!cost[nextCellId] || p < cost[nextCellId]) {
          cost[nextCellId] = p;
          queue.push({ e: nextCellId, p }, p);
        }
      });
    }

    const colorName = this.getDiseaseName(R, "color");
    const animalName = this.getDiseaseName(R, "animal");
    const adjectiveName = this.getDiseaseName(R, "adjective");

    const model = pickWeighted(R, { color: 2, animal: 1, adjective: 1 });
    const prefix = model === "color" ? colorName : model === "animal" ? animalName : adjectiveName;

    const disease = pickWeighted(R, {
      Fever: 5,
      Plague: 3,
      Cough: 3,
      Flu: 2,
      Pox: 2,
      Cholera: 2,
      Typhoid: 2,
      Leprosy: 1,
      Smallpox: 1,
      Pestilence: 1,
      Consumption: 1,
      Malaria: 1,
      Dropsy: 1
    });
    const name = `${prefix} ${disease}`;

    pack.zones.push({
      i: pack.zones.length,
      name,
      type: "Disease",
      cells: cellsArray,
      color: "url(#hatch12)"
    });
  }

  private getDiseaseName(R: RandomKit | undefined, model: "color" | "animal" | "adjective"): string {
    if (model === "color")
      return pick(R, [
        "Amber",
        "Azure",
        "Black",
        "Blue",
        "Brown",
        "Crimson",
        "Emerald",
        "Golden",
        "Green",
        "Grey",
        "Orange",
        "Pink",
        "Purple",
        "Red",
        "Ruby",
        "Scarlet",
        "Silver",
        "Violet",
        "White",
        "Yellow"
      ]);
    if (model === "animal")
      return pick(R, [
        "Ape",
        "Bear",
        "Bird",
        "Boar",
        "Cat",
        "Cow",
        "Deer",
        "Dog",
        "Fox",
        "Goat",
        "Horse",
        "Lion",
        "Pig",
        "Rat",
        "Raven",
        "Sheep",
        "Spider",
        "Tiger",
        "Viper",
        "Wolf",
        "Worm",
        "Wyrm"
      ]);
    return pick(R, [
      "Blind",
      "Bloody",
      "Brutal",
      "Burning",
      "Deadly",
      "Fatal",
      "Furious",
      "Great",
      "Grim",
      "Horrible",
      "Invisible",
      "Lethal",
      "Loud",
      "Mortal",
      "Savage",
      "Severe",
      "Silent",
      "Unknown",
      "Venomous",
      "Vicious"
    ]);
  }

  private addDisaster(usedCells: Uint8Array, R?: RandomKit) {
    const { cells, burgs } = pack;

    const burg = pick(
      R,
      burgs.filter(b => !usedCells[b.cell] && b.i && !b.removed)
    );
    if (!burg) return;
    usedCells[burg.cell] = 1;

    const cellsArray: number[] = [];
    const cost: number[] = [];
    const maxCells = rollInt(R, 5, 25);

    const queue = new FlatQueue();
    queue.push({ e: burg.cell, p: 0 }, 0);

    while (queue.length) {
      const next = queue.pop();
      if (cells.burg[next.e] || cells.pop[next.e]) cellsArray.push(next.e);
      usedCells[next.e] = 1;

      cells.c[next.e].forEach(e => {
        const c = rollInt(R, 1, 10);
        const p = next.p + c;
        if (p > maxCells) return;

        if (!cost[e] || p < cost[e]) {
          cost[e] = p;
          queue.push({ e, p }, p);
        }
      });
    }

    const type = pickWeighted(R, {
      Famine: 5,
      Drought: 3,
      Earthquake: 3,
      Dearth: 1,
      Tornadoes: 1,
      Wildfires: 1,
      Storms: 1,
      Blight: 1
    });
    const name = `${adjective(R, burg.name!)} ${type}`;
    pack.zones.push({
      i: pack.zones.length,
      name,
      type: "Disaster",
      cells: cellsArray,
      color: "url(#hatch5)"
    });
  }

  private addEruption(usedCells: Uint8Array, R?: RandomKit) {
    const { cells, markers } = pack;

    const volcanoe = markers.find(m => m.type === "volcanoes" && !usedCells[m.cell]);
    if (!volcanoe) return;
    usedCells[volcanoe.cell] = 1;

    if (volcanoe.note) volcanoe.note = volcanoe.note.replace("Active volcano", "Erupting volcano");
    const name = volcanoe.name ? `${volcanoe.name.replace(" Volcano", "")} Eruption` : "Volcano Eruption";

    const cellsArray: number[] = [];
    const queue = [volcanoe.cell];
    const maxCells = rollInt(R, 10, 30);

    while (queue.length) {
      const cellId = roll(R, 0.5) ? queue.shift()! : queue.pop()!;
      cellsArray.push(cellId);
      if (cellsArray.length >= maxCells) break;

      cells.c[cellId].forEach(neibCellId => {
        if (usedCells[neibCellId] || cells.h[neibCellId] < 20) return;
        usedCells[neibCellId] = 1;
        queue.push(neibCellId);
      });
    }

    pack.zones.push({
      i: pack.zones.length,
      name,
      type: "Eruption",
      cells: cellsArray,
      color: "url(#hatch7)"
    });
  }

  private addAvalanche(usedCells: Uint8Array, R?: RandomKit) {
    const { cells } = pack;

    const routeCells = cells.i.filter(i => !usedCells[i] && Routes.isConnected(i) && cells.h[i] >= 70);
    if (!routeCells.length) return;

    const startCell = pick(R, routeCells);
    usedCells[startCell] = 1;

    const cellsArray: number[] = [];
    const queue = [startCell];
    const maxCells = rollInt(R, 3, 15);

    while (queue.length) {
      const cellId = roll(R, 0.3) ? queue.shift()! : queue.pop()!;
      cellsArray.push(cellId);
      if (cellsArray.length >= maxCells) break;

      cells.c[cellId].forEach(neibCellId => {
        if (usedCells[neibCellId] || cells.h[neibCellId] < 65) return;
        usedCells[neibCellId] = 1;
        queue.push(neibCellId);
      });
    }

    const name = `${adjective(R, Names.getCultureShort(cells.culture[startCell], R))} Avalanche`;
    pack.zones.push({
      i: pack.zones.length,
      name,
      type: "Avalanche",
      cells: cellsArray,
      color: "url(#hatch5)"
    });
  }

  private addFault(usedCells: Uint8Array, R?: RandomKit) {
    const cells = pack.cells;

    const elevatedCells = cells.i.filter(i => !usedCells[i] && cells.h[i] > 50 && cells.h[i] < 70);
    if (!elevatedCells.length) return;

    const startCell = pick(R, elevatedCells);
    usedCells[startCell] = 1;

    const cellsArray: number[] = [];
    const queue = [startCell];
    const maxCells = rollInt(R, 3, 15);

    while (queue.length) {
      const cellId = queue.pop()!;
      if (cells.h[cellId] >= 20) cellsArray.push(cellId);
      if (cellsArray.length >= maxCells) break;

      cells.c[cellId].forEach(neibCellId => {
        if (usedCells[neibCellId] || cells.r[neibCellId]) return;
        usedCells[neibCellId] = 1;
        queue.push(neibCellId);
      });
    }

    const name = `${adjective(R, Names.getCultureShort(cells.culture[startCell], R))} Fault`;
    pack.zones.push({
      i: pack.zones.length,
      name,
      type: "Fault",
      cells: cellsArray,
      color: "url(#hatch2)"
    });
  }

  private addFlood(usedCells: Uint8Array, R?: RandomKit) {
    const cells = pack.cells;

    const fl = cells.fl.filter(Boolean);
    const meanFlux = mean(fl) ?? 0;
    const maxFlux = max(fl) ?? 0;
    const fluxThreshold = (maxFlux - meanFlux) / 2 + meanFlux;

    const bigRiverCells = cells.i.filter(
      i => !usedCells[i] && cells.h[i] < 50 && cells.r[i] && cells.fl[i] > fluxThreshold && cells.burg[i]
    );
    if (!bigRiverCells.length) return;

    const startCell = pick(R, bigRiverCells);
    usedCells[startCell] = 1;

    const riverId = cells.r[startCell];
    const cellsArray: number[] = [];
    const queue = [startCell];
    const maxCells = rollInt(R, 5, 30);

    while (queue.length) {
      const cellId = queue.pop()!;
      cellsArray.push(cellId);
      if (cellsArray.length >= maxCells) break;

      cells.c[cellId].forEach(neibCellId => {
        if (
          usedCells[neibCellId] ||
          cells.h[neibCellId] < 20 ||
          cells.r[neibCellId] !== riverId ||
          cells.h[neibCellId] > 50 ||
          cells.fl[neibCellId] < meanFlux
        )
          return;
        usedCells[neibCellId] = 1;
        queue.push(neibCellId);
      });
    }

    const name = `${adjective(R, pack.burgs[cells.burg[startCell]].name!)} Flood`;
    pack.zones.push({
      i: pack.zones.length,
      name,
      type: "Flood",
      cells: cellsArray,
      color: "url(#hatch13)"
    });
  }

  private addTsunami(usedCells: Uint8Array, R?: RandomKit) {
    const { cells, features } = pack;

    const coastalCells = cells.i.filter(
      i => !usedCells[i] && cells.t[i] === -1 && features[cells.f[i]].type !== "lake"
    );
    if (!coastalCells.length) return;

    const startCell = pick(R, coastalCells);
    usedCells[startCell] = 1;

    const cellsArray: number[] = [];
    const queue = [startCell];
    const maxCells = rollInt(R, 10, 30);

    while (queue.length) {
      const cellId = queue.shift()!;
      if (cells.t[cellId] === 1) cellsArray.push(cellId);
      if (cellsArray.length >= maxCells) break;

      cells.c[cellId].forEach(neibCellId => {
        if (usedCells[neibCellId]) return;
        if (cells.t[neibCellId] > 2) return;
        if (pack.features[cells.f[neibCellId]].type === "lake") return;
        usedCells[neibCellId] = 1;
        queue.push(neibCellId);
      });
    }

    const name = `${adjective(R, Names.getCultureShort(cells.culture[startCell], R))} Tsunami`;
    pack.zones.push({
      i: pack.zones.length,
      name,
      type: "Tsunami",
      cells: cellsArray,
      color: "url(#hatch13)"
    });
  }
}

// biome-ignore lint/suspicious/noRedeclare: legacy seam
export const Zones = new ZonesModule();
window.Zones = Zones;
