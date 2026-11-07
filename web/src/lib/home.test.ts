import { describe, expect, it } from "vitest";
import {
  COMPLETION_THRESHOLD, DEFAULT_VIEW, aggregateCompletion, completion, groupActivity, isLowCompletion,
  loadView, peakDay, saveView, sortInsights, sortLive, splitWeeks,
} from "./home";

describe("completado y umbral", () => {
  it("divide terminados entre iniciados", () => {
    expect(completion(87, 100)).toBe(0.87);
    expect(completion(0, 10)).toBe(0);
  });
  it("sin iniciados no hay completado", () => {
    expect(completion(0, 0)).toBeNull();
  });
  it("nunca pasa de 0–1", () => {
    expect(completion(12, 10)).toBe(1);
  });
  it("el umbral es 88% y es estricto", () => {
    expect(COMPLETION_THRESHOLD).toBe(0.88);
    expect(isLowCompletion(0.87)).toBe(true);
    expect(isLowCompletion(0.88)).toBe(false);
    expect(isLowCompletion(0.95)).toBe(false);
    expect(isLowCompletion(null)).toBe(false);
  });
  it("el promedio es suma de terminados entre suma de iniciados (no promedio de tasas)", () => {
    const r = aggregateCompletion([{ responses: 1, started: 1 }, { responses: 50, started: 100 }]);
    expect(r).toEqual({ done: 51, started: 101, rate: 51 / 101 });
  });
  it("ordena por menor completado y deja al final los que no tienen datos", () => {
    const list = [
      { id: "a", responses: 9, started: 10, last_response_at: "2026-11-01T00:00:00Z" },
      { id: "b", responses: 0, started: 0, last_response_at: null },
      { id: "c", responses: 5, started: 10, last_response_at: "2026-11-02T00:00:00Z" },
    ];
    expect(sortLive(list, "lowest").map((s) => s.id)).toEqual(["c", "a", "b"]);
    expect(sortLive([list[1], list[0], list[2]], "recent").map((s) => s.id)).toEqual(["c", "a", "b"]);
  });
});

describe("orden de insights", () => {
  const mk = (id: string, severity: "critical" | "high" | "medium" | "low", created_at: string) => ({ id, severity, created_at });
  it("Crítico > Alto > Medio > Bajo y, dentro de cada uno, el más reciente primero", () => {
    const sorted = sortInsights([
      mk("bajo", "low", "2026-11-07T00:00:00Z"),
      mk("alto-viejo", "high", "2026-10-01T00:00:00Z"),
      mk("critico", "critical", "2026-09-01T00:00:00Z"),
      mk("alto-nuevo", "high", "2026-11-01T00:00:00Z"),
      mk("medio", "medium", "2026-11-06T00:00:00Z"),
    ]);
    expect(sorted.map((i) => i.id)).toEqual(["critico", "alto-nuevo", "alto-viejo", "medio", "bajo"]);
  });
  it("no muta la lista original", () => {
    const list = [mk("b", "low", "2026-01-01T00:00:00Z"), mk("a", "critical", "2026-01-01T00:00:00Z")];
    sortInsights(list);
    expect(list[0].id).toBe("b");
  });
});

describe("agrupación de actividad", () => {
  const row = (study_id: string, at: string) => ({ study_id, at, study_title: `Estudio ${study_id}`, method: "survey" });
  it("cuenta respuestas por estudio y guarda la más reciente", () => {
    const g = groupActivity([
      row("s1", "2026-11-07T10:00:00Z"), row("s2", "2026-11-07T09:00:00Z"),
      row("s1", "2026-11-07T08:00:00Z"), row("s1", "2026-11-07T11:00:00Z"),
    ]);
    expect(g).toHaveLength(2);
    expect(g[0]).toMatchObject({ study_id: "s1", count: 3, latest: "2026-11-07T11:00:00Z" });
    expect(g[1]).toMatchObject({ study_id: "s2", count: 1 });
  });
  it("ordena los grupos por la respuesta más reciente y respeta el límite", () => {
    const rows = ["a", "b", "c", "d"].map((id, i) => row(id, `2026-11-0${i + 1}T00:00:00Z`));
    expect(groupActivity(rows, 2).map((g) => g.study_id)).toEqual(["d", "c"]);
  });
  it("sin respuestas no hay grupos", () => {
    expect(groupActivity([])).toEqual([]);
  });
});

describe("tendencia", () => {
  const days = Array.from({ length: 14 }, (_, i) => ({ day: `2026-11-${String(i + 1).padStart(2, "0")}`, n: i < 7 ? 1 : i === 10 ? 9 : 2 }));
  it("separa semana pasada y esta semana", () => {
    expect(splitWeeks(days)).toMatchObject({ lastWeek: 7, thisWeek: 9 + 2 * 6 });
  });
  it("encuentra el día pico", () => {
    expect(peakDay(days)).toEqual({ day: "2026-11-11", n: 9 });
    expect(peakDay(days.map((d) => ({ ...d, n: 0 })))).toBeNull();
  });
});

describe("persistencia de la vista", () => {
  const memory = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };
  it("por defecto es Snapshot", () => {
    expect(DEFAULT_VIEW).toBe("snapshot");
    expect(loadView("u1", memory())).toBe("snapshot");
  });
  it("guarda y lee por usuario", () => {
    const s = memory();
    saveView("u1", "funnel", s);
    saveView("u2", "inline", s);
    expect(loadView("u1", s)).toBe("funnel");
    expect(loadView("u2", s)).toBe("inline");
  });
  it("ignora valores inválidos", () => {
    const s = memory();
    s.setItem("rk_home_view:u1", "carrusel");
    expect(loadView("u1", s)).toBe("snapshot");
  });
  it("si el storage falla no rompe y vuelve a Snapshot", () => {
    const broken = { getItem: () => { throw new Error("bloqueado"); }, setItem: () => { throw new Error("bloqueado"); } };
    expect(saveView("u1", "inline", broken)).toBe(false);
    expect(loadView("u1", broken)).toBe("snapshot");
    expect(loadView("u1", null)).toBe("snapshot");
  });
});
