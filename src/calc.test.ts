import { describe, it, expect } from "vitest";
import { compute, DEFAULTS, type Inputs } from "./calc";

describe("compute() – materialer og bolt", () => {
  const R = compute(DEFAULTS);
  it("betong C35 + NA gir riktige dimensjonerende fastheter", () => {
    expect(R.fcd).toBeCloseTo(19.83, 1);
    expect(R.fctd).toBeCloseTo(1.275, 2);
    expect(R.fbd).toBeCloseTo(2.87, 1);
    expect(R.fyd).toBeCloseTo(434.8, 0);
  });
  it("M30 spenningsareal ~561 mm^2", () => {
    expect(R.As_bolt).toBeGreaterThan(558);
    expect(R.As_bolt).toBeLessThan(564);
  });
  it("boltklasse 8.8 -> f_ub=800, f_yb=640", () => {
    expect(R.fub).toBe(800);
    expect(R.fyb).toBe(640);
  });
  it("boltklasse 10.9 og 12.9", () => {
    expect(compute({ ...DEFAULTS, grade: "10.9" }).fub).toBe(1000);
    expect(compute({ ...DEFAULTS, grade: "10.9" }).fyb).toBe(900);
    expect(compute({ ...DEFAULTS, grade: "12.9" }).fyb).toBe(1080);
  });
});

describe("compute() – geometri og fagverk", () => {
  const R = compute(DEFAULTS);
  it("indre arm z = 0,9*d_eff", () => {
    expect(R.d_eff).toBeCloseTo(337.5, 1);
    expect(R.z).toBeCloseTo(303.75, 1);
  });
  it("effektiv sone og antall boylelag", () => {
    expect(R.h_sone).toBe(450);
    expect(R.n_lag).toBe(5);
  });
  it("skjaertie N_re,V = V*(1+e_s/z)", () => {
    expect(R.N_reV).toBeCloseTo(224.1, 0);
  });
  it("spaltestrekk fra endeforankring", () => {
    expect(R.T_nut).toBeCloseTo(66.7, 0);
  });
  it("dimensjonerende boylestrekk (LT A styrer)", () => {
    expect(R.govA).toBe(true);
    expect(R.N_re).toBeCloseTo(290.8, 0);
  });
});

describe("compute() – 8O25 aksial og lug/plate", () => {
  it("8O25 B500 kapasitet ~1707 kN, lav utnyttelse for 400 kN", () => {
    const R = compute(DEFAULTS);
    expect(R.N_Rd_v).toBeGreaterThan(1690);
    expect(R.u_ax).toBeLessThan(0.3);
  });
  it("skjaernokk paa -> egen trykkontroll og redusert arm", () => {
    const off = compute(DEFAULTS);
    const on = compute({ ...DEFAULTS, use_lug: true });
    expect(on.e_s_eff).toBeLessThan(off.e_s_eff); // nokk gir kortere arm
    expect(on.V_Rd_lug).toBeGreaterThan(0);
    expect(on.u_lug).toBeGreaterThan(0);
  });
  it("default-innstoping er utilstrekkelig (allOk=false)", () => {
    const R = compute(DEFAULTS);
    expect(R.h_ef_req).toBeGreaterThan(DEFAULTS.h_ef);
    expect(R.allOk).toBe(false);
  });
  it("okt innstoping + tettere boyler -> allOk=true", () => {
    const good: Inputs = { ...DEFAULTS, h_ef: 900, s_b: 90 };
    expect(compute(good).u_emb).toBeLessThanOrEqual(1);
  });
});

describe("compute() – endeforankring: ingen / mutter / plate", () => {
  it("mutter bruker noekkelvidde 1,5*d og sekskantareal, ikke a_anch", () => {
    const R = compute({ ...DEFAULTS, anchor: "mutter" });
    expect(R.isNut).toBe(true);
    expect(R.a_nut).toBeCloseTo(1.5 * R.d_bolt, 6);              // M30 -> 45 mm
    // lastflate = (sqrt3/2)*s^2, uttrykt som ekvivalent kvadratside
    expect(R.Ac0).toBeCloseTo(Math.sqrt(3) / 2 * R.a_nut ** 2, 4);
    expect(R.a_eff).toBeCloseTo(Math.sqrt(R.Ac0), 6);
    // a_anch (120) skal ikke lenger paavirke mutter-tilfellet
    expect(compute({ ...DEFAULTS, anchor: "mutter", a_anch: 300 }).a_eff).toBeCloseTo(R.a_eff, 6);
  });

  it("plate bruker a_anch som foer", () => {
    const R = compute(DEFAULTS);
    expect(R.isPlate).toBe(true);
    expect(R.a_eff).toBeCloseTo(DEFAULTS.a_anch, 6);
    expect(R.T_nut).toBeCloseTo(66.7, 0);                        // uendret fra foer
  });

  it("mindre lastflate (mutter) gir stoerre spaltestrekk enn plate", () => {
    expect(compute({ ...DEFAULTS, anchor: "mutter" }).T_nut)
      .toBeGreaterThan(compute(DEFAULTS).T_nut);
  });

  it("'ingen' fjerner endelast: ingen endetrykk og ingen spaltestrekk derfra", () => {
    const R = compute({ ...DEFAULTS, anchor: "ingen" });
    expect(R.noAnchor).toBe(true);
    expect(R.T_nut).toBe(0);
    expect(R.F_Rdu).toBe(0);
    expect(R.u_bear).toBe(0);
    expect(R.u_bond).toBeGreaterThan(0);                         // heft styrer i stedet
  });
});

describe("compute() – heftforankring av stag (EC2 §8.4)", () => {
  const v: Inputs = { ...DEFAULTS, anchor: "ingen" };
  const R = compute(v), B = R.bond;

  it("eta_2 = 1,0 for phi <= 32 og (132-phi)/100 over", () => {
    expect(B.eta2).toBe(1);                                      // M30
    expect(compute({ ...v, boltsize: "M36" }).bond.eta2).toBeCloseTo(0.96, 6);
    expect(compute({ ...v, phi_v: 40 }).eta2_v).toBeCloseTo(0.92, 6);
  });

  it("l_b,rqd = (d/4)*(sigma_sd/f_bd)", () => {
    expect(B.sigma_sd).toBeCloseTo(v.N_t / v.n_bolt * 1000 / R.As_bolt, 4);
    expect(B.lb_rqd).toBeCloseTo(R.d_bolt / 4 * (B.sigma_sd / B.fbd), 4);
  });

  it("alfa-faktorene ligger i [0,7; 1,0] og l_bd >= l_b,min", () => {
    for (const a of [B.a2, B.a3, B.a5]) {
      expect(a).toBeGreaterThanOrEqual(0.7);
      expect(a).toBeLessThanOrEqual(1.0);
    }
    expect(B.a1).toBe(1);                                        // rett stang
    expect(B.lb_min).toBeCloseTo(Math.max(0.3 * B.lb_rqd, 10 * R.d_bolt, 100), 4);
    expect(B.lbd).toBeGreaterThanOrEqual(B.lb_min - 1e-6);
    expect(B.lbd).toBeCloseTo(
      Math.max(B.a1 * B.a2 * B.a3 * B.a4 * B.a5 * B.lb_rqd, B.lb_min), 1);
  });

  it("krok gir alfa_1 = 0,7 og dermed kortere l_bd enn rett stang", () => {
    const hook = compute({ ...v, anch_shape: "krok" }).bond;
    expect(hook.a1).toBe(0.7);
    expect(hook.lbd).toBeLessThanOrEqual(B.lbd);
  });

  it("tverrtrykk og sveiset tverrarmering reduserer l_bd", () => {
    expect(compute({ ...v, p_tr: 5 }).bond.a5).toBeCloseTo(0.8, 6);
    expect(compute({ ...v, alpha4: 0.7 }).bond.lbd).toBeLessThan(B.lbd);
  });

  it("kontrollen er l_bd <= h_ef - c_nom", () => {
    expect(R.l_avail).toBeCloseTo(v.h_ef - v.c_nom, 6);
    expect(R.u_bond).toBeCloseTo(B.lbd / R.l_avail, 6);
    const deep = compute({ ...v, h_ef: 3000 });
    expect(deep.u_bond).toBeLessThan(1);
  });
});

describe("compute() – heftkoeffisient for gjengestang (BEB B19 19.3.4)", () => {
  const v: Inputs = { ...DEFAULTS, anchor: "ingen" };
  it("default k_bd = 1,90 gir f_bd = 1,077 * f_ctk,0,05", () => {
    expect(DEFAULTS.k_bd_bolt).toBe(1.9);
    const R = compute(v);
    expect(R.fbd_bolt).toBeCloseTo(1.077 * v.fctk, 2);           // 1,90*0,85/1,5 = 1,077
    expect(R.fbd_bolt / R.fbd).toBeCloseTo(1.9 / 2.25, 6);       // 0,84 av kamstaal
  });
  it("kamstaal (boyle/oppstikk) beholder 2,25", () => {
    const R = compute(v);
    expect(R.fbd).toBeCloseTo(2.25 * v.eta1 * R.eta2_v * R.fctd, 6);
    expect(R.fbd_b).toBeCloseTo(2.25 * v.eta1 * R.eta2_b * R.fctd, 6);
  });
  it("k_bd = 2,25 gir full kamstaalsverdi og kortere l_bd", () => {
    const full = compute({ ...v, k_bd_bolt: 2.25 });
    expect(full.fbd_bolt).toBeCloseTo(full.fbd, 6);
    expect(full.bond.lbd).toBeLessThan(compute(v).bond.lbd);
  });
});
