import { describe, it, expect } from "vitest";
import { boltPattern, cageInsets, compute, DEFAULTS } from "./calc";
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
  it("mutter tegnes som ekte sekskant med noekkelvidde 1,5*d - ikke som plate", () => {
    const v = { ...DEFAULTS, anchor: "mutter" as const };
    const R = compute(v);
    const els = buildModel(v, R);
    expect(els.filter((e) => e.ifcClass === "IfcPlate").length).toBe(1);   // kun bunnplaten
    expect(els.filter((e) => e.ifcClass === "IfcMechanicalFastener").length).toBe(8);
    const nut = els.find((e) => e.id === "nut0")!;
    expect(nut.geom.kind).toBe("prism");
    if (nut.geom.kind === "prism") {
      expect(nut.geom.profile.length).toBe(6);                             // sekskant
      const xs = nut.geom.profile.map((p) => p[0]), ys = nut.geom.profile.map((p) => p[1]);
      // profilen har hjoerner ved 30..330 grader: X-utstrekning = noekkelvidde
      // (avstand mellom motstaaende FLATER), Y-utstrekning = hjoerne til hjoerne
      const acrossFlats = Math.max(...xs) - Math.min(...xs);
      const acrossCorners = Math.max(...ys) - Math.min(...ys);
      expect(acrossFlats).toBeCloseTo(1.5 * R.d_bolt, 4);
      expect(acrossCorners).toBeCloseTo(1.5 * R.d_bolt * 2 / Math.sqrt(3), 4);
      expect(nut.geom.z1 - nut.geom.z0).toBeCloseTo(0.8 * R.d_bolt, 6);
    }
  });

  it("anchor='ingen' gir ingen endeforankring i modellen", () => {
    const v = { ...DEFAULTS, anchor: "ingen" as const };
    const els = buildModel(v, compute(v));
    expect(els.some((e) => e.id.startsWith("nut") || e.id.startsWith("aplate"))).toBe(false);
    expect(els.filter((e) => e.ifcClass === "IfcMechanicalFastener").length).toBe(4); // kun stagene
    expect(els.filter((e) => e.ifcClass === "IfcPlate").length).toBe(1);              // kun bunnplaten
  });
  it("e_p plasserer pilastersenteret fritt ift. murens senterlinje", () => {
    const els = buildModel(DEFAULTS, compute(DEFAULTS));
    const pil = bbox(els, "pilaster"), wall = bbox(els, "ringwall");
    expect(wall.c).toBe(0);                              // ringmuren definerer origo
    expect(pil.c).toBeCloseTo(DEFAULTS.e_p, 6);
    // med default (e_p=75, b=400, t_wall=250) flukter bakre flate tilfeldigvis
    expect(pil.hi - wall.hi).toBeCloseTo(DEFAULTS.e_p + DEFAULTS.b / 2 - DEFAULTS.t_wall / 2, 6);
  });

  it("pilasteren trenger IKKE flukte med motstaaende murflate", () => {
    // smalere enn muren og sentrert -> ligger helt inne i murlivet
    const inside = { ...DEFAULTS, e_p: 0, b: 200, t_wall: 400 };
    const p1 = bbox(buildModel(inside, compute(inside)), "pilaster");
    const w1 = bbox(buildModel(inside, compute(inside)), "ringwall");
    expect(p1.lo).toBeGreaterThan(w1.lo);
    expect(p1.hi).toBeLessThan(w1.hi);
    // liten e_p -> stikker ut paa den ene siden uten aa naa den andre murflaten
    const part = { ...DEFAULTS, e_p: 40, b: 300, t_wall: 350 };
    const p2 = bbox(buildModel(part, compute(part)), "pilaster");
    const w2 = bbox(buildModel(part, compute(part)), "ringwall");
    expect(p2.lo).toBeGreaterThan(w2.lo);                // naar ikke motstaaende flate
    expect(p2.hi).toBeGreaterThan(w2.hi);                // men stikker ut paa forsiden
  });

  it("V gaar LANGS ringmuren: h (∥V) ligger i Y, b (⊥V) i X", () => {
    // asymmetriske mal slik at en forveksling av aksene faktisk slar ut
    const v = { ...DEFAULTS, b: 500, h: 300 };
    const els = buildModel(v, compute(v));
    const pil = els.find((e) => e.id === "pilaster")!;
    if (pil.geom.kind !== "box") throw new Error("pilaster er ikke en kasse");
    const [sx, sy] = pil.geom.size;
    expect(sx).toBe(v.b);   // paa tvers av muren (X) = b
    expect(sy).toBe(v.h);   // langs muren = skjaerretningen (Y) = h
    // ringmuren loper langs Y og er t_wall tykk i X
    const wall = els.find((e) => e.id === "ringwall")!;
    if (wall.geom.kind !== "box") throw new Error("ringmur er ikke en kasse");
    expect(wall.geom.size[0]).toBe(v.t_wall);
    expect(wall.geom.size[1]).toBeGreaterThan(v.h);
  });

  it("skjaernokken staar med bredden w_lug vinkelrett paa V", () => {
    const v = { ...DEFAULTS, use_lug: true, w_lug: 150 };
    const lug = buildModel(v, compute(v)).find((e) => e.material === "lug")!;
    if (lug.geom.kind !== "box") throw new Error("nokk er ikke en kasse");
    const [sx, sy] = lug.geom.size;
    expect(sx).toBe(v.w_lug);       // bredde ⊥ V (X)
    expect(sy).toBeLessThan(sx);    // tynn langs V (Y)
  });

  it("e_p = 0 gir sentrisk pilaster", () => {
    const v = { ...DEFAULTS, e_p: 0 };
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

describe("moenstre: beregning og modell kan ikke komme ut av synk", () => {
  it("n_bolt styrer FAKTISK antall stag i modellen", () => {
    for (const n of [4, 6, 8, 9]) {
      const v = { ...DEFAULTS, n_bolt: n };
      const els = buildModel(v, compute(v));
      expect(els.filter((e) => e.id.startsWith("rod")).length, `n_bolt=${n}`).toBe(n);
    }
  });

  it("n_bolt=4 gir samme kvadratmoenster som foer", () => {
    const p = boltPattern(4, 200).map(([x, y]) => `${x},${y}`).sort();
    expect(p).toEqual(["-100,-100", "-100,100", "100,-100", "100,100"].sort());
  });

  it("beregningens N_Rd,s bygger paa antall stag som tegnes", () => {
    const v = { ...DEFAULTS, n_bolt: 8 };
    const R = compute(v);
    expect(R.boltXY.length).toBe(8);
    expect(buildModel(v, R).filter((e) => e.id.startsWith("rod")).length).toBe(R.boltXY.length);
  });

  it("oppstikk: modellen tegner n_v_eff, og beregningen bruker samme tall", () => {
    for (const n of [4, 6, 8, 12, 16]) {
      const v = { ...DEFAULTS, n_v: n };
      const R = compute(v);
      const drawn = buildModel(v, R).filter((e) => e.id.startsWith("bar")).length;
      expect(drawn, `n_v=${n}`).toBe(R.n_v_eff);
      expect(R.N_Rd_v).toBeCloseTo(R.n_v_eff * R.A_v1 * R.fyd / 1000, 6);
    }
  });

  it("n_v over 8 kappes ikke lenger stille", () => {
    const v = { ...DEFAULTS, n_v: 16 };
    const R = compute(v);
    expect(R.n_v_eff).toBe(16);                       // foer: 8 tegnet, 16 regnet
    expect(buildModel(v, R).filter((e) => e.id.startsWith("bar")).length).toBe(16);
  });

  it("oppstikk ligger paa boylens senterlinje, med hjoerner", () => {
    const R = compute(DEFAULTS);
    const { rxV, ryV } = cageInsets(DEFAULTS);
    for (const [x, y] of R.barXY) {
      expect(Math.abs(x) <= rxV + 1e-9 && Math.abs(y) <= ryV + 1e-9).toBe(true);
      // hvert jern staar paa en av de fire sidene
      expect(Math.abs(Math.abs(x) - rxV) < 1e-9 || Math.abs(Math.abs(y) - ryV) < 1e-9).toBe(true);
    }
    const corners = R.barXY.filter(([x, y]) =>
      Math.abs(Math.abs(x) - rxV) < 1e-9 && Math.abs(Math.abs(y) - ryV) < 1e-9);
    expect(corners.length).toBe(4);
  });
});

describe("e_h og e_s avledes av geometrien", () => {
  it("e_h er korteste avstand fra stag til oppstikk", () => {
    const R = compute(DEFAULTS);
    let min = Infinity;
    for (const [bx, by] of R.boltXY)
      for (const [ax, ay] of R.barXY) min = Math.min(min, Math.hypot(bx - ax, by - ay));
    expect(R.e_h).toBeCloseTo(min, 9);
    expect(R.e_h).toBeCloseTo(36.1, 1);
  });

  it("stoerre tverrsnitt flytter oppstikkene lenger fra stagene", () => {
    const wide = compute({ ...DEFAULTS, b: 600, h: 600 });
    expect(wide.e_h).toBeGreaterThan(compute(DEFAULTS).e_h);
  });

  it("e_s er dybden til boylegruppas tyngdepunkt", () => {
    const R = compute(DEFAULTS);
    expect(R.e_s).toBeCloseTo(DEFAULTS.c_nom + DEFAULTS.phi_b / 2
      + DEFAULTS.s_b * (R.n_lag - 1) / 2, 9);
    // tettere boyler -> flere lag, men lagene ligger naermere hverandre
    const dense = compute({ ...DEFAULTS, s_b: 50 });
    expect(dense.n_lag).toBeGreaterThan(R.n_lag);
  });

  it("skjaernokk overstyrer e_s med arm til nokkens midthoyde", () => {
    const R = compute({ ...DEFAULTS, use_lug: true });
    expect(R.e_s_eff).toBeCloseTo(DEFAULTS.t_grout + DEFAULTS.h_emb / 2, 9);
    expect(R.e_s_eff).not.toBeCloseTo(R.e_s, 1);
  });
});
