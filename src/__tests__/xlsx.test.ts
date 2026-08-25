import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { createXlsx } from "@/lib/xlsx";

describe("createXlsx", () => {
  it("creates a real OpenXML archive and keeps formulas as text", () => {
    const workbook = createXlsx(["SKU", "Title", "Price"], [["=CMD()", "A&B <Poster>", 249]]);
    const files = unzipSync(workbook);
    const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);

    expect(files["[Content_Types].xml"]).toBeDefined();
    expect(files["xl/workbook.xml"]).toBeDefined();
    expect(sheet).toContain('t="inlineStr"><is><t>=CMD()</t>');
    expect(sheet).not.toContain("<f>");
    expect(sheet).toContain("A&amp;B &lt;Poster&gt;");
    expect(sheet).toContain("<v>249</v>");
  });
});
