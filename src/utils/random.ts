import Alea from "alea";
import { randomNormal } from "d3";
import { minmax, rn } from "./numberUtils";

export interface RandomKit {
  next(): number;
  rand(min?: number, max?: number): number;
  P(probability: number): boolean;
  Pint(float: number): number;
  ra<T>(array: ArrayLike<T>): T;
  rw(object: Record<string, number>): string;
  gauss(expected?: number, deviation?: number, min?: number, max?: number, round?: number): number;
  biased(min: number, max: number, ex: number): number;
}

export function makeRandom(seed: string | number): RandomKit {
  if (!seed && seed !== 0) throw new Error("makeRandom requires a non-empty seed");
  const next = Alea(seed);
  const rand = (min?: number, max?: number): number => {
    if (min === undefined && max === undefined) return next();
    if (max === undefined) {
      max = min;
      min = 0;
    }
    return Math.floor(next() * (max! - min! + 1)) + min!;
  };
  const P = (probability: number): boolean => {
    if (probability >= 1) return true;
    if (probability <= 0) return false;
    return next() < probability;
  };
  const Pint = (float: number): number => {
    return ~~float + +P(float % 1);
  };
  const ra = <T>(array: ArrayLike<T>): T => {
    return array[Math.floor(next() * array.length)];
  };
  const rw = (object: Record<string, number>): string => {
    const array = [];
    for (const key in object) {
      for (let i = 0; i < object[key]; i++) {
        array.push(key);
      }
    }
    return array[Math.floor(next() * array.length)];
  };
  const gauss = (expected = 100, deviation = 30, min = 0, max = 300, round = 0): number => {
    return rn(minmax(randomNormal.source(() => next())(expected, deviation)(), min, max), round);
  };
  const biased = (min: number, max: number, ex: number): number => {
    return Math.round(min + (max - min) * next() ** ex);
  };
  return { next, rand, P, Pint, ra, rw, gauss, biased };
}
