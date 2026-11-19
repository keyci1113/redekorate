import { describe, expect, it } from "vitest";
import { maskEmail, maskPhone, participantFields } from "./participantFields";

describe("participant fields", () => {
  it("masks email and phone", () => {
    expect(maskEmail("ana@example.com")).toBe("a•••@example.com");
    expect(maskPhone("+1 555 0100")).toBe("•••• 0100");
  });
  it("labels URL parameters and never shows a raw key=value string", () => {
    const f = participantFields({ pid: "P-7", name: "Ana", email: "ana@example.com", phone: "5550100", preview: "1" });
    expect(f.map((x) => x.label)).toEqual(["Participant ID", "Name", "Email", "Phone"]);
    expect(f.find((x) => x.key === "email")).toMatchObject({ sensitive: true, masked: "a•••@example.com", value: "ana@example.com" });
    expect(f.find((x) => x.key === "pid")).toMatchObject({ sensitive: false, masked: "P-7" });
    expect(f.some((x) => x.masked.includes("="))).toBe(false);
  });
  it("treats an email-looking value as sensitive whatever the key", () => {
    expect(participantFields({ contact: "bo@x.io" })[0]).toMatchObject({ sensitive: true, masked: "b•••@x.io" });
  });
});
