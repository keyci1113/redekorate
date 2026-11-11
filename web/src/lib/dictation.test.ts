import { describe, expect, it } from "vitest";
import { dictationProblem, joinDictation, recognizerCtor, sessionTranscript, speechLocale, type SpeechResultList } from "./dictation";

const results = (...parts: [string, boolean][]): SpeechResultList => {
  const list: Record<number, { isFinal: boolean; 0: { transcript: string } }> = {};
  parts.forEach(([transcript, isFinal], i) => { list[i] = { isFinal, 0: { transcript } }; });
  return Object.assign(list, { length: parts.length }) as SpeechResultList;
};

describe("recognizerCtor", () => {
  it("finds the standard or the webkit constructor", () => {
    class A {} class B {}
    expect(recognizerCtor({ SpeechRecognition: A, webkitSpeechRecognition: B })).toBe(A);
    expect(recognizerCtor({ webkitSpeechRecognition: B })).toBe(B);
  });
  it("is null where the browser has no speech recognition", () => {
    expect(recognizerCtor({})).toBeNull();
    expect(recognizerCtor(undefined)).toBeNull();
  });
});

describe("speechLocale", () => {
  it("keeps the browser's regional variant when it is the study language", () => {
    expect(speechLocale("es", "es-CO")).toBe("es-CO");
    expect(speechLocale("en", "en-GB")).toBe("en-GB");
  });
  it("falls back to a default variant when the browser is in another language or has no region", () => {
    expect(speechLocale("es", "en-US")).toBe("es-MX");
    expect(speechLocale("en", "es-MX")).toBe("en-US");
    expect(speechLocale("es", "es")).toBe("es-MX");
    expect(speechLocale("en", null)).toBe("en-US");
  });
});

describe("sessionTranscript", () => {
  it("joins final and interim pieces in order and collapses spaces", () => {
    expect(sessionTranscript(results(["no encontré ", true], [" el botón", false]))).toBe("no encontré el botón");
  });
  it("is empty for an empty session", () => {
    expect(sessionTranscript(results())).toBe("");
  });
});

describe("joinDictation", () => {
  it("capitalizes the first words of an empty answer", () => {
    expect(joinDictation("", "me costó encontrarlo", 100)).toBe("Me costó encontrarlo");
  });
  it("appends to typed text with one space and no capital mid-sentence", () => {
    expect(joinDictation("Me gustó  ", "porque es rápido", 100)).toBe("Me gustó porque es rápido");
  });
  it("capitalizes after the end of a sentence and after a line break", () => {
    expect(joinDictation("Fue fácil.", "pero lento", 100)).toBe("Fue fácil. Pero lento");
    expect(joinDictation("Uno\n", "dos", 100)).toBe("Uno\nDos");
  });
  it("leaves the text alone when nothing was said", () => {
    expect(joinDictation("Ya escrito", "   ", 100)).toBe("Ya escrito");
  });
  it("never exceeds the field limit", () => {
    expect(joinDictation("abc", "defgh", 6)).toBe("abc de");
    expect(joinDictation("abcdefgh", "", 4)).toBe("abcd");
  });
});

describe("dictationProblem", () => {
  it("maps the errors a participant can act on", () => {
    expect(dictationProblem("not-allowed")).toBe("denied");
    expect(dictationProblem("service-not-allowed")).toBe("denied");
    expect(dictationProblem("audio-capture")).toBe("no-mic");
    expect(dictationProblem("network")).toBe("network");
  });
  it("ignores silence and manual stops", () => {
    expect(dictationProblem("no-speech")).toBeNull();
    expect(dictationProblem("aborted")).toBeNull();
  });
});
