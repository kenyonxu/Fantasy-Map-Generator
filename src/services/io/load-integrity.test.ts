// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

// load.ts drags in most of the app graph; stub the modules that touch the DOM at import time
vi.mock("@/components/options/tabs/layers-tab", async () => {
  const { LAYER_TOGGLES } = await vi.importActual<typeof import("@/data/layer-labels")>("@/data/layer-labels");
  return { LAYER_PRESETS: {}, LAYER_TOGGLES, getLayerByShortcut: () => undefined };
});
vi.mock("@/components/layers-presets", () => ({
  applyLayersPreset: vi.fn(),
  applyURLLayers: vi.fn(),
  applyPreset: vi.fn(),
  savePreset: vi.fn()
}));
vi.mock("@/services/fonts", () => ({
  declareFont: vi.fn(),
  loadFontsAsDataURI: vi.fn(),
  getUsedFonts: vi.fn(),
  addGoogleFont: vi.fn(),
  addLocalFont: vi.fn(),
  addWebFont: vi.fn()
}));
vi.mock("@/components/options/tabs/options-tab", () => ({
  syncOptionInputs: vi.fn(),
  changeCellsDensity: vi.fn(),
  cellsDensityColor: vi.fn(),
  restoreUi: vi.fn()
}));
vi.mock("@/components/options/io-panes", () => ({
  pickMapFile: vi.fn(),
  loadURL: vi.fn(),
  openExportToPngTiles: vi.fn(),
  showExportPane: vi.fn(),
  showLoadPane: vi.fn(),
  showSavePane: vi.fn()
}));

describe("load integrity: invalid culture repair", () => {
  beforeEach(() => {
    globalThis.window = globalThis.window || ({} as any);
  });

  it("clears culture (not province) on cells with an invalid culture", async () => {
    (globalThis as any).pack = {
      cultures: [
        { i: 0, name: "Wildlands" },
        { i: 1, name: "Gone", removed: true }
      ],
      cells: {
        i: [0, 1, 2],
        culture: [0, 1, 0], // cell 1 references removed culture 1
        province: [5, 7, 9]
      }
    };

    const { Load } = await import("./load");
    Load.repairInvalidCultures((globalThis as any).pack);

    expect((globalThis as any).pack.cells.culture).toEqual([0, 0, 0]); // invalid culture cleared
    expect((globalThis as any).pack.cells.province).toEqual([5, 7, 9]); // province untouched
  });
});
