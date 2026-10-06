import { test } from "node:test";
import assert from "node:assert/strict";
import { extractStatement } from "./generate-assistant-context.mjs";

test("extractStatement does not swallow the rest of the file after an arrow-typed declaration", () => {
  const src = "type Handler = (x: number) => string;\nexport const OTHER = 1;\n";
  const out = extractStatement(src, 0);
  assert.equal(out, "type Handler = (x: number) => string;");
});
