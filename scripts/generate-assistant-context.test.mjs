import assert from "node:assert/strict";
import { statSync } from "node:fs";
import { test } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const target = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "src/services/assistant/provider/context.generated.ts"
);

test("importing the module does not rewrite the generated context", async () => {
  const before = statSync(target).mtimeMs;
  await import("./generate-assistant-context.mjs");
  assert.equal(statSync(target).mtimeMs, before);
});

test("extractStatement does not swallow the rest of the file after an arrow-typed declaration", async () => {
  const { extractStatement } = await import("./generate-assistant-context.mjs");
  const src = "type Handler = (x: number) => string;\nexport const OTHER = 1;\n";
  assert.equal(extractStatement(src, 0), "type Handler = (x: number) => string;");
});
