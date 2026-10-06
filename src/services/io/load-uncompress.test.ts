// @vitest-environment jsdom
import { Blob as NodeBlob } from "node:buffer";
import { describe, expect, it, vi } from "vitest";

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

// jsdom's Blob has no .stream(); Node's Blob does, and load.ts resolves Blob at call time
(globalThis as any).Blob = NodeBlob;

async function gzip(data: Uint8Array): Promise<ArrayBuffer> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream("gzip"));
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  const out = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out.buffer;
}

describe("load uncompress: gzip decompression", () => {
  it("decompresses valid gzip input back to the original bytes", async () => {
    const { Load } = await import("./load");
    const original = new TextEncoder().encode("FMG|test payload\r\n".repeat(1000));
    const compressed = await gzip(original);

    const result = await Load.uncompress(compressed);

    expect(result).toBeInstanceOf(Uint8Array);
    expect(result!.length).toBe(original.length);
    expect(Array.from(result!)).toEqual(Array.from(original));
  });

  it("returns null for non-gzip garbage input", async () => {
    const { Load } = await import("./load");
    const garbage = new TextEncoder().encode("definitely not a gzip stream").buffer;

    const result = await Load.uncompress(garbage);

    expect(result).toBeNull();
  });
});
