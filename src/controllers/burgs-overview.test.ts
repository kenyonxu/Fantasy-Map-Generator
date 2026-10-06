import { describe, expect, it } from "vitest";
import { escapeHtml, toCsvField } from "@/utils/stringUtils";

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
