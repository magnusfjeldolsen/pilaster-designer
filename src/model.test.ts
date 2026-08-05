import { describe, it, expect } from "vitest";
import { compute, DEFAULTS } from "./calc";
import { buildModel, pilasterOffsetX } from "./model";

const bbox = (els: ReturnType<typeof buildModel>, id: string) => {
  const e = els.find((x) => x.id === id)!;
  if (e.geom.kind !== "box") throw new Error(`${id} er ikke en kasse`);
  const [sx] = e.geom.size, [cx] = e.geom.center;
  return { lo: cx - sx / 2, hi: cx + sx / 2, c: cx };
};

describe("buildModel()", () => {
  it("gir forventet antall elementer (uten nokk)", () => {
    const els = buildModel(DEFAULTS, compute(DEFAULTS));
    // footing+wall+pilaster(3) + baseplate+stubbe(2) + 4 stag + 4 plate + 8 oppstikk + 5 boyler = 26
    expect(els.length).toBe(26);
    expect(els.filter((e) => e.ifcClass === "IfcReinforcingBar").length).toBe(13);
    expect(els.filter((e) => e.ifcClass === "IfcMechanicalFastener").length).toBe(4);
    expect(els.filter((e) => e.ifcClass === "IfcPlate").length).toBe(5); // bunnplate + 4 ankerplater
  });
  it("skjaernokk legger til ett element", () => {
    const els = buildModel({ ...DEFAULTS, use_lug: true }, compute({ ...DEFAULTS, use_lug: true }));
    expect(els.some((e) => e.material === "lug")).toBe(true);
    expect(els.length).toBe(27);
  });
  it("mutter gir fastener i stedet for plate paa endeforankring", () => {
    const els = buildModel({ ...DEFAULTS, anchor: "mutter" }, compute({ ...DEFAULTS, anchor: "mutter" }));
    // bunnplate (1) er eneste plate; 4 muttere er fasteners sammen med 4 stag = 8
    expect(els.filter((e) => e.ifcClass === "IfcPlate").length).toBe(1);
    expect(els.filter((e) => e.ifcClass === "IfcMechanicalFastener").length).toBe(8);
  });
  it("pilasteren er ENSIDIG: en flate flukter med ringmuren, resten stikker ut", () => {
    const els = buildModel(DEFAULTS, compute(DEFAULTS));
    const pil = bbox(els, "pilaster"), wall = bbox(els, "ringwall");
    expect(wall.c).toBe(0);                              // ringmuren definerer origo
    expect(pil.lo).toBeCloseTo(wall.lo, 6);              // bakre flate flukter
    expect(pil.c).toBeCloseTo((DEFAULTS.h - DEFAULTS.t_wall) / 2, 6);
    expect(pil.hi - wall.hi).toBeCloseTo(DEFAULTS.h - DEFAULTS.t_wall, 6); // utstikk
  });

  it("sentrisk plassering gir null eksentrisitet", () => {
    const v = { ...DEFAULTS, pil_pos: "sentrisk" as const };
    const pil = bbox(buildModel(v, compute(v)), "pilaster");
    expect(pilasterOffsetX(v)).toBe(0);
    expect(pil.c).toBe(0);
  });

  it("hele pilasterlokket foelger forskyvningen (stag, oppstikk, boyler, plate)", () => {
    const els = buildModel(DEFAULTS, compute(DEFAULTS));
    const x0 = pilasterOffsetX(DEFAULTS);
    expect(x0).toBeGreaterThan(0);
    // bunnplaten er sentrert i pilasteren, ikke i ringmuren
    expect(bbox(els, "baseplate").c).toBeCloseTo(x0, 6);
    // stag: boltmonsteret er symmetrisk om x0
    const rodX = els.filter((e) => e.id.startsWith("rod"))
      .map((e) => (e.geom.kind === "sweep" ? e.geom.path[0][0] : NaN));
    expect(rodX.reduce((a, b) => a + b, 0) / rodX.length).toBeCloseTo(x0, 6);
    // armering ligger innenfor pilasterens tverrsnitt
    const pil = bbox(els, "pilaster");
    for (const e of els.filter((x) => x.material.startsWith("rebar")))
      if (e.geom.kind === "sweep")
        for (const [x] of e.geom.path) {
          expect(x).toBeGreaterThan(pil.lo);
          expect(x).toBeLessThan(pil.hi);
        }
  });

  it("salen dekker bade ringmur og utstikkende pilaster", () => {
    const els = buildModel(DEFAULTS, compute(DEFAULTS));
    const foot = bbox(els, "footing"), pil = bbox(els, "pilaster"), wall = bbox(els, "ringwall");
    expect(foot.lo).toBeLessThan(Math.min(pil.lo, wall.lo));
    expect(foot.hi).toBeGreaterThan(Math.max(pil.hi, wall.hi));
  });

  it("boyle-directrix er AAPEN (krok-glipe) -> swept-disk bygger i alle kjerner", () => {
    const els = buildModel(DEFAULTS, compute(DEFAULTS));
    const st = els.find((e) => e.material === "rebar-stirrup")!;
    expect(st.geom.kind).toBe("sweep");
    if (st.geom.kind === "sweep") {
      const p = st.geom.path;
      const first = p[0], last = p[p.length - 1];
      const same = first[0] === last[0] && first[1] === last[1] && first[2] === last[2];
      expect(same).toBe(false); // start != slutt (aapen boyle)
    }
  });
});
