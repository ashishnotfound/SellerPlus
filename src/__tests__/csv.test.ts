import { describe, expect, it } from "vitest";
import { createCsv, escapeCsvCell } from "@/lib/csv";

describe("CSV export safety", () => {
  it.each(["=1+1", "+cmd", "-2+3", "@SUM(A1:A2)", "\tformula", "\rformula"])(
    "neutralizes spreadsheet formula input %s",
    (input) => expect(escapeCsvCell(input)).toBe(`"'${input}"`),
  );

  it("quotes delimiters, quotes, and line breaks", () => {
    expect(createCsv(["Name", "Note"], [["Poster, pack", 'A "premium"\nset']]))
      .toBe('"Name","Note"\r\n"Poster, pack","A ""premium""\nset"');
  });
});
