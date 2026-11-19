import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EN } from "./en";
import { HOME_TITLE, isSharedLink, namedTitle, pageTitle, TITLE_KEYS } from "./pageTitle";

describe("pageTitle", () => {
  it("names each page in the interface language", () => {
    expect(pageTitle("/login", "es")).toBe("Iniciar sesión · redekorate");
    expect(pageTitle("/login", "en")).toBe("Sign in · redekorate");
    expect(pageTitle("/register", "es")).toBe("Crear cuenta · redekorate");
    expect(pageTitle("/register", "en")).toBe("Create account · redekorate");
    expect(pageTitle("/projects/abc/new", "en")).toBe("New study · redekorate");
    expect(pageTitle("/projects/abc", "en")).toBe("Project · redekorate");
    expect(pageTitle("/studies/42/results", "es")).toBe("Resultados · redekorate");
    expect(pageTitle("/projects/abc/tickets/7", "en")).toBe("Ticket · redekorate");
    expect(pageTitle("/orgs/3/roadmap", "es")).toBe("Hoja de ruta · redekorate");
  });

  it("names a document or diagram tab after the item, not the route", () => {
    expect(namedTitle("  Site map ")).toBe("Site map · redekorate");
    expect(namedTitle("   ")).toBeNull();
  });

  it("falls back to the home title for / and unknown paths", () => {
    expect(pageTitle("/", "en")).toBe(HOME_TITLE);
    expect(pageTitle("/nope/deeper", "es")).toBe(HOME_TITLE);
  });

  it("leaves shared links to the server-rendered title", () => {
    for (const p of ["/s/abc", "/r/tok", "/pr/tok", "/d/tok"]) expect(isSharedLink(p)).toBe(true);
    for (const p of ["/", "/studies/1/results", "/docs/9", "/s"]) expect(isSharedLink(p)).toBe(false);
  });

  it("has an English translation for every title", () => {
    expect(TITLE_KEYS.filter((k) => !(k in EN))).toEqual([]);
  });

  it("matches the <title> in index.html", () => {
    const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
    expect(html).toContain(`<title>${HOME_TITLE}</title>`);
  });
});
