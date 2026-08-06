import { describe, it, expect } from "vitest";
import { compute, coverFromExposure, DEFAULTS, type Inputs } from "./calc";
import {
  INPUT_GROUPS, LEVERS, SYM, FML, REF, buildReport, checkRows, failingLevers, reportStatus,
} from "./report";
import { drawPlan, drawSection, MECHS } from "./sketch";
import { DEFAULT_PROFILE, PROFILES, PROFILE_NAMES, profileGeom } from "./profiles";

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

  const row = (v: Inputs, sym: string) => {
    const r = buildReport(v, compute(v)).flatMap((g) => g.rows)
      .find((x) => x.kind === "calc" && x.sym === sym);
    return r && r.kind === "calc" ? r.res : "";
  };

  it("e_p settes fritt og utstikket foelger e_p, b og t_wall", () => {
    expect(row(DEFAULTS, "e_p")).toBe("75 mm");
    expect(row(DEFAULTS, "utstikk")).toBe("150 mm");             // 75 + 200 - 125
    expect(row({ ...DEFAULTS, e_p: 0 }, "utstikk")).toBe("75 mm");
    // pilasteren kan ligge helt innenfor murlivet -> negativt utstikk
    expect(row({ ...DEFAULTS, e_p: 0, b: 200, t_wall: 400 }, "utstikk")).toBe("-100 mm");
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

  it("planen maaler e_p fra murens senterlinje, og 'sentrisk' ved e_p=0", () => {
    expect(drawPlan(DEFAULTS, R, "shear")).toContain("e_p = 75");
    const c = { ...DEFAULTS, e_p: 0 };
    expect(drawPlan(c, compute(c), "shear")).toContain("sentrisk");
  });

  it("utstikket i planen foelger e_p, b og t_wall", () => {
    const w = { ...DEFAULTS, b: 550, e_p: 100 };
    expect(drawPlan(w, compute(w), "shear")).toContain("utstikk 250 mm");
    const inside = { ...DEFAULTS, e_p: 0, b: 200, t_wall: 400 };
    expect(drawPlan(inside, compute(inside), "shear")).toContain("ingen utstikk");
  });

  it("planen merker V som parallell med ringmuren", () => {
    expect(drawPlan(DEFAULTS, R, "shear")).toContain("∥ ringmur");
  });
});

describe("plantegningens skala", () => {
  // e_p flytter pilasteren, den endrer ikke stoerrelsen paa den
  const widthOf = (svg: string) => {
    const m = svg.match(/<rect x="([\d.]+)" y="[\d.]+" width="([\d.]+)"/g) || [];
    // andre rect er pilasteren (foerste er ringmuren)
    const r = m[1].match(/width="([\d.]+)"/)!;
    return parseFloat(r[1]);
  };
  it("pilasteren tegnes like stor uansett e_p", () => {
    const w = [0, 75, 300, 600].map((e_p) => {
      const v = { ...DEFAULTS, e_p };
      return widthOf(drawPlan(v, compute(v), "shear"));
    });
    for (const x of w) expect(x).toBeCloseTo(w[0], 6);
  });
  it("tegneflaten vokser i stedet, slik at eksentrisiteten faar plass", () => {
    const vb = (e_p: number) => {
      const v = { ...DEFAULTS, e_p };
      return +drawPlan(v, compute(v), "shear").match(/viewBox="0 0 \d+ (\d+)"/)![1];
    };
    expect(vb(600)).toBeGreaterThan(vb(0));
  });
});

describe("hjelpetekster og hint", () => {
  it("alle LEVERS-noekler finnes som en faktisk kontroll", () => {
    const R = compute(DEFAULTS);
    // samle kontrollnavn over flere konfigurasjoner slik at betingede kontroller er med
    const names = new Set<string>();
    for (const v of [DEFAULTS, { ...DEFAULTS, use_lug: true }, { ...DEFAULTS, anchor: "ingen" as const }])
      for (const g of buildReport(v, compute(v)))
        for (const r of g.rows) if (r.kind === "check") names.add(r.id);
    const orphan = Object.keys(LEVERS).filter((k) => !names.has(k));
    expect(orphan, "LEVERS peker paa kontroller som ikke finnes").toEqual([]);
    void R;
  });

  it("alle levers peker paa felt som finnes i panelet", () => {
    const known = new Set(INPUT_GROUPS.flatMap((g) => g.items).map((m) => m.k));
    for (const [check, levers] of Object.entries(LEVERS))
      for (const lv of levers)
        expect(known.has(lv.k), `${check} -> ${String(lv.k)}`).toBe(true);
  });

  it("failingLevers gir hint kun for kontroller som ryker", () => {
    const ok = { ...DEFAULTS, h_ef: 1400, s_b: 60, phi_b: 16, b: 600, h: 600 };
    expect(compute(ok).allOk).toBe(true);
    expect(failingLevers(buildReport(ok, compute(ok))).size).toBe(0);
    // default har for liten innstoping -> h_ef skal foreslaas okt
    const bad = failingLevers(buildReport(DEFAULTS, compute(DEFAULTS)));
    expect(bad.get("h_ef")).toBe("opp");
  });

  it("hvert inputfelt har en forklaring til «?»-boksen", () => {
    for (const m of INPUT_GROUPS.flatMap((g) => g.items)) {
      expect(m.cmt.length, `cmt for ${String(m.k)}`).toBeGreaterThan(5);
      if (m.ref !== undefined) expect(m.ref.length).toBeGreaterThan(2);
    }
  });
});

describe("overdekning fra eksponeringsklasse (EC2 §4.4.1)", () => {
  it("XD1/XS1, C35, 50 aar -> S4, c_min,dur 35, c_nom 45", () => {
    const c = coverFromExposure("XD1/XS1", 35, 50, 12, 10);
    expect(c.strClass).toBe(4);
    expect(c.cMinDur).toBe(35);
    expect(c.cNom).toBe(45);
  });
  it("100 aars brukstid hever konstruksjonsklassen med 2", () => {
    expect(coverFromExposure("XC4", 25, 100, 12, 10).strClass).toBe(6);
  });
  it("hoyere fasthetsklasse gir én klasse reduksjon", () => {
    expect(coverFromExposure("XC4", 30, 50, 12, 10).strClass).toBe(4);
    expect(coverFromExposure("XC4", 40, 50, 12, 10).strClass).toBe(3);
  });
  it("XC1 gir mye tynnere overdekning enn XS3", () => {
    expect(coverFromExposure("XC1", 35, 50, 12, 10).cNom)
      .toBeLessThan(coverFromExposure("XD3/XS3", 35, 50, 12, 10).cNom);
  });
});

describe("kontroller kan settes til side av prosjekterende", () => {
  const groups = buildReport(DEFAULTS, compute(DEFAULTS));

  it("hver kontroll har en stabil id og de er unike", () => {
    const ids = checkRows(groups).map((r) => r.id);
    expect(ids.length).toBeGreaterThan(5);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9_]+$/);
  });

  it("kontroller med utnyttelsesgrad rapporterer u", () => {
    const withU = checkRows(groups).filter((r) => typeof r.u === "number");
    expect(withU.length).toBeGreaterThan(5);
    const emb = checkRows(groups).find((r) => r.id === "emb")!;
    expect(emb.u).toBeCloseTo(compute(DEFAULTS).u_emb, 9);
    // u > 1 skal alltid bety at kontrollen ryker
    for (const r of withU) if (r.u! > 1.0001) expect(r.ok).toBe(false);
  });

  it("status uten ignorering er lik calc sin allOk", () => {
    const st = reportStatus(groups, new Set());
    expect(st.okStrict).toBe(compute(DEFAULTS).allOk);
    expect(st.ok).toBe(st.okStrict);
  });

  it("ignorering fjerner kontrollen fra samlet status", () => {
    const before = reportStatus(groups, new Set());
    expect(before.ok).toBe(false);
    const st = reportStatus(groups, new Set(before.failing));
    expect(st.ok).toBe(true);
    expect(st.okStrict).toBe(false);            // strengt sett gaar det fortsatt ikke opp
    expect(st.ignoredFailing.sort()).toEqual([...before.failing].sort());
  });

  it("ignorerte kontroller gir ikke lenger hint paa inndata", () => {
    const all = new Set(checkRows(groups).map((r) => r.id));
    expect(failingLevers(groups).size).toBeGreaterThan(0);
    expect(failingLevers(groups, all).size).toBe(0);
  });

  it("ukjente id-er i ignoreringslista paavirker ingenting", () => {
    const st = reportStatus(groups, new Set(["finnes_ikke"]));
    expect(st.ignored).toEqual([]);
    expect(st.ok).toBe(reportStatus(groups, new Set()).ok);
  });
});

describe("staalprofil paa bunnplata (kun visualisering)", () => {
  it("katalogen dekker HEA, SHS, RHS og CHS", () => {
    const fams = new Set(PROFILE_NAMES.map((n) => PROFILES[n].fam));
    expect([...fams].sort()).toEqual(["CHS", "HEA", "RHS", "SHS"]);
    expect(PROFILE_NAMES.length).toBeGreaterThan(70);
    expect(PROFILES[DEFAULT_PROFILE]).toBeTruthy();
  });

  it("HEA gir en I-kontur, ikke en kasse", () => {
    const g = profileGeom("HEA 200", 0, 0, 0, 0, 400);
    expect(g.kind).toBe("prism");
    if (g.kind === "prism") {
      expect(g.profile.length).toBe(12);
      const xs = g.profile.map((p) => p[0]), ys = g.profile.map((p) => p[1]);
      expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(200, 6);  // b
      expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(190, 6);  // h
      // livet er smalere enn flensene -> ekte I
      expect(xs.some((x) => Math.abs(x) < 10)).toBe(true);
    }
  });

  it("rotasjon 90° bytter om profilets akser", () => {
    const ext = (g: ReturnType<typeof profileGeom>) => {
      if (g.kind !== "prism") throw new Error("forventet prisme");
      const xs = g.profile.map((p) => p[0]), ys = g.profile.map((p) => p[1]);
      return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
    };
    const [x0, y0] = ext(profileGeom("HEA 300", 0, 0, 0, 0, 400));
    const [x9, y9] = ext(profileGeom("HEA 300", 90, 0, 0, 0, 400));
    expect(x9).toBeCloseTo(y0, 6);
    expect(y9).toBeCloseTo(x0, 6);
  });

  it("RHS snus ogsaa, mens SHS er symmetrisk", () => {
    const box = (n: string, r: number) => {
      const g = profileGeom(n, r, 0, 0, 0, 400);
      if (g.kind !== "box") throw new Error("forventet kasse");
      return [g.size[0], g.size[1]];
    };
    expect(box("RHS 200x100", 0)).toEqual([100, 200]);
    expect(box("RHS 200x100", 90)).toEqual([200, 100]);
    expect(box("SHS 150x150", 0)).toEqual(box("SHS 150x150", 90));
  });

  it("CHS blir en sylinder med riktig radius", () => {
    const g = profileGeom("CHS 219.1", 0, 0, 0, 25, 425);
    expect(g.kind).toBe("sweep");
    if (g.kind === "sweep") {
      expect(g.radius).toBeCloseTo(219.1 / 2, 6);
      expect(g.path[0][2]).toBe(25);
      expect(g.path[1][2]).toBe(425);
    }
  });

  it("ukjent profilnavn faller tilbake paa default i stedet for aa kaste", () => {
    expect(() => profileGeom("finnes ikke", 0, 0, 0, 0, 400)).not.toThrow();
  });

  it("profilet paavirker ikke beregningen", () => {
    const a = compute({ ...DEFAULTS, profile: "HEA 1000" });
    const b = compute({ ...DEFAULTS, profile: "CHS 21.3", profile_rot: 90 });
    expect(a.N_re).toBeCloseTo(b.N_re, 9);
    expect(a.allOk).toBe(b.allOk);
  });
});
