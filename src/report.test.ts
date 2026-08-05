import { describe, it, expect } from "vitest";
import { compute, DEFAULTS, type Inputs } from "./calc";
import { INPUT_GROUPS, SYM, FML, REF, buildReport } from "./report";
import { drawPlan, drawSection, MECHS } from "./sketch";

const allMeta = INPUT_GROUPS.flatMap((g) => g.items);

describe("inputmetadata", () => {
  it("dekker HVERT felt i Inputs (ingen input kan falle ut av panelet)", () => {
    const covered = new Set(allMeta.map((m) => m.k));
    const missing = (Object.keys(DEFAULTS) as (keyof Inputs)[]).filter((k) => !covered.has(k));
    expect(missing).toEqual([]);
  });

  it("har ingen duplikater og ingen ukjente noekler", () => {
    const keys = allMeta.map((m) => m.k);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(DEFAULTS).toHaveProperty(k as string);
  });

  it("gir symbol og forklaring for alle felt", () => {
    for (const m of allMeta) {
      expect(SYM[m.k as string], `SYM mangler for ${String(m.k)}`).toBeTruthy();
      expect(m.cmt.length).toBeGreaterThan(3);
    }
  });

  it("valgfelt har alternativer som inkluderer default-verdien", () => {
    for (const m of allMeta.filter((x) => x.opts))
      expect(m.opts).toContain(String(DEFAULTS[m.k]));
  });
});

describe("buildReport()", () => {
  const R = compute(DEFAULTS);
  const groups = buildReport(DEFAULTS, R);
  const rows = groups.flatMap((g) => g.rows);

  it("bygger grupper med rader", () => {
    expect(groups.length).toBeGreaterThan(8);
    expect(rows.length).toBeGreaterThan(30);
  });

  it("hver beregningsrad har formel, innsatte verdier, resultat og referanse", () => {
    for (const r of rows) {
      if (r.kind !== "calc") continue;
      expect(FML[r.sym], `FML mangler for ${r.sym}`).toBeTruthy();
      expect(REF[r.sym], `REF mangler for ${r.sym}`).toBeTruthy();
      expect(r.sub.length).toBeGreaterThan(0);
      expect(r.res).toMatch(/\d/);
    }
  });

  it("innsatte verdier viser faktiske inndata, ikke symboler", () => {
    const fcd = rows.find((r) => r.kind === "calc" && r.sym === "f_cd");
    expect(fcd && fcd.kind === "calc" && fcd.sub).toBe("0.85·35/1.5");
    expect(fcd && fcd.kind === "calc" && fcd.res).toBe(`${R.fcd.toFixed(2)} MPa`);
  });

  it("kontrollradenes status foelger utnyttelsesgradene", () => {
    const checks = rows.filter((r) => r.kind === "check");
    expect(checks.length).toBeGreaterThan(5);
    expect(checks.every((c) => c.kind === "check" && c.ok) === R.allOk).toBe(true);
  });

  it("eksentrisiteten rapporteres for ensidig og sentrisk pilaster", () => {
    const ecc = (v: Inputs) => {
      const row = buildReport(v, compute(v)).flatMap((g) => g.rows)
        .find((r) => r.kind === "calc" && r.sym === "e_pil");
      return row && row.kind === "calc" ? row.res : "";
    };
    expect(ecc(DEFAULTS)).toBe("75 mm");                                   // (b 400-250)/2
    expect(ecc({ ...DEFAULTS, pil_pos: "sentrisk" })).toBe("0 mm");
    // eksentrisiteten foelger b (⊥V), ikke h (∥V)
    expect(ecc({ ...DEFAULTS, b: 500 })).toBe("125 mm");
    expect(ecc({ ...DEFAULTS, h: 900 })).toBe("75 mm");
  });

  it("skjaernokk-rader kommer kun naar nokken er aktiv", () => {
    const has = (v: Inputs) => buildReport(v, compute(v)).flatMap((g) => g.rows)
      .some((r) => r.kind === "calc" && r.sym === "V_Rd,lug");
    expect(has(DEFAULTS)).toBe(false);
    expect(has({ ...DEFAULTS, use_lug: true })).toBe(true);
  });
});

describe("2D-tegninger", () => {
  const R = compute(DEFAULTS);

  it("gir gyldig SVG for alle mekanismer", () => {
    for (const m of MECHS)
      for (const s of [drawPlan(DEFAULTS, R, m.id), drawSection(DEFAULTS, R, m.id)]) {
        expect(s.startsWith("<svg")).toBe(true);
        expect(s.trimEnd().endsWith("</svg>")).toBe(true);
        expect(s).not.toMatch(/NaN|Infinity|undefined/);
      }
  });

  it("planen viser utstikket for ensidig og 'sentrisk' ellers", () => {
    expect(drawPlan(DEFAULTS, R, "shear")).toContain("e_pil = 75 mm");
    const c = { ...DEFAULTS, pil_pos: "sentrisk" as const };
    expect(drawPlan(c, compute(c), "shear")).toContain("sentrisk");
  });

  it("utstikket i planen foelger b (⊥V)", () => {
    const w = { ...DEFAULTS, b: 550 };
    expect(drawPlan(w, compute(w), "shear")).toContain("utstikk 300 mm");
  });

  it("planen merker V som parallell med ringmuren", () => {
    expect(drawPlan(DEFAULTS, R, "shear")).toContain("∥ ringmur");
  });
});
