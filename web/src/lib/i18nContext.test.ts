import { describe, expect, it } from "vitest";
import { tr } from "./i18n";

describe("context keys", () => {
  it("a |context suffix never reaches the screen, in either language", () => {
    expect(tr("Etiquetas|ticket", "es")).toBe("Etiquetas");
    expect(tr("Etiquetas|ticket", "en")).not.toContain("|");
    expect(tr("Inicio|fecha", "es")).toBe("Inicio");
    expect(tr("A | B", "es")).toBe("A | B");
  });
});
