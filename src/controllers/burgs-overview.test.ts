// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tip } from "@/components/tooltips";
import type { Burg } from "@/generators/burgs-generator";
import { escapeHtml, toCsvField } from "@/utils/stringUtils";
import { BurgsOverview } from "./burgs-overview";

vi.mock("@/controllers", () => ({ Controllers: {} }));
vi.mock("@/components/layers", () => ({ Layers: { show: vi.fn(), hide: vi.fn(), draw: vi.fn(), isOn: () => false } }));
vi.mock("@/components/tooltips", () => ({ tip: vi.fn(), clearMainTip: vi.fn() }));
vi.mock("@/components/dialog/highlighting", () => ({ applyLineHighlighting: vi.fn() }));
vi.mock("@/components/dialog/sorting", () => ({
  bindColumnSorting: vi.fn(),
  sortDataByColumns: (_id: string, rows: Burg[]) => rows
}));
vi.mock("@/components/dialog/dialog-helpers", () => ({
  closeDialogs: vi.fn(),
  confirmationDialog: vi.fn(),
  destroyDialog: vi.fn(),
  updateDialog: vi.fn()
}));
vi.mock("@/components/dialog/table", () => ({
  initColumnVisibility: vi.fn(),
  renderEditorHeader: () => "",
  renderEditorPagination: vi.fn(),
  initEditorTable: () => ({ reset: vi.fn(), refresh: vi.fn(), goto: vi.fn() })
}));
vi.mock("@/renderers/draw-emblems", () => ({ removeEmblem: vi.fn() }));

// regression lock: entity names and uploads must be escaped before entering HTML,
// CSV text fields must be quoted per RFC 4180
describe("burgs overview escaping", () => {
  it("escapes entity names for HTML contexts", () => {
    const malicious = `"><img src=x onerror=alert(1)>`;
    expect(escapeHtml(malicious)).toBe("&quot;&gt;&lt;img src=x onerror=alert(1)&gt;");
  });

  it("wraps CSV fields containing commas or quotes", () => {
    expect(toCsvField('Riverton, the "Free"')).toBe('"Riverton, the ""Free"""');
  });
});

function burgFixture(i: number, state: number, population: number, x: number, y: number, cell: number): Burg {
  return { i, cell, state, culture: 1, name: `Burg ${i}`, population, x, y } as Burg;
}

describe("burgs bubble chart", () => {
  beforeEach(() => {
    document.body.innerHTML = `<div id="alert"><div id="alertMessage"></div></div><input id="uiSize" value="1" />`;
    vi.stubGlobal("alertMessage", document.getElementById("alertMessage"));
    vi.stubGlobal("zoomTo", vi.fn());
    vi.stubGlobal("$", (target: string | HTMLElement) => {
      const el = typeof target === "string" ? document.querySelector<HTMLElement>(target) : target;
      return { dialog: () => void el };
    });
    vi.stubGlobal("pack", {
      states: [
        { i: 0, name: "Neutrals" },
        { i: 1, name: "One", fullName: "State One", color: "#f00" },
        { i: 2, name: "Two", fullName: "State Two", color: "#0f0" }
      ],
      cultures: [
        { i: 0, name: "Neutral", color: "#ccc" },
        { i: 1, name: "Culture One", color: "#00f" }
      ],
      provinces: [{ i: 0, name: "Neutrals", fullName: "The Neutral Lands" }],
      burgs: [
        { i: 0, x: 0, y: 0, cell: 0 },
        burgFixture(1, 1, 1000, 100, 100, 1),
        burgFixture(2, 1, 2000, 200, 150, 2),
        burgFixture(3, 2, 500, 300, 200, 3)
      ],
      cells: { province: Uint16Array.from([0, 0, 0, 0]) }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders one circle per burg, colored by its state", () => {
    BurgsOverview.showChart();

    const circles = [...document.querySelectorAll<SVGCircleElement>("#burgsTree circle")];
    expect(circles).toHaveLength(3);
    const fillsByBurgId = new Map(circles.map(c => [c.getAttribute("data-id"), c.getAttribute("fill")]));
    expect(fillsByBurgId).toEqual(
      new Map([
        ["1", "#f00"],
        ["2", "#f00"],
        ["3", "#0f0"]
      ])
    );
  });

  it("zooms into the burg behind a clicked circle", () => {
    BurgsOverview.showChart();

    document
      .querySelector<SVGCircleElement>('#burgsTree circle[data-id="3"]')!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(zoomTo).toHaveBeenCalledWith(300, 200, 8, 2000);
  });

  it("refuses to draw a chart without burgs", () => {
    vi.stubGlobal("pack", { ...pack, states: [{ i: 0, name: "Neutrals" }], burgs: [{ i: 0, x: 0, y: 0, cell: 0 }] });

    BurgsOverview.showChart();

    expect(tip).toHaveBeenCalledWith("No burgs to show", false, "error");
    expect(document.getElementById("burgsTree")).toBeNull();
  });
});
