import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// regression lock for the overview XSS wave: entity names must reach HTML through
// escapeHtml and CSV text fields through toCsvField
const read = (file: string) => readFileSync(new URL(`./${file}`, import.meta.url), "utf8");

describe("overview escaping", () => {
  it("escapes names in rivers overview rows and quotes CSV text fields", () => {
    const src = read("rivers-overview.ts");
    expect(src).toContain(`data-name="\${escapeHtml(r.name)}"`);
    expect(src).toContain(`data-type="\${escapeHtml(r.type)}"`);
    expect(src).toContain(`data-basin="\${escapeHtml(basin ?? "")}"`);
    expect(src).toContain(`data-col="name">\${escapeHtml(r.name)}</div>`);
    expect(src).toContain(`value="\${escapeHtml(basin ?? "")}"`);
    expect(src).toContain("toCsvField(r.name)");
  });

  it("escapes names in routes overview rows and quotes CSV text fields", () => {
    const src = read("routes-overview.ts");
    expect(src).toContain(`data-name="\${escapeHtml(route.name ?? "")}"`);
    expect(src).toContain(`data-group="\${escapeHtml(route.group)}"`);
    expect(src).toContain(`\${escapeHtml(route.name ?? "")}</div>`);
    expect(src).toContain("toCsvField(route.name");
  });

  it("escapes names in diplomacy overview rows and matrix, quotes CSV state fields", () => {
    const src = read("diplomacy-overview.ts");
    expect(src).toContain(`relations to \${escapeHtml(selectedName)}`);
    expect(src).toContain(`data-name="\${escapeHtml(name ?? "")}"`);
    expect(src).toContain(`<span>\${escapeHtml(name ?? "")}</span>`);
    expect(src).toContain("toCsvField(s.name)");
  });

  it("escapes names in regiments overview rows and quotes CSV text fields", () => {
    const src = read("regiments-overview.ts");
    expect(src).toContain(`data-tip="\${escapeHtml(state.fullName ?? "")}"`);
    expect(src).toContain(`value="\${escapeHtml(state.name)}"`);
    expect(src).toContain(`value="\${escapeHtml(regiment.name)}"`);
    expect(src).toContain("toCsvField(s.name)");
    expect(src).toContain("toCsvField(r.name)");
  });

  it("escapes names in military overview rows and unit editor, quotes CSV state fields", () => {
    const src = read("military-overview.ts");
    expect(src).toContain(`data-tip="\${escapeHtml(row.state.fullName ?? "")}"`);
    expect(src).toContain(`value="\${escapeHtml(row.state.name)}"`);
    expect(src).toContain(`value="\${escapeHtml(name)}"`);
    expect(src).toContain("toCsvField(row.state.name)");
  });
});
