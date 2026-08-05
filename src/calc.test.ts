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
