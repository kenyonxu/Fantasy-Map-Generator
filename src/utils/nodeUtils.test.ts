// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { ensureEl, findEl } from "./nodeUtils";

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("ensureEl", () => {
  it("returns the element when present", () => {
    const div = document.createElement("div");
    div.id = "foo";
    document.body.append(div);
    expect(ensureEl("foo")).toBe(div);
  });

  it("throws when absent", () => {
    expect(() => ensureEl("missing")).toThrow('Element with id "missing" not found');
  });
});

describe("findEl", () => {
  it("returns the element when present and null when absent", () => {
    const div = document.createElement("div");
    div.id = "foo";
    document.body.append(div);
    expect(findEl("foo")).toBe(div);
    expect(findEl("missing")).toBeNull();
  });
});
