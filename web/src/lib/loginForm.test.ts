import { describe, expect, it } from "vitest";
import { authFormError, fallingLayout, LANES } from "./loginForm";

describe("sign-in checks", () => {
  it("answers in the app language instead of the browser's bubbles", () => {
    expect(authFormError("login", { name: "", email: "", password: "x" })).toBe("Enter your email.");
    expect(authFormError("login", { name: "", email: "ana@", password: "x" })).toMatch(/valid email/);
    expect(authFormError("login", { name: "", email: "ana@x.io", password: "" })).toBe("Enter your password.");
    expect(authFormError("register", { name: " ", email: "ana@x.io", password: "longenough1" })).toBe("Enter your name.");
    expect(authFormError("login", { name: "", email: "ana@x.io", password: "x" })).toBeNull();
  });
});

describe("falling cards", () => {
  it("never puts two cards of one lane closer than a third of a cycle", () => {
    const cards = fallingLayout();
    for (let lane = 0; lane < LANES.length; lane++) {
      const mine = cards.filter((c) => c.lane === lane);
      expect(new Set(mine.map((c) => c.duration)).size).toBe(1);   // same speed: nobody overtakes
      const phases = mine.map((c) => ((-c.delay / c.duration) % 1 + 1) % 1).sort();
      for (let i = 1; i < phases.length; i++) expect(phases[i] - phases[i - 1]).toBeCloseTo(1 / mine.length, 5);
    }
  });
  it("keeps lanes apart", () => {
    for (let i = 1; i < LANES.length; i++) expect(LANES[i] - LANES[i - 1]).toBeGreaterThanOrEqual(30);
  });
});
