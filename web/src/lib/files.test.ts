import { describe, expect, it } from "vitest";
import { baseName, canView, extension, fileGroup, sizeLabel, uploadProblem } from "./files";

const EXT = ["pdf", "md", "docx"];

describe("project files", () => {
  it("reads extensions whatever the case", () => {
    expect(extension("Plan.PDF")).toBe("pdf");
    expect(extension("no-extension")).toBe("");
    expect(baseName("Research plan v2.docx")).toBe("Research plan v2");
  });
  it("groups and decides what opens in the browser", () => {
    expect(fileGroup("a.docx")).toBe("word");
    expect(fileGroup("a.csv")).toBe("sheet");
    expect(canView("a.pdf")).toBe(true);
    expect(canView("a.docx")).toBe(false);
  });
  it("labels sizes", () => {
    expect(sizeLabel(900)).toBe("900 B");
    expect(sizeLabel(2048)).toBe("2 KB");
    expect(sizeLabel(5 * 1024 * 1024)).toBe("5.0 MB");
  });
  it("catches files that cannot be uploaded", () => {
    expect(uploadProblem({ name: "a.pdf", size: 10 }, EXT, 25)).toBeNull();
    expect(uploadProblem({ name: "a.exe", size: 10 }, EXT, 25)).toBe("type");
    expect(uploadProblem({ name: "a.pdf", size: 0 }, EXT, 25)).toBe("empty");
    expect(uploadProblem({ name: "a.pdf", size: 26 * 1024 * 1024 }, EXT, 25)).toBe("size");
  });
});
