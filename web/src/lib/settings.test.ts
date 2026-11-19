import { describe, expect, it } from "vitest";
import { LOGO_SIZE, brandStyle, logoHeight, readableOn } from "./settings";

describe("readableOn", () => {
  it("puts dark text on light colors and light text on dark ones", () => {
    expect(readableOn("#FFFFFF")).toBe("#16191F");
    expect(readableOn("#F5D547")).toBe("#16191F");
    expect(readableOn("#5902A1")).toBe("#FFFFFF");
    expect(readableOn("#000000")).toBe("#FFFFFF");
  });
});

describe("brandStyle", () => {
  it("changes nothing without brand settings", () => {
    expect(brandStyle({})).toEqual({});
  });
  it("leaves buttons on the brand color unless a button color is set", () => {
    const style = brandStyle({ brand: { color: "#2563EB" } });
    expect(style["--color-accent"]).toBe("#2563EB");
    expect(style["--rk-btn"]).toBeUndefined();
  });
  it("sets the button color with readable text", () => {
    expect(brandStyle({ brand: { color: "#2563EB", button: "#F5D547" } })).toMatchObject({ "--rk-btn": "#F5D547", "--rk-on-btn": "#16191F", "--color-accent": "#2563EB" });
  });
  it("lets the text color be forced, with or without a button color", () => {
    expect(brandStyle({ brand: { button: "#F5D547", buttonText: "light" } })["--rk-on-btn"]).toBe("#FFFFFF");
    expect(brandStyle({ brand: { color: "#B8962E", buttonText: "dark" } })["--rk-on-btn"]).toBe("#16191F");
  });
  it("ignores values that are not colors", () => {
    expect(brandStyle({ brand: { button: "red; background:url(x)" } })).toEqual({});
  });
});

describe("logoHeight", () => {
  it("uses the default until a size is chosen", () => {
    expect(logoHeight({})).toBe(LOGO_SIZE.default);
    expect(logoHeight({ brand: { logo: "/uploads/a.png" } })).toBe(LOGO_SIZE.default);
  });
  it("keeps the chosen size within limits", () => {
    expect(logoHeight({ brand: { logoSize: 64 } })).toBe(64);
    expect(logoHeight({ brand: { logoSize: 9999 } })).toBe(LOGO_SIZE.max);
    expect(logoHeight({ brand: { logoSize: 1 } })).toBe(LOGO_SIZE.min);
    expect(logoHeight({ brand: { logoSize: "big" as unknown as number } })).toBe(LOGO_SIZE.default);
  });
});
